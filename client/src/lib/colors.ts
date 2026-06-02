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
