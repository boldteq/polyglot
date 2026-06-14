import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, Server, Brain, Gauge, DollarSign, Code2, Clock,
  RefreshCw, Loader2, Play, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react'
import { getSystemStatus, runScheduleNow, type SystemStatus, type SubState } from '../lib/api'
import { HEALTH_TEXT_COLOR, HEALTH_BG_COLOR, type HealthBucket } from '../lib/colors'
import { PageShell } from '../components/PageShell'
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
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try { setData(await getSystemStatus()); setErr(null) }
    catch (x) { setErr(x instanceof Error ? x.message : 'Failed to load system status') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 15000); return () => clearInterval(id) }, [load]) // poll 15s

  const runNow = async (id: string, label: string) => {
    setBusy((p) => new Set(p).add(id))
    try { await runScheduleNow(id); toast('success', `${label} started — refreshing…`); setTimeout(load, 2500) }
    catch (x) { toast('error', x instanceof Error ? x.message : `Failed to run ${label}`) }
    finally { setBusy((p) => { const n = new Set(p); n.delete(id); return n }) }
  }

  if (loading && !data) {
    return <PageShell title="System Health"><div className="flex items-center justify-center h-64 text-text-muted"><Loader2 className="w-5 h-5 animate-spin mr-3" /> Checking the pipeline…</div></PageShell>
  }
  if (err && !data) {
    return <PageShell title="System Health"><ErrorState message={err} onRetry={load} /></PageShell>
  }
  if (!data) return null

  const b = bucket(data.overall)
  const overallLabel = data.overall === 'ok' ? 'Healthy' : data.overall === 'degraded' ? 'Needs attention' : 'Down'

  return (
    <PageShell title="System Health" subtitle="Is the whole agent pipeline actually running?">
      {/* Overall banner */}
      <div className={`rounded-2xl border p-5 mb-5 flex items-center gap-4 ${HEALTH_BG_COLOR[b]}`}>
        <Activity className={`w-7 h-7 ${HEALTH_TEXT_COLOR[b]}`} />
        <div className="flex-1">
          <div className={`text-xl font-bold ${HEALTH_TEXT_COLOR[b]}`}>Pipeline: {overallLabel}</div>
          <div className="text-xs text-text-muted mt-0.5">last checked {ago(data.timestamp)} · auto-refresh 15s</div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-surface border border-border text-text-muted hover:text-text">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Server & always-on */}
        <SubCard icon={<Server className="w-4 h-4" />} title="Server & always-on" state={data.server.state} note={data.server.note}>
          <Row k="Uptime" v={`${Math.floor(data.server.uptimeSec / 60)} min`} />
          <Row k="Database" v={`${data.server.db.status}${data.server.db.sizeMB ? ` · ${data.server.db.sizeMB} MB` : ''}`} />
          <Row k="Auto-restart" v={data.server.launchAgent.managed ? `LaunchAgent (pid ${data.server.launchAgent.pid ?? '?'})` : 'manual — no auto-restart'} bad={!data.server.launchAgent.managed} />
        </SubCard>

        {/* Memory brain */}
        <SubCard icon={<Brain className="w-4 h-4" />} title="Memory brain (RAG)" state={data.memory.state} note={data.memory.note}
          action={<RunBtn busy={busy.has('sys-intel-reindex')} onClick={() => runNow('sys-intel-reindex', 'Reindex')} label="Reindex now" />}
          link={{ to: '/memory', label: 'Open Memory' }}>
          <Row k="Ollama" v={data.memory.ollama.ok ? `up${data.memory.ollama.models?.length ? ` · ${data.memory.ollama.models.length} models` : ''}` : (data.memory.ollama.error || 'down')} bad={!data.memory.ollama.ok} />
          <Row k="Index" v={`${(data.memory.index.total || 0).toLocaleString()} chunks`} bad={(data.memory.index.total || 0) === 0} />
          <Row k="MCP (all projects)" v={data.memory.mcpUserScoped ? 'user-scoped ✓' : 'not user-scoped'} bad={!data.memory.mcpUserScoped} />
          <Row k="Last reindex" v={ago(data.memory.lastReindex?.at)} />
        </SubCard>

        {/* Evaluation */}
        <SubCard icon={<Gauge className="w-4 h-4" />} title="Evaluation (LLM-judge)" state={data.evaluation.state} note={data.evaluation.note}
          action={<RunBtn busy={busy.has('sys-intel-eval')} onClick={() => runNow('sys-intel-eval', 'Eval self-test')} label="Run eval" />}
          link={{ to: '/analytics?tab=observability', label: 'Open Observability' }}>
          <Row k="Scores" v={`${data.evaluation.scores.count}`} />
          <Row k="Avg score" v={data.evaluation.scores.avgOverall != null ? data.evaluation.scores.avgOverall.toFixed(2) : '—'} />
          <Row k="Pass rate" v={data.evaluation.scores.passRate != null ? `${Math.round(data.evaluation.scores.passRate * 100)}%` : '—'} />
          <Row k="Last run" v={ago(data.evaluation.lastRun?.at)} />
        </SubCard>

        {/* Observability */}
        <SubCard icon={<DollarSign className="w-4 h-4" />} title="Observability (cost · policy)" state={data.observability.state} note={data.observability.note}
          link={{ to: '/analytics?tab=observability', label: 'Open Observability' }}>
          <Row k="Real cost" v={data.observability.spend.realCalls ? `$${data.observability.spend.realCostUsd} (${data.observability.spend.realCalls} calls)` : 'none yet'} />
          <Row k="Total calls" v={`${data.observability.spend.calls ?? 0}`} />
          <Row k="Policy blocks" v={`${data.observability.recentBlocks}`} />
          <Row k="Delegations" v={`${data.observability.recentDelegations}`} />
        </SubCard>

        {/* VS Code → loop */}
        <SubCard icon={<Code2 className="w-4 h-4" />} title="VS Code → learning loop" state={data.vscode.state} note={data.vscode.note}>
          <Row k="SubagentStop hook" v={data.vscode.hookRegistered ? 'registered ✓' : 'not registered'} bad={!data.vscode.hookRegistered} />
          <Row k="Runs ingested (24h)" v={`${data.vscode.runs24h.count}`} bad={data.vscode.runs24h.count === 0} />
          <Row k="Success rate" v={data.vscode.runs24h.successRate != null ? `${Math.round(data.vscode.runs24h.successRate * 100)}%` : '—'} />
        </SubCard>

        {/* Crons */}
        <SubCard icon={<Clock className="w-4 h-4" />} title="Auto-train crons" state={data.crons.some((c) => c.enabled) ? 'ok' : 'degraded'} note={`${data.crons.filter((c) => c.enabled).length}/${data.crons.length} enabled`}
          link={{ to: '/schedules', label: 'Manage schedules' }}>
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

function SubCard({ icon, title, state, note, children, action, link }: {
  icon: ReactNode; title: string; state: SubState; note: string; children: ReactNode
  action?: ReactNode; link?: { to: string; label: string }
}) {
  const bk = bucket(state)
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${state === 'down' ? 'border-red/40' : state === 'degraded' ? 'border-amber/30' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={HEALTH_TEXT_COLOR[bk]}>{icon}</span>
        <h2 className="text-sm font-bold flex-1">{title}</h2>
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${HEALTH_BG_COLOR[bk]} ${HEALTH_TEXT_COLOR[bk]}`}>{state}</span>
      </div>
      <p className="text-[11px] text-text-muted mb-3">{note}</p>
      <div className="space-y-1">{children}</div>
      {(action || link) && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
          {action}
          {link && <Link to={link.to} className="text-[11px] text-accent hover:underline ml-auto">{link.label} →</Link>}
        </div>
      )}
    </div>
  )
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-muted">{k}</span>
      <span className={`font-medium tabular-nums ${bad ? 'text-amber' : 'text-text'}`}>{v}</span>
    </div>
  )
}

function RunBtn({ busy, onClick, label }: { busy: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} disabled={busy} className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-accent text-white hover:opacity-90 disabled:opacity-50">
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} {label}
    </button>
  )
}
