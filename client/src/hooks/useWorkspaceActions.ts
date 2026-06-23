import { useState, useEffect } from 'react'
import { getWorkspaceActions, type ActionDef } from '../lib/api'

// The cockpit action registry is a near-static allowlist (+ env availability).
// With keep-alive tabs, ProjectHeader + LensTab + WorkflowTab all want it at once
// — that was 3 identical /workspace/actions/registry fetches per page load. Cache
// the promise module-level (short TTL keeps env-availability fresh enough), so
// every caller shares ONE request. `force` bypasses (e.g. after env changes).
let cache: { at: number; promise: Promise<ActionDef[]> } | null = null
const TTL_MS = 60_000

export function fetchWorkspaceActions(force = false): Promise<ActionDef[]> {
  const now = Date.now()
  if (!force && cache && now - cache.at < TTL_MS) return cache.promise
  const promise = getWorkspaceActions()
    .then((r) => r.actions)
    .catch((e) => { cache = null; throw e }) // don't cache a failure
  cache = { at: now, promise }
  return promise
}

// Convenience hook: returns the cached action list (empty until loaded).
export function useWorkspaceActions(): ActionDef[] {
  const [actions, setActions] = useState<ActionDef[]>([])
  useEffect(() => {
    let alive = true
    fetchWorkspaceActions().then((a) => { if (alive) setActions(a) }).catch(() => { if (alive) setActions([]) })
    return () => { alive = false }
  }, [])
  return actions
}
