import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, StopCircle, Send, Bot } from 'lucide-react'
import { toast } from '../Toast'
import { buildWorkspaceDispatch } from '../../lib/api'

type Phase = 'compose' | 'starting' | 'running' | 'done' | 'error'

// The theme-build agents you'd typically ask for a change. Labelled by craft.
const AGENTS: { id: string; label: string }[] = [
  { id: 'loom', label: 'loom · Liquid / CSS / JS' },
  { id: 'drape', label: 'drape · design / layout' },
  { id: 'ink', label: 'ink · copy' },
  { id: 'conduit', label: 'conduit · data / apps' },
  { id: 'beacon', label: 'beacon · SEO' },
  { id: 'atrium', label: 'atrium · lead / triage' },
]

// Inline "describe a change" composer — the EDIT half of the Studio. Reuses the
// proven dispatch streaming (DispatchDrawer pipeline verbatim): POST
// /api/playground/run → SSE, reattach via /active?threadId, cancel via /cancel.
// The run survives navigation (wsd-<buildId> thread). Calls onDone() when the
// agent finishes so the Studio can offer to re-capture the preview.
export default function DispatchComposer({ buildId, onDone }: { buildId: string; onDone?: () => void }) {
  const [agent, setAgent] = useState('loom')
  const [phase, setPhase] = useState<Phase>('compose')
  const [taskText, setTaskText] = useState('')
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
            else if (ev.type === 'done') { setOutput((o) => (ev.output && !o ? ev.output : o)); setPhase('done'); onDone?.() }
            else if (ev.type === 'error') { setPhase('error'); if (ev.error) toast('error', String(ev.error).slice(0, 200)) }
          } catch { /* keepalive */ }
        }
      }
      setPhase((p) => { if (p === 'running') { onDone?.(); return 'done' } return p })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { setPhase('error'); console.error('[studio] stream error:', (e as Error).message) }
    }
  }, [onDone])

  // reattach to an in-flight dispatch for this build, if any
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
    return () => { cancelled = true; ac.abort() }
  }, [threadId, pump])

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight }, [output])

  const dispatch = async () => {
    if (!taskText.trim()) { toast('warn', 'Describe the change first'); return }
    const ac = new AbortController(); abortRef.current = ac
    setPhase('starting'); setOutput('')
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

  const busy = phase === 'starting' || phase === 'running'
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 space-y-2 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-accent shrink-0" />
          <select value={agent} onChange={(e) => setAgent(e.target.value)} disabled={busy}
            className="input text-[12px] py-1 flex-1 min-w-0" aria-label="Agent">
            {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <textarea value={taskText} onChange={(e) => setTaskText(e.target.value)} rows={3} disabled={busy}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) dispatch() }}
          className="input w-full text-[13px] resize-none" placeholder="Describe a change — e.g. “make the hero headline bigger and add a sticky add-to-cart on mobile”. ⌘↵ to send." />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-muted">Local theme edits only — never the live store.</span>
          {busy
            ? <button onClick={cancelRun} className="btn-ghost btn-sm flex items-center gap-1.5 text-red text-[11px]"><StopCircle className="w-3.5 h-3.5" /> Cancel</button>
            : <button onClick={dispatch} className="btn-primary btn-sm flex items-center gap-1.5"><Send className="w-4 h-4" /> Make change</button>}
        </div>
      </div>
      <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto pt-3">
        {phase === 'starting' && <div className="flex items-center gap-2 text-[12px] text-text-muted"><Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />Starting…</div>}
        {output
          ? <pre className="text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed">{output}</pre>
          : phase === 'compose' && <div className="text-[13px] text-text-muted">Describe a change above and the agent edits the theme files. Then capture the preview on the right to see it.</div>}
        {phase === 'done' && <div className="mt-2 text-[12px] text-green">Done — capture the preview to see the change.</div>}
      </div>
    </div>
  )
}
