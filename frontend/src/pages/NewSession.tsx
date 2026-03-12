import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentProfile, RepoRoot } from '../types'
import { apiFetch } from '../hooks/useApi'

export function NewSession() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [agentProfileId, setAgentProfileId] = useState('')
  const [repoRootId, setRepoRootId] = useState('')
  const [workdir, setWorkdir] = useState('')
  const [startupPrompt, setStartupPrompt] = useState('')
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [repos, setRepos] = useState<RepoRoot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<{ agentProfiles: AgentProfile[] }>('/api/v1/agent-profiles'),
      apiFetch<{ repoRoots: RepoRoot[] }>('/api/v1/repo-roots'),
    ])
      .then(([profilesRes, reposRes]) => {
        setProfiles(profilesRes.agentProfiles)
        setRepos(reposRes.repoRoots)
        if (profilesRes.agentProfiles.length > 0) {
          setAgentProfileId(profilesRes.agentProfiles[0].id)
          // Set startup template if available
          const firstProfile = profilesRes.agentProfiles[0]
          if (firstProfile.startupTemplate) {
            setStartupPrompt(firstProfile.startupTemplate)
          }
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      })
      .finally(() => setLoadingData(false))
  }, [])

  // Update workdir when repo changes
  useEffect(() => {
    if (repoRootId) {
      const repo = repos.find(r => r.id === repoRootId)
      if (repo) setWorkdir(repo.absolutePath)
    } else {
      setWorkdir('')
    }
  }, [repoRootId, repos])

  // Update startup template when profile changes
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
      const body: Record<string, string> = {
        title,
        agentProfileId,
      }
      if (repoRootId) body.repoRootId = repoRootId
      if (workdir) body.workdir = workdir
      if (startupPrompt) body.startupPrompt = startupPrompt

      const res = await apiFetch<{ session: { publicId: string } }>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
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
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-xl font-bold text-gray-100 mb-6">New Session</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g., Fix auth bug"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Agent Profile <span className="text-red-400">*</span>
          </label>
          {profiles.length === 0 ? (
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-yellow-300 text-sm">
              No agent profiles configured.{' '}
              <button
                type="button"
                onClick={() => navigate('/profiles')}
                className="underline"
              >
                Create one first
              </button>
            </div>
          ) : (
            <select
              required
              value={agentProfileId}
              onChange={e => setAgentProfileId(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors min-h-[48px]"
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Repository (optional)
          </label>
          <select
            value={repoRootId}
            onChange={e => setRepoRootId(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors min-h-[48px]"
          >
            <option value="">None</option>
            {repos.map(r => (
              <option key={r.id} value={r.id}>{r.label} ({r.absolutePath})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Working Directory
          </label>
          <input
            type="text"
            value={workdir}
            onChange={e => setWorkdir(e.target.value)}
            placeholder="/path/to/project"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Startup Prompt (optional)
          </label>
          <textarea
            value={startupPrompt}
            onChange={e => setStartupPrompt(e.target.value)}
            placeholder="Initial instructions for the agent..."
            rows={4}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
          />
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg transition-colors min-h-[48px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || profiles.length === 0}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors min-h-[48px] flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              'Create Session'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
