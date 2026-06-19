import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { Spinner } from '../Skeleton'
import EmptyState from '../EmptyState'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceBuildSchedules } from '../../lib/api'

// Schedules scoped to this build (lumen 48h watch, catalyst 30/90d loop). Build-
// level scheduling isn't wired into the registry yet, so this is usually empty
// with an honest note rather than a fake row.
export default function SchedulesTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const nav = useNavigate()
  const { data, loading, error } = useBuildSection(() => getWorkspaceBuildSchedules(buildId), reloadKey)
  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data || data.total === 0) {
    return <EmptyState icon={Clock} title="No schedules for this build" description={data?.note || 'Build-level scheduling is not wired into the registry yet.'}
      action={{ label: 'All schedules', onClick: () => nav('/schedules') }} />
  }
  return (
    <div className="card divide-y divide-border">
      {data.schedules.map((s, i) => (
        <div key={(s.id as string) || i} className="px-4 py-3 text-[13px]">
          <span className="font-medium">{(s.name as string) || (s.id as string) || `schedule ${i + 1}`}</span>
        </div>
      ))}
    </div>
  )
}
