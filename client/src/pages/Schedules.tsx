import { useState, useEffect, useRef } from 'react'
import { Clock, Plus, Trash2, Play, Pause, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { getSchedules, createSchedule, updateSchedule, deleteSchedule, getGlobalAgents, apiError } from '../lib/api'
import type { Schedule } from '../lib/api'
import type { Agent } from '../types'

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday 9am', value: '0 9 * * 1' },
  { label: 'Every 1st of month', value: '0 9 1 * *' },
]

// Accepts 5 or 6 cron fields. Each field allows */-, digits, comma lists, ranges, and the wildcard *.
const CRON_FIELD = '(?:\\*|(?:[0-9]+|\\*)(?:[-/,][0-9]+)*(?:,(?:[0-9]+|\\*)(?:[-/,][0-9]+)*)*)'
const CRON_RE = new RegExp(`^${CRON_FIELD}(?:\\s+${CRON_FIELD}){4,5}$`)

function isValidCron(expr: string): boolean {
  if (!expr || typeof expr !== 'string') return false
  return CRON_RE.test(expr.trim())
}

function humanizeCron(expr: string): string {
  const preset = CRON_PRESETS.find(p => p.value === expr)
  if (preset) return preset.label
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [min, hour, dom, mon, dow] = parts
  if (min === '0' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') return `Every day at ${hour.padStart(2, '0')}:00`
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every hour'
  if (min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)} minutes`
  return expr
}

function timeAgo(ts: string | null): string {
  if (!ts) return 'never'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const EMPTY_FORM = { name: '', agentName: '', prompt: '', cronExpr: '0 9 * * *' }

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [presetKey, setPresetKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cronError, setCronError] = useState('')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [s, a] = await Promise.all([getSchedules(), getGlobalAgents()])
      setSchedules(s)
      setAgents(a)
    } catch (err) {
      apiError('Load schedules', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Refresh "X ago" labels every 30s without reloading data.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Clear pending delete-confirm if user navigates away or deletes another row.
  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev)
      if (busy) next.add(id); else next.delete(id)
      return next
    })
  }

  const updateForm = (patch: Partial<typeof EMPTY_FORM>) => {
    setForm(prev => ({ ...prev, ...patch }))
    if (error) setError('')
    if ('cronExpr' in patch && cronError) setCronError('')
  }

  const handleCronBlur = () => {
    if (!form.cronExpr) { setCronError(''); return }
    setCronError(isValidCron(form.cronExpr) ? '' : 'Invalid cron expression')
  }

  const handleCreate = async () => {
    const name = form.name.trim()
    const agentName = form.agentName.trim()
    const prompt = form.prompt.trim()
    const cronExpr = form.cronExpr.trim()
    if (!name || !agentName || !prompt || !cronExpr) {
      setError('All fields are required')
      return
    }
    if (!isValidCron(cronExpr)) {
      setCronError('Invalid cron expression')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createSchedule({ name, agentName, prompt, cronExpr })
      await load()
      setShowForm(false)
      setForm(EMPTY_FORM)
      setPresetKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (schedule: Schedule) => {
    if (busyIds.has(schedule.id)) return
    setBusy(schedule.id, true)
    try {
      await updateSchedule(schedule.id, { enabled: !schedule.enabled })
      await load()
    } catch (err) {
      apiError('Schedule action', err)
    } finally {
      setBusy(schedule.id, false)
    }
  }

  const handleDelete = async (id: string) => {
    if (busyIds.has(id)) return
    if (confirmId !== id) {
      setConfirmId(id)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmId(null), 3000)
      return
    }
    if (confirmTimer.current) { clearTimeout(confirmTimer.current); confirmTimer.current = null }
    setConfirmId(null)
    setBusy(id, true)
    try {
      await deleteSchedule(id)
      await load()
    } catch (err) {
      apiError('Schedule action', err)
    } finally {
      setBusy(id, false)
    }
  }

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowForm(false)
      setError('')
      setCronError('')
    }
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="p-8 flex flex-col items-center justify-center h-64 gap-4 text-center">
      <p className="text-sm text-text-muted">Failed to load schedules.</p>
      <button
        onClick={load}
        className="px-4 py-2 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
      >
        Retry
      </button>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6" /> Scheduled Runs
          </h1>
          <p className="text-text-muted text-sm mt-1">Agents that run automatically on a cron schedule</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" /> New Schedule
        </button>
      </div>

      {showForm && (
        <div onKeyDown={handleFormKeyDown} className="bg-surface rounded-xl border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold">Create Schedule</h2>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}
          {agents.length === 0 && (
            <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" /> No agents available — create an agent first.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1">Name</label>
              <input
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none"
                placeholder="Daily Status Report"
                value={form.name}
                onChange={e => updateForm({ name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Agent</label>
              <select
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none"
                value={form.agentName}
                onChange={e => updateForm({ agentName: e.target.value })}
                disabled={agents.length === 0}
              >
                <option value="">Select agent...</option>
                {agents.map(a => (
                  <option key={a.filename} value={a.filename}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Cron Expression</label>
            <div className="flex gap-2">
              <input
                className={`flex-1 px-3 py-2 text-sm bg-surface-2 border rounded-lg focus:border-accent outline-none font-mono ${cronError ? 'border-red-500/60' : 'border-border'}`}
                placeholder="0 9 * * *"
                value={form.cronExpr}
                onChange={e => updateForm({ cronExpr: e.target.value })}
                onBlur={handleCronBlur}
              />
              <select
                className="px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg outline-none"
                value={presetKey}
                onChange={e => {
                  if (e.target.value) updateForm({ cronExpr: e.target.value })
                  setPresetKey('')
                }}
              >
                <option value="">Presets...</option>
                {CRON_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-text-muted mt-1">
              {cronError
                ? <span className="text-red-400">{cronError}</span>
                : isValidCron(form.cronExpr)
                  ? <>Format: minute hour day-of-month month day-of-week &middot; <span className="text-text">{humanizeCron(form.cronExpr)}</span></>
                  : 'Format: minute hour day-of-month month day-of-week'}
            </p>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Prompt</label>
            <textarea
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none min-h-[80px] resize-y"
              placeholder="What should this agent do on each run?"
              value={form.prompt}
              onChange={e => updateForm({ prompt: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); setError(''); setCronError('') }} className="px-4 py-2 text-sm rounded-lg bg-surface-2 hover:bg-surface-2/80">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || agents.length === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Schedule'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {schedules.map(s => {
          const busy = busyIds.has(s.id)
          const pendingDelete = confirmId === s.id
          return (
            <div key={s.id} className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(s)}
                    disabled={busy}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${s.enabled ? 'text-green-400 hover:bg-green-500/10' : 'text-text-muted hover:bg-surface-2'}`}
                    title={s.enabled ? 'Pause schedule' : 'Enable schedule'}
                  >
                    {s.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.enabled ? 'bg-green-500/20 text-green-400' : 'bg-surface-2 text-text-muted'}`}>
                        {s.enabled ? 'active' : 'paused'}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      <span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded" title={s.cron}>{humanizeCron(s.cron)}</span>
                      <span className="mx-2">&middot;</span>
                      <span>{s.agentName}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-xs text-text-muted">
                    <div className="flex items-center gap-1">
                      {s.lastRunStatus === 'success' && <CheckCircle className="w-3 h-3 text-green-400" />}
                      {s.lastRunStatus === 'error' && <XCircle className="w-3 h-3 text-red-400" />}
                      Last: {timeAgo(s.lastRunAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    disabled={busy}
                    className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${pendingDelete ? 'text-red-400 bg-red-500/10' : 'text-text-muted hover:text-red-400 hover:bg-red-500/10'}`}
                    title={pendingDelete ? 'Click again to confirm delete' : 'Delete schedule'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {pendingDelete && (
                <div className="mt-2 text-[11px] text-red-400 pl-10">Click delete again within 3s to confirm.</div>
              )}
              <div className="mt-2 text-xs text-text-muted truncate pl-10">{s.prompt}</div>
            </div>
          )
        })}
        {schedules.length === 0 && !showForm && (
          <div className="text-center py-12 text-text-muted">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No schedules yet</p>
            <p className="text-xs mt-1">Create a schedule to run agents automatically on a cron timer</p>
          </div>
        )}
      </div>
    </div>
  )
}
