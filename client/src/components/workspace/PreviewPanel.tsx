import { useEffect, useState, useCallback } from 'react'
import { ExternalLink, Eye, Monitor, Tablet, Smartphone } from 'lucide-react'
import { SkeletonCards } from '../Skeleton'
import EmptyState from '../EmptyState'
import { relTime } from '../../lib/relTime'
import { getLensLatest, type LensLatest, type RepoData } from '../../lib/api'

const VP_ICON: Record<string, typeof Monitor> = { desktop: Monitor, tablet: Tablet, mobile: Smartphone }

// Preview the actual storefront — the "see the live project" gap. Surfaces the
// Shopify theme-preview URL (store + preview_theme_id from the theme-lock) and the
// latest Lens captured frames as a visual snapshot gallery.
export default function PreviewPanel({ dir, repo, reloadKey }: { dir: string; repo: RepoData | null; reloadKey?: number }) {
  const [lens, setLens] = useState<LensLatest | null>(null)
  const [loading, setLoading] = useState(true)
  const lock = repo?.themeLock
  const storeUrl = lock?.store ? `https://${lock.store}` : null
  const previewUrl = lock?.store && lock?.themeId ? `https://${lock.store}/?preview_theme_id=${lock.themeId}` : null

  const load = useCallback(() => {
    getLensLatest(dir).then(setLens).catch(() => setLens(null)).finally(() => setLoading(false))
  }, [dir])
  // reloadKey bumps on workspace SSE (e.g. a Lens run) → refetch the latest frames
  useEffect(() => { setLoading(true); load() }, [load, reloadKey])

  if (loading) return <SkeletonCards count={3} />

  const hasLinks = !!storeUrl
  const frames = lens?.present ? lens.frames : []

  if (!hasLinks && !frames.length) {
    return <EmptyState icon={Eye} title="No preview yet" description="Link a theme (store + theme id) to open the storefront, or run Lens to capture visual snapshots." />
  }

  return (
    <div className="space-y-3">
      {hasLinks && (
        <div className="card p-4 flex items-center gap-3 flex-wrap">
          <span className="text-[13px] text-text-muted flex-1 min-w-0 truncate">{lock?.themeName ? `${lock.themeName} · ` : ''}{lock?.store}</span>
          {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm flex items-center gap-1.5"><Eye className="w-4 h-4" /> Preview this theme</a>}
          {storeUrl && <a href={storeUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm flex items-center gap-1.5"><ExternalLink className="w-4 h-4" /> Storefront</a>}
        </div>
      )}

      {frames.length > 0 ? (
        <div>
          <div className="text-[12px] text-text-muted mb-2">Latest Lens snapshots{lens?.capturedAt ? ` · ${relTime(lens.capturedAt)}` : ''}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {frames.map((f, i) => {
              const Icon = VP_ICON[f.viewport] || Monitor
              return (
                <a key={i} href={f.rest || undefined} target="_blank" rel="noreferrer" className="card overflow-hidden hover:border-accent/40 transition-colors block">
                  <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] text-text-muted capitalize"><Icon className="w-3 h-3" /> {f.surface} · {f.viewport}</div>
                  {f.rest ? <img src={f.rest} alt={`${f.surface} ${f.viewport}`} loading="lazy" className="w-full border-t border-border bg-black/5" /> : <div className="h-24 bg-surface-2" />}
                </a>
              )
            })}
          </div>
        </div>
      ) : hasLinks ? (
        <p className="text-[12px] text-text-muted px-1">No Lens snapshots yet — run Lens to capture how the storefront renders.</p>
      ) : null}
    </div>
  )
}
