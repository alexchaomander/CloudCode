import { useState, useEffect, FormEvent } from 'react'
import { apiFetch } from '../hooks/useApi'

interface AppSettings {
  [key: string]: string | number | boolean | null
}

export function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [localSettings, setLocalSettings] = useState<AppSettings>({})

  useEffect(() => {
    apiFetch<{ settings: AppSettings }>('/api/v1/settings')
      .then(res => {
        setSettings(res.settings)
        setLocalSettings(res.settings)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load settings')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    try {
      await apiFetch('/api/v1/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: localSettings }),
      })
      setSaveMessage('Settings saved successfully!')
      setSettings({ ...localSettings })
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Loading Preferences...</span>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Settings</h1>
        <p className="text-zinc-500 text-sm font-medium">Application configuration</p>
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center">
          <p className="text-rose-400 text-sm font-bold tracking-tight">{error}</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            {settings && Object.keys(settings).length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-zinc-500 text-sm italic">No configurable settings found.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {settings && Object.entries(localSettings).map(([key, value]) => (
                  <div key={key} className="p-5 flex flex-col gap-2 hover:bg-zinc-950/30 transition-colors">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      {key.replace(/_/g, ' ')}
                    </label>
                    {typeof value === 'boolean' ? (
                      <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                        <span className="text-sm text-zinc-300 font-medium">{value ? 'Enabled' : 'Disabled'}</span>
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={e => updateSetting(key, e.target.checked)}
                          className="w-5 h-5 rounded-lg border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={String(value ?? '')}
                        onChange={e => updateSetting(key, e.target.value)}
                        className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {saveMessage && (
            <div className={`px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest border animate-slide-up ${
              saveMessage.includes('!')
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
              {saveMessage}
            </div>
          )}

          {settings && Object.keys(settings).length > 0 && (
            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all tap-feedback flex items-center justify-center gap-2"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </form>
      )}

      {/* App info section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">System Information</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-zinc-950 px-4 py-3 rounded-xl border border-zinc-800">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Application</span>
            <span className="text-sm text-zinc-100 font-bold tracking-tight">CloudCode Core</span>
          </div>
          <div className="flex justify-between items-center bg-zinc-950 px-4 py-3 rounded-xl border border-zinc-800">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Version</span>
            <span className="text-xs text-indigo-400 font-mono font-bold">v1.0.0-stable</span>
          </div>
        </div>
      </div>
    </div>
  )
}
