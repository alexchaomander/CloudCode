import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'

export interface UseTerminalOptions {
  sessionId: string
  terminal: Terminal | null
}

export interface UseTerminalResult {
  isConnected: boolean
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
}

const MAX_RETRIES = 10
const BASE_DELAY_MS = 500

export function useTerminal({ sessionId, terminal }: UseTerminalOptions): UseTerminalResult {
  const wsRef = useRef<WebSocket | null>(null)
  const retryCountRef = useRef(0)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const [isConnected, setIsConnected] = useState(false)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const sendInput = useCallback((data: string) => {
    sendMessage({ type: 'terminal.input', data })
  }, [sendMessage])

  const resize = useCallback((cols: number, rows: number) => {
    lastSizeRef.current = { cols, rows }
    sendMessage({ type: 'terminal.resize', cols, rows })
  }, [sendMessage])

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

      // Subscribe to session
      ws.send(JSON.stringify({ type: 'subscribe', sessionId }))

      // Send current size if known
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
          status?: string
          error?: string
        }

        switch (msg.type) {
          case 'terminal.output':
            if (terminal && msg.data) {
              terminal.write(msg.data)
            }
            break
          case 'session.status':
            // Status updates handled by parent if needed
            break
          case 'session.error':
            if (terminal && msg.error) {
              terminal.write(`\r\n\x1b[31mError: ${msg.error}\x1b[0m\r\n`)
            }
            break
          default:
            break
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setIsConnected(false)
      wsRef.current = null

      // Exponential backoff retry
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCountRef.current), 30000)
        retryCountRef.current += 1

        if (terminal) {
          terminal.write(`\r\n\x1b[33mDisconnected. Reconnecting in ${Math.round(delay / 1000)}s... (attempt ${retryCountRef.current}/${MAX_RETRIES})\x1b[0m\r\n`)
        }

        retryTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connect()
        }, delay)
      } else {
        if (terminal) {
          terminal.write(`\r\n\x1b[31mFailed to reconnect after ${MAX_RETRIES} attempts.\x1b[0m\r\n`)
        }
      }
    }

    ws.onerror = () => {
      // onclose will handle reconnect
      ws.close()
    }
  }, [sessionId, terminal])

  // Handle page visibility changes (phone sleep/wake)
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
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [connect])

  useEffect(() => {
    mountedRef.current = true
    retryCountRef.current = 0

    if (terminal) {
      connect()
    }

    return () => {
      mountedRef.current = false
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [sessionId, terminal, connect])

  return { isConnected, sendInput, resize }
}
