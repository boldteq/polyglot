import { levelColors } from './LevelBadge'

export interface ExperienceBarProps {
  level: number
  yearsOfExperience: number
  progressToNext: number
  nextLevelTitle: string | null
  compact?: boolean
}

export default function ExperienceBar({
  level,
  yearsOfExperience,
  progressToNext,
  nextLevelTitle,
  compact = false,
}: ExperienceBarProps) {
  const colors = levelColors(level)
  const pct = Math.max(0, Math.min(100, progressToNext * 100))

  if (compact) {
    return (
      <div className="flex items-center gap-2 w-full">
        <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${colors.bg.replace('/10', '/60').replace('/15', '/60').replace('/20', '/60')}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[10px] font-mono ${colors.text}`}>{yearsOfExperience}y</span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className={`font-semibold ${colors.text}`}>
          {yearsOfExperience}y experience
        </span>
        {nextLevelTitle && (
          <span className="text-text-muted">
            {Math.round(pct)}% to {nextLevelTitle}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colors.bg.replace('/10', '/60').replace('/15', '/60').replace('/20', '/60')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
