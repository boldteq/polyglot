// Reusable loading-skeleton primitives. Replaces hand-rolled `animate-pulse`
// blocks + duplicated Hub spinners with one consistent, theme-aware set.
// `prefers-reduced-motion` is handled globally in index.css.
import { memo } from 'react'

/** Base shimmer block. Pass width/height via className (e.g. "h-4 w-32"). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-surface-2 rounded-lg animate-pulse ${className}`} />
}

/** A stack of N card-shaped skeletons — for list/inbox loading. */
export const SkeletonCards = memo(function SkeletonCards({ count = 3, className = 'h-24' }: { count?: number; className?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`skeleton-card-${i}`} className={`card animate-pulse ${className}`} />
      ))}
    </div>
  )
})

/** A few text lines — for inline content loading. */
export const SkeletonText = memo(function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={`skeleton-line-${i}`} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
})

/** Centered spinner — the standard Suspense/loading fallback. */
export function Spinner({ className = 'h-48' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`} role="status" aria-label="Loading">
      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
