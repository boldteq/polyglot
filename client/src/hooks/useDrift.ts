// Phase 5 — Singleton drift cache. Replaces independent getDrift() calls on
// AllAgents + Hr that fetched the same data separately. Single fetch shared
// across pages, auto-refetch on `agent:upsert` SSE event.

import { useEffect, useState, useCallback } from 'react'
import { getDrift, subscribeOrgChart, type DriftData } from '../lib/api'

let _cache: DriftData | null = null
let _inflight: Promise<DriftData> | null = null
const _listeners = new Set<(d: DriftData) => void>()

async function fetchAndBroadcast(): Promise<DriftData> {
  if (_inflight) return _inflight
  _inflight = getDrift()
    .then((data) => {
      _cache = data
      _listeners.forEach((fn) => fn(data))
      return data
    })
    .catch((err) => {
      console.error('[useDrift] fetch failed:', err instanceof Error ? err.message : err)
      const fallback: DriftData = { onlyOnDisk: [], onlyInRegistry: [] }
      _cache = fallback
      _listeners.forEach((fn) => fn(fallback))
      return fallback
    })
    .finally(() => {
      _inflight = null
    })
  return _inflight
}

let _sseStarted = false
function ensureSseSubscription() {
  if (_sseStarted) return
  _sseStarted = true
  try {
    const es = subscribeOrgChart((ev) => {
      if (ev.type === 'agent:upsert' || ev.type === 'agent:remove') {
        fetchAndBroadcast()
      }
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => es.close())
    }
  } catch (err) {
    console.error('[useDrift] SSE subscribe failed:', err instanceof Error ? err.message : err)
  }
}

export interface UseDriftResult {
  drift: DriftData
  loading: boolean
  refetch: () => void
}

export function useDrift(): UseDriftResult {
  const [drift, setDrift] = useState<DriftData>(() => _cache || { onlyOnDisk: [], onlyInRegistry: [] })
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    const onChange = (d: DriftData) => {
      setDrift(d)
      setLoading(false)
    }
    _listeners.add(onChange)
    ensureSseSubscription()
    if (!_cache) {
      fetchAndBroadcast().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      _listeners.delete(onChange)
    }
  }, [])

  const refetch = useCallback(() => {
    fetchAndBroadcast()
  }, [])

  return { drift, loading, refetch }
}
