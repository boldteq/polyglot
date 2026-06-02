// Confirmation modal shown before firing a real LLM handler (Tutor/Forge/Mira
// or any user schedule). Surfaces cost estimate to prevent surprise bills
// from spam-clicking ▶. Pure-JS handlers (Roster/Witness/Cadence) skip this
// modal entirely.

import { useEffect } from 'react'
import { AlertTriangle, DollarSign, Loader2 } from 'lucide-react'
import type { Schedule } from '../lib/api'

export interface ConfirmRunModalProps {
  schedule: Schedule | null
  /** True while the parent's runScheduleNow request is in flight. */
  running?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function formatCost(low: number, high: number): string {
  const fmt = (n: number) => n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`
  if (low === high) return fmt(low)
  return `${fmt(low)} – ${fmt(high)}`
}

export default function ConfirmRunModal({ schedule, running, onConfirm, onCancel }: ConfirmRunModalProps) {
  useEffect(() => {
    if (!schedule) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) onCancel()
      if (e.key === 'Enter' && !running) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [schedule, running, onCancel, onConfirm])

  if (!schedule) return null

  const cost = schedule.costEstimate
  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={() => !running && onCancel()}
        aria-hidden="true"
      />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md bg-surface border border-border rounded-xl shadow-2xl p-6"
        role="dialog"
        aria-labelledby="confirm-run-title"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-run-title" className="text-base font-semibold">Confirm Run</h2>
            <p className="text-xs text-text-muted mt-0.5">This handler invokes the Claude API.</p>
          </div>
        </div>

        <div className="bg-surface-2 rounded-lg p-3 mb-4 space-y-2">
          <div className="text-sm font-medium truncate">{schedule.name}</div>
          <div className="text-xs text-text-muted">
            Agent: <span className="font-mono">{schedule.agentName}</span>
          </div>
          {cost && (
            <div className="flex items-center gap-1.5 text-xs">
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-text-muted">Estimated cost:</span>
              <span className="font-medium text-amber-300">{formatCost(cost.lowUsd, cost.highUsd)}</span>
            </div>
          )}
          {schedule.description && (
            <div className="text-[11px] text-text-muted border-t border-border pt-2 mt-2">
              {schedule.description}
            </div>
          )}
        </div>

        <p className="text-[11px] text-text-muted mb-4">
          The run starts immediately and updates live via SSE. You can cancel it from the row's ⏹ button while in progress.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={running}
            className="px-4 py-2 text-sm rounded-lg bg-surface-2 hover:bg-surface-2/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            autoFocus
          >
            {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {running ? 'Starting...' : 'Run Now'}
          </button>
        </div>
      </div>
    </>
  )
}
