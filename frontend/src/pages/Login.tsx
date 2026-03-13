import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { apiFetch } from '../hooks/useApi'

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true })
      return
    }

    if (!isLoading && !isAuthenticated) {
      apiFetch<{ needsBootstrap: boolean }>('/api/v1/auth/bootstrap-status')
        .then(res => {
          if (res.needsBootstrap) {
            navigate('/bootstrap', { replace: true })
          }
        })
        .catch(() => {})
    }
  }, [isLoading, isAuthenticated, navigate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4 selection:bg-indigo-500/30">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-2xl shadow-indigo-600/20 mb-6 rotate-3 hover:rotate-0 transition-transform duration-300">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l3 3-3 3m5 0h3" />
            </svg>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2 italic">CloudCode</h1>
          <p className="text-zinc-500 font-medium tracking-tight">Your terminal, everywhere.</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl shadow-black/50 relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
          
          <form onSubmit={handleSubmit} className="space-y-6 relative">
            <div>
              <label htmlFor="username" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">
                Username
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
                placeholder="Enter username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-5 py-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-xs font-bold flex items-center gap-2 animate-shake">
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
                  <span className="uppercase tracking-widest text-[10px]">Verifying...</span>
                </>
              ) : (
                <>
                  <span className="uppercase tracking-widest text-[10px]">Sign In</span>
                  <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>
        
        <p className="mt-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-[0.2em]">
          Mobile First · Self Hosted · Secure
        </p>
      </div>
    </div>
  )
}
