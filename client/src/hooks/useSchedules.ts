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
  type Schedule,
  type ScheduleStreamEvent,
} from '../lib/api'
import { onScheduleEvent } from '../lib/sseBus'

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

  // Shared fetch+merge body used by both the loading reload() and the silent
  // background reconcile(). Three parallel fetches: user list (required), system
  // list (degrades gracefully), inflight (marks running rows even after a mid-run
  // page reload).
  const fetchAndSet = useCallback(async () => {
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
    const inflightIds = new Set(inflightRes.inflight.map(r => r.id))
    const applyInflight = (s: Schedule): Schedule =>
      inflightIds.has(s.id) ? { ...s, lastRunStatus: 'running' } : s
    setSchedules(mergeAndSort(user, sys).map(applyInflight))
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      await fetchAndSet()
    } catch (err) {
      if (!mountedRef.current) return
      apiError('Load schedules', err)
      setLoadError(true)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [fetchAndSet])

  // E1: silent reconcile (no loading flash) — re-syncs against the server to
  // self-heal a row stuck optimistically 'running' if its terminal SSE event was
  // dropped or coalesced away.
  const reconcile = useCallback(async () => {
    try { await fetchAndSet() } catch { /* background sync — ignore */ }
  }, [fetchAndSet])

  useEffect(() => { reload() }, [reload])

  // E1: while any row shows 'running', poll the server every 45s so a missed
  // terminal event doesn't leave the spinner badge stuck forever. No-op when idle.
  useEffect(() => {
    if (!schedules.some(s => s.lastRunStatus === 'running')) return
    const t = setInterval(() => { reconcile() }, 45_000)
    return () => clearInterval(t)
  }, [schedules, reconcile])

  const patchRow = useCallback((id: string, patch: Partial<Schedule>) => {
    setSchedules(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }, [])

  // SSE subscriber — patches row state on schedule:* events.
  // schedule:start  → flash status (we just set lastRunStatus to a transient
  //                   marker; row renders a spinner badge).
  // schedule:complete / error → update lastRunAt + lastRunStatus.
  // schedule:upsert → full refetch (create/edit/delete/enable-toggle).
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let cancelled = false
    let reloadDebounce: ReturnType<typeof setTimeout> | null = null
    const scheduleReload = () => {
      if (cancelled) return
      if (reloadDebounce) clearTimeout(reloadDebounce)
      reloadDebounce = setTimeout(() => { reload() }, 250)
    }
    const handle = (ev: ScheduleStreamEvent) => {
      if (cancelled || !ev.id) return
      // Cast to string so we can handle future event types (e.g. schedule:crashed)
      // without needing to touch the shared ScheduleStreamEventType union in api.ts.
      switch (ev.type as string) {
        case 'schedule:start':
          patchRow(ev.id, { lastRunStatus: 'running' })
          break
        case 'schedule:complete':
          patchRow(ev.id, {
            lastRunAt: ev.lastRunAt || new Date().toISOString(),
            lastRunStatus: 'success',
          })
          break
        case 'schedule:error':
          patchRow(ev.id, {
            lastRunAt: ev.lastRunAt || new Date().toISOString(),
            lastRunStatus: 'error',
          })
          break
        case 'schedule:cancelled':
          patchRow(ev.id, {
            lastRunAt: ev.lastRunAt || new Date().toISOString(),
            lastRunStatus: 'cancelled',
          })
          break
        case 'schedule:crashed':
          patchRow(ev.id, {
            lastRunAt: ev.lastRunAt || new Date().toISOString(),
            lastRunStatus: 'crashed',
          })
          break
        case 'schedule:upsert':
          scheduleReload()
          break
      }
    }
    try {
      unsubscribe = onScheduleEvent(handle)
    } catch (err) {
      apiError('Schedules SSE', err)
    }
    return () => {
      cancelled = true
      if (reloadDebounce) clearTimeout(reloadDebounce)
      if (unsubscribe) unsubscribe()
    }
  }, [reload, patchRow])

  return { schedules, loading, loadError, reload, patchRow }
}
