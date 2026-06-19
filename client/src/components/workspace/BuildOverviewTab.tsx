import type { BuildDetail } from '../../lib/api'

// Overview tab: score breakdown + pending artifacts + (platform-level) agent
// activity. Pure presentation — data comes from useBuild in the parent.
export default function BuildOverviewTab({ detail }: { detail: BuildDetail }) {
  const { build, agents } = detail
  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold text-[15px] mb-2">Score breakdown <span className="text-text-muted font-normal text-[12px]">· max realistic today {build.maxRealistic}</span></h3>
        <div className="card divide-y divide-border">
          {build.scoreBreakdown.map((line) => (
            <div key={line.key} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium">{line.key.replace(/_/g, ' ')}</span>
                <span className="text-text-muted truncate">— {line.detail}</span>
              </div>
              <span className={`font-mono shrink-0 ${line.earned < 0 ? 'text-red' : line.earned === line.weight ? 'text-green' : 'text-text-muted'}`}>{line.earned}/{line.weight}</span>
            </div>
          ))}
        </div>
      </section>

      {build.pending.length > 0 && (
        <section>
          <h3 className="font-semibold text-[15px] mb-2">Pending artifacts</h3>
          <div className="card p-4">
            <p className="text-[12px] text-text-muted mb-2">Not produced yet — these cap the realistic score until the pipeline emits them:</p>
            <div className="flex flex-wrap gap-1.5">
              {build.pending.map((p, i) => <span key={i} className="text-[11px] bg-amber/10 text-amber px-1.5 py-0.5 rounded">{p}</span>)}
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="font-semibold text-[15px] mb-2">Agent activity <span className="text-text-muted font-normal text-[12px]">· last {agents.sinceDays}d</span></h3>
        <div className="card p-4">
          <div className="flex items-center gap-6 mb-3 text-[13px]">
            <span><b className="text-base">{agents.runs}</b> <span className="text-text-muted">runs</span></span>
            <span><b className="text-base">${agents.costUsd.toFixed(2)}</b> <span className="text-text-muted">spend</span></span>
            <span><b className="text-base">{agents.byAgent.length}</b> <span className="text-text-muted">agents</span></span>
          </div>
          {agents.byAgent.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {agents.byAgent.map((a) => (
                <span key={a.agentName} className="text-xs bg-text-muted/10 px-2.5 py-1 rounded-full">{a.agentName} · {a.runs} · ${a.costUsd.toFixed(2)}</span>
              ))}
            </div>
          ) : <p className="text-[12px] text-text-muted">No agent runs in this window.</p>}
          <p className="text-[11px] text-text-muted mt-3 italic">{agents.note}</p>
        </div>
      </section>
    </div>
  )
}
