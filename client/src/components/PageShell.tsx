import { type ReactNode } from 'react'
import { Search, type LucideIcon } from 'lucide-react'

// ── PageShell — consistent page wrapper ──────────────────────────────────────

interface PageShellProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  fullHeight?: boolean
  noPadding?: boolean
}

export function PageShell({ title, subtitle, actions, children, fullHeight, noPadding }: PageShellProps) {
  return (
    <div className={fullHeight ? 'h-full flex flex-col' : ''}>
      <div className="px-8 pt-6 pb-4 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      </div>
      <div className={fullHeight ? 'flex-1 min-h-0' : ''}>
        <div className={noPadding ? '' : 'px-8 pb-8'}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── SectionCard — bordered card container ────────────────────────────────────

interface SectionCardProps {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function SectionCard({ title, action, children, className, noPadding }: SectionCardProps) {
  return (
    <div className={`bg-surface rounded-xl border border-border ${className || ''}`}>
      {title && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</span>
          {action}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </div>
  )
}

// ── StatRow — row of metric cards ────────────────────────────────────────────

interface StatItem {
  label: string
  value: string | number
  icon?: LucideIcon
  color?: string
}

interface StatRowProps {
  stats: StatItem[]
}

export function StatRow({ stats }: StatRowProps) {
  return (
    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)` }}>
      {stats.map((s) => {
        const Icon = s.icon
        return (
          <div key={s.label} className="bg-surface rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.color || 'bg-accent/10 text-accent'}`}>
                  <Icon className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="text-xl font-bold tracking-tight">{s.value}</div>
                <div className="text-[10px] text-text-muted font-medium uppercase tracking-wider">{s.label}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── FilterBar — search + filter pills ────────────────────────────────────────

interface FilterOption {
  label: string
  value: string
}

interface FilterDef {
  label: string
  options: FilterOption[]
  value: string
  onChange: (val: string) => void
}

interface FilterBarProps {
  search?: {
    value: string
    onChange: (val: string) => void
    placeholder?: string
  }
  filters?: FilterDef[]
  children?: ReactNode
}

export function FilterBar({ search, filters, children }: FilterBarProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {search && (
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder || 'Search...'}
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      )}
      {filters?.map((f) => (
        <div key={f.label} className="flex bg-surface-2 rounded-lg p-0.5 shrink-0">
          {f.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => f.onChange(opt.value)}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                f.value === opt.value ? 'bg-accent text-white' : 'text-text-muted hover:text-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ))}
      {children}
    </div>
  )
}

// ── TabNav — consistent tab navigation ───────────────────────────────────────

interface TabNavProps {
  tabs: Array<{ id: string; label: string; count?: number }>
  active: string
  onChange: (id: string) => void
}

export function TabNav({ tabs, active, onChange }: TabNavProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            active === tab.id
              ? 'text-accent'
              : 'text-text-muted hover:text-text'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[10px] bg-surface-2 px-1.5 py-0.5 rounded-full">{tab.count}</span>
          )}
          {active === tab.id && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}
