import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

// ── Breadcrumbs — deep-route navigation trail ────────────────────────────────
// Items with `to` render as Links (text-text-muted, hover → text-text).
// The final item (current page) renders as plain non-link text (text-text).
// Token styling only — no raw palette shades.

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
}

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className={`min-w-0 ${className || ''}`}>
      <ol className="flex items-center gap-1 text-xs min-w-0">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-text-muted shrink-0" aria-hidden="true" />
              )}
              <li className="min-w-0">
                {item.to && !isLast ? (
                  <Link
                    to={item.to}
                    className="block max-w-[160px] truncate text-text-muted hover:text-text transition-colors"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className="block max-w-[200px] truncate text-text"
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
