// ── Centralized semantic color maps ──────────────────────────────────────────
// Single source of truth for every structured key→color mapping (category,
// level, source, log severity, learning type, priority, model tier). All values
// use THEME TOKENS (text-blue, bg-blue-muted, …) defined in index.css, so they
// flip correctly between light and dark mode. Never hardcode -400/-500 shades in
// a component; add the mapping here instead.
//
// Convention per entry: `text-<color>` for foreground, `bg-<color>-muted` for a
// low-alpha fill, `border-<color>/30` for a subtle border. Opacity modifiers
// (e.g. /15, /30) compose on the base token.

export interface BadgeColor {
  /** foreground text color, e.g. 'text-blue' */
  text: string
  /** muted background fill, e.g. 'bg-blue-muted' */
  bg: string
  /** subtle border, e.g. 'border-blue/30' */
  border: string
}

function badge(color: string): BadgeColor {
  return { text: `text-${color}`, bg: `bg-${color}-muted`, border: `border-${color}/30` }
}

/** Convenience: the three classes joined, for a pill/badge. */
export function badgeClasses(c: BadgeColor): string {
  return `${c.bg} ${c.text} ${c.border}`
}

// ── Agent category → color (AgentCategoryBadge) ──────────────────────────────
export const CATEGORY_COLOR: Record<string, BadgeColor> = {
  'software-factory': badge('purple'),
  personal: badge('blue'),
  research: badge('emerald'),
  'client-work': badge('orange'),
  automation: badge('cyan'),
  marketing: badge('pink'),
  devops: badge('red'),
  design: badge('indigo'),
  engineering: badge('sky'),
  'ops-strategy': badge('amber'),
  hr: badge('rose'),
  'content-seo': badge('lime'),
  uncategorized: badge('zinc'),
}
// Stable hash-based fallback for unknown categories.
const CATEGORY_FALLBACK: BadgeColor[] = [
  badge('teal'), badge('violet'), badge('fuchsia'), badge('yellow'), badge('slate'),
]
export function categoryColor(category: string | null | undefined): BadgeColor {
  if (category && CATEGORY_COLOR[category]) return CATEGORY_COLOR[category]
  const key = category || 'uncategorized'
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return CATEGORY_FALLBACK[h % CATEGORY_FALLBACK.length]
}

// ── Career level (0-8) → color (LevelBadge) ──────────────────────────────────
export const LEVEL_COLOR: Record<number, BadgeColor> = {
  0: { text: 'text-text-muted', bg: 'bg-surface-2', border: 'border-border' }, // Trainee
  1: badge('emerald'),
  2: badge('emerald'),
  3: badge('teal'),
  4: badge('blue'),
  5: badge('purple'),
  6: badge('fuchsia'),
  7: badge('amber'),
  8: badge('yellow'), // Fellow — brightest
}
export function levelColor(level: number): BadgeColor {
  return LEVEL_COLOR[level] ?? LEVEL_COLOR[0]
}
/** Ring color used as a status overlay on a LevelBadge. */
export const STATUS_RING: Record<string, string> = {
  probation: 'ring-amber/40',
  pip: 'ring-red/40',
  pending: 'ring-sky/40',
}

// ── Run source → color (SOURCE_COLORS — Analytics/Dashboard/RunHistory) ──────
export const SOURCE_COLOR: Record<string, string> = {
  playground: 'bg-purple-muted text-purple',
  orchestration: 'bg-blue-muted text-blue',
  schedule: 'bg-green-muted text-green',
  webhook: 'bg-orange-muted text-orange',
  sdk: 'bg-gray-muted text-gray',
  'ai-chat': 'bg-pink-muted text-pink',
  'project-chat': 'bg-cyan-muted text-cyan',
}

// ── Learning candidate type → color (LearningInbox TYPE_META) ────────────────
export const LEARNING_TYPE_COLOR: Record<string, BadgeColor> = {
  lesson: badge('blue'),
  bug: badge('red'),
  decision: badge('purple'),
  feedback: badge('amber'),
  golden: badge('emerald'),
  // Continuity-brain candidate types
  identity: badge('cyan'),
  preference: badge('rose'),
  contradiction: badge('orange'),
  open_loop: badge('indigo'),
  decay_review: badge('slate'),
}

// ── Log severity / source / category → color (Logs.tsx) ──────────────────────
export const LOG_LEVEL_COLOR: Record<string, string> = {
  error: 'text-red',
  warn: 'text-amber',
  info: 'text-blue',
  debug: 'text-zinc',
}
export const LOG_SOURCE_COLOR: Record<string, BadgeColor> = {
  server: badge('red'),
  client: badge('orange'),
  schedule: badge('blue'),
  db: badge('purple'),
  backup: badge('amber'),
}
export const LOG_CATEGORY_COLOR: Record<string, string> = {
  http: 'text-sky', db: 'text-purple', schedule: 'text-blue', 'agent-run': 'text-fuchsia',
  integration: 'text-cyan', render: 'text-rose', sse: 'text-teal', api: 'text-indigo',
  runtime: 'text-red', console: 'text-zinc', validation: 'text-yellow', startup: 'text-emerald',
  backup: 'text-amber', orchestration: 'text-violet', form: 'text-pink', manual: 'text-slate',
}

// ── Priority → color (GoalCascade) ───────────────────────────────────────────
export const PRIORITY_COLOR: Record<string, BadgeColor> = {
  high: badge('red'),
  medium: badge('yellow'),
  low: badge('green'),
}

// ── Model tier → token-backed color (Governance — was raw hex) ───────────────
// Charts need raw color values; reference the CSS vars so they flip with theme.
export const TIER_COLOR_VAR: Record<string, string> = {
  deep: 'var(--color-purple)',
  fast: 'var(--color-blue)',
  cheap: 'var(--color-emerald)',
}
