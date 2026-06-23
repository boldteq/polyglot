import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, FolderKanban } from 'lucide-react'
import { PageShell, TabNav } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import Collapsible from '../components/Collapsible'
import { InfoIcon } from '../components/Tooltip'
import ProjectHeader from '../components/workspace/ProjectHeader'
import ActivityTimeline from '../components/workspace/ActivityTimeline'
import BriefPanel from '../components/workspace/BriefPanel'
import MonitoringPanel from '../components/workspace/MonitoringPanel'
import RepoPanel from '../components/workspace/RepoPanel'
import PreviewPanel from '../components/workspace/PreviewPanel'
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
    getWorkspaceProject(id)
      .then((d) => {
        setDetail(d)
        if (d.hasBuild) getWorkspaceProjectRepo(id).then(setRepo).catch(() => setRepo(null))
      })
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
      title={detail ? detail.project.name : 'Project'}
      subtitle={detail ? `${detail.project.niche ? detail.project.niche + ' · ' : ''}${detail.hasBuild ? `step ${detail.build!.step.current}/18` : 'intake only'}` : 'Loading…'}
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
            <EmptyState icon={FolderKanban} title="No build linked yet" description="This project has intake only. Link a discovered theme folder, or dispatch an agent to start the build." />
          ) : buildId ? (
            <div>
              <TabNav tabs={tabs} active={activeTab} onChange={changeTab} />

              <TabPanel id="overview" active={activeTab} visited={visited}>
                <div className="space-y-6">
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
                <Section title="Monitoring" open><MonitoringPanel projectId={id!} reloadKey={reloadKey} /></Section>
              </TabPanel>
            </div>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  )
}
