import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, CheckCircle2, ChevronRight } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { Spinner } from '../components/Skeleton'
import ScoreGauge from '../components/workspace/ScoreGauge'
import VerdictPill from '../components/workspace/VerdictPill'
import { getWorkspaceEscalations, type EscalationBuild } from '../lib/api'

// Builds needing attention: score<70, open blockers, or Lens BLOCK.
export default function WorkspaceEscalations() {
  const nav = useNavigate()
  const [rows, setRows] = useState<EscalationBuild[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getWorkspaceEscalations()
      .then((d) => setRows(d.escalations))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load escalations'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <PageShell
      title="Escalations"
      subtitle="Builds below the quality bar — score < 70, open blockers, or Lens BLOCK"
      actions={<button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>}
    >
      {loading ? <Spinner /> : error ? (
        <div className="card p-6 text-red flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{error}
          <button onClick={load} className="underline ml-2">Retry</button></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing needs attention" description="Every discovered build is at or above the quality bar. Builds appear here when score drops below 70, blockers open, or Lens blocks." />
      ) : (
        <div className="card divide-y divide-border">
          {rows.map((b) => (
            <button key={b.buildId} onClick={() => nav(`/workspace/builds/${b.buildId}`)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-text-muted/5 text-left transition-colors">
              <ScoreGauge score={b.score} grade={b.grade} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold capitalize truncate">{b.client}</span>
                  <span className="text-[10px] uppercase tracking-wide text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded">{b.platform}</span>
                  <VerdictPill verdict={b.lensVerdict} blockers={b.gates.blockersOpen} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.reasons.map((r, i) => (
                    <span key={i} className="text-[11px] bg-red/10 text-red px-1.5 py-0.5 rounded">{r}</span>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
    </PageShell>
  )
}
