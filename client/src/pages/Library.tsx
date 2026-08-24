import { useState, useMemo, useEffect, useRef, useCallback, forwardRef, Fragment } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, Terminal, Sparkles, Puzzle, Globe, FolderGit2, RefreshCw, X, Copy,
  Check, ChevronRight, FileText, Star, Play, Clock, ChevronDown, Pencil,
} from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { getLibrary, type LibraryItem } from '../lib/api'
import { statusPill } from '../lib/colors'
import { STORAGE_KEY_PLAYGROUND_SESSION } from '../lib/constants'

// Commands page — every slash-command and skill on this machine, one clean
// list. Production-grade: URL state, favorites + recents (persisted), keyboard
// nav, one-click Run into Playground, sticky filter bar, collapsible groups.

type KindFilter = 'all' | 'command' | 'skill'
type ScopeFilter = 'all' | 'global' | 'project' | 'plugin'
const KIND_VALUES = ['all', 'command', 'skill'] as const
const SCOPE_VALUES = ['all', 'global', 'project', 'plugin'] as const

const FAV_KEY = 'polyglot:command-favorites'
const RECENTS_KEY = 'polyglot:command-recents'
const COLLAPSED_KEY = 'polyglot:command-collapsed-groups'
const MAX_RECENTS = 8
const MIN_GROUP_SIZE = 3

function titleCase(s: string) {
  if (!s) return 'Other'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function kindIntent(k: LibraryItem['kind']) {
  return k === 'command' ? 'info' : 'success'
}

function scopeIntent(s: LibraryItem['scope']) {
  return s === 'global' ? 'info' : s === 'project' ? 'success' : 'neutral'
}

// Human-readable "N ago". Quiet for anything older than 12 months so the row
// doesn't scream a red-flag date the user never cared about.
function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 0 || !Number.isFinite(diff)) return ''
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  const y = Math.max(1, Math.floor(mo / 12))
  return `${y}y ago`
}

function loadStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [])
  } catch { return new Set() }
}

function saveStringSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(s))) } catch {
    console.warn('[commands] localStorage save failed (quota / private mode)')
  }
}

function loadStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

function saveStringList(key: string, xs: string[]) {
  try { localStorage.setItem(key, JSON.stringify(xs)) } catch {
    console.warn('[commands] localStorage save failed (quota / private mode)')
  }
}

// Case-insensitive substring highlighter — wraps every occurrence of `q` in
// <mark>. Cheap (single regex, no chunking) — the visible rows are always tiny.
function highlight(text: string, q: string): React.ReactNode {
  const s = q.trim()
  if (!s || !text) return text
  const parts: React.ReactNode[] = []
  const lower = text.toLowerCase()
  const needle = s.toLowerCase()
  let i = 0
  let match = lower.indexOf(needle, i)
  let key = 0
  while (match !== -1) {
    if (match > i) parts.push(<Fragment key={key++}>{text.slice(i, match)}</Fragment>)
    parts.push(
      <mark key={key++} className="bg-accent/20 text-text rounded px-0.5">
        {text.slice(match, match + s.length)}
      </mark>,
    )
    i = match + s.length
    match = lower.indexOf(needle, i)
  }
  if (i < text.length) parts.push(<Fragment key={key++}>{text.slice(i)}</Fragment>)
  return parts
}

export default function CommandsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data, loading, refreshing, error, refetch } = useApi(getLibrary, [], CacheKeys.library)

  // URL state — filters shareable + survive refresh.
  const q = searchParams.get('q') || ''
  const kindParam = searchParams.get('kind') as KindFilter | null
  const kind: KindFilter = kindParam && (KIND_VALUES as readonly string[]).includes(kindParam) ? kindParam : 'all'
  const scopeParam = searchParams.get('scope') as ScopeFilter | null
  const scope: ScopeFilter = scopeParam && (SCOPE_VALUES as readonly string[]).includes(scopeParam) ? scopeParam : 'all'
  const plugin = searchParams.get('plugin') || 'all'

  const setParam = useCallback((key: string, value: string, defaultValue: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === defaultValue) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setQ = useCallback((v: string) => setParam('q', v, ''), [setParam])
  const setKind = useCallback((v: KindFilter) => setParam('kind', v, 'all'), [setParam])
  const setScope = useCallback((v: ScopeFilter) => setParam('scope', v, 'all'), [setParam])
  const setPlugin = useCallback((v: string) => setParam('plugin', v, 'all'), [setParam])

  const [selected, setSelected] = useState<LibraryItem | null>(null)
  const [copied, setCopied] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(() => loadStringSet(FAV_KEY))
  const [recents, setRecents] = useState<string[]>(() => loadStringList(RECENTS_KEY))
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadStringSet(COLLAPSED_KEY))
  const [focusIdx, setFocusIdx] = useState<number>(-1)
  const [starPulse, setStarPulse] = useState<string | null>(null)

  const drawerRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => { saveStringSet(FAV_KEY, favorites) }, [favorites])
  useEffect(() => { saveStringList(RECENTS_KEY, recents) }, [recents])
  useEffect(() => { saveStringSet(COLLAPSED_KEY, collapsed) }, [collapsed])

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setStarPulse(id)
    window.setTimeout(() => setStarPulse((cur) => (cur === id ? null : cur)), 400)
  }, [])

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  const trackRecent = useCallback((id: string) => {
    setRecents((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS)
      return next
    })
  }, [])

  const items = data?.items ?? []
  const meta = data?.meta

  const pluginOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items) if (it.plugin) m.set(it.plugin, it.pluginDisplay || it.plugin)
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  // Recover from stale `?plugin=` params — but ONLY after the data has loaded.
  // Firing before `items` arrives would clobber a valid shareable URL.
  useEffect(() => {
    if (loading || items.length === 0) return
    if (plugin !== 'all' && !pluginOptions.some(([id]) => id === plugin)) setPlugin('all')
  }, [loading, items.length, pluginOptions, plugin, setPlugin])

  const searchNarrowed = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((it) =>
      it.name.toLowerCase().includes(s) ||
      it.description.toLowerCase().includes(s) ||
      (it.pluginDisplay || it.plugin || '').toLowerCase().includes(s),
    )
  }, [items, q])

  const kindCounts = useMemo(() => {
    const c: Record<KindFilter, number> = { all: searchNarrowed.length, command: 0, skill: 0 }
    for (const it of searchNarrowed) c[it.kind]++
    return c
  }, [searchNarrowed])

  const scopeCounts = useMemo(() => {
    const c: Record<ScopeFilter, number> = { all: searchNarrowed.length, global: 0, project: 0, plugin: 0 }
    for (const it of searchNarrowed) c[it.scope]++
    return c
  }, [searchNarrowed])

  const filtered = useMemo(() => {
    return searchNarrowed
      .filter((it) => (kind === 'all' || it.kind === kind))
      .filter((it) => (scope === 'all' || it.scope === scope))
      .filter((it) => (plugin === 'all' || it.plugin === plugin))
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [searchNarrowed, kind, scope, plugin])

  const favoritesList = useMemo(() => {
    if (favorites.size === 0) return []
    // Exclude anything already shown in the Recents strip so a starred command
    // that was just Run doesn't render twice + get walked twice by arrow-nav.
    return filtered.filter((it) => favorites.has(it.id) && !recents.includes(it.id))
  }, [filtered, favorites, recents])

  // Recents strip — always shown when there are recents, but respects the
  // active filter (kind/scope/plugin/search) so it never contradicts what the
  // user is looking at. Was previously hidden the moment any filter was on,
  // which erased context during search.
  const recentsList = useMemo(() => {
    if (recents.length === 0) return []
    const byId = new Map(filtered.map((it) => [it.id, it]))
    return recents.map((id) => byId.get(id)).filter(Boolean) as LibraryItem[]
  }, [recents, filtered])

  const nonFavorites = useMemo(
    () => filtered.filter((it) => !favorites.has(it.id) && !recentsList.some((r) => r.id === it.id)),
    [filtered, favorites, recentsList],
  )

  const groups = useMemo(() => {
    const buckets = new Map<string, LibraryItem[]>()
    for (const it of nonFavorites) {
      const key = titleCase(it.prefix || 'other')
      let arr = buckets.get(key)
      if (!arr) { arr = []; buckets.set(key, arr) }
      arr.push(it)
    }
    const large: Array<{ key: string; items: LibraryItem[] }> = []
    const small: LibraryItem[] = []
    for (const [key, arr] of buckets.entries()) {
      if (arr.length >= MIN_GROUP_SIZE) large.push({ key, items: arr })
      else small.push(...arr)
    }
    large.sort((a, b) => (b.items.length - a.items.length) || a.key.localeCompare(b.key))
    if (small.length) large.push({ key: 'Other', items: small })
    return large
  }, [nonFavorites])

  const flatOrder = useMemo(() => {
    const list: LibraryItem[] = [...recentsList, ...favoritesList]
    for (const g of groups) {
      if (collapsed.has(g.key)) continue
      list.push(...g.items)
    }
    return list
  }, [recentsList, favoritesList, groups, collapsed])

  // NB: no explicit "reset rowRefs on length change" effect — inline `ref={el=>…}`
  // callbacks fill+null the slots naturally as rows mount/unmount. A blanket
  // reset ran *after* commit and blew away the freshly-populated refs, silently
  // dropping DOM focus during arrow-nav.

  const focusRow = useCallback((idx: number) => {
    if (idx < 0 || idx >= flatOrder.length) return
    setFocusIdx(idx)
    const btn = rowRefs.current[idx]
    if (!btn) return
    btn.focus()
    // scrollIntoView({block:'nearest'}) hides the row behind the sticky filter
    // bar — nudge with scroll-margin-top so the focused row lands below it.
    btn.style.scrollMarginTop = '5rem'
    btn.scrollIntoView({ block: 'nearest' })
  }, [flatOrder.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (e.key === 'Escape') {
        if (selected) { e.preventDefault(); setSelected(null); return }
        if (inField && searchRef.current === t) { setQ(''); (t as HTMLInputElement).blur(); return }
      }
      if (e.key === '/' && !inField) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (inField) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        focusRow(Math.min(flatOrder.length - 1, (focusIdx < 0 ? 0 : focusIdx + 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        focusRow(Math.max(0, (focusIdx < 0 ? 0 : focusIdx - 1)))
      } else if ((e.key === 'Enter' || e.key === ' ') && focusIdx >= 0) {
        const it = flatOrder[focusIdx]
        if (it) { e.preventDefault(); setSelected(it) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, focusIdx, flatOrder, focusRow, setQ])

  // Focus management around the drawer — auto-focus close on open, restore
  // focus to the row the user came from on close so keyboard nav resumes cleanly.
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (selected && drawerRef.current) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null
      drawerRef.current.querySelector<HTMLButtonElement>('[data-drawer-close]')?.focus()
    } else if (!selected && restoreFocusRef.current) {
      const el = restoreFocusRef.current
      restoreFocusRef.current = null
      // Defer so the drawer's unmount doesn't reclaim focus first.
      window.requestAnimationFrame(() => { try { el?.focus() } catch { /* stale ref */ } })
    }
  }, [selected])

  const copyInvocation = (it: LibraryItem) => {
    const text = `/${it.name}`
    if (!navigator.clipboard) {
      console.warn('[commands] clipboard unavailable — /${it.name} not copied')
      return
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }).catch((err) => {
      console.warn('[commands] clipboard denied:', err?.message || err)
    })
  }

  // Load `/name` into Playground and navigate. Playground reads its persisted
  // session on mount, so this fills the prompt without any Playground change.
  const runInPlayground = (it: LibraryItem) => {
    try {
      localStorage.setItem(STORAGE_KEY_PLAYGROUND_SESSION, JSON.stringify({
        selectedAgent: '', prompt: `/${it.name}`, output: '',
      }))
    } catch { /* quota / disabled */ }
    trackRecent(it.id)
    navigate('/playground')
  }

  const clearRecents = useCallback(() => setRecents([]), [])

  const hasFilters = q.trim() !== '' || kind !== 'all' || scope !== 'all' || plugin !== 'all'
  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const subtitle = meta
    ? `${meta.counts.total} total · ${meta.counts.command} commands · ${meta.counts.skill} skills`
    : ' '

  useEffect(() => { if (focusIdx >= flatOrder.length) setFocusIdx(-1) }, [flatOrder.length, focusIdx])

  // Prune collapsed-group keys that no longer correspond to any live group so
  // localStorage doesn't grow stale with plugin churn.
  useEffect(() => {
    if (loading || groups.length === 0) return
    const live = new Set(groups.map((g) => g.key))
    const stale = Array.from(collapsed).filter((k) => !live.has(k))
    if (stale.length === 0) return
    setCollapsed((prev) => {
      const next = new Set(prev)
      for (const k of stale) next.delete(k)
      return next
    })
  }, [loading, groups, collapsed])

  return (
    <PageShell
      title="Commands"
      subtitle={subtitle}
      actions={
        <button
          onClick={() => refetch()}
          className="btn-ghost btn-sm"
          disabled={loading || refreshing}
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} className="h-48" />
      ) : (
        <div className="space-y-4">
          {/* Sticky filter bar */}
          <div className="card p-3 sticky top-2 z-10 bg-surface/95 backdrop-blur-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-lg">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search commands, skills, plugins…"
                  aria-label="Search"
                  className="input pl-9 pr-16 w-full"
                />
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] bg-surface-2 border border-border-subtle px-1 py-0.5 rounded font-mono text-text-muted pointer-events-none">/</kbd>
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Clear search"
                    className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div role="group" aria-label="Filter by kind" className="segmented">
                {KIND_VALUES.map((v) => {
                  const n = kindCounts[v]
                  const disabled = n === 0 && kind !== v
                  return (
                    <button
                      key={v}
                      onClick={() => setKind(v)}
                      aria-pressed={kind === v}
                      disabled={disabled}
                      className={`segmented-btn ${kind === v ? 'segmented-btn-active' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {v === 'all' ? 'All' : v === 'command' ? 'Commands' : 'Skills'}
                      <span className="ml-1.5 text-[10px] opacity-60">{n}</span>
                    </button>
                  )
                })}
              </div>

              <div role="group" aria-label="Filter by scope" className="segmented">
                {SCOPE_VALUES.map((v) => {
                  const n = scopeCounts[v]
                  const disabled = n === 0 && scope !== v
                  return (
                    <button
                      key={v}
                      onClick={() => {
                        setScope(v)
                        // When switching away from an all/plugin scope, drop any
                        // active plugin narrow so the row list doesn't silently
                        // collapse to zero via a hidden filter.
                        if (v !== 'all' && v !== 'plugin' && plugin !== 'all') setPlugin('all')
                      }}
                      aria-pressed={scope === v}
                      disabled={disabled}
                      className={`segmented-btn ${scope === v ? 'segmented-btn-active' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {v === 'all' ? 'All' : v === 'global' ? (<><Globe className="w-3 h-3 mr-1 inline" />Global</>) : v === 'project' ? (<><FolderGit2 className="w-3 h-3 mr-1 inline" />Project</>) : (<><Puzzle className="w-3 h-3 mr-1 inline" />Plugins</>)}
                      <span className="ml-1.5 text-[10px] opacity-60">{n}</span>
                    </button>
                  )
                })}
              </div>

              {(scope === 'all' || scope === 'plugin') && pluginOptions.length > 0 && (
                <select
                  value={plugin}
                  onChange={(e) => setPlugin(e.target.value)}
                  className="input w-auto text-xs py-1"
                  aria-label="Filter by plugin"
                >
                  <option value="all">All plugins</option>
                  {pluginOptions.map(([id, display]) => <option key={id} value={id}>{display}</option>)}
                </select>
              )}

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-text-muted hover:text-text underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {recentsList.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-2/40">
                <Clock className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
                <span className="text-sm font-semibold">Recently used</span>
                <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                  {recentsList.length}
                </span>
                <button
                  onClick={clearRecents}
                  className="ml-auto text-[11px] text-text-muted hover:text-text underline underline-offset-2"
                  aria-label="Clear recently used"
                >
                  Clear
                </button>
              </div>
              <div className="divide-y divide-border-subtle">
                {recentsList.map((it, i) => (
                  <ItemRow
                    key={`recent-${it.id}`}
                    ref={(el) => { rowRefs.current[i] = el }}
                    it={it}
                    focused={focusIdx === i}
                    starred={favorites.has(it.id)}
                    starPulse={starPulse === it.id}
                    q={q}
                    runFirst
                    onOpen={() => setSelected(it)}
                    onToggleFav={() => toggleFavorite(it.id)}
                    onRun={() => runInPlayground(it)}
                  />
                ))}
              </div>
            </div>
          )}

          {favoritesList.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-accent/5">
                <Star className="w-3.5 h-3.5 text-accent fill-accent" aria-hidden="true" />
                <span className="text-sm font-semibold">Favorites</span>
                <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                  {favoritesList.length}
                </span>
              </div>
              <div className="divide-y divide-border-subtle">
                {favoritesList.map((it, i) => {
                  const idx = recentsList.length + i
                  return (
                    <ItemRow
                      key={it.id}
                      ref={(el) => { rowRefs.current[idx] = el }}
                      it={it}
                      focused={focusIdx === idx}
                      starred
                      starPulse={starPulse === it.id}
                      q={q}
                      onOpen={() => setSelected(it)}
                      onToggleFav={() => toggleFavorite(it.id)}
                      onRun={() => runInPlayground(it)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {favoritesList.length === 0 && recentsList.length === 0 && !hasFilters && (
            <div className="card px-4 py-3 flex items-center gap-2 text-[12px] text-text-muted">
              <Star className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Star a command to pin it here for one-click access.</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="card p-10 text-center text-text-muted text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
              <div>Nothing matches these filters.</div>
              {hasFilters && (
                <button className="btn-secondary btn-sm mt-3" onClick={clearFilters}>
                  Clear
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group, gi) => {
                const isCollapsed = collapsed.has(group.key)
                // rowRefs indices: recents → favorites → each open group.
                const baseIdx = recentsList.length + favoritesList.length +
                  groups.slice(0, gi).reduce((n, g) => n + (collapsed.has(g.key) ? 0 : g.items.length), 0)
                return (
                  <div key={group.key} className="card overflow-hidden">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={!isCollapsed}
                      className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-2/40 hover:bg-surface-2/60 transition-colors text-left"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-text-muted transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold">{group.key}</span>
                      <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                        {group.items.length}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y divide-border-subtle">
                        {group.items.map((it, i) => {
                          const idx = baseIdx + i
                          return (
                            <ItemRow
                              key={it.id}
                              ref={(el) => { rowRefs.current[idx] = el }}
                              it={it}
                              focused={focusIdx === idx}
                              starred={favorites.has(it.id)}
                              starPulse={starPulse === it.id}
                              q={q}
                              onOpen={() => setSelected(it)}
                              onToggleFav={() => toggleFavorite(it.id)}
                              onRun={() => runInPlayground(it)}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="text-[11px] text-text-muted text-right flex items-center gap-3 justify-end">
            <span><kbd className="text-[9px] bg-surface-2 border border-border-subtle px-1 py-0.5 rounded font-mono">/</kbd> search</span>
            <span><kbd className="text-[9px] bg-surface-2 border border-border-subtle px-1 py-0.5 rounded font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="text-[9px] bg-surface-2 border border-border-subtle px-1 py-0.5 rounded font-mono">↵</kbd> open</span>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          role="dialog"
          aria-labelledby="cmd-detail-title"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm chat-fade-in" onClick={() => setSelected(null)} />
          <div
            ref={drawerRef}
            onKeyDown={(e) => {
              // Focus trap — cycle Tab within the drawer so nothing behind the
              // backdrop becomes operable while the modal is up (WCAG 2.1.2).
              if (e.key !== 'Tab' || !drawerRef.current) return
              const focusables = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
              )).filter((el) => el.offsetParent !== null || el === document.activeElement)
              if (focusables.length === 0) return
              const first = focusables[0]
              const last = focusables[focusables.length - 1]
              const active = document.activeElement
              if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
              else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
            }}
            className="relative w-full max-w-xl h-full bg-surface border-l border-border-subtle shadow-pop flex flex-col animate-slide-in"
          >
            <div className="px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`pill ${statusPill(kindIntent(selected.kind))} text-[10px]`}>
                      {selected.kind === 'command'
                        ? <Terminal className="w-3 h-3 mr-1 inline" />
                        : <Sparkles className="w-3 h-3 mr-1 inline" />}
                      {selected.kind}
                    </span>
                    <span className={`pill ${statusPill(scopeIntent(selected.scope))} text-[10px]`}>
                      {selected.scope === 'global' && <Globe className="w-3 h-3 mr-1 inline" />}
                      {selected.scope === 'project' && <FolderGit2 className="w-3 h-3 mr-1 inline" />}
                      {selected.scope === 'plugin' && <Puzzle className="w-3 h-3 mr-1 inline" />}
                      {selected.scopeLabel}
                    </span>
                    {timeAgo(selected.updatedAt) && (
                      <span className="text-[10px] text-text-muted">· updated {timeAgo(selected.updatedAt)}</span>
                    )}
                  </div>
                  <h2 id="cmd-detail-title" className="text-xl font-bold truncate">
                    <span className="text-text-muted">/</span>{selected.name}
                  </h2>
                  {selected.description && (
                    <p className="text-sm text-text-secondary mt-2 leading-relaxed">{selected.description}</p>
                  )}
                </div>
                <button
                  data-drawer-close
                  onClick={() => setSelected(null)}
                  aria-label="Close (Esc)"
                  title="Close (Esc)"
                  className="btn-ghost btn-sm shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="flex items-center gap-2 bg-surface-2 border border-border-subtle rounded-lg p-2.5">
                <Terminal className="w-4 h-4 text-text-muted shrink-0" />
                <code className="flex-1 font-mono text-sm text-text truncate">/{selected.name}</code>
                <button
                  onClick={() => runInPlayground(selected)}
                  className="btn-primary btn-sm shrink-0"
                  aria-label="Open in Playground with prompt pre-filled"
                  title="Opens Playground with /name pre-filled; hit Send to run"
                >
                  <Play className="w-3.5 h-3.5" /> Open in Playground
                </button>
                <button
                  onClick={() => copyInvocation(selected)}
                  className="btn-secondary btn-sm shrink-0"
                  aria-label="Copy invocation"
                >
                  {copied ? (<><Check className="w-3.5 h-3.5 text-green" /> Copied</>) : (<><Copy className="w-3.5 h-3.5" /> Copy</>)}
                </button>
                {selected.scope === 'project' && selected.projectId && (
                  <button
                    onClick={() => navigate(`/projects/${selected.projectId}/commands/${selected.name}?from=commands`)}
                    className="btn-secondary btn-sm shrink-0"
                    aria-label={`Edit /${selected.name}`}
                    title="Open the editor"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                <button
                  onClick={() => toggleFavorite(selected.id)}
                  className="btn-ghost btn-sm shrink-0"
                  aria-label={favorites.has(selected.id) ? 'Remove from favorites' : 'Add to favorites'}
                  title={favorites.has(selected.id) ? 'Unstar' : 'Star'}
                >
                  <Star className={`w-4 h-4 ${favorites.has(selected.id) ? 'text-accent fill-accent' : ''} ${starPulse === selected.id ? 'animate-star-pulse' : ''}`} />
                </button>
              </div>

              <div className="text-[11px] text-text-muted font-mono break-all" title={selected.scope === 'global' ? `Edit at ${selected.path}` : undefined}>
                {selected.path}
                {selected.scope === 'global' && (
                  <span className="ml-2 not-italic text-text-muted/70">
                    · edit in your terminal
                  </span>
                )}
              </div>

              <pre className="text-[11px] bg-surface-2 border border-border-subtle rounded-lg p-3 whitespace-pre-wrap break-words font-mono max-h-[60vh] overflow-y-auto leading-relaxed">
                {selected.body || '(empty)'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}

interface RowProps {
  it: LibraryItem
  focused: boolean
  starred: boolean
  starPulse?: boolean
  q: string
  /** When true, clicking the row runs it in the Playground directly instead
   *  of opening the drawer. Used by the Recents strip — the whole point of
   *  Recents is one-click re-run. */
  runFirst?: boolean
  onOpen: () => void
  onToggleFav: () => void
  onRun: () => void
}

const ItemRow = forwardRef<HTMLDivElement, RowProps>(function ItemRow(
  { it, focused, starred, starPulse, q, runFirst, onOpen, onToggleFav, onRun }, ref,
) {
  const rel = timeAgo(it.updatedAt)
  const primary = runFirst ? onRun : onOpen
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={primary}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); primary() }
      }}
      className={`group relative w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-2/40 transition-colors cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 focus-visible:ring-inset ${focused ? 'bg-surface-2/60 ring-1 ring-accent/40 ring-inset' : ''}`}
      aria-label={runFirst ? `Run /${it.name}` : `Open /${it.name}`}
    >
      {it.kind === 'command'
        ? <Terminal className="w-4 h-4 text-text-muted shrink-0 mt-0.5 relative" aria-hidden="true" />
        : <Sparkles className="w-4 h-4 text-text-muted shrink-0 mt-0.5 relative" aria-hidden="true" />}
      <div className="min-w-0 flex-1 relative">
        <div className="text-sm font-medium truncate">
          <span className="text-text-muted">/</span>{highlight(it.name, q)}
        </div>
        {it.description && (
          <div className="text-[11px] text-text-muted line-clamp-2 mt-0.5">{highlight(it.description, q)}</div>
        )}
      </div>
      {rel && (
        <span className="hidden sm:block text-[10px] text-text-muted shrink-0 mt-0.5 relative">{rel}</span>
      )}
      <span className={`pill ${statusPill(scopeIntent(it.scope))} text-[10px] shrink-0 max-w-[140px] truncate mt-0.5 relative`}
            title={it.scopeLabel}>
        {it.scope === 'plugin' ? (it.pluginDisplay || 'plugin') : it.scopeLabel}
      </span>
      {/* Row actions — always visible so touch devices can reach them + so the
          state (Run available, star toggled) is discoverable at a glance. */}
      <div className="relative shrink-0 flex items-center gap-1 mt-0.5">
        {!runFirst && (
          <button
            onClick={(e) => { e.stopPropagation(); onRun() }}
            className="btn-ghost btn-sm text-text-muted hover:text-text"
            aria-label={`Run /${it.name}`}
            title="Run in Playground"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav() }}
          className="btn-ghost btn-sm text-text-muted hover:text-text"
          aria-label={starred ? 'Unstar' : 'Star'}
          title={starred ? 'Unstar' : 'Star'}
        >
          <Star className={`w-3.5 h-3.5 ${starred ? 'text-accent fill-accent' : ''} ${starPulse ? 'animate-star-pulse' : ''}`} />
        </button>
        {runFirst && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpen() }}
            className="btn-ghost btn-sm text-text-muted hover:text-text"
            aria-label={`Open /${it.name}`}
            title="Open details"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {!runFirst && (
        <ChevronRight className="relative w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
      )}
    </div>
  )
})
