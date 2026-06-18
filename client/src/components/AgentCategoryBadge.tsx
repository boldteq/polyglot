import { useState } from 'react'
import {
  Pencil, Trash2, Plus, X, FolderOpen,
  Layers, ChevronDown, ChevronUp, Sparkles, GripVertical,
} from 'lucide-react'

// ── Color System ─────────────────────────────────────────────────────────────

// Token-backed (flips light/dark). One canonical color per category; semantic
// keys mirror CATEGORY_COLOR in lib/designTokens.ts. `cat(family)` builds the
// bg/text/dot/ring/gradient quintet from a single token family.
function cat(c: string) {
  return { bg: `bg-${c}/10`, text: `text-${c}`, dot: `bg-${c}`, ring: `ring-${c}/20`, gradient: `from-${c}/20 to-${c}/5` }
}

const CATEGORY_COLORS: Record<string, ReturnType<typeof cat>> = {
  'software-factory': cat('purple'),
  personal: cat('blue'),
  research: cat('emerald'),
  'client-work': cat('orange'),
  automation: cat('cyan'),
  marketing: cat('pink'),
  devops: cat('red'),
  design: cat('indigo'),
  engineering: cat('sky'),
  'ops-strategy': cat('amber'),
  hr: cat('rose'),
  'content-seo': cat('lime'),
  uncategorized: cat('zinc'),
}

const EXTRA_COLORS = [cat('teal'), cat('lime'), cat('violet'), cat('fuchsia'), cat('rose')]

export function getColors(category: string) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category]
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = ((hash << 5) - hash + category.charCodeAt(i)) | 0
  return EXTRA_COLORS[Math.abs(hash) % EXTRA_COLORS.length]
}

export function formatCategory(cat: string): string {
  return cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function slugifyCategory(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ── Badge (inline, used in agent rows/cards) ─────────────────────────────────

export function AgentCategoryBadge({ category }: { category?: string }) {
  const cat = category || 'uncategorized'
  const colors = getColors(cat)
  const label = formatCategory(cat)

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {label}
    </span>
  )
}

// ── Category Filter + Management ─────────────────────────────────────────────

export function CategoryFilterPills({
  categories,
  selected,
  onSelect,
  onRename,
  onDelete,
  onCreate,
  onReorder,
}: {
  categories: { name: string; count: number }[]
  selected: string
  onSelect: (cat: string) => void
  onRename?: (oldName: string, newName: string) => Promise<void>
  onDelete?: (category: string, reassignTo: string) => Promise<void>
  onCreate?: (name: string) => Promise<void>
  onReorder?: (order: string[]) => Promise<void>
}) {
  const total = categories.reduce((sum, c) => sum + c.count, 0)
  const [expanded, setExpanded] = useState(false)
  const [editingCat, setEditingCat] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deletingCat, setDeletingCat] = useState<string | null>(null)
  const [reassignTarget, setReassignTarget] = useState('uncategorized')
  const [creatingNew, setCreatingNew] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragCat, setDragCat] = useState<string | null>(null)
  const [dragOverCat, setDragOverCat] = useState<string | null>(null)

  const hasManagement = onRename || onDelete || onCreate

  const handleRename = async () => {
    if (!onRename || !editingCat || !editValue.trim()) return
    const slug = slugifyCategory(editValue)
    if (!slug || slug === editingCat) { setEditingCat(null); return }
    setBusy(true)
    try {
      await onRename(editingCat, slug)
      setEditingCat(null)
      setEditValue('')
    } finally { setBusy(false) }
  }

  const handleDelete = async () => {
    if (!onDelete || !deletingCat) return
    setBusy(true)
    try {
      await onDelete(deletingCat, reassignTarget)
      setDeletingCat(null)
      setReassignTarget('uncategorized')
    } finally { setBusy(false) }
  }

  const handleCreate = async () => {
    if (!onCreate || !newCatName.trim()) return
    const slug = slugifyCategory(newCatName)
    if (!slug) return
    setBusy(true)
    try {
      await onCreate(slug)
      setNewCatName('')
      setCreatingNew(false)
    } finally { setBusy(false) }
  }

  const handleDrop = async (targetName: string) => {
    if (!onReorder || !dragCat || dragCat === targetName) {
      setDragCat(null)
      setDragOverCat(null)
      return
    }
    const names = categories.map(c => c.name)
    const from = names.indexOf(dragCat)
    const to = names.indexOf(targetName)
    if (from < 0 || to < 0) return
    const next = [...names]
    next.splice(from, 1)
    next.splice(to, 0, dragCat)
    setDragCat(null)
    setDragOverCat(null)
    try {
      await onReorder(next)
    } catch { /* parent surfaces error */ }
  }

  const closeManagement = () => {
    setExpanded(false)
    setEditingCat(null)
    setDeletingCat(null)
    setCreatingNew(false)
    setNewCatName('')
  }

  return (
    <div className="space-y-3">
      {/* ── Filter pills row ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* All pill */}
        <button
          onClick={() => onSelect('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            selected === 'all'
              ? 'bg-accent text-white shadow-soft shadow-accent/25'
              : 'bg-surface-2 text-text-secondary hover:text-text hover:bg-surface-3'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            All
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              selected === 'all' ? 'bg-white/20' : 'bg-surface-3'
            }`}>
              {total}
            </span>
          </span>
        </button>

        {/* Category pills */}
        {categories.map(cat => {
          const colors = getColors(cat.name)
          const label = formatCategory(cat.name)
          const isActive = selected === cat.name
          const isDragging = dragCat === cat.name
          const isDragOver = dragOverCat === cat.name && dragCat !== cat.name
          const draggable = Boolean(onReorder)
          return (
            <div
              key={cat.name}
              role="button"
              tabIndex={0}
              draggable={draggable}
              onDragStart={draggable ? (e) => {
                setDragCat(cat.name)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', cat.name)
              } : undefined}
              onDragEnter={draggable ? (e) => {
                e.preventDefault()
                if (dragCat && dragCat !== cat.name) setDragOverCat(cat.name)
              } : undefined}
              onDragOver={draggable ? (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragCat && dragCat !== cat.name && dragOverCat !== cat.name) setDragOverCat(cat.name)
              } : undefined}
              onDragLeave={draggable ? (e) => {
                const next = e.relatedTarget as Node | null
                if (next && e.currentTarget.contains(next)) return
                if (dragOverCat === cat.name) setDragOverCat(null)
              } : undefined}
              onDrop={draggable ? (e) => { e.preventDefault(); handleDrop(cat.name) } : undefined}
              onDragEnd={draggable ? () => { setDragCat(null); setDragOverCat(null) } : undefined}
              onClick={() => { if (!dragCat) onSelect(cat.name) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(cat.name) } }}
              className={`select-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? `${colors.bg} ${colors.text} ring-1 ${colors.ring} shadow-soft`
                  : 'bg-surface-2 text-text-secondary hover:text-text hover:bg-surface-3'
              } ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'ring-2 ring-accent/60' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              title={draggable ? 'Drag to reorder' : undefined}
            >
              <span className="flex items-center gap-1.5 pointer-events-none">
                <span className={`w-2 h-2 rounded-full ${colors.dot} ${isActive ? 'ring-2 ring-current/20' : ''}`} />
                {label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isActive ? 'bg-current/10' : 'bg-surface-3'
                }`}>
                  {cat.count}
                </span>
              </span>
            </div>
          )
        })}

        {/* Manage toggle */}
        {hasManagement && (
          <button
            onClick={() => expanded ? closeManagement() : setExpanded(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              expanded
                ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                : 'bg-surface-2 text-text-muted hover:text-text hover:bg-surface-3'
            }`}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Manage
          </button>
        )}
      </div>

      {/* ── Management Panel ── */}
      {expanded && hasManagement && (
        <div className="card overflow-hidden">
          {/* Panel header */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-accent/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <FolderOpen className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-bold">Categories</h3>
                <p className="text-[11px] text-text-muted">{categories.length} categories &middot; {total} agents</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onCreate && (
                <button
                  onClick={() => setCreatingNew(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors shadow-soft shadow-accent/25"
                >
                  <Plus className="w-3.5 h-3.5" /> New Category
                </button>
              )}
              <button
                onClick={closeManagement}
                className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Create new */}
          {creatingNew && onCreate && (
            <div className="px-5 py-4 border-b border-border bg-accent/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold">New Category</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder="e.g. AI Tools, Client Projects, Internal..."
                    className="input"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreatingNew(false); setNewCatName('') } }}
                  />
                  {newCatName.trim() && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary font-mono bg-surface-3 px-1.5 py-0.5 rounded">
                      {slugifyCategory(newCatName)}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!newCatName.trim() || busy}
                  className="btn-primary btn-lg"
                >
                  {busy ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => { setCreatingNew(false); setNewCatName('') }}
                  className="p-2 rounded-lg hover:bg-surface-2 text-text-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Category list */}
          <div className="divide-y divide-border/50">
            {categories.map(cat => {
              const colors = getColors(cat.name)
              const label = formatCategory(cat.name)
              const isEditing = editingCat === cat.name
              const isDeleting = deletingCat === cat.name

              // ── Rename mode ──
              if (isEditing) {
                return (
                  <div key={cat.name} className="px-5 py-4 bg-accent/[0.03]">
                    <div className="flex items-center gap-2 mb-2">
                      <Pencil className="w-4 h-4 text-accent" />
                      <span className="text-sm font-semibold">Rename "{label}"</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="input"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingCat(null) }}
                        />
                        {editValue.trim() && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary font-mono bg-surface-3 px-1.5 py-0.5 rounded">
                            {slugifyCategory(editValue)}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={handleRename}
                        disabled={busy}
                        className="btn-primary btn-lg"
                      >
                        {busy ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingCat(null)} className="p-2 rounded-lg hover:bg-surface-2 text-text-muted">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              }

              // ── Delete confirmation ──
              if (isDeleting) {
                return (
                  <div key={cat.name} className="px-5 py-4 bg-red/[0.03]">
                    <div className="flex items-center gap-2 mb-3">
                      <Trash2 className="w-4 h-4 text-red" />
                      <span className="text-sm font-semibold">
                        Delete <span className={colors.text}>{label}</span>
                      </span>
                    </div>
                    {cat.count > 0 && (
                      <p className="text-xs text-text-muted mb-3">
                        {cat.count} agent{cat.count > 1 ? 's' : ''} will be reassigned to:
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      {cat.count > 0 && (
                        <select
                          value={reassignTarget}
                          onChange={e => setReassignTarget(e.target.value)}
                          className="flex-1 bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent/50"
                        >
                          <option value="uncategorized">Uncategorized</option>
                          {categories.filter(c => c.name !== cat.name && c.name !== 'uncategorized').map(c => (
                            <option key={c.name} value={c.name}>{formatCategory(c.name)}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={handleDelete}
                        disabled={busy}
                        className="px-5 py-2.5 text-sm font-semibold bg-red/10 text-red rounded-lg hover:bg-red/20 disabled:opacity-40 transition-colors"
                      >
                        {busy ? 'Deleting...' : 'Delete'}
                      </button>
                      <button onClick={() => setDeletingCat(null)} className="p-2 rounded-lg hover:bg-surface-2 text-text-muted">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              }

              // ── Normal row ──
              const rowDraggable = Boolean(onReorder)
              const rowIsDragging = dragCat === cat.name
              const rowIsDragOver = dragOverCat === cat.name && dragCat !== cat.name
              return (
                <div
                  key={cat.name}
                  draggable={rowDraggable}
                  onDragStart={rowDraggable ? (e) => {
                    setDragCat(cat.name)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', cat.name)
                  } : undefined}
                  onDragEnter={rowDraggable ? (e) => {
                    e.preventDefault()
                    if (dragCat && dragCat !== cat.name) setDragOverCat(cat.name)
                  } : undefined}
                  onDragOver={rowDraggable ? (e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dragCat && dragCat !== cat.name && dragOverCat !== cat.name) setDragOverCat(cat.name)
                  } : undefined}
                  onDragLeave={rowDraggable ? (e) => {
                    const next = e.relatedTarget as Node | null
                    if (next && e.currentTarget.contains(next)) return
                    if (dragOverCat === cat.name) setDragOverCat(null)
                  } : undefined}
                  onDrop={rowDraggable ? (e) => { e.preventDefault(); handleDrop(cat.name) } : undefined}
                  onDragEnd={rowDraggable ? () => { setDragCat(null); setDragOverCat(null) } : undefined}
                  className={`group flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/50 transition-colors select-none ${
                    rowIsDragging ? 'opacity-40' : ''
                  } ${rowIsDragOver ? 'bg-accent/5 ring-1 ring-accent/30' : ''}`}
                >
                  {/* Drag handle */}
                  {rowDraggable && (
                    <span className="text-text-muted/60 cursor-grab active:cursor-grabbing shrink-0" title="Drag to reorder">
                      <GripVertical className="w-4 h-4" />
                    </span>
                  )}

                  {/* Color dot + gradient bar */}
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shrink-0`}>
                    <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
                  </div>

                  {/* Name + count */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold block truncate">{label}</span>
                    <span className="text-[11px] text-text-muted">
                      {cat.count} agent{cat.count !== 1 ? 's' : ''}
                      {cat.count === 0 && ' — empty'}
                    </span>
                  </div>

                  {/* Slug */}
                  <span className="text-[10px] font-mono text-text-muted bg-surface-2 px-2 py-0.5 rounded hidden sm:block">
                    {cat.name}
                  </span>

                  {/* Actions */}
                  {cat.name !== 'uncategorized' && (onRename || onDelete) && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onRename && (
                        <button
                          onClick={() => { setEditingCat(cat.name); setEditValue(cat.name.replace(/-/g, ' ')); setDeletingCat(null) }}
                          className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => { setDeletingCat(cat.name); setEditingCat(null) }}
                          className="p-2 rounded-lg text-text-muted hover:text-red hover:bg-red/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
