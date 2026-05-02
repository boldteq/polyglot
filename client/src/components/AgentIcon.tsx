/**
 * AgentIcon — Realistic photographic avatar for every agent. Always.
 *
 * Resolution:
 *   1. `avatar` URL → use directly (Unsplash, custom photo)
 *   2. `gender: 'female'` → curated female Pravatar photo (real face)
 *   3. `gender: 'male'` or anything else → curated male Pravatar photo (real face)
 *
 * No illustrated/cartoon fallback — every face is a real person photo.
 * Ring color comes from `departmentColor` so each role has a recognisable accent.
 */

// Curated Pravatar IDs (1-70 pool). Hand-checked to be visually male / female.
const MALE_PRAVATAR_IDS = [
  3, 4, 7, 8, 11, 12, 13, 14, 15, 17, 18, 22, 33, 51, 52, 53,
  54, 57, 58, 59, 60, 61, 62, 63, 65, 67, 68, 69, 70,
]
const FEMALE_PRAVATAR_IDS = [
  5, 9, 10, 16, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32, 34, 36, 37, 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49,
]

function nameHash(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return h
}

function seedFor(id: string | undefined, name: string): string {
  const raw = id || name
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')
}

function pravatarFor(seed: string, gender: 'male' | 'female'): string {
  const pool = gender === 'female' ? FEMALE_PRAVATAR_IDS : MALE_PRAVATAR_IDS
  const idx = nameHash(seed) % pool.length
  return `https://i.pravatar.cc/300?img=${pool[idx]}`
}

function resolveAvatar(opts: { avatar?: string | null; gender?: string | null; id?: string; name: string }): string {
  if (opts.avatar && opts.avatar.trim()) return opts.avatar.trim()
  const seed = seedFor(opts.id, opts.name)
  // Female only when explicitly set; everything else (male / neutral / null) → male pool.
  // Keeps the default consistent and avoids illustrated fallbacks.
  const g: 'male' | 'female' = opts.gender === 'female' ? 'female' : 'male'
  return pravatarFor(seed, g)
}

// ─── Public component ────────────────────────────────────────────────────────

interface AgentIconProps {
  /** Display name (used as seed fallback when no id provided). */
  name: string
  /** Stable agent id (preferred seed source). */
  id?: string
  /** Custom avatar URL — overrides generated face. */
  avatar?: string | null
  /** Drives photo pool: 'male' | 'female'. Anything else → male. */
  gender?: string | null
  /** Department color → ring accent. */
  ringColor?: string | null
  /** Unique key for SVG ID-collision avoidance (legacy, unused). */
  uid?: string
  className?: string
  size?: number
  /** Legacy flag — retained for callers but no longer changes style. */
  global?: boolean
}

export default function AgentIcon({
  name, id, avatar, gender, ringColor, className = '', size = 40,
}: AgentIconProps) {
  const src = resolveAvatar({ avatar, gender, id, name })
  const imgSize = Math.round(size * 2) // 2x for retina
  const ringStyle = ringColor
    ? { boxShadow: `0 0 0 2px ${ringColor}55, 0 1px 4px rgba(0,0,0,0.08)` }
    : undefined

  return (
    <div
      className={`shrink-0 rounded-full overflow-hidden ring-1 ring-border/40 ${className}`}
      style={{ width: size, height: size, flexShrink: 0, ...(ringStyle || {}) }}
    >
      <img
        src={src}
        alt={name}
        width={imgSize}
        height={imgSize}
        loading="lazy"
        decoding="async"
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}
