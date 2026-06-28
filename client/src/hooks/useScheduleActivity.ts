// Activity feed state: a growing window over /api/schedules/activity (server-side
// filtered + paginated), kept live by refetching the window on any schedule SSE
// event. Filters change → reset to the first page.
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiError } from '../lib/api'
import { getScheduleActivity, type ScheduleActivityRun, type ScheduleActivityParams, type ScheduleActivityStats } from '../lib/scheduleApi'
import { onScheduleEvent } from '../lib/sseBus'

const PAGE = 30

type Filters = Omit<ScheduleActivityParams, 'limit' | 'offset'>

export function useScheduleActivity(filters: Filters) {
  const [runs, setRuns] = useState<ScheduleActivityRun[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<ScheduleActivityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const sizeRef = useRef(PAGE)
  const mounted = useRef(true)
  const key = JSON.stringify(filters)

  useEffect(() => () => { mounted.current = false }, [])

  const fetchWindow = useCallback(async (silent: boolean) => {
    if (!silent) { setLoading(true); setLoadError(false) }
    try {
      const res = await getScheduleActivity({ ...filters, limit: sizeRef.current, offset: 0 })
      if (!mounted.current) return
      setRuns(res.runs)
      setTotal(res.total)
      setStats(res.stats)
    } catch (err) {
      if (!mounted.current) return
      if (!silent) { apiError('Load activity', err); setLoadError(true) }
    } finally {
      if (mounted.current && !silent) setLoading(false)
    }
    // filters captured via key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Filters changed → clear stale runs immediately (prevents old results flashing
  // through before the new fetch resolves) then reset the window + reload.
  useEffect(() => { sizeRef.current = PAGE; setRuns([]); setTotal(0); setStats(null); fetchWindow(false) }, [fetchWindow])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    sizeRef.current += PAGE
    try { await fetchWindow(true) } finally { if (mounted.current) setLoadingMore(false) }
  }, [fetchWindow])

  // Live: silently refetch the window when any schedule run starts/finishes.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const un = onScheduleEvent(() => { if (t) clearTimeout(t); t = setTimeout(() => fetchWindow(true), 400) })
    return () => { if (t) clearTimeout(t); un() }
  }, [fetchWindow])

  return { runs, total, stats, loading, loadError, loadingMore, hasMore: runs.length < total, reload: () => fetchWindow(false), loadMore }
}
