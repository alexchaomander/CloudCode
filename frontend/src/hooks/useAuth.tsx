import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { User } from '../types'
import { apiFetch } from './useApi'

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: User }>('/api/v1/auth/me')
      setUser(res.user)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

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

  const value: AuthState = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
    refetch: fetchMe,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
