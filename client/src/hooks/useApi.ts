// Backward-compatible SWR upgrade. Previously this hook had NO cache: it set
// loading=true and refetched from scratch on EVERY mount, so every navigation
// showed a blank spinner. It now routes through cacheCore (stale-while-revalidate):
//   - `loading` is true only on the first-ever load (empty cache).
//   - cached data renders instantly on re-navigation, revalidated in background.
//
// Contract preserved: returns { data, loading, error, refetch, setData } (+ a new
// additive `refreshing`). Existing 31 call sites work unchanged.
//
// Cache key: pass an explicit `cacheKey` (from CacheKeys) to SHARE one entry
// across pages (e.g. AllAgents + Playground both reading unified/agents). When
// omitted, a stable per-mount key is derived from a module slot id + deps —
// gives caching + SWR per component without sharing across pages.

import { useRef } from 'react'
import { useCachedApi } from './useCachedApi'

let _slot = 0

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  cacheKey?: string,
) {
  // Stable per-mount slot id; combined with deps to form a key when none given.
  const slotRef = useRef<number>(0)
  if (slotRef.current === 0) slotRef.current = ++_slot
  const key = cacheKey ?? `useApi:${slotRef.current}:${JSON.stringify(deps)}`

  const r = useCachedApi<T>(key, fetcher)

  // Preserve historical shape; `loading` now blocks only on first-ever load.
  // r.refetch / r.setData are already stable (useCallback in useCachedApi).
  return {
    data: r.data,
    loading: r.loading,
    refreshing: r.refreshing,
    error: r.error,
    refetch: r.refetch,
    setData: r.setData,
  }
}
