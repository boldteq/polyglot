import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Shield, DollarSign, AlertTriangle, ListChecks, RefreshCw,
  Loader2, TrendingUp, AlertCircle, Activity,
} from 'lucide-react'
import {
  getGovernanceCost,
  getGovernanceEscalations,
  setEnforcementMode,
  type GovernanceCostResponse,
  type Escalation,
} from '../lib/api'
import { toast } from '../components/Toast'

// Token-backed badge classes (flip with theme) — replaces the inline
// color-mix() styles. Compose with `.pill`.
const TIER_PILL: Record<string, string> = {
  deep:  'bg-purple/12 text-purple border border-purple/25',
  fast:  'bg-blue/12 text-blue border border-blue/25',
  cheap: 'bg-emerald/12 text-emerald border border-emerald/25',
}
const TIER_PILL_FALLBACK = 'bg-gray/12 text-gray border border-gray/25'

const TIER_LABELS: Record<string, string> = {
  deep:  'Deep · Opus',
  fast:  'Fast · Sonnet',
  cheap: 'Cheap · Haiku',
}

export default function Governance() {
  const [cost, setCost] = useState<GovernanceCostResponse | null>(null)
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [showOnlyOpen, setShowOnlyOpen] = useState(true)
  const [settingMode, setSettingMode] = useState(false)

  // Stable identity for the per-tier cards so they don't re-create each render.
  const tierEntries = useMemo(() => Object.entries(cost?.tiers ?? {}), [cost?.tiers])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [c, e] = await Promise.all([
        getGovernanceCost(),
        getGovernanceEscalations({ open: showOnlyOpen, limit: 50 }),
      ])
      setCost(c)
      setEscalations(e.items)
    } catch (x: unknown) {
      setErr(x instanceof Error ? x.message : 'Failed to load governance data')
    } finally {
      setLoading(false)
    }
  }, [showOnlyOpen])

  useEffect(() => { load() }, [load])

  if (loading && !cost) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-3" />
        Loading governance data…
      </div>
    )
  }

  if (err && !cost) {
    return (
      <div className="px-8 py-10 text-red text-sm">
        <AlertCircle className="w-5 h-5 inline mr-2" />
        {err}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Compact header — AnalyticsHub provides the page title; this row
          carries the enforcement-mode toggle + refresh button only. */}
      <div className="pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="w-4 h-4 text-purple" />
          <p className="text-xs text-text-muted">Cost · Escalations · Policy enforcement</p>
          {cost && (
            <div className="ml-3 segmented" title="Model-routing enforcement mode">
              {(['advisory', 'warn', 'block'] as const).map((m) => {
                const active = cost.enforcementMode === m
                return (
                  <button
                    key={m}
                    disabled={settingMode}
                    onClick={async () => {
                      if (active || settingMode) return
                      const prev = cost.enforcementMode
                      setSettingMode(true)
                      // Optimistic: reflect the new mode immediately so the toggle
                      // feels responsive; revert on failure.
                      setCost((c) => (c ? { ...c, enforcementMode: m } : c))
                      try {
                        await setEnforcementMode(m)
                        toast('success', `Enforcement → ${m}`)
                        load()
                      } catch (e: unknown) {
                        setCost((c) => (c ? { ...c, enforcementMode: prev } : c))
                        toast('error', e instanceof Error ? e.message : 'Failed to flip mode')
                      } finally {
                        setSettingMode(false)
                      }
                    }}
                    className={`${active ? 'segmented-btn segmented-btn-active' : 'segmented-btn'} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary btn-sm">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      <div className="space-y-6 pb-10">

        {/* Cost rollup — total + per-tier */}
        {cost && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-emerald" />
              <h2 className="text-sm font-bold text-text-muted">
                Cost — last {Math.round(cost.windowHours / 24)}d
              </h2>
            </div>

            {/* Total */}
            <div className="card p-5 mb-3">
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="text-3xl font-bold tabular-nums">
                    ${cost.total.estCostUsd.toFixed(2)}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    of ${cost.total.budgetUsd.toFixed(2)} budget
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-2xl font-bold tabular-nums ${
                      (cost.total.burnPct ?? 0) > 100 ? 'text-red' :
                      (cost.total.burnPct ?? 0) > 75  ? 'text-amber' :
                                                       'text-emerald'
                    }`}
                  >
                    {cost.total.burnPct ?? 0}%
                  </div>
                  <div className="text-[10px] text-text-muted ">burn</div>
                </div>
              </div>
              <BurnBar pct={cost.total.burnPct ?? 0} />
            </div>

            {/* Per-tier */}
            <div className="grid grid-cols-3 gap-3">
              {tierEntries.map(([key, t]) => (
                <div key={key} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`pill font-bold ${TIER_PILL[key] || TIER_PILL_FALLBACK}`}
                      aria-label={`Tier: ${TIER_LABELS[key] || key}`}
                    >
                      {TIER_LABELS[key] || key}
                    </span>
                    <span className="text-[10px] text-text-muted">{t.agents.length} agents</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums">${t.estCostUsd.toFixed(2)}</div>
                  <div className="text-[10px] text-text-muted mb-2">
                    of ${t.budgetUsd.toFixed(2)} · {t.runs} runs
                  </div>
                  <BurnBar pct={t.burnPct ?? 0} small />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Policy violations */}
        {cost && cost.violations.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber" />
              <h2 className="text-sm font-bold text-text-muted">
                Model-routing violations
              </h2>
              <span className="text-xs text-text-muted">({cost.violationCount} in window)</span>
            </div>
            <div className="card overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-2 text-[10px] font-bold text-text-muted">
                <div className="col-span-3">Agent</div>
                <div className="col-span-2">Tier</div>
                <div className="col-span-2">Expected</div>
                <div className="col-span-2">Actual</div>
                <div className="col-span-3">When</div>
              </div>
              <div className="divide-y divide-border">
                {cost.violations.slice(0, 20).map((v, i) => (
                  <div key={`${v.runId}-${i}`} className="grid grid-cols-12 gap-2 px-4 py-2 text-xs">
                    <div className="col-span-3 font-semibold truncate">{v.agentName}</div>
                    <div className="col-span-2 text-text-muted">{v.tier}</div>
                    <div className="col-span-2">
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-emerald/10 text-emerald">
                        {v.expected}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-red/10 text-red">
                        {v.actual}
                      </span>
                    </div>
                    <div className="col-span-3 text-text-muted">
                      {new Date(v.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Escalations */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-4 h-4 text-amber" />
            <h2 className="text-sm font-bold text-text-muted">
              Escalations
            </h2>
            <span className="ml-auto segmented">
              <button
                onClick={() => setShowOnlyOpen(true)}
                className={showOnlyOpen ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}
              >
                Open
              </button>
              <button
                onClick={() => setShowOnlyOpen(false)}
                className={!showOnlyOpen ? 'segmented-btn segmented-btn-active' : 'segmented-btn'}
              >
                All
              </button>
            </span>
          </div>
          {escalations.length === 0 ? (
            <div className="card border-dashed px-5 py-8 text-center">
              <Activity className="w-5 h-5 text-text-muted mx-auto mb-2" />
              <p className="text-xs text-text-muted">
                {showOnlyOpen ? 'No open escalations' : 'No escalations recorded yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {escalations.map((e) => (
                <EscalationCard key={e.id} esc={e} />
              ))}
            </div>
          )}
        </section>

        {/* Footer note */}
        <p className="text-[10px] text-text-muted text-center pt-4">
          Cost data refreshes on demand · Escalation buffer in-memory (200 items) · Witness sweeps SLA daily 03:00 UTC
        </p>
      </div>
    </div>
  )
}

function BurnBar({ pct, small = false }: { pct: number; small?: boolean }) {
  const clamped = Math.max(0, Math.min(150, pct))
  const overflow = clamped > 100
  // Semantic token classes instead of inline color-mix/hex — flips with theme.
  const fillClass = clamped > 100 ? 'bg-red' : clamped > 75 ? 'bg-amber' : 'bg-emerald'
  return (
    <div className={`relative w-full bg-surface-2 rounded-full overflow-hidden ${small ? 'h-1.5' : 'h-2.5'}`}>
      <div
        className={`absolute inset-y-0 left-0 transition-all ${fillClass}`}
        style={{ width: `${Math.min(100, clamped)}%` }}
      />
      {/* Over-budget: a subtle static red wash rather than a noisy pulse — the
          red fill already signals the over-budget state. */}
      {overflow && <div className="absolute inset-y-0 left-0 w-full bg-red/30" />}
    </div>
  )
}

// Token-backed badge classes (flip with theme) — replace inline color-mix().
const TIER_BADGE: Record<string, string> = {
  specialist: 'bg-blue/12 text-blue border border-blue/25',
  'pod-lead': 'bg-amber/12 text-amber border border-amber/25',
  vp:         'bg-purple/12 text-purple border border-purple/25',
}
const TIER_BADGE_FALLBACK = 'bg-red/12 text-red border border-red/25' // yash
const SEV_BADGE: Record<string, string> = {
  p0: 'bg-red/12 text-red border border-red/25',
  p1: 'bg-amber/12 text-amber border border-amber/25',
}
const SEV_BADGE_FALLBACK = 'bg-gray/12 text-gray border border-gray/25'

function EscalationCard({ esc }: { esc: Escalation }) {
  const tierClass = TIER_BADGE[esc.tier] ?? TIER_BADGE_FALLBACK
  const sevClass = SEV_BADGE[esc.severity] ?? SEV_BADGE_FALLBACK
  const isOpen = esc.status === 'open'
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`pill font-bold ${sevClass}`} aria-label={`Severity: ${esc.severity}`}>
          {esc.severity}
        </span>
        <span className={`pill font-bold ${tierClass}`} aria-label={`Tier: ${esc.tier}`}>
          {esc.tier}
        </span>
        <span
          className={`pill font-bold ml-auto ${
            isOpen ? 'bg-amber/15 text-amber border border-amber/30'
                   : 'bg-emerald/15 text-emerald border border-emerald/30'
          }`}
          aria-label={`Status: ${esc.status}`}
        >
          {esc.status}
        </span>
      </div>
      <h3 className="text-sm font-bold mb-1 truncate">{esc.title}</h3>
      <p className="text-xs text-text-muted truncate">{esc.summary || '—'}</p>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-text-muted">
        <span>agent: <span className="font-semibold text-text">{esc.agentId}</span></span>
        {esc.taskId && <span>task: <span className="font-mono">{esc.taskId}</span></span>}
        <span className="ml-auto">opened {new Date(esc.openedAt).toLocaleString()}</span>
      </div>
      {esc.history && esc.history.length > 0 && (
        <details className="mt-2">
          <summary className="text-[10px] text-text-muted cursor-pointer hover:text-text">
            <TrendingUp className="w-3 h-3 inline mr-1" />
            History ({esc.history.length})
          </summary>
          <ol className="mt-2 space-y-1 pl-4 border-l-2 border-border">
            {esc.history.map((h, i) => (
              <li key={i} className="text-[10px] text-text-muted">
                <span className="font-bold uppercase">{h.action}</span>
                {' → '}{h.tier}
                {' · by '}{h.by}
                {' · '}{new Date(h.at).toLocaleTimeString()}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}
