// React adapter over cacheCore — the keyed, stale-while-revalidate data hook.
//
// `loading` is true ONLY on the first-ever load (empty cache + fetching), so a
// page navigated back to within TTL renders instantly from cache with no spinner.
// `refreshing` indicates a silent background revalidate.

import { useEffect, useState, useCallback, useRef } from 'react'
import { resource, type ResourceState } from '../lib/cacheCore'

export interface UseCachedApiResult<T> {
  data: T | null
  /** true only when there is no cached data AND a fetch is in flight (first load) */
  loading: boolean
  /** true when cached data is shown while a background revalidate runs */
  refreshing: boolean
  error: string | null
  /** data was already in cache at mount (rendered instantly, no spinner) */
  fromCache: boolean
  refetch: () => void
  setData: (updater: T | ((prev: T | null) => T)) => void
}

export function useCachedApi<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number },
): UseCachedApiResult<T> {
  // Re-bind the handle each render so the latest fetcher closure (fresh params)
  // is used without churning the cache entry. cacheCore keeps the cached state.
  const handle = resource<T>(key, fetcher, opts)
  const fromCacheRef = useRef<boolean>(handle.getState().fetchedAt > 0)

  const [state, setState] = useState<ResourceState<T>>(() => handle.read())

  useEffect(() => {
    const unsub = handle.subscribe(setState)
    setState(handle.read()) // SWR: instant cache + background revalidate if stale
    return unsub
    // key is identity — re-subscribe when it changes (e.g. parameterized routes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const refetch = useCallback(() => {
    void handle.refetch().catch(() => { /* surfaced via state.error */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const setData = useCallback(
    (updater: T | ((prev: T | null) => T)) => handle.setData(updater),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  return {
    data: state.data,
    loading: state.data === null && state.validating,
    refreshing: state.data !== null && state.validating,
    error: state.error,
    fromCache: fromCacheRef.current,
    refetch,
    setData,
  }
}
