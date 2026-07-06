// Right-side drawer showing the last 50 runs for a schedule (user OR system).
// Fetches /api/schedules/:id/runs on open. Re-fetches when SSE
// schedule:complete/error fires for this id (handled by parent).
//
// Always renders three distinct visual states (loading / error / empty)
// per project rule .claude/rules/error-handling.md.

import { useCallback, useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronRight, AlertCircle, MinusCircle, Loader2 } from 'lucide-react'
import { getScheduleRuns, type Schedule, type ScheduleRun, apiError } from '../lib/api'
import { onScheduleEvent } from '../lib/sseBus'

export interface ScheduleHistoryDrawerProps {
  schedule: Schedule | null
  onClose: () => void
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function fmtTimestamp(ts: string): string {
  try { return new Date(ts).toLocaleString() } catch { return ts }
}

export default function ScheduleHistoryDrawer({ schedule, onClose }: ScheduleHistoryDrawerProps) {
  const [runs, setRuns] = useState<ScheduleRun[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const id = schedule?.id

  const load = useCallback(async (sid: string) => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await getScheduleRuns(sid, 50)
      setRuns(res.runs || [])
    } catch (err) {
      apiError('Load schedule runs', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    setExpanded(new Set())
    load(id)
  }, [id, load])

  // Drawer owns its own SSE subscription. Any schedule:* event for the
  // currently-viewed id triggers a refetch — no dependency on parent's
  // refreshSignal. Multi-tab: opening drawer in tab A while tab B fires a
  // run causes A to update without user action.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    let debounce: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = onScheduleEvent(ev => {
      if (cancelled || ev.id !== id) return
      // Refetch on terminal events; start events don't change history (run
      // row already inserted as stub by server before SSE fires).
      if (ev.type === 'schedule:start' ||
          ev.type === 'schedule:complete' ||
          ev.type === 'schedule:error' ||
          ev.type === 'schedule:cancelled') {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => load(id), 200)
      }
    })
    return () => {
      cancelled = true
      if (debounce) clearTimeout(debounce)
      unsubscribe()
    }
  }, [id, load])

  // Escape closes the drawer — common pattern.
  useEffect(() => {
    if (!schedule) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [schedule, onClose])

  if (!schedule) return null

  const toggleExpand = (runId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(runId)) next.delete(runId); else next.add(runId)
      return next
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-surface border-l border-border z-50 flex flex-col"
        role="dialog"
        aria-label={`Run history for ${schedule.name}`}
      >
        <header className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold truncate">{schedule.name}</h2>
              {schedule.kind === 'system' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple/20 text-text">system</span>
              )}
            </div>
            <p className="text-xs text-text-muted truncate">
              {schedule.agentName} · {schedule.cron || schedule.trigger || 'event-driven'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => id && load(id)}
              disabled={loading}
              className="p-1.5 rounded-lg text-text-muted hover:bg-surface-2 disabled:opacity-50"
              title="Refresh"
              aria-label="Refresh run history"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:bg-surface-2"
              title="Close (Esc)"
              aria-label="Close run history drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && loadError && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <AlertCircle className="w-8 h-8 text-red opacity-60" />
              <p className="text-sm text-text-muted">Failed to load run history</p>
              <button
                onClick={() => id && load(id)}
                className="btn-primary btn-sm"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !loadError && runs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-text-muted">
              <Clock className="w-8 h-8 opacity-30 mb-3" />
              <p className="text-sm">No runs yet</p>
              <p className="text-xs mt-1">Run history will appear here after the first tick.</p>
            </div>
          )}

          {!loading && !loadError && runs.map(run => {
            const isOpen = expanded.has(run.id)
            const StatusIcon =
              run.status === 'error'     ? <XCircle      className="w-4 h-4 text-red shrink-0" /> :
              run.status === 'cancelled' ? <MinusCircle  className="w-4 h-4 text-amber shrink-0" /> :
              run.status === 'crashed'   ? <XCircle      className="w-4 h-4 text-amber shrink-0" /> :
              run.status === 'running'   ? <Loader2      className="w-4 h-4 text-blue animate-spin shrink-0" /> :
                                            <CheckCircle className="w-4 h-4 text-green shrink-0" />
            return (
              <div key={run.id} className="card">
                <button
                  onClick={() => toggleExpand(run.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-2/70 rounded-lg"
                  aria-expanded={isOpen}
                  aria-label="Toggle run details"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
                  {StatusIcon}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {fmtTimestamp(run.timestamp)}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      {fmtDuration(run.duration)}
                      {typeof run.estimatedCost === 'number' && run.estimatedCost > 0 && (
                        <> · ${run.estimatedCost.toFixed(4)}</>
                      )}
                      {run.source && <> · {run.source}</>}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
                    {run.error && (
                      <div className="text-[11px] text-text bg-red/10 px-2 py-1.5 rounded font-mono whitespace-pre-wrap break-all">
                        {run.error}
                      </div>
                    )}
                    {run.outputChars > 0 && (
                      <div className="text-[10px] text-text-muted">
                        Output: {run.outputChars.toLocaleString()} chars · ~{run.estimatedTokens.toLocaleString()} tokens
                      </div>
                    )}
                    {run.metadata && Object.keys(run.metadata).length > 0 && (
                      <details className="text-[10px] text-text-muted">
                        <summary className="cursor-pointer hover:text-text">Metadata</summary>
                        <pre className="mt-1 bg-surface px-2 py-1.5 rounded font-mono overflow-x-auto max-h-40">
                          {JSON.stringify(run.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {!loading && !loadError && runs.length >= 50 && (
            <p className="text-[10px] text-text-muted text-center pt-2">Showing the 50 most recent runs.</p>
          )}
        </div>
      </aside>
    </>
  )
}
