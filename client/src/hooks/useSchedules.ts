// Reactive schedules hook: fetches both user-created and system (built-in
// HR/automation) schedules, merges them into one list, and live-patches row
// state on every schedule:* SSE event so the UI never has to poll.
//
// Returns:
//   - schedules: merged list (system first, then user, both alphabetical)
//   - loading / error / reload — page-level state
//   - patchRow — internal helper for SSE handler, exposed for tests
//
// Cache is per-mount (not global) — Schedules page only mounts on /schedules.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiError,
  getSchedules,
  getSystemSchedules,
  getInflightSchedules,
  subscribeSchedules,
  type Schedule,
  type ScheduleStreamEvent,
} from '../lib/api'

function mergeAndSort(user: Schedule[], sys: Schedule[]): Schedule[] {
  // System schedules first (always-on infra) — alphabetical within each group.
  const byName = (a: Schedule, b: Schedule) => a.name.localeCompare(b.name)
  return [...sys.sort(byName), ...user.sort(byName)]
}

export interface UseSchedulesResult {
  schedules: Schedule[]
  loading: boolean
  loadError: boolean
  reload: () => Promise<void>
  /** Patch a single row in place without refetching. Used by SSE handler. */
  patchRow: (id: string, patch: Partial<Schedule>) => void
}

export function useSchedules(): UseSchedulesResult {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      // Three parallel fetches: user list (required), system list (degrades
      // gracefully), inflight (used to mark currently-running rows even if
      // the user reloaded the page mid-handler).
      const [user, sys, inflightRes] = await Promise.all([
        getSchedules(),
        getSystemSchedules().catch(err => {
          apiError('Load system schedules', err)
          return [] as Schedule[]
        }),
        getInflightSchedules().catch(err => {
          console.warn('[useSchedules] inflight fetch failed:', err?.message || err)
          return { inflight: [] }
        }),
      ])
      if (!mountedRef.current) return
      // Build a set of inflight IDs so the merged list shows a 'running'
      // badge that survives browser refresh.
      const inflightIds = new Set(inflightRes.inflight.map(r => r.id))
      const inflightById = new Map(inflightRes.inflight.map(r => [r.id, r]))
      const applyInflight = (s: Schedule): Schedule =>
        inflightIds.has(s.id)
          ? { ...s, lastRunStatus: 'running', runId: inflightById.get(s.id)?.runId ?? null }
          : s
      setSchedules(mergeAndSort(user, sys).map(applyInflight))
    } catch (err) {
      if (!mountedRef.current) return
      apiError('Load schedules', err)
      setLoadError(true)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const patchRow = useCallback((id: string, patch: Partial<Schedule>) => {
    setSchedules(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  // SSE subscriber — patches row state on schedule:* events.
  // schedule:start  → flash status (we just set lastRunStatus to a transient
  //                   marker; row renders a spinner badge).
  // schedule:complete / error → update lastRunAt + lastRunStatus.
  // schedule:upsert → full refetch (create/edit/delete/enable-toggle).
  useEffect(() => {
    let es: EventSource | null = null
    let cancelled = false
    let reloadDebounce: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = () => {
      if (cancelled) return
      if (reloadDebounce) clearTimeout(reloadDebounce)
      reloadDebounce = setTimeout(() => { reload() }, 250)
    }
    const handle = (ev: ScheduleStreamEvent) => {
      if (cancelled || !ev.id) return
      switch (ev.type) {
        case 'schedule:start':
          patchRow(ev.id, { lastRunStatus: 'running', runId: ev.runId ?? null })
          break
        case 'schedule:complete':
          patchRow(ev.id, {
            lastRunAt: ev.lastRunAt || new Date().toISOString(),
            lastRunStatus: 'success',
            runId: null,
          })
          break
        case 'schedule:error':
          patchRow(ev.id, {
            lastRunAt: ev.lastRunAt || new Date().toISOString(),
            lastRunStatus: 'error',
            runId: null,
          })
          break
        case 'schedule:cancelled':
          patchRow(ev.id, {
            lastRunAt: ev.lastRunAt || new Date().toISOString(),
            lastRunStatus: 'cancelled',
            runId: null,
          })
          break
        case 'schedule:upsert':
          scheduleReload()
          break
      }
    }
    try {
      es = subscribeSchedules(handle)
    } catch (err) {
      apiError('Schedules SSE', err)
    }
    return () => {
      cancelled = true
      if (reloadDebounce) clearTimeout(reloadDebounce)
      if (es) es.close()
    }
  }, [reload, patchRow])

  return { schedules, loading, loadError, reload, patchRow }
}
