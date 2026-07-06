import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gavel, Plus, X, Trash2, Play, Loader2, ShieldCheck, Lock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import {
  getEvaluators, getEvaluatorCalibration, createEvaluator, updateEvaluator, deleteEvaluator,
  runEvaluator, runScheduleNow, apiError,
  type Evaluator, type EvalCalibration, type RubricDim, type EvaluatorRunResult,
} from '../lib/api'

// Evaluators (LangSmith "Evaluators") — library of LLM-as-judge rubrics +
// heuristic templates, plus the live judge calibration banner. Builtins are
// read-only; custom evaluators are fully editable.
export default function Evaluators() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Evaluator[]>([])
  const [calib, setCalib] = useState<EvalCalibration | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [editing, setEditing] = useState<Evaluator | 'new' | null>(null)

  // Evaluator list is the core content; calibration is a secondary banner. Load each
  // independently so a failed calibration fetch can't blank the (working) list.
  const load = useCallback(() => {
    setLoading(true); setErr(null)
    Promise.allSettled([getEvaluators(), getEvaluatorCalibration()]).then(([e, c]) => {
      if (e.status === 'fulfilled') setItems(e.value.items)
      else { setErr(e.reason instanceof Error ? e.reason.message : 'Failed to load evaluators'); apiError('Load evaluators', e.reason) }
      if (c.status === 'fulfilled') setCalib(c.value.calibration)
      else apiError('Load calibration', c.reason)
    }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const runCheck = async () => {
    setRunning(true)
    try { await runScheduleNow('sys-intel-eval'); toast('success', 'Calibration self-test queued — accuracy updates here after it runs') }
    catch (x) { toast('error', x instanceof Error ? x.message : 'Failed to start') }
    finally { setRunning(false) }
  }

  const onDelete = async (e: Evaluator) => {
    if (!(await confirmDialog({ title: `Delete "${e.name}"?`, message: 'This custom evaluator will be removed.', danger: true, confirmLabel: 'Delete' }))) return
    try { await deleteEvaluator(e.id); toast('success', 'Evaluator deleted'); setEditing(null); load() }
    catch (x) { toast('error', x instanceof Error ? x.message : 'Failed to delete') }
  }

  return (
    <PageShell
      title="Evaluators"
      subtitle="LLM-as-judge + heuristic evaluators that score agent output quality"
      actions={<button onClick={() => setEditing('new')} className="btn-primary btn-sm"><Plus className="w-3.5 h-3.5" /> New evaluator</button>}
    >
      {loading ? <Spinner /> : err ? <ErrorState message={err} onRetry={load} className="h-48" /> : (
        <div className="space-y-5">
          <CalibrationBanner calib={calib} running={running} onRun={runCheck} onViewScores={() => navigate('/monitoring?tab=observability')} />
          {items.length === 0 ? (
            <EmptyState icon={Gavel} title="No evaluators" description="Create one with the New evaluator button." card />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(e => (
                <button key={e.id} onClick={() => setEditing(e)} className="card p-4 text-left hover:border-accent/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <Gavel className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                    <span className="text-sm font-semibold truncate flex-1">{e.name}</span>
                    {e.builtin
                      ? <span className="text-[9px] text-text bg-surface-2 px-1.5 py-0.5 rounded inline-flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> builtin</span>
                      : <span className="text-[9px] text-text bg-accent/15 px-1.5 py-0.5 rounded">custom</span>}
                  </div>
                  <p className="text-[11px] text-text-muted line-clamp-2 min-h-[28px]">{e.description}</p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-text-muted">
                    <span className="bg-surface-2 px-1.5 py-0.5 rounded text-text">{e.kind}</span>
                    <span>{e.rubric.length} dimension{e.rubric.length !== 1 ? 's' : ''}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <EvaluatorDrawer
          evaluator={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
          onDelete={editing !== 'new' ? () => onDelete(editing) : undefined}
        />
      )}
    </PageShell>
  )
}

function CalibrationBanner({ calib, running, onRun, onViewScores }: { calib: EvalCalibration | null; running: boolean; onRun: () => void; onViewScores: () => void }) {
  const ok = !!calib?.calibrated
  const acc = calib?.accuracy != null ? Math.round(calib.accuracy * 100) : null
  return (
    <div className={`card p-4 flex items-center gap-3 ${ok ? 'border-emerald/30' : ''}`}>
      {ok ? <CheckCircle2 className="w-5 h-5 text-emerald shrink-0" /> : <AlertCircle className="w-5 h-5 text-amber shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{ok ? 'Judge is calibrated' : calib ? 'Judge not calibrated' : 'No calibration yet'}</p>
        <p className="text-[11px] text-text-muted">
          {calib
            ? `Accuracy ${acc}% · separation ${calib.meanSeparation?.toFixed(2) ?? '—'} · ${calib.total ?? 0} cases · ${new Date(calib.at).toLocaleString()}`
            : 'Run the self-test to grade the judge against the golden good/bad fixtures.'}
        </p>
      </div>
      <button onClick={onViewScores} className="btn-secondary btn-sm shrink-0"><ShieldCheck className="w-3.5 h-3.5" /> Scores</button>
      <button onClick={onRun} disabled={running} className="btn-primary btn-sm shrink-0" title="Re-run the judge self-test against the golden good/bad fixtures">
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Recalibrate judge
      </button>
    </div>
  )
}

function EvaluatorDrawer({ evaluator, onClose, onSaved, onDelete }: { evaluator: Evaluator | null; onClose: () => void; onSaved: () => void; onDelete?: () => void }) {
  const readonly = !!evaluator?.builtin
  const [name, setName] = useState(evaluator?.name ?? '')
  const [description, setDescription] = useState(evaluator?.description ?? '')
  const [rubric, setRubric] = useState<RubricDim[]>(evaluator?.rubric ?? [{ dim: '', desc: '' }])
  const [saving, setSaving] = useState(false)
  // Test panel — run this evaluator's rubric against a sample (the thing that makes it real).
  const [testTask, setTestTask] = useState('')
  const [testOutput, setTestOutput] = useState('')
  const [testRunning, setTestRunning] = useState(false)
  const [testResult, setTestResult] = useState<EvaluatorRunResult | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  // a11y: Esc closes, focus enters the panel + returns to the trigger on close, Tab trapped inside.
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

  const runTest = async () => {
    if (!evaluator) return
    if (!testOutput.trim()) { toast('error', 'Paste some output to score'); return }
    setTestRunning(true); setTestResult(null)
    try { setTestResult(await runEvaluator(evaluator.id, { task: testTask, output: testOutput })) }
    catch (x) { toast('error', x instanceof Error ? x.message : 'Test failed') }
    finally { setTestRunning(false) }
  }

  const setDim = (i: number, key: keyof RubricDim, v: string) => setRubric(r => r.map((d, j) => j === i ? { ...d, [key]: v } : d))
  const addDim = () => setRubric(r => [...r, { dim: '', desc: '' }])
  const removeDim = (i: number) => setRubric(r => r.filter((_, j) => j !== i))

  const save = async () => {
    if (!name.trim()) { toast('error', 'Name is required'); return }
    const clean = rubric.filter(d => d.dim.trim())
    if (clean.length === 0) { toast('error', 'Add at least one rubric dimension'); return }
    setSaving(true)
    try {
      if (evaluator) await updateEvaluator(evaluator.id, { name: name.trim(), description, rubric: clean })
      else await createEvaluator({ name: name.trim(), description, rubric: clean })
      toast('success', 'Evaluator saved')
      onSaved()
    } catch (x) { toast('error', x instanceof Error ? x.message : 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Evaluator">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="relative w-full max-w-lg h-full bg-surface border-l border-border shadow-pop flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Gavel className="w-4 h-4 text-accent" /> {evaluator ? (readonly ? 'View evaluator' : 'Edit evaluator') : 'New evaluator'}
            {readonly && <span className="text-[9px] text-text bg-surface-2 px-1.5 py-0.5 rounded inline-flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> builtin</span>}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-2"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {readonly && <p className="text-[11px] text-text bg-surface-2 rounded-lg px-3 py-2">Builtin evaluators are read-only. Duplicate the idea in a new evaluator to customize it.</p>}
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} disabled={readonly} className="input" placeholder="e.g. Tone of voice" aria-label="Evaluator name" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted block mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} disabled={readonly} rows={2} className="input leading-relaxed" placeholder="What this evaluator checks" aria-label="Evaluator description" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-text-muted">Rubric dimensions</label>
              {!readonly && <button onClick={addDim} className="text-[11px] text-accent hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>}
            </div>
            <div className="space-y-2">
              {rubric.map((d, i) => (
                <div key={i} className="card p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={d.dim} onChange={e => setDim(i, 'dim', e.target.value)} disabled={readonly} className="input flex-1 font-mono text-xs" placeholder="dimension (e.g. correctness)" aria-label={`Dimension ${i + 1} key`} />
                    {!readonly && rubric.length > 1 && <button onClick={() => removeDim(i)} aria-label="Remove dimension" className="p-1.5 text-text-muted hover:text-red"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                  <textarea value={d.desc} onChange={e => setDim(i, 'desc', e.target.value)} disabled={readonly} rows={2} className="input text-xs leading-relaxed" placeholder="what 'good' looks like for this dimension" aria-label={`Dimension ${i + 1} description`} />
                </div>
              ))}
            </div>
          </div>

          {/* Test panel — run this evaluator's rubric against a sample */}
          {evaluator ? (
            <div className="border-t border-border-subtle pt-4">
              <label className="text-xs font-medium text-text-muted block mb-1.5 flex items-center gap-1.5"><Play className="w-3 h-3" /> Test this evaluator</label>
              <input value={testTask} onChange={e => setTestTask(e.target.value)} className="input mb-2" placeholder="task / context (optional)" aria-label="Test task" />
              <textarea value={testOutput} onChange={e => setTestOutput(e.target.value)} rows={3} className="input text-xs leading-relaxed" placeholder="paste the output to score…" aria-label="Test output" />
              <button onClick={runTest} disabled={testRunning || !testOutput.trim()} className="btn-secondary btn-sm mt-2">
                {testRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run evaluator
              </button>
              {testResult && (
                <div className="card p-3 mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {testResult.pass ? <CheckCircle2 className="w-4 h-4 text-emerald" /> : <XCircle className="w-4 h-4 text-red" />}
                    <span className="text-sm font-bold tabular-nums">{testResult.overall.toFixed(2)}</span>
                    <span className="text-[10px] text-text-muted">{testResult.pass ? 'pass' : 'fail'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(testResult.scores).map(([dim, v]) => (
                      <span key={dim} className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded font-mono">{dim} {Number(v).toFixed(2)}</span>
                    ))}
                  </div>
                  {testResult.reasoning && <p className="text-[11px] text-text-muted leading-relaxed">{testResult.reasoning}</p>}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-text-muted border-t border-border-subtle pt-4">Save this evaluator to test it against a sample output.</p>
          )}
        </div>

        {!readonly && (
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
            {onDelete ? <button onClick={onDelete} className="btn-secondary btn-sm text-red"><Trash2 className="w-3.5 h-3.5" /> Delete</button> : <span />}
            <button onClick={save} disabled={saving} className="btn-primary btn-sm">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save evaluator</button>
          </div>
        )}
      </div>
    </div>
  )
}
