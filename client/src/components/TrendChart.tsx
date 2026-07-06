import { useState, useRef, useCallback } from 'react'

// Dependency-free SVG time-series chart (line + area + hover tooltip). Scales to
// container width via viewBox; strokes stay crisp with non-scaling-stroke. One
// component covers every Monitoring metric — no charting lib in the bundle.

export interface TrendPoint { label: string; value: number }

interface Props {
  data: TrendPoint[]
  color?: string                 // CSS var or color; defaults to accent
  height?: number
  format?: (v: number) => string // value formatter for tooltip + axis
}

const W = 600 // internal coordinate width (viewBox); SVG stretches to container

export default function TrendChart({ data, color = 'var(--color-accent)', height = 160, format = (v) => String(v) }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!wrapRef.current || data.length === 0) return
    const rect = wrapRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const idx = Math.round((x / rect.width) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, idx)))
  }, [data.length])

  if (data.length === 0) {
    return <div className="flex items-center justify-center text-xs text-text-muted" style={{ height }}>No data in range</div>
  }

  const PAD = 6
  const innerW = W - PAD * 2
  const innerH = height - PAD * 2
  const values = data.map(d => d.value)
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const n = data.length
  const xAt = (i: number) => PAD + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => PAD + innerH - ((v - min) / range) * innerH

  const linePts = data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(' ')
  const areaPath = `M ${xAt(0)},${yAt(min)} L ${data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(' L ')} L ${xAt(n - 1)},${yAt(min)} Z`
  const gid = `grad-${color.replace(/[^a-z0-9]/gi, '')}`

  const hp = hover != null ? data[hover] : null

  return (
    <div ref={wrapRef} className="relative" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} className="overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline gridline */}
        <line x1={PAD} y1={yAt(min)} x2={W - PAD} y2={yAt(min)} stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={areaPath} fill={`url(#${gid})`} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && (
          <>
            <line x1={xAt(hover)} y1={PAD} x2={xAt(hover)} y2={height - PAD} stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle cx={xAt(hover)} cy={yAt(data[hover].value)} r="3.5" fill={color} stroke="var(--color-surface)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {/* x-axis end labels */}
      <div className="flex justify-between text-[9px] text-text-muted px-1 -mt-1">
        <span>{data[0].label}</span>
        <span>{data[n - 1].label}</span>
      </div>
      {/* hover tooltip */}
      {hp && (
        <div
          className="absolute -top-1 pointer-events-none bg-surface border border-border rounded-lg px-2 py-1 shadow-pop text-[10px] whitespace-nowrap z-10"
          style={{ left: `${Math.min(85, Math.max(0, (hover! / Math.max(1, n - 1)) * 100))}%` }}
        >
          <div className="font-semibold tabular-nums">{format(hp.value)}</div>
          <div className="text-text-muted">{hp.label}</div>
        </div>
      )}
    </div>
  )
}
