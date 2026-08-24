import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, CheckCircle, XCircle, Filter, Search, ListTree, Star } from 'lucide-react'
import { getAnalyticsRuns, apiError, type AgentRunEntry } from '../lib/api'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { SOURCE_COLORS } from '../lib/constants'
import { onOrgChartEvent } from '../lib/sseBus'

const SOURCES = ['all', 'playground', 'orchestration', 'schedule', 'webhook', 'sdk', 'ai-chat', 'project-chat']
const LIMIT = 50
const LAST_VISIT_KEY = 'polyglot:tracing-last-visit'

interface Preset {
  key: string
  label: string
  build: () => URLSearchParams
}

const PRESETS: Preset[] = [
  { key: 'errors', label: 'Errors', build: () => new URLSearchParams({ status: 'error' }) },
  { key: 'playground', label: 'Playground', build: () => new URLSearchParams({ source: 'playground' }) },
  { key: 'orch', label: 'Orchestration', build: () => new URLSearchParams({ source: 'orchestration' }) },
  { key: 'schedule', label: 'Schedules', build: () => new URLSearchParams({ source: 'schedule' }) },
]

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const fmtDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

// LangSmith "Tracing" — run list. Server-paginated (analytics/runs already
// supports offset/limit), URL-persisted filters + preset chips ("Errors",
// "Playground", "Schedules") for the routes Yash actually types by hand daily.
export default function Tracing() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const source = searchParams.get('source') || 'all'
  const status = searchParams.get('status') || 'all'
  const agentSearch = searchParams.get('agent') || ''
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0

  const setParam = useCallback((key: string, value: string, def: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === def) next.delete(key)
      else next.set(key, value)
      // Any filter change resets the page unless the caller explicitly set it.
      if (key !== 'offset') next.delete('offset')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const [runs, setRuns] = useState<AgentRunEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastVisit, setLastVisit] = useState<number>(() => {
    const raw = localStorage.getItem(LAST_VISIT_KEY)
    return raw ? parseInt(raw, 10) || 0 : 0
  })

  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    const params: Record<string, string | number> = { limit: LIMIT, offset }
    if (source !== 'all') params.source = source
    if (status !== 'all') params.status = status
    if (agentSearch.trim()) params.agent = agentSearch.trim()
    getAnalyticsRuns(params as Record<string, string>)
      .then((data) => {
        setRuns(data.runs || [])
        setTotal(data.total || 0)
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load runs')
        apiError('Load tracing runs', err)
      })
      .finally(() => setLoading(false))
  }, [source, status, agentSearch, offset])

  useEffect(() => { load() }, [load])

  // Stamp visit — only once on mount so "new since visit" doesn't self-erase
  // while the user is looking at the list.
  useEffect(() => {
    return () => {
      try { localStorage.setItem(LAST_VISIT_KEY, String(Date.now())) } catch { /* quota */ }
    }
  }, [])

  // Live refresh — debounced burst-collapse of `agent_run.recorded`. Reuses
  // the current filters via a ref so the reload requests the same view.
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const off = onOrgChartEvent((ev) => {
      if (ev.type !== 'agent_run.recorded') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => loadRef.current(), 1200)
    })
    return () => { off(); if (timer) clearTimeout(timer) }
  }, [])

  const hasFilters = source !== 'all' || status !== 'all' || agentSearch.trim() !== ''
  const clearFilters = () => setSearchParams({}, { replace: true })

  const applyPreset = (p: Preset) => setSearchParams(p.build(), { replace: true })

  const presetActive = (p: Preset): boolean => {
    const target = p.build()
    for (const [k, v] of target.entries()) if ((searchParams.get(k) || '') !== v) return false
    // No extra filters beyond the preset should be set for it to be "active".
    for (const [k] of searchParams.entries()) if (k !== 'offset' && !target.has(k)) return false
    return true
  }

  const newSinceVisit = lastVisit > 0
    ? runs.filter((r) => new Date(r.timestamp).getTime() > lastVisit).length
    : 0

  return (
    <PageShell
      title="Tracing"
      subtitle="Every agent run — open one to see its full trace tree (delegations, events, real cost)"
      actions={
        newSinceVisit > 0 ? (
          <button
            onClick={() => setLastVisit(Date.now())}
            className="pill bg-accent/10 text-accent text-[11px] hover:bg-accent/20 transition-colors"
            title="Mark as read — resets the 'new' badge"
          >
            <Star className="w-3 h-3 mr-1 inline" /> {newSinceVisit} new
          </button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {/* Preset views */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-text-muted">Views:</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              aria-pressed={presetActive(p)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                presetActive(p)
                  ? 'bg-accent/10 border-accent/40 text-accent'
                  : 'bg-surface border-border text-text-muted hover:text-text hover:bg-surface-2/50'
              }`}
            >
              {p.label}
            </button>
          ))}
          {hasFilters && (
            <button onClick={clearFilters} className="text-[11px] text-text-muted hover:text-text underline underline-offset-2 ml-1">
              Clear
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="relative max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted z-10" aria-hidden="true" />
            <input
              type="text"
              value={agentSearch}
              onChange={(e) => setParam('agent', e.target.value, '')}
              placeholder="Filter by agent name…"
              aria-label="Filter by agent name"
              className="input pl-8"
            />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs text-text-muted">Source:</span>
              <div className="segmented flex-wrap">
                {SOURCES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setParam('source', s, 'all')}
                    className={source === s ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Status:</span>
              <div className="segmented">
                {['all', 'success', 'error'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setParam('status', s, 'all')}
                    className={status === s ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-text-muted ml-auto">
              {total.toLocaleString()} runs
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-text-muted text-sm">Loading…</div>
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={load} className="h-48" />
          ) : runs.length === 0 ? (
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
                {runs.map((run) => {
                  const d = formatAgentDisplay({ name: run.agentName, id: run.agentName })
                  const isNew = lastVisit > 0 && new Date(run.timestamp).getTime() > lastVisit
                  return (
                    <tr
                      key={run.id}
                      onClick={() => navigate(`/tracing/${run.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/tracing/${run.id}`) } }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open trace for ${d.realName}`}
                      className={`border-b border-border/50 hover:bg-surface-2/30 transition-colors cursor-pointer focus:outline-none focus-visible:bg-surface-2/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent/40 ${isNew ? 'bg-accent/5' : ''}`}
                    >
                      <td className="py-2.5 px-4 font-medium whitespace-nowrap">
                        {isNew && <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block mr-2" aria-label="new" />}
                        {d.emoji && <span className="mr-1">{d.emoji}</span>}{d.realName}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[run.source] || ''}`}>{run.source}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        {run.status === 'success' ? <CheckCircle className="w-3.5 h-3.5 text-green" /> : <XCircle className="w-3.5 h-3.5 text-red" />}
                      </td>
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

        {total > LIMIT && (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setParam('offset', String(Math.max(0, offset - LIMIT)), '0')}
              disabled={offset === 0}
              className="btn-secondary btn-sm"
            >
              Previous
            </button>
            <span className="text-xs text-text-muted">
              {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}
            </span>
            <button
              onClick={() => setParam('offset', String(offset + LIMIT), '0')}
              disabled={offset + LIMIT >= total}
              className="btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </PageShell>
  )
}
