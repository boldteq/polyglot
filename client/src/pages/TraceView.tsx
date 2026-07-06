import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ListTree } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import TraceTree from '../components/TraceTree'
import { getTrace, apiError, type TraceResponse } from '../lib/api'

// Per-run trace tree (LangSmith "Tracing" → trace detail). All data assembled
// server-side from delegations + agent_events + cost_logs.
export default function TraceView() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<TraceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!runId) return
    setLoading(true)
    setErr(null)
    getTrace(runId)
      .then(setData)
      .catch((e) => { setErr(e instanceof Error ? e.message : 'Failed to load trace'); apiError('Load trace', e) })
      .finally(() => setLoading(false))
  }, [runId])

  useEffect(() => { load() }, [load])

  const totals = data?.totals
  return (
    <PageShell
      title="Trace"
      subtitle={runId ? `Run ${runId}` : undefined}
      actions={
        <button onClick={() => navigate('/tracing')} className="btn-secondary btn-sm">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Tracing
        </button>
      }
    >
      {loading ? (
        <Spinner />
      ) : err ? (
        <ErrorState message={err} onRetry={load} className="h-48" />
      ) : !data?.tree ? (
        <EmptyState icon={ListTree} title="No trace for this run" description="This run id has no recorded events or delegations." card />
      ) : (
        <div className="space-y-4">
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Agents in trace" value={String(totals.nodeCount)} />
              <Stat label="Total span" value={totals.spanMs ? `${(totals.spanMs / 1000).toFixed(1)}s` : '—'} />
              <Stat label="Tokens" value={totals.tokens ? totals.tokens.toLocaleString() : '—'} />
              <Stat label="Cost" value={totals.costUsd ? `$${totals.costUsd.toFixed(4)}` : '—'} accent="text-emerald" />
            </div>
          )}
          <TraceTree tree={data.tree} spanMs={totals?.spanMs ?? 0} />
        </div>
      )}
    </PageShell>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className={`text-xl font-bold tabular-nums ${accent || ''}`}>{value}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{label}</div>
    </div>
  )
}
