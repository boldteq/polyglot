import { useState, useEffect, useMemo, Fragment } from 'react'
import { Activity, CheckCircle, XCircle, Filter, Search, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { getAnalyticsRuns, apiError} from '../lib/api'
import { ErrorState } from '../components/ErrorState'
import type { AgentRunEntry } from '../lib/api'

import { SOURCE_COLORS } from '../lib/constants'

const SOURCES = ['all', 'playground', 'orchestration', 'schedule', 'webhook', 'sdk', 'ai-chat']

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function exportCsv(runs: AgentRunEntry[]) {
  const headers = ['id', 'agentName', 'source', 'status', 'duration', 'tokens', 'cost', 'timestamp', 'prompt']
  const rows = runs.map(r => [
    r.id,
    r.agentName,
    r.source,
    r.status,
    r.duration,
    r.estimatedTokens,
    r.estimatedCost.toFixed(6),
    r.timestamp,
    `"${(r.prompt || '').replace(/"/g, '""')}"`,
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `agent-runs-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function RunHistoryPage() {
  const [allRuns, setAllRuns] = useState<AgentRunEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [agentSearch, setAgentSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const limit = 50

  const load = () => {
    setLoading(true)
    setLoadError(null)
    const params: Record<string, string | number> = { limit: 500 }
    if (sourceFilter !== 'all') params.source = sourceFilter
    if (statusFilter !== 'all') params.status = statusFilter
    getAnalyticsRuns(params as Record<string, string>)
      .then(data => { setAllRuns(data.runs) })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load run history')
        apiError('Load run history', err)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { setOffset(0) }, [sourceFilter, statusFilter, agentSearch])
  useEffect(() => { load() }, [sourceFilter, statusFilter])

  const filteredRuns = useMemo(() => {
    if (!agentSearch.trim()) return allRuns
    const q = agentSearch.toLowerCase()
    return allRuns.filter(r => r.agentName.toLowerCase().includes(q))
  }, [allRuns, agentSearch])

  const pagedRuns = filteredRuns.slice(offset, offset + limit)
  const filteredTotal = filteredRuns.length

  const totalCost = useMemo(() =>
    filteredRuns.reduce((s, r) => s + (r.estimatedCost || 0), 0),
    [filteredRuns])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6" /> Run History
          </h1>
          <p className="text-text-muted text-sm mt-1">All agent runs from every source — unified view</p>
        </div>
        <button
          onClick={() => exportCsv(filteredRuns)}
          disabled={filteredRuns.length === 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border text-xs font-medium hover:border-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Agent search */}
        <div className="relative max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={agentSearch}
            onChange={e => setAgentSearch(e.target.value)}
            placeholder="Filter by agent name..."
            className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-2 text-xs placeholder-text-muted focus:outline-none focus:border-accent/50"
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">Source:</span>
            <div className="flex gap-1 flex-wrap">
              {SOURCES.map(s => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-colors ${
                    sourceFilter === s ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted hover:text-text'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Status:</span>
            {['all', 'success', 'error'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-colors ${
                  statusFilter === s ? 'bg-accent text-white' : 'bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-xs text-text-muted ml-auto">{filteredTotal} runs · total cost: ${totalCost.toFixed(4)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-text-muted text-sm">Loading...</div>
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} className="h-48" />
        ) : pagedRuns.length === 0 ? (
          <div className="p-12 text-center text-text-muted">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No runs found</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted border-b border-border bg-surface-2/50">
                <th className="w-6 py-3 pl-4" />
                <th className="text-left py-3 px-4 font-medium">Agent</th>
                <th className="text-left py-3 px-4 font-medium">Source</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium max-w-[180px]">Prompt</th>
                <th className="text-right py-3 px-4 font-medium">Duration</th>
                <th className="text-right py-3 px-4 font-medium">Tokens</th>
                <th className="text-right py-3 px-4 font-medium">Cost</th>
                <th className="text-right py-3 px-4 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {pagedRuns.map(run => {
                const isOpen = expanded.has(run.id)
                return (
                  <Fragment key={run.id}>
                    <tr
                      onClick={() => toggleExpand(run.id)}
                      className="border-b border-border/50 hover:bg-surface-2/30 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 pl-4 text-text-muted">
                        {isOpen
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronRight className="w-3 h-3" />
                        }
                      </td>
                      <td className="py-2.5 px-4 font-medium">{run.agentName}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[run.source] || ''}`}>
                          {run.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {run.status === 'success'
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                          : <XCircle className="w-3.5 h-3.5 text-red-400" />
                        }
                      </td>
                      <td className="py-2.5 px-4 text-text-muted max-w-[180px] truncate">{run.prompt}</td>
                      <td className="py-2.5 px-4 text-right text-text-muted">{formatDuration(run.duration)}</td>
                      <td className="py-2.5 px-4 text-right text-text-muted">{run.estimatedTokens.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right text-text-muted">${run.estimatedCost.toFixed(4)}</td>
                      <td className="py-2.5 px-4 text-right text-text-muted whitespace-nowrap">{timeAgo(run.timestamp)}</td>
                    </tr>
                    {isOpen && (
                      <tr key={`${run.id}-expanded`} className="border-b border-border/50 bg-surface-2/20">
                        <td colSpan={9} className="px-8 py-3">
                          <div className="space-y-2">
                            <div>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Full Prompt</span>
                              <p className="mt-1 text-xs text-text leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                                {run.prompt || '(empty)'}
                              </p>
                            </div>
                            {run.error && (
                              <div>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Error</span>
                                <p className="mt-1 text-xs text-red-400 font-mono leading-relaxed">{run.error}</p>
                              </div>
                            )}
                            <div className="flex items-center gap-6 text-[10px] text-text-muted pt-1">
                              <span>ID: <span className="font-mono">{run.id}</span></span>
                              <span>{new Date(run.timestamp).toLocaleString()}</span>
                              <span>{run.promptChars + run.outputChars} chars total</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: pagination + total cost */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-muted">
          Total cost (filtered): <span className="font-semibold text-text">${totalCost.toFixed(4)}</span>
        </div>
        {filteredTotal > limit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 hover:bg-surface-2/80 disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-xs text-text-muted">
              {offset + 1}–{Math.min(offset + limit, filteredTotal)} of {filteredTotal}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= filteredTotal}
              className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 hover:bg-surface-2/80 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
