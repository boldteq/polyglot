import { CheckSquare, Square } from 'lucide-react'
import { Spinner } from '../Skeleton'
import EmptyState from '../EmptyState'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceBuildChanges, type ChangesData } from '../../lib/api'

// Parsed CHANGES.md: completion bar + waivers + per-item checklist.
export default function ChangesTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const { data, loading, error } = useBuildSection<ChangesData>(() => getWorkspaceBuildChanges(buildId), reloadKey)
  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data?.present) return <EmptyState icon={Square} title="No CHANGES.md" description="This build has no changes list yet. Atrium writes one per client ask at intake." />

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between text-[13px] mb-2">
          <span className="font-medium">{data.checked}/{data.total} complete</span>
          <span className="text-text-muted">{data.rate}%</span>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${data.rate}%` }} />
        </div>
      </div>

      {data.waivers.length > 0 && (
        <div className="card p-4">
          <h4 className="font-semibold text-[13px] mb-2 text-amber">Waivers ({data.waivers.length})</h4>
          <ul className="space-y-1 text-[12px] text-text-muted">{data.waivers.map((w, i) => <li key={i}>• {w}</li>)}</ul>
        </div>
      )}

      <div className="card divide-y divide-border">
        {data.items.map((it, i) => (
          <div key={i} className="flex items-start gap-2.5 px-4 py-2.5 text-[13px]">
            {it.checked
              ? <CheckSquare className="w-4 h-4 text-green shrink-0 mt-0.5" />
              : <Square className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />}
            <span className={it.checked ? 'text-text-muted' : ''}>{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
