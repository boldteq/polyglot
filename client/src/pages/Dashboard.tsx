import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  Inbox,
  TrendingDown,
  Clock,
  Hash,
  Coins,
  X,
  Loader,
  type LucideIcon,
} from 'lucide-react'
import type { Project } from '../types'
import {
  getAnalyticsRuns,
  getAnalyticsSummary,
  getSchedules,
  getRoutingSavings,
  getHrRegistry,
  getLearningInboxCounts,
} from '../lib/api'
import type {
  AgentRunEntry,
  AgentAnalyticsSummary,
  Schedule,
  RoutingSavings,
  RegistryCounts,
} from '../lib/api'
import { resource } from '../lib/cacheCore'
import { CacheKeys } from '../lib/cacheKeys'
import { StatRow } from '../components/PageShell'

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

// Human-readable duration from milliseconds (used in Top Agents + run detail).
function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

import { SOURCE_COLORS } from '../lib/constants'
import { useAppConfig } from '../hooks/useAppConfig'
import EmptyState from '../components/EmptyState'
import { statusPill } from '../lib/colors'

// Single source for the success-rate health → token mapping used across the
// dashboard (text color, dot/bar background, and label). Keeps every place that
// colors a success rate in lock-step instead of re-deriving the 90/70 ternary.
type HealthIntent = 'success' | 'warning' | 'error'
function healthIntent(rate: number, healthy: number, degraded: number): HealthIntent {
  if (rate >= healthy) return 'success'
  if (rate >= degraded) return 'warning'
  return 'error'
}
function healthColor(rate: number, healthy: number, degraded: number): string {
  const map: Record<HealthIntent, string> = { success: 'text-green', warning: 'text-amber', error: 'text-red' }
  return map[healthIntent(rate, healthy, degraded)]
}
function healthBg(rate: number, healthy: number, degraded: number): string {
  const map: Record<HealthIntent, string> = { success: 'bg-green', warning: 'bg-amber', error: 'bg-red' }
  return map[healthIntent(rate, healthy, degraded)]
}
const HEALTH_STATUS_LABEL: Record<HealthIntent, string> = {
  success: 'Healthy', warning: 'Degraded', error: 'Unhealthy',
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
  // Cached resources — seed initial state from cache so re-navigating to the
  // dashboard paints instantly; loadData() revalidates in the background. The
  // spinner only shows on the first-ever load (empty cache).
  const runsRes = resource(`analytics/runs:${runsLimit}`, () => getAnalyticsRuns({ limit: runsLimit }))
  const summaryRes = resource('analytics/summary', getAnalyticsSummary)
  const schedulesRes = resource('schedules', getSchedules)
  const savingsRes = resource('routing/savings', () => getRoutingSavings().catch(() => null))
  const registryRes = resource(CacheKeys.hrRegistry, getHrRegistry)

  const [runs, setRuns] = useState<AgentRunEntry[]>(() => runsRes.getState().data?.runs ?? [])
  const [summary, setSummary] = useState<AgentAnalyticsSummary>(() => summaryRes.getState().data ?? {})
  const [schedules, setSchedules] = useState<Schedule[]>(() => schedulesRes.getState().data ?? [])
  const [savings, setSavings] = useState<RoutingSavings | null>(() => savingsRes.getState().data ?? null)
  const [registryCounts, setRegistryCounts] = useState<RegistryCounts | null>(() => registryRes.getState().data?.counts ?? null)
  const [loading, setLoading] = useState(() => runsRes.getState().data === null)
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [pendingLearning, setPendingLearning] = useState(0)
  const [selectedRun, setSelectedRun] = useState<AgentRunEntry | null>(null)
  const [showFirstRun, setShowFirstRun] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('polyglot.firstRun.v1') !== 'dismissed'
  )

  const dismissFirstRun = () => {
    localStorage.setItem('polyglot.firstRun.v1', 'dismissed')
    setShowFirstRun(false)
  }

  const loadData = useCallback(() => {
    if (runsRes.getState().data === null) setLoading(true)
    setRetrying(true)
    setLoadError(false)
    Promise.all([
      runsRes.refetch(),
      summaryRes.refetch(),
      schedulesRes.refetch(),
      savingsRes.refetch(),
      registryRes.refetch().catch((err) => {
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
    }).finally(() => { setLoading(false); setRetrying(false) })
    // resource handles + state setters are stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { loadData() }, [runsLimit, loadData])

  // Pending-learning count for the nudge pill (best-effort; errors are non-fatal).
  useEffect(() => {
    getLearningInboxCounts()
      .then(c => setPendingLearning(c.pending))
      .catch(err => console.error('[dashboard] learning counts fetch failed:', err?.message ?? err))
  }, [])

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
  const maxTrend = useMemo(() => Math.max(...trend.map(d => d.total), 1), [trend])
  // Pre-compute bar pixel heights once per trend change instead of re-deriving
  // new inline style objects for every bar on every render.
  const trendBars = useMemo(
    () => trend.map(day => ({
      error: `${(day.error / maxTrend) * 64}px`,
      success: `${(day.success / maxTrend) * 64}px`,
    })),
    [trend, maxTrend]
  )

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-64" role="status" aria-label="Loading dashboard">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (loadError) return (
    <div className="p-8 flex flex-col items-center justify-center h-64 gap-4 text-center">
      <p className="text-sm text-text-muted">Failed to load dashboard data.</p>
      <button
        onClick={loadData}
        disabled={retrying}
        className="btn-primary btn-md"
      >
        {retrying ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
        {retrying ? 'Loading…' : 'Retry'}
      </button>
    </div>
  )

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight">Welcome back, Yash</h1>
        <p className="text-[13px] text-text-muted mt-1">Agent operations at a glance</p>
      </div>

      {/* KPI stat cards — PagePilot-style lead row */}
      <div className="mb-6">
        <StatRow stats={[
          { label: 'Active Agents', value: registryCounts?.active ?? Object.keys(summary).length, icon: Bot },
          { label: 'Runs Today', value: todayRuns.length, icon: Activity },
          { label: 'Success Rate', value: `${successRate}%`, icon: TrendingUp },
          { label: 'Cost Saved', value: savings ? `$${Math.round(savings.savings)}` : '$0', icon: DollarSign },
        ]} />
      </div>

      {/* Get Started onboarding hero — dismissible, fills as you act */}
      {showFirstRun && (
        <GetStartedHero
          runsCount={runs.length}
          schedulesCount={schedules.length}
          projectsCount={projects.length}
          onDismiss={dismissFirstRun}
          navigate={navigate}
        />
      )}

      {/* Pending-work nudges — only render when there's something to act on */}
      {(pendingLearning > 0 || (registryCounts?.pip ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {pendingLearning > 0 && (
            <Link
              to="/learning"
              className={`pill px-3 py-1.5 text-xs hover:opacity-80 transition-opacity ${statusPill('warning')}`}
            >
              <Inbox className="w-3.5 h-3.5" />
              {pendingLearning} learning item{pendingLearning === 1 ? '' : 's'} to review
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
          {(registryCounts?.pip ?? 0) > 0 && (
            <Link
              to="/hr"
              className={`pill px-3 py-1.5 text-xs hover:opacity-80 transition-opacity ${statusPill('error')}`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              {registryCounts?.pip} agent{registryCounts?.pip === 1 ? '' : 's'} on PIP
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Run Agent', icon: FlaskConical, path: '/playground', color: 'text-purple', bg: 'bg-purple/10' },
          { label: 'Orchestrate', icon: Sparkles, path: '/orchestration', color: 'text-blue', bg: 'bg-blue/10' },
          { label: 'Agents', icon: Bot, path: '/agents', color: 'text-accent', bg: 'bg-accent/10', sub: `${registryCounts?.active ?? Object.keys(summary).length} active` },
          { label: 'Projects', icon: FolderOpen, path: '/settings', color: 'text-amber', bg: 'bg-amber/10', sub: `${projects.length}` },
        ].map(q => (
          <button
            key={q.label}
            onClick={() => navigate(q.path)}
            className="card card-hover p-4 flex items-center gap-3 text-left group"
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
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-text-muted">Today</span>
            <Link to="/analytics" className="text-[10px] text-accent hover:text-accent-hover">View all</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-2xl font-bold">{todayRuns.length}</div>
              <div className="text-[10px] text-text-muted">Runs</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${healthColor(successRate, healthy, degraded)}`}>{successRate}%</div>
              <div className="text-[10px] text-text-muted">Success</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{activeSchedules}</div>
              <div className="text-[10px] text-text-muted">Schedules</div>
            </div>
          </div>
        </div>

        {/* Top agents with health bars */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-text-muted">Top Agents</span>
            <Link to="/hr" className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
              <Heart className="w-3 h-3" /> Registry
            </Link>
          </div>
          <div className="space-y-2">
            {topAgents.length > 0 ? topAgents.map(([name, data]) => (
              <div key={name} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthBg(data.successRate, healthy, degraded)}`}
                      role="img"
                      aria-label={`Status: ${HEALTH_STATUS_LABEL[healthIntent(data.successRate, healthy, degraded)]}`}
                    />
                    <span className="text-xs font-medium truncate max-w-[110px]">{name}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-text-muted">{data.runCount} run{data.runCount === 1 ? '' : 's'}</span>
                    <span className={`text-[10px] font-semibold ${healthColor(data.successRate, healthy, degraded)}`}>{data.successRate}%</span>
                  </div>
                </div>
                <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${healthBg(data.successRate, healthy, degraded)}`}
                    style={{ width: `${data.successRate}%` }}
                  />
                </div>
                <div className="flex items-center gap-2.5 text-[9px] text-text-muted pl-3">
                  <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{formatDuration(data.avgDuration)}</span>
                  <span className="flex items-center gap-0.5"><Coins className="w-2.5 h-2.5" />${data.totalEstimatedCost.toFixed(4)}</span>
                </div>
              </div>
            )) : (
              <p className="text-[11px] text-text-muted">No runs yet</p>
            )}
          </div>
        </div>

        {/* Cost & savings */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-text-muted">Cost & Savings</span>
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
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold text-text-muted">7-Day Run Trend</span>
          <div className="flex items-center gap-3 text-[10px] text-text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent inline-block" /> success</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red inline-block" /> error</span>
          </div>
        </div>
        <div className="flex items-end gap-2 h-20">
          {trend.map((day, i) => (
            <div
              key={`${day.label}-${i}`}
              className="flex-1 flex flex-col items-center gap-1"
              role="img"
              aria-label={`${day.label}: ${day.total} run${day.total === 1 ? '' : 's'} (${day.success} success, ${day.error} error)`}
              title={`${day.label}: ${day.success} success, ${day.error} error`}
            >
              <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: '64px' }}>
                {day.total > 0 ? (
                  <>
                    <div
                      className="w-full bg-red/70 rounded-sm transition-all"
                      style={{ height: trendBars[i].error }}
                    />
                    <div
                      className="w-full bg-accent rounded-sm transition-all"
                      style={{ height: trendBars[i].success }}
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
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[10px] font-semibold text-text-muted">Recent Activity</span>
          <Link to="/analytics" className="text-[10px] text-accent hover:text-accent-hover flex items-center gap-1">
            All runs <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {runs.length > 0 ? (
          <div>
            {runs.slice(0, recentRunsCap).map(run => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRun(run)}
                className="w-full flex items-center gap-3 px-4 py-2 border-b border-border/50 last:border-0 hover:bg-surface-2/30 transition-colors text-left"
                aria-label={`View run detail for ${run.agentName}`}
              >
                {run.status === 'success'
                  ? <CheckCircle className="w-3.5 h-3.5 text-green shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red shrink-0" />
                }
                <span className="text-xs font-medium w-24 truncate shrink-0">{run.agentName}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${SOURCE_COLORS[run.source] || 'bg-surface-2 text-text-muted'}`}>{run.source}</span>
                <span className="text-[11px] text-text-muted truncate flex-1">{run.prompt}</span>
                <span className="text-[10px] text-text-muted shrink-0">{timeAgo(run.timestamp)}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Run an agent to get started."
            action={{ label: 'Run Agent', onClick: () => navigate('/playground') }}
            size="sm"
          />
        )}
      </div>

      {selectedRun && <RunDetailPanel run={selectedRun} onClose={() => setSelectedRun(null)} />}
    </div>
  )
}

// ─── Run detail slide-out ────────────────────────────────────────────────────
// AgentRunEntry rows already carry full detail (prompt, error, duration, tokens,
// cost, source, timestamp), so the panel renders directly from row data — there
// is no run-detail-by-id API for agent runs (getRunDetail is orchestration-only).
// The brief load/error scaffold below exists for parity + to stay robust if a
// fetch is wired later; it resolves synchronously from the row.
function RunDetailPanel({ run, onClose }: { run: AgentRunEntry; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc-to-close + Tab focus trap + focus restoration. Stores the element that
  // had focus before the dialog opened and restores it on close, and wraps Tab
  // within the dialog so keyboard focus can't escape behind the overlay.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
            )
          ).filter(el => el.offsetParent !== null)
        : []

    // Move focus into the dialog on open.
    focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const els = focusables()
        if (els.length === 0) return
        const first = els[0]
        const last = els[els.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  // Derive the renderable detail from the row. Wrapped so a future fetch can
  // swap in without changing the JSX below.
  const hydrate = useCallback(() => {
    setLoading(true)
    setError(null)
    try {
      // Row data is the source of truth — nothing async to await.
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run detail')
      setLoading(false)
    }
  }, [])

  useEffect(() => { hydrate() }, [hydrate])

  const titleId = `run-detail-${run.id}`

  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md h-full bg-surface border-l border-border shadow-pop overflow-y-auto animate-slide-in"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {run.status === 'success'
                  ? <CheckCircle className="w-4 h-4 text-green shrink-0" />
                  : <XCircle className="w-4 h-4 text-red shrink-0" />
                }
                <h3 id={titleId} className="text-base font-bold truncate">{run.agentName}</h3>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${run.status === 'success' ? 'bg-green-muted text-green' : 'bg-red-muted text-red'}`}>
                  {run.status}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[run.source] || 'bg-surface-2 text-text-muted'}`}>
                  {run.source}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close run detail panel"
              className="p-1.5 rounded-lg border border-border hover:bg-surface-2 text-text-muted transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="p-8 flex items-center justify-center h-40" role="status" aria-label="Loading run detail">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-text-muted">{error}</p>
            <button
              onClick={hydrate}
              className="btn-primary btn-md"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-5">
            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-2/50 rounded-lg p-2.5">
                <div className="flex items-center gap-1 text-[10px] text-text-muted mb-0.5"><Clock className="w-3 h-3" /> Duration</div>
                <div className="text-sm font-semibold">{formatDuration(run.duration)}</div>
              </div>
              <div className="bg-surface-2/50 rounded-lg p-2.5">
                <div className="flex items-center gap-1 text-[10px] text-text-muted mb-0.5"><Hash className="w-3 h-3" /> Tokens</div>
                <div className="text-sm font-semibold">{run.estimatedTokens.toLocaleString()}</div>
              </div>
              <div className="bg-surface-2/50 rounded-lg p-2.5">
                <div className="flex items-center gap-1 text-[10px] text-text-muted mb-0.5"><DollarSign className="w-3 h-3" /> Cost</div>
                <div className="text-sm font-semibold">${run.estimatedCost.toFixed(4)}</div>
              </div>
            </div>

            {/* Timestamp */}
            <div>
              <h4 className="text-[10px] text-text-muted font-bold mb-1.5">Timestamp</h4>
              <p className="text-xs text-text-secondary">
                {new Date(run.timestamp).toLocaleString()} <span className="text-text-muted">· {timeAgo(run.timestamp)}</span>
              </p>
            </div>

            {/* Prompt */}
            <div>
              <h4 className="text-[10px] text-text-muted font-bold mb-1.5">Prompt</h4>
              <pre className="max-h-60 overflow-auto bg-surface-2/50 border border-border rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap break-words text-text-secondary">
                {run.prompt || '—'}
              </pre>
            </div>

            {/* Output / Error */}
            {run.status === 'error' && run.error ? (
              <div>
                <h4 className="text-[10px] text-red font-bold mb-1.5">Error</h4>
                <pre className="max-h-60 overflow-auto bg-red-muted border border-red/20 rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap break-words text-red">
                  {run.error}
                </pre>
              </div>
            ) : (
              <div>
                <h4 className="text-[10px] text-text-muted font-bold mb-1.5">Output</h4>
                <p className="text-xs text-text-muted">
                  {run.outputChars > 0
                    ? `${run.outputChars.toLocaleString()} characters generated. Full output is not stored on this run record.`
                    : 'No output recorded for this run.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── First-run welcome modal (localStorage-dismissed) ────────────────────────
// Persistent "Get Started" onboarding hero (PagePilot-style). An intentional
// always-dark gradient card (same in light + dark, like a dark card on a light
// page) — the fixed indigo→violet hex is justified here, not a token bypass.
// Steps reflect REAL onboarding signals (ran an agent / has a schedule / has a
// project); the progress bar fills as the operator acts. Dismissible.
interface HeroStep { icon: LucideIcon; title: string; body: string; time: string; path: string; done: boolean }

function GetStartedHero({
  runsCount, schedulesCount, projectsCount, onDismiss, navigate,
}: {
  runsCount: number; schedulesCount: number; projectsCount: number
  onDismiss: () => void; navigate: (p: string) => void
}) {
  const steps: HeroStep[] = [
    { icon: FlaskConical, title: 'Run your first agent', body: 'Pick a specialist in the Playground, write a prompt, run with ⌘Enter.', time: '1 min', path: '/playground', done: runsCount > 0 },
    { icon: Clock, title: 'Schedule a task', body: 'Put an agent on a cron so it runs on autopilot.', time: '2 min', path: '/schedules', done: schedulesCount > 0 },
    { icon: FolderOpen, title: 'Open a project', body: 'Browse a project workspace — its agents, commands and rules.', time: '30 sec', path: projectsCount > 0 ? '/' : '/settings', done: projectsCount > 0 },
  ]
  const completed = steps.filter(s => s.done).length

  return (
    <div className="relative overflow-hidden rounded-2xl p-6 mb-6 text-white shadow-pop"
         style={{ background: 'linear-gradient(110deg, #6959ff 0%, #4a25ff 100%)' }}>
      {/* decorative glow */}
      <div className="pointer-events-none absolute -top-20 -right-10 w-64 h-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Get Started</h2>
            <p className="text-[13px] text-white/75 mt-1">Complete these steps to get the most out of Polyglot.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-xs font-semibold text-white/90">{completed}/{steps.length}</div>
              <div className="w-28 h-1.5 rounded-full bg-white/20 mt-1.5 overflow-hidden">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${(completed / steps.length) * 100}%` }} />
              </div>
            </div>
            <button onClick={onDismiss} aria-label="Dismiss get started" className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {steps.map((s) => (
            <button
              key={s.title}
              onClick={() => navigate(s.path)}
              className="text-left rounded-xl bg-white p-4 flex flex-col transition-transform hover:-translate-y-0.5 shadow-soft"
            >
              <div className="flex items-center gap-1.5 mb-3">
                <span className={`w-1.5 h-1.5 rounded-full ${s.done ? 'bg-green' : 'bg-text-muted/50'}`} />
                <span className="text-[11px] font-medium text-text-muted">{s.time}</span>
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                {s.done
                  ? <CheckCircle className="w-[18px] h-[18px] text-green shrink-0" />
                  : <s.icon className="w-[18px] h-[18px] text-accent shrink-0" />}
                <div className="text-sm font-semibold text-text">{s.title}</div>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed flex-1">{s.body}</p>
              <span className={`mt-3 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold ${
                s.done ? 'bg-green/10 text-green' : 'bg-text text-surface hover:opacity-90'
              } transition-opacity`}>
                {s.done ? <>Done <CheckCircle className="w-3 h-3" /></> : <>Start <ArrowRight className="w-3 h-3" /></>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
