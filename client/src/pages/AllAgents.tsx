import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus,
  Trash2,
  Clock,
  Users,
  FolderOpen,
  Search,
  Copy,
  ArrowRightLeft,
  X,
  AlertTriangle,
  Network,
  Crown,
  CheckCircle2,
  Info,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
} from 'lucide-react'
import {
  getUnifiedAgents,
  getProjects,
  deleteGlobalAgent,
  deleteProjectAgent,
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
  getDrift,
  getDispatchRecommendation,
  updateOrgAgent,
  bulkUpdateOrgAgents,
  undoOrgChange,
  undoOrgBatch,
  subscribeOrgChart,
} from '../lib/api'
import type { DriftData, DispatchResult } from '../lib/api'
import { useTaxonomy } from '../hooks/useTaxonomy'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { useAgentBulkActions } from '../hooks/useAgentBulkActions'
import { AGENT_STATUSES } from '../lib/constants'
import { useApi } from '../hooks/useApi'
import type { UnifiedAgent } from '../types'
import { toast } from '../components/Toast'
import AgentIcon from '../components/AgentIcon'
import {
  CategoryFilterPills,
  getColors,
  formatCategory,
} from '../components/AgentCategoryBadge'


export default function AllAgents() {
  const { data: agents, loading, refetch } = useApi(getUnifiedAgents)
  const { data: projects } = useApi(getProjects)
  const { data: categories, refetch: refetchCategories } = useApi(getCategories)
  const { squads: SQUADS } = useTaxonomy()
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
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())
  const [actioning, setActioning] = useState(false)
  const [drift, setDrift] = useState<DriftData | null>(null)
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

  // Fetch drift data to detect unregistered agents
  useEffect(() => {
    getDrift().then(setDrift).catch(() => {/* non-critical */})
  }, [])

  // Live cross-page sync — refetch when any registry mutation broadcasts
  useEffect(() => {
    const es = subscribeOrgChart((ev) => {
      if (ev.type === 'agent:upsert' || ev.type === 'agent:remove') {
        refetch()
      }
    })
    return () => es.close()
  }, [refetch])

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
    toggleSel: toggleSelected,
    selectAll: selectAllVisible,
    clearSel: clearSelection,
    setAgentSquad,
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

  // Group by DB org.department (single source of truth). Fallback chain:
  //   org.department  →  frontmatter.category  →  'unassigned'.
  // Capture each department's display label from org data for the section header.
  const departmentGroups = new Map<string, UnifiedAgent[]>()
  const departmentLabels = new Map<string, string>()
  for (const a of filtered) {
    const dept = a.org?.department || (a.frontmatter?.category as string | undefined) || 'unassigned'
    if (!departmentGroups.has(dept)) departmentGroups.set(dept, [])
    departmentGroups.get(dept)!.push(a)
    if (a.org?.departmentLabel && !departmentLabels.has(dept)) {
      departmentLabels.set(dept, a.org.departmentLabel)
    }
  }

  // Order: honor user's drag-and-drop category order first, then any
  // departments only present in org data, then 'unassigned' last.
  const categoryOrder = (categories || []).map((c) => c.name)
  const seen = new Set<string>()
  const orderedDepartments: string[] = []
  for (const name of categoryOrder) {
    if (name === 'unassigned') continue
    if (departmentGroups.has(name)) {
      orderedDepartments.push(name)
      seen.add(name)
    }
  }
  const extras = [...departmentGroups.keys()]
    .filter((d) => !seen.has(d) && d !== 'unassigned')
    .sort()
  orderedDepartments.push(...extras)
  if (departmentGroups.has('unassigned')) orderedDepartments.push('unassigned')

  const handleDelete = async (agent: UnifiedAgent) => {
    if (!confirm(`Delete "${agent.name}"?`)) return
    const key = agent.scope === 'global' ? `global-${agent.filename}` : `${agent.projectId}-${agent.filename}`
    setDeletingKeys((prev) => new Set(prev).add(key))
    try {
      if (agent.scope === 'global') await deleteGlobalAgent(agent.filename)
      else await deleteProjectAgent(agent.projectId!, agent.filename)
      refetch()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingKeys((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

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
      if (createScope === 'global') { await updateGlobalAgent(slug, template); navigate(`/global/agents/${slug}`) }
      else { await updateProjectAgent(createScope, slug, template); navigate(`/projects/${createScope}/agents/${slug}`) }
      setCreating(false); setNewName('')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed')
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

  return (
    <div className="p-6 max-w-6xl">
      {/* Compact header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Agents</h1>
          <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">
            {(agents || []).filter(a => a.scope === 'global').length} global
            {(agents || []).filter(a => a.scope === 'project').length > 0 && (
              <> · {(agents || []).filter(a => a.scope === 'project').length} project</>
            )}
          </span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Agent
        </button>
      </div>

      {/* Drift banner — agents on disk with no org registration */}
      {!driftDismissed && drift && drift.onlyOnDisk.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <p className="text-xs flex-1">
            <span className="font-semibold">{drift.onlyOnDisk.length} agent{drift.onlyOnDisk.length !== 1 ? 's' : ''}</span>
            {' '}exist on disk but aren&apos;t registered in the org chart:{' '}
            <span className="font-mono">{drift.onlyOnDisk.join(', ')}</span>
          </p>
          <button
            onClick={() => navigate('/org-chart')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors shrink-0"
          >
            <Network className="w-3 h-3" /> Open Org Chart
          </button>
          <button onClick={() => setDriftDismissed(true)} className="text-amber-400/60 hover:text-amber-400 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unified filter bar */}
      <div className="bg-surface rounded-xl border border-border p-3 mb-4 space-y-3">
        {/* Row 1: Search + Scope + View */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, description, or filename..."
              className="w-full bg-surface-2 border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-accent/50"
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface text-text-muted">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex bg-surface-2 rounded-lg p-0.5 shrink-0">
            {(['all', 'global', 'project'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScopeFilter(s)}
                className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                  scopeFilter === s ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
                }`}
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
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                autoFocus
              />
              <button
                onClick={handleDispatch}
                disabled={dispatchLoading || !dispatchQuery.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
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
            <button onClick={() => { setCreating(false); setNewName('') }} className="text-text-muted hover:text-text"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Agent name..."
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <select value={newCategory} onChange={e => setNewCategory(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-2 py-2 text-xs">
              {allCategoryNames.filter(c => c !== 'uncategorized').map(c => (
                <option key={c} value={c}>{c.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>
              ))}
            </select>
            <select value={createScope} onChange={(e) => setCreateScope(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-2 py-2 text-xs">
              <option value="global">Global</option>
              {uniqueProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={handleCreate} disabled={createLoading} className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40">
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
            <button onClick={() => { setActionAgent(null); setActionType(null) }} className="text-text-muted hover:text-text"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2">
            <select value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm">
              <option value="">Select destination...</option>
              {actionAgent.scope !== 'global' && <option value="global">Global</option>}
              {uniqueProjects.filter((p) => p.id !== actionAgent.projectId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={handleAction} disabled={!actionTarget || actioning} className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40">
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
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mr-1">Squad →</span>
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
              className="px-2 py-0.5 rounded-full text-[11px] text-text-muted hover:text-red-400 disabled:opacity-40"
            >
              clear squad
            </button>
          </div>
          <div className="h-4 w-px bg-border" />
          {/* Status bulk-set */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mr-1">Status →</span>
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
        <div className="bg-surface rounded-xl border border-border p-12 text-center text-text-muted">
          <p className="text-sm font-medium">{search ? 'No agents match' : 'No agents found'}</p>
          <p className="text-xs mt-1">{search ? 'Try a different search' : 'Create your first agent'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {orderedDepartments.map((dept) => {
            const deptAgents = (departmentGroups.get(dept) || []).slice().sort((a, b) => {
              // Leader first
              if (a.org?.isLeader && !b.org?.isLeader) return -1
              if (b.org?.isLeader && !a.org?.isLeader) return 1
              // Then by level (higher first)
              const la = a.org?.level ?? -1
              const lb = b.org?.level ?? -1
              if (la !== lb) return lb - la
              // Then alphabetical
              return a.name.localeCompare(b.name)
            })
            const colors = getColors(dept)
            const label = departmentLabels.get(dept) || formatCategory(dept)
            return (
              <div key={dept}>
                <SectionHeader icon={Users} label={label} count={deptAgents.length} color={colors.text} />
                <div className="space-y-1">
                  {deptAgents.map((agent) => {
                    const deleteKey = agent.scope === 'global'
                      ? `global-${agent.filename}`
                      : `${agent.projectId}-${agent.filename}`
                    return (
                      <AgentRow
                        key={deleteKey}
                        agent={agent}
                        deleting={deletingKeys.has(deleteKey)}
                        selected={selectedIds.has(agent.filename)}
                        onToggleSelect={() => toggleSelected(agent.filename)}
                        onSquadClick={(e) => { e.preventDefault(); e.stopPropagation(); setSquadPickerFor(agent.filename) }}
                        squadPickerOpen={squadPickerFor === agent.filename}
                        squadPickerRef={squadPickerFor === agent.filename ? pickerRef : undefined}
                        onSquadSelect={(squadId) => setAgentSquad(agent.filename, agent.name, squadId)}
                        onDelete={handleDelete}
                        onCopy={(a) => { setActionAgent(a); setActionType('copy') }}
                        onMove={(a) => { setActionAgent(a); setActionType('move') }}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ icon: Icon, label, count, color = 'text-accent' }: { icon: React.ElementType; label: string; count: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
      <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded-full">{count}</span>
    </div>
  )
}

// Tagline derivation moved to shared lib/agentDisplay.ts.

function AgentRow({
  agent, deleting, selected, onToggleSelect, onSquadClick, squadPickerOpen, squadPickerRef, onSquadSelect, onDelete, onCopy, onMove,
}: {
  agent: UnifiedAgent
  deleting: boolean
  selected: boolean
  onToggleSelect: () => void
  onSquadClick: (e: React.MouseEvent) => void
  squadPickerOpen: boolean
  squadPickerRef?: React.RefObject<HTMLDivElement | null>
  onSquadSelect: (squadId: string | null) => void
  onDelete: (a: UnifiedAgent) => void
  onCopy: (a: UnifiedAgent) => void
  onMove: (a: UnifiedAgent) => void
}) {
  const { squads: SQUADS } = useTaxonomy()
  const editLink = agent.scope === 'global' ? `/global/agents/${agent.filename}` : `/projects/${agent.projectId}/agents/${agent.filename}`
  const display = formatAgentDisplay({
    name: agent.name,
    title: agent.org?.title ?? null,
    description: agent.description,
    id: agent.filename,
  })
  const tagline = display.tagline

  return (
    <div className={`group relative flex items-center justify-between border rounded-lg px-3 py-2.5 transition-all ${selected ? 'bg-accent/5 border-accent/40' : 'bg-surface border-border hover:border-accent/20'}`}>
      {/* Bulk-select checkbox */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect() }}
        className={`shrink-0 mr-2 p-1 rounded-md transition-all ${selected ? 'text-accent opacity-100' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-accent'}`}
        title={selected ? 'Deselect' : 'Select for bulk action'}
      >
        {selected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
      </button>
      <Link to={editLink} className="flex items-center gap-3 flex-1 min-w-0">
        <AgentIcon
          name={agent.name}
          id={agent.filename}
          avatar={agent.org?.avatar}
          gender={agent.org?.gender}
          ringColor={agent.org?.departmentColor}
          uid={`${agent.scope}-${agent.filename}`}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold group-hover:text-accent-hover transition-colors truncate">
              {display.emoji && <span className="mr-1">{display.emoji}</span>}
              {display.realName}
              {display.role && <span className="font-normal text-text-muted ml-1.5">— {display.role}</span>}
            </span>
            {agent.org?.isLeader && <LeaderBadge />}
            <LevelBadge org={agent.org} />
            <ExperienceBadge years={agent.org?.yearsOfExperience ?? null} />
            <SquadBadge squad={agent.org?.squad ?? null} onClick={onSquadClick} />
            <HealthBadge health={agent.health} />
            <ScopeBadge agent={agent} />
          </div>
          <p className="text-[11px] text-text-muted truncate mt-0.5" title={agent.description}>{tagline}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono bg-surface-2 px-1.5 py-0.5 rounded text-text-muted">{agent.model || 'sonnet'}</span>
          <span className="text-[10px] text-text-muted flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(agent.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        </div>
      </Link>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
        <button onClick={(e) => { e.stopPropagation(); onCopy(agent) }} title="Copy" className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent-muted"><Copy className="w-3 h-3" /></button>
        <button onClick={(e) => { e.stopPropagation(); onMove(agent) }} title="Move" className="p-1.5 rounded-md text-text-muted hover:text-amber-400 hover:bg-amber-500/10"><ArrowRightLeft className="w-3 h-3" /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(agent) }} title="Delete" disabled={deleting} className="p-1.5 rounded-md text-text-muted hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"><Trash2 className="w-3 h-3" /></button>
      </div>

      {/* Squad picker popover */}
      {squadPickerOpen && (
        <div
          ref={squadPickerRef}
          className="absolute z-50 top-full left-12 mt-1 bg-surface border border-border rounded-xl shadow-xl p-2 min-w-[220px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold px-2 py-1">Assign Squad</div>
          {SQUADS.map(sq => {
            const active = agent.org?.squad === sq.id
            return (
              <button
                key={sq.id}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSquadSelect(active ? null : sq.id) }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${active ? 'bg-accent/10' : 'hover:bg-surface-2'}`}
              >
                <span style={{ color: sq.color }}>{sq.emoji}</span>
                <span className="flex-1 font-medium">{sq.label}</span>
                {active && <CheckCircle2 className="w-3 h-3 text-accent" />}
              </button>
            )
          })}
          {agent.org?.squad && (
            <>
              <div className="border-t border-border my-1" />
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSquadSelect(null) }}
                className="w-full px-2 py-1.5 rounded-md text-xs text-left text-red-400 hover:bg-red-500/10"
              >
                Remove from squad
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function LevelBadge({ org }: { org: UnifiedAgent['org'] }) {
  if (!org || org.level == null) return null
  const title = org.levelTitle || ''
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-accent/10 text-accent shrink-0"
      title={`Level ${org.level}${title ? ` — ${title}` : ''}`}
    >
      <span className="font-mono">L{org.level}</span>
      {title && <span className="opacity-70">· {title}</span>}
    </span>
  )
}

function ExperienceBadge({ years }: { years: number | null }) {
  if (years == null) return null
  const rounded = years >= 10 ? Math.round(years) : Math.round(years * 10) / 10
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-green-muted text-green shrink-0"
      title={`${years.toFixed(1)} years of experience (computed)`}
    >
      {rounded}y exp
    </span>
  )
}

function LeaderBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400 shrink-0 ring-1 ring-amber-400/30"
      title="Department leader"
    >
      <Crown className="w-2.5 h-2.5" />
      Lead
    </span>
  )
}

// Inline budget-health badge — mirrors AgentHealthBar at the top of the
// agent editor. Same status, same colors, same usage% so list and detail
// views are consistent.
function HealthBadge({ health }: { health: UnifiedAgent['health'] }) {
  if (!health) return null
  const style =
    health.status === 'over'     ? 'bg-red-muted text-red ring-red/30'
    : health.status === 'warning' ? 'bg-amber-muted text-amber ring-amber/30'
    : health.status === 'sparse'  ? 'bg-accent/10 text-accent ring-accent/30'
    : 'bg-green-muted text-green ring-green/30'
  const Icon =
    health.status === 'over'     ? AlertTriangle
    : health.status === 'warning' ? AlertTriangle
    : health.status === 'sparse'  ? Info
    : CheckCircle2
  const label =
    health.status === 'over'     ? 'Over budget'
    : health.status === 'warning' ? 'Near limit'
    : health.status === 'sparse'  ? 'Sparse'
    : 'Healthy'
  const pct = Math.round(health.usage * 100)
  const tokenStr = health.estimatedTokens >= 1000
    ? `${(health.estimatedTokens / 1000).toFixed(1)}k`
    : `${health.estimatedTokens}`
  const violationDetail = health.violations?.length > 0
    ? health.violations.map(v => `  ✕ ${v.kind}: ${v.actual} / ${v.limit ?? v.budget} limit`).join('\n')
    : health.warnings?.length > 0
    ? health.warnings.map(w => `  ⚠ ${w.kind}: ${w.actual} / ${w.budget} budget`).join('\n')
    : ''
  const tooltip = [
    `${label} — ${pct}% of budget`,
    `${health.actual.lines}/${health.budget.lines} lines · ${health.sizeKb} KB · ~${tokenStr} tokens`,
    violationDetail,
  ].filter(Boolean).join('\n')
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ring-1 ${style}`}
      title={tooltip}
    >
      <Icon className="w-2.5 h-2.5" />
      {pct}%
    </span>
  )
}

function SquadBadge({ squad, onClick }: { squad: string | null; onClick?: (e: React.MouseEvent) => void }) {
  const { squadById: SQUAD_BY_ID } = useTaxonomy()
  if (!squad) {
    if (!onClick) return null
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 bg-surface-2 text-text-muted border border-dashed border-border hover:bg-surface-3 hover:text-text transition-colors"
        title="Assign squad"
      >
        + squad
      </button>
    )
  }
  const cfg = SQUAD_BY_ID[squad]
  if (!cfg) return null
  const interactive = !!onClick
  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0 ${interactive ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
      style={{ background: `${cfg.color}26`, color: cfg.color }}
      title={interactive ? `Squad: ${cfg.label} — click to change` : `Squad: ${cfg.label}`}
    >
      {cfg.emoji} {cfg.label}
    </button>
  )
}

function ScopeBadge({ agent }: { agent: UnifiedAgent }) {
  if (agent.scope === 'global') {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-surface-2 text-text-muted shrink-0"
        title="Global agent"
      >
        G
      </span>
    )
  }
  const name = agent.projectName ?? 'Unknown'
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-amber-500/10 text-amber-400 shrink-0"
      title={`Project: ${name}`}
    >
      <FolderOpen className="w-2.5 h-2.5" />
      {name}
    </span>
  )
}
