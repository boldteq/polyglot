import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

interface BreadcrumbSegment {
  label: string
  href?: string
}

interface BreadcrumbProps {
  segments?: BreadcrumbSegment[]
  className?: string
}

// Q80: Auto-generates breadcrumbs from current URL path, or accepts explicit segments.
export default function Breadcrumb({ segments, className = '' }: BreadcrumbProps) {
  const location = useLocation()

  const crumbs: BreadcrumbSegment[] = segments ?? inferFromPath(location.pathname)

  if (crumbs.length <= 1) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1 text-[11px] text-text-muted ${className}`}
    >
      <Link to="/" className="hover:text-text transition-colors shrink-0" aria-label="Home">
        <Home className="w-3 h-3" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />
          {crumb.href && i < crumbs.length - 1 ? (
            <Link to={crumb.href} className="hover:text-text transition-colors truncate max-w-[160px]">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-text truncate max-w-[200px]" aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

const ROUTE_LABELS: Record<string, string> = {
  agents: 'Agents',
  playground: 'Playground',
  'org-chart': 'Org Chart',
  analytics: 'Analytics',
  schedules: 'Schedules',
  settings: 'Settings',
  global: 'Global',
  rules: 'Rules',
  projects: 'Projects',
  hr: 'HR',
  goals: 'Goals',
  docs: 'Documentation',
  memory: 'Memory',
  orchestration: 'Orchestration',
  setup: 'Setup',
  training: 'Training',
  commands: 'Commands',
  templates: 'Templates',
}

function inferFromPath(pathname: string): BreadcrumbSegment[] {
  if (pathname === '/') return []
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: BreadcrumbSegment[] = []
  let href = ''
  for (const part of parts) {
    href += `/${part}`
    const label = ROUTE_LABELS[part] || decodeURIComponent(part).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    crumbs.push({ label, href })
  }
  return crumbs
}
