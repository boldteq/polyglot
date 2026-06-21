import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, FileCheck2, FileX2, Play, Lock, Bot } from 'lucide-react'
import { Spinner } from '../Skeleton'
import { formatAgentDisplay } from '../../lib/agentDisplay'
import { useWorkspaceAction } from '../../hooks/useWorkspaceAction'
import { openDispatch } from '../../lib/dispatch'
import { getWorkspaceBuildPipeline, getWorkspaceActions, type PipelineStep, type ActionDef } from '../../lib/api'

// Pipeline step key → the safe action that advances/verifies it. Steps not here
// have no panel action yet (build work = agent dispatch in P2; deploy = P4).
const STEP_ACTION: Record<string, string> = {
  discovery: 'check:discovery',
  'reuse-preflight': 'check:reuse-map',
  'design-spec': 'check:design-system',
  'qa-gates': 'gates:static',
  review: 'check:consistency',
  'store-data': 'store:preflight',
}
// Deploy/store steps reserved for P4 (live store/theme — separately gated).
const DEPLOY_STEPS = new Set(['staging', 'uat-publish'])

// The 18-step lifecycle made OPERATIONAL: status + owner + artifact + the safe
// action that applies to each step (confirm-gated via the shared hook).
export default function WorkflowTab({ buildId, reloadKey, onChanged }: { buildId: string; reloadKey?: number; onChanged?: () => void }) {
  const [steps, setSteps] = useState<PipelineStep[]>([])
  const [current, setCurrent] = useState(0)
  const [actions, setActions] = useState<ActionDef[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { run, trigger } = useWorkspaceAction(buildId, onChanged)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    Promise.all([getWorkspaceBuildPipeline(buildId), getWorkspaceActions()])
      .then(([p, a]) => { if (alive) { setSteps(p.steps); setCurrent(p.current); setActions(a.actions) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load workflow') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [buildId, reloadKey])

  if (loading) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>

  const runningId = run?.status === 'running' ? run.action : null

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-text-muted px-1">The 18-step Shopify Website lifecycle. Run the safe action for a step inline; deploy steps unlock in a later phase.</p>
      <div className="card p-2">
        <div className="px-3 py-2 text-[13px] text-text-muted">Step {current}/18</div>
        <ol className="relative">
          {steps.map((s) => {
            const Icon = s.status === 'done' ? CheckCircle2 : s.status === 'current' ? Loader2 : Circle
            const color = s.status === 'done' ? 'text-green' : s.status === 'current' ? 'text-accent' : 'text-text-muted'
            const owner = formatAgentDisplay({ name: s.owner, id: s.owner }).realName || s.owner
            const action = STEP_ACTION[s.key] ? actions.find((a) => a.id === STEP_ACTION[s.key]) : null
            const isDeploy = DEPLOY_STEPS.has(s.key)
            return (
              <li key={s.step} className="flex items-start gap-3 px-3 py-2 hover:bg-text-muted/5 rounded-lg">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color} ${s.status === 'current' ? 'animate-spin' : ''}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[13px] font-medium ${s.status === 'pending' ? 'text-text-muted' : ''}`}>{s.step}. {s.title}</span>
                    <span className="text-[10px] text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded">@{owner}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-0.5">
                    {s.artifactExists ? <FileCheck2 className="w-3 h-3 text-green" /> : <FileX2 className="w-3 h-3" />}
                    <code className="truncate">{s.artifact}</code>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {s.owner && (
                    <button onClick={() => openDispatch({ buildId, agent: s.owner, task: `Step ${s.step} — ${s.title}: ` })}
                      title={`Dispatch ${owner} for this step`}
                      className="btn-ghost btn-sm flex items-center gap-1 text-[11px]">
                      <Bot className="w-3 h-3" /> Send
                    </button>
                  )}
                  {action ? (
                    <button onClick={() => trigger(action)} disabled={runningId === action.id || !action.available}
                      title={action.available ? action.description : (action.unavailableReason || '')}
                      className="btn-ghost btn-sm flex items-center gap-1 text-[11px] disabled:opacity-40">
                      {runningId === action.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {action.label}
                    </button>
                  ) : isDeploy ? (
                    <span className="flex items-center gap-1 text-[10px] text-text-muted bg-text-muted/10 px-2 py-1 rounded" title="Live deploy — unlocks in a later, separately-gated phase">
                      <Lock className="w-3 h-3" /> P4
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
