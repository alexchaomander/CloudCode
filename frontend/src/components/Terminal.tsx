import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useTerminal } from '../hooks/useTerminal'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId: string
}

const XTERM_THEME = {
  background: '#111827',
  foreground: '#f3f4f6',
  cursor: '#60a5fa',
  cursorAccent: '#111827',
  black: '#1f2937',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#f3f4f6',
  brightBlack: '#6b7280',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
  selectionBackground: '#374151',
}

interface KeybarButton {
  label: string
  action: string | (() => void)
  wide?: boolean
}

export function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [terminalInstance, setTerminalInstance] = useState<XTerm | null>(null)
  const { isConnected, sendInput, resize } = useTerminal({ sessionId, terminal: terminalInstance })

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: XTERM_THEME,
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowTransparency: false,
      convertEol: false,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(containerRef.current)
    fitAddon.fit()

    // Copy on selection
    term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel) {
        navigator.clipboard.writeText(sel).catch(() => {
          // ignore clipboard errors
        })
      }
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon
    setTerminalInstance(term)

    return () => {
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
      setTerminalInstance(null)
    }
  }, [])

  // ResizeObserver for auto-fit
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit()
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) {
            resize(dims.cols, dims.rows)
          }
        } catch {
          // ignore resize errors during teardown
        }
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [resize])

  // Wire terminal input to sendInput
  useEffect(() => {
    const term = xtermRef.current
    if (!term) return

    const disposable = term.onData((data: string) => {
      sendInput(data)
    })

    return () => disposable.dispose()
  }, [sendInput, terminalInstance])

  const handleKeybarAction = useCallback((action: string | (() => void)) => {
    if (typeof action === 'function') {
      action()
      return
    }
    sendInput(action)
    xtermRef.current?.focus()
  }, [sendInput])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) sendInput(text)
      xtermRef.current?.focus()
    } catch {
      // Clipboard not available
    }
  }, [sendInput])

  const keybarButtons: KeybarButton[] = [
    { label: 'Ctrl', action: () => {
      // Toggle Ctrl mode - next key press sends ctrl version
      // For simplicity, send Ctrl+C as most common
    }},
    { label: '^C', action: '\x03' },
    { label: 'Esc', action: '\x1b' },
    { label: 'Tab', action: '\t' },
    { label: '↑', action: '\x1b[A' },
    { label: '↓', action: '\x1b[B' },
    { label: '←', action: '\x1b[D' },
    { label: '→', action: '\x1b[C' },
    { label: 'Enter', action: '\r' },
    { label: 'Paste', action: handlePaste, wide: true },
  ]

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Connection status bar */}
      <div className={`flex items-center gap-2 px-3 py-1 text-xs ${isConnected ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
        {isConnected ? 'Connected' : 'Connecting...'}
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="xterm-container flex-1 min-h-0"
        onClick={() => xtermRef.current?.focus()}
      />

      {/* Mobile keyboard helper bar */}
      <div className="flex overflow-x-auto bg-gray-800 border-t border-gray-700 py-1 px-1 gap-1 flex-shrink-0 no-scrollbar">
        {keybarButtons.map((btn, i) => (
          <button
            key={i}
            onPointerDown={(e) => {
              e.preventDefault()
              handleKeybarAction(btn.action)
            }}
            className={`flex-shrink-0 px-3 py-2 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-200 text-xs rounded font-mono min-h-[44px] select-none transition-colors ${btn.wide ? 'px-4' : ''}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}
