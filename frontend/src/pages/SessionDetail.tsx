import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Session } from '../types'
import { Terminal } from '../components/Terminal'
import { apiFetch } from '../hooks/useApi'
import { ActionTimeline } from '../components/ActionTimeline'
import { TimelineAction } from '../hooks/useTerminal'

type Tab = 'terminal' | 'logs' | 'timeline'

interface TranscriptPageItem {
  index: number
  at: string
  text: string
}

interface TranscriptPageResponse {
  items: TranscriptPageItem[]
  hasMoreBefore: boolean
  hasMoreAfter: boolean
  firstIndex: number | null
  lastIndex: number | null
  totalItems: number
  source: 'events' | 'legacy' | 'bootstrap'
  transcriptPaginationSupported?: boolean
}

interface TerminalBootstrapResponse {
  scrollbackOutput: string
  timelineOutput: string
  readableOutput: string
  transcriptOutput: string
  readablePaneOutput: string
  historyOutput: string
  currentOutput: string
  fullOutput: string
  transcriptPaginationSupported?: boolean
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleString()
}

function formatTranscriptTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'unknown time'
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function chunkBootstrapTranscript(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const paragraphChunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  if (paragraphChunks.length > 1) {
    return paragraphChunks
  }

  const lines = normalized.split('\n').map((line) => line.trimEnd())
  if (lines.length <= 16) {
    return [normalized]
  }

  const chunks: string[] = []
  for (let i = 0; i < lines.length; i += 12) {
    chunks.push(lines.slice(i, i + 12).join('\n').trim())
  }
  return chunks.filter(Boolean)
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 border-b border-zinc-800 last:border-0">
      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
      <span className="text-sm text-zinc-200 font-mono break-all">{value}</span>
    </div>
  )
}

function StatusDot({ status }: { status: Session['status'] }) {
  const color =
    status === 'running' ? 'bg-emerald-500' :
    status === 'starting' ? 'bg-amber-500' :
    status === 'error' ? 'bg-rose-500' :
    'bg-zinc-600'
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color} ${status === 'running' ? 'animate-pulse' : ''}`} />
  )
}

export function SessionDetail() {
  const { id, sessionName } = useParams<{ id?: string; sessionName?: string }>()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const launchState = location.state as { activeTab?: Tab; launch?: { title?: string; agentName?: string; workdir?: string } } | null
  const isMirrorMode = !!sessionName
  const navigate = useNavigate()
  const tabParam = searchParams.get('tab') as Tab | null
  const initialTab: Tab = tabParam === 'logs' || tabParam === 'terminal' || tabParam === 'timeline'
    ? tabParam
    : (launchState?.activeTab ?? 'terminal')

  const [activeTab, setActiveTab] = useState<Tab>(isMirrorMode && initialTab === 'logs' ? 'terminal' : initialTab)
  const [timelineActions, setTimelineActions] = useState<TimelineAction[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const [transcriptItems, setTranscriptItems] = useState<TranscriptPageItem[]>([])
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptLoadingOlder, setTranscriptLoadingOlder] = useState(false)
  const [transcriptLoadingNewer, setTranscriptLoadingNewer] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [transcriptHasMoreBefore, setTranscriptHasMoreBefore] = useState(false)
  const [transcriptHasMoreAfter, setTranscriptHasMoreAfter] = useState(false)
  const [transcriptFirstIndex, setTranscriptFirstIndex] = useState<number | null>(null)
  const [transcriptLastIndex, setTranscriptLastIndex] = useState<number | null>(null)
  const [transcriptTotalItems, setTranscriptTotalItems] = useState(0)
  const [transcriptSource, setTranscriptSource] = useState<'events' | 'legacy' | 'bootstrap' | null>(null)
  const [transcriptEndpointAvailable, setTranscriptEndpointAvailable] = useState(true)
  const [transcriptAtBottom, setTranscriptAtBottom] = useState(true)
  const [transcriptAtTop, setTranscriptAtTop] = useState(true)

  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptSocketRef = useRef<WebSocket | null>(null)
  const transcriptRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
  const transcriptBusyRef = useRef(false)
  const transcriptAtBottomRef = useRef(true)
  const transcriptEndpointAvailableRef = useRef(true)
  const transcriptStateRef = useRef({
    firstIndex: null as number | null,
    lastIndex: null as number | null,
    hasMoreBefore: false,
    hasMoreAfter: false,
    totalItems: 0,
    itemCount: 0,
  })
  const requestSeqRef = useRef(0)
  const launchContext = launchState?.launch

  useEffect(() => {
    const requestedTab =
      tabParam === 'logs' || tabParam === 'terminal'
        ? tabParam
        : ((location.state as { activeTab?: Tab })?.activeTab ?? 'terminal')
    const nextTab = isMirrorMode && requestedTab === 'logs' ? 'terminal' : requestedTab
    if (nextTab !== activeTab) {
      setActiveTab(nextTab)
    }
  }, [activeTab, isMirrorMode, location.state, tabParam])

  const setTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', tab)
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  const fetchSession = useCallback(async () => {
    if (isMirrorMode) {
      setSession({
        id: 'mirror',
        publicId: sessionName!,
        title: `Live Session: ${sessionName}`,
        status: 'running',
        agentProfileId: 'mirror',
        agentProfile: { name: 'tmux mirror' } as any,
        createdAt: new Date().toISOString(),
      } as Session)
      setLoading(false)
      return
    }

    if (!id) return
    try {
      const data = await apiFetch<{ session: Session }>(`/api/v1/sessions/${id}`)
      setSession(data.session)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [id, isMirrorMode, sessionName])

  const scrollTranscriptToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = transcriptScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const loadTranscriptSnapshot = useCallback(async (): Promise<TranscriptPageResponse> => {
    if (!id) {
      return {
        items: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
        firstIndex: null,
        lastIndex: null,
        totalItems: 0,
        source: 'bootstrap',
        transcriptPaginationSupported: false,
      }
    }

    const data = await apiFetch<TerminalBootstrapResponse>(`/api/v1/sessions/${id}/terminal/bootstrap`)
    const text = data.scrollbackOutput || data.timelineOutput || data.readableOutput || data.transcriptOutput || data.readablePaneOutput || data.fullOutput || ''
    const chunks = chunkBootstrapTranscript(text)

    if (chunks.length === 0) {
      return {
        items: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
        firstIndex: null,
        lastIndex: null,
        totalItems: 0,
        source: 'bootstrap',
        transcriptPaginationSupported: data.transcriptPaginationSupported,
      }
    }

    return {
      items: chunks.map((chunk, index) => ({
        index,
        at: new Date(Date.now() - (chunks.length - 1 - index) * 1000).toISOString(),
        text: chunk,
      })),
      hasMoreBefore: false,
      hasMoreAfter: false,
      firstIndex: 0,
      lastIndex: chunks.length - 1,
      totalItems: chunks.length,
      source: 'bootstrap',
      transcriptPaginationSupported: data.transcriptPaginationSupported,
    }
  }, [id])

  const isMissingTranscriptEndpointError = useCallback((err: unknown) => {
    if (!(err instanceof Error)) return false
    return err.message.includes('Route not found') || err.message.includes('HTTP 404')
  }, [])

  const loadTranscriptPage = useCallback(async (
    options: { before?: number; after?: number },
    mode: 'reset' | 'older' | 'newer',
  ) => {
    if (!id) return

    const seq = ++requestSeqRef.current
    transcriptBusyRef.current = true

    if (mode === 'reset') {
      setTranscriptLoading(true)
      setTranscriptItems([])
      setTranscriptHasMoreBefore(false)
      setTranscriptHasMoreAfter(false)
      setTranscriptFirstIndex(null)
      setTranscriptLastIndex(null)
      setTranscriptTotalItems(0)
      setTranscriptSource(null)
      transcriptEndpointAvailableRef.current = true
      setTranscriptEndpointAvailable(true)
      transcriptStateRef.current = {
        firstIndex: null,
        lastIndex: null,
        hasMoreBefore: false,
        hasMoreAfter: false,
        totalItems: 0,
        itemCount: 0,
      }
    } else if (mode === 'older') {
      setTranscriptLoadingOlder(true)
    } else {
      setTranscriptLoadingNewer(true)
    }

    try {
      const params = new URLSearchParams()
      params.set('limit', '80')
      if (options.before !== undefined) params.set('before', String(options.before))
      if (options.after !== undefined) params.set('after', String(options.after))

      const data = await apiFetch<TranscriptPageResponse>(`/api/v1/sessions/${id}/transcript?${params.toString()}`)
      if (seq !== requestSeqRef.current) return

      const current = transcriptStateRef.current
      const nextFirstIndex = mode === 'reset'
        ? data.firstIndex
        : mode === 'older'
          ? data.firstIndex
          : current.firstIndex
      const nextLastIndex = mode === 'reset'
        ? data.lastIndex
        : mode === 'older'
          ? current.lastIndex
          : data.lastIndex
      const nextHasMoreBefore = mode === 'reset'
        ? data.hasMoreBefore
        : mode === 'older'
          ? data.hasMoreBefore
          : current.hasMoreBefore
      const nextHasMoreAfter = mode === 'reset'
        ? data.hasMoreAfter
        : mode === 'older'
          ? current.hasMoreAfter
          : data.hasMoreAfter
      const nextTotalItems = mode === 'reset'
        ? data.totalItems
        : Math.max(current.totalItems, data.totalItems)

      let nextItems: TranscriptPageItem[] = []
      setTranscriptItems((existing) => {
        nextItems = mode === 'reset'
          ? data.items
          : mode === 'older'
            ? [...data.items, ...existing]
            : [...existing, ...data.items]
        return nextItems
      })

      transcriptStateRef.current = {
        firstIndex: nextFirstIndex,
        lastIndex: nextLastIndex,
        hasMoreBefore: nextHasMoreBefore,
        hasMoreAfter: nextHasMoreAfter,
        totalItems: nextTotalItems,
        itemCount: nextItems.length,
      }

      setTranscriptItems(nextItems)
      setTranscriptHasMoreBefore(nextHasMoreBefore)
      setTranscriptHasMoreAfter(nextHasMoreAfter)
      setTranscriptFirstIndex(nextFirstIndex)
      setTranscriptLastIndex(nextLastIndex)
      setTranscriptTotalItems(nextTotalItems)
      setTranscriptSource(data.source)
      transcriptEndpointAvailableRef.current = true
      setTranscriptEndpointAvailable(true)
      setTranscriptError(null)

      if (mode === 'newer' && transcriptAtBottomRef.current) {
        window.requestAnimationFrame(() => {
          scrollTranscriptToBottom('auto')
        })
      }

      if (mode === 'older') {
        const anchor = transcriptScrollRef.current
        if (anchor) {
          const previousHeight = anchor.scrollHeight
          const previousTop = anchor.scrollTop
          window.requestAnimationFrame(() => {
            const el = transcriptScrollRef.current
            if (!el) return
            el.scrollTop = el.scrollHeight - previousHeight + previousTop
          })
        }
      }
    } catch (err) {
      if (seq !== requestSeqRef.current) return
      if (mode === 'reset' && isMissingTranscriptEndpointError(err)) {
        try {
          const snapshot = await loadTranscriptSnapshot()
          if (seq !== requestSeqRef.current) return
          transcriptStateRef.current = {
            firstIndex: snapshot.firstIndex,
            lastIndex: snapshot.lastIndex,
            hasMoreBefore: snapshot.hasMoreBefore,
            hasMoreAfter: snapshot.hasMoreAfter,
            totalItems: snapshot.totalItems,
            itemCount: snapshot.items.length,
          }
          setTranscriptItems(snapshot.items)
          setTranscriptHasMoreBefore(snapshot.hasMoreBefore)
          setTranscriptHasMoreAfter(snapshot.hasMoreAfter)
          setTranscriptFirstIndex(snapshot.firstIndex)
          setTranscriptLastIndex(snapshot.lastIndex)
          setTranscriptTotalItems(snapshot.totalItems)
          setTranscriptSource(snapshot.source)
          transcriptEndpointAvailableRef.current = false
          setTranscriptEndpointAvailable(false)
          setTranscriptError(null)
          return
        } catch (snapshotErr) {
          setTranscriptError(snapshotErr instanceof Error ? snapshotErr.message : 'Failed to load transcript')
          return
        }
      }

      setTranscriptError(err instanceof Error ? err.message : 'Failed to load transcript')
    } finally {
      if (seq === requestSeqRef.current) {
        transcriptBusyRef.current = false
        setTranscriptLoading(false)
        setTranscriptLoadingOlder(false)
        setTranscriptLoadingNewer(false)
      }
    }
  }, [id, scrollTranscriptToBottom])

  const loadLatestTranscript = useCallback(async () => {
    await loadTranscriptPage({ after: -1 }, 'reset')
  }, [loadTranscriptPage])

  const loadOlderTranscript = useCallback(async () => {
    const state = transcriptStateRef.current
    if (!state.hasMoreBefore || state.firstIndex === null || transcriptBusyRef.current) return
    await loadTranscriptPage({ before: state.firstIndex }, 'older')
  }, [loadTranscriptPage])

  const loadNewerTranscript = useCallback(async () => {
    const state = transcriptStateRef.current
    if (transcriptBusyRef.current || !transcriptEndpointAvailableRef.current) return
    if (state.itemCount === 0 || state.lastIndex === null) {
      await loadLatestTranscript()
      return
    }
    await loadTranscriptPage({ after: state.lastIndex }, 'newer')
  }, [loadLatestTranscript, loadTranscriptPage])

  const refreshTranscript = useCallback(async () => {
    if (!transcriptEndpointAvailableRef.current) {
      try {
        const snapshot = await loadTranscriptSnapshot()
        transcriptStateRef.current = {
          firstIndex: snapshot.firstIndex,
          lastIndex: snapshot.lastIndex,
          hasMoreBefore: snapshot.hasMoreBefore,
          hasMoreAfter: snapshot.hasMoreAfter,
          totalItems: snapshot.totalItems,
          itemCount: snapshot.items.length,
        }
        setTranscriptItems(snapshot.items)
        setTranscriptHasMoreBefore(snapshot.hasMoreBefore)
        setTranscriptHasMoreAfter(snapshot.hasMoreAfter)
        setTranscriptFirstIndex(snapshot.firstIndex)
        setTranscriptLastIndex(snapshot.lastIndex)
        setTranscriptTotalItems(snapshot.totalItems)
        setTranscriptSource(snapshot.source)
        setTranscriptError(null)
        window.requestAnimationFrame(() => {
          scrollTranscriptToBottom('auto')
        })
      } catch (err) {
        setTranscriptError(err instanceof Error ? err.message : 'Failed to load transcript')
      }
      return
    }
    const state = transcriptStateRef.current
    if (state.itemCount === 0) {
      await loadLatestTranscript()
      return
    }
    if (state.lastIndex !== null) {
      await loadTranscriptPage({ after: state.lastIndex }, 'newer')
      return
    }
    await loadLatestTranscript()
  }, [loadLatestTranscript, loadTranscriptPage, loadTranscriptSnapshot])

  const scheduleTranscriptRefresh = useCallback(() => {
    if (transcriptBusyRef.current) return
    if (transcriptRefreshTimerRef.current) {
      clearTimeout(transcriptRefreshTimerRef.current)
    }
    transcriptRefreshTimerRef.current = setTimeout(() => {
      transcriptRefreshTimerRef.current = null
      void refreshTranscript()
    }, 150)
  }, [refreshTranscript])

  useEffect(() => {
    fetchSession()
    refreshIntervalRef.current = setInterval(fetchSession, 8000)
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [fetchSession])

  useEffect(() => {
    if (activeTab !== 'logs') {
      if (transcriptIntervalRef.current) clearInterval(transcriptIntervalRef.current)
      transcriptIntervalRef.current = null
      if (transcriptSocketRef.current) {
        transcriptSocketRef.current.close()
        transcriptSocketRef.current = null
      }
      if (transcriptRefreshTimerRef.current) {
        clearTimeout(transcriptRefreshTimerRef.current)
        transcriptRefreshTimerRef.current = null
      }
      return
    }

    if (!id) return
    let cancelled = false

    const initializeTranscript = async () => {
      try {
        const snapshot = await loadTranscriptSnapshot()
        if (cancelled) return

        const supportsPagination = snapshot.transcriptPaginationSupported === true
        transcriptEndpointAvailableRef.current = supportsPagination
        setTranscriptEndpointAvailable(supportsPagination)

        if (!supportsPagination) {
          transcriptStateRef.current = {
            firstIndex: snapshot.firstIndex,
            lastIndex: snapshot.lastIndex,
            hasMoreBefore: snapshot.hasMoreBefore,
            hasMoreAfter: snapshot.hasMoreAfter,
            totalItems: snapshot.totalItems,
            itemCount: snapshot.items.length,
          }
          setTranscriptItems(snapshot.items)
          setTranscriptHasMoreBefore(snapshot.hasMoreBefore)
          setTranscriptHasMoreAfter(snapshot.hasMoreAfter)
          setTranscriptFirstIndex(snapshot.firstIndex)
          setTranscriptLastIndex(snapshot.lastIndex)
          setTranscriptTotalItems(snapshot.totalItems)
          setTranscriptSource(snapshot.source)
          setTranscriptError(null)
        } else {
          await loadLatestTranscript()
        }
      } catch (err) {
        if (cancelled) return
        setTranscriptError(err instanceof Error ? err.message : 'Failed to load transcript')
      }
    }

    void initializeTranscript()

    transcriptIntervalRef.current = setInterval(() => {
      void (transcriptEndpointAvailableRef.current ? loadNewerTranscript() : refreshTranscript())
    }, 3000)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const ws = new WebSocket(`${protocol}//${host}/ws/terminal?sessionId=${encodeURIComponent(id)}`)
    transcriptSocketRef.current = ws

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as { type?: string }
        if (message.type === 'terminal.output' || message.type === 'session.status') {
          scheduleTranscriptRefresh()
        }
      } catch {
        // Ignore malformed messages and continue polling.
      }
    }

    return () => {
      cancelled = true
      if (transcriptIntervalRef.current) clearInterval(transcriptIntervalRef.current)
      transcriptIntervalRef.current = null
      if (transcriptSocketRef.current) {
        transcriptSocketRef.current.close()
        transcriptSocketRef.current = null
      }
      if (transcriptRefreshTimerRef.current) {
        clearTimeout(transcriptRefreshTimerRef.current)
        transcriptRefreshTimerRef.current = null
      }
    }
  }, [activeTab, id, loadLatestTranscript, loadNewerTranscript, loadTranscriptSnapshot, refreshTranscript, scheduleTranscriptRefresh])

  useEffect(() => {
    if (!transcriptScrollRef.current) return
    const el = transcriptScrollRef.current
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 72
    const atTop = el.scrollTop < 72
    transcriptAtBottomRef.current = atBottom
    setTranscriptAtBottom(atBottom)
    setTranscriptAtTop(atTop)
  }, [transcriptItems])

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptScrollRef.current
    if (!el) return

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 72
    const atTop = el.scrollTop < 120

    transcriptAtBottomRef.current = atBottom
    setTranscriptAtBottom(atBottom)
    setTranscriptAtTop(atTop)

    if (atTop && transcriptStateRef.current.hasMoreBefore && !transcriptBusyRef.current) {
      void loadOlderTranscript()
    }
  }, [loadOlderTranscript])

  const transcriptHeaderSubtitle = transcriptItems.length === 0
    ? 'Loading transcript…'
    : transcriptAtBottom
      ? 'Live output'
      : 'Start of transcript'

  const handleDeleteSession = async () => {
    if (!session) return

    const message = session.status === 'running' || session.status === 'starting'
      ? 'Delete this session? This will terminate the running process.'
      : 'Delete this session permanently?'

    if (!confirm(message)) return

    await apiFetch(`/api/v1/sessions/${session.publicId}`, { method: 'DELETE' })
    navigate('/')
  }

  const handleStopSession = async () => {
    if (!session) return
    try {
      await apiFetch(`/api/v1/sessions/${session.publicId}/stop`, { method: 'POST' })
      await fetchSession()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Stop failed')
    }
  }

  const handleKillSession = async () => {
    if (!session) return
    if (!confirm('Kill this session?')) return
    try {
      await apiFetch(`/api/v1/sessions/${session.publicId}/kill`, { method: 'POST' })
      await fetchSession()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kill failed')
    }
  }

  const tabs: { id: Tab; label: string }[] = isMirrorMode ? [
    { id: 'terminal', label: 'Terminal' },
    { id: 'timeline', label: 'Timeline' },
  ] : [
    { id: 'terminal', label: 'Terminal' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'logs', label: 'Logs' },
  ]

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),rgba(9,9,11,0.96)_40%,rgba(0,0,0,1)_100%)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-black/75 px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-cyan-300/80">Launching</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">
                {launchContext?.title ? `Starting ${launchContext.title}` : 'Starting session'}
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {launchContext?.agentName
                  ? `Attaching ${launchContext.agentName} and loading terminal output.`
                  : 'Attaching the terminal and loading output.'}
              </p>
              {launchContext?.workdir && (
                <p className="mt-2 text-[11px] leading-5 text-zinc-500 font-mono break-all">
                  {launchContext.workdir}
                </p>
              )}
            </div>
            <div className="relative mt-1 h-11 w-11 flex-shrink-0 rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
              <div className="absolute inset-[6px] rounded-xl border border-cyan-300/20" />
              <div className="absolute inset-0 animate-spin rounded-2xl border-2 border-cyan-300/15 border-t-cyan-300/90" />
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-full border border-white/10 bg-white/5">
            <div className="h-1.5 w-2/5 animate-[pulse_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-white to-cyan-300" />
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Creating session</span>
            <span>Connecting terminal</span>
            <span>Loading output</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center px-6">
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center animate-slide-up w-full max-w-sm">
          <div className="text-3xl mb-3">⚠️</div>
          <h3 className="text-rose-400 font-bold mb-1">Session Error</h3>
          <p className="text-rose-400/70 text-sm mb-6">{error ?? 'Session not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs uppercase tracking-widest transition-all tap-feedback"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black overflow-hidden">
      <header className="flex items-center gap-2 px-2 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 flex-shrink-0 h-14">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 text-zinc-400 hover:text-zinc-100 rounded-full flex items-center justify-center transition-all tap-feedback"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <StatusDot status={session.status} />
          <h1 className="text-sm font-bold text-zinc-100 truncate tracking-tight">
            {session.title}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowDetails(true)}
            className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-lg border transition-all tap-feedback bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700"
          >
            Details
          </button>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-950 border border-zinc-800 px-2 py-1 rounded-lg">
            {session.agentProfile?.name ?? ''}
          </span>
        </div>
      </header>

      <div className="flex bg-zinc-900 flex-shrink-0 h-12">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex-1 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative ${
              activeTab === tab.id
                ? tab.id === 'terminal'
                  ? 'text-emerald-400'
                  : 'text-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div
                className={`absolute bottom-0 inset-x-0 h-0.5 shadow-[0_0_8px_rgba(99,102,241,0.5)] ${
                  tab.id === 'terminal'
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : 'bg-indigo-500'
                }`}
              />
            )}
          </button>
        ))}
      </div>

      <main className="flex-1 min-h-0 overflow-hidden relative bg-black">
        <div className={`h-full ${activeTab === 'terminal' ? 'flex flex-col' : 'hidden'}`}>
          <div className="px-3 py-2.5 border-b border-zinc-800 bg-zinc-950/95 flex items-center justify-between gap-3 sm:px-4">
            <h3 className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Terminal</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">Live</span>
          </div>
          <div className="flex-1 min-h-0">
            <Terminal
              sessionId={session.publicId}
              sessionTitle={session.title}
              agentName={session.agentProfile?.name ?? 'agent'}
              onTimelineActions={setTimelineActions}
            />
          </div>
        </div>

        {activeTab === 'timeline' && (
          <div className="h-full flex flex-col bg-black animate-fade-in overflow-y-auto">
            <div className="px-3 py-2.5 border-b border-zinc-800 bg-zinc-950/95 flex items-center justify-between gap-3 sm:px-4 sticky top-0 z-10">
              <h3 className="text-[11px] font-bold text-indigo-400 uppercase tracking-[0.2em]">Action Timeline</h3>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{timelineActions.length} events</span>
            </div>
            <ActionTimeline actions={timelineActions} />
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="h-full flex flex-col bg-black animate-fade-in">
            <div className="px-3 py-2.5 border-b border-zinc-800 bg-zinc-950/95 flex items-center justify-between gap-3 sm:px-4">
              <div className="min-w-0">
                <h3 className="text-[11px] font-bold text-zinc-100 uppercase tracking-[0.2em]">Transcript</h3>
                <p className="text-[10px] text-zinc-500 mt-1">{transcriptHeaderSubtitle}</p>
              </div>
              <button
                onClick={() => void refreshTranscript()}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold uppercase tracking-widest rounded-xl border border-zinc-700/50 transition-all tap-feedback"
              >
                {transcriptLoading || transcriptLoadingOlder || transcriptLoadingNewer ? 'Loading' : 'Refresh'}
              </button>
            </div>

            {transcriptError && (
              <div className="mx-3 mt-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400 sm:mx-4">
                {transcriptError}
              </div>
            )}

            {transcriptSource === 'legacy' && transcriptItems.length > 0 && (
              <div className="mx-3 mt-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-300 sm:mx-4">
                Legacy snapshot. This session started before durable transcript capture.
              </div>
            )}
            <div
              ref={transcriptScrollRef}
              onScroll={handleTranscriptScroll}
              className="flex-1 min-h-0 overflow-auto overscroll-contain bg-[linear-gradient(180deg,rgba(9,9,11,1)_0%,rgba(9,9,11,0.96)_18%,rgba(9,9,11,1)_100%)]"
            >
              <div className="relative min-h-full w-full px-4 py-5 sm:px-8 sm:py-8 max-w-4xl mx-auto">
                {transcriptLoading && transcriptItems.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 font-mono">Loading transcript…</p>
                ) : transcriptItems.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 font-mono">No transcript yet.</p>
                ) : (
                  <div className="space-y-4">
                    {transcriptHasMoreBefore && (
                      <div className="flex justify-center pb-1">
                        <button
                          type="button"
                          onClick={() => void loadOlderTranscript()}
                          disabled={transcriptLoadingOlder}
                          className="px-3 py-2 rounded-full bg-zinc-900 text-zinc-300 text-[10px] font-black uppercase tracking-[0.24em] border border-zinc-700/70 shadow-lg shadow-black/20 disabled:opacity-60"
                        >
                          {transcriptLoadingOlder ? 'Loading earlier' : 'Load earlier'}
                        </button>
                      </div>
                    )}

                    {transcriptItems.map((item) => (
                      <section key={item.index} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-zinc-800/90" />
                          <span className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/90 bg-zinc-950 px-2.5 py-1 rounded-full border border-emerald-500/20">
                            {formatTranscriptTime(item.at)}
                          </span>
                          <div className="h-px flex-1 bg-zinc-800/90" />
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-[12px] leading-6 text-zinc-100 font-mono bg-zinc-950/75 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-[0_18px_56px_rgba(0,0,0,0.32)] ring-1 ring-white/5">
                          {item.text}
                        </pre>
                      </section>
                    ))}

                    {transcriptHasMoreAfter && (
                      <div className="flex justify-center pt-1">
                        <button
                          type="button"
                          onClick={() => void loadNewerTranscript()}
                          disabled={transcriptLoadingNewer}
                          className="px-3 py-2 rounded-full bg-zinc-900 text-zinc-300 text-[10px] font-black uppercase tracking-[0.24em] border border-zinc-700/70 shadow-lg shadow-black/20 disabled:opacity-60"
                        >
                          {transcriptLoadingNewer ? 'Loading latest' : 'Jump to latest'}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!transcriptAtBottom && transcriptItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      scrollTranscriptToBottom('smooth')
                      transcriptAtBottomRef.current = true
                      setTranscriptAtBottom(true)
                    }}
                    className="sticky bottom-4 ml-auto block w-fit mt-4 px-3 py-2 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-[0.24em] shadow-lg shadow-emerald-500/20 border border-emerald-300/30"
                  >
                    Bottom
                  </button>
                )}

                {!transcriptAtTop && transcriptHasMoreBefore && (
                  <div className="pointer-events-none sticky top-3 flex justify-center">
                    <span className="pointer-events-auto text-[10px] font-black uppercase tracking-[0.24em] rounded-full border border-zinc-800 bg-zinc-950/90 text-zinc-400 px-3 py-1.5 shadow-lg shadow-black/20">
                      Scroll up for earlier output
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {showDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950/95 backdrop-blur-sm">
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Details</h3>
                <p className="text-[11px] text-zinc-500">Session metadata and controls.</p>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="w-9 h-9 rounded-full border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
                aria-label="Close details"
              >
                <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 py-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-1">
                <InfoRow label="Internal ID" value={session.id} />
                <InfoRow label="Public ID" value={session.publicId} />
                <InfoRow label="Status" value={session.status} />
                <InfoRow label="Agent Profile" value={session.agentProfile?.name ?? session.agentProfileId} />
                <InfoRow label="Working Directory" value={session.workdir ?? ''} />
                <InfoRow label="Tmux Target" value={session.tmuxSessionName} />
                <InfoRow label="Birth Date" value={formatDate(session.createdAt)} />
                <InfoRow label="Wake Date" value={formatDate(session.startedAt)} />
                {session.stoppedAt && (
                  <InfoRow label="Stop Date" value={formatDate(session.stoppedAt)} />
                )}
              </div>

              {!isMirrorMode && (session.status === 'running' || session.status === 'starting') && (
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleStopSession}
                    className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all tap-feedback border border-zinc-700/50"
                  >
                    Stop Agent
                  </button>
                  <button
                    onClick={handleKillSession}
                    className="flex-1 py-4 bg-rose-950/30 hover:bg-rose-900/40 text-rose-500 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all tap-feedback border border-rose-500/20"
                  >
                    Kill Process
                  </button>
                </div>
              )}

              {!isMirrorMode && (
                <div className="mt-4">
                  <button
                    onClick={handleDeleteSession}
                    className="w-full py-4 bg-zinc-950 hover:bg-rose-950/30 text-zinc-400 hover:text-rose-400 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all tap-feedback border border-zinc-800 hover:border-rose-500/20"
                  >
                    Delete Session
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
