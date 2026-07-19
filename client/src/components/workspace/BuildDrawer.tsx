import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, StopCircle, Hammer, CheckCircle2, AlertTriangle, Wand2, ArrowUpRight } from 'lucide-react'
import { toast } from '../Toast'
import { startBuild, getActiveBuilds, cancelBuild, buildStreamUrl } from '../../lib/api'

type Phase = 'confirm' | 'starting' | 'running' | 'done' | 'error'
interface Verdict { exitCode: number; publishReady: boolean; stage: string | null; reason: string | null }

// Live self-heal board state, accumulated from the structured `heal` SSE events (src/lib/buildRuns.js
// emitHeal). Turns the raw maestro log into "round 2/3 · loom ×3 · gate-autofix converged" so a human
// WATCHES it fix itself to green instead of reading terminal text.
interface HealState { stage?: string; round?: number; max?: number; visual?: number; code?: number; fixes: Record<string, number>; converged: string[]; escalated: { layer: string; count: number }[]; stalled?: number }
const EMPTY_HEAL: HealState = { fixes: {}, converged: [], escalated: [] }
function reduceHeal(h: HealState, m: { kind: string; [k: string]: unknown }): HealState {
  switch (m.kind) {
    case 'stage': return { ...h, stage: `${m.n}/4 ${m.label}` }
    case 'round': return { ...h, round: m.round as number, max: m.max as number, visual: m.visual as number, code: m.code as number }
    case 'fix': { const o = m.owner as string; return { ...h, fixes: { ...h.fixes, [o]: (h.fixes[o] || 0) + (m.count as number) } } }
    case 'converged': return h.converged.includes(m.layer as string) ? h : { ...h, converged: [...h.converged, m.layer as string] }
    case 'escalate': return { ...h, escalated: [...h.escalated, { layer: m.layer as string, count: m.count as number }] }
    case 'stalled': return { ...h, stalled: m.blockers as number }
    default: return h
  }
}

// Runs an autonomous Maestro build (DEV mode — build/verify/auto-heal + preview,
// NEVER pushes to the live theme) and streams it. Reuses the /api/build engine:
// the run survives refresh/navigation (buildRuns registry) and reattaches on open.
export default function BuildDrawer({ buildId, repoDir, store, onClose }: { projectId?: string; buildId: string; repoDir: string; store?: string | null; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [output, setOutput] = useState('')
  const [heal, setHeal] = useState<HealState>(EMPTY_HEAL)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const runId = `wsb-${buildId}`.slice(0, 64)

  const attach = useCallback((id: string) => {
    if (esRef.current) esRef.current.close()
    setPhase('running')
    const es = new EventSource(buildStreamUrl(id))
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data)
        if (m.type === 'chunk' && typeof m.content === 'string') setOutput((o) => o + m.content)
        else if (m.type === 'heal') setHeal((h) => reduceHeal(h, m))
        else if (m.type === 'done') { setVerdict(m); setPhase('done'); es.close() }
        else if (m.type === 'error') { setOutput((o) => o + `\n[error] ${m.error || m.code}\n`); setPhase('error'); es.close() }
      } catch { /* heartbeat/comment */ }
    }
    es.onerror = () => { /* EventSource auto-retries; terminal handled by done/error */ }
  }, [])

  // on mount: reattach if a build for this project is already running
  useEffect(() => {
    let alive = true
    getActiveBuilds().then((d) => {
      if (!alive) return
      if (d.builds.some((b) => b.id === runId)) attach(runId)
    }).catch(err => console.error('[build-drawer] active-builds reattach check failed:', err instanceof Error ? err.message : err))
    return () => { alive = false; if (esRef.current) esRef.current.close() }
  }, [runId, attach])

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [output])

  const start = async () => {
    setPhase('starting'); setHeal(EMPTY_HEAL)
    try {
      const r = await startBuild({ repoPath: repoDir, buildId: runId, renderMode: 'dev' })
      void r
      attach(runId)
    } catch (e) {
      setPhase('error'); toast('error', e instanceof Error ? e.message : 'Build failed to start')
    }
  }
  const cancel = async () => { try { await cancelBuild(runId); toast('warn', 'Build cancelled') } catch { /* */ } }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-[620px] max-w-full h-full bg-surface border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Hammer className="w-4 h-4 text-accent shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-sm">Autonomous build</div>
              <div className="text-[11px] text-text-muted truncate">{store || repoDir}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {phase === 'confirm' ? (
          <div className="flex-1 flex flex-col px-5 py-5 gap-3">
            <p className="text-[13px]">Run the <b>Maestro autonomous build</b> on this theme: publish-grade gates + Lens visual capture + auto-heal, then a local preview.</p>
            <ul className="text-[12px] text-text-muted space-y-1 list-disc pl-4">
              <li>Runs in <b>dev mode</b> — edits files locally + previews. <b>Never pushes to the live store.</b></li>
              <li>Local edits are reversible via git (shown in Repo & files).</li>
              <li>Takes several minutes and spends tokens. Keeps running if you close this drawer.</li>
            </ul>
            <button onClick={start} className="btn-primary btn-sm flex items-center gap-1.5 self-start mt-1"><Hammer className="w-4 h-4" /> Start build</button>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2 text-[12px]">
              {phase === 'starting' || phase === 'running'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /><span className="text-text-muted">{phase === 'starting' ? 'Starting…' : 'Building — keeps running if you close this'}</span></>
                : verdict
                  ? <span className={`flex items-center gap-1.5 font-medium ${verdict.publishReady ? 'text-green' : 'text-amber'}`}>
                      {verdict.publishReady ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {verdict.publishReady ? 'Publish-ready' : `Not ready${verdict.stage ? ` · ${verdict.stage}` : ''}`}
                      {verdict.reason ? <span className="text-text-muted font-normal">— {verdict.reason}</span> : null}
                    </span>
                  : <span className={phase === 'error' ? 'text-red' : 'text-text-muted'}>{phase === 'error' ? 'Build error' : 'Done'}</span>}
            </div>
            {(heal.stage || heal.round || heal.converged.length || heal.escalated.length || heal.stalled != null) && (
              <div className="mx-4 mt-3 rounded-lg border border-border bg-surface-2 p-3 text-[12px] space-y-1.5 shrink-0">
                <div className="font-semibold flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-accent" /> Self-heal</div>
                {heal.stage && <div className="text-text-muted">Stage {heal.stage}</div>}
                {heal.round != null && (
                  <div>Heal round <b>{heal.round}/{heal.max}</b> — <span className={heal.visual ? '' : 'text-text-muted'}>{heal.visual ?? 0} visual</span> + <span className={heal.code ? '' : 'text-text-muted'}>{heal.code ?? 0} code/content</span> blocker(s)</div>
                )}
                {Object.keys(heal.fixes).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">{Object.entries(heal.fixes).map(([o, n]) => <span key={o} className="px-1.5 py-0.5 rounded-full bg-surface border border-border text-[11px]">{o} ×{n}</span>)}</div>
                )}
                {heal.converged.length > 0 && <div className="text-green flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> converged: {heal.converged.join(', ')}</div>}
                {heal.escalated.length > 0 && <div className="text-amber flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5" /> escalated: {heal.escalated.map((e) => `${e.layer} (${e.count})`).join(', ')} — see ESCALATION.md</div>}
                {heal.stalled != null && <div className="text-red flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> stalled at {heal.stalled} blocker(s) — escalating the remainder</div>}
              </div>
            )}
            <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3">
              {output
                ? <pre className="text-[11px] whitespace-pre-wrap break-words font-mono leading-relaxed">{output}</pre>
                : <div className="text-[13px] text-text-muted">Waiting for build output…</div>}
            </div>
            <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Dev mode — local edits only, never the live store.</span>
              {phase === 'running' && <button onClick={cancel} className="btn-ghost btn-sm flex items-center gap-1.5 text-red"><StopCircle className="w-4 h-4" /> Cancel</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
