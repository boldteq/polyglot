import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  History,
  Search,
  X,
  FileText,
  FilePlus,
  FileX,
  FolderPlus,
  FolderMinus,
  ArrowRightLeft,
  Pencil,
  Plus,
  Minus,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Clock,
  BarChart3,
  Flame,
  Trash2,
  Filter,
  Brain,
} from 'lucide-react'
import type {
  MemoryLogEntry,
  MemoryHistoryStats,
  DiffHunk,
} from '../lib/api'
import {
  getMemoryHistory,
  getMemoryHistoryStats,
  clearMemoryHistory,
} from '../lib/api'
import { toast } from '../components/Toast'
import { ErrorState } from '../components/ErrorState'
import { PageShell } from '../components/PageShell'
import { confirmDialog } from '../lib/confirm'

// ── Constants ─────────────────────────────────────────────────────────────────

type ActionType = MemoryLogEntry['action']

const ACTION_META: Record<
  ActionType,
  { label: string; icon: typeof FileText; color: string; bg: string }
> = {
  create: { label: 'Created', icon: FilePlus, color: 'text-green', bg: 'bg-green-muted' },
  update: { label: 'Updated', icon: Pencil, color: 'text-accent', bg: 'bg-accent-muted' },
  delete: { label: 'Deleted', icon: FileX, color: 'text-red', bg: 'bg-red-muted' },
  move: { label: 'Moved', icon: ArrowRightLeft, color: 'text-amber', bg: 'bg-amber-muted' },
  create_folder: {
    label: 'Folder Created',
    icon: FolderPlus,
    color: 'text-green',
    bg: 'bg-green-muted',
  },
  delete_folder: {
    label: 'Folder Deleted',
    icon: FolderMinus,
    color: 'text-red',
    bg: 'bg-red-muted',
  },
}

const ALL_ACTIONS: ActionType[] = [
  'create',
  'update',
  'delete',
  'move',
  'create_folder',
  'delete_folder',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatFullTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function groupByDate(entries: MemoryLogEntry[]): Map<string, MemoryLogEntry[]> {
  const groups = new Map<string, MemoryLogEntry[]>()
  for (const entry of entries) {
    const d = new Date(entry.timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    let key: string
    if (d.toDateString() === today.toDateString()) {
      key = 'Today'
    } else if (d.toDateString() === yesterday.toDateString()) {
      key = 'Yesterday'
    } else {
      key = d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    }
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(entry)
  }
  return groups
}

// ── Diff Viewer ───────────────────────────────────────────────────────────────

function DiffViewer({ hunks }: { hunks: DiffHunk[] }) {
  if (!hunks || hunks.length === 0) {
    return (
      <p className="text-[12px] text-text-muted italic px-3 py-2">No line-level changes</p>
    )
  }

  return (
    <div className="font-mono text-[12px] leading-relaxed overflow-x-auto">
      {hunks.map((hunk, i) => (
        <div key={i} className="border-b border-border/50 last:border-0">
          <div className="px-3 py-1 bg-surface-2 text-[10px] text-text-muted font-semibold">
            Line {hunk.line}
          </div>
          {hunk.removed.map((line, j) => (
            <div
              key={`r-${j}`}
              className="flex items-start gap-2 px-3 py-0.5 bg-red-muted/50"
            >
              <Minus className="w-3 h-3 text-red shrink-0 mt-0.5" />
              <span className="text-red whitespace-pre-wrap break-all">
                {line || '\u00A0'}
              </span>
            </div>
          ))}
          {hunk.added.map((line, j) => (
            <div
              key={`a-${j}`}
              className="flex items-start gap-2 px-3 py-0.5 bg-green-muted/50"
            >
              <Plus className="w-3 h-3 text-green shrink-0 mt-0.5" />
              <span className="text-green whitespace-pre-wrap break-all">
                {line || '\u00A0'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Deleted Content Viewer ────────────────────────────────────────────────────

function SnapshotViewer({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = content.split('\n')
  const preview = expanded ? lines : lines.slice(0, 20)

  return (
    <div className="font-mono text-[12px] leading-relaxed overflow-x-auto">
      <div className="px-3 py-1.5 bg-surface-2 text-[10px] text-text-muted font-semibold flex items-center justify-between">
        <span>Deleted content snapshot ({lines.length} lines)</span>
      </div>
      {preview.map((line, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-3 py-0.5 bg-red-muted/30"
        >
          <span className="text-[10px] text-text-muted w-5 text-right shrink-0 select-none">
            {i + 1}
          </span>
          <span className="text-text-secondary whitespace-pre-wrap break-all">
            {line || '\u00A0'}
          </span>
        </div>
      ))}
      {lines.length > 20 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-1.5 text-[11px] text-accent hover:bg-accent-muted transition-colors text-center font-medium"
        >
          {expanded ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  )
}

// ── Log Entry Card ────────────────────────────────────────────────────────────

function LogEntryCard({ entry }: { entry: MemoryLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const meta = ACTION_META[entry.action]
  const Icon = meta.icon
  const hasDiff = entry.diff && entry.diff.length > 0
  const hasSnapshot = entry.action === 'delete' && entry.contentSnapshot
  const isExpandable = hasDiff || hasSnapshot

  return (
    <div className="group border border-border rounded-xl overflow-hidden hover:border-border-subtle transition-colors bg-surface">
      {/* Header */}
      <button
        onClick={() => isExpandable && setExpanded(!expanded)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
          isExpandable ? 'hover:bg-surface-2/50 cursor-pointer' : 'cursor-default'
        }`}
      >
        {/* Action icon */}
        <div className={`shrink-0 p-1.5 rounded-lg ${meta.bg} mt-0.5`}>
          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[12px] font-semibold ${meta.color}`}>{meta.label}</span>
            <span className="text-[12px] text-text font-medium truncate max-w-[300px]">
              {entry.path}
            </span>
            {entry.action === 'move' && entry.fromPath && (
              <span className="text-[11px] text-text-muted flex items-center gap-1">
                <ArrowRightLeft className="w-3 h-3" />
                from {entry.fromPath}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-[11px] text-text-muted flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimestamp(entry.timestamp)}
            </span>
            {(entry.linesAdded > 0 || entry.linesRemoved > 0) && (
              <span className="text-[11px] flex items-center gap-1.5">
                {entry.linesAdded > 0 && (
                  <span className="text-green font-medium">+{entry.linesAdded}</span>
                )}
                {entry.linesRemoved > 0 && (
                  <span className="text-red font-medium">-{entry.linesRemoved}</span>
                )}
              </span>
            )}
            {entry.sizeBefore !== undefined && entry.sizeAfter !== undefined && (
              <span className="text-[10px] text-text-muted">
                {formatBytes(entry.sizeBefore)} → {formatBytes(entry.sizeAfter)}
              </span>
            )}
            {entry.frontmatter?.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-2 text-text-muted capitalize">
                {entry.frontmatter.type}
              </span>
            )}
            {entry.frontmatter?.name && (
              <span className="text-[10px] text-text-muted italic truncate max-w-[200px]">
                {entry.frontmatter.name}
              </span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        {isExpandable && (
          <div className="shrink-0 mt-1">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-text-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-muted" />
            )}
          </div>
        )}
      </button>

      {/* Expanded diff / snapshot */}
      {expanded && (
        <div className="border-t border-border">
          {hasDiff && <DiffViewer hunks={entry.diff!} />}
          {hasSnapshot && <SnapshotViewer content={entry.contentSnapshot!} />}
        </div>
      )}
    </div>
  )
}

// ── Stats Panel ───────────────────────────────────────────────────────────────

function HistoryStatsPanel({ stats }: { stats: MemoryHistoryStats | null }) {
  if (!stats || stats.totalEntries === 0) {
    return (
      <div className="text-center py-8">
        <History className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
        <p className="text-[13px] text-text-muted">No history yet</p>
        <p className="text-[11px] text-text-muted mt-1">
          Changes will be tracked as you edit memory files
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Overview */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <History className="w-4 h-4 mx-auto mb-1 text-accent" />
          <p className="text-lg font-bold text-text">{stats.totalEntries}</p>
          <p className="text-[10px] text-text-muted ">Changes</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <Plus className="w-4 h-4 mx-auto mb-1 text-green" />
          <p className="text-lg font-bold text-green">{stats.totalAdded}</p>
          <p className="text-[10px] text-text-muted ">Added</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <Minus className="w-4 h-4 mx-auto mb-1 text-red" />
          <p className="text-lg font-bold text-red">{stats.totalRemoved}</p>
          <p className="text-[10px] text-text-muted ">Removed</p>
        </div>
      </div>

      {/* Action breakdown */}
      <div>
        <p className="text-[10px] font-semibold text-text-muted mb-2">
          By Action
        </p>
        <div className="space-y-1.5">
          {Object.entries(stats.actionCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([action, count]) => {
              const meta = ACTION_META[action as ActionType]
              if (!meta) return null
              const pct =
                stats.totalEntries > 0 ? Math.round((count / stats.totalEntries) * 100) : 0
              return (
                <div key={action} className="flex items-center gap-2">
                  <meta.icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  <span className={`text-[11px] font-medium w-16 ${meta.color}`}>
                    {meta.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${meta.color.replace('text-', 'bg-')}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-text-muted w-8 text-right">{count}</span>
                </div>
              )
            })}
        </div>
      </div>

      {/* Hot files */}
      {stats.hotFiles.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted mb-2 flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber" />
            Most Changed
          </p>
          <div className="space-y-1">
            {stats.hotFiles.map((f) => (
              <div
                key={f.path}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <span className="text-[11px] text-text-secondary truncate flex-1 mr-2">
                  {f.path}
                </span>
                <span className="text-[11px] text-text-muted font-medium shrink-0">
                  {f.changes}x
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time range */}
      {stats.firstEntry && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted mb-2">
            Time Range
          </p>
          <div className="bg-surface-2 rounded-xl p-3 space-y-1">
            <p className="text-[11px] text-text-secondary">
              <span className="text-text-muted">First:</span>{' '}
              {formatFullTimestamp(stats.firstEntry)}
            </p>
            {stats.lastEntry && (
              <p className="text-[11px] text-text-secondary">
                <span className="text-text-muted">Last:</span>{' '}
                {formatFullTimestamp(stats.lastEntry)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Daily activity - last 14 days */}
      {Object.keys(stats.dailyCounts).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted mb-2">
            Daily Activity
          </p>
          <div className="space-y-0.5">
            {Object.entries(stats.dailyCounts)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .slice(0, 14)
              .map(([day, count]) => {
                const max = Math.max(...Object.values(stats.dailyCounts))
                const pct = max > 0 ? Math.round((count / max) * 100) : 0
                return (
                  <div key={day} className="flex items-center gap-2">
                    <span className="text-[10px] text-text-muted w-16 shrink-0">
                      {new Date(day + 'T00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-text-muted w-6 text-right">{count}</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30

export default function MemoryHistory() {
  // Data
  const [entries, setEntries] = useState<MemoryLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stats, setStats] = useState<MemoryHistoryStats | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  // Right panel
  const [rightPanel, setRightPanel] = useState<'stats' | 'detail'>('stats')
  const [selectedEntry, setSelectedEntry] = useState<MemoryLogEntry | null>(null)

  // ── Load data ─────────────────────────────────────────────────────────────

  const loadEntries = useCallback(
    async (newOffset = 0) => {
      setLoading(true)
      setLoadError(null)
      try {
        const params: Record<string, string | number> = {
          limit: PAGE_SIZE,
          offset: newOffset,
        }
        if (actionFilter) params.action = actionFilter
        if (searchQuery.trim()) params.q = searchQuery.trim()
        const data = await getMemoryHistory(params as never)
        setEntries(data.entries)
        setTotal(data.total)
        setOffset(newOffset)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load history')
        toast('error', err instanceof Error ? err.message : 'Failed to load history')
      } finally {
        setLoading(false)
      }
    },
    [actionFilter, searchQuery],
  )

  const loadStats = useCallback(async () => {
    try {
      const data = await getMemoryHistoryStats()
      setStats(data)
    } catch (e) {
      console.error('[memory-history-stats]', e instanceof Error ? e.message : e)
    }
  }, [])

  useEffect(() => {
    loadEntries(0)
    loadStats()
  }, [loadEntries, loadStats])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleClearHistory = async () => {
    if (!(await confirmDialog({ title: 'Clear all memory history?', message: 'This cannot be undone.', danger: true, confirmLabel: 'Clear all' }))) return
    try {
      await clearMemoryHistory()
      toast('success', 'History cleared')
      loadEntries(0)
      loadStats()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to clear')
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  // ── Group entries by date ─────────────────────────────────────────────────

  const dateGroups = groupByDate(entries)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell
      title="Memory History"
      subtitle="Audit log of all memory changes with diffs"
      fullHeight
      noPadding
      actions={
        <>
          <Link to="/memory" className="btn-secondary btn-sm">
            <Brain className="w-3.5 h-3.5" />
            Memory Brain
          </Link>
          {total > 0 && (
            <button
              onClick={handleClearHistory}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red hover:bg-red-muted rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </>
      }
    >
    <div className="flex h-full overflow-hidden">
      {/* ═══ Main Content ═══ */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {/* Search + Filters */}
        <div className="px-6 py-4 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadEntries(0)}
                placeholder="Search file paths, names..."
                className="input pl-9 pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    // trigger reload on next effect
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium rounded-lg border transition-colors ${
                showFilters || actionFilter
                  ? 'bg-accent-muted text-accent border-accent/30'
                  : 'bg-surface-2 text-text-secondary border-border hover:text-text'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {actionFilter && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </button>
          </div>

          {/* Filter pills */}
          {showFilters && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <button
                onClick={() => setActionFilter('')}
                aria-pressed={!actionFilter}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                  !actionFilter
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-muted hover:text-text hover:bg-surface-2'
                }`}
              >
                All
              </button>
              {ALL_ACTIONS.map((action) => {
                const meta = ACTION_META[action]
                const isActive = actionFilter === action
                return (
                  <button
                    key={action}
                    onClick={() => setActionFilter(isActive ? '' : action)}
                    aria-pressed={isActive}
                    className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                      isActive
                        ? `${meta.bg} ${meta.color}`
                        : 'text-text-muted hover:text-text hover:bg-surface-2'
                    }`}
                  >
                    <meta.icon className="w-3 h-3" />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <ErrorState message={loadError} onRetry={() => loadEntries(offset)} className="py-20" />
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center space-y-3">
                <History className="w-12 h-12 text-text-muted mx-auto opacity-30" />
                <p className="text-base text-text-secondary font-medium">
                  {searchQuery || actionFilter ? 'No matching entries' : 'No history yet'}
                </p>
                <p className="text-[12px] text-text-muted max-w-sm">
                  {searchQuery || actionFilter
                    ? 'Try adjusting your search or filters.'
                    : 'Every time you create, edit, delete, or rename a memory file, the change will be recorded here with a full diff.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-6 py-4 space-y-6">
              {/* Summary bar */}
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-text-muted">
                  {total} change{total !== 1 ? 's' : ''} total
                  {actionFilter && (
                    <span>
                      {' '}
                      · filtered by{' '}
                      <span className={ACTION_META[actionFilter as ActionType]?.color}>
                        {ACTION_META[actionFilter as ActionType]?.label}
                      </span>
                    </span>
                  )}
                </span>
              </div>

              {/* Grouped timeline */}
              {Array.from(dateGroups.entries()).map(([dateLabel, groupEntries]) => (
                <div key={dateLabel}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-semibold text-text-muted px-2">
                      {dateLabel}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-2">
                    {groupEntries.map((entry) => (
                      <div
                        key={entry.id}
                        onClick={() => {
                          setSelectedEntry(entry)
                          setRightPanel('detail')
                        }}
                        className={`cursor-pointer ${
                          selectedEntry?.id === entry.id ? 'ring-2 ring-accent/40 rounded-xl' : ''
                        }`}
                      >
                        <LogEntryCard entry={entry} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <button
                    onClick={() => loadEntries(Math.max(0, offset - PAGE_SIZE))}
                    disabled={offset === 0}
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium bg-surface-2 rounded-lg hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Prev
                  </button>
                  <span className="text-[12px] text-text-muted px-3">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => loadEntries(offset + PAGE_SIZE)}
                    disabled={offset + PAGE_SIZE >= total}
                    className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium bg-surface-2 rounded-lg hover:bg-surface-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Right Panel ═══ */}
      <aside className="w-[280px] min-w-[280px] border-l border-border bg-surface flex flex-col h-full">
        {/* Panel tabs */}
        <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1">
          <button
            onClick={() => setRightPanel('stats')}
            aria-pressed={rightPanel === 'stats'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
              rightPanel === 'stats'
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface-2'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Overview
          </button>
          <button
            onClick={() => setRightPanel('detail')}
            aria-pressed={rightPanel === 'detail'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
              rightPanel === 'detail'
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text hover:bg-surface-2'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Detail
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-3">
          {rightPanel === 'stats' ? (
            <HistoryStatsPanel stats={stats} />
          ) : selectedEntry ? (
            <div className="space-y-4">
              {/* Entry detail */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted mb-2">
                  Change Detail
                </p>
                <div className="bg-surface-2 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const meta = ACTION_META[selectedEntry.action]
                      return (
                        <>
                          <div className={`p-1 rounded-md ${meta.bg}`}>
                            <meta.icon className={`w-3 h-3 ${meta.color}`} />
                          </div>
                          <span className={`text-[12px] font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                        </>
                      )
                    })()}
                  </div>
                  <p className="text-[12px] text-text font-mono break-all">
                    {selectedEntry.path}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {formatFullTimestamp(selectedEntry.timestamp)}
                  </p>
                </div>
              </div>

              {/* Metrics */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted mb-2">
                  Changes
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-muted rounded-lg p-2.5 text-center">
                    <p className="text-base font-bold text-green">
                      +{selectedEntry.linesAdded}
                    </p>
                    <p className="text-[10px] text-text-muted">Lines added</p>
                  </div>
                  <div className="bg-red-muted rounded-lg p-2.5 text-center">
                    <p className="text-base font-bold text-red">
                      -{selectedEntry.linesRemoved}
                    </p>
                    <p className="text-[10px] text-text-muted">Lines removed</p>
                  </div>
                </div>
              </div>

              {/* Size info */}
              {(selectedEntry.sizeBefore !== undefined ||
                selectedEntry.sizeAfter !== undefined) && (
                <div>
                  <p className="text-[10px] font-semibold text-text-muted mb-2">
                    File Size
                  </p>
                  <div className="bg-surface-2 rounded-xl p-3 space-y-1">
                    {selectedEntry.sizeBefore !== undefined && (
                      <p className="text-[11px] text-text-secondary">
                        <span className="text-text-muted">Before:</span>{' '}
                        {formatBytes(selectedEntry.sizeBefore)}
                      </p>
                    )}
                    {selectedEntry.sizeAfter !== undefined && (
                      <p className="text-[11px] text-text-secondary">
                        <span className="text-text-muted">After:</span>{' '}
                        {formatBytes(selectedEntry.sizeAfter)}
                      </p>
                    )}
                    {selectedEntry.sizeBefore !== undefined &&
                      selectedEntry.sizeAfter !== undefined && (
                        <p className="text-[11px] font-medium text-text">
                          <span className="text-text-muted">Delta:</span>{' '}
                          <span
                            className={
                              selectedEntry.sizeAfter > selectedEntry.sizeBefore
                                ? 'text-green'
                                : selectedEntry.sizeAfter < selectedEntry.sizeBefore
                                  ? 'text-red'
                                  : 'text-text-muted'
                            }
                          >
                            {selectedEntry.sizeAfter > selectedEntry.sizeBefore ? '+' : ''}
                            {formatBytes(
                              selectedEntry.sizeAfter - selectedEntry.sizeBefore,
                            )}
                          </span>
                        </p>
                      )}
                  </div>
                </div>
              )}

              {/* Frontmatter */}
              {selectedEntry.frontmatter &&
                Object.keys(selectedEntry.frontmatter).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-text-muted mb-2">
                      Metadata
                    </p>
                    <div className="bg-surface-2 rounded-xl p-3 space-y-1">
                      {Object.entries(selectedEntry.frontmatter).map(([k, v]) => (
                        <p key={k} className="text-[11px]">
                          <span className="text-text-muted">{k}:</span>{' '}
                          <span className="text-text-secondary">{v}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}

              {/* Move info */}
              {selectedEntry.action === 'move' && (
                <div>
                  <p className="text-[10px] font-semibold text-text-muted mb-2">
                    Move Details
                  </p>
                  <div className="bg-surface-2 rounded-xl p-3 space-y-1">
                    <p className="text-[11px]">
                      <span className="text-text-muted">From:</span>{' '}
                      <span className="text-text-secondary font-mono">
                        {selectedEntry.fromPath}
                      </span>
                    </p>
                    <p className="text-[11px]">
                      <span className="text-text-muted">To:</span>{' '}
                      <span className="text-text-secondary font-mono">
                        {selectedEntry.toPath}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* Link to file in memory brain */}
              {selectedEntry.action !== 'delete' &&
                selectedEntry.action !== 'delete_folder' && (
                  <Link
                    to="/memory"
                    className="flex items-center justify-center gap-1.5 w-full py-2 text-[12px] font-medium text-accent bg-accent-muted rounded-lg hover:bg-accent/20 transition-colors"
                  >
                    <Brain className="w-3.5 h-3.5" />
                    Open in Memory Brain
                  </Link>
                )}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-[12px] text-text-muted">
                Click an entry to see details
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
    </PageShell>
  )
}
