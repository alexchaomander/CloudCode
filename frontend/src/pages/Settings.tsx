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

  const updateSetting = (key: string, value: string) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-4">
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-4 text-red-300 text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <h2 className="text-xl font-bold text-gray-100 mb-6">Settings</h2>

      {settings && Object.keys(settings).length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-8 text-center">
          <p className="text-gray-400 text-sm">No configurable settings available</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg divide-y divide-gray-700">
            {settings && Object.entries(localSettings).map(([key, value]) => (
              <div key={key} className="px-4 py-4">
                <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wide">
                  {key.replace(/_/g, ' ')}
                </label>
                {typeof value === 'boolean' ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={e => updateSetting(key, String(e.target.checked))}
                      className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300">{value ? 'Enabled' : 'Disabled'}</span>
                  </label>
                ) : (
                  <input
                    type="text"
                    value={String(value ?? '')}
                    onChange={e => updateSetting(key, e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  />
                )}
              </div>
            ))}
          </div>

          {saveMessage && (
            <div className={`px-4 py-3 rounded-lg border text-sm ${
              saveMessage.includes('!')
                ? 'bg-green-900/30 border-green-700 text-green-300'
                : 'bg-red-900/30 border-red-700 text-red-300'
            }`}>
              {saveMessage}
            </div>
          )}

          {settings && Object.keys(settings).length > 0 && (
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-semibold rounded-lg min-h-[48px] transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : 'Save Settings'}
            </button>
          )}
        </form>
      )}

      {/* App info section */}
      <div className="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">About</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Application</span>
            <span className="text-gray-200">CloudCode</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Version</span>
            <span className="text-gray-200 font-mono">1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
