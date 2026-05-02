import { useState } from 'react'
import { TabNav } from '../components/PageShell'
import AllCommands from './AllCommands'
import AllRules from './AllRules'

const TABS = [
  { id: 'commands', label: 'Commands' },
  { id: 'rules', label: 'Rules' },
]

export default function CommandsRulesTab() {
  const [tab, setTab] = useState('commands')

  return (
    <div>
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'commands' && <AllCommands />}
      {tab === 'rules' && <AllRules />}
    </div>
  )
}
