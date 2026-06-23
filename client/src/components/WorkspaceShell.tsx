import { NavLink } from 'react-router-dom'
import { FolderKanban, Handshake } from 'lucide-react'
import ModeSwitcher from './ModeSwitcher'

// The Workspace-mode shell — a sidebar SEPARATE from Polyglot's. Holds only
// client-project pages. It grows its own nav over time with zero impact on
// Polyglot's sidebar. Switch back via the ModeSwitcher at the top-left.

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
  return (
    <div className="flex min-h-screen w-full">
      <aside className="w-64 min-w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50 sticky top-0">
        {/* Logo + mode switcher */}
        <div className="px-4 py-3.5 border-b border-border-subtle">
          <ModeSwitcher mode="workspace" />
        </div>

        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
          <NavSection label="Client Work" />
          <NavLink to="/workspace" end className={navLinkClass}>
            <FolderKanban className="w-4 h-4" /> Projects
          </NavLink>
          <NavLink to="/workspace/sales" className={navLinkClass}>
            <Handshake className="w-4 h-4" /> Sales
          </NavLink>
        </nav>

        <div className="px-4 py-3 border-t border-border-subtle">
          <p className="text-[10px] text-text-muted leading-snug">
            Manage client projects. Theme code lives in VS Code; dispatch agents to edit it.
          </p>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto">{children}</main>
    </div>
  )
}
