import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Inbox, Check, X, Pencil, Loader2, AlertCircle, RefreshCw,
  Lightbulb, Bug, GitBranch, MessageSquareWarning, Sparkles, BookOpen,
  GraduationCap, Clock, ScanLine, ArrowRight, Keyboard, TrendingUp, Brain,
  Search, SearchX, User, Heart, AlertTriangle, CircleDot, TrendingDown,
  type LucideIcon,
} from 'lucide-react'
import {
  getLearningInbox, approveCandidate, rejectCandidate, editCandidate, getLearningStatus, getLearningOverview,
  bulkApproveCandidates, bulkRejectCandidates, getBrainOverview,
  type LearningCandidate, type LearningType, type InboxCounts, type LearningDigestStatus,
  type LearningOverview, type LearningDigestRun, type LearningImprovement, type BrainOverview,
} from '../lib/api'
import { useCachedApi } from '../hooks/useCachedApi'
import { CacheKeys } from '../lib/cacheKeys'
import { toast } from '../components/Toast'
import DependencyBanner from '../components/DependencyBanner'
import EmptyState from '../components/EmptyState'
import { SkeletonCards } from '../components/Skeleton'
import { TabNav } from '../components/PageShell'
import BrainPanel from '../components/BrainPanel'

type Tab = 'overview' | 'pending' | 'auto' | 'brain'
interface InboxData { items: LearningCandidate[]; counts: InboxCounts }

// Token-backed (flips light/dark). Mirrors LEARNING_TYPE_COLOR in lib/designTokens.ts.
const TYPE_META: Record<LearningType, { label: string; Icon: LucideIcon; cls: string }> = {
  lesson:        { label: 'Lesson',        Icon: Lightbulb,            cls: 'bg-blue/10 text-blue border-blue/25' },
  bug:           { label: 'Bug',           Icon: Bug,                  cls: 'bg-red/10 text-red border-red/25' },
  decision:      { label: 'Decision',      Icon: GitBranch,            cls: 'bg-purple/10 text-purple border-purple/25' },
  feedback:      { label: 'Feedback',      Icon: MessageSquareWarning, cls: 'bg-amber/10 text-amber border-amber/25' },
  golden:        { label: 'Golden',        Icon: Sparkles,             cls: 'bg-emerald/10 text-emerald border-emerald/25' },
  // Continuity-brain types — each approve is a human sign-off (identity-lock).
  identity:      { label: 'Identity',      Icon: User,                 cls: 'bg-cyan/10 text-cyan border-cyan/25' },
  preference:    { label: 'Preference',    Icon: Heart,                cls: 'bg-rose/10 text-rose border-rose/25' },
  contradiction: { label: 'Contradiction', Icon: AlertTriangle,        cls: 'bg-orange/10 text-orange border-orange/25' },
  open_loop:     { label: 'Open Loop',     Icon: CircleDot,            cls: 'bg-indigo/10 text-indigo border-indigo/25' },
  decay_review:  { label: 'Decay Review',  Icon: TrendingDown,         cls: 'bg-slate/10 text-slate border-slate/25' },
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const s = Math.round(Math.abs(diff) / 1000)
  if (s < 60) return 'just now'
  const v = s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`
  return diff < 0 ? `in ${v}` : `${v} ago`
}

const isTab = (v: string | null): v is Tab => v === 'overview' || v === 'pending' || v === 'auto' || v === 'brain'

export default function LearningInbox() {
  const [searchParams] = useSearchParams()
  // Honour a ?tab= deep-link (e.g. the Playground "Open Learning" toast lands on
  // ?tab=pending). Falls back to the overview tab.
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return isTab(t) ? t : 'overview'
  })
  const inboxStatus: string = tab === 'auto' ? 'auto' : 'pending'
  const { data, loading, refreshing, error, refetch, setData } =
    useCachedApi<InboxData>(CacheKeys.learningInbox(inboxStatus), () => getLearningInbox(inboxStatus))
  const { data: digestStatus } = useCachedApi<LearningDigestStatus>(CacheKeys.learningStatus, getLearningStatus)
  const overview = useCachedApi<LearningOverview>(CacheKeys.learningOverview, getLearningOverview)
  // Brain overview is fetched at page level so the "Brain" tab badge shows the
  // proposed-patch count even when the tab isn't active. Cached + SSE-invalidated.
  const brain = useCachedApi<BrainOverview>(CacheKeys.brainOverview, getBrainOverview)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  // Client-side triage filters (pending tab) — applied over the already-fetched
  // candidate list. No extra API calls; the bulk/keyboard/SSE layers all read the
  // FILTERED list so j/k/a/r and "select all" act on exactly what's visible.
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<LearningType | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const allItems = data?.items ?? []
  const counts = data?.counts ?? { pending: 0, approved: 0, rejected: 0, auto: 0 }
  const reviewable = tab === 'pending'

  // Distinct sources present in the current candidate list (e.g. playground:* vs
  // vscode-session). Drives the source dropdown — hidden when only one exists.
  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    for (const it of allItems) if (it.source) set.add(it.source)
    return [...set].sort()
  }, [allItems])

  // The visible list: search (title + payload text) + type + source. Filters only
  // bite on the pending tab; the auto tab shows everything read-only.
  const items = useMemo(() => {
    if (!reviewable) return allItems
    const q = query.trim().toLowerCase()
    return allItems.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (sourceFilter !== 'all' && (c.source ?? '') !== sourceFilter) return false
      if (!q) return true
      const hay = `${c.title} ${Object.values(c.payload || {}).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [allItems, reviewable, query, typeFilter, sourceFilter])

  const clearFilters = () => { setQuery(''); setTypeFilter('all'); setSourceFilter('all') }

  // Optimistically drop one or more reviewed cards + decrement the pending count.
  const dropItems = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setData((prev) => {
      if (!prev) return { items: [], counts: { pending: 0, approved: 0, rejected: 0, auto: 0 } }
      const removed = prev.items.filter((i) => idSet.has(i.id)).length
      return {
        items: prev.items.filter((i) => !idSet.has(i.id)),
        counts: { ...prev.counts, pending: Math.max(0, prev.counts.pending - removed) },
      }
    })
    setSelected((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }, [setData])

  const handleApprove = useCallback(async (c: LearningCandidate) => {
    setBusyId(c.id)
    dropItems([c.id])
    try {
      const r = await approveCandidate(c.id)
      toast('success', c.type === 'feedback' ? 'Added to feedback.md' : `Saved to memory (${r.capturedRef})`)
    } catch (err) {
      refetch() // roll back the optimistic drop
      toast('error', err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }, [dropItems, refetch])

  const handleReject = useCallback(async (c: LearningCandidate) => {
    setBusyId(c.id)
    dropItems([c.id])
    try {
      await rejectCandidate(c.id)
      toast('success', 'Rejected')
    } catch (err) {
      refetch()
      toast('error', err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }, [dropItems, refetch])

  // Bulk approve/reject the given ids (defaults to current selection).
  const handleBulkApprove = useCallback(async (ids: string[]) => {
    if (!ids.length || bulkBusy) return
    setBulkBusy(true)
    dropItems(ids)
    try {
      const r = await bulkApproveCandidates(ids)
      if (r.failed.length === 0) toast('success', `Approved ${r.approved.length} item${r.approved.length === 1 ? '' : 's'}`)
      else { toast('warn', `Approved ${r.approved.length}, ${r.failed.length} failed (stayed pending)`); refetch() }
    } catch (err) {
      refetch()
      toast('error', err instanceof Error ? err.message : 'Bulk approve failed')
    } finally {
      setBulkBusy(false)
    }
  }, [bulkBusy, dropItems, refetch])

  const handleBulkReject = useCallback(async (ids: string[]) => {
    if (!ids.length || bulkBusy) return
    setBulkBusy(true)
    dropItems(ids)
    try {
      const r = await bulkRejectCandidates(ids)
      if (r.failed.length === 0) toast('success', `Rejected ${r.rejected.length} item${r.rejected.length === 1 ? '' : 's'}`)
      else { toast('warn', `Rejected ${r.rejected.length}, ${r.failed.length} failed (refresh to retry)`); refetch() }
    } catch (err) {
      refetch()
      toast('error', err instanceof Error ? err.message : 'Bulk reject failed')
    } finally {
      setBulkBusy(false)
    }
  }, [bulkBusy, dropItems, refetch])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Stable card callbacks so memoized CandidateCard rows skip re-render when an
  // unrelated row changes. Each receives the candidate id it acts on.
  const cancelEdit = useCallback(() => setEditId(null), [])
  const onCardSaved = useCallback(() => { setEditId(null); refetch() }, [refetch])

  // Header "Select all" / "Clear" — operates on every currently-visible (filtered)
  // candidate, feeding the same `selected` Set the bulk bar reads.
  const visibleIds = useMemo(() => items.map((i) => i.id), [items])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const toggleSelectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      const all = visibleIds.length > 0 && visibleIds.every((id) => next.has(id))
      if (all) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }, [visibleIds])

  // Group pending candidates by their source session/project. Memoized so the
  // Map (and its row keys) stay stable across renders where `items` is unchanged.
  const groups = useMemo(() => {
    const m = new Map<string, { project: string; createdAt: string; items: LearningCandidate[] }>()
    for (const it of items) {
      const key = it.sessionId || 'unknown'
      const g = m.get(key) || { project: it.project || 'Unknown project', createdAt: it.createdAt, items: [] }
      g.items.push(it)
      m.set(key, g)
    }
    return m
  }, [items])

  // Keyboard layer for fast triage (pending tab only). j/k move, a/r approve/
  // reject, e edit, x select, A/R bulk-act selection, ? help, Esc clear.
  useEffect(() => {
    if (!reviewable) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (editId) return
      const idx = items.findIndex((i) => i.id === cursorId)
      const cur = idx >= 0 ? items[idx] : null
      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault(); setCursorId(items[Math.min(items.length - 1, idx < 0 ? 0 : idx + 1)]?.id ?? null); break
        case 'k': case 'ArrowUp':
          e.preventDefault(); setCursorId(items[Math.max(0, idx < 0 ? 0 : idx - 1)]?.id ?? null); break
        case 'a': if (cur) { e.preventDefault(); handleApprove(cur) } break
        case 'r': if (cur) { e.preventDefault(); handleReject(cur) } break
        case 'e': if (cur) { e.preventDefault(); setEditId(cur.id) } break
        case 'x': if (cur) { e.preventDefault(); toggleSelect(cur.id) } break
        case 'A': if (selected.size) { e.preventDefault(); handleBulkApprove([...selected]) } break
        case 'R': if (selected.size) { e.preventDefault(); handleBulkReject([...selected]) } break
        case '?': e.preventDefault(); setShowHelp((s) => !s); break
        case 'Escape': if (selected.size) { e.preventDefault(); setSelected(new Set()) } else if (showHelp) setShowHelp(false); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reviewable, items, cursorId, editId, selected, showHelp, toggleSelect, handleApprove, handleReject, handleBulkApprove, handleBulkReject])

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Inbox className="w-4.5 h-4.5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Learning Inbox</h1>
            <p className="text-[13px] text-text-secondary">Lessons your AI team found in your VS Code projects — approve to save them to memory.</p>
            {digestStatus?.lastRunAt && (
              <p className="text-[11px] text-text-muted mt-0.5">
                Last digest {relTime(digestStatus.lastRunAt)}
                {digestStatus.lastRunStatus && <> · <span className={digestStatus.lastRunStatus === 'success' ? 'text-emerald' : 'text-red'}>{digestStatus.lastRunStatus}</span></>}
                {digestStatus.lastRunSummary && ` · ${digestStatus.lastRunSummary}`}
                {digestStatus.nextRunAt && ` · next ${relTime(digestStatus.nextRunAt)}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowHelp(true)}
            className="btn-secondary btn-sm"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" /> <kbd className="text-[9px] font-mono">?</kbd>
          </button>
          <button onClick={refetch} className="btn-secondary btn-sm" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Ollama/Claude offline → approving captures to memory will fail; say so. */}
      <DependencyBanner subsystem="memory" hint="Approving saves to the memory brain, which needs Ollama running." />

      {/* Explainer */}
      <div className="flex items-start gap-2 text-[12px] text-text-muted bg-surface-2/40 border border-border rounded-lg px-3 py-2 mb-4">
        <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Each night, the <strong>Learning digest</strong> reviews the day's projects. High-confidence lessons save automatically;
          everything else — and any <strong>feedback corrections</strong> — waits here for one click. Nothing reaches your
          <code className="px-1">feedback.md</code> without your approval.
        </span>
      </div>

      {/* Tabs */}
      <TabNav
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'pending', label: 'Pending review', count: counts.pending },
          { id: 'auto', label: 'Auto-captured', count: counts.auto },
          { id: 'brain', label: 'Brain', count: brain.data?.stats.patches.proposed ?? 0 },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'overview' && <OverviewPanel ov={overview.data} loading={overview.loading} error={overview.error} onRetry={overview.refetch} />}

      {tab === 'brain' && <BrainPanel ov={brain.data} loading={brain.loading} error={brain.error} onRetry={brain.refetch} />}

      {/* States: loading → error → empty → list (3 visually distinct) */}
      {(tab === 'pending' || tab === 'auto') && (loading ? (
        <SkeletonCards count={3} />
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="w-8 h-8 text-red" />
          <div className="text-sm text-text">Couldn't load the inbox</div>
          <div className="text-xs text-text-muted max-w-sm">{error}</div>
          <button onClick={refetch} className="btn-primary btn-sm mt-1">
            Retry
          </button>
        </div>
      ) : allItems.length === 0 ? (
        <EmptyState
          icon={Check}
          title={tab === 'pending' ? 'Inbox zero' : 'Nothing auto-captured yet'}
          description={tab === 'pending'
            ? 'No learnings waiting for review. New ones appear here after the nightly digest.'
            : 'High-confidence lessons captured automatically will show up here.'}
          size="lg"
        />
      ) : (
        <div className="space-y-4">
          {/* Triage toolbar — search left, type chips + source dropdown right.
              Pending tab only; lets you narrow the candidate list client-side. */}
          {reviewable && (
            <FilterToolbar
              query={query}
              onQuery={setQuery}
              typeFilter={typeFilter}
              onType={setTypeFilter}
              sources={sourceOptions}
              sourceFilter={sourceFilter}
              onSource={setSourceFilter}
              shownCount={items.length}
              totalCount={allItems.length}
              allVisibleSelected={allVisibleSelected}
              onToggleSelectAll={toggleSelectAllVisible}
              selectedCount={selected.size}
            />
          )}

          {/* Filtered-empty: candidates exist but nothing matches the active filters. */}
          {reviewable && items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matching learnings"
              description="No candidates match your current filters. Adjust the search or filters to see more."
              action={{ label: 'Clear filters', onClick: clearFilters }}
              card
              size="md"
            />
          ) : (
          <div className="space-y-6">
          {/* Selection action bar — appears when items are checked */}
          {reviewable && selected.size > 0 && (
            <div className="sticky top-2 z-10 flex items-center gap-2 bg-accent/10 border border-accent/25 rounded-xl px-3 py-2 backdrop-blur">
              <span className="text-[12px] font-medium text-text">{selected.size} selected</span>
              <button
                onClick={() => handleBulkApprove([...selected])}
                disabled={bulkBusy}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald/15 text-emerald border border-emerald/30 rounded-lg hover:bg-emerald/25 transition-colors disabled:opacity-50"
              >
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve all
              </button>
              <button
                onClick={() => handleBulkReject([...selected])}
                disabled={bulkBusy}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-text-secondary border border-border rounded-lg hover:bg-red/10 hover:text-red transition-colors disabled:opacity-50"
              >
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Reject all
              </button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-[11px] text-text-muted hover:text-text">Clear</button>
            </div>
          )}

          {[...groups.entries()].map(([key, g]) => {
            const groupIds = g.items.map((i) => i.id)
            const allSelected = reviewable && groupIds.every((id) => selected.has(id))
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  {reviewable && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected((prev) => {
                        const next = new Set(prev)
                        if (allSelected) groupIds.forEach((id) => next.delete(id))
                        else groupIds.forEach((id) => next.add(id))
                        return next
                      })}
                      aria-label={`Select all in ${g.project}`}
                      className="accent-accent w-3.5 h-3.5 cursor-pointer"
                    />
                  )}
                  <span className="text-[13px] font-medium text-text">{g.project}</span>
                  <span className="text-[11px] text-text-muted">· {g.items.length} item{g.items.length > 1 ? 's' : ''} · {relTime(g.createdAt)}</span>
                  {reviewable && (
                    <button
                      onClick={() => handleBulkApprove(groupIds)}
                      disabled={bulkBusy}
                      className="ml-auto text-[11px] font-medium text-emerald hover:underline disabled:opacity-50"
                    >
                      Approve all ({g.items.length})
                    </button>
                  )}
                </div>
                <div className="space-y-2.5">
                  {g.items.map((c) => (
                    <CandidateCard
                      key={c.id}
                      c={c}
                      readOnly={tab === 'auto'}
                      busy={busyId === c.id}
                      editing={editId === c.id}
                      selectable={reviewable}
                      checked={selected.has(c.id)}
                      focused={cursorId === c.id}
                      onToggleSelect={toggleSelect}
                      onEdit={setEditId}
                      onCancelEdit={cancelEdit}
                      onSaved={onCardSaved}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  ))}
                </div>
              </div>
            )
          })}
          </div>
          )}
        </div>
      ))}

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// Order the type chips render in (matches the request: All / Lesson / Bug / …).
const TYPE_ORDER: LearningType[] = ['lesson', 'bug', 'decision', 'feedback', 'golden', 'identity', 'preference', 'contradiction', 'open_loop', 'decay_review']

interface ToolbarProps {
  query: string
  onQuery: (v: string) => void
  typeFilter: LearningType | 'all'
  onType: (v: LearningType | 'all') => void
  sources: string[]
  sourceFilter: string
  onSource: (v: string) => void
  shownCount: number
  totalCount: number
  allVisibleSelected: boolean
  onToggleSelectAll: () => void
  selectedCount: number
}

// Client-side triage toolbar — search (title + payload), type chips, source
// dropdown, a live filtered count, and a select-all/clear control that feeds the
// shared `selected` Set. Pure presentation over already-fetched candidates.
function FilterToolbar({
  query, onQuery, typeFilter, onType, sources, sourceFilter, onSource,
  shownCount, totalCount, allVisibleSelected, onToggleSelectAll, selectedCount,
}: ToolbarProps) {
  const filtered = shownCount !== totalCount
  return (
    <div className="card p-3 space-y-3">
      {/* Row 1: search (left) + type chips & source dropdown (right) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search learnings…"
            aria-label="Search learnings"
            className="input pl-8 py-1.5 text-[13px]"
          />
          {query && (
            <button
              onClick={() => onQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="segmented">
            <button
              onClick={() => onType('all')}
              className={`segmented-btn ${typeFilter === 'all' ? 'segmented-btn-active' : ''}`}
            >
              All
            </button>
            {TYPE_ORDER.map((t) => {
              const m = TYPE_META[t]
              const active = typeFilter === t
              return (
                <button
                  key={t}
                  onClick={() => onType(t)}
                  className={`segmented-btn ${active ? 'segmented-btn-active' : ''}`}
                  title={`Show ${m.label.toLowerCase()} only`}
                >
                  <m.Icon className="w-3 h-3" /> {m.label}
                </button>
              )
            })}
          </div>
          {sources.length > 1 && (
            <select
              value={sourceFilter}
              onChange={(e) => onSource(e.target.value)}
              aria-label="Filter by source"
              className="input w-auto py-1.5 text-[12px]"
            >
              <option value="all">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Row 2: filtered count + select-all/clear */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border-subtle">
        <span className="text-[11px] text-text-muted">
          {filtered ? <>Showing <span className="font-medium text-text-secondary">{shownCount}</span> of {totalCount}</> : <><span className="font-medium text-text-secondary">{totalCount}</span> pending</>}
          {selectedCount > 0 && <> · {selectedCount} selected</>}
        </span>
        <button
          onClick={onToggleSelectAll}
          disabled={shownCount === 0}
          className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40 disabled:no-underline"
        >
          {allVisibleSelected ? 'Clear selection' : `Select all (${shownCount})`}
        </button>
      </div>
    </div>
  )
}

// Keyboard shortcut reference modal.
function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['j / ↓', 'Move cursor down'],
    ['k / ↑', 'Move cursor up'],
    ['a', 'Approve focused item'],
    ['r', 'Reject focused item'],
    ['e', 'Edit focused item'],
    ['x', 'Toggle select focused'],
    ['Shift+A', 'Approve all selected'],
    ['Shift+R', 'Reject all selected'],
    ['Esc', 'Clear selection'],
    ['?', 'Toggle this help'],
  ]
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="kbd-help-title">
      <div className="w-full max-w-sm mx-4 rounded-2xl bg-surface border border-border shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="kbd-help-title" className="text-sm font-bold flex items-center gap-2"><Keyboard className="w-4 h-4 text-accent" /> Keyboard shortcuts</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-surface-2 text-text-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-1.5">
          {rows.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">{label}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] font-mono text-text">{k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface CardProps {
  c: LearningCandidate
  readOnly: boolean
  busy: boolean
  editing: boolean
  selectable?: boolean
  checked?: boolean
  focused?: boolean
  onToggleSelect?: (id: string) => void
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onSaved: () => void
  onApprove: (c: LearningCandidate) => void
  onReject: (c: LearningCandidate) => void
}

// Confidence tier label so the percentage isn't a color-only signal.
const confidenceTier = (pct: number) => (pct >= 80 ? 'High' : pct >= 50 ? 'Medium' : 'Low')

const CandidateCard = memo(function CandidateCard({ c, readOnly, busy, editing, selectable, checked, focused, onToggleSelect, onEdit, onCancelEdit, onSaved, onApprove, onReject }: CardProps) {
  const meta = TYPE_META[c.type] ?? TYPE_META.lesson
  const { Icon } = meta
  const pct = Math.round((c.confidence ?? 0) * 100)
  const entries = useMemo(
    () => Object.entries(c.payload || {}).filter(([, v]) => v && String(v).trim()).slice(0, 5),
    [c.payload],
  )

  if (editing) return <EditCard c={c} onCancel={onCancelEdit} onSaved={onSaved} />

  return (
    <div className={`rounded-xl border bg-surface p-3.5 transition-colors ${focused ? 'border-accent ring-1 ring-accent/30' : checked ? 'border-accent/40' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={!!checked}
            onChange={() => onToggleSelect?.(c.id)}
            aria-label={`Select ${c.title}`}
            className="accent-accent w-3.5 h-3.5 mt-1 cursor-pointer shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${meta.cls}`}>
              <Icon className="w-3 h-3" /> {meta.label}
            </span>
            <span className={`text-[10px] ${pct >= 80 ? 'text-emerald' : pct >= 50 ? 'text-text-muted' : 'text-text-muted/60'}`}>
              {confidenceTier(pct)} · {pct}% confident
            </span>
            {c.source && <span className="text-[10px] text-text-muted truncate">· {c.source}</span>}
            {c.capturedRef && <span className="text-[10px] text-text-muted truncate">· {c.capturedRef}</span>}
          </div>
          <div className="text-[13px] font-medium text-text mb-1">{c.title}</div>
          <div className="space-y-0.5">
            {entries.slice(0, 5).map(([k, v]) => (
              <div key={k} className="text-[12px] text-text-secondary">
                <span className="text-text-muted">{k}:</span> {String(v).slice(0, 220)}
              </div>
            ))}
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onApprove(c)} disabled={busy} title="Approve → save to memory"
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-emerald/10 text-emerald border border-emerald/25 rounded-lg hover:bg-emerald/20 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve
            </button>
            <button onClick={() => onEdit(c.id)} disabled={busy} title="Edit before saving"
              className="p-1.5 text-text-muted border border-border rounded-lg hover:bg-surface-2 hover:text-text transition-colors disabled:opacity-50">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onReject(c)} disabled={busy} title="Reject"
              className="p-1.5 text-text-muted border border-border rounded-lg hover:bg-red/10 hover:text-red transition-colors disabled:opacity-50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

function EditCard({ c, onCancel, onSaved }: { c: LearningCandidate; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(c.title)
  // payload values may be non-string (number/bool/null) on continuity types — the
  // edit form works in strings, so coerce on load.
  const [fields, setFields] = useState<Record<string, string>>(
    () => Object.fromEntries(Object.entries(c.payload || {}).map(([k, v]) => [k, v == null ? '' : String(v)]))
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await editCandidate(c.id, { title, payload: fields })
      toast('success', 'Updated')
      onSaved()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-accent/40 bg-surface p-3.5 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full text-[13px] font-medium bg-surface-2/50 border border-border rounded-lg px-2.5 py-1.5 text-text focus:outline-none focus:border-accent"
        placeholder="Title"
      />
      {Object.keys(fields).map((k) => (
        <div key={k}>
          <label className="text-[10px] text-text-muted">{k}</label>
          <textarea
            value={fields[k]}
            onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))}
            rows={2}
            className="w-full text-[12px] bg-surface-2/50 border border-border rounded-lg px-2.5 py-1.5 text-text-secondary focus:outline-none focus:border-accent resize-y"
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={saving}
          className="btn-primary btn-sm">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
        </button>
        <button onClick={onCancel} disabled={saving}
          className="px-2.5 py-1 text-[11px] text-text-muted border border-border rounded-lg hover:bg-surface-2 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Overview tab: the visual dashboard of the learning loop ──────────────────

function StatCard({ Icon, label, value, tone, sub, title }: { Icon: LucideIcon; label: string; value: number | string; tone: string; sub?: string; title?: string }) {
  return (
    <div className="card p-3.5" title={title}>
      <div className="flex items-center gap-1.5 text-text-muted text-[11px] mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

// "% improvement" — success rate of real (non-infra) agent runs, this 7d vs prior.
// Honest: shows "building baseline" until there's a prior week to compare.
function ImprovementCard({ imp }: { imp: LearningImprovement }) {
  let value = '—', sub = 'building baseline', tone = 'text-text-muted'
  if (imp.deltaPct !== null) {
    const up = imp.deltaPct >= 0
    value = `${up ? '+' : ''}${imp.deltaPct}%`
    sub = `${imp.prevWeekPct}% → ${imp.thisWeekPct}% success`
    tone = up ? 'text-emerald' : 'text-red'
  } else if (imp.thisWeekPct !== null) {
    value = `${imp.thisWeekPct}%`
    sub = 'success this week · baseline forming'
    tone = 'text-text'
  }
  return (
    <StatCard
      Icon={TrendingUp} label="Improvement (7d)" value={value} tone={tone} sub={sub}
      title="Success rate of your real (non-infrastructure) agent runs, this week vs the prior week. Builds a baseline over the first couple of weeks."
    />
  )
}

// Proportional bar showing where captured lessons came from.
function SourceBar({ bySource, total }: { bySource: { autoSaved: number; reviewed: number; direct: number }; total: number }) {
  const t = Math.max(1, total)
  const seg = [
    { k: 'Auto-saved', n: bySource.autoSaved, cls: 'bg-emerald/70' },
    { k: 'Reviewed', n: bySource.reviewed, cls: 'bg-blue/70' },
    { k: 'Direct', n: bySource.direct, cls: 'bg-purple/70' },
  ]
  return (
    <>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-2 mb-2">
        {seg.map((s) => s.n > 0 && <div key={s.k} className={s.cls} style={{ width: `${(s.n / t) * 100}%` }} title={`${s.k}: ${s.n}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
        {seg.map((s) => (
          <span key={s.k} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${s.cls}`} /> {s.k} <span className="text-text-secondary font-medium">{s.n}</span></span>
        ))}
      </div>
    </>
  )
}

// 8-week knowledge-growth bars (captures per week).
function WeekBars({ weekly }: { weekly: { weekStart: string; count: number }[] }) {
  const max = Math.max(1, ...weekly.map((w) => w.count))
  return (
    <div className="flex items-end gap-1.5 h-[64px]">
      {weekly.map((w) => (
        <div key={w.weekStart} className="group relative flex-1 flex flex-col justify-end">
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 whitespace-nowrap text-[10px] bg-surface border border-border rounded-md px-2 py-1 shadow-card">
            week of {w.weekStart} · {w.count} captured
          </div>
          <div className="rounded-sm bg-accent/70" style={{ height: Math.max(w.count > 0 ? 4 : 2, Math.round((w.count / max) * 56)) }} />
        </div>
      ))}
    </div>
  )
}

// Mini stacked-bar chart of recent digest runs (oldest → newest, left → right).
function RunBars({ runs }: { runs: LearningDigestRun[] }) {
  const ordered = [...runs].reverse()
  const max = Math.max(1, ...ordered.map((r) => r.captured + r.staged))
  return (
    <div className="flex items-end gap-1.5 h-[90px]">
      {ordered.map((r) => {
        const total = r.captured + r.staged
        const h = Math.max(total > 0 ? 6 : 2, Math.round((total / max) * 78))
        const capH = total > 0 ? Math.round((r.captured / total) * h) : 0
        const failed = r.status !== 'success'
        return (
          <div key={r.id} className="group relative flex-1 flex flex-col justify-end" style={{ minWidth: 6 }}>
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 whitespace-nowrap text-[10px] bg-surface border border-border rounded-md px-2 py-1 shadow-card">
              {relTime(r.timestamp)} · {failed ? 'failed' : `${r.sessions} sess → ${r.captured} captured, ${r.staged} staged`}
            </div>
            {failed ? (
              <div className="rounded-sm bg-red/60" style={{ height: 6 }} />
            ) : (
              <div className="rounded-sm overflow-hidden flex flex-col-reverse" style={{ height: h }}>
                <div className="bg-amber/70" style={{ height: h - capH }} />
                <div className="bg-emerald/80" style={{ height: capH }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface OverviewPanelProps { ov: LearningOverview | null; loading: boolean; error: string | null; onRetry: () => void }

function OverviewPanel({ ov, loading, error, onRetry }: OverviewPanelProps) {
  if (loading && !ov) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-surface-2/50 border border-border animate-pulse" />)}
      </div>
    )
  }
  if (error && !ov) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle className="w-8 h-8 text-red" />
        <div className="text-sm text-text">Couldn't load the overview</div>
        <div className="text-xs text-text-muted max-w-sm">{error}</div>
        <button onClick={onRetry} className="btn-primary btn-sm mt-1">Retry</button>
      </div>
    )
  }
  if (!ov) return null

  const s = ov.status

  return (
    <div className="space-y-5">
      {/* Stat cards — the accurate headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard Icon={GraduationCap} label="Lessons learned" value={ov.captured.total} tone="text-emerald"
          sub={ov.captured.last7d > 0 ? `+${ov.captured.last7d} this week` : 'all-time captured'} />
        <ImprovementCard imp={ov.improvement} />
        <StatCard Icon={Inbox} label="Pending review" value={ov.counts.pending} tone={ov.counts.pending > 0 ? 'text-amber' : 'text-text'} />
        <StatCard Icon={ScanLine} label="Sessions digested (7d)" value={ov.sessions.lastWeek} tone="text-text" sub={`${ov.deduped7d} duplicates skipped`} />
      </div>

      {/* Where lessons came from + knowledge growth */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-text mb-3">
            <Sparkles className="w-4 h-4 text-text-muted" /> Where lessons came from
          </div>
          <SourceBar bySource={ov.bySource} total={ov.captured.total} />
          <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-3 pt-2 border-t border-border/50">
            <Brain className="w-3.5 h-3.5" /> Memory brain: <span className="text-text-secondary font-medium">{ov.memory.patterns}</span> patterns · <span className="text-text-secondary font-medium">{ov.memory.feedbackDirectives}</span> directives
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-text mb-3">
            <TrendingUp className="w-4 h-4 text-text-muted" /> Knowledge growth (8 weeks)
          </div>
          <WeekBars weekly={ov.captured.weekly} />
          <div className="text-[10px] text-text-muted mt-2">captures per week</div>
        </div>
      </div>

      {/* Digest run history */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-text">
            <Clock className="w-4 h-4 text-text-muted" /> Nightly digest history
          </div>
          {s?.lastRunAt && (
            <div className="text-[11px] text-text-muted">
              Last {relTime(s.lastRunAt)} · <span className={s.lastRunStatus === 'success' ? 'text-emerald' : 'text-red'}>{s.lastRunStatus}</span>
              {s.nextRunAt && ` · next ${relTime(s.nextRunAt)}`}
            </div>
          )}
        </div>
        {ov.runs.length > 0 ? (
          <>
            <RunBars runs={ov.runs} />
            <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald/80" /> captured</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber/70" /> staged</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red/60" /> failed</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-text-muted py-6 text-center">No digest has run yet — the first runs tonight (or on next startup if your Mac was off).</div>
        )}
      </div>

      {/* Recent learnings */}
      <div className="card p-4">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-text mb-3">
          <Sparkles className="w-4 h-4 text-text-muted" /> What your team has learned
        </div>
        {ov.recent.length > 0 ? (
          <div className="space-y-1.5">
            {ov.recent.map((r) => {
              const meta = TYPE_META[r.type] ?? TYPE_META.lesson
              const { Icon } = meta
              return (
                <div key={r.id} className="flex items-center gap-2.5 text-[12px] py-1 border-b border-border/50 last:border-0">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border shrink-0 ${meta.cls}`}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </span>
                  <span className="flex-1 text-text-secondary truncate">{r.title}</span>
                  {r.project && <span className="text-[10px] text-text-muted shrink-0">{r.project}</span>}
                  {r.created_at && <span className="text-[10px] text-text-muted shrink-0">{relTime(r.created_at)}</span>}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-xs text-text-muted py-6 text-center">No lessons captured yet — they'll appear here after the nightly digest.</div>
        )}
      </div>

      <Link to="/docs/11-how-it-learns" className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
        How this works <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}
