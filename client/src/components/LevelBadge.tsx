import { GraduationCap, Star, Award, Crown, Gem, Shield, Zap, Sparkles, UserX } from 'lucide-react'

export interface LevelBadgeProps {
  level: number | null | undefined
  title?: string
  yearsOfExperience?: number | null
  status?: 'active' | 'probation' | 'pip' | 'pending' | 'retired'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showYoE?: boolean
  showIcon?: boolean
}

const LEVEL_ICONS: Record<number, typeof Star> = {
  0: GraduationCap,
  1: Star,
  2: Star,
  3: Award,
  4: Shield,
  5: Crown,
  6: Zap,
  7: Gem,
  8: Sparkles,
}

const LEVEL_NAMES: Record<number, string> = {
  0: 'Trainee',
  1: 'Junior',
  2: 'Mid',
  3: 'Senior',
  4: 'Lead',
  5: 'Principal',
  6: 'Staff',
  7: 'Distinguished',
  8: 'Fellow',
}

// Token-backed (flips light/dark). Mirrors LEVEL_COLOR in lib/designTokens.ts.
const LEVEL_COLORS: Record<number, { bg: string; text: string; ring: string }> = {
  0: { bg: 'bg-surface-2', text: 'text-text-muted', ring: 'ring-border' },
  1: { bg: 'bg-emerald/10', text: 'text-emerald', ring: 'ring-emerald/20' },
  2: { bg: 'bg-emerald/15', text: 'text-emerald', ring: 'ring-emerald/25' },
  3: { bg: 'bg-teal/15', text: 'text-teal', ring: 'ring-teal/25' },
  4: { bg: 'bg-blue/15', text: 'text-blue', ring: 'ring-blue/25' },
  5: { bg: 'bg-purple/15', text: 'text-purple', ring: 'ring-purple/25' },
  6: { bg: 'bg-fuchsia/15', text: 'text-fuchsia', ring: 'ring-fuchsia/25' },
  7: { bg: 'bg-amber/15', text: 'text-amber', ring: 'ring-amber/25' },
  8: { bg: 'bg-yellow/20', text: 'text-yellow', ring: 'ring-yellow/30' },
}

const SIZES = {
  xs: { pad: 'px-1.5 py-0.5', text: 'text-[9px]', icon: 'w-2.5 h-2.5', gap: 'gap-1' },
  sm: { pad: 'px-2 py-0.5', text: 'text-[10px]', icon: 'w-3 h-3', gap: 'gap-1' },
  md: { pad: 'px-2.5 py-1', text: 'text-[11px]', icon: 'w-3.5 h-3.5', gap: 'gap-1.5' },
  lg: { pad: 'px-3 py-1.5', text: 'text-xs', icon: 'w-4 h-4', gap: 'gap-2' },
}

export default function LevelBadge({
  level,
  title,
  yearsOfExperience,
  status = 'active',
  size = 'sm',
  showYoE = false,
  showIcon = true,
}: LevelBadgeProps) {
  // Handle retired status first
  if (status === 'retired') {
    const s = SIZES[size]
    return (
      <span
        className={`inline-flex items-center ${s.gap} ${s.pad} ${s.text} font-semibold rounded-full bg-surface-2 text-text-muted ring-1 ring-border`}
      >
        {showIcon && <UserX className={s.icon} />}
        Retired
      </span>
    )
  }

  if (level == null) {
    const s = SIZES[size]
    return (
      <span className={`inline-flex items-center ${s.pad} ${s.text} text-text-muted`}>
        —
      </span>
    )
  }

  const safeLevel = Math.max(0, Math.min(8, level))
  const Icon = LEVEL_ICONS[safeLevel] || Star
  const displayTitle = title || LEVEL_NAMES[safeLevel]
  const colors = LEVEL_COLORS[safeLevel]
  const s = SIZES[size]

  // Special status overlays
  const statusRing =
    status === 'probation' ? 'ring-amber/40 ring-2' :
    status === 'pip' ? 'ring-red/40 ring-2' :
    status === 'pending' ? 'ring-sky/40 ring-2' :
    colors.ring

  return (
    <span
      className={`inline-flex items-center ${s.gap} ${s.pad} ${s.text} font-semibold rounded-full ring-1 ${colors.bg} ${colors.text} ${statusRing}`}
      title={
        status === 'probation' ? `${displayTitle} (on probation)` :
        status === 'pip' ? `${displayTitle} (on PIP)` :
        status === 'pending' ? `${displayTitle} (pending HR triage)` :
        displayTitle
      }
    >
      {showIcon && <Icon className={s.icon} />}
      {displayTitle}
      {showYoE && yearsOfExperience != null && (
        <span className="opacity-70 font-normal">· {yearsOfExperience}y</span>
      )}
    </span>
  )
}

export function levelName(level: number | null | undefined): string {
  if (level == null) return '—'
  return LEVEL_NAMES[Math.max(0, Math.min(8, level))] || 'Agent'
}

export function levelColors(level: number | null | undefined) {
  if (level == null) return LEVEL_COLORS[0]
  return LEVEL_COLORS[Math.max(0, Math.min(8, level))] || LEVEL_COLORS[0]
}
