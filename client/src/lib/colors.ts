// Phase 5 — Unified color system driven by app_config thresholds.
// Replaces inline `if (rate >= 90) ... else if (rate >= 70)` blocks across
// Dashboard, AgentHealth, Analytics, LevelBadge, Hr. All pages must call
// getHealthColor() instead of hardcoding the 90/70 cutoffs.

export interface HealthThresholds {
  healthy: number
  degraded: number
}

export const DEFAULT_HEALTH: HealthThresholds = { healthy: 90, degraded: 70 }

export type HealthBucket = 'healthy' | 'degraded' | 'critical'

export function classifyHealth(rate: number, t: HealthThresholds = DEFAULT_HEALTH): HealthBucket {
  if (rate >= t.healthy) return 'healthy'
  if (rate >= t.degraded) return 'degraded'
  return 'critical'
}

// C13 audit: use the theme-aware --color-* tokens (defined in index.css) so
// status colors auto-flip and stay AA-contrast in BOTH light and dark mode,
// instead of fixed Tailwind -400/-500 shades tuned only for dark backgrounds.
export const HEALTH_TEXT_COLOR: Record<HealthBucket, string> = {
  healthy: 'text-green',
  degraded: 'text-amber',
  critical: 'text-red',
}

export const HEALTH_BG_COLOR: Record<HealthBucket, string> = {
  healthy: 'bg-green-muted border-green/30',
  degraded: 'bg-amber-muted border-amber/30',
  critical: 'bg-red-muted border-red/30',
}

export const HEALTH_BAR_COLOR: Record<HealthBucket, string> = {
  healthy: 'bg-green',
  degraded: 'bg-amber',
  critical: 'bg-red',
}

export const HEALTH_LABEL: Record<HealthBucket, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
}

export function getHealthColor(rate: number, t: HealthThresholds = DEFAULT_HEALTH): string {
  return HEALTH_TEXT_COLOR[classifyHealth(rate, t)]
}

export function getHealthBg(rate: number, t: HealthThresholds = DEFAULT_HEALTH): string {
  return HEALTH_BG_COLOR[classifyHealth(rate, t)]
}

export function getHealthBar(rate: number, t: HealthThresholds = DEFAULT_HEALTH): string {
  return HEALTH_BAR_COLOR[classifyHealth(rate, t)]
}

export function getHealthLabel(rate: number, t: HealthThresholds = DEFAULT_HEALTH): string {
  return HEALTH_LABEL[classifyHealth(rate, t)]
}

// Status badge colors — kept here so Hr.tsx stops using ad-hoc 'tone' strings.
export const STATUS_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  active:    { text: 'text-green',     bg: 'bg-green-muted',  border: 'border-green/30' },
  probation: { text: 'text-amber',     bg: 'bg-amber-muted',  border: 'border-amber/30' },
  pip:       { text: 'text-red',       bg: 'bg-red-muted',    border: 'border-red/30' },
  pending:   { text: 'text-accent',    bg: 'bg-accent-muted', border: 'border-accent/30' },
  retired:   { text: 'text-text-muted', bg: 'bg-surface-2',   border: 'border-border' },
}

export function getStatusColor(status: string) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.pending
}

// Generic semantic intent → token classes. Use with the `.pill` class
// (`pill ${statusPill('success')}`) so the many inline success/error/warn
// ternaries scattered across pages collapse to one mapping. `dot` is the
// solid-color class for a status dot.
export type Intent = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export const INTENT_PILL: Record<Intent, string> = {
  success: 'bg-green-muted text-green',
  warning: 'bg-amber-muted text-amber',
  error:   'bg-red-muted text-red',
  info:    'bg-accent-muted text-accent',
  neutral: 'bg-surface-2 text-text-muted',
}

export const INTENT_TEXT: Record<Intent, string> = {
  success: 'text-green', warning: 'text-amber', error: 'text-red', info: 'text-accent', neutral: 'text-text-muted',
}

export const INTENT_DOT: Record<Intent, string> = {
  success: 'bg-green', warning: 'bg-amber', error: 'bg-red', info: 'bg-accent', neutral: 'bg-text-muted',
}

export function statusPill(intent: Intent): string { return INTENT_PILL[intent] }
export function statusText(intent: Intent): string { return INTENT_TEXT[intent] }
export function statusDot(intent: Intent): string { return INTENT_DOT[intent] }

// Priority → semantic intent. Collapses the repeated
// `high ? red : medium ? amber : zinc` ternaries (training queue, etc.) to one
// mapping so a priority badge is always `pill ${statusPill(priorityIntent(p))}`.
export const PRIORITY_INTENT: Record<string, Intent> = {
  high: 'error',
  medium: 'warning',
  low: 'neutral',
}

export function priorityIntent(priority: string): Intent {
  return PRIORITY_INTENT[priority] ?? 'neutral'
}
