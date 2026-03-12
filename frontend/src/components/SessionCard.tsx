import { useNavigate } from 'react-router-dom'
import { Session } from '../types'
import { apiFetch } from '../hooks/useApi'

interface SessionCardProps {
  session: Session
  onRefresh: () => void
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const date = new Date(dateStr)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

function StatusBadge({ status }: { status: Session['status'] }) {
  const styles: Record<Session['status'], string> = {
    running: 'bg-green-900 text-green-300 border-green-700',
    starting: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    stopped: 'bg-gray-700 text-gray-300 border-gray-600',
    killed: 'bg-gray-700 text-gray-400 border-gray-600',
    error: 'bg-red-900 text-red-300 border-red-700',
  }
  const dots: Record<Session['status'], string> = {
    running: 'bg-green-400',
    starting: 'bg-yellow-400',
    stopped: 'bg-gray-400',
    killed: 'bg-gray-500',
    error: 'bg-red-400',
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${styles[status]}`}>
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

  const workdirDisplay = session.workdir.length > 40
    ? '...' + session.workdir.slice(-37)
    : session.workdir

  const isActive = session.status === 'running' || session.status === 'starting'

  return (
    <div
      className="bg-gray-800 border border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-600 hover:bg-gray-750 transition-colors active:bg-gray-700"
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleOpen(e as unknown as React.MouseEvent)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {session.pinned && (
              <svg className="w-3 h-3 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
              </svg>
            )}
            <h3 className="font-semibold text-gray-100 truncate">{session.title}</h3>
          </div>
          <div className="text-xs text-gray-400 truncate">{session.agentProfile?.name ?? session.agentProfileId}</div>
          <div className="text-xs text-gray-500 truncate mt-0.5 font-mono">{workdirDisplay}</div>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-gray-500">
          {session.lastOutputAt ? `Activity ${timeAgo(session.lastOutputAt)}` : `Created ${timeAgo(session.createdAt)}`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleOpen}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md min-h-[44px] min-w-[60px] font-medium transition-colors"
          >
            Open
          </button>
          {isActive && (
            <>
              <button
                onClick={handleStop}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md min-h-[44px] min-w-[50px] transition-colors"
              >
                Stop
              </button>
              <button
                onClick={handleKill}
                className="px-3 py-2 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded-md min-h-[44px] min-w-[44px] transition-colors"
              >
                Kill
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
