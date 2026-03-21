import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { AgentProfile, Session } from '../types'

interface DispatchTaskProps {
  profiles: AgentProfile[]
  recentWorkdir?: string
  recentProfileId?: string
  recentWorkdirs?: string[]
  onDispatch?: (session: Session) => void
}

export function DispatchTask({ profiles, recentWorkdir, recentProfileId, recentWorkdirs = [] }: DispatchTaskProps) {
  const [task, setTask] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState(recentProfileId || (profiles.length > 0 ? profiles[0].id : ''))
  const [selectedWorkdir, setSelectedWorkdir] = useState(recentWorkdir || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const workspaceOptions = Array.from(new Set([
    selectedWorkdir,
    recentWorkdir,
    ...recentWorkdirs,
  ].filter((workdir): workdir is string => Boolean(workdir))))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!task.trim() || !selectedProfileId) return

    setSubmitting(true)
    setError(null)

    try {
      // Use the first 40 chars of the task as the title
      const title = task.length > 40 ? task.substring(0, 37) + '...' : task

      const res = await apiFetch<{ session: Session }>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          title: `Task: ${title}`,
          agentProfileId: selectedProfileId,
          workdir: selectedWorkdir || null,
          startupPrompt: task,
        }),
      })

      // Open the live terminal first; readable logs remain available in the session tabs
      navigate(`/sessions/${res.session.publicId}?tab=terminal`, { state: { activeTab: 'terminal' } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-1 shadow-2xl overflow-hidden transition-all duration-300">
      <form onSubmit={handleSubmit} className="relative">
        <div className="p-2 space-y-2">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="What needs doing?"
            rows={2}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none leading-relaxed"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSubmit(e)
              }
            }}
          />

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-1">Agent</label>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500/50 appearance-none"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-1">Workspace</label>
              <select
                value={selectedWorkdir}
                onChange={(e) => setSelectedWorkdir(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500/50 appearance-none"
              >
                <option value="">Default workspace</option>
                {workspaceOptions.map((workdir) => (
                  <option key={workdir} value={workdir}>{workdir}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((next) => !next)}
              className="h-[56px] px-4 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] font-black uppercase tracking-[0.24em] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
            >
              Recent
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-3 animate-fade-in border-t border-zinc-800/50 pt-3">
              {recentWorkdirs.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[9px] font-black text-zinc-500 uppercase tracking-widest ml-1">
                    Recent workspaces
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentWorkdirs.map((workdir) => {
                      const shortName = workdir.split('/').pop() || workdir
                      const isSelected = selectedWorkdir === workdir
                      return (
                        <button
                          key={workdir}
                          type="button"
                          onClick={() => setSelectedWorkdir(workdir)}
                          className={`max-w-full px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20'
                              : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
                          }`}
                          title={workdir}
                        >
                          {shortName}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-[10px] font-bold text-rose-400 uppercase tracking-tight bg-rose-500/5 border border-rose-500/10 p-2 rounded-lg text-center">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center">
            <div className="text-[10px] text-zinc-600 font-medium">
              <span className="text-zinc-500 font-bold uppercase tracking-widest">Enter</span> sends
              {' '}· <span className="text-zinc-500 font-bold uppercase tracking-widest">Shift</span>+
              <span className="text-zinc-500 font-bold uppercase tracking-widest">Enter</span> newline
            </div>
            <button
              type="submit"
              disabled={submitting || !task.trim()}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all tap-feedback ${
                task.trim()
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'bg-zinc-800 text-zinc-600'
              }`}
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <div className="flex flex-col items-center justify-center leading-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="mt-0.5 text-[8px] font-black uppercase tracking-[0.2em]">Send</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {submitting && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/88 backdrop-blur-md">
            <div className="mx-3 w-full max-w-sm rounded-[28px] border border-white/10 bg-black/70 px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-cyan-300/80">Launching</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-white">Starting your agent</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">
                    Creating the session and attaching the live terminal. This usually takes a few seconds.
                  </p>
                </div>
                <div className="relative mt-1 h-11 w-11 flex-shrink-0 rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                  <div className="absolute inset-[6px] rounded-xl border border-cyan-300/20" />
                  <div className="absolute inset-0 animate-spin rounded-2xl border-2 border-cyan-300/15 border-t-cyan-300/90" />
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-full border border-white/10 bg-white/5">
                <div className="h-1.5 w-2/5 animate-[pulse_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 via-white to-cyan-300" />
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500">
                <span>Preparing workspace</span>
                <span>Session launch</span>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
