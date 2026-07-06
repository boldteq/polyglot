// Expanded detail for a single run — the "what happened / why it failed" panel,
// with one-click recovery actions (Run again / Open schedule) so a failure isn't a
// dead-end. Shared by the Activity feed (and reusable by the per-schedule drawer).
import { Play, ExternalLink } from 'lucide-react'
import type { Schedule } from '../lib/api'
import type { ScheduleActivityRun } from '../lib/scheduleApi'
import { fmtDuration, fmtCost, runCost } from '../lib/scheduleFormat'

interface RunDetailProps {
  run: ScheduleActivityRun
  /** The controlling schedule (resolved from run metadata) — enables the actions. */
  schedule?: Schedule
  onRunNow?: (s: Schedule) => void
  onOpenSchedule?: (s: Schedule) => void
}

export default function RunDetail({ run, schedule, onRunNow, onOpenSchedule }: RunDetailProps) {
  const m = run.metadata || {}
  const cost = runCost(run)
  return (
    <div className="px-3 pb-3 pt-2 border-t border-border space-y-2 text-[11px]">
      {schedule && (onRunNow || onOpenSchedule) && (
        <div className="flex flex-wrap items-center gap-2">
          {onRunNow && (
            <button onClick={() => onRunNow(schedule)} className="btn-secondary btn-sm" title={`Run ${schedule.name} now`}>
              <Play className="w-3.5 h-3.5" /> Run again
            </button>
          )}
          {onOpenSchedule && (
            <button onClick={() => onOpenSchedule(schedule)} className="btn-secondary btn-sm" title={`Open ${schedule.name} to pause or edit it`}>
              <ExternalLink className="w-3.5 h-3.5" /> Open schedule
            </button>
          )}
        </div>
      )}
      {run.error && (
        <div>
          <div className="text-text-muted mb-0.5">Why it failed</div>
          <div className="text-text bg-red/10 px-2 py-1.5 rounded font-mono whitespace-pre-wrap break-all">{run.error}</div>
        </div>
      )}

      {Array.isArray(m.faults) && m.faults.length > 0 && (
        <div>
          <div className="text-text-muted mb-0.5">Faults ({m.faults.length})</div>
          {m.faults.map((f, i) => (
            <div key={i} className="text-text bg-amber/10 px-2 py-1 rounded font-mono break-all mb-1">
              <span className="font-semibold">{f.where}</span>: {f.message}
            </div>
          ))}
        </div>
      )}

      {m.outputPreview && (
        <div>
          <div className="text-text-muted mb-0.5">Output preview</div>
          <pre className="bg-surface px-2 py-1.5 rounded font-mono overflow-x-auto max-h-40 whitespace-pre-wrap break-words">{m.outputPreview}</pre>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-text-muted pt-0.5">
        <span>Duration <span className="text-text">{fmtDuration(run.duration)}</span></span>
        {cost && <span>Cost <span className="text-text">{fmtCost(cost.value)}{cost.real ? '' : ' est'}</span></span>}
        {m.model && <span>Model <span className="text-text font-mono">{m.model}</span></span>}
        {run.outputChars > 0 && <span>Output <span className="text-text">{run.outputChars.toLocaleString()} chars · ~{run.estimatedTokens.toLocaleString()} tok</span></span>}
        {typeof m.retryCount === 'number' && m.retryCount > 0 && <span className="text-amber">retry #{m.retryCount}</span>}
        <span>Run <span className="font-mono">{run.id.slice(0, 8)}</span></span>
      </div>
    </div>
  )
}
