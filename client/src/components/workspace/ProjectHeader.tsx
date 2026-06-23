import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Bot, GitBranch, ExternalLink, Link2, ChevronDown, Check, Hammer, Rocket, Wand2 } from 'lucide-react'
import ScoreGauge from './ScoreGauge'
import StepIndicator from './StepIndicator'
import VerdictPill from './VerdictPill'
import ActionsBar from './ActionsBar'
import { openDispatch } from '../../lib/dispatch'
import { openBuild } from '../../lib/build'
import { openPublish } from '../../lib/publish'
import { toast } from '../Toast'
import { setWorkspaceProjectStatus, PROJECT_STATUSES, type ProjectDetail, type RepoData, type ProjectStatus } from '../../lib/api'

const STATUS_TONE: Record<string, string> = {
  intake: 'text-text-muted bg-text-muted/10', building: 'text-accent bg-accent/10',
  preview: 'text-amber bg-amber/10', published: 'text-green bg-green/10', archived: 'text-text-muted bg-text-muted/10',
}
const vscodeLink = (abs: string) => `vscode://file${abs}`

// The always-visible project hero: identity + score + step + the elevated REPO
// connection line + primary actions. Replaces the old build-detail header card.
function StatusChanger({ id, status, onChanged }: { id: string; status: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  const pick = async (s: ProjectStatus) => {
    setOpen(false); if (s === status) return
    setBusy(true)
    try { await setWorkspaceProjectStatus(id, s); toast('success', `Status → ${s}`); onChanged() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Status change failed') } finally { setBusy(false) }
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} disabled={busy}
        className={`text-[10px] px-2 py-0.5 rounded-full capitalize flex items-center gap-1 ${STATUS_TONE[status] || STATUS_TONE.intake}`}>
        {status} <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-36 bg-surface border border-border rounded-lg shadow-lg py-1 z-[60]">
          {PROJECT_STATUSES.map((s) => (
            <button key={s} onClick={() => pick(s)} className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] capitalize hover:bg-surface-2 text-left">
              {s} {s === status && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProjectHeader({ detail, repo, onReload }: { detail: ProjectDetail; repo: RepoData | null; onReload: () => void }) {
  const nav = useNavigate()
  const { project, build, buildId } = detail
  const git = repo?.git

  return (
    <div className="card p-5 flex items-start gap-5 flex-wrap">
      {build
        ? <ScoreGauge score={build.score} grade={build.grade} size={76} stroke={8} />
        : <div className="w-[76px] h-[76px] rounded-full border-2 border-border shrink-0" />}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-[22px] font-bold tracking-tight capitalize">{project.name}</h1>
          <StatusChanger id={project.id} status={project.status} onChanged={onReload} />
          {build && <VerdictPill verdict={build.lensVerdict} blockers={build.gates.blockersOpen} />}
        </div>
        <div className="text-[13px] text-text-muted mb-2">
          {project.niche ? `${project.niche} · ` : ''}{project.domain || repo?.themeLock?.store || '—'}{build ? ` · ${build.grade}` : ' · intake only (no build linked)'}
        </div>

        {build ? (
          <>
            <div className="max-w-md"><StepIndicator current={build.step.current} total={build.step.total} /></div>
            <div className="flex flex-wrap gap-4 mt-2 text-[13px]">
              <span><b>{build.gates.passed}/{build.gates.total}</b> <span className="text-text-muted">gates</span></span>
              <span><b>{build.gates.blockersOpen}</b> <span className="text-text-muted">blockers</span></span>
              {build.changes.present && <span><b>{build.changes.rate}%</b> <span className="text-text-muted">changes</span></span>}
            </div>
          </>
        ) : null}

        {/* repo connection line */}
        {repo?.connected ? (
          <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border-subtle text-[12px]">
            <code className="text-text-muted truncate max-w-[280px]">{repo.build_dir}</code>
            {git?.isRepo && <span className="pill bg-surface-2 text-text-secondary flex items-center gap-1"><GitBranch className="w-3 h-3" />{git.branch}</span>}
            {git?.isRepo && <span className={`pill ${git.clean ? 'bg-green/10 text-green' : 'bg-amber/10 text-amber'}`}>{git.clean ? 'clean' : `${git.dirty}●`}</span>}
            <a href={vscodeLink(repo.build_dir!)} className="btn-ghost btn-sm flex items-center gap-1 text-[11px]"><ExternalLink className="w-3 h-3" /> VS Code</a>
          </div>
        ) : null}
      </div>

      {/* actions */}
      <div className="flex items-center gap-2 shrink-0">
        {buildId && <ActionsBar buildId={buildId} onChanged={onReload} />}
        {buildId && build && repo?.connected && (
          <button onClick={() => openBuild({ projectId: project.id, buildId, repoDir: repo!.build_dir!, store: repo?.themeLock?.store })}
            className="btn-ghost btn-sm flex items-center gap-1.5"><Hammer className="w-4 h-4" /> Build</button>
        )}
        {buildId && build && <button onClick={() => nav(`/workspace/p/${project.id}/studio`)} className="btn-ghost btn-sm flex items-center gap-1.5" title="Describe a change and see it — preview + edit together"><Wand2 className="w-4 h-4" /> Studio</button>}
        {buildId && <button onClick={() => openDispatch({ buildId, agent: 'atrium', task: '' })} className="btn-ghost btn-sm flex items-center gap-1.5"><Bot className="w-4 h-4" /> Dispatch</button>}
        {build && <button onClick={() => nav(`/workspace/lens?dir=${encodeURIComponent(build.dir)}`)} className="btn-ghost btn-sm flex items-center gap-1.5"><Eye className="w-4 h-4" /> Lens</button>}
        {build && repo?.connected && repo?.themeLock?.store && (
          <button onClick={() => openPublish({ projectId: project.id, store: repo!.themeLock!.store!, themeName: repo?.themeLock?.themeName, onPublished: onReload })}
            className="btn-primary btn-sm flex items-center gap-1.5"><Rocket className="w-4 h-4" /> Publish</button>
        )}
        {!build && <button onClick={() => nav('/workspace')} className="btn-ghost btn-sm flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Link a build</button>}
      </div>
    </div>
  )
}
