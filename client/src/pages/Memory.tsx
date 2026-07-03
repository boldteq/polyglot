import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Trash2,
  Save,
  ChevronRight,
  Search,
  X,
  BarChart3,
  Pencil,
  Tag,
  Clock,
  HardDrive,
  FileQuestion,
  BookOpen,
  User,
  MessageSquare,
  Bookmark,
  RefreshCw,
  History,
  AlertTriangle,
  Sparkles,
  Loader2,
} from 'lucide-react'
import type { MemoryNode, MemorySearchResult, MemoryStats, MemoryFrontmatter, IntelHit } from '../lib/api'
import { confirmDialog } from '../lib/confirm'
import {
  getMemoryTree,
  getMemoryFile,
  updateMemoryFile,
  createMemoryFile,
  deleteMemoryFile,
  searchMemory,
  getMemoryStats,
  createMemoryFolder,
  deleteMemoryFolder,
  moveMemoryFile, apiError,
  searchIntelligence,
  getIntelligenceStats,
  runScheduleNow,
} from '../lib/api'
import { toast } from '../components/Toast'
import DependencyBanner from '../components/DependencyBanner'
import { useUnsavedGuard } from '../hooks/useUnsavedGuard'

// ── Constants ─────────────────────────────────────────────────────────────────

const MEMORY_TYPES = ['user', 'feedback', 'project', 'reference'] as const
type MemoryType = (typeof MEMORY_TYPES)[number]

const TYPE_META: Record<
  MemoryType,
  { label: string; description: string; color: string; bg: string; icon: typeof User }
> = {
  user: {
    label: 'User',
    description: 'Who the user is — tailors future behavior',
    color: 'text-accent',
    bg: 'bg-accent-muted',
    icon: User,
  },
  feedback: {
    label: 'Feedback',
    description: 'How to approach work — corrections and validations',
    color: 'text-amber',
    bg: 'bg-amber-muted',
    icon: MessageSquare,
  },
  project: {
    label: 'Project',
    description: 'Ongoing work context — goals, decisions, deadlines',
    color: 'text-green',
    bg: 'bg-green-muted',
    icon: Bookmark,
  },
  reference: {
    label: 'Reference',
    description: 'Pointers to external systems and resources',
    color: 'text-purple',
    bg: 'bg-purple-muted',
    icon: BookOpen,
  },
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red bg-red-muted',
  high: 'text-amber bg-amber-muted',
  normal: 'text-text-secondary bg-surface-2',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): { meta: MemoryFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta: MemoryFrontmatter = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return { meta, body: match[2] }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function flattenNodes(nodes: MemoryNode[]): MemoryNode[] {
  const result: MemoryNode[] = []
  for (const node of nodes) {
    if (node.type === 'file') result.push(node)
    if (node.type === 'dir' && node.children) result.push(...flattenNodes(node.children))
  }
  return result
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ── Tree Node ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: MemoryNode
  selectedPath: string | null
  onSelect: (path: string) => void
  onDelete: (path: string, isDir: boolean) => void
  onRename: (path: string, isDir: boolean) => void
  depth: number
  typeFilter: string | null
  searchQuery: string
}

const TreeNode = memo(function TreeNode({
  node,
  selectedPath,
  onSelect,
  onDelete,
  onRename,
  depth,
  typeFilter,
  searchQuery,
}: TreeNodeProps) {
  const [open, setOpen] = useState(depth < 2)
  const [hovering, setHovering] = useState(false)

  // Filter logic: if typeFilter is set, only show files matching that type
  const matchesFilter = useCallback(
    (n: MemoryNode): boolean => {
      if (!typeFilter && !searchQuery) return true
      if (n.type === 'dir') {
        return n.children?.some((c) => matchesFilter(c)) ?? false
      }
      let typeOk = true
      if (typeFilter) {
        typeOk = n.frontmatter?.type === typeFilter
      }
      let searchOk = true
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        searchOk =
          n.name.toLowerCase().includes(q) ||
          n.path.toLowerCase().includes(q) ||
          (n.frontmatter?.name?.toLowerCase().includes(q) ?? false) ||
          (n.frontmatter?.description?.toLowerCase().includes(q) ?? false)
      }
      return typeOk && searchOk
    },
    [typeFilter, searchQuery],
  )

  if (!matchesFilter(node)) return null

  if (node.type === 'dir') {
    const filteredChildren = node.children?.filter((c) => matchesFilter(c)) ?? []
    if (filteredChildren.length === 0 && (typeFilter || searchQuery)) return null

    return (
      <div>
        <div
          className="relative group"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[13px] text-text-secondary hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
          >
            <ChevronRight
              className={`w-3 h-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
            />
            {open ? (
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-accent" />
            ) : (
              <Folder className="w-3.5 h-3.5 shrink-0 text-text-muted" />
            )}
            <span className="truncate font-medium">{node.name}</span>
            <span className="ml-auto text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {filteredChildren.length}
            </span>
          </button>
          {hovering && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRename(node.path, true)
                }}
                className="p-0.5 rounded text-text-muted hover:text-accent transition-colors"
                title="Rename folder"
                aria-label="Rename folder"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(node.path, true)
                }}
                className="p-0.5 rounded text-text-muted hover:text-red transition-colors"
                title="Delete folder"
                aria-label="Delete folder"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        {open && filteredChildren.length > 0 && (
          <div className="ml-3 border-l border-border/50 pl-2 mt-0.5 space-y-0.5">
            {filteredChildren.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                onDelete={onDelete}
                onRename={onRename}
                depth={depth + 1}
                typeFilter={typeFilter}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const isSelected = selectedPath === node.path
  const isIndex = node.name === 'MEMORY.md' || node.name === 'INDEX.md'
  const Icon = isIndex ? Brain : FileText
  const memType = node.frontmatter?.type as MemoryType | undefined
  const typeColor = memType && TYPE_META[memType] ? TYPE_META[memType].color : ''

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        onClick={() => onSelect(node.path)}
        className={`flex items-center gap-2 w-full px-2 py-1.5 text-[13px] rounded-lg transition-colors text-left pr-14 ${
          isSelected
            ? 'bg-accent-muted text-accent-hover font-medium'
            : 'text-text-secondary hover:text-text hover:bg-surface-2'
        }`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-accent' : typeColor || ''}`} />
        <span className="truncate">{node.name.replace(/\.md$/, '')}</span>
        {memType && TYPE_META[memType] && (
          <span
            className={`ml-auto shrink-0 w-1.5 h-1.5 rounded-full ${TYPE_META[memType].color.replace('text-', 'bg-')}`}
            title={memType}
            aria-label={memType}
          />
        )}
      </button>
      {hovering && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRename(node.path, false)
            }}
            className="p-0.5 rounded text-text-muted hover:text-accent transition-colors"
            title="Rename"
            aria-label="Rename file"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(node.path, false)
            }}
            className="p-0.5 rounded text-text-muted hover:text-red transition-colors"
            title="Delete"
            aria-label="Delete file"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
})

// ── Stats Panel ───────────────────────────────────────────────────────────────

const StatsPanel = memo(function StatsPanel({ stats }: { stats: MemoryStats | null }) {
  if (!stats) return null

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <FileText className="w-4 h-4 mx-auto mb-1 text-accent" />
          <p className="text-lg font-bold text-text">{stats.totalFiles}</p>
          <p className="text-[10px] text-text-muted ">Files</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <Folder className="w-4 h-4 mx-auto mb-1 text-accent" />
          <p className="text-lg font-bold text-text">{stats.totalFolders}</p>
          <p className="text-[10px] text-text-muted ">Folders</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <HardDrive className="w-4 h-4 mx-auto mb-1 text-accent" />
          <p className="text-lg font-bold text-text">{formatBytes(stats.totalSize)}</p>
          <p className="text-[10px] text-text-muted ">Size</p>
        </div>
      </div>

      {/* Type breakdown */}
      <div>
        <p className="text-[10px] font-semibold text-text-muted mb-2">
          By Type
        </p>
        <div className="space-y-1.5">
          {Object.entries(stats.typeCount)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => {
              const meta = TYPE_META[type as MemoryType]
              const total = stats.totalFiles
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              return (
                <div key={type} className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-medium w-16 capitalize ${meta?.color || 'text-text-muted'}`}
                  >
                    {type}
                  </span>
                  <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        meta ? meta.color.replace('text-', 'bg-') : 'bg-text-muted'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-muted w-8 text-right">{count}</span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Folder breakdown */}
      <div>
        <p className="text-[10px] font-semibold text-text-muted mb-2">
          By Folder
        </p>
        <div className="space-y-1">
          {Object.entries(stats.folderCount)
            .sort((a, b) => b[1] - a[1])
            .map(([folder, count]) => (
              <div
                key={folder}
                className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-surface-2"
              >
                <span className="text-[12px] text-text-secondary truncate">{folder}/</span>
                <span className="text-[11px] text-text-muted">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
})

// ── Info Sidebar ──────────────────────────────────────────────────────────────

const InfoSidebar = memo(function InfoSidebar({
  filePath,
  content,
  node,
}: {
  filePath: string | null
  content: string
  node: MemoryNode | null
}) {
  if (!filePath) return null

  const fileName = filePath.split('/').pop() ?? filePath
  const { meta } = parseFrontmatter(content)
  const memType = meta.type as MemoryType | undefined
  const typeMeta = memType ? TYPE_META[memType] : null

  return (
    <div className="space-y-4">
      {/* File info */}
      <div>
        <p className="text-[10px] font-semibold text-text-muted mb-2">
          File
        </p>
        <div className="bg-surface-2 rounded-xl p-3 space-y-1.5">
          <p className="text-[13px] font-medium text-text break-all">{fileName}</p>
          <p className="text-[11px] text-text-muted break-all font-mono">{filePath}</p>
          {node?.size !== undefined && (
            <p className="text-[11px] text-text-muted">{formatBytes(node.size)}</p>
          )}
          {node?.modifiedAt && (
            <div className="flex items-center gap-1 text-[11px] text-text-muted">
              <Clock className="w-3 h-3" />
              {timeAgo(node.modifiedAt)}
            </div>
          )}
        </div>
      </div>

      {/* Frontmatter */}
      {Object.keys(meta).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted mb-2">
            Frontmatter
          </p>
          <div className="bg-surface-2 rounded-xl p-3 space-y-2">
            {meta.name && (
              <div>
                <p className="text-[10px] text-text-muted">Name</p>
                <p className="text-[12px] text-text font-medium">{meta.name}</p>
              </div>
            )}
            {meta.description && (
              <div>
                <p className="text-[10px] text-text-muted">Description</p>
                <p className="text-[12px] text-text-secondary leading-relaxed">
                  {meta.description}
                </p>
              </div>
            )}
            {meta.priority && (
              <div>
                <p className="text-[10px] text-text-muted">Priority</p>
                <span
                  className={`inline-block text-[11px] px-2 py-0.5 rounded-md font-medium capitalize ${PRIORITY_COLORS[meta.priority] || 'text-text-secondary bg-surface-3'}`}
                >
                  {meta.priority}
                </span>
              </div>
            )}
            {meta.maintainer && (
              <div>
                <p className="text-[10px] text-text-muted">Maintainer</p>
                <p className="text-[12px] text-text-secondary">{meta.maintainer}</p>
              </div>
            )}
            {meta.last_updated && (
              <div>
                <p className="text-[10px] text-text-muted">Last Updated</p>
                <p className="text-[12px] text-text-secondary">{meta.last_updated}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Type card */}
      {typeMeta && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted mb-2">
            Memory Type
          </p>
          <div className={`rounded-xl p-3 border ${typeMeta.bg} border-current/10`}>
            <div className="flex items-center gap-2 mb-1">
              <typeMeta.icon className={`w-4 h-4 ${typeMeta.color}`} />
              <span className={`text-[13px] font-semibold capitalize ${typeMeta.color}`}>
                {typeMeta.label}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {typeMeta.description}
            </p>
          </div>
        </div>
      )}

      {/* All types legend */}
      <div>
        <p className="text-[10px] font-semibold text-text-muted mb-2">
          Type Legend
        </p>
        <div className="space-y-1">
          {MEMORY_TYPES.map((type) => {
            const m = TYPE_META[type]
            const isActive = memType === type
            return (
              <div
                key={type}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                  isActive ? `${m.bg} border border-current/10` : 'hover:bg-surface-2'
                }`}
              >
                <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                <span
                  className={`text-[11px] font-medium capitalize ${isActive ? m.color : 'text-text-secondary'}`}
                >
                  {m.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

// ── Search Results ────────────────────────────────────────────────────────────

function SearchResults({
  results,
  query,
  onSelect,
  onClose,
  onDelete,
  onRename,
}: {
  results: MemorySearchResult[]
  query: string
  onSelect: (path: string) => void
  onClose: () => void
  onDelete: (path: string, isDir: boolean) => void
  onRename: (path: string, isDir: boolean) => void
}) {
  const matchBadge: Record<string, { label: string; className: string }> = {
    name: { label: 'Name', className: 'text-accent bg-accent-muted' },
    frontmatter: { label: 'Meta', className: 'text-purple bg-purple-muted' },
    path: { label: 'Path', className: 'text-amber bg-amber-muted' },
    content: { label: 'Content', className: 'text-green bg-green-muted' },
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0 bg-surface-2/30">
        <span className="text-[11px] font-semibold text-text-muted">
          {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          title="Clear search (Esc)"
        >
          <X className="w-3 h-3" /> Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileQuestion className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-[13px] text-text-muted">No files match your search</p>
          </div>
        ) : (
          <div className="py-1">
            {results.map((r) => {
              const badge = matchBadge[r.matchType] || matchBadge.content
              const memType = r.frontmatter?.type as MemoryType | undefined
              const typeMeta = memType ? TYPE_META[memType] : null
              return (
                <div
                  key={r.path}
                  className="group relative border-b border-border/30 hover:bg-surface-2 transition-colors"
                >
                  <button
                    onClick={() => onSelect(r.path)}
                    className="w-full text-left px-3 py-2 pr-20 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 shrink-0 text-text-muted" />
                      <span className="text-[13px] font-medium text-text truncate">{r.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      {typeMeta && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${typeMeta.bg} ${typeMeta.color}`}
                        >
                          {typeMeta.label}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-text-muted truncate pl-5.5">{r.path}</span>
                    {r.snippet && (
                      <span className="text-[11px] text-text-secondary pl-5.5 line-clamp-2">
                        {r.snippet}
                      </span>
                    )}
                  </button>

                  {/* Hover actions */}
                  <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRename(r.path, false)
                      }}
                      className="p-1 rounded-md bg-surface/80 backdrop-blur-sm text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
                      title="Rename"
                      aria-label="Rename file"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(r.path, false)
                      }}
                      className="p-1 rounded-md bg-surface/80 backdrop-blur-sm text-text-muted hover:text-red hover:bg-red/10 transition-colors"
                      title="Delete"
                      aria-label="Delete file"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Dialog ─────────────────────────────────────────────────────────────

function CreateDialog({
  mode,
  onSubmit,
  onCancel,
}: {
  mode: 'file' | 'folder'
  onSubmit: (path: string) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setCreating(true)
    await onSubmit(trimmed)
    setCreating(false)
  }

  return (
    <form onSubmit={handleSubmit} className="px-3 py-2 border-b border-border bg-surface-2/50">
      <div className="flex items-center gap-2 mb-1.5">
        {mode === 'file' ? (
          <FileText className="w-3.5 h-3.5 text-accent" />
        ) : (
          <FolderPlus className="w-3.5 h-3.5 text-accent" />
        )}
        <span className="text-[11px] font-semibold text-text-secondary ">
          New {mode}
        </span>
      </div>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={mode === 'file' ? 'e.g. user/new-memory.md' : 'e.g. projects/new-project'}
        className="input text-[12px] py-1.5 font-mono"
      />
      <div className="flex gap-1.5 mt-1.5">
        <button
          type="submit"
          disabled={creating || !value.trim()}
          className="btn-primary btn-sm flex-1"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary btn-sm flex-1"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Rename Dialog ─────────────────────────────────────────────────────────────

function RenameDialog({
  currentPath,
  isDir,
  onSubmit,
  onCancel,
}: {
  currentPath: string
  isDir: boolean
  onSubmit: (newPath: string) => Promise<void>
  onCancel: () => void
}) {
  const currentName = currentPath.split('/').pop() ?? currentPath
  const parentPath = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : ''
  const [value, setValue] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onCancel])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || trimmed === currentName) return
    const newPath = parentPath ? `${parentPath}/${trimmed}` : trimmed
    setSaving(true)
    await onSubmit(newPath)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !saving && onCancel()}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        className="bg-surface border border-border rounded-xl p-4 w-80 shadow-pop"
      >
        <p id="rename-title" className="text-[13px] font-semibold text-text mb-3">
          Rename {isDir ? 'Folder' : 'File'}
        </p>
        <label htmlFor="rename-input" className="sr-only">New {isDir ? 'folder' : 'file'} name</label>
        <input
          id="rename-input"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="input text-[13px] font-mono"
        />
        <div className="flex gap-2 mt-3">
          <button
            type="submit"
            disabled={saving || !value.trim() || value.trim() === currentName}
            className="btn-primary btn-sm flex-1"
          >
            {saving ? 'Renaming...' : 'Rename'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary btn-sm flex-1"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Memory() {
  // Core state
  const [tree, setTree] = useState<MemoryNode[]>([])
  const [treeLoading, setTreeLoading] = useState(true)
  const [semanticOpen, setSemanticOpen] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filters
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  // Create / rename / delete
  const [createMode, setCreateMode] = useState<'file' | 'folder' | null>(null)
  const [renamingPath, setRenamingPath] = useState<{ path: string; isDir: boolean } | null>(null)
  const [deletingTarget, setDeletingTarget] = useState<{ path: string; isDir: boolean } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Stats
  const [stats, setStats] = useState<MemoryStats | null>(null)

  // Right panel view
  const [rightPanel, setRightPanel] = useState<'info' | 'stats'>('info')

  const dirty = content !== savedContent
  useUnsavedGuard(dirty)

  // Find selected node
  const selectedNode = useMemo(() => {
    if (!selectedPath) return null
    const allFiles = flattenNodes(tree)
    return allFiles.find((f) => f.path === selectedPath) ?? null
  }, [tree, selectedPath])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadTree = useCallback(async () => {
    try {
      const data = await getMemoryTree()
      setTree(data)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to load memory tree')
    } finally {
      setTreeLoading(false)
    }
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const data = await getMemoryStats()
      setStats(data)
    } catch (err) { apiError('Memory action', err) }
  }, [])

  useEffect(() => {
    loadTree()
    loadStats()
  }, [loadTree, loadStats])

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      if (!query.trim()) {
        setSearchResults(null)
        return
      }
      setSearchLoading(true)
      searchTimeout.current = setTimeout(async () => {
        try {
          const results = await searchMemory(query.trim())
          setSearchResults(results)
        } catch {
          setSearchResults([])
        } finally {
          setSearchLoading(false)
        }
      }, 300)
    },
    [],
  )

  // Keyboard shortcuts: Cmd+K to focus search, Escape to clear
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('')
        setSearchResults(null)
        searchInputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── File operations ───────────────────────────────────────────────────────

  const handleSelectFile = useCallback(
    async (filePath: string) => {
      if (dirty) {
        const confirmed = await confirmDialog({ title: 'Discard unsaved changes?', message: 'You have unsaved changes that will be lost if you switch files.', danger: true, confirmLabel: 'Discard' })
        if (!confirmed) return
      }
      setSelectedPath(filePath)
      setFileLoading(true)
      setContent('')
      setSavedContent('')
      setRightPanel('info')
      try {
        const data = await getMemoryFile(filePath)
        setContent(data.content)
        setSavedContent(data.content)
      } catch (err) {
        toast('error', err instanceof Error ? err.message : 'Failed to load file')
      } finally {
        setFileLoading(false)
      }
    },
    [dirty],
  )

  const handleSave = useCallback(async () => {
    if (!selectedPath || !dirty) return
    setSaving(true)
    try {
      await updateMemoryFile(selectedPath, content)
      setSavedContent(content)
      toast('success', 'Saved')
      loadTree() // Refresh tree to update frontmatter
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [selectedPath, content, dirty, loadTree])

  // Cmd+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  const handleDelete = useCallback((filePath: string, isDir: boolean) => {
    setDeletingTarget({ path: filePath, isDir })
  }, [])

  const handleRenameRequest = useCallback((p: string, isDir: boolean) => {
    setRenamingPath({ path: p, isDir })
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingTarget) return
    const { path: filePath, isDir } = deletingTarget
    setDeleteBusy(true)
    try {
      if (isDir) {
        await deleteMemoryFolder(filePath)
      } else {
        await deleteMemoryFile(filePath)
      }
      toast('success', `${isDir ? 'Folder' : 'File'} deleted`)
      if (selectedPath === filePath) {
        setSelectedPath(null)
        setContent('')
        setSavedContent('')
      }
      setDeletingTarget(null)
      loadTree()
      loadStats()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleteBusy(false)
    }
  }, [deletingTarget, selectedPath, loadTree, loadStats])

  const handleCreate = useCallback(
    async (filePath: string) => {
      try {
        if (createMode === 'folder') {
          await createMemoryFolder(filePath)
        } else {
          await createMemoryFile(filePath)
        }
        toast('success', `${createMode === 'folder' ? 'Folder' : 'File'} created`)
        setCreateMode(null)
        await loadTree()
        loadStats()
        if (createMode === 'file') {
          handleSelectFile(filePath)
        }
      } catch (err) {
        toast('error', err instanceof Error ? err.message : 'Failed to create')
      }
    },
    [createMode, loadTree, loadStats, handleSelectFile],
  )

  const handleRename = useCallback(
    async (newPath: string) => {
      if (!renamingPath) return
      try {
        await moveMemoryFile(renamingPath.path, newPath)
        toast('success', 'Renamed')
        if (selectedPath === renamingPath.path) {
          setSelectedPath(newPath)
          // Reload file content for new path
          const data = await getMemoryFile(newPath)
          setContent(data.content)
          setSavedContent(data.content)
        }
        setRenamingPath(null)
        loadTree()
        loadStats()
      } catch (err) {
        toast('error', err instanceof Error ? err.message : 'Failed to rename')
      }
    },
    [renamingPath, selectedPath, loadTree, loadStats],
  )

  // ── Breadcrumbs ───────────────────────────────────────────────────────────

  const breadcrumbs = selectedPath ? selectedPath.split('/') : []

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* ═══ Left Panel — File Tree ═══ */}
      <div className="w-[280px] min-w-[280px] border-r border-border bg-surface flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Brain className="w-4.5 h-4.5 text-accent" />
              <span className="text-sm font-bold tracking-tight">Memory Brain</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setSemanticOpen(true)}
                title="Semantic search (vector RAG)"
                aria-label="Semantic search"
                className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface-2 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
              <Link
                to="/memory/history"
                title="View change history"
                aria-label="View change history"
                className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface-2 transition-colors"
              >
                <History className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setCreateMode(createMode === 'folder' ? null : 'folder')}
                title="New folder"
                aria-label="New folder"
                className={`p-1.5 rounded-lg transition-colors ${createMode === 'folder' ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-accent hover:bg-surface-2'}`}
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCreateMode(createMode === 'file' ? null : 'file')}
                title="New file"
                aria-label="New file"
                className={`p-1.5 rounded-lg transition-colors ${createMode === 'file' ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-accent hover:bg-surface-2'}`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setTreeLoading(true)
                  loadTree().finally(() => setTreeLoading(false))
                  loadStats()
                }}
                title="Refresh"
                aria-label="Refresh tree"
                className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface-2 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <label htmlFor="memory-search" className="sr-only">Search memory files</label>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              id="memory-search"
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search memory... (Cmd+K)"
              className="w-full pl-8 pr-8 py-1.5 text-[12px] bg-surface-2 border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults(null)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            {searchLoading && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Ollama offline → semantic search + capture silently return nothing. */}
        <div className="px-3 pt-2 shrink-0">
          <DependencyBanner subsystem="memory" hint="Run `ollama serve`." />
        </div>

        {/* Filter pills */}
        <div className="px-3 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setTypeFilter(null)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                !typeFilter
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              All
            </button>
            {MEMORY_TYPES.map((type) => {
              const m = TYPE_META[type]
              const isActive = typeFilter === type
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(isActive ? null : type)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                    isActive ? `${m.bg} ${m.color}` : 'text-text-muted hover:text-text hover:bg-surface-2'
                  }`}
                >
                  <m.icon className="w-2.5 h-2.5" />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Create dialog */}
        {createMode && (
          <CreateDialog
            mode={createMode}
            onSubmit={handleCreate}
            onCancel={() => setCreateMode(null)}
          />
        )}

        {/* File tree OR search results */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {searchResults !== null && searchQuery ? (
            <SearchResults
              results={searchResults}
              query={searchQuery}
              onSelect={handleSelectFile}
              onClose={() => {
                setSearchResults(null)
                setSearchQuery('')
              }}
              onDelete={handleDelete}
              onRename={handleRenameRequest}
            />
          ) : (
            <div className="h-full overflow-y-auto py-1.5 px-1.5 space-y-0.5">
              {treeLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : tree.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <Brain className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
                  <p className="text-[12px] text-text-muted">No memory files found</p>
                </div>
              ) : (
                tree.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    selectedPath={selectedPath}
                    onSelect={handleSelectFile}
                    onDelete={handleDelete}
                    onRename={handleRenameRequest}
                    depth={0}
                    typeFilter={typeFilter}
                    searchQuery={searchQuery}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom stats bar */}
        {stats && (
          <div className="px-3 py-2 border-t border-border shrink-0 flex items-center justify-between text-[10px] text-text-muted">
            <span>
              {stats.totalFiles} files / {stats.totalFolders} folders
            </span>
            <span>{formatBytes(stats.totalSize)}</span>
          </div>
        )}
      </div>

      {/* ═══ Middle Panel — Editor ═══ */}
      <div className="flex-1 min-w-0 flex flex-col h-full bg-surface">
        {/* Editor header */}
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[12px] text-text-muted min-w-0">
            {breadcrumbs.length === 0 ? (
              <span className="text-text-muted italic">No file selected</span>
            ) : (
              breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3 h-3 shrink-0 text-border" />}
                  <span
                    className={
                      i === breadcrumbs.length - 1
                        ? 'text-text font-medium'
                        : 'text-text-muted hover:text-text-secondary cursor-default'
                    }
                  >
                    {crumb}
                  </span>
                </span>
              ))
            )}
            {selectedNode?.frontmatter?.type && (
              <>
                <span className="text-border mx-1">|</span>
                {(() => {
                  const m = TYPE_META[selectedNode.frontmatter.type as MemoryType]
                  return m ? (
                    <span
                      className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${m.bg} ${m.color}`}
                    >
                      <m.icon className="w-2.5 h-2.5" />
                      {m.label}
                    </span>
                  ) : null
                })()}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {dirty && (
              <span className="w-2 h-2 rounded-full bg-accent shrink-0 animate-pulse" title="Unsaved changes" />
            )}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="btn-primary btn-sm"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <kbd className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border hidden sm:block">
              Cmd+S
            </kbd>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 min-h-0 p-3">
          {!selectedPath ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-xs">
                <Brain className="w-12 h-12 text-text-muted mx-auto opacity-40" />
                <p className="text-text-secondary text-base font-medium">Select a memory file</p>
                <p className="text-text-muted text-[12px] leading-relaxed">
                  Browse the file tree on the left, or use search (Cmd+K) to find memories across
                  all folders.
                </p>
                <div className="flex flex-wrap gap-2 justify-center pt-2">
                  {MEMORY_TYPES.map((type) => {
                    const m = TYPE_META[type]
                    return (
                      <button
                        key={type}
                        onClick={() => setTypeFilter(type)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium ${m.bg} ${m.color} hover:opacity-80 transition-opacity`}
                      >
                        <m.icon className="w-3 h-3" />
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : fileLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="input h-full p-4 rounded-xl font-mono text-[13px] resize-none leading-relaxed"
              spellCheck={false}
              placeholder="Start writing..."
            />
          )}
        </div>
      </div>

      {/* ═══ Right Panel — Info / Stats ═══ */}
      <div className="w-[260px] min-w-[260px] border-l border-border bg-surface flex flex-col h-full">
        {/* Panel tabs */}
        <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1">
          <button
            onClick={() => setRightPanel('info')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
              rightPanel === 'info'
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface-2'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Info
          </button>
          <button
            onClick={() => setRightPanel('stats')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
              rightPanel === 'stats'
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface-2'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Stats
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-3">
          {rightPanel === 'stats' ? (
            <StatsPanel stats={stats} />
          ) : (
            <InfoSidebar filePath={selectedPath} content={content} node={selectedNode} />
          )}
        </div>
      </div>

      {/* ═══ Rename Dialog ═══ */}
      {renamingPath && (
        <RenameDialog
          currentPath={renamingPath.path}
          isDir={renamingPath.isDir}
          onSubmit={handleRename}
          onCancel={() => setRenamingPath(null)}
        />
      )}

      {/* ═══ Delete Confirmation Dialog ═══ */}
      {deletingTarget && (
        <DeleteConfirmDialog
          path={deletingTarget.path}
          isDir={deletingTarget.isDir}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => !deleteBusy && setDeletingTarget(null)}
        />
      )}

      {/* ═══ Semantic Search (vector RAG) ═══ */}
      {semanticOpen && <SemanticSearchModal onClose={() => setSemanticOpen(false)} />}
    </div>
  )
}

// ── Semantic Search Modal (Pillar 2 vector RAG) ───────────────────────────────
// Self-contained: own query/results/stats state, calls the /intelligence/* route.
// Does not touch the page's text-search / tree / editor state.
function SemanticSearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<IntelHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [stats, setStats] = useState<{ total: number; store: string } | null>(null)
  const [reindexing, setReindexing] = useState(false)

  useEffect(() => {
    getIntelligenceStats().then((s) => setStats({ total: s.total, store: s.store }))
      .catch((e) => console.error('[intelligence-stats]', e instanceof Error ? e.message : e))
  }, [])

  const run = async () => {
    if (!q.trim()) return
    setLoading(true)
    setErr(null)
    try {
      const res = await searchIntelligence(q.trim(), { k: 10 })
      setResults(res.results)
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const reindex = async () => {
    setReindexing(true)
    try {
      await runScheduleNow('sys-intel-reindex')
      toast('success', 'Reindex queued — embeds changed files into the vector store')
    } catch (x) {
      toast('error', x instanceof Error ? x.message : 'Failed to start reindex')
    } finally {
      setReindexing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="semantic-search-title"
        className="w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-pop flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span id="semantic-search-title" className="text-sm font-bold">Semantic search</span>
          <span className="text-xs text-text-muted">
            {stats ? `${stats.total.toLocaleString()} chunks · ${stats.store}` : 'vector RAG over the brain'}
          </span>
          <button
            onClick={reindex}
            disabled={reindexing}
            title="Re-embed changed memory into the vector store"
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-surface-2 border border-border text-text-muted hover:text-text disabled:opacity-50"
          >
            {reindexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Reindex
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') run(); if (e.key === 'Escape') onClose() }}
              placeholder="Ask the brain by meaning, e.g. 'shopify metafield binding'…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="flex items-center justify-center h-24 text-text-muted"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…</div>}
          {err && <div className="text-red text-xs"><AlertTriangle className="w-4 h-4 inline mr-1" />{err}</div>}
          {!loading && !err && results !== null && results.length === 0 && (
            <p className="text-xs text-text-muted text-center py-8">No semantic matches.</p>
          )}
          {!loading && !err && results === null && (
            <p className="text-xs text-text-muted text-center py-8">Type a query and press Enter — this matches by meaning, not keywords.</p>
          )}
          {!loading && results && results.length > 0 && (
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className="bg-surface-2 rounded-xl border border-border-subtle p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold text-accent tabular-nums">{r.score.toFixed(3)}</span>
                    <span className="text-[9px] text-text-muted px-1.5 py-0.5 rounded bg-surface border border-border">{r.source_type}</span>
                    <span className="text-[11px] font-semibold truncate">{r.heading_path || r.title || r.source_ref}</span>
                  </div>
                  <p className="text-[11px] text-text-muted line-clamp-3 whitespace-pre-wrap">{r.text.slice(0, 280)}</p>
                  <p className="text-[9px] text-text-muted font-mono mt-1 truncate">{r.source_ref}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Delete Confirmation Dialog ────────────────────────────────────────────────

function DeleteConfirmDialog({
  path,
  isDir,
  busy,
  onConfirm,
  onCancel,
}: {
  path: string
  isDir: boolean
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const fileName = path.split('/').pop() || path
  const requiredText = 'delete'
  const canConfirm = confirmText.toLowerCase().trim() === requiredText

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
      if (e.key === 'Enter' && canConfirm && !busy) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canConfirm, busy, onCancel, onConfirm])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="w-full max-w-md bg-surface rounded-2xl border border-red/30 shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-start gap-4 border-b border-border bg-gradient-to-br from-red/5 to-transparent">
          <div className="w-12 h-12 rounded-xl bg-red/10 ring-1 ring-red/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-red" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 id="delete-title" className="text-base font-bold text-text">
              Delete {isDir ? 'folder' : 'file'}?
            </h3>
            <p className="text-[12px] text-text-muted mt-1 leading-relaxed">
              This action cannot be undone. The {isDir ? 'folder' : 'file'} will be permanently removed from disk.
            </p>
          </div>
        </div>

        {/* Target info */}
        <div className="px-5 py-4 space-y-3">
          <div className="bg-surface-2 rounded-lg px-3.5 py-3 border border-border/60">
            <div className="flex items-center gap-2 mb-1">
              {isDir ? (
                <Folder className="w-4 h-4 text-amber shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-text-muted shrink-0" />
              )}
              <span className="text-[13px] font-semibold text-text truncate">{fileName}</span>
            </div>
            <p className="text-[10px] text-text-muted font-mono truncate pl-6">{path}</p>
          </div>

          {isDir && (
            <div className="flex items-start gap-2 text-[11px] text-amber bg-amber-muted rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Folder must be empty. Delete all files inside first.</span>
            </div>
          )}

          {/* Confirmation input */}
          <div>
            <label className="text-[11px] text-text-muted block mb-1.5">
              Type <span className="font-mono font-bold text-red bg-red/10 px-1.5 py-0.5 rounded">{requiredText}</span> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={busy}
              autoFocus
              placeholder={requiredText}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red/50 focus:ring-2 focus:ring-red/10 placeholder:text-text-muted disabled:opacity-50"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-border bg-surface-2/30 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-text-secondary hover:text-text hover:bg-surface-2 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || busy}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-red text-white hover:bg-red/90 disabled:bg-red/30 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shadow-soft"
          >
            {busy ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Delete {isDir ? 'folder' : 'file'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
