import { useState, useEffect, FormEvent } from 'react'
import { AgentProfile } from '../types'
import { apiFetch } from '../hooks/useApi'

type StopMethod = 'graceful' | 'kill' | 'tmux'

interface ProfileFormData {
  name: string
  slug: string
  command: string
  args: string[]
  env: Record<string, string>
  defaultWorkdir: string
  startupTemplate: string
  stopMethod: string
  supportsInteractiveInput: boolean
}

const defaultFormData: ProfileFormData = {
  name: '',
  slug: '',
  command: '',
  args: [],
  env: {},
  defaultWorkdir: '',
  startupTemplate: '',
  stopMethod: 'ctrl_c',
  supportsInteractiveInput: true,
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

interface ProfileFormProps {
  initial?: Partial<ProfileFormData>
  onSave: (data: ProfileFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
  error: string | null
}

function ProfileForm({ initial = {}, onSave, onCancel, saving, error }: ProfileFormProps) {
  const [form, setForm] = useState<ProfileFormData>({ ...defaultFormData, ...initial })
  const [argsText, setArgsText] = useState(JSON.stringify(initial.args || [], null, 2))
  const [envText, setEnvText] = useState(JSON.stringify(initial.env || {}, null, 2))

  const set = (key: keyof ProfileFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox'
      ? (e.target as HTMLInputElement).checked
      : e.target.value
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'name' && !initial.slug) {
      setForm(prev => ({ ...prev, name: e.target.value as string, slug: slugify(e.target.value as string) }))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try { 
      const args = JSON.parse(argsText)
      const env = JSON.parse(envText)
      await onSave({ ...form, args, env })
    } catch { 
      alert('JSON formatting error in Args or Env'); 
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Friendly Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={set('name')}
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
            placeholder="e.g. Claude Code"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Slug (URL friendly)</label>
          <input
            type="text"
            required
            value={form.slug}
            onChange={set('slug')}
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
            placeholder="claude-code"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Executable Command</label>
        <input
          type="text"
          required
          value={form.command}
          onChange={set('command')}
          className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
          placeholder="e.g. claude or /usr/bin/python3"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Arguments (JSON Array)</label>
          <textarea
            value={argsText}
            onChange={e => setArgsText(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono resize-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Default Workdir</label>
          <input
            type="text"
            value={form.defaultWorkdir}
            onChange={set('defaultWorkdir')}
            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
            placeholder="e.g. /home/user/projects"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Environment Variables (JSON Object)</label>
        <textarea
          value={envText}
          onChange={e => setEnvText(e.target.value)}
          rows={3}
          className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono resize-none"
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 ml-1">Startup Commands</label>
        <textarea
          value={form.startupTemplate}
          onChange={set('startupTemplate')}
          rows={2}
          className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
          placeholder="Automatically sent after session starts (e.g. /login\n)"
        />
      </div>

      <div className="flex items-center justify-between p-4 bg-zinc-950/50 border border-zinc-800 rounded-2xl">
        <div className="space-y-1">
          <label className="block text-[10px] font-bold text-zinc-100 uppercase tracking-widest">Interactive Mode</label>
          <p className="text-[10px] text-zinc-500">Enable if the CLI requires keyboard input.</p>
        </div>
        <input
          type="checkbox"
          checked={form.supportsInteractiveInput}
          onChange={set('supportsInteractiveInput')}
          className="w-5 h-5 rounded-lg border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500 transition-all"
        />
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-[10px] font-bold uppercase tracking-wider">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs uppercase tracking-widest transition-all tap-feedback border border-zinc-700/50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all tap-feedback shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </form>
  )
}

export function Profiles() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchProfiles = async () => {
    try {
      const data = await apiFetch<{ profiles: AgentProfile[] }>('/api/v1/profiles')
      setProfiles(data.profiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  const handleCreate = async (data: ProfileFormData) => {
    setSaving(true)
    setFormError(null)
    try {
      await apiFetch('/api/v1/profiles', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          defaultWorkdir: data.defaultWorkdir || null,
          startupTemplate: data.startupTemplate || null,
        }),
      })
      setShowForm(false)
      await fetchProfiles()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create profile')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (id: string, data: ProfileFormData) => {
    setSaving(true)
    setFormError(null)
    try {
      await apiFetch(`/api/v1/profiles/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...data,
          defaultWorkdir: data.defaultWorkdir || null,
          startupTemplate: data.startupTemplate || null,
        }),
      })
      setEditingId(null)
      await fetchProfiles()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete profile "${name}"? This cannot be undone.`)) return
    try {
      await apiFetch(`/api/v1/profiles/${id}`, { method: 'DELETE' })
      await fetchProfiles()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete profile')
    }
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Agent Profiles</h1>
          <p className="text-zinc-500 text-sm font-medium">Orchestrate your local tools</p>
        </div>
        {!showForm && !editingId && (
          <button
            onClick={() => { setShowForm(true); setFormError(null) }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200 tap-feedback"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm">Create</span>
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-zinc-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="font-bold text-zinc-100 tracking-tight">New Profile</h3>
          </div>
          <ProfileForm
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
            saving={saving}
            error={formError}
          />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Scanning profiles...</span>
        </div>
      ) : error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center">
          <p className="text-rose-400 text-sm font-bold tracking-tight">{error}</p>
        </div>
      ) : profiles.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in border-2 border-dashed border-zinc-800 rounded-3xl">
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center text-3xl mb-4 border border-zinc-800">🛠️</div>
          <h3 className="text-zinc-200 font-bold text-lg mb-1">No Profiles Yet</h3>
          <p className="text-zinc-500 text-sm max-w-[240px] mb-8">Define how CloudCode should launch your CLI agents.</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-8 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-xl transition-all tap-feedback"
          >
            Get Started
          </button>
        </div>
      ) : (
        <div className="grid gap-4 animate-slide-up">
          {profiles.map(profile => (
            <div key={profile.id}>
              {editingId === profile.id ? (
                <div className="bg-zinc-900 border border-indigo-500/50 rounded-3xl p-6 shadow-2xl">
                  <h3 className="font-bold text-zinc-100 mb-6 flex items-center gap-2">
                    <span className="text-indigo-400">Edit:</span> {profile.name}
                  </h3>
                  <ProfileForm
                    initial={{
                      name: profile.name,
                      slug: profile.slug,
                      command: profile.command,
                      args: profile.args,
                      env: profile.env,
                      defaultWorkdir: profile.defaultWorkdir ?? '',
                      startupTemplate: profile.startupTemplate ?? '',
                      stopMethod: profile.stopMethod,
                      supportsInteractiveInput: profile.supportsInteractiveInput,
                    }}
                    onSave={(data) => handleEdit(profile.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                    error={formError}
                  />
                </div>
              ) : (
                <div className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all duration-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-bold text-zinc-100 text-lg leading-tight tracking-tight">{profile.name}</h3>
                        <span className="text-[10px] text-zinc-500 font-mono bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded-full">{profile.slug}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-zinc-400 font-mono truncate bg-black/30 px-2 py-1 rounded border border-zinc-800/50">{profile.command}</p>
                        <div className="flex items-center gap-3 mt-1 ml-1">
                          <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            <span className="w-1 h-1 rounded-full bg-zinc-600" />
                            {profile.stopMethod} stop
                          </span>
                          {profile.supportsInteractiveInput && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                              <span className="w-1 h-1 rounded-full bg-indigo-500 animate-pulse" />
                              Interactive
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setEditingId(profile.id); setFormError(null) }}
                        className="flex items-center justify-center w-10 h-10 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-all tap-feedback border border-zinc-700/50"
                        title="Edit Profile"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 012.828 0L21 3m-2.122 2.122L11 12H9v3h3l7.879-7.879z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(profile.id, profile.name)}
                        className="flex items-center justify-center w-10 h-10 bg-rose-950/30 hover:bg-rose-900/40 text-rose-500 rounded-xl transition-all tap-feedback border border-rose-500/20"
                        title="Delete Profile"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
