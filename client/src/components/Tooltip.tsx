import { type ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'

// Lightweight, dependency-free tooltip — replaces bare native `title=` for jargon
// help. CSS hover/focus only (no positioning lib): a small bubble shown above (or
// below) the trigger. Keep labels short. The trigger stays focusable for keyboard
// + screen-reader users (aria-label on the bubble's owner).
export function Tooltip({ label, side = 'top', children }: { label: string; side?: 'top' | 'bottom'; children: ReactNode }) {
  const pos = side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
  return (
    <span className="relative inline-flex group/tt focus-within:z-50">
      {children}
      <span role="tooltip"
        className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${pos} z-50 hidden group-hover/tt:block group-focus-within/tt:block
          whitespace-normal w-max max-w-[240px] rounded-lg bg-text text-surface text-[11px] leading-snug px-2 py-1 shadow-pop`}>
        {label}
      </span>
    </span>
  )
}

// Inline "what is this?" affordance — a small help icon that reveals a Tooltip.
// Use next to jargon (gates, Lens, blockers, score, design-system).
export function InfoIcon({ label, side = 'top', className = '' }: { label: string; side?: 'top' | 'bottom'; className?: string }) {
  return (
    <Tooltip label={label} side={side}>
      <button type="button" aria-label={label}
        className={`text-text-muted/60 hover:text-text-muted focus:text-text-muted outline-none ${className}`}>
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  )
}
