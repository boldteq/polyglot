import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, FlaskConical, Loader2, CheckCircle2, XCircle, ChevronDown, Zap } from 'lucide-react'
import { getWorkspaceActions, type ActionDef } from '../../lib/api'
import { useWorkspaceAction } from '../../hooks/useWorkspaceAction'

// Cockpit action bar — registry-driven. A primary "Run gates" button + an
// "Actions" dropdown for the rest of the allowlisted safe actions. Every action
// is confirm-gated, runs in the background, polls to completion, toasts the
// verdict, and calls onChanged() so the build detail refreshes (score/gates).
export default function ActionsBar({ buildId, onChanged }: { buildId: string; onChanged?: () => void }) {
  const nav = useNavigate()
  const [actions, setActions] = useState<ActionDef[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { run, trigger } = useWorkspaceAction(buildId, onChanged)

  useEffect(() => {
    getWorkspaceActions()
      // SAFE actions only. Deploy-tier actions (publish) NEVER appear in this
      // casual dropdown — they run only via the gated PublishDrawer flow, and the
      // generic action route 403s them server-side regardless.
      .then((r) => setActions(r.actions.filter((a) => a.tier === 'safe')))
      .catch((e) => console.error('[workspace] actions registry fetch failed:', e instanceof Error ? e.message : e))
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const running = run?.status === 'running'
  const Icon = running ? Loader2 : run?.status === 'done' ? CheckCircle2 : run?.status === 'failed' ? XCircle : Play
  const gates = actions.find((a) => a.id === 'gates:static')
  const rest = actions.filter((a) => a.id !== 'gates:static')

  return (
    <div className="flex items-center gap-2">
      {gates && (
        <button onClick={() => trigger(gates)} disabled={running}
          className="btn-ghost btn-sm flex items-center gap-1.5 disabled:opacity-50" title={gates.description}>
          <Icon className={`w-4 h-4 ${running ? 'animate-spin' : run?.status === 'done' ? 'text-green' : run?.status === 'failed' ? 'text-red' : ''}`} />
          {running ? 'Running…' : 'Run gates'}
        </button>
      )}

      {rest.length > 0 && (
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen((v) => !v)} className="btn-ghost btn-sm flex items-center gap-1.5" title="Run a safe action">
            <Zap className="w-4 h-4" /> Actions <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-surface border border-border rounded-xl shadow-lg py-1 z-[60]">
              {rest.map((a) => (
                <button key={a.id} onClick={() => { setMenuOpen(false); trigger(a) }} disabled={!a.available}
                  className="w-full text-left px-3 py-2 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{a.label}</span>
                    <span className="text-[9px] uppercase tracking-wide text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded">{a.tier}</span>
                  </div>
                  <div className="text-[11px] text-text-muted leading-snug">{a.available ? a.description : a.unavailableReason}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={() => nav('/playground')} className="btn-ghost btn-sm flex items-center gap-1.5" title="Open Playground">
        <FlaskConical className="w-4 h-4" /> Playground
      </button>
    </div>
  )
}
