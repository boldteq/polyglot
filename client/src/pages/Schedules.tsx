// Schedules page — single control surface for ALL automation in Polyglot.
// Renders user-created cron jobs AND built-in system cycles (Roster nightly,
// Witness daily, Cadence weekly, Tutor weekly, Forge monthly, Mira on-build)
// in one merged list. Live status via SSE — no polling.

import { useEffect, useMemo, useState } from 'react'
import {
  Clock, Plus, Trash2, Play, Pause, AlertCircle, CheckCircle, XCircle,
  Pencil, PlayCircle, Loader2, Cpu, History, StopCircle, MinusCircle,
  CalendarClock, Zap, Search, Activity, ListChecks,
} from 'lucide-react'
import {
  getGlobalAgents,
  updateSchedule,
  deleteSchedule,
  runScheduleNow,
  cancelScheduleRun,
  apiError,
  type Schedule,
} from '../lib/api'
import { getScheduleActivity } from '../lib/scheduleApi'
import { onScheduleEvent } from '../lib/sseBus'
import type { Agent } from '../types'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import EmptyState from '../components/EmptyState'
import { StatRow } from '../components/PageShell'
import { useSchedules } from '../hooks/useSchedules'
import { formatAgentDisplay } from '../lib/agentDisplay'
import ScheduleForm from '../components/ScheduleForm'
import ScheduleHistoryDrawer from '../components/ScheduleHistoryDrawer'
import ConfirmRunModal from '../components/ConfirmRunModal'
import RunningNowStrip from '../components/RunningNowStrip'
import ScheduleActivityFeed from '../components/ScheduleActivityFeed'
import ScheduleUpcoming from '../components/ScheduleUpcoming'

function humanizeCron(expr: string | null): string {
  if (!expr) return 'event-driven'
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [min, hour, dom, mon, dow] = parts
  if (min === '0' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') return `Daily ${hour.padStart(2, '0')}:00 UTC`
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every hour'
  if (min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)} min`
  if (min === '0' && dow === '1') return `Mondays ${hour.padStart(2, '0')}:00 UTC`
  if (min === '0' && dow === '0') return `Sundays ${hour.padStart(2, '0')}:00 UTC`
  if (min === '0' && dom === '1' && dow === '*') return `Monthly (1st) ${hour.padStart(2, '0')}:00 UTC`
  return expr
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'never'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function timeUntil(ts: string | null): string {
  if (!ts) return '—'
  const diff = new Date(ts).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 60_000) return 'in <1m'
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`
  }
  return `in ${Math.floor(diff / 86_400_000)}d`
}

export default function SchedulesPage() {
  const { schedules, loading, loadError, reload, patchRow } = useSchedules()
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [drawerSchedule, setDrawerSchedule] = useState<Schedule | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [pendingRun, setPendingRun] = useState<Schedule | null>(null)
  const [confirmStarting, setConfirmStarting] = useState(false)
  const [, setTick] = useState(0)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'system' | 'user'>('all')
  const [view, setView] = useState<'schedules' | 'activity' | 'upcoming'>('schedules')
  const [failed24h, setFailed24h] = useState<number | null>(null)
  const [activityStatus, setActivityStatus] = useState<string>('all')

  // F1/F8: Failed-runs count over the rolling 24h — kept LIVE (refetched on any
  // schedule SSE event so a fresh failure updates the KPI immediately), and the
  // error is logged, never silently swallowed (per .claude/rules/error-handling.md).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const fetchFailed = () => {
      const since = new Date(Date.now() - 86_400_000).toISOString()
      getScheduleActivity({ status: 'error,crashed', since, limit: 1 })
        .then(r => setFailed24h(r.total))
        .catch(err => console.error('[failed24h] fetch failed:', err?.message || err))
    }
    fetchFailed()
    const un = onScheduleEvent(() => { if (t) clearTimeout(t); t = setTimeout(fetchFailed, 800) })
    return () => { if (t) clearTimeout(t); un() }
  }, [])

  // Fetch agents once.
  useEffect(() => {
    let cancelled = false
    setAgentsLoading(true)
    getGlobalAgents()
      .then(a => { if (!cancelled) setAgents(a) })
      .catch(err => { if (!cancelled) apiError('Load agents', err) })
      .finally(() => { if (!cancelled) setAgentsLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Tick every 30s so timeAgo / timeUntil refresh without refetching.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // E3: close the history drawer if its schedule disappears from the list
  // (deleted here or from another tab) — never leave stale history for a gone row.
  useEffect(() => {
    if (drawerSchedule && !loading && !schedules.some(s => s.id === drawerSchedule.id)) {
      setDrawerSchedule(null)
    }
  }, [schedules, drawerSchedule, loading])

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev)
      if (busy) next.add(id); else next.delete(id)
      return next
    })
  }

  const handleToggle = async (s: Schedule) => {
    if (busyIds.has(s.id)) return
    setBusy(s.id, true)
    try {
      await updateSchedule(s.id, { enabled: !s.enabled })
      patchRow(s.id, { enabled: !s.enabled })
    } catch (err) {
      apiError('Toggle schedule', err)
    } finally {
      setBusy(s.id, false)
    }
  }

  const handleDelete = async (s: Schedule) => {
    if (busyIds.has(s.id) || s.builtin) return
    const ok = await confirmDialog({
      title: 'Delete schedule?',
      message: `“${s.name}” will be permanently deleted and stop running. This can’t be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setBusy(s.id, true)
    try {
      await deleteSchedule(s.id)
      await reload()
      toast('success', 'Schedule deleted')
    } catch (err) {
      apiError('Delete schedule', err)
    } finally {
      setBusy(s.id, false)
    }
  }

  // Fire the actual run-now POST. POST returns 202 immediately; SSE handles
  // status transitions. Skips confirm logic — callers gate first if needed.
  const fireRunNow = async (s: Schedule) => {
    setBusy(s.id, true)
    setConfirmStarting(true)
    try {
      const result = await runScheduleNow(s.id)
      if (result.skipped) {
        toast('warn', `${s.name} is already running`)
        return
      }
      if (result.status === 'started') {
        toast('success', `${s.name} running in background`)
        patchRow(s.id, { lastRunStatus: 'running' })
        setDrawerSchedule(s)
      }
    } catch (err) {
      apiError('Run schedule', err)
    } finally {
      setBusy(s.id, false)
      setConfirmStarting(false)
      setPendingRun(null)
    }
  }

  const handleRunNow = (s: Schedule) => {
    if (busyIds.has(s.id)) return
    if (s.lastRunStatus === 'running') return
    // LLM handlers gate behind a cost-confirm modal; pure-JS handlers fire
    // immediately (no cost, no user surprise).
    if (s.needsLlm) {
      setPendingRun(s)
      return
    }
    fireRunNow(s)
  }

  const handleCancel = async (s: Schedule) => {
    if (busyIds.has(s.id)) return
    setBusy(s.id, true)
    try {
      const result = await cancelScheduleRun(s.id)
      if (result.error) {
        toast('warn', result.error)
      } else {
        toast('success', `Cancelling ${s.name}...`)
      }
    } catch (err) {
      apiError('Cancel schedule', err)
    } finally {
      setBusy(s.id, false)
    }
  }

  const handleSaved = async () => {
    setShowCreate(false)
    setEditing(null)
    await reload()
  }

  const stats = useMemo(() => {
    const total = schedules.length
    const active = schedules.filter(s => s.enabled).length
    const system = schedules.filter(s => s.kind === 'system').length
    const running = schedules.filter(s => s.lastRunStatus === 'running').length
    return { total, active, system, running }
  }, [schedules])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schedules.filter(s => {
      if (kindFilter === 'system' && s.kind !== 'system') return false
      if (kindFilter === 'user' && s.kind === 'system') return false
      if (!q) return true
      return `${s.name} ${s.agentName} ${s.prompt || ''}`.toLowerCase().includes(q)
    })
  }, [schedules, query, kindFilter])

  if (loading || agentsLoading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="p-8 flex flex-col items-center justify-center h-64 gap-4 text-center">
      <AlertCircle className="w-8 h-8 text-red opacity-60" />
      <p className="text-sm text-text-muted">Failed to load schedules.</p>
      <button onClick={reload} className="btn-primary btn-md">
        Retry
      </button>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header: KPIs + create */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <StatRow
            stats={[
              { label: 'Total', value: stats.total, icon: CalendarClock },
              { label: 'Active', value: stats.active, icon: Play },
              { label: 'Running now', value: stats.running, icon: Zap },
              {
                label: 'Failed (24h)', value: failed24h ?? '—', icon: XCircle,
                tone: (failed24h ?? 0) > 0 ? 'danger' : 'default',
                hint: 'Runs that errored or crashed in the last rolling 24h (UTC). Click to see them.',
                onClick: () => { setActivityStatus('failed'); setView('activity') },
              },
            ]}
          />
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditing(null); setView('schedules') }}
          className="btn-primary btn-md shrink-0"
        >
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {/* Running now — live, with elapsed timers + cancel */}
      <RunningNowStrip schedules={schedules} busyIds={busyIds} onCancel={handleCancel} />

      {/* View switch: Schedules (control) | Activity (full history) */}
      <div className="segmented">
        <button onClick={() => setView('schedules')} aria-pressed={view === 'schedules'} className={`segmented-btn ${view === 'schedules' ? 'segmented-btn-active' : ''}`}>
          <ListChecks className="w-3.5 h-3.5" /> Schedules
        </button>
        <button onClick={() => { setActivityStatus('all'); setView('activity') }} aria-pressed={view === 'activity'} className={`segmented-btn ${view === 'activity' ? 'segmented-btn-active' : ''}`}>
          <Activity className="w-3.5 h-3.5" /> Activity
        </button>
        <button onClick={() => setView('upcoming')} aria-pressed={view === 'upcoming'} className={`segmented-btn ${view === 'upcoming' ? 'segmented-btn-active' : ''}`}>
          <CalendarClock className="w-3.5 h-3.5" /> Upcoming
        </button>
      </div>

      {view === 'activity' && (
        <ScheduleActivityFeed
          key={activityStatus}
          schedules={schedules}
          initialStatusKey={activityStatus}
          onRunNow={handleRunNow}
          onOpenSchedule={(s) => { setQuery(s.name); setKindFilter('all'); setView('schedules') }}
        />
      )}
      {view === 'upcoming' && <ScheduleUpcoming />}

      {view === 'schedules' && (
      <>
      {/* Create / Edit form */}
      {showCreate && (
        <ScheduleForm
          mode="create"
          agents={agents}
          existing={schedules}
          onSaved={handleSaved}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <ScheduleForm
          mode="edit"
          initial={editing}
          agents={agents}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Filter bar */}
      {schedules.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search schedules by name, agent, or prompt…"
              aria-label="Search schedules"
              className="input pl-8"
            />
          </div>
          <div className="segmented shrink-0">
            {(['all', 'system', 'user'] as const).map(k => (
              <button key={k} onClick={() => setKindFilter(k)} aria-pressed={kindFilter === k} className={`segmented-btn capitalize ${kindFilter === k ? 'segmented-btn-active' : ''}`}>{k}</button>
            ))}
          </div>
          {(query || kindFilter !== 'all') && (
            <span className="text-[11px] text-text-muted shrink-0">{shown.length} of {schedules.length}</span>
          )}
        </div>
      )}

      {/* Schedule rows */}
      <div className="space-y-3">
        {shown.length === 0 && schedules.length > 0 && (
          <div className="card p-8 text-center text-sm text-text-muted">No schedules match your filter.</div>
        )}
        {shown.map(s => {
          const busy = busyIds.has(s.id)
          const isSystem = s.kind === 'system'
          const isRunning = s.lastRunStatus === 'running'
          const d = formatAgentDisplay({ name: s.agentName, id: s.agentName })
          // F5/F6: the pill reflects the last-run OUTCOME (a failed/crashed last
          // run shows red 'failed', never a green 'active' that hides the failure);
          // enabled/paused is conveyed by the Pause/Play toggle, not this pill.
          const lastFailed = s.lastRunStatus === 'error' || s.lastRunStatus === 'crashed'
          const statusLabel = isRunning ? 'running'
            : lastFailed ? 'failed'
            : s.lastRunStatus === 'cancelled' ? 'cancelled'
            : s.enabled ? 'active' : 'paused'
          const statusTone = isRunning
            ? 'bg-blue/15 text-blue'
            : lastFailed
              ? 'bg-red/15 text-red'
              : s.lastRunStatus === 'cancelled'
                ? 'bg-amber/15 text-amber'
                : s.enabled
                  ? 'bg-green/15 text-green'
                  : 'bg-surface-2 text-text-muted'
          const dotTone = isRunning ? 'bg-blue animate-pulse'
            : lastFailed ? 'bg-red'
            : s.lastRunStatus === 'cancelled' ? 'bg-amber'
            : s.enabled ? 'bg-green' : 'bg-text-muted/40'
          return (
            <div
              key={s.id}
              className={`card p-4 transition-colors ${
                isRunning ? 'border-blue/40 bg-blue/[0.03]' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                {/* Identity */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotTone}`} role="img" aria-label={`Status: ${statusLabel}`} title={statusLabel} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text truncate">{s.name}</span>
                      {isSystem && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple/15 text-purple flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> system
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusTone}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted mt-1 flex items-center gap-2 flex-wrap">
                      <span title={s.agentName}>{d.fullDisplay}</span>
                      <span className="text-border">·</span>
                      <span className="font-mono text-[11px] bg-surface-2 px-1.5 py-0.5 rounded text-secondary" title={s.cron || s.trigger || ''}>
                        {humanizeCron(s.cron)}
                      </span>
                    </div>
                    {/* Mobile-only timing fallback — the right-hand timing column is
                        hidden < sm, so surface last/next inline under the name. */}
                    <div className="text-[11px] text-text-muted/80 mt-1 flex items-center gap-1.5 sm:hidden">
                      {isRunning && <Loader2 className="w-3 h-3 text-blue animate-spin shrink-0" />}
                      <span>Last {timeAgo(s.lastRunAt)}</span>
                      <span className="text-border">·</span>
                      <span>Next {timeUntil(s.nextRunAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Timing */}
                <div className="text-right text-xs text-text-muted hidden sm:block min-w-[120px] shrink-0">
                  <div className="flex items-center justify-end gap-1.5">
                    {isRunning && <Loader2 className="w-3 h-3 text-blue animate-spin" />}
                    {!isRunning && s.lastRunStatus === 'success'   && <CheckCircle className="w-3 h-3 text-green" />}
                    {!isRunning && s.lastRunStatus === 'error'     && <XCircle    className="w-3 h-3 text-red" />}
                    {!isRunning && s.lastRunStatus === 'cancelled' && <MinusCircle className="w-3 h-3 text-amber" />}
                    {!isRunning && s.lastRunStatus === 'crashed'   && <XCircle    className="w-3 h-3 text-amber" />}
                    <span>Last {timeAgo(s.lastRunAt)}</span>
                  </div>
                  <div className="text-[11px] mt-0.5 text-text-muted/70">Next {timeUntil(s.nextRunAt)}</div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isRunning && s.cancellable ? (
                    <button
                      onClick={() => handleCancel(s)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-amber hover:bg-amber/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Cancel running handler"
                      aria-label="Cancel running handler"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRunNow(s)}
                      disabled={busy || isRunning}
                      className="p-1.5 rounded-lg text-text-muted hover:text-blue hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={s.needsLlm ? 'Run now (LLM — opens cost confirm)' : 'Run now'}
                      aria-label={s.needsLlm ? 'Run now (LLM — opens cost confirm)' : 'Run now'}
                    >
                      <PlayCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setDrawerSchedule(s)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    title="View run history"
                    aria-label="View run history"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  {!isSystem && (
                    <button
                      onClick={() => { setEditing(s); setShowCreate(false) }}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
                      title="Edit schedule"
                      aria-label="Edit schedule"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleToggle(s)}
                    disabled={busy}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      s.enabled ? 'text-green hover:bg-green/10' : 'text-text-muted hover:bg-surface-2'
                    }`}
                    title={s.enabled ? 'Pause schedule' : 'Enable schedule'}
                    aria-label={s.enabled ? 'Pause schedule' : 'Enable schedule'}
                  >
                    {s.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  {!isSystem && (
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={busy}
                      className="p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-text-muted hover:text-red hover:bg-red/10"
                      title="Delete schedule"
                      aria-label="Delete schedule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {s.prompt && (
                <div className="mt-2 text-xs text-text-muted truncate pl-5" title={s.prompt}>
                  {isSystem ? s.description : s.prompt}
                </div>
              )}
            </div>
          )
        })}
        {schedules.length === 0 && !showCreate && (
          <EmptyState
            icon={Clock}
            title="No schedules yet"
            description="Create a schedule to run agents automatically on a cron timer"
            action={{ label: 'New Schedule', onClick: () => { setShowCreate(true); setEditing(null) } }}
            card
          />
        )}
      </div>

      </>
      )}

      <ScheduleHistoryDrawer
        schedule={drawerSchedule}
        onClose={() => setDrawerSchedule(null)}
      />

      <ConfirmRunModal
        schedule={pendingRun}
        running={confirmStarting}
        onConfirm={() => pendingRun && fireRunNow(pendingRun)}
        onCancel={() => setPendingRun(null)}
      />
    </div>
  )
}
