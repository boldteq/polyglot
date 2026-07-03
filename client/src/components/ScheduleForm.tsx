// ScheduleForm — reusable create + edit form for user-created schedules.
// Server-side cron validation on blur (via /api/schedules/validate-cron),
// client regex pre-check for instant UX. Presets fetched from API (no
// hardcoded list — see .claude/rules/no-hardcoded-org-data.md).
//
// The agent dropdown stays editable in both create and edit mode — you can
// repoint an existing schedule at a different agent. (System schedules are
// read-only and route through a different code path — see Schedules.tsx.)

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Clock, Loader2 } from 'lucide-react'
import {
  createSchedule,
  updateSchedule,
  validateCronOnServer,
  getOrchestrations,
  type Schedule,
  type OrchestrationSummary,
} from '../lib/api'
import type { Agent } from '../types'
import { useCronPresets } from '../hooks/useCronPresets'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { confirmDialog } from '../lib/confirm'

const NAME_MAX = 200
const PROMPT_MAX = 20000

// One cron field: *, numbers, or 3-letter names (JAN/MON…), with -, /, and ,
// combinations. Structural-only — node-cron on the server is authoritative — but
// enforces EXACTLY 5 fields so 6-field/seconds exprs (which humanizeCron and the
// presets don't model) are rejected, and accepts named months/days the old regex
// wrongly blocked (e.g. "mon-fri", "JAN").
const CRON_TOKEN = '(?:[0-9]{1,2}|[A-Za-z]{3}|\\*)(?:[-/](?:[0-9]{1,2}|[A-Za-z]{3}))?'
const CRON_FIELD = `${CRON_TOKEN}(?:,${CRON_TOKEN})*`
const CRON_RE = new RegExp(`^${CRON_FIELD}(?:\\s+${CRON_FIELD}){4}$`, 'i')

function isValidCronClient(expr: string): boolean {
  if (!expr || typeof expr !== 'string') return false
  return CRON_RE.test(expr.trim())
}

export interface ScheduleFormProps {
  mode: 'create' | 'edit'
  initial?: Schedule | null
  agents: Agent[]
  /** Existing schedules — used to warn on an exact duplicate in create mode. */
  existing?: Schedule[]
  onSaved: (schedule: Schedule) => void
  onCancel: () => void
}

interface FormState {
  name: string
  targetType: 'agent' | 'pipeline'
  agentName: string
  orchestrationId: string
  prompt: string
  cronExpr: string
}

function initialForm(initial?: Schedule | null): FormState {
  return {
    name: initial?.name || '',
    targetType: initial?.orchestrationId ? 'pipeline' : 'agent',
    agentName: initial?.agentName || '',
    orchestrationId: initial?.orchestrationId || '',
    prompt: initial?.prompt || '',
    cronExpr: initial?.cron || '0 9 * * *',
  }
}

// F13: one-click starters so creating a schedule doesn't start from a blank cron.
const STARTER_TEMPLATES = [
  { label: 'Daily status report', name: 'Daily status report', cronExpr: '0 9 * * *', prompt: 'Summarize the last 24 hours of activity and flag anything that needs attention.' },
  { label: 'Weekly review', name: 'Weekly review', cronExpr: '0 9 * * 1', prompt: 'Produce a weekly review: what shipped, what failed, and the top priorities for next week.' },
  { label: 'Hourly health check', name: 'Hourly health check', cronExpr: '0 * * * *', prompt: 'Check system health and report any anomalies or errors found.' },
]

export default function ScheduleForm({ mode, initial, agents, existing, onSaved, onCancel }: ScheduleFormProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(initial))
  const [orchestrations, setOrchestrations] = useState<OrchestrationSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cronError, setCronError] = useState('')
  const [cronHint, setCronHint] = useState('')
  const [cronValidating, setCronValidating] = useState(false)
  const { presets } = useCronPresets()
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cronInputRef = useRef<HTMLInputElement | null>(null)

  // Re-seed form when switching from create→edit or editing a different row.
  useEffect(() => { setForm(initialForm(initial)) }, [initial])

  // Load saved orchestrations for the "pipeline" target picker.
  useEffect(() => {
    getOrchestrations()
      .then(list => setOrchestrations(list.filter(o => (o.nodes?.length || 0) > 0)))
      .catch(err => console.error('[schedule-form] orchestrations load failed:', err?.message || err))
  }, [])

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current) }, [])

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }))
    if (error) setError('')
    // Instant client-side cron feedback on every keystroke — catches obvious
    // typos before the debounced server check fires. Clear the server next-run
    // hint since the value changed; the blur path re-fetches it.
    if (patch.cronExpr !== undefined) {
      setCronHint('')
      const next = patch.cronExpr
      setCronError(!next || isValidCronClient(next) ? '' : 'Invalid cron format')
    }
  }

  // Set cron from a preset pill; reuses the same validation path a manual edit
  // would take. The "Custom" pill focuses the input without changing the value.
  const applyPreset = (value: string) => {
    updateForm({ cronExpr: value })
  }
  const focusCronInput = () => cronInputRef.current?.focus()

  // Debounce server-side cron validation — fire 300ms after blur to avoid
  // hammering the API on each keystroke. Server is authoritative.
  const handleCronBlur = () => {
    if (!form.cronExpr) { setCronError(''); setCronHint(''); return }
    if (!isValidCronClient(form.cronExpr)) { setCronError('Invalid cron expression'); return }
    if (blurTimer.current) clearTimeout(blurTimer.current)
    blurTimer.current = setTimeout(() => {
      setCronValidating(true)
      validateCronOnServer(form.cronExpr)
        .then(r => {
          if (!r.valid) { setCronError(r.error || 'Invalid cron'); setCronHint('') }
          else { setCronError(''); setCronHint(r.nextRunAt ? `Next: ${new Date(r.nextRunAt).toLocaleString()}` : '') }
        })
        .catch(err => {
          console.warn('[ScheduleForm] cron validate failed:', err?.message)
          // Don't block on server outage — fall back to client validation only.
        })
        .finally(() => setCronValidating(false))
    }, 300)
  }

  const handleSave = async () => {
    const isPipeline = form.targetType === 'pipeline'
    const name = form.name.trim()
    const agentName = form.agentName.trim()
    const orchestrationId = form.orchestrationId
    const prompt = form.prompt.trim()
    const cronExpr = form.cronExpr.trim()
    if (!name || !prompt || !cronExpr || (isPipeline ? !orchestrationId : !agentName)) {
      setError(isPipeline ? 'Name, pipeline, task, and cron are required' : 'All fields are required')
      return
    }
    if (!isValidCronClient(cronExpr)) {
      setCronError('Invalid cron expression')
      return
    }
    // C6: warn (don't block) on an exact duplicate when creating (agent mode only).
    if (mode === 'create' && !isPipeline && existing?.some(s =>
      s.kind !== 'system' && s.agentName === agentName &&
      (s.cron || '') === cronExpr && (s.prompt || '').trim() === prompt
    )) {
      const go = await confirmDialog({
        title: 'Duplicate schedule?',
        message: 'A schedule with the same agent, cron, and prompt already exists. Create another?',
        confirmLabel: 'Create anyway',
      })
      if (!go) return
    }
    setSaving(true)
    setError('')
    try {
      const payload = isPipeline
        ? { name, orchestrationId, prompt, cronExpr }
        : { name, agentName, prompt, cronExpr }
      const saved = mode === 'edit' && initial
        ? await updateSchedule(initial.id, payload)
        : await createSchedule(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode === 'edit' ? 'update' : 'create'} schedule`)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div onKeyDown={handleKeyDown} className="card p-5 space-y-4">
      <h2 className="text-sm font-semibold">{mode === 'edit' ? 'Edit Schedule' : 'Create Schedule'}</h2>
      {error && (
        <div className="flex items-center gap-2 text-text text-xs bg-red/10 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}
      {form.targetType === 'agent' && agents.length === 0 && (
        <div className="flex items-center gap-2 text-text text-xs bg-amber/10 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5" /> No agents available — create an agent first.
        </div>
      )}
      {form.targetType === 'pipeline' && orchestrations.length === 0 && (
        <div className="flex items-center gap-2 text-text text-xs bg-amber/10 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5" /> No pipelines available — build one in Studio first.
        </div>
      )}
      {mode === 'create' && (
        <div>
          <span className="block text-xs text-text-muted mb-1.5">Start from a template</span>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_TEMPLATES.map(t => (
              <button
                key={t.label}
                type="button"
                onClick={() => updateForm({ name: t.name, cronExpr: t.cronExpr, prompt: t.prompt })}
                className="segmented-btn"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="schedule-name" className="block text-xs text-text-muted mb-1">Name</label>
          <input
            id="schedule-name"
            className="input"
            placeholder="Daily Status Report"
            value={form.name}
            maxLength={NAME_MAX}
            onChange={e => updateForm({ name: e.target.value })}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="schedule-target" className="block text-xs text-text-muted mb-1">Target</label>
          <div className="flex gap-1.5 mb-2" role="radiogroup" aria-label="Schedule target type">
            <button
              type="button"
              role="radio"
              aria-checked={form.targetType === 'agent'}
              onClick={() => updateForm({ targetType: 'agent' })}
              className={`segmented-btn flex-1 ${form.targetType === 'agent' ? 'segmented-btn-active' : ''}`}
            >
              Single agent
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={form.targetType === 'pipeline'}
              onClick={() => updateForm({ targetType: 'pipeline' })}
              className={`segmented-btn flex-1 ${form.targetType === 'pipeline' ? 'segmented-btn-active' : ''}`}
            >
              Pipeline
            </button>
          </div>
          {form.targetType === 'agent' ? (
            <select
              id="schedule-target"
              name="agentName"
              className="input"
              value={form.agentName}
              onChange={e => updateForm({ agentName: e.target.value })}
              disabled={agents.length === 0}
            >
              <option value="">Select agent...</option>
              {agents.map(a => {
                const d = formatAgentDisplay({ name: a.name, id: a.filename })
                return <option key={a.filename} value={a.filename}>{d.fullDisplay}</option>
              })}
            </select>
          ) : (
            <select
              id="schedule-target"
              name="orchestrationId"
              className="input"
              value={form.orchestrationId}
              onChange={e => updateForm({ orchestrationId: e.target.value })}
              disabled={orchestrations.length === 0}
            >
              <option value="">Select pipeline...</option>
              {orchestrations.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.nodes?.length || 0} nodes)</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div>
        <label htmlFor="cron-expr" className="block text-xs text-text-muted mb-1">Cron Expression</label>
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Clock className="w-3.5 h-3.5 text-text-muted" />
          <div className="segmented flex-wrap">
            {presets.map(p => {
              const active = form.cronExpr.trim() === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => applyPreset(p.value)}
                  aria-pressed={active}
                  className={`segmented-btn ${active ? 'segmented-btn-active' : ''}`}
                >
                  {p.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={focusCronInput}
              className="segmented-btn"
            >
              Custom
            </button>
          </div>
        </div>
        <input
          id="cron-expr"
          ref={cronInputRef}
          className={`input font-mono ${cronError ? 'border-red/60' : ''}`}
          placeholder="0 9 * * *"
          value={form.cronExpr}
          onChange={e => updateForm({ cronExpr: e.target.value })}
          onBlur={handleCronBlur}
        />
        <p className="text-[10px] text-text-muted mt-1">
          {cronValidating
            ? <span className="inline-flex items-center gap-1 text-text-muted"><Loader2 className="w-3 h-3 animate-spin" /> Validating…</span>
            : cronError
              ? <span className="text-red">{cronError}</span>
              : cronHint
                ? <span className="text-emerald">{cronHint}</span>
                : 'Format: minute hour day-of-month month day-of-week (UTC)'}
        </p>
      </div>
      <div>
        <label htmlFor="schedule-prompt" className="block text-xs text-text-muted mb-1">{form.targetType === 'pipeline' ? 'Task (passed to the pipeline)' : 'Prompt'}</label>
        <textarea
          id="schedule-prompt"
          className="input min-h-[80px] resize-y"
          placeholder={form.targetType === 'pipeline' ? 'What task should this pipeline run each time?' : 'What should this agent do on each run?'}
          value={form.prompt}
          maxLength={PROMPT_MAX}
          onChange={e => updateForm({ prompt: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="btn-secondary btn-md"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || agents.length === 0 || !!cronError}
          className="btn-primary btn-md"
        >
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : (mode === 'edit' ? 'Save Changes' : 'Create Schedule')}
        </button>
      </div>
    </div>
  )
}
