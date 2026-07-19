import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, FolderKanban } from 'lucide-react'
import { PageShell, TabNav } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'
import { ErrorState } from '../components/ErrorState'
import Collapsible from '../components/Collapsible'
import { InfoIcon } from '../components/Tooltip'
import ProjectHeader from '../components/workspace/ProjectHeader'
import ActivityTimeline from '../components/workspace/ActivityTimeline'
import BriefPanel from '../components/workspace/BriefPanel'
import MonitoringPanel from '../components/workspace/MonitoringPanel'
import RepoPanel from '../components/workspace/RepoPanel'
import PreviewPanel from '../components/workspace/PreviewPanel'
import DoneProofPanel from '../components/workspace/DoneProofPanel'
import WorkflowTab from '../components/workspace/WorkflowTab'
import GatesTab from '../components/workspace/GatesTab'
import LensTab from '../components/workspace/LensTab'
import ChangesTab from '../components/workspace/ChangesTab'
import DocsTab from '../components/workspace/DocsTab'
import DesignSystemTab from '../components/workspace/DesignSystemTab'
import { useBuild } from '../hooks/useBuild'
import { getWorkspaceProject, getWorkspaceProjectRepo, type ProjectDetail, type RepoData } from '../lib/api'

// Each tab opens calm: the PRIMARY section is expanded, secondary sections start
// collapsed (one click to expand). Uses the bare Collapsible (no double-card).
function Section({ title, open = false, info, children }: { title: string; open?: boolean; info?: string; children: React.ReactNode }) {
  return <Collapsible bare title={title} defaultOpen={open} right={info ? <InfoIcon label={info} /> : undefined}>{children}</Collapsible>
}

// Keep-alive tab panel: a tab's content mounts on FIRST visit (lazy) and then
// STAYS mounted (CSS-hidden when inactive) — so switching back is instant and any
// expanded Collapsible / scroll / fetched data is preserved instead of re-fetched.
function TabPanel({ id, active, visited, children }: { id: string; active: string; visited: Set<string>; children: React.ReactNode }) {
  if (!visited.has(id)) return null
  return <div role="tabpanel" hidden={active !== id}>{children}</div>
}

// Project detail — Lovable-style: a slim hero + ~4 tabs instead of an 11-section
// single scroll. Overview is the 90% landing; the heavier operational / quality /
// spec views live one click away; Monitoring appears only once published.
export default function WorkspaceProjectDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [repo, setRepo] = useState<RepoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // initial tab: ?tab=, else a #wf-step-* deep-link opens Build, else Overview
  const [tab, setTab] = useState<string>(() => {
    const t = searchParams.get('tab')
    if (t) return t
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#wf-step-')) return 'build'
    return 'overview'
  })
  // tabs that have been opened at least once → kept mounted (lazy + keep-alive)
  const [visited, setVisited] = useState<Set<string>>(() => new Set([tab]))

  const load = useCallback(() => {
    if (!id) return
    setError(null)
    // fetch project + repo in PARALLEL (was a waterfall). Repo for an intake
    // project just returns {connected:false}; we only surface it when hasBuild.
    Promise.all([getWorkspaceProject(id), getWorkspaceProjectRepo(id).catch(() => null)])
      .then(([d, r]) => { setDetail(d); setRepo(d.hasBuild ? r : null) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load project'))
      .finally(() => setLoading(false))
  }, [id])
  useEffect(() => { setLoading(true); load() }, [load])

  const buildId = detail?.buildId || undefined
  const { reload: reloadBuild, reloadKey } = useBuild(buildId)
  const reloadAll = useCallback(() => { load(); reloadBuild() }, [load, reloadBuild])
  const dir = detail?.build?.dir
  const build = detail?.build

  const published = detail?.project.status === 'published'
  const blockers = build?.gates.blockersOpen ?? 0
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'build', label: 'Build' },
    { id: 'quality', label: 'Quality', count: blockers > 0 ? blockers : undefined },
    { id: 'specs', label: 'Specs' },
    ...(published ? [{ id: 'monitoring', label: 'Monitoring' }] : []),
  ]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'overview'
  const changeTab = (next: string) => { setTab(next); setSearchParams((p) => { p.set('tab', next); return p }, { replace: true }) }
  // mark the active tab visited so it mounts + stays alive
  useEffect(() => { setVisited((v) => (v.has(activeTab) ? v : new Set(v).add(activeTab))) }, [activeTab])

  return (
    <PageShell
      title={detail ? detail.project.name.replace(/(^|[-\s_])([a-z])/g, (_, s, c) => s + c.toUpperCase()) : 'Project'}
      subtitle={detail ? (detail.hasBuild ? (detail.project.niche || undefined) : 'Intake — no build linked yet') : 'Loading…'}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => nav('/workspace')} className="btn-ghost btn-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />Projects</button>
          <button onClick={reloadAll} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>
        </div>
      }
    >
      {loading && !detail ? <Spinner /> : error ? (
        <ErrorState message={error} onRetry={reloadAll} />
      ) : detail ? (
        <div className="space-y-5">
          <ProjectHeader detail={detail} repo={repo} onReload={reloadAll} />

          {!detail.hasBuild ? (
            // Intake-first: no build yet, but you can still capture the brief here
            // (the hero's "Link a build" CTA starts the build when ready).
            <div className="space-y-6">
              <Section title="Brief" open><BriefPanel detail={detail} onReload={reloadAll} /></Section>
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <FolderKanban className="w-4 h-4 text-accent" />
                  <span className="text-[15px] font-semibold">How this build starts</span>
                </div>
                <p className="text-[12px] text-text-muted mb-5">This project is at <b>intake</b> — no build is linked yet. Three steps to begin:</p>
                <ol className="space-y-4">
                  {([
                    ['Add the brief', 'Fill in the brief above — the store name, what it sells, and the goal. Everything else builds on this.'],
                    ['Connect or start a build', 'Use “Link a build” in the top bar to connect an existing theme folder, or start a new one for this client.'],
                    ['Work moves through 7 stages', 'From here the project flows through Intake → Discovery → Design → Build → QA → Publish → Monitor.'],
                  ] as const).map(([t, d], i) => (
                    <li key={i} className="flex gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-[12px] font-bold flex items-center justify-center">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">{t}</div>
                        <div className="text-[12px] text-text-muted leading-snug">{d}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : buildId ? (
            <div>
              <TabNav tabs={tabs} active={activeTab} onChange={changeTab} />

              <TabPanel id="overview" active={activeTab} visited={visited}>
                <div className="space-y-6">
                  <Section title="Done — proof" open><DoneProofPanel done={build?.done} /></Section>
                  <Section title="Activity" open><ActivityTimeline projectId={id!} reloadKey={reloadKey} /></Section>
                  <Section title="Brief"><BriefPanel detail={detail} onReload={reloadAll} /></Section>
                </div>
              </TabPanel>

              <TabPanel id="build" active={activeTab} visited={visited}>
                <div className="space-y-6">
                  <Section title="Workflow" open><WorkflowTab buildId={buildId} reloadKey={reloadKey} onChanged={reloadAll} publish={{ projectId: id!, store: repo?.themeLock?.store ?? null, themeName: repo?.themeLock?.themeName }} /></Section>
                  <Section title="Repo & files"><RepoPanel projectId={id!} reloadKey={reloadKey} /></Section>
                  <Section title="Preview">{dir && <PreviewPanel dir={dir} repo={repo} reloadKey={reloadKey} />}</Section>
                </div>
              </TabPanel>

              <TabPanel id="quality" active={activeTab} visited={visited}>
                <div className="space-y-6">
                  <Section title="Gates" open><GatesTab buildId={buildId} reloadKey={reloadKey} /></Section>
                  <Section title="Lens" info="The visual-truth gate (#18): captures the rendered theme and judges it with vision — catching layout, contrast and occlusion bugs the static gates miss.">{dir && <LensTab buildId={buildId} dir={dir} reloadKey={reloadKey} onChanged={reloadAll} />}</Section>
                  <Section title="Changes"><ChangesTab buildId={buildId} reloadKey={reloadKey} /></Section>
                </div>
              </TabPanel>

              <TabPanel id="specs" active={activeTab} visited={visited}>
                <div className="space-y-6">
                  <Section title="Docs" open><DocsTab buildId={buildId} reloadKey={reloadKey} /></Section>
                  <Section title="Design" info="The locked design-system contract — colors, type scale, spacing, buttons, brand voice. Theme sections bind to these tokens; the design-system gate enforces it."><DesignSystemTab buildId={buildId} reloadKey={reloadKey} /></Section>
                </div>
              </TabPanel>

              <TabPanel id="monitoring" active={activeTab} visited={visited}>
                <MonitoringPanel projectId={id!} reloadKey={reloadKey} />
              </TabPanel>
            </div>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  )
}
