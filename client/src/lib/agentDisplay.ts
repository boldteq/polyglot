/**
 * agentDisplay — single source of truth for how every agent renders across
 * Org Chart, Agents page, HR page. Use `formatAgentDisplay(agent)` instead of
 * touching `agent.name` or `agent.title` directly. Changing the pattern here
 * updates the entire UI at once.
 *
 * Standard pattern: `RealName — ShortRole` with emoji shown separately.
 *   Bold line: `{emoji} {realName} — {role}`
 *   Small line below: `{tagline}` (first sentence ≤ 60 chars)
 */

export interface AgentDisplayInput {
  name?: string | null
  title?: string | null
  description?: string | null
  id?: string | null
  // Some pages pass org-info nested
  org?: { title?: string | null } | null
}

export interface AgentDisplayResult {
  emoji: string
  realName: string
  role: string
  tagline: string
  /** `realName — role` (or just `realName` if no role). No emoji. */
  fullName: string
  /** `emoji realName — role`. Use directly in bold lines. */
  fullDisplay: string
}

const ROLE_WORD_LIMIT = 6
const TAGLINE_CHAR_LIMIT = 60

/**
 * Strip leading emoji from a string. Returns { emoji, rest }.
 * Handles compound emoji (skin tone, ZWJ sequences) by greedy match.
 */
function stripEmoji(input: string): { emoji: string; rest: string } {
  if (!input) return { emoji: '', rest: '' }
  const m = input.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})[‍️\p{Emoji_Presentation}\p{Extended_Pictographic}]*\s*/u)
  if (!m) return { emoji: '', rest: input.trim() }
  return { emoji: m[0].trim(), rest: input.slice(m[0].length).trim() }
}

/**
 * Extract real name from `name` string. Drops anything after `—` / `–` / ` - ` / ` (`.
 * "Cadence — Chief People Officer"           → "Cadence"
 * "🛍️ Shopify App Backend — Backend Engineer" → "Shopify App Backend"
 * "tutor"                                    → "Tutor"
 * "Mira"                                     → "Mira"
 */
function extractRealName(rawName: string, fallbackId?: string | null): string {
  const { rest } = stripEmoji(rawName || '')
  if (!rest) {
    return fallbackId ? titleCase(fallbackId) : ''
  }
  // Split on em/en dash, " - " (with spaces), " | ", or " ("
  const beforeSep = rest.split(/\s*[—–]\s*|\s+\|\s+|\s+-\s+|\s*\(/)[0] || rest
  const trimmed = beforeSep.trim()
  return trimmed || (fallbackId ? titleCase(fallbackId) : rest)
}

function titleCase(s: string): string {
  return s.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Clamp a role label to 2-6 short words. Drops trailing parens/clauses.
 * "Backend Engineer — Embedded Apps"            → "Backend Engineer"
 * "Director of Talent Acquisition Agent Arch.." → "Director of Talent Acquisition"
 * "Agent Architect & Hiring Specialist"          → "Agent Architect"
 */
function shortenRole(rawTitle: string): string {
  if (!rawTitle) return ''
  // Drop description-like tails (anything after ". " or " for ").
  let s = rawTitle.split(/\.\s|—|–|\sfor\s/)[0]?.trim() || rawTitle
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim() // drop parentheticals
  // Drop everything after "&" or ","
  s = s.split(/\s*[&,]\s*/)[0]?.trim() || s
  // Word clamp
  const words = s.split(/\s+/)
  if (words.length > ROLE_WORD_LIMIT) {
    s = words.slice(0, ROLE_WORD_LIMIT).join(' ')
  }
  return s
}

/**
 * First sentence of description, soft-capped to TAGLINE_CHAR_LIMIT chars,
 * trailing-punctuation stripped, ellipsis added if truncated.
 */
function deriveTagline(description: string): string {
  const text = (description || '').trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const m = text.match(/^[^.!?]+[.!?]/)
  let s = m ? m[0].trim() : text
  if (s.length > TAGLINE_CHAR_LIMIT) {
    s = s.slice(0, TAGLINE_CHAR_LIMIT).replace(/\s+\S*$/, '') + '…'
  } else if (!m && text.length > TAGLINE_CHAR_LIMIT) {
    s = text.slice(0, TAGLINE_CHAR_LIMIT).replace(/\s+\S*$/, '') + '…'
  }
  return s.replace(/[.!?]+$/, '')
}

export function formatAgentDisplay(agent: AgentDisplayInput): AgentDisplayResult {
  const rawName = (agent.name || '').trim()
  const { emoji } = stripEmoji(rawName)
  const realName = extractRealName(rawName, agent.id)
  const titleSrc = agent.title ?? agent.org?.title ?? ''
  const role = shortenRole(titleSrc)
  const tagline = deriveTagline(agent.description || '')
  const fullName = role ? `${realName} — ${role}` : realName
  const fullDisplay = emoji ? `${emoji} ${fullName}` : fullName
  return { emoji, realName, role, tagline, fullName, fullDisplay }
}
