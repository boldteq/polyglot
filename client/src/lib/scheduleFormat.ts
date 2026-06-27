// Shared formatters + status mapping for the Schedule command center (the
// activity feed, running-now strip, upcoming timeline, run detail). Keeps the
// "how a run is rendered" logic in one place.
import type { Intent } from './colors'
import type { ScheduleRun } from './api'
import type { ScheduleActivityRun } from './scheduleApi'

export type RunStatus = ScheduleRun['status']

export function fmtDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

/** Real cost preferred over estimate; null when there's nothing worth showing. */
export function fmtCost(usd: number | null | undefined): string | null {
  if (typeof usd !== 'number' || usd <= 0) return null
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

export function timeAgo(ts: string | null | undefined): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/** Live elapsed since a start time (for a running row's ticking timer). */
export function elapsed(startedAt: string | null | undefined): string {
  if (!startedAt) return '—'
  const ms = Date.now() - new Date(startedAt).getTime()
  if (ms < 0) return '0s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

const DOW_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** Turn a cron expression into a human cadence label. Handles arbitrary minutes
 * (so '45 3 * * *' → 'Daily 03:45 UTC', never raw cron); falls back to the raw
 * expression only for genuinely complex expressions (ranges/lists/named fields). */
export function humanizeCron(expr: string | null | undefined): string {
  if (!expr) return 'event-driven'
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [min, hour, dom, mon, dow] = parts
  const num = (s: string) => /^\d{1,2}$/.test(s)
  const allStar = dom === '*' && mon === '*' && dow === '*'
  const hhmm = num(hour) && num(min) ? `${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC` : null

  if (min === '*' && hour === '*') return 'Every minute'
  if (/^\*\/\d+$/.test(min) && hour === '*' && allStar) return `Every ${min.slice(2)} min`
  if (num(min) && hour === '*' && allStar) return min === '0' ? 'Every hour' : `Hourly at :${min.padStart(2, '0')}`

  if (hhmm) {
    if (allStar) return `Daily ${hhmm}`
    if (dom === '*' && mon === '*' && num(dow)) return `${DOW_NAMES[Number(dow) % 7]} ${hhmm}`
    if (num(dom) && mon === '*' && dow === '*') return `Monthly (${ordinal(Number(dom))}) ${hhmm}`
  }
  return expr // genuinely complex (ranges, lists, named months/days) → raw
}

export function statusMeta(status: RunStatus): { label: string; intent: Intent } {
  switch (status) {
    case 'success': return { label: 'success', intent: 'success' }
    case 'error': return { label: 'failed', intent: 'error' }
    case 'crashed': return { label: 'crashed', intent: 'warning' }
    case 'cancelled': return { label: 'cancelled', intent: 'warning' }
    case 'running': return { label: 'running', intent: 'info' }
    default: return { label: String(status), intent: 'neutral' }
  }
}

/** The human "why" for a run — its error, else the first recorded fault. */
export function runWhy(run: Pick<ScheduleActivityRun, 'error' | 'metadata'>): string | null {
  if (run.error) return run.error
  const f = run.metadata?.faults?.[0]
  return f ? `${f.where}: ${f.message}` : null
}

/** Best cost we have for a run: real (from CLI usage) over estimated. */
export function runCost(run: Pick<ScheduleActivityRun, 'estimatedCost' | 'metadata'>): { value: number; real: boolean } | null {
  const real = run.metadata?.realCostUsd
  if (typeof real === 'number' && real > 0) return { value: real, real: true }
  if (typeof run.estimatedCost === 'number' && run.estimatedCost > 0) return { value: run.estimatedCost, real: false }
  return null
}
