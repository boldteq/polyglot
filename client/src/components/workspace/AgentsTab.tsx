import { useNavigate } from 'react-router-dom'
import { Spinner } from '../Skeleton'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceBuildAgents, type BuildAgentActivity } from '../../lib/api'

// Agent activity for the build's platform roster (per-build attribution isn't
// tracked yet — the note makes that explicit). Each agent links to Playground.
export default function AgentsTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const nav = useNavigate()
  const { data, loading, error } = useBuildSection<BuildAgentActivity>(() => getWorkspaceBuildAgents(buildId), reloadKey)
  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-3">
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
      <p className="text-[11px] text-text-muted italic px-1">{data.note}</p>
    </div>
  )
}
