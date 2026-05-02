import { useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell, TabNav } from '../components/PageShell'

const OverviewTab = lazy(() => import('./Analytics'))
const RunsTab = lazy(() => import('./RunHistory'))
const HealthTab = lazy(() => import('./AgentHealth'))
const GovernanceTab = lazy(() => import('./Governance'))

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'runs', label: 'Runs' },
  { id: 'health', label: 'Agent Health' },
  { id: 'governance', label: 'Governance' },
]

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function AnalyticsHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || 'overview'
  const [activeTab, setActiveTab] = useState(tabParam)

  useEffect(() => {
    setActiveTab(tabParam)
  }, [tabParam])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

  return (
    <PageShell title="Analytics" subtitle="Agent performance and run history">
      <TabNav tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <Suspense fallback={<Spinner />}>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'runs' && <RunsTab />}
        {activeTab === 'health' && <HealthTab />}
        {activeTab === 'governance' && <GovernanceTab />}
      </Suspense>
    </PageShell>
  )
}
