import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Session, AgentProfile } from '../types'
import { SessionCard } from '../components/SessionCard'
import { apiFetch } from '../hooks/useApi'

interface RecentCombination {
  agentProfileId: string
  workdir: string
  title: string
  agentName: string
}

export function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [recent, setRecent] = useState<RecentCombination[]>([])
  const [hasRepos, setHasRepos] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'running' | 'archived'>('all')
  const [isLaunchingRecent, setIsLaunchingRecent] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchSessions = useCallback(async () => {
    try {
      const [sessionsData, profilesData, recentData, reposData] = await Promise.all([
        apiFetch<{ sessions: Session[] }>('/api/v1/sessions'),
        apiFetch<{ profiles: AgentProfile[] }>('/api/v1/profiles'),
        apiFetch<{ recent: RecentCombination[] }>('/api/v1/sessions/recent'),
        apiFetch<{ repos: any[] }>('/api/v1/repos')
      ])
      setSessions(sessionsData.sessions)
      setProfiles(profilesData.profiles)
      setRecent(recentData.recent)
      setHasRepos(reposData.repos.length > 0)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    const interval = setInterval(fetchSessions, 10000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const handleLaunchRecent = async (r: RecentCombination) => {
    const key = `${r.agentProfileId}:${r.workdir}`
    setIsLaunchingRecent(key)
    try {
      const res = await apiFetch<{ session: { publicId: string } }>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: r.title,
          agentProfileId: r.agentProfileId,
          workdir: r.workdir
        })
      })
      navigate(`/sessions/${res.session.publicId}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Launch failed')
    } finally {
      setIsLaunchingRecent(null)
    }
  }

  const filteredSessions = sessions.filter(s => {
    if (filter === 'archived') return s.archived
    if (filter === 'running') return s.status === 'running' || s.status === 'starting'
    return !s.archived
  })

  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {}
    filteredSessions.forEach(s => {
      const projectName = s.workdir?.split('/').pop() || 'Uncategorized'
      if (!groups[projectName]) groups[projectName] = []
      groups[projectName].push(s)
    })
    return groups
  }, [filteredSessions])

  const tabs: Array<{ id: typeof filter; label: string }> = [
    { id: 'all', label: 'Active' },
    { id: 'running', label: 'Running' },
    { id: 'archived', label: 'Archived' },
  ]

  const runningSessions = sessions.filter(s => s.status === 'running' || s.status === 'starting')

  // Onboarding Checklist logic
  const onboardingSteps = [
    { id: 'admin', label: 'Administrator Created', done: true },
    { id: 'agent', label: 'Agent Profile Defined', done: profiles.length > 0 },
    { id: 'repo', label: 'Workspace Root Added', done: hasRepos },
    { id: 'session', label: 'First Session Launched', done: sessions.length > 0 },
  ]
  const isFullyOnboarded = onboardingSteps.every(s => s.done)

  if (loading && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Waking up agents...</span>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8 pb-20">
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
          <span className="text-sm">New</span>
        </button>
      </div>

      {/* Onboarding Checklist (Only for new users) */}
      {!isFullyOnboarded && sessions.length === 0 && (
        <div className="bg-indigo-600/5 border border-indigo-500/20 rounded-3xl p-6 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Getting Started</h3>
            <span className="text-[10px] font-bold text-indigo-500/50 uppercase">
              {onboardingSteps.filter(s => s.done).length} / {onboardingSteps.length}
            </span>
          </div>
          <div className="space-y-2">
            {onboardingSteps.map(step => (
              <div key={step.id} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                  step.done ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500' : 'bg-zinc-900 border-zinc-800 text-zinc-700'
                }`}>
                  {step.done ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-1 h-1 rounded-full bg-current" />
                  )}
                </div>
                <span className={`text-sm font-medium ${step.done ? 'text-zinc-400' : 'text-zinc-100'}`}>
                  {step.label}
                </span>
                {!step.done && step.id === 'agent' && (
                  <button onClick={() => navigate('/profiles')} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 uppercase ml-auto">Define Agents</button>
                )}
                {!step.done && step.id === 'repo' && onboardingSteps[1].done && (
                  <button onClick={() => navigate('/repositories')} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 uppercase ml-auto">Add Root</button>
                )}
                {!step.done && step.id === 'session' && onboardingSteps[2].done && (
                  <button onClick={() => navigate('/sessions/new')} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-400 uppercase ml-auto">Launch</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Smart Recents / Quick Start */}
      {recent.length > 0 && filter === 'all' && (
        <div className="space-y-3 animate-fade-in">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Quick Start</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recent.map((r, i) => {
              const key = `${r.agentProfileId}:${r.workdir}`
              const isLaunching = isLaunchingRecent === key
              return (
                <button
                  key={i}
                  disabled={!!isLaunchingRecent}
                  onClick={() => handleLaunchRecent(r)}
                  className="flex flex-col text-left p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all tap-feedback group"
                >
                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1 truncate">
                    {r.agentName}
                  </span>
                  <span className="text-sm font-bold text-zinc-100 truncate mb-2 group-hover:text-indigo-300">
                    {r.workdir.split('/').pop()}
                  </span>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600 font-medium truncate max-w-[80px]">
                      {isLaunching ? 'Launching...' : 'Resume Work'}
                    </span>
                    {isLaunching ? (
                      <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3 text-zinc-700 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
        {error ? (
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
          <div className="space-y-10 animate-slide-up">
            {Object.entries(groupedSessions).map(([projectName, groupSessions]) => (
              <div key={projectName} className="space-y-4">
                <div className="flex items-center gap-3 px-1">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] whitespace-nowrap">
                    {projectName}
                  </h2>
                  <div className="h-px w-full bg-zinc-800/50" />
                </div>
                <div className="grid gap-4">
                  {groupSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onRefresh={fetchSessions}
                    />
                  ))}
                </div>
              </div>
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
