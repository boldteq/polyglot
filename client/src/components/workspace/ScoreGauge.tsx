// Circular 0–100 health-score ring with grade letter. Color follows grade.
// Used on Mission Control cards, Build Detail overview, and the builds list.

const GRADE_COLOR: Record<string, string> = {
  A: 'var(--color-green, #16a34a)',
  B: 'var(--color-accent, #6959ff)',
  C: 'var(--color-amber, #d97706)',
  'BLOCK-RISK': 'var(--color-red, #dc2626)',
}

export default function ScoreGauge({
  score, grade, size = 64, stroke = 6, showGrade = true,
}: { score: number; grade: string; size?: number; stroke?: number; showGrade?: boolean }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score)) / 100
  const color = GRADE_COLOR[grade] ?? GRADE_COLOR['BLOCK-RISK']
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border, #e5e7eb)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-bold" style={{ fontSize: size * 0.3, color }}>{score}</span>
        {showGrade && <span className="text-[9px] font-medium text-text-muted mt-0.5">{grade === 'BLOCK-RISK' ? 'AT RISK' : grade}</span>}
      </div>
    </div>
  )
}
