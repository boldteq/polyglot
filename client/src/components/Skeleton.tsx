// Q71: Skeleton screen primitives — replace spinners for list/card loading states

interface SkeletonProps {
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

export function Skeleton({ className = '', rounded = 'md' }: SkeletonProps) {
  const r = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' }[rounded]
  return <div className={`bg-surface-2 animate-pulse ${r} ${className}`} />
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`border border-border rounded-xl p-4 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 shrink-0" rounded="full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-2.5 w-3/5" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  )
}

export function SkeletonList({ count = 5, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="w-8 h-8 shrink-0" rounded="lg" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-5 w-12" rounded="full" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 py-2 border-b border-border/50">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3" style={{ flex: c === 0 ? '0 0 120px' : '1 1 0' } as React.CSSProperties} />
          ))}
        </div>
      ))}
    </div>
  )
}
