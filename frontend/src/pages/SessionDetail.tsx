import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Session, SessionSnapshot } from '../types'
import { Terminal } from '../components/Terminal'
import { apiFetch } from '../hooks/useApi'

type Tab = 'terminal' | 'logs' | 'snapshots' | 'info'

interface TerminalBootstrapResponse {
  readableOutput: string
  transcriptOutput: string
  readablePaneOutput: string
  historyOutput: string
  currentOutput: string
  fullOutput: string
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleString()
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
  const isMirrorMode = !!sessionName
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('terminal')
  const [session, setSession] = useState<Session | null>(null)
  const [snapshots, setSnapshots] = useState<SessionSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capturingSnapshot, setCapturingSnapshot] = useState(false)
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null)
  const [snapshotSearch, setSnapshotSearch] = useState('')
  const [logOutput, setLogOutput] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSession = useCallback(async () => {
    if (isMirrorMode) {
      setSession({
        id: 'mirror',
        publicId: sessionName!,
        title: `Mirror: ${sessionName}`,
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
  }, [id])

  const fetchSnapshots = useCallback(async () => {
    if (!id) return
    try {
      const data = await apiFetch<{ snapshots: SessionSnapshot[] }>(`/api/v1/sessions/${id}/snapshots`)
      setSnapshots(data.snapshots)
    } catch {
      // ignore
    }
  }, [id])

  const fetchLogs = useCallback(async () => {
    if (!id) return
    try {
      setLogsLoading(true)
      const data = await apiFetch<TerminalBootstrapResponse>(`/api/v1/sessions/${id}/terminal/bootstrap`)
      setLogOutput(data.readableOutput || data.transcriptOutput || data.readablePaneOutput || data.fullOutput || '')
      setLogsError(null)
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Failed to load logs')
    } finally {
      setLogsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchSession()
    refreshIntervalRef.current = setInterval(fetchSession, 8000)
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [fetchSession])

  useEffect(() => {
    if (activeTab === 'snapshots') fetchSnapshots()
  }, [activeTab, fetchSnapshots])

  useEffect(() => {
    if (activeTab !== 'logs') {
      if (logsIntervalRef.current) clearInterval(logsIntervalRef.current)
      logsIntervalRef.current = null
      return
    }

    void fetchLogs()
    logsIntervalRef.current = setInterval(() => {
      void fetchLogs()
    }, 3000)

    return () => {
      if (logsIntervalRef.current) clearInterval(logsIntervalRef.current)
      logsIntervalRef.current = null
    }
  }, [activeTab, fetchLogs])

  const filteredSnapshots = useMemo(() => {
    if (!snapshotSearch) return snapshots
    const q = snapshotSearch.toLowerCase()
    return snapshots.filter(s => s.contentText.toLowerCase().includes(q))
  }, [snapshots, snapshotSearch])

  const handleCaptureSnapshot = async () => {
    if (!id) return
    setCapturingSnapshot(true)
    setSnapshotMessage(null)
    try {
      await apiFetch(`/api/v1/sessions/${id}/snapshots`, { method: 'POST' })
      setSnapshotMessage('Snapshot captured!')
      await fetchSnapshots()
    } catch (err) {
      setSnapshotMessage(err instanceof Error ? err.message : 'Failed to capture snapshot')
    } finally {
      setCapturingSnapshot(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!session) return

    const message = session.status === 'running' || session.status === 'starting'
      ? 'Delete this session? This will terminate the running process and remove its snapshots.'
      : 'Delete this session and all of its snapshots permanently?'

    if (!confirm(message)) return

    await apiFetch(`/api/v1/sessions/${session.publicId}`, { method: 'DELETE' })
    navigate('/')
  }

  const tabs: { id: Tab; label: string }[] = isMirrorMode ? [
    { id: 'terminal', label: 'Terminal' },
    { id: 'info', label: 'Info' },
  ] : [
    { id: 'terminal', label: 'Terminal' },
    { id: 'logs', label: 'Logs' },
    { id: 'snapshots', label: 'Snapshots' },
    { id: 'info', label: 'Info' },
  ]

  if (loading) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
      {/* Header */}
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
        <div className="flex-shrink-0 px-2">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-950 border border-zinc-800 px-2 py-1 rounded-lg">
            {session.agentProfile?.name ?? ''}
          </span>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex bg-zinc-900 flex-shrink-0 h-12">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative ${
              activeTab === tab.id
                ? 'text-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 min-h-0 overflow-hidden relative bg-black">
        {/* Terminal always stays mounted */}
        <div className={`h-full ${activeTab === 'terminal' ? 'block' : 'hidden'}`}>
          <Terminal
            sessionId={session.publicId}
            sessionTitle={session.title}
            agentName={session.agentProfile?.name ?? 'agent'}
          />
        </div>

        {activeTab === 'logs' && (
          <div className="h-full flex flex-col bg-black animate-fade-in">
            <div className="px-3 py-2.5 border-b border-zinc-800 bg-zinc-950/95 flex items-center justify-between gap-3 sm:px-4">
              <div className="min-w-0">
                <h3 className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Readable Logs</h3>
                <p className="text-[11px] text-zinc-500 truncate">Cleaned transcript replayed from the real terminal stream.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                  {session.status === 'running' ? 'Live' : 'Static'}
                </span>
                <button
                  onClick={() => void fetchLogs()}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-bold uppercase tracking-widest rounded-xl border border-zinc-700/50 transition-all tap-feedback"
                >
                  {logsLoading ? 'Refreshing' : 'Refresh'}
                </button>
              </div>
            </div>

            {logsError && (
              <div className="mx-3 mt-3 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border bg-rose-500/10 border-rose-500/20 text-rose-400 sm:mx-4">
                {logsError}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto overscroll-contain bg-black">
              <div className="min-h-full w-full px-4 py-6 sm:px-8 sm:py-8 max-w-4xl mx-auto">
                {logsLoading && !logOutput ? (
                  <p className="text-[11px] text-zinc-500 font-mono">Loading terminal logs…</p>
                ) : logOutput ? (
                  <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-a:text-indigo-400">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {logOutput}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 font-mono">No terminal output yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'snapshots' && (
          <div className="h-full flex flex-col bg-zinc-950 animate-fade-in">
            {/* Snapshot Actions & Search */}
            <div className="p-4 border-b border-zinc-800 space-y-4 bg-zinc-900/50">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em]">History & Rewind</h3>
                <button
                  onClick={handleCaptureSnapshot}
                  disabled={capturingSnapshot}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all tap-feedback"
                >
                  {capturingSnapshot ? (
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    </svg>
                  )}
                  Take Snapshot
                </button>
              </div>
              
              <div className="relative">
                <input
                  type="text"
                  value={snapshotSearch}
                  onChange={e => setSnapshotSearch(e.target.value)}
                  placeholder="Search history content..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-10 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
                <svg className="absolute left-3.5 top-3 w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {snapshotMessage && (
              <div className={`m-4 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border animate-slide-up ${
                snapshotMessage.includes('!')
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}>
                {snapshotMessage}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
              {filteredSnapshots.length === 0 ? (
                <div className="text-center py-20 animate-fade-in">
                  <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center text-2xl mb-4 border border-zinc-800 mx-auto">📸</div>
                  <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
                    {snapshotSearch ? 'No matching history' : 'No history captured'}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredSnapshots.map(snap => (
                    <div key={snap.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl group transition-all hover:border-zinc-700">
                      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/50 border-b border-zinc-800">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${snap.snapshotType === 'auto' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">{snap.snapshotType}</span>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{new Date(snap.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="relative">
                        <pre className="p-5 text-[11px] leading-relaxed text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto selection:bg-indigo-500/30 scrollbar-none">
                          {snap.contentText}
                        </pre>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(snap.contentText)
                            setSnapshotMessage('Content copied!')
                            setTimeout(() => setSnapshotMessage(null), 2000)
                          }}
                          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800/80 hover:bg-zinc-700 backdrop-blur-md p-2 rounded-lg text-zinc-400 hover:text-white border border-zinc-700"
                          title="Copy Content"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 8.5l1.5 1.5 3-3" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="h-full overflow-y-auto px-4 py-6 animate-fade-in custom-scrollbar">
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
              <div className="mt-8 flex gap-3">
                <button
                  onClick={async () => {
                    try {
                      await apiFetch(`/api/v1/sessions/${session.publicId}/stop`, { method: 'POST' })
                      await fetchSession()
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Stop failed')
                    }
                  }}
                  className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all tap-feedback border border-zinc-700/50"
                >
                  Stop Agent
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Kill this session?')) return
                    try {
                      await apiFetch(`/api/v1/sessions/${session.publicId}/kill`, { method: 'POST' })
                      await fetchSession()
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Kill failed')
                    }
                  }}
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
        )}
      </main>
    </div>
  )
}
