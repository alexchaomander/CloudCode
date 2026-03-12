import { useState, useEffect, useCallback } from 'react'

export interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    credentials: 'include',
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = await response.json()
      message = body.error ?? body.message ?? message
    } catch {
      // ignore parse error
    }
    throw new Error(message)
  }

  const text = await response.text()
  if (!text) return undefined as unknown as T
  return JSON.parse(text) as T
}

export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(!!url)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => {
    setTick(t => t + 1)
  }, [])

  useEffect(() => {
    if (!url) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    apiFetch<T>(url)
      .then(result => {
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [url, tick])

  return { data, loading, error, refetch }
}

export { apiFetch }
