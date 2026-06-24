import { Pencil, Archive, Link2, BellOff, CheckSquare, Square, AlertTriangle, ArrowRight } from 'lucide-react'
import ScoreGauge from './ScoreGauge'
import StepIndicator from './StepIndicator'
import VerdictPill from './VerdictPill'
import { phaseForStep } from '../../lib/workspacePhases'
import { relTime } from '../../lib/relTime'
import { PROJECT_STATUS_TONE } from '../../lib/projectStatus'
import type { WorkspaceProject } from '../../lib/api'

// One project as a Hostinger/Lovable-style card: a real storefront preview
// thumbnail (latest Lens frame; gradient+initial fallback) with the status
// overlaid, body = name/niche · domain·phase·step · score+verdict+time · a slim
// pipeline-progress bar. Whole card opens the project; hovering dims the preview
// and reveals an "Open" affordance (the "I'm editing a real project" feel).
export default function ProjectCard({ project: p, thumb, attention, selected, anySelected, onOpen, onToggleSel, onEdit, onArchive, onLink, onAck }: {
  project: WorkspaceProject
  thumb: string | null
  attention: string[]
  selected: boolean
  anySelected: boolean
  onOpen: () => void
  onToggleSel: () => void
  onEdit: () => void
  onArchive: () => void
  onLink: () => void
  onAck: () => void
}) {
  const b = p.build
  const blockerM = attention.map((r) => r.match(/(\d+)\s*open blocker/i)).find(Boolean)
  const attLabel = blockerM ? `${blockerM[1]} blocker${blockerM[1] === '1' ? '' : 's'}` : 'attention'
  const sub = b
    ? [p.domain || b.store, phaseForStep(b.step.current).label, `step ${b.step.current}/18`].filter(Boolean).join(' · ')
    : [p.domain, 'intake only'].filter(Boolean).join(' · ')
  const initial = (p.name.trim()[0] || '?').toUpperCase()

  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className={`group card card-hover overflow-hidden cursor-pointer flex flex-col ${selected ? 'ring-2 ring-accent' : ''}`}>
      {/* preview header — Lens thumbnail or gradient fallback */}
      <div className="relative h-36 shrink-0 overflow-hidden">
        {thumb ? (
          <img src={thumb} alt={`${p.name} preview`} loading="lazy" className="w-full h-full object-cover object-top bg-surface-2" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/15 to-accent/[0.03]">
            <span className="text-4xl font-bold text-accent/30 select-none">{initial}</span>
          </div>
        )}
        <span className={`absolute top-2 right-2 text-[11px] font-medium px-2 py-0.5 rounded-full capitalize backdrop-blur-sm ${PROJECT_STATUS_TONE[p.status] || PROJECT_STATUS_TONE.intake}`}>{p.status}</span>
        <button onClick={(e) => { e.stopPropagation(); onToggleSel() }} aria-label={selected ? 'Deselect' : 'Select'}
          className={`absolute top-2 left-2 rounded bg-surface/80 backdrop-blur-sm p-0.5 transition-opacity ${selected ? 'text-accent opacity-100' : `text-text-muted ${anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}`}>
          {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
        </button>
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="btn-primary btn-sm flex items-center gap-1.5 pointer-events-none">Open project <ArrowRight className="w-4 h-4" /></span>
        </div>
      </div>

      {/* body */}
      <div className="p-4 flex-1 flex flex-col gap-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="font-semibold text-[14px] capitalize truncate">{p.name}</h3>
              {p.niche && <span className="pill bg-text-muted/10 text-text-muted uppercase tracking-wide shrink-0">{p.niche}</span>}
            </div>
            <div className="text-[12px] text-text-muted truncate mt-0.5">{sub}</div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} title="Edit" className="btn-ghost btn-sm p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
            {attention.length > 0 && <button onClick={onAck} title="Acknowledge escalation (clears until reasons change)" className="btn-ghost btn-sm p-1.5 text-text-muted hover:text-amber"><BellOff className="w-3.5 h-3.5" /></button>}
            {!p.build_dir && <button onClick={onLink} title="Link a build folder" className="btn-ghost btn-sm p-1.5"><Link2 className="w-3.5 h-3.5" /></button>}
            <button onClick={onArchive} title="Archive" className="btn-ghost btn-sm p-1.5 text-text-muted hover:text-red"><Archive className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="mt-auto space-y-2.5">
          <div className="flex items-center gap-2.5">
            {b ? <ScoreGauge score={b.score} grade={b.grade} size={36} stroke={5} showGrade={false} /> : <div className="w-9 h-9 rounded-full border-2 border-border shrink-0" />}
            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <VerdictPill verdict={b?.lensVerdict ?? null} blockers={b?.gates.blockersOpen ?? 0} />
              {attention.length > 0 && <span className="pill bg-red/10 text-red normal-case shrink-0"><AlertTriangle className="w-3 h-3" />{attLabel}</span>}
              <span className="text-[11px] text-text-muted shrink-0 ml-auto">{relTime(b?.capturedAt ?? p.updated_at)}</span>
            </div>
          </div>
          {b && <StepIndicator current={b.step.current} total={b.step.total} showLabel={false} />}
        </div>
      </div>
    </div>
  )
}
