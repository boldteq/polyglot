import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef, type SyntheticEvent } from 'react'
import {
  LayoutDashboard,
  Bot,
  FolderOpen,
  Settings,
  Sparkles,
  FlaskConical,
  Hammer,
  Handshake,
  Sun,
  Moon,
  Monitor,
  Maximize,
  Minimize,
  BarChart3,
  Clock,
  Users,
  UserCog,
  Search,
  Check,
  ChevronDown,
  ChevronsUpDown,
  AlertCircle,
  Activity,
  BookOpen,
  Inbox,
  Menu,
  X,
} from 'lucide-react'
import type { Project } from '../types'
import ModeSwitcher from './ModeSwitcher'
import { useTheme } from '../contexts/ThemeContext'
import { getErrorLogCount, subscribeLogStream, getLearningInboxCounts, subscribeLearningStream, getSystemStatus } from '../lib/api'
import { usePrefetch } from '../hooks/usePrefetch'

interface SidebarProps {
  projects: Project[]
}

// Nav item — exact shadcn sidebar menu-button spec: h-8, rounded-md, gap-2,
// text-sm; active = brand gradient pill (#6959ff→#4a25ff) with white text+icon.
const navItem = (active: boolean) =>
  `flex items-center gap-2 px-2 h-8 text-sm rounded-md mx-2 transition-colors [&>svg]:size-4 [&>svg]:shrink-0 ${
    active
      ? 'bg-gradient-to-r from-accent to-[var(--color-brand-dark)] text-white font-medium [&>svg]:text-white'
      : 'text-text-secondary hover:bg-sidebar-accent hover:text-text'
  }`

const navLinkClass = ({ isActive }: { isActive: boolean }) => navItem(isActive)

// Section label — shadcn group-label: h-8, px-2, text-xs medium muted.
function NavSection({ label }: { label: string }) {
  return (
    <div className="h-8 flex items-center px-4 text-xs font-medium text-text-muted select-none">
      {label}
    </div>
  )
}

function ProjectSelector({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  const activeProject = projects.find(p => location.pathname.includes(`/projects/${p.id}`))

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (projects.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl border transition-all ${
          activeProject
            ? 'bg-accent/8 border-accent/20 text-accent-hover'
            : 'bg-surface-2/50 border-border text-text-secondary hover:bg-surface-2 hover:text-text'
        }`}
      >
        <FolderOpen className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate font-medium">
          {activeProject ? activeProject.name : 'Select project...'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[9px] bg-surface-2 text-text-muted px-1.5 py-0.5 rounded-full">{projects.length}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-surface border border-border rounded-xl shadow-pop z-50 overflow-hidden">
          <div className="py-1 max-h-[280px] overflow-y-auto">
            {projects.map((p) => {
              const isActive = activeProject?.id === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => { navigate(`/projects/${p.id}`); setOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent-hover'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 text-left truncate">{p.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.agentCount > 0 && (
                      <span className="text-[9px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded-full">
                        {p.agentCount} agents
                      </span>
                    )}
                    {isActive && <Check className="w-3.5 h-3.5 text-accent" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Sidebar({ projects }: SidebarProps) {
  const { theme, toggle } = useTheme()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [unresolvedErrors, setUnresolvedErrors] = useState(0)
  const [pendingLearning, setPendingLearning] = useState(0)
  const [systemState, setSystemState] = useState<'ok' | 'degraded' | 'down'>('ok')
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const prefetch = usePrefetch()

  // Close the mobile drawer whenever the route changes (a nav click navigated).
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Delegated prefetch: on hover/focus of any nav link, warm its chunk + data so
  // the page renders instantly on click. One handler covers all NavLinks.
  const handleNavPrefetch = useCallback((e: SyntheticEvent) => {
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!a) return
    try {
      const path = new URL(a.href, window.location.origin).pathname
      prefetch(path)
    } catch { /* ignore malformed href */ }
  }, [prefetch])

  // Live unresolved error badge via SSE (fallback poll on disconnect)
  useEffect(() => {
    getErrorLogCount().then(r => setUnresolvedErrors(r.unresolved)).catch(err => console.error('[sidebar] error-count fetch failed:', err instanceof Error ? err.message : err))
    const es = subscribeLogStream((ev) => {
      if (ev.type === 'ready') setUnresolvedErrors(ev.unresolved)
      else if (ev.type === 'new_error' && ev.entry.resolved === 0) setUnresolvedErrors(n => n + 1)
      else if (ev.type === 'resolved') setUnresolvedErrors(n => Math.max(0, n - 1))
      else if (ev.type === 'cleared') getErrorLogCount().then(r => setUnresolvedErrors(r.unresolved)).catch(err => console.error('[sidebar] error-count refetch failed:', err instanceof Error ? err.message : err))
    })
    return () => es.close()
  }, [])

  // Live pending-learning badge via SSE (fallback poll on disconnect)
  useEffect(() => {
    getLearningInboxCounts().then(r => setPendingLearning(r.pending)).catch(err => console.error('[sidebar] learning-count fetch failed:', err instanceof Error ? err.message : err))
    const es = subscribeLearningStream((ev) => {
      if (ev.type === 'ready') setPendingLearning(ev.pending)
      else if (ev.type === 'candidate') setPendingLearning(n => n + (ev.staged || 1))
      else if (ev.type === 'reviewed') setPendingLearning(n => Math.max(0, n - 1))
    })
    return () => es.close()
  }, [])

  // System-health dot on the System nav item — surfaces a degraded pipeline
  // (e.g. Ollama/Claude offline) app-wide so it's not silently invisible.
  useEffect(() => {
    let alive = true
    const poll = () => getSystemStatus().then(s => { if (alive) setSystemState(s.overall) }).catch(err => console.error('[sidebar] system-status poll failed:', err instanceof Error ? err.message : err))
    poll()
    const id = setInterval(poll, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }, [])

  // Settings is active for any config-related path
  const isSettingsActive = ['/settings', '/global/claude-md', '/commands', '/rules', '/templates', '/memory', '/backup', '/database'].some(
    p => location.pathname.startsWith(p)
  )
  // Analytics is active for runs and health too
  const isAnalyticsActive = ['/analytics', '/runs', '/health'].some(
    p => location.pathname.startsWith(p)
  )
  // Schedules is active for webhooks too
  const isSchedulesActive = ['/schedules', '/webhooks'].some(
    p => location.pathname.startsWith(p)
  )

  return (
    <>
      {/* Mobile hamburger — only below md; opens the drawer */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text shadow-soft"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

    <aside
      className={`w-64 min-w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50
        md:sticky md:top-0 md:translate-x-0
        fixed top-0 left-0 transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
    >
      {/* Logo */}
      <div className="px-4 py-3.5 border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <ModeSwitcher mode="polyglot" />
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Mobile-only close button */}
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="md:hidden p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-all"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={toggle}
              title={`Theme: ${theme} (click to cycle: dark → light → system)`}
              aria-label={`Theme: ${theme}. Click to cycle theme.`}
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-all"
            >
              {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        aria-label="Open command palette (Cmd+K)"
        className="mx-3 mt-3 mb-1 flex items-center gap-2 px-3 py-2 text-xs text-text-muted bg-surface-2/60 border border-border-subtle rounded-xl hover:bg-surface-2 hover:text-text transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[9px] bg-surface border border-border-subtle px-1 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      {/* Navigation — grouped into semantic sections. Hover/focus prefetches the target chunk+data. */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5" onMouseOver={handleNavPrefetch} onFocus={handleNavPrefetch}>
        <NavSection label="Core Work" />
        <NavLink to="/" className={navLinkClass} end>
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </NavLink>
        <NavLink to="/playground" className={navLinkClass}>
          <FlaskConical className="w-4 h-4" /> Playground
        </NavLink>
        <NavLink to="/sales" className={navLinkClass}>
          <Handshake className="w-4 h-4" /> Sales
        </NavLink>
        <NavLink to="/build" className={navLinkClass}>
          <Hammer className="w-4 h-4" /> Build
        </NavLink>
        <NavLink to="/orchestration" className={navLinkClass}>
          <Sparkles className="w-4 h-4" /> Orchestration
        </NavLink>

        <NavSection label="Agents & Teams" />
        <NavLink to="/agents" className={navLinkClass}>
          <Bot className="w-4 h-4" /> Agents
        </NavLink>
        <NavLink to="/org-chart" className={navLinkClass}>
          <Users className="w-4 h-4" /> Org Chart
        </NavLink>
        <NavLink to="/hr" className={navLinkClass}>
          <UserCog className="w-4 h-4" /> HR
        </NavLink>

        <NavSection label="Observability" />
        <NavLink to="/analytics" className={({ isActive }) => navItem(isActive || isAnalyticsActive)}>
          <BarChart3 className="w-4 h-4" /> Analytics
        </NavLink>
        <NavLink to="/logs" className={navLinkClass}>
          <AlertCircle className="w-4 h-4" />
          <span className="flex-1">Logs</span>
          {unresolvedErrors > 0 && (
            <span className="bg-red text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {unresolvedErrors > 99 ? '99+' : unresolvedErrors}
            </span>
          )}
        </NavLink>
        <NavLink to="/learning" className={navLinkClass}>
          <Inbox className="w-4 h-4" />
          <span className="flex-1">Learning</span>
          {pendingLearning > 0 && (
            <span className="bg-amber text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {pendingLearning > 99 ? '99+' : pendingLearning}
            </span>
          )}
        </NavLink>
        <NavLink to="/system" className={navLinkClass}>
          <Activity className="w-4 h-4" />
          <span className="flex-1">System</span>
          {systemState !== 'ok' && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${systemState === 'down' ? 'bg-red' : 'bg-amber'}`}
              title={`System ${systemState}`}
              aria-label={`System ${systemState}`}
            />
          )}
        </NavLink>

        <NavSection label="Automation" />
        <NavLink to="/schedules" className={({ isActive }) => navItem(isActive || isSchedulesActive)}>
          <Clock className="w-4 h-4" /> Schedules
        </NavLink>

        <NavSection label="Config" />
        <NavLink to="/settings" className={({ isActive }) => navItem(isActive || isSettingsActive)}>
          <Settings className="w-4 h-4" /> Settings
        </NavLink>
        <NavLink to="/docs" className={navLinkClass}>
          <BookOpen className="w-4 h-4" /> Documentation
        </NavLink>
      </nav>

      {/* Projects + profile — sticky footer (shadcn footer: flex-col gap-2 p-2) */}
      <div className="border-t border-sidebar-border p-2 flex flex-col gap-2">
        <ProjectSelector projects={projects} />
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-2 h-12 px-2 rounded-md hover:bg-sidebar-accent transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0 text-white text-xs font-bold">Y</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-tight truncate">Yash</div>
            <div className="text-xs text-text-muted leading-tight truncate">boldteq@gmail.com</div>
          </div>
          <ChevronsUpDown className="w-4 h-4 text-text-muted shrink-0" />
        </button>
      </div>
    </aside>
    </>
  )
}
