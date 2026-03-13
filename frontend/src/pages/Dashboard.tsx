import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session } from '../types'
import { SessionCard } from '../components/SessionCard'
import { apiFetch } from '../hooks/useApi'

export function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'running' | 'archived'>('all')
  const navigate = useNavigate()

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
    const interval = setInterval(fetchSessions, 10000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const filteredSessions = sessions.filter(s => {
    if (filter === 'archived') return s.archived
    if (filter === 'running') return s.status === 'running' || s.status === 'starting'
    return !s.archived
  })

  const tabs: Array<{ id: typeof filter; label: string }> = [
    { id: 'all', label: 'Active' },
    { id: 'running', label: 'Running' },
    { id: 'archived', label: 'Archived' },
  ]

  const runningSessions = sessions.filter(s => s.status === 'running' || s.status === 'starting')

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Sessions</h1>
          <p className="text-zinc-500 text-sm font-medium">
            {runningSessions.length > 0 ? (
              <span className="flex items-center gap-1.5 text-emerald-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {runningSessions.length} active now
              </span>
            ) : (
              'All systems ready'
            )}
          </p>
        </div>
        <button
          onClick={() => navigate('/sessions/new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 tap-feedback active:scale-95"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-sm">New Session</span>
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-zinc-800/50 backdrop-blur-sm">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold tracking-wide uppercase transition-all duration-200 tap-feedback ${
              filter === tab.id
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Loading sessions...</span>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center animate-slide-up">
            <div className="text-3xl mb-3">⚠️</div>
            <h3 className="text-red-400 font-bold mb-1">Connection Error</h3>
            <p className="text-red-400/70 text-sm mb-4">{error}</p>
            <button
              onClick={fetchSessions}
              className="px-6 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-xs font-bold transition-colors tap-feedback"
            >
              Try Reconnecting
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center text-4xl mb-6 border border-zinc-800 shadow-inner">
              {filter === 'running' ? '💤' : filter === 'archived' ? '📦' : '🚀'}
            </div>
            <h3 className="text-zinc-200 font-bold text-lg mb-1">
              {filter === 'running'
                ? 'Quiet Day'
                : filter === 'archived'
                ? 'Archive Empty'
                : 'No Sessions Yet'}
            </h3>
            <p className="text-zinc-500 text-sm max-w-[200px] mb-8">
              {filter === 'running'
                ? 'No active coding agents are running right now.'
                : filter === 'archived'
                ? 'Your archived sessions will appear here.'
                : 'Start a new session to begin orchestrating your agents.'}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => navigate('/sessions/new')}
                className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold rounded-xl border border-zinc-700 transition-all tap-feedback"
              >
                Create First Session
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 animate-slide-up">
            {filteredSessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                onRefresh={fetchSessions}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pull to refresh hint */}
      {!loading && filteredSessions.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 animate-pulse" />
          <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em]">Live Sync Active</span>
        </div>
      )}
    </div>
  )
}
