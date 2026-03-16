import { useState, useEffect, useCallback } from 'react'
import type { AuditLog as AuditLogType } from '../types'
import { apiFetch } from '../hooks/useApi'

interface AuditResponse {
  entries: AuditLogType[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditLogType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<AuditResponse['pagination'] | null>(null)

  const fetchAuditLogs = useCallback(async (pageNum: number) => {
    setLoading(true)
    try {
      const data = await apiFetch<AuditResponse>(`/api/v1/audit?page=${pageNum}&limit=50`)
      setEntries(data.entries)
      setPagination(data.pagination)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAuditLogs(page)
  }, [page, fetchAuditLogs])

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="px-4 py-6 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">Audit Log</h1>
        <p className="text-zinc-500 text-sm font-medium">System activity and security tracking</p>
      </div>

      {error ? (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center">
          <p className="text-rose-400 text-sm font-bold tracking-tight">{error}</p>
        </div>
      ) : loading && entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Scanning Logs...</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-950 border-b border-zinc-800">
                    <th className="px-5 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Time</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Actor</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Event</th>
                    <th className="px-5 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {entries.map(entry => (
                    <tr key={entry.id} className="hover:bg-zinc-950/50 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {formatDate(entry.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                            {entry.actorUsername?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <span className="text-xs font-bold text-zinc-200">{entry.actorUsername || 'System'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                          entry.eventType.includes('error') || entry.eventType.includes('fail')
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : entry.eventType.includes('create') || entry.eventType.includes('login')
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        }`}>
                          {entry.eventType.replace(/\./g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1 min-w-[120px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{entry.targetType || '-'}</span>
                            {entry.targetId && (
                              <span className="text-[10px] font-mono text-zinc-500">#{entry.targetId.slice(0, 8)}</span>
                            )}
                          </div>
                          {entry.metadata && (
                            <div className="mt-1">
                              <pre className="text-[10px] text-zinc-500 font-mono bg-black/30 p-2 rounded border border-zinc-800/50 whitespace-pre-wrap break-all max-w-xs">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 disabled:opacity-30 hover:text-zinc-100 transition-all tap-feedback"
              >
                Previous
              </button>
              <div className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                Page {page} of {pagination.pages}
              </div>
              <button
                disabled={page === pagination.pages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 disabled:opacity-30 hover:text-zinc-100 transition-all tap-feedback"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
