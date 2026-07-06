import { useState, useEffect, lazy, Suspense, Component, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell, TabNav } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'
import { ErrorState } from '../components/ErrorState'

class TabErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return <ErrorState message={this.state.error.message} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}

const OverviewTab = lazy(() => import('./Analytics'))
const TrendsTab = lazy(() => import('./Trends'))
const HealthTab = lazy(() => import('./AgentHealth'))
const GovernanceTab = lazy(() => import('./Governance'))
const ObservabilityTab = lazy(() => import('./Observability'))

// Monitoring (LangSmith "Monitoring") — aggregate metrics over time. Per-run
// inspection moved to /tracing, so the old "runs" tab redirects there.
// Tab ids are stable (used by ?tab= deep links + the /governance redirect).
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trends', label: 'Trends' },
  { id: 'health', label: 'Agent Health' },
  { id: 'governance', label: 'Cost & Enforcement' },
  { id: 'observability', label: 'Observability' },
]

export default function Monitoring() {
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
    <PageShell title="Monitoring" subtitle="Performance, cost & enforcement, and observability trends across every agent">
      <TabNav tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <TabErrorBoundary>
        <Suspense fallback={<Spinner />}>
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'trends' && <TrendsTab />}
          {activeTab === 'health' && <HealthTab />}
          {activeTab === 'governance' && <GovernanceTab />}
          {activeTab === 'observability' && <ObservabilityTab />}
        </Suspense>
      </TabErrorBoundary>
    </PageShell>
  )
}
