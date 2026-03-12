import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session } from '../types'
import { SessionCard } from '../components/SessionCard'
import { apiFetch } from '../hooks/useApi'

type FilterTab = 'all' | 'running' | 'archived'

const REFRESH_INTERVAL_MS = 10_000

export function Dashboard() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterTab>('all')

  const fetchSessions = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions: Session[] }>('/api/v1/sessions')
      setSessions(data.sessions)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const filteredSessions = sessions.filter(s => {
    if (filter === 'running') return s.status === 'running' || s.status === 'starting'
    if (filter === 'archived') return s.archived
    return !s.archived
  })

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'running', label: 'Running' },
    { id: 'archived', label: 'Archived' },
  ]

  const runningSessions = sessions.filter(s => s.status === 'running' || s.status === 'starting')

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Sessions</h2>
          {runningSessions.length > 0 && (
            <p className="text-xs text-green-400 mt-0.5">
              {runningSessions.length} active
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/sessions/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg min-h-[44px] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-800 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors min-h-[36px] ${
              filter === tab.id
                ? 'bg-gray-600 text-gray-100'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-4 text-red-300 text-sm">
          <p className="font-medium mb-1">Failed to load sessions</p>
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchSessions}
            className="mt-3 px-4 py-2 bg-red-800 hover:bg-red-700 rounded-md text-xs min-h-[44px] transition-colors"
          >
            Retry
          </button>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">
            {filter === 'running' ? '💤' : filter === 'archived' ? '📦' : '🚀'}
          </div>
          <p className="text-gray-400 font-medium">
            {filter === 'running'
              ? 'No active sessions'
              : filter === 'archived'
              ? 'No archived sessions'
              : 'No sessions yet'}
          </p>
          {filter === 'all' && (
            <button
              onClick={() => navigate('/sessions/new')}
              className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg min-h-[48px] transition-colors"
            >
              Create your first session
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              onRefresh={fetchSessions}
            />
          ))}
        </div>
      )}

      {/* Pull to refresh hint */}
      {!loading && filteredSessions.length > 0 && (
        <p className="text-center text-xs text-gray-600 mt-6 pb-2">
          Auto-refreshes every 10s
        </p>
      )}
    </div>
  )
}
