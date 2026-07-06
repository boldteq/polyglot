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

const SchedulesTab = lazy(() => import('./Schedules'))
const WebhooksTab = lazy(() => import('./Webhooks'))

const TABS = [
  { id: 'schedules', label: 'Schedules' },
  { id: 'webhooks', label: 'Webhooks' },
]

export default function SchedulesHub() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || 'schedules'
  const [activeTab, setActiveTab] = useState(tabParam)
  const [mounted, setMounted] = useState<Record<string, boolean>>({ [tabParam]: true })

  useEffect(() => {
    setActiveTab(tabParam)
    setMounted(prev => prev[tabParam] ? prev : { ...prev, [tabParam]: true })
  }, [tabParam])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setMounted(prev => prev[tab] ? prev : { ...prev, [tab]: true })
    setSearchParams({ tab }, { replace: true })
  }

  return (
    <PageShell title="Automation" subtitle="Schedules and webhooks">
      <TabNav tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <TabErrorBoundary>
        {mounted.schedules && (
          <div className={activeTab === 'schedules' ? '' : 'hidden'}>
            <Suspense fallback={<Spinner />}>
              <SchedulesTab />
            </Suspense>
          </div>
        )}
        {mounted.webhooks && (
          <div className={activeTab === 'webhooks' ? '' : 'hidden'}>
            <Suspense fallback={<Spinner />}>
              <WebhooksTab />
            </Suspense>
          </div>
        )}
      </TabErrorBoundary>
    </PageShell>
  )
}
