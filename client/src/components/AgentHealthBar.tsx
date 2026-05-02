import { useEffect, useState, useRef } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Gauge, Hash, FileCode, Zap, Info,
} from 'lucide-react'
import { getAgentHealth } from '../lib/api'
import type { AgentHealth } from '../lib/api'

interface Props {
  agentName: string
  scope: 'global' | 'project'
  projectId?: string
  // Live content from the editor — when provided, health recomputes as user types
  content?: string
}

// Debounced agent health indicator — computes on mount + on content change (500ms debounce).
export default function AgentHealthBar({ agentName, scope, projectId, content }: Props) {
  const [health, setHealth] = useState<AgentHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // First load = immediate; subsequent (when content edits) = debounced
    const delay = health ? 500 : 0
    debounceRef.current = setTimeout(() => {
      getAgentHealth(agentName, { scope, projectId, content })
        .then(h => { setHealth(h); setLoading(false) })
        .catch(() => { setLoading(false) })
    }, delay)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, agentName, scope, projectId])

  if (loading && !health) {
    return (
      <div className="px-6 py-2 border-b border-border bg-surface-2/40 flex items-center gap-3">
        <div className="h-3.5 w-20 rounded bg-surface-3 animate-pulse" />
        <div className="h-3.5 w-32 rounded bg-surface-3 animate-pulse" />
        <div className="h-3.5 w-24 rounded bg-surface-3 animate-pulse" />
      </div>
    )
  }
  if (!health) return null

  const pct = Math.round(health.usage * 100)
  const clampedPct = Math.min(pct, 110)

  // Status-driven styling — all colors use CSS variable-mapped theme classes
  const statusConfig = {
    healthy: {
      icon: CheckCircle2,
      label: 'Healthy',
      bar: 'bg-green',
      text: 'text-green',
      bg: 'bg-green-muted border-green/20',
    },
    warning: {
      icon: AlertTriangle,
      label: 'Near limit',
      bar: 'bg-amber',
      text: 'text-amber',
      bg: 'bg-amber-muted border-amber/20',
    },
    over: {
      icon: AlertTriangle,
      label: 'Over budget',
      bar: 'bg-red',
      text: 'text-red',
      bg: 'bg-red-muted border-red/20',
    },
    sparse: {
      icon: Info,
      label: 'Could be richer',
      bar: 'bg-accent',
      text: 'text-accent',
      bg: 'bg-accent/5 border-accent/20',
    },
  }[health.status]

  const StatusIcon = statusConfig.icon

  return (
    <div className={`border-b border-border transition-colors ${statusConfig.bg}`}>
      {/* Compact row — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-2 flex items-center gap-4 hover:bg-surface-2/30 transition-colors"
      >
        {/* Status label */}
        <div className={`flex items-center gap-1.5 shrink-0 ${statusConfig.text}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">{statusConfig.label}</span>
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-border shrink-0" />

        {/* Progress bar — main signal */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Gauge className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden max-w-[240px]">
            <div
              className={`h-full ${statusConfig.bar} transition-all duration-300`}
              style={{ width: `${Math.min(clampedPct, 100)}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-text-secondary shrink-0 w-12 text-right">{pct}%</span>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-4 text-[11px] text-text-muted font-mono shrink-0">
          <span className="flex items-center gap-1" title="Lines">
            <Hash className="w-3 h-3" />
            {health.actual.lines}<span className="text-text-muted/60">/{health.budget.lines}</span>
          </span>
          <span className="flex items-center gap-1" title="Size">
            <FileCode className="w-3 h-3" />
            {health.sizeKb} KB
          </span>
          <span className="flex items-center gap-1" title="Estimated tokens">
            <Zap className="w-3 h-3" />
            {health.estimatedTokens >= 1000 ? `${(health.estimatedTokens / 1000).toFixed(1)}k` : health.estimatedTokens} tok
          </span>
        </div>

        <Activity className={`w-3.5 h-3.5 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded panel — suggestion + details */}
      {expanded && (
        <div className="px-6 pb-3 space-y-2 border-t border-border/50">
          {health.suggestion && (
            <div className="flex items-start gap-2 text-[12px] text-text-secondary mt-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" />
              <p className="leading-relaxed">{health.suggestion}</p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            <Metric label="Lines" value={`${health.actual.lines}`} sub={`/ ${health.budget.lines} budget`} />
            <Metric label="Chars" value={`${health.actual.chars.toLocaleString()}`} sub={`/ ${health.budget.chars.toLocaleString()}`} />
            <Metric label="Size" value={`${health.sizeKb} KB`} sub={`${(health.sizeKb / (health.budget.chars / 1024) * 100).toFixed(0)}% of budget`} />
            <Metric label="Tokens" value={health.estimatedTokens >= 1000 ? `${(health.estimatedTokens / 1000).toFixed(1)}k` : `${health.estimatedTokens}`} sub={`~${((health.estimatedTokens * 3 + health.estimatedTokens * 15) / 1_000_000).toFixed(5)} per run`} />
          </div>

          {health.violations.length > 0 && (
            <div className="mt-2 p-2.5 rounded-lg bg-red/10 border border-red/20 text-[11px] text-red">
              <p className="font-semibold mb-1">Budget violations</p>
              {health.violations.map((v, i) => (
                <p key={i}>
                  {v.kind}: {v.actual.toLocaleString()} exceeds hard limit {v.limit?.toLocaleString?.() ?? v.budget.toLocaleString()}
                </p>
              ))}
            </div>
          )}

          {health.warnings.length > 0 && health.violations.length === 0 && (
            <div className="mt-2 p-2.5 rounded-lg bg-amber-muted border border-amber/20 text-[11px] text-amber">
              <p className="font-semibold mb-1">Warnings</p>
              {health.warnings.map((w, i) => (
                <p key={i}>
                  {w.kind}: {w.actual.toLocaleString()} is ≥90% of {w.budget.toLocaleString()} budget
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-sm font-mono font-semibold text-text mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-text-muted font-mono mt-0.5">{sub}</p>}
    </div>
  )
}
