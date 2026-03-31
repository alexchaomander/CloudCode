import { TimelineAction } from '../hooks/useTerminal'
import { useState } from 'react'

interface ActionTimelineProps {
  actions: TimelineAction[]
}

export function ActionTimeline({ actions }: ActionTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-zinc-400 tracking-tight">Timeline is empty</h3>
        <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">Agent actions will appear here as they happen.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {actions.slice().reverse().map((action) => (
        <div 
          key={action.id}
          className={`group bg-zinc-900 border rounded-2xl transition-all duration-200 ${
            expandedId === action.id ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <button
            onClick={() => setExpandedId(expandedId === action.id ? null : action.id)}
            className="w-full text-left p-4 flex items-center gap-3"
          >
            <ActionIcon type={action.type} status={action.status} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-400">
                  {action.type}
                </span>
                <span className="text-[9px] font-medium text-zinc-500 font-mono">
                  {new Date(action.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <h4 className="text-sm font-bold text-zinc-100 truncate mt-0.5 tracking-tight">
                {action.label}
              </h4>
            </div>

            <div className="flex-shrink-0">
              {action.status === 'running' ? (
                <div className="w-5 h-5 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </div>
              ) : action.status === 'completed' ? (
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
          </button>

          {expandedId === action.id && action.content && (
            <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 font-mono text-[11px] leading-relaxed text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                {action.content}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ActionIcon({ type, status }: { type: TimelineAction['type'], status: TimelineAction['status'] }) {
  const baseClasses = "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border"
  
  const styles = {
    bash: "bg-zinc-800/50 border-zinc-700/50 text-zinc-300",
    read: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    edit: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    grep: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    ls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    custom: "bg-zinc-800/50 border-zinc-700/50 text-zinc-300",
  }

  const iconD = {
    bash: "M8 9l3 3-3 3m5 0h3",
    read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.084.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    ls: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
    custom: "M13 10V3L4 14h7v7l9-11h-7z",
  }

  return (
    <div className={`${baseClasses} ${styles[type]}`}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconD[type]} />
      </svg>
    </div>
  )
}
