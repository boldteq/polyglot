import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, Server, Brain, Gauge, DollarSign, Code2, Clock,
  RefreshCw, Loader2, Play, CheckCircle2, XCircle, AlertTriangle,
  HeartPulse, Database, Timer, ArrowRight, Info,
} from 'lucide-react'
import { getSystemStatus, runScheduleNow, type SystemStatus, type SubState } from '../lib/api'
import { HEALTH_TEXT_COLOR, HEALTH_BG_COLOR, type HealthBucket } from '../lib/colors'
import { PageShell, StatRow } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { toast } from '../components/Toast'

// our states (ok|degraded|down) → the design-system health buckets
const bucket = (s: SubState): HealthBucket => (s === 'ok' ? 'healthy' : s === 'degraded' ? 'degraded' : 'critical')
const ago = (iso?: string | null) => {
  if (!iso) return 'never'
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}
const next = (iso?: string | null) => {
  if (!iso) return '—'
  const m = Math.floor((Date.parse(iso) - Date.now()) / 60000)
  if (m < 60) return `in ${Math.max(0, m)}m`
  if (m < 1440) return `in ${Math.floor(m / 60)}h`
  return `in ${Math.floor(m / 1440)}d`
}

export default function SystemHealth() {
  const [data, setData] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = useCallback(async (force?: boolean) => {
    try { setData(await getSystemStatus(force)); setErr(null) }
    catch (x) { setErr(x instanceof Error ? x.message : 'Failed to load system status') }
    finally { setLoading(false) }
  }, [])

  // Manual refresh — visible feedback (spinner + toast) so it doesn't feel dead
  // next to the silent 15s auto-refresh. Force bypasses the 8s backend cache.
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try { await load(true); toast('success', 'Refreshed') }
    finally { setRefreshing(false) }
  }, [load])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 15000); return () => clearInterval(id) }, [load]) // poll 15s

  const runNow = async (id: string, label: string) => {
    setBusy((p) => new Set(p).add(id))
    try { await runScheduleNow(id); toast('success', `${label} started — refreshing…`); setTimeout(() => load(true), 2500) }
    catch (x) { toast('error', x instanceof Error ? x.message : `Failed to run ${label}`) }
    finally { setBusy((p) => { const n = new Set(p); n.delete(id); return n }) }
  }

  if (loading && !data) {
    return <PageShell title="System Health" subtitle="Is the whole agent pipeline actually running?"><div className="flex items-center justify-center h-64 text-text-muted"><Loader2 className="w-5 h-5 animate-spin mr-3" /> Checking the pipeline…</div></PageShell>
  }
  if (err && !data) {
    return <PageShell title="System Health" subtitle="Is the whole agent pipeline actually running?"><ErrorState message={err} onRetry={load} /></PageShell>
  }
  if (!data) return null

  const b = bucket(data.overall)
  const overallLabel = data.overall === 'ok' ? 'Healthy' : data.overall === 'degraded' ? 'Needs attention' : 'Down'

  // Subsystem roll-up across the 6 monitored areas.
  const subStates: SubState[] = [
    data.server.state,
    data.memory.state,
    data.evaluation.state,
    data.observability.state,
    data.vscode.state,
    data.crons.some((c) => c.enabled) ? 'ok' : 'degraded',
  ]
  const healthyCount = subStates.filter((s) => s === 'ok').length
  const cronsEnabled = data.crons.filter((c) => c.enabled).length

  return (
    <PageShell
      title="System Health"
      subtitle="Is the whole agent pipeline actually running?"
      actions={
        <button onClick={refresh} disabled={refreshing} className="btn-secondary btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      }
    >
      {/* Overall banner */}
      <div className={`card p-5 mb-4 flex items-center gap-4 ${HEALTH_BG_COLOR[b]} border-transparent`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${HEALTH_BG_COLOR[b]}`}>
          <Activity className={`w-6 h-6 ${HEALTH_TEXT_COLOR[b]}`} />
        </div>
        <div className="flex-1">
          <div className={`text-lg font-bold ${HEALTH_TEXT_COLOR[b]}`}>Pipeline: {overallLabel}</div>
          <div className="text-xs text-text-muted mt-0.5">last checked {ago(data.timestamp)} · auto-refresh 15s</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${HEALTH_BG_COLOR[b]} ${HEALTH_TEXT_COLOR[b]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${data.overall === 'ok' ? 'bg-green' : data.overall === 'degraded' ? 'bg-amber' : 'bg-red'}`} role="img" aria-label={`Overall pipeline status: ${overallLabel}`} />
          {healthyCount}/{subStates.length} healthy
        </span>
      </div>

      {/* Top KPIs */}
      <div className="mb-5">
        <StatRow
          stats={[
            { label: 'Subsystems healthy', value: `${healthyCount}/${subStates.length}`, icon: HeartPulse },
            { label: 'Uptime', value: `${Math.floor(data.server.uptimeSec / 60)}m`, icon: Timer },
            { label: 'Database', value: data.server.db.status, icon: Database },
            { label: 'Crons enabled', value: `${cronsEnabled}/${data.crons.length}`, icon: Clock },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Server & always-on */}
        <SubCard icon={<Server className="w-4 h-4" />} title="Server & always-on" state={data.server.state} note={data.server.note}
          tooltip="The backend server that powers this app. It stores all agent data, handles every API call, and must stay running 24/7. LaunchAgent auto-restarts it if it crashes.">
          <Row k="Uptime" v={`${Math.floor(data.server.uptimeSec / 60)} min`} />
          <Row k="Database" v={`${data.server.db.status}${data.server.db.sizeMB ? ` · ${data.server.db.sizeMB} MB` : ''}`} />
          <Row k="Auto-restart" v={data.server.launchAgent.managed ? `LaunchAgent (pid ${data.server.launchAgent.pid ?? '?'})` : 'manual — no auto-restart'} bad={!data.server.launchAgent.managed} />
        </SubCard>

        {/* Memory brain */}
        <SubCard icon={<Brain className="w-4 h-4" />} title="Memory brain (RAG)" state={data.memory.state} note={data.memory.note}
          action={<RunBtn busy={busy.has('sys-intel-reindex')} onClick={() => runNow('sys-intel-reindex', 'Reindex')} label="Reindex now" />}
          link={{ to: '/settings?tab=memory', label: 'Open Memory' }}
          tooltip="Agents search here before every task to recall past lessons, bug fixes, and patterns. Powered by a local Ollama model. Hit 'Reindex' to rebuild the index from scratch.">
          <Row k="Ollama" v={data.memory.ollama.ok ? `up${data.memory.ollama.models?.length ? ` · ${data.memory.ollama.models.length} models` : ''}` : (data.memory.ollama.error || 'down')} bad={!data.memory.ollama.ok} />
          <Row k="Index" v={`${(data.memory.index.total || 0).toLocaleString()} chunks`} bad={(data.memory.index.total || 0) === 0} />
          <Row k="MCP (all projects)" v={data.memory.mcpUserScoped ? 'user-scoped ✓' : 'not user-scoped'} bad={!data.memory.mcpUserScoped} />
          <Row k="Last reindex" v={ago(data.memory.lastReindex?.at)} />
        </SubCard>

        {/* Evaluation */}
        <SubCard icon={<Gauge className="w-4 h-4" />} title="Evaluation (LLM-judge)" state={data.evaluation.state} note={data.evaluation.note}
          action={<RunBtn busy={busy.has('sys-intel-eval')} onClick={() => runNow('sys-intel-eval', 'Eval self-test')} label="Run eval" />}
          link={{ to: '/analytics?tab=observability', label: 'Open Observability' }}
          tooltip="A self-test that grades agent output quality by running preset test cases and scoring 0–1. Scores ≥0.7 = healthy. Drop below that means something in the agent pipeline has drifted.">
          <Row k="Scores" v={`${data.evaluation.scores.count}`} />
          <Row k="Avg score" v={data.evaluation.scores.avgOverall != null ? data.evaluation.scores.avgOverall.toFixed(2) : '—'} />
          <Row k="Pass rate" v={data.evaluation.scores.passRate != null ? `${Math.round(data.evaluation.scores.passRate * 100)}%` : '—'} />
          <Row k="Last run" v={ago(data.evaluation.lastRun?.at)} />
        </SubCard>

        {/* Observability — health heartbeat only; full cost/policy/tracing
            detail lives in Analytics → Observability (avoid duplicating it here). */}
        <SubCard icon={<DollarSign className="w-4 h-4" />} title="Observability (cost · policy)" state={data.observability.state} note={data.observability.note}
          link={{ to: '/analytics?tab=observability', label: 'Open full Observability' }}
          tooltip="Tracks the real USD cost of every agent run and logs each time an agent was allowed or blocked. Keeps the factory auditable and helps you catch runaway costs early.">
          <Row k="Real cost" v={data.observability.spend.realCalls ? `$${(data.observability.spend.realCostUsd ?? 0).toFixed(4)} (${data.observability.spend.realCalls} calls)` : 'none yet'} />
          <Row k="Detail" v="cost, policy blocks & delegations" />
        </SubCard>

        {/* VS Code → loop */}
        <SubCard icon={<Code2 className="w-4 h-4" />} title="VS Code → learning loop" state={data.vscode.state} note={data.vscode.note}
          tooltip="Every time an agent finishes work in VS Code, a background hook records that run as a lesson. This keeps the memory brain growing automatically — no manual capture needed.">
          <Row k="SubagentStop hook" v={data.vscode.hookRegistered ? 'registered ✓' : 'not registered'} bad={!data.vscode.hookRegistered} />
          <Row k="Runs ingested (24h)" v={`${data.vscode.runs24h.count}`} bad={data.vscode.runs24h.count === 0} />
          <Row k="Success rate" v={data.vscode.runs24h.successRate != null ? `${Math.round(data.vscode.runs24h.successRate * 100)}%` : '—'} />
        </SubCard>

        {/* Crons */}
        <SubCard icon={<Clock className="w-4 h-4" />} title="Auto-train crons" state={data.crons.some((c) => c.enabled) ? 'ok' : 'degraded'} note={`${data.crons.filter((c) => c.enabled).length}/${data.crons.length} enabled`}
          link={{ to: '/schedules', label: 'Manage schedules' }}
          tooltip="Overnight jobs that keep agents self-improving: Roster refreshes profiles, Witness reviews yesterday's runs, Tutor applies training patches, Cadence runs the weekly HR review.">
          <div className="space-y-1">
            {data.crons.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-xs py-0.5">
                {c.lastRunStatus === 'success' ? <CheckCircle2 className="w-3 h-3 text-green shrink-0" />
                  : c.lastRunStatus === 'error' || c.lastRunStatus === 'crashed' ? <XCircle className="w-3 h-3 text-red shrink-0" />
                    : <AlertTriangle className="w-3 h-3 text-amber shrink-0 opacity-60" />}
                <span className="font-medium truncate flex-1">{c.name}</span>
                <span className="text-text-muted">{ago(c.lastRunAt)}</span>
                <span className="text-text-muted/60 w-14 text-right">{c.enabled ? next(c.nextRunAt) : 'off'}</span>
                <button onClick={() => runNow(c.id, c.name)} disabled={busy.has(c.id)} title="Run now"
                  className="p-0.5 rounded text-text-muted hover:text-accent disabled:opacity-40">
                  {busy.has(c.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </SubCard>
      </div>
    </PageShell>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group/tip shrink-0">
      <Info className="w-3 h-3 text-text-muted/40 hover:text-text-muted cursor-default transition-colors" />
      <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-56 rounded-lg bg-gray-900 text-white p-2.5 text-[11px] leading-relaxed shadow-xl opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
        {text}
        <span className="absolute top-full right-2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  )
}

function SubCard({ icon, title, state, note, children, action, link, tooltip }: {
  icon: ReactNode; title: string; state: SubState; note: string; children: ReactNode
  action?: ReactNode; link?: { to: string; label: string }; tooltip?: string
}) {
  const dot = state === 'ok' ? 'bg-green' : state === 'degraded' ? 'bg-amber' : 'bg-red'
  return (
    <div className={`card p-5 ${state === 'down' ? 'border-red/25' : state === 'degraded' ? 'border-amber/25' : ''}`}>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="text-text-muted">{icon}</span>
        <h2 className="text-sm font-semibold text-text flex-1 truncate">{title}</h2>
        {tooltip && <InfoTooltip text={tooltip} />}
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} title={state} aria-label={`status: ${state}`} />
      </div>
      {note && <p className="text-[11px] text-text-muted mb-3 truncate">{note}</p>}
      <div className="space-y-2">{children}</div>
      {(action || link) && (
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border-subtle">
          {action}
          {link && (
            <Link to={link.to} className="btn-ghost btn-sm ml-auto">
              {link.label} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-text-muted shrink-0">{k}</span>
      <span className={`font-medium tabular-nums text-right truncate ${bad ? 'text-amber' : 'text-text'}`}>{v}</span>
    </div>
  )
}

function RunBtn({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} disabled={busy} className="btn-secondary btn-sm">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} {label}
    </button>
  )
}
