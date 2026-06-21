import { useState } from 'react'
import {
  Brain, Zap, Eye, RotateCcw, AlertTriangle, CheckCircle2, XCircle, ShieldCheck,
  Layers, Database, Clock, TrendingUp, TrendingDown, GitBranch, Sparkles, FileText,
  Loader2, Check, X, AlertCircle, Trash2, Activity, Scale, Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  getBrainPatches, getBrainTimeline, applyBrainPatch, rejectBrainPatch,
  getBrainSignals, updateBrainSignalStatus, getUnresolvedDecisions, resolveDecision,
  type BrainOverview, type BrainPatch, type BrainSignal, type BrainTimelineEntry, type EvalTrendPoint,
  type BrainDecision,
} from '../lib/api'
import { useCachedApi } from '../hooks/useCachedApi'
import { CacheKeys } from '../lib/cacheKeys'
import { toast } from './Toast'
import { confirmDialog } from '../lib/confirm'
import { formatAgentDisplay } from '../lib/agentDisplay'
import EmptyState from './EmptyState'

// ── small utils ──────────────────────────────────────────────────────────────
function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
// Strip the invisible signal-id marker + markdown bold so a rule line reads clean.
function cleanRule(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, '').replace(/\*\*/g, '').replace(/^\s*-\s*/, '').trim()
}
function shortPath(p: string | null): string {
  if (!p) return 'unattributed'
  return p.split('/').slice(-3).join('/')
}
function agentName(id: string): string {
  return formatAgentDisplay({ id }).realName || id
}

const PATCH_TYPE_META: Record<string, { label: string; cls: string; desc: string }> = {
  anti_pattern:  { label: 'Antipattern', cls: 'bg-red/10 text-red border-red/25', desc: 'A guardrail against a mistake the agent keeps making' },
  smart_default: { label: 'Smart default', cls: 'bg-blue/10 text-blue border-blue/25', desc: 'A recommended default the agent should adopt' },
}
const SEVERITY_META: Record<string, string> = {
  p0: 'bg-red/15 text-red border-red/30',
  high: 'bg-amber/15 text-amber border-amber/30',
  medium: 'bg-blue/10 text-blue border-blue/25',
  low: 'bg-surface-2 text-text-muted border-border',
}
// kind → icon + tone for the self-improvement timeline.
const TIMELINE_META: Record<string, { Icon: LucideIcon; tone: string }> = {
  signal:         { Icon: AlertTriangle, tone: 'text-amber' },
  decision:       { Icon: Eye,           tone: 'text-blue' },
  patch_applied:  { Icon: CheckCircle2,  tone: 'text-emerald' },
  patch_reverted: { Icon: RotateCcw,     tone: 'text-red' },
  conflict:       { Icon: GitBranch,     tone: 'text-purple' },
  hygiene:        { Icon: Database,      tone: 'text-text-muted' },
}
const DECISION_META: Record<string, { Icon: LucideIcon; cls: string; label: string }> = {
  auto:   { Icon: Zap,    cls: 'bg-emerald/10 text-emerald border-emerald/25', label: 'auto' },
  review: { Icon: Eye,    cls: 'bg-amber/10 text-amber border-amber/25',       label: 'review' },
  reject: { Icon: XCircle, cls: 'bg-red/10 text-red border-red/25',            label: 'reject' },
}

// ── stat tile ────────────────────────────────────────────────────────────────
function Stat({ Icon, label, value, tone, sub, title }: { Icon: LucideIcon; label: string; value: number | string; tone: string; sub?: string; title?: string }) {
  return (
    <div className="card p-3.5" title={title}>
      <div className="flex items-center gap-1.5 text-text-muted text-[11px] mb-1.5"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

// ── eval sparkline (overall 0..1, oldest → newest) ───────────────────────────
function EvalSpark({ trend }: { trend: EvalTrendPoint[] }) {
  if (!trend.length) return <div className="text-[11px] text-text-muted py-4">No eval scores yet — the judge scores captured runs as they accrue.</div>
  return (
    <div className="flex items-end gap-1 h-[56px]">
      {trend.map((p, i) => {
        const h = Math.max(3, Math.round(p.overall * 52))
        const tone = p.overall >= 0.7 ? 'bg-emerald/70' : p.overall >= 0.5 ? 'bg-amber/70' : 'bg-red/60'
        return <div key={i} className={`flex-1 rounded-sm ${tone}`} style={{ height: h }} title={`${Math.round(p.overall * 100)}%${p.caseId ? ` · ${p.caseId}` : ''} · ${relTime(p.ts)}`} />
      })}
    </div>
  )
}

// ── Detected weaknesses: eval_drop signals (consequence-learning, gap #2) ──────
// These are raw "an agent's judge score fell below floor" detections from the
// Witness sweep. They route to REVIEW (never auto) — a low score may be the
// agent's fault OR the judge's (when miscalibrated, severity is forced 'low' and
// judge_calibrated:false). Human triage: acknowledge (seen, no action) or dismiss
// (stop re-surfacing). Patches, if any, still flow through Training Review above.
function num(e: Record<string, unknown>, k: string): number | null {
  const v = e[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
// Human-readable label + plain-language tooltip per signal kind (eval_drop keeps
// its rich evidence renderer; the rest render as compact rows with the tooltip so
// they're no longer counted-but-invisible jargon).
const SIGNAL_KIND_META: Record<string, { label: string; desc: string }> = {
  eval_drop:       { label: 'Eval drop',       desc: 'An agent’s quality score dropped below its recent average' },
  failure_cluster: { label: 'Failure cluster', desc: 'The same error repeated across several runs or projects' },
  antipattern:     { label: 'Antipattern',     desc: 'A recurring mistake flagged not to repeat' },
  gate_defect:     { label: 'Gate defect',     desc: 'A recurring quality-check failure (layout, accessibility, lint)' },
  yash_correction: { label: 'Correction',      desc: 'A fix you gave an agent directly' },
  signal:          { label: 'Signal',          desc: 'A detected weakness awaiting a decision' },
}

function OpenSignals() {
  const signals = useCachedApi(CacheKeys.brainSignals('open'), () => getBrainSignals('open'))
  const [busyId, setBusyId] = useState<string | null>(null)
  const items = signals.data?.items ?? []

  async function triage(s: BrainSignal, status: 'acknowledged' | 'dismissed') {
    setBusyId(s.id)
    try {
      await updateBrainSignalStatus(s.id, status)
      toast(status === 'dismissed' ? 'warn' : 'success',
        status === 'dismissed' ? `Dismissed · won't re-surface for ${agentName(s.agent)}` : `Acknowledged · ${agentName(s.agent)}`)
      signals.refetch()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Update failed')
    } finally { setBusyId(null) }
  }

  if (signals.loading && !signals.data) return null

  const TriageButtons = ({ s }: { s: BrainSignal }) => {
    const busy = busyId === s.id
    return (
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => triage(s, 'dismissed')} disabled={busy} className="btn-ghost btn-sm text-text-muted hover:bg-surface-2 disabled:opacity-50" title="Dismiss — stop re-surfacing this signal">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Dismiss
        </button>
        <button onClick={() => triage(s, 'acknowledged')} disabled={busy} className="btn-ghost btn-sm disabled:opacity-50" title="Acknowledge — mark seen, keep watching">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Acknowledge
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <TrendingDown className="w-4 h-4 text-amber" />
        <h3 className="text-sm font-semibold text-text">Detected weaknesses</h3>
        <span className="text-[11px] text-text-muted">{items.length} open signal{items.length === 1 ? '' : 's'}</span>
      </div>
      <p className="text-[11px] text-text-muted mb-2">Recurring problems the system spotted in agent behavior. Acknowledge (seen) or dismiss (stop showing it).</p>
      {items.length === 0 ? (
        <div className="card p-4 flex items-center gap-2 text-[12px] text-text-muted"><CheckCircle2 className="w-4 h-4 text-emerald shrink-0" /> No weaknesses detected — your agents are healthy.</div>
      ) : (
      <div className="space-y-2.5">
        {items.map((s) => {
          if (s.kind === 'eval_drop') {
            const mean = num(s.evidence, 'mean')
            const floor = num(s.evidence, 'floor')
            const n = num(s.evidence, 'n')
            const fails = num(s.evidence, 'fails')
            const calibrated = s.evidence.judge_calibrated !== false
            const reason = typeof s.evidence.judge_reason === 'string' ? s.evidence.judge_reason : null
            return (
              <div key={s.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase ${SEVERITY_META[s.severity] ?? SEVERITY_META.low}`}>{s.severity}</span>
                      <span className="text-sm font-semibold text-text">{agentName(s.agent)}</span>
                      {!calibrated && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-surface-2 text-text-muted" title={`The eval judge is ${reason ?? 'miscalibrated'} — this score isn't credible evidence against the agent, so no PIP is triggered.`}>
                          judge {reason ?? 'miscalibrated'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted mt-1">
                      <span>mean <strong className={mean != null && floor != null && mean < floor ? 'text-red' : 'text-text'}>{mean != null ? mean.toFixed(2) : '—'}</strong> / floor {floor != null ? floor.toFixed(2) : '—'}</span>
                      {n != null && <span>n={n}</span>}
                      {fails != null && fails > 0 && <span>{fails} fail{fails === 1 ? '' : 's'}</span>}
                      <span>{relTime(s.ts)}</span>
                    </div>
                  </div>
                  <TriageButtons s={s} />
                </div>
              </div>
            )
          }
          // Compact row for every other open-signal kind (previously invisible).
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase ${SEVERITY_META[s.severity] ?? SEVERITY_META.low}`}>{s.severity}</span>
                    <span title={SIGNAL_KIND_META[s.kind]?.desc} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-surface-2 text-text-muted cursor-help">{SIGNAL_KIND_META[s.kind]?.label ?? s.kind}</span>
                    <span className="text-sm font-semibold text-text">{agentName(s.agent)}</span>
                  </div>
                  {s.signature && <div className="text-[12px] text-text-secondary mt-1 truncate" title={s.signature}>{s.signature}</div>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted mt-1">
                    {s.occurrences > 0 && <span>seen {s.occurrences}×</span>}
                    {s.projects?.length > 0 && <span>{s.projects.slice(0, 3).join(', ')}</span>}
                    <span>{relTime(s.ts)}</span>
                  </div>
                </div>
                <TriageButtons s={s} />
              </div>
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}

// ── Decision Journal (v30) — the consequence half of the loop, made actionable ─
// Aged decisions awaiting a real-world outcome + the rolling accuracy of resolved
// ones. Resolving records right/wrong (review-only; writes no memory/identity).
function DecisionJournal() {
  const dec = useCachedApi(CacheKeys.brainDecisions, () => getUnresolvedDecisions({ sinceDays: 90, limit: 50 }))
  const [busyId, setBusyId] = useState<string | null>(null)
  const items = dec.data?.items ?? []
  const acc = dec.data?.accuracy

  async function resolve(d: BrainDecision, outcome: 'confirmed' | 'wrong') {
    if (outcome === 'wrong') {
      const ok = await confirmDialog({
        title: 'Mark this decision wrong?',
        message: `Records that "${(d.summary || 'this decision').slice(0, 80)}" turned out wrong. Feeds the rolling decision-accuracy and the weekly re-score. Review-only — writes no memory.`,
        danger: true, confirmLabel: 'Mark wrong',
      })
      if (!ok) return
    }
    setBusyId(d.id)
    try {
      await resolveDecision(d.id, { outcome })
      toast(outcome === 'confirmed' ? 'success' : 'warn', outcome === 'confirmed' ? 'Marked right' : 'Marked wrong')
      dec.refetch()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Resolve failed')
    } finally { setBusyId(null) }
  }

  if (dec.loading && !dec.data) return null

  const accPct = acc && acc.accuracy != null ? Math.round(acc.accuracy * 100) : null
  return (
    <div>
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <Scale className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold text-text">Decision outcomes</h3>
        {accPct != null && <span className="text-[11px] text-text-muted">{accPct}% right · {acc!.resolved} resolved (90d)</span>}
        {items.length > 0 && <span className="text-[11px] text-text-muted">· {items.length} awaiting outcome</span>}
      </div>
      <p className="text-[11px] text-text-muted mb-2">Decisions you logged — mark whether each turned out right so the system learns from real outcomes.</p>
      {items.length === 0 ? (
        <EmptyState card icon={CheckCircle2} title="No decisions to score yet" description="Once you log a decision and it ages a little, it shows here so you can mark whether it turned out right or wrong." />
      ) : (
        <div className="space-y-2.5">
          {items.map((d) => {
            const busy = busyId === d.id
            return (
              <div key={d.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-text">{d.summary || 'Untitled decision'}</div>
                    {d.detail && <div className="text-[12px] text-text-secondary mt-0.5">{String(d.detail).slice(0, 200)}</div>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted mt-1">
                      {d.project && <span>{d.project}</span>}
                      <span>{relTime(d.ts)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => resolve(d, 'wrong')} disabled={busy} className="btn-ghost btn-sm text-red hover:bg-red/10 disabled:opacity-50" title="The decision turned out wrong">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Was wrong
                    </button>
                    <button onClick={() => resolve(d, 'confirmed')} disabled={busy} className="btn-ghost btn-sm text-emerald hover:bg-emerald/10 disabled:opacity-50" title="The decision turned out right">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Confirmed right
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface BrainPanelProps { ov: BrainOverview | null; loading: boolean; error: string | null; onRetry: () => void }

export default function BrainPanel({ ov, loading, error, onRetry }: BrainPanelProps) {
  const patches = useCachedApi(CacheKeys.brainPatches('proposed'), () => getBrainPatches('proposed'))
  const [tlLimit, setTlLimit] = useState(40)
  // Limit is part of the key so "Show more" re-subscribes + fetches a bigger page.
  // Still brain/-prefixed → covered by the brain SSE invalidation in cacheKeys.ts.
  const timeline = useCachedApi(`${CacheKeys.brainTimeline}/${tlLimit}`, () => getBrainTimeline(tlLimit))
  const [busyId, setBusyId] = useState<string | null>(null)

  async function onApply(p: BrainPatch) {
    const who = agentName(p.agent)
    const ok = await confirmDialog({
      title: `Teach ${who} this guardrail?`,
      message: `Writes a reversible rule into ${shortPath(p.targetFile)}${p.evidenceLabel ? ` · ${p.evidenceLabel}` : ''}. It's tracked and can be rolled back anytime, and is auto-reverted if it measurably hurts ${who}.`,
      confirmLabel: 'Apply patch',
    })
    if (!ok) return
    setBusyId(p.id)
    try {
      const r = await applyBrainPatch(p.id)
      toast('success', r.alreadyApplied ? `Already learned · ${who}` : `Applied · ${who} learned a new guardrail`)
      patches.refetch(); timeline.refetch(); onRetry()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Apply failed')
    } finally { setBusyId(null) }
  }

  async function onReject(p: BrainPatch) {
    const who = agentName(p.agent)
    const ok = await confirmDialog({
      title: 'Reject this proposal?',
      message: `The signal is dismissed so it stops being re-proposed for ${who}. You can still re-learn it later if the weakness recurs.`,
      danger: true, confirmLabel: 'Reject',
    })
    if (!ok) return
    setBusyId(p.id)
    try {
      await rejectBrainPatch(p.id)
      toast('warn', `Rejected · proposal dismissed for ${who}`)
      patches.refetch(); timeline.refetch(); onRetry()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Reject failed')
    } finally { setBusyId(null) }
  }

  if (loading && !ov) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-surface-2/50 border border-border animate-pulse" />)}
      </div>
    )
  }
  if (error && !ov) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle className="w-8 h-8 text-red" />
        <div className="text-sm text-text">Couldn't load the brain</div>
        <div className="text-xs text-text-muted max-w-sm">{error}</div>
        <button onClick={onRetry} className="btn-primary btn-sm mt-1">Retry</button>
      </div>
    )
  }
  if (!ov) return null

  const { stats, hygiene, eval: ev } = ov
  const fresh = hygiene?.freshness
  const proposed = patches.data?.items ?? []
  const tl = timeline.data?.items ?? ov.recentTimeline ?? []

  return (
    <div className="space-y-6">
      {/* What this is — plain language */}
      <div className="flex items-start gap-2 text-xs text-text-muted bg-surface-2/40 border border-border rounded-lg px-3 py-2.5">
        <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
        <span>
          Your AI agents notice their own recurring mistakes and propose fixes. <strong>Strong, safe fixes apply automatically</strong>;
          the rest wait below for your one-click approval. Every applied fix is a rule added to the agent's own instructions, and is
          <strong> automatically undone</strong> if it makes things worse. (Your <code className="px-1">feedback.md</code> is never changed here.)
        </span>
      </div>

      {/* Brain health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat Icon={AlertTriangle} label="Open issues" value={stats.signals.open} tone={stats.signals.open > 0 ? 'text-amber' : 'text-text'} sub={`${stats.signals.patched} fixed`} title="Recurring weaknesses the system detected that don't yet have a fix. Listed under ‘Detected weaknesses’ below." />
        <Stat Icon={ShieldCheck} label="Fixes applied" value={stats.patches.applied} tone="text-emerald" sub={`${stats.patches.reverted} undone`} title="Rules written into agent instructions to fix a weakness. Reversible — auto-undone if they hurt performance." />
        <Stat Icon={Eye} label="Your approval needed" value={stats.patches.proposed} tone={stats.patches.proposed > 0 ? 'text-amber' : 'text-text'} sub="one-click below" title="Proposed fixes waiting for you to approve or reject in ‘Training review’ below." />
        <Stat Icon={Zap} label="Auto-decisions made" value={stats.decisions.auto + stats.decisions.review + stats.decisions.reject} tone="text-text" sub={`${stats.decisions.auto} auto · ${stats.decisions.review} review · ${stats.decisions.reject} rejected`} title="How the system has routed proposed fixes so far: auto-applied (safe), sent to you for review, or rejected (too risky / not enough evidence)." />
      </div>

      {/* Eval trend + memory freshness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-text"><TrendingUp className="w-4 h-4 text-accent" /> Agent quality trend</div>
            <div className="text-[11px] text-text-muted">{ev.sample > 0 ? `avg ${ev.mean} · ${ev.sample} scored` : 'no data'}</div>
          </div>
          <p className="text-[11px] text-text-muted mb-3">An independent judge scores agent outputs 0–1 (higher is better). Green = strong, red = weak, gray = not enough scores yet.</p>
          <EvalSpark trend={ev.trend} />
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-text"><Database className="w-4 h-4 text-accent" /> Memory freshness</div>
            {hygiene?.generatedAt && <div className="text-[11px] text-text-muted">checked {relTime(hygiene.generatedAt)}</div>}
          </div>
          <p className="text-[11px] text-text-muted -mt-1 mb-3">How current the knowledge in memory is, and whether anything is going stale.</p>
          {hygiene ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div title="Total items stored in memory (agent instructions, lessons, patterns, rules)."><div className="text-lg font-bold text-text">{hygiene.totalChunks}</div><div className="text-[10px] text-text-muted cursor-help">items</div></div>
                <div title="Average age of stored items since they were last indexed."><div className="text-lg font-bold text-text">{fresh?.avgAgeDays ?? '—'}{fresh?.avgAgeDays != null ? 'd' : ''}</div><div className="text-[10px] text-text-muted cursor-help">avg age</div></div>
                <div title="Age of the oldest stored item."><div className="text-lg font-bold text-text">{fresh?.oldestAgeDays ?? '—'}{fresh?.oldestAgeDays != null ? 'd' : ''}</div><div className="text-[10px] text-text-muted cursor-help">oldest</div></div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted mt-3 pt-3 border-t border-border">
                <span className="flex items-center gap-1 cursor-help" title="Deprioritized in search (e.g. from retired agents) — not deleted."><RotateCcw className="w-3 h-3" /> {hygiene.decayFlaggedRefs} deprioritized</span>
                <span className="flex items-center gap-1 cursor-help" title="Replaced by a newer version — kept but ranked lower."><GitBranch className="w-3 h-3" /> {hygiene.superseded} replaced</span>
                <span className="flex items-center gap-1 cursor-help" title="Unverified lessons/bugs older than 6 months — flagged for review, not auto-deleted."><Clock className="w-3 h-3" /> {hygiene.staleCapturedTotal} old (&gt;180d)</span>
                {hygiene.orphans && hygiene.orphans.retiredAgentChunkCount > 0 && <span className="flex items-center gap-1 cursor-help" title="Items from agents that no longer exist."><Trash2 className="w-3 h-3" /> {hygiene.orphans.retiredAgentChunkCount} orphaned</span>}
              </div>
              {hygiene.recommendations?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted"><Wrench className="w-3 h-3" /> Recommended cleanups</div>
                  {hygiene.recommendations.slice(0, 4).map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-text-secondary">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${r.severity === 'high' ? 'bg-red' : r.severity === 'medium' ? 'bg-amber' : 'bg-text-muted'}`} />
                      <span>{r.detail}{r.agents?.length ? ` · ${r.agents.slice(0, 3).join(', ')}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-text-muted py-4">The hygiene pass hasn't run yet — freshness, decay and orphan stats will appear after the first sweep.</div>
          )}
        </div>
      </div>

      {/* Detected weaknesses — every open signal kind, triageable */}
      <OpenSignals />

      {/* Decision outcomes — the consequence half of the loop, made actionable */}
      <DecisionJournal />

      {/* Training Review inbox */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-text">Training review</h3>
          <span className="text-[11px] text-text-muted">{proposed.length} fix{proposed.length === 1 ? '' : 'es'} to approve</span>
        </div>
        <p className="text-[11px] text-text-muted mb-2">Proposed rules for your agents. Apply adds the guardrail (reversible); reject dismisses it.</p>
        {patches.loading && !patches.data ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-28 rounded-xl bg-surface-2/50 border border-border animate-pulse" />)}</div>
        ) : patches.error && !patches.data ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle className="w-7 h-7 text-red" />
            <div className="text-xs text-text-muted max-w-sm">{patches.error}</div>
            <button onClick={patches.refetch} className="btn-primary btn-sm mt-1">Retry</button>
          </div>
        ) : proposed.length === 0 ? (
          <EmptyState card icon={Check} title="No patches awaiting review" description="Strong-evidence self-changes apply automatically. Weaker proposals land here for one click. Nothing pending right now." />
        ) : (
          <div className="space-y-2.5">
            {proposed.map((p) => {
              const pt = PATCH_TYPE_META[p.patchType] ?? { label: p.patchType, cls: 'bg-surface-2 text-text-muted border-border', desc: 'A proposed fix' }
              const busy = busyId === p.id
              return (
                <div key={p.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span title={pt.desc} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium cursor-help ${pt.cls}`}>{pt.label}</span>
                        {p.signal && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase ${SEVERITY_META[p.signal.severity] ?? SEVERITY_META.low}`}>{p.signal.severity}</span>}
                        <span className="text-sm font-semibold text-text">{agentName(p.agent)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-0.5">
                        <FileText className="w-3 h-3 shrink-0" />
                        <span className="truncate" title={p.targetFile ?? undefined}>{shortPath(p.targetFile)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => onReject(p)} disabled={busy} className="btn-ghost btn-sm text-red hover:bg-red/10 disabled:opacity-50" title="Reject — dismiss this proposal">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Reject
                      </button>
                      <button onClick={() => onApply(p)} disabled={busy} className="btn-primary btn-sm disabled:opacity-50" title="Apply — write this guardrail (reversible)">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Apply
                      </button>
                    </div>
                  </div>

                  {p.evidenceLabel && (
                    <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                      <Layers className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span><strong className="text-text">{p.evidenceLabel}</strong>{p.signal?.projects?.length ? ` — ${p.signal.projects.join(', ')}` : ''}</span>
                    </div>
                  )}

                  {/* the diff — the new guardrail line that gets inserted */}
                  <div className="rounded-lg border border-emerald/25 bg-emerald/5 px-3 py-2 flex gap-2 text-[12px] leading-relaxed">
                    <span className="text-emerald font-bold select-none">+</span>
                    <span className="text-text">{cleanRule(p.after_text)}</span>
                  </div>

                  {p.decisionReasons?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-text-muted">routed to review:</span>
                      {p.decisionReasons.map((r) => <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-muted border border-border">{r}</span>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Self-improvement timeline */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-text">Activity timeline</h3>
        </div>
        <p className="text-[11px] text-text-muted mb-2">A running log of what the learning system did — issues found, fixes applied, and rollbacks.</p>
        {tl.length === 0 ? (
          <div className="text-[11px] text-text-muted py-4">No activity yet. Signals, decisions, applied patches and rollbacks will stream here.</div>
        ) : (
          <div className="card divide-y divide-border">
            {tl.map((e: BrainTimelineEntry) => {
              const meta = TIMELINE_META[e.kind] ?? { Icon: Sparkles, tone: 'text-text-muted' }
              const dec = e.decision ? DECISION_META[e.decision] : null
              return (
                <div key={e.id} className="flex items-start gap-3 px-3.5 py-2.5">
                  <meta.Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-text truncate" title={e.summary ?? undefined}>{e.summary || e.kind}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-text-muted">
                      {e.agent && <span>{agentName(e.agent)}</span>}
                      <span>{relTime(e.ts)}</span>
                    </div>
                  </div>
                  {dec && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${dec.cls}`}>{dec.label}</span>}
                </div>
              )
            })}
          </div>
        )}
        {timeline.data && timeline.data.items.length >= tlLimit && tlLimit < 200 && (
          <button onClick={() => setTlLimit((n) => Math.min(200, n + 40))} className="mt-2 text-[11px] font-medium text-accent hover:underline">
            Show more
          </button>
        )}
      </div>
    </div>
  )
}
