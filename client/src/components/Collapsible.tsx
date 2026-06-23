import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

// Reusable disclosure — replaces the ad-hoc useState+Chevron expanders scattered
// across the workspace sections (GatesTab, ActivityTimeline, …). Uncontrolled by
// default (`defaultOpen`); pass `open`+`onToggle` to control it. `right` is an
// action slot rendered on the header row (clicks there don't toggle).
export default function Collapsible({
  title, subtitle, count, right, defaultOpen = false, open: openProp, onToggle, children, className = '', bare = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  count?: number
  right?: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onToggle?: (next: boolean) => void
  children: ReactNode
  className?: string
  // `bare` = no card wrapper, a section-heading-style toggle. Use when the content
  // already provides its own card(s) (avoids double-card). Otherwise a carded row.
  bare?: boolean
}) {
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const toggle = () => { const next = !open; if (onToggle) onToggle(next); else setOpenState(next) }

  if (bare) {
    return (
      <section className={className}>
        <div className="flex items-center gap-2 mb-2.5">
          <button onClick={toggle} aria-expanded={open} className="flex items-center gap-1.5 flex-1 min-w-0 text-left group rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
            <ChevronRight className={`w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 group-hover:text-text ${open ? 'rotate-90' : ''}`} />
            <span className="text-[15px] font-semibold truncate">{title}</span>
            {count != null && <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded-full shrink-0">{count}</span>}
            {subtitle && <span className="text-[11px] text-text-muted truncate">{subtitle}</span>}
          </button>
          {right && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{right}</div>}
        </div>
        {open && <div>{children}</div>}
      </section>
    )
  }

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-t-[14px] transition-colors hover:bg-text-muted/[0.03]">
        <button onClick={toggle} aria-expanded={open}
          className="flex items-center gap-2 flex-1 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <ChevronRight className={`w-4 h-4 text-text-muted shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
          <span className="text-[13px] font-medium truncate">{title}</span>
          {count != null && <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded-full shrink-0">{count}</span>}
          {subtitle && <span className="text-[11px] text-text-muted truncate">{subtitle}</span>}
        </button>
        {right && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{right}</div>}
      </div>
      {open && <div className="px-4 pb-3 pt-0">{children}</div>}
    </div>
  )
}
