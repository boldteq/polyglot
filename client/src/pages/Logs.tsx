import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  RefreshCw,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Loader,
  ClipboardList,
  Wifi,
  WifiOff,
  Bell,
  BellOff,
  Search,
  Zap,
  MoreHorizontal,
} from 'lucide-react'
import {
  getErrorLog,
  resolveErrorLog,
  clearErrorLog,
  resolveAllErrorLog,
  runLogSelftest,
  subscribeLogStream,
  type ErrorLogEntry,
} from '../lib/api'
import { toast } from '../components/Toast'
import { PageShell } from '../components/PageShell'
import { confirmDialog } from '../lib/confirm'

// ── Source metadata ──────────────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; color: string }> = {
  server:   { label: 'Server',   color: 'bg-red/15 text-red border-red/25' },
  client:   { label: 'Client',   color: 'bg-orange/15 text-orange border-orange/25' },
  schedule: { label: 'Schedule', color: 'bg-blue/15 text-blue border-blue/25' },
  db:       { label: 'Database', color: 'bg-purple/15 text-purple border-purple/25' },
  backup:   { label: 'Backup',   color: 'bg-amber/15 text-amber border-amber/25' },
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  http:        { label: 'HTTP',        color: 'bg-sky/15 text-sky border-sky/25' },
  db:          { label: 'DB',          color: 'bg-purple/15 text-purple border-purple/25' },
  schedule:    { label: 'Schedule',    color: 'bg-blue/15 text-blue border-blue/25' },
  'agent-run': { label: 'Agent Run',   color: 'bg-fuchsia/15 text-fuchsia border-fuchsia/25' },
  integration: { label: 'Integration', color: 'bg-cyan/15 text-cyan border-cyan/25' },
  render:      { label: 'Render',      color: 'bg-rose/15 text-rose border-rose/25' },
  sse:         { label: 'SSE',         color: 'bg-teal/15 text-teal border-teal/25' },
  api:         { label: 'API',         color: 'bg-indigo/15 text-indigo border-indigo/25' },
  runtime:     { label: 'Runtime',     color: 'bg-red/15 text-red border-red/25' },
  console:     { label: 'Console',     color: 'bg-zinc/15 text-zinc border-zinc/25' },
  validation:  { label: 'Validation',  color: 'bg-yellow/15 text-yellow border-yellow/25' },
  startup:     { label: 'Startup',     color: 'bg-emerald/15 text-emerald border-emerald/25' },
  backup:      { label: 'Backup',      color: 'bg-amber/15 text-amber border-amber/25' },
  orchestration:{ label: 'Orchestration', color: 'bg-violet/15 text-violet border-violet/25' },
  form:        { label: 'Form',        color: 'bg-pink/15 text-pink border-pink/25' },
  manual:      { label: 'Manual',      color: 'bg-slate/15 text-slate border-slate/25' },
}

const LEVEL_META: Record<string, { icon: typeof AlertCircle; color: string }> = {
  error: { icon: AlertCircle,   color: 'text-red' },
  warn:  { icon: AlertTriangle, color: 'text-amber' },
  info:  { icon: Info,          color: 'text-blue' },
  debug: { icon: Info,          color: 'text-zinc' },
}

function categoryStyle(cat?: string | null) {
  if (!cat) return 'bg-zinc/10 text-zinc border-zinc/20'
  return CATEGORY_META[cat]?.color ?? 'bg-zinc/15 text-zinc border-zinc/25'
}

function categoryLabel(cat?: string | null) {
  if (!cat) return null
  return CATEGORY_META[cat]?.label ?? cat
}

function sourceStyle(source: string) {
  return SOURCE_META[source]?.color ?? 'bg-zinc/15 text-zinc border-zinc/25'
}

function formatTs(ts: string) {
  try {
    const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z')
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
  } catch {
    return ts
  }
}

function parseContext(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function buildClaudeBlock(entry: ErrorLogEntry): string {
  const ctx = parseContext(entry.context)
  const lines = [
    `Error in Polyglot [source: ${entry.source} | ${formatTs(entry.ts)}]`,
    `Level: ${entry.level}`,
    `Message: ${entry.message}`,
  ]
  if (entry.stack) {
    lines.push('Stack:')
    entry.stack.split('\n').slice(0, 15).forEach(l => lines.push('  ' + l.trim()))
  }
  if (ctx) lines.push('Context: ' + JSON.stringify(ctx, null, 2))
  return lines.join('\n')
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([])
  const [unresolved, setUnresolved] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [live, setLive] = useState(false)
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set())
  const [clearing, setClearing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the overflow menu on outside-click (same pattern as Sidebar's ProjectSelector).
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // Refs so SSE handler always sees current filter values without reconnecting
  const sourceRef = useRef(sourceFilter)
  const levelRef = useRef(levelFilter)
  const categoryRef = useRef(categoryFilter)
  const searchRef = useRef(searchQuery)
  const showResolvedRef = useRef(showResolved)
  const notifyRef = useRef(notifyEnabled)
  useEffect(() => { sourceRef.current = sourceFilter }, [sourceFilter])
  useEffect(() => { levelRef.current = levelFilter }, [levelFilter])
  useEffect(() => { categoryRef.current = categoryFilter }, [categoryFilter])
  useEffect(() => { searchRef.current = searchQuery }, [searchQuery])
  useEffect(() => { showResolvedRef.current = showResolved }, [showResolved])
  useEffect(() => { notifyRef.current = notifyEnabled }, [notifyEnabled])

  // Debounce search input → query
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchDraft), 300)
    return () => clearTimeout(t)
  }, [searchDraft])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getErrorLog({
        limit: 500,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        level: levelFilter !== 'all' ? levelFilter : undefined,
        q: searchQuery || undefined,
        resolved: showResolved ? undefined : 0,
      })
      setEntries(res.entries)
      setUnresolved(res.unresolved)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [sourceFilter, categoryFilter, levelFilter, searchQuery, showResolved])

  // Reload when filters change
  useEffect(() => { load() }, [load])

  // SSE — single persistent connection, never reconnects on filter change
  useEffect(() => {
    const es = subscribeLogStream((ev) => {
      if (ev.type === 'ready') {
        setLive(true)
        setUnresolved(ev.unresolved)
      } else if (ev.type === 'new_error') {
        const entry = ev.entry
        // Apply current filters via refs (no stale closure)
        const passesSource = sourceRef.current === 'all' || entry.source === sourceRef.current
        const passesLevel = levelRef.current === 'all' || entry.level === levelRef.current
        const passesCategory = categoryRef.current === 'all' || entry.category === categoryRef.current
        const passesResolved = showResolvedRef.current || entry.resolved === 0
        const q = searchRef.current.toLowerCase()
        const passesSearch = !q || entry.message.toLowerCase().includes(q) || (entry.route || '').toLowerCase().includes(q)
        if (passesSource && passesLevel && passesCategory && passesResolved && passesSearch) {
          setEntries(prev => [entry, ...prev].slice(0, 500))
        }
        setUnresolved(prev => entry.resolved === 0 ? prev + 1 : prev)
        if (notifyRef.current) {
          const msg = entry.message.length > 80 ? entry.message.slice(0, 80) + '…' : entry.message
          toast('error', `[${entry.source}] ${msg}`, { duration: 6000 })
        }
      } else if (ev.type === 'resolved') {
        setEntries(prev =>
          showResolvedRef.current
            ? prev.map(e => e.id === ev.id ? { ...e, resolved: 1 } : e)
            : prev.filter(e => e.id !== ev.id)
        )
        setUnresolved(prev => Math.max(0, prev - 1))
      } else if (ev.type === 'cleared') {
        load()
      }
    })
    es.onerror = () => setLive(false)
    es.onopen = () => setLive(true)
    return () => { es.close(); setLive(false) }
  }, [load]) // only reconnect when `load` identity changes (i.e. never in practice)

  // Server already filters by source/category/level/q — no extra client-side pass needed
  const filtered = entries
  // Derive distinct categories from current entries for the chip strip
  const categoriesSeen = useMemo(() => {
    const s = new Set<string>()
    for (const e of entries) if (e.category) s.add(e.category)
    return Array.from(s).sort()
  }, [entries])

  const toggleExpand = (id: number) =>
    setExpandedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const handleResolve = async (id: number) => {
    setBusyIds(prev => new Set([...prev, id]))
    try {
      await resolveErrorLog(id)
      // SSE 'resolved' event will update entries — just update local unresolved count
      setUnresolved(prev => Math.max(0, prev - 1))
      // Optimistic: mark resolved in list now (SSE may arrive slightly later)
      setEntries(prev =>
        showResolved
          ? prev.map(e => e.id === id ? { ...e, resolved: 1 } : e)
          : prev.filter(e => e.id !== id)
      )
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to resolve')
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const handleCopy = (entry: ErrorLogEntry) => {
    navigator.clipboard.writeText(buildClaudeBlock(entry))
    toast('success', 'Copied — paste into Claude')
  }

  const handleCopyAll = () => {
    const unres = filtered.filter(e => e.resolved === 0)
    if (!unres.length) { toast('error', 'No unresolved errors'); return }
    const block = unres.map((e, i) => `--- Error ${i + 1} of ${unres.length} ---\n${buildClaudeBlock(e)}`).join('\n\n')
    navigator.clipboard.writeText(block)
    toast('success', `Copied ${unres.length} error${unres.length !== 1 ? 's' : ''} for Claude`)
  }

  const handleClear = async (all: boolean) => {
    if (!(await confirmDialog({ title: 'Delete error logs?', message: all ? 'All error logs will be permanently deleted. This cannot be undone.' : 'All resolved errors will be deleted.', danger: true, confirmLabel: 'Delete' }))) return
    setClearing(true)
    try {
      const res = await clearErrorLog(all)
      toast('success', `Deleted ${res.deleted} entr${res.deleted !== 1 ? 'ies' : 'y'}`)
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setClearing(false)
    }
  }

  const sources = ['all', 'server', 'client', 'schedule', 'db', 'backup']
  const levels = ['all', 'error', 'warn', 'info']

  const handleSelftest = async () => {
    try {
      const res = await runLogSelftest()
      toast('success', `Selftest emitted ${res.emitted} synthetic logs — watch the stream`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Selftest failed')
    }
  }

  const handleResolveAll = async () => {
    if (!(await confirmDialog({
      title: 'Resolve all visible errors?',
      message: 'Marks every unresolved error matching the current filters as resolved.',
      confirmLabel: 'Resolve all',
    }))) return
    try {
      const res = await resolveAllErrorLog({
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        level: levelFilter !== 'all' ? levelFilter : undefined,
        source: sourceFilter !== 'all' ? sourceFilter : undefined,
      })
      toast('success', `Resolved ${res.resolved} entr${res.resolved !== 1 ? 'ies' : 'y'}`)
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Resolve all failed')
    }
  }

  return (
    <PageShell
      title="Logs"
      subtitle={unresolved > 0 ? `${unresolved} unresolved — copy for Claude to fix` : 'No unresolved errors'}
      fullHeight
      actions={
        <>
          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${live ? 'text-emerald bg-emerald/10' : 'text-zinc bg-zinc/10'}`}>
            {live ? <Wifi className="w-3 h-3" aria-hidden="true" /> : <WifiOff className="w-3 h-3" aria-hidden="true" />}
            {live ? 'Live' : 'Disconnected'}
          </span>
          <button
            onClick={() => setNotifyEnabled(v => !v)}
            title={notifyEnabled ? 'Disable new-error notifications' : 'Enable new-error notifications'}
            aria-label={notifyEnabled ? 'Notifications on' : 'Notifications muted'}
            className={`p-1.5 rounded-lg transition-colors ${
              notifyEnabled ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-text-muted hover:bg-surface-2 hover:text-text'
            }`}
          >
            {notifyEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleCopyAll} className="btn-primary btn-sm">
            <ClipboardList className="w-3.5 h-3.5" />
            Copy all for Claude
          </button>
          {/* Refresh stays visible; rare/destructive actions tuck into a ⋯ menu. */}
          <div className="flex items-center gap-0.5">
            <button onClick={load} disabled={loading} title="Refresh" aria-label="Refresh"
              className="p-1.5 rounded-lg text-text-muted hover:bg-surface-2 hover:text-text transition-colors disabled:opacity-40">
              {loading ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(v => !v)} title="More actions" aria-label="More actions"
                aria-haspopup="menu" aria-expanded={menuOpen}
                className={`p-1.5 rounded-lg transition-colors ${menuOpen ? 'bg-surface-2 text-text' : 'text-text-muted hover:bg-surface-2 hover:text-text'}`}>
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full mt-1 w-48 z-50 bg-surface border border-border rounded-xl shadow-pop py-1">
                  <button role="menuitem" onClick={() => { setMenuOpen(false); handleResolveAll() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-2 hover:text-text transition-colors">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> Resolve all errors
                  </button>
                  <button role="menuitem" onClick={() => { setMenuOpen(false); handleClear(false) }} disabled={clearing}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-2 hover:text-text transition-colors disabled:opacity-40">
                    <Trash2 className="w-4 h-4 shrink-0" /> Clear resolved
                  </button>
                  <button role="menuitem" onClick={() => { setMenuOpen(false); handleSelftest() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:bg-surface-2 hover:text-text transition-colors">
                    <Zap className="w-4 h-4 shrink-0" /> Self-test pipeline
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      }
    >
      <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="px-8 pb-4 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-text-muted shrink-0" />
          {/* Source — dropdown (6 pills was too wide) */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="input w-auto capitalize"
            aria-label="Filter by source"
          >
            {sources.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All sources' : (SOURCE_META[s]?.label ?? s)}</option>
            ))}
          </select>

          {/* Level — compact segmented */}
          <div className="segmented">
            {levels.map(l => (
              <button
                key={l}
                onClick={() => setLevelFilter(l)}
                aria-pressed={levelFilter === l}
                className={`capitalize ${levelFilter === l ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}`}
              >
                {l}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowResolved(v => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showResolved
                ? 'bg-accent/10 text-accent'
                : 'bg-surface-2 text-text-muted hover:text-text'
            }`}
          >
            {showResolved && <X className="w-3 h-3" />}
            Resolved
          </button>

          <div className="relative ml-auto">
            <Search className="w-3 h-3 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 z-10" aria-hidden="true" />
            <input
              type="text"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search message / stack / route…"
              aria-label="Search error logs by message, stack, or route"
              className={`input w-56 pl-7 ${searchDraft ? 'ring-1 ring-accent/40' : ''}`}
            />
            {searchDraft && (
              <button
                onClick={() => { setSearchDraft(''); setSearchQuery('') }}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <span className="text-[10px] text-text-muted">
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'} · SSE
          </span>
        </div>

        {/* Category row (only show if any categorized entries exist) */}
        {categoriesSeen.length > 0 && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[10px] font-semibold text-text-muted ">Category</span>
            <button
              onClick={() => setCategoryFilter('all')}
              aria-pressed={categoryFilter === 'all'}
              aria-label="Filter by all categories"
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-2 text-text-muted border-border hover:text-text'
              }`}
            >
              All
            </button>
            {categoriesSeen.map(c => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                aria-pressed={categoryFilter === c}
                aria-label={`Filter by ${categoryLabel(c)}`}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                  categoryFilter === c
                    ? categoryStyle(c)
                    : 'bg-surface-2 text-text-muted border-border hover:text-text'
                }`}
              >
                {categoryLabel(c)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <Loader className="w-5 h-5 animate-spin text-text-muted" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
            <p className="text-sm text-text-muted">Failed to load error logs.</p>
            <button onClick={load} className="btn-primary btn-md">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-text-muted">
            <CheckCircle2 className="w-8 h-8 text-emerald" />
            <p className="text-sm font-medium">No errors</p>
            <p className="text-xs">{showResolved ? 'Log is empty' : 'No unresolved errors · '}{live ? 'watching live' : ''}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(entry => {
              const expanded = expandedIds.has(entry.id)
              const ctx = parseContext(entry.context)
              const isResolved = entry.resolved === 1
              const LevelIcon = LEVEL_META[entry.level]?.icon ?? AlertCircle
              const levelColor = LEVEL_META[entry.level]?.color ?? 'text-zinc'

              return (
                <div
                  key={entry.id}
                  className={`bg-surface border rounded-xl overflow-hidden transition-all ${
                    isResolved
                      ? 'border-border/30 opacity-50'
                      : entry.level === 'error'
                        ? 'border-red/20 hover:border-red/40'
                        : entry.level === 'warn'
                          ? 'border-amber/20 hover:border-amber/40'
                          : 'border-border hover:border-border/70'
                  }`}
                >
                  {/* Row */}
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    {/* Level icon */}
                    <LevelIcon className={`w-4 h-4 shrink-0 ${levelColor}`} />

                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleExpand(entry.id)}
                      className="shrink-0 text-text-muted hover:text-text transition-colors"
                      aria-label={expanded ? 'Collapse' : 'Expand error details'}
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    {/* Source badge */}
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${sourceStyle(entry.source)}`}>
                      {SOURCE_META[entry.source]?.label ?? entry.source}
                    </span>

                    {/* Category badge */}
                    {entry.category && (
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${categoryStyle(entry.category)}`}>
                        {categoryLabel(entry.category)}
                      </span>
                    )}

                    {/* Agent chip */}
                    {entry.agent_id && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-surface-2 text-text-muted border-border">
                        {entry.agent_id}
                      </span>
                    )}

                    {/* Timestamp */}
                    <span className="shrink-0 text-[10px] text-text-muted font-mono whitespace-nowrap">
                      {formatTs(entry.ts)}
                    </span>

                    {/* Route + status */}
                    {entry.route && (
                      <span className="shrink-0 text-[10px] text-text-muted font-mono truncate max-w-[180px]" title={`${entry.method || ''} ${entry.route}${entry.status ? ` → ${entry.status}` : ''}`}>
                        {entry.method ? `${entry.method} ` : ''}{entry.route}{entry.status ? ` →${entry.status}` : ''}
                      </span>
                    )}

                    {/* Duration */}
                    {entry.duration_ms != null && (
                      <span className={`shrink-0 text-[10px] font-mono ${entry.duration_ms > 1000 ? 'text-amber' : 'text-text-muted'}`}>
                        {entry.duration_ms}ms
                      </span>
                    )}

                    {/* Message */}
                    <span className="flex-1 text-xs text-text truncate font-mono" title={entry.message}>
                      {entry.message}
                    </span>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopy(entry)}
                        title="Copy for Claude"
                        className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                        aria-label="Copy error for Claude"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!isResolved && (
                        <button
                          onClick={() => handleResolve(entry.id)}
                          disabled={busyIds.has(entry.id)}
                          title="Mark resolved"
                          className="p-1.5 rounded-lg text-text-muted hover:text-emerald hover:bg-emerald/10 transition-colors disabled:opacity-40"
                          aria-label="Mark as resolved"
                        >
                          {busyIds.has(entry.id)
                            ? <Loader className="w-3.5 h-3.5 animate-spin" />
                            : <CheckCircle2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      )}
                      {isResolved && (
                        <span className="text-[10px] text-emerald font-semibold px-1.5">✓</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expanded && (
                    <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-surface-2/30">
                      {entry.stack && (
                        <div>
                          <p className="text-[10px] font-semibold text-text-muted mb-1.5">Stack Trace</p>
                          <pre className="text-[11px] text-text-secondary font-mono whitespace-pre-wrap break-all leading-relaxed bg-surface rounded-lg p-3 border border-border overflow-x-auto max-h-64">
                            {entry.stack}
                          </pre>
                        </div>
                      )}
                      {ctx && (
                        <div>
                          <p className="text-[10px] font-semibold text-text-muted mb-1.5">Context</p>
                          <pre className="text-[11px] text-text-secondary font-mono whitespace-pre-wrap bg-surface rounded-lg p-3 border border-border">
                            {JSON.stringify(ctx, null, 2)}
                          </pre>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => handleCopy(entry)} className="btn-primary btn-sm">
                          <Copy className="w-3 h-3" /> Copy for Claude
                        </button>
                        {!isResolved && (
                          <button
                            onClick={() => handleResolve(entry.id)}
                            disabled={busyIds.has(entry.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald/10 text-emerald rounded-lg hover:bg-emerald/20 transition-colors disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Mark resolved
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      </div>
    </PageShell>
  )
}
