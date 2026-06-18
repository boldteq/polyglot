import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Clock, FolderOpen, Search, FileCode } from 'lucide-react'
import { getUnifiedCommands, deleteProjectCommand, sanitizeName, updateProjectCommand } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { ErrorState } from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import type { UnifiedCommand } from '../types'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function AllCommands() {
  const { data: commands, loading, error, refetch } = useApi(getUnifiedCommands, [], CacheKeys.unifiedCommands)
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newProject, setNewProject] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => (commands || []).filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.projectName.toLowerCase().includes(q)
  }), [commands, search])

  // Group by project
  const groups = useMemo(() => {
    const map = new Map<string, UnifiedCommand[]>()
    for (const c of filtered) {
      const key = c.projectName
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return map
  }, [filtered])

  // Unique projects for new-command form
  const projects = useMemo(() => [...new Map((commands || []).map(c => [c.projectId, { id: c.projectId, name: c.projectName }])).values()], [commands])

  const handleDelete = async (cmd: UnifiedCommand) => {
    if (!(await confirmDialog({ title: 'Delete command?', message: `"/${cmd.name}" will be permanently deleted.`, danger: true, confirmLabel: 'Delete' }))) return
    const key = `${cmd.projectId}-${cmd.name}`
    setDeletingKeys(prev => new Set(prev).add(key))
    try {
      await deleteProjectCommand(cmd.projectId, cmd.name)
      refetch()
      toast('success', `Deleted /${cmd.name}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingKeys(prev => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleCreate = async () => {
    const name = sanitizeName(newName)
    if (!name) { toast('error', 'Name required'); return }
    if (!newProject) { toast('error', 'Select a project'); return }
    setCreateLoading(true)
    try {
      await updateProjectCommand(newProject, name, `# /${name}\n\nDescribe what this command does.\n`)
      setCreating(false)
      setNewName('')
      refetch()
      navigate(`/projects/${newProject}/commands/${name}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold">Commands</h2>
          <p className="text-xs text-text-muted mt-0.5">{(commands || []).length} slash commands across all projects</p>
        </div>
        <button onClick={() => setCreating(c => !c)} className="btn-primary btn-sm">
          <Plus className="w-3.5 h-3.5" />
          New Command
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="card p-4 mb-4">
          <p className="text-xs font-semibold mb-3">New Command</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="text-text-muted text-sm absolute left-3 top-1/2 -translate-y-1/2 z-10">/</span>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="command-name"
                className="input pl-7"
              />
            </div>
            <select
              value={newProject}
              onChange={e => setNewProject(e.target.value)}
              className="input w-auto"
            >
              <option value="">Select project…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button onClick={handleCreate} disabled={createLoading} className="btn-primary btn-sm">
              {createLoading ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); setNewProject('') }}
              className="btn-ghost btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 z-10" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search commands…"
          className="input pl-9"
        />
      </div>

      {/* List */}
      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileCode}
          title={search ? 'No commands match your search' : 'No commands yet'}
          card
          size="sm"
          action={search ? undefined : { label: 'New Command', onClick: () => setCreating(true) }}
        />
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([projectName, cmds]) => (
            <div key={projectName} className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-surface-2/40 flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-xs font-semibold">{projectName}</span>
                <span className="text-[10px] text-text-muted ml-auto">{cmds.length} command{cmds.length !== 1 ? 's' : ''}</span>
              </div>
              {cmds.map(cmd => {
                const key = `${cmd.projectId}-${cmd.name}`
                const deleting = deletingKeys.has(key)
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-surface-2/30 transition-colors group"
                  >
                    <span className="text-xs font-mono font-medium text-accent shrink-0">/{cmd.name}</span>
                    <span className="text-[11px] text-text-muted truncate flex-1">
                      {cmd.content.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim() || '—'}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex items-center gap-1 text-[10px] text-text-muted">
                        <Clock className="w-3 h-3" />
                        {timeAgo(cmd.updatedAt)}
                      </span>
                      <button
                        onClick={() => navigate(`/projects/${cmd.projectId}/commands/${cmd.name}`)}
                        className="text-[10px] text-accent hover:text-accent-hover font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(cmd)}
                        disabled={deleting}
                        title="Delete command"
                        aria-label={`Delete command /${cmd.name}`}
                        className="p-1 text-text-muted hover:text-red transition-colors rounded disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
