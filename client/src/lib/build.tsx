import { useEffect, useState } from 'react'
import BuildDrawer from '../components/workspace/BuildDrawer'

// Global imperative "run autonomous build" drawer — mirrors openDispatch(). The
// build runs via the /api/build/* engine (Maestro, dev-mode) and survives
// refresh/navigation through the buildRuns registry + reattach.

export interface BuildRequest { projectId: string; buildId: string; repoDir: string; store?: string | null }
interface ActiveReq extends BuildRequest { id: number }

let _nextId = 1
const _listeners: Array<(r: ActiveReq | null) => void> = []

export function openBuild(req: BuildRequest) {
  const active: ActiveReq = { ...req, id: _nextId++ }
  _listeners.forEach((fn) => fn(active))
}

export function BuildHost() {
  const [req, setReq] = useState<ActiveReq | null>(null)
  useEffect(() => {
    const handler = (r: ActiveReq | null) => setReq(r)
    _listeners.push(handler)
    return () => { const i = _listeners.indexOf(handler); if (i >= 0) _listeners.splice(i, 1) }
  }, [])
  if (!req) return null
  return <BuildDrawer key={req.id} projectId={req.projectId} buildId={req.buildId} repoDir={req.repoDir} store={req.store} onClose={() => setReq(null)} />
}
