import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, StopCircle, Hammer, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from '../Toast'
import { startBuild, getActiveBuilds, cancelBuild, buildStreamUrl } from '../../lib/api'

type Phase = 'confirm' | 'starting' | 'running' | 'done' | 'error'
interface Verdict { exitCode: number; publishReady: boolean; stage: string | null; reason: string | null }

// Runs an autonomous Maestro build (DEV mode — build/verify/auto-heal + preview,
// NEVER pushes to the live theme) and streams it. Reuses the /api/build engine:
// the run survives refresh/navigation (buildRuns registry) and reattaches on open.
export default function BuildDrawer({ buildId, repoDir, store, onClose }: { projectId?: string; buildId: string; repoDir: string; store?: string | null; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [output, setOutput] = useState('')
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
    }).catch(() => {})
    return () => { alive = false; if (esRef.current) esRef.current.close() }
  }, [runId, attach])

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [output])

  const start = async () => {
    setPhase('starting')
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
