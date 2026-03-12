import { useState, useEffect, useCallback } from 'react'
import { AuditLog as AuditLogEntry } from '../types'
import { apiFetch } from '../hooks/useApi'

const REFRESH_INTERVAL_MS = 30_000
const PAGE_SIZE = 50

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function eventTypeColor(eventType: string): string {
  if (eventType.includes('delete') || eventType.includes('kill') || eventType.includes('error')) {
    return 'text-red-400'
  }
  if (eventType.includes('create') || eventType.includes('start')) {
    return 'text-green-400'
  }
  if (eventType.includes('update') || eventType.includes('login') || eventType.includes('stop')) {
    return 'text-yellow-400'
  }
  return 'text-blue-400'
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const fetchEntries = useCallback(async (reset = false) => {
    const currentPage = reset ? 1 : page
    if (!reset) setLoadingMore(true)
    else setLoading(true)

    try {
      const data = await apiFetch<{ entries: AuditLogEntry[]; pagination: { pages: number } }>(
        `/api/v1/audit?limit=${PAGE_SIZE}&page=${currentPage}`
      )
      const newEntries = data.entries
      if (reset) {
        setEntries(newEntries)
        setPage(2)
      } else {
        setEntries(prev => [...prev, ...newEntries])
        setPage(prev => prev + 1)
      }
      setHasMore(newEntries.length === PAGE_SIZE)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [page])

  useEffect(() => {
    fetchEntries(true)
    const interval = setInterval(() => fetchEntries(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLoadMore = () => {
    fetchEntries(false)
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-100">Audit Log</h2>
        <button
          onClick={() => fetchEntries(true)}
          className="p-2 text-gray-400 hover:text-gray-200 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
          title="Refresh"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-4 text-red-300 text-sm">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No audit events yet</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-mono font-semibold ${eventTypeColor(entry.eventType)}`}>
                        {entry.eventType}
                      </span>
                      {entry.targetType && (
                        <span className="text-xs text-gray-400 font-mono">
                          {entry.targetType}
                          {entry.targetId && (
                            <span className="text-gray-600">:{entry.targetId.slice(0, 8)}</span>
                          )}
                        </span>
                      )}
                    </div>
                    {entry.actorUserId && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        by <span className="text-gray-400 font-mono">{entry.actorUserId.slice(0, 8)}</span>
                      </p>
                    )}
                    {entry.metadataJson && entry.metadataJson !== 'null' && (
                      <details className="mt-1">
                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">metadata</summary>
                        <pre className="text-xs text-gray-500 mt-1 font-mono whitespace-pre-wrap break-all">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(entry.metadataJson!), null, 2)
                            } catch {
                              return entry.metadataJson
                            }
                          })()}
                        </pre>
                      </details>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
                    {formatTime(entry.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full mt-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded-lg min-h-[48px] transition-colors flex items-center justify-center gap-2"
            >
              {loadingMore ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Loading...
                </>
              ) : 'Load More'}
            </button>
          )}

          <p className="text-center text-xs text-gray-600 mt-4">
            Auto-refreshes every 30s · Showing {entries.length} events
          </p>
        </>
      )}
    </div>
  )
}
