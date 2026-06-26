// Single shared EventSource for the /org-chart/stream pipe.
//
// Before: AllAgents, Hr (×2), OrgChart (×2), useTaxonomy, useDrift each called
// subscribeOrgChart() → a separate EventSource per page. Navigating stacked 5+
// live connections to the same endpoint. This bus opens ONE connection lazily on
// first subscriber and fans every event out to all listeners.
//
// The SAME endpoint also carries schedule:* events. Schedules used to open their
// OWN second EventSource to /org-chart/stream — a wasted persistent connection
// against the browser's 6-per-host HTTP/1.1 cap, which could queue the Playground
// run's streaming POST and starve it ("No bytes received for 180s"). They now ride
// this one connection via onScheduleEvent().

import { subscribeOrgChartStream, type OrgChartStreamEvent, type ScheduleStreamEvent } from './api'

type Listener = (ev: OrgChartStreamEvent) => void
type ScheduleListener = (ev: ScheduleStreamEvent) => void

let _es: EventSource | null = null
let _lifecycleBound = false
const _listeners = new Set<Listener>()
const _scheduleListeners = new Set<ScheduleListener>()

function ensureOpen(): void {
  if (_es) return
  _es = subscribeOrgChartStream({
    onOrgChart: (ev) => { for (const fn of _listeners) fn(ev) },
    onSchedule: (ev) => { for (const fn of _scheduleListeners) fn(ev) },
  })
  // Bind page-lifecycle handling exactly once (guard against re-binding on every
  // reopen). The old code used `beforeunload` to close + null the connection, but
  // on a bfcache (back/forward) restore the page resumes with _es === null and
  // nothing reopened it → all live schedule/org-chart updates silently died (E2).
  if (typeof window !== 'undefined' && !_lifecycleBound) {
    _lifecycleBound = true
    window.addEventListener('pagehide', () => { _es?.close(); _es = null })
    window.addEventListener('pageshow', (e) => {
      if ((e as PageTransitionEvent).persisted && (_listeners.size > 0 || _scheduleListeners.size > 0)) {
        ensureOpen()
      }
    })
  }
}

/**
 * Subscribe to the shared org-chart SSE. Opens the single connection on first
 * subscriber. Returns an unsubscribe fn. The connection stays open for the app
 * lifetime (matches prior behavior — reconnection cost outweighs idle savings).
 */
export function onOrgChartEvent(fn: Listener): () => void {
  ensureOpen()
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

/**
 * Subscribe to schedule:* events over the SAME shared connection (no second
 * EventSource). Returns an unsubscribe fn. The connection stays open for the app
 * lifetime, same as onOrgChartEvent.
 */
export function onScheduleEvent(fn: ScheduleListener): () => void {
  ensureOpen()
  _scheduleListeners.add(fn)
  return () => { _scheduleListeners.delete(fn) }
}
