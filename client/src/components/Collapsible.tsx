import { useState, type ReactNode } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

// Reusable disclosure — replaces the ad-hoc useState+Chevron expanders scattered
// across the workspace sections (GatesTab, ActivityTimeline, …). Uncontrolled by
// default (`defaultOpen`); pass `open`+`onToggle` to control it. `right` is an
// action slot rendered on the header row (clicks there don't toggle).
export default function Collapsible({
  title, subtitle, count, right, defaultOpen = false, open: openProp, onToggle, children, className = '',
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
}) {
  const [openState, setOpenState] = useState(defaultOpen)
  const open = openProp ?? openState
  const toggle = () => { const next = !open; if (onToggle) onToggle(next); else setOpenState(next) }

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button onClick={toggle} aria-expanded={open}
          className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {open ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
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
