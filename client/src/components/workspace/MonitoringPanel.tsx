import { useEffect, useState, useCallback } from 'react'
import { Clock, CheckCircle2, XCircle, Loader2, TrendingUp } from 'lucide-react'
import { Spinner } from '../Skeleton'
import EmptyState from '../EmptyState'
import { relTime } from '../../lib/relTime'
import { getWorkspaceProjectSchedules, getWorkspaceProjectResults, type BuildSchedule, type BuildResults } from '../../lib/api'

const STATUS_ICON = {
  pending: { Icon: Clock, cls: 'text-text-muted' },
  running: { Icon: Loader2, cls: 'text-accent animate-spin' },
  done: { Icon: CheckCircle2, cls: 'text-green' },
  failed: { Icon: XCircle, cls: 'text-red' },
} as const

function dueLabel(s: BuildSchedule): string {
  if (s.status === 'done' && s.ranAt) return `ran ${relTime(s.ranAt)}`
  if (s.status === 'failed') return 'failed'
  const d = s.dueAt - Date.now()
  if (d <= 0) return 'due now'
  const h = Math.round(d / 3600000)
  return h < 24 ? `due in ${h}h` : `due in ${Math.round(h / 24)}d`
}

// Post-publish monitoring: the lumen 48h watch + orbit/catalyst 30/90d results
// checkpoints from build_schedules. Empty until a build is published.
export default function MonitoringPanel({ projectId, reloadKey }: { projectId: string; reloadKey?: number }) {
  const [data, setData] = useState<{ present: boolean; schedules: BuildSchedule[] } | null>(null)
  const [results, setResults] = useState<BuildResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([
      getWorkspaceProjectSchedules(projectId).then(setData),
      getWorkspaceProjectResults(projectId).then(setResults).catch(() => setResults(null)),
    ])
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load monitoring'))
      .finally(() => setLoading(false))
  }, [projectId])
  useEffect(() => { setLoading(true); load() }, [load, reloadKey])

  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>

  const hasResults = results?.present && (Object.keys(results.meta).length > 0 || results.tables.length > 0)

  if (!data?.present && !hasResults) return <EmptyState icon={Clock} title="No monitoring scheduled" description="The 48h watch + 30/90d results checkpoints register once this build is published to the live store." />

  return (
    <div className="space-y-3">
      {data?.present && (
        <div className="card divide-y divide-border">
          {data.schedules.map((s) => {
            const { Icon, cls } = STATUS_ICON[s.status] || STATUS_ICON.pending
            const verdict = s.result && (s.result.verdict || s.result.status)
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <Icon className={`w-4 h-4 shrink-0 ${cls}`} />
                <span className="font-medium w-16">{s.label}</span>
                <span className="text-[11px] text-text-muted uppercase tracking-wide">{s.kind}</span>
                <span className="ml-auto text-text-muted text-[12px]">{dueLabel(s)}</span>
                {verdict ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-text-muted/10">{String(verdict)}</span> : null}
              </div>
            )
          })}
        </div>
      )}

      {hasResults && results && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold"><TrendingUp className="w-4 h-4 text-green" /> Results</div>
          {Object.keys(results.meta).length > 0 && (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {Object.entries(results.meta).map(([k, v]) => (
                <div key={k}><dt className="text-[11px] text-text-muted">{k}</dt><dd className="text-[13px] font-medium">{v}</dd></div>
              ))}
            </dl>
          )}
          {results.tables.map((t, ti) => (
            <div key={ti} className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-text-muted text-left">{t.header.map((h, i) => <th key={i} className="font-medium py-1 pr-3">{h}</th>)}</tr></thead>
                <tbody>{t.rows.map((row, ri) => <tr key={ri} className="border-t border-border">{row.map((c, ci) => <td key={ci} className="py-1.5 pr-3">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
