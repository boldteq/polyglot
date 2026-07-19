import { Check, X, Minus, ShieldCheck, ShieldAlert, ShieldX, Clock } from 'lucide-react'
import type { BuildDone } from '../../lib/api'

// "Done means done" proof pane. Renders the REAL composed done-state (maestro publish-readiness +
// orchestration + freshness) — NOT a gate pass-count — so a human can see each condition proven with
// its evidence artifact, and can trust "done" instead of re-checking by hand. Backed by build.done
// from assembleBuild (src/routes/workspace.js doneStateFor).

function Row({ ok, label, evidence }: { ok: boolean | null; label: string; evidence: string }) {
  const icon = ok === true
    ? <Check className="w-4 h-4 text-green shrink-0" />
    : ok === false
      ? <X className="w-4 h-4 text-red shrink-0" />
      : <Minus className="w-4 h-4 text-text-muted shrink-0" />
  return (
    <li className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
      {icon}
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] ${ok === false ? 'text-red' : ok === null ? 'text-text-muted' : 'text-text'}`}>{label}</div>
        <div className="text-[11px] text-text-muted font-mono truncate">{evidence}</div>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-text-muted shrink-0 mt-0.5">
        {ok === true ? 'proven' : ok === false ? 'failing' : 'pending'}
      </span>
    </li>
  )
}

export default function DoneProofPanel({ done }: { done?: BuildDone }) {
  if (!done) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-[13px] text-text-muted"><Clock className="w-4 h-4" /> No build run yet — run Maestro to produce a publish-readiness verdict.</div>
      </div>
    )
  }
  const verdict = done.trulyDone
    ? { icon: <ShieldCheck className="w-5 h-5" />, tone: 'text-green bg-green/10 border-green/30', text: 'Truly done — every condition proven & evidence fresh' }
    : done.publishReady === true && done.fresh === false
      ? { icon: <ShieldAlert className="w-5 h-5" />, tone: 'text-amber bg-amber/10 border-amber/30', text: 'Ready, but evidence is stale — re-run the build (something changed under it)' }
      : done.publishReady === true
        ? { icon: <ShieldCheck className="w-5 h-5" />, tone: 'text-green bg-green/10 border-green/30', text: 'Publish-ready' }
        : done.publishReady === false
          ? { icon: <ShieldX className="w-5 h-5" />, tone: 'text-red bg-red/10 border-red/30', text: `Not done${done.stage ? ` — stopped at ${done.stage}` : ''}` }
          : { icon: <Clock className="w-5 h-5" />, tone: 'text-text-muted bg-surface-2 border-border', text: 'No verdict yet' }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className={`flex items-center gap-2.5 px-4 py-3 border-b ${verdict.tone}`}>
        {verdict.icon}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">{verdict.text}</div>
          {done.reason && done.publishReady === false && <div className="text-[11px] opacity-80 truncate">{done.reason}</div>}
        </div>
      </div>
      <div className="px-4 py-1">
        <ul>
          {done.conditions.map((c) => <Row key={c.id} ok={c.ok} label={c.label} evidence={c.evidence} />)}
        </ul>
      </div>
      {done.sha && (
        <div className="px-4 py-2 border-t border-border text-[11px] text-text-muted font-mono">
          evidence @ {done.sha.slice(0, 7)} {done.fresh === true ? '· fresh (matches HEAD)' : done.fresh === false ? '· STALE (HEAD moved — re-run)' : ''}
        </div>
      )}
    </div>
  )
}
