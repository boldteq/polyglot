import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, CheckCircle, XCircle, Filter, Search, ListTree } from 'lucide-react'
import { getAnalyticsRuns, apiError, type AgentRunEntry } from '../lib/api'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { SOURCE_COLORS } from '../lib/constants'

const SOURCES = ['all', 'playground', 'orchestration', 'schedule', 'webhook', 'sdk', 'ai-chat']

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const fmtDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

// LangSmith "Tracing" — run list; each row opens the per-run trace tree.
export default function Tracing() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<AgentRunEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [agentSearch, setAgentSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 50

  const load = () => {
    setLoading(true)
    setLoadError(null)
    const params: Record<string, string | number> = { limit: 500 }
    if (sourceFilter !== 'all') params.source = sourceFilter
    if (statusFilter !== 'all') params.status = statusFilter
    getAnalyticsRuns(params as Record<string, string>)
      .then(data => setRuns(data.runs))
      .catch(err => { setLoadError(err instanceof Error ? err.message : 'Failed to load runs'); apiError('Load tracing runs', err) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { setOffset(0) }, [sourceFilter, statusFilter, agentSearch])
  useEffect(() => { load() }, [sourceFilter, statusFilter])

  const filtered = useMemo(() => {
    if (!agentSearch.trim()) return runs
    const q = agentSearch.toLowerCase()
    return runs.filter(r => r.agentName.toLowerCase().includes(q))
  }, [runs, agentSearch])

  const paged = filtered.slice(offset, offset + limit)
  const hasFilters = sourceFilter !== 'all' || statusFilter !== 'all' || agentSearch.trim() !== ''
  const clearFilters = () => { setSourceFilter('all'); setStatusFilter('all'); setAgentSearch('') }

  return (
    <PageShell title="Tracing" subtitle="Every agent run — open one to see its full trace tree (delegations, events, real cost)">
      <div className="space-y-5">
        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted z-10" aria-hidden="true" />
            <input
              type="text" value={agentSearch} onChange={e => setAgentSearch(e.target.value)}
              placeholder="Filter by agent name..." aria-label="Filter by agent name" className="input pl-8"
            />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs text-text-muted">Source:</span>
              <div className="segmented flex-wrap">
                {SOURCES.map(s => (
                  <button key={s} onClick={() => setSourceFilter(s)} className={sourceFilter === s ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}>{s}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Status:</span>
              <div className="segmented">
                {['all', 'success', 'error'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)} className={statusFilter === s ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}>{s}</button>
                ))}
              </div>
            </div>
            <span className="text-xs text-text-muted ml-auto">{filtered.length} runs</span>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-text-muted text-sm">Loading…</div>
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={load} className="h-48" />
          ) : paged.length === 0 ? (
            <div className="p-12 text-center text-text-muted">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
              {hasFilters ? (
                <>
                  <p className="text-sm">No runs match these filters</p>
                  <button onClick={clearFilters} className="btn-secondary btn-sm mt-4">Clear filters</button>
                </>
              ) : <p className="text-sm">No runs recorded yet</p>}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-muted border-b border-border bg-surface-2/50">
                  <th className="text-left py-3 px-4 font-medium">Agent</th>
                  <th className="text-left py-3 px-4 font-medium">Source</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium max-w-[200px]">Prompt</th>
                  <th className="text-right py-3 px-4 font-medium">Duration</th>
                  <th className="text-right py-3 px-4 font-medium">When</th>
                  <th className="w-8 py-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {paged.map(run => {
                  const d = formatAgentDisplay({ name: run.agentName, id: run.agentName })
                  return (
                    <tr
                      key={run.id}
                      onClick={() => navigate(`/tracing/${run.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/tracing/${run.id}`) } }}
                      role="button" tabIndex={0}
                      aria-label={`Open trace for ${d.realName}`}
                      className="border-b border-border/50 hover:bg-surface-2/30 transition-colors cursor-pointer focus:outline-none focus-visible:bg-surface-2/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/40"
                    >
                      <td className="py-2.5 px-4 font-medium whitespace-nowrap">{d.emoji && <span className="mr-1">{d.emoji}</span>}{d.realName}</td>
                      <td className="py-2.5 px-4"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[run.source] || ''}`}>{run.source}</span></td>
                      <td className="py-2.5 px-4">{run.status === 'success' ? <CheckCircle className="w-3.5 h-3.5 text-green" /> : <XCircle className="w-3.5 h-3.5 text-red" />}</td>
                      <td className="py-2.5 px-4 text-text-muted max-w-[200px] truncate">{run.prompt}</td>
                      <td className="py-2.5 px-4 text-right text-text-muted">{fmtDuration(run.duration)}</td>
                      <td className="py-2.5 px-4 text-right text-text-muted whitespace-nowrap">{timeAgo(run.timestamp)}</td>
                      <td className="py-2.5 pr-4 text-text-muted"><ListTree className="w-3.5 h-3.5" aria-hidden="true" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > limit && (
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="btn-secondary btn-sm">Previous</button>
            <span className="text-xs text-text-muted">{offset + 1}–{Math.min(offset + limit, filtered.length)} of {filtered.length}</span>
            <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= filtered.length} className="btn-secondary btn-sm">Next</button>
          </div>
        )}
      </div>
    </PageShell>
  )
}
