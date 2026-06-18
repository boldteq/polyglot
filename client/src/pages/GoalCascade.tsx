import { useState, useEffect } from 'react'
import { Target, Plus, Trash2, Edit3, Check, X, ChevronDown, ChevronRight, Flag, AlertCircle, CheckCircle, Pause } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { confirmDialog } from '../lib/confirm'
import {
  getGoals, updateMission, createProjectGoal, deleteProjectGoal,
  createAgentGoal, updateAgentGoal, deleteAgentGoal, getGlobalAgents, getProjects, apiError} from '../lib/api'
import type { GoalCascade, AgentGoal } from '../lib/api'
import type { Agent, Project } from '../types'

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red/15 text-red border-red/30',
  medium: 'bg-yellow/15 text-yellow border-yellow/30',
  low: 'bg-green/15 text-green border-green/30',
}

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  active: Flag,
  completed: CheckCircle,
  paused: Pause,
}

// Single source for the agent-goal status → toggle-button color, instead of
// recomputing the same ternary inline for every row on every render.
function statusToggleClass(status: string): string {
  if (status === 'completed') return 'text-green'
  if (status === 'paused') return 'text-yellow'
  return 'text-text-muted hover:text-accent'
}

export default function GoalCascadePage() {
  const [goals, setGoals] = useState<GoalCascade>({ mission: '', missionDescription: '', projectGoals: [], agentGoals: [] })
  const [agents, setAgents] = useState<Agent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [editingMission, setEditingMission] = useState(false)
  const [missionDraft, setMissionDraft] = useState('')
  const [missionDescDraft, setMissionDescDraft] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showAgentForm, setShowAgentForm] = useState<string | null>(null)
  const [projectForm, setProjectForm] = useState({ projectId: '', goal: '', description: '', priority: 'medium' })
  const [agentForm, setAgentForm] = useState({ agentName: '', goal: '', description: '' })

  const load = () => {
    setLoading(true)
    Promise.all([getGoals(), getGlobalAgents(), getProjects()])
      .then(([g, a, p]) => {
        setGoals(g)
        setAgents(a)
        setProjects(p)
        if (g.projectGoals.length > 0) setExpandedProjects(new Set(g.projectGoals.map(pg => pg.id)))
      })
      .catch(err => apiError('Load goals', err))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleMissionSave = async () => {
    if (!missionDraft.trim()) return
    try {
      const updated = await updateMission(missionDraft.trim(), missionDescDraft.trim())
      setGoals(updated)
      setEditingMission(false)
    } catch (err) { apiError('Goal action', err) }
  }

  const handleProjectGoalCreate = async () => {
    if (!projectForm.projectId || !projectForm.goal) return
    const project = projects.find(p => p.id === projectForm.projectId)
    try {
      await createProjectGoal({
        projectId: projectForm.projectId,
        projectName: project?.name || projectForm.projectId,
        goal: projectForm.goal,
        description: projectForm.description,
        priority: projectForm.priority,
      })
      setShowProjectForm(false)
      setProjectForm({ projectId: '', goal: '', description: '', priority: 'medium' })
      load()
    } catch (err) { apiError('Goal action', err) }
  }

  const handleProjectGoalDelete = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete project goal?', message: 'This goal and all linked agent goals will be deleted.', danger: true, confirmLabel: 'Delete' }))) return
    try { await deleteProjectGoal(id); load() } catch (err) { apiError('Goal action', err) }
  }

  const handleAgentGoalCreate = async (projectGoalId: string) => {
    if (!agentForm.agentName || !agentForm.goal) return
    try {
      await createAgentGoal({
        agentName: agentForm.agentName,
        projectGoalId,
        goal: agentForm.goal,
        description: agentForm.description,
      })
      setShowAgentForm(null)
      setAgentForm({ agentName: '', goal: '', description: '' })
      load()
    } catch (err) { apiError('Goal action', err) }
  }

  const handleAgentGoalStatusToggle = async (ag: AgentGoal) => {
    const nextStatus = ag.status === 'active' ? 'completed' : ag.status === 'completed' ? 'paused' : 'active'
    try { await updateAgentGoal(ag.id, { status: nextStatus }); load() } catch (err) { apiError('Goal action', err) }
  }

  const handleAgentGoalDelete = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete agent goal?', message: 'This agent goal will be deleted.', danger: true, confirmLabel: 'Delete' }))) return
    try { await deleteAgentGoal(id); load() } catch (err) { apiError('Goal action', err) }
  }

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getAgentGoalsForProject = (projectGoalId: string) =>
    goals.agentGoals.filter(ag => ag.projectGoalId === projectGoalId)

  // True when the in-progress mission edit differs from the saved mission —
  // drives the "Unsaved changes" cue next to Save.
  const missionDirty =
    missionDraft.trim() !== (goals.mission ?? '').trim() ||
    missionDescDraft.trim() !== (goals.missionDescription ?? '').trim()

  if (loading) return <div className="p-8 text-text-muted">Loading goals...</div>

  return (
    <PageShell title="Goal Cascade" subtitle="Company mission flows down to project goals, then to agent objectives">
      <div className="max-w-4xl space-y-8">

      {/* Mission */}
      <div className="bg-surface rounded-2xl border-2 border-accent/20 overflow-hidden">
        <div className="px-5 py-3 bg-accent/5 border-b border-accent/10 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent" />
          <span className="text-[10px] font-bold text-accent">Company Mission</span>
        </div>
        {editingMission ? (
          <div className="p-5 space-y-3">
            <input
              value={missionDraft}
              onChange={e => setMissionDraft(e.target.value)}
              placeholder="Your company mission..."
              aria-label="Company mission"
              className="w-full px-4 py-3 text-lg font-semibold bg-surface-2 border border-border rounded-xl focus:border-accent outline-none"
              autoFocus
            />
            <textarea
              value={missionDescDraft}
              onChange={e => setMissionDescDraft(e.target.value)}
              placeholder="Description (optional)..."
              aria-label="Mission description"
              rows={2}
              className="w-full px-4 py-2.5 text-sm bg-surface-2 border border-border rounded-xl focus:border-accent outline-none resize-none"
            />
            <div className="flex items-center gap-2">
              <button onClick={handleMissionSave} className="btn-primary btn-sm">
                <Check className="w-3.5 h-3.5" /> Save
              </button>
              <button onClick={() => setEditingMission(false)} className="btn-secondary btn-sm">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              {missionDirty && (
                <span className="text-[10px] text-amber font-medium">Unsaved changes</span>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-label={goals.mission ? 'Edit company mission' : 'Set company mission'}
            className="w-full text-left p-5 cursor-pointer hover:bg-surface-2/30 transition-colors group"
            onClick={() => { setMissionDraft(goals.mission); setMissionDescDraft(goals.missionDescription); setEditingMission(true) }}
          >
            {goals.mission ? (
              <>
                <p className="text-lg font-semibold">{goals.mission}</p>
                {goals.missionDescription && <p className="text-sm text-text-muted mt-1">{goals.missionDescription}</p>}
                <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mt-2 inline-flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Click to edit
                </span>
              </>
            ) : (
              <div className="flex items-center gap-3 text-text-muted">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">No company mission set yet.</span>
                <span className="btn-primary btn-sm" aria-hidden>
                  <Flag className="w-3.5 h-3.5" /> Set Mission
                </span>
              </div>
            )}
          </button>
        )}
      </div>

      {/* Connector */}
      {goals.mission && (
        <div className="flex justify-center">
          <div className="w-[2px] h-8 bg-accent/20" />
        </div>
      )}

      {/* Project Goals */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue" />
            <span className="text-[10px] font-bold text-blue">Project Goals</span>
          </div>
          <button
            onClick={() => setShowProjectForm(!showProjectForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue/10 text-blue hover:bg-blue/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Goal
          </button>
        </div>

        {/* Project Goal Form */}
        {showProjectForm && (
          <div className="bg-surface rounded-xl border border-blue/20 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-text-muted font-medium mb-1 block">Project</label>
                <select
                  value={projectForm.projectId}
                  onChange={e => setProjectForm({ ...projectForm, projectId: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none"
                >
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-text-muted font-medium mb-1 block">Priority</label>
                <select
                  value={projectForm.priority}
                  onChange={e => setProjectForm({ ...projectForm, priority: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <input
              value={projectForm.goal}
              onChange={e => setProjectForm({ ...projectForm, goal: e.target.value })}
              placeholder="Project goal..."
              aria-label="Project goal"
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none"
            />
            <textarea
              value={projectForm.description}
              onChange={e => setProjectForm({ ...projectForm, description: e.target.value })}
              placeholder="Description (optional)..."
              aria-label="Project goal description"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent outline-none resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleProjectGoalCreate} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue text-white hover:bg-blue">
                Create Goal
              </button>
              <button onClick={() => setShowProjectForm(false)} className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 text-text-muted">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Project Goal List */}
        {goals.projectGoals.map(pg => {
          const agentGoals = getAgentGoalsForProject(pg.id)
          const isExpanded = expandedProjects.has(pg.id)
          const completedCount = agentGoals.filter(ag => ag.status === 'completed').length

          return (
            <div key={pg.id} className="card overflow-hidden">
              {/* Project Goal Header */}
              <div className="p-4 flex items-start gap-3">
                <button
                  onClick={() => toggleProject(pg.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} agent goals for ${pg.projectName}`}
                  className="mt-0.5 p-0.5 rounded hover:bg-surface-2 text-text-muted"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${PRIORITY_STYLES[pg.priority] || PRIORITY_STYLES.medium}`}>
                      {pg.priority}
                    </span>
                    <span className="text-xs text-text-muted">{pg.projectName}</span>
                  </div>
                  <p className="text-sm font-semibold">{pg.goal}</p>
                  {pg.description && <p className="text-xs text-text-muted mt-0.5">{pg.description}</p>}
                  {agentGoals.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green rounded-full transition-all"
                          style={{ width: `${agentGoals.length > 0 ? (completedCount / agentGoals.length) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted">{completedCount}/{agentGoals.length}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleProjectGoalDelete(pg.id)}
                  aria-label={`Delete project goal: ${pg.goal}`}
                  className="p-1.5 rounded-lg text-text-muted hover:text-red hover:bg-red/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Agent Goals */}
              {isExpanded && (
                <div className="border-t border-border bg-surface-2/30">
                  <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green" />
                      <span className="text-[10px] font-bold text-green">Agent Goals</span>
                    </div>
                    <button
                      onClick={() => setShowAgentForm(showAgentForm === pg.id ? null : pg.id)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-green/10 text-green hover:bg-green/20"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>

                  {/* Agent Goal Form */}
                  {showAgentForm === pg.id && (
                    <div className="px-4 pb-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={agentForm.agentName}
                          onChange={e => setAgentForm({ ...agentForm, agentName: e.target.value })}
                          aria-label="Select agent"
                          className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-lg focus:border-accent outline-none"
                        >
                          <option value="">Select agent...</option>
                          {agents.map(a => <option key={a.filename} value={a.filename}>{a.name}</option>)}
                        </select>
                        <input
                          value={agentForm.goal}
                          onChange={e => setAgentForm({ ...agentForm, goal: e.target.value })}
                          placeholder="Agent goal..."
                          aria-label="Agent goal"
                          className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-lg focus:border-accent outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAgentGoalCreate(pg.id)} className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-green text-white hover:bg-green">
                          Create
                        </button>
                        <button onClick={() => setShowAgentForm(null)} className="px-2.5 py-1 text-[10px] rounded-md bg-surface text-text-muted">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Agent Goal List */}
                  <div className="px-4 pb-3 space-y-1.5">
                    {agentGoals.map(ag => {
                      const StatusIcon = STATUS_ICONS[ag.status] || Flag
                      return (
                        <div key={ag.id} className="flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg hover:bg-surface/50 group">
                          <button
                            onClick={() => handleAgentGoalStatusToggle(ag)}
                            aria-label={`${ag.agentName} status: ${ag.status}. Click to cycle to the next status.`}
                            aria-pressed={ag.status === 'completed'}
                            title={`Status: ${ag.status} (click to cycle)`}
                            className={`p-0.5 rounded transition-transform hover:scale-110 ${statusToggleClass(ag.status)}`}
                          >
                            <StatusIcon className="w-3.5 h-3.5" />
                          </button>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded bg-surface-2 ${ag.status === 'completed' ? 'opacity-50' : ''}`}>
                            {ag.agentName}
                          </span>
                          <span className={`text-xs flex-1 ${ag.status === 'completed' ? 'text-text-muted line-through' : ''}`}>
                            {ag.goal}
                          </span>
                          <button
                            onClick={() => handleAgentGoalDelete(ag.id)}
                            aria-label={`Delete agent goal: ${ag.goal} for ${ag.agentName}`}
                            className="p-1 rounded text-text-muted hover:text-red opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                    {agentGoals.length === 0 && showAgentForm !== pg.id && (
                      <p className="text-[11px] text-text-muted py-2 text-center">No agent goals yet — assign work to agents</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {goals.projectGoals.length === 0 && !showProjectForm && (
          <div className="text-center py-8 text-text-muted">
            <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No project goals yet</p>
            <p className="text-xs mt-1">Set a mission first, then add project goals</p>
          </div>
        )}
      </div>
      </div>
    </PageShell>
  )
}
