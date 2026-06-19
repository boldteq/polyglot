import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2, FileCheck2, FileX2 } from 'lucide-react'
import { Spinner } from '../Skeleton'
import { getWorkspaceBuildPipeline, type PipelineStep } from '../../lib/api'

// Vertical 18-step timeline: done / current / pending, with owner agent and
// whether the step's expected artifact exists on disk.
export default function PipelineTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const [steps, setSteps] = useState<PipelineStep[]>([])
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    getWorkspaceBuildPipeline(buildId)
      .then((d) => { if (alive) { setSteps(d.steps); setCurrent(d.current) } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load pipeline') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [buildId, reloadKey])

  if (loading) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>

  return (
    <div className="card p-2">
      <div className="px-3 py-2 text-[13px] text-text-muted">Step {current}/18</div>
      <ol className="relative">
        {steps.map((s) => {
          const Icon = s.status === 'done' ? CheckCircle2 : s.status === 'current' ? Loader2 : Circle
          const color = s.status === 'done' ? 'text-green' : s.status === 'current' ? 'text-accent' : 'text-text-muted'
          return (
            <li key={s.step} className="flex items-start gap-3 px-3 py-2 hover:bg-text-muted/5 rounded-lg">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color} ${s.status === 'current' ? 'animate-spin' : ''}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-medium ${s.status === 'pending' ? 'text-text-muted' : ''}`}>{s.step}. {s.title}</span>
                  <span className="text-[10px] text-text-muted">{s.owner}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-0.5">
                  {s.artifactExists ? <FileCheck2 className="w-3 h-3 text-green" /> : <FileX2 className="w-3 h-3" />}
                  <code className="truncate">{s.artifact}</code>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
