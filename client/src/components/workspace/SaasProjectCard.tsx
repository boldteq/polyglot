import { Bot, Terminal, Scale, FileCode2, ArrowRight } from 'lucide-react'
import type { Project } from '../../types'

// A discovered local app project (has a .claude/ dir or CLAUDE.md) surfaced in the
// Workspace "SaaS Projects" grid. Distinct from the build-project ProjectCard —
// this shape carries agent/command/rule counts, not build/score data.
export default function SaasProjectCard({ project: p, onOpen }: { project: Project; onOpen: () => void }) {
  const initial = (p.name.trim()[0] || '?').toUpperCase()
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className="group card card-hover overflow-hidden cursor-pointer flex flex-col">
      {/* header — initial on a brand gradient, with a CLAUDE.md badge + hover Open */}
      <div className="relative h-28 shrink-0 overflow-hidden bg-gradient-to-br from-accent/15 to-accent/[0.03] flex items-center justify-center">
        <span className="text-4xl font-bold text-accent/30 select-none">{initial}</span>
        {p.hasClaudeMd && <span className="absolute top-2 right-2 z-20 pill bg-surface/80 backdrop-blur-sm text-text-secondary"><FileCode2 className="w-3 h-3" /> CLAUDE.md</span>}
        <div className="absolute inset-0 z-10 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <span className="btn-primary btn-sm flex items-center gap-1.5">Open <ArrowRight className="w-4 h-4" /></span>
        </div>
      </div>
      {/* body */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-[14px] truncate" title={p.name}>{p.name}</h3>
          <code className="text-[11px] text-text-muted truncate block mt-0.5" title={p.displayPath}>{p.displayPath}</code>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
          <span className="pill bg-text-muted/10 text-text-muted"><Bot className="w-3 h-3" />{p.agentCount} agents</span>
          <span className="pill bg-text-muted/10 text-text-muted"><Terminal className="w-3 h-3" />{p.commandCount} cmds</span>
          <span className="pill bg-text-muted/10 text-text-muted"><Scale className="w-3 h-3" />{p.ruleCount} rules</span>
        </div>
      </div>
    </div>
  )
}
