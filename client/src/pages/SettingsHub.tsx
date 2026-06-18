import { useState, useEffect, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageShell, TabNav } from '../components/PageShell'
import { Spinner } from '../components/Skeleton'

// Lazy-load tab panels — each loads only when its tab is selected
const GeneralTab = lazy(() => import('./Settings'))
const ClaudeMdTab = lazy(() => import('./GlobalClaudeMd'))
const CommandsRulesTab = lazy(() => import('./CommandsRulesTab'))
const TemplatesTab = lazy(() => import('./TemplateLibrary'))
const MemoryTab = lazy(() => import('./Memory'))
const BackupTab = lazy(() => import('./Backup'))
const DatabaseTab = lazy(() => import('./DatabaseExplorer'))
const TuningTab = lazy(() => import('./SettingsTuning'))

// Flat, calm tab row (the System/Knowledge clusters read cluttered). ids
// unchanged so ?tab= deep links still resolve.
const TABS = [
  { id: 'general', label: 'General' },
  { id: 'tuning', label: 'Tuning' },
  { id: 'claude-md', label: 'CLAUDE.md' },
  { id: 'memory', label: 'Memory' },
  { id: 'templates', label: 'Templates' },
  { id: 'commands', label: 'Commands & Rules' },
  { id: 'backup', label: 'Backup' },
  { id: 'database', label: 'Database' },
]

interface Props {
  onSave: () => void
}

export default function SettingsHub({ onSave }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || 'general'
  const [activeTab, setActiveTab] = useState(tabParam)

  useEffect(() => {
    setActiveTab(tabParam)
  }, [tabParam])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

  return (
    <PageShell title="Settings" subtitle="Configure Polyglot">
      <TabNav tabs={TABS} active={activeTab} onChange={handleTabChange} />
      <Suspense fallback={<Spinner />}>
        {activeTab === 'general' && <GeneralTab onSave={onSave} />}
        {activeTab === 'tuning' && <TuningTab />}
        {activeTab === 'claude-md' && <ClaudeMdTab />}
        {activeTab === 'commands' && <CommandsRulesTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'memory' && <MemoryTab />}
        {activeTab === 'backup' && <BackupTab />}
        {activeTab === 'database' && <DatabaseTab />}
      </Suspense>
    </PageShell>
  )
}
