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
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#58a6ff',
  cursorAccent: '#0d1117',
  black: '#1c2128',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#e6edf3',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#ffffff',
  selectionBackground: '#264f78',
}

function haptic() {
  navigator.vibrate?.(6)
}

type KeybarButton = {
  label: string
  title?: string
  action: string | (() => void)
  highlight?: boolean
}

export function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [terminalInstance, setTerminalInstance] = useState<XTerm | null>(null)
  const { isConnected, sendInput, resize } = useTerminal({ sessionId, terminal: terminalInstance })
  const [ctrlMode, setCtrlMode] = useState(false)

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: XTERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowTransparency: false,
      convertEol: false,
      rightClickSelectsWord: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)

    term.open(containerRef.current)
    // Slight delay to ensure container has dimensions
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    // Copy on selection (desktop convenience)
    term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel) navigator.clipboard.writeText(sel).catch(() => {})
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

  // Auto-focus terminal when mounted
  useEffect(() => {
    const timer = setTimeout(() => xtermRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [terminalInstance])

  // ResizeObserver for auto-fit
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit()
          const dims = fitAddonRef.current.proposeDimensions()
          if (dims) resize(dims.cols, dims.rows)
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
    const disposable = term.onData((data: string) => sendInput(data))
    return () => disposable.dispose()
  }, [sendInput, terminalInstance])

  const handleKeybarAction = useCallback((action: string | (() => void)) => {
    haptic()
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
      // Clipboard API not available; user must paste via long-press
    }
  }, [sendInput])

  const toggleCtrl = useCallback(() => {
    haptic()
    setCtrlMode(m => !m)
  }, [])

  // When ctrlMode is on and a key is pressed, send Ctrl+key then exit ctrlMode
  const handleCtrlKey = useCallback((char: string) => {
    haptic()
    // ctrl code: char.charCodeAt(0) - 64 for A-Z/a-z
    const code = char.toUpperCase().charCodeAt(0) - 64
    if (code >= 1 && code <= 26) {
      sendInput(String.fromCharCode(code))
    }
    setCtrlMode(false)
    xtermRef.current?.focus()
  }, [sendInput])

  // Primary keybar — always visible
  const primaryKeys: KeybarButton[] = [
    {
      label: ctrlMode ? 'Ctrl✓' : 'Ctrl',
      title: 'Toggle Ctrl modifier',
      action: toggleCtrl,
      highlight: ctrlMode,
    },
    { label: '^C', title: 'Ctrl+C (interrupt)', action: '\x03' },
    { label: '^D', title: 'Ctrl+D (EOF)', action: '\x04' },
    { label: '^Z', title: 'Ctrl+Z (suspend)', action: '\x1a' },
    { label: '^L', title: 'Ctrl+L (clear)', action: '\x0c' },
    { label: 'Esc', title: 'Escape', action: '\x1b' },
    { label: 'Tab', title: 'Tab / autocomplete', action: '\t' },
    { label: '↑', title: 'Up arrow', action: '\x1b[A' },
    { label: '↓', title: 'Down arrow', action: '\x1b[B' },
    { label: '←', title: 'Left arrow', action: '\x1b[D' },
    { label: '→', title: 'Right arrow', action: '\x1b[C' },
    { label: '↵', title: 'Enter', action: '\r' },
    { label: 'Paste', title: 'Paste from clipboard', action: handlePaste },
  ]

  // Ctrl-mode letter overlay (A–Z subset of most useful)
  const ctrlLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']

  return (
    <div className="flex flex-col h-full" style={{ background: XTERM_THEME.background }}>
      {/* Terminal viewport */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        onClick={() => xtermRef.current?.focus()}
      />

      {/* Ctrl-mode letter picker */}
      {ctrlMode && (
        <div
          className="flex flex-wrap gap-1 px-2 py-2 border-t border-gray-700"
          style={{ background: '#161b22' }}
        >
          <span className="text-xs text-blue-400 font-mono self-center mr-1">Ctrl+</span>
          {ctrlLetters.map(ch => (
            <button
              key={ch}
              onPointerDown={(e) => { e.preventDefault(); handleCtrlKey(ch) }}
              className="px-2 py-1 bg-blue-700 hover:bg-blue-600 active:bg-blue-500 text-white text-xs rounded font-mono select-none min-w-[28px] text-center"
            >
              {ch}
            </button>
          ))}
          <button
            onPointerDown={(e) => { e.preventDefault(); haptic(); setCtrlMode(false) }}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded select-none ml-auto"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Mobile keybar */}
      <div
        className="flex items-center border-t border-gray-700 flex-shrink-0"
        style={{ background: '#161b22' }}
      >
        {/* Connection dot */}
        <div className="flex items-center px-2 flex-shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}
            title={isConnected ? 'Connected' : 'Connecting…'}
          />
        </div>

        {/* Scrollable key buttons */}
        <div className="flex overflow-x-auto py-1.5 gap-1 flex-1 no-scrollbar">
          {primaryKeys.map((btn, i) => (
            <button
              key={i}
              title={btn.title}
              onPointerDown={(e) => {
                e.preventDefault()
                handleKeybarAction(btn.action)
              }}
              className={`flex-shrink-0 px-3 py-1.5 text-xs rounded font-mono select-none transition-colors min-h-[40px] min-w-[40px] ${
                btn.highlight
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-gray-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
