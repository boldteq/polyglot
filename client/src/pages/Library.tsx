import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Search, Terminal, Sparkles, Puzzle, Globe, FolderGit2, RefreshCw, X, Copy,
  Check, ChevronRight, FileText, Pin, ArrowUpDown, ShoppingBag, Zap,
  Database, Palette, Bot, Rocket, Code, Layers,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { getLibrary, type LibraryItem } from '../lib/api'
import { statusPill } from '../lib/colors'

// Library — every on-disk slash-command + skill, browsable + filterable.
// Design targets the Hostinger-CRM feel: clean cards, tight tokens, counts on
// every filter chip, one drawer for details, keyboard-driven.

type KindFilter = 'all' | 'command' | 'skill'
type ScopeFilter = 'all' | 'global' | 'project' | 'plugin'
type Grouping = 'topic' | 'plugin' | 'flat'
type Sort = 'recent' | 'name' | 'scope'

// Icon lookup by prefix — makes grouped view scannable at a glance.
const PREFIX_ICON: Record<string, LucideIcon> = {
  shopify: ShoppingBag, hydrogen: ShoppingBag, weaverse: ShoppingBag,
  supabase: Database, postgres: Database, upstash: Database,
  cloudflare: Zap, workers: Zap, cloudflare_workers: Zap,
  agent: Bot, agentforce: Bot, adlc: Bot, adspirer: Bot,
  code: Code, modernize: Code, engineering: Code, chrome: Code,
  design: Palette, figma: Palette, ui: Palette,
  legal: Layers, ip: Layers, litigation: Layers, corporate: Layers,
  commercial: Layers, regulatory: Layers, product: Rocket,
}

function humanPrefix(prefix: string): string {
  if (!prefix) return 'Other'
  return prefix.charAt(0).toUpperCase() + prefix.slice(1)
}

function kindIntent(kind: LibraryItem['kind']) {
  return kind === 'command' ? 'info' : 'success'
}

function scopeIntent(scope: LibraryItem['scope']) {
  return scope === 'global' ? 'info' : scope === 'project' ? 'success' : 'neutral'
}

// Merge micro-buckets into "Other" — the raw prefix heuristic fragments into
// dozens of 1-item groups otherwise.
const MIN_GROUP_SIZE = 2

export default function Library() {
  const { data, loading, refreshing, error, refetch } = useApi(getLibrary, [], CacheKeys.library)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [plugin, setPlugin] = useState<string>('all')
  const [grouping, setGrouping] = useState<Grouping>('topic')
  const [sort, setSort] = useState<Sort>('recent')
  const [selected, setSelected] = useState<LibraryItem | null>(null)
  const [copied, setCopied] = useState(false)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const items = data?.items ?? []
  const meta = data?.meta

  // ⌘K / Ctrl+K focuses search. Esc closes drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape' && selected) {
        e.preventDefault()
        setSelected(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // When drawer opens, focus its close button so keyboard users can Esc/Tab out.
  useEffect(() => {
    if (selected && drawerRef.current) {
      const closeBtn = drawerRef.current.querySelector<HTMLButtonElement>('[data-drawer-close]')
      closeBtn?.focus()
    }
  }, [selected])

  const pluginOptions = useMemo(() => {
    const set = new Map<string, string>() // id → display
    for (const it of items) if (it.plugin) set.set(it.plugin, it.pluginDisplay || it.plugin)
    return Array.from(set.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, display]) => ({ id, display }))
  }, [items])

  useEffect(() => {
    if (plugin !== 'all' && !pluginOptions.some((p) => p.id === plugin)) setPlugin('all')
  }, [pluginOptions, plugin])

  // Compute counts per filter axis on the CURRENT search-narrowed set so filter
  // chips always show what's actually available if clicked next.
  const searchNarrowed = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((it) =>
      it.name.toLowerCase().includes(s) ||
      it.description.toLowerCase().includes(s) ||
      (it.pluginDisplay || it.plugin || '').toLowerCase().includes(s) ||
      it.prefix.toLowerCase().includes(s),
    )
  }, [items, q])

  const kindCounts = useMemo(() => {
    const c = { all: searchNarrowed.length, command: 0, skill: 0 }
    for (const it of searchNarrowed) c[it.kind]++
    return c
  }, [searchNarrowed])

  const scopeCounts = useMemo(() => {
    const c = { all: searchNarrowed.length, global: 0, project: 0, plugin: 0 }
    for (const it of searchNarrowed) c[it.scope]++
    return c
  }, [searchNarrowed])

  const filtered = useMemo(() => {
    return searchNarrowed.filter((it) => {
      if (kind !== 'all' && it.kind !== kind) return false
      if (scope !== 'all' && it.scope !== scope) return false
      if (plugin !== 'all' && it.plugin !== plugin) return false
      return true
    })
  }, [searchNarrowed, kind, scope, plugin])

  const sorted = useMemo(() => {
    const arr = filtered.slice()
    if (sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'scope') arr.sort((a, b) => {
      const order = { global: 0, project: 1, plugin: 2 }
      const d = order[a.scope] - order[b.scope]
      return d !== 0 ? d : a.name.localeCompare(b.name)
    })
    else arr.sort((a, b) => b.updatedAt - a.updatedAt)
    return arr
  }, [filtered, sort])

  const groups = useMemo(() => {
    if (grouping === 'flat') return [{ key: 'All results', items: sorted, icon: null as LucideIcon | null }]
    const buckets = new Map<string, LibraryItem[]>()
    for (const it of sorted) {
      const rawKey =
        grouping === 'topic'
          ? humanPrefix(it.prefix)
          : (it.pluginDisplay || it.plugin || (it.scope === 'global' ? 'Global' : it.scope === 'project' ? 'Project' : 'Other'))
      let arr = buckets.get(rawKey)
      if (!arr) { arr = []; buckets.set(rawKey, arr) }
      arr.push(it)
    }
    // Split into large + tiny (< MIN_GROUP_SIZE) so tiny ones collapse to "Other".
    const large: Array<{ key: string; items: LibraryItem[]; icon: LucideIcon | null }> = []
    const small: LibraryItem[] = []
    for (const [key, arr] of buckets.entries()) {
      if (arr.length >= MIN_GROUP_SIZE) {
        const iconKey = grouping === 'topic' ? key.toLowerCase() : ''
        large.push({ key, items: arr, icon: PREFIX_ICON[iconKey] || null })
      } else {
        small.push(...arr)
      }
    }
    large.sort((a, b) => (b.items.length - a.items.length) || a.key.localeCompare(b.key))
    if (small.length) large.push({ key: 'Other', items: small, icon: null })
    return large
  }, [sorted, grouping])

  // Pinned strip: user's own global commands, always front and center when no
  // narrowing filter is active.
  const pinnedGlobals = useMemo(() => {
    if (kind === 'skill' || scope === 'plugin' || scope === 'project') return []
    if (q.trim() || plugin !== 'all') return []
    return items.filter((it) => it.scope === 'global' && it.kind === 'command').slice(0, 10)
  }, [items, kind, scope, q, plugin])

  const subtitle = meta
    ? `${meta.counts.total} items · ${meta.counts.command} commands · ${meta.counts.skill} skills`
    : 'Every slash-command and skill installed on this machine'

  const clearFilters = useCallback(() => {
    setQ(''); setKind('all'); setScope('all'); setPlugin('all')
  }, [])

  const hasFilters = q !== '' || kind !== 'all' || scope !== 'all' || plugin !== 'all'

  const copyInvocation = (it: LibraryItem) => {
    const text = `/${it.name}`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }

  const openItem = (it: LibraryItem) => setSelected(it)

  return (
    <PageShell
      title="Commands & Skills"
      subtitle={subtitle}
      actions={
        <button
          onClick={() => { refetch(); }}
          className="btn-secondary btn-sm"
          disabled={loading || refreshing}
          aria-label="Refresh library"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} className="h-48" />
      ) : (
        <div className="space-y-4">
          {/* Filter bar — tight, single card, three axes + sort + group. */}
          <div className="card p-3 space-y-3">
            {/* Row 1: search + sort + group-by */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[240px] max-w-xl">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, description, plugin…"
                  aria-label="Search library"
                  className="input pl-9 pr-16 w-full"
                />
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] bg-surface-2 border border-border-subtle px-1 py-0.5 rounded font-mono text-text-muted pointer-events-none">⌘/</kbd>
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
              <label className="flex items-center gap-1.5 text-xs text-text-muted">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="input w-auto text-xs py-1"
                  aria-label="Sort order"
                >
                  <option value="recent">Recent</option>
                  <option value="name">A-Z</option>
                  <option value="scope">By source</option>
                </select>
              </label>
              <div role="group" aria-label="Group by" className="segmented ml-auto">
                {(['topic', 'plugin', 'flat'] as Grouping[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGrouping(g)}
                    aria-pressed={grouping === g}
                    className={`segmented-btn ${grouping === g ? 'segmented-btn-active' : ''}`}
                  >
                    {g === 'topic' ? 'By topic' : g === 'plugin' ? 'By plugin' : 'Flat'}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: kind chips + scope chips (with counts) + plugin dropdown */}
            <div className="flex items-center gap-2 flex-wrap">
              <div role="group" aria-label="Filter by kind" className="segmented">
                {(['all', 'command', 'skill'] as KindFilter[]).map((v) => (
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
              <div className="w-px h-6 bg-border-subtle mx-1" aria-hidden="true" />
              <div role="group" aria-label="Filter by scope" className="segmented">
                {(['all', 'global', 'project', 'plugin'] as ScopeFilter[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setScope(v)}
                    aria-pressed={scope === v}
                    className={`segmented-btn ${scope === v ? 'segmented-btn-active' : ''}`}
                  >
                    {v === 'all' ? 'All sources' : v === 'global' ? (<><Globe className="w-3 h-3 mr-1 inline" />Global</>) : v === 'project' ? (<><FolderGit2 className="w-3 h-3 mr-1 inline" />Project</>) : (<><Puzzle className="w-3 h-3 mr-1 inline" />Plugins</>)}
                    <span className="ml-1.5 text-[10px] opacity-60">{scopeCounts[v]}</span>
                  </button>
                ))}
              </div>
              {(scope === 'all' || scope === 'plugin') && pluginOptions.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  Plugin
                  <select
                    value={plugin}
                    onChange={(e) => setPlugin(e.target.value)}
                    className="input w-auto text-xs py-1"
                    aria-label="Filter by plugin"
                  >
                    <option value="all">All ({pluginOptions.length})</option>
                    {pluginOptions.map((p) => <option key={p.id} value={p.id}>{p.display}</option>)}
                  </select>
                </label>
              )}
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-text-muted hover:text-text underline underline-offset-2"
                >
                  Clear filters
                </button>
              )}
              <div className="ml-auto text-xs text-text-muted">
                {sorted.length === items.length
                  ? `${items.length} items`
                  : `${sorted.length} of ${items.length}`}
              </div>
            </div>
          </div>

          {/* Pinned globals — only when unfiltered, gives Yash-installed commands top billing */}
          {pinnedGlobals.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-accent/5">
                <Pin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                <span className="text-sm font-semibold">Your global commands</span>
                <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">{pinnedGlobals.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:[&>*:not(:nth-child(3n))]:border-r divide-border-subtle border-border-subtle">
                {pinnedGlobals.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => openItem(it)}
                    className="flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/40 transition-colors md:border-b md:border-border-subtle"
                  >
                    <Terminal className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        <span className="text-text-muted">/</span>{it.name}
                      </div>
                      {it.description && (
                        <div className="text-[11px] text-text-muted line-clamp-2 mt-0.5">{it.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grouped list */}
          {sorted.length === 0 ? (
            <div className="card p-10 text-center text-text-muted text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
              <div className="font-medium">No commands or skills match these filters.</div>
              {hasFilters && (
                <div className="mt-3">
                  <button className="btn-secondary btn-sm" onClick={clearFilters}>
                    Reset filters
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => {
                const Icon = group.icon
                return (
                  <div key={group.key} className="card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-2/40">
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="w-4 h-4 text-text-muted" aria-hidden="true" />}
                        <span className="text-sm font-semibold">{group.key}</span>
                        <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                          {group.items.length}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-border-subtle">
                      {group.items.map((it) => (
                        <button
                          key={it.id}
                          onClick={() => openItem(it)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/40 transition-colors"
                        >
                          {it.kind === 'command' ? (
                            <Terminal className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              <span className="text-text-muted">/</span>{it.name}
                            </div>
                            {it.description && (
                              <div className="text-[11px] text-text-muted line-clamp-2 mt-0.5">{it.description}</div>
                            )}
                          </div>
                          <span className={`pill ${statusPill(kindIntent(it.kind))} text-[10px] shrink-0 mt-0.5`}>
                            {it.kind}
                          </span>
                          <span className={`pill ${statusPill(scopeIntent(it.scope))} text-[10px] shrink-0 max-w-[140px] truncate mt-0.5`}
                                title={it.scopeLabel}>
                            {it.scope === 'plugin' ? (it.pluginDisplay || 'plugin') : it.scopeLabel}
                          </span>
                          <ChevronRight className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {meta?.scannedAt && (
            <div className="text-[11px] text-text-muted text-right">
              Scanned {new Date(meta.scannedAt).toLocaleTimeString()}{meta.cached ? ' · cached' : ''}
            </div>
          )}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          role="dialog"
          aria-labelledby="library-detail-title"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in" onClick={() => setSelected(null)} />
          <div
            ref={drawerRef}
            className="relative w-full max-w-xl h-full bg-surface border-l border-border-subtle shadow-pop flex flex-col animate-in slide-in-from-right"
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`pill ${statusPill(kindIntent(selected.kind))} text-[10px]`}>
                      {selected.kind === 'command'
                        ? <Terminal className="w-3 h-3 mr-1 inline" aria-hidden="true" />
                        : <Sparkles className="w-3 h-3 mr-1 inline" aria-hidden="true" />}
                      {selected.kind}
                    </span>
                    <span className={`pill ${statusPill(scopeIntent(selected.scope))} text-[10px]`}>
                      {selected.scope === 'global' && <Globe className="w-3 h-3 mr-1 inline" />}
                      {selected.scope === 'project' && <FolderGit2 className="w-3 h-3 mr-1 inline" />}
                      {selected.scope === 'plugin' && <Puzzle className="w-3 h-3 mr-1 inline" />}
                      {selected.scopeLabel}
                    </span>
                    {selected.pluginVersion && (
                      <span className="pill bg-surface-2 text-text-muted text-[10px]">v{selected.pluginVersion}</span>
                    )}
                  </div>
                  <h2 id="library-detail-title" className="text-xl font-bold truncate">
                    <span className="text-text-muted">/</span>{selected.name}
                  </h2>
                  {selected.description && (
                    <p className="text-sm text-text-secondary mt-2 leading-relaxed">{selected.description}</p>
                  )}
                </div>
                <button
                  data-drawer-close
                  onClick={() => setSelected(null)}
                  aria-label="Close detail panel (Esc)"
                  title="Close (Esc)"
                  className="btn-ghost btn-sm shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1 min-h-0">
              {/* Invoke */}
              <div>
                <div className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1.5">
                  Invoke
                </div>
                <div className="flex items-center gap-2 bg-surface-2 border border-border-subtle rounded-lg p-2.5">
                  <Terminal className="w-4 h-4 text-text-muted shrink-0" />
                  <code className="flex-1 font-mono text-sm text-text truncate">
                    /{selected.name}
                  </code>
                  <button
                    onClick={() => copyInvocation(selected)}
                    className="btn-secondary btn-sm shrink-0"
                    aria-label="Copy invocation"
                  >
                    {copied ? (
                      <><Check className="w-3.5 h-3.5 text-green" /> Copied</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> Copy</>
                    )}
                  </button>
                </div>
              </div>

              {/* Meta rows */}
              <div className="space-y-2 text-xs">
                {selected.plugin && (
                  <MetaRow label="Plugin">
                    <span className="font-mono text-text break-all">{selected.pluginDisplay || selected.plugin}</span>
                    {selected.plugin !== selected.pluginDisplay && (
                      <span className="text-text-muted ml-2">({selected.plugin})</span>
                    )}
                  </MetaRow>
                )}
                <MetaRow label="Format">
                  <span className="pill bg-surface-2 text-text-muted text-[10px]">.{selected.format}</span>
                </MetaRow>
                <MetaRow label="Updated">
                  {new Date(selected.updatedAt).toLocaleString()}
                </MetaRow>
                <MetaRow label="Path">
                  <code className="text-[11px] font-mono text-text-muted break-all">{selected.path}</code>
                </MetaRow>
              </div>

              {/* Contents */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-medium text-text-muted uppercase tracking-wide">
                    Contents
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {selected.body?.split('\n').length ?? 0} lines
                  </span>
                </div>
                <pre className="text-[11px] bg-surface-2 border border-border-subtle rounded-lg p-3 whitespace-pre-wrap break-words font-mono max-h-[55vh] overflow-y-auto leading-relaxed">
                  {selected.body || '(empty)'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-text-muted min-w-[70px] shrink-0 pt-0.5">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
