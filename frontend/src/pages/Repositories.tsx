import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { RepoRoot } from '../types'
import { apiFetch } from '../hooks/useApi'

interface RepoFormData {
  label: string
  absolutePath: string
}

export function Repositories() {
  const navigate = useNavigate()
  const [repos, setRepos] = useState<RepoRoot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<RepoFormData>({ label: '', absolutePath: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const fetchRepos = async () => {
    try {
      const data = await apiFetch<{ repos: RepoRoot[] }>('/api/v1/repos')
      setRepos(data.repos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRepos()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const res = await apiFetch<{ repo: RepoRoot }>('/api/v1/repos', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setForm({ label: '', absolutePath: '' })
      setShowForm(false)
      setJustAdded(res.repo.label)
      await fetchRepos()
      
      // Clear success message after 5 seconds
      setTimeout(() => setJustAdded(null), 5000)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add repository')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Remove "${label}" from your repository roots?`)) return
    try {
      await apiFetch(`/api/v1/repos/${id}`, { method: 'DELETE' })
      await fetchRepos()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const handleLaunch = (repo: RepoRoot) => {
    // Navigate to new session with repo search pre-filled
    navigate(`/sessions/new?rootId=${repo.id}&label=${encodeURIComponent(repo.label)}`)
  }

  return (
    <div className="px-4 py-6 space-y-8 animate-fade-in pb-20">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Workspace Roots</h1>
          <p className="text-zinc-500 text-sm font-medium">Folders accessible to your AI agents</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setJustAdded(null) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 tap-feedback"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm">Add Root</span>
          </button>
        )}
      </div>

      {justAdded && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex items-center justify-between animate-slide-up shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-emerald-400 font-bold text-sm">Workspace Added!</p>
              <p className="text-emerald-400/70 text-[10px] uppercase tracking-widest font-black">"{justAdded}" is now ready</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/sessions/new')}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all tap-feedback shadow-md"
          >
            Launch Session
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-zinc-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl animate-slide-up relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="font-bold text-zinc-100 tracking-tight">Define Workspace Root</h3>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Friendly Label</label>
              <input
                type="text"
                required
                autoFocus
                value={form.label}
                onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="e.g. My Projects"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all shadow-inner"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Absolute System Path</label>
              <input
                type="text"
                required
                value={form.absolutePath}
                onChange={e => setForm(prev => ({ ...prev, absolutePath: e.target.value }))}
                placeholder="/Users/alex/projects"
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono shadow-inner"
              />
              <p className="mt-2 ml-1 text-[10px] text-zinc-600 italic">CloudCode will discover all sub-folders within this path.</p>
            </div>

            {formError && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
                {formError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs uppercase tracking-widest transition-all tap-feedback border border-zinc-700/50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all tap-feedback shadow-lg shadow-indigo-600/20"
              >
                {saving ? 'Adding...' : 'Add Workspace'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Scanning Filesystem...</span>
        </div>
      ) : repos.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in border-2 border-dashed border-zinc-800 rounded-3xl">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center text-3xl mb-4 border border-zinc-800 shadow-inner">📂</div>
          <h3 className="text-zinc-200 font-bold text-lg mb-1">No Workspace Roots</h3>
          <p className="text-zinc-500 text-sm max-w-[240px] mb-8 leading-relaxed">Add a folder from your computer to allow coding agents to access your code.</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl transition-all tap-feedback shadow-xl"
          >
            Add First Root
          </button>
        </div>
      ) : (
        <div className="grid gap-4 animate-slide-up">
          {repos.map(repo => (
            <div key={repo.id} className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all duration-200 relative overflow-hidden">
              <div className="flex items-start justify-between gap-4 relative z-10">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-zinc-100 text-lg leading-tight tracking-tight mb-1">{repo.label}</h3>
                  <p className="text-xs text-zinc-500 font-mono truncate bg-black/30 px-2 py-1 rounded border border-zinc-800/50">{repo.absolutePath}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLaunch(repo)}
                    className="flex items-center justify-center px-4 h-10 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl transition-all tap-feedback border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest"
                  >
                    Launch
                  </button>
                  <button
                    onClick={() => handleDelete(repo.id, repo.label)}
                    className="flex items-center justify-center w-10 h-10 bg-rose-950/30 hover:bg-rose-900/40 text-rose-500 rounded-xl transition-all tap-feedback border border-rose-500/20"
                    title="Remove Root"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
