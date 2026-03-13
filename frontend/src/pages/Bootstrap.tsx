import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { useAuth } from '../hooks/useAuth'

export function Bootstrap() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Fetch suggested username from backend
    apiFetch<{ suggestedUsername: string }>('/api/v1/auth/bootstrap-status')
      .then(res => {
        if (res.suggestedUsername) {
          setUsername(res.suggestedUsername)
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/api/v1/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      
      // Auto-login after bootstrap
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 selection:bg-indigo-500/30">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-2xl shadow-indigo-600/20 mb-6 scale-110">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter mb-2 italic">Welcome to CloudCode</h1>
          <p className="text-zinc-500 font-medium tracking-tight">Create your initial administrator account.</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl shadow-black/50 relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
          
          <form onSubmit={handleSubmit} className="space-y-6 relative">
            <div>
              <label htmlFor="username" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">
                Admin Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200"
                placeholder="e.g. admin"
              />
              <p className="mt-2 ml-1 text-[10px] text-zinc-500 italic">Pre-filled with your computer username.</p>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">
                Set Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200"
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200"
                placeholder="Repeat password"
              />
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-xs font-bold flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:bg-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all duration-200 flex items-center justify-center gap-2 group"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="uppercase tracking-widest text-[10px]">Initializing...</span>
                </>
              ) : (
                <>
                  <span className="uppercase tracking-widest text-[10px]">Complete Setup</span>
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="mt-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-[0.2em]">
          Self-Hosted Security · Private by Design
        </p>
      </div>
    </div>
  )
}
