import { useNavigate } from 'react-router-dom'
import { Session } from '../types'
import { apiFetch } from '../hooks/useApi'

interface SessionCardProps {
  session: Session
  onRefresh: () => void
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return `${diffDay}d ago`
}

function StatusBadge({ status }: { status: Session['status'] }) {
  const styles: Record<Session['status'], string> = {
    running: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    starting: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    stopped: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    killed: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
    error: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  }
  const dots: Record<Session['status'], string> = {
    running: 'bg-emerald-400',
    starting: 'bg-amber-400',
    stopped: 'bg-zinc-400',
    killed: 'bg-zinc-600',
    error: 'bg-rose-400',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]} ${status === 'running' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}

export function SessionCard({ session, onRefresh }: SessionCardProps) {
  const navigate = useNavigate()

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await apiFetch(`/api/v1/sessions/${session.publicId}/stop`, { method: 'POST' })
      onRefresh()
    } catch (err) {
      console.error('Stop failed', err)
    }
  }

  const handleKill = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Kill this session? This will force-terminate the process.')) return
    try {
      await apiFetch(`/api/v1/sessions/${session.publicId}/kill`, { method: 'POST' })
      onRefresh()
    } catch (err) {
      console.error('Kill failed', err)
    }
  }

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/sessions/${session.publicId}`)
  }

  const workdirDisplay = session.workdir.length > 35
    ? '...' + session.workdir.slice(-32)
    : session.workdir

  const isActive = session.status === 'running' || session.status === 'starting'

  return (
    <div
      className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-5 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/80 transition-all duration-200 tap-feedback active:scale-[0.99] relative overflow-hidden"
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleOpen(e as unknown as React.MouseEvent)}
    >
      {/* Background Glow for active sessions */}
      {session.status === 'running' && (
        <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-600/5 blur-3xl rounded-full" />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {session.pinned && (
              <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
              </svg>
            )}
            <h3 className="font-bold text-zinc-100 text-lg leading-tight truncate tracking-tight">{session.title}</h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
              <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {session.agentProfile?.name ?? session.agentProfileId}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono italic">
              <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              {workdirDisplay}
            </div>
          </div>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-800/50">
        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
          {session.lastOutputAt ? `Active ${timeAgo(session.lastOutputAt)}` : `Born ${timeAgo(session.createdAt)}`}
        </span>
        <div className="flex gap-2">
          {isActive ? (
            <>
              <button
                onClick={handleStop}
                className="flex items-center justify-center px-4 h-10 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition-all tap-feedback border border-zinc-700/50"
              >
                Stop
              </button>
              <button
                onClick={handleKill}
                className="flex items-center justify-center w-10 h-10 bg-rose-950/30 hover:bg-rose-900/40 text-rose-500 rounded-xl transition-all tap-feedback border border-rose-500/20"
                title="Kill Process"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={handleOpen}
              className="flex items-center justify-center px-6 h-10 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition-all tap-feedback border border-zinc-700/50"
            >
              Resume
            </button>
          )}
          <button
            onClick={handleOpen}
            className="flex items-center justify-center px-6 h-10 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all tap-feedback"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  )
}
