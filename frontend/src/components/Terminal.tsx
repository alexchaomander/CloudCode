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
  background: '#09090b', // zinc-950
  foreground: '#f4f4f5', // zinc-100
  cursor: '#6366f1', // indigo-500
  cursorAccent: '#09090b',
  black: '#18181b',
  red: '#f43f5e',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#6366f1',
  magenta: '#d946ef',
  cyan: '#06b6d4',
  white: '#fafafa',
  brightBlack: '#3f3f46',
  brightRed: '#fb7185',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#818cf8',
  brightMagenta: '#e879f9',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
  selectionBackground: '#4338ca40',
}

function haptic() {
  if (navigator.vibrate) {
    navigator.vibrate(8)
  }
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
      fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.3,
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
    
    // Ensure fitting on next tick
    setTimeout(() => {
      fitAddon.fit()
    }, 0)

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
  }, [sendInput])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        haptic()
        sendInput(text)
      }
    } catch {
      // Clipboard API not available
    }
  }, [sendInput])

  const toggleCtrl = useCallback(() => {
    haptic()
    setCtrlMode(m => !m)
  }, [])

  // When ctrlMode is on and a key is pressed, send Ctrl+key then exit ctrlMode
  const handleCtrlKey = useCallback((char: string) => {
    haptic()
    const code = char.toUpperCase().charCodeAt(0) - 64
    if (code >= 1 && code <= 26) {
      sendInput(String.fromCharCode(code))
    }
    setCtrlMode(false)
  }, [sendInput])

  // Primary keybar — always visible
  const primaryKeys: KeybarButton[] = [
    {
      label: 'CTRL',
      title: 'Hold Ctrl',
      action: toggleCtrl,
      highlight: ctrlMode,
    },
    { label: 'ESC', title: 'Escape', action: '\x1b' },
    { label: 'TAB', title: 'Tab', action: '\t' },
    { label: '^C', title: 'Interrupt', action: '\x03' },
    { label: '^D', title: 'EOF', action: '\x04' },
    { label: '^L', title: 'Clear', action: '\x0c' },
    { label: '↑', title: 'Up', action: '\x1b[A' },
    { label: '↓', title: 'Down', action: '\x1b[B' },
    { label: '←', title: 'Left', action: '\x1b[D' },
    { label: '→', title: 'Right', action: '\x1b[C' },
    { label: '↵', title: 'Enter', action: '\r' },
    { label: 'PASTE', title: 'Paste', action: handlePaste },
  ]

  const ctrlLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
    'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']

  return (
    <div className="flex flex-col h-full bg-black select-none overflow-hidden relative">
      {/* Terminal viewport */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 xterm-container"
        onClick={() => xtermRef.current?.focus()}
      />

      {/* Ctrl-mode letter picker */}
      {ctrlMode && (
        <div className="absolute inset-x-0 bottom-16 z-50 p-2 animate-slide-up">
          <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl p-3 grid grid-cols-6 gap-1.5">
            <div className="col-span-6 flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Control Mode Active
              </span>
              <button
                onPointerDown={(e) => { e.preventDefault(); haptic(); setCtrlMode(false) }}
                className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider"
              >
                Cancel
              </button>
            </div>
            {ctrlLetters.map(ch => (
              <button
                key={ch}
                onPointerDown={(e) => { e.preventDefault(); handleCtrlKey(ch) }}
                className="h-10 bg-zinc-800 hover:bg-zinc-700 active:bg-indigo-600 text-zinc-100 text-xs rounded-xl font-bold transition-all tap-feedback border border-zinc-700/50 flex items-center justify-center shadow-sm"
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile keybar */}
      <div className="flex items-center bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 h-14 px-2 safe-bottom">
        {/* Status indicator */}
        <div className="px-2 flex-shrink-0">
          <div
            className={`w-2 h-2 rounded-full shadow-lg ${isConnected ? 'bg-emerald-500 shadow-emerald-500/20 animate-pulse' : 'bg-amber-500 shadow-amber-500/20'}`}
            title={isConnected ? 'Connected' : 'Connecting…'}
          />
        </div>

        {/* Scrollable key buttons */}
        <div className="flex overflow-x-auto py-2 gap-2 flex-1 no-scrollbar scroll-smooth">
          {primaryKeys.map((btn, i) => (
            <button
              key={i}
              title={btn.title}
              onPointerDown={(e) => {
                e.preventDefault()
                handleKeybarAction(btn.action)
              }}
              className={`flex-shrink-0 h-10 px-4 rounded-xl text-[10px] font-bold tracking-widest select-none transition-all tap-feedback border ${
                btn.highlight
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700/50'
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
