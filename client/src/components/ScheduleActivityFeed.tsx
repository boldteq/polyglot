// The Activity view — the global, live history of every schedule run: when it
// ran, which task, done/failed, WHY it failed. Server-filtered + paginated via
// useScheduleActivity; each row expands to full RunDetail. The centerpiece of the
// command center (replaces the buried per-schedule drawer for "see everything").
import { useEffect, useMemo, useState } from 'react'
import {
  Loader2, AlertCircle, Clock, LayoutList, Table2,
  ChevronRight, ChevronDown, RefreshCw, Search,
} from 'lucide-react'
import type { Schedule } from '../lib/api'
import type { ScheduleActivityRun } from '../lib/scheduleApi'
import { useScheduleActivity } from '../hooks/useScheduleActivity'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { fmtDuration, fmtCost, runCost, runWhy, timeAgo, statusMeta } from '../lib/scheduleFormat'
import { statusPill } from '../lib/colors'
import RunDetail from './RunDetail'
import StatusIcon from './StatusIcon'
import ScheduleActivityTable from './ScheduleActivityTable'
import { SkeletonCards } from './Skeleton'
import EmptyState from './EmptyState'

const STATUS_TABS: { key: string; label: string; param?: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running', param: 'running' },
  { key: 'success', label: 'Success', param: 'success' },
  { key: 'failed', label: 'Failed', param: 'error,crashed' },
  { key: 'cancelled', label: 'Cancelled', param: 'cancelled' },
]

const VIEW_KEY = 'polyglot.schedule.activityView'

export default function ScheduleActivityFeed({ schedules, initialStatusKey = 'all', initialScheduleId = '', onRunNow, onOpenSchedule }: {
  schedules: Schedule[]
  initialStatusKey?: string
  initialScheduleId?: string
  onRunNow?: (s: Schedule) => void
  onOpenSchedule?: (s: Schedule) => void
}) {
  const [statusKey, setStatusKey] = useState(initialStatusKey)
  const [kind, setKind] = useState<'all' | 'user' | 'system'>('all')
  const [scheduleId, setScheduleId] = useState(initialScheduleId)
  const [query, setQuery] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // F11: card feed vs dense sortable table — remembered across visits.
  const [view, setView] = useState<'cards' | 'table'>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards' } catch { return 'cards' }
  })
  const setViewPersist = (v: 'cards' | 'table') => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ }
  }

  // #17: sync filter when parent navigates here via a KPI click (e.g. "Failed 24h").
  // useEffect instead of key= avoids unmount/remount which would reset scroll position.
  useEffect(() => { setStatusKey(initialStatusKey) }, [initialStatusKey])
  // #16: sync schedule filter when parent navigates here from a History button click.
  useEffect(() => { setScheduleId(initialScheduleId) }, [initialScheduleId])

  // F16: debounce the text query into the server filters so search spans ALL history.
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(query.trim()), 350); return () => clearTimeout(t) }, [query])

  const filters = useMemo(() => ({
    status: STATUS_TABS.find(t => t.key === statusKey)?.param,
    kind: kind === 'all' ? undefined : kind,
    scheduleId: scheduleId || undefined,
    q: debouncedQ || undefined,
  }), [statusKey, kind, scheduleId, debouncedQ])

  const { runs, total, stats, loading, loadError, loadingMore, hasMore, reload, loadMore } = useScheduleActivity(filters)

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of schedules) m.set(s.id, s.name)
    return m
  }, [schedules])

  const scheduleById = useMemo(() => {
    const m = new Map<string, Schedule>()
    for (const s of schedules) m.set(s.id, s)
    return m
  }, [schedules])

  const scheduleOf = (run: ScheduleActivityRun): Schedule | undefined => {
    const id = run.metadata?.scheduleId || run.metadata?.systemId
    return id ? scheduleById.get(id) : undefined
  }

  const scheduleName = (run: ScheduleActivityRun): string => {
    const id = run.metadata?.scheduleId || run.metadata?.systemId
    return (id && nameById.get(id)) || run.agentName
  }

  // F16: search is now server-side (in `filters.q`), so the visible runs are exactly
  // what the server returned — no client-side re-filtering over the loaded page.
  const shown = runs

  // F15: collapse consecutive identical failures (same schedule + status + error)
  // into one row with a ×N count, so a job failing the same way N times stops
  // spamming N identical rows (log-viewer pattern). Non-failures stay individual.
  const grouped = useMemo(() => {
    const out: { run: ScheduleActivityRun; count: number; oldest: string }[] = []
    for (const run of shown) {
      const last = out[out.length - 1]
      const isFail = run.status === 'error' || run.status === 'crashed'
      const sameKey = last && isFail
        && last.run.status === run.status
        && (last.run.metadata?.scheduleId || last.run.metadata?.systemId) === (run.metadata?.scheduleId || run.metadata?.systemId)
        && (last.run.error || '') === (run.error || '')
      if (sameKey) { last.count += 1; last.oldest = run.timestamp }
      else out.push({ run, count: 1, oldest: run.timestamp })
    }
    return out
  }, [shown])

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
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search runs by agent or error…" aria-label="Search runs" className="input pl-8" />
        </div>
        <div className="segmented shrink-0" role="group" aria-label="View mode">
          <button onClick={() => setViewPersist('cards')} aria-pressed={view === 'cards'} title="Card view" aria-label="Card view" className={`segmented-btn ${view === 'cards' ? 'segmented-btn-active' : ''}`}><LayoutList className="w-3.5 h-3.5" /></button>
          <button onClick={() => setViewPersist('table')} aria-pressed={view === 'table'} title="Table view" aria-label="Table view" className={`segmented-btn ${view === 'table' ? 'segmented-btn-active' : ''}`}><Table2 className="w-3.5 h-3.5" /></button>
        </div>
        <button onClick={reload} className="p-2 rounded-lg text-text-muted hover:bg-surface-2 shrink-0" title="Refresh" aria-label="Refresh activity"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* F12: Attio-style overview — success rate / outcomes / avg runtime / spend over
          the kind+schedule+time scope (independent of the status filter). */}
      {stats && stats.total > 0 && (() => {
        const completed = stats.success + stats.failed + stats.cancelled
        const rate = completed > 0 ? Math.round((stats.success / completed) * 100) : null
        const cost = fmtCost(stats.totalCostUsd)
        return (
          <div className="card px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {rate !== null && <span><span className={`font-semibold ${rate >= 90 ? 'text-green' : rate >= 70 ? 'text-amber' : 'text-red'}`}>{rate}%</span> success</span>}
            <span><span className="text-green font-medium">{stats.success}</span> ok</span>
            <span><span className="text-red font-medium">{stats.failed}</span> failed</span>
            {stats.running > 0 && <span><span className="text-blue font-medium">{stats.running}</span> running</span>}
            {stats.cancelled > 0 && <span><span className="text-amber font-medium">{stats.cancelled}</span> cancelled</span>}
            {stats.avgDurationMs > 0 && <span>avg <span className="text-text font-medium">{fmtDuration(stats.avgDurationMs)}</span></span>}
            {cost && <span>spend <span className="text-text font-medium">{cost}</span></span>}
            <span className="text-text-muted/60">· {stats.total} runs</span>
          </div>
        )
      })()}

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

      {!loading && !loadError && shown.length > 0 && view === 'table' && (
        <ScheduleActivityTable runs={shown} scheduleName={scheduleName} scheduleOf={scheduleOf} onRunNow={onRunNow} onOpenSchedule={onOpenSchedule} />
      )}

      {!loading && !loadError && view === 'cards' && grouped.map(({ run, count, oldest }) => {
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
                  {count > 1 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red/15 text-red" title={`Failed ${count} times in a row`}>×{count}</span>}
                  {isSystem && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple/15 text-purple">system</span>}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span title={run.agentName}>{formatAgentDisplay({ name: run.agentName, id: run.agentName }).realName}</span>
                  <span className="text-border">·</span>
                  <span>{count > 1 ? `${count}× since ${timeAgo(oldest)}` : timeAgo(run.timestamp)}</span>
                  {count === 1 && run.duration > 0 && <><span className="text-border">·</span><span>{fmtDuration(run.duration)}</span></>}
                  {count === 1 && cost && <><span className="text-border">·</span><span>{fmtCost(cost.value)}</span></>}
                </div>
                {why && !open && <div className="text-[11px] text-red truncate mt-0.5">{why}</div>}
              </div>
            </button>
            {open && <RunDetail run={run} schedule={scheduleOf(run)} onRunNow={onRunNow} onOpenSchedule={onOpenSchedule} />}
          </div>
        )
      })}

      {!loading && !loadError && hasMore && (
        <div className="flex justify-center pt-1">
          <button onClick={loadMore} disabled={loadingMore} className="btn-secondary btn-sm">
            {loadingMore ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</> : `Load more (${total - runs.length} remaining)`}
          </button>
        </div>
      )}
      {!loading && !loadError && shown.length > 0 && !hasMore && (
        <p className="text-[11px] text-text-muted text-center pt-1">All {total} runs loaded.</p>
      )}
    </div>
  )
}
