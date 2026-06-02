// Schedules page — single control surface for ALL automation in Polyglot.
// Renders user-created cron jobs AND built-in system cycles (Roster nightly,
// Witness daily, Cadence weekly, Tutor weekly, Forge monthly, Mira on-build)
// in one merged list. Live status via SSE — no polling.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock, Plus, Trash2, Play, Pause, AlertCircle, CheckCircle, XCircle,
  Pencil, PlayCircle, Loader2, Cpu, ChevronRight, StopCircle, MinusCircle,
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
import type { Agent } from '../types'
import { toast } from '../components/Toast'
import { useSchedules } from '../hooks/useSchedules'
import { formatAgentDisplay } from '../lib/agentDisplay'
import ScheduleForm from '../components/ScheduleForm'
import ScheduleHistoryDrawer from '../components/ScheduleHistoryDrawer'
import ConfirmRunModal from '../components/ConfirmRunModal'

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
  const [drawerRefresh, setDrawerRefresh] = useState(0)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [pendingRun, setPendingRun] = useState<Schedule | null>(null)
  const [confirmStarting, setConfirmStarting] = useState(false)
  const [, setTick] = useState(0)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Drawer auto-refresh: if a schedule completes while its drawer is open,
  // bump refreshSignal so the drawer refetches the new run.
  useEffect(() => {
    if (!drawerSchedule) return
    // Subscribe via parent's patchRow side-effect — we re-detect when the
    // currently-shown schedule's lastRunAt changes.
    const found = schedules.find(s => s.id === drawerSchedule.id)
    if (found && found.lastRunAt !== drawerSchedule.lastRunAt) {
      setDrawerSchedule(found)
      setDrawerRefresh(n => n + 1)
    }
  }, [schedules, drawerSchedule])

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

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
    if (confirmId !== s.id) {
      setConfirmId(s.id)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmId(null), 3000)
      return
    }
    if (confirmTimer.current) { clearTimeout(confirmTimer.current); confirmTimer.current = null }
    setConfirmId(null)
    setBusy(s.id, true)
    try {
      await deleteSchedule(s.id)
      await reload()
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
        toast('error', `${s.name}: ${result.reason || 'already running'}`)
        return
      }
      if (result.status === 'started') {
        toast('success', `${s.name} running in background`)
        patchRow(s.id, { lastRunStatus: 'running', runId: result.runId ?? null })
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
        toast('error', `Cancel failed: ${result.error}`)
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
    const sys = schedules.filter(s => s.kind === 'system')
    const user = schedules.filter(s => s.kind === 'user')
    return {
      sysActive: sys.filter(s => s.enabled).length,
      sysTotal: sys.length,
      userActive: user.filter(s => s.enabled).length,
      userTotal: user.length,
    }
  }, [schedules])

  if (loading || agentsLoading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="p-8 flex flex-col items-center justify-center h-64 gap-4 text-center">
      <AlertCircle className="w-8 h-8 text-red-400 opacity-60" />
      <p className="text-sm text-text-muted">Failed to load schedules.</p>
      <button
        onClick={reload}
        className="px-4 py-2 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover"
      >
        Retry
      </button>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6" /> Scheduled Runs
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Built-in automation cycles + user-created cron jobs.
            System: <span className="text-text">{stats.sysActive}/{stats.sysTotal}</span> active ·
            User: <span className="text-text">{stats.userActive}/{stats.userTotal}</span> active
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditing(null) }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {/* Create / Edit form */}
      {showCreate && (
        <ScheduleForm
          mode="create"
          agents={agents}
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

      {/* Schedule rows */}
      <div className="space-y-3">
        {schedules.map(s => {
          const busy = busyIds.has(s.id)
          const pendingDelete = confirmId === s.id
          const isSystem = s.kind === 'system'
          const isRunning = s.lastRunStatus === 'running'
          const d = formatAgentDisplay({ name: s.agentName, id: s.agentName })
          return (
            <div
              key={s.id}
              className={`bg-surface rounded-xl border p-4 transition-colors ${
                isRunning ? 'border-blue-500/50 bg-blue-500/5' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => handleToggle(s)}
                    disabled={busy}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      s.enabled ? 'text-green-400 hover:bg-green-500/10' : 'text-text-muted hover:bg-surface-2'
                    }`}
                    title={s.enabled ? 'Pause schedule' : 'Enable schedule'}
                  >
                    {s.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{s.name}</span>
                      {isSystem && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-500/20 text-purple-300 flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> system
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        isRunning
                          ? 'bg-blue-500/20 text-blue-300'
                          : s.lastRunStatus === 'cancelled'
                            ? 'bg-amber-500/20 text-amber-300'
                            : s.lastRunStatus === 'crashed'
                              ? 'bg-amber-600/20 text-amber-400'
                              : s.enabled
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-surface-2 text-text-muted'
                      }`}>
                        {isRunning ? 'running'
                          : s.lastRunStatus === 'cancelled' ? 'cancelled'
                          : s.lastRunStatus === 'crashed' ? 'crashed'
                          : s.enabled ? 'active' : 'paused'}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded" title={s.cron || s.trigger || ''}>
                        {humanizeCron(s.cron)}
                      </span>
                      <span>·</span>
                      <span title={s.agentName}>{d.fullDisplay}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right text-xs text-text-muted hidden sm:block min-w-[110px]">
                    <div className="flex items-center justify-end gap-1">
                      {isRunning && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
                      {!isRunning && s.lastRunStatus === 'success'   && <CheckCircle className="w-3 h-3 text-green-400" />}
                      {!isRunning && s.lastRunStatus === 'error'     && <XCircle    className="w-3 h-3 text-red-400" />}
                      {!isRunning && s.lastRunStatus === 'cancelled' && <MinusCircle className="w-3 h-3 text-amber-400" />}
                      {!isRunning && s.lastRunStatus === 'crashed'   && <XCircle    className="w-3 h-3 text-amber-500" />}
                      Last: {timeAgo(s.lastRunAt)}
                    </div>
                    <div className="text-[10px] mt-0.5">Next: {timeUntil(s.nextRunAt)}</div>
                  </div>
                  {isRunning && s.cancellable ? (
                    <button
                      onClick={() => handleCancel(s)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Cancel running handler"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRunNow(s)}
                      disabled={busy || isRunning}
                      className="p-1.5 rounded-lg text-text-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={s.needsLlm ? 'Run now (LLM — opens cost confirm)' : 'Run now'}
                    >
                      <PlayCircle className="w-4 h-4" />
                    </button>
                  )}
                  {!isSystem && (
                    <button
                      onClick={() => { setEditing(s); setShowCreate(false) }}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-50"
                      title="Edit schedule"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setDrawerSchedule(s)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    title="View run history"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {!isSystem && (
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={busy}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        pendingDelete ? 'text-red-400 bg-red-500/10' : 'text-text-muted hover:text-red-400 hover:bg-red-500/10'
                      }`}
                      title={pendingDelete ? 'Click again to confirm delete' : 'Delete schedule'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {pendingDelete && (
                <div className="mt-2 text-[11px] text-red-400 pl-10">Click delete again within 3s to confirm.</div>
              )}
              {s.prompt && (
                <div className="mt-2 text-xs text-text-muted truncate pl-10" title={s.prompt}>
                  {isSystem ? s.description : s.prompt}
                </div>
              )}
            </div>
          )
        })}
        {schedules.length === 0 && !showCreate && (
          <div className="text-center py-12 text-text-muted">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No schedules yet</p>
            <p className="text-xs mt-1">Create a schedule to run agents automatically on a cron timer</p>
          </div>
        )}
      </div>

      <ScheduleHistoryDrawer
        schedule={drawerSchedule}
        refreshSignal={drawerRefresh}
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
