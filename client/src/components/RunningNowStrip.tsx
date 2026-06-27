// "Running now" header strip — the live view of what's executing right now, with
// a ticking elapsed timer + cancel. Self-contained: reads /schedules/inflight and
// re-reads it on any schedule SSE event.
import { useEffect, useState } from 'react'
import { StopCircle, Loader2, Zap } from 'lucide-react'
import { getInflightSchedules, type InflightRun, type Schedule } from '../lib/api'
import { onScheduleEvent } from '../lib/sseBus'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { elapsed } from '../lib/scheduleFormat'

interface Props {
  schedules: Schedule[]
  busyIds: Set<string>
  onCancel: (s: Schedule) => void
}

export default function RunningNowStrip({ schedules, busyIds, onCancel }: Props) {
  const [inflight, setInflight] = useState<InflightRun[]>([])
  const [, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refetch = () => { getInflightSchedules().then(r => { if (!cancelled) setInflight(r.inflight) }).catch(() => {}) }
    refetch()
    const un = onScheduleEvent(() => refetch()) // any start/complete/error/cancel → re-read
    return () => { cancelled = true; un() }
  }, [])

  // Tick once a second only while something is running (live elapsed).
  useEffect(() => {
    if (inflight.length === 0) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [inflight.length])

  if (inflight.length === 0) {
    return (
      <div className="card p-3 flex items-center gap-2 text-xs text-text-muted">
        <Zap className="w-3.5 h-3.5 shrink-0" /> Nothing running right now.
      </div>
    )
  }

  return (
    <div className="card border-blue/30 bg-blue/[0.04] p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue uppercase tracking-wide">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Running now · {inflight.length}
      </div>
      {inflight.map(r => {
        const s = schedules.find(x => x.id === r.id)
        const agentName = r.agentName || s?.agentName || ''
        const d = formatAgentDisplay({ name: agentName, id: agentName })
        return (
          <div key={r.runId} className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue animate-pulse shrink-0" />
              <span className="text-sm font-medium truncate">{s?.name || r.id}</span>
              {agentName && <span className="text-xs text-text-muted truncate" title={agentName}>{d.realName}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-xs text-blue tabular-nums">{elapsed(r.startedAt)}</span>
              {s && s.cancellable && (
                <button
                  onClick={() => onCancel(s)}
                  disabled={busyIds.has(s.id)}
                  className="p-1 rounded-lg text-amber hover:bg-amber/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Cancel this run"
                  aria-label={`Cancel ${s.name}`}
                >
                  <StopCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
