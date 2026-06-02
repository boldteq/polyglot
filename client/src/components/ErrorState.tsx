import { AlertCircle } from 'lucide-react'

// Shared error state for data-fetching pages. Visually distinct from the empty
// state (red icon + message + Retry) so a load failure is never mistaken for
// "no data yet" (C19 audit + .claude/rules/error-handling.md three-state rule).
export function ErrorState({
  message,
  onRetry,
  className = '',
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center h-64 gap-3 text-center px-6 ${className}`}>
      <AlertCircle className="w-8 h-8 text-red" />
      <div>
        <p className="text-sm font-semibold text-red">Couldn’t load this data</p>
        <p className="text-xs text-text-muted mt-1 max-w-sm break-words">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-2 hover:bg-surface-3 text-text border border-border transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
