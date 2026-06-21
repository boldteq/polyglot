import { useEffect, useState } from 'react'
import DispatchDrawer from '../components/workspace/DispatchDrawer'

// Global imperative agent-dispatch drawer — mirrors confirmDialog()/toast() so any
// workspace surface can dispatch the owning agent with one line:
//
//   openDispatch({ buildId, agent: 'loom', task: 'Fix the hero spacing on mobile' })
//
// The drawer drives the run through the existing /api/playground/run pipeline
// (reattach-surviving), so it keeps running across refresh/navigation.

export interface DispatchRequest { buildId: string; agent: string; task: string }
interface ActiveRequest extends DispatchRequest { id: number }

let _nextId = 1
const _listeners: Array<(r: ActiveRequest | null) => void> = []

export function openDispatch(req: DispatchRequest) {
  const active: ActiveRequest = { ...req, id: _nextId++ }
  _listeners.forEach((fn) => fn(active))
}

export function DispatchHost() {
  const [req, setReq] = useState<ActiveRequest | null>(null)
  useEffect(() => {
    const handler = (r: ActiveRequest | null) => setReq(r)
    _listeners.push(handler)
    return () => { const i = _listeners.indexOf(handler); if (i >= 0) _listeners.splice(i, 1) }
  }, [])
  if (!req) return null
  return <DispatchDrawer key={req.id} buildId={req.buildId} agent={req.agent} task={req.task} onClose={() => setReq(null)} />
}
