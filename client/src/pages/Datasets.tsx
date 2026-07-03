import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Database, Play, X, Loader2, CheckCircle2, XCircle, Circle, GitCompare,
  ChevronRight, FlaskConical, AlertTriangle, Ban, RotateCw, Search, ChevronUp, ChevronDown,
} from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import { formatAgentDisplay } from '../lib/agentDisplay'
import {
  getDatasets, getDatasetCase, listExperiments, getExperiment, startExperiment, cancelExperiment, compareExperiments,
  getUnifiedAgents, getEvaluators, getEvaluatorCalibration, apiError,
  type DatasetCase, type DatasetDetail, type Experiment, type ExperimentDetail, type ComparisonRow, type Evaluator, type EvalCalibration,
} from '../lib/api'

// Theme-safe AA badges: tinted bg + near-black/near-white `text-text` (always ≥7:1 in
// both themes), with a colored status dot carrying the hue. The colored token text
// (text-emerald/amber/...) failed WCAG AA on its 10% tint — axe `color-contrast` serious.
const statusBadge = (s: Experiment['status']) => {
  const map: Record<string, string> = {
    running: 'bg-accent/15 text-text', pending: 'bg-surface-2 text-text',
    done: 'bg-emerald/15 text-text', failed: 'bg-red/15 text-text', cancelled: 'bg-amber/15 text-text',
  }
  return map[s] || 'bg-surface-2 text-text'
}
const statusDot = (s: Experiment['status']) => ({
  running: 'bg-accent', pending: 'bg-text-muted',
  done: 'bg-emerald', failed: 'bg-red', cancelled: 'bg-amber',
}[s] || 'bg-text-muted')

// Relative time ("2h ago") — absolute kept on hover via title.
function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

type SortKey = 'id' | 'agent' | 'task_type' | 'niche'

// Datasets & Experiments (LangSmith). Browse golden cases, run an agent against a
// selection (real model runs — cost-confirmed), watch progress, compare two runs.
export default function Datasets() {
  const [cases, setCases] = useState<DatasetCase[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [casesErr, setCasesErr] = useState<string | null>(null)
  const [expErr, setExpErr] = useState<string | null>(null)
  const [showRun, setShowRun] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [compareSel, setCompareSel] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [viewCase, setViewCase] = useState<string | null>(null)
  const [calibration, setCalibration] = useState<EvalCalibration | null>(null)
  const [rerunPreset, setRerunPreset] = useState<{ agent?: string; evaluatorId?: string | null } | null>(null)
  const [caseQuery, setCaseQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const toggleSort = (key: SortKey) => setSort(s => s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' })

  // Load each section independently — a failing experiments fetch must not blank the
  // (working) golden dataset, and vice-versa. Each renders its own inline error + retry.
  const load = useCallback(() => {
    setLoading(true); setCasesErr(null); setExpErr(null)
    Promise.allSettled([getDatasets(), listExperiments()]).then(([d, e]) => {
      if (d.status === 'fulfilled') setCases(d.value.items)
      else { setCasesErr(d.reason instanceof Error ? d.reason.message : 'Failed to load cases'); apiError('Load datasets', d.reason) }
      if (e.status === 'fulfilled') setExperiments(e.value.items)
      else { setExpErr(e.reason instanceof Error ? e.reason.message : 'Failed to load experiments'); apiError('Load experiments', e.reason) }
    }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  // Judge calibration — surfaces whether the scores you're about to read are trustworthy.
  useEffect(() => { getEvaluatorCalibration().then(r => setCalibration(r.calibration)).catch(e => console.error('[calibration] fetch failed:', e instanceof Error ? e.message : e)) }, [])

  // Data-driven cost estimate: average $/case across past scored runs (real captured cost).
  const avgCostPerCase = (() => {
    let cost = 0, n = 0
    for (const e of experiments) { if (e.summary?.costUsd != null && e.summary?.cases) { cost += e.summary.costUsd; n += e.summary.cases } }
    return n > 0 ? cost / n : null
  })()

  // Search the golden set across id / agent / type / niche.
  const q = caseQuery.trim().toLowerCase()
  const filteredCases = q ? cases.filter(c => [c.id, c.agent, c.task_type, c.niche].some(v => (v || '').toLowerCase().includes(q))) : cases
  const sortedCases = sort
    ? [...filteredCases].sort((a, b) => {
        const av = (a[sort.key] || '').toLowerCase(), bv = (b[sort.key] || '').toLowerCase()
        return (av < bv ? -1 : av > bv ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1)
      })
    : filteredCases

  // Poll while any experiment is running. Depend on a boolean (not the array) so
  // the interval is created/torn down only when activity starts/stops — not
  // re-created on every poll tick (which would churn the timer).
  const refreshExperiments = useCallback(() => { listExperiments().then(e => setExperiments(e.items)).catch(err => console.error('[datasets] experiments load failed:', err?.message || err)) }, [])
  const anyActive = experiments.some(e => e.status === 'running' || e.status === 'pending')
  useEffect(() => {
    if (!anyActive) return
    const id = setInterval(refreshExperiments, 3000)
    return () => clearInterval(id)
  }, [anyActive, refreshExperiments])

  const toggleCompare = (id: string) => setCompareSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id].slice(-2))

  return (
    <PageShell
      title="Datasets & Experiments"
      subtitle="Run an agent against the golden eval set and compare scored runs across versions"
      actions={
        <div className="flex items-center gap-2">
          {compareSel.length === 2 && <button onClick={() => setComparing(true)} className="btn-secondary btn-sm"><GitCompare className="w-3.5 h-3.5" /> Compare 2</button>}
          <button onClick={() => { setRerunPreset(null); setShowRun(true) }} disabled={cases.length === 0} className="btn-primary btn-sm"><Play className="w-3.5 h-3.5" /> Run experiment</button>
        </div>
      }
    >
      {loading ? <Spinner /> : (
        <div className="space-y-6">
          {/* Judge trust banner — are these scores reliable? */}
          {calibration && calibration.accuracy != null && (
            <div className="card px-4 py-2.5 flex items-center gap-2.5 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald shrink-0" aria-hidden="true" />
              <span className="text-text">Judge calibrated · <b className="tabular-nums">{Math.round(calibration.accuracy * 100)}%</b> accuracy on {calibration.calibrated}/{calibration.total} golden cases{calibration.meanSeparation != null ? <> · separation <b className="tabular-nums">{calibration.meanSeparation.toFixed(2)}</b></> : null}</span>
              <span className="text-text-muted ml-auto shrink-0">{new Date(calibration.at).toLocaleDateString()}</span>
            </div>
          )}
          {/* Experiments */}
          <section>
            <h2 className="text-xs font-semibold text-text-muted mb-2 flex items-center gap-2"><FlaskConical className="w-3.5 h-3.5" /> Experiments ({experiments.length})</h2>
            {expErr ? (
              <ErrorState message={expErr} onRetry={load} className="h-32" />
            ) : experiments.length === 0 ? (
              <EmptyState icon={FlaskConical} title="No experiments yet" description="Run one with the button above. An experiment scores an agent across the golden set." card size="sm" />
            ) : (
              <div className="space-y-2">
                {experiments.map(e => {
                  const d = e.agent ? formatAgentDisplay({ name: e.agent, id: e.agent }) : null
                  const pct = e.total ? Math.round((e.completed / e.total) * 100) : 0
                  return (
                    <div key={e.id} className="card p-3 flex items-center gap-3">
                      <input type="checkbox" checked={compareSel.includes(e.id)} onChange={() => toggleCompare(e.id)} disabled={e.status !== 'done'} aria-label={`Select ${e.id} for compare`} className="shrink-0 w-4 h-4 accent-accent" />
                      <button onClick={() => setViewing(e.id)} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">{d ? `${d.emoji} ${d.realName}` : e.agent}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadge(e.status)}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot(e.status)}`} aria-hidden="true" />{e.status}</span>
                        </div>
                        <div className="text-[10px] text-text-muted mt-0.5" title={new Date(e.ts).toLocaleString()}>{timeAgo(e.ts)}{e.evaluatorId ? ` · scored by ${e.evaluatorId}` : ' · golden rubric'}</div>
                      </button>
                      {(e.status === 'running' || e.status === 'pending') ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-text-muted tabular-nums">{e.completed}/{e.total}</span>
                          <div className="w-20 h-1.5 bg-surface-2 rounded-full overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
                          <button onClick={async () => { try { await cancelExperiment(e.id); toast('success', 'Experiment cancelled') } catch (x) { toast('error', x instanceof Error ? x.message : 'Cancel failed') } finally { refreshExperiments() } }} aria-label="Cancel experiment" title="Cancel" className="p-1.5 -m-0.5 rounded text-text-muted hover:text-red"><Ban className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 shrink-0 text-[10px] text-text-muted">
                          {e.summary.avgOverall != null && <span>avg <b className="text-text tabular-nums">{e.summary.avgOverall.toFixed(2)}</b></span>}
                          {e.summary.passed != null && <span>{e.summary.passed}/{e.summary.cases} pass</span>}
                          {e.summary.costUsd != null && <span className="text-text tabular-nums">${e.summary.costUsd.toFixed(4)}</span>}
                          {e.agent && <button onClick={() => { setRerunPreset({ agent: e.agent || '', evaluatorId: e.evaluatorId }); setShowRun(true) }} aria-label={`Re-run ${e.agent} experiment`} title="Re-run this agent" className="p-1.5 -m-0.5 rounded text-text-muted hover:text-accent"><RotateCw className="w-3.5 h-3.5" /></button>}
                          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Datasets (golden cases) */}
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="text-xs font-semibold text-text-muted flex items-center gap-2"><Database className="w-3.5 h-3.5" /> Golden dataset ({q ? `${filteredCases.length} of ${cases.length}` : cases.length} cases)</h2>
              <div className="relative w-56 max-w-[55%]">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input value={caseQuery} onChange={e => setCaseQuery(e.target.value)} placeholder="Search cases…" aria-label="Search golden cases" className="input pl-8 py-1.5 text-xs" />
              </div>
            </div>
            {casesErr ? <ErrorState message={casesErr} onRetry={load} className="h-32" /> : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead><tr className="text-text-muted border-b border-border bg-surface-2/50">
                    {([['id', 'Case'], ['agent', 'Agent'], ['task_type', 'Type'], ['niche', 'Niche']] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key} className="text-left py-2.5 px-4 font-medium" aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-text transition-colors">
                          {label}
                          {sort?.key === key ? (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />) : <ChevronUp className="w-3 h-3 opacity-0 group-hover:opacity-30" aria-hidden="true" />}
                        </button>
                      </th>
                    ))}
                    <th className="text-right py-2.5 px-4 font-medium">Self-testable</th>
                  </tr></thead>
                  <tbody>
                    {sortedCases.length === 0 && (
                      <tr><td colSpan={5} className="py-8 px-4 text-center text-text-muted text-[11px]">No cases match “{caseQuery}”.</td></tr>
                    )}
                    {sortedCases.map(c => (
                      <tr
                        key={c.id}
                        onClick={() => setViewCase(c.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewCase(c.id) } }}
                        role="button" tabIndex={0}
                        aria-label={`View case ${c.id}`}
                        className="border-b border-border/50 hover:bg-surface-2/30 cursor-pointer transition-colors focus:outline-none focus-visible:bg-surface-2/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/40"
                      >
                        <td className="py-2 px-4 font-medium font-mono whitespace-nowrap">{c.id}</td>
                        <td className="py-2 px-4 text-text-muted">{c.agent || '—'}</td>
                        <td className="py-2 px-4 text-text-muted">{c.task_type || '—'}</td>
                        <td className="py-2 px-4 text-text-muted">{c.niche || '—'}</td>
                        <td className="py-2 px-4 text-right">{c.hasFixtures ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald inline" /> : <span className="text-text-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </section>
        </div>
      )}

      {showRun && <RunDrawer cases={cases} avgCostPerCase={avgCostPerCase} preset={rerunPreset} onClose={() => { setShowRun(false); setRerunPreset(null) }} onStarted={() => { setShowRun(false); setRerunPreset(null); refreshExperiments() }} />}
      {viewCase && <CaseDrawer id={viewCase} onClose={() => setViewCase(null)} />}
      {viewing && <ResultsDrawer id={viewing} onClose={() => setViewing(null)} />}
      {comparing && compareSel.length === 2 && <CompareDrawer a={compareSel[0]} b={compareSel[1]} onClose={() => setComparing(false)} />}
    </PageShell>
  )
}

function RunDrawer({ cases, avgCostPerCase, preset, onClose, onStarted }: { cases: DatasetCase[]; avgCostPerCase: number | null; preset?: { agent?: string; evaluatorId?: string | null } | null; onClose: () => void; onStarted: () => void }) {
  const [agent, setAgent] = useState(preset?.agent || cases.find(c => c.agent)?.agent || '')
  const [selected, setSelected] = useState<Set<string>>(new Set(cases.map(c => c.id)))
  const [agents, setAgents] = useState<string[]>([])
  const [evaluators, setEvaluators] = useState<Evaluator[]>([])
  const [evaluatorId, setEvaluatorId] = useState(preset?.evaluatorId || '') // '' = golden case rubric
  const [starting, setStarting] = useState(false)
  useEffect(() => { getUnifiedAgents().then(a => setAgents(a.filter(x => x.scope === 'global').map(x => x.filename))).catch(err => console.error('[datasets] agents load failed:', err?.message || err)) }, [])
  useEffect(() => { getEvaluators().then(e => setEvaluators(e.items)).catch(err => console.error('[datasets] evaluators load failed:', err?.message || err)) }, [])

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOn = selected.size === cases.length
  const count = selected.size
  const estCost = avgCostPerCase != null ? avgCostPerCase * count : null

  const run = async () => {
    if (!agent.trim()) { toast('error', 'Pick an agent'); return }
    if (count === 0) { toast('error', 'Select at least one case'); return }
    const ok = await confirmDialog({
      title: `Run ${count} case${count !== 1 ? 's' : ''} through "${agent}"?`,
      message: `This spawns ~${count * 2} real model calls (one agent run + one judge per case).${estCost != null ? ` Estimated cost ≈ $${estCost.toFixed(2)} (based on your past runs).` : ' Cost scales with the case count.'} It runs in the background — you can cancel it.`,
      confirmLabel: `Run ${count} case${count !== 1 ? 's' : ''}`,
    })
    if (!ok) return
    setStarting(true)
    try {
      await startExperiment({ agent: agent.trim(), caseIds: [...selected], datasetId: agent.trim(), evaluatorId: evaluatorId || undefined })
      toast('success', 'Experiment started — watch progress in the list')
      onStarted()
    } catch (x) { toast('error', x instanceof Error ? x.message : 'Failed to start') }
    finally { setStarting(false) }
  }

  return (
    <Drawer title="Run experiment" onClose={onClose}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="rounded-lg bg-amber/10 text-text text-[11px] px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber" />
          Experiments spawn real model runs (~2 calls/case). Cost + time scale with the number of cases.
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1.5">Agent</label>
          <input list="agent-list" value={agent} onChange={e => setAgent(e.target.value)} className="input" placeholder="agent filename (e.g. sway)" aria-label="Agent" />
          <datalist id="agent-list">{agents.map(a => <option key={a} value={a} />)}</datalist>
        </div>
        <div>
          <label className="text-xs font-medium text-text-muted block mb-1.5">Scored by</label>
          <select value={evaluatorId} onChange={e => setEvaluatorId(e.target.value)} className="input appearance-none cursor-pointer" aria-label="Evaluator">
            <option value="">Golden case rubric (default)</option>
            {evaluators.map(ev => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <p className="text-[10px] text-text-muted mt-1">Default judges each case with its own rubric. Pick an evaluator to score every case with one shared rubric.</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-text-muted">Cases ({count}/{cases.length})</label>
            <button onClick={() => setSelected(allOn ? new Set() : new Set(cases.map(c => c.id)))} className="text-[11px] text-accent hover:underline">{allOn ? 'Deselect all' : 'Select all'}</button>
          </div>
          <div className="card divide-y divide-border-subtle max-h-72 overflow-y-auto">
            {cases.map(c => (
              <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer hover:bg-surface-2/40">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="shrink-0 w-4 h-4 accent-accent" />
                <span className="font-mono truncate flex-1">{c.id}</span>
                <span className="text-[10px] text-text-muted shrink-0">{c.agent || '—'}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
        <span className="text-[11px] text-text-muted tabular-nums">{count === 0 ? 'No cases selected' : estCost != null ? `Est. ≈ $${estCost.toFixed(2)}` : 'Est. — (first run calibrates)'}</span>
        <button onClick={run} disabled={starting || count === 0} className="btn-primary btn-sm">{starting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run {count} case{count !== 1 ? 's' : ''}</button>
      </div>
    </Drawer>
  )
}

function ResultsDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [exp, setExp] = useState<ExperimentDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const load = useCallback(() => { getExperiment(id).then(setExp).catch(e => setErr(e instanceof Error ? e.message : 'Failed')) }, [id])
  useEffect(() => {
    const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = undefined } }
    load()
    timer.current = setInterval(() => {
      getExperiment(id).then(e => {
        setExp(e)
        if (e.status !== 'running' && e.status !== 'pending') stop() // terminal → stop polling
      }).catch(err => console.error('[datasets] experiment poll failed:', err?.message || err))
    }, 3000)
    return stop
  }, [id, load])

  return (
    <Drawer title="Experiment results" subtitle={id} onClose={onClose} wide>
      <div className="flex-1 overflow-y-auto p-5">
        {err ? <ErrorState message={err} onRetry={load} className="h-32" /> : !exp ? <div className="flex items-center justify-center h-32 text-text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Status" value={exp.status} />
              <Stat label="Avg score" value={exp.summary.avgOverall != null ? exp.summary.avgOverall.toFixed(2) : '—'} />
              <Stat label="Passed" value={exp.summary.passed != null ? `${exp.summary.passed}/${exp.summary.cases}` : `${exp.completed}/${exp.total}`} />
              <Stat label="Cost" value={exp.summary.costUsd != null ? `$${exp.summary.costUsd.toFixed(4)}` : '—'} />
            </div>
            {exp.error && <p className="text-xs text-text bg-red/10 rounded-lg px-3 py-2">{exp.error}</p>}
            <div className="card divide-y divide-border-subtle">
              {exp.results.length === 0 ? <div className="p-6 text-center text-text-muted text-xs">No results yet…</div> : exp.results.map(r => (
                <ResultRow key={r.id} r={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

function CaseDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [c, setC] = useState<DatasetDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { getDatasetCase(id).then(setC).catch(e => setErr(e instanceof Error ? e.message : 'Failed')) }, [id])
  return (
    <Drawer title="Dataset case" subtitle={id} onClose={onClose} wide>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {err ? <ErrorState message={err} className="h-32" /> : !c ? <div className="flex items-center justify-center h-32 text-text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
              <span className="bg-surface-2 px-1.5 py-0.5 rounded">{c.agent || '—'}</span>
              {c.task_type && <span className="bg-surface-2 px-1.5 py-0.5 rounded">{c.task_type}</span>}
              {c.niche && <span className="bg-surface-2 px-1.5 py-0.5 rounded">{c.niche}</span>}
              {c.fixtures.length > 0 && <span className="bg-emerald/15 text-text px-1.5 py-0.5 rounded">fixtures: {c.fixtures.join(', ')}</span>}
            </div>
            <Field label="Task">{c.task}</Field>
            {c.reference && <Field label="Reference">{c.reference}</Field>}
            {c.rubric.length > 0 && (
              <div>
                <label className="text-xs font-medium text-text-muted block mb-1.5">Rubric ({c.rubric.length})</label>
                <div className="space-y-1.5">
                  {c.rubric.map((d, i) => (
                    <div key={i} className="card p-2.5"><div className="text-xs font-mono font-semibold">{d.dim}</div><div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{d.desc}</div></div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-text-muted block mb-1.5">{label}</label>
      <pre className="text-[11px] bg-surface-2 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed max-h-60 overflow-auto">{children}</pre>
    </div>
  )
}

function ResultRow({ r }: { r: ExperimentDetail['results'][number] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        {r.overall == null ? <Circle className="w-4 h-4 text-text-muted shrink-0" /> : r.pass ? <CheckCircle2 className="w-4 h-4 text-emerald shrink-0" /> : <XCircle className="w-4 h-4 text-red shrink-0" />}
        <span className="text-xs font-mono font-medium truncate flex-1">{r.caseId}</span>
        {r.overall != null && <span className="text-sm font-bold tabular-nums">{r.overall.toFixed(2)}</span>}
        {r.costUsd > 0 && <span className="text-[10px] text-text-muted tabular-nums">${r.costUsd.toFixed(4)}</span>}
        {r.output && <button onClick={() => setOpen(o => !o)} className="text-[10px] text-accent hover:underline shrink-0">{open ? 'Hide' : 'Output'}</button>}
      </div>
      {r.reasoning && <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed line-clamp-3">{r.reasoning}</p>}
      {open && r.output && <pre className="mt-2 text-[10px] bg-surface-2 rounded-lg p-2.5 max-h-64 overflow-auto whitespace-pre-wrap break-words leading-relaxed">{r.output}</pre>}
    </div>
  )
}

function CompareDrawer({ a, b, onClose }: { a: string; b: string; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof compareExperiments>> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { compareExperiments(a, b).then(setData).catch(e => setErr(e instanceof Error ? e.message : 'Failed')) }, [a, b])
  return (
    <Drawer title="Compare experiments" onClose={onClose} wide>
      <div className="flex-1 overflow-y-auto p-5">
        {err ? <ErrorState message={err} className="h-32" /> : !data ? <div className="flex items-center justify-center h-32 text-text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="card p-3"><div className="font-semibold truncate">A · {data.a.agent}</div><div className="text-text-muted text-[10px]">avg {data.a.summary.avgOverall ?? '—'}</div></div>
              <div className="card p-3"><div className="font-semibold truncate">B · {data.b.agent}</div><div className="text-text-muted text-[10px]">avg {data.b.summary.avgOverall ?? '—'}</div></div>
            </div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead><tr className="text-text-muted border-b border-border bg-surface-2/50">
                  <th className="text-left py-2 px-4 font-medium">Case</th>
                  <th className="text-right py-2 px-4 font-medium">A</th>
                  <th className="text-right py-2 px-4 font-medium">B</th>
                  <th className="text-right py-2 px-4 font-medium">Δ</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((r: ComparisonRow) => {
                    const flip = r.aPass != null && r.bPass != null && r.aPass !== r.bPass
                    return (
                      <tr key={r.caseId} className="border-b border-border/50">
                        <td className="py-2 px-4 font-mono truncate">{r.caseId}{flip && <span className={`ml-1.5 text-[9px] px-1 py-0.5 rounded text-text ${r.bPass ? 'bg-emerald/15' : 'bg-red/15'}`}>{r.bPass ? 'now PASS' : 'now FAIL'}</span>}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-text-muted">{passDot(r.aPass)}{r.aOverall != null ? r.aOverall.toFixed(2) : '—'}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-text-muted">{passDot(r.bPass)}{r.bOverall != null ? r.bOverall.toFixed(2) : '—'}</td>
                        <td className={`py-2 px-4 text-right tabular-nums font-semibold ${r.delta == null ? 'text-text-muted' : r.delta > 0 ? 'text-emerald' : r.delta < 0 ? 'text-red' : 'text-text-muted'}`}>
                          {r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(2)}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

function Drawer({ title, subtitle, onClose, wide, children }: { title: string; subtitle?: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  // a11y: Esc closes, focus enters the panel on open + returns to the trigger on close,
  // and Tab is trapped inside the modal so keyboard users can't get stuck behind the backdrop.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) || []).filter(n => !n.hasAttribute('disabled') && n.offsetParent !== null)
    focusables()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const f = focusables(); if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={`relative ${wide ? 'max-w-2xl' : 'max-w-lg'} w-full h-full bg-surface border-l border-border shadow-pop flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-accent" /> {title}</h2>
            {subtitle && <p className="text-[10px] text-text-muted mt-0.5 truncate font-mono">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function passDot(pass: boolean | null) {
  if (pass == null) return null
  return <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${pass ? 'bg-emerald' : 'bg-red'}`} aria-label={pass ? 'pass' : 'fail'} />
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <div className="card p-3"><div className={`text-lg font-bold tabular-nums ${accent || ''}`}>{value}</div><div className="text-[10px] text-text-muted mt-0.5">{label}</div></div>
}
