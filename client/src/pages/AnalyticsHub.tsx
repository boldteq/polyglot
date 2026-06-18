import { useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell, TabNav } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'

const OverviewTab = lazy(() => import('./Analytics'))
const RunsTab = lazy(() => import('./RunHistory'))
const HealthTab = lazy(() => import('./AgentHealth'))
const GovernanceTab = lazy(() => import('./Governance'))
const ObservabilityTab = lazy(() => import('./Observability'))

// Tab ids are stable (used by ?tab= deep links + the /governance redirect);
// labels are free to be clearer. 'governance' → "Cost & Enforcement".
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'runs', label: 'Runs' },
  { id: 'health', label: 'Agent Health' },
  { id: 'governance', label: 'Cost & Enforcement' },
  { id: 'observability', label: 'Observability' },
]

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
    <PageShell title="Analytics" subtitle="Performance, runs, cost & enforcement, and observability for every agent">
      <TabNav tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <Suspense fallback={<Spinner />}>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'runs' && <RunsTab />}
        {activeTab === 'health' && <HealthTab />}
        {activeTab === 'governance' && <GovernanceTab />}
        {activeTab === 'observability' && <ObservabilityTab />}
      </Suspense>
    </PageShell>
  )
}
