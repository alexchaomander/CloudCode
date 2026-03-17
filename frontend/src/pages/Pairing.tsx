import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { useAuthContext } from '../hooks/useAuth'

export function Pairing() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const next = searchParams.get('next')
  const navigate = useNavigate()
  const { refetch: refetchAuth } = useAuthContext()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating')

  useEffect(() => {
    if (!token) {
      setError('No pairing token provided.')
      setStatus('error')
      return
    }

    const performPairing = async () => {
      try {
        await apiFetch('/api/v1/auth/pair', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
        
        setStatus('success')
        // Refresh auth state before navigating
        await refetchAuth()
        
        // Brief delay for visual feedback
        setTimeout(() => {
          navigate(next || '/', { replace: true })
        }, 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pairing failed')
        setStatus('error')
      }
    }

    performPairing()
  }, [token, navigate, refetchAuth])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm">
        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-5.19 4.593-9.362 9.754-10.335" />
            </svg>
          </div>
        </div>

        {status === 'validating' && (
          <>
            <h1 className="text-2xl font-bold text-white mb-2">Pairing Device...</h1>
            <p className="text-zinc-400 mb-6">Authenticating your remote control session.</p>
            <div className="flex justify-center">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Success!</h1>
            <p className="text-zinc-400">Your device is now paired. Redirecting to dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Pairing Failed</h1>
            <p className="text-red-400/80 mb-6">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  )
}
