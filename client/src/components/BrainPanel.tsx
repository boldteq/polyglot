import { useState } from 'react'
import {
  Brain, Zap, Eye, RotateCcw, AlertTriangle, CheckCircle2, XCircle, ShieldCheck,
  Layers, Database, Clock, TrendingUp, GitBranch, Sparkles, FileText,
  Loader2, Check, X, AlertCircle, Trash2, Activity,
  type LucideIcon,
} from 'lucide-react'
import {
  getBrainPatches, getBrainTimeline, applyBrainPatch, rejectBrainPatch,
  type BrainOverview, type BrainPatch, type BrainTimelineEntry, type EvalTrendPoint,
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

const PATCH_TYPE_META: Record<string, { label: string; cls: string }> = {
  anti_pattern:  { label: 'Antipattern', cls: 'bg-red/10 text-red border-red/25' },
  smart_default: { label: 'Smart default', cls: 'bg-blue/10 text-blue border-blue/25' },
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

interface BrainPanelProps { ov: BrainOverview | null; loading: boolean; error: string | null; onRetry: () => void }

export default function BrainPanel({ ov, loading, error, onRetry }: BrainPanelProps) {
  const patches = useCachedApi(CacheKeys.brainPatches('proposed'), () => getBrainPatches('proposed'))
  const timeline = useCachedApi(CacheKeys.brainTimeline, () => getBrainTimeline(40))
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
      {/* What this is */}
      <div className="flex items-start gap-2 text-xs text-text-muted bg-surface-2/40 border border-border rounded-lg px-3 py-2.5">
        <Brain className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
        <span>
          The factory's <strong>self-improving loop</strong>. Detectors spot recurring weaknesses → the governor decides
          (strong evidence + rollback armed = <strong>auto</strong>; everything weaker waits here for one click). Approved
          guardrails are written into the agent's own instructions, reindexed within ~60s, and <strong>auto-reverted</strong> if
          they measurably regress. <code className="px-1">feedback.md</code> is never touched here — those proposals stay in Pending review.
        </span>
      </div>

      {/* Brain health */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat Icon={AlertTriangle} label="Open signals" value={stats.signals.open} tone={stats.signals.open > 0 ? 'text-amber' : 'text-text'} sub={`${stats.signals.patched} patched`} title="Detected recurring weaknesses awaiting a patch decision." />
        <Stat Icon={ShieldCheck} label="Guardrails applied" value={stats.patches.applied} tone="text-emerald" sub={`${stats.patches.reverted} rolled back`} title="Reversible rules written into agent instructions." />
        <Stat Icon={Eye} label="Awaiting review" value={stats.patches.proposed} tone={stats.patches.proposed > 0 ? 'text-amber' : 'text-text'} sub="one-click below" title="Proposed patches that need your approval." />
        <Stat Icon={Zap} label="Governor decisions" value={stats.decisions.auto + stats.decisions.review + stats.decisions.reject} tone="text-text" sub={`${stats.decisions.auto} auto · ${stats.decisions.review} review · ${stats.decisions.reject} reject`} title="Every auto/review/reject the governor has made." />
      </div>

      {/* Eval trend + memory freshness */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-text"><TrendingUp className="w-4 h-4 text-accent" /> Eval quality trend</div>
            <div className="text-[11px] text-text-muted">{ev.sample > 0 ? `mean ${ev.mean} · n=${ev.sample}` : 'no data'}</div>
          </div>
          <EvalSpark trend={ev.trend} />
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-text"><Database className="w-4 h-4 text-accent" /> Memory freshness</div>
            {hygiene?.generatedAt && <div className="text-[11px] text-text-muted">checked {relTime(hygiene.generatedAt)}</div>}
          </div>
          {hygiene ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-lg font-bold text-text">{hygiene.totalChunks}</div><div className="text-[10px] text-text-muted">chunks</div></div>
                <div><div className="text-lg font-bold text-text">{fresh?.avgAgeDays ?? '—'}{fresh?.avgAgeDays != null ? 'd' : ''}</div><div className="text-[10px] text-text-muted">avg age</div></div>
                <div><div className="text-lg font-bold text-text">{fresh?.oldestAgeDays ?? '—'}{fresh?.oldestAgeDays != null ? 'd' : ''}</div><div className="text-[10px] text-text-muted">oldest</div></div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted mt-3 pt-3 border-t border-border">
                <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" /> {hygiene.decayFlaggedRefs} decay-flagged</span>
                <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {hygiene.superseded} superseded</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {hygiene.staleCapturedTotal} stale &gt;180d</span>
                {hygiene.orphans && hygiene.orphans.retiredAgentChunkCount > 0 && <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> {hygiene.orphans.retiredAgentChunkCount} orphan chunks</span>}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-text-muted py-4">The hygiene pass hasn't run yet — freshness, decay and orphan stats will appear after the first sweep.</div>
          )}
        </div>
      </div>

      {/* Training Review inbox */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold text-text">Training Review</h3>
          <span className="text-[11px] text-text-muted">{proposed.length} proposed patch{proposed.length === 1 ? '' : 'es'}</span>
        </div>
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
              const pt = PATCH_TYPE_META[p.patchType] ?? { label: p.patchType, cls: 'bg-surface-2 text-text-muted border-border' }
              const busy = busyId === p.id
              return (
                <div key={p.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${pt.cls}`}>{pt.label}</span>
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
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-text">Self-improvement timeline</h3>
        </div>
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
      </div>
    </div>
  )
}
