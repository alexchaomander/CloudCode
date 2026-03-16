import { useState, useEffect, FormEvent, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AgentProfile, RepoRoot, DiscoveredProject } from '../types'
import { apiFetch } from '../hooks/useApi'

interface RecentData {
  recent: any[]
  agents: Array<{ id: string; name: string }>
  paths: string[]
}

export function NewSession() {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [activeTab, setActiveTab] = useState<'standard' | 'mirror'>('standard')
  const [mirrorSessions, setMirrorSessions] = useState<Array<{ name: string; created: string }>>([])
  
  // Parse URL parameters
  const queryParams = new URLSearchParams(location.search)
  const initialRootId = queryParams.get('rootId') || ''
  const initialLabel = queryParams.get('label') || ''

  const [title, setTitle] = useState('')
  const [agentProfileId, setAgentProfileId] = useState('')
  const [repoRootId, setRepoRootId] = useState(initialRootId)
  const [workdir, setWorkdir] = useState('')
  const [startupPrompt, setStartupPrompt] = useState('')
  
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [repos, setRepos] = useState<RepoRoot[]>([])
  const [projects, setProjects] = useState<DiscoveredProject[]>([])
  const [recentAgents, setRecentAgents] = useState<RecentData['agents']>([])
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  
  const [selectedProjectId, setSelectedProjectId] = useState(initialRootId ? `root:${initialRootId}` : '')
  const [projectSearch, setProjectSearch] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<{ profiles: AgentProfile[] }>('/api/v1/profiles'),
      apiFetch<{ repos: RepoRoot[] }>('/api/v1/repos'),
      apiFetch<{ projects: DiscoveredProject[] }>('/api/v1/repos/discover'),
      apiFetch<RecentData>('/api/v1/sessions/recent'),
      apiFetch<Array<{ name: string; created: string }>>('/api/v1/terminal/tmux-sessions'),
    ])
      .then(([profilesRes, reposRes, projectsRes, recentRes, mirrorRes]) => {
        setProfiles(profilesRes.profiles)
        setRepos(reposRes.repos)
        setProjects(projectsRes.projects)
        setRecentAgents(recentRes.agents)
        setRecentPaths(recentRes.paths)
        setMirrorSessions(mirrorRes)
        
        // Auto-select root path if passed via URL
        if (initialRootId) {
          const repo = reposRes.repos.find(r => r.id === initialRootId)
          if (repo) {
            setWorkdir(repo.absolutePath)
            if (!title) setTitle(`Work on ${repo.label}`)
          }
        }

        if (profilesRes.profiles.length > 0) {
          setAgentProfileId(profilesRes.profiles[0].id)
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      })
      .finally(() => setLoadingData(false))
  }, [initialRootId, initialLabel])

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects.slice(0, 15)
    const q = projectSearch.toLowerCase()
    return projects.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.rootLabel.toLowerCase().includes(q) ||
      p.gitInfo?.branch.toLowerCase().includes(q)
    )
  }, [projects, projectSearch])

  const handleProjectSelect = (project: DiscoveredProject) => {
    setSelectedProjectId(`${project.rootId}:${project.name}`)
    setWorkdir(project.absolutePath)
    setRepoRootId(project.rootId)
    if (!title) {
      setTitle(`Work on ${project.name}`)
    }
    setProjectSearch('')
    setIsSearchFocused(false)
  }

  const handlePathSelect = (path: string) => {
    setWorkdir(path)
    setSelectedProjectId('custom')
    setProjectSearch('')
    setIsSearchFocused(false)
    if (!title) {
      const name = path.split('/').pop() || 'Project'
      setTitle(`Work on ${name}`)
    }
  }

  useEffect(() => {
    if (agentProfileId) {
      const profile = profiles.find(p => p.id === agentProfileId)
      if (profile?.startupTemplate) {
        setStartupPrompt(profile.startupTemplate)
      }
    }
  }, [agentProfileId, profiles])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await apiFetch<{ session: { publicId: string } }>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title,
          agentProfileId,
          repoRootId: repoRootId || null,
          workdir: workdir || null,
          startupPrompt: startupPrompt || null,
        }),
      })

      navigate(`/sessions/${res.session.publicId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Preparing Workspace...</span>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">New Session</h1>
          <p className="text-zinc-500 text-sm font-medium">Configure your workspace</p>
        </div>
        
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button 
            type="button"
            onClick={() => setActiveTab('standard')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'standard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Agent
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('mirror')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'mirror' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Mirror
          </button>
        </div>
      </div>

      {activeTab === 'mirror' ? (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-xl">📡</div>
              <div>
                <h3 className="text-indigo-400 font-bold">Mirror Mode</h3>
                <p className="text-indigo-400/70 text-xs leading-relaxed">
                  Attach to an existing tmux session on your machine to control it remotely.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {mirrorSessions.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-3">
                <div className="text-4xl opacity-20">📭</div>
                <p className="text-zinc-500 text-sm font-medium italic">No active tmux sessions found.</p>
                <p className="text-zinc-600 text-[10px] uppercase tracking-widest">Start a session in your local terminal first</p>
              </div>
            ) : (
              mirrorSessions.map(s => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => navigate(`/sessions/mirror/${s.name}`)}
                  className="w-full bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 p-5 rounded-2xl text-left flex items-center justify-between group transition-all tap-feedback"
                >
                  <div className="space-y-1">
                    <h4 className="text-zinc-100 font-bold group-hover:text-indigo-400 transition-colors">{s.name}</h4>
                    <p className="text-zinc-500 text-[10px] font-mono">Created: {new Date(parseInt(s.created) * 1000).toLocaleString()}</p>
                  </div>
                  <div className="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center text-zinc-600 group-hover:text-indigo-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
          {repos.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex flex-col items-center text-center gap-4 animate-slide-up shadow-xl">
          <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center text-2xl">
            ⚠️
          </div>
          <div className="space-y-1">
            <h3 className="text-amber-400 font-bold">No Workspace Roots Configured</h3>
            <p className="text-amber-400/70 text-xs leading-relaxed max-w-xs">
              For security, coding agents can only run inside folders you have explicitly allowed.
            </p>
          </div>
          <button
            onClick={() => navigate('/repositories')}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all tap-feedback shadow-lg"
          >
            Add a Workspace Root
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Identity */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-400 border border-zinc-700">1</div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Session Identity</h3>
          </div>
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Session Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Bug Bash or Feature Implementation"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1 flex justify-between">
                <span>Agent Profile</span>
                {recentAgents.length > 0 && <span className="text-indigo-500/50">Recent</span>}
              </label>
              
              {recentAgents.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {recentAgents.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAgentProfileId(a.id)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                        agentProfileId === a.id
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                          : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}

              <select
                required
                value={agentProfileId}
                onChange={e => setAgentProfileId(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-indigo-500/50 transition-all appearance-none"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Step 2: Location */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-400 border border-zinc-700">2</div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Working Directory</h3>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl relative">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Select Workspace</label>
              <div className="relative">
                <input
                  type="text"
                  value={projectSearch}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={e => {
                    setProjectSearch(e.target.value)
                    setSelectedProjectId('')
                  }}
                  placeholder={projects.length > 0 ? `Search ${projects.length} discovered projects...` : "Type to search..."}
                  className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-indigo-500/50 transition-all pl-10 shadow-inner"
                />
                <svg className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                
                {isSearchFocused && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsSearchFocused(false)} />
                    <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-1 animate-slide-up scrollbar-none ring-1 ring-black/50">
                      {filteredProjects.length === 0 && projectSearch && (
                        <div className="p-6 text-center text-zinc-500 text-xs italic">No matching projects found</div>
                      )}
                      
                      {projects.length === 0 && !projectSearch && (
                        <div className="p-6 text-center text-zinc-500 space-y-3">
                          <p className="text-xs italic leading-relaxed">No folders have been discovered yet.</p>
                          <button 
                            type="button"
                            onClick={() => navigate('/repositories')}
                            className="text-[10px] font-black text-indigo-500 uppercase tracking-widest border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors"
                          >
                            Configure Roots
                          </button>
                        </div>
                      )}

                      {filteredProjects.length > 0 && (
                        <>
                          <div className="px-3 py-2 text-[9px] font-black text-zinc-600 uppercase tracking-widest">
                            {projectSearch ? 'Search Results' : 'Suggested Workspaces'}
                          </div>
                          {filteredProjects.map(p => (
                            <button
                              key={`${p.rootId}:${p.name}`}
                              type="button"
                              onClick={() => handleProjectSelect(p)}
                              className="w-full text-left p-3 hover:bg-indigo-600 rounded-xl transition-colors group flex items-center justify-between"
                            >
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-zinc-100 group-hover:text-white truncate">{p.name}</span>
                                  {p.isRoot && (
                                    <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-emerald-500/30">Root</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-zinc-500 group-hover:text-indigo-200 truncate">{p.rootLabel}</span>
                              </div>
                              {p.gitInfo && (
                                <div className="flex items-center gap-1.5 bg-zinc-950/50 group-hover:bg-white/10 px-2 py-1 rounded-lg text-[9px] font-mono text-zinc-400 group-hover:text-white flex-shrink-0 ml-2 border border-zinc-800 group-hover:border-transparent">
                                  {p.gitInfo.branch}
                                  {p.gitInfo.isDirty && <span className="text-amber-500 text-[12px] leading-[0]">●</span>}
                                </div>
                              )}
                            </button>
                          ))}
                        </>
                      )}

                      {recentPaths.length > 0 && !projectSearch && (
                        <>
                          <div className="px-3 py-2 text-[9px] font-black text-zinc-600 uppercase tracking-widest border-t border-zinc-800 mt-1">Recently Used Paths</div>
                          {recentPaths.map((path, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handlePathSelect(path)}
                              className="w-full text-left p-3 hover:bg-zinc-800 rounded-xl transition-colors group flex items-center justify-between"
                            >
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-bold text-zinc-300 group-hover:text-white truncate">{path.split('/').pop()}</span>
                                <span className="text-[10px] text-zinc-600 group-hover:text-zinc-400 truncate font-mono">{path}</span>
                              </div>
                            </button>
                          ))}
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => { handlePathSelect(workdir); setSelectedProjectId('custom') }}
                        className="w-full text-left p-3 hover:bg-zinc-800 rounded-xl transition-colors group flex items-center gap-3 border-t border-zinc-800 mt-1"
                      >
                        <div className="w-6 h-6 bg-zinc-800 rounded-lg flex items-center justify-center text-xs">⌨️</div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Enter Manual Path</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {selectedProjectId ? (
              <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between animate-fade-in shadow-inner">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Selected Workspace</span>
                    <div className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" />
                  </div>
                  <p className="text-base font-bold text-zinc-100 truncate tracking-tight">{workdir.split('/').pop()}</p>
                  <p className="text-[10px] text-zinc-500 font-mono truncate">{workdir}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedProjectId(''); setProjectSearch(''); setIsSearchFocused(true) }}
                  className="px-3 py-2 bg-zinc-950/50 hover:bg-zinc-950 text-[10px] font-bold text-zinc-400 hover:text-zinc-100 uppercase tracking-widest rounded-xl border border-zinc-800 transition-all tap-feedback"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="animate-slide-up space-y-4 pt-2">
                <div className="h-px bg-zinc-800 w-1/3 mx-auto" />
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Exact System Path</label>
                  <input
                    type="text"
                    value={workdir}
                    onChange={e => setWorkdir(e.target.value)}
                    placeholder="/absolute/path/to/folder"
                    className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-indigo-500/50 transition-all font-mono text-sm"
                  />
                  <p className="mt-2 ml-1 text-[10px] text-zinc-600 italic leading-relaxed">
                    CloudCode securely expands paths starting with <code className="text-zinc-300">~</code> to your home directory.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 3: Instructions */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 bg-zinc-800 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-400 border border-zinc-700">3</div>
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Initial Context</h3>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl">
            <textarea
              value={startupPrompt}
              onChange={e => setStartupPrompt(e.target.value)}
              placeholder="Instructions to send automatically when the session starts..."
              rows={4}
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-all resize-none text-sm leading-relaxed"
            />
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-rose-400 text-xs font-bold flex items-center gap-3 animate-shake shadow-lg">
            <div className="w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-500/20">!</div>
            {error}
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-2xl text-xs uppercase tracking-widest transition-all tap-feedback border border-zinc-700/50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || profiles.length === 0}
            className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all tap-feedback flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {submitting ? (
              <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Launch Session</span>
              </>
            )}
          </button>
        </div>
      </form>
        </>
      )}
    </div>
  )
}
