// The Upcoming view — "which task runs at which time." A merged timeline of the
// next fire times across all enabled cron schedules, grouped Today / Tomorrow /
// This week / Later, plus an event-driven group for trigger-based schedules.
import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Zap, AlertCircle, Clock } from 'lucide-react'
import { getScheduleUpcoming, type UpcomingRun, type EventDrivenSchedule } from '../lib/scheduleApi'
import { apiError } from '../lib/api'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { humanizeCron } from '../lib/scheduleFormat'
import { SkeletonCards } from './Skeleton'
import EmptyState from './EmptyState'

const ORDER = ['Today', 'Tomorrow', 'This week', 'Later'] as const

function dayGroup(iso: string): typeof ORDER[number] {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return 'This week'
  return 'Later'
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// The viewer's short tz label (e.g. "GMT+5:30"), computed once for the disclosure
// note so the local fire times reconcile with the UTC crons beside them.
const localTz = (() => {
  try {
    const part = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')
    return part?.value || 'local time'
  } catch { return 'local time' }
})()

export default function ScheduleUpcoming() {
  const [data, setData] = useState<{ upcoming: UpcomingRun[]; eventDriven: EventDrivenSchedule[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setLoadError(false)
    getScheduleUpcoming(80, 3)
      .then(setData)
      .catch(err => { apiError('Load upcoming', err); setLoadError(true) })
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <SkeletonCards count={5} />
  if (loadError) return (
    <div className="card p-8 flex flex-col items-center gap-3 text-center">
      <AlertCircle className="w-8 h-8 text-red opacity-60" />
      <p className="text-sm text-text-muted">Failed to load the upcoming timeline.</p>
      <button onClick={load} className="btn-primary btn-sm">Retry</button>
    </div>
  )
  if (!data || (data.upcoming.length === 0 && data.eventDriven.length === 0)) {
    return <EmptyState icon={Clock} title="Nothing scheduled" description="Enable a schedule with a cron timer and its next runs will appear here." card />
  }

  const groups: Record<string, UpcomingRun[]> = {}
  for (const u of data.upcoming) (groups[dayGroup(u.fireAt)] ||= []).push(u)

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-text-muted">
        Times shown in your local timezone (<span className="font-medium">{localTz}</span>) · schedules are defined in UTC.
      </p>
      {ORDER.filter(g => groups[g]?.length).map(g => (
        <div key={g}>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">{g}</div>
          <div className="space-y-2">
            {groups[g].map(u => {
              const d = formatAgentDisplay({ name: u.agentName, id: u.agentName })
              return (
                <div key={`${u.id}-${u.fireAt}`} className="card p-3 flex items-center gap-3">
                  <CalendarClock className="w-4 h-4 text-accent shrink-0" />
                  <span className="font-mono text-sm tabular-nums shrink-0 w-14">{fmtTime(u.fireAt)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-[11px] text-text-muted truncate" title={u.cron}>{d.realName} · {humanizeCron(u.cron)}</div>
                  </div>
                  {u.kind === 'system' && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple/15 text-purple shrink-0">system</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {data.eventDriven.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Event-driven · no fixed time
          </div>
          <div className="space-y-2">
            {data.eventDriven.map(e => {
              const d = formatAgentDisplay({ name: e.agentName, id: e.agentName })
              return (
                <div key={e.id} className="card p-3 flex items-center gap-3">
                  <Zap className="w-4 h-4 text-text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{e.name}</div>
                    <div className="text-[11px] text-text-muted truncate">{d.realName} · fires on {e.trigger}</div>
                  </div>
                  {e.kind === 'system' && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple/15 text-purple shrink-0">system</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
