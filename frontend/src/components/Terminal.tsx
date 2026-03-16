import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { useTerminal } from '../hooks/useTerminal'
import { apiFetch } from '../hooks/useApi'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId: string
  sessionTitle?: string
  agentName?: string
}

const XTERM_THEME = {
  background: 'transparent', // Transparent to show the glass frame background
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

export function Terminal({ sessionId, sessionTitle, agentName }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const [terminalInstance, setTerminalInstance] = useState<XTerm | null>(null)
  const { isConnected, bootState, sendInput, resize } = useTerminal({ sessionId, terminal: terminalInstance })
  
  const [ctrlMode, setCtrlMode] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [historyContent, setHistoryContent] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [ghostInput, setGhostInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalShellRef = useRef<HTMLDivElement>(null)
  const touchStateRef = useRef<{ y: number; accumulated: number; velocity: number; lastTs: number; pointerId: number | null } | null>(null)
  const momentumFrameRef = useRef<number | null>(null)
  const railDragRef = useRef<{ top: number; height: number } | null>(null)
  const [scrollMetrics, setScrollMetrics] = useState({ viewportY: 0, baseY: 0 })

  const bootCopy = (() => {
    switch (bootState) {
      case 'loading-history':
        return {
          eyebrow: 'Preparing View',
          title: 'Loading terminal history',
          detail: 'Pulling prior context so the session opens with useful output instead of a blank pane.',
        }
      case 'connecting':
        return {
          eyebrow: 'Attaching Stream',
          title: `Opening ${agentName ?? 'agent'} terminal`,
          detail: 'Negotiating the live PTY bridge and attaching the session stream.',
        }
      case 'waiting-for-output':
        return {
          eyebrow: 'Session Starting',
          title: sessionTitle ? `Launching ${sessionTitle}` : 'Waiting for terminal output',
          detail: 'The session is alive. The coding agent has not printed its first visible frame yet.',
        }
      default:
        return null
    }
  })()

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return

    // Intercept all console methods to definitively silence noisy xterm warnings
    const methods: Array<keyof Console> = ['log', 'warn', 'error', 'info'];
    const originals: any = {};
    
    methods.forEach(m => {
      originals[m] = console[m];
      (console as any)[m] = (...args: any[]) => {
        const firstArg = args[0];
        const isXtermMsg = typeof firstArg === 'string' && 
          (firstArg.includes('xterm.js') || firstArg.includes('Parsing error'));
        
        // Also check objects if xterm logs the parser state directly
        const isXtermObj = !isXtermMsg && firstArg && typeof firstArg === 'object' && 
          (firstArg.params || firstArg.currentState !== undefined);

        if (isXtermMsg || isXtermObj) return;
        originals[m].apply(console, args);
      };
    });

    const term = new XTerm({
      theme: XTERM_THEME,
      fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowTransparency: true, // Crucial for glass effect
      convertEol: false,
      logLevel: 'off',
      rightClickSelectsWord: true,
    })

    // Silence internal xterm.js parsing error reporting
    try {
      if ((term as any)._core && (term as any)._core._onBinary) {
        (term as any)._core._onBinary.fire = () => {};
      }
    } catch (e) {
      // Ignore if core internals change
    }

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const searchAddon = new SearchAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.loadAddon(searchAddon)

    term.open(containerRef.current)
    
    // Ensure fitting on next tick
    setTimeout(() => {
      fitAddon.fit()
    }, 0)

    // Copy on selection
    term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel) navigator.clipboard.writeText(sel).catch(() => {})
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon
    setTerminalInstance(term)

    return () => {
      term.dispose()
      if (momentumFrameRef.current !== null) {
        cancelAnimationFrame(momentumFrameRef.current)
        momentumFrameRef.current = null
      }
      xtermRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
      setTerminalInstance(null)
    }
  }, [])

  // Auto-focus terminal or ghost input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.innerWidth < 768) {
        // On mobile, focus our custom input
        inputRef.current?.focus()
      } else {
        xtermRef.current?.focus()
      }
    }, 150)
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
          // ignore
        }
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [resize])

  // Wire terminal input
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

  const handleGhostSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ghostInput) return
    sendInput(ghostInput)
    sendInput('\r')
    setGhostInput('')
    haptic()
  }

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        haptic()
        sendInput(text)
      }
    } catch {
      // ignore
    }
  }, [sendInput])

  const toggleCtrl = useCallback(() => {
    haptic()
    setCtrlMode(m => !m)
  }, [])

  const toggleSearch = useCallback(() => {
    haptic()
    setShowSearch(s => !s)
    if (showSearch) {
      setSearchQuery('')
      searchAddonRef.current?.clearDecorations()
    }
  }, [showSearch])

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query) {
      searchAddonRef.current?.findNext(query, { incremental: true })
    } else {
      searchAddonRef.current?.clearDecorations()
    }
  }

  const handleCtrlKey = useCallback((char: string) => {
    haptic()
    const code = char.toUpperCase().charCodeAt(0) - 64
    if (code >= 1 && code <= 26) {
      sendInput(String.fromCharCode(code))
    }
    setCtrlMode(false)
  }, [sendInput])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await apiFetch<{ historyOutput: string; currentOutput: string; fullOutput: string }>(
        `/api/v1/sessions/${encodeURIComponent(sessionId)}/terminal/bootstrap`
      )
      setHistoryContent(data.fullOutput ?? '')
    } finally {
      setHistoryLoading(false)
    }
  }, [sessionId])

  const toggleHistory = useCallback(() => {
    haptic()
    const next = !showHistory
    setShowHistory(next)
    if (next) {
      void loadHistory()
    }
  }, [loadHistory, showHistory])

  const syncScrollMetrics = useCallback(() => {
    const term = xtermRef.current
    if (!term) return
    setScrollMetrics({
      viewportY: term.buffer.active.viewportY,
      baseY: term.buffer.active.baseY,
    })
  }, [])

  const scrollPageUp = useCallback(() => {
    haptic()
    xtermRef.current?.scrollPages(-1)
  }, [])

  const scrollPageDown = useCallback(() => {
    haptic()
    xtermRef.current?.scrollPages(1)
  }, [])

  const scrollToTop = useCallback(() => {
    haptic()
    xtermRef.current?.scrollToTop()
  }, [])

  const scrollToBottom = useCallback(() => {
    haptic()
    xtermRef.current?.scrollToBottom()
  }, [])

  const stopMomentum = useCallback(() => {
    if (momentumFrameRef.current !== null) {
      cancelAnimationFrame(momentumFrameRef.current)
      momentumFrameRef.current = null
    }
  }, [])

  const applyScrollDelta = useCallback((deltaY: number) => {
    const term = xtermRef.current
    if (!term) return
    const state = touchStateRef.current
    if (!state) return

    const fontSize = typeof term.options.fontSize === 'number' ? term.options.fontSize : 13
    const lineHeight = typeof term.options.lineHeight === 'number' ? term.options.lineHeight : 1.4
    const lineHeightPx = Math.max(18, Math.round(fontSize * lineHeight))

    state.accumulated += deltaY
    const lines = Math.trunc(state.accumulated / lineHeightPx)
    if (lines !== 0) {
      term.scrollLines(-lines)
      state.accumulated -= lines * lineHeightPx
    }
  }, [])

  const startMomentum = useCallback(() => {
    const step = () => {
      const state = touchStateRef.current
      if (!state) return

      state.velocity *= 0.92
      if (Math.abs(state.velocity) < 0.15) {
        momentumFrameRef.current = null
        touchStateRef.current = null
        return
      }

      applyScrollDelta(state.velocity)
      momentumFrameRef.current = requestAnimationFrame(step)
    }

    stopMomentum()
    momentumFrameRef.current = requestAnimationFrame(step)
  }, [applyScrollDelta, stopMomentum])

  useEffect(() => {
    const term = xtermRef.current
    if (!term) return

    syncScrollMetrics()
    const disposable = term.onScroll(() => {
      syncScrollMetrics()
    })
    return () => disposable.dispose()
  }, [terminalInstance, syncScrollMetrics])

  useEffect(() => {
    return () => {
      stopMomentum()
    }
  }, [stopMomentum])

  const handleShellPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return
    stopMomentum()
    event.currentTarget.setPointerCapture(event.pointerId)
    touchStateRef.current = {
      y: event.clientY,
      accumulated: 0,
      velocity: 0,
      lastTs: performance.now(),
      pointerId: event.pointerId,
    }
  }, [stopMomentum])

  const handleShellPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = touchStateRef.current
    if (!state || state.pointerId !== event.pointerId) return

    const now = performance.now()
    const deltaY = event.clientY - state.y
    const deltaTime = Math.max(16, now - state.lastTs)
    state.y = event.clientY
    state.lastTs = now
    state.velocity = deltaY / deltaTime * 16

    applyScrollDelta(deltaY)
    event.preventDefault()
  }, [applyScrollDelta])

  const handleShellPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = touchStateRef.current
    if (!state || state.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (Math.abs(state.velocity) > 0.4) {
      startMomentum()
    } else {
      touchStateRef.current = null
    }
  }, [startMomentum])

  const scrollThumbHeight = scrollMetrics.baseY > 0
    ? Math.max(0.12, 1 / (scrollMetrics.baseY + 1))
    : 1
  const scrollThumbOffset = scrollMetrics.baseY > 0
    ? (scrollMetrics.viewportY / scrollMetrics.baseY) * (1 - scrollThumbHeight)
    : 0

  const handleRailPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const rail = event.currentTarget
    rail.setPointerCapture(event.pointerId)
    railDragRef.current = {
      top: rail.getBoundingClientRect().top,
      height: rail.getBoundingClientRect().height,
    }
  }, [])

  const handleRailPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!railDragRef.current) return
    const term = xtermRef.current
    if (!term) return

    const { top, height } = railDragRef.current
    const progress = Math.min(1, Math.max(0, (event.clientY - top) / Math.max(1, height)))
    const target = Math.round(progress * term.buffer.active.baseY)
    term.scrollLines(target - term.buffer.active.viewportY)
  }, [])

  const handleRailPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    railDragRef.current = null
  }, [])

  // Primary keybar
  const primaryKeys: KeybarButton[] = [
    { label: 'SEARCH', title: 'Find text', action: toggleSearch, highlight: showSearch },
    { label: 'HISTORY', title: 'Open full output history', action: toggleHistory, highlight: showHistory },
    { label: 'TOP', title: 'Scroll to top', action: scrollToTop },
    { label: 'PGUP', title: 'Scroll up one page', action: scrollPageUp },
    { label: 'PGDN', title: 'Scroll down one page', action: scrollPageDown },
    { label: 'END', title: 'Scroll to bottom', action: scrollToBottom },
    { label: 'CTRL', title: 'Hold Ctrl', action: toggleCtrl, highlight: ctrlMode },
    { label: 'ESC', title: 'Escape', action: '\x1b' },
    { label: 'TAB', title: 'Tab', action: '\t' },
    { label: '^C', title: 'Interrupt', action: '\x03' },
    { label: '^D', title: 'EOF', action: '\x04' },
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
    <div className="flex flex-col h-full bg-zinc-950 select-none overflow-hidden relative">
      {/* Search Bar Overlay */}
      {showSearch && (
        <div className="absolute top-0 inset-x-0 z-50 p-2 animate-fade-in bg-zinc-900/90 backdrop-blur-md border-b border-white/5 flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') searchAddonRef.current?.findNext(searchQuery)
              if (e.key === 'Escape') toggleSearch()
            }}
            placeholder="Find in terminal..."
            className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500/50"
          />
          <div className="flex gap-1">
            <button
              onClick={() => searchAddonRef.current?.findPrevious(searchQuery)}
              className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-zinc-300"
            >
              ↑
            </button>
            <button
              onClick={() => searchAddonRef.current?.findNext(searchQuery)}
              className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-zinc-300"
            >
              ↓
            </button>
            <button
              onClick={toggleSearch}
              className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-zinc-400"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="absolute inset-0 z-50 bg-zinc-950/96 backdrop-blur-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-zinc-900/90">
            <div>
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-[0.24em]">Full Output</div>
              <div className="text-xs text-zinc-500">Native scrolling for long terminal history</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void loadHistory()}
                className="px-3 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300"
              >
                {historyLoading ? 'Loading' : 'Refresh'}
              </button>
              <button
                onClick={toggleHistory}
                className="px-3 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <pre className="min-h-full whitespace-pre-wrap break-words text-[12px] leading-6 text-zinc-200 font-mono selection:bg-emerald-500/25">
              {historyLoading && !historyContent ? 'Loading terminal history…' : historyContent || 'No terminal output yet.'}
            </pre>
          </div>
        </div>
      )}

      {/* Terminal Area with Glass Frame */}
      <div className="flex-1 flex flex-col p-3 pb-0 relative overflow-hidden">
        <div className="flex-1 flex flex-col glass-panel rounded-2xl overflow-hidden">
          {/* Terminal Header */}
          <div className="h-9 px-4 flex items-center justify-between bg-white/5 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] ml-2">Terminal Session</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1 mr-2">
                <button
                  onPointerDown={(e) => { e.preventDefault(); scrollToTop() }}
                  className="px-2 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-[9px] font-bold tracking-widest text-zinc-400"
                  title="Scroll to top"
                >
                  TOP
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); scrollPageUp() }}
                  className="px-2 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-[9px] font-bold tracking-widest text-zinc-400"
                  title="Scroll up"
                >
                  PGUP
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); scrollPageDown() }}
                  className="px-2 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-[9px] font-bold tracking-widest text-zinc-400"
                  title="Scroll down"
                >
                  PGDN
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); scrollToBottom() }}
                  className="px-2 h-7 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-[9px] font-bold tracking-widest text-zinc-400"
                  title="Scroll to bottom"
                >
                  END
                </button>
              </div>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">{isConnected ? 'Live' : 'Syncing'}</span>
            </div>
          </div>

          {/* xterm instance with internal padding */}
          <div
            ref={terminalShellRef}
            className="flex-1 p-3 min-h-0 relative touch-none"
            onPointerDown={handleShellPointerDown}
            onPointerMove={handleShellPointerMove}
            onPointerUp={handleShellPointerEnd}
            onPointerCancel={handleShellPointerEnd}
          >
            {bootCopy && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),rgba(9,9,11,0.72)_45%,rgba(9,9,11,0.9)_100%)] backdrop-blur-[6px]">
                <div className="mx-2 w-full max-w-md rounded-[28px] border border-white/10 bg-black/55 px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-cyan-300/80">{bootCopy.eyebrow}</p>
                      <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">{bootCopy.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-zinc-300">{bootCopy.detail}</p>
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
                    <span>{isConnected ? 'Stream attached' : 'Connecting...'}</span>
                    <span>Session {sessionId.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
            )}

            <div
              ref={containerRef}
              className="w-full h-full xterm-container"
              onClick={() => {
                if (window.innerWidth >= 768) xtermRef.current?.focus()
                else inputRef.current?.focus()
              }}
            />
            {scrollMetrics.baseY > 0 && (
              <>
                <div className={`pointer-events-none absolute left-3 right-6 top-3 h-10 bg-gradient-to-b from-zinc-950/70 to-transparent transition-opacity ${scrollMetrics.viewportY > 0 ? 'opacity-100' : 'opacity-0'}`} />
                <div className={`pointer-events-none absolute left-3 right-6 bottom-3 h-10 bg-gradient-to-t from-zinc-950/80 to-transparent transition-opacity ${scrollMetrics.viewportY < scrollMetrics.baseY ? 'opacity-100' : 'opacity-0'}`} />
                <div
                  className="absolute right-2 top-3 bottom-3 w-4 flex items-center justify-center touch-none"
                  onPointerDown={handleRailPointerDown}
                  onPointerMove={handleRailPointerMove}
                  onPointerUp={handleRailPointerEnd}
                  onPointerCancel={handleRailPointerEnd}
                >
                  <div className="relative h-full w-1 rounded-full bg-white/8">
                    <div
                      className="absolute left-0 right-0 rounded-full bg-indigo-400/80 shadow-[0_0_16px_rgba(99,102,241,0.45)]"
                      style={{
                        top: `${scrollThumbOffset * 100}%`,
                        height: `${scrollThumbHeight * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="absolute left-5 top-5 rounded-full bg-zinc-950/80 backdrop-blur-md border border-white/5 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                  {Math.round((scrollMetrics.viewportY / Math.max(1, scrollMetrics.baseY)) * 100)}%
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ghost Input - Modern Chat-like field */}
      <div className="p-3 pt-2 animate-slide-up flex-shrink-0">
        <form onSubmit={handleGhostSubmit} className="relative group">
          <input
            ref={inputRef}
            type="text"
            value={ghostInput}
            onChange={e => setGhostInput(e.target.value)}
            placeholder="Type a command or message..."
            className="w-full bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-4 pr-14 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-xl"
          />
          <button
            type="submit"
            disabled={!ghostInput}
            className={`absolute right-2 top-2 bottom-2 px-4 rounded-xl transition-all flex items-center justify-center ${
              ghostInput 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 active:scale-90' 
                : 'bg-zinc-800 text-zinc-600 opacity-50'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </form>
      </div>

      {/* Ctrl-mode letter picker */}
      {ctrlMode && (
        <div className="absolute inset-x-0 bottom-32 z-50 p-2 animate-slide-up">
          <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-4 grid grid-cols-6 gap-2">
            <div className="col-span-6 flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Control Mode
              </span>
              <button
                onPointerDown={(e) => { e.preventDefault(); haptic(); setCtrlMode(false) }}
                className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider"
              >
                Dismiss
              </button>
            </div>
            {ctrlLetters.map(ch => (
              <button
                key={ch}
                onPointerDown={(e) => { e.preventDefault(); handleCtrlKey(ch) }}
                className="h-11 bg-zinc-800 hover:bg-zinc-700 active:bg-indigo-600 text-zinc-100 text-xs rounded-xl font-bold transition-all tap-feedback border border-white/5 flex items-center justify-center shadow-lg"
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile keybar */}
      <div className="flex items-center bg-zinc-900/90 backdrop-blur-md border-t border-white/5 h-14 px-2 safe-bottom flex-shrink-0">
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
                  : 'bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 border-white/5'
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
