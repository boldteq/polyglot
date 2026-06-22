import { useNavigate } from 'react-router-dom'
import { Bot, User } from 'lucide-react'
import { Spinner } from '../Skeleton'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceBuildAgents, getWorkspaceBuildDispatches, type BuildAgentActivity } from '../../lib/api'

function relTime(ts: string | null): string {
  if (!ts) return ''
  const d = Date.now() - new Date(ts).getTime()
  if (Number.isNaN(d)) return ''
  const h = Math.floor(d / 3600000)
  if (h < 1) return `${Math.max(1, Math.floor(d / 60000))}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Agent activity for a build: REAL per-build dispatches run from the cockpit
// (wsd-<buildId> thread) on top, then platform-level roster activity (which is
// not per-build — the note says so). Each agent links to Playground.
export default function AgentsTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const nav = useNavigate()
  const { data, loading, error } = useBuildSection<BuildAgentActivity>(() => getWorkspaceBuildAgents(buildId), reloadKey)
  const { data: disp } = useBuildSection(() => getWorkspaceBuildDispatches(buildId), reloadKey)
  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      {/* REAL per-build: cockpit dispatches on THIS build */}
      {disp?.present && (
        <section>
          <h3 className="font-semibold text-[15px] mb-2 flex items-center gap-1.5"><Bot className="w-4 h-4 text-accent" /> Cockpit dispatches on this build</h3>
          <div className="card divide-y divide-border">
            {disp.turns.map((t, i) => (
              <div key={i} className="px-4 py-2.5 text-[13px]">
                <div className="flex items-center gap-2 mb-0.5">
                  {t.role === 'user' ? <User className="w-3.5 h-3.5 text-text-muted shrink-0" /> : <Bot className="w-3.5 h-3.5 text-accent shrink-0" />}
                  <span className="font-medium">{t.role === 'user' ? 'Task' : (disp.agent || 'agent')}</span>
                  {t.status && <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.status === 'success' ? 'bg-green/15 text-green' : 'bg-text-muted/10 text-text-muted'}`}>{t.status}</span>}
                  <span className="ml-auto text-[11px] text-text-muted">{relTime(t.timestamp)}</span>
                </div>
                <p className="text-text-muted line-clamp-3 whitespace-pre-wrap">{t.content}</p>
              </div>
            ))}
          </div>
          <button onClick={() => nav('/playground')} className="text-[12px] text-accent hover:underline mt-1.5">Continue in Playground →</button>
        </section>
      )}

      {/* platform-level roster activity (not per-build — see note) */}
      <section>
        {disp?.present && <h3 className="font-semibold text-[15px] mb-2">Platform agent activity</h3>}
        <div className="card p-4">
          <div className="flex items-center gap-6 mb-3 text-[13px]">
            <span><b className="text-base">{data.runs}</b> <span className="text-text-muted">runs</span></span>
            <span><b className="text-base">${data.costUsd.toFixed(2)}</b> <span className="text-text-muted">spend</span></span>
            <span><b className="text-base">{data.byAgent.length}</b> <span className="text-text-muted">agents</span></span>
            <span className="ml-auto text-text-muted">last {data.sinceDays}d</span>
          </div>
          {data.byAgent.length > 0 ? (
            <div className="divide-y divide-border">
              {data.byAgent.map((a) => (
                <button key={a.agentName} onClick={() => nav('/playground')}
                  className="w-full flex items-center justify-between px-1 py-2 hover:bg-text-muted/5 rounded text-left text-[13px]">
                  <span className="font-medium">{a.agentName}</span>
                  <span className="text-text-muted">{a.runs} runs · ${a.costUsd.toFixed(2)}</span>
                </button>
              ))}
            </div>
          ) : <p className="text-[12px] text-text-muted">No agent runs in this window.</p>}
        </div>
        <p className="text-[11px] text-text-muted italic px-1 mt-1.5">{data.note}</p>
      </section>
    </div>
  )
}
