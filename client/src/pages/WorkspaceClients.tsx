import { useEffect, useState, useCallback } from 'react'
import { Users, RefreshCw, AlertTriangle } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { Spinner } from '../components/Skeleton'
import ScoreGauge from '../components/workspace/ScoreGauge'
import { getWorkspaceClients } from '../lib/api'

type ClientRow = { client: string; platform: string; store: string | null; builds: number; blocked: number; bestScore: number; lastCapturedAt: number | null }

function gradeFor(score: number): string {
  if (score >= 90) return 'A'; if (score >= 80) return 'B'; if (score >= 70) return 'C'; return 'BLOCK-RISK'
}

// One row per client store, aggregated from scored builds.
export default function WorkspaceClients() {
  const [rows, setRows] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getWorkspaceClients()
      .then((d) => setRows(d.clients))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load clients'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const shown = rows.filter((r) => r.client.toLowerCase().includes(q.toLowerCase()))

  return (
    <PageShell
      title="Clients"
      subtitle="One row per client store, ranked by best build score"
      actions={<button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>}
    >
      {loading ? <Spinner /> : error ? (
        <div className="card p-6 text-red flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{error}
          <button onClick={load} className="underline ml-2">Retry</button></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" description="Clients appear here as builds get discovered." />
      ) : (
        <div className="space-y-4">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…"
            className="input input-sm max-w-xs"
          />
          <div className="card divide-y divide-border">
            {shown.map((r) => (
              <div key={`${r.platform}:${r.client}`} className="flex items-center gap-4 px-4 py-3">
                <ScoreGauge score={r.bestScore} grade={gradeFor(r.bestScore)} size={40} showGrade={false} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium capitalize truncate flex items-center gap-2">
                    {r.client}
                    <span className="text-[10px] uppercase tracking-wide text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded">{r.platform}</span>
                  </div>
                  <div className="text-[12px] text-text-muted truncate">{r.store || '—'}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-[13px]">
                  <span className="text-text-muted">{r.builds} build{r.builds !== 1 ? 's' : ''}</span>
                  {r.blocked > 0 && <span className="text-red">{r.blocked} blocked</span>}
                </div>
              </div>
            ))}
            {shown.length === 0 && <div className="px-4 py-6 text-[13px] text-text-muted text-center">No clients match “{q}”.</div>}
          </div>
        </div>
      )}
    </PageShell>
  )
}
