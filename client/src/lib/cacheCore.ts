// Framework-agnostic resource cache — generalizes the singleton-cache pattern
// proven in useTaxonomy.ts / useDrift.ts to ANY fetcher, keyed by string.
//
// Why this exists: every page fetched its data fresh on every navigation (useApi
// always set loading=true + refetched on mount), so clicking a menu item showed
// a blank spinner for 1-3s even for data already loaded seconds ago. This module
// adds stale-while-revalidate: cached data is returned instantly on access, and
// revalidated in the background only when stale.
//
// No React here — useCachedApi.ts adapts this into a hook. No `any` types.

export interface ResourceState<T> {
  data: T | null
  error: string | null
  /** epoch ms of last successful fetch; 0 if never fetched */
  fetchedAt: number
  /** true while a fetch is in flight (initial OR background revalidate) */
  validating: boolean
}

interface ResourceEntry<T> {
  state: ResourceState<T>
  inflight: Promise<T> | null
  listeners: Set<(s: ResourceState<T>) => void>
  fetcher: () => Promise<T>
  ttlMs: number
}

// Untyped registry; per-entry typing is restored at the generic accessor boundary.
const registry = new Map<string, ResourceEntry<unknown>>()

/** 30s: instant within a session, background-revalidate after. */
const DEFAULT_TTL = 30_000

function emit<T>(entry: ResourceEntry<T>): void {
  for (const fn of entry.listeners) fn(entry.state)
}

function getOrCreate<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): ResourceEntry<T> {
  const existing = registry.get(key) as ResourceEntry<T> | undefined
  if (existing) {
    // Latest fetcher closure wins (captures fresh params) without dropping cache.
    existing.fetcher = fetcher
    existing.ttlMs = ttlMs
    return existing
  }
  const entry: ResourceEntry<T> = {
    state: { data: null, error: null, fetchedAt: 0, validating: false },
    inflight: null,
    listeners: new Set(),
    fetcher,
    ttlMs,
  }
  registry.set(key, entry as ResourceEntry<unknown>)
  return entry
}

function runFetch<T>(entry: ResourceEntry<T>): Promise<T> {
  if (entry.inflight) return entry.inflight // dedup concurrent fetches
  entry.state = { ...entry.state, validating: true }
  emit(entry)
  entry.inflight = entry
    .fetcher()
    .then((data) => {
      entry.state = { data, error: null, fetchedAt: Date.now(), validating: false }
      emit(entry)
      return data
    })
    .catch((e: unknown) => {
      // Keep last-known data (stale-but-shown), surface the error flag — matches
      // useDrift/useTaxonomy: a failed revalidate never blanks the page.
      const message = e instanceof Error ? e.message : String(e)
      entry.state = { ...entry.state, error: message, validating: false }
      emit(entry)
      throw e
    })
    .finally(() => { entry.inflight = null })
  return entry.inflight
}

function isStale<T>(entry: ResourceEntry<T>): boolean {
  return entry.state.fetchedAt === 0 || Date.now() - entry.state.fetchedAt > entry.ttlMs
}

export interface ResourceHandle<T> {
  getState: () => ResourceState<T>
  /** SWR: returns cached state immediately; background-refetches only if stale. */
  read: () => ResourceState<T>
  /** Force a refetch regardless of TTL. */
  refetch: () => Promise<T>
  /** Subscribe to state changes; returns unsubscribe. */
  subscribe: (fn: (s: ResourceState<T>) => void) => () => void
  /** Optimistic local override; does not hit network. */
  setData: (updater: T | ((prev: T | null) => T)) => void
}

export function resource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number },
): ResourceHandle<T> {
  const entry = getOrCreate<T>(key, fetcher, opts?.ttlMs ?? DEFAULT_TTL)
  return {
    getState: () => entry.state,
    read: () => {
      if (isStale(entry) && !entry.inflight) void runFetch(entry).catch(() => { /* surfaced via state.error */ })
      return entry.state
    },
    refetch: () => runFetch(entry),
    subscribe: (fn) => { entry.listeners.add(fn); return () => { entry.listeners.delete(fn) } },
    setData: (updater) => {
      const prev = entry.state.data
      const next = typeof updater === 'function'
        ? (updater as (p: T | null) => T)(prev)
        : updater
      entry.state = { ...entry.state, data: next }
      emit(entry)
    },
  }
}

/**
 * Targeted invalidation: mark matching keys stale, and refetch immediately ONLY
 * those with active listeners (mounted) — no refetch storms for unmounted pages.
 */
export function invalidate(predicate: (key: string) => boolean): void {
  for (const [key, entry] of registry) {
    if (!predicate(key)) continue
    entry.state = { ...entry.state, fetchedAt: 0 } // mark stale
    if (entry.listeners.size > 0) void runFetch(entry).catch(() => { /* surfaced via state.error */ })
  }
}

export function invalidateKey(key: string): void {
  invalidate((k) => k === key)
}

export function invalidateAll(): void {
  invalidate(() => true)
}

/** Warm a resource without rendering (prefetch on hover/idle). */
export function prefetch<T>(key: string, fetcher: () => Promise<T>, opts?: { ttlMs?: number }): void {
  const handle = resource(key, fetcher, opts)
  if (handle.getState().fetchedAt === 0) void handle.refetch().catch(() => { /* surfaced via state.error */ })
}
