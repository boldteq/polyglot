import { useState, useEffect, useMemo, useRef } from 'react'
import { X, Sparkles, Send, Loader2 } from 'lucide-react'
import { dispatchAssign, type DispatchAssignResult } from '../lib/api'
import { toast } from './Toast'

type Priority = 'p0' | 'p1' | 'p2' | 'p3'

interface AssignTaskModalProps {
  open: boolean
  onClose: () => void
  // Optional: pre-fill the agent the user clicked on
  preferredAgent?: string
  // Optional: pre-fill the task description (e.g. from the smart-route search input)
  initialQuery?: string
  // Called after a successful assign with the chosen agent + task id
  onAssigned?: (result: { taskId: string; agentId: string }) => void
}

const TASK_TYPES = ['build', 'bug', 'spike', 'review', 'design', 'research', 'deploy', 'general']
// `color` references a theme token (var) so the selected-state fill stays AA in
// both light/dark mode and never hardcodes a raw -400/-500 shade.
const PRIORITIES: { value: Priority; label: string; color: string; description: string }[] = [
  { value: 'p0', label: 'P0 — Critical',  color: 'var(--color-red)',   description: 'Drop everything' },
  { value: 'p1', label: 'P1 — High',      color: 'var(--color-amber)', description: 'This sprint' },
  { value: 'p2', label: 'P2 — Normal',    color: 'var(--color-blue)',  description: 'Default' },
  { value: 'p3', label: 'P3 — Low',       color: 'var(--color-gray)',  description: 'When capacity frees up' },
]

export default function AssignTaskModal({ open, onClose, preferredAgent, initialQuery, onAssigned }: AssignTaskModalProps) {
  const [query, setQuery] = useState('')
  const [taskType, setTaskType] = useState('build')
  const [priority, setPriority] = useState<Priority>('p2')
  const [estimatedTokens, setEstimatedTokens] = useState<number>(20000)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<DispatchAssignResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Restore focus to whatever was focused before the modal opened (a11y).
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null
      setQuery(initialQuery || '')
      setPreview(null)
      setError(null)
      setBusy(false)
    } else {
      lastFocusedRef.current?.focus?.()
    }
  }, [open, initialQuery])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Memoize the preview slice so candidate rows don't re-map on every keystroke.
  const previewCandidates = useMemo(() => preview?.candidates?.slice(0, 5) ?? [], [preview])

  if (!open) return null

  const runDryRun = async () => {
    if (!query.trim()) {
      setError('Describe the task first')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const result = await dispatchAssign({
        query,
        taskType,
        priority,
        estimatedTokens,
        preferredAgent,
        dryRun: true,
      })
      setPreview(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!query.trim()) {
      setError('Describe the task first')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const result = await dispatchAssign({
        query,
        taskType,
        priority,
        estimatedTokens,
        preferredAgent,
      })
      if (!result.ok || !result.agentId || !result.taskId) {
        throw new Error('dispatch returned an unexpected response')
      }
      toast('success', `Assigned to ${result.agentId} · score ${result.score?.toFixed(2) ?? '—'}`)
      onAssigned?.({ agentId: result.agentId, taskId: result.taskId })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assign failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-surface border border-border shadow-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-task-title"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 id="assign-task-title" className="text-base font-bold">Assign task — Smart routing</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-surface-2 text-text-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="task-desc" className="text-[11px] font-bold text-text-muted mb-1.5 block">Task description</label>
            <textarea
              id="task-desc"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. fix the shopify webhook signature bug — payloads sometimes fail HMAC verify"
              rows={3}
              className="input bg-surface-2 resize-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-type" className="text-[11px] font-bold text-text-muted mb-1.5 block">Type</label>
              <select
                id="task-type"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="input bg-surface-2"
              >
                {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="task-tokens" className="text-[11px] font-bold text-text-muted mb-1.5 block">Estimated tokens</label>
              <input
                id="task-tokens"
                type="number"
                min={0}
                step={1000}
                value={estimatedTokens}
                onChange={(e) => setEstimatedTokens(parseInt(e.target.value, 10) || 0)}
                className="input bg-surface-2 font-mono"
              />
            </div>
          </div>

          <div role="group" aria-labelledby="priority-label">
            <label id="priority-label" className="text-[11px] font-bold text-text-muted mb-1.5 block">Priority</label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  aria-pressed={priority === p.value}
                  aria-label={`${p.label} — ${p.description}`}
                  className={`px-2 py-2 text-xs font-bold rounded-lg border transition-colors ${
                    priority === p.value
                      ? 'text-white border-accent'
                      : 'bg-surface-2 text-text-muted border-border hover:bg-surface-3'
                  }`}
                  title={p.description}
                  style={priority === p.value ? { backgroundColor: p.color, borderColor: p.color } : {}}
                >
                  {p.label.split(' — ')[0]}
                </button>
              ))}
            </div>
          </div>

          {preferredAgent && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-muted text-accent text-xs font-bold">
              <Sparkles className="w-3 h-3" />
              Preferring {preferredAgent} (override)
            </div>
          )}

          {error && (
            <div role="alert" className="px-3 py-2 rounded-lg bg-red-muted text-text text-xs font-semibold border border-red/20">
              {error}
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-2 bg-surface-2 text-[11px] font-bold text-text-muted">
                Preview — top candidates
              </div>
              <div className="divide-y divide-border">
                {previewCandidates.map((c, idx) => (
                  <div key={c.agentId} className="px-3 py-2 flex items-center gap-3 text-xs">
                    <span className="text-text-muted font-mono w-4">{idx + 1}</span>
                    <span className="font-semibold flex-1 truncate">{c.agentId}</span>
                    <span className="text-text-muted">{c.tier} · {c.model}</span>
                    <span className="text-text-muted font-mono">load {c.activeTaskCount}/{c.maxConcurrentTasks}</span>
                    <span className="font-mono font-bold text-accent">{(c.score ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border bg-surface-2/50 rounded-b-2xl">
          <button
            onClick={runDryRun}
            disabled={busy || !query.trim()}
            className="btn-secondary btn-sm"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Preview'}
          </button>
          <button
            onClick={submit}
            disabled={busy || !query.trim()}
            className="btn-primary btn-sm"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Assign
          </button>
        </div>
      </div>
    </div>
  )
}
