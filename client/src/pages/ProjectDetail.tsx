import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  FileText,
  Terminal,
  ShieldCheck,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Clock,
  Pencil,
  Bot,
  MessageSquare,
} from 'lucide-react'
import {
  getProjectAgents,
  getProjectClaudeMd,
  updateProjectClaudeMd,
  getProjectCommands,
  getProjectRules,
  deleteProjectAgent,
  updateProjectAgent,
  updateProjectCommand,
  deleteProjectCommand,
  updateProjectRule,
  deleteProjectRule,
  sanitizeName,
} from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { ErrorState } from '../components/ErrorState'
import { toast } from '../components/Toast'
import { PageShell, TabNav } from '../components/PageShell'
import AgentIcon from '../components/AgentIcon'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { confirmDialog } from '../lib/confirm'

type Tab = 'overview' | 'claude-md' | 'agents' | 'commands' | 'rules'


export default function ProjectDetail() {
  const { projectId } = useParams()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: agents, error: agentsError, refetch: refetchAgents } = useApi(
    () => getProjectAgents(projectId!),
    [projectId],
    CacheKeys.projectAgents(projectId!),
  )
  const { data: claudeMd } = useApi(() => getProjectClaudeMd(projectId!), [projectId], CacheKeys.projectClaudeMd(projectId!))
  const { data: commands, refetch: refetchCommands } = useApi(() => getProjectCommands(projectId!), [projectId], CacheKeys.projectCommands(projectId!))
  const { data: rules, refetch: refetchRules } = useApi(() => getProjectRules(projectId!), [projectId], CacheKeys.projectRules(projectId!))

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'claude-md', label: 'CLAUDE.md' },
    { id: 'agents', label: 'Agents', count: agents?.length },
    { id: 'commands', label: 'Commands', count: commands?.length },
    { id: 'rules', label: 'Rules', count: rules?.length },
  ]

  const projectPath = projectId ? atob(projectId.replace(/-/g, '+').replace(/_/g, '/')) : ''
  const projectName = projectPath.split('/').pop() || ''

  return (
    <PageShell title={projectName} subtitle={projectPath.replace(/^\/Users\/[^/]+/, '~')}>
      <div className="max-w-5xl">
      <TabNav tabs={tabs} active={tab} onChange={(id) => setTab(id as Tab)} />

      {tab === 'overview' && (
        <OverviewTab
          agents={agents || []}
          commands={commands || []}
          rules={rules || []}
          hasClaudeMd={claudeMd?.exists || false}
          onTabChange={setTab}
        />
      )}
      {tab === 'claude-md' && <ClaudeMdTab projectId={projectId!} />}
      {tab === 'agents' && (
        <AgentsTab agents={agents || []} projectId={projectId!} refetch={refetchAgents} error={agentsError} />
      )}
      {tab === 'commands' && (
        <CommandsTab commands={commands || []} projectId={projectId!} refetch={refetchCommands} />
      )}
      {tab === 'rules' && (
        <RulesTab rules={rules || []} projectId={projectId!} refetch={refetchRules} />
      )}
      </div>
    </PageShell>
  )
}

function OverviewTab({
  agents,
  commands,
  rules,
  hasClaudeMd,
  onTabChange,
}: {
  agents: { name: string; description: string }[]
  commands: { name: string }[]
  rules: { name: string }[]
  hasClaudeMd: boolean
  onTabChange: (tab: Tab) => void
}) {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const stats = [
    { label: 'CLAUDE.md', value: hasClaudeMd ? 'Configured' : 'Not found', color: hasClaudeMd ? 'text-green' : 'text-text-muted', icon: FileText, onClick: () => onTabChange('claude-md') },
    { label: 'Agents', value: agents.length, color: 'text-purple', icon: Bot, onClick: () => onTabChange('agents') },
    { label: 'Commands', value: commands.length, color: 'text-amber', icon: Terminal, onClick: () => onTabChange('commands') },
    { label: 'Rules', value: rules.length, color: 'text-text-secondary', icon: ShieldCheck, onClick: () => onTabChange('rules') },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {stats.map((s) => (
          <button
            key={s.label}
            onClick={s.onClick}
            className="card p-5 flex items-start justify-between hover:border-accent/40 active:scale-[0.98] transition-all text-left"
          >
            <div>
              <p className="text-text-muted text-xs font-medium ">{s.label}</p>
              <p className={`text-2xl font-semibold mt-1 ${s.color}`}>{s.value}</p>
            </div>
            <div className={`p-2.5 rounded-lg bg-surface-2 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={() => navigate(`/projects/${projectId}/chat`)}
        className="w-full card p-5 flex items-center gap-4 hover:border-accent/40 active:scale-[0.99] transition-all text-left"
      >
        <div className="p-3 rounded-xl bg-accent/10 text-accent">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-semibold">Project Chat</p>
          <p className="text-xs text-text-muted mt-0.5">Chat with agents about this project — all conversations saved and searchable</p>
        </div>
      </button>
    </div>
  )
}

function ClaudeMdTab({ projectId }: { projectId: string }) {
  const { data, loading } = useApi(() => getProjectClaudeMd(projectId), [projectId], CacheKeys.projectClaudeMd(projectId))
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) {
      setContent(data.content)
      setDirty(false)
    }
  }, [data])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProjectClaudeMd(projectId, content)
      setDirty(false)
      toast('success', 'CLAUDE.md saved')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save CLAUDE.md')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <TabLoader />

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 240px)' }}>
      <div className="flex items-center justify-end mb-4 gap-2">
        {dirty && (
          <button
            onClick={() => { if (data) { setContent(data.content); setDirty(false) } }}
            className="btn-ghost btn-md"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="btn-primary btn-md"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => { setContent(e.target.value); setDirty(true) }}
        className="input flex-1 p-5 font-mono resize-none"
        spellCheck={false}
        placeholder="# Project CLAUDE.md&#10;&#10;Write project-specific instructions here..."
      />
    </div>
  )
}

function AgentsTab({
  agents,
  projectId,
  refetch,
  error,
}: {
  agents: { filename: string; name: string; description: string; model: string; updatedAt: string }[]
  projectId: string
  refetch: () => void
  error?: string | null
}) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())

  const handleCreate = async () => {
    if (!newName.trim()) return
    const slug = sanitizeName(newName)
    if (!slug) {
      toast('error', 'Invalid name — use letters, numbers, or hyphens')
      return
    }
    setCreateLoading(true)
    try {
      const template = `---\nname: ${newName.trim()}\ndescription: ""\nmodel: ""\n---\n\n# ${newName.trim()}\n\nWrite your agent instructions here.\n`
      await updateProjectAgent(projectId, slug, template, { createOnly: true })
      setCreating(false)
      setNewName('')
      navigate(`/projects/${projectId}/agents/${slug}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create agent'
      toast('error', msg)
      if (msg.includes('already exists')) {
        // Open the existing agent instead of clobbering it.
        setCreating(false); setNewName('')
        navigate(`/projects/${projectId}/agents/${slug}`)
      }
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (filename: string, displayName: string) => {
    if (!(await confirmDialog({ title: 'Delete agent?', message: `"${displayName}" will be permanently deleted.`, danger: true, confirmLabel: 'Delete' }))) return
    setDeletingKeys((prev) => new Set(prev).add(filename))
    try {
      await deleteProjectAgent(projectId, filename)
      refetch()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete agent')
    } finally {
      setDeletingKeys((prev) => { const s = new Set(prev); s.delete(filename); return s })
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setCreating(true)} className="btn-primary btn-md">
          <Plus className="w-4 h-4" /> New Agent
        </button>
      </div>

      {creating && (
        <div className="card p-5 mb-4">
          <p className="text-sm font-medium mb-3">Create New Agent</p>
          <div className="flex gap-3">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent name..." disabled={createLoading} className="input disabled:opacity-60" autoFocus onKeyDown={(e) => e.key === 'Enter' && !createLoading && handleCreate()} />
            <button onClick={handleCreate} disabled={createLoading} className="btn-primary btn-md">{createLoading ? 'Creating...' : 'Create'}</button>
            <button onClick={() => { setCreating(false); setNewName('') }} className="btn-ghost btn-md">Cancel</button>
          </div>
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : agents.length === 0 ? (
        <div className="card p-12 text-center">
          <Bot className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No agents in this project</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const display = formatAgentDisplay({ name: agent.name, id: agent.filename })
            return (
            <Link key={agent.filename} to={`/projects/${projectId}/agents/${agent.filename}`} className="group card card-hover p-5 flex items-center justify-between hover:border-accent/40">
              <div className="flex items-center gap-4">
                <AgentIcon name={agent.name} uid={`${projectId}-${agent.filename}`} size={44} />
                <div>
                  <h3 className="font-semibold text-base group-hover:text-accent-hover transition-colors">
                    {display.emoji && <span className="mr-1.5">{display.emoji}</span>}
                    <span>{display.realName}</span>
                    {display.role && <span className="text-text-muted font-normal"> — {display.role}</span>}
                  </h3>
                  {agent.description && <p className="text-sm text-text-secondary mt-0.5">{agent.description}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    {agent.model && <span className="text-xs text-text-muted bg-surface-2 px-2 py-0.5 rounded-md font-mono">{agent.model}</span>}
                    <span className="flex items-center gap-1 text-xs text-text-muted"><Clock className="w-3 h-3" />{new Date(agent.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(agent.filename, agent.name) }}
                disabled={deletingKeys.has(agent.filename)}
                aria-label={`Delete agent ${agent.name}`}
                className="p-2 rounded-lg text-text-muted hover:text-red hover:bg-red-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CommandsTab({
  commands,
  projectId,
  refetch,
}: {
  commands: { name: string; content: string; updatedAt?: string }[]
  projectId: string
  refetch: () => void
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())

  const handleCreate = async () => {
    if (!newName.trim()) return
    const slug = sanitizeName(newName)
    if (!slug) {
      toast('error', 'Invalid name — use letters, numbers, or hyphens')
      return
    }
    setCreateLoading(true)
    try {
      await updateProjectCommand(projectId, slug, `Describe what this command should do.\n\nUse $ARGUMENTS to accept user input.`)
      setCreating(false)
      setNewName('')
      navigate(`/projects/${projectId}/commands/${slug}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create command')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!(await confirmDialog({ title: 'Delete command?', message: `"/${name}" will be permanently deleted.`, danger: true, confirmLabel: 'Delete' }))) return
    setDeletingKeys((prev) => new Set(prev).add(name))
    try {
      await deleteProjectCommand(projectId, name)
      refetch()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete command')
    } finally {
      setDeletingKeys((prev) => { const s = new Set(prev); s.delete(name); return s })
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setCreating(true)} className="btn-primary btn-md">
          <Plus className="w-4 h-4" /> New Command
        </button>
      </div>

      {creating && (
        <div className="card p-5 mb-4">
          <p className="text-sm font-medium mb-3">Create New Command</p>
          <div className="flex gap-3">
            <div className="flex items-center bg-surface-2 border border-border rounded-lg px-3 text-sm text-text-muted">/</div>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="command-name" disabled={createLoading} className="input font-mono disabled:opacity-60" autoFocus onKeyDown={(e) => e.key === 'Enter' && !createLoading && handleCreate()} />
            <button onClick={handleCreate} disabled={createLoading} className="btn-primary btn-md">{createLoading ? 'Creating...' : 'Create'}</button>
            <button onClick={() => { setCreating(false); setNewName('') }} className="btn-ghost btn-md">Cancel</button>
          </div>
        </div>
      )}

      {commands.length === 0 ? (
        <div className="card p-12 text-center">
          <Terminal className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No commands in this project</p>
          <p className="text-text-muted text-sm mt-1">Create slash commands to automate common prompts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {commands.map((cmd) => (
            <div key={cmd.name} className="card overflow-hidden group">
              <div className="flex items-center justify-between px-4 py-3">
                <button onClick={() => setExpanded(expanded === cmd.name ? null : cmd.name)} className="flex items-center gap-3 flex-1 text-left">
                  <Terminal className="w-4 h-4 text-amber shrink-0" />
                  <span className="font-medium text-sm font-mono">/{cmd.name}</span>
                </button>
                <div className="flex items-center gap-1">
                  <Link to={`/projects/${projectId}/commands/${cmd.name}`} className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent-muted transition-colors opacity-0 group-hover:opacity-100">
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => handleDelete(cmd.name)}
                    disabled={deletingKeys.has(cmd.name)}
                    className="p-1.5 rounded-md text-text-muted hover:text-red hover:bg-red-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {expanded === cmd.name && (
                <div className="border-t border-border p-4 bg-surface-2">
                  <pre className="text-sm text-text-secondary font-mono whitespace-pre-wrap">{cmd.content}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RulesTab({
  rules,
  projectId,
  refetch,
}: {
  rules: { name: string; content: string; updatedAt?: string }[]
  projectId: string
  refetch: () => void
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set())

  const handleCreate = async () => {
    if (!newName.trim()) return
    const slug = sanitizeName(newName)
    if (!slug) {
      toast('error', 'Invalid name — use letters, numbers, or hyphens')
      return
    }
    setCreateLoading(true)
    try {
      await updateProjectRule(projectId, slug, `Describe the rule Claude must follow in this project.`)
      setCreating(false)
      setNewName('')
      navigate(`/projects/${projectId}/rules/${slug}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to create rule')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!(await confirmDialog({ title: 'Delete rule?', message: `"${name}" will be permanently deleted.`, danger: true, confirmLabel: 'Delete' }))) return
    setDeletingKeys((prev) => new Set(prev).add(name))
    try {
      await deleteProjectRule(projectId, name)
      refetch()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete rule')
    } finally {
      setDeletingKeys((prev) => { const s = new Set(prev); s.delete(name); return s })
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setCreating(true)} className="btn-primary btn-md">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {creating && (
        <div className="card p-5 mb-4">
          <p className="text-sm font-medium mb-3">Create New Rule</p>
          <div className="flex gap-3">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="rule-name (e.g. no-console-log)" disabled={createLoading} className="input font-mono disabled:opacity-60" autoFocus onKeyDown={(e) => e.key === 'Enter' && !createLoading && handleCreate()} />
            <button onClick={handleCreate} disabled={createLoading} className="btn-primary btn-md">{createLoading ? 'Creating...' : 'Create'}</button>
            <button onClick={() => { setCreating(false); setNewName('') }} className="btn-ghost btn-md">Cancel</button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="card p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary font-medium">No rules in this project</p>
          <p className="text-text-muted text-sm mt-1">Create rules to define constraints Claude must follow</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.name} className="card overflow-hidden group">
              <div className="flex items-center justify-between px-4 py-3">
                <button onClick={() => setExpanded(expanded === rule.name ? null : rule.name)} className="flex items-center gap-3 flex-1 text-left">
                  <ShieldCheck className="w-4 h-4 text-green shrink-0" />
                  <span className="font-medium text-sm">{rule.name}</span>
                </button>
                <div className="flex items-center gap-1">
                  <Link to={`/projects/${projectId}/rules/${rule.name}`} className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent-muted transition-colors opacity-0 group-hover:opacity-100">
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => handleDelete(rule.name)}
                    disabled={deletingKeys.has(rule.name)}
                    className="p-1.5 rounded-md text-text-muted hover:text-red hover:bg-red-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {expanded === rule.name && (
                <div className="border-t border-border p-4 bg-surface-2">
                  <pre className="text-sm text-text-secondary font-mono whitespace-pre-wrap">{rule.content}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabLoader() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
