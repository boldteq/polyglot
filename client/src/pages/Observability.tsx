import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, DollarSign, ShieldAlert, Gauge, GitBranch,
  RefreshCw, Loader2, AlertCircle, Play, CheckCircle2, XCircle, Hammer,
} from 'lucide-react'
import {
  getObservabilitySummary, getBuildQuality, runScheduleNow,
  type ObservabilitySummary, type BuildQuality,
} from '../lib/api'
import { toast } from '../components/Toast'
import EmptyState from '../components/EmptyState'

// Pillar 1/3/5 dashboard — one /observability/summary call → real spend, the
// policy-audit block trail, independent judge scores, and the delegation graph.
export default function Observability() {
  const navigate = useNavigate()
  const [data, setData] = useState<ObservabilitySummary | null>(null)
  const [bq, setBq] = useState<BuildQuality | null>(null)
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
    // build-quality is independent — a failure here must not blank the whole page
    getBuildQuality().then(setBq).catch((e) => { console.error('[observability] build-quality fetch failed:', e?.message) })
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
      <div className="pb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Activity className="w-4 h-4 text-accent mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text">Observability</p>
            <p className="text-xs text-text-muted">What your AI agents cost, what they're doing, and how well they perform — refreshed on demand.</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary btn-sm shrink-0">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      <div className="space-y-6 pb-10">
        {/* Build quality — the fleet score that ships stores (Phase 5.2) */}
        {bq && (
          <section>
            <SectionHead icon={<Hammer className="w-4 h-4 text-accent" />} title="Build quality" count={bq.buildCount} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Stat label="Builds scored" value={String(bq.buildCount)} />
              <Stat label="Pass rate" value={bq.passRate == null ? '—' : `${Math.round(bq.passRate * 100)}%`} accent={bq.passRate != null && bq.passRate < 0.8 ? 'text-red' : 'text-emerald'} />
              <Stat label="Golden score" value={bq.goldenScore == null ? '—' : `${Math.round(bq.goldenScore * 100)}%`} title={bq.goldenCases != null ? `${bq.goldenCases} golden case(s)` : undefined} />
              <Stat label="Builders scored" value={String(bq.builders.length)} />
            </div>
            {bq.buildCount === 0 ? (
              <EmptyCard text="No build scored yet — run a Maestro build; every build emits a per-builder score here (loom/drape/ink), not just sales." />
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Per-builder score (worst first)</p>
                  <div className="space-y-1.5">
                    {bq.builders.slice(0, 8).map((b) => (
                      <div key={b.agent} className="flex items-center gap-2 text-xs">
                        <span className="w-20 shrink-0 text-text">{b.agent}</span>
                        {b.latest != null && <ScoreBar score={b.latest} />}
                        <span className="text-text-muted shrink-0">{b.mean != null ? `avg ${Math.round(b.mean * 100)}% · n${b.n}` : `n${b.n}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Top failing gates</p>
                  {bq.topFailingGates.length === 0 ? <EmptyCard text="No gate failures in the trend." /> : (
                    <div className="space-y-1">
                      {bq.topFailingGates.map((g) => (
                        <div key={g.gate} className="flex items-center justify-between text-xs">
                          <span className="text-text">{g.gate}</span>
                          <span className="text-red">{g.fails}/{g.builds} builds ({Math.round(g.rate * 100)}%)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Spend — real token cost (Pillar 1) */}
        <section>
          <SectionHead icon={<DollarSign className="w-4 h-4 text-emerald" />} title="Token spend" />
          <p className="text-[11px] text-text-muted -mt-2 mb-3">What your agents cost in AI tokens. “Real” = measured from recorded runs; estimates fill in the rest.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Real cost" value={`$${realCost.toFixed(4)}`} accent="text-emerald" title="Actual dollars spent, measured from runs where token usage was recorded." />
            <Stat label="Total (incl. est.)" value={`$${totalCost.toFixed(4)}`} title="Real cost plus an estimate for runs where exact token usage wasn’t captured." />
            <Stat label="Measured runs" value={`${spend.realCalls ?? 0} / ${spend.calls}`} title="How many of all AI calls had their exact token usage recorded (measured / total)." />
            <Stat label="Tokens" value={(spend.tokens ?? 0).toLocaleString()} title="Total tokens (words/word-pieces) sent to and from the AI across recorded runs." />
          </div>
          {spend.calls === 0 && (
            <p className="text-[11px] text-text-muted mt-2">No LLM calls recorded yet — real cost appears once agents run through the recorded paths (schedules / orchestration).</p>
          )}
        </section>

        {/* Policy audit — recent blocks (Pillar 5) */}
        <section>
          <SectionHead icon={<ShieldAlert className="w-4 h-4 text-red" />} title="Recent policy blocks" count={recentBlocks.length} />
          <p className="text-[11px] text-text-muted -mt-2 mb-3">Times the safety gate stopped an agent before it ran a risky task. Hover a code for the reason. Empty is good — nothing was blocked.</p>
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
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-blue" />
            <h2 className="text-sm font-bold text-text-muted">Agent quality scores</h2>
            <span className="text-xs text-text-muted">({recentEvalScores.length})</span>
            <button onClick={runEval} disabled={runningEval} className="btn-primary btn-sm ml-auto" title="Run the grading self-test now instead of waiting for the weekly check.">
              {runningEval ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run quality check
            </button>
          </div>
          <p className="text-[11px] text-text-muted mb-3">An independent AI judge grades agent outputs from 0 to 1 (higher is better). Green ≥ 0.7, amber ≥ 0.4, red below.</p>
          {evalError && (
            <p className="text-xs text-red mb-3 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {evalError}
            </p>
          )}
          {recentEvalScores.length === 0 ? (
            <EmptyCard text="No quality scores yet — click ‘Run quality check’ above (or wait for the weekly run)." />
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
          <p className="text-[11px] text-text-muted -mt-2 mb-3">Which agent handed work to which — built from orchestration runs (run → agent).</p>
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
                  {d.parentRunId && (
                    <button onClick={() => navigate(`/tracing/${d.parentRunId}`)} className="text-[10px] text-accent hover:underline shrink-0" title="Open the full trace tree for this run">
                      View trace
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-[10px] text-text-muted text-center pt-4">
          A live view of agent cost, output quality, and the safety gate. Refreshes on demand.
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

function Stat({ label, value, accent, title }: { label: string; value: string; accent?: string; title?: string }) {
  return (
    <div className="card p-4" title={title}>
      <div className={`text-xl font-bold tabular-nums ${accent || ''}`}>{value}</div>
      <div className={`text-[10px] text-text-muted mt-0.5 ${title ? 'cursor-help' : ''}`}>{label}</div>
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
