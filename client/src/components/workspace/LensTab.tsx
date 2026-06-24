import { useEffect, useState } from 'react'
import { Eye, ExternalLink, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SkeletonCards } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import EmptyState from '../EmptyState'
import { useWorkspaceAction } from '../../hooks/useWorkspaceAction'
import { fetchWorkspaceActions } from '../../hooks/useWorkspaceActions'
import { getLensLatest, type LensLatest, type ActionDef } from '../../lib/api'

// Lens visual-truth for THIS build's dir. Reuses the existing /lens/latest?dir=
// API. Shows the gate-#18 verdict + blockers + frame thumbnails; deep-links to
// the full Lens page; and (Phase C) a "Re-run Lens" action (capture→judge→enforce,
// env-gated on a preview URL).
export default function LensTab({ buildId, dir, reloadKey, onChanged }: { buildId: string; dir: string; reloadKey?: number; onChanged?: () => void }) {
  const nav = useNavigate()
  const [data, setData] = useState<LensLatest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lensAction, setLensAction] = useState<ActionDef | null>(null)
  const { run, trigger } = useWorkspaceAction(buildId, onChanged)
  const rerunning = run?.status === 'running'

  useEffect(() => {
    fetchWorkspaceActions().then((actions) => setLensAction(actions.find((a) => a.id === 'lens:run') || null)).catch(err => console.error('[lens-tab] workspace-actions fetch failed:', err instanceof Error ? err.message : err))
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    getLensLatest(dir)
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load Lens') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [dir, reloadKey])

  const ReRunButton = lensAction ? (
    <button onClick={() => trigger(lensAction)} disabled={rerunning || !lensAction.available}
      title={lensAction.available ? lensAction.description : (lensAction.unavailableReason || '')}
      className="btn-ghost btn-sm flex items-center gap-1.5 disabled:opacity-50">
      {rerunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      {rerunning ? 'Running…' : 'Re-run Lens'}
    </button>
  ) : null

  if (loading) return <SkeletonCards count={3} />
  if (error) return <ErrorState message={error} />
  if (!data?.present) {
    return (
      <div className="space-y-3">
        <EmptyState icon={Eye} title="No Lens run for this build" description={data?.message || 'Capture → judge → enforce visual-truth. Needs a running preview URL.'} />
        {ReRunButton && <div className="flex justify-center">{ReRunButton}</div>}
      </div>
    )
  }

  const pass = data.gate18?.pass
  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {pass ? <CheckCircle2 className="w-7 h-7 text-green" /> : <AlertTriangle className="w-7 h-7 text-red" />}
          <div>
            <div className={`font-bold ${pass ? 'text-green' : 'text-red'}`}>Gate #18 visual-truth: {data.gate18 ? (pass ? 'PASS' : 'BLOCK') : 'not run'}</div>
            <div className="text-[12px] text-text-muted">{data.summary.frames} frames · {data.summary.fail} FAIL · {data.summary.pass} PASS{data.gate18 ? ` · ${data.gate18.blockers.length} blockers` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ReRunButton}
          <button onClick={() => nav(`/workspace/lens?dir=${encodeURIComponent(dir)}`)} className="btn-ghost btn-sm flex items-center gap-1.5">
            <ExternalLink className="w-4 h-4" /> Full Lens view
          </button>
        </div>
      </div>

      {data.gate18 && data.gate18.blockers.length > 0 && (
        <div className="card p-4">
          <h4 className="font-semibold text-red text-[13px] mb-2">{data.gate18.blockers.length} blocker(s)</h4>
          <ul className="space-y-1.5 text-[12px]">
            {data.gate18.blockers.slice(0, 10).map((b, i) => (
              <li key={i} className="flex gap-2"><code className="text-[10px] bg-red/10 text-red px-1.5 py-0.5 rounded shrink-0 h-fit">{b.id}</code><span className="text-text-muted">{b.detail}</span></li>
            ))}
          </ul>
        </div>
      )}

      {data.frames.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {data.frames.map((f, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <span className="text-[12px] font-medium capitalize">{f.surface} · {f.viewport}</span>
                {f.verdict && <span className={`text-[11px] font-bold px-2 py-0.5 rounded text-white ${f.verdict.verdict === 'FAIL' ? 'bg-red' : 'bg-green'}`}>{f.verdict.verdict}</span>}
              </div>
              {f.rest && <img src={f.rest} alt={`${f.surface} ${f.viewport}`} loading="lazy" className="w-full border-t border-border bg-black/5" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
