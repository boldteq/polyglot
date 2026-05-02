import { useEffect, useState, useCallback } from 'react'
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

const TIER_COLORS: Record<string, string> = {
  deep:  '#a855f7',
  fast:  '#3b82f6',
  cheap: '#10b981',
}

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
      <div className="px-8 py-10 text-red-400 text-sm">
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
          <Shield className="w-4 h-4 text-purple-400" />
          <p className="text-xs text-text-muted">Cost · Escalations · Policy enforcement</p>
          {cost && (
            <div className="ml-3 flex items-center gap-1 bg-surface-2 rounded-lg p-0.5 border border-border" title="Model-routing enforcement mode">
              {(['advisory', 'warn', 'block'] as const).map((m) => {
                const active = cost.enforcementMode === m
                const colorActive = m === 'block' ? 'bg-red-500 text-white' : m === 'warn' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                return (
                  <button
                    key={m}
                    onClick={async () => {
                      if (active) return
                      try {
                        await setEnforcementMode(m)
                        toast('success', `Enforcement → ${m}`)
                        load()
                      } catch (e: unknown) {
                        toast('error', e instanceof Error ? e.message : 'Failed to flip mode')
                      }
                    }}
                    className={`text-[9px] px-2 py-1 rounded-md font-bold uppercase tracking-wider transition-all ${
                      active ? colorActive : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-surface border border-border text-text-muted hover:text-text disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      <div className="space-y-6 pb-10">

        {/* Cost rollup — total + per-tier */}
        {cost && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                Cost — last {Math.round(cost.windowHours / 24)}d
              </h2>
            </div>

            {/* Total */}
            <div className="rounded-2xl border border-border bg-surface p-5 mb-3">
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
                      (cost.total.burnPct ?? 0) > 100 ? 'text-red-400' :
                      (cost.total.burnPct ?? 0) > 75  ? 'text-amber-400' :
                                                       'text-emerald-400'
                    }`}
                  >
                    {cost.total.burnPct ?? 0}%
                  </div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">burn</div>
                </div>
              </div>
              <BurnBar pct={cost.total.burnPct ?? 0} />
            </div>

            {/* Per-tier */}
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(cost.tiers).map(([key, t]) => (
                <div key={key} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${TIER_COLORS[key] || '#6b7280'}20`,
                        color: TIER_COLORS[key] || '#6b7280',
                        border: `1px solid ${TIER_COLORS[key] || '#6b7280'}40`,
                      }}
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
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                Model-routing violations
              </h2>
              <span className="text-xs text-text-muted">({cost.violationCount} in window)</span>
            </div>
            <div className="rounded-2xl border border-border bg-surface overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
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
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-500/10 text-emerald-400">
                        {v.expected}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="px-1.5 py-0.5 rounded font-mono font-bold bg-red-500/10 text-red-400">
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
            <ListChecks className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Escalations
            </h2>
            <span className="ml-auto flex items-center gap-1 text-xs">
              <button
                onClick={() => setShowOnlyOpen(true)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  showOnlyOpen ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
                }`}
              >
                Open
              </button>
              <button
                onClick={() => setShowOnlyOpen(false)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  !showOnlyOpen ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
                }`}
              >
                All
              </button>
            </span>
          </div>
          {escalations.length === 0 ? (
            <div className="rounded-2xl border border-border border-dashed bg-surface px-5 py-8 text-center">
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
  const fillColor = clamped > 100 ? '#ef4444' : clamped > 75 ? '#f59e0b' : '#10b981'
  return (
    <div className={`relative w-full bg-surface-2 rounded-full overflow-hidden ${small ? 'h-1.5' : 'h-2.5'}`}>
      <div
        className="absolute inset-y-0 left-0 transition-all"
        style={{ width: `${Math.min(100, clamped)}%`, backgroundColor: fillColor }}
      />
      {overflow && (
        <div
          className="absolute inset-y-0 left-0 animate-pulse"
          style={{ width: '100%', backgroundColor: '#ef4444', opacity: 0.5 }}
        />
      )}
    </div>
  )
}

function EscalationCard({ esc }: { esc: Escalation }) {
  const tierColor =
    esc.tier === 'specialist' ? '#3b82f6' :
    esc.tier === 'pod-lead'   ? '#f59e0b' :
    esc.tier === 'vp'         ? '#a855f7' :
                                 '#ef4444'  // yash
  const sevColor =
    esc.severity === 'p0' ? '#ef4444' :
    esc.severity === 'p1' ? '#f59e0b' :
                            '#6b7280'
  const isOpen = esc.status === 'open'
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
          style={{
            backgroundColor: `${sevColor}20`,
            color: sevColor,
            borderColor: `${sevColor}40`,
          }}
        >
          {esc.severity}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
          style={{
            backgroundColor: `${tierColor}20`,
            color: tierColor,
            borderColor: `${tierColor}40`,
          }}
        >
          {esc.tier}
        </span>
        <span
          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ml-auto ${
            isOpen ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                   : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          }`}
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
