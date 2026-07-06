import { type ReactNode, type KeyboardEvent, type CSSProperties } from 'react'
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
      <div className="px-8 pt-7 pb-5 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-[13px] text-text-secondary mt-1">{subtitle}</p>}
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
    <div className={`card ${className || ''}`}>
      {title && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle">
          <span className="text-xs font-medium text-text-secondary">{title}</span>
          {action}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </div>
  )
}

// ── StatRow — row of metric cards ────────────────────────────────────────────

interface StatItem {
  label: string
  value: string | number
  icon?: LucideIcon
  color?: string
  /** Optional plain-language explanation shown as a hover tooltip on the card. */
  hint?: string
  /** When set, the card becomes a button (e.g. a KPI that deep-links to a filtered view). */
  onClick?: () => void
  /** Tints the value to draw attention (danger=red, warn=amber). */
  tone?: 'default' | 'danger' | 'warn'
}

interface StatRowProps {
  stats: StatItem[]
}

export function StatRow({ stats }: StatRowProps) {
  return (
    // 2-up on phones (was a hardcoded repeat(n,1fr) that never stacked), N-up on sm+.
    <div
      className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-[repeat(var(--sr-cols),minmax(0,1fr))]"
      style={{ '--sr-cols': Math.min(stats.length, 4) } as CSSProperties}
    >
      {stats.map((s) => {
        const Icon = s.icon
        const toneCls = s.tone === 'danger' ? 'text-red' : s.tone === 'warn' ? 'text-text' : ''
        const inner = (
          <>
            <div className={`flex items-center gap-2 text-text-muted mb-2.5 ${s.hint && !s.onClick ? 'cursor-help' : ''}`}>
              {Icon && <Icon className="w-4 h-4" />}
              <span className="text-[13px] font-medium">{s.label}</span>
            </div>
            <div className={`text-[28px] font-bold tracking-tight leading-none ${toneCls}`}>{s.value}</div>
          </>
        )
        return s.onClick ? (
          <button
            key={s.label}
            type="button"
            onClick={s.onClick}
            title={s.hint}
            className="card p-5 text-left transition-colors hover:border-accent/40 hover:bg-surface-2/40 focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
          >
            {inner}
          </button>
        ) : (
          <div key={s.label} className="card p-5" title={s.hint}>{inner}</div>
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
            className="input pl-9"
          />
        </div>
      )}
      {filters?.map((f) => (
        <div key={f.label} role="group" aria-label={`Filter by ${f.label}`} className="segmented">
          {f.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => f.onChange(opt.value)}
              aria-pressed={f.value === opt.value}
              className={`segmented-btn ${f.value === opt.value ? 'segmented-btn-active' : ''}`}
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
  const onKeyDown = (e: KeyboardEvent, idx: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = tabs[(idx + dir + tabs.length) % tabs.length]
    if (next) onChange(next.id)
  }

  return (
    <div role="tablist" aria-orientation="horizontal" className="flex items-center gap-1 border-b border-border-subtle mb-6 overflow-x-auto flex-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab, idx) => (
        <button
          key={tab.id}
          role="tab"
          id={`tab-${tab.id}`}
          // No aria-controls: most TabNav consumers don't render a matching
          // id={`panel-${id}`}, so emitting it produces a dangling reference
          // (axe aria-valid-attr-value, critical). Pages that do render a panel link
          // it back via aria-labelledby={`tab-${id}`}, which preserves the association.
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => onKeyDown(e, idx)}
          className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors relative rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
            active === tab.id
              ? 'text-text font-semibold'
              : 'text-text-secondary hover:text-text'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="ml-1.5 text-[10px] bg-surface-2 text-text-secondary px-1.5 py-0.5 rounded-full">{tab.count}</span>
          )}
          {active === tab.id && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
          )}
        </button>
      ))}
    </div>
  )
}
