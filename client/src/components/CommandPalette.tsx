import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Bot, Sparkles, BarChart3, Clock, Globe, Users, Target,
  FileText, Terminal, ShieldCheck, Brain, FlaskConical, LayoutTemplate,
  Settings, Wrench, BookOpen, Activity,
  LayoutDashboard,
} from 'lucide-react'
import { getUnifiedAgents, getSchedules, getWebhooks } from '../lib/api'

interface CommandItem {
  id: string
  label: string
  category: string
  icon: React.ElementType
  action: () => void
  keywords?: string
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [dynamicItems, setDynamicItems] = useState<CommandItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const go = useCallback((path: string) => { navigate(path); setOpen(false) }, [navigate])

  // Static navigation items
  const staticItems: CommandItem[] = useMemo(() => [
    // Build
    { id: 'dashboard', label: 'Dashboard', category: 'Pages', icon: LayoutDashboard, action: () => go('/') },
    { id: 'agents', label: 'All Agents', category: 'Pages', icon: Bot, action: () => go('/agents'), keywords: 'agent list manage' },
    { id: 'studio', label: 'Studio', category: 'Pages', icon: Sparkles, action: () => go('/studio'), keywords: 'orchestration pipeline dag workflow graph' },
    { id: 'ask-claude', label: 'Ask Claude', category: 'Actions', icon: Sparkles, action: () => { window.dispatchEvent(new Event('polyglot:open-ai')); setOpen(false) }, keywords: 'ai assistant chat help ⌘j cmd j' },
    { id: 'playground', label: 'Playground', category: 'Pages', icon: FlaskConical, action: () => go('/playground'), keywords: 'test run agent' },
    { id: 'prompts', label: 'Prompts', category: 'Pages', icon: FileText, action: () => go('/prompts'), keywords: 'system prompt agent edit version' },
    { id: 'context-hub', label: 'Context Hub', category: 'Pages', icon: Brain, action: () => go('/context-hub'), keywords: 'memory knowledge notes brain' },
    // Observe
    { id: 'tracing', label: 'Tracing', category: 'Pages', icon: Activity, action: () => go('/tracing'), keywords: 'runs trace history logs spans' },
    { id: 'monitoring', label: 'Monitoring', category: 'Pages', icon: BarChart3, action: () => go('/monitoring'), keywords: 'analytics cost tokens usage stats overview' },
    { id: 'health', label: 'Agent Health', category: 'Pages', icon: Activity, action: () => go('/monitoring?tab=health'), keywords: 'health performance' },
    // Evaluate
    { id: 'datasets', label: 'Datasets & Experiments', category: 'Pages', icon: BarChart3, action: () => go('/datasets'), keywords: 'golden cases experiments compare' },
    { id: 'evaluators', label: 'Evaluators', category: 'Pages', icon: ShieldCheck, action: () => go('/evaluators'), keywords: 'judge rubric score quality' },
    { id: 'annotation', label: 'Annotation Queue', category: 'Pages', icon: Activity, action: () => go('/annotation'), keywords: 'learning review label inbox' },
    { id: 'org-chart', label: 'Org Chart', category: 'Pages', icon: Users, action: () => go('/org-chart'), keywords: 'hierarchy pipeline agents' },
    { id: 'schedules', label: 'Schedules', category: 'Pages', icon: Clock, action: () => go('/schedules'), keywords: 'cron timer automatic' },
    { id: 'webhooks', label: 'Webhooks', category: 'Pages', icon: Globe, action: () => go('/schedules?tab=webhooks'), keywords: 'trigger external event' },
    // Settings tabs
    { id: 'settings', label: 'Settings', category: 'Config', icon: Settings, action: () => go('/settings'), keywords: 'config preferences' },
    { id: 'claude-md', label: 'CLAUDE.md', category: 'Config', icon: FileText, action: () => go('/settings?tab=claude-md') },
    { id: 'commands', label: 'Commands', category: 'Config', icon: Terminal, action: () => go('/settings?tab=commands'), keywords: 'slash command' },
    { id: 'rules', label: 'Rules', category: 'Config', icon: ShieldCheck, action: () => go('/settings?tab=commands'), keywords: 'guard constraint' },
    { id: 'templates', label: 'Templates', category: 'Config', icon: LayoutTemplate, action: () => go('/settings?tab=templates') },
    { id: 'backup', label: 'Backup', category: 'Config', icon: Settings, action: () => go('/settings?tab=backup'), keywords: 'github cloud' },
    { id: 'database', label: 'Database', category: 'Config', icon: Settings, action: () => go('/settings?tab=database'), keywords: 'sqlite tables query sql' },
    { id: 'memory-history', label: 'Memory History', category: 'Config', icon: Activity, action: () => go('/memory/history') },
    // Power-user
    { id: 'hr', label: 'HR Registry', category: 'Advanced', icon: Users, action: () => go('/hr'), keywords: 'hire promote pip retire' },
    { id: 'goals', label: 'Goal Cascade', category: 'Advanced', icon: Target, action: () => go('/goals'), keywords: 'mission project goals' },
    { id: 'setup', label: 'Setup & Status', category: 'Help', icon: Wrench, action: () => go('/setup') },
    { id: 'docs', label: 'Documentation', category: 'Help', icon: BookOpen, action: () => go('/docs') },
  ], [go])

  // Load dynamic items (agents, schedules, webhooks)
  useEffect(() => {
    if (!open) return
    Promise.all([
      getUnifiedAgents().catch((err) => { console.error('[command-palette] agents load failed:', err?.message || err); return [] }),
      getSchedules().catch((err) => { console.error('[command-palette] schedules load failed:', err?.message || err); return [] }),
      getWebhooks().catch((err) => { console.error('[command-palette] webhooks load failed:', err?.message || err); return [] }),
    ]).then(([agents, schedules, webhooks]) => {
      const items: CommandItem[] = []
      for (const a of agents) {
        items.push({
          id: `agent-${a.filename}`,
          label: a.name,
          category: 'Agents',
          icon: Bot,
          action: () => go(a.scope === 'global' ? `/global/agents/${a.filename}` : `/projects/${a.projectId}/agents/${a.filename}`),
          keywords: `${a.description} ${a.model} ${a.filename}`,
        })
      }
      for (const s of schedules) {
        items.push({
          id: `schedule-${s.id}`,
          label: `Schedule: ${s.name}`,
          category: 'Schedules',
          icon: Clock,
          action: () => go('/schedules'),
          keywords: `${s.agentName} ${s.cron}`,
        })
      }
      for (const w of webhooks) {
        items.push({
          id: `webhook-${w.id}`,
          label: `Webhook: ${w.name}`,
          category: 'Webhooks',
          icon: Globe,
          action: () => go('/schedules?tab=webhooks'),
          keywords: `${w.agentName}`,
        })
      }
      setDynamicItems(items)
    })
  }, [open, go])

  const allItems = useMemo(() => [...staticItems, ...dynamicItems], [staticItems, dynamicItems])

  const filtered = useMemo(() => {
    if (!query) return allItems.slice(0, 20)
    const q = query.toLowerCase()
    return allItems
      .filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.keywords || '').toLowerCase().includes(q)
      )
      .slice(0, 15)
  }, [query, allItems])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
        setQuery('')
        setSelectedIdx(0)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    // Capture ref at effect time + clear timer on cleanup to avoid stale focus
    // attempts after unmount or rapid open/close toggles.
    const ref = inputRef
    const timer = setTimeout(() => ref.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => { setSelectedIdx(0) }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[selectedIdx]) { filtered[selectedIdx].action() }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Palette */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-pop overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Search className="w-5 h-5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, agents, actions..."
            role="combobox"
            aria-expanded
            aria-controls="command-palette-listbox"
            aria-activedescendant={filtered[selectedIdx] ? `command-option-${filtered[selectedIdx].id}` : undefined}
            aria-label="Search pages, agents, actions"
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
          <kbd className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div
          id="command-palette-listbox"
          role="listbox"
          aria-label="Command results"
          className="max-h-[360px] overflow-y-auto py-2"
        >
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-text-muted text-sm">
              No results for "{query}"
            </div>
          ) : (
            <>
              {filtered.map((item, i) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    id={`command-option-${item.id}`}
                    role="option"
                    aria-selected={i === selectedIdx}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={`w-full flex items-center gap-3 px-5 py-2.5 text-left border-l-2 transition-colors ${
                      i === selectedIdx ? 'bg-accent/10 text-accent border-accent' : 'text-text border-transparent hover:bg-surface-2'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 opacity-60" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded shrink-0">
                      {item.category}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-border flex items-center gap-4 text-[10px] text-text-muted">
          <span><kbd className="bg-surface-2 px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="bg-surface-2 px-1 rounded">↵</kbd> select</span>
          <span><kbd className="bg-surface-2 px-1 rounded">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
