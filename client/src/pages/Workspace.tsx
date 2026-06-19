import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, RefreshCw, AlertTriangle, CheckCircle2, Boxes, ChevronRight } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'
import ScoreGauge from '../components/workspace/ScoreGauge'
import StepIndicator from '../components/workspace/StepIndicator'
import VerdictPill from '../components/workspace/VerdictPill'
import { getWorkspaceBuilds, getWorkspaceEscalations, type AssembledBuild, type EscalationBuild } from '../lib/api'

function relTime(ms: number | null): string {
  if (!ms) return 'no Lens run'
  const d = Date.now() - ms
  if (d < 0) return 'just now'
  const h = Math.floor(d / 3600000)
  if (h < 1) return `${Math.max(1, Math.floor(d / 60000))}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone?: 'green' | 'red'; icon?: React.ReactNode }) {
  const c = tone === 'green' ? 'text-green' : tone === 'red' ? 'text-red' : 'text-text'
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-text-muted mb-1">{icon}{label}</div>
      <div className={`text-2xl font-bold ${c}`}>{value}</div>
    </div>
  )
}

function BuildCard({ b, onOpen }: { b: AssembledBuild; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card p-4 text-left hover:border-accent/40 transition-colors flex items-center gap-4 w-full">
      <ScoreGauge score={b.score} grade={b.grade} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold capitalize truncate">{b.client}</span>
          <span className="text-[10px] uppercase tracking-wide text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded">{b.platform}</span>
          <VerdictPill verdict={b.lensVerdict} blockers={b.gates.blockersOpen} />
        </div>
        <StepIndicator current={b.step.current} total={b.step.total} showLabel={false} />
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-text-muted">
          <span>step {b.step.current}/18</span>
          <span>gates {b.gates.passed}/{b.gates.total}</span>
          {b.changes.present && <span>changes {b.changes.rate}%</span>}
          <span className="ml-auto">{relTime(b.capturedAt)}</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
    </button>
  )
}

export default function Workspace() {
  const nav = useNavigate()
  const [builds, setBuilds] = useState<AssembledBuild[]>([])
  const [summary, setSummary] = useState<{ total: number; passing: number; blocked: number; avgScore: number } | null>(null)
  const [escalations, setEscalations] = useState<EscalationBuild[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [b, e] = await Promise.all([getWorkspaceBuilds(), getWorkspaceEscalations()])
      setBuilds(b.builds); setSummary(b.summary); setEscalations(e.escalations)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const clients = new Set(builds.map((b) => b.client)).size

  return (
    <PageShell
      title="Mission Control"
      subtitle="Every client build, scored end-to-end — read-only"
      actions={<button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>}
    >
      {loading ? <Spinner /> : error ? (
        <div className="card p-6 text-red flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{error}
          <button onClick={load} className="underline ml-2">Retry</button></div>
      ) : builds.length === 0 ? (
        <div className="card p-10 text-center">
          <LayoutGrid className="w-10 h-10 mx-auto text-text-muted mb-3" />
          <h3 className="font-semibold mb-1">No builds discovered</h3>
          <p className="text-[13px] text-text-muted max-w-md mx-auto">Builds appear here once a client theme has a <code>gate-reports/</code> folder. The pipeline writes these in VS Code; this dashboard only observes them.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* cross-platform stat strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Builds" value={summary?.total ?? builds.length} />
            <Stat label="Clients" value={clients} />
            <Stat label="Passing" value={summary?.passing ?? 0} tone="green" icon={<CheckCircle2 className="w-4 h-4 text-green" />} />
            <Stat label="Blocked" value={summary?.blocked ?? 0} tone="red" icon={<AlertTriangle className="w-4 h-4 text-red" />} />
            <Stat label="Avg score" value={summary?.avgScore ?? 0} />
          </div>

          {/* escalations strip */}
          {escalations.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-[15px] flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-red" /> Needs attention</h3>
                <button onClick={() => nav('/workspace/escalations')} className="text-[12px] text-accent hover:underline">View all ({escalations.length})</button>
              </div>
              <div className="card divide-y divide-border">
                {escalations.slice(0, 5).map((b) => (
                  <button key={b.buildId} onClick={() => nav(`/workspace/builds/${b.buildId}`)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-text-muted/5 text-left transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <ScoreGauge score={b.score} grade={b.grade} size={32} showGrade={false} />
                      <span className="font-medium capitalize truncate">{b.client}</span>
                    </div>
                    <span className="text-[12px] text-red truncate">{b.reasons.join(' · ')}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* recent builds */}
          <section>
            <h3 className="font-semibold text-[15px] mb-2 flex items-center gap-1.5"><Boxes className="w-4 h-4" /> Recent builds</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {builds.map((b) => <BuildCard key={b.buildId} b={b} onOpen={() => nav(`/workspace/builds/${b.buildId}`)} />)}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  )
}
