// The Activity view — the global, live history of every schedule run: when it
// ran, which task, done/failed, WHY it failed. Server-filtered + paginated via
// useScheduleActivity; each row expands to full RunDetail. The centerpiece of the
// command center (replaces the buried per-schedule drawer for "see everything").
import { useMemo, useState } from 'react'
import {
  CheckCircle, XCircle, MinusCircle, Loader2, AlertCircle, Clock,
  ChevronRight, ChevronDown, RefreshCw, Search,
} from 'lucide-react'
import type { Schedule } from '../lib/api'
import type { ScheduleActivityRun } from '../lib/scheduleApi'
import { useScheduleActivity } from '../hooks/useScheduleActivity'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { fmtDuration, fmtCost, runCost, runWhy, timeAgo, statusMeta, type RunStatus } from '../lib/scheduleFormat'
import { statusPill } from '../lib/colors'
import RunDetail from './RunDetail'
import { SkeletonCards } from './Skeleton'
import EmptyState from './EmptyState'

const STATUS_TABS: { key: string; label: string; param?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running', param: 'running' },
  { key: 'success', label: 'Success', param: 'success' },
  { key: 'failed', label: 'Failed', param: 'error,crashed' },
  { key: 'cancelled', label: 'Cancelled', param: 'cancelled' },
]

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === 'success') return <CheckCircle className="w-4 h-4 text-green shrink-0" />
  if (status === 'error') return <XCircle className="w-4 h-4 text-red shrink-0" />
  if (status === 'crashed') return <AlertCircle className="w-4 h-4 text-amber shrink-0" />
  if (status === 'cancelled') return <MinusCircle className="w-4 h-4 text-amber shrink-0" />
  if (status === 'running') return <Loader2 className="w-4 h-4 text-blue animate-spin shrink-0" />
  return <Clock className="w-4 h-4 text-text-muted shrink-0" />
}

export default function ScheduleActivityFeed({ schedules }: { schedules: Schedule[] }) {
  const [statusKey, setStatusKey] = useState('all')
  const [kind, setKind] = useState<'all' | 'user' | 'system'>('all')
  const [scheduleId, setScheduleId] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const filters = useMemo(() => ({
    status: STATUS_TABS.find(t => t.key === statusKey)?.param,
    kind: kind === 'all' ? undefined : kind,
    scheduleId: scheduleId || undefined,
  }), [statusKey, kind, scheduleId])

  const { runs, total, loading, loadError, loadingMore, hasMore, reload, loadMore } = useScheduleActivity(filters)

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of schedules) m.set(s.id, s.name)
    return m
  }, [schedules])

  const scheduleName = (run: ScheduleActivityRun): string => {
    const id = run.metadata?.scheduleId || run.metadata?.systemId
    return (id && nameById.get(id)) || run.agentName
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return runs
    return runs.filter(r => `${scheduleName(r)} ${r.agentName} ${r.error || ''}`.toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, query, nameById])

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const filtered = query || statusKey !== 'all' || kind !== 'all' || !!scheduleId

  return (
    <div className="space-y-3">
      {/* filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="segmented flex-wrap">
          {STATUS_TABS.map(t => (
            <button key={t.key} onClick={() => setStatusKey(t.key)} aria-pressed={statusKey === t.key} className={`segmented-btn ${statusKey === t.key ? 'segmented-btn-active' : ''}`}>{t.label}</button>
          ))}
        </div>
        <div className="segmented shrink-0">
          {(['all', 'user', 'system'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`segmented-btn capitalize ${kind === k ? 'segmented-btn-active' : ''}`}>{k}</button>
          ))}
        </div>
        <select value={scheduleId} onChange={e => setScheduleId(e.target.value)} aria-label="Filter by schedule" className="input sm:max-w-[190px]">
          <option value="">All schedules</option>
          {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search loaded runs…" aria-label="Search runs" className="input pl-8" />
        </div>
        <button onClick={reload} className="p-2 rounded-lg text-text-muted hover:bg-surface-2 shrink-0" title="Refresh" aria-label="Refresh activity"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading && <SkeletonCards count={6} />}

      {!loading && loadError && (
        <div className="card p-8 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-8 h-8 text-red opacity-60" />
          <p className="text-sm text-text-muted">Failed to load activity.</p>
          <button onClick={reload} className="btn-primary btn-sm">Retry</button>
        </div>
      )}

      {!loading && !loadError && shown.length === 0 && (
        <EmptyState icon={Clock} title="No runs found" description={filtered ? 'No runs match these filters.' : 'Run history will appear here as schedules fire.'} card />
      )}

      {!loading && !loadError && shown.map(run => {
        const open = expanded.has(run.id)
        const why = runWhy(run)
        const cost = runCost(run)
        const sm = statusMeta(run.status)
        const isSystem = run.source === 'system-schedule'
        return (
          <div key={run.id} className="card">
            <button onClick={() => toggle(run.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2/60 rounded-lg" aria-expanded={open} aria-label={`Toggle details for ${scheduleName(run)}`}>
              {open ? <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
              <StatusIcon status={run.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{scheduleName(run)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusPill(sm.intent)}`}>{sm.label}</span>
                  {isSystem && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple/15 text-purple">system</span>}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span title={run.agentName}>{formatAgentDisplay({ name: run.agentName, id: run.agentName }).realName}</span>
                  <span className="text-border">·</span>
                  <span>{timeAgo(run.timestamp)}</span>
                  {run.duration > 0 && <><span className="text-border">·</span><span>{fmtDuration(run.duration)}</span></>}
                  {cost && <><span className="text-border">·</span><span>{fmtCost(cost.value)}</span></>}
                </div>
                {why && !open && <div className="text-[11px] text-red truncate mt-0.5">{why}</div>}
              </div>
            </button>
            {open && <RunDetail run={run} />}
          </div>
        )
      })}

      {!loading && !loadError && hasMore && (
        <div className="flex justify-center pt-1">
          <button onClick={loadMore} disabled={loadingMore} className="btn-secondary btn-sm">
            {loadingMore ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</> : `Load more · ${runs.length} of ${total}`}
          </button>
        </div>
      )}
      {!loading && !loadError && shown.length > 0 && !hasMore && (
        <p className="text-[11px] text-text-muted text-center pt-1">All {total} runs loaded.</p>
      )}
    </div>
  )
}
