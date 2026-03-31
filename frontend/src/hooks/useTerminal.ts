import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { apiFetch } from './useApi'

export interface UseTerminalOptions {
  sessionId: string
  terminal: Terminal | null
}

export interface PromptState {
  isActive: boolean
  type: 'yesno' | 'enter' | null
  text?: string
}

export interface TimelineAction {
  id: string
  type: 'bash' | 'read' | 'edit' | 'grep' | 'ls' | 'custom'
  label: string
  status: 'running' | 'completed' | 'error'
  content?: string
  startTime: string
  endTime?: string
}

export interface UseTerminalResult {
  isConnected: boolean
  bootState: 'loading-history' | 'connecting' | 'waiting-for-output' | 'ready'
  sessionEnded: boolean
  promptState: PromptState | null
  timelineActions: TimelineAction[]
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
}

interface TerminalBootstrapResponse {
  historyOutput: string
  currentOutput: string
  fullOutput: string
}

function decodeBase64ToBytes(dataBase64: string): Uint8Array {
  const binary = window.atob(dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const MAX_RETRIES = 10
const BASE_DELAY_MS = 500

// If the server sends no ping for this long, assume the connection is silently dead
// (e.g. phone woke from sleep and the TCP socket wasn't cleaned up server-side yet).
const CLIENT_PING_TIMEOUT_MS = 35_000

export function useTerminal({ sessionId, terminal }: UseTerminalOptions): UseTerminalResult {
  const wsRef = useRef<WebSocket | null>(null)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const [isConnected, setIsConnected] = useState(false)
  const [bootState, setBootState] = useState<UseTerminalResult['bootState']>('loading-history')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [timelineActions, setTimelineActions] = useState<TimelineAction[]>([])
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const pendingMessagesRef = useRef<string[]>([])
  const hasRenderedContentRef = useRef(false)
  // Tracks last server ping time so we can detect silent connection death
  const lastPingRef = useRef<number>(Date.now())

  const markReady = useCallback(() => {
    hasRenderedContentRef.current = true
    setBootState('ready')
  }, [])

  const sendMessage = useCallback((msg: object) => {
    const payload = JSON.stringify(msg)

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload)
      return
    }

    pendingMessagesRef.current.push(payload)
  }, [])

  const sendInput = useCallback((data: string) => {
    sendMessage({ type: 'terminal.input', data })
  }, [sendMessage])

  const resize = useCallback((cols: number, rows: number) => {
    lastSizeRef.current = { cols, rows }
    sendMessage({ type: 'terminal.resize', cols, rows })
  }, [sendMessage])

  const loadBootstrap = useCallback(async () => {
    if (!terminal) return

    try {
      const data = await apiFetch<TerminalBootstrapResponse>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/terminal/bootstrap`)
      if (data.historyOutput) {
        terminal.clear()
        terminal.write(data.historyOutput.replace(/\n/g, '\r\n'))
        markReady()
      }
    } catch {
      // ignore bootstrap failures and fall back to live stream only
    }
  }, [sessionId, terminal, markReady])

  // Force-reconnect immediately, bypassing backoff. Used when we get a strong signal
  // that the connection is dead (network change, visibility restore, ping timeout).
  const reconnectNow = useCallback(() => {
    if (!mountedRef.current) return
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    // Clear the watchdog for the socket we're about to force-close. Without this,
    // setting onclose=null (below) would prevent the normal onclose path from calling
    // clearInterval, so the interval would leak and accumulate across reconnects.
    if (pingWatchdogRef.current) {
      clearInterval(pingWatchdogRef.current)
      pingWatchdogRef.current = null
    }
    const current = wsRef.current
    if (current) {
      current.onclose = null // suppress the normal close→backoff path
      current.onerror = null
      current.close()
      wsRef.current = null
    }
    retryCountRef.current = 0
    setIsConnected(false)
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/terminal?sessionId=${encodeURIComponent(sessionId)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    // Watchdog: if no ping arrives from the server within CLIENT_PING_TIMEOUT_MS, the
    // connection is silently dead (common after phone sleep or a WiFi→cellular switch).
    // Close it immediately so the onclose handler kicks off a fresh reconnect.
    lastPingRef.current = Date.now()
    const pingWatchdog = setInterval(() => {
      if (Date.now() - lastPingRef.current > CLIENT_PING_TIMEOUT_MS) {
        clearInterval(pingWatchdog)
        if (pingWatchdogRef.current === pingWatchdog) pingWatchdogRef.current = null
        ws.close(1001, 'Ping watchdog timeout')
      }
    }, 5_000)
    pingWatchdogRef.current = pingWatchdog

    ws.onopen = () => {
      // Guard against stale sockets: if reconnectNow fired while this socket's
      // handshake was in-flight, a newer socket has already taken wsRef.current.
      // Silently close this one rather than corrupting shared state.
      if (ws !== wsRef.current) {
        clearInterval(pingWatchdog)
        ws.close()
        return
      }
      if (!mountedRef.current) {
        clearInterval(pingWatchdog)
        ws.close()
        return
      }
      retryCountRef.current = 0
      lastPingRef.current = Date.now() // reset watchdog on fresh connect
      setIsConnected(true)
      setBootState(hasRenderedContentRef.current ? 'ready' : 'waiting-for-output')

      for (const payload of pendingMessagesRef.current) {
        ws.send(payload)
      }
      pendingMessagesRef.current = []

      if (lastSizeRef.current) {
        ws.send(JSON.stringify({
          type: 'terminal.resize',
          cols: lastSizeRef.current.cols,
          rows: lastSizeRef.current.rows,
        }))
      }
    }

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string
          data?: string
          dataBase64?: string
          cursor?: { x: number; y: number }
          status?: string
          error?: string
          message?: string
          timestamp?: number
        }

        switch (msg.type) {
          case 'ping':
            // Respond to server heartbeat and reset the client-side watchdog.
            // This is the mosh-inspired link health check: both ends actively verify
            // the channel is alive so dead connections are detected in <20s rather
            // than waiting for TCP timeout (which can take minutes).
            lastPingRef.current = Date.now()
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }))
            }
            break
          case 'terminal.output':
            if (terminal && msg.dataBase64 !== undefined) {
              const bytes = decodeBase64ToBytes(msg.dataBase64)
              terminal.write(bytes)
              if (bytes.length > 0) {
                markReady()
              }
            } else if (terminal && msg.data !== undefined) {
              terminal.write(msg.data)
              if (msg.data.length > 0) {
                markReady()
              }
            }
            break
          case 'session.status':
            // The backend sends this when the PTY exits (status: 'stopped') or when
            // a session transitions to an error state. Update UI immediately so the
            // terminal header shows "Ended" rather than staying on "Live".
            if (msg.status === 'stopped' || msg.status === 'error') {
              setSessionEnded(true)
              setIsConnected(false)
            }
            break
          case 'session.error':
            if (terminal) {
              const errorMessage = msg.error ?? (msg as { message?: string }).message
              if (errorMessage) {
                terminal.write(`\r\n\x1b[31mError: ${errorMessage}\x1b[0m\r\n`)
              }
            }
            break
          case 'prompt.state':
            setPromptState((msg as any).promptState as PromptState)
            break
          case 'timeline.action': {
            const action = (msg as any).action as TimelineAction
            setTimelineActions(prev => {
              const exists = prev.findIndex(a => a.id === action.id)
              if (exists !== -1) {
                const next = [...prev]
                next[exists] = action
                return next
              }
              // Cap at 100 actions to prevent memory growth in long sessions
              const MAX_TIMELINE_ACTIONS = 100
              const updated = [...prev, action]
              return updated.length > MAX_TIMELINE_ACTIONS ? updated.slice(-MAX_TIMELINE_ACTIONS) : updated
            })
            break
          }
          default:
            break
        }
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      clearInterval(pingWatchdog)
      if (pingWatchdogRef.current === pingWatchdog) pingWatchdogRef.current = null
      if (!mountedRef.current) return
      // Stale socket (displaced by reconnectNow + a new connect call): ignore.
      if (ws !== wsRef.current) return
      setIsConnected(false)
      if (!hasRenderedContentRef.current) {
        setBootState('connecting')
      }
      wsRef.current = null

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCountRef.current), 30000)
        retryCountRef.current += 1

        if (terminal) {
          // Only show disconnect message if it's been down for more than 2 seconds
          if (retryCountRef.current > 2) {
            terminal.write(`\r\n\x1b[33mSyncing... (attempt ${retryCountRef.current}/${MAX_RETRIES})\x1b[0m\r\n`)
          }
        }

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connect()
        }, delay)
      }
    }

    ws.onerror = () => {
      clearInterval(pingWatchdog)
      ws.close()
    }
  }, [sessionId, terminal])

  // Handle visibility: when the page becomes visible after a sleep/background period,
  // reconnect immediately. Also handles stuck CONNECTING sockets (common after wake).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const ws = wsRef.current
      const isDead = !ws
        || ws.readyState === WebSocket.CLOSED
        || ws.readyState === WebSocket.CLOSING
      // CONNECTING sockets may be stuck after a sleep; if the last ping was long ago
      // it's safer to kill and restart than to wait for the backoff chain.
      const isStuckConnecting = ws?.readyState === WebSocket.CONNECTING
        && Date.now() - lastPingRef.current > CLIENT_PING_TIMEOUT_MS
      if (isDead || isStuckConnecting) {
        reconnectNow()
        connect()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [connect, reconnectNow])

  // Handle network changes: when the browser comes back online (WiFi↔cellular switch,
  // or reconnecting after airplane mode) immediately try to reconnect rather than
  // waiting for the exponential backoff queue to drain. This is the browser-accessible
  // analog to mosh's roaming — we can't change IP-layer transport, but we can react
  // to the network change event as fast as possible.
  //
  // Guards:
  // • OPEN check — skip if we already have a healthy connection; some mobile browsers
  //   fire `online` even when the socket is still alive (e.g. switching back to a
  //   known Wi-Fi network while LTE stays up briefly).
  // • Debounce (200 ms) — some OS/browser combos emit multiple `online` events in
  //   rapid succession during a single network transition. Without debouncing each
  //   event would tear down and re-create the socket, producing a burst of in-flight
  //   connections that the stale-socket guard would then have to clean up.
  useEffect(() => {
    let onlineDebounceTimer: ReturnType<typeof setTimeout> | null = null
    const handleOnline = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return
      if (onlineDebounceTimer) clearTimeout(onlineDebounceTimer)
      onlineDebounceTimer = setTimeout(() => {
        onlineDebounceTimer = null
        reconnectNow()
        connect()
      }, 200)
    }
    // When the network goes away, update the UI immediately rather than waiting
    // up to 35 s for the watchdog or 20 s for the server heartbeat to notice.
    const handleOffline = () => {
      setIsConnected(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      if (onlineDebounceTimer) clearTimeout(onlineDebounceTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [connect, reconnectNow])

  useEffect(() => {
    mountedRef.current = true
    hasRenderedContentRef.current = false
    setBootState('loading-history')
    setSessionEnded(false)
    setPromptState(null)
    setTimelineActions([])
    if (terminal) {
      terminal.write('\x1bc')
      void loadBootstrap().finally(() => {
        if (mountedRef.current) {
          setBootState(hasRenderedContentRef.current ? 'ready' : 'connecting')
          connect()
        }
      })
    }
    return () => {
      mountedRef.current = false
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      if (pingWatchdogRef.current) {
        clearInterval(pingWatchdogRef.current)
        pingWatchdogRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [sessionId, terminal, connect, loadBootstrap])

  return { isConnected, bootState, sessionEnded, promptState, timelineActions, sendInput, resize }
}
