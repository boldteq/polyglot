import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Boxes, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { Spinner } from '../components/Skeleton'
import ScoreGauge from '../components/workspace/ScoreGauge'
import StepIndicator from '../components/workspace/StepIndicator'
import VerdictPill from '../components/workspace/VerdictPill'
import { getWorkspaceBuilds, type AssembledBuild } from '../lib/api'

function relTime(ms: number | null): string {
  if (!ms) return 'no Lens run'
  const d = Date.now() - ms
  if (d < 0) return 'just now'
  const h = Math.floor(d / 3600000)
  if (h < 1) return `${Math.max(1, Math.floor(d / 60000))}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// All client builds across platforms, scored + filterable.
export default function WorkspaceBuilds() {
  const nav = useNavigate()
  const [builds, setBuilds] = useState<AssembledBuild[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'attention' | 'passing'>('all')

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getWorkspaceBuilds()
      .then((d) => setBuilds(d.builds))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load builds'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const shown = builds.filter((b) =>
    filter === 'all' ? true : filter === 'attention' ? b.score < 70 : b.score >= 70)

  return (
    <PageShell
      title="Builds"
      subtitle="Every client build across platforms — scored, newest first"
      actions={<button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>}
    >
      {loading ? <Spinner /> : error ? (
        <div className="card p-6 text-red flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{error}
          <button onClick={load} className="underline ml-2">Retry</button></div>
      ) : builds.length === 0 ? (
        <EmptyState icon={Boxes} title="No builds discovered" description="Builds appear here once a client theme has a gate-reports/ folder." />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1.5">
            {(['all', 'attention', 'passing'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full capitalize transition-colors ${filter === f ? 'bg-accent text-white' : 'bg-text-muted/10 text-text-muted hover:text-text'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="card divide-y divide-border">
            {shown.map((b) => (
              <button key={b.buildId} onClick={() => nav(`/workspace/builds/${b.buildId}`)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-text-muted/5 text-left transition-colors">
                <ScoreGauge score={b.score} grade={b.grade} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium capitalize truncate">{b.client}</span>
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
            ))}
            {shown.length === 0 && <div className="px-4 py-6 text-[13px] text-text-muted text-center">No {filter} builds.</div>}
          </div>
        </div>
      )}
    </PageShell>
  )
}
