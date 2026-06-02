import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bot,
  FolderOpen,
  Sparkles,
  FlaskConical,
  Activity,
  CheckCircle,
  XCircle,
  ArrowRight,
  DollarSign,
  Zap,
  TrendingUp,
  Heart,
} from 'lucide-react'
import type { Project } from '../types'
import {
  getAnalyticsRuns,
  getAnalyticsSummary,
  getSchedules,
  getRoutingSavings,
  getHrRegistry,
} from '../lib/api'
import type {
  AgentRunEntry,
  AgentAnalyticsSummary,
  Schedule,
  RoutingSavings,
  RegistryCounts,
} from '../lib/api'

interface Props {
  projects: Project[]
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

import { SOURCE_COLORS } from '../lib/constants'
import { useAppConfig } from '../hooks/useAppConfig'

function healthColor(rate: number, healthy: number, degraded: number): string {
  if (rate >= healthy) return 'text-green'
  if (rate >= degraded) return 'text-amber'
  return 'text-red'
}

// Groups runs by day offset (0=today, 1=yesterday, ...) for 7 days
function buildTrend(runs: AgentRunEntry[]): { label: string; success: number; error: number; total: number }[] {
  const days: { label: string; success: number; error: number; total: number }[] = []
  const now = Date.now()
  for (let i = 6; i >= 0; i--) {
    const dayStart = now - i * 86400000
    const dayEnd = dayStart + 86400000
    const dayRuns = runs.filter(r => {
      const t = new Date(r.timestamp).getTime()
      return t >= dayStart && t < dayEnd
    })
    const d = new Date(dayStart)
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      success: dayRuns.filter(r => r.status === 'success').length,
      error: dayRuns.filter(r => r.status === 'error').length,
      total: dayRuns.length,
    })
  }
  return days
}

export default function Dashboard({ projects }: Props) {
  const navigate = useNavigate()
  const { config } = useAppConfig()
  const healthy = config.health.threshold_healthy
  const degraded = config.health.threshold_degraded
  const runsLimit = config.api_limits.runs_dashboard
  const recentRunsCap = config.ui_caps.recent_runs
  const topAgentsCap = config.ui_caps.top_agents
  const [runs, setRuns] = useState<AgentRunEntry[]>([])
  const [summary, setSummary] = useState<AgentAnalyticsSummary>({})
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [savings, setSavings] = useState<RoutingSavings | null>(null)
  const [registryCounts, setRegistryCounts] = useState<RegistryCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const loadData = () => {
    setLoading(true)
    setLoadError(false)
    Promise.all([
      getAnalyticsRuns({ limit: runsLimit }),
      getAnalyticsSummary(),
      getSchedules(),
      getRoutingSavings().catch(() => null),
      getHrRegistry().catch((err) => {
        console.error('[dashboard] hr registry fetch failed:', err?.message ?? err)
        return null
      }),
    ]).then(([r, s, sc, sv, reg]) => {
      setRuns(r.runs)
      setSummary(s)
      setSchedules(sc)
      setSavings(sv)
      setRegistryCounts(reg?.counts ?? null)
    }).catch(() => {
      setLoadError(true)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [runsLimit])

  const todayRuns = useMemo(() =>
    runs.filter(r => Date.now() - new Date(r.timestamp).getTime() < 86400000), [runs])

  const successRate = todayRuns.length > 0
    ? Math.round(todayRuns.filter(r => r.status === 'success').length / todayRuns.length * 100)
    : 100

  const activeSchedules = schedules.filter(s => s.enabled).length

  const topAgents = useMemo(() =>
    Object.entries(summary ?? {}).sort(([, a], [, b]) => b.runCount - a.runCount).slice(0, topAgentsCap),
    [summary, topAgentsCap])

  const trend = useMemo(() => buildTrend(runs), [runs])
  const maxTrend = Math.max(...trend.map(d => d.total), 1)

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="p-8 flex flex-col items-center justify-center h-64 gap-4 text-center">
      <p className="text-sm text-text-muted">Failed to load dashboard data.</p>
      <button
        onClick={loadData}
        className="px-4 py-2 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
      >
        Retry
      </button>
    </div>
  )

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-xs text-text-muted mt-0.5">Agent operations at a glance</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Run Agent', icon: FlaskConical, path: '/playground', color: 'text-purple-400', bg: 'bg-purple-500/10' },
          { label: 'Orchestrate', icon: Sparkles, path: '/orchestration', color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Agents', icon: Bot, path: '/agents', color: 'text-accent', bg: 'bg-accent/10', sub: `${registryCounts?.active ?? Object.keys(summary).length} active` },
          { label: 'Projects', icon: FolderOpen, path: '/settings', color: 'text-amber-400', bg: 'bg-amber-500/10', sub: `${projects.length}` },
        ].map(q => (
          <button
            key={q.label}
            onClick={() => navigate(q.path)}
            className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3 hover:border-accent/20 transition-all text-left group"
          >
            <div className={`p-2 rounded-lg ${q.bg} ${q.color}`}>
              <q.icon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-semibold group-hover:text-accent-hover transition-colors">{q.label}</span>
              {q.sub && <p className="text-[10px] text-text-muted">{q.sub}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Today stats */}
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Today</span>
            <Link to="/analytics" className="text-[10px] text-accent hover:text-accent-hover">View all</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-2xl font-bold">{todayRuns.length}</div>
              <div className="text-[10px] text-text-muted">Runs</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${successRate >= healthy ? 'text-green' : successRate >= degraded ? 'text-amber' : 'text-red'}`}>{successRate}%</div>
              <div className="text-[10px] text-text-muted">Success</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{activeSchedules}</div>
              <div className="text-[10px] text-text-muted">Schedules</div>
            </div>
          </div>
        </div>

        {/* Top agents with health bars */}
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Top Agents</span>
            <Link to="/hr" className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
              <Heart className="w-3 h-3" /> Registry
            </Link>
          </div>
          <div className="space-y-2">
            {topAgents.length > 0 ? topAgents.map(([name, data]) => (
              <div key={name} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate max-w-[120px]">{name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-text-muted">{data.runCount}</span>
                    <span className={`text-[10px] font-semibold ${healthColor(data.successRate, healthy, degraded)}`}>{data.successRate}%</span>
                  </div>
                </div>
                <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${data.successRate >= healthy ? 'bg-green' : data.successRate >= degraded ? 'bg-amber' : 'bg-red'}`}
                    style={{ width: `${data.successRate}%` }}
                  />
                </div>
              </div>
            )) : (
              <p className="text-[11px] text-text-muted">No runs yet</p>
            )}
          </div>
        </div>

        {/* Cost & savings */}
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Cost & Savings</span>
            <Link to="/analytics" className="text-[10px] text-accent hover:text-accent-hover">Analytics</Link>
          </div>
          {savings ? (
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-text-muted mb-0.5 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Actual spend
                  </div>
                  <div className="text-xl font-bold">${savings.routedCost.toFixed(4)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-text-muted mb-0.5">vs. all-Opus</div>
                  <div className="text-sm text-text-muted line-through">${savings.allOpusCost.toFixed(4)}</div>
                </div>
              </div>
              {savings.savings > 0 && (
                <div className="flex items-center gap-1.5 bg-green-muted border border-green/20 rounded-lg px-2.5 py-1.5">
                  <TrendingUp className="w-3 h-3 text-green" />
                  <span className="text-[11px] font-semibold text-green">{savings.savings}% saved via routing</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-[10px] text-text-muted">
                <Zap className="w-3 h-3" />
                {savings.totalRuns.toLocaleString()} runs total
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-text-muted">No cost data yet</p>
          )}
        </div>
      </div>

      {/* 7-day trend chart */}
      <div className="bg-surface rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">7-Day Run Trend</span>
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent inline-block" /> success</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red inline-block" /> error</span>
          </div>
        </div>
        <div className="flex items-end gap-2 h-20">
          {trend.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: '64px' }}>
                {day.total > 0 ? (
                  <>
                    <div
                      className="w-full bg-red/70 rounded-sm transition-all"
                      style={{ height: `${(day.error / maxTrend) * 64}px` }}
                    />
                    <div
                      className="w-full bg-accent rounded-sm transition-all"
                      style={{ height: `${(day.success / maxTrend) * 64}px` }}
                    />
                  </>
                ) : (
                  <div className="w-full bg-surface-2 rounded-sm" style={{ height: '4px' }} />
                )}
              </div>
              <span className="text-[9px] text-text-muted">{day.label}</span>
              {day.total > 0 && <span className="text-[9px] text-text-muted">{day.total}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Recent runs */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Recent Activity</span>
          <Link to="/analytics" className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
            All runs <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {runs.length > 0 ? (
          <div>
            {runs.slice(0, recentRunsCap).map(run => (
              <div key={run.id} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 last:border-0 hover:bg-surface-2/30 transition-colors">
                {run.status === 'success'
                  ? <CheckCircle className="w-3.5 h-3.5 text-green shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red shrink-0" />
                }
                <span className="text-xs font-medium w-24 truncate shrink-0">{run.agentName}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${SOURCE_COLORS[run.source] || 'bg-surface-2 text-text-muted'}`}>{run.source}</span>
                <span className="text-[11px] text-text-muted truncate flex-1">{run.prompt}</span>
                <span className="text-[10px] text-text-muted shrink-0">{timeAgo(run.timestamp)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-text-muted">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">No activity yet — run an agent to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}
