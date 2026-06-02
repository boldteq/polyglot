import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Clock, FolderOpen, Search, FileCode } from 'lucide-react'
import { getUnifiedCommands, deleteProjectCommand, sanitizeName, updateProjectCommand } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { ErrorState } from '../components/ErrorState'
import type { UnifiedCommand } from '../types'
import { toast } from '../components/Toast'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function AllCommands() {
  const { data: commands, loading, error, refetch } = useApi(getUnifiedCommands)
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newProject, setNewProject] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())

  const filtered = (commands || []).filter((c) => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.projectName.toLowerCase().includes(q)
  })

  // Group by project
  const groups = new Map<string, UnifiedCommand[]>()
  for (const c of filtered) {
    const key = c.projectName
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  // Unique projects for new-command form
  const projects = [...new Map((commands || []).map(c => [c.projectId, { id: c.projectId, name: c.projectName }])).values()]

  const handleDelete = async (cmd: UnifiedCommand) => {
    if (!confirm(`Delete "/${cmd.name}"?`)) return
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
        <button
          onClick={() => setCreating(c => !c)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Command
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4">
          <p className="text-xs font-semibold mb-3">New Command</p>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5">
              <span className="text-text-muted text-xs">/</span>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="command-name"
                className="flex-1 bg-transparent text-xs outline-none"
              />
            </div>
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

      {/* Search */}
      <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2.5 py-1.5 mb-4">
        <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search commands…"
          className="flex-1 bg-transparent text-xs outline-none"
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
        <div className="text-center py-12 text-text-muted">
          <FileCode className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">{search ? 'No commands match your search' : 'No commands yet'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([projectName, cmds]) => (
            <div key={projectName} className="bg-surface rounded-xl border border-border overflow-hidden">
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
