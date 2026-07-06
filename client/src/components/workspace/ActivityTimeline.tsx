import { useEffect, useState, useCallback, useRef } from 'react'
import { Bot, Zap, ShieldCheck, TrendingUp, DollarSign, FileEdit, Activity, ChevronRight } from 'lucide-react'
import { SkeletonCards } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import EmptyState from '../EmptyState'
import { relTime } from '../../lib/relTime'
import { InlineMd } from '../../lib/inlineMd'
import { useWorkspaceStream } from '../../hooks/useWorkspaceStream'
import { getWorkspaceProjectActivity, type ActivityEvent, type ActivitySpend } from '../../lib/api'

const KIND: Record<string, { icon: typeof Bot; cls: string; label: string }> = {
  dispatch: { icon: Bot, cls: 'text-accent', label: 'dispatch' },
  action: { icon: Zap, cls: 'text-violet', label: 'action' },
  gate: { icon: ShieldCheck, cls: 'text-green', label: 'gate' },
  score: { icon: TrendingUp, cls: 'text-amber', label: 'score' },
  cost: { icon: DollarSign, cls: 'text-text-muted', label: 'cost' },
  changes: { icon: FileEdit, cls: 'text-accent', label: 'changes' },
}

// Live, newest-first history feed for a project. Initial load, then re-fetches on
// any workspace SSE event (gate/changes/lens/score) so the feed updates as the
// build moves — the user's "see live project history in one panel".
export default function ActivityTimeline({ projectId, reloadKey }: { projectId: string; reloadKey?: number }) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [spend, setSpend] = useState<ActivitySpend | null>(null)
  const [spendOpen, setSpendOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(() => {
    getWorkspaceProjectActivity(projectId, { limit: 60 })
      .then((d) => { setEvents(d.events); setSpend(d.spend ?? null) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load activity'))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { setLoading(true); load() }, [load, reloadKey])

  // live: debounced refetch on any workspace event (a burst of file writes → one refetch)
  useWorkspaceStream(useCallback(() => {
    if (debounce.current) return
    debounce.current = setTimeout(() => { debounce.current = null; load() }, 800)
  }, [load]))

  if (loading && !events.length) return <SkeletonCards count={3} />
  if (error) return <ErrorState message={error} />
  if (!events.length) return <EmptyState icon={Activity} title="No activity yet" description="Dispatches, gate runs, and score changes for this project will appear here, newest first." />

  return (
    <div className="space-y-2">
      {spend && spend.runs > 0 && (
        <div className="px-1">
          <button onClick={() => setSpendOpen((v) => !v)}
            className="flex items-center gap-2 text-[12px] text-text-muted hover:text-text"
            disabled={!spend.byAgent || !spend.byAgent.length}>
            <DollarSign className="w-3.5 h-3.5 text-green" />
            <span><span className="font-semibold text-text">${spend.totalCostUsd.toFixed(2)}</span> spent on this build · {spend.runs} dispatch run{spend.runs === 1 ? '' : 's'}</span>
            {spend.byAgent && spend.byAgent.length > 0 && <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${spendOpen ? 'rotate-90' : ''}`} />}
          </button>
          {spendOpen && spend.byAgent && (
            <div className="mt-1.5 ml-5 card divide-y divide-border">
              {spend.byAgent.map((a) => (
                <div key={a.agent} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                  <span className="font-medium flex-1 truncate">{a.agent}</span>
                  <span className="text-text-muted">{a.runs} run{a.runs === 1 ? '' : 's'}</span>
                  <span className="text-text-muted">{(a.tokens / 1000).toFixed(1)}k tok</span>
                  <span className="font-semibold w-16 text-right">${a.costUsd.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    <ol className="card divide-y divide-border">
      {events.map((e, i) => {
        const k = KIND[e.kind] || KIND.action
        const Icon = k.icon
        const hasDetail = !!e.detail
        return (
          <li key={i}>
            <button onClick={() => hasDetail && setOpen((o) => ({ ...o, [i]: !o[i] }))}
              className={`w-full flex items-start gap-3 px-4 py-2.5 text-left ${hasDetail ? 'hover:bg-text-muted/5' : 'cursor-default'}`}>
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${k.cls}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] truncate"><InlineMd text={e.summary} /></span>
                </div>
                <div className="text-[11px] text-text-muted">{e.actor} · {k.label}</div>
                {hasDetail && open[i] && <pre className="mt-1.5 text-[11px] text-text-muted whitespace-pre-wrap break-words bg-surface-2 rounded-lg p-2 max-h-48 overflow-y-auto">{e.detail}</pre>}
              </div>
              <span className="text-[11px] text-text-muted shrink-0">{relTime(e.ts)}</span>
            </button>
          </li>
        )
      })}
    </ol>
    </div>
  )
}
