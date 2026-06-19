import { TrendingUp } from 'lucide-react'
import { Spinner } from '../Skeleton'
import EmptyState from '../EmptyState'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceBuildResults, type ResultsData } from '../../lib/api'

// orbit's 30/90d results baseline (docs/results/baseline.md). Absent on every
// current build → honest empty state.
export default function ResultsTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const { data, loading, error } = useBuildSection<ResultsData>(() => getWorkspaceBuildResults(buildId), reloadKey)
  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data?.present) return <EmptyState icon={TrendingUp} title="No results baseline yet" description="orbit writes docs/results/baseline.md at T+48h / 30d / 90d with per-surface lift vs target. None published for this build." />

  return (
    <div className="space-y-4">
      {Object.keys(data.meta).length > 0 && (
        <div className="card p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(data.meta).map(([k, v]) => (
            <div key={k}><div className="text-[11px] text-text-muted">{k}</div><div className="text-[13px] font-medium">{v}</div></div>
          ))}
        </div>
      )}
      {data.tables.map((t, ti) => (
        <div key={ti} className="card overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="border-b border-border">{t.header.map((h, i) => <th key={i} className="text-left px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{t.rows.map((r, ri) => <tr key={ri} className="border-b border-border last:border-0">{r.map((c, ci) => <td key={ci} className="px-3 py-2 text-text-muted">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
