import { useState, useEffect, FormEvent } from 'react'
import { AgentProfile } from '../types'
import { apiFetch } from '../hooks/useApi'

type StopMethod = 'graceful' | 'kill' | 'tmux'

interface ProfileFormData {
  name: string
  slug: string
  command: string
  argsJson: string
  envJson: string
  defaultWorkdir: string
  startupTemplate: string
  stopMethod: StopMethod
  supportsInteractiveInput: boolean
}

const defaultFormData: ProfileFormData = {
  name: '',
  slug: '',
  command: '',
  argsJson: '[]',
  envJson: '{}',
  defaultWorkdir: '',
  startupTemplate: '',
  stopMethod: 'graceful',
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

    // Validate JSON fields
    try { JSON.parse(form.argsJson) } catch { alert('Args JSON is invalid'); return }
    try { JSON.parse(form.envJson) } catch { alert('Env JSON is invalid'); return }

    await onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={set('name')}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="Claude Code"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Slug *</label>
          <input
            type="text"
            required
            value={form.slug}
            onChange={set('slug')}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
            placeholder="claude-code"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Command *</label>
        <input
          type="text"
          required
          value={form.command}
          onChange={set('command')}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
          placeholder="/usr/local/bin/claude"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Args (JSON array)</label>
        <input
          type="text"
          value={form.argsJson}
          onChange={set('argsJson')}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
          placeholder='["--no-update-check"]'
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Environment (JSON object)</label>
        <textarea
          value={form.envJson}
          onChange={set('envJson')}
          rows={2}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono resize-none"
          placeholder='{"ANTHROPIC_API_KEY": "sk-..."}'
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Default Working Directory</label>
        <input
          type="text"
          value={form.defaultWorkdir}
          onChange={set('defaultWorkdir')}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors font-mono"
          placeholder="/home/user"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">Startup Template</label>
        <textarea
          value={form.startupTemplate}
          onChange={set('startupTemplate')}
          rows={3}
          className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
          placeholder="Default startup prompt for new sessions..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">Stop Method</label>
          <select
            value={form.stopMethod}
            onChange={set('stopMethod')}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors min-h-[40px]"
          >
            <option value="graceful">Graceful</option>
            <option value="kill">Kill</option>
            <option value="tmux">Tmux</option>
          </select>
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.supportsInteractiveInput}
              onChange={set('supportsInteractiveInput')}
              className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-300">Interactive Input</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-lg transition-colors min-h-[44px]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors min-h-[44px] flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : 'Save'}
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
      const data = await apiFetch<{ agentProfiles: AgentProfile[] }>('/api/v1/agent-profiles')
      setProfiles(data.agentProfiles)
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
      await apiFetch('/api/v1/agent-profiles', {
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
      await apiFetch(`/api/v1/agent-profiles/${id}`, {
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
      await apiFetch(`/api/v1/agent-profiles/${id}`, { method: 'DELETE' })
      await fetchProfiles()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete profile')
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-100">Agent Profiles</h2>
        {!showForm && !editingId && (
          <button
            onClick={() => { setShowForm(true); setFormError(null) }}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg min-h-[44px] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">New Profile</h3>
          <ProfileForm
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
            saving={saving}
            error={formError}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-4 text-red-300 text-sm">{error}</div>
      ) : profiles.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-2">No agent profiles yet</p>
          <p className="text-gray-600 text-sm">Create a profile to configure how AI agents are launched</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map(profile => (
            <div key={profile.id}>
              {editingId === profile.id ? (
                <div className="bg-gray-800 border border-blue-700 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-200 mb-4">Edit: {profile.name}</h3>
                  <ProfileForm
                    initial={{
                      name: profile.name,
                      slug: profile.slug,
                      command: profile.command,
                      argsJson: profile.argsJson,
                      envJson: profile.envJson,
                      defaultWorkdir: profile.defaultWorkdir ?? '',
                      startupTemplate: profile.startupTemplate ?? '',
                      stopMethod: profile.stopMethod as StopMethod,
                      supportsInteractiveInput: profile.supportsInteractiveInput,
                    }}
                    onSave={(data) => handleEdit(profile.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                    error={formError}
                  />
                </div>
              ) : (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-100">{profile.name}</h3>
                        <span className="text-xs text-gray-500 font-mono bg-gray-700 px-1.5 py-0.5 rounded">{profile.slug}</span>
                      </div>
                      <p className="text-xs text-gray-400 font-mono truncate">{profile.command}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-gray-500">{profile.stopMethod}</span>
                        {profile.supportsInteractiveInput && (
                          <span className="text-xs text-blue-400">interactive</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setEditingId(profile.id); setFormError(null) }}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md min-h-[44px] transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(profile.id, profile.name)}
                        className="px-3 py-2 bg-red-900/50 hover:bg-red-900 text-red-400 text-xs rounded-md min-h-[44px] transition-colors"
                      >
                        Delete
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
