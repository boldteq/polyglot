import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Spinner } from '../Skeleton'
import GateStatusBadge from './GateStatusBadge'
import { getWorkspaceBuildGates, type GateDetail } from '../../lib/api'

// All 19 canonical gates × status × first-3 findings (rest behind an expander).
export default function GatesTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const [data, setData] = useState<{ total: number; passed: number; failed: number; missing: number; gates: GateDetail[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    getWorkspaceBuildGates(buildId)
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load gates') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [buildId, reloadKey])

  if (loading) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-[13px] text-text-muted">
        <span><b className="text-green">{data.passed}</b> pass</span>
        <span><b className="text-red">{data.failed}</b> fail</span>
        <span><b>{data.missing}</b> no report</span>
        <span className="ml-auto">{data.total} gates</span>
      </div>
      <div className="card divide-y divide-border">
        {data.gates.map((g) => {
          const has = g.findings.length > 0
          const isOpen = open[g.name]
          return (
            <div key={g.name}>
              <button
                onClick={() => has && setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${has ? 'hover:bg-text-muted/5 cursor-pointer' : 'cursor-default'}`}
              >
                <span className="text-[11px] text-text-muted font-mono w-8 shrink-0">{g.number != null ? `#${g.number}` : '—'}</span>
                <span className="font-medium text-[13px] flex-1 truncate">{g.name}</span>
                {has && <span className="text-[11px] text-text-muted">{g.findings.length} finding{g.findings.length !== 1 ? 's' : ''}</span>}
                <GateStatusBadge status={g.status} />
                {has ? (isOpen ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />) : <span className="w-4" />}
              </button>
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
