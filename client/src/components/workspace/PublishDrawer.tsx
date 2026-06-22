import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, Rocket, CheckCircle2, AlertTriangle, ShieldAlert, ExternalLink, Clock } from 'lucide-react'
import { toast } from '../Toast'
import { workspacePublish, getWorkspaceAction, type PublishRun, type ActionRun } from '../../lib/api'

type Phase = 'intro' | 'preflighting' | 'preflight-pass' | 'preflight-block' | 'confirm' | 'publishing' | 'published' | 'publish-failed'

// The live-store publish flow — the only place the panel can flip a theme to LIVE.
// Two hard gates on top of the script's own 7-gate chain:
//   1) PREFLIGHT (dry-run) must PASS before publish is even offered.
//   2) the user must TYPE the exact store domain (server re-checks before spawn).
// Both server-enforced — this UI just makes the gate legible.
export default function PublishDrawer({ projectId, store, themeName, onClose, onPublished }: {
  projectId: string; store: string; themeName?: string | null; onClose: () => void; onPublished?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [log, setLog] = useState('')
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const aliveRef = useRef(true)

  useEffect(() => () => { aliveRef.current = false; if (pollRef.current) clearTimeout(pollRef.current) }, [])
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [log])

  // poll an action run until it leaves 'running'; resolve with the terminal record
  const pollRun = useCallback((runId: string): Promise<ActionRun> => new Promise((resolve, reject) => {
    const tick = () => {
      getWorkspaceAction(runId).then((rec) => {
        if (!aliveRef.current) return
        setLog(rec.log || '')
        if (rec.status === 'running') { pollRef.current = setTimeout(tick, 1400); return }
        resolve(rec)
      }).catch((e) => reject(e))
    }
    tick()
  }), [])

  const runPreflight = async () => {
    setErr(null); setLog(''); setPhase('preflighting')
    try {
      const r: PublishRun = await workspacePublish(projectId, { mode: 'preflight' })
      const rec = await pollRun(r.runId)
      if (!aliveRef.current) return
      // dry-run exit 0 = all preconditions PASS; non-zero = blocked
      setPhase(rec.status === 'done' ? 'preflight-pass' : 'preflight-block')
    } catch (e) {
      setPhase('intro'); setErr(e instanceof Error ? e.message : 'Preflight failed')
    }
  }

  const publish = async () => {
    if (typed !== store) return
    setErr(null); setLog(''); setPhase('publishing')
    try {
      const r: PublishRun = await workspacePublish(projectId, { mode: 'flip', confirm: typed })
      const rec = await pollRun(r.runId)
      if (!aliveRef.current) return
      if (rec.status === 'done') { setPhase('published'); toast('success', `Published to ${store}`); onPublished?.() }
      else { setPhase('publish-failed') }
    } catch (e) {
      setPhase('confirm'); setErr(e instanceof Error ? e.message : 'Publish failed')
    }
  }

  const busy = phase === 'preflighting' || phase === 'publishing'
  const storeUrl = store.startsWith('http') ? store : `https://${store}`

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} aria-hidden />
      <div className="relative w-[640px] max-w-full h-full bg-surface border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Rocket className="w-4 h-4 text-accent shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-sm">Publish to live store</div>
              <div className="text-[11px] text-text-muted truncate">{themeName ? `${themeName} · ` : ''}{store}</div>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="text-text-muted hover:text-text disabled:opacity-40" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {err && <div className="card p-3 text-red text-[12px] flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{err}</div>}

          {/* step 1 — preflight */}
          {phase === 'intro' && (
            <>
              <p className="text-[13px]">Publishing flips the <b>locked theme</b> to LIVE on <b>{store}</b> — visitors see it immediately. First, run a <b>preflight</b>: it runs the full publish gate chain in dry-run mode (lock match · publish-readiness · CHANGES complete · gates fresh + passing incl. Lens) and <b>never flips</b>.</p>
              <button onClick={runPreflight} className="btn-primary btn-sm flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Run preflight</button>
            </>
          )}

          {(phase === 'preflighting' || phase === 'publishing') && (
            <div className="flex items-center gap-2 text-[13px] text-text-muted"><Loader2 className="w-4 h-4 animate-spin text-accent" />{phase === 'preflighting' ? 'Running preflight (dry-run)…' : 'Publishing — flipping the theme live…'}</div>
          )}

          {phase === 'preflight-block' && (
            <div className="card p-3 text-amber text-[12px] flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><div><b>Preflight blocked.</b> This build is not publish-ready — a gate failed. Fix the blockers below, then preflight again. Publishing is not available.</div></div>
          )}

          {/* step 2 — confirm (only after preflight passes) */}
          {(phase === 'preflight-pass' || phase === 'confirm') && (
            <>
              <div className="card p-3 text-green text-[12px] flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><div><b>Preflight passed.</b> Every precondition is green. To publish to the LIVE store, type the exact store domain below.</div></div>
              <div className="card p-3 border-amber/40 bg-amber/5 text-[12px] flex items-start gap-2"><ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber" /><div>This mutates the <b>live storefront</b>. There is no undo from here (mantle keeps a pre-publish snapshot for rollback).</div></div>
              <label className="block text-[12px] text-text-muted">Type <code className="text-text font-mono bg-surface-2 px-1 rounded">{store}</code> to confirm
                <input value={typed} onChange={(e) => { setTyped(e.target.value); setPhase('confirm') }} placeholder={store} spellCheck={false} autoComplete="off"
                  className="mt-1.5 w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-[13px] font-mono focus:border-accent outline-none" />
              </label>
              <button onClick={publish} disabled={typed !== store}
                className="btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"><Rocket className="w-4 h-4" /> Publish to {store}</button>
            </>
          )}

          {phase === 'published' && (
            <div className="space-y-3">
              <div className="card p-3 text-green text-[13px] flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><div><b>Published.</b> The theme is now live on {store}.</div></div>
              <div className="flex items-start gap-2 text-[12px] text-text-muted px-1"><Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" /><span>Monitoring scheduled — 48h watch + 30/90d results. Track it in the <b>Monitoring</b> section.</span></div>
              <a href={storeUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm flex items-center gap-1.5 self-start w-fit"><ExternalLink className="w-4 h-4" /> Open storefront</a>
            </div>
          )}

          {phase === 'publish-failed' && (
            <div className="card p-3 text-red text-[12px] flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><div><b>Publish failed or was blocked.</b> The theme was NOT flipped (the gate chain re-runs at publish time and refuses on any failure). See the log below.</div></div>
          )}

          {log && (
            <div>
              <div className="text-[11px] text-text-muted mb-1">Output</div>
              <pre className="text-[11px] whitespace-pre-wrap break-words font-mono leading-relaxed bg-surface-2 rounded-lg p-3 max-h-72 overflow-y-auto">{log}</pre>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-text-muted">Publishing is gate-blocked + store-name confirmed — server-enforced.</span>
          {(phase === 'preflight-block' || phase === 'publish-failed') && (
            <button onClick={runPreflight} className="btn-ghost btn-sm">Re-run preflight</button>
          )}
        </div>
      </div>
    </div>
  )
}
