import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  /** One-line guidance under the title. */
  description?: string
  /** Optional primary action. */
  action?: { label: string; onClick: () => void }
  /** Render inside a dashed card (for in-panel empties) vs bare (full-page). */
  card?: boolean
  /** Vertical padding size. */
  size?: 'sm' | 'md' | 'lg'
}

const PAD = { sm: 'py-8', md: 'py-12', lg: 'py-20' }

/**
 * Reusable empty state — centered icon-in-rounded-square + title + subtext +
 * optional CTA. Replaces the ~15 hand-rolled inline empties for one consistent,
 * premium look (PagePilot-style). Token styling only.
 */
export default function EmptyState({ icon: Icon, title, description, action, card, size = 'md' }: EmptyStateProps) {
  const body = (
    <div className={`flex flex-col items-center justify-center text-center ${PAD[size]} px-6`}>
      <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-text-muted" />
      </div>
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {description && <p className="text-xs text-text-muted mt-1 max-w-xs leading-relaxed">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary btn-sm mt-4"
        >
          {action.label}
        </button>
      )}
    </div>
  )

  if (card) {
    return <div className="rounded-2xl border border-dashed border-border bg-surface">{body}</div>
  }
  return body
}
