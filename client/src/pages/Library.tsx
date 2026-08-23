import { useState, useMemo, useEffect, useRef, useCallback, forwardRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, Terminal, Sparkles, Puzzle, Globe, FolderGit2, RefreshCw, X, Copy,
  Check, ChevronRight, FileText, Star, Play,
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
// list. Production-grade: URL state, favorites (persisted), keyboard nav,
// one-click Run into Playground, sticky filter bar.

type KindFilter = 'all' | 'command' | 'skill'
type ScopeFilter = 'all' | 'global' | 'project' | 'plugin'
const KIND_VALUES = ['all', 'command', 'skill'] as const
const SCOPE_VALUES = ['all', 'global', 'project', 'plugin'] as const

const FAV_KEY = 'polyglot:command-favorites'
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
  return ''
}

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}

function saveFavorites(s: Set<string>) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(s))) } catch { /* quota / disabled */ }
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
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites())
  const [focusIdx, setFocusIdx] = useState<number>(-1)

  const drawerRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => { saveFavorites(favorites) }, [favorites])

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
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

  useEffect(() => {
    if (plugin !== 'all' && !pluginOptions.some(([id]) => id === plugin)) setPlugin('all')
  }, [pluginOptions, plugin, setPlugin])

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
    return filtered.filter((it) => favorites.has(it.id))
  }, [filtered, favorites])

  const nonFavorites = useMemo(
    () => filtered.filter((it) => !favorites.has(it.id)),
    [filtered, favorites],
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
    const list: LibraryItem[] = [...favoritesList]
    for (const g of groups) list.push(...g.items)
    return list
  }, [favoritesList, groups])

  useEffect(() => { rowRefs.current = new Array(flatOrder.length).fill(null) }, [flatOrder.length])

  const focusRow = useCallback((idx: number) => {
    if (idx < 0 || idx >= flatOrder.length) return
    setFocusIdx(idx)
    const btn = rowRefs.current[idx]
    btn?.focus()
    btn?.scrollIntoView({ block: 'nearest' })
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

  useEffect(() => {
    if (selected && drawerRef.current) {
      drawerRef.current.querySelector<HTMLButtonElement>('[data-drawer-close]')?.focus()
    }
  }, [selected])

  const copyInvocation = (it: LibraryItem) => {
    navigator.clipboard?.writeText(`/${it.name}`).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }

  // Load `/name` into Playground and navigate. Playground reads its persisted
  // session on mount, so this fills the prompt without any Playground change.
  const runInPlayground = (it: LibraryItem) => {
    try {
      localStorage.setItem(STORAGE_KEY_PLAYGROUND_SESSION, JSON.stringify({
        selectedAgent: '', prompt: `/${it.name}`, output: '',
      }))
    } catch { /* quota / disabled */ }
    navigate('/playground')
  }

  const hasFilters = q !== '' || kind !== 'all' || scope !== 'all' || plugin !== 'all'
  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  const subtitle = meta
    ? `${meta.counts.total} total · ${meta.counts.command} commands · ${meta.counts.skill} skills`
    : ' '

  useEffect(() => { if (focusIdx >= flatOrder.length) setFocusIdx(-1) }, [flatOrder.length, focusIdx])

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
                  placeholder="Search…"
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
                {KIND_VALUES.map((v) => (
                  <button
                    key={v}
                    onClick={() => setKind(v)}
                    aria-pressed={kind === v}
                    className={`segmented-btn ${kind === v ? 'segmented-btn-active' : ''}`}
                  >
                    {v === 'all' ? 'All' : v === 'command' ? 'Commands' : 'Skills'}
                    <span className="ml-1.5 text-[10px] opacity-60">{kindCounts[v]}</span>
                  </button>
                ))}
              </div>

              <div role="group" aria-label="Filter by scope" className="segmented">
                {SCOPE_VALUES.map((v) => (
                  <button
                    key={v}
                    onClick={() => setScope(v)}
                    aria-pressed={scope === v}
                    className={`segmented-btn ${scope === v ? 'segmented-btn-active' : ''}`}
                  >
                    {v === 'all' ? 'All' : v === 'global' ? (<><Globe className="w-3 h-3 mr-1 inline" />Global</>) : v === 'project' ? (<><FolderGit2 className="w-3 h-3 mr-1 inline" />Project</>) : (<><Puzzle className="w-3 h-3 mr-1 inline" />Plugins</>)}
                    <span className="ml-1.5 text-[10px] opacity-60">{scopeCounts[v]}</span>
                  </button>
                ))}
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
                {favoritesList.map((it, i) => (
                  <ItemRow
                    key={it.id}
                    ref={(el) => { rowRefs.current[i] = el }}
                    it={it}
                    focused={focusIdx === i}
                    starred
                    onOpen={() => setSelected(it)}
                    onToggleFav={() => toggleFavorite(it.id)}
                    onRun={() => runInPlayground(it)}
                  />
                ))}
              </div>
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
                const startIdx = favoritesList.length +
                  groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0)
                return (
                  <div key={group.key} className="card overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-2/40">
                      <span className="text-sm font-semibold">{group.key}</span>
                      <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                        {group.items.length}
                      </span>
                    </div>
                    <div className="divide-y divide-border-subtle">
                      {group.items.map((it, i) => {
                        const idx = startIdx + i
                        return (
                          <ItemRow
                            key={it.id}
                            ref={(el) => { rowRefs.current[idx] = el }}
                            it={it}
                            focused={focusIdx === idx}
                            starred={favorites.has(it.id)}
                            onOpen={() => setSelected(it)}
                            onToggleFav={() => toggleFavorite(it.id)}
                            onRun={() => runInPlayground(it)}
                          />
                        )
                      })}
                    </div>
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
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div
            ref={drawerRef}
            className="relative w-full max-w-xl h-full bg-surface border-l border-border-subtle shadow-pop flex flex-col"
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
                  aria-label="Run in Playground"
                >
                  <Play className="w-3.5 h-3.5" /> Run
                </button>
                <button
                  onClick={() => copyInvocation(selected)}
                  className="btn-secondary btn-sm shrink-0"
                  aria-label="Copy invocation"
                >
                  {copied ? (<><Check className="w-3.5 h-3.5 text-green" /> Copied</>) : (<><Copy className="w-3.5 h-3.5" /> Copy</>)}
                </button>
                <button
                  onClick={() => toggleFavorite(selected.id)}
                  className="btn-ghost btn-sm shrink-0"
                  aria-label={favorites.has(selected.id) ? 'Remove from favorites' : 'Add to favorites'}
                  title={favorites.has(selected.id) ? 'Unstar' : 'Star'}
                >
                  <Star className={`w-4 h-4 ${favorites.has(selected.id) ? 'text-accent fill-accent' : ''}`} />
                </button>
              </div>

              <div className="text-[11px] text-text-muted font-mono break-all">
                {selected.path}
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
  onOpen: () => void
  onToggleFav: () => void
  onRun: () => void
}

const ItemRow = forwardRef<HTMLButtonElement, RowProps>(function ItemRow(
  { it, focused, starred, onOpen, onToggleFav, onRun }, ref,
) {
  const rel = timeAgo(it.updatedAt)
  return (
    <div
      className={`group relative w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-2/40 transition-colors ${focused ? 'bg-surface-2/60 ring-1 ring-accent/40 ring-inset' : ''}`}
    >
      <button
        ref={ref}
        onClick={onOpen}
        className="absolute inset-0 opacity-0"
        aria-label={`Open /${it.name}`}
        tabIndex={-1}
      />
      {it.kind === 'command'
        ? <Terminal className="w-4 h-4 text-text-muted shrink-0 mt-0.5 relative" aria-hidden="true" />
        : <Sparkles className="w-4 h-4 text-text-muted shrink-0 mt-0.5 relative" aria-hidden="true" />}
      <div className="min-w-0 flex-1 relative pointer-events-none">
        <div className="text-sm font-medium truncate">
          <span className="text-text-muted">/</span>{it.name}
        </div>
        {it.description && (
          <div className="text-[11px] text-text-muted line-clamp-2 mt-0.5">{it.description}</div>
        )}
      </div>
      {rel && (
        <span className="hidden sm:block text-[10px] text-text-muted shrink-0 mt-0.5 relative">{rel}</span>
      )}
      <span className={`pill ${statusPill(scopeIntent(it.scope))} text-[10px] shrink-0 max-w-[140px] truncate mt-0.5 relative`}
            title={it.scopeLabel}>
        {it.scope === 'plugin' ? (it.pluginDisplay || 'plugin') : it.scopeLabel}
      </span>
      <div className={`relative shrink-0 flex items-center gap-1 mt-0.5 ${starred ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'} transition-opacity`}>
        <button
          onClick={(e) => { e.stopPropagation(); onRun() }}
          className="btn-ghost btn-sm"
          aria-label={`Run /${it.name}`}
          title="Run in Playground"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav() }}
          className="btn-ghost btn-sm"
          aria-label={starred ? 'Unstar' : 'Star'}
          title={starred ? 'Unstar' : 'Star'}
        >
          <Star className={`w-3.5 h-3.5 ${starred ? 'text-accent fill-accent' : ''}`} />
        </button>
      </div>
      <ChevronRight className="relative w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
    </div>
  )
})
