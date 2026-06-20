import { useState, useRef, useEffect, useCallback } from 'react'
import { Hammer, StopCircle, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { PageShell, SectionCard } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import { useApi } from '../hooks/useApi'
import {
  getWorkspaceClients, startBuild, getActiveBuilds, cancelBuild, buildStreamUrl, apiError,
  type BuildStreamEvent,
} from '../lib/api'

// One-button autonomous build — the "Lovable front door". Brief + a linked theme repo
// → maestro:build runs hands-off (publish-grade gates + Lens + auto-heal), streamed
// live and resilient to refresh (the run keeps going server-side; on reload we reattach
// to any in-flight build via GET /build/active → the stream replays the buffered log).

const ACTIVE_BUILD_KEY = 'polyglot.build.activeBuild'

interface Verdict { publishReady?: boolean; stage?: string | null; reason?: string | null; exitCode: number | null }

export default function Build() {
  const [repoPath, setRepoPath] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [brief, setBrief] = useState('')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [buildId, setBuildId] = useState<string | null>(null)
  const [store, setStore] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLPreElement | null>(null)

  // Known stores (context hint + a datalist for the repo field). Build input is the
  // repo PATH — there is no store→path registry, so the path is the source of truth.
  const { data: clientsData } = useApi(getWorkspaceClients, [], 'workspace/clients')
  const knownStores = Array.from(
    new Set((clientsData?.clients || []).map((c) => c.store).filter((s): s is string => !!s)),
  ).sort()

  const closeStream = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
  }, [])

  // Open (or re-open) the SSE stream for a build. Used for both initial watch + reattach.
  // The server replays the full buffered log on (re)connect, so we reset output on `start`.
  const attach = useCallback((id: string) => {
    closeStream()
    const es = new EventSource(buildStreamUrl(id))
    esRef.current = es
    setBuildId(id)
    setRunning(true)
    es.onmessage = (ev) => {
      let e: BuildStreamEvent
      try { e = JSON.parse(ev.data) as BuildStreamEvent } catch { return }
      if (e.type === 'start') {
        setOutput('')
        setStore(e.store)
        if (e.brief) setBrief(e.brief)
        if (e.previewUrl) setPreviewUrl(e.previewUrl)
      } else if (e.type === 'chunk') {
        setOutput((prev) => prev + e.content)
      } else if (e.type === 'done') {
        setVerdict({ publishReady: e.publishReady, stage: e.stage, reason: e.reason, exitCode: e.exitCode })
        setRunning(false)
        closeStream()
        try { localStorage.removeItem(ACTIVE_BUILD_KEY) } catch { /* quota */ }
        toast(e.publishReady ? 'success' : 'warn', e.publishReady ? 'Build is PUBLISH-READY' : `Build stopped: ${e.reason || 'not ready'}`)
      } else if (e.type === 'error') {
        if (e.code === 'build_not_found') {
          // Finished + evicted while we were away — nothing to reattach to.
          setRunning(false)
          closeStream()
          try { localStorage.removeItem(ACTIVE_BUILD_KEY) } catch { /* */ }
        } else {
          setOutput((prev) => prev + `\n[error] ${e.error}\n`)
        }
      }
    }
    // EventSource auto-reconnects on transient errors; only a terminal event closes it.
    es.onerror = () => { /* keep — browser retries; terminal events close explicitly */ }
  }, [closeStream])

  // Reattach on mount: server is the source of truth for in-flight builds.
  const reattachedRef = useRef(false)
  useEffect(() => {
    if (reattachedRef.current) return
    reattachedRef.current = true
    getActiveBuilds()
      .then(({ builds }) => {
        if (!builds.length) { try { localStorage.removeItem(ACTIVE_BUILD_KEY) } catch { /* */ }; return }
        const saved = (() => { try { return JSON.parse(localStorage.getItem(ACTIVE_BUILD_KEY) || 'null') } catch { return null } })()
        const target = builds.find((b) => b.id === saved?.buildId) || builds[0]
        toast('success', 'Reconnected to a running build')
        attach(target.id)
      })
      .catch((err) => apiError('Check active builds', err))
    return () => closeStream()
  }, [attach, closeStream])

  const onBuild = useCallback(async () => {
    if (!repoPath.trim()) { toast('error', 'Enter the linked theme repo path'); return }
    setVerdict(null)
    setOutput('')
    setRunning(true)
    try {
      const { buildId: id, store: st } = await startBuild({
        repoPath: repoPath.trim(),
        previewUrl: previewUrl.trim() || undefined,
        brief: brief.trim() || undefined,
      })
      setStore(st)
      try { localStorage.setItem(ACTIVE_BUILD_KEY, JSON.stringify({ buildId: id })) } catch { /* quota */ }
      attach(id)
    } catch (err) {
      setRunning(false)
      apiError('Start build', err)
    }
  }, [repoPath, previewUrl, brief, attach])

  const onStop = useCallback(async () => {
    if (!buildId) return
    if (!(await confirmDialog({ title: 'Stop this build?', message: 'The running build will be terminated.', confirmLabel: 'Stop build' }))) return
    try { await cancelBuild(buildId) } catch (err) { apiError('Stop build', err) }
  }, [buildId])

  // Keep the log scrolled to the newest output.
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [output])

  return (
    <PageShell
      title="Build"
      subtitle="One brief → autonomous Shopify build → live preview"
      fullHeight
      actions={running
        ? <button onClick={onStop} className="btn-ghost btn-md flex items-center gap-1.5"><StopCircle className="w-4 h-4" /> Stop</button>
        : <button onClick={onBuild} className="btn-primary btn-md flex items-center gap-1.5"><Hammer className="w-4 h-4" /> Build</button>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full min-h-0">
        {/* Left: the brief form */}
        <div className="lg:col-span-1 flex flex-col gap-4 min-h-0">
          <SectionCard title="Brief">
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-text-muted">Theme repo path <span className="text-accent">*</span></label>
              <input
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="/Users/you/clients/acme-theme"
                className="input font-mono text-xs"
                disabled={running}
                list="known-stores"
              />
              <datalist id="known-stores">{knownStores.map((s) => <option key={s} value={s} />)}</datalist>

              <label className="text-xs font-medium text-text-muted mt-1">Preview URL <span className="text-text-muted">(optional)</span></label>
              <input
                value={previewUrl}
                onChange={(e) => setPreviewUrl(e.target.value)}
                placeholder="http://127.0.0.1:9292"
                className="input font-mono text-xs"
                disabled={running}
              />

              <label className="text-xs font-medium text-text-muted mt-1">Brief <span className="text-text-muted">(optional)</span></label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="What to build / focus areas for this run…"
                rows={5}
                className="input resize-none"
                disabled={running}
              />
              {store && <p className="text-xs text-text-muted">Store: <span className="font-mono">{store}</span></p>}
              <p className="text-[11px] text-text-muted leading-relaxed">
                The repo must be a linked theme repo (has <span className="font-mono">.boldteq-theme-lock.json</span>). maestro runs publish-grade
                gates + Lens + auto-heal, then stops at PUBLISH-READY or a batched escalation.
              </p>
            </div>
          </SectionCard>

          {knownStores.length > 0 && (
            <SectionCard title="Previously built stores">
              <div className="flex flex-col gap-1.5">
                {knownStores.map((s) => (
                  <button key={s} onClick={() => setRepoPath(s)} disabled={running}
                    className="text-left text-xs font-mono text-text-muted hover:text-text truncate disabled:opacity-50">{s}</button>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right: live log + verdict + preview */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <SectionCard
            title="Live build log"
            action={running ? <span className="flex items-center gap-1.5 text-xs text-text-muted"><Spinner className="!h-4 !w-4" /> running…</span> : null}
            className="flex-1 min-h-0 flex flex-col"
            noPadding
          >
            {output
              ? <pre ref={logRef} className="flex-1 min-h-[16rem] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-text whitespace-pre-wrap">{output}</pre>
              : <div className="flex-1 min-h-[16rem] grid place-items-center">
                  <EmptyState icon={Hammer} title="No build running" description="Enter a theme repo path + brief, then press Build." />
                </div>}
          </SectionCard>

          {verdict && (
            <div className={`card p-4 flex items-start gap-3 ${verdict.publishReady ? 'border-green-500/40' : 'border-amber-500/40'}`}>
              {verdict.publishReady
                ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{verdict.publishReady ? 'PUBLISH-READY' : `Not ready — stopped at ${verdict.stage || 'unknown'}`}</p>
                {verdict.reason && <p className="text-xs text-text-muted mt-0.5">{verdict.reason}</p>}
                <p className="text-[11px] text-text-muted mt-1">exit code {verdict.exitCode ?? '—'} · see docs/publish-readiness.md in the repo</p>
              </div>
            </div>
          )}

          {previewUrl && (
            <SectionCard
              title="Preview"
              action={<a href={previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent hover:underline">Open <ExternalLink className="w-3 h-3" /></a>}
              noPadding
            >
              <iframe title="Store preview" src={previewUrl} className="w-full h-80 rounded-b-[inherit] border-0" />
            </SectionCard>
          )}
        </div>
      </div>
    </PageShell>
  )
}
