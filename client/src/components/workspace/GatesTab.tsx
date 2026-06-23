import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, RotateCw, Loader2 } from 'lucide-react'
import { Spinner } from '../Skeleton'
import { toast } from '../Toast'
import GateStatusBadge from './GateStatusBadge'
import { InfoIcon } from '../Tooltip'
import { getWorkspaceBuildGates, rerunWorkspaceGate, getWorkspaceAction, type GateDetail } from '../../lib/api'

// All canonical gates × status × first-3 findings (rest behind an expander).
// Each gate can be RE-RUN in isolation (POST → poll → refresh) — no full 19-gate
// sweep needed to re-check one gate.
export default function GatesTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const [data, setData] = useState<{ total: number; passed: number; failed: number; missing: number; gates: GateDetail[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [rerunning, setRerunning] = useState<string | null>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(() => {
    return getWorkspaceBuildGates(buildId)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load gates'))
      .finally(() => setLoading(false))
  }, [buildId])

  useEffect(() => { setLoading(true); setError(null); load() }, [load, reloadKey])
  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  const rerun = useCallback(async (gateName: string) => {
    if (rerunning) return
    setRerunning(gateName)
    try {
      const r = await rerunWorkspaceGate(buildId, gateName)
      if (r.status === 'blocked') { toast('warn', `${gateName} blocked — ${r.log}`); setRerunning(null); return }
      if (poll.current) clearInterval(poll.current)
      poll.current = setInterval(async () => {
        try {
          const run = await getWorkspaceAction(r.runId)
          if (run.status !== 'running') {
            if (poll.current) clearInterval(poll.current)
            setRerunning(null)
            toast(run.status === 'done' ? 'success' : 'warn', `${gateName} — ${run.status === 'done' ? 'passed' : `exit ${run.exitCode}`}`)
            load()
          }
        } catch { if (poll.current) clearInterval(poll.current); setRerunning(null) }
      }, 1500)
    } catch (e) {
      setRerunning(null)
      toast('error', e instanceof Error ? e.message : `Failed to re-run ${gateName}`)
    }
  }, [buildId, rerunning, load])

  if (loading) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[13px] text-text-muted">
        <span><b className="text-green">{data.passed}</b> pass</span>
        <span><b className="text-red">{data.failed}</b> fail</span>
        <span><b>{data.missing}</b> no report</span>
        <span className="ml-auto flex items-center gap-1">{data.total} gates
          <InfoIcon label="Automated quality checks (theme-check, accessibility, SEO, design-system, honesty, Lens visual-truth…). All must pass before a theme can publish." />
        </span>
      </div>
      <div className="card divide-y divide-border">
        {data.gates.map((g) => {
          const has = g.findings.length > 0
          const isOpen = open[g.name]
          const busy = rerunning === g.name
          return (
            <div key={g.name}>
              <div className={`w-full flex items-center gap-3 px-4 py-2.5 ${has ? 'hover:bg-text-muted/5' : ''}`}>
                <button onClick={() => has && setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))}
                  className={`flex items-center gap-3 flex-1 min-w-0 text-left ${has ? 'cursor-pointer' : 'cursor-default'}`}>
                  <span className="text-[11px] text-text-muted font-mono w-8 shrink-0">{g.number != null ? `#${g.number}` : '—'}</span>
                  <span className="font-medium text-[13px] flex-1 truncate">{g.name}</span>
                  {has && <span className="text-[11px] text-text-muted shrink-0">{g.findings.length} finding{g.findings.length !== 1 ? 's' : ''}</span>}
                </button>
                <GateStatusBadge status={g.status} />
                <button onClick={() => rerun(g.name)} disabled={!!rerunning}
                  title={`Re-run the ${g.name} gate`}
                  className="text-text-muted hover:text-accent disabled:opacity-40 shrink-0">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> : <RotateCw className="w-3.5 h-3.5" />}
                </button>
                {has ? (
                  <button onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))} className="text-text-muted shrink-0">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                ) : <span className="w-4 shrink-0" />}
              </div>
              {has && isOpen && (
                <ul className="px-4 pb-3 pl-12 space-y-1.5">
                  {g.findings.map((f, i) => (
                    <li key={i} className="flex gap-2 text-[12px]">
                      <span className={`shrink-0 h-fit text-[9px] px-1.5 py-0.5 rounded text-white ${f.severity === 'blocker' ? 'bg-red' : 'bg-amber'}`}>{f.severity}</span>
                      <span className="text-text-muted">{f.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
