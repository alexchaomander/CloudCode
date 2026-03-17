import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { apiFetch } from './useApi'

export interface UseTerminalOptions {
  sessionId: string
  terminal: Terminal | null
}

export interface UseTerminalResult {
  isConnected: boolean
  bootState: 'loading-history' | 'connecting' | 'waiting-for-output' | 'ready'
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

export function useTerminal({ sessionId, terminal }: UseTerminalOptions): UseTerminalResult {
  const wsRef = useRef<WebSocket | null>(null)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const [isConnected, setIsConnected] = useState(false)
  const [bootState, setBootState] = useState<UseTerminalResult['bootState']>('loading-history')
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const pendingMessagesRef = useRef<string[]>([])
  const hasRenderedContentRef = useRef(false)

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

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/terminal?sessionId=${encodeURIComponent(sessionId)}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close()
        return
      }
      retryCountRef.current = 0
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
        }

        switch (msg.type) {
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
            break
          case 'session.error':
            if (terminal) {
              const errorMessage = msg.error ?? (msg as { message?: string }).message
              if (errorMessage) {
                terminal.write(`\r\n\x1b[31mError: ${errorMessage}\x1b[0m\r\n`)
              }
            }
            break
          default:
            break
        }
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
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
      ws.close()
    }
  }, [sessionId, terminal])

  // Handle visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          retryCountRef.current = 0
          connect()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [connect])

  useEffect(() => {
    mountedRef.current = true
    hasRenderedContentRef.current = false
    setBootState('loading-history')
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
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [sessionId, terminal, connect, loadBootstrap])

  return { isConnected, bootState, sendInput, resize }
}
