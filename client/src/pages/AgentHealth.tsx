import { useState, useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CheckCircle,
  XCircle,
  DollarSign,
  Clock,
  Zap,
  BookOpen,
  Search,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  X,
} from 'lucide-react'
import { getAnalyticsSummary, getRoutingSavings, getHrRegistry, getFleetHealth } from '../lib/api'
import type { AgentAnalyticsSummary, RoutingSavings, RegistryCounts, FleetHealth } from '../lib/api'
import { resource } from '../lib/cacheCore'
import { CacheKeys } from '../lib/cacheKeys'
import { ErrorState } from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import { useAppConfig } from '../hooks/useAppConfig'
import { getHealthColor, getHealthBar, getHealthLabel } from '../lib/colors'

type SortKey = 'cost' | 'runs' | 'success' | 'duration' | 'tokens'

// One row of summary data, keyed by agent name (the summary map's value type).
type AgentSummary = AgentAnalyticsSummary[string]
type AgentRow = [name: string, data: AgentSummary]

const REFRESH_MS = 30_000

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(5)}`
  return `$${cost.toFixed(4)}`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

export default function AgentHealth() {
  const { config } = useAppConfig()
  // Memoized so its identity is stable across unrelated re-renders (search/sort/
  // cursor) and the fleet/health calcs only recompute when thresholds change.
  const thresholds = useMemo(
    () => ({ healthy: config.health.threshold_healthy, degraded: config.health.threshold_degraded }),
    [config.health.threshold_healthy, config.health.threshold_degraded],
  )
  // Cached resources (summary/savings/registry shared with Dashboard & Analytics).
  const summaryRes = resource('analytics/summary', getAnalyticsSummary)
  const savingsRes = resource('routing/savings', () => getRoutingSavings().catch(() => null))
  const registryRes = resource(CacheKeys.hrRegistry, getHrRegistry)
  const fleetRes = resource('fleet/health', () => getFleetHealth().catch(() => null))

  const [summary, setSummary] = useState<AgentAnalyticsSummary>(() => summaryRes.getState().data ?? {})
  const [savings, setSavings] = useState<RoutingSavings | null>(() => savingsRes.getState().data ?? null)
  const [registryCounts, setRegistryCounts] = useState<RegistryCounts | null>(() => registryRes.getState().data?.counts ?? null)
  const [fleetHealth, setFleetHealth] = useState<FleetHealth | null>(() => fleetRes.getState().data ?? null)
  const [loading, setLoading] = useState(() => summaryRes.getState().data === null)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('cost')
  const [sortDesc, setSortDesc] = useState(true)
  const [cursorIdx, setCursorIdx] = useState(-1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    if (summaryRes.getState().data === null) setLoading(true)
    setRefreshing(true)
    if (reloadTick === 0) setLoadError(false)
    Promise.all([
      // getAnalyticsSummary is the critical fetch — let it reject so a backend
      // outage shows an error state instead of an all-zeros fleet (C19 audit).
      summaryRes.refetch(),
      savingsRes.refetch(),
      registryRes.refetch().catch((err) => {
        console.error('[agent-health] hr registry fetch failed:', err?.message ?? err)
        return null
      }),
      fleetRes.refetch().catch((err) => {
        console.error('[agent-health] fleet health fetch failed:', err?.message ?? err)
        return null
      }),
    ]).then(([s, r, reg, fh]) => {
      if (cancelled) return
      setSummary(s)
      setSavings(r)
      setRegistryCounts(reg?.counts ?? null)
      setFleetHealth(fh ?? null)
      setLoadError(false)
    }).catch((err) => {
      if (cancelled) return
      console.error('[agent-health] summary fetch failed:', err?.message ?? err)
      setLoadError(true)
    }).finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick])

  // 30s auto-refresh — mirrors SystemHealth's setInterval poll (but 30s).
  useEffect(() => {
    const id = setInterval(() => setReloadTick(t => t + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  const agents = useMemo<AgentRow[]>(() => {
    return Object.entries(summary)
      .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
      .sort(([, a], [, b]) => {
        let diff = 0
        if (sortBy === 'cost') diff = a.totalEstimatedCost - b.totalEstimatedCost
        else if (sortBy === 'runs') diff = a.runCount - b.runCount
        else if (sortBy === 'success') diff = a.successRate - b.successRate
        else if (sortBy === 'duration') diff = a.avgDuration - b.avgDuration
        else if (sortBy === 'tokens') diff = a.totalTokens - b.totalTokens
        return sortDesc ? -diff : diff
      })
  }, [summary, search, sortBy, sortDesc])

  const fleet = useMemo(() => {
    const all = Object.values(summary)
    const total = fleetHealth?.total ?? registryCounts?.total ?? all.length
    return {
      total,
      healthy: fleetHealth?.healthy ?? all.filter(a => a.successRate >= thresholds.healthy).length,
      degraded: fleetHealth?.degraded ?? all.filter(a => a.successRate >= thresholds.degraded && a.successRate < thresholds.healthy).length,
      critical: fleetHealth?.critical ?? all.filter(a => a.successRate < thresholds.degraded).length,
      totalCost: all.reduce((s, a) => s + a.totalEstimatedCost, 0),
      totalRuns: all.reduce((s, a) => s + a.runCount, 0),
    }
  }, [summary, registryCounts, fleetHealth, thresholds.healthy, thresholds.degraded])

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDesc(!sortDesc)
    else { setSortBy(key); setSortDesc(true) }
  }

  // Keyboard row navigation — Up/Down moves the cursor, Enter toggles expand.
  // Ignored while typing in the search box.
  function onTableKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (document.activeElement === searchRef.current) return
    if (agents.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursorIdx(i => Math.min(i < 0 ? 0 : i + 1, agents.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursorIdx(i => Math.max((i < 0 ? 0 : i) - 1, 0))
    } else if (e.key === 'Enter' && cursorIdx >= 0 && cursorIdx < agents.length) {
      e.preventDefault()
      const name = agents[cursorIdx][0]
      setExpanded(cur => (cur === name ? null : name))
    }
  }

  // Keep the cursor in range when the filtered set shrinks.
  useEffect(() => {
    if (cursorIdx >= agents.length) setCursorIdx(agents.length - 1)
  }, [agents.length, cursorIdx])

  function SortHeader({ k, label }: { k: SortKey; label: string }) {
    const active = sortBy === k
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`flex items-center gap-1 ml-auto text-[11px] font-semibold rounded px-1 -mx-1 transition-colors active:ring-1 active:ring-accent/40 ${active ? 'text-accent' : 'text-text-muted hover:text-text'}`}
      >
        {label}
        {active && (sortDesc ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
      </button>
    )
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return <ErrorState message="Agent health metrics failed to load." onRetry={() => setReloadTick(t => t + 1)} />

  return (
    <div className="space-y-6">
      {/* Auto-refresh indicator — hub provides the page title */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted shrink-0">
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin text-accent' : ''}`} />
          auto-refreshes every 30s
        </div>
      </div>

      {/* Fleet summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card p-4">
          <div className="text-[10px] text-text-muted mb-1">Total Agents</div>
          <div className="text-2xl font-bold">{fleet.total}</div>
        </div>
        <div className="bg-surface rounded-xl border border-green/20 p-4">
          <div className="text-[10px] text-green mb-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Healthy
          </div>
          <div className="text-2xl font-bold text-green">{fleet.healthy}</div>
        </div>
        <div className="bg-surface rounded-xl border border-amber/20 p-4">
          <div className="text-[10px] text-amber mb-1">Degraded</div>
          <div className="text-2xl font-bold text-amber">{fleet.degraded}</div>
        </div>
        <div className="bg-surface rounded-xl border border-red/20 p-4">
          <div className="text-[10px] text-red mb-1 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Critical
          </div>
          <div className="text-2xl font-bold text-red">{fleet.critical}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-text-muted mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Fleet Cost
          </div>
          <div className="text-2xl font-bold">{formatCost(fleet.totalCost)}</div>
        </div>
      </div>

      {/* Routing savings banner */}
      {savings && savings.savings > 0 && (
        <div className="bg-green-muted border border-green/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-green">{savings.savings}% API Cost Savings via Model Routing</div>
            <div className="text-xs text-text-muted mt-0.5">
              Routed cost: {formatCost(savings.routedCost)} vs. all-Opus: {formatCost(savings.allOpusCost)} — across {savings.totalRuns.toLocaleString()} runs
            </div>
          </div>
          <Zap className="w-8 h-8 text-green/30" />
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted z-10" aria-hidden="true" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search agents..."
          aria-label="Search agents by name"
          className={`input pl-8 ${search ? 'pr-8' : ''}`}
        />
        {search && (
          <button
            onClick={() => { setSearch(''); searchRef.current?.focus() }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text z-10"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Agent table */}
      {agents.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={search ? `No agents match “${search}”` : 'No agent data yet'}
          description={search ? undefined : 'Run some agents to see health metrics.'}
          card
        />
      ) : (
        <div
          className="rounded-xl border border-border overflow-x-auto focus:outline-none"
          tabIndex={0}
          role="grid"
          aria-label="Agent health metrics"
          onKeyDown={onTableKeyDown}
        >
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border text-text-muted">
                <th className="text-left font-semibold text-[11px] px-3 py-2.5 w-32">Health</th>
                <th className="text-left font-semibold text-[11px] px-3 py-2.5">Agent</th>
                <th className="px-3 py-2.5"><SortHeader k="success" label="Success %" /></th>
                <th className="px-3 py-2.5"><SortHeader k="runs" label="Runs" /></th>
                <th className="px-3 py-2.5"><SortHeader k="duration" label="Avg time" /></th>
                <th className="px-3 py-2.5"><SortHeader k="cost" label="Cost" /></th>
                <th className="px-3 py-2.5"><SortHeader k="tokens" label="Tokens" /></th>
                <th className="px-3 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {agents.map(([name, data], idx) => {
                const focused = idx === cursorIdx
                const isOpen = expanded === name
                const healthColor = getHealthColor(data.successRate, thresholds)
                return (
                  <FragmentRow
                    key={name}
                    name={name}
                    data={data}
                    idx={idx}
                    focused={focused}
                    isOpen={isOpen}
                    healthColor={healthColor}
                    healthBar={getHealthBar(data.successRate, thresholds)}
                    healthLabel={getHealthLabel(data.successRate, thresholds)}
                    onToggle={() => { setCursorIdx(idx); setExpanded(cur => (cur === name ? null : name)) }}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {agents.length > 0 && (
        <p className="text-[11px] text-text-muted text-center">
          Showing {agents.length} agent{agents.length !== 1 ? 's' : ''} · {fleet.totalRuns.toLocaleString()} total runs · ↑/↓ to navigate, Enter to expand
        </p>
      )}
    </div>
  )
}

function FragmentRow({
  name, data, idx, focused, isOpen, healthColor, healthBar, healthLabel, onToggle,
}: {
  name: string
  data: AgentSummary
  idx: number
  focused: boolean
  isOpen: boolean
  healthColor: string
  healthBar: string
  healthLabel: string
  onToggle: () => void
}) {
  return (
    <>
      <tr
        role="row"
        aria-selected={focused}
        aria-expanded={isOpen}
        onClick={onToggle}
        className={`border-b border-border/60 cursor-pointer transition-colors ${
          focused ? 'bg-surface-2 ring-2 ring-inset ring-accent/50' : idx % 2 ? 'bg-surface' : 'bg-surface/40'
        } hover:bg-surface-2`}
      >
        <td className="px-3 py-2.5">
          <span className="inline-flex items-center gap-2" role="img" aria-label={`${healthLabel} status`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${healthBar}`} aria-hidden="true" />
            <span className={`text-[11px] font-medium ${healthColor}`}>{healthLabel}</span>
          </span>
        </td>
        <td className="px-3 py-2.5 font-semibold truncate max-w-[14rem]">{name}</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${healthColor}`}>{data.successRate}%</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{data.runCount.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">{formatDuration(data.avgDuration)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatCost(data.totalEstimatedCost)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-text-muted">{formatTokens(data.totalTokens)}</td>
        <td className="px-3 py-2.5 text-center text-text-muted">
          {isOpen ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-surface-2 border-b border-border">
          <td colSpan={8} className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${healthBar}`} />
                <span className="font-semibold">{name}</span>
                <span className={`text-[11px] font-medium ${healthColor}`}>· {healthLabel}</span>
              </div>
              <Link
                to={`/agents/${name}/training`}
                onClick={e => e.stopPropagation()}
                className="text-[11px] text-accent hover:text-accent-hover flex items-center gap-1"
              >
                <BookOpen className="w-3 h-3" /> Train
              </Link>
            </div>
            {/* Success rate bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-text-muted ">Success rate</span>
                <span className={`text-[11px] font-bold ${healthColor}`}>{data.successRate}%</span>
              </div>
              <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${healthBar}`}
                  style={{ width: `${data.successRate}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat icon={<Zap className="w-3.5 h-3.5" />} label="Runs" value={data.runCount.toLocaleString()} />
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Avg time" value={formatDuration(data.avgDuration)} />
              <Stat icon={<DollarSign className="w-3.5 h-3.5" />} label="Total cost" value={formatCost(data.totalEstimatedCost)} />
              <Stat icon={<Activity className="w-3.5 h-3.5" />} label="Total tokens" value={data.totalTokens.toLocaleString()} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-text-muted mb-1">
        {icon}
        <span className="text-[10px] ">{label}</span>
      </div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  )
}
