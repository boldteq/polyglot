import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronRight, RotateCw, Loader2, Copy, Check } from 'lucide-react'
import { SkeletonCards } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import { toast } from '../Toast'
import GateStatusBadge from './GateStatusBadge'
import { InfoIcon } from '../Tooltip'
import { getWorkspaceBuildGates, rerunWorkspaceGate, getWorkspaceAction, type GateDetail, type GateFinding } from '../../lib/api'

const STAGES = [
  { key: 'setup', label: 'Setup', icon: '🟦' },
  { key: 'quality', label: 'Quality', icon: '🟩' },
]

// ---- paste-ready markdown export (so findings drop straight into Claude to fix) ----
function fmtFinding(f: GateFinding): string {
  const loc = [f.page, f.id ? `(${f.id})` : ''].filter(Boolean).join(' ')
  const sev = f.severity === 'blocker' ? 'BLOCKER' : f.severity
  return `- [${sev}]${loc ? ` ${loc}` : ''}\n  ${f.text}`
}
function gateMarkdown(g: GateDetail): string {
  const status = g.status === 'pass' ? 'passed' : g.status.toUpperCase()
  const head = `## ${g.name}${g.number != null ? ` (#${g.number})` : ''} — ${status} · ${g.findings.length} finding${g.findings.length !== 1 ? 's' : ''}`
  const why = g.desc ? `\nwhat it checks: ${g.desc}` : ''
  return [head + why, '', ...g.findings.map(fmtFinding)].join('\n')
}
function allMarkdown(gates: GateDetail[]): string {
  // failing gates first so the fix prompt leads with blockers
  const withF = gates.filter((g) => g.findings.length > 0)
    .sort((a, b) => (a.status === 'pass' ? 1 : 0) - (b.status === 'pass' ? 1 : 0))
  const total = withF.reduce((s, g) => s + g.findings.length, 0)
  return [
    `# Gate findings to fix (${total} across ${withF.length} gate${withF.length !== 1 ? 's' : ''})`,
    'Each finding = [severity] file:line (rule-id) then what to fix. Resolve every BLOCKER; warnings are best-effort.',
    '',
    ...withF.map(gateMarkdown),
  ].join('\n\n')
}

// All canonical gates × status × findings (with severity + file:line + rule-id), each gate
// individually re-runnable, and Copy-All exports paste-ready markdown for a Claude fix.
export default function GatesTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const [data, setData] = useState<{ total: number; passed: number; failed: number; missing: number; gates: GateDetail[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [rerunning, setRerunning] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(() => {
    return getWorkspaceBuildGates(buildId)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load gates'))
      .finally(() => setLoading(false))
  }, [buildId])

  useEffect(() => { setLoading(true); setError(null); load() }, [load, reloadKey])
  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  const copy = useCallback(async (text: string, key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      toast('success', `Copied ${label} — paste into Claude to fix`)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    } catch {
      toast('error', 'Copy failed — clipboard blocked by the browser')
    }
  }, [])

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

  if (loading) return <SkeletonCards count={3} />
  if (error) return <ErrorState message={error} />
  if (!data) return null

  const totalFindings = data.gates.reduce((s, g) => s + g.findings.length, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[13px] text-text-muted">
        <span><b className="text-text">{data.total}</b> gate{data.total !== 1 ? 's' : ''}</span>
        <span className="text-border">·</span>
        <span><b className="text-green">{data.passed}</b> passed</span>
        <span><b className="text-red">{data.failed}</b> failed</span>
        <span><b>{data.missing}</b> not run</span>
        {totalFindings > 0 && (
          <button
            onClick={() => copy(allMarkdown(data.gates), 'all', `all ${totalFindings} findings`)}
            title="Copy every finding as markdown — paste into Claude to fix"
            className="ml-auto flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-md border border-border hover:border-accent hover:text-accent transition-colors">
            {copied === 'all' ? <Check className="w-3.5 h-3.5 text-green" /> : <Copy className="w-3.5 h-3.5" />}
            Copy all findings
          </button>
        )}
        <span className={totalFindings > 0 ? '' : 'ml-auto'}><InfoIcon label="Automated quality checks (syntax, access, search, tokens, honesty, Lens…). Open a gate to see each finding's severity, file, and fix. Copy All exports them for Claude." /></span>
      </div>
      <div className="card divide-y divide-border">
        {STAGES.filter((s) => data.gates.some((g) => (g.stage || 'quality') === s.key)).map((s) => (
        <div key={s.key}>
          <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-accent bg-accent/10 border-b border-border flex items-center gap-2"><span>{s.icon}</span>{s.label}</div>
          {[...new Set(data.gates.filter((g) => (g.stage || 'quality') === s.key).map((x) => x.category || 'Other'))].map((cat) => (
          <div key={cat}>
            <div className="px-4 py-1 pl-6 text-[10px] font-semibold uppercase tracking-wider text-text-muted bg-text-muted/5">{cat}</div>
            {data.gates.filter((x) => (x.stage || 'quality') === s.key && (x.category || 'Other') === cat).map((g) => {
          const has = g.findings.length > 0
          const isOpen = open[g.name]
          const busy = rerunning === g.name
          const copyKey = `gate:${g.name}`
          return (
            <div key={g.name}>
              <div className={`w-full flex items-center gap-3 px-4 py-2.5 ${has ? 'hover:bg-text-muted/5' : ''}`}>
                <button onClick={() => has && setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))}
                  className={`flex items-center gap-2 min-w-0 text-left ${has ? 'cursor-pointer' : 'cursor-default'}`}>
                  <span className="text-[11px] text-text-muted font-mono w-8 shrink-0">{g.number != null ? `#${g.number}` : '—'}</span>
                  <span className="font-medium text-[13px] truncate">{g.name}</span>
                </button>
                {g.desc && <InfoIcon label={g.desc} className="shrink-0" />}
                {has && <span className="text-[11px] text-text-muted shrink-0">{g.findings.length} finding{g.findings.length !== 1 ? 's' : ''}</span>}
                <span className="flex-1" />
                <GateStatusBadge status={g.status} />
                {has ? (
                  <button onClick={() => copy(gateMarkdown(g), copyKey, `${g.name} findings`)}
                    title={`Copy ${g.name} findings for Claude`}
                    className="text-text-muted hover:text-accent shrink-0">
                    {copied === copyKey ? <Check className="w-3.5 h-3.5 text-green" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                ) : <span className="w-3.5 shrink-0" />}
                <button onClick={() => rerun(g.name)} disabled={!!rerunning}
                  title={`Re-run the ${g.name} gate`}
                  className="text-text-muted hover:text-accent disabled:opacity-40 shrink-0">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" /> : <RotateCw className="w-3.5 h-3.5" />}
                </button>
                {has ? (
                  <button onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))} className="text-text-muted shrink-0">
                    <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                  </button>
                ) : <span className="w-4 shrink-0" />}
              </div>
              {has && isOpen && (
                <ul className="px-4 pb-3 pl-12 space-y-2">
                  {g.findings.map((f, i) => (
                    <li key={i} className="flex gap-2 text-[12px]">
                      <span className={`shrink-0 mt-0.5 h-fit text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded text-white ${f.severity === 'blocker' ? 'bg-red' : 'bg-amber'}`}>{f.severity}</span>
                      <div className="min-w-0">
                        {(f.page || f.id) && (
                          <div className="font-mono text-[10px] text-text-muted truncate">
                            {f.page}{f.page && f.id ? ' · ' : ''}{f.id}
                          </div>
                        )}
                        <div className="text-text-muted leading-snug">{f.text}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
          </div>
          ))}
        </div>
        ))}
      </div>
    </div>
  )
}
