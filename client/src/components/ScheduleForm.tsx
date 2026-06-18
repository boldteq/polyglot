// ScheduleForm — reusable create + edit form for user-created schedules.
// Server-side cron validation on blur (via /api/schedules/validate-cron),
// client regex pre-check for instant UX. Presets fetched from API (no
// hardcoded list — see .claude/rules/no-hardcoded-org-data.md).
//
// `mode='edit'` disables the agent dropdown when locked (system schedules
// route through a different code path entirely — see Schedules.tsx).

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Clock, Loader2 } from 'lucide-react'
import {
  createSchedule,
  updateSchedule,
  validateCronOnServer,
  type Schedule,
} from '../lib/api'
import type { Agent } from '../types'
import { useCronPresets } from '../hooks/useCronPresets'
import { formatAgentDisplay } from '../lib/agentDisplay'

const CRON_FIELD = '(?:\\*|(?:[0-9]+|\\*)(?:[-/,][0-9]+)*(?:,(?:[0-9]+|\\*)(?:[-/,][0-9]+)*)*)'
const CRON_RE = new RegExp(`^${CRON_FIELD}(?:\\s+${CRON_FIELD}){4,5}$`)

function isValidCronClient(expr: string): boolean {
  if (!expr || typeof expr !== 'string') return false
  return CRON_RE.test(expr.trim())
}

export interface ScheduleFormProps {
  mode: 'create' | 'edit'
  initial?: Schedule | null
  agents: Agent[]
  onSaved: (schedule: Schedule) => void
  onCancel: () => void
}

interface FormState {
  name: string
  agentName: string
  prompt: string
  cronExpr: string
}

function initialForm(initial?: Schedule | null): FormState {
  return {
    name: initial?.name || '',
    agentName: initial?.agentName || '',
    prompt: initial?.prompt || '',
    cronExpr: initial?.cron || '0 9 * * *',
  }
}

export default function ScheduleForm({ mode, initial, agents, onSaved, onCancel }: ScheduleFormProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(initial))
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
    const name = form.name.trim()
    const agentName = form.agentName.trim()
    const prompt = form.prompt.trim()
    const cronExpr = form.cronExpr.trim()
    if (!name || !agentName || !prompt || !cronExpr) {
      setError('All fields are required')
      return
    }
    if (!isValidCronClient(cronExpr)) {
      setCronError('Invalid cron expression')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = mode === 'edit' && initial
        ? await updateSchedule(initial.id, { name, agentName, prompt, cronExpr })
        : await createSchedule({ name, agentName, prompt, cronExpr })
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
        <div className="flex items-center gap-2 text-red text-xs bg-red/10 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}
      {agents.length === 0 && (
        <div className="flex items-center gap-2 text-amber text-xs bg-amber/10 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5" /> No agents available — create an agent first.
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
            onChange={e => updateForm({ name: e.target.value })}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="schedule-agent" className="block text-xs text-text-muted mb-1">Agent</label>
          <select
            id="schedule-agent"
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
        <label htmlFor="schedule-prompt" className="block text-xs text-text-muted mb-1">Prompt</label>
        <textarea
          id="schedule-prompt"
          className="input min-h-[80px] resize-y"
          placeholder="What should this agent do on each run?"
          value={form.prompt}
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
          disabled={saving || agents.length === 0}
          className="btn-primary btn-md"
        >
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : (mode === 'edit' ? 'Save Changes' : 'Create Schedule')}
        </button>
      </div>
    </div>
  )
}
