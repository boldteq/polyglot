import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, StopCircle, Bot, Send } from 'lucide-react'
import { toast } from '../Toast'
import { buildWorkspaceDispatch } from '../../lib/api'

// Slide-over that dispatches the owning agent against a build and streams its
// output live. Opens in a COMPOSE phase (prefilled, editable task — the user
// reviews before the agent runs, which also gates the mutation). Reuses the
// /api/playground/run pipeline verbatim (spawn + stream + reattach + cancel), so
// the run SURVIVES refresh/navigation: on open it first reattaches to any
// in-flight dispatch for this build; closing the drawer does NOT kill the run.
type Phase = 'compose' | 'starting' | 'running' | 'done' | 'error'

export default function DispatchDrawer({ buildId, agent, task, onClose }: { buildId: string; agent: string; task: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('compose')
  const [taskText, setTaskText] = useState(task)
  const [output, setOutput] = useState('')
  const [runId, setRunId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const threadId = `wsd-${buildId}`.slice(0, 64)

  const pump = useCallback(async (resp: Response) => {
    if (!resp.body) { setPhase('error'); toast('error', 'No response stream'); return }
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = ''
    setPhase('running')
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const ev = JSON.parse(line.slice(5).trim())
            if (ev.type === 'chunk' && typeof ev.content === 'string') setOutput((o) => o + ev.content)
            else if (ev.type === 'done') { setOutput((o) => (ev.output && !o ? ev.output : o)); setPhase('done') }
            else if (ev.type === 'error') { setPhase('error'); if (ev.error) toast('error', String(ev.error).slice(0, 200)) }
          } catch { /* ignore keepalives */ }
        }
      }
      setPhase((p) => (p === 'running' ? 'done' : p))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setPhase('error'); console.error('[dispatch] stream error:', (e as Error).message) }
    }
  }, [])

  // On mount: reattach to an in-flight dispatch for this build, if any.
  useEffect(() => {
    const ac = new AbortController(); abortRef.current = ac
    let cancelled = false
    ;(async () => {
      try {
        const active = await fetch(`/api/playground/active?threadId=${encodeURIComponent(threadId)}`, { signal: ac.signal })
          .then((r) => r.json()).catch(() => null)
        if (active?.active && active.runId && !cancelled) {
          setRunId(active.runId)
          if (active.output) setOutput(active.output)
          const resp = await fetch(`/api/playground/run/${encodeURIComponent(active.runId)}/stream`, { signal: ac.signal })
          await pump(resp)
        }
      } catch { /* stay in compose */ }
    })()
    return () => { cancelled = true; ac.abort() } // detach (do NOT kill the run)
  }, [threadId, pump])

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [output])

  const dispatch = async () => {
    if (!taskText.trim()) { toast('warn', 'Task is empty'); return }
    const ac = new AbortController(); abortRef.current = ac
    setPhase('starting')
    try {
      const payload = await buildWorkspaceDispatch(buildId, agent, taskText.trim())
      setRunId(payload.threadId)
      const resp = await fetch('/api/playground/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ agentName: payload.agentName, prompt: payload.prompt, threadId: payload.threadId, historyId: payload.threadId }),
      })
      if (!resp.ok) { setPhase('error'); toast('error', `Dispatch failed (${resp.status})`); return }
      await pump(resp)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setPhase('error'); toast('error', e instanceof Error ? e.message : 'Dispatch failed') }
    }
  }

  const cancelRun = async () => {
    if (!runId) return
    try { await fetch(`/api/playground/run/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }); toast('warn', 'Dispatch cancelled') } catch { /* */ }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-[560px] max-w-full h-full bg-surface border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-4 h-4 text-accent shrink-0" />
            <div className="font-semibold text-sm">Dispatch · {agent}</div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {phase === 'compose' ? (
          <div className="flex-1 flex flex-col px-4 py-4 gap-3">
            <label className="text-[12px] text-text-muted">Task for <b>{agent}</b> (review/edit before dispatch)</label>
            <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={6}
              className="input w-full text-[13px] resize-none" placeholder="Describe what the agent should do…" />
            <p className="text-[11px] text-text-muted">The agent works on the build's theme files (local edits only — never the live store). It keeps running if you close this drawer.</p>
            <button onClick={dispatch} className="btn-primary btn-sm flex items-center gap-1.5 self-start"><Send className="w-4 h-4" /> Dispatch {agent}</button>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2 text-[12px]">
              {phase === 'starting' || phase === 'running'
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /><span className="text-text-muted">{phase === 'starting' ? 'Starting…' : 'Running — keeps going if you close this'}</span></>
                : phase === 'done' ? <span className="text-green">Done</span> : <span className="text-red">Error</span>}
            </div>
            <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3">
              {output
                ? <pre className="text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed">{output}</pre>
                : <div className="text-[13px] text-text-muted">Waiting for the agent…</div>}
            </div>
            <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Local theme edits only — never the live store.</span>
              {phase === 'running' && (
                <button onClick={cancelRun} className="btn-ghost btn-sm flex items-center gap-1.5 text-red"><StopCircle className="w-4 h-4" /> Cancel</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
