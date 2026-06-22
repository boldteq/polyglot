import { useEffect, useState } from 'react'
import PublishDrawer from '../components/workspace/PublishDrawer'

// Global imperative "publish to live store" drawer — mirrors openBuild(). The
// flow is gate-blocked (preflight must pass) + store-name confirmed, both
// server-enforced. Mounted once via <PublishHost /> in App.tsx.

export interface PublishRequest { projectId: string; store: string; themeName?: string | null; onPublished?: () => void }
interface ActiveReq extends PublishRequest { id: number }

let _nextId = 1
const _listeners: Array<(r: ActiveReq | null) => void> = []

export function openPublish(req: PublishRequest) {
  const active: ActiveReq = { ...req, id: _nextId++ }
  _listeners.forEach((fn) => fn(active))
}

export function PublishHost() {
  const [req, setReq] = useState<ActiveReq | null>(null)
  useEffect(() => {
    const handler = (r: ActiveReq | null) => setReq(r)
    _listeners.push(handler)
    return () => { const i = _listeners.indexOf(handler); if (i >= 0) _listeners.splice(i, 1) }
  }, [])
  if (!req) return null
  return <PublishDrawer key={req.id} projectId={req.projectId} store={req.store} themeName={req.themeName} onClose={() => setReq(null)} onPublished={req.onPublished} />
}
