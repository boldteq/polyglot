import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, RefreshCw, AlertTriangle, Eye } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'
import ScoreGauge from '../components/workspace/ScoreGauge'
import StepIndicator from '../components/workspace/StepIndicator'
import VerdictPill from '../components/workspace/VerdictPill'
import BuildOverviewTab from '../components/workspace/BuildOverviewTab'
import PipelineTab from '../components/workspace/PipelineTab'
import GatesTab from '../components/workspace/GatesTab'
import LensTab from '../components/workspace/LensTab'
import ChangesTab from '../components/workspace/ChangesTab'
import AgentsTab from '../components/workspace/AgentsTab'
import SchedulesTab from '../components/workspace/SchedulesTab'
import ResultsTab from '../components/workspace/ResultsTab'
import FilesTab from '../components/workspace/FilesTab'
import { useBuild } from '../hooks/useBuild'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'gates', label: 'Gates' },
  { id: 'lens', label: 'Lens' },
  { id: 'changes', label: 'CHANGES' },
  { id: 'agents', label: 'Agents' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'results', label: 'Results' },
  { id: 'files', label: 'Files' },
] as const

export default function WorkspaceBuildDetail() {
  const { buildId } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const { data, loading, error, reload, reloadKey } = useBuild(buildId)

  const setTab = (id: string) => { params.set('tab', id); setParams(params, { replace: true }) }

  return (
    <PageShell
      title={data ? data.build.client : 'Build'}
      subtitle={data ? `${data.build.platform} · step ${data.build.step.current}/18` : 'Build detail'}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => nav('/workspace/builds')} className="btn-ghost btn-sm flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" />Back</button>
          <button onClick={reload} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>
        </div>
      }
    >
      {loading && !data ? <Spinner /> : error ? (
        <div className="card p-6 text-red flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{error}
          <button onClick={reload} className="underline ml-2">Retry</button></div>
      ) : data ? (
        <div className="space-y-5">
          {/* header card — always visible */}
          <div className="card p-5 flex items-center gap-5 flex-wrap">
            <ScoreGauge score={data.build.score} grade={data.build.grade} size={80} stroke={8} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <VerdictPill verdict={data.build.lensVerdict} blockers={data.build.gates.blockersOpen} />
                <span className="text-[12px] text-text-muted">{data.build.grade}</span>
              </div>
              <StepIndicator current={data.build.step.current} total={data.build.step.total} />
              <div className="flex flex-wrap gap-4 mt-3 text-[13px]">
                <span><b>{data.build.gates.passed}/{data.build.gates.total}</b> <span className="text-text-muted">gates</span></span>
                <span><b>{data.build.gates.blockersOpen}</b> <span className="text-text-muted">blockers</span></span>
                {data.build.changes.present && <span><b>{data.build.changes.rate}%</b> <span className="text-text-muted">changes</span></span>}
              </div>
            </div>
            <button onClick={() => nav(`/workspace/lens?dir=${encodeURIComponent(data.build.dir)}`)} className="btn-primary btn-sm flex items-center gap-1.5 shrink-0">
              <Eye className="w-4 h-4" /> Open Lens
            </button>
          </div>

          {/* tabs */}
          <div className="flex gap-1.5 border-b border-border">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${tab === t.id ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* tab body */}
          {tab === 'overview' && <BuildOverviewTab detail={data} />}
          {tab === 'pipeline' && buildId && <PipelineTab buildId={buildId} reloadKey={reloadKey} />}
          {tab === 'gates' && buildId && <GatesTab buildId={buildId} reloadKey={reloadKey} />}
          {tab === 'lens' && <LensTab dir={data.build.dir} reloadKey={reloadKey} />}
          {tab === 'changes' && buildId && <ChangesTab buildId={buildId} reloadKey={reloadKey} />}
          {tab === 'agents' && buildId && <AgentsTab buildId={buildId} reloadKey={reloadKey} />}
          {tab === 'schedules' && buildId && <SchedulesTab buildId={buildId} reloadKey={reloadKey} />}
          {tab === 'results' && buildId && <ResultsTab buildId={buildId} reloadKey={reloadKey} />}
          {tab === 'files' && buildId && <FilesTab buildId={buildId} reloadKey={reloadKey} />}
        </div>
      ) : null}
    </PageShell>
  )
}
