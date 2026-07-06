import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { FolderKanban, Handshake, Palette, Zap, Menu, X } from 'lucide-react'
import ModeSwitcher from './ModeSwitcher'

// The Workspace-mode shell — a sidebar SEPARATE from Polyglot's. Holds only
// client-project pages. On mobile it's an off-canvas drawer (hamburger toggle),
// mirroring the Polyglot Sidebar pattern so content isn't squeezed on small
// screens. Switch back via the ModeSwitcher at the top-left.

const navItem = (active: boolean) =>
  `flex items-center gap-2 px-2 h-8 text-sm rounded-md mx-2 transition-colors [&>svg]:size-4 [&>svg]:shrink-0 ${
    active
      ? 'bg-gradient-to-r from-violet-600 to-violet-800 text-white font-medium [&>svg]:text-white'
      : 'text-text-secondary hover:bg-sidebar-accent hover:text-text'
  }`
const navLinkClass = ({ isActive }: { isActive: boolean }) => navItem(isActive)

function NavSection({ label }: { label: string }) {
  return <div className="h-8 flex items-center px-4 text-xs font-medium text-text-muted select-none">{label}</div>
}

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="flex min-h-screen w-full">
      {/* mobile hamburger — opens the drawer */}
      <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
        className="md:hidden fixed top-3 left-3 z-40 p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text shadow-soft">
        <Menu className="w-5 h-5" />
      </button>
      {/* backdrop */}
      {mobileOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden />}

      <aside
        className={`w-64 min-w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50
          md:sticky md:top-0 md:translate-x-0
          fixed top-0 left-0 transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Logo + mode switcher */}
        <div className="px-4 py-3.5 border-b border-border-subtle flex items-center justify-between">
          <ModeSwitcher mode="workspace" />
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
            className="md:hidden p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5" onClick={() => setMobileOpen(false)}>
          <NavSection label="Client Work" />
          <NavLink to="/workspace" end className={navLinkClass}>
            <FolderKanban className="w-4 h-4" /> Shopify Projects
          </NavLink>
          <NavLink to="/workspace/saas" className={navLinkClass}>
            <Zap className="w-4 h-4" /> SaaS Projects
          </NavLink>
          <NavLink to="/workspace/sales" className={navLinkClass}>
            <Handshake className="w-4 h-4" /> Sales
          </NavLink>
          <NavLink to="/workspace/design-library" className={navLinkClass}>
            <Palette className="w-4 h-4" /> Design Library
          </NavLink>
        </nav>

        <div className="px-4 py-3 border-t border-border-subtle">
          <p className="text-[10px] text-text-muted leading-snug">
            Manage client projects. Theme code lives in VS Code; dispatch agents to edit it.
          </p>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto pt-14 md:pt-0">{children}</main>
    </div>
  )
}
