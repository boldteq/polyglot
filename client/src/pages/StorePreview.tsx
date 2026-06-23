import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquarePlus, ExternalLink, CheckCircle2 } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import { getShopifyProject, requestPageRevision, type ProjectPage, type ProjectRevision, type ClientProject } from '../lib/api'
import { toast } from '../components/Toast'

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-text-muted/15 text-text-muted', built: 'bg-purple text-white',
  'gates-green': 'bg-purple text-white', 'lens-passed': 'bg-green text-white',
  'awaiting-review': 'bg-amber text-white', approved: 'bg-green text-white',
}

export default function StorePreview() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<{ project: ClientProject & { intake: Record<string, unknown> }; pages: ProjectPage[]; revisions: ProjectRevision[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openRev, setOpenRev] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const load = useCallback(() => {
    setError(null)
    getShopifyProject(id).then(setData).catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])
  useEffect(() => { load() }, [load])

  const sendRevision = async (slug: string) => {
    if (!feedback.trim()) return
    try {
      await requestPageRevision(id, slug, feedback.trim())
      toast('success', `Revision requested on ${slug} — only that page rebuilds`)
      setOpenRev(null); setFeedback(''); load()
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Revision failed') }
  }

  return (
    <PageShell
      title={data?.project.name || 'Store'}
      subtitle={data ? `${data.project.niche || 'niche tbd'} · ${data.project.status} · review every page, request a change on any one` : 'Loading…'}
      actions={<button onClick={() => nav('/shopify')} className="btn-ghost btn-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />All stores</button>}
    >
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          {/* pages */}
          <div className="space-y-3">
            {data.pages.map(p => (
              <div key={p.slug} className="card p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {p.status === 'approved' ? <CheckCircle2 className="w-5 h-5 text-green" /> : null}
                    <div>
                      <div className="font-semibold capitalize">{p.title || p.slug}</div>
                      <div className="text-[12px] text-text-muted">/{p.slug}{p.updated_at ? ` · updated ${new Date(p.updated_at).toLocaleString()}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_TONE[p.status] || 'bg-text-muted/15 text-text-muted'}`}>{p.status}</span>
                    {p.preview_url && <a href={p.preview_url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />Preview</a>}
                    <button onClick={() => { setOpenRev(openRev === p.slug ? null : p.slug); setFeedback('') }} className="btn-secondary btn-sm flex items-center gap-1.5"><MessageSquarePlus className="w-3.5 h-3.5" />Request change</button>
                  </div>
                </div>
                {openRev === p.slug && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <textarea className="input w-full" rows={2} value={feedback} onChange={e => setFeedback(e.target.value)} placeholder={`What should change on the ${p.title || p.slug} page? (only this page rebuilds)`} autoFocus />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setOpenRev(null)} className="btn-ghost btn-sm">Cancel</button>
                      <button disabled={!feedback.trim()} onClick={() => sendRevision(p.slug)} className="btn-primary btn-sm disabled:opacity-50">Send revision</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* revision history */}
          {data.revisions.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold mb-3">Revision requests ({data.revisions.length})</h3>
              <ul className="space-y-2 text-[13px]">
                {data.revisions.map(r => (
                  <li key={r.id} className="flex gap-2">
                    <span className="text-xs bg-text-muted/15 text-text-muted px-2 py-0.5 rounded-full h-fit shrink-0">{r.page_slug}</span>
                    <span className="text-text-muted">{r.feedback} <em className="opacity-60">· {r.status} · {new Date(r.created_at).toLocaleString()}</em></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
