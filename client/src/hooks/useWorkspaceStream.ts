import { useEffect, useRef } from 'react'

// Subscribes to /api/workspace/stream (SSE) and invokes onEvent for every
// gate/changes/lens/score update. Auto-reconnects (EventSource does this), and
// cleans up on unmount. Read-only signal — the caller decides what to refetch.

type WorkspaceEvent = { type: string; file?: string }

export function useWorkspaceStream(onEvent: (e: WorkspaceEvent) => void) {
  const cb = useRef(onEvent)
  cb.current = onEvent
  useEffect(() => {
    let es: EventSource | null = null
    try {
      es = new EventSource('/api/workspace/stream')
      const handle = (type: string) => (ev: MessageEvent) => {
        let payload: WorkspaceEvent = { type }
        try { payload = { ...JSON.parse(ev.data), type } } catch { /* keep base */ }
        cb.current(payload)
      }
      for (const t of ['gate:update', 'changes:update', 'lens:update', 'score:update']) {
        es.addEventListener(t, handle(t))
      }
      es.onerror = () => { /* EventSource auto-retries; swallow noise */ }
    } catch (err) {
      console.error('[workspace] SSE connect failed:', err instanceof Error ? err.message : err)
    }
    return () => { es?.close() }
  }, [])
}
