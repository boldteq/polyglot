import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  CheckCircle,
  XCircle,
  DollarSign,
  Clock,
  Zap,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Search,
} from 'lucide-react'
import { getAnalyticsSummary, getRoutingSavings, getHrRegistry, getFleetHealth } from '../lib/api'
import type { AgentAnalyticsSummary, RoutingSavings, RegistryCounts, FleetHealth } from '../lib/api'
import { ErrorState } from '../components/ErrorState'
import { useAppConfig } from '../hooks/useAppConfig'
import { getHealthColor, getHealthBg, getHealthLabel, getHealthBar } from '../lib/colors'

type SortKey = 'cost' | 'runs' | 'success' | 'duration'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(5)}`
  return `$${cost.toFixed(4)}`
}

export default function AgentHealth() {
  const { config } = useAppConfig()
  const thresholds = { healthy: config.health.threshold_healthy, degraded: config.health.threshold_degraded }
  const [summary, setSummary] = useState<AgentAnalyticsSummary>({})
  const [savings, setSavings] = useState<RoutingSavings | null>(null)
  const [registryCounts, setRegistryCounts] = useState<RegistryCounts | null>(null)
  const [fleetHealth, setFleetHealth] = useState<FleetHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('cost')
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    Promise.all([
      // getAnalyticsSummary is the critical fetch — let it reject so a backend
      // outage shows an error state instead of an all-zeros fleet (C19 audit).
      getAnalyticsSummary(),
      getRoutingSavings().catch(() => null),
      getHrRegistry().catch((err) => {
        console.error('[agent-health] hr registry fetch failed:', err?.message ?? err)
        return null
      }),
      getFleetHealth().catch((err) => {
        console.error('[agent-health] fleet health fetch failed:', err?.message ?? err)
        return null
      }),
    ]).then(([s, r, reg, fh]) => {
      if (cancelled) return
      setSummary(s)
      setSavings(r)
      setRegistryCounts(reg?.counts ?? null)
      setFleetHealth(fh ?? null)
    }).catch((err) => {
      if (cancelled) return
      console.error('[agent-health] summary fetch failed:', err?.message ?? err)
      setLoadError(true)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadTick])

  const agents = useMemo(() => {
    return Object.entries(summary)
      .filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))
      .sort(([, a], [, b]) => {
        let diff = 0
        if (sortBy === 'cost') diff = a.totalEstimatedCost - b.totalEstimatedCost
        else if (sortBy === 'runs') diff = a.runCount - b.runCount
        else if (sortBy === 'success') diff = a.successRate - b.successRate
        else if (sortBy === 'duration') diff = a.avgDuration - b.avgDuration
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
    if (sortBy === key) setDesc(!sortDesc)
    else { setSortBy(key); setSortDesc(true) }
  }

  function setDesc(v: boolean) { setSortDesc(v) }

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortBy === k
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${active ? 'text-accent' : 'text-text-muted hover:text-text'}`}
      >
        {label}
        {active && (sortDesc ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />)}
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
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" /> Agent Health
        </h1>
        <p className="text-text-muted text-sm mt-1">Fleet status, cost breakdown, and performance by agent</p>
      </div>

      {/* Fleet summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Total Agents</div>
          <div className="text-2xl font-bold">{fleet.total}</div>
        </div>
        <div className="bg-surface rounded-xl border border-green-500/20 p-4">
          <div className="text-[10px] text-green-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Healthy
          </div>
          <div className="text-2xl font-bold text-green-400">{fleet.healthy}</div>
        </div>
        <div className="bg-surface rounded-xl border border-yellow-500/20 p-4">
          <div className="text-[10px] text-yellow-400 uppercase tracking-wider mb-1">Degraded</div>
          <div className="text-2xl font-bold text-yellow-400">{fleet.degraded}</div>
        </div>
        <div className="bg-surface rounded-xl border border-red-500/20 p-4">
          <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Critical
          </div>
          <div className="text-2xl font-bold text-red-400">{fleet.critical}</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Fleet Cost
          </div>
          <div className="text-2xl font-bold">{formatCost(fleet.totalCost)}</div>
        </div>
      </div>

      {/* Routing savings banner */}
      {savings && savings.savings > 0 && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-green-400">{savings.savings}% API Cost Savings via Model Routing</div>
            <div className="text-xs text-text-muted mt-0.5">
              Routed cost: {formatCost(savings.routedCost)} vs. all-Opus: {formatCost(savings.allOpusCost)} — across {savings.totalRuns.toLocaleString()} runs
            </div>
          </div>
          <Zap className="w-8 h-8 text-green-400/30" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-xs placeholder-text-muted focus:outline-none focus:border-accent/50"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          Sort by:
          <SortBtn k="cost" label="Cost" />
          <SortBtn k="runs" label="Runs" />
          <SortBtn k="success" label="Success %" />
          <SortBtn k="duration" label="Avg Time" />
        </div>
      </div>

      {/* Agent grid */}
      {agents.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center text-text-muted">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No agent data yet. Run some agents to see health metrics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(([name, data]) => (
            <div
              key={name}
              className={`bg-surface rounded-xl border p-4 space-y-3 transition-all hover:shadow-md ${getHealthBg(data.successRate, thresholds)}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{name}</h3>
                  <span className={`text-[10px] font-medium ${getHealthColor(data.successRate, thresholds)}`}>
                    {getHealthLabel(data.successRate, thresholds)}
                  </span>
                </div>
                <Link
                  to={`/agents/${name}/training`}
                  className="shrink-0 text-[10px] text-accent hover:text-accent-hover flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" /> Train
                </Link>
              </div>

              {/* Success rate bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-text-muted">Success rate</span>
                  <span className={`text-[11px] font-bold ${getHealthColor(data.successRate, thresholds)}`}>{data.successRate}%</span>
                </div>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getHealthBar(data.successRate, thresholds)}`}
                    style={{ width: `${data.successRate}%` }}
                  />
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-surface/60 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-text-muted mb-0.5">
                    <Zap className="w-3 h-3" />
                  </div>
                  <div className="text-xs font-bold">{data.runCount}</div>
                  <div className="text-[9px] text-text-muted">Runs</div>
                </div>
                <div className="bg-surface/60 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-text-muted mb-0.5">
                    <Clock className="w-3 h-3" />
                  </div>
                  <div className="text-xs font-bold">{formatDuration(data.avgDuration)}</div>
                  <div className="text-[9px] text-text-muted">Avg time</div>
                </div>
                <div className="bg-surface/60 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-1 text-text-muted mb-0.5">
                    <DollarSign className="w-3 h-3" />
                  </div>
                  <div className="text-xs font-bold">{formatCost(data.totalEstimatedCost)}</div>
                  <div className="text-[9px] text-text-muted">Total cost</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {agents.length > 0 && (
        <p className="text-[11px] text-text-muted text-center">
          Showing {agents.length} agent{agents.length !== 1 ? 's' : ''} · {fleet.totalRuns.toLocaleString()} total runs
        </p>
      )}
    </div>
  )
}
