import { useEffect, useState, useCallback } from 'react'
import { Eye, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { Spinner } from '../components/Skeleton'
import { getLensLatest, getLensRuns, type LensLatest, type LensFrame, type LensRun } from '../lib/api'

function FactBadges({ facts }: { facts: LensFrame['facts'] }) {
  const items: string[] = []
  if (facts.renderError) items.push('render-error')
  if (facts.nav && facts.nav !== 'ok') items.push(facts.nav)
  if (facts.overflowPx > 1) items.push(`overflow ${facts.overflowPx}px`)
  if (facts.brokenImages) items.push(`${facts.brokenImages} broken-img`)
  if (facts.emptyShells) items.push(`${facts.emptyShells} empty-shell`)
  if (facts.liquidError) items.push('liquid-error')
  if ((facts.cls ?? 0) > 0.1) items.push(`CLS ${facts.cls}`)
  if (facts.consoleErrors) items.push(`${facts.consoleErrors} console`)
  if (!items.length) return <span className="text-[11px] text-text-muted">manifest clean</span>
  return <>{items.map((t, i) => <code key={i} className="text-[10px] bg-red/10 text-red px-1.5 py-0.5 rounded mr-1 inline-block mb-1">{t}</code>)}</>
}

export default function Lens() {
  const [data, setData] = useState<LensLatest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<LensRun[]>([])
  const [selectedDir, setSelectedDir] = useState<string | null>(null)

  const load = useCallback((dir?: string | null) => {
    setLoading(true); setError(null)
    getLensLatest(dir || undefined)
      .then((d) => { setData(d); setSelectedDir(d.dir) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load Lens'))
      .finally(() => setLoading(false))
  }, [])

  // discover every client build with a Lens result for the store switcher
  const loadRuns = useCallback(() => {
    getLensRuns()
      .then((r) => setRuns(r.runs))
      .catch((e) => console.error('[lens] runs fetch failed:', e instanceof Error ? e.message : e))
  }, [])

  // honor ?dir= deep-link (e.g. from the Workspace builds list) on first mount
  useEffect(() => {
    const dir = new URLSearchParams(window.location.search).get('dir')
    load(dir); loadRuns()
  }, [load, loadRuns])

  const verdict = data?.gate18 ? (data.gate18.pass ? 'PASS' : 'BLOCK') : null

  const switcher = runs.length > 1 ? (
    <select
      value={selectedDir ?? ''}
      onChange={(e) => load(e.target.value)}
      className="input input-sm max-w-[260px]"
      title="Switch client build"
    >
      {!runs.some((r) => r.dir === selectedDir) && selectedDir && <option value={selectedDir}>current</option>}
      {runs.map((r) => (
        <option key={r.dir} value={r.dir}>
          {r.client}{r.pass === null ? '' : r.pass ? ' · PASS' : ` · BLOCK (${r.blockers})`}
        </option>
      ))}
    </select>
  ) : null

  return (
    <PageShell
      title="Lens — Visual Truth"
      subtitle={data?.store ? `${data.store}` : 'Visual-quality layer · capture → judge → enforce → autofix'}
      actions={
        <div className="flex items-center gap-2">
          {switcher}
          <button onClick={() => { load(selectedDir); loadRuns() }} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>
        </div>
      }
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="card p-6 text-red flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />{error}
          <button onClick={() => load(selectedDir)} className="underline ml-2">Retry</button>
        </div>
      ) : !data?.present ? (
        <EmptyState
          icon={Eye}
          title="No Lens run to show"
          description={data?.message || 'Run pnpm lens:capture && lens:judge && lens:enforce on a build, then set lens.reports_dir to its gate-reports directory.'}
        />
      ) : (
        <div className="space-y-6">
          {/* verdict bar */}
          <div className="card p-5 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {verdict === 'PASS' ? <CheckCircle2 className="w-8 h-8 text-green" /> : <AlertTriangle className="w-8 h-8 text-red" />}
              <div>
                <div className={`text-lg font-bold ${verdict === 'PASS' ? 'text-green' : 'text-red'}`}>Gate #18 visual-truth: {verdict ?? 'not run'}</div>
                <div className="text-[13px] text-text-muted">
                  {data.summary.frames} frames · {data.summary.fail} FAIL · {data.summary.pass} PASS
                  {data.summary.unjudged ? ` · ${data.summary.unjudged} unjudged` : ''}
                  {data.gate18 ? ` · ${data.gate18.blockers.length} blockers` : ''}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(data.findingsByOwner).map(([owner, fs]) => (
                <span key={owner} className="text-xs text-text-muted bg-text-muted/10 px-2.5 py-1 rounded-full">{owner} · {fs.length}</span>
              ))}
            </div>
          </div>

          {/* gate #18 blockers */}
          {data.gate18 && data.gate18.blockers.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold mb-3 text-red">{data.gate18.blockers.length} blocker(s)</h3>
              <ul className="space-y-2 text-[13px]">
                {data.gate18.blockers.slice(0, 14).map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <code className="text-[11px] bg-red/10 text-red px-1.5 py-0.5 rounded shrink-0 h-fit">{b.id}</code>
                    <span className="text-text-muted">{b.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* captured frames + per-frame verdict */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {data.frames.map((f, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="font-semibold capitalize">
                    {f.surface} <span className="text-text-muted font-normal text-[13px]">· {f.viewport} ({f.dims})</span>
                  </div>
                  {f.verdict
                    ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${f.verdict.verdict === 'FAIL' ? 'bg-red' : 'bg-green'}`}>{f.verdict.verdict} {f.verdict.confidence}%</span>
                    : <span className="text-xs text-text-muted">unjudged</span>}
                </div>
                <div className="px-4 pb-1"><FactBadges facts={f.facts} /></div>
                {f.rest && <img src={f.rest} alt={`${f.surface} ${f.viewport}`} loading="lazy" className="w-full border-t border-border mt-2 bg-black/5" />}
                {f.verdict && f.verdict.findings.length > 0 && (
                  <ul className="px-4 py-3 space-y-1.5 text-[12px] border-t border-border">
                    {f.verdict.findings.map((fd, j) => (
                      <li key={j} className="flex gap-2">
                        <span className={`shrink-0 h-fit text-[10px] px-1.5 py-0.5 rounded text-white ${fd.severity === 'blocker' ? 'bg-red' : 'bg-amber'}`}>
                          {fd.severity}{fd.fix_owner ? `·${fd.fix_owner}` : ''}
                        </span>
                        <span className="text-text-muted"><b>{fd.check}</b> — {fd.evidence}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  )
}
