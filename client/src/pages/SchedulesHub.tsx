import { useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell, TabNav } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'

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
    </PageShell>
  )
}
