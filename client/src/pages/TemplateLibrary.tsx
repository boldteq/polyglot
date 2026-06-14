import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutTemplate, Plus, Trash2, Clock, Search, FileText, X } from 'lucide-react'
import { getTemplates, deleteTemplate, updateTemplate, sanitizeName } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { ErrorState } from '../components/ErrorState'
import { toast } from '../components/Toast'

export default function TemplateLibrary() {
  const { data: templates, loading, error, refetch } = useApi(getTemplates, [], CacheKeys.templates)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const filtered = (templates || []).filter(t => {
    if (!search) return true
    return t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
  })

  const handleCreate = async () => {
    if (!newName.trim()) return
    const slug = sanitizeName(newName)
    if (!slug) {
      toast('error', 'Invalid name')
      return
    }
    setCreateLoading(true)
    try {
      const content = `---\nname: ${newName.trim()}\ndescription: ""\n---\n\n# {title}\n\n## Section 1\n\nYour content structure here.\n`
      await updateTemplate(slug, content)
      navigate(`/templates/${slug}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return
    try {
      await deleteTemplate(name)
      refetch()
      toast('success', 'Template deleted')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            <LayoutTemplate className="w-6 h-6 text-accent" />
            Output Templates
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Locked output formats that agents follow. Consistent results every time.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-accent/50"
        />
      </div>

      {/* Create modal */}
      {creating && (
        <div className="mb-6 bg-surface border border-accent/30 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold">Create New Template</p>
            <button onClick={() => { setCreating(false); setNewName('') }} className="text-text-muted hover:text-text">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={createLoading}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {createLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Templates grid */}
      {filtered.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-12 text-center">
          <LayoutTemplate className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">
            {search ? 'No templates match your search' : 'No templates yet'}
          </p>
          <p className="text-text-muted text-sm mt-1">
            Create a template to lock down agent output format
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filtered.map(template => (
            <div key={template.filename} className="group bg-surface rounded-xl border border-border p-5 hover:border-accent/30 transition-all">
              <div className="flex items-start justify-between">
                <Link to={`/templates/${template.filename}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="p-2 rounded-lg bg-accent-muted shrink-0">
                      <FileText className="w-4 h-4 text-accent" />
                    </div>
                    <h3 className="font-semibold text-sm group-hover:text-accent-hover transition-colors truncate">
                      {template.name}
                    </h3>
                  </div>
                  {template.description && (
                    <p className="text-xs text-text-secondary mb-3 line-clamp-2">{template.description}</p>
                  )}
                  {template.sections && template.sections.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {template.sections.map((s: string) => (
                        <span key={s} className="text-[10px] bg-surface-2 text-text-muted px-1.5 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-text-muted">
                    <Clock className="w-3 h-3" />
                    {new Date(template.updatedAt).toLocaleDateString()}
                  </div>
                </Link>
                <button
                  onClick={() => handleDelete(template.filename)}
                  className="p-1.5 rounded-md text-text-muted hover:text-red hover:bg-red-muted opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
