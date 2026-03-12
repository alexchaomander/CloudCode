import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Session, SessionSnapshot } from '../types'
import { Terminal } from '../components/Terminal'
import { apiFetch } from '../hooks/useApi'

type Tab = 'terminal' | 'snapshots' | 'info'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleString()
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-gray-700 last:border-0">
      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-200 font-mono break-all">{value}</span>
    </div>
  )
}

function StatusDot({ status }: { status: Session['status'] }) {
  const color =
    status === 'running' ? 'bg-green-400' :
    status === 'starting' ? 'bg-yellow-400' :
    status === 'error' ? 'bg-red-400' :
    'bg-gray-500'
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color} ${status === 'running' ? 'animate-pulse' : ''}`} />
  )
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('terminal')
  const [session, setSession] = useState<Session | null>(null)
  const [snapshots, setSnapshots] = useState<SessionSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capturingSnapshot, setCapturingSnapshot] = useState(false)
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSession = useCallback(async () => {
    if (!id) return
    try {
      const data = await apiFetch<{ session: Session }>(`/api/v1/sessions/${id}`)
      setSession(data.session)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [id])

  const fetchSnapshots = useCallback(async () => {
    if (!id) return
    try {
      const data = await apiFetch<{ snapshots: SessionSnapshot[] }>(`/api/v1/sessions/${id}/snapshots`)
      setSnapshots(data.snapshots)
    } catch {
      // ignore
    }
  }, [id])

  useEffect(() => {
    fetchSession()
    // Refresh session status periodically so status dot stays live
    refreshIntervalRef.current = setInterval(fetchSession, 8000)
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    }
  }, [fetchSession])

  useEffect(() => {
    if (activeTab === 'snapshots') fetchSnapshots()
  }, [activeTab, fetchSnapshots])

  const handleCaptureSnapshot = async () => {
    if (!id) return
    setCapturingSnapshot(true)
    setSnapshotMessage(null)
    try {
      await apiFetch(`/api/v1/sessions/${id}/snapshots`, { method: 'POST' })
      setSnapshotMessage('Snapshot captured!')
      await fetchSnapshots()
    } catch (err) {
      setSnapshotMessage(err instanceof Error ? err.message : 'Failed to capture snapshot')
    } finally {
      setCapturingSnapshot(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'snapshots', label: 'Snapshots' },
    { id: 'info', label: 'Info' },
  ]

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center px-6">
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-4 text-red-300 text-sm w-full max-w-sm">
          <p className="font-medium mb-1">Error</p>
          <p>{error ?? 'Session not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-3 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md text-xs min-h-[44px] transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    // fixed inset-0 fills the actual visible screen on mobile regardless of browser chrome
    <div className="fixed inset-0 flex flex-col bg-gray-900">

      {/* Compact header — 40px */}
      <div className="flex items-center gap-2 px-1 bg-gray-850 border-b border-gray-700 flex-shrink-0 h-10" style={{ backgroundColor: '#161b22' }}>
        <button
          onClick={() => navigate('/')}
          className="p-2 text-gray-400 hover:text-gray-200 rounded flex items-center justify-center min-w-[36px]"
          aria-label="Back"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <StatusDot status={session.status} />
        <span className="text-sm font-semibold text-gray-100 truncate flex-1 min-w-0">
          {session.title}
        </span>
        <span className="text-xs text-gray-500 flex-shrink-0 pr-2">
          {session.agentProfile?.name ?? ''}
        </span>
      </div>

      {/* Tab strip — 36px */}
      <div className="flex bg-gray-800 border-b border-gray-700 flex-shrink-0" style={{ height: '36px' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 hover:text-gray-200 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — fills the rest */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Terminal: always rendered but hidden when not active so xterm stays alive */}
        <div className={`h-full ${activeTab === 'terminal' ? 'block' : 'hidden'}`}>
          <Terminal sessionId={session.publicId} />
        </div>

        {activeTab === 'snapshots' && (
          <div className="h-full overflow-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-300">Snapshots</h3>
              <button
                onClick={handleCaptureSnapshot}
                disabled={capturingSnapshot}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm rounded-lg min-h-[44px] flex items-center gap-1 transition-colors"
              >
                {capturingSnapshot ? (
                  <>
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    Capturing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Capture
                  </>
                )}
              </button>
            </div>

            {snapshotMessage && (
              <div className={`mb-3 px-4 py-3 rounded-lg text-sm border ${
                snapshotMessage.includes('!')
                  ? 'bg-green-900/30 border-green-700 text-green-300'
                  : 'bg-red-900/30 border-red-700 text-red-300'
              }`}>
                {snapshotMessage}
              </div>
            )}

            {snapshots.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No snapshots yet</p>
                <p className="text-gray-600 text-xs mt-1">Capture a snapshot to save the current terminal state</p>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map(snap => (
                  <div key={snap.id} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                      <span className="text-xs text-gray-400 font-mono">{snap.snapshotType}</span>
                      <span className="text-xs text-gray-500">{new Date(snap.createdAt).toLocaleString()}</span>
                    </div>
                    <pre className="px-3 py-2 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {snap.contentText}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'info' && (
          <div className="h-full overflow-auto px-4 py-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 divide-y divide-gray-700">
              <InfoRow label="Session ID" value={session.publicId} />
              <InfoRow label="Status" value={session.status} />
              <InfoRow label="Agent Profile" value={session.agentProfile?.name ?? session.agentProfileId} />
              <InfoRow label="Working Directory" value={session.workdir} />
              {session.repoRoot && (
                <InfoRow label="Repository" value={`${session.repoRoot.label} (${session.repoRoot.absolutePath})`} />
              )}
              <InfoRow label="Tmux Session" value={session.tmuxSessionName} />
              <InfoRow label="Created" value={formatDate(session.createdAt)} />
              <InfoRow label="Started" value={formatDate(session.startedAt)} />
              <InfoRow label="Last Activity" value={formatDate(session.lastOutputAt)} />
              {session.stoppedAt && (
                <InfoRow label="Stopped" value={formatDate(session.stoppedAt)} />
              )}
            </div>

            {(session.status === 'running' || session.status === 'starting') && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={async () => {
                    await apiFetch(`/api/v1/sessions/${session.publicId}/stop`, { method: 'POST' })
                    fetchSession()
                  }}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold rounded-lg min-h-[48px] transition-colors"
                >
                  Stop
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Kill this session?')) return
                    await apiFetch(`/api/v1/sessions/${session.publicId}/kill`, { method: 'POST' })
                    fetchSession()
                  }}
                  className="flex-1 py-3 bg-red-900 hover:bg-red-800 text-red-300 font-semibold rounded-lg min-h-[48px] transition-colors"
                >
                  Kill
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
