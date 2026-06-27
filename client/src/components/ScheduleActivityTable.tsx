// F11: Gumloop-style dense, sortable run-history table — an alternative to the
// card feed for scanning many runs at once. Columns sort client-side over the
// loaded window (the server already returns newest-first; sorting re-orders what
// you've loaded). Click any row to expand the full RunDetail inline.
import { Fragment, useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { Schedule } from '../lib/api'
import type { ScheduleActivityRun } from '../lib/scheduleApi'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { fmtDuration, fmtCost, runCost, runWhy, timeAgo, statusMeta } from '../lib/scheduleFormat'
import { statusPill } from '../lib/colors'
import StatusIcon from './StatusIcon'
import RunDetail from './RunDetail'

type SortKey = 'time' | 'status' | 'duration' | 'cost' | 'schedule'
type SortDir = 'asc' | 'desc'

// Rank statuses so "failed" sorts together and ahead of successes when ascending —
// puts the runs that need attention at one end.
const STATUS_RANK: Record<string, number> = { crashed: 0, error: 1, cancelled: 2, running: 3, success: 4 }

export default function ScheduleActivityTable({ runs, scheduleName, scheduleOf, onRunNow, onOpenSchedule }: {
  runs: ScheduleActivityRun[]
  scheduleName: (run: ScheduleActivityRun) => string
  scheduleOf: (run: ScheduleActivityRun) => Schedule | undefined
  onRunNow?: (s: Schedule) => void
  onOpenSchedule?: (s: Schedule) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'time' ? 'desc' : 'asc') }
  }
  const toggleRow = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const sorted = useMemo(() => {
    const val = (r: ScheduleActivityRun): number | string => {
      switch (sortKey) {
        case 'duration': return r.duration || 0
        case 'cost': return runCost(r)?.value ?? 0
        case 'status': return STATUS_RANK[r.status] ?? 9
        case 'schedule': return scheduleName(r).toLowerCase()
        case 'time': default: return r.timestamp
      }
    }
    const dir = sortDir === 'asc' ? 1 : -1
    return [...runs].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [runs, sortKey, sortDir, scheduleName])

  const SortHeader = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-text ${align === 'right' ? 'flex-row-reverse' : ''}`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {sortKey === k
          ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-[11px] text-text-muted border-b border-border">
            <th className="px-3 py-2 w-8" />
            <SortHeader k="status" label="Status" />
            <SortHeader k="schedule" label="Schedule" />
            <th className="px-3 py-2 text-left font-medium">Agent</th>
            <SortHeader k="time" label="Started" />
            <SortHeader k="duration" label="Duration" align="right" />
            <SortHeader k="cost" label="Cost" align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(run => {
            const open = expanded.has(run.id)
            const sm = statusMeta(run.status)
            const cost = runCost(run)
            const why = runWhy(run)
            const isSystem = run.source === 'system-schedule'
            return (
              <Fragment key={run.id}>
                <tr
                  onClick={() => toggleRow(run.id)}
                  className={`border-b border-border/60 cursor-pointer hover:bg-surface-2/50 ${open ? 'bg-surface-2/40' : ''}`}
                >
                  <td className="px-3 py-2">
                    {open ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronUp className="w-3.5 h-3.5 text-text-muted rotate-180" />}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusIcon status={run.status} className="w-3.5 h-3.5" />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusPill(sm.intent)}`}>{sm.label}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium">{scheduleName(run)}</span>
                      {isSystem && <span className="text-[9px] px-1 py-0.5 rounded bg-purple/15 text-purple shrink-0">sys</span>}
                    </span>
                    {why && !open && <span className="block text-[11px] text-red truncate">{why}</span>}
                  </td>
                  <td className="px-3 py-2 text-text-muted truncate max-w-[140px]" title={run.agentName}>
                    {formatAgentDisplay({ name: run.agentName, id: run.agentName }).realName}
                  </td>
                  <td className="px-3 py-2 text-text-muted whitespace-nowrap" title={new Date(run.timestamp).toLocaleString()}>{timeAgo(run.timestamp)}</td>
                  <td className="px-3 py-2 text-right text-text-muted whitespace-nowrap">{run.duration > 0 ? fmtDuration(run.duration) : '—'}</td>
                  <td className="px-3 py-2 text-right text-text-muted whitespace-nowrap">{cost ? fmtCost(cost.value) : '—'}</td>
                </tr>
                {open && (
                  <tr className="border-b border-border/60">
                    <td colSpan={7} className="p-0">
                      <RunDetail run={run} schedule={scheduleOf(run)} onRunNow={onRunNow} onOpenSchedule={onOpenSchedule} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
