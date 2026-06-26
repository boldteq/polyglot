import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Bot, ExternalLink, Link2, ChevronDown, Check, Hammer, Rocket, Wand2, MoreHorizontal, ShieldCheck, Loader2, CheckCircle2, type LucideIcon } from 'lucide-react'
import ScoreGauge from './ScoreGauge'
import PhaseJourney from './PhaseJourney'
import VerdictPill from './VerdictPill'
import { InfoIcon } from '../Tooltip'
import { useWorkspaceAction } from '../../hooks/useWorkspaceAction'
import { fetchWorkspaceActions } from '../../hooks/useWorkspaceActions'
import { vscodeLink } from '../../lib/vscode'
import { PROJECT_STATUS_TONE } from '../../lib/projectStatus'
import { phaseForStep } from '../../lib/workspacePhases'
import { formatAgentDisplay } from '../../lib/agentDisplay'
import { openDispatch } from '../../lib/dispatch'
import { openBuild } from '../../lib/build'
import { openPublish } from '../../lib/publish'
import { toast } from '../Toast'
import { setWorkspaceProjectStatus, getWorkspaceBuildPipeline, PROJECT_STATUSES, type ProjectDetail, type RepoData, type ProjectStatus, type ActionDef, type PipelineStep } from '../../lib/api'


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
        className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize flex items-center gap-1 ${PROJECT_STATUS_TONE[status] || PROJECT_STATUS_TONE.intake}`}>
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

type MenuItem = { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; hint?: string }

// The "⋯ More" overflow — every action that isn't the one primary CTA. Two groups:
// the main flows + the safe-action "checks" (granular gate/lens/discovery runners
// whose only home is here, after the C4 dedupe). Click-outside to close.
function OverflowMenu({ groups }: { groups: { label?: string; items: MenuItem[] }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  const visible = groups.filter((g) => g.items.length)
  if (!visible.length) return null
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} title="More actions" aria-label="More actions"
        className="btn-ghost btn-sm flex items-center gap-1"><MoreHorizontal className="w-4 h-4" /></button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-60 bg-surface border border-border rounded-xl shadow-lg py-1 z-[60] max-h-[70vh] overflow-y-auto">
          {visible.map((g, gi) => (
            <div key={gi} className={gi > 0 ? 'border-t border-border mt-1.5 pt-1.5' : ''}>
              {g.label && <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted/80">{g.label}</div>}
              {g.items.map((it) => (
                <button key={it.label} onClick={() => { setOpen(false); it.onClick() }} disabled={it.disabled} title={it.hint}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-surface-2 text-left disabled:opacity-40 disabled:cursor-not-allowed">
                  <it.icon className="w-3.5 h-3.5 text-text-muted shrink-0" /> {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProjectHeader({ detail, repo, onReload }: { detail: ProjectDetail; repo: RepoData | null; onReload: () => void }) {
  const nav = useNavigate()
  const { project, build, buildId } = detail
  const { run, trigger } = useWorkspaceAction(buildId || '', onReload)
  const [safeActions, setSafeActions] = useState<ActionDef[]>([])
  const [steps, setSteps] = useState<PipelineStep[]>([])
  useEffect(() => {
    if (!buildId) return
    fetchWorkspaceActions().then((actions) => setSafeActions(actions.filter((a) => a.tier === 'safe'))).catch(() => setSafeActions([]))
    getWorkspaceBuildPipeline(buildId).then((p) => setSteps(p.steps)).catch(() => setSteps([]))
  }, [buildId])

  // "where am I + what's next": the current pipeline step (or first pending) →
  // a plain "Next: <step> — <owner>" line, and the current phase to tie blockers to.
  const nextStep = steps.find((s) => s.status === 'current') || steps.find((s) => s.status === 'pending') || null
  const nextOwner = nextStep?.owner ? (formatAgentDisplay({ name: nextStep.owner, id: nextStep.owner }).realName || nextStep.owner) : ''
  const currentPhaseLabel = build ? phaseForStep(build.step.current || 1).label : ''

  const studioHref = `/workspace/p/${project.id}/studio`
  const lensHref = build ? `/workspace/lens?dir=${encodeURIComponent(build.dir)}` : ''
  const storeUrl = repo?.themeLock?.store ? `https://${repo.themeLock.store}` : null
  const canPublish = !!(build && repo?.connected && repo?.themeLock?.store)
  const doPublish = () => openPublish({ projectId: project.id, store: repo!.themeLock!.store!, themeName: repo?.themeLock?.themeName, onPublished: onReload })
  const gatesGreen = !!(build && build.gates.total > 0 && build.gates.passed === build.gates.total && build.gates.blockersOpen === 0)
  const running = run?.status === 'running'

  // ── the ONE smart context CTA ──
  let primary: { key: string; label: string; icon: LucideIcon; onClick: () => void }
  if (!build) primary = { key: 'link', label: 'Link a build', icon: Link2, onClick: () => nav('/workspace') }
  else if (project.status === 'published' && storeUrl) primary = { key: 'view', label: 'View live', icon: ExternalLink, onClick: () => window.open(storeUrl, '_blank') }
  else if (canPublish && gatesGreen) primary = { key: 'publish', label: 'Publish', icon: Rocket, onClick: doPublish }
  else if (build.gates.blockersOpen > 0 || build.lensVerdict === 'block') primary = { key: 'studio', label: 'Fix in Studio', icon: Wand2, onClick: () => nav(studioHref) }
  else primary = { key: 'studio', label: 'Open Studio', icon: Wand2, onClick: () => nav(studioHref) }

  // ── everything else, behind ⋯ ──
  const gatesAction = safeActions.find((a) => a.id === 'gates:static')
  const flows: MenuItem[] = [
    build && primary.key !== 'studio' ? { label: 'Open Studio', icon: Wand2, onClick: () => nav(studioHref) } : null,
    buildId ? { label: 'Dispatch agent', icon: Bot, onClick: () => openDispatch({ buildId, agent: 'atrium', task: '' }) } : null,
    gatesAction ? { label: running ? 'Running gates…' : 'Run gates', icon: running ? Loader2 : ShieldCheck, onClick: () => trigger(gatesAction), disabled: running || !gatesAction.available } : null,
    build ? { label: 'Open Lens', icon: Eye, onClick: () => nav(lensHref) } : null,
    buildId && build && repo?.connected ? { label: 'Run Maestro build', icon: Hammer, onClick: () => openBuild({ projectId: project.id, buildId, repoDir: repo!.build_dir!, store: repo?.themeLock?.store }) } : null,
    canPublish && primary.key !== 'publish' ? { label: 'Publish', icon: Rocket, onClick: doPublish } : null,
    repo?.connected && repo.build_dir ? { label: 'Open in VS Code', icon: ExternalLink, onClick: () => { window.location.href = vscodeLink(repo.build_dir!) } } : null,
  ].filter(Boolean) as MenuItem[]
  // granular checks behind ⋯. We drop the ones that have a CONTEXTUAL home so each
  // action lives in exactly one place (Auto-Fix #4 dedupe): gates:static = the
  // header "Run gates" flow; gate:rerun = GatesTab per-row; lens:run = LensTab
  // "Re-run Lens"; the 5 step-bound checks (discovery/reuse-map/design-system/
  // consistency/store-preflight) = their Workflow pipeline steps. What's left here
  // (gates:verify, check:honesty, build-state:show) has no other home.
  const CONTEXTUAL = new Set(['gates:static', 'gate:rerun', 'lens:run', 'check:discovery', 'check:reuse-map', 'check:design-system', 'check:consistency', 'store:preflight'])
  const checks: MenuItem[] = safeActions
    .filter((a) => !CONTEXTUAL.has(a.id))
    .map((a) => ({ label: a.label, icon: ShieldCheck, onClick: () => trigger(a), disabled: !a.available, hint: a.available ? a.description : (a.unavailableReason || undefined) }))

  return (
    <div className="card p-5 flex items-start gap-5 flex-wrap">
      {build
        ? <ScoreGauge score={build.score} grade={build.grade} size={76} stroke={8} />
        : <div className="w-[76px] h-[76px] rounded-full border-2 border-border shrink-0" />}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <StatusChanger id={project.id} status={project.status} onChanged={onReload} />
          <InfoIcon label="Lifecycle status → build phase. intake = Intake · building = Discovery–QA · preview = Publish (staging) · published = Monitor (live) · archived = done." />
          {build && <VerdictPill verdict={build.lensVerdict} blockers={build.gates.blockersOpen} />}
          <span className="text-[13px] text-text-muted truncate">{project.niche ? `${project.niche} · ` : ''}{project.domain || repo?.themeLock?.store || (build ? 'no store linked' : 'intake only — no build linked')}</span>
        </div>

        {build ? (
          <>
            <PhaseJourney current={build.step.current} total={build.step.total} />
            <div className="flex flex-wrap items-center gap-4 mt-2 text-[13px]">
              <span><b>{build.gates.passed}/{build.gates.total}</b> <span className="text-text-muted">gates</span></span>
              <span className="flex items-center gap-1">
                <b className={build.gates.blockersOpen > 0 ? 'text-red' : ''}>{build.gates.blockersOpen}</b>
                <span className="text-text-muted">{build.gates.blockersOpen === 1 ? 'blocker' : 'blockers'}{build.gates.blockersOpen > 0 && currentPhaseLabel ? ` in ${currentPhaseLabel}` : ''}</span>
                <InfoIcon label="A blocker is a gate failure or open issue that stops publishing. Clear all blockers to publish." />
              </span>
            </div>
            {nextStep && project.status !== 'published' && (
              <div className="flex items-center gap-1.5 mt-2 text-[12px]">
                <span className="text-text-muted">Next:</span>
                <span className="font-medium truncate">{nextStep.step}. {nextStep.title}</span>
                {nextOwner && <span className="text-[11px] text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded shrink-0">@{nextOwner}</span>}
              </div>
            )}
            {project.status === 'published' && (
              <div className="flex items-center gap-1.5 mt-2 text-[12px] text-green">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium truncate">Published · live{(project.domain || repo?.themeLock?.store) ? ` on ${project.domain || repo?.themeLock?.store}` : ''}</span>
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* actions — one smart CTA + overflow */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={primary.onClick} className="btn-primary btn-sm flex items-center gap-1.5">
          <primary.icon className="w-4 h-4" /> {primary.label}
        </button>
        <OverflowMenu groups={[{ items: flows }, { label: 'Checks', items: checks }]} />
      </div>
    </div>
  )
}
