// Single shared EventSource for the /org-chart/stream pipe.
//
// Before: AllAgents, Hr (×2), OrgChart (×2), useTaxonomy, useDrift each called
// subscribeOrgChart() → a separate EventSource per page. Navigating stacked 5+
// live connections to the same endpoint. This bus opens ONE connection lazily on
// first subscriber and fans every event out to all listeners.

import { subscribeOrgChart, type OrgChartStreamEvent } from './api'

type Listener = (ev: OrgChartStreamEvent) => void

let _es: EventSource | null = null
const _listeners = new Set<Listener>()

function ensureOpen(): void {
  if (_es) return
  _es = subscribeOrgChart((ev) => {
    for (const fn of _listeners) fn(ev)
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { _es?.close(); _es = null })
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
