import { useState, useEffect, useCallback, useMemo } from 'react'
import { TrendingUp, RefreshCw, Loader2 } from 'lucide-react'
import { getMetrics, getUnifiedAgents, apiError, type MetricsDailyRow } from '../lib/api'
import { ErrorState } from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import TrendChart, { type TrendPoint } from '../components/TrendChart'

const RANGES = [{ d: 7, label: '7d' }, { d: 30, label: '30d' }, { d: 90, label: '90d' }]
const sinceDate = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
const shortDate = (d: string) => { const [, m, day] = d.split('-'); return `${m}/${day}` }

// Monitoring → Trends: pre-aggregated daily time-series (metrics_daily) rendered
// as dependency-free SVG charts. Populated nightly by sys-metrics-rollup.
export default function Trends() {
  const [rows, setRows] = useState<MetricsDailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [agent, setAgent] = useState('__all__')
  const [agents, setAgents] = useState<string[]>([])

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    getMetrics({ since: sinceDate(days), agent, limit: days + 1 })
      .then(r => setRows(r.items))
      .catch(e => { setErr(e instanceof Error ? e.message : 'Failed to load metrics'); apiError('Load metrics', e) })
      .finally(() => setLoading(false))
  }, [days, agent])

  useEffect(() => { load() }, [load])
  useEffect(() => { getUnifiedAgents().then(a => setAgents(a.filter(x => x.scope === 'global').map(x => x.filename).sort())).catch(() => {}) }, [])

  const series = useMemo(() => {
    const pts = (sel: (r: MetricsDailyRow) => number): TrendPoint[] =>
      rows.map(r => ({ label: shortDate(r.date), value: sel(r) }))
    return {
      cost: pts(r => r.costUsd),
      runs: pts(r => r.runs),
      success: pts(r => Math.round(r.successRate * 100)),
      latency: pts(r => r.p95LatencyMs),
      evalAvg: rows.filter(r => r.evalAvg != null).map(r => ({ label: shortDate(r.date), value: Math.round((r.evalAvg ?? 0) * 100) })),
    }
  }, [rows])

  const totalCost = rows.reduce((s, r) => s + r.costUsd, 0)
  const totalRuns = rows.reduce((s, r) => s + r.runs, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-4 h-4 text-accent mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text">Trends</p>
            <p className="text-xs text-text-muted">Daily cost, volume, success, latency, and quality over time. Rolled up nightly by sys-metrics-rollup.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={agent} onChange={e => setAgent(e.target.value)} className="input appearance-none cursor-pointer text-xs py-1.5 max-w-[160px]" aria-label="Filter by agent">
            <option value="__all__">All agents</option>
            {agents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="segmented">
            {RANGES.map(r => (
              <button key={r.d} onClick={() => setDays(r.d)} className={days === r.d ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}>{r.label}</button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="btn-secondary btn-sm">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
          </button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-text-muted"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      ) : err ? (
        <ErrorState message={err} onRetry={load} className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No daily metrics yet"
          description="The metrics_daily rollup runs nightly (sys-metrics-rollup) and backfills the last 30 days on first boot. If this is brand new, trigger it from Schedules → Run now, or wait for tonight's run."
          card
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={`Total cost (${days}d)`} value={`$${totalCost.toFixed(4)}`} accent="text-emerald" />
            <Stat label={`Total runs (${days}d)`} value={totalRuns.toLocaleString()} />
            <Stat label="Days tracked" value={String(rows.length)} />
            <Stat label="Avg runs/day" value={rows.length ? Math.round(totalRuns / rows.length).toLocaleString() : '0'} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Cost per day"><TrendChart data={series.cost} color="var(--color-emerald)" format={v => `$${v.toFixed(4)}`} /></ChartCard>
            <ChartCard title="Runs per day"><TrendChart data={series.runs} color="var(--color-accent)" format={v => `${v} runs`} /></ChartCard>
            <ChartCard title="Success rate"><TrendChart data={series.success} color="var(--color-green)" format={v => `${v}%`} /></ChartCard>
            <ChartCard title="p95 latency"><TrendChart data={series.latency} color="var(--color-amber)" format={v => `${v} ms`} /></ChartCard>
            <ChartCard title="Avg quality score" subtitle="Judge eval, days with scores (0–100)">
              {series.evalAvg.length ? <TrendChart data={series.evalAvg} color="var(--color-blue)" format={v => `${v}%`} /> : <div className="flex items-center justify-center h-40 text-xs text-text-muted">No eval scores in range</div>}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className={`text-xl font-bold tabular-nums ${accent || ''}`}>{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{label}</div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold text-text">{title}</h3>
        {subtitle && <span className="text-[10px] text-text-muted">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}
