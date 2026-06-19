// Compact 18-step pipeline progress bar. `current` = furthest reached step.
// Filled segments = reached; the current segment pulses; rest are muted.

export default function StepIndicator({
  current, total = 18, showLabel = true,
}: { current: number; total?: number; showLabel?: boolean }) {
  const segs = Array.from({ length: total }, (_, i) => i + 1)
  return (
    <div className="flex flex-col gap-1 w-full">
      {showLabel && (
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span>Step {current}/{total}</span>
          <span>{Math.round((current / total) * 100)}%</span>
        </div>
      )}
      <div className="flex gap-0.5">
        {segs.map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              s < current ? 'bg-accent' : s === current ? 'bg-accent/70 animate-pulse' : 'bg-border'
            }`}
            title={`Step ${s}`}
          />
        ))}
      </div>
    </div>
  )
}
