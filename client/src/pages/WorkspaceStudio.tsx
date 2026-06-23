import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Loader2, Eye } from 'lucide-react'
import { Spinner } from '../components/Skeleton'
import { ErrorState } from '../components/ErrorState'
import EmptyState from '../components/EmptyState'
import DispatchComposer from '../components/workspace/DispatchComposer'
import PreviewPanel from '../components/workspace/PreviewPanel'
import { useWorkspaceAction } from '../hooks/useWorkspaceAction'
import { fetchWorkspaceActions } from '../hooks/useWorkspaceActions'
import { getWorkspaceProject, getWorkspaceProjectRepo, type ProjectDetail, type RepoData, type ActionDef } from '../lib/api'

// Studio — the "Lovable-like" view: describe a change on the LEFT (an agent edits
// the theme files, streamed live) and SEE it on the RIGHT (Lens-captured preview
// + the live storefront link). Iterate together. (Shopify storefronts can't be
// iframed — X-Frame-Options + our CSP frame-src 'none' — so the preview is
// Lens-capture + open-in-tab, not an embedded frame.)
export default function WorkspaceStudio() {
  const { id } = useParams()
  const nav = useNavigate()
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [repo, setRepo] = useState<RepoData | null>(null)
  const [lensAction, setLensAction] = useState<ActionDef | null>(null)
  const [captureKey, setCaptureKey] = useState(0)
  const [stale, setStale] = useState(false) // an agent edited the theme since the last capture
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    setError(null)
    getWorkspaceProject(id)
      .then((d) => {
        setDetail(d)
        if (d.hasBuild) getWorkspaceProjectRepo(id).then(setRepo).catch(() => setRepo(null))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load project'))
      .finally(() => setLoading(false))
  }, [id])
  useEffect(() => { setLoading(true); load() }, [load])

  useEffect(() => {
    fetchWorkspaceActions().then((actions) => setLensAction(actions.find((a) => a.id === 'lens:run') || null)).catch(() => setLensAction(null))
  }, [])

  const buildId = detail?.buildId || ''
  const dir = detail?.build?.dir
  // capture refreshes the preview pane (remount) when it finishes + clears staleness
  const { run, trigger } = useWorkspaceAction(buildId, () => { setCaptureKey((k) => k + 1); setStale(false) })
  const capturing = run?.status === 'running' && run.action === 'lens:run'

  if (loading && !detail) return <div className="p-6"><Spinner /></div>
  if (error) return <div className="p-6"><ErrorState message={error} onRetry={load} /></div>
  if (!detail) return null

  return (
    <div className="flex flex-col h-[calc(100vh-1px)]">
      {/* header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => nav(`/workspace/p/${id}`)} className="btn-ghost btn-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /></button>
          <div className="min-w-0">
            <div className="font-semibold text-sm capitalize truncate">{detail.project.name} · Studio</div>
            <div className="text-[11px] text-text-muted truncate">{repo?.themeLock?.store || detail.project.domain || 'describe a change → see it'}</div>
          </div>
        </div>
        {dir && lensAction && (
          <button onClick={() => trigger(lensAction)} disabled={capturing || !lensAction.available}
            title={lensAction.available ? 'Capture the rendered preview (Lens)' : (lensAction.unavailableReason || '')}
            className={`btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50 ${stale && !capturing ? 'ring-2 ring-accent/40 animate-pulse' : ''}`}>
            {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {capturing ? 'Capturing…' : stale ? 'Capture to see change' : 'Capture preview'}
          </button>
        )}
      </div>

      {!detail.hasBuild || !buildId ? (
        <div className="flex-1 grid place-items-center p-6">
          <EmptyState icon={Eye} title="No build linked" description="Link a discovered theme folder to this project to use Studio." />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* EDIT */}
          <div className="w-[42%] min-w-[340px] border-r border-border flex flex-col p-4 min-h-0">
            <DispatchComposer buildId={buildId} onDone={() => setStale(true)} />
          </div>
          {/* PREVIEW */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-3">
            {stale && (
              <div className="card px-3 py-2 bg-accent/5 border-accent/30 flex items-center gap-2 text-[12px]">
                <Camera className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="flex-1">The agent edited the theme — capture the preview to see the change.</span>
                {dir && lensAction && <button onClick={() => trigger(lensAction)} disabled={capturing || !lensAction.available} className="btn-primary btn-sm text-[11px] disabled:opacity-50">{capturing ? 'Capturing…' : 'Capture now'}</button>}
              </div>
            )}
            {dir ? <PreviewPanel key={`prev-${captureKey}`} dir={dir} repo={repo} /> : null}
          </div>
        </div>
      )}
    </div>
  )
}
