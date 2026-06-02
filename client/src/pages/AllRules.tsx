import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Clock, FolderOpen, Search, Globe, Shield } from 'lucide-react'
import {
  getUnifiedRules,
  deleteProjectRule,
  deleteGlobalRule,
  updateProjectRule,
  updateGlobalRule,
  sanitizeName,
} from '../lib/api'
import { useApi } from '../hooks/useApi'
import { ErrorState } from '../components/ErrorState'
import type { UnifiedRule } from '../types'
import { toast } from '../components/Toast'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function AllRules() {
  const { data: rules, loading, error, refetch } = useApi(getUnifiedRules)
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'project'>('all')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState<'global' | 'project'>('global')
  const [newProject, setNewProject] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())

  const filtered = (rules || []).filter((r) => {
    if (scopeFilter === 'global' && r.scope !== 'global') return false
    if (scopeFilter === 'project' && r.scope !== 'project') return false
    if (!search) return true
    const q = search.toLowerCase()
    return r.name.toLowerCase().includes(q) || (r.projectName || '').toLowerCase().includes(q)
  })

  // Group: global first, then by project
  const globalRules = filtered.filter(r => r.scope === 'global')
  const projectGroups = new Map<string, UnifiedRule[]>()
  for (const r of filtered.filter(r => r.scope === 'project')) {
    const key = r.projectName || 'Unknown'
    if (!projectGroups.has(key)) projectGroups.set(key, [])
    projectGroups.get(key)!.push(r)
  }

  // Unique projects for form
  const projects = [...new Map(
    (rules || []).filter(r => r.scope === 'project' && r.projectId)
      .map(r => [r.projectId, { id: r.projectId!, name: r.projectName || '' }])
  ).values()]

  const handleDelete = async (rule: UnifiedRule) => {
    if (!confirm(`Delete "${rule.name}"?`)) return
    const key = rule.scope === 'global' ? `global-${rule.name}` : `${rule.projectId}-${rule.name}`
    setDeletingKeys(prev => new Set(prev).add(key))
    try {
      if (rule.scope === 'global') await deleteGlobalRule(rule.name)
      else await deleteProjectRule(rule.projectId!, rule.name)
      refetch()
      toast('success', `Deleted ${rule.name}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingKeys(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleCreate = async () => {
    const name = sanitizeName(newName)
    if (!name) { toast('error', 'Name required'); return }
    if (newScope === 'project' && !newProject) { toast('error', 'Select a project'); return }
    setCreateLoading(true)
    try {
      const content = `# ${name}\n\n`
      if (newScope === 'global') {
        await updateGlobalRule(name, content)
        setCreating(false)
        setNewName('')
        refetch()
        navigate(`/global/rules/${name}`)
      } else {
        await updateProjectRule(newProject, name, content)
        setCreating(false)
        setNewName('')
        refetch()
        navigate(`/projects/${newProject}/rules/${name}`)
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreateLoading(false)
    }
  }

  const renderRule = (rule: UnifiedRule) => {
    const key = rule.scope === 'global' ? `global-${rule.name}` : `${rule.projectId}-${rule.name}`
    const deleting = deletingKeys.has(key)
    const editPath = rule.scope === 'global'
      ? `/global/rules/${rule.name}`
      : `/projects/${rule.projectId}/rules/${rule.name}`

    return (
      <div
        key={key}
        className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-surface-2/30 transition-colors group"
      >
        <span className="text-xs font-mono font-medium truncate flex-1">{rule.name}</span>
        <span className="text-[11px] text-text-muted truncate max-w-[200px]">
          {rule.content.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || '—'}
        </span>
        <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Clock className="w-3 h-3" />
            {timeAgo(rule.updatedAt)}
          </span>
          <button
            onClick={() => navigate(editPath)}
            className="text-[10px] text-accent hover:text-accent-hover font-medium transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => handleDelete(rule)}
            disabled={deleting}
            className="p-1 text-text-muted hover:text-red transition-colors rounded disabled:opacity-50"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold">Rules</h2>
          <p className="text-xs text-text-muted mt-0.5">{(rules || []).length} rules across all scopes</p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Rule
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold mb-3">New Rule</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="rule-name"
              className="flex-1 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none"
            />
            <select
              value={newScope}
              onChange={e => setNewScope(e.target.value as 'global' | 'project')}
              className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none"
            >
              <option value="global">Global</option>
              <option value="project">Project</option>
            </select>
            {newScope === 'project' && (
              <select
                value={newProject}
                onChange={e => setNewProject(e.target.value)}
                className="bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="">Select project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={handleCreate}
              disabled={createLoading}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {createLoading ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); setNewProject('') }}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5 flex-1">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search rules…"
            className="flex-1 bg-transparent text-xs outline-none"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          {(['all', 'global', 'project'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                scopeFilter === s ? 'bg-accent text-white' : 'bg-surface text-text-muted hover:bg-surface-2'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">{search ? 'No rules match your search' : 'No rules yet'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Global rules */}
          {globalRules.length > 0 && (
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-surface-2/40 flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs font-semibold">Global</span>
                <span className="text-[10px] text-text-muted ml-auto">{globalRules.length} rule{globalRules.length !== 1 ? 's' : ''}</span>
              </div>
              {globalRules.map(renderRule)}
            </div>
          )}

          {/* Project rules */}
          {[...projectGroups.entries()].map(([projectName, prules]) => (
            <div key={projectName} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-surface-2/40 flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs font-semibold">{projectName}</span>
                <span className="text-[10px] text-text-muted ml-auto">{prules.length} rule{prules.length !== 1 ? 's' : ''}</span>
              </div>
              {prules.map(renderRule)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
