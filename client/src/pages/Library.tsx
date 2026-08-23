import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Search, Terminal, Sparkles, Puzzle, Globe, FolderGit2, RefreshCw, X, Copy,
  Check, ChevronRight, FileText, Pin,
} from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { getLibrary, type LibraryItem } from '../lib/api'
import { statusPill } from '../lib/colors'

// Commands page — every slash-command and skill on this machine, one clean
// list. Search + two filter axes + optional plugin narrow. No sort selector,
// no group-by toggle, no extras. Grouping is always by topic prefix.

type KindFilter = 'all' | 'command' | 'skill'
type ScopeFilter = 'all' | 'global' | 'project' | 'plugin'

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

// Buckets under this size collapse into a single "Other" group so the
// topic-prefix heuristic doesn't fragment into dozens of 1-item shards.
const MIN_GROUP_SIZE = 3

export default function CommandsPage() {
  const { data, loading, refreshing, error, refetch } = useApi(getLibrary, [], CacheKeys.library)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [plugin, setPlugin] = useState<string>('all')
  const [selected, setSelected] = useState<LibraryItem | null>(null)
  const [copied, setCopied] = useState(false)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  const items = data?.items ?? []
  const meta = data?.meta

  // Esc closes the drawer; nothing else.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setSelected(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  // Focus the close button when the drawer opens so keyboard users can Esc/Tab.
  useEffect(() => {
    if (selected && drawerRef.current) {
      const btn = drawerRef.current.querySelector<HTMLButtonElement>('[data-drawer-close]')
      btn?.focus()
    }
  }, [selected])

  const pluginOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const it of items) if (it.plugin) map.set(it.plugin, it.pluginDisplay || it.plugin)
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  useEffect(() => {
    if (plugin !== 'all' && !pluginOptions.some(([id]) => id === plugin)) setPlugin('all')
  }, [pluginOptions, plugin])

  // Search-narrowed set — chip counts reflect what's actually available.
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

  // Group by topic (name prefix). Small buckets fold into "Other".
  const groups = useMemo(() => {
    const buckets = new Map<string, LibraryItem[]>()
    for (const it of filtered) {
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
  }, [filtered])

  // Pinned strip — Yash's own global commands when nothing is narrowed.
  const pinned = useMemo(() => {
    if (kind === 'skill' || scope === 'plugin' || scope === 'project') return []
    if (q.trim() || plugin !== 'all') return []
    return items
      .filter((it) => it.scope === 'global' && it.kind === 'command')
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12)
  }, [items, kind, scope, q, plugin])

  const hasFilters = q !== '' || kind !== 'all' || scope !== 'all' || plugin !== 'all'
  const clearFilters = useCallback(() => {
    setQ(''); setKind('all'); setScope('all'); setPlugin('all')
  }, [])

  const copyInvocation = (it: LibraryItem) => {
    navigator.clipboard?.writeText(`/${it.name}`).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }

  const subtitle = meta
    ? `${meta.counts.total} total · ${meta.counts.command} commands · ${meta.counts.skill} skills`
    : ' '

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
          {/* Filter bar — search + two chip groups + optional plugin narrow */}
          <div className="card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-lg">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  aria-label="Search"
                  className="input pl-9 pr-8 w-full"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

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

              <div role="group" aria-label="Filter by scope" className="segmented">
                {(['all', 'global', 'project', 'plugin'] as ScopeFilter[]).map((v) => (
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

          {/* Pinned globals — only when nothing is narrowed */}
          {pinned.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-accent/5">
                <Pin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                <span className="text-sm font-semibold">Your commands</span>
                <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">{pinned.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {pinned.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setSelected(it)}
                    className="flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/40 transition-colors border-b border-border-subtle md:[&:not(:nth-child(3n))]:border-r"
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
              {groups.map((group) => (
                <div key={group.key} className="card overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-2/40">
                    <span className="text-sm font-semibold">{group.key}</span>
                    <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">
                      {group.items.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border-subtle">
                    {group.items.map((it) => (
                      <button
                        key={it.id}
                        onClick={() => setSelected(it)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/40 transition-colors"
                      >
                        {it.kind === 'command'
                          ? <Terminal className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
                          : <Sparkles className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            <span className="text-text-muted">/</span>{it.name}
                          </div>
                          {it.description && (
                            <div className="text-[11px] text-text-muted line-clamp-2 mt-0.5">{it.description}</div>
                          )}
                        </div>
                        <span className={`pill ${statusPill(scopeIntent(it.scope))} text-[10px] shrink-0 max-w-[140px] truncate mt-0.5`}
                              title={it.scopeLabel}>
                          {it.scope === 'plugin' ? (it.pluginDisplay || 'plugin') : it.scopeLabel}
                        </span>
                        <ChevronRight className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail drawer — pills, title, description, invoke, path, contents */}
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
                  <div className="flex items-center gap-2 mb-2">
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
                  onClick={() => copyInvocation(selected)}
                  className="btn-secondary btn-sm shrink-0"
                  aria-label="Copy"
                >
                  {copied ? (<><Check className="w-3.5 h-3.5 text-green" /> Copied</>) : (<><Copy className="w-3.5 h-3.5" /> Copy</>)}
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
