// ScheduleForm — reusable create + edit form for user-created schedules.
// Server-side cron validation on blur (via /api/schedules/validate-cron),
// client regex pre-check for instant UX. Presets fetched from API (no
// hardcoded list — see .claude/rules/no-hardcoded-org-data.md).
//
// `mode='edit'` disables the agent dropdown when locked (system schedules
// route through a different code path entirely — see Schedules.tsx).

import { useState, useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'
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
  const [presetKey, setPresetKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cronError, setCronError] = useState('')
  const [cronHint, setCronHint] = useState('')
  const { presets } = useCronPresets()
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-seed form when switching from create→edit or editing a different row.
  useEffect(() => { setForm(initialForm(initial)) }, [initial])

  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current) }, [])

  const updateForm = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }))
    if (error) setError('')
    if ('cronExpr' in patch) { setCronError(''); setCronHint('') }
  }

  // Debounce server-side cron validation — fire 300ms after blur to avoid
  // hammering the API on each keystroke. Server is authoritative.
  const handleCronBlur = () => {
    if (!form.cronExpr) { setCronError(''); setCronHint(''); return }
    if (!isValidCronClient(form.cronExpr)) { setCronError('Invalid cron expression'); return }
    if (blurTimer.current) clearTimeout(blurTimer.current)
    blurTimer.current = setTimeout(() => {
      validateCronOnServer(form.cronExpr)
        .then(r => {
          if (!r.valid) { setCronError(r.error || 'Invalid cron'); setCronHint('') }
          else { setCronError(''); setCronHint(r.nextRunAt ? `Next: ${new Date(r.nextRunAt).toLocaleString()}` : '') }
        })
        .catch(err => {
          console.warn('[ScheduleForm] cron validate failed:', err?.message)
          // Don't block on server outage — fall back to client validation only.
        })
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
    <div onKeyDown={handleKeyDown} className="bg-surface rounded-xl border border-border p-5 space-y-4">
      <h2 className="text-sm font-semibold">{mode === 'edit' ? 'Edit Schedule' : 'Create Schedule'}</h2>
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
            autoFocus
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
            {agents.map(a => {
              const d = formatAgentDisplay({ name: a.name, id: a.filename })
              return <option key={a.filename} value={a.filename}>{d.fullDisplay}</option>
            })}
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
            {presets.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <p className="text-[10px] text-text-muted mt-1">
          {cronError
            ? <span className="text-red-400">{cronError}</span>
            : cronHint
              ? <span className="text-emerald-400">{cronHint}</span>
              : 'Format: minute hour day-of-month month day-of-week (UTC)'}
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
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg bg-surface-2 hover:bg-surface-2/80"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || agents.length === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving...' : (mode === 'edit' ? 'Save Changes' : 'Create Schedule')}
        </button>
      </div>
    </div>
  )
}
