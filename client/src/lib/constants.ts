/** Canonical agent status values — single source of truth for all pages. */
export const AGENT_STATUSES = ['active', 'probation', 'pip', 'pending', 'retired'] as const
export type AgentStatus = typeof AGENT_STATUSES[number]

/**
 * Health-rate thresholds (percent, 0-100).
 * Interim Phase 1 home. Phase 2 moves these into app_config + useAppConfig hook
 * so they can be tuned without redeploy. All pages must import these — never
 * inline 90/70 literals.
 */
export const HEALTH_THRESHOLDS = {
  healthy: 90,
  degraded: 70,
} as const

export function classifyHealth(rate: number): 'healthy' | 'degraded' | 'critical' {
  if (rate >= HEALTH_THRESHOLDS.healthy) return 'healthy'
  if (rate >= HEALTH_THRESHOLDS.degraded) return 'degraded'
  return 'critical'
}

/** Playground localStorage keys */
export const STORAGE_KEY_PLAYGROUND_HISTORY = 'polyglot:playground-history'
export const STORAGE_KEY_PLAYGROUND_SETTINGS = 'polyglot:playground-settings'
export const STORAGE_KEY_PLAYGROUND_SESSION = 'polyglot:playground-session'
export const STORAGE_KEY_PLAYGROUND_TEMPLATES = 'polyglot:playground-templates'

/** Playground timeout preset options */
export const PLAYGROUND_TIMEOUT_OPTIONS = [
  { label: '30 seconds', value: 30_000 },
  { label: '1 minute', value: 60_000 },
  { label: '2 minutes', value: 120_000 },
  { label: '5 minutes', value: 300_000 },
  { label: '10 minutes', value: 600_000 },
] as const

/** Playground default settings */
export const PLAYGROUND_DEFAULT_TIMEOUT_MS = 120_000

export const SOURCE_COLORS: Record<string, string> = {
  playground: 'bg-purple-500/20 text-purple-400',
  orchestration: 'bg-blue-500/20 text-blue-400',
  schedule: 'bg-green-500/20 text-green-400',
  webhook: 'bg-orange-500/20 text-orange-400',
  sdk: 'bg-gray-500/20 text-gray-400',
  'ai-chat': 'bg-pink-500/20 text-pink-400',
  'project-chat': 'bg-cyan-500/20 text-cyan-400',
}
