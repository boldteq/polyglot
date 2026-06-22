import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Users,
  UserCheck,
  UserX,
  GraduationCap,
  Shield,
  TrendingUp,
  TrendingDown,
  Loader,
  RefreshCw,
  ChevronRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  Brain,
  Crown,
  X,
  Target,
  Calendar,
  CheckSquare,
  Square,
  History,
  Wrench,
  Undo2,
  Layers,
} from 'lucide-react'
import {
  getHrRegistry,
  getHrSnapshot,
  getHrTrainingQueue,
  promoteAgent as promoteAgentApi,
  openAgentPip,
  retireAgent,
  runWitnessSweep,
  runCadenceReview as runCadenceReviewApi,
  recomputeExperience,
  detectCapabilityGap,
  updateOrgAgent,
  undoOrgChange,
  undoOrgBatch,
  getOrgHistory,
  getConsolidationReport,
  type AgentRecord,
  type TrainingQueueItem,
  type HistoryEntry,
  type DriftData,
  type ConsolidationReport,
} from '../lib/api'
import { onOrgChartEvent } from '../lib/sseBus'
import { confirmDialog } from '../lib/confirm'
import { useApi } from '../hooks/useApi'
import { useDrift } from '../hooks/useDrift'
import { CacheKeys } from '../lib/cacheKeys'
import { toast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import LevelBadge from '../components/LevelBadge'
import ExperienceBar from '../components/ExperienceBar'
import { useTaxonomy } from '../hooks/useTaxonomy'
import { formatAgentDisplay } from '../lib/agentDisplay'
import { useAgentBulkActions } from '../hooks/useAgentBulkActions'
import { AGENT_STATUSES } from '../lib/constants'
import { statusPill, statusText, priorityIntent, type Intent } from '../lib/colors'

type Tab = 'registry' | 'reviews' | 'training' | 'gap-scanner' | 'drift' | 'history' | 'consolidation'

export default function HrPage() {
  const { data: registry, loading, refetch: refetchRegistry } = useApi(getHrRegistry, [], CacheKeys.hrRegistry)
  const [tab, setTab] = useState<Tab>('registry')
  const [selectedAgent, setSelectedAgent] = useState<AgentRecord | null>(null)
  // Registry + drift refetch on agent mutations is handled centrally by
  // initCacheInvalidation() — no per-page SSE connection needed.
  const { drift, refetch: refetchDrift } = useDrift()
  const driftCount = drift?.onlyOnDisk.length || 0

  if (loading && !registry) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <Loader className="w-5 h-5 animate-spin mr-2" />
        Loading HR registry...
      </div>
    )
  }

  if (!registry) {
    return <div className="p-8 text-red">Failed to load HR registry</div>
  }

  const counts = registry.counts ?? {
    total: registry.agents.length,
    active: registry.agents.filter((a) => a.status === 'active').length,
    probation: registry.agents.filter((a) => a.status === 'probation').length,
    pip: registry.agents.filter((a) => a.status === 'pip').length,
    pending: registry.agents.filter((a) => a.status === 'pending').length,
    retired: registry.agents.filter((a) => a.status === 'retired').length,
  }
  const activeCount = counts.active
  const probationCount = counts.probation
  const pipCount = counts.pip
  const pendingCount = counts.pending
  const retiredCount = counts.retired

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange/20 to-amber/20 ring-1 ring-orange/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-orange" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">HR — People Operations</h1>
              <p className="text-[11px] text-text-muted">
                Registry, onboarding, training, accountability, and agent evolution
              </p>
            </div>
          </div>

          {/* Stats chips — all computed from registry.agents (single source) */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatChip icon={UserCheck} label="Active" value={activeCount} tone="emerald" />
            {probationCount > 0 && (
              <StatChip icon={GraduationCap} label="Probation" value={probationCount} tone="amber" />
            )}
            {pipCount > 0 && (
              <StatChip icon={AlertTriangle} label="PIP" value={pipCount} tone="red" />
            )}
            {pendingCount > 0 && (
              <StatChip icon={Loader} label="Pending" value={pendingCount} tone="blue" />
            )}
            {retiredCount > 0 && (
              <StatChip icon={UserX} label="Retired" value={retiredCount} tone="zinc" />
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div role="tablist" aria-orientation="horizontal" aria-label="HR sections" className="segmented mt-5 w-fit">
          <TabButton id="registry" active={tab === 'registry'} onClick={() => setTab('registry')}>
            <Users className="w-3.5 h-3.5" /> Registry
          </TabButton>
          <TabButton id="reviews" active={tab === 'reviews'} onClick={() => setTab('reviews')}>
            <Calendar className="w-3.5 h-3.5" /> Reviews
          </TabButton>
          <TabButton id="training" active={tab === 'training'} onClick={() => setTab('training')}>
            <GraduationCap className="w-3.5 h-3.5" /> Training Queue
          </TabButton>
          <TabButton id="gap-scanner" active={tab === 'gap-scanner'} onClick={() => setTab('gap-scanner')}>
            <Target className="w-3.5 h-3.5" /> Capability Scanner
          </TabButton>
          <TabButton id="drift" active={tab === 'drift'} onClick={() => setTab('drift')}>
            <Wrench className="w-3.5 h-3.5" /> Drift Fixer
            {driftCount > 0 && (
              <span className="ml-1 bg-amber text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none">{driftCount}</span>
            )}
          </TabButton>
          <TabButton id="history" active={tab === 'history'} onClick={() => setTab('history')}>
            <History className="w-3.5 h-3.5" /> History
          </TabButton>
          <TabButton id="consolidation" active={tab === 'consolidation'} onClick={() => setTab('consolidation')}>
            <Layers className="w-3.5 h-3.5" /> Consolidation
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {tab === 'registry' && (
          <RegistryTab
            agents={registry.agents}
            onSelectAgent={setSelectedAgent}
            onRefresh={refetchRegistry}
          />
        )}
        {tab === 'reviews' && <ReviewsTab onRefresh={refetchRegistry} />}
        {tab === 'training' && <TrainingTab />}
        {tab === 'gap-scanner' && <CapabilityScannerTab />}
        {tab === 'drift' && <DriftFixerTab drift={drift} agents={registry.agents} onRefresh={() => { refetchRegistry(); refetchDrift() }} />}
        {tab === 'history' && <HistoryTab onRefresh={refetchRegistry} />}
        {tab === 'consolidation' && <ConsolidationTab />}
      </div>

      {/* Side panel */}
      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onRefresh={() => {
            refetchRegistry()
            setSelectedAgent(null)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Registry Tab
// ─────────────────────────────────────────────────────────────────────────────

function RegistryTab({
  agents,
  onSelectAgent,
  onRefresh,
}: {
  agents: AgentRecord[]
  onSelectAgent: (a: AgentRecord) => void
  onRefresh: () => void
}) {
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [squadFilter, setSquadFilter] = useState<string | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const { squads: SQUADS } = useTaxonomy()

  const departments = useMemo(() => {
    const set = new Set<string>()
    agents.forEach((a) => a.department && set.add(a.department))
    return Array.from(set).sort()
  }, [agents])

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (deptFilter && a.department !== deptFilter) return false
      if (statusFilter && a.status !== statusFilter) return false
      if (squadFilter && a.squad !== squadFilter) return false
      if (query) {
        const q = query.toLowerCase()
        return (
          a.id.toLowerCase().includes(q) ||
          a.title.toLowerCase().includes(q) ||
          (a.name || '').toLowerCase().includes(q) ||
          Object.keys(a.skills || {}).some((s) => s.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [agents, query, deptFilter, statusFilter, squadFilter])

  const {
    selectedIds,
    bulkBusy,
    squadPickerFor,
    setSquadPickerFor,
    toggleSel,
    selectAll,
    clearSel,
    setAgentSquad,
    bulkApply,
  } = useAgentBulkActions(filtered, (a) => a.id, onRefresh)

  // Close picker on outside click
  useEffect(() => {
    if (!squadPickerFor) return
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setSquadPickerFor(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [squadPickerFor])

  const handleRecompute = async () => {
    if (!(await confirmDialog({
      title: 'Recompute all agent experience?',
      message: "Recalculates every agent's level, years-of-experience and experience points from their full run history. Idempotent + safe, but it rewrites all experience metrics and can take a few seconds.",
      confirmLabel: 'Recompute',
    }))) return
    setRecomputing(true)
    try {
      const res = await recomputeExperience()
      toast('success', `Recomputed ${res.updated}/${res.total} agents in ${res.durationMs}ms`)
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Recompute failed')
    } finally {
      setRecomputing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — search left, filters + actions grouped right */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, title, or skill..."
            aria-label="Search agents by name, title, or skill"
            className="input pl-9 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <select
            value={deptFilter || ''}
            onChange={(e) => setDeptFilter(e.target.value || null)}
            aria-label="Filter by department"
            className="input w-auto text-xs"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={statusFilter || ''}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            aria-label="Filter by status"
            className="input w-auto text-xs"
          >
            <option value="">All statuses</option>
            {AGENT_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
          <select
            value={squadFilter || ''}
            onChange={(e) => setSquadFilter(e.target.value || null)}
            aria-label="Filter by squad"
            className="input w-auto text-xs"
          >
            <option value="">All squads</option>
            {SQUADS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
          </select>
          <div className="h-5 w-px bg-border-subtle" />
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            title="Recompute experience levels"
            className="btn-primary btn-sm"
          >
            {recomputing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
            Recompute
          </button>
        </div>
      </div>

      {/* Bulk action bar — pinned above the table while rows are selected */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 bg-accent/10 border border-accent/25 rounded-xl px-4 py-3 shadow-soft flex items-center gap-x-3 gap-y-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <CheckSquare className="w-3.5 h-3.5" />
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <span className="text-[11px] text-text-muted font-medium">Squad</span>
          {SQUADS.map(sq => (
            <button
              key={sq.id}
              onClick={() => bulkApply({ squad: sq.id }, sq.label)}
              disabled={bulkBusy}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all hover:opacity-80 disabled:opacity-40"
              style={{ background: `${sq.color}20`, color: sq.color, borderColor: `${sq.color}50` }}
            >
              {sq.emoji} {sq.label}
            </button>
          ))}
          <div className="h-4 w-px bg-border" />
          <span className="text-[11px] text-text-muted font-medium">Status</span>
          {AGENT_STATUSES.map(s => (
            <button key={s} onClick={() => bulkApply({ status: s }, s)} disabled={bulkBusy}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 hover:bg-surface-3 capitalize disabled:opacity-40">{s}</button>
          ))}
          <div className="ml-auto flex items-center gap-3 pl-2">
            <button onClick={selectAll} className="text-[11px] font-medium text-accent hover:underline">Select all {filtered.length}</button>
            <button onClick={clearSel} className="text-[11px] text-text-muted hover:text-text">Clear</button>
          </div>
        </div>
      )}

      {/* Registry table */}
      <div className="card overflow-hidden">
        <div className="divide-y divide-border-subtle">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-text-muted text-sm">
              {agents.length === 0
                ? 'No agents in registry'
                : 'No agents match your filters'}
            </div>
          ) : (
            filtered.map((a) => (
              <AgentRow
                key={a.id}
                agent={a}
                selected={selectedIds.has(a.id)}
                onToggleSelect={() => toggleSel(a.id)}
                onSquadClick={(e) => { e.stopPropagation(); setSquadPickerFor(a.id) }}
                squadPickerOpen={squadPickerFor === a.id}
                squadPickerRef={squadPickerFor === a.id ? pickerRef : undefined}
                onSquadSelect={(s) => setAgentSquad(a.id, a.name || a.id, s)}
                onClick={() => onSelectAgent(a)}
              />
            ))
          )}
        </div>
      </div>

      <p className="text-[10px] text-text-muted text-center">
        {filtered.length} of {agents.length} agents · click a row for full profile
      </p>
    </div>
  )
}

function AgentRow({
  agent, onClick, selected, onToggleSelect, onSquadClick, squadPickerOpen, squadPickerRef, onSquadSelect,
}: {
  agent: AgentRecord
  onClick: () => void
  selected: boolean
  onToggleSelect: () => void
  onSquadClick: (e: React.MouseEvent) => void
  squadPickerOpen: boolean
  squadPickerRef?: React.RefObject<HTMLDivElement | null>
  onSquadSelect: (s: string | null) => void
}) {
  const { squads: SQUADS, squadById: SQUAD_BY_ID } = useTaxonomy()
  const topSkills = Object.entries(agent.skills || {})
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 3)
  const sq = agent.squad ? SQUAD_BY_ID[agent.squad] : null

  return (
    <div className={`relative flex items-center gap-3 px-5 h-[54px] transition-colors group ${selected ? 'bg-accent/5' : 'hover:bg-surface-2/40'}`}>
      {/* Bulk-select checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect() }}
        aria-label={selected ? `Deselect ${agent.name || agent.id}` : `Select ${agent.name || agent.id}`}
        className={`shrink-0 p-1 rounded-md transition-all ${selected ? 'text-accent opacity-100' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-accent'}`}
      >
        {selected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
      </button>

      <button onClick={onClick} className="flex-1 text-left flex items-center gap-3 min-w-0">
        {/* Name + title — uses shared formatter for consistency across pages */}
        <div className="w-48 min-w-0">
          {(() => {
            const d = formatAgentDisplay({ name: agent.name, title: agent.title, description: '', id: agent.id })
            return (
              <>
                <div className="font-semibold text-sm truncate">
                  {d.emoji && <span className="mr-1">{d.emoji}</span>}
                  {d.realName}
                </div>
                <div className="text-[10px] text-text-muted truncate">{d.role || agent.title}</div>
              </>
            )
          })()}
        </div>

        {/* Level badge */}
        <div className="w-32 shrink-0">
          <LevelBadge
            level={agent.level}
            title={agent.levelTitle}
            status={agent.status}
            yearsOfExperience={agent.yearsOfExperience}
            showYoE={true}
            size="sm"
          />
        </div>

        {/* Department */}
        <div className="w-24 shrink-0 text-[10px] text-text-muted font-semibold">
          {agent.department}
        </div>

        {/* Top skills */}
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
          {topSkills.map(([name, data]) => (
            <span
              key={name}
              className="text-[9px] px-1.5 py-0.5 rounded-md bg-surface-2 text-text-secondary font-mono truncate shrink-0"
              title={`${name}: ${Math.round(data.score * 100)}%`}
            >
              {name} {Math.round(data.score * 100)}
            </span>
          ))}
          {agent.weaknesses && agent.weaknesses.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber/10 text-amber font-mono shrink-0">
              {agent.weaknesses.length} weak
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="w-20 shrink-0 text-right text-[10px] text-text-muted font-mono">
          {agent.stats?.totalRuns || 0} runs
        </div>
      </button>

      {/* Squad badge — clickable */}
      <button
        onClick={onSquadClick}
        className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-opacity hover:opacity-80"
        style={sq
          ? { background: `${sq.color}26`, color: sq.color }
          : { background: 'transparent', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)' }
        }
        title={sq ? `Squad: ${sq.label} — click to change` : 'Click to assign squad'}
      >
        {sq ? `${sq.emoji} ${sq.label}` : '+ squad'}
      </button>

      <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />

      {/* Squad picker popover */}
      {squadPickerOpen && (
        <div
          ref={squadPickerRef}
          className="absolute z-50 top-full right-12 mt-1 bg-surface border border-border rounded-xl shadow-pop p-2 min-w-[220px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] text-text-muted font-semibold px-2 py-1">Assign Squad</div>
          {SQUADS.map(s => {
            const active = agent.squad === s.id
            return (
              <button
                key={s.id}
                onClick={(e) => { e.stopPropagation(); onSquadSelect(active ? null : s.id) }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${active ? 'bg-accent/10' : 'hover:bg-surface-2'}`}
              >
                <span style={{ color: s.color }}>{s.emoji}</span>
                <span className="flex-1 font-medium">{s.label}</span>
                {active && <CheckCircle2 className="w-3 h-3 text-accent" />}
              </button>
            )
          })}
          {agent.squad && (
            <>
              <div className="border-t border-border my-1" />
              <button
                onClick={(e) => { e.stopPropagation(); onSquadSelect(null) }}
                className="w-full px-2 py-1.5 rounded-md text-xs text-left text-red hover:bg-red/10"
              >
                Remove from squad
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Agent Detail Panel
// ─────────────────────────────────────────────────────────────────────────────

function AgentDetailPanel({
  agent,
  onClose,
  onRefresh,
}: {
  agent: AgentRecord
  onClose: () => void
  onRefresh: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [pipModalOpen, setPipModalOpen] = useState(false)
  const [pipReason, setPipReason] = useState('')
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false)

  const handlePromote = async () => {
    setBusy(true)
    setPromoteConfirmOpen(false)
    try {
      const res = await promoteAgentApi(agent.id)
      if (res.ok) {
        toast('success', `Promoted to ${res.agent?.levelTitle}`)
        onRefresh()
      } else {
        toast('error', res.error || 'Promotion failed')
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Promotion failed')
    } finally {
      setBusy(false)
    }
  }

  const handlePip = async () => {
    if (!pipReason.trim()) return
    setBusy(true)
    setPipModalOpen(false)
    try {
      const res = await openAgentPip(agent.id, pipReason.trim())
      if (res.ok) {
        toast('success', 'PIP opened — 14-day window started')
        setPipReason('')
        onRefresh()
      } else {
        toast('error', res.error || 'PIP failed')
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'PIP failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md h-full bg-surface border-l border-border shadow-pop overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — avatar + name + role + level/status badge */}
        <div className="px-5 py-4 border-b border-border sticky top-0 bg-surface z-10">
          <div className="flex items-start gap-3">
            {(() => {
              const d = formatAgentDisplay({ name: agent.name, title: agent.title, id: agent.id })
              return (
                <>
                  <div className="w-11 h-11 rounded-xl bg-surface-2 ring-1 ring-border-subtle flex items-center justify-center text-xl shrink-0">
                    {d.emoji || '🤖'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold truncate leading-tight">{d.realName}</h3>
                    <p className="text-xs text-text-muted truncate">{d.role || agent.title}</p>
                    <div className="mt-2">
                      <LevelBadge
                        level={agent.level}
                        title={agent.levelTitle}
                        status={agent.status}
                        yearsOfExperience={agent.yearsOfExperience}
                        showYoE={true}
                        size="md"
                      />
                    </div>
                  </div>
                </>
              )
            })()}
            <button
              onClick={onClose}
              aria-label="Close agent detail panel"
              className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Experience bar */}
          <div>
            <h4 className="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-2">Experience</h4>
            <ExperienceBar
              level={agent.level}
              yearsOfExperience={agent.yearsOfExperience}
              progressToNext={agent.progressToNext}
              nextLevelTitle={agent.nextLevelTitle}
            />
          </div>

          {/* Breakdown */}
          {agent.breakdown && (
            <div>
              <h4 className="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-2">YoE breakdown</h4>
              <div className="space-y-1 text-xs">
                <BreakdownRow label="Training content" value={agent.breakdown.training} />
                <BreakdownRow label="Tenure" value={agent.breakdown.tenure} />
                <BreakdownRow label="Runs" value={agent.breakdown.runs} />
                <BreakdownRow label="Success bonus" value={agent.breakdown.success} />
                <BreakdownRow label="Patterns contributed" value={agent.breakdown.patterns} />
                <BreakdownRow label="Antipatterns" value={agent.breakdown.antipatterns} negative />
              </div>
            </div>
          )}

          {/* Stats */}
          {agent.stats && (
            <div>
              <h4 className="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-2">Stats</h4>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Total runs" value={String(agent.stats.totalRuns)} />
                <MiniStat label="Success rate" value={`${Math.round(agent.stats.successRate * 100)}%`} />
                <MiniStat label="File size" value={`${agent.stats.fileSizeKb} KB`} />
                <MiniStat label="Age" value={`${agent.stats.ageDays}d`} />
                <MiniStat label="Patterns" value={String(agent.stats.patternsContributed)} />
                <MiniStat label="Antipatterns" value={String(agent.stats.antipatternsTriggered)} />
              </div>
            </div>
          )}

          {/* Skills */}
          {agent.skills && Object.keys(agent.skills).length > 0 && (
            <div>
              <h4 className="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-2">Skills</h4>
              <div className="space-y-1.5">
                {Object.entries(agent.skills)
                  .sort(([, a], [, b]) => b.score - a.score)
                  .map(([name, data]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-xs font-mono w-24 truncate">{name}</span>
                      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent/60 rounded-full"
                          style={{ width: `${data.score * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-text-muted font-mono w-10 text-right">
                        {Math.round(data.score * 100)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Weaknesses */}
          {agent.weaknesses && agent.weaknesses.length > 0 && (
            <div>
              <h4 className="text-[10px] text-amber font-semibold uppercase tracking-wide mb-2">Weaknesses</h4>
              <div className="flex flex-wrap gap-1">
                {agent.weaknesses.map((w) => (
                  <span
                    key={w}
                    className="text-[10px] px-2 py-0.5 rounded bg-amber/10 text-amber font-mono"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reporting line */}
          <div>
            <h4 className="text-[10px] text-text-muted font-semibold uppercase tracking-wide mb-2">Reporting</h4>
            <div className="text-xs space-y-1">
              {agent.reportsTo && (
                <div>Reports to <span className="font-semibold text-accent">{agent.reportsTo}</span></div>
              )}
              {agent.directReports && agent.directReports.length > 0 && (
                <div className="text-text-muted">
                  {agent.directReports.length} direct report{agent.directReports.length !== 1 ? 's' : ''}
                </div>
              )}
              <div className="text-text-muted">
                Department: <span className="text-text font-mono">{agent.department}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions — footer row */}
        <div className="px-5 py-3.5 border-t border-border sticky bottom-0 bg-surface flex items-center gap-2">
          <button
            onClick={() => setPromoteConfirmOpen(true)}
            disabled={busy || agent.level >= 8 || agent.status === 'retired'}
            title={
              agent.level >= 8 ? 'Already at the top level (Fellow)'
              : agent.status === 'retired' ? 'Retired agents cannot be promoted'
              : `Promote to ${agent.nextLevelTitle || 'next level'}`
            }
            className="btn-primary btn-sm"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Promote
          </button>
          {agent.status !== 'pip' && agent.status !== 'retired' && (
            <button
              onClick={() => setPipModalOpen(true)}
              disabled={busy}
              className="btn-secondary btn-sm text-red border-red/30 hover:bg-red/10 hover:text-red"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Open PIP
            </button>
          )}
        </div>

        {/* PIP inline modal — high-consequence: 14-day window, reason required + logged */}
        {pipModalOpen && (
          <div className="mx-5 mb-4 p-4 bg-red-muted border border-red/20 rounded-xl space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red leading-relaxed">
                Open a Performance Improvement Plan for {agent.name || agent.id}. This starts a
                14-day window and is logged to the agent's history.
              </p>
            </div>
            <textarea
              value={pipReason}
              onChange={e => setPipReason(e.target.value)}
              placeholder="Describe the performance concern (required)..."
              rows={3}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handlePip}
                disabled={!pipReason.trim() || busy}
                className="px-3 py-1.5 text-xs font-semibold bg-red text-white rounded-lg hover:bg-red/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Confirm PIP
              </button>
              <button
                onClick={() => { setPipModalOpen(false); setPipReason('') }}
                className="px-3 py-1.5 text-xs font-semibold bg-surface-2 text-text-secondary rounded-lg hover:bg-surface-3 hover:text-text transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Promote confirmation */}
      <ConfirmDialog
        open={promoteConfirmOpen}
        onClose={() => setPromoteConfirmOpen(false)}
        onConfirm={handlePromote}
        title={`Promote ${agent.name || agent.id}?`}
        message={`This advances ${agent.name || agent.id} to ${agent.nextLevelTitle || 'the next level'} and is logged to the agent's history.`}
        confirmLabel="Promote"
        loading={busy}
      />
    </div>
  )
}

function BreakdownRow({ label, value, negative = false }: { label: string; value: number; negative?: boolean }) {
  const display = value === 0 ? '—' : `${value > 0 && !negative ? '+' : ''}${value}y`
  const color = value === 0 ? 'text-text-muted' : statusText(negative || value < 0 ? 'error' : 'success')
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={`font-mono ${color}`}>{display}</span>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl px-2.5 py-2">
      <div className="text-[9px] text-text-muted font-semibold">{label}</div>
      <div className="text-sm font-bold font-mono">{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reviews Tab
// ─────────────────────────────────────────────────────────────────────────────

function ReviewsTab({ onRefresh }: { onRefresh: () => void }) {
  const { data: snapshot, loading, refetch } = useApi(getHrSnapshot)
  const review = snapshot?.latestReview ?? null
  const recs = snapshot?.recommendations ?? null
  const [running, setRunning] = useState(false)
  const [cadenceConfirmOpen, setCadenceConfirmOpen] = useState(false)
  // Per-candidate "Apply" action state
  const [promoteFor, setPromoteFor] = useState<string | null>(null)
  const [applyBusy, setApplyBusy] = useState(false)
  // Inline PIP: which agent has its reason input open + the reason text + busy flag
  const [pipFor, setPipFor] = useState<string | null>(null)
  const [pipReason, setPipReason] = useState('')
  const [pipBusy, setPipBusy] = useState<string | null>(null)

  const handleApplyPromotion = async () => {
    if (!promoteFor) return
    const agent = promoteFor
    setApplyBusy(true)
    try {
      const res = await promoteAgentApi(agent)
      if (res.ok) {
        toast('success', `Promoted ${agent}${res.agent?.levelTitle ? ` to ${res.agent.levelTitle}` : ''}`)
        setPromoteFor(null)
        refetch()
        onRefresh()
      } else {
        toast('error', res.error || 'Promotion failed')
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Promotion failed')
    } finally {
      setApplyBusy(false)
    }
  }

  const handleOpenPip = async (agent: string) => {
    if (!pipReason.trim()) return
    setPipBusy(agent)
    try {
      const res = await openAgentPip(agent, pipReason.trim())
      if (res.ok) {
        toast('success', `PIP opened for ${agent} — 14-day window started`)
        setPipFor(null)
        setPipReason('')
        refetch()
        onRefresh()
      } else {
        toast('error', res.error || 'PIP failed')
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'PIP failed')
    } finally {
      setPipBusy(null)
    }
  }

  const handleRunSweep = async () => {
    setRunning(true)
    try {
      const res = await runWitnessSweep()
      toast('success', `Witness sweep: ${res.runsClassified} runs classified, ${res.pipCandidates.length} PIPs, ${res.promotionCandidates.length} promotions pending`)
      refetch()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Sweep failed')
    } finally {
      setRunning(false)
    }
  }

  const handleRunCadence = async () => {
    setCadenceConfirmOpen(false)
    setRunning(true)
    try {
      const res = await runCadenceReviewApi()
      toast('success', `Cadence review done: ${res.promotions.length} promotions, ${res.pipsOpened.length} PIPs opened`)
      refetch()
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Cadence review failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleRunSweep}
          disabled={running}
          className="btn-secondary btn-sm"
        >
          {running ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
          Run Witness sweep
        </button>
        <button
          onClick={() => setCadenceConfirmOpen(true)}
          disabled={running}
          className="btn-primary btn-sm"
        >
          {running ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
          Run Cadence review
        </button>
        <button
          onClick={() => { refetch() }}
          className="btn-ghost btn-sm"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* Recommendations */}
      {recs && (recs.promotionCandidates.length > 0 || recs.pipCandidates.length > 0) && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-subtle">
            <h3 className="text-sm font-bold">Pending recommendations</h3>
            <p className="text-[10px] text-text-muted">Last sweep: {recs.generatedAt ? new Date(recs.generatedAt).toLocaleString() : 'never'}</p>
          </div>
          {recs.promotionCandidates.length > 0 && (
            <div className="px-5 py-3 border-b border-border-subtle">
              <h4 className="text-[10px] text-emerald font-bold mb-2">
                Promotions ({recs.promotionCandidates.length})
              </h4>
              <div className="space-y-1">
                {recs.promotionCandidates.map((p) => (
                  <div key={p.agent} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3 h-3 text-emerald shrink-0" />
                    <span className="font-semibold">{p.agent}</span>
                    <span className="text-text-muted">{p.fromTitle} → next level</span>
                    <span className="text-[10px] text-text-muted truncate">{p.signals.join(' · ')}</span>
                    <button
                      onClick={() => setPromoteFor(p.agent)}
                      disabled={applyBusy}
                      className="btn-primary btn-sm ml-auto shrink-0"
                    >
                      <TrendingUp className="w-3 h-3" /> Apply promotion
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recs.pipCandidates.length > 0 && (
            <div className="px-5 py-3">
              <h4 className="text-[10px] text-red font-bold mb-2">
                PIP Candidates ({recs.pipCandidates.length})
              </h4>
              <div className="space-y-1">
                {recs.pipCandidates.map((p) => (
                  <div key={p.agent} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <AlertTriangle className="w-3 h-3 text-red shrink-0" />
                      <span className="font-semibold">{p.agent}</span>
                      <span className="text-text-muted truncate">{p.reasons.join(' · ')}</span>
                      <span className="ml-auto shrink-0 text-[10px] px-1.5 rounded bg-red-muted text-red uppercase">
                        {p.severity}
                      </span>
                      <button
                        onClick={() => {
                          setPipFor(prev => (prev === p.agent ? null : p.agent))
                          setPipReason(prev => (pipFor === p.agent ? prev : p.reasons.join('; ')))
                        }}
                        disabled={pipBusy != null}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-red-muted text-red rounded-md hover:bg-red/20 disabled:opacity-40 transition-colors"
                      >
                        <TrendingDown className="w-3 h-3" /> Open PIP
                      </button>
                    </div>
                    {pipFor === p.agent && (
                      <div className="ml-5 flex items-center gap-2">
                        <input
                          value={pipReason}
                          onChange={e => setPipReason(e.target.value)}
                          placeholder="Reason for PIP (required)…"
                          autoFocus
                          className="flex-1 bg-surface-2 border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-red"
                        />
                        <button
                          onClick={() => handleOpenPip(p.agent)}
                          disabled={!pipReason.trim() || pipBusy === p.agent}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold bg-red text-white rounded-md hover:bg-red/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {pipBusy === p.agent ? <Loader className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                          Confirm PIP
                        </button>
                        <button
                          onClick={() => { setPipFor(null); setPipReason('') }}
                          disabled={pipBusy === p.agent}
                          className="shrink-0 px-2.5 py-1.5 text-[10px] font-semibold bg-surface-2 text-text-muted rounded-md hover:text-text disabled:opacity-40 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Latest review */}
      {loading && !review ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader className="w-4 h-4 animate-spin mr-2" /> Loading review...
        </div>
      ) : review && review.week ? (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border-subtle">
            <h3 className="text-sm font-bold">Last review: {review.week}</h3>
            <p className="text-[10px] text-text-muted">{new Date(review.reviewedAt).toLocaleString()}</p>
          </div>
          <div className="px-5 py-4 space-y-3 text-xs">
            {review.promotions && review.promotions.length > 0 && (
              <div>
                <div className="text-[10px] text-emerald font-bold mb-1">
                  Promoted ({review.promotions.length})
                </div>
                {review.promotions.map((p) => (
                  <div key={p.agent}>
                    <span className="font-semibold">{p.agent}</span> → {p.to}
                  </div>
                ))}
              </div>
            )}
            {review.pipsOpened && review.pipsOpened.length > 0 && (
              <div>
                <div className="text-[10px] text-red font-bold mb-1">
                  PIPs Opened ({review.pipsOpened.length})
                </div>
                {review.pipsOpened.map((p) => (
                  <div key={p.agent}>{p.agent}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-10 text-center text-text-muted">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No reviews yet</p>
          <p className="text-xs mt-1">Click "Run Cadence review" above to generate the first one.</p>
        </div>
      )}

      {/* Cadence review confirmation — applies all pending promotions + opens PIPs */}
      <ConfirmDialog
        open={cadenceConfirmOpen}
        onClose={() => setCadenceConfirmOpen(false)}
        onConfirm={handleRunCadence}
        title="Run full Cadence review?"
        message="This applies all pending promotions and opens PIPs for every flagged agent in one pass. Each change is logged."
        confirmLabel="Run review"
        danger
        loading={running}
      />

      {/* Single-candidate promotion confirmation (per-row Apply) */}
      <ConfirmDialog
        open={promoteFor != null}
        onClose={() => setPromoteFor(null)}
        onConfirm={handleApplyPromotion}
        title={promoteFor ? `Promote ${promoteFor}?` : 'Promote agent?'}
        message={promoteFor ? `This advances ${promoteFor} to the next level and is logged to the agent's history.` : undefined}
        confirmLabel="Promote"
        loading={applyBusy}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Training Queue Tab
// ─────────────────────────────────────────────────────────────────────────────

function TrainingTab() {
  const { data, loading } = useApi(getHrTrainingQueue)

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted">
        <Loader className="w-4 h-4 animate-spin mr-2" /> Loading training queue...
      </div>
    )
  }

  const items = data?.items || []
  const pending = items.filter((i) => i.status === 'pending')
  const completed = items.filter((i) => i.status === 'completed')

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold">Training queue</h2>
          <p className="text-[11px] text-text-muted">
            {pending.length} pending · {completed.length} completed
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-text-muted">
          <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Training queue is empty</p>
          <p className="text-xs mt-1">Items are added automatically by Cadence during weekly review.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {items.map((item) => (
              <TrainingItemRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TrainingItemRow({ item }: { item: TrainingQueueItem }) {
  const statusIntent: Intent =
    item.status === 'completed' ? 'success' :
    item.status === 'failed' ? 'error' :
    'warning'

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="w-8 h-8 rounded-lg bg-accent/5 flex items-center justify-center shrink-0">
        <GraduationCap className="w-4 h-4 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{item.agent}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-surface-2 text-text-secondary">
            {item.skill}
          </span>
          <span className={`pill font-semibold uppercase ${statusPill(priorityIntent(item.priority))}`}>
            {item.priority}
          </span>
        </div>
        <div className="text-[10px] text-text-muted mt-0.5">{item.reason}</div>
      </div>
      <span className={`pill shrink-0 ${statusPill(statusIntent)}`}>
        {item.status}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Capability Scanner Tab
// ─────────────────────────────────────────────────────────────────────────────

function CapabilityScannerTab() {
  const [brief, setBrief] = useState('')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof detectCapabilityGap>> | null>(null)

  const handleScan = async () => {
    if (!brief.trim()) {
      toast('error', 'Enter a brief first')
      return
    }
    setScanning(true)
    setResult(null)
    try {
      const res = await detectCapabilityGap(brief.trim())
      setResult(res)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-sm font-bold">Capability gap scanner</h2>
        <p className="text-[11px] text-text-muted mt-0.5">
          Describe a task or project brief. Roster will tell you if the current team can handle it.
        </p>
      </div>

      <div className="card p-4">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. Build a Shopify app with 3D product visualization using WebGL and server-side STL parsing..."
          aria-label="Describe the task or project brief"
          rows={4}
          className="input resize-none"
        />
        <button
          onClick={handleScan}
          disabled={scanning || !brief.trim()}
          className="btn-primary btn-md mt-3"
        >
          {scanning ? <Loader className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
          Scan Capability
        </button>
      </div>

      {result && (
        <div
          className={`rounded-2xl border p-4 ${
            result.canHandle ? 'bg-emerald/5 border-emerald/20' : 'bg-amber/5 border-amber/20'
          }`}
        >
          <div className="flex items-start gap-3 mb-3">
            {result.canHandle ? (
              <CheckCircle2 className="w-5 h-5 text-emerald shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className={`font-bold text-sm ${result.canHandle ? 'text-emerald' : 'text-amber'}`}>
                {result.canHandle ? 'Team can handle this' : 'Capability gap detected'}
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                Confidence: {Math.round(result.confidence * 100)}% · Recommendation: <span className="font-semibold">{result.recommendation}</span>
              </div>
            </div>
          </div>

          {result.inferredSkills.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] text-text-muted font-bold mb-1">Inferred skills</div>
              <div className="flex flex-wrap gap-1">
                {result.inferredSkills.map((s) => (
                  <span
                    key={s}
                    className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                      result.gaps.includes(s)
                        ? 'bg-red/10 text-red'
                        : 'bg-emerald/10 text-emerald'
                    }`}
                  >
                    {s} {result.gaps.includes(s) ? '✗' : '✓'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.bestMatches.length > 0 && (
            <div>
              <div className="text-[10px] text-text-muted font-bold mb-1">
                Best matches
              </div>
              <div className="space-y-1">
                {result.bestMatches.map((m) => (
                  <div key={m.agent} className="flex items-center gap-2 text-xs">
                    <span className="font-semibold w-20">{m.agent}</span>
                    <span className="text-text-muted flex-1">{m.title}</span>
                    <span className="font-mono text-[10px]">{Math.round(m.score * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tiny components
// ─────────────────────────────────────────────────────────────────────────────

function TabButton({ id, active, onClick, children }: {
  id: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={active ? 'segmented-btn segmented-btn-active flex items-center gap-1.5' : 'segmented-btn flex items-center gap-1.5'}
    >
      {children}
    </button>
  )
}

// Stat-chip tone → canonical semantic intent (lib/colors). Collapses the
// hand-mapped bg/text/ring quintet to one source of truth.
const STAT_TONE_INTENT: Record<'emerald' | 'amber' | 'red' | 'zinc' | 'blue', Intent> = {
  emerald: 'success',
  amber: 'warning',
  red: 'error',
  zinc: 'neutral',
  blue: 'info',
}

function StatChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof UserCheck
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'red' | 'zinc' | 'blue'
}) {
  return (
    <span className={`pill px-2.5 py-1 font-semibold ring-1 ring-current/20 ${statusPill(STAT_TONE_INTENT[tone])}`}>
      <Icon className="w-3 h-3" />
      {value} {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Drift Fixer Tab
// ─────────────────────────────────────────────────────────────────────────────

function DriftFixerTab({ drift, agents, onRefresh }: {
  drift: DriftData | null
  agents: AgentRecord[]
  onRefresh: () => void
}) {
  const { squads: SQUADS } = useTaxonomy()
  const [selectedSquads, setSelectedSquads] = useState<Record<string, string>>({})
  const [selectedDepts, setSelectedDepts] = useState<Record<string, string>>({})
  const [adopting, setAdopting] = useState<string | null>(null)

  const onlyOnDisk = drift?.onlyOnDisk || []
  const onlyInRegistry = drift?.onlyInRegistry || []
  const departments = useMemo(() => Array.from(new Set(agents.map(a => a.department).filter(Boolean))).sort(), [agents])

  const adoptAgent = async (id: string) => {
    setAdopting(id)
    try {
      const patch: Record<string, unknown> = { status: 'active' }
      if (selectedSquads[id]) patch.squad = selectedSquads[id]
      if (selectedDepts[id]) patch.department = selectedDepts[id]
      const res = await updateOrgAgent(id, patch)
      const hid = res?.historyId ?? null
      if (hid != null) {
        toast('success', `Adopted ${id}`, {
          action: { label: 'Undo', onClick: async () => { await undoOrgChange(hid); toast('success', 'Reverted'); onRefresh() } },
        })
      } else {
        toast('success', `Adopted ${id}`)
      }
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Adopt failed')
    } finally {
      setAdopting(null)
    }
  }

  if (onlyOnDisk.length === 0 && onlyInRegistry.length === 0) {
    return (
      <div className="card p-12 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">No drift detected</p>
        <p className="text-xs text-text-muted">Every agent file on disk has a registry record. Org chart is in sync.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {onlyOnDisk.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber" />
            Unregistered agents <span className="text-text-muted text-xs">({onlyOnDisk.length} on disk, no registry record)</span>
          </h2>
          <div className="card overflow-hidden">
            <div className="divide-y divide-border-subtle">
              {onlyOnDisk.map(id => (
                <div key={id} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-mono text-sm font-semibold w-40 shrink-0">{id}</span>
                  <select
                    value={selectedSquads[id] || ''}
                    onChange={(e) => setSelectedSquads(s => ({ ...s, [id]: e.target.value }))}
                    className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent"
                  >
                    <option value="">— Squad (optional) —</option>
                    {SQUADS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
                  </select>
                  <select
                    value={selectedDepts[id] || ''}
                    onChange={(e) => setSelectedDepts(d => ({ ...d, [id]: e.target.value }))}
                    className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent"
                  >
                    <option value="">— Department (optional) —</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button
                    onClick={() => adoptAgent(id)}
                    disabled={adopting === id}
                    className="btn-primary btn-sm ml-auto"
                  >
                    {adopting === id ? <Loader className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Adopt
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {onlyInRegistry.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <UserX className="w-4 h-4 text-red" />
            Orphan registry records <span className="text-text-muted text-xs">({onlyInRegistry.length} in registry, no .md file)</span>
          </h2>
          <div className="card p-4">
            <div className="flex flex-wrap gap-1.5">
              {onlyInRegistry.map(id => (
                <span key={id} className="font-mono text-xs px-2 py-1 rounded bg-red/10 text-red">{id}</span>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-3">
              These records exist in the registry but the agent .md file is missing on disk. They&apos;re marked retired automatically by agent sync.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  History Tab
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTab({ onRefresh }: { onRefresh: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [undoing, setUndoing] = useState<number | null>(null)

  const refetch = () => {
    setLoading(true)
    getOrgHistory({ limit: 100 })
      .then(d => setHistory(d.history))
      .catch(err => toast('error', err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { refetch() }, [])

  // Live update on new mutations — shared SSE connection (no per-component pipe)
  useEffect(() => {
    return onOrgChartEvent((ev) => {
      if (ev.type === 'agent:upsert' || ev.type === 'agent:remove') refetch()
    })
  }, [])

  const handleUndo = async (id: number) => {
    setUndoing(id)
    try {
      await undoOrgChange(id)
      toast('success', 'Reverted')
      refetch()
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Undo failed')
    } finally {
      setUndoing(null)
    }
  }

  const handleUndoBatch = async (batchId: string) => {
    try {
      const res = await undoOrgBatch(batchId) as { ok: boolean; count: number }
      toast('success', `${res.count || ''} reverted`)
      refetch()
      onRefresh()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Undo batch failed')
    }
  }

  if (loading && history.length === 0) {
    return <div className="flex items-center justify-center py-12 text-text-muted"><Loader className="w-4 h-4 animate-spin mr-2" />Loading history…</div>
  }

  if (history.length === 0) {
    return (
      <div className="card p-12 text-center">
        <History className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">No registry changes yet</p>
        <p className="text-xs text-text-muted">Edits to agents will appear here with one-click undo.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-muted">{history.length} most recent registry changes</p>
        <button onClick={refetch} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {history.map(h => {
        const time = new Date(h.created_at + (h.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString()
        const patchKeys = h.patch ? Object.keys(h.patch).join(', ') : '—'
        return (
          <div key={h.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-colors ${h.undone ? 'bg-surface-2 border-border opacity-60' : 'bg-surface border-border hover:border-accent/30'}`}>
            <span className="font-mono text-xs font-semibold w-32 truncate">{h.agent_id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
              h.action === 'patch' ? 'bg-blue/10 text-blue' :
              h.action === 'bulk-patch' ? 'bg-purple/10 text-purple' :
              h.action === 'undo' ? 'bg-amber/10 text-amber' :
              'bg-surface-2 text-text-muted'
            }`}>{h.action}</span>
            <span className="flex-1 text-xs text-text-muted truncate">
              <span className="font-mono">{patchKeys}</span>
              {h.batch_id && <span className="ml-2 text-[10px] text-text-muted">batch {h.batch_id.slice(0, 12)}</span>}
            </span>
            <span className="text-[10px] text-text-muted shrink-0">{time}</span>
            {h.undone ? (
              <span className="text-[10px] text-text-muted px-2 py-0.5 rounded bg-surface-2">undone</span>
            ) : h.batch_id && h.action === 'bulk-patch' ? (
              <button
                onClick={() => handleUndoBatch(h.batch_id!)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-purple hover:bg-purple/10 rounded-md transition-colors"
              >
                <Undo2 className="w-3 h-3" /> Undo batch
              </button>
            ) : (
              <button
                onClick={() => handleUndo(h.id)}
                disabled={undoing === h.id}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-accent hover:bg-accent/10 rounded-md transition-colors disabled:opacity-40"
              >
                {undoing === h.id ? <Loader className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                Undo
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Consolidation Tab (Pillar 6) — recommends-only roster analysis
// ────────────────────────────────────────────────────────────────────────────
function ConsolidationTab() {
  const [report, setReport] = useState<ConsolidationReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  // Per-row retire: which agent the confirm dialog targets + in-flight flag
  const [retireFor, setRetireFor] = useState<string | null>(null)
  const [retireBusy, setRetireBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    setErr(null)
    try {
      setReport(await getConsolidationReport(30))
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Failed to load consolidation report')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const handleRetire = async () => {
    if (!retireFor) return
    const agent = retireFor
    setRetireBusy(true)
    try {
      const res = await retireAgent(agent, 'Retired via consolidation review (low run frequency)')
      if (res.ok) {
        toast('success', `Retired ${agent}`)
        setRetireFor(null)
        load()
      } else {
        toast('error', res.error || 'Retire failed')
      }
    } catch (x) {
      toast('error', x instanceof Error ? x.message : 'Retire failed')
    } finally {
      setRetireBusy(false)
    }
  }

  if (loading && !report) {
    return <div className="flex items-center justify-center h-48 text-text-muted"><Loader className="w-5 h-5 animate-spin mr-2" /> Loading consolidation report…</div>
  }
  if (err && !report) {
    return (
      <div className="px-2 py-8 text-red text-sm">
        <AlertTriangle className="w-5 h-5 inline mr-2" />{err}
        <button onClick={load} className="ml-3 px-2 py-1 text-xs rounded bg-surface border border-border text-text-muted hover:text-text">Retry</button>
      </div>
    )
  }
  if (!report) return null

  const lowConf = report.retireCandidatesLowConfidence
  const retire = report.dataSufficient ? report.retireCandidates : lowConf

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-sm font-bold">Consolidation — "fewer elite agents"</h2>
        <p className="text-[11px] text-text-muted mt-0.5">
          Data-driven roster review (last {report.windowDays}d). Recommends only — merge/retire is a human decision.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Active agents" value={String(report.activeAgents)} />
        <MiniStat label="With logged runs" value={String(report.agentsWithRuns)} />
        <MiniStat label="Total runs" value={String(report.totalRuns)} />
      </div>

      {/* Data-sufficiency banner — prevents retiring on missing telemetry */}
      {report.note && (
        <div className="rounded-xl border border-amber/20 bg-amber/5 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-200/90">{report.note}</p>
        </div>
      )}

      {/* Structural overlap clusters */}
      <div>
        <h3 className="text-xs font-bold text-text-muted mb-2">Structural overlap clusters</h3>
        {report.overlapClusters.length === 0 ? (
          <p className="text-[11px] text-text-muted">No dept/sub-dept cluster has 3+ active agents.</p>
        ) : (
          <div className="space-y-2">
            {report.overlapClusters.map((c) => (
              <div key={c.cluster} className="card p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-bold">{c.cluster}</span>
                  <span className="text-[10px] text-text-muted">{c.size} agents · {c.withRuns} active · {c.idle.length} idle</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.agents.map((a) => (
                    <span key={a} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${c.idle.includes(a) ? 'bg-surface-2 text-text-muted' : 'bg-emerald/10 text-emerald'}`}>{a}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Low-frequency agents */}
      <div>
        <h3 className="text-xs font-bold text-text-muted mb-2">
          Low-frequency agents (&lt;1 run/wk)
          {!report.dataSufficient && <span className="ml-2 text-[9px] text-amber normal-case font-normal">LOW CONFIDENCE — sparse data</span>}
        </h3>
        {retire.length === 0 ? (
          <p className="text-[11px] text-text-muted">None.</p>
        ) : (
          <div className="card divide-y divide-border">
            {retire.slice(0, 25).map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <span className="font-mono font-semibold flex-1 truncate">{a.id}</span>
                <span className="text-text-muted">{a.department}</span>
                <span className="text-text-muted tabular-nums w-20 text-right">{a.runs} runs · {a.runsPerWeek}/wk</span>
                <button
                  onClick={() => setRetireFor(a.id)}
                  disabled={retireBusy}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-red-muted text-red rounded-md hover:bg-red/20 disabled:opacity-40 transition-colors"
                >
                  <UserX className="w-3 h-3" /> Retire
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Retire confirmation — destructive: requires typing the agent id */}
      <ConfirmDialog
        open={retireFor != null}
        onClose={() => setRetireFor(null)}
        onConfirm={handleRetire}
        title={retireFor ? `Retire ${retireFor}?` : 'Retire agent?'}
        message={retireFor ? `This marks ${retireFor} as retired and removes it from active rotation. Logged to history.` : undefined}
        confirmLabel="Retire"
        danger
        loading={retireBusy}
        typeNameToConfirm={retireFor ?? undefined}
      />
    </div>
  )
}
