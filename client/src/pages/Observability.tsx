import { useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  Activity, DollarSign, ShieldAlert, Gauge, GitBranch,
  RefreshCw, Loader2, AlertCircle, Play, CheckCircle2, XCircle,
} from 'lucide-react'
import {
  getObservabilitySummary, runScheduleNow,
  type ObservabilitySummary,
} from '../lib/api'
import { toast } from '../components/Toast'
import EmptyState from '../components/EmptyState'

// Pillar 1/3/5 dashboard — one /observability/summary call → real spend, the
// policy-audit block trail, independent judge scores, and the delegation graph.
export default function Observability() {
  const [data, setData] = useState<ObservabilitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [runningEval, setRunningEval] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setData(await getObservabilitySummary())
    } catch (x: unknown) {
      setErr(x instanceof Error ? x.message : 'Failed to load observability data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const runEval = async () => {
    setRunningEval(true)
    setEvalError(null)
    try {
      await runScheduleNow('sys-intel-eval')
      toast('success', 'Eval self-test queued — judge scores appear here after it runs')
    } catch (x: unknown) {
      const msg = x instanceof Error ? x.message : 'Failed to start eval'
      setEvalError(msg)
      toast('error', msg)
    } finally {
      setRunningEval(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-3" />
        Loading observability data…
      </div>
    )
  }
  if (err && !data) {
    return (
      <div className="py-10 text-red text-sm">
        <AlertCircle className="w-5 h-5 inline mr-2" />
        {err}
        <button onClick={load} className="btn-secondary btn-sm ml-3">Retry</button>
      </div>
    )
  }
  if (!data) return null

  const { spend, recentBlocks, recentEvalScores, recentDelegations } = data
  const realCost = spend.realCostUsd ?? 0
  const totalCost = spend.costUsd ?? 0

  return (
    <div className="flex flex-col">
      <div className="pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-accent" />
          <p className="text-xs text-text-muted">Real cost · Policy audit · Judge scores · Delegations</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary btn-sm">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      <div className="space-y-6 pb-10">
        {/* Spend — real token cost (Pillar 1) */}
        <section>
          <SectionHead icon={<DollarSign className="w-4 h-4 text-emerald" />} title="Token spend (real)" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Real cost" value={`$${realCost.toFixed(4)}`} accent="text-emerald" />
            <Stat label="Total (incl. est.)" value={`$${totalCost.toFixed(4)}`} />
            <Stat label="Real calls" value={`${spend.realCalls ?? 0} / ${spend.calls}`} />
            <Stat label="Tokens" value={(spend.tokens ?? 0).toLocaleString()} />
          </div>
          {spend.calls === 0 && (
            <p className="text-[11px] text-text-muted mt-2">No LLM calls recorded yet — real cost appears once agents run through the recorded paths (schedules / orchestration).</p>
          )}
        </section>

        {/* Policy audit — recent blocks (Pillar 5) */}
        <section>
          <SectionHead icon={<ShieldAlert className="w-4 h-4 text-red" />} title="Recent policy blocks" count={recentBlocks.length} />
          {recentBlocks.length === 0 ? (
            <EmptyCard text="No dispatch has been blocked — the gate is allowing everything so far." />
          ) : (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-2 text-[10px] font-bold text-text-muted">
                <div className="col-span-3">Agent</div>
                <div className="col-span-2">Task</div>
                <div className="col-span-5">Violations</div>
                <div className="col-span-2">When</div>
              </div>
              <div className="divide-y divide-border">
                {recentBlocks.map((b) => (
                  <div key={b.id} className="grid grid-cols-12 gap-2 px-4 py-2 text-xs">
                    <div className="col-span-3 font-semibold truncate">{b.agentId || '—'}</div>
                    <div className="col-span-2 text-text-muted">{b.taskType || '—'}</div>
                    <div className="col-span-5 flex flex-wrap gap-1">
                      {b.violations.map((v, i) => (
                        <span key={i} className={`px-1.5 py-0.5 rounded font-mono font-bold ${v.severity === 'block' ? 'bg-red/10 text-red' : 'bg-amber/10 text-amber'}`} title={v.detail}>
                          {v.code}
                        </span>
                      ))}
                    </div>
                    <div className="col-span-2 text-text-muted">{new Date(b.ts).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Eval scores — independent judge (Pillar 3) */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4 text-blue" />
            <h2 className="text-sm font-bold text-text-muted">Independent judge scores</h2>
            <span className="text-xs text-text-muted">({recentEvalScores.length})</span>
            <button onClick={runEval} disabled={runningEval} className="btn-primary btn-sm ml-auto">
              {runningEval ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run eval self-test
            </button>
          </div>
          {evalError && (
            <p className="text-xs text-red mb-3 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {evalError}
            </p>
          )}
          {recentEvalScores.length === 0 ? (
            <EmptyCard text="No judge scores yet — run the eval self-test (or wait for the weekly cron); scores ingest into the Witness loop." />
          ) : (
            <div className="space-y-2">
              {recentEvalScores.map((e) => (
                <div key={e.id} className="card p-3 flex items-center gap-3">
                  {e.pass ? <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" /> : <XCircle className="w-4 h-4 text-red shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{e.caseId || 'ad-hoc'}</div>
                    <div className="text-[10px] text-text-muted truncate">{e.agent || '—'}{e.taskType ? ` · ${e.taskType}` : ''}</div>
                  </div>
                  <ScoreBar score={e.overall ?? 0} />
                  <div className="text-sm font-bold tabular-nums w-12 text-right">{(e.overall ?? 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Delegations — who delegated to whom (Pillar 1) */}
        <section>
          <SectionHead icon={<GitBranch className="w-4 h-4 text-purple" />} title="Recent delegations" count={recentDelegations.length} />
          {recentDelegations.length === 0 ? (
            <EmptyCard text="No delegations recorded yet — orchestration runs populate the graph (run → agent)." />
          ) : (
            <div className="space-y-1.5">
              {recentDelegations.map((d) => (
                <div key={d.id} className="card px-4 py-2 flex items-center gap-2 text-xs">
                  <span className="text-text-muted">{d.parentAgent || 'run'}</span>
                  <span className="text-text-muted">→</span>
                  <span className="font-semibold">{d.childAgent}</span>
                  {d.task && <span className="text-text-muted truncate ml-2">{d.task}</span>}
                  <span className="ml-auto text-[10px] text-text-muted">{new Date(d.ts).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-[10px] text-text-muted text-center pt-4">
          Pillar 1 · 3 · 5 — real token cost, the LLM-judge, and the dispatch policy gate. Data refreshes on demand.
        </p>
      </div>
    </div>
  )
}

function SectionHead({ icon, title, count }: { icon: ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="text-sm font-bold text-text-muted">{title}</h2>
      {count !== undefined && <span className="text-xs text-text-muted">({count})</span>}
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

function EmptyCard({ text }: { text: string }) {
  return <EmptyState icon={Activity} title={text} card size="sm" />
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score * 100))
  // Theme CSS vars (flip light/dark) instead of hardcoded hex — keeps the bar
  // on the design system and AA-contrast in both modes.
  const color = score >= 0.7 ? 'var(--color-green)' : score >= 0.4 ? 'var(--color-amber)' : 'var(--color-red)'
  return (
    <div
      className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden shrink-0"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Judge score: ${pct.toFixed(0)}%`}
    >
      <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}
