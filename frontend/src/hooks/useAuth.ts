import { useState, useEffect, useCallback } from 'react'
import { User } from '../types'
import { apiFetch } from './useApi'

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    apiFetch<{ user: User }>('/api/v1/auth/me')
      .then(res => {
        if (!cancelled) {
          setUser(res.user)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch<{ user: User }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  return {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
  }
}
