import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Code2, X, Monitor, Smartphone, ExternalLink, Layers, Image as ImageIcon, ArrowUpDown, Copy, ChevronDown, ChevronLeft, ChevronRight, LayoutTemplate, ArrowUpRight, Hash, Star } from 'lucide-react'
import { PageShell, TabNav } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner, Skeleton } from '../components/Skeleton'
import Collapsible from '../components/Collapsible'
import { writeToClipboard } from '../lib/clipboard'
import { toast } from '../components/Toast'
import {
  getDesignLibraryIndex, getDesignComponent, getPagePilotShots,
  getDesignTemplates, getDesignTemplate, designPreviewUrl, designTemplatePreviewUrl, designShotUrl, designThumbUrl,
  type DesignLibraryIndex, type DesignComponentMeta, type DesignComponent, type PagePilotShot,
  type DesignTemplatesIndex, type DesignTemplate, type DesignTemplateMeta,
} from '../lib/api'

type SortKey = 'featured' | 'az' | 'za' | 'js-first'
const SORT_LABELS: Record<SortKey, string> = { featured: 'Featured', az: 'Name A–Z', za: 'Name Z–A', 'js-first': 'Interactive first' }
const isSortKey = (v: string | null): v is SortKey => v === 'featured' || v === 'az' || v === 'za' || v === 'js-first'

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Relevance score for a component vs the query tokens. Every token must appear
// somewhere (AND); exact-number + title hits rank far above body hits. -1 = excluded.
function scoreComponent(c: DesignComponentMeta, categoryId: string, tokens: string[]): number {
  const title = c.title.toLowerCase()
  const cat = categoryId.toLowerCase()
  const concept = (c.concept || '').toLowerCase()
  const job = (c.conversionJob || '').toLowerCase()
  const hay = `#${c.number} ${c.number} ${title} ${concept} ${job} ${cat}`
  let score = 0
  for (const t of tokens) {
    if (!hay.includes(t)) return -1 // token-AND
    if (String(c.number) === t) score += 1000
    if (title === t) score += 500
    else if (title.startsWith(t)) score += 220
    else if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)) score += 160
    else if (title.includes(t)) score += 120
    if (cat.includes(t)) score += 60
    if (concept.includes(t)) score += 40
    if (job.includes(t)) score += 20
  }
  return score
}
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50'

// Module-level cache: show stale data instantly (no skeleton flash on revisit) then
// refetch in the background. Cache is considered fresh for 5 minutes; after that the
// background refetch is the primary result (stale still shown until it arrives).
const INDEX_CACHE_TTL = 5 * 60 * 1000
let indexCache: DesignLibraryIndex | null = null
let indexCacheTime = 0
const isIndexCacheFresh = () => indexCache !== null && Date.now() - indexCacheTime < INDEX_CACHE_TTL

// Grey "image unavailable" placeholder swapped in when a screenshot fails to load.
const IMG_FALLBACK =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e9eef0"/>' +
    '<text x="50%" y="50%" font-family="system-ui,sans-serif" font-size="16" fill="#9aa6ac" text-anchor="middle" dominant-baseline="middle">Image unavailable</text></svg>')
function onImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget
  if (img.dataset.fb) return
  img.dataset.fb = '1'; img.src = IMG_FALLBACK
}

// Lock body scroll while a modal/overlay is mounted; restore the prior value on
// unmount so the page behind doesn't scroll under the drawer/lightbox.
function useBodyScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
}

const IFRAME_W = 1280

// Lazy iframe — mounts its preview only while near the viewport and UNMOUNTS it
// again when scrolled far away, so a 140-card grid never holds 140 live iframes.
// A ResizeObserver keeps the scale in sync with the card width so the preview
// always fills the full card (no white right-edge gap on wider columns).
function LazyPreview({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  const [errored, setErrored] = useState(false)
  const [scale, setScale] = useState(0.22)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((es) => { setShow(es[0]?.isIntersecting ?? false) }, { rootMargin: '400px' })
    io.observe(el)
    const ro = new ResizeObserver(() => { setScale(el.offsetWidth / IFRAME_W) })
    ro.observe(el)
    setScale(el.offsetWidth / IFRAME_W)
    return () => { io.disconnect(); ro.disconnect() }
  }, [])

  return (
    <div ref={ref} className="relative h-44 overflow-hidden bg-white">
      {errored ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface-2">
          <span className="text-[11px] text-text-muted">Preview unavailable</span>
          <button onClick={() => setErrored(false)} className="text-[10px] text-accent hover:underline">Retry</button>
        </div>
      ) : show ? (
        <iframe
          src={src}
          title={`Preview: ${title}`}
          aria-hidden
          loading="lazy"
          sandbox="allow-scripts"
          tabIndex={-1}
          onError={() => setErrored(true)}
          style={{ width: IFRAME_W, height: IFRAME_W * 1.4, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-surface-2" />
      )}
      <div className="absolute inset-0 ring-1 ring-inset ring-border/40 pointer-events-none" />
    </div>
  )
}

// Card preview: crisp PNG thumbnail → LazyPreview iframe fallback → "unavailable"
// placeholder so the card never shows an empty white box under any failure mode.
function CardPreview({ thumb, iframe, title }: { thumb: string; iframe: string; title: string }) {
  const [thumbFailed, setThumbFailed] = useState(false)
  if (thumbFailed) return <LazyPreview src={iframe} title={title} />
  return (
    <div className="relative h-44 overflow-hidden bg-white">
      <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setThumbFailed(true)} className="w-full object-cover object-top" />
      <div className="absolute inset-0 ring-1 ring-inset ring-border/40 pointer-events-none" />
    </div>
  )
}

// Card-shaped skeleton grid that mirrors the real component card (preview block
// + two text lines) so the loading state matches the final layout, not a spinner.
function SkeletonGrid({ blockClass = 'h-44' }: { blockClass?: string }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }} role="status" aria-label="Loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={`dl-skel-${i}`} className="card overflow-hidden">
          <div className={`${blockClass} bg-surface-2 animate-pulse`} />
          <div className="px-3 py-2.5 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

const DEMO_BADGE = (
  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-muted text-amber">
    Demo data
  </span>
)

// ── Component detail drawer (right slide-over) ───────────────────────────────
function DetailDrawer({ meta, siblings, onNavigate, onClose, onOpenTemplate }: { meta: DesignComponentMeta; siblings: DesignComponentMeta[]; onNavigate: (path: string) => void; onClose: () => void; onOpenTemplate: (path: string) => void }) {
  const [data, setData] = useState<DesignComponent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useBodyScrollLock()

  // Position within the currently-visible list, for prev/next paging.
  const idx = siblings.findIndex((s) => s.path === meta.path)
  const prev = idx > 0 ? siblings[idx - 1] : null
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null

  // AbortController cancels in-flight requests when the component changes (rapid
  // prev/next paging), preventing stale responses from overwriting current data.
  useEffect(() => {
    const ac = new AbortController()
    setData(null); setError(null)
    getDesignComponent(meta.path, { signal: ac.signal })
      .then(setData)
      .catch((e) => {
        if (e instanceof Error && e.name === 'AbortError') return
        const msg = e instanceof Error ? e.message : 'Failed to load component'
        setError(msg); toast('error', msg)
      })
    return () => ac.abort()
  }, [meta.path])

  const retryFetch = () => {
    setData(null); setError(null)
    getDesignComponent(meta.path)
      .then(setData)
      .catch((e) => { const msg = e instanceof Error ? e.message : 'Failed to load component'; setError(msg); toast('error', msg) })
  }

  // Reset preview spinner + scroll when paging to another component.
  useEffect(() => {
    setPreviewLoaded(false)
    dialogRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [meta.path])

  // Focus moves into the dialog on open and is restored to the trigger on close
  // (mount/unmount only — paging between siblings must not reset focus).
  useEffect(() => {
    const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const t = setTimeout(() => closeRef.current?.focus(), 50)
    return () => { clearTimeout(t); prevFocused?.focus() }
  }, [])

  // Escape closes; ←/→ page between siblings; Tab is trapped inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowLeft' && prev) { e.preventDefault(); onNavigate(prev.path); return }
      if (e.key === 'ArrowRight' && next) { e.preventDefault(); onNavigate(next.path); return }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,iframe,[tabindex]:not([tabindex="-1"])',
        )).filter((el) => el.offsetParent !== null || el === document.activeElement)
        // If nothing focusable yet (still loading), keep focus on the close button.
        const first = f[0] ?? closeRef.current
        const last = f[f.length - 1] ?? closeRef.current
        if (!first) return
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, prev, next, onNavigate])

  const copy = async (label: string, text: string | null) => {
    if (!text) return
    if (await writeToClipboard(text)) toast('success', `${label} copied`)
  }

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        className="w-full max-w-3xl h-full bg-surface border-l border-border shadow-pop overflow-y-auto animate-slide-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${meta.title} detail`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border sticky top-0 bg-surface z-10 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {meta.number != null && <span className="text-[11px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded bg-accent-muted text-accent shrink-0">#{meta.number}</span>}
              <h3 className="text-base font-bold truncate">{meta.title}</h3>
              {DEMO_BADGE}
              {meta.hasJs && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-muted text-accent font-medium">JS</span>}
            </div>
            <button onClick={() => copy('Path', meta.path)} title="Copy path"
              className="text-[11px] text-text-muted mt-0.5 font-mono truncate inline-flex items-center gap-1 hover:text-text transition-colors max-w-full">
              <span className="truncate">{meta.path}</span><Copy className="w-3 h-3 shrink-0" />
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <div className="flex items-center gap-0.5" role="group" aria-label="Browse components">
              <button onClick={() => prev && onNavigate(prev.path)} disabled={!prev} aria-label="Previous component" title={prev ? `Previous: ${prev.title}` : 'No previous'}
                className="p-1.5 rounded-lg border border-border hover:bg-surface-2 text-text-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-4 h-4" /></button>
              {idx >= 0 && <span className="text-[10px] text-text-muted tabular-nums px-0.5">{idx + 1}/{siblings.length}</span>}
              <button onClick={() => next && onNavigate(next.path)} disabled={!next} aria-label="Next component" title={next ? `Next: ${next.title}` : 'No next'}
                className="p-1.5 rounded-lg border border-border hover:bg-surface-2 text-text-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="segmented">
              <button onClick={() => setView('desktop')} aria-label="Desktop preview"
                className={view === 'desktop' ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}><Monitor className="w-3.5 h-3.5" /></button>
              <button onClick={() => setView('mobile')} aria-label="Mobile preview"
                className={view === 'mobile' ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}><Smartphone className="w-3.5 h-3.5" /></button>
            </div>
            <a href={designPreviewUrl(meta.path)} target="_blank" rel="noreferrer" aria-label="Open preview in new tab"
              className="p-1.5 rounded-lg border border-border hover:bg-surface-2 text-text-muted transition-colors"><ExternalLink className="w-4 h-4" /></a>
            <button ref={closeRef} onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg border border-border hover:bg-surface-2 text-text-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live preview — tall + internally scrollable so nothing is clipped */}
        <div className="p-5 bg-surface-2/40">
          <div className={`relative mx-auto bg-white rounded-xl border border-border overflow-hidden ${view === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'}`}>
            {!previewLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                <Spinner className="h-12" />
              </div>
            )}
            <iframe
              src={designPreviewUrl(meta.path)}
              title={`Live preview: ${meta.title}`}
              sandbox="allow-scripts"
              onLoad={() => setPreviewLoaded(true)}
              style={{ width: '100%', height: 'min(72vh, 760px)', border: 0, display: 'block' }}
            />
          </div>
          <p className="text-[10px] text-text-muted text-center mt-2">Demo placeholders — a real build binds live store data, brand colors & product media. Scroll inside the frame to see the full section.</p>
        </div>

        {/* Meta + code */}
        <div className="p-5 space-y-4">
          {error && <ErrorState message={error} onRetry={retryFetch} />}
          {!data && !error && <Spinner className="h-24" />}
          {data && (
            <>
              {data.meta.conversionJob && (
                <div>
                  <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Conversion job</div>
                  <p className="text-[13px] text-text-secondary leading-relaxed">{data.meta.conversionJob}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                {data.meta.sectionFamily && <div><span className="text-text-muted">Family</span><div className="font-medium">{data.meta.sectionFamily}</div></div>}
                {data.meta.concept && <div><span className="text-text-muted">Concept</span><div className="font-medium">{data.meta.concept}</div></div>}
              </div>
              {data.meta.source && (() => {
                const urlMatch = data.meta.source.match(/https?:\/\/\S+/)
                const label = data.meta.source.replace(/https?:\/\/\S+/, '').trim()
                return (
                  <div className="text-[12px]">
                    <span className="text-text-muted">Source</span>
                    <div className="flex items-center gap-1.5">
                      {urlMatch ? (
                        <a href={urlMatch[0]} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-1 truncate" title="This may link to a development preview store (may be private or expired)">
                          {label || new URL(urlMatch[0]).hostname} <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
                        </a>
                      ) : <span className="font-medium">{data.meta.source}</span>}
                    </div>
                  </div>
                )
              })()}
              {/* Reverse links — which full-page templates reuse this section */}
              <div>
                <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  {data.usedIn.length > 0 ? `Used in ${data.usedIn.length} template${data.usedIn.length > 1 ? 's' : ''}` : 'Templates'}
                </div>
                {data.usedIn.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {data.usedIn.map((u) => (
                      <button key={u.path} onClick={() => onOpenTemplate(u.path)} title={`Open ${u.title}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-border hover:border-accent/40 hover:bg-surface-2 transition-colors ${FOCUS_RING}`}>
                        <span className="font-mono font-semibold tabular-nums text-accent">T#{u.number}</span>
                        <span className="truncate max-w-[150px] text-text-secondary">{u.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-text-muted italic">Not yet used in any full-page template.</p>
                )}
              </div>
              {data.meta.bindings && (
                <Collapsible bare title="Design-system bindings">
                  <pre className="text-[11px] whitespace-pre-wrap text-text-secondary leading-relaxed font-mono bg-surface-2 rounded-lg p-3">{data.meta.bindings}</pre>
                </Collapsible>
              )}
              <Collapsible bare title="View code">
                {data.html || data.css || data.js ? (
                  <div className="space-y-3">
                    {(['html', 'css', 'js'] as const).map((lang) => data[lang] && (
                      <div key={lang}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-text-muted uppercase">{lang}</span>
                          <button onClick={() => copy(lang.toUpperCase(), data[lang])} className={`btn-ghost btn-sm ${FOCUS_RING}`}>Copy</button>
                        </div>
                        <pre className="text-[11px] overflow-x-auto bg-surface-2 rounded-lg p-3 max-h-72 leading-relaxed"><code>{data[lang]}</code></pre>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-text-muted italic">No code blocks for this component.</p>
                )}
              </Collapsible>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Screenshots tab ──────────────────────────────────────────────────────────
function ScreenshotsTab() {
  const [params, setParams] = useSearchParams()
  const [shots, setShots] = useState<PagePilotShot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  // Viewport + open lightbox live in URL so they survive refresh / are shareable.
  const view: 'desktop' | 'mobile' = params.get('sv') === 'mobile' ? 'mobile' : 'desktop'
  const zoomFile = params.get('sz') || ''
  const [zoomLoaded, setZoomLoaded] = useState(false)
  const lightboxCloseRef = useRef<HTMLButtonElement>(null)
  const lightboxRef = useRef<HTMLDivElement>(null)

  // Reset the loading spinner when the file being shown changes (inc. external URL nav).
  useEffect(() => { setZoomLoaded(false) }, [zoomFile])

  const fetchShots = () => {
    setError(null)
    getPagePilotShots().then(setShots).catch((e) => {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      setError(msg); toast('error', msg)
    })
  }
  useEffect(fetchShots, [])

  // S#N numbers assigned globally (all viewports) so a screenshot always has
  // the same number regardless of which viewport filter is active.
  const shotNumbers = useMemo(() => {
    if (!shots) return new Map<string, number>()
    const m = new Map<string, number>()
    shots.forEach((s, i) => m.set(s.file, i + 1))
    return m
  }, [shots])

  const filtered = useMemo(() => {
    const base = (shots ?? []).filter((s) => s.viewport === view)
    if (!q.trim()) return base
    const tok = q.trim().toLowerCase()
    return base.filter((s) => s.label.toLowerCase().includes(tok))
  }, [shots, view, q])

  // Lightbox: derived from URL so it's shareable + survives refresh.
  const zoom = useMemo(() => (shots ?? []).find((s) => s.file === zoomFile) ?? null, [shots, zoomFile])
  const zoomIdx = zoom ? filtered.findIndex((s) => s.file === zoom.file) : -1

  const setView = (v: 'desktop' | 'mobile') => setParams((p) => {
    const n = new URLSearchParams(p)
    if (v === 'mobile') n.set('sv', 'mobile'); else n.delete('sv')
    n.delete('sz') // close lightbox when switching viewports
    return n
  }, { replace: true })
  const openZoom = (s: PagePilotShot) => setParams((p) => { const n = new URLSearchParams(p); n.set('sz', s.file); return n }, { replace: true })
  const closeZoom = () => setParams((p) => { const n = new URLSearchParams(p); n.delete('sz'); return n }, { replace: true })
  const stepViz = (dir: 1 | -1) => { const n = zoomIdx + dir; if (n >= 0 && n < filtered.length) openZoom(filtered[n]) }

  // Lightbox: lock body scroll, Escape closes, ←/→ steps, restore focus on close.
  useEffect(() => {
    if (!zoom) return
    const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const ft = setTimeout(() => lightboxCloseRef.current?.focus(), 50)
    const step = (dir: 1 | -1) => {
      const idx = filtered.findIndex((s) => s.file === zoom.file)
      const n = idx + dir
      if (n >= 0 && n < filtered.length) setParams((p) => { const np = new URLSearchParams(p); np.set('sz', filtered[n].file); return np }, { replace: true })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeZoom()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'Tab' && lightboxRef.current) {
        const f = Array.from(lightboxRef.current.querySelectorAll<HTMLElement>('button')).filter((el) => el.offsetParent !== null)
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(ft)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevFocused?.focus()
    }
  }, [zoom, filtered])

  if (error) return <ErrorState message={error} onRetry={fetchShots} />
  if (!shots) return <SkeletonGrid blockClass="h-56" />

  const totalForView = shots.filter((s) => s.viewport === view).length

  return (
    <div>
      <div aria-hidden={zoom ? true : undefined}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search screenshots" placeholder="Search screenshots…" className="input pl-8 pr-8 w-full" />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <p className="text-[12px] text-text-muted whitespace-nowrap" aria-live="polite">{filtered.length}{q ? ` of ${totalForView}` : ''} {view} · {shots.length} total</p>
            <div className="segmented">
              <button onClick={() => setView('desktop')} className={view === 'desktop' ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}><Monitor className="w-3.5 h-3.5" /> Desktop</button>
              <button onClick={() => setView('mobile')} className={view === 'mobile' ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}><Smartphone className="w-3.5 h-3.5" /> Mobile</button>
            </div>
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={q ? Search : ImageIcon} title={q ? 'No screenshots match' : 'No screenshots'} size="sm" action={q ? { label: 'Clear search', onClick: () => setQ('') } : undefined} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4" onKeyDown={gridKeyNav} role="group" aria-label={`${filtered.length} screenshots`}>
            {filtered.map((s) => {
              const sNum = shotNumbers.get(s.file)
              return (
                <button key={s.file} data-card onClick={() => openZoom(s)} className={`card overflow-hidden text-left group ${FOCUS_RING}`}>
                  <div className="h-56 overflow-hidden bg-surface-2">
                    <img src={designShotUrl(s.file)} alt={s.label} loading="lazy" decoding="async" onError={onImgError} className="w-full object-cover object-top group-hover:opacity-90 transition-opacity" />
                  </div>
                  <div className="px-3 py-2 flex items-center gap-2">
                    {sNum != null && <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-accent-muted text-accent shrink-0">S#{sNum}</span>}
                    <span className="text-[12px] font-medium capitalize truncate">{s.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      {zoom && (
        <div ref={lightboxRef} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-6" onClick={closeZoom} role="dialog" aria-modal="true" aria-label={`${zoom.label} screenshot`}>
          {!zoomLoaded && <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><Spinner className="h-12" /></div>}
          <img src={designShotUrl(zoom.file)} alt={zoom.label} onLoad={() => setZoomLoaded(true)} onError={(e) => { onImgError(e); setZoomLoaded(true) }} className="max-w-full rounded-lg shadow-pop" onClick={(e) => e.stopPropagation()} />
          {zoomIdx > 0 && (
            <button onClick={(e) => { e.stopPropagation(); stepViz(-1) }} aria-label="Previous screenshot" className="fixed left-4 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text"><ChevronLeft className="w-5 h-5" /></button>
          )}
          {zoomIdx >= 0 && zoomIdx < filtered.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); stepViz(1) }} aria-label="Next screenshot" className="fixed right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text"><ChevronRight className="w-5 h-5" /></button>
          )}
          <span className="fixed bottom-4 left-1/2 -translate-x-1/2 text-[12px] text-white/80 bg-black/50 rounded-full px-3 py-1 tabular-nums flex items-center gap-1.5">
            {shotNumbers.get(zoom.file) != null && <span className="font-mono font-semibold">S#{shotNumbers.get(zoom.file)}</span>}
            <span>{zoomIdx >= 0 ? `${zoomIdx + 1} / ${filtered.length}` : '—'} · <span className="capitalize">{zoom.label}</span></span>
          </span>
          <button ref={lightboxCloseRef} onClick={closeZoom} aria-label="Close" className={`fixed top-4 right-4 p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text ${FOCUS_RING}`}><X className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  )
}

// ── Templates tab (full-page recipes → ordered section→component map) ─────────
const PAGETYPE_STYLE: Record<string, string> = {
  LANDING: 'bg-accent-muted text-accent',
  PDP: 'bg-green-muted text-green',
  HOMEPAGE: 'bg-blue-muted text-blue',
}
const pageTypeClass = (t: string) => PAGETYPE_STYLE[t] || 'bg-surface-2 text-text-muted'

function TemplatesTab() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<DesignTemplatesIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const topRef = useRef<HTMLDivElement>(null)
  const pt = params.get('pt') || 'all'
  const niche = params.get('tn') || 'all'
  const openPath = params.get('t') || ''

  const patchT = (next: Record<string, string | null>, opts?: { push?: boolean }) => {
    setParams((prev) => { const p = new URLSearchParams(prev); for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) } return p }, { replace: !opts?.push })
  }

  const fetchTemplates = () => { setError(null); getDesignTemplates().then(setData).catch((e) => { const m = e instanceof Error ? e.message : 'Failed to load'; setError(m); toast('error', m) }) }
  useEffect(fetchTemplates, [])

  // Scroll to top when page-type or niche filter changes.
  const filtersMountedT = useRef(false)
  useEffect(() => {
    if (!filtersMountedT.current) { filtersMountedT.current = true; return }
    topRef.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [pt, niche])

  const types = useMemo(() => (data ? Object.entries(data.counts.byType).sort((a, b) => b[1] - a[1]) : []), [data])
  // Niche facet — derived from the templates' own niche field (rich metadata that
  // was previously unused as a filter). Sorted by frequency.
  const niches = useMemo(() => {
    if (!data) return []
    const counts: Record<string, number> = {}
    // Exclude empty-string niches — they'd appear in the "all niches" list but be
    // unreachable from any specific niche filter, creating invisible orphan templates.
    for (const t of data.templates) if (t.niche?.trim()) counts[t.niche] = (counts[t.niche] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [data])
  const hasTplFilter = pt !== 'all' || niche !== 'all' || q.trim() !== ''
  const shown = useMemo(() => {
    if (!data) return []
    const ql = q.trim().replace(/^t?#/i, '').toLowerCase()
    return data.templates.filter((t) => {
      if (pt !== 'all' && t.pageType !== pt) return false
      if (niche !== 'all' && t.niche !== niche) return false
      if (ql && !(`t#${t.number} ${t.number} ${t.title} ${t.niche} ${t.pageType} ${t.slug}`.toLowerCase().includes(ql))) return false
      return true
    })
  }, [data, pt, niche, q])

  const open = useMemo(() => data?.templates.find((t) => t.path === openPath) || null, [data, openPath])
  const copyTRef = async (t: DesignTemplateMeta) => {
    try { if (await writeToClipboard(`T#${t.number}`)) toast('success', `Copied T#${t.number}`) }
    catch { toast('error', 'Copy failed') }
  }
  // Jump straight to the mapped component: switch to the Components tab, clear any
  // active component filters (so the target is visible/highlighted), and open it.
  const jumpToComponent = (componentPath: string) =>
    patchT({ tab: null, t: null, pt: null, tn: null, family: null, category: null, js: null, q: null, c: componentPath }, { push: true })

  if (error) return <ErrorState message={error} onRetry={fetchTemplates} />
  if (!data) return <SkeletonGrid />

  return (
    <>
    <div aria-hidden={open ? true : undefined}>
      <div ref={topRef} className="scroll-mt-4" />
      <div role="search" className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" placeholder="Search templates…  (T#, niche, type)" className="input pl-8 pr-8 w-full" />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Layers className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <select value={niche} onChange={(e) => patchT({ tn: e.target.value === 'all' ? null : e.target.value })} aria-label="Filter by niche" className={`btn-secondary py-1.5 pl-7 pr-7 text-xs appearance-none cursor-pointer capitalize ${FOCUS_RING}`}>
              <option value="all">All niches</option>
              {niches.map(([nm, n]) => <option key={nm} value={nm}>{nm} ({n})</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
          <span className="text-[12px] text-text-muted whitespace-nowrap" aria-live="polite">{shown.length}{hasTplFilter ? ` of ${data.templates.length}` : ''} shown</span>
        </div>
      </div>

      {/* page-type filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        <button onClick={() => patchT({ pt: null })} aria-current={pt === 'all' ? 'true' : undefined} className={`text-[11px] px-2 py-1 rounded-full border ${FOCUS_RING} ${pt === 'all' ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-surface-2'}`}>All</button>
        {types.map(([type, n]) => (
          <button key={type} onClick={() => patchT({ pt: type })} aria-current={pt === type ? 'true' : undefined} className={`text-[11px] px-2 py-1 rounded-full border ${FOCUS_RING} ${pt === type ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-surface-2'}`}>
            {type} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={LayoutTemplate} title="No templates match" description="Try a different search, niche, or page type." size="sm" action={hasTplFilter ? { label: 'Clear filters', onClick: () => { setQ(''); patchT({ pt: null, tn: null }) } } : undefined} />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }} onKeyDown={gridKeyNav} role="group" aria-label={`${shown.length} templates`}>
          {shown.map((t) => (
            <div key={t.path} className="relative group flex">
            <button data-card onClick={() => patchT({ t: t.path }, { push: true })} className={`card overflow-hidden text-left flex flex-col w-full hover:border-accent/40 ${FOCUS_RING} transition-colors ${t.path === openPath ? 'ring-2 ring-accent border-accent' : ''}`}>
              <CardPreview thumb={designThumbUrl(t.path, 'template')} iframe={designTemplatePreviewUrl(t.path, { static: true })} title={t.title} />
              <div className="p-3.5 flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded bg-accent-muted text-accent shrink-0">T#{t.number}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${pageTypeClass(t.pageType)}`}>{t.pageType}</span>
                  <span className="text-[10px] text-text-muted ml-auto shrink-0">{t.sectionCount} sections</span>
                </div>
                <div className="text-[14px] font-semibold leading-snug line-clamp-2" title={t.title}>{t.title}</div>
                {t.niche && <div className="text-[11px] text-text-muted capitalize">{t.niche}</div>}
                {t.description && <p className="text-[11px] text-text-secondary line-clamp-2 leading-snug">{t.description}</p>}
                <div className="text-[11px] text-accent font-medium mt-auto inline-flex items-center gap-1">View sections <ChevronRight className="w-3 h-3" /></div>
              </div>
            </button>
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button onClick={() => copyTRef(t)} aria-label={`Copy reference T#${t.number}`} title={`Copy T#${t.number}`} className={`p-1.5 rounded-md bg-surface/95 border border-border shadow-soft text-text-muted hover:text-accent ${FOCUS_RING}`}><Hash className="w-3.5 h-3.5" /></button>
            </div>
            </div>
          ))}
        </div>
      )}

    </div>
    {open && <TemplateDrawer meta={open} onClose={() => patchT({ t: null })} onJumpToComponent={jumpToComponent} />}
    </>
  )
}

function TemplateDrawer({ meta, onClose, onJumpToComponent }: { meta: DesignTemplateMeta; onClose: () => void; onJumpToComponent: (componentPath: string) => void }) {
  const [data, setData] = useState<DesignTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  useBodyScrollLock()

  const retryTemplate = () => {
    setData(null); setError(null)
    getDesignTemplate(meta.path).then(setData).catch((e) => { const m = e instanceof Error ? e.message : 'Failed to load template'; setError(m); toast('error', m) })
  }
  // AbortController cancels the in-flight request if the template changes or the
  // drawer is closed before the fetch completes (prevents stale-data overwrites).
  useEffect(() => {
    const ac = new AbortController()
    setData(null); setError(null)
    getDesignTemplate(meta.path, { signal: ac.signal })
      .then(setData)
      .catch((e) => {
        if (e instanceof Error && e.name === 'AbortError') return
        const m = e instanceof Error ? e.message : 'Failed to load template'
        setError(m); toast('error', m)
      })
    return () => ac.abort()
  }, [meta.path])

  useEffect(() => {
    const prevFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const t = setTimeout(() => closeRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab' && dialogRef.current) {
        const f = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null || el === document.activeElement)
        const first = f[0] ?? closeRef.current
        const last = f[f.length - 1] ?? closeRef.current
        if (!first) return
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); prevFocused?.focus() }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div ref={dialogRef} className="w-full max-w-2xl h-full bg-surface border-l border-border shadow-pop overflow-y-auto animate-slide-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${meta.title} template`}>
        <div className="px-5 py-4 border-b border-border sticky top-0 bg-surface z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded bg-accent-muted text-accent shrink-0">T#{meta.number}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${pageTypeClass(meta.pageType)}`}>{meta.pageType}</span>
              <h3 className="text-base font-bold">{meta.title}</h3>
            </div>
            <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
              {meta.niche && <span className="capitalize">{meta.niche}</span>}
              <span>· {meta.sectionCount} sections</span>
              {meta.url && <a href={meta.url} target="_blank" rel="noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">source <ArrowUpRight className="w-3 h-3" /></a>}
            </div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className={`p-1.5 rounded-lg border border-border hover:bg-surface-2 text-text-muted transition-colors shrink-0 ${FOCUS_RING}`}><X className="w-4 h-4" /></button>
        </div>

        {/* Composed full-page preview (all sections stacked) */}
        <div className="p-5 bg-surface-2/40">
          <div className="relative mx-auto bg-white rounded-xl border border-border overflow-hidden">
            {!previewLoaded && <div className="absolute inset-0 flex items-center justify-center bg-white"><Spinner className="h-12" /></div>}
            <iframe src={designTemplatePreviewUrl(meta.path)} title={`Full-page preview: ${meta.title}`} sandbox="allow-scripts" onLoad={() => setPreviewLoaded(true)} style={{ width: '100%', height: 'min(60vh, 640px)', border: 0, display: 'block' }} />
          </div>
          <p className="text-[10px] text-text-muted text-center mt-2">Composed from the mapped library sections with demo placeholders — scroll inside the frame to see the whole page.</p>
        </div>

        <div className="p-5 pt-0 space-y-4">
          {error && <ErrorState message={error} onRetry={retryTemplate} />}
          {!data && !error && <Spinner className="h-24" />}
          {data && (
            <>
              {data.description && <p className="text-[13px] text-text-secondary leading-relaxed">{data.description}</p>}
              <div className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Page composition — {data.sections.length} sections (tap a number to open that component)</div>
              <ol className="space-y-1.5">
                {data.sections.map((s) => (
                  <li key={s.index} className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2/40 px-3 py-2">
                    <span className="text-[10px] font-mono tabular-nums text-text-muted shrink-0 w-7">§{s.index}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium truncate" title={s.section}>{s.section}</div>
                      <div className="text-[10px] text-text-muted truncate">{[s.concept, s.rung, s.status].filter(Boolean).join(' · ')}</div>
                    </div>
                    {s.componentNumber != null ? (
                      <button onClick={() => onJumpToComponent(s.componentPath)} title={`Open component #${s.componentNumber}`} className={`text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded bg-accent-muted text-accent shrink-0 hover:bg-accent hover:text-white transition-colors inline-flex items-center gap-0.5 ${FOCUS_RING}`}>#{s.componentNumber} <ArrowUpRight className="w-2.5 h-2.5" /></button>
                    ) : (
                      <span className="text-[10px] text-text-muted shrink-0" title={s.componentPath}>—</span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Arrow-key roving focus across the 2-D card grid (Left/Right + Up/Down by row,
// Home/End). Column count is read from the live computed grid template.
function gridKeyNav(e: React.KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
  const grid = e.currentTarget
  const items = Array.from(grid.querySelectorAll<HTMLButtonElement>('button[data-card]'))
  const idx = items.indexOf(document.activeElement as HTMLButtonElement)
  if (idx === -1) return
  const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length)
  let next = -1
  if (e.key === 'ArrowRight') next = idx + 1
  else if (e.key === 'ArrowLeft') next = idx - 1
  else if (e.key === 'ArrowDown') next = idx + cols
  else if (e.key === 'ArrowUp') next = idx - cols
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = items.length - 1
  if (next >= 0 && next < items.length) { e.preventDefault(); items[next].focus() }
}

// ── ⌘K command palette — jump to any design by #N / T#N / name, from any tab ──
type PaletteResult = { kind: 'component' | 'template'; label: string; sub: string; num: string; path: string; score: number }
function CommandPalette({ components, templates, templatesError, onRetryTemplates, onClose, onOpenComponent, onOpenTemplate }: {
  components: { c: DesignComponentMeta; categoryId: string }[]
  templates: DesignTemplateMeta[]
  templatesError: boolean
  onRetryTemplates: () => void
  onClose: () => void
  onOpenComponent: (p: string) => void
  onOpenTemplate: (p: string) => void
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock()
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t) }, [])

  const results = useMemo<PaletteResult[]>(() => {
    const tokens = q.trim().replace(/^t?#/i, '').toLowerCase().split(/\s+/).filter(Boolean)
    const out: PaletteResult[] = []
    if (!tokens.length) {
      for (const { c } of components.slice(0, 5)) out.push({ kind: 'component', label: c.title, sub: 'Component', num: `#${c.number}`, path: c.path, score: 0 })
      for (const t of templates.slice(0, 5)) out.push({ kind: 'template', label: t.title, sub: `Template · ${t.pageType}`, num: `T#${t.number}`, path: t.path, score: 0 })
      return out
    }
    for (const { c, categoryId } of components) {
      const s = scoreComponent(c, categoryId, tokens)
      if (s > 0) out.push({ kind: 'component', label: c.title, sub: `Component · ${categoryId.replace(/-/g, ' ')}`, num: `#${c.number}`, path: c.path, score: s })
    }
    for (const t of templates) {
      const hay = `t#${t.number} ${t.number} ${t.title} ${t.niche} ${t.pageType}`.toLowerCase()
      if (!tokens.every((tok) => hay.includes(tok))) continue
      let s = 0; const title = t.title.toLowerCase()
      for (const tok of tokens) { if (String(t.number) === tok) s += 1000; if (title.startsWith(tok)) s += 200; else if (title.includes(tok)) s += 120; if (t.niche.toLowerCase().includes(tok)) s += 50 }
      out.push({ kind: 'template', label: t.title, sub: `Template · ${t.pageType} · ${t.niche}`, num: `T#${t.number}`, path: t.path, score: s })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 14)
  }, [q, components, templates])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  const openIdx = (i: number) => { const r = results[i]; if (!r) return; r.kind === 'component' ? onOpenComponent(r.path) : onOpenTemplate(r.path) }
  // Window-level handler (robust regardless of focus) for Esc / arrows / Enter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
      else if (e.key === 'Enter') { e.preventDefault(); openIdx(active) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [results, active, onClose])

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search components and templates" placeholder="Jump to a design — #47, T#5, or a name…" className="flex-1 bg-transparent py-3.5 text-[14px] outline-none placeholder:text-text-muted" />
          <kbd className="text-[10px] text-text-muted border border-border rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 ? <div className="px-3 py-8 text-center text-[13px] text-text-muted">No matches for “{q}”</div> : results.map((r, i) => (
            <button key={r.kind + r.path} data-idx={i} onMouseEnter={() => setActive(i)} onClick={() => openIdx(i)}
              className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg ${i === active ? 'bg-accent-muted' : 'hover:bg-surface-2'}`}>
              <span className="text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded shrink-0 bg-accent-muted text-accent">{r.num}</span>
              <span className="flex-1 min-w-0"><span className="text-[13px] font-medium truncate block">{r.label}</span><span className="text-[11px] text-text-muted truncate block capitalize">{r.sub}</span></span>
              {i === active && <kbd className="text-[10px] text-text-muted border border-border rounded px-1 shrink-0">↵</kbd>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted">
          <span><kbd className="border border-border rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-border rounded px-1">↵</kbd> open</span>
          {templatesError ? (
            <span className="ml-auto text-amber flex items-center gap-1">
              Templates unavailable —
              <button onClick={onRetryTemplates} className="underline hover:text-text">retry</button>
            </span>
          ) : (
            <span className="ml-auto">{results.length} result{results.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DesignLibrary() {
  const [params, setParams] = useSearchParams()
  // Seed from cache for instant revisit; clear stale cache so the load() below runs fresh.
  const [index, setIndex] = useState<DesignLibraryIndex | null>(indexCache)
  const [error, setError] = useState<string | null>(null)

  // URL is the source of truth for tab/filters/open-component (deep-link + refresh-restore).
  const rawTab = params.get('tab')
  const tab = rawTab === 'screenshots' ? 'screenshots' : rawTab === 'templates' ? 'templates' : 'components'
  const family = params.get('family') || 'all'
  const category = params.get('category') || 'all'
  const jsOnly = params.get('js') === '1'
  const favOnly = params.get('fav') === '1'
  const sort: SortKey = isSortKey(params.get('sort')) ? (params.get('sort') as SortKey) : 'featured'
  const selectedPath = params.get('c') || ''
  const urlQ = params.get('q') || ''

  // Merge a patch into the query string; null/'' values are deleted to keep URLs
  // clean. Filter changes replace history (no spam); opening a component pushes
  // so the browser Back button closes the drawer instead of leaving the page.
  const patch = useCallback((next: Record<string, string | null>, opts?: { push?: boolean }) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k) }
      return p
    }, { replace: !opts?.push })
  }, [setParams])

  // Search is local for instant filtering; the URL write is debounced. We also
  // re-sync the box from the URL on external changes (back/forward, Clear all).
  const [q, setQ] = useState(urlQ)
  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPushed = useRef(urlQ)
  const onSearch = (val: string) => {
    setQ(val)
    if (qDebounce.current) clearTimeout(qDebounce.current)
    qDebounce.current = setTimeout(() => { lastPushed.current = val.trim(); patch({ q: val.trim() || null }) }, 300)
  }
  useEffect(() => {
    if (urlQ !== lastPushed.current) { lastPushed.current = urlQ; setQ(urlQ) }
  }, [urlQ])
  useEffect(() => () => { if (qDebounce.current) clearTimeout(qDebounce.current) }, [])

  const load = () => {
    setError(null)
    getDesignLibraryIndex().then((d) => { indexCache = d; indexCacheTime = Date.now(); setIndex(d) }).catch((e) => {
      const m = e instanceof Error ? e.message : 'Failed to load'
      setError(m); toast('error', m)
    })
  }
  // Always refetch on mount so data stays fresh. If the cache is stale (>5 min),
  // clear it first so the skeleton shows instead of serving old counts/families.
  useEffect(() => {
    if (!isIndexCacheFresh()) { indexCache = null; setIndex(null) }
    load()
  }, [])

  // flatten components with their family/category for filtering
  const flat = useMemo(() => {
    if (!index) return []
    const out: { c: DesignComponentMeta; familyId: string; familyLabel: string; categoryId: string }[] = []
    for (const f of index.families) for (const cat of f.categories) for (const c of cat.components)
      out.push({ c, familyId: f.id, familyLabel: f.label, categoryId: cat.id })
    return out
  }, [index])

  const categoriesForFamily = useMemo(() => {
    if (!index || family === 'all') return []
    return index.families.find((f) => f.id === family)?.categories ?? []
  }, [index, family])
  // A category from the URL only applies if it actually belongs to the current
  // family; otherwise it's ignored (stale/invalid deep-links don't zero the grid).
  const validCategory = useMemo(
    () => (category !== 'all' && categoriesForFamily.some((c) => c.id === category) ? category : 'all'),
    [category, categoriesForFamily],
  )

  // Recents: last 8 opened components (newest first), persisted to localStorage.
  const [recentPaths, setRecentPaths] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('dl:recents') || '[]') as string[] } catch { return [] }
  })
  // Favorites: starred components, persisted to localStorage.
  const [favPaths, setFavPaths] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dl:favs') || '[]') as string[]) } catch { return new Set<string>() }
  })

  const shown = useMemo(() => {
    // Strip a leading "#" so "#47" and "47" both match the registry number.
    const tokens = q.trim().replace(/^#/, '').toLowerCase().split(/\s+/).filter(Boolean)
    const matched: { c: DesignComponentMeta; categoryId: string; score: number }[] = []
    for (const { c, familyId, categoryId } of flat) {
      if (family !== 'all' && familyId !== family) continue
      if (validCategory !== 'all' && categoryId !== validCategory) continue
      if (jsOnly && !c.hasJs) continue
      if (favOnly && !favPaths.has(c.path)) continue
      let score = 0
      if (tokens.length) { score = scoreComponent(c, categoryId, tokens); if (score < 0) continue }
      matched.push({ c, categoryId, score })
    }
    if (tokens.length) {
      // Active search → rank by relevance (best matches first; overrides the Sort control)
      matched.sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title))
    } else if (sort === 'az') matched.sort((a, b) => a.c.title.localeCompare(b.c.title))
    else if (sort === 'za') matched.sort((a, b) => b.c.title.localeCompare(a.c.title))
    else if (sort === 'js-first') matched.sort((a, b) => Number(b.c.hasJs) - Number(a.c.hasJs))
    return matched.map(({ c, categoryId }) => ({ c, categoryId }))
  }, [flat, family, validCategory, jsOnly, favOnly, favPaths, q, sort])

  const selected = useMemo(() => flat.find(({ c }) => c.path === selectedPath)?.c ?? null, [flat, selectedPath])

  const setFamily = (id: string) => patch({ family: id === 'all' ? null : id, category: null })
  const setCategory = (id: string) => patch({ category: id === 'all' ? null : id })
  // Cancel any in-flight debounced search write so it can't re-add q after clearing.
  const cancelSearchDebounce = () => { if (qDebounce.current) { clearTimeout(qDebounce.current); qDebounce.current = null } }
  const clearAll = () => { cancelSearchDebounce(); setQ(''); lastPushed.current = ''; patch({ family: null, category: null, js: null, q: null, fav: null }) }
  const clearSearch = () => { cancelSearchDebounce(); setQ(''); lastPushed.current = ''; patch({ q: null }) }
  const hasActiveFilter = family !== 'all' || validCategory !== 'all' || jsOnly || favOnly || q.trim() !== ''

  // Visible metas — the sibling list the drawer pages through (←/→, prev/next).
  // If the open component isn't in the filtered view, fall back to the full list
  // so paging still works instead of dead-ending.
  const shownMetas = useMemo(() => shown.map(({ c }) => c), [shown])
  const drawerSiblings = useMemo(
    () => (selected && shownMetas.some((m) => m.path === selected.path) ? shownMetas : flat.map(({ c }) => c)),
    [selected, shownMetas, flat],
  )
  // "Jump to a design" palette — cross-tab search by #N / T#N / name. Opened via
  // the header button (⌘K is owned app-wide by the global nav CommandPalette).
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteTemplates, setPaletteTemplates] = useState<DesignTemplateMeta[]>([])
  const [paletteTemplatesError, setPaletteTemplatesError] = useState(false)
  useEffect(() => {
    // Only fetch when palette opens and templates aren't loaded yet. Stop retrying
    // after a failure (paletteTemplatesError=true) so we don't spam a broken endpoint.
    if (!paletteOpen || paletteTemplates.length > 0 || paletteTemplatesError) return
    getDesignTemplates()
      .then((d) => { setPaletteTemplates(d.templates); setPaletteTemplatesError(false) })
      .catch(() => setPaletteTemplatesError(true))
  }, [paletteOpen, paletteTemplates.length, paletteTemplatesError])

  const openComponent = useCallback((p: string) => {
    setRecentPaths((prev) => {
      const next = [p, ...prev.filter((x) => x !== p)].slice(0, 8)
      try { localStorage.setItem('dl:recents', JSON.stringify(next)) } catch {}
      return next
    })
    patch({ c: p }, { push: true })
  }, [patch])
  const navigateComponent = useCallback((p: string) => patch({ c: p }), [patch])
  const closeDrawer = useCallback(() => patch({ c: null }), [patch])
  // From a component drawer, jump to a template that uses it (switch tab + open it).
  const openTemplateFromComponent = useCallback((p: string) => patch({ tab: 'templates', t: p, c: null }, { push: true }), [patch])

  // Card quick-actions (no drawer round-trip): copy the #N reference an agent is
  // told to use, or copy the component's code on demand.
  const copyRef = useCallback(async (c: DesignComponentMeta) => {
    try { if (await writeToClipboard(`#${c.number}`)) toast('success', `Copied #${c.number}`) }
    catch { toast('error', 'Copy failed') }
  }, [])
  const copyCode = useCallback(async (c: DesignComponentMeta) => {
    try {
      const d = await getDesignComponent(c.path)
      const code = [d.html, d.css && `/* CSS */\n${d.css}`, d.js && `/* JS */\n${d.js}`].filter(Boolean).join('\n\n')
      if (!code) { toast('error', 'No code for this component'); return }
      if (await writeToClipboard(code)) toast('success', `Copied code for #${c.number}`)
    } catch { toast('error', 'Failed to copy code') }
  }, [])

  const toggleFavorite = useCallback((p: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setFavPaths((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      try { localStorage.setItem('dl:favs', JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  // "/" focuses search (skips when typing in a field or the drawer is open).
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || selectedPath || tab !== 'components') return
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return
      e.preventDefault(); searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPath, tab])

  // Reset scroll to the top of the results when any filter/sort/search changes.
  const topRef = useRef<HTMLDivElement>(null)
  const filtersMounted = useRef(false)
  useEffect(() => {
    if (!filtersMounted.current) { filtersMounted.current = true; return }
    topRef.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [family, validCategory, sort, jsOnly, urlQ])

  // Preserve scroll position per tab — save on leave, restore on arrive.
  const scrollMemory = useRef<Record<string, number>>({})
  const prevTab = useRef(tab)
  useEffect(() => {
    if (prevTab.current === tab) return
    scrollMemory.current[prevTab.current] = window.scrollY
    prevTab.current = tab
    const saved = scrollMemory.current[tab]
    if (saved != null) {
      requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: 'instant' }))
    }
  }, [tab])

  // Keep the active family (and its just-expanded categories) visible in the rail.
  const railRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (family === 'all') return
    railRef.current?.querySelector('[aria-expanded="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [family])

  const subtitle = index
    ? `${index.counts.components} components · ${index.counts.templates} templates · ${index.counts.categories} categories · ${index.counts.screenshots} screenshots`
    : 'Browse & preview the premium ecom component library'

  return (
    <PageShell title="Design Library" subtitle={subtitle} actions={
      <button onClick={() => setPaletteOpen(true)} className={`btn-secondary btn-sm ${FOCUS_RING}`} title="Jump to a design by #, T#, or name">
        <Search className="w-3.5 h-3.5" /> Jump to a design…
      </button>
    }>
      <TabNav
        tabs={[
          { id: 'components', label: 'Components', count: index?.counts.components },
          { id: 'templates', label: 'Templates', count: index?.counts.templates },
          { id: 'screenshots', label: 'Screenshots', count: index?.counts.screenshots },
        ]}
        active={tab}
        onChange={(id) => patch({ tab: id === 'components' ? null : id, c: null, t: null, pt: null, tn: null, sv: null, sz: null })}
      />

      {tab === 'screenshots' ? <ScreenshotsTab /> : tab === 'templates' ? <TemplatesTab /> : (
        <div aria-hidden={selected ? true : undefined}>
          {error && <ErrorState message={error} onRetry={load} />}
          {!index && !error && <SkeletonGrid />}
          {index && (
            <div className="flex gap-5">
              {/* Left rail: families → categories (desktop). The active family expands
                  its categories inline, so there's no separate chip explosion. */}
              <aside ref={railRef} aria-label="Component families" className="w-56 shrink-0 hidden md:block self-start sticky top-0 max-h-[calc(100vh-7rem)] overflow-y-auto bg-surface z-10 pb-2 pr-1">
                <button
                  onClick={() => setFamily('all')}
                  aria-current={family === 'all' ? 'true' : undefined}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] flex items-center justify-between transition-colors ${family === 'all' ? 'bg-accent-muted text-accent font-medium' : 'hover:bg-surface-2 text-text-secondary'}`}
                >
                  <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> All components</span>
                  <span className="text-[10px] text-text-muted tabular-nums">{index.counts.components}</span>
                </button>
                <div className="mt-1 space-y-0.5">
                  {index.families.map((f) => {
                    const n = f.categories.reduce((a, c) => a + c.count, 0)
                    const isActive = family === f.id
                    return (
                      <div key={f.id}>
                        <button
                          onClick={() => setFamily(f.id)}
                          title={f.purpose}
                          aria-current={isActive ? 'true' : undefined}
                          aria-expanded={isActive}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[13px] flex items-center justify-between transition-colors ${isActive ? 'bg-accent-muted text-accent font-medium' : 'hover:bg-surface-2 text-text-secondary'}`}
                        >
                          <span className="flex items-center gap-1 min-w-0">
                            <ChevronRight className={`w-3 h-3 shrink-0 text-text-muted transition-transform ${isActive ? 'rotate-90' : ''}`} />
                            <span className="truncate">{f.label}</span>
                          </span>
                          <span className="text-[10px] text-text-muted shrink-0 ml-2 tabular-nums">{n}</span>
                        </button>
                        {isActive && (
                          <div className="ml-[18px] mt-0.5 mb-1 pl-2 border-l border-border-subtle space-y-px">
                            <button
                              onClick={() => setCategory('all')}
                              aria-current={validCategory === 'all' ? 'true' : undefined}
                              className={`w-full text-left px-2.5 py-1 rounded-md text-[12px] flex items-center justify-between transition-colors ${validCategory === 'all' ? 'bg-accent-muted text-accent font-medium' : 'text-text-secondary hover:bg-surface-2'}`}
                            >
                              <span>All</span><span className="text-[10px] text-text-muted tabular-nums ml-2">{n}</span>
                            </button>
                            {f.categories.map((c) => (
                              <button
                                key={c.id}
                                onClick={() => setCategory(c.id)}
                                aria-current={validCategory === c.id ? 'true' : undefined}
                                className={`w-full text-left px-2.5 py-1 rounded-md text-[12px] flex items-center justify-between capitalize transition-colors ${validCategory === c.id ? 'bg-accent-muted text-accent font-medium' : 'text-text-secondary hover:bg-surface-2'}`}
                              >
                                <span className="truncate">{c.label}</span>
                                <span className="text-[10px] text-text-muted shrink-0 ml-2 tabular-nums">{c.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </aside>

              {/* Main: filters + grid */}
              <div className="flex-1 min-w-0">
                <div ref={topRef} className="scroll-mt-4" />
                {/* Mobile family + category selectors (the desktop rail is hidden < md) */}
                <div className="md:hidden mb-3 grid grid-cols-1 gap-2">
                  <div className="relative">
                    <Layers className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    <select value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Filter by family" className="input pl-8 pr-9 w-full appearance-none cursor-pointer">
                      <option value="all">All families ({index.counts.components})</option>
                      {index.families.map((f) => (
                        <option key={f.id} value={f.id}>{f.label} ({f.categories.reduce((a, c) => a + c.count, 0)})</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                  {categoriesForFamily.length > 0 && (
                    <div className="relative">
                      <select value={validCategory} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="input pl-3 pr-9 w-full appearance-none cursor-pointer">
                        <option value="all">All categories ({categoriesForFamily.reduce((a, c) => a + c.count, 0)})</option>
                        {categoriesForFamily.map((c) => (
                          <option key={c.id} value={c.id}>{c.label} ({c.count})</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    </div>
                  )}
                </div>

                {/* Toolbar — search on its own row on mobile, controls below */}
                <div role="search" className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input ref={searchRef} value={q} onChange={(e) => onSearch(e.target.value)} aria-label="Search components" placeholder="Search components…  ( / )" className="input pl-8 pr-8 w-full" />
                    {q && (
                      <button onClick={clearSearch} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => patch({ js: jsOnly ? null : '1' })} aria-pressed={jsOnly} className={`${jsOnly ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} ${FOCUS_RING}`}>
                      <Code2 className="w-3.5 h-3.5" /> Interactive
                    </button>
                    <button onClick={() => patch({ fav: favOnly ? null : '1' })} aria-pressed={favOnly} className={`${favOnly ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} ${FOCUS_RING}`}>
                      <Star className="w-3.5 h-3.5" /> Favorites{favPaths.size > 0 && <span className="text-[10px] tabular-nums ml-0.5 opacity-70">{favPaths.size}</span>}
                    </button>
                    <div className="relative">
                      <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                      <select value={sort} onChange={(e) => patch({ sort: e.target.value === 'featured' ? null : e.target.value })} aria-label="Sort components" className={`btn-secondary py-1.5 pl-7 pr-7 text-xs appearance-none cursor-pointer ${FOCUS_RING}`}>
                        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                    </div>
                    <div className="flex items-center gap-2 ml-auto sm:ml-0 whitespace-nowrap">
                      <span className="text-[12px] text-text-muted" aria-live="polite">{shown.length}{hasActiveFilter ? ` of ${flat.length}` : ''} shown</span>
                      {hasActiveFilter && <button onClick={clearAll} className={`text-[12px] text-accent hover:underline rounded ${FOCUS_RING}`}>Clear</button>}
                    </div>
                  </div>
                </div>

                {/* Recently viewed — visible on the unfiltered default view */}
                {recentPaths.length > 0 && !favOnly && !q && family === 'all' && validCategory === 'all' && !jsOnly && flat.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-2 flex items-center gap-2">
                      Recently viewed
                      <button onClick={() => { setRecentPaths([]); try { localStorage.removeItem('dl:recents') } catch {} }} className={`text-[10px] text-text-muted hover:text-text normal-case font-normal ${FOCUS_RING}`}>clear</button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {recentPaths.map((rp) => {
                        const item = flat.find(({ c }) => c.path === rp)
                        if (!item) return null
                        return (
                          <button key={rp} onClick={() => openComponent(rp)} className={`inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full border border-border bg-surface hover:bg-surface-2 transition-colors ${FOCUS_RING}`}>
                            {item.c.number != null && <span className="font-mono text-[10px] text-accent font-semibold">#{item.c.number}</span>}
                            <span className="truncate max-w-[140px]">{item.c.title}</span>
                          </button>
                        )
                      }).filter(Boolean)}
                    </div>
                  </div>
                )}

                {shown.length === 0 ? (
                  <EmptyState icon={favOnly ? Star : Search} title={favOnly ? 'No favorites yet' : 'No components match'} description={favOnly ? 'Star components with the ★ button on any card.' : 'Try a different search or family.'} size="sm" action={hasActiveFilter ? { label: 'Clear filters', onClick: clearAll } : undefined} />
                ) : (
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }} onKeyDown={gridKeyNav} role="group" aria-label={`${shown.length} components`}>
                    {shown.map(({ c, categoryId }) => (
                      <div key={c.path} className="relative group">
                        <button data-card aria-current={c.path === selectedPath ? 'true' : undefined} onClick={() => openComponent(c.path)} className={`card overflow-hidden text-left w-full hover:border-accent/40 ${FOCUS_RING} transition-colors ${c.path === selectedPath ? 'ring-2 ring-accent border-accent' : ''}`}>
                          <CardPreview thumb={designThumbUrl(c.path, 'component')} iframe={designPreviewUrl(c.path, { static: true })} title={c.title} />
                          <div className="px-3 py-2.5 min-h-[88px]">
                            <div className="flex items-center gap-1.5">
                              {c.number != null && <span className="text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded bg-accent-muted text-accent shrink-0">#{c.number}</span>}
                              <span className="text-[13px] font-semibold truncate flex-1" title={c.title}>{c.title}</span>
                              {c.hasJs && <span className="text-[9px] px-1 py-0.5 rounded bg-accent-muted text-accent font-medium shrink-0">JS</span>}
                            </div>
                            <div className="text-[11px] text-text-muted capitalize mt-0.5">{categoryId.replace(/-/g, ' ')}</div>
                            {c.conversionJob && <p className="text-[11px] text-text-secondary mt-1 line-clamp-2 leading-snug">{c.conversionJob}</p>}
                          </div>
                        </button>
                        {/* Quick-actions — appear on hover/keyboard focus; siblings of the card (never nested in a button). The ★ is always visible when starred so favorites are easy to spot at a glance. */}
                        <div className="absolute top-2 right-2 flex gap-1">
                          <button onClick={(e) => toggleFavorite(c.path, e)} aria-label={favPaths.has(c.path) ? `Unfavorite #${c.number}` : `Favorite #${c.number}`} title={favPaths.has(c.path) ? 'Remove from favorites' : 'Add to favorites'} className={`p-1.5 rounded-md bg-surface/95 border border-border shadow-soft transition-colors ${favPaths.has(c.path) ? 'text-accent opacity-100' : 'text-text-muted hover:text-accent opacity-0 group-hover:opacity-100 focus-visible:opacity-100'} ${FOCUS_RING}`}><Star className={`w-3.5 h-3.5 ${favPaths.has(c.path) ? 'fill-current' : ''}`} /></button>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button onClick={() => copyRef(c)} aria-label={`Copy reference #${c.number}`} title={`Copy #${c.number}`} className={`p-1.5 rounded-md bg-surface/95 border border-border shadow-soft text-text-muted hover:text-accent ${FOCUS_RING}`}><Hash className="w-3.5 h-3.5" /></button>
                            <button onClick={() => copyCode(c)} aria-label={`Copy code for #${c.number}`} title="Copy code" className={`p-1.5 rounded-md bg-surface/95 border border-border shadow-soft text-text-muted hover:text-accent ${FOCUS_RING}`}><Code2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {selected && tab === 'components' && <DetailDrawer meta={selected} siblings={drawerSiblings} onNavigate={navigateComponent} onClose={closeDrawer} onOpenTemplate={openTemplateFromComponent} />}
      {paletteOpen && (
        <CommandPalette
          components={flat.map(({ c, categoryId }) => ({ c, categoryId }))}
          templates={paletteTemplates}
          templatesError={paletteTemplatesError}
          onRetryTemplates={() => { setPaletteTemplatesError(false) }}
          onClose={() => setPaletteOpen(false)}
          onOpenComponent={(p) => { setPaletteOpen(false); patch({ tab: null, c: p, t: null, pt: null, tn: null }, { push: true }) }}
          onOpenTemplate={(p) => { setPaletteOpen(false); patch({ tab: 'templates', t: p, c: null }, { push: true }) }}
        />
      )}
    </PageShell>
  )
}
