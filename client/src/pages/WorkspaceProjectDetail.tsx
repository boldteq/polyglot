import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FolderKanban } from 'lucide-react'
import ProjectHeader from '../components/workspace/ProjectHeader'
import ProjectAnchorNav from '../components/workspace/ProjectAnchorNav'
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

const SECTIONS = [
  { id: 'activity', label: 'Activity' },
  { id: 'brief', label: 'Brief' },
  { id: 'repo', label: 'Repo & files' },
  { id: 'preview', label: 'Preview' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'gates', label: 'Gates' },
  { id: 'lens', label: 'Lens' },
  { id: 'changes', label: 'Changes' },
  { id: 'docs', label: 'Docs' },
  { id: 'design', label: 'Design' },
  { id: 'monitoring', label: 'Monitoring' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="text-[15px] font-semibold mb-2.5">{title}</h2>
      {children}
    </section>
  )
}

// Project detail — "everything in 1 panel": always-visible hero header, then a
// single scroll of anchored sections with a sticky jump-rail. Replaces the old
// 11-tab build detail. Reuses the section components (buildId + reloadKey).
export default function WorkspaceProjectDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [repo, setRepo] = useState<RepoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // section components key off the build + live SSE via useBuild
  const buildId = detail?.buildId || undefined
  const { reload: reloadBuild, reloadKey } = useBuild(buildId)
  const reloadAll = useCallback(() => { load(); reloadBuild() }, [load, reloadBuild])
  const dir = detail?.build?.dir

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
            <div className="flex gap-6 items-start">
              <aside className="w-44 shrink-0 hidden lg:block"><ProjectAnchorNav sections={SECTIONS} /></aside>
              <div className="flex-1 min-w-0 space-y-10">
                <Section id="activity" title="Activity"><ActivityTimeline projectId={id!} reloadKey={reloadKey} /></Section>
                <Section id="brief" title="Brief"><BriefPanel detail={detail} onReload={reloadAll} /></Section>
                <Section id="repo" title="Repo & files"><RepoPanel projectId={id!} reloadKey={reloadKey} /></Section>
                <Section id="preview" title="Preview">{dir && <PreviewPanel dir={dir} repo={repo} reloadKey={reloadKey} />}</Section>
                <Section id="workflow" title="Workflow"><WorkflowTab buildId={buildId} reloadKey={reloadKey} onChanged={reloadAll} publish={{ projectId: id!, store: repo?.themeLock?.store ?? null, themeName: repo?.themeLock?.themeName }} /></Section>
                <Section id="gates" title="Gates"><GatesTab buildId={buildId} reloadKey={reloadKey} /></Section>
                <Section id="lens" title="Lens">{dir && <LensTab buildId={buildId} dir={dir} reloadKey={reloadKey} onChanged={reloadAll} />}</Section>
                <Section id="changes" title="Changes"><ChangesTab buildId={buildId} reloadKey={reloadKey} /></Section>
                <Section id="docs" title="Docs"><DocsTab buildId={buildId} reloadKey={reloadKey} /></Section>
                <Section id="design" title="Design"><DesignSystemTab buildId={buildId} reloadKey={reloadKey} /></Section>
                <Section id="monitoring" title="Monitoring"><MonitoringPanel projectId={id!} reloadKey={reloadKey} /></Section>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  )
}
