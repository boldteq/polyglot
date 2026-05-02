import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  Clock,
  DollarSign,
  Zap,
  CheckCircle,
  XCircle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react'
import { getAnalyticsRuns, getAnalyticsSummary, getRoutingSavings } from '../lib/api'
import type { AgentRunEntry, AgentAnalyticsSummary, RoutingSavings } from '../lib/api'

type TimeRange = '1d' | '7d' | '30d' | 'all'

import { SOURCE_COLORS } from '../lib/constants'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function rangeMs(range: TimeRange): number {
  if (range === '1d') return 86400000
  if (range === '7d') return 7 * 86400000
  if (range === '30d') return 30 * 86400000
  return Infinity
}

function buildDailyTrend(
  runs: AgentRunEntry[],
  days: number,
): { label: string; success: number; error: number; total: number }[] {
  const now = Date.now()
  return Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i
    const start = now - offset * 86400000
    const end = start + 86400000
    const dr = runs.filter(r => {
      const t = new Date(r.timestamp).getTime()
      return t >= start && t < end
    })
    return {
      label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      success: dr.filter(r => r.status === 'success').length,
      error: dr.filter(r => r.status === 'error').length,
      total: dr.length,
    }
  })
}

export default function Analytics() {
  const [summary, setSummary] = useState<AgentAnalyticsSummary>({})
  const [allRuns, setAllRuns] = useState<AgentRunEntry[]>([])
  const [savings, setSavings] = useState<RoutingSavings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [range, setRange] = useState<TimeRange>('7d')

  const loadData = () => {
    setLoading(true)
    setLoadError(false)
    Promise.all([
      getAnalyticsSummary(),
      getAnalyticsRuns({ limit: 500 }),
      getRoutingSavings().catch(() => null),
    ]).then(([s, r, sv]) => {
      setSummary(s)
      setAllRuns(r.runs)
      setSavings(sv)
    }).catch(() => {
      setLoadError(true)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const runs = useMemo(() => {
    const ms = rangeMs(range)
    if (ms === Infinity) return allRuns
    const cutoff = Date.now() - ms
    return allRuns.filter(r => new Date(r.timestamp).getTime() >= cutoff)
  }, [allRuns, range])

  const stats = useMemo(() => {
    const totalCost = runs.reduce((s, r) => s + (r.estimatedCost || 0), 0)
    const avgDuration = runs.length > 0 ? runs.reduce((s, r) => s + r.duration, 0) / runs.length : 0
    const successCount = runs.filter(r => r.status === 'success').length
    return {
      total: runs.length,
      totalCost,
      avgDuration,
      successRate: runs.length > 0 ? Math.round((successCount / runs.length) * 100) : 100,
    }
  }, [runs])

  const topAgents = useMemo(() =>
    Object.entries(summary).sort(([, a], [, b]) => b.runCount - a.runCount).slice(0, 8),
    [summary])

  const maxRuns = topAgents[0]?.[1]?.runCount || 1

  // Per-agent cost drill-down from current range
  const agentCosts = useMemo(() => {
    const map: Record<string, { cost: number; runs: number; success: number }> = {}
    for (const r of runs) {
      if (!map[r.agentName]) map[r.agentName] = { cost: 0, runs: 0, success: 0 }
      map[r.agentName].cost += r.estimatedCost || 0
      map[r.agentName].runs++
      if (r.status === 'success') map[r.agentName].success++
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b.cost - a.cost)
      .slice(0, 10)
  }, [runs])

  const sourceCounts = useMemo(() => {
    const counts: Record<string, { success: number; error: number }> = {}
    for (const r of runs) {
      if (!counts[r.source]) counts[r.source] = { success: 0, error: 0 }
      counts[r.source][r.status === 'success' ? 'success' : 'error']++
    }
    return Object.entries(counts).sort(([, a], [, b]) => (b.success + b.error) - (a.success + a.error))
  }, [runs])

  const trendDays = range === '1d' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 14
  const trend = useMemo(() => buildDailyTrend(allRuns, trendDays), [allRuns, trendDays])
  const maxTrend = Math.max(...trend.map(d => d.total), 1)

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="p-8 flex flex-col items-center justify-center h-64 gap-4 text-center">
      <p className="text-sm text-text-muted">Failed to load analytics data.</p>
      <button
        onClick={loadData}
        className="px-4 py-2 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
      >
        Retry
      </button>
    </div>
  )

  const RANGES: { v: TimeRange; label: string }[] = [
    { v: '1d', label: 'Today' },
    { v: '7d', label: '7 days' },
    { v: '30d', label: '30 days' },
    { v: 'all', label: 'All time' },
  ]

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      {/* Header + range selector */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agent Analytics</h1>
          <p className="text-text-muted text-sm mt-1">Usage, performance, and cost tracking across all agent runs</p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {RANGES.map(r => (
            <button
              key={r.v}
              onClick={() => setRange(r.v)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${range === r.v ? 'bg-accent text-white' : 'text-text-muted hover:text-text'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs mb-2">
            <Zap className="w-3.5 h-3.5" /> Total Runs
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs mb-2">
            <BarChart3 className="w-3.5 h-3.5" /> Success Rate
          </div>
          <div className={`text-2xl font-bold ${stats.successRate >= 90 ? 'text-green-400' : stats.successRate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {stats.successRate}%
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs mb-2">
            <DollarSign className="w-3.5 h-3.5" /> Total Cost
          </div>
          <div className="text-2xl font-bold">${stats.totalCost.toFixed(4)}</div>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-text-muted text-xs mb-2">
            <Clock className="w-3.5 h-3.5" /> Avg Duration
          </div>
          <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
        </div>
      </div>

      {/* Run volume bar chart */}
      {trendDays > 1 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Run Volume</h2>
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent inline-block" /> success</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" /> error</span>
            </div>
          </div>
          <div className="flex items-end gap-1.5" style={{ height: '100px' }}>
            {trend.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="w-full flex flex-col justify-end gap-px" style={{ height: '80px' }}>
                  {day.total > 0 ? (
                    <>
                      <div
                        className="w-full bg-red-500/70 rounded-sm transition-all"
                        style={{ height: `${(day.error / maxTrend) * 80}px` }}
                      />
                      <div
                        className="w-full bg-accent rounded-sm transition-all"
                        style={{ height: `${(day.success / maxTrend) * 80}px` }}
                      />
                    </>
                  ) : (
                    <div className="w-full bg-surface-2 rounded-sm" style={{ height: '3px' }} />
                  )}
                </div>
                {/* Tooltip */}
                {day.total > 0 && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-2 border border-border rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {day.total} runs
                  </div>
                )}
                {trendDays <= 14 && (
                  <span className="text-[9px] text-text-muted truncate w-full text-center">{day.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Routing savings */}
      {savings && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" /> Model Routing Savings
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] text-text-muted mb-1">Actual cost (routed)</div>
              <div className="text-xl font-bold">${savings.routedCost.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted mb-1">Without routing (all-Opus)</div>
              <div className="text-xl font-bold text-text-muted line-through">${savings.allOpusCost.toFixed(4)}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted mb-1">Saved</div>
              <div className={`text-xl font-bold ${savings.savings > 0 ? 'text-green-400' : 'text-text-muted'}`}>
                {savings.savings > 0 ? `${savings.savings}%` : 'N/A'}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <Zap className="w-3.5 h-3.5" />
            Across {savings.totalRuns.toLocaleString()} total runs
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Agents by usage */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Top Agents by Usage</h2>
          <div className="space-y-3">
            {topAgents.map(([name, data]) => (
              <div key={name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{name}</span>
                  <span className="text-text-muted shrink-0 ml-2">{data.runCount} runs · {data.successRate}%</span>
                </div>
                <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all"
                    style={{ width: `${(data.runCount / maxRuns) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {topAgents.length === 0 && <p className="text-text-muted text-xs">No agent runs yet</p>}
          </div>
          <Link to="/hr" className="mt-4 flex items-center gap-1 text-xs text-accent hover:text-accent-hover">
            View agent registry <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* By Source */}
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4">Runs by Source</h2>
          <div className="space-y-2">
            {sourceCounts.map(([source, counts]) => (
              <div key={source} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${SOURCE_COLORS[source] || 'bg-surface-2 text-text-muted'}`}>
                  {source}
                </span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle className="w-3 h-3" /> {counts.success}
                  </span>
                  <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-3 h-3" /> {counts.error}
                  </span>
                  <span className="text-text-muted w-12 text-right">
                    {Math.round((counts.success / (counts.success + counts.error)) * 100)}%
                  </span>
                </div>
              </div>
            ))}
            {sourceCounts.length === 0 && <p className="text-text-muted text-xs">No runs yet</p>}
          </div>
        </div>
      </div>

      {/* Per-agent cost breakdown */}
      {agentCosts.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Cost by Agent
            <span className="text-xs font-normal text-text-muted ml-1">(sorted by total spend)</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium">Agent</th>
                  <th className="text-right py-2 pr-4 font-medium">Runs</th>
                  <th className="text-right py-2 pr-4 font-medium">Success</th>
                  <th className="text-right py-2 pr-4 font-medium">Total Cost</th>
                  <th className="text-right py-2 font-medium">Cost/Run</th>
                </tr>
              </thead>
              <tbody>
                {agentCosts.map(([name, data]) => (
                  <tr key={name} className="border-b border-border/50 hover:bg-surface-2/50">
                    <td className="py-2 pr-4 font-medium">{name}</td>
                    <td className="py-2 pr-4 text-right text-text-muted">{data.runs}</td>
                    <td className="py-2 pr-4 text-right">
                      <span className={data.runs > 0 && (data.success / data.runs) >= 0.9 ? 'text-green-400' : 'text-yellow-400'}>
                        {data.runs > 0 ? Math.round((data.success / data.runs) * 100) : 0}%
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-medium">${data.cost.toFixed(4)}</td>
                    <td className="py-2 text-right text-text-muted">
                      ${data.runs > 0 ? (data.cost / data.runs).toFixed(5) : '0.00000'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Runs table */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Recent Runs</h2>
          <Link to="/analytics" className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
            Full history <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted border-b border-border">
                <th className="text-left py-2 pr-4 font-medium">Agent</th>
                <th className="text-left py-2 pr-4 font-medium">Source</th>
                <th className="text-left py-2 pr-4 font-medium">Status</th>
                <th className="text-right py-2 pr-4 font-medium">Duration</th>
                <th className="text-right py-2 pr-4 font-medium">Tokens</th>
                <th className="text-right py-2 pr-4 font-medium">Cost</th>
                <th className="text-right py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 20).map((run) => (
                <tr key={run.id} className="border-b border-border/50 hover:bg-surface-2/50">
                  <td className="py-2 pr-4 font-medium">{run.agentName}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[run.source] || ''}`}>
                      {run.source}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {run.status === 'success'
                      ? <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> ok</span>
                      : <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> err</span>
                    }
                  </td>
                  <td className="py-2 pr-4 text-right text-text-muted">{formatDuration(run.duration)}</td>
                  <td className="py-2 pr-4 text-right text-text-muted">{run.estimatedTokens.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right text-text-muted">${run.estimatedCost.toFixed(4)}</td>
                  <td className="py-2 text-right text-text-muted">{timeAgo(run.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && (
            <p className="text-text-muted text-center py-8">
              No runs in this time range. {range !== 'all' && <button onClick={() => setRange('all')} className="text-accent underline">View all time</button>}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
