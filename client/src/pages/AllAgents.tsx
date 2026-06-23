import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  X,
  AlertTriangle,
  Network,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  getUnifiedAgents,
  getProjects,
  copyAgent,
  moveAgent,
  updateGlobalAgent,
  updateProjectAgent,
  sanitizeName,
  getCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  reorderCategories,
  getDispatchRecommendation,
} from '../lib/api'
import type { DispatchResult } from '../lib/api'
import { useTaxonomy } from '../hooks/useTaxonomy'
import { useDrift } from '../hooks/useDrift'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { useAgentBulkActions } from '../hooks/useAgentBulkActions'
import { AGENT_STATUSES } from '../lib/constants'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { ErrorState } from '../components/ErrorState'
import type { UnifiedAgent } from '../types'
import { toast } from '../components/Toast'
import { PageShell } from '../components/PageShell'
import { SquadCard } from '../components/SquadCard'
import { CategoryFilterPills } from '../components/AgentCategoryBadge'


export default function AllAgents() {
  const { data: agents, loading, error, refetch } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)
  const { data: projects } = useApi(getProjects, [], CacheKeys.projects)
  const { data: categories, refetch: refetchCategories } = useApi(getCategories, [], CacheKeys.categories)
  const { squads: SQUADS, squadById, squadOrder } = useTaxonomy()
  const { drift } = useDrift()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'project'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [actionAgent, setActionAgent] = useState<UnifiedAgent | null>(null)
  const [actionType, setActionType] = useState<'copy' | 'move' | null>(null)
  const [actionTarget, setActionTarget] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [createScope, setCreateScope] = useState<string>('global')
  const [actioning, setActioning] = useState(false)
  const [driftDismissed, setDriftDismissed] = useState(false)
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const [dispatchQuery, setDispatchQuery] = useState('')
  const [dispatchResults, setDispatchResults] = useState<DispatchResult[] | null>(null)
  const [dispatchLoading, setDispatchLoading] = useState(false)

  // Set default new-agent category from first API category once loaded
  useEffect(() => {
    if (categories?.length && !newCategory) {
      const first = categories.find(c => c.name !== 'uncategorized')
      if (first) setNewCategory(first.name)
    }
  }, [categories, newCategory])

  // Drift now comes from the shared useDrift() cache (auto-refetched on
  // agent:upsert/remove). Cross-page registry sync is handled centrally by
  // initCacheInvalidation() — no per-page SSE connection needed here.

  const filtered = (agents || []).filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.description.toLowerCase().includes(search.toLowerCase()) && !a.filename.toLowerCase().includes(search.toLowerCase())) return false
    if (scopeFilter === 'global' && a.scope !== 'global') return false
    if (scopeFilter === 'project' && a.scope !== 'project') return false
    if (categoryFilter !== 'all' && (a.frontmatter?.category || 'uncategorized') !== categoryFilter) return false
    return true
  })

  const {
    selectedIds,
    bulkBusy,
    squadPickerFor,
    setSquadPickerFor,
    selectAll: selectAllVisible,
    clearSel: clearSelection,
    bulkApply,
  } = useAgentBulkActions(filtered, (a) => a.filename, refetch)

  // Close squad picker when clicking outside
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!squadPickerFor) return
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setSquadPickerFor(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [squadPickerFor])

  // Squad grouping (vertical-team view). Members keyed off agent.org.squad.
  // Dotted members appear inside their primary squad as full members AND as
  // dotted chips in any other squad that lists them in `dottedMembers`.
  const squadMembers = useMemo(() => {
    const map = new Map<string, UnifiedAgent[]>()
    for (const sq of SQUADS) map.set(sq.id, [])
    const unassignedSquad: UnifiedAgent[] = []
    for (const a of filtered) {
      const sid = a.org?.squad
      if (sid && map.has(sid)) {
        map.get(sid)!.push(a)
      } else {
        unassignedSquad.push(a)
      }
    }
    return { map, unassignedSquad }
  }, [filtered, SQUADS])

  const orderedSquadIds = (squadOrder && squadOrder.length > 0)
    ? squadOrder.filter(id => squadById[id])
    : SQUADS.map(s => s.id)

  const findAgentById = (id: string) => (agents || []).find(a => a.filename === id) || null

  const handleAction = async () => {
    if (!actionAgent || !actionType || !actionTarget) return
    setActioning(true)
    try {
      const from = actionAgent.scope === 'global' ? 'global' : actionAgent.projectId!
      if (actionType === 'copy') { await copyAgent(from, actionTarget, actionAgent.filename); toast('success', 'Copied') }
      else { await moveAgent(from, actionTarget, actionAgent.filename); toast('success', 'Moved') }
      setActionAgent(null); setActionType(null); setActionTarget(''); refetch()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed')
    } finally { setActioning(false) }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const slug = sanitizeName(newName)
    if (!slug) { toast('error', 'Invalid name'); return }
    setCreateLoading(true)
    try {
      const template = `---\nname: ${newName.trim()}\ndescription: ""\nmodel: sonnet\ncategory: ${newCategory}\n---\n\n# ${newName.trim()}\n\nWrite your agent instructions here.\n`
      if (createScope === 'global') { await updateGlobalAgent(slug, template, { createOnly: true }); navigate(`/global/agents/${slug}`) }
      else { await updateProjectAgent(createScope, slug, template, { createOnly: true }); navigate(`/projects/${createScope}/agents/${slug}`) }
      setCreating(false); setNewName('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed'
      if (msg.includes('already exists')) {
        // Don't clobber — open the existing agent instead.
        toast('error', msg)
        if (createScope === 'global') navigate(`/global/agents/${slug}`)
        else navigate(`/projects/${createScope}/agents/${slug}`)
        setCreating(false); setNewName('')
      } else {
        toast('error', msg)
      }
    } finally { setCreateLoading(false) }
  }

  const handleDispatch = async () => {
    if (!dispatchQuery.trim()) return
    setDispatchLoading(true)
    setDispatchResults(null)
    try {
      const res = await getDispatchRecommendation(dispatchQuery.trim())
      setDispatchResults(res.results)
    } catch {
      toast('error', 'Dispatch failed')
    } finally {
      setDispatchLoading(false)
    }
  }

  const uniqueProjects = [...new Map((projects || []).map((p) => [p.id, p])).values()]
  const allCategoryNames = categories ? categories.map(c => c.name) : []

  if (loading) return <div className="p-8 flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const globalCount = (agents || []).filter(a => a.scope === 'global').length
  const projectCount = (agents || []).filter(a => a.scope === 'project').length

  return (
    <PageShell
      title="Agents"
      subtitle={`${globalCount} global${projectCount > 0 ? ` · ${projectCount} project` : ''}`}
      actions={
        <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
          <Plus className="w-3.5 h-3.5" /> New Agent
        </button>
      }
    >
      <div className="max-w-6xl">
      {/* Drift banner — agents on disk with no org registration */}
      {!driftDismissed && drift && drift.onlyOnDisk.length > 0 && (
        <div className="flex items-center gap-3 bg-amber/10 border border-amber/30 rounded-xl px-4 py-3 mb-4 text-amber">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="text-xs flex-1">
            <span className="font-semibold">{drift.onlyOnDisk.length} agent{drift.onlyOnDisk.length !== 1 ? 's' : ''}</span>
            {' '}exist on disk but aren&apos;t registered in the org chart:{' '}
            <span className="font-mono">{drift.onlyOnDisk.join(', ')}</span>
          </p>
          <button
            onClick={() => navigate('/org-chart')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-amber/20 hover:bg-amber/30 rounded-lg transition-colors shrink-0"
          >
            <Network className="w-3 h-3" /> Open Org Chart
          </button>
          <button onClick={() => setDriftDismissed(true)} aria-label="Dismiss drift warning" className="text-amber/60 hover:text-amber transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unified filter bar */}
      <div className="card p-3 mb-4 space-y-3">
        {/* Row 1: Search + Scope + View */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, description, or filename..."
              className="input pl-9 pr-3"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface text-text-muted">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="segmented">
            {(['all', 'global', 'project'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScopeFilter(s)}
                className={scopeFilter === s ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}
              >
                {s === 'all' ? 'All' : s === 'global' ? 'Global' : 'Project'}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Category pills */}
        {categories && categories.length > 0 && (
          <CategoryFilterPills
            categories={categories}
            selected={categoryFilter}
            onSelect={setCategoryFilter}
            onRename={async (oldName, newName) => {
              try {
                await renameCategory(oldName, newName)
                toast('success', `Renamed to "${newName}"`)
                if (categoryFilter === oldName) setCategoryFilter(newName)
                refetchCategories()
                refetch()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : 'Rename failed')
              }
            }}
            onDelete={async (cat, reassignTo) => {
              try {
                await deleteCategory(cat, reassignTo)
                toast('success', `Deleted "${cat}"`)
                if (categoryFilter === cat) setCategoryFilter('all')
                refetchCategories()
                refetch()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : 'Delete failed')
              }
            }}
            onCreate={async (name) => {
              try {
                await createCategory(name)
                toast('success', `Created "${name}"`)
                refetchCategories()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : 'Create failed')
              }
            }}
            onReorder={async (order) => {
              try {
                await reorderCategories(order)
                refetchCategories()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : 'Reorder failed')
              }
            }}
          />
        )}
      </div>

      {/* Smart Dispatch panel */}
      <div className="bg-surface border border-border rounded-xl mb-4 overflow-hidden">
        <button
          onClick={() => { setDispatchOpen(!dispatchOpen); setDispatchResults(null) }}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left hover:bg-surface-2 transition-colors"
        >
          <Zap className="w-4 h-4 text-accent shrink-0" />
          <span className="flex-1">Find the right agent</span>
          <span className="text-[11px] text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">Smart Dispatch</span>
          {dispatchOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
        </button>
        {dispatchOpen && (
          <div className="px-4 pb-4 border-t border-border pt-3">
            <div className="flex gap-2 mb-3">
              <input
                value={dispatchQuery}
                onChange={(e) => setDispatchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDispatch()}
                placeholder="Describe the task... e.g. 'build auth middleware for nextjs'"
                className="input flex-1"
                autoFocus
              />
              <button
                onClick={handleDispatch}
                disabled={dispatchLoading || !dispatchQuery.trim()}
                className="btn-primary btn-md"
              >
                {dispatchLoading ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Match
              </button>
            </div>
            {dispatchResults !== null && (
              dispatchResults.length === 0 ? (
                <p className="text-xs text-text-muted text-center py-3">No strong matches found. Try different keywords.</p>
              ) : (
                <div className="space-y-2">
                  {dispatchResults.map((r, i) => {
                    const agentId = r.agentId
                    const agent = (agents || []).find(a => a.filename === agentId)
                    const agentPath = agent
                      ? agent.scope === 'global' ? `/global/agents/${agent.filename}` : `/projects/${agent.projectId}/agents/${agent.filename}`
                      : null
                    const playgroundPath = `/playground?agent=${encodeURIComponent(agentId)}`
                    return (
                      <div key={r.agentId} className="flex items-center gap-3 bg-surface-2 rounded-lg px-3 py-2.5 border border-border">
                        <span className="text-[11px] font-bold text-text-muted w-4 shrink-0">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold truncate">{r.name}</span>
                            {r.department && <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full shrink-0">{r.department}</span>}
                            {r.level && <span className="text-[10px] text-text-muted shrink-0">{r.level}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 max-w-[120px] h-1.5 bg-surface rounded-full overflow-hidden">
                              <div className="h-full bg-accent rounded-full" style={{ width: `${r.score * 100}%` }} />
                            </div>
                            <span className="text-[10px] text-text-muted">{Math.round(r.score * 100)}%</span>
                            <div className="flex gap-1 flex-wrap">
                              {r.matchedSkills.slice(0, 4).map(s => (
                                <span key={s} className="text-[9px] bg-surface border border-border px-1.5 py-0.5 rounded-full text-text-muted">{s}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {agentPath && (
                            <button
                              onClick={() => navigate(agentPath)}
                              className="px-2.5 py-1 text-[11px] font-medium bg-accent/10 text-accent hover:bg-accent/20 rounded-md transition-colors"
                            >
                              Open
                            </button>
                          )}
                          <button
                            onClick={() => navigate(playgroundPath)}
                            className="px-2.5 py-1 text-[11px] font-medium bg-surface border border-border hover:bg-surface-2 text-text-secondary rounded-md transition-colors"
                          >
                            Run
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Create panel */}
      {creating && (
        <div className="bg-surface border border-accent/20 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">New Agent</span>
            <button onClick={() => { setCreating(false); setNewName('') }} aria-label="Close" className="text-text-muted hover:text-text"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Agent name..."
              className="input flex-1"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="input w-auto">
              {allCategoryNames.filter(c => c !== 'uncategorized').map(c => (
                <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>
              ))}
            </select>
            <select value={createScope} onChange={(e) => setCreateScope(e.target.value)} className="input w-auto">
              <option value="global">Global</option>
              {uniqueProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={handleCreate} disabled={createLoading} className="btn-primary btn-md">
              {createLoading ? '...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Copy/Move panel */}
      {actionAgent && actionType && (
        <div className="bg-surface border border-accent/20 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{actionType === 'copy' ? 'Copy' : 'Move'} "{actionAgent.name}"</span>
            <button onClick={() => { setActionAgent(null); setActionType(null) }} aria-label="Close" className="text-text-muted hover:text-text"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2">
            <select value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} className="input flex-1">
              <option value="">Select destination...</option>
              {actionAgent.scope !== 'global' && <option value="global">Global</option>}
              {uniqueProjects.filter((p) => p.id !== actionAgent.projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={handleAction} disabled={!actionTarget || actioning} className="btn-primary btn-md">
              {actioning ? '...' : actionType === 'copy' ? 'Copy' : 'Move'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-accent/8 border border-accent/30 rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-accent">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-border" />
          {/* Squad bulk-set */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-text-muted font-semibold mr-1">Squad →</span>
            {SQUADS.map(sq => (
              <button
                key={sq.id}
                onClick={() => bulkApply({ squad: sq.id }, sq.label)}
                disabled={bulkBusy}
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all hover:opacity-80 disabled:opacity-40"
                style={{ background: `${sq.color}20`, color: sq.color, borderColor: `${sq.color}50` }}
                title={sq.description}
              >
                {sq.emoji} {sq.label}
              </button>
            ))}
            <button
              onClick={() => bulkApply({ squad: null }, 'no squad')}
              disabled={bulkBusy}
              className="px-2 py-0.5 rounded-full text-[11px] text-text-muted hover:text-red disabled:opacity-40"
            >
              clear squad
            </button>
          </div>
          <div className="h-4 w-px bg-border" />
          {/* Status bulk-set */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-muted font-semibold mr-1">Status →</span>
            {AGENT_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => bulkApply({ status: s }, s)}
                disabled={bulkBusy}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-2 hover:bg-surface-3 capitalize disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={selectAllVisible}
              className="text-[11px] text-accent hover:underline"
            >
              Select all {filtered.length}
            </button>
            <button
              onClick={clearSelection}
              className="text-[11px] text-text-muted hover:text-text"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <p className="text-sm font-medium">{search ? 'No agents match' : 'No agents found'}</p>
          <p className="text-xs mt-1">{search ? 'Try a different search' : 'Create your first agent'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orderedSquadIds.map((sid) => {
            const squad = squadById[sid]
            if (!squad) return null
            const members = (squadMembers.map.get(sid) || []).slice().sort((a, b) => {
              // Lead first, then by level desc, then alpha
              const aIsLead = squad.lead === a.filename ? -1 : 0
              const bIsLead = squad.lead === b.filename ? -1 : 0
              if (aIsLead !== bIsLead) return aIsLead - bIsLead
              const la = a.org?.level ?? -1
              const lb = b.org?.level ?? -1
              if (la !== lb) return lb - la
              return a.name.localeCompare(b.name)
            })
            const dotted = (squad.dottedMembers || [])
              .map(id => findAgentById(id))
              .filter((x): x is UnifiedAgent => x !== null)
              // Skip dotted agents who are already primary members of THIS squad
              .filter(d => !members.some(m => m.filename === d.filename))
            return (
              <SquadCard
                key={squad.id}
                squad={squad}
                members={members}
                dottedMembers={dotted}
                onAgentClick={(a) => {
                  const path = a.scope === 'global'
                    ? `/global/agents/${a.filename}`
                    : `/projects/${a.projectId}/agents/${a.filename}`
                  navigate(path)
                }}
              />
            )
          })}
          {squadMembers.unassignedSquad.length > 0 && (
            <div className="bg-surface rounded-xl border border-dashed border-border p-4">
              <div className="flex items-center gap-2 mb-2 text-text-muted">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold ">
                  Unassigned ({squadMembers.unassignedSquad.length})
                </span>
                <span className="text-[10px]">— assign these to a vertical squad</span>
              </div>
              <div className="space-y-1">
                {squadMembers.unassignedSquad.map(agent => (
                  <button
                    key={agent.filename}
                    onClick={() => navigate(agent.scope === 'global' ? `/global/agents/${agent.filename}` : `/projects/${agent.projectId}/agents/${agent.filename}`)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left text-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span className="text-text-muted">{formatAgentDisplay(agent).emoji || '🤖'}</span>
                    <span className="font-medium">{formatAgentDisplay(agent).realName}</span>
                    <span className="text-text-muted text-[11px] truncate">{agent.filename}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </PageShell>
  )
}
