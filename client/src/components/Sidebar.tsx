import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LayoutDashboard,
  Bot,
  FolderOpen,
  Settings,
  Zap,
  Sparkles,
  FlaskConical,
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
  AlertCircle,
} from 'lucide-react'
import type { Project } from '../types'
import { useTheme } from '../contexts/ThemeContext'
import { getErrorLogCount, subscribeLogStream } from '../lib/api'

interface SidebarProps {
  projects: Project[]
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-2 text-[13px] rounded-lg mx-2 transition-all ${
    isActive
      ? 'bg-accent-muted text-accent-hover font-medium'
      : 'text-text-secondary hover:text-text hover:bg-surface-2'
  }`

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
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden">
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
  const location = useLocation()

  // Live unresolved error badge via SSE (fallback poll on disconnect)
  useEffect(() => {
    getErrorLogCount().then(r => setUnresolvedErrors(r.unresolved)).catch(() => {})
    const es = subscribeLogStream((ev) => {
      if (ev.type === 'ready') setUnresolvedErrors(ev.unresolved)
      else if (ev.type === 'new_error' && ev.entry.resolved === 0) setUnresolvedErrors(n => n + 1)
      else if (ev.type === 'resolved') setUnresolvedErrors(n => Math.max(0, n - 1))
      else if (ev.type === 'cleared') getErrorLogCount().then(r => setUnresolvedErrors(r.unresolved)).catch(() => {})
    })
    return () => es.close()
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
    <aside className="w-[220px] min-w-[220px] h-screen sticky top-0 bg-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <h1 className="text-[14px] font-semibold tracking-tight">Polyglot</h1>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-all"
            >
              {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={toggle}
              title={`Theme: ${theme} (click to cycle: dark → light → system)`}
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
        className="mx-3 mt-3 mb-1 flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted bg-surface-2/50 border border-border rounded-lg hover:bg-surface-2 hover:text-text transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[9px] bg-surface border border-border px-1 py-0.5 rounded font-mono">⌘K</kbd>
      </button>

      {/* Navigation — flat, 8 items */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
        <NavLink to="/" className={navLinkClass} end>
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </NavLink>
        <NavLink to="/agents" className={navLinkClass}>
          <Bot className="w-4 h-4" /> Agents
        </NavLink>
        <NavLink to="/orchestration" className={navLinkClass}>
          <Sparkles className="w-4 h-4" /> Orchestration
        </NavLink>
        <NavLink to="/playground" className={navLinkClass}>
          <FlaskConical className="w-4 h-4" /> Playground
        </NavLink>

        <div className="mx-4 my-2 border-t border-border" />

        <NavLink to="/analytics" className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-2 text-[13px] rounded-lg mx-2 transition-all ${
            isActive || isAnalyticsActive
              ? 'bg-accent-muted text-accent-hover font-medium'
              : 'text-text-secondary hover:text-text hover:bg-surface-2'
          }`
        }>
          <BarChart3 className="w-4 h-4" /> Analytics
        </NavLink>
        <NavLink to="/org-chart" className={navLinkClass}>
          <Users className="w-4 h-4" /> Org Chart
        </NavLink>
        <NavLink to="/hr" className={navLinkClass}>
          <UserCog className="w-4 h-4" /> HR
        </NavLink>
        <NavLink to="/logs" className={navLinkClass}>
          <AlertCircle className="w-4 h-4" />
          <span className="flex-1">Logs</span>
          {unresolvedErrors > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
              {unresolvedErrors > 99 ? '99+' : unresolvedErrors}
            </span>
          )}
        </NavLink>
        <NavLink to="/schedules" className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-2 text-[13px] rounded-lg mx-2 transition-all ${
            isActive || isSchedulesActive
              ? 'bg-accent-muted text-accent-hover font-medium'
              : 'text-text-secondary hover:text-text hover:bg-surface-2'
          }`
        }>
          <Clock className="w-4 h-4" /> Schedules
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-2 text-[13px] rounded-lg mx-2 transition-all ${
            isActive || isSettingsActive
              ? 'bg-accent-muted text-accent-hover font-medium'
              : 'text-text-secondary hover:text-text hover:bg-surface-2'
          }`
        }>
          <Settings className="w-4 h-4" /> Settings
        </NavLink>
      </nav>

      {/* Projects — sticky footer */}
      <div className="border-t border-border p-2">
        <ProjectSelector projects={projects} />
      </div>
    </aside>
  )
}
