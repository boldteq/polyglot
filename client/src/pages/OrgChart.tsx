import { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import {
  Users, Search, Cpu, Paintbrush, BarChart3, Shield,
  X, ChevronDown, Camera,
  Maximize2, Minimize2, Crown, AlertTriangle, Settings, Check, SlidersHorizontal,
  Sparkles,
  Pencil, Trash2,
  Lock, Unlock,
} from 'lucide-react'
import { toast } from '../components/Toast'
import AssignTaskModal from '../components/AssignTaskModal'
import ConfirmDialog from '../components/ConfirmDialog'
import EditSquadModal from '../components/EditSquadModal'
import EditTagModal from '../components/EditTagModal'
import EditSubDepartmentModal from '../components/EditSubDepartmentModal'
import { getOrgChart, getDrift, getDepartments, updateOrgAgent, undoOrgChange, getGlobalAgents, subscribeOrgChart, apiError, createSquad, createTag, createTier, tryDeleteSquadDef, tryDeleteTagDef, deleteSquadDef, deleteTagDef } from '../lib/api'
import { useTaxonomy, pillStyleFor } from '../hooks/useTaxonomy'
import type { OrgChartData, OrgChartNode, DriftData, OrgAgentPatch, SquadDef } from '../lib/api'
import type { Agent } from '../types'
import { levelColors } from '../components/LevelBadge'
import AgentIcon from '../components/AgentIcon'
import { formatAgentDisplay } from '../lib/agentDisplay'

// ── Constants ────────────────────────────────────────────────────────────────

// Department view constants
const DEPT_WIDTH = 340
const DEPT_HEADER_HEIGHT = 68
const DEPT_PADDING_Y = 14
const MEMBER_ROW_HEIGHT = 90
const MEMBER_ROW_GAP = 6
const DEPT_ROW_GAP = 24
const LEADER_WIDTH = 260
const LEADER_HEIGHT = 118
const LEADER_DEPT_GAP = 40
// Multi-level tree gaps:
//   Row 0 (Yash)         → Row 1 (dept heads): DEPT_HEAD_ROW_GAP
//   Row 1 (dept heads)  → Row 2 (dept cols):  LEADER_DEPT_GAP (existing)
const DEPT_HEAD_ROW_GAP = 60
// Sub-member indent inside a department column (L3+ reports under a sub-manager)
const SUB_MEMBER_INDENT = 14

// Org Structure v2 — sub-department group header height inside a dept column
const SUBDEPT_HEADER_HEIGHT = 30
const SUBDEPT_HEADER_GAP = 4

// Sentinel id for the synthetic "Unassigned" column (agents whose `department`
// field is empty / unknown). Used everywhere we need to bucket those agents.
const UNASSIGNED_DEPT_ID = '__unassigned__'
// Department ids that mark the top-of-org "executive" / leadership column.
// Used as a fallback signal when the strict tier-based top-leader detection
// misses (e.g. drift in `tier` field). Order doesn't matter; first match wins.
const LEADERSHIP_DEPT_IDS = new Set(['executive', 'leadership', 'lead'])
// Neutral grey for synthetic columns (Unassigned) that have no brand color.
const NEUTRAL_DEPT_COLOR = '#6b7280'

// Context for selecting a member from inside a DepartmentNode
// (avoids passing callbacks through node.data which causes re-render churn)
const OrgSelectContext = createContext<{
  selectedId: string | null
  onSelect: (id: string) => void
  lockedIds: Set<string>
  onToggleLock: (id: string, next: boolean) => void
  // Phase 6: open the sub-department edit modal preloaded with the card's
  // current values. deptId+subDeptId identify the entry in departments.json.
  onEditSubDept?: (deptId: string, subDeptId: string) => void
}>({ selectedId: null, onSelect: () => {}, lockedIds: new Set(), onToggleLock: () => {}, onEditSubDept: undefined })


// Maps tier.icon string → Lucide component. Falls back to Cpu for unknown tiers.
const TIER_ICON_MAP: Record<string, typeof Cpu> = {
  Shield, Cpu, BarChart3, Paintbrush,
}
function getTierIcon(iconName?: string | null): typeof Cpu {
  return (iconName && TIER_ICON_MAP[iconName]) ? TIER_ICON_MAP[iconName] : Cpu
}

type TagFilters = Record<string, string[]>
const EMPTY_TAG_FILTERS: TagFilters = {}

function nodeMatchesTags(node: { tags?: Record<string, string[]> }, filters: TagFilters): boolean {
  const tg = node.tags || {}
  for (const [cat, vals] of Object.entries(filters)) {
    if (vals.length && !vals.some(v => (tg[cat] || []).includes(v))) return false
  }
  return true
}

function hasActiveTagFilters(f: TagFilters) {
  return Object.values(f).some(vals => vals.length > 0)
}

function hasAnyFilter(f: TagFilters, squads: string[]) {
  return hasActiveTagFilters(f) || squads.length > 0
}

function countActiveTagFilters(f: TagFilters) {
  return Object.values(f).reduce((sum, vals) => sum + vals.length, 0)
}

const MODEL_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  opus: { label: 'Opus', bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  sonnet: { label: 'Sonnet', bg: 'rgba(96,165,250,0.15)', text: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
  haiku: { label: 'Haiku', bg: 'rgba(52,211,153,0.15)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
}

function extractEmoji(name: string): { emoji: string; cleanName: string } {
  const emoji = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u)?.[0] || ''
  const cleanName = name
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*[\u200d\ufe0f]*/u, '')
    .replace(/^—\s*/, '')
    .trim()
  return { emoji, cleanName: cleanName.split('—')[0]?.trim() || cleanName }
}

// ── Department Layout Algorithm ──────────────────────────────────────────────

interface MemberInfo {
  id: string
  name: string
  emoji: string
  title: string
  model: string
  tier: string
  tierIcon?: string | null
  phaseColor: string
  reportsTo: string | null
  dimmed: boolean
  avatar?: string | null
  gender?: string | null
  departmentColor?: string | null
  // Indent depth inside a department column. 0 = direct report of the dept head;
  // 1 = report of a sub-manager (e.g. pod-b-db reports to dato inside engineering).
  indent: number
  level?: number | null
  levelTitle?: string | null
  yearsOfExperience?: number | null
  status?: 'active' | 'probation' | 'pip' | 'pending' | 'retired'
  // Org Structure v2 — sub-department + pod for grouping inside dept column
  subDepartment?: string | null
  subDepartmentLabel?: string | null
  pod?: string | null
  secondaryReportsTo?: string | null
  // Phase A — live load + perf
  activeTaskCount?: number
  maxConcurrentTasks?: number
  loadStatus?: 'free' | 'busy' | 'overloaded'
  successRate?: number | null
}

// Org Structure v2 — sub-department group inside a dept column.
// Visual fields (cardLabel, cardEmoji, color, icon, displayMode, status) are
// authored in ~/.claude/org/departments.json and flow through buildOrgChart.
interface SubDeptGroup {
  id: string
  label: string
  description: string
  pod: string | null
  members: MemberInfo[]
  // Visual fields for dynamic card rendering
  cardLabel?: string | null
  cardEmoji?: string | null
  color?: string | null
  icon?: string | null
  displayMode?: 'expanded' | 'collapsed' | 'hidden'
  status?: 'active' | 'planned' | 'archived'
  lead?: string | null
  memberCount?: number | null
  order?: number
}

interface DepartmentNodeData {
  phase: string
  phaseLabel: string
  phaseColor: string
  members: MemberInfo[]
  // Org Structure v2 — grouped sub-department members. If present, renderer
  // shows section headers; falls back to flat `members` list when empty.
  subDeptGroups?: SubDeptGroup[]
  // Card-level visual fields (Phase 6 — dynamic rendering)
  cardEmoji?: string | null
  cardStatus?: 'active' | 'planned' | 'archived'
  cardDescription?: string
  cardIsOther?: boolean  // true for residual "Other" fallback column
  deptId?: string | null
  subDeptId?: string | null
  width: number
  height: number
  dimmed: boolean
  [key: string]: unknown
}

interface LeaderNodeData {
  id: string
  name: string
  emoji: string
  title: string
  model: string
  tier: string
  phaseColor: string
  description: string
  dimmed: boolean
  avatar?: string | null
  gender?: string | null
  departmentColor?: string | null
  level?: number | null
  levelTitle?: string | null
  yearsOfExperience?: number | null
  status?: 'active' | 'probation' | 'pip' | 'pending' | 'retired'
  // Phase A — live load + perf
  activeTaskCount?: number
  maxConcurrentTasks?: number
  loadStatus?: 'free' | 'busy' | 'overloaded'
  successRate?: number | null
  [key: string]: unknown
}

function toMemberInfo(node: OrgChartNode, indent = 0, tierById: Record<string, { icon?: string | null }> = {}): MemberInfo {
  const d = formatAgentDisplay({ name: node.name, title: node.title, id: node.id })
  return {
    id: node.id,
    name: d.realName,
    emoji: d.emoji,
    title: d.role || node.title,
    model: node.model,
    tier: node.tier,
    tierIcon: tierById[node.tier]?.icon ?? null,
    phaseColor: node.departmentColor || node.phaseColor,
    reportsTo: node.reportsTo,
    dimmed: false,
    indent,
    avatar: (node as { avatar?: string | null }).avatar ?? null,
    gender: (node as { gender?: string | null }).gender ?? null,
    departmentColor: node.departmentColor ?? null,
    level: node.level ?? null,
    levelTitle: node.levelTitle ?? null,
    yearsOfExperience: node.yearsOfExperience ?? null,
    status: node.status,
    // Org Structure v2 fields
    subDepartment: node.subDepartment ?? null,
    subDepartmentLabel: node.subDepartmentLabel ?? null,
    pod: node.pod ?? null,
    secondaryReportsTo: node.secondaryReportsTo ?? null,
    // Phase A — live capacity + perf
    activeTaskCount: node.activeTaskCount ?? 0,
    maxConcurrentTasks: node.maxConcurrentTasks ?? 3,
    loadStatus: node.loadStatus ?? 'free',
    successRate: node.successRate ?? null,
  }
}

// Renders a 🟢🟡🔴 dot indicating live load. Used in member rows + leader cards.
function LoadDot({ status, active, max, successRate, lastDispatchAt }: {
  status?: 'free' | 'busy' | 'overloaded'
  active?: number
  max?: number
  successRate?: number | null
  lastDispatchAt?: string | null
}) {
  const s = status || 'free'
  const color = s === 'free' ? '#10b981' : s === 'busy' ? '#f59e0b' : '#ef4444'
  const ring = s === 'free' ? 'rgba(16,185,129,0.25)' : s === 'busy' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.4)'
  const pulse = s === 'overloaded'
  const tooltip = [
    `${s.toUpperCase()}`,
    typeof active === 'number' && typeof max === 'number' ? `${active}/${max} tasks` : null,
    typeof successRate === 'number' ? `${Math.round(successRate * 100)}% success` : null,
    lastDispatchAt ? `last ${formatRelative(lastDispatchAt)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className={`inline-block shrink-0 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{
        width: 8,
        height: 8,
        backgroundColor: color,
        boxShadow: `0 0 0 2px ${ring}`,
      }}
    />
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function computeDepartmentLayout(
  allNodes: OrgChartNode[],
  departmentList: OrgChartData['departments'] = [],
  tierByIdArg: Record<string, { icon?: string | null }> = {},
): {
  rfNodes: Node[]
  rfEdges: Edge[]
} {
  // ── Layout shape ────────────────────────────────────────────────────────────
  // Row 0 (y=0):                                  [ Yash (LEADERSHIP) ]
  // Row 1 (y=LEADER_HEIGHT + DEPT_HEAD_ROW_GAP):  [ Arya ] [ Nova ] [ Quill ] ...
  // Row 2 (y=above + LEADER_HEIGHT + LEADER_DEPT_GAP):  Engineering | Research | ...
  //                                                     ┌──────────┐ ┌──────────┐
  //                                                     │ Koda     │ │ Scout    │
  //                                                     │ Dato     │ │ ...      │
  //                                                     │  └ pod-b-db (indent)  │
  //                                                     └──────────┘ └──────────┘
  //
  // Strict leader rule: ONLY agents with `tier === 'leadership' && !reportsTo`
  // sit at Row 0. Everyone else lands in a department column or "Unassigned".

  // Index nodes by id and by manager (reportsTo) — used for tree traversal.
  const byId = new Map<string, OrgChartNode>()
  const byManager = new Map<string | null, OrgChartNode[]>()
  for (const n of allNodes) {
    byId.set(n.id, n)
    const key = n.reportsTo || null
    if (!byManager.has(key)) byManager.set(key, [])
    byManager.get(key)!.push(n)
  }

  // Top leader detection — resilient to data drift. Tries 4 strategies in order,
  // so a stale tier/status field in the DB doesn't strand the chart with no
  // Row-0 leader (which would then route every edge to "no manager" and dump
  // the CEO into the Unassigned column).
  //   1. Strict: leadership tier + no manager (canonical)
  //   2. Department-driven: head of any "executive"/"leadership"/"lead" dept
  //   3. Any agent with no reportsTo (single root in the reports-to forest)
  //   4. Highest-level agent (level desc) — last resort, never null
  const yash: OrgChartNode | null = (() => {
    const strict = allNodes.find(n => n.tier === 'leadership' && !n.reportsTo)
    if (strict) return strict
    const execDept = departmentList.find(d => LEADERSHIP_DEPT_IDS.has(d.id))
    if (execDept?.head) {
      const head = byId.get(execDept.head)
      if (head) return head
    }
    const orphans = allNodes.filter(n => !n.reportsTo)
    if (orphans.length === 1) return orphans[0]
    if (orphans.length > 1) {
      // Prefer the one with highest level/seniority signal
      return [...orphans].sort((a, b) => (b.level || 0) - (a.level || 0))[0]
    }
    return null
  })()

  // Departments to render — server-ordered. Department head is rendered as a
  // Row 1 leader card and EXCLUDED from the column member list.
  const sortMembers = (a: OrgChartNode, b: OrgChartNode) => {
    if (a.tier === 'leadership' && b.tier !== 'leadership') return -1
    if (b.tier === 'leadership' && a.tier !== 'leadership') return 1
    if ((b.level || 0) !== (a.level || 0)) return (b.level || 0) - (a.level || 0)
    return a.name.localeCompare(b.name)
  }

  // Build an ordered, indented member list for one department column. Walks
  // the reportsTo tree so sub-managers (e.g. dato) precede their reports
  // (pod-b-db indented one level under dato).
  const buildColumnMembers = (deptId: string, headId: string | null): MemberInfo[] => {
    const out: MemberInfo[] = []
    const seen = new Set<string>()

    const sameDept = (n: OrgChartNode) => (n.department || UNASSIGNED_DEPT_ID) === deptId

    // Direct reports of the dept head (or top-of-column if no head).
    const roots = (byManager.get(headId) || [])
      .filter(sameDept)
      .filter(n => n.id !== headId)
      .slice()
      .sort(sortMembers)

    const visit = (node: OrgChartNode, depth: number) => {
      if (seen.has(node.id)) return
      seen.add(node.id)
      out.push(toMemberInfo(node, depth, tierByIdArg))
      const children = (byManager.get(node.id) || [])
        .filter(sameDept)
        .slice()
        .sort(sortMembers)
      for (const c of children) visit(c, depth + 1)
    }

    for (const r of roots) visit(r, 0)

    // Catch any orphan in this department whose reportsTo points outside the
    // department (or is null) — render them at depth 0 so nobody is dropped.
    const orphans = allNodes
      .filter(sameDept)
      .filter(n => n.id !== headId && !seen.has(n.id))
      .slice()
      .sort(sortMembers)
    for (const o of orphans) visit(o, 0)

    return out
  }

  // Org Structure v2 — group flat members into sub-department buckets using
  // the server-provided subDepartments definition. Falls back to flat list
  // when sub-dept data missing (back-compat for unmigrated agents).
  const buildSubDeptGroups = (
    deptDef: OrgChartData['departments'][number],
    flatMembers: MemberInfo[],
    headId: string | null,
  ): SubDeptGroup[] => {
    if (!deptDef.subDepartments || deptDef.subDepartments.length === 0) return []
    const groups: SubDeptGroup[] = deptDef.subDepartments
      // Skip explicitly-hidden sub-depts (displayMode='hidden')
      .filter(sd => sd.displayMode !== 'hidden')
      .map(sd => ({
        id: sd.id,
        label: sd.label,
        description: sd.description,
        pod: sd.pod || null,
        // Pass through all visual fields for the card renderer
        cardLabel: sd.cardLabel || null,
        cardEmoji: sd.cardEmoji || null,
        color: sd.color || null,
        icon: sd.icon || null,
        displayMode: sd.displayMode || 'expanded',
        status: sd.status || 'active',
        lead: sd.lead || null,
        memberCount: sd.memberCount ?? null,
        order: sd.order ?? 999,
        members: flatMembers.filter(m => {
          // Skip dept head (rendered as Row 1 leader card)
          if (m.id === headId) return false
          return m.subDepartment === sd.id
        }),
      }))
      // Keep cards with members OR cards explicitly marked active/planned (so
      // empty "planned" placeholders still render — useful for cohort previews).
      .filter(g => g.members.length > 0 || g.status === 'planned' || g.status === 'active')
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    return groups
  }

  const departments = departmentList
    .map(d => {
      const head = d.head ? byId.get(d.head) || null : null
      const flatMembers = buildColumnMembers(d.id, d.head || null)
      const subDeptGroups = buildSubDeptGroups(d, flatMembers, d.head || null)
      // Visible (non-head) members — head is rendered as the Row 1 leader card.
      const visibleCount = head ? flatMembers.filter(m => m.id !== head.id).length : flatMembers.length
      return {
        id: d.id,
        label: d.label,
        color: d.color,
        head,
        visibleCount,
        members: flatMembers,
        subDeptGroups,
      }
    })
    // Hide executive-style depts whose only "member" is Yash (rendered on Row 0).
    // Keep depts with a real head + non-head members, OR depts that have members
    // even when headless (like __unassigned__ added below).
    .filter(d => {
      if (yash && d.head?.id === yash.id && d.visibleCount === 0) return false
      return d.head || d.visibleCount > 0
    })

  // Unassigned column: agents whose `department` is missing or 'unassigned',
  // and who aren't Yash or a dept head. These are typically newly-seeded
  // probation/pending agents waiting on HR triage.
  const renderedIds = new Set<string>()
  if (yash) renderedIds.add(yash.id)
  for (const d of departments) {
    if (d.head) renderedIds.add(d.head.id)
    for (const m of d.members) renderedIds.add(m.id)
  }
  const unassigned = allNodes
    .filter(n => !renderedIds.has(n.id))
    .slice()
    .sort(sortMembers)
  if (unassigned.length > 0) {
    departments.push({
      id: UNASSIGNED_DEPT_ID,
      label: 'Unassigned',
      color: NEUTRAL_DEPT_COLOR,
      head: null,
      members: unassigned.map(n => toMemberInfo(n, 0, tierByIdArg)),
      subDeptGroups: [],
      visibleCount: unassigned.length,
    })
  }

  // ── Render plan — Row 2 columns ─────────────────────────────────────────────
  // Layout strategy:
  //   - Most depts: 1 col = 1 dept (with internal sub-dept group headers).
  //   - Dense depts (≥SPLIT_THRESHOLD_MEMBERS, ≥SPLIT_THRESHOLD_SUBDEPTS): each
  //     sub-dept becomes its own column header — but packed into a GRID
  //     (DENSE_GRID_COLS wide × N tall) so we don't blow up canvas width.
  //   - Engineering's 6 sub-pods → 3-wide × 2-tall grid → 3 col-widths instead
  //     of 6, plus rows go down vertically.
  //   - VP card centered over the dept's full grid span.
  const SPLIT_THRESHOLD_MEMBERS = 8
  const SPLIT_THRESHOLD_SUBDEPTS = 2
  const DENSE_GRID_COLS = 3
  const DENSE_GRID_ROW_GAP = 28 // vertical gap between sub-col rows

  type DeptEntry = typeof departments[number]
  type SubdeptEntry = {
    label: string
    members: MemberInfo[]
    subDeptId: string
    cardLabel?: string | null
    cardEmoji?: string | null
    color?: string | null
    icon?: string | null
    status?: 'active' | 'planned' | 'archived'
    description?: string
    isOther?: boolean
  }
  type ColumnPlan =
    | { kind: 'dept'; dept: DeptEntry; deptColor: string; label: string; members: MemberInfo[]; subDeptGroups?: SubDeptGroup[] }
    | { kind: 'subdept'; dept: DeptEntry; deptColor: string; label: string; members: MemberInfo[]; subDeptId: string; gridRow: number; gridCol: number;
        cardLabel?: string | null; cardEmoji?: string | null; color?: string | null; icon?: string | null; status?: 'active' | 'planned' | 'archived'; description?: string; isOther?: boolean }

  const plan: ColumnPlan[] = []
  for (const d of departments) {
    const groups = d.subDeptGroups || []
    const visibleHead = d.head?.id
    const nonHead = (xs: MemberInfo[]) => visibleHead ? xs.filter(m => m.id !== visibleHead) : xs
    const totalVisible = nonHead(d.members).length
    const shouldSplit = groups.length >= SPLIT_THRESHOLD_SUBDEPTS && totalVisible >= SPLIT_THRESHOLD_MEMBERS

    if (shouldSplit) {
      const subEntries: SubdeptEntry[] = []
      for (const g of groups) {
        const memList = nonHead(g.members)
        // Empty cards still render for active/planned status (lets user see the
        // card before any agent is assigned — eliminates the "ghost" card UX)
        if (memList.length === 0 && g.status !== 'planned' && g.status !== 'active') continue
        subEntries.push({
          label: g.label,
          members: memList,
          subDeptId: g.id,
          cardLabel: g.cardLabel || null,
          cardEmoji: g.cardEmoji || null,
          color: g.color || null,
          icon: g.icon || null,
          status: g.status || 'active',
          description: g.description,
        })
      }
      // Residual: dept members not assigned to any sub-dept
      const grouped = new Set<string>()
      for (const g of groups) for (const m of g.members) grouped.add(m.id)
      const ungrouped = nonHead(d.members).filter(m => !grouped.has(m.id))
      if (ungrouped.length > 0) {
        subEntries.push({
          label: 'Other',
          members: ungrouped,
          subDeptId: `${d.id}-other`,
          isOther: true,
          color: '#9ca3af',
          cardEmoji: '⚠️',
          description: 'Members whose subDepartment is not registered in departments.json. Assign each agent to a real sub-department or add a new sub-dept entry.',
        })
      }
      // Pack sub-entries into a DENSE_GRID_COLS-wide grid
      subEntries.forEach((sub, idx) => {
        plan.push({
          kind: 'subdept',
          dept: d,
          deptColor: d.color,
          label: sub.label,
          members: sub.members,
          subDeptId: sub.subDeptId,
          cardLabel: sub.cardLabel,
          cardEmoji: sub.cardEmoji,
          color: sub.color,
          icon: sub.icon,
          status: sub.status,
          description: sub.description,
          isOther: sub.isOther,
          gridRow: Math.floor(idx / DENSE_GRID_COLS),
          gridCol: idx % DENSE_GRID_COLS,
        })
      })
    } else {
      plan.push({
        kind: 'dept',
        dept: d,
        deptColor: d.color,
        label: d.label,
        members: nonHead(d.members),
        subDeptGroups: groups,
      })
    }
  }

  // ── Position math (grid-aware) ──────────────────────────────────────────────
  // Each dept reserves a horizontal X-slot range. Single-col depts take 1 slot;
  // dense (split) depts take DENSE_GRID_COLS slots which their sub-dept cols
  // occupy in a wrap grid. Total canvas slots = sum of slot sizes.
  type DeptSlotSpan = { deptId: string; startSlot: number; slotCount: number; rowCount: number }
  const deptSlots: DeptSlotSpan[] = []
  {
    let cursor = 0
    // Group plan entries by dept (preserving department order)
    const seen = new Set<string>()
    for (const entry of plan) {
      if (seen.has(entry.dept.id)) continue
      seen.add(entry.dept.id)
      const entriesForDept = plan.filter(e => e.dept.id === entry.dept.id)
      const isDense = entriesForDept[0].kind === 'subdept'
      const slotCount = isDense ? DENSE_GRID_COLS : 1
      const rowCount = isDense
        ? Math.max(...entriesForDept.map(e => (e as Extract<ColumnPlan,{kind:'subdept'}>).gridRow)) + 1
        : 1
      deptSlots.push({ deptId: entry.dept.id, startSlot: cursor, slotCount, rowCount })
      cursor += slotCount
    }
  }
  const totalSlots = deptSlots.reduce((acc, s) => acc + s.slotCount, 0)
  const deptsRowWidth = totalSlots * DEPT_WIDTH + Math.max(0, totalSlots - 1) * DEPT_ROW_GAP
  const canvasWidth = Math.max(deptsRowWidth, LEADER_WIDTH)

  const topY = 0
  const deptHeadsY = LEADER_HEIGHT + DEPT_HEAD_ROW_GAP
  const deptColsY = deptHeadsY + LEADER_HEIGHT + LEADER_DEPT_GAP

  const deptsStartX = (canvasWidth - deptsRowWidth) / 2
  const slotXFor = (slotIdx: number) => deptsStartX + slotIdx * (DEPT_WIDTH + DEPT_ROW_GAP)

  // Map: deptId → its slot span (for VP head + edge routing)
  const deptSlotMap = new Map<string, DeptSlotSpan>()
  for (const s of deptSlots) deptSlotMap.set(s.deptId, s)

  // Compute each entry's heightHint (used for grid-row Y positioning of dense depts).
  // For subdept-grid: row1 Y = row0 Y + max(row0 entry heights) + DENSE_GRID_ROW_GAP
  function entryHeight(entry: ColumnPlan): number {
    const memberCount = entry.members.length
    const groupCount = entry.kind === 'dept' ? (entry.subDeptGroups || []).length : 0
    const groupHeadersHeight = groupCount > 0
      ? groupCount * (SUBDEPT_HEADER_HEIGHT + SUBDEPT_HEADER_GAP)
      : 0
    return DEPT_HEADER_HEIGHT
      + DEPT_PADDING_Y * 2
      + memberCount * MEMBER_ROW_HEIGHT
      + Math.max(0, memberCount - 1) * MEMBER_ROW_GAP
      + groupHeadersHeight
  }

  // For each dense dept, compute the Y offset for each grid row (row N starts
  // at sum(maxHeight of rows 0..N-1) + N*DENSE_GRID_ROW_GAP).
  const denseRowYMap = new Map<string, number[]>() // deptId → Y offsets per row
  for (const span of deptSlots) {
    if (span.rowCount === 1) continue
    const entries = plan.filter(e => e.dept.id === span.deptId && e.kind === 'subdept') as Extract<ColumnPlan,{kind:'subdept'}>[]
    const rowMaxHeights: number[] = []
    for (let r = 0; r < span.rowCount; r += 1) {
      const inRow = entries.filter(e => e.gridRow === r)
      rowMaxHeights.push(Math.max(...inRow.map(entryHeight), 0))
    }
    const rowOffsets: number[] = [0]
    for (let r = 1; r < span.rowCount; r += 1) {
      rowOffsets.push(rowOffsets[r - 1] + rowMaxHeights[r - 1] + DENSE_GRID_ROW_GAP)
    }
    denseRowYMap.set(span.deptId, rowOffsets)
  }

  // Pre-compute each dept's head card X (centered over its slot span).
  const deptHeadXMap = new Map<string, number>()
  for (const span of deptSlots) {
    const startX = slotXFor(span.startSlot)
    const endX = slotXFor(span.startSlot + span.slotCount - 1) + DEPT_WIDTH
    const headX = (startX + endX) / 2 - LEADER_WIDTH / 2
    deptHeadXMap.set(span.deptId, headX)
  }

  const rfNodes: Node[] = []
  const rfEdges: Edge[] = []

  // Build the data payload for a Leader card (Row 0 OR Row 1). Single source
  // of truth for the 20+ fields each card needs — keeps Yash + every dept
  // head in lock-step.
  const buildLeaderCardData = (n: OrgChartNode): LeaderNodeData => {
    const d = formatAgentDisplay({ name: n.name, title: n.title, id: n.id })
    return {
      id: n.id,
      name: d.realName,
      emoji: d.emoji,
      title: d.role || n.title,
      model: n.model,
      tier: n.tier,
      phaseColor: n.departmentColor || n.phaseColor,
      description: n.description,
      dimmed: false,
      avatar: n.avatar ?? null,
      gender: n.gender ?? null,
      departmentColor: n.departmentColor ?? null,
      level: n.level ?? null,
      levelTitle: n.levelTitle ?? null,
      yearsOfExperience: n.yearsOfExperience ?? null,
      status: n.status,
      activeTaskCount: n.activeTaskCount ?? 0,
      maxConcurrentTasks: n.maxConcurrentTasks ?? 3,
      loadStatus: n.loadStatus ?? 'free',
      successRate: n.successRate ?? null,
    }
  }

  // Row 0 — top leader, centered over the cluster of dept-head card positions.
  if (yash) {
    const headXs = Array.from(deptHeadXMap.values())
    const topX = headXs.length > 0
      ? (Math.min(...headXs) + Math.max(...headXs) + LEADER_WIDTH) / 2 - LEADER_WIDTH / 2
      : (canvasWidth - LEADER_WIDTH) / 2
    rfNodes.push({
      id: yash.id,
      type: 'orgLeader',
      position: { x: topX, y: topY },
      // Explicit width/height — MiniMap reads these directly to draw the
      // node rect. Without them MiniMap waits on DOM measurement and
      // can render zero-size nodes mid-fitView.
      width: LEADER_WIDTH,
      height: LEADER_HEIGHT,
      data: buildLeaderCardData(yash),
    })
  }

  // Row 1 + Row 2 — render the plan.
  // Track dept → list of column nodeIds for VP edge routing.
  const deptColNodeIds = new Map<string, string[]>()

  for (const entry of plan) {
    const span = deptSlotMap.get(entry.dept.id)!
    const colHeight = entryHeight(entry)

    // X: subdept entries place at startSlot+gridCol; dept entries at startSlot
    const slotIdx = entry.kind === 'subdept'
      ? span.startSlot + entry.gridCol
      : span.startSlot
    const colX = slotXFor(slotIdx)

    // Y: subdept entries with gridRow > 0 stack below row 0 (with vertical gap)
    const rowOffsets = denseRowYMap.get(entry.dept.id)
    const colY = entry.kind === 'subdept' && rowOffsets
      ? deptColsY + rowOffsets[entry.gridRow]
      : deptColsY

    const nodeId = entry.kind === 'subdept'
      ? `dept-${entry.dept.id}-${entry.subDeptId}`
      : `dept-${entry.dept.id}`

    // Card visual fields — sub-dept overrides win, fall back to dept color/label.
    // Unassigned column gets a special tooltip explaining the fallback.
    const isUnassignedCol = entry.dept.id === UNASSIGNED_DEPT_ID
    const cardLabel = entry.kind === 'subdept' && entry.cardLabel ? entry.cardLabel : entry.label
    const cardEmoji = entry.kind === 'subdept'
      ? entry.cardEmoji || null
      : (isUnassignedCol ? '⚠️' : null)
    const cardColor = entry.kind === 'subdept' && entry.color ? entry.color : entry.deptColor
    const cardStatus = entry.kind === 'subdept' ? entry.status || 'active' : 'active'
    const cardDescription = entry.kind === 'subdept'
      ? entry.description || ''
      : (isUnassignedCol
          ? "These agents have no `department` field set in registry.json. Click any agent → side panel → Org Setup → set Department + Sub-Department to move them into a real card."
          : '')
    const cardIsOther = entry.kind === 'subdept' && entry.isOther === true

    rfNodes.push({
      id: nodeId,
      type: 'orgDept',
      position: { x: colX, y: colY },
      width: DEPT_WIDTH,
      height: colHeight,
      data: {
        phase: entry.dept.id,
        phaseLabel: cardLabel,
        phaseColor: cardColor,
        members: entry.members,
        // Only the dept-kind column shows internal sub-dept group headers;
        // when split, each sub-dept IS the column so headers are redundant.
        subDeptGroups: entry.kind === 'dept' ? entry.subDeptGroups : undefined,
        // Card-level visual fields for subdept-mode rendering
        cardEmoji,
        cardStatus,
        cardDescription,
        cardIsOther,
        deptId: entry.dept.id,
        subDeptId: entry.kind === 'subdept' ? entry.subDeptId : null,
        width: DEPT_WIDTH,
        height: colHeight,
        dimmed: false,
      } satisfies DepartmentNodeData,
    })

    const list = deptColNodeIds.get(entry.dept.id) || []
    list.push(nodeId)
    deptColNodeIds.set(entry.dept.id, list)
  }

  // Pre-compute the set of node IDs that ARE renderable as ReactFlow nodes.
  // Edges can only connect renderable nodes; if `reportsTo` points to a regular
  // dept-column member (which is just a row inside `OrgDepartmentNode`, not a
  // ReactFlow node), we walk up the chain until we hit one that IS renderable.
  // This makes the trunk fully data-driven from `reportsTo` instead of
  // hardcoding Yash → every dept head.
  const renderableIds = new Set<string>()
  if (yash) renderableIds.add(yash.id)
  for (const sp of deptSlots) {
    const de = plan.find(e => e.dept.id === sp.deptId)
    if (de?.dept.head) renderableIds.add(de.dept.head.id)
  }
  for (const colIds of deptColNodeIds.values()) {
    for (const cid of colIds) renderableIds.add(cid)
  }

  // Walk `startId`'s reportsTo chain upward (cycle-safe). Returns the first
  // ancestor whose id is in `renderableIds` and isn't the start itself.
  // Falls back to Yash when the chain dead-ends or is missing.
  const findRenderableManager = (startId: string | null | undefined, selfId: string): string | null => {
    if (!startId) return yash && selfId !== yash.id ? yash.id : null
    let cur: string | null = startId
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const ancestor = byId.get(cur)
      if (!ancestor) break
      if (ancestor.id !== selfId && renderableIds.has(ancestor.id)) return ancestor.id
      cur = ancestor.reportsTo || null
    }
    return yash && selfId !== yash.id ? yash.id : null
  }

  // Step 2: render Row-1 dept-head card per dept (centered over its slot span)
  // + edges from manager (resolved via reportsTo chain) → head, and head → each col it owns.
  for (const span of deptSlots) {
    const deptEntry = plan.find(e => e.dept.id === span.deptId)
    if (!deptEntry) continue
    const dept = deptEntry.dept
    const head = dept.head

    if (head) {
      const headX = deptHeadXMap.get(span.deptId) ?? slotXFor(span.startSlot)
      rfNodes.push({
        id: head.id,
        type: 'orgLeader',
        position: { x: headX, y: deptHeadsY },
        width: LEADER_WIDTH,
        height: LEADER_HEIGHT,
        data: buildLeaderCardData(head),
      })

      // Manager → dept head edge — fully data-driven from `head.reportsTo`.
      // Walks up the reportsTo chain to the nearest renderable ancestor so an
      // arbitrary chain (Arya → Vega → Yash, Catalyst → Echo → Yash, etc.)
      // resolves to a visible edge target. Trunk lines (manager === Yash) get
      // the neutral text color; lateral / VP-to-VP lines get the dept color.
      const managerId = findRenderableManager(head.reportsTo, head.id)
      if (managerId && managerId !== head.id) {
        const isTrunk = !!yash && managerId === yash.id
        rfEdges.push({
          id: `e-${managerId}-${head.id}`,
          source: managerId,
          target: head.id,
          type: 'step',
          pathOptions: { offset: 24, borderRadius: 0 },
          style: isTrunk
            ? { stroke: 'var(--color-text)', strokeWidth: 1.75, opacity: 0.7 }
            : { stroke: dept.color, strokeWidth: 1.75, opacity: 0.65 },
        } as Edge)
      }
    }

    // VP card → each rendered column belonging to its dept. For dense-split
    // depts (e.g. Engineering with 6 sub-pods packed into a 3-wide grid), the
    // VP fans out to EVERY sub-col so each grid cell has a visible parent
    // line. Thinner + slightly more transparent than the Yash trunk above
    // (1.25/0.55 vs 1.75/0.7) so the visual hierarchy reads top-down.
    // Orphan columns (no head) get a dashed Yash anchor so they don't float.
    const colNodeIds = deptColNodeIds.get(span.deptId) || []
    if (head?.id) {
      for (const colNodeId of colNodeIds) {
        rfEdges.push({
          id: `e-${head.id}-${colNodeId}`,
          source: head.id,
          target: colNodeId,
          type: 'step',
          pathOptions: { offset: 14, borderRadius: 0 },
          style: {
            stroke: dept.color,
            strokeWidth: 1.25,
            opacity: 0.55,
          },
        } as Edge)
      }
    } else if (yash?.id) {
      for (const colNodeId of colNodeIds) {
        rfEdges.push({
          id: `e-${yash.id}-${colNodeId}`,
          source: yash.id,
          target: colNodeId,
          type: 'step',
          pathOptions: { offset: 12, borderRadius: 0 },
          style: {
            stroke: dept.color,
            strokeWidth: 1.25,
            opacity: 0.3,
            strokeDasharray: '4 4',
          },
        } as Edge)
      }
    }
  }

  // ── Mentor edges (secondaryReportsTo) ─────────────────────────────────────
  // Draws a dashed purple edge between dept columns when an agent in column A
  // is mentored by an agent in a DIFFERENT column. Same-column mentorships
  // (e.g. dato → pod-b-db, both in engineering) are already visible inside
  // the column tree + the clickable ↗ pill, so we skip those to avoid
  // intra-column line spaghetti.
  // For dense-split depts, the rendered ReactFlow node is `dept-<id>-<subId>`
  // (not `dept-<id>`), so target/source the FIRST rendered col-node of each
  // dept — otherwise the edge points to a non-existent node and silently
  // disappears.
  const firstColNodeFor = (deptId: string): string | null => {
    const ids = deptColNodeIds.get(deptId)
    return ids && ids.length > 0 ? ids[0] : null
  }
  const seenMentorEdge = new Set<string>()
  for (const node of allNodes) {
    if (!node.secondaryReportsTo) continue
    const mentor = byId.get(node.secondaryReportsTo)
    if (!mentor) continue
    const menteeDept = node.department || null
    const mentorDept = mentor.department || null
    if (!menteeDept || !mentorDept || menteeDept === mentorDept) continue
    const sourceNodeId = firstColNodeFor(mentorDept)
    const targetNodeId = firstColNodeFor(menteeDept)
    if (!sourceNodeId || !targetNodeId) continue
    // Dedup: one edge per (mentorDept, menteeDept) pair
    const key = `${mentorDept}->${menteeDept}`
    if (seenMentorEdge.has(key)) continue
    seenMentorEdge.add(key)
    rfEdges.push({
      id: `mentor-${key}`,
      source: sourceNodeId,
      target: targetNodeId,
      type: 'smoothstep',
      style: {
        stroke: '#a855f7',
        strokeWidth: 1.5,
        opacity: 0.4,
        strokeDasharray: '6 4',
      },
    } as Edge)
  }

  return { rfNodes, rfEdges }
}

// ── Leader Node Component ────────────────────────────────────────────────────

function OrgLeaderNode({ data, selected }: { data: LeaderNodeData; selected: boolean }) {
  const { onSelect, selectedId, lockedIds, onToggleLock } = useContext(OrgSelectContext)
  const isSelected = selected || selectedId === data.id
  const isLocked = lockedIds.has(data.id)
  const badge = MODEL_BADGES[data.model]

  return (
    <div
      className="transition-opacity duration-200 relative"
      style={{ opacity: data.dimmed ? 0.2 : 1 }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onSelect(data.id)
        }}
        className={`relative rounded-2xl border-2 bg-surface shadow-lg transition-all duration-200 text-left block
          ${isSelected
            ? 'ring-2 ring-accent/40 ring-offset-2 ring-offset-bg border-accent'
            : isLocked
              ? 'border-amber-400/60 hover:border-amber-400/80 hover:shadow-xl'
              : 'border-border hover:border-accent/40 hover:shadow-xl'
          }`}
        style={{ width: LEADER_WIDTH, height: LEADER_HEIGHT }}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !bg-transparent !border-0"
        />

        {/* Crown badge — only `tier === 'leadership'` agents reach this card,
            so the badge always reads LEADERSHIP. (Strict leader rule enforced
            in computeDepartmentLayout.) */}
        <div className="absolute -top-2.5 left-4 flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-sm">
          <Crown className="w-2.5 h-2.5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">
            Leadership
          </span>
        </div>

        {/* Per-card lock toggle — locks card position so Auto-adjust layout
            skips it. Sits top-right; stops propagation to avoid triggering
            card selection. */}
        <span
          role="button"
          tabIndex={0}
          aria-pressed={isLocked}
          aria-label={isLocked ? 'Unlock card position' : 'Lock card position'}
          title={isLocked ? 'Unlock card position' : 'Lock card to current position'}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onToggleLock(data.id, !isLocked)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              e.preventDefault()
              onToggleLock(data.id, !isLocked)
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors cursor-pointer ${
            isLocked
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-surface-2/80 text-text-muted border-border hover:bg-surface-3 hover:text-amber-400 hover:border-amber-500/40 opacity-0 group-hover:opacity-100'
          }`}
          style={isLocked ? undefined : { opacity: 1 }}
        >
          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </span>

        <div className="px-4 pt-4 pb-3 flex items-center gap-3 h-full">
          <AgentIcon
            name={data.name}
            id={data.id}
            avatar={data.avatar}
            gender={data.gender}
            ringColor={data.departmentColor}
            uid={`leader-${data.id}`}
            size={48}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {data.emoji && <span className="text-base leading-none">{data.emoji}</span>}
              <span className="text-[15px] font-bold truncate">{data.name}</span>
              <LoadDot
                status={data.loadStatus}
                active={data.activeTaskCount}
                max={data.maxConcurrentTasks}
                successRate={data.successRate}
              />
              {badge && (
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded-full font-bold shrink-0"
                  style={{ backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}` }}
                >
                  {badge.label}
                </span>
              )}
            </div>
            <div className="text-[11px] text-text-muted truncate mt-0.5">{data.title}</div>
            {(data.level != null || data.yearsOfExperience != null) && (
              <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                {data.level != null && data.levelTitle && (
                  <span
                    className={`text-[9px] font-extrabold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded-md border whitespace-nowrap ring-1 ${levelColors(data.level).bg} ${levelColors(data.level).text} ${levelColors(data.level).ring}`}
                    title={`${data.levelTitle} · ${data.yearsOfExperience ?? 0}y experience`}
                  >
                    {data.levelTitle}
                  </span>
                )}
                {data.yearsOfExperience != null && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono font-extrabold shrink-0 whitespace-nowrap tabular-nums border ring-1 ${levelColors(data.level ?? 0).bg} ${levelColors(data.level ?? 0).text} ${levelColors(data.level ?? 0).ring}`}
                    title={`${data.yearsOfExperience} years of experience`}
                  >
                    {data.yearsOfExperience.toFixed(1)}y
                  </span>
                )}
                {data.status && data.status !== 'active' && (
                  <span
                    className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 whitespace-nowrap border ${
                      data.status === 'probation' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                      data.status === 'pip' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                      data.status === 'pending' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' :
                      'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                    }`}
                  >
                    {data.status}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-transparent !border-0"
      />
    </div>
  )
}

// ── Department Node Component ────────────────────────────────────────────────

function OrgDepartmentNode({ id, data }: { id: string; data: DepartmentNodeData; selected: boolean }) {
  const { onSelect, selectedId, lockedIds, onToggleLock, onEditSubDept } = useContext(OrgSelectContext)
  const isLocked = lockedIds.has(id)
  const isEditable = !!(data.subDeptId && data.deptId && onEditSubDept && !data.cardIsOther)

  return (
    <div
      className="transition-opacity duration-200"
      style={{
        width: data.width,
        height: data.height,
        opacity: data.dimmed ? 0.2 : 1,
        boxSizing: 'border-box',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-transparent !border-0"
      />

      <div
        className={`relative rounded-2xl border-2 shadow-lg overflow-hidden h-full flex flex-col ${
          isLocked ? 'ring-1 ring-amber-400/40' : ''
        }`}
        style={{
          borderColor: isLocked ? '#f59e0b80' : `${data.phaseColor}60`,
          background: `linear-gradient(180deg, ${data.phaseColor}0d 0%, var(--color-surface) 40%, var(--color-surface) 100%)`,
        }}
      >
        {/* Per-card lock toggle for dept node — pins column position so
            Auto-adjust layout skips it. */}
        <span
          role="button"
          tabIndex={0}
          aria-pressed={isLocked}
          aria-label={isLocked ? 'Unlock column position' : 'Lock column position'}
          title={isLocked ? 'Unlock column position' : 'Lock column to current position'}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onToggleLock(id, !isLocked)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation()
              e.preventDefault()
              onToggleLock(id, !isLocked)
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors cursor-pointer ${
            isLocked
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-surface-2/80 text-text-muted border-border hover:bg-surface-3 hover:text-amber-400 hover:border-amber-500/40'
          }`}
        >
          {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </span>

        {/* Header */}
        <div
          className="px-4 py-3 shrink-0"
          style={{
            borderBottom: `1px solid ${data.phaseColor}30`,
            background: `linear-gradient(135deg, ${data.phaseColor}20 0%, ${data.phaseColor}08 100%)`,
          }}
        >
          <div className="flex items-center justify-between pr-8 group/cardhdr">
            <div
              className="flex items-center gap-1.5 min-w-0"
              title={data.cardDescription || undefined}
            >
              {data.cardEmoji && (
                <span className="text-[14px] shrink-0" aria-hidden>{data.cardEmoji}</span>
              )}
              <h3
                className="text-[15px] font-bold truncate"
                style={{ color: data.phaseColor }}
              >
                {data.phaseLabel}
              </h3>
              {data.cardStatus && data.cardStatus !== 'active' && (
                <span
                  className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded ml-1"
                  style={{
                    background: data.cardStatus === 'planned' ? '#f59e0b20' : '#9ca3af20',
                    color: data.cardStatus === 'planned' ? '#d97706' : '#6b7280',
                    border: `1px solid ${data.cardStatus === 'planned' ? '#f59e0b40' : '#9ca3af40'}`,
                  }}
                >
                  {data.cardStatus}
                </span>
              )}
              {data.cardIsOther && (
                <span
                  className="text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded ml-1 cursor-help"
                  style={{ background: '#f59e0b20', color: '#d97706', border: '1px solid #f59e0b40' }}
                  title="These members have a `subDepartment` value that isn't registered in departments.json. Either edit each agent to pick a valid sub-dept, or add this sub-dept via the gear icon on a real card."
                >
                  needs fix
                </span>
              )}
              {isEditable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onEditSubDept?.(data.deptId!, data.subDeptId!)
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="opacity-0 group-hover/cardhdr:opacity-100 transition-opacity ml-1 p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text"
                  title="Edit sub-department settings (label, color, emoji, order, displayMode, status)"
                  aria-label="Edit card settings"
                >
                  <Settings className="w-3 h-3" />
                </button>
              )}
            </div>
            <div
              className="px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0"
              style={{
                backgroundColor: `${data.phaseColor}20`,
                color: data.phaseColor,
                border: `1px solid ${data.phaseColor}40`,
              }}
            >
              {data.members.length} {data.members.length === 1 ? 'member' : 'members'}
            </div>
          </div>
        </div>

        {/* Member list — Org Structure v2: groups by sub-dept when available */}
        <div
          className="flex-1 overflow-hidden"
          style={{ padding: `${DEPT_PADDING_Y}px 12px` }}
        >
          {/* Sub-dept groups: render section header per group, then its members. */}
          {data.subDeptGroups && data.subDeptGroups.length > 0 ? (
            <div className="space-y-1.5">
              {data.subDeptGroups.map((group) => (
                <div key={group.id} className="space-y-1.5">
                  <div
                    className="flex items-center gap-2 px-2 mt-1 first:mt-0"
                    style={{
                      height: SUBDEPT_HEADER_HEIGHT,
                      borderBottom: `1px dashed ${data.phaseColor}30`,
                    }}
                    title={group.description}
                  >
                    <span
                      className="text-[9px] font-extrabold uppercase tracking-wider"
                      style={{ color: data.phaseColor, letterSpacing: '0.08em' }}
                    >
                      {group.label}
                    </span>
                    {group.pod && (
                      <span
                        className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase"
                        style={{
                          backgroundColor: `${data.phaseColor}20`,
                          color: data.phaseColor,
                          border: `1px solid ${data.phaseColor}40`,
                        }}
                      >
                        {group.pod.toUpperCase()}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-text-muted font-mono tabular-nums">
                      {group.members.length}
                    </span>
                  </div>
                  {group.members.map((member) => renderMemberRow(member, selectedId, onSelect))}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {data.members.map((member) => renderMemberRow(member, selectedId, onSelect))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Member row helper — shared between sub-dept-grouped + flat fallback rendering.
function renderMemberRow(
  member: MemberInfo,
  selectedId: string | null,
  onSelect: (id: string) => void,
) {
  const badge = MODEL_BADGES[member.model]
  const TierIcon = getTierIcon(member.tierIcon)
  const isSelected = selectedId === member.id
  const indent = Math.min(member.indent || 0, 3)
  return (
    <div
      key={member.id}
      className="flex items-stretch"
      style={{ paddingLeft: indent * SUB_MEMBER_INDENT }}
    >
      {indent > 0 && (
        <span
          aria-hidden
          className="shrink-0 select-none font-mono text-text-muted/60 self-center mr-1"
          style={{ fontSize: 12, lineHeight: 1 }}
          title={member.reportsTo ? `Reports to ${member.reportsTo}` : undefined}
        >
          └─
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onSelect(member.id)
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group border
          ${isSelected
            ? 'bg-accent/10 border-accent/50 shadow-md shadow-accent/10'
            : 'bg-surface-2 border-border hover:bg-surface-3 hover:border-accent/40 hover:shadow-sm'
          }`}
        style={{
          height: MEMBER_ROW_HEIGHT,
          opacity: member.dimmed ? 0.25 : 1,
        }}
      >
        <AgentIcon
          name={member.name}
          id={member.id}
          avatar={member.avatar}
          gender={member.gender}
          ringColor={member.departmentColor}
          uid={`dmem-${member.id}`}
          size={38}
        />
        <div className="min-w-0" style={{ flex: '1 1 0%' }}>
          {/* Row 1: emoji + name + load dot + model badge + pod badge */}
          <div className="flex items-center gap-2 min-w-0">
            {member.emoji && <span className="text-[15px] leading-none shrink-0">{member.emoji}</span>}
            <span
              className="text-[14px] font-extrabold truncate tracking-tight text-text"
              style={{ flex: '1 1 0%', minWidth: 0 }}
            >
              {member.name}
            </span>
            <LoadDot
              status={member.loadStatus}
              active={member.activeTaskCount}
              max={member.maxConcurrentTasks}
              successRate={member.successRate}
            />
            {badge && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-md font-bold shrink-0 whitespace-nowrap border"
                style={{
                  backgroundColor: badge.bg,
                  color: badge.text,
                  borderColor: badge.border,
                }}
              >
                {badge.label}
              </span>
            )}
          </div>
          {/* Row 2: tier icon + title */}
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            <TierIcon className="w-3 h-3 text-text-secondary shrink-0" />
            <span
              className="text-[11px] text-text-secondary truncate font-semibold"
              style={{ flex: '1 1 0%', minWidth: 0 }}
            >
              {member.title}
            </span>
          </div>
          {/* Row 3: level badge pill + YoE + status + secondary report */}
          {member.level != null && (
            <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-md border whitespace-nowrap ${levelColors(member.level).bg} ${levelColors(member.level).text} ${levelColors(member.level).ring} ring-1`}
                title={`${member.levelTitle || ''} · ${member.yearsOfExperience ?? 0}y experience`}
              >
                {member.levelTitle}
              </span>
              {member.yearsOfExperience != null && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-mono font-extrabold shrink-0 whitespace-nowrap tabular-nums border ring-1 ${levelColors(member.level).bg} ${levelColors(member.level).text} ${levelColors(member.level).ring}`}
                  title={`${member.yearsOfExperience} years of experience`}
                >
                  {member.yearsOfExperience.toFixed(1)}y
                </span>
              )}
              {member.status && member.status !== 'active' && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 whitespace-nowrap border ${
                    member.status === 'probation' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                    member.status === 'pip' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                    member.status === 'pending' ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' :
                    'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                  }`}
                >
                  {member.status}
                </span>
              )}
              {member.secondaryReportsTo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(member.secondaryReportsTo as string)
                  }}
                  className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 whitespace-nowrap border bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/25 hover:text-purple-300 hover:border-purple-400/50 transition-colors cursor-pointer"
                  title={`Mentor / cross-functional report → ${member.secondaryReportsTo} (click to focus)`}
                >
                  ↗ {member.secondaryReportsTo}
                </button>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  orgLeader: OrgLeaderNode,
  orgDept: OrgDepartmentNode,
}


// ── Org Setup Form (shared between DetailPanel and UnregisteredPanel) ────────

interface OrgSetupFormProps {
  agentId: string
  initial: OrgAgentPatch
  allNodes: OrgChartNode[]
  onSaved: (result?: { historyId?: number | null }) => void
}

// Bug 1 fix: propagate ALL sub-dept visual fields so the OrgSetupForm
// dropdown can show emoji + status + use pod for auto-population.
type DeptOpt = {
  id: string
  label: string
  color?: string
  subDepartments?: Record<string, {
    id: string
    label: string
    description?: string
    order?: number
    pod?: string | null
    cardLabel?: string | null
    cardEmoji?: string | null
    color?: string | null
    icon?: string | null
    displayMode?: 'expanded' | 'collapsed' | 'hidden'
    status?: 'active' | 'planned' | 'archived'
    lead?: string | null
    memberCount?: number | null
  }>
}

function OrgSetupForm({ agentId, initial, allNodes, onSaved }: OrgSetupFormProps) {
  const [form, setForm] = useState<OrgAgentPatch>(initial)
  const [saving, setSaving] = useState(false)
  const [depts, setDepts] = useState<DeptOpt[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Bug 3 fix: when caller switches selected agent, refresh form state.
  // useState(initial) only fires on first mount; without this hook, switching
  // agents in the side panel keeps the previous agent's values until remount.
  useEffect(() => {
    setForm(initial)
  }, [agentId])

  // Dynamic taxonomy — refreshed automatically when squads/tags/tiers change anywhere
  const { squads: dynSquads, categories: tagCategories, tiers: dynTiers, tierById, refetch: refetchTaxonomy } = useTaxonomy()

  // Inline create UI state
  const [newSquadOpen, setNewSquadOpen] = useState(false)
  const [newSquadDraft, setNewSquadDraft] = useState({ id: '', label: '', emoji: '⚙️', color: '#6b7280' })
  const [newTagFor, setNewTagFor] = useState<string | null>(null) // category id
  const [newTagInput, setNewTagInput] = useState('')
  const [newTierOpen, setNewTierOpen] = useState(false)
  const [newTierDraft, setNewTierDraft] = useState({ id: '', label: '', color: '#6b7280' })

  // Edit / delete chip state — only one of these is non-null at a time.
  const [editingSquad, setEditingSquad] = useState<SquadDef | null>(null)
  const [deletingSquad, setDeletingSquad] = useState<{ squad: SquadDef; agentCount?: number; cascade?: boolean } | null>(null)
  const [editingTag, setEditingTag] = useState<{ category: string; tag: string; label: string; description: string } | null>(null)
  const [deletingTag, setDeletingTag] = useState<{ category: string; tag: string; agentCount?: number; cascade?: boolean } | null>(null)
  const [chipMutating, setChipMutating] = useState(false)

  // Bug 2 fix: refetch departments on initial mount AND any time the server
  // emits a taxonomy:update event (which fires after sub-dept PATCH or after
  // chokidar reseeds registry/departments JSON). Without this, the dropdown
  // shows stale cardLabel / pod / status until full page reload.
  // Also pass through ALL visual fields (Bug 1 fix).
  const reloadDepts = useCallback(() => {
    getDepartments()
      .then(d => {
        setDepts(d.departments.map(dep => ({
          id: dep.id,
          label: dep.label,
          color: dep.color,
          subDepartments: dep.subDepartments,
        })))
      })
      .catch(() => {/* non-critical */})
  }, [])
  useEffect(() => { reloadDepts() }, [reloadDepts])
  useEffect(() => {
    const es = subscribeOrgChart((ev) => {
      if (ev.type === 'taxonomy:update') reloadDepts()
    })
    return () => es.close()
  }, [reloadDepts])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Send null for empty squad/tags/department/etc so backend can clear them.
      const payload: OrgAgentPatch = {}
      const keys: (keyof OrgAgentPatch)[] = ['department','subDepartment','pod','reportsTo','secondaryReportsTo','title','tier','status','squad','tags','avatar','gender']
      for (const k of keys) {
        const v = form[k]
        if (v === undefined) continue
        // Empty string → null, empty arrays → clear
        if (v === '' || v === null) {
          (payload as Record<string, unknown>)[k] = null
        } else {
          (payload as Record<string, unknown>)[k] = v
        }
      }
      const res = await updateOrgAgent(agentId, payload)
      const hid = res?.historyId ?? null
      const agentName = extractEmoji(allNodes.find(n => n.id === agentId)?.name || agentId).cleanName
      if (hid != null) {
        toast('success', `Updated ${agentName}`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await undoOrgChange(hid)
                toast('success', 'Reverted')
                onSaved({ historyId: null })
              } catch (err) {
                toast('error', err instanceof Error ? err.message : 'Undo failed')
              }
            },
          },
        })
      } else {
        toast('success', `Updated ${agentName}`)
      }
      onSaved({ historyId: hid })
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-text-muted font-semibold block mb-1">{label}</label>
      {children}
    </div>
  )

  const selectCls = 'w-full bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent/50 transition-colors'

  // Sub-departments depend on the selected department.
  // Sort by `order` first, then label — matches the org-chart card render order.
  const currentDept = depts.find(d => d.id === form.department)
  const subDeptOpts = currentDept?.subDepartments
    ? Object.values(currentDept.subDepartments).sort((a, b) =>
        ((a.order ?? 999) - (b.order ?? 999)) || a.label.localeCompare(b.label)
      )
    : []
  // Pod options: dynamically derived from the selected dept's sub-departments.
  // Each sub-dept that declares a `pod` becomes a pod option. No more hardcoded
  // 3-team list — adding a new sub-dept to departments.json with a pod field
  // surfaces it here automatically.
  const podOpts = subDeptOpts
    .filter(s => !!s.pod)
    .map(s => ({ value: s.pod as string, label: s.cardLabel || s.label }))
  const showPod = podOpts.length > 0
  // Validation: warn if subDept selected but no pod set on the chosen sub-dept
  // (means agent will land in "Other" fallback rather than a real card).
  const selectedSubDept = subDeptOpts.find(s => s.id === form.subDepartment)
  const subDeptHasNoPod = !!form.subDepartment && selectedSubDept && !selectedSubDept.pod
  const subDeptUnknown = !!form.subDepartment && !selectedSubDept

  // Squad pills
  const currentSquad = form.squad || null

  // Tags toggle helper — works against any category, dynamic
  const toggleTagInForm = (cat: 'tech' | 'work-type', val: string) => {
    setForm(f => {
      const existing = f.tags || { tech: [], 'work-type': [] }
      const arr = (existing as Record<string, string[]>)[cat] || []
      const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
      return { ...f, tags: { ...existing, [cat]: next } as { tech: string[]; 'work-type': string[] } }
    })
  }

  const titleLen = (form.title || '').length
  const titleTooLong = titleLen > 80
  const advancedCount = (form.subDepartment ? 1 : 0) + (form.pod ? 1 : 0)
    + (form.tier && form.tier !== 'engineer' ? 1 : 0) + (form.secondaryReportsTo ? 1 : 0)

  const sectionHeading = (label: string) => (
    <div className="text-[10px] uppercase tracking-wider text-text-muted/70 font-semibold pt-1 pb-0.5">{label}</div>
  )

  return (
    <div className="space-y-4">
      {/* ── Squad picker ── */}
      {sectionHeading('Squad')}
      <div className="flex flex-wrap gap-1.5">
        {dynSquads.map(sq => {
          const active = currentSquad === sq.id
          return (
            <div key={sq.id} className="relative group">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, squad: active ? null : sq.id }))}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border"
                style={active
                  ? { background: sq.color, color: '#fff', borderColor: sq.color }
                  : { background: `${sq.color}15`, color: sq.color, borderColor: `${sq.color}38` }
                }
                title={sq.description}
              >
                <span>{sq.emoji}</span> {sq.label}
              </button>
              <div className="absolute -top-2 -right-2 hidden group-hover:flex [@media(hover:none)]:flex gap-0.5 z-10">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditingSquad(sq) }}
                  className="w-4 h-4 rounded-full bg-surface border border-border flex items-center justify-center shadow-sm hover:bg-accent hover:text-white hover:border-accent transition-colors"
                  title="Edit squad"
                  aria-label={`Edit ${sq.label}`}
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDeletingSquad({ squad: sq }) }}
                  className="w-4 h-4 rounded-full bg-surface border border-border flex items-center justify-center shadow-sm hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                  title="Delete squad"
                  aria-label={`Delete ${sq.label}`}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          )
        })}
        {/* + Add new squad */}
        <button
          type="button"
          onClick={() => setNewSquadOpen(v => !v)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/50"
          title="Create new squad"
        >
          + new
        </button>
        {currentSquad && (
          <button
            type="button"
            onClick={() => setForm(f => ({ ...f, squad: null }))}
            className="px-2 py-0.5 rounded-full text-[11px] text-text-muted hover:text-red-400"
          >
            clear
          </button>
        )}
      </div>
      {/* Inline new-squad form */}
      {newSquadOpen && (
        <div className="bg-surface-2 border border-accent/30 rounded-lg p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              value={newSquadDraft.emoji}
              onChange={e => setNewSquadDraft(d => ({ ...d, emoji: e.target.value }))}
              className="w-10 text-center bg-surface border border-border rounded-md px-1.5 py-1 text-xs"
              placeholder="🛠"
              maxLength={4}
            />
            <input
              value={newSquadDraft.label}
              onChange={e => setNewSquadDraft(d => ({ ...d, label: e.target.value, id: d.id || e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') }))}
              className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-xs"
              placeholder="Label — e.g. WordPress Squad"
            />
            <input
              type="color"
              value={newSquadDraft.color}
              onChange={e => setNewSquadDraft(d => ({ ...d, color: e.target.value }))}
              className="w-8 h-7 rounded border border-border bg-surface cursor-pointer"
              title="Squad color"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <input
              value={newSquadDraft.id}
              onChange={e => setNewSquadDraft(d => ({ ...d, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }))}
              className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-[11px] font-mono text-text-muted"
              placeholder="id (auto from label)"
            />
            <button
              type="button"
              disabled={!newSquadDraft.label || !newSquadDraft.id}
              onClick={async () => {
                try {
                  const res = await createSquad(newSquadDraft)
                  toast('success', `Squad "${res.squad.label}" created`)
                  setForm(f => ({ ...f, squad: res.squad.id }))
                  setNewSquadOpen(false)
                  setNewSquadDraft({ id: '', label: '', emoji: '⚙️', color: '#6b7280' })
                  refetchTaxonomy()
                } catch (err) {
                  toast('error', err instanceof Error ? err.message : 'Failed to create squad')
                }
              }}
              className="px-2.5 py-1 text-[11px] font-semibold bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-40"
            >
              Create
            </button>
            <button type="button" onClick={() => setNewSquadOpen(false)} className="text-[11px] text-text-muted hover:text-text px-1">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Identity ── */}
      <div className="border-t border-border/50 pt-3 space-y-3">
        {/* Avatar preview + custom photo URL */}
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <AgentIcon
              name={extractEmoji(allNodes.find(n => n.id === agentId)?.name || agentId).cleanName}
              id={agentId}
              avatar={form.avatar}
              gender={form.gender}
              size={56}
            />
          </div>
          <div className="flex-1">
            <input
              value={form.avatar || ''}
              onChange={e => setForm(f => ({ ...f, avatar: e.target.value || null }))}
              className={selectCls}
              placeholder="Photo URL — paste any image link"
            />
            <div className="text-[10px] text-text-muted mt-1">
              Leave empty to use the default. Paste any image URL to override.
            </div>
          </div>
        </div>

        {field('Title',
          <div>
            <input
              value={form.title || ''}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className={selectCls}
              placeholder="Short label — e.g. Feature Builder"
              maxLength={120}
            />
            <div className={`text-[10px] mt-1 ${titleTooLong ? 'text-amber-400' : 'text-text-muted'}`}>
              {titleTooLong ? `${titleLen}/120 — keep titles short (under 80 chars)` : `${titleLen}/120`}
            </div>
          </div>
        )}

        {field('Status',
          <select value={form.status || ''} onChange={e => setForm(f => ({ ...f, status: e.target.value || undefined }))} className={selectCls}>
            <option value="">— Default —</option>
            <option value="active">Active</option>
            <option value="probation">Probation</option>
            <option value="pip">PIP</option>
            <option value="retired">Retired</option>
          </select>
        )}
      </div>

      {/* ── Hierarchy ── */}
      <div className="border-t border-border/50 pt-3 space-y-3">
        {field('Department',
          <select
            value={form.department || ''}
            onChange={e => {
              // Bug 4 fix: when dept changes, BOTH subDepartment and pod must
              // reset — otherwise stale values from the previous dept silently
              // ride along through the PATCH and land the agent in "Other" or
              // "Unassigned" on the new card.
              const newDept = e.target.value || null
              setForm(f => ({ ...f, department: newDept, subDepartment: null, pod: null }))
            }}
            className={selectCls}>
            <option value="">— None —</option>
            {depts.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            {/* Bug 6 fix: if the agent currently has a department that's not
                in the active list (e.g. a deprecated dept), preserve the value
                so the user doesn't accidentally wipe it on save. */}
            {form.department && !depts.find(d => d.id === form.department) && (
              <option value={form.department}>
                ⚠️ {form.department} (deprecated/unknown)
              </option>
            )}
          </select>
        )}

        {field('Reports To',
          <select value={form.reportsTo || ''} onChange={e => setForm(f => ({ ...f, reportsTo: e.target.value || null }))} className={selectCls}>
            <option value="">— Nobody —</option>
            {allNodes.filter(n => n.id !== agentId).map(n => {
              const { cleanName: cn } = extractEmoji(n.name)
              return <option key={n.id} value={n.id}>{cn}</option>
            })}
          </select>
        )}
      </div>

      {/* ── Tags (dynamic, editable) ── */}
      <div className="border-t border-border/50 pt-3 space-y-3">
        {sectionHeading('Tags')}
        {Object.entries(tagCategories).map(([catId, cat]) => {
          const styles = pillStyleFor(catId)
          const allTags = Object.keys(cat.tags || {})
          const formTagsForCat = (form.tags as Record<string, string[]> | undefined)?.[catId] || []
          return (
            <div key={catId}>
              <div className="text-[10px] text-text-muted mb-1">{cat.label}</div>
              <div className="flex flex-wrap gap-1 items-center">
                {allTags.map(t => {
                  const active = formTagsForCat.includes(t)
                  const tagDef = cat.tags[t]
                  return (
                    <div key={t} className="relative group">
                      <button
                        type="button"
                        onClick={() => toggleTagInForm(catId as 'tech' | 'work-type', t)}
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all ${active ? styles.pillActive : styles.pill}`}
                        title={tagDef?.description || t}
                      >
                        {tagDef?.label || t}
                      </button>
                      <div className="absolute -top-2 -right-2 hidden group-hover:flex [@media(hover:none)]:flex gap-0.5 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingTag({ category: catId, tag: t, label: tagDef?.label || t, description: tagDef?.description || '' })
                          }}
                          className="w-3.5 h-3.5 rounded-full bg-surface border border-border flex items-center justify-center shadow-sm hover:bg-accent hover:text-white hover:border-accent transition-colors"
                          title="Edit tag"
                          aria-label={`Edit ${t}`}
                        >
                          <Pencil className="w-2 h-2" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeletingTag({ category: catId, tag: t })
                          }}
                          className="w-3.5 h-3.5 rounded-full bg-surface border border-border flex items-center justify-center shadow-sm hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                          title="Delete tag"
                          aria-label={`Delete ${t}`}
                        >
                          <Trash2 className="w-2 h-2" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {/* + Add tag inline */}
                {newTagFor === catId ? (
                  <span className="inline-flex items-center gap-1">
                    <input
                      autoFocus
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      onKeyDown={async e => {
                        if (e.key === 'Enter') {
                          if (!newTagInput.trim()) return
                          try {
                            await createTag(catId, newTagInput.trim())
                            toast('success', `Tag "${newTagInput}" added to ${cat.label}`)
                            setNewTagFor(null); setNewTagInput('')
                            refetchTaxonomy()
                          } catch (err) {
                            toast('error', err instanceof Error ? err.message : 'Failed')
                          }
                        }
                        if (e.key === 'Escape') { setNewTagFor(null); setNewTagInput('') }
                      }}
                      placeholder="new-tag-id"
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-surface-2 border border-accent/40 rounded-full outline-none w-24"
                    />
                    <button
                      type="button"
                      onClick={() => { setNewTagFor(null); setNewTagInput('') }}
                      className="text-[10px] text-text-muted hover:text-red-400"
                    >
                      ✕
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewTagFor(catId)}
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/50"
                    title={`Add new tag to ${cat.label}`}
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Advanced (collapsible) ── */}
      <div className="border-t border-border/50 pt-3">
        <button
          type="button"
          onClick={() => setShowAdvanced(s => !s)}
          className="w-full flex items-center justify-between text-[11px] uppercase tracking-wider text-text-muted/70 font-semibold hover:text-text-muted transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : '-rotate-90'}`} />
            Advanced
            {!showAdvanced && advancedCount > 0 && (
              <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">{advancedCount}</span>
            )}
          </span>
          {!showAdvanced && <span className="text-[10px] text-text-muted/60 normal-case tracking-normal">Sub-dept · Pod · Tier · 2nd reports</span>}
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3">
            {subDeptOpts.length > 0 && field('Sub-department',
              <div className="space-y-1.5">
                <select value={form.subDepartment || ''} onChange={e => {
                  const newSub = e.target.value || null
                  // Auto-populate `pod` when the chosen sub-dept declares one — eliminates
                  // the "subDept selected but no pod" silent-Other-fallback failure mode.
                  // Setting null sub-dept clears pod too, so dept-only assignment
                  // doesn't carry stale pod from a previous sub-dept.
                  const matched = subDeptOpts.find(s => s.id === newSub)
                  setForm(f => ({
                    ...f,
                    subDepartment: newSub,
                    pod: newSub ? (matched?.pod ?? null) : null,
                  }))
                }} className={selectCls}>
                  <option value="">— None —</option>
                  {subDeptOpts.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.cardEmoji ? `${s.cardEmoji} ` : ''}{s.cardLabel || s.label}
                      {s.status && s.status !== 'active' ? ` (${s.status})` : ''}
                    </option>
                  ))}
                  {/* Bug 6 fix (sub-dept variant): preserve unknown sub-dept value */}
                  {form.subDepartment && !subDeptOpts.find(s => s.id === form.subDepartment) && (
                    <option value={form.subDepartment}>
                      ⚠️ {form.subDepartment} (unknown — fix or replace)
                    </option>
                  )}
                </select>
                {subDeptUnknown && (
                  <div className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    ⚠️ '{form.subDepartment}' is not registered in departments.json for {currentDept?.label}. Agent will land in "Other" column. Add it to departments.json or pick a valid value.
                  </div>
                )}
                {subDeptHasNoPod && (
                  <div className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    ⚠️ Sub-dept '{selectedSubDept?.label}' has no `pod` field. Agent may render outside the team card.
                  </div>
                )}
              </div>
            )}

            {showPod && field('Team',
              <select value={form.pod || ''} onChange={e => setForm(f => ({ ...f, pod: e.target.value || null }))} className={selectCls}>
                <option value="">— None —</option>
                {podOpts.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            )}

            {field('Tier',
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <select
                    value={form.tier || ''}
                    onChange={e => setForm(f => ({ ...f, tier: e.target.value || undefined }))}
                    className={`${selectCls} flex-1`}
                  >
                    <option value="">— Default —</option>
                    {dynTiers.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setNewTierOpen(v => !v)}
                    className="px-2 py-1.5 rounded-md text-[11px] font-semibold border border-dashed border-border text-text-muted hover:text-accent hover:border-accent/50"
                    title="Create new tier"
                  >
                    + new
                  </button>
                </div>
                {newTierOpen && (
                  <div className="bg-surface-2 border border-accent/30 rounded-lg p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={newTierDraft.label}
                        onChange={e => setNewTierDraft(d => ({ ...d, label: e.target.value, id: d.id || e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') }))}
                        className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-xs"
                        placeholder="Label — e.g. Director"
                      />
                      <input
                        type="color"
                        value={newTierDraft.color}
                        onChange={e => setNewTierDraft(d => ({ ...d, color: e.target.value }))}
                        className="w-8 h-7 rounded border border-border bg-surface cursor-pointer"
                        title="Tier color"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={newTierDraft.id}
                        onChange={e => setNewTierDraft(d => ({ ...d, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') }))}
                        className="flex-1 bg-surface border border-border rounded-md px-2 py-1 text-[11px] font-mono text-text-muted"
                        placeholder="id (auto from label)"
                      />
                      <button
                        type="button"
                        disabled={!newTierDraft.label || !newTierDraft.id}
                        onClick={async () => {
                          try {
                            const res = await createTier(newTierDraft)
                            toast('success', `Tier "${res.tier.label}" created`)
                            setForm(f => ({ ...f, tier: res.tier.id }))
                            setNewTierOpen(false)
                            setNewTierDraft({ id: '', label: '', color: '#6b7280' })
                            refetchTaxonomy()
                          } catch (err) {
                            toast('error', err instanceof Error ? err.message : 'Failed to create tier')
                          }
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-40"
                      >
                        Create
                      </button>
                      <button type="button" onClick={() => setNewTierOpen(false)} className="text-[11px] text-text-muted hover:text-text px-1">
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {field('Secondary Reports To',
              <select value={form.secondaryReportsTo || ''} onChange={e => setForm(f => ({ ...f, secondaryReportsTo: e.target.value || null }))} className={selectCls}>
                <option value="">— None —</option>
                {allNodes.filter(n => n.id !== agentId && n.id !== form.reportsTo).map(n => {
                  const { cleanName: cn } = extractEmoji(n.name)
                  return <option key={n.id} value={n.id}>{cn}</option>
                })}
              </select>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
      >
        {saving ? (
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Check className="w-3.5 h-3.5" />
        )}
        {saving ? 'Saving…' : 'Save'}
      </button>

      {/* ── Edit / delete chip modals ── */}
      <EditSquadModal
        open={!!editingSquad}
        squad={editingSquad}
        onClose={() => setEditingSquad(null)}
        onSaved={() => { setEditingSquad(null); refetchTaxonomy() }}
      />
      <EditTagModal
        open={!!editingTag}
        category={editingTag?.category ?? null}
        tag={editingTag?.tag ?? null}
        initialLabel={editingTag?.label ?? ''}
        initialDescription={editingTag?.description ?? ''}
        onClose={() => setEditingTag(null)}
        onSaved={() => { setEditingTag(null); refetchTaxonomy() }}
      />
      <ConfirmDialog
        open={!!deletingSquad}
        onClose={() => setDeletingSquad(null)}
        title={`Delete squad "${deletingSquad?.squad.label || ''}"?`}
        message={
          deletingSquad?.agentCount
            ? `${deletingSquad.agentCount} agent(s) currently use this squad. Choose to also remove it from those agents, or cancel.`
            : 'This action cannot be undone.'
        }
        confirmLabel={
          deletingSquad?.agentCount
            ? `Delete + remove from ${deletingSquad.agentCount} agent${deletingSquad.agentCount === 1 ? '' : 's'}`
            : 'Delete'
        }
        danger
        loading={chipMutating}
        onConfirm={async () => {
          if (!deletingSquad) return
          setChipMutating(true)
          try {
            // First attempt — strict (no cascade) so user sees agentCount.
            // If we already saw the conflict, second click cascades.
            if (deletingSquad.agentCount && deletingSquad.agentCount > 0) {
              await deleteSquadDef(deletingSquad.squad.id, { cascade: true })
              toast('success', `Squad deleted + cleared from ${deletingSquad.agentCount} agent${deletingSquad.agentCount === 1 ? '' : 's'}`)
              if (form.squad === deletingSquad.squad.id) setForm(f => ({ ...f, squad: null }))
              setDeletingSquad(null)
              refetchTaxonomy()
              return
            }
            const res = await tryDeleteSquadDef(deletingSquad.squad.id)
            if ('agentCount' in res && res.agentCount > 0) {
              // Stay open, show count + relabel button on next render
              setDeletingSquad({ ...deletingSquad, agentCount: res.agentCount, cascade: true })
              return
            }
            toast('success', `Squad "${deletingSquad.squad.label}" deleted`)
            if (form.squad === deletingSquad.squad.id) setForm(f => ({ ...f, squad: null }))
            setDeletingSquad(null)
            refetchTaxonomy()
          } catch (e: unknown) {
            toast('error', e instanceof Error ? e.message : 'Delete failed')
          } finally {
            setChipMutating(false)
          }
        }}
      />
      <ConfirmDialog
        open={!!deletingTag}
        onClose={() => setDeletingTag(null)}
        title={`Delete tag "${deletingTag?.tag || ''}"?`}
        message={
          deletingTag?.agentCount
            ? `${deletingTag.agentCount} agent(s) currently have this tag. Choose to also strip it from those agents, or cancel.`
            : 'This action cannot be undone.'
        }
        confirmLabel={
          deletingTag?.agentCount
            ? `Delete + strip from ${deletingTag.agentCount} agent${deletingTag.agentCount === 1 ? '' : 's'}`
            : 'Delete'
        }
        danger
        loading={chipMutating}
        onConfirm={async () => {
          if (!deletingTag) return
          setChipMutating(true)
          try {
            if (deletingTag.agentCount && deletingTag.agentCount > 0) {
              await deleteTagDef(deletingTag.category, deletingTag.tag, { cascade: true })
              toast('success', `Tag deleted + cleared from ${deletingTag.agentCount} agent${deletingTag.agentCount === 1 ? '' : 's'}`)
              setDeletingTag(null)
              refetchTaxonomy()
              return
            }
            const res = await tryDeleteTagDef(deletingTag.category, deletingTag.tag)
            if ('agentCount' in res && res.agentCount > 0) {
              setDeletingTag({ ...deletingTag, agentCount: res.agentCount, cascade: true })
              return
            }
            toast('success', `Tag "${deletingTag.tag}" deleted`)
            setDeletingTag(null)
            refetchTaxonomy()
          } catch (e: unknown) {
            toast('error', e instanceof Error ? e.message : 'Delete failed')
          } finally {
            setChipMutating(false)
          }
        }}
      />
    </div>
  )
}

// ── Unregistered Agent Panel ──────────────────────────────────────────────────

function UnregisteredPanel({
  agentId,
  agentInfo,
  allNodes,
  onClose,
  onSaved,
}: {
  agentId: string
  agentInfo: Agent | null
  allNodes: OrgChartNode[]
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <div className="absolute top-0 right-0 w-[340px] h-full bg-surface border-l border-border z-20 overflow-y-auto shadow-2xl animate-slide-in">
      <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-start gap-3 z-10">
        <div className="w-11 h-11 rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold truncate">{agentInfo?.name || agentId}</h3>
          <p className="text-[11px] text-amber-400 mt-0.5">Not registered in org</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {agentInfo?.description && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">Description</p>
            <p className="text-xs text-text-secondary leading-relaxed">{agentInfo.description}</p>
          </div>
        )}

        <div>
          <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-3 flex items-center gap-1.5">
            <Settings className="w-3 h-3" /> Org Setup
          </p>
          <OrgSetupForm
            agentId={agentId}
            initial={{ title: agentInfo?.name || agentId, tier: 'engineer', status: 'active' }}
            allNodes={allNodes}
            onSaved={onSaved}
          />
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

// Compact load + perf card shown at top of detail panel.
function AgentCapacityCard({ node }: { node: OrgChartNode }) {
  const active = node.activeTaskCount ?? 0
  const max = node.maxConcurrentTasks ?? 3
  const status = node.loadStatus ?? 'free'
  const sr = node.successRate
  const avgDur = node.avgDurationMs
  const color = status === 'free' ? '#10b981' : status === 'busy' ? '#f59e0b' : '#ef4444'
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">Live capacity</p>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase"
          style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
        >
          {status}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-base font-bold tabular-nums">{active}/{max}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">Tasks</div>
        </div>
        <div>
          <div className="text-base font-bold tabular-nums">
            {typeof sr === 'number' ? `${Math.round(sr * 100)}%` : '—'}
          </div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">Success</div>
        </div>
        <div>
          <div className="text-base font-bold tabular-nums">
            {avgDur ? `${Math.round(avgDur / 1000)}s` : '—'}
          </div>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">Avg dur</div>
        </div>
      </div>
    </div>
  )
}

// Recent tasks list — fetches via Phase A `/dispatch/agents/:id/tasks`.
function AgentRecentTasks({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<import('../lib/api').Task[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    import('../lib/api').then(({ getAgentTasks }) =>
      getAgentTasks(agentId, 10).then(({ items: data }) => {
        if (!cancelled) setItems(data)
      }).catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load tasks')
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    )
    return () => { cancelled = true }
  }, [agentId])

  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">Recent tasks</p>
      {loading && <p className="text-xs text-text-muted">Loading…</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}
      {!loading && !err && items.length === 0 && (
        <p className="text-xs text-text-muted italic">No tasks dispatched yet.</p>
      )}
      {!loading && !err && items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((t) => {
            const statusColor =
              t.status === 'completed' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
              t.status === 'failed'    ? 'text-red-400 bg-red-500/10 border-red-500/30' :
              t.status === 'running'   ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
              t.status === 'cancelled' ? 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' :
                                         'text-blue-400 bg-blue-500/10 border-blue-500/30'
            return (
              <div key={t.id} className="rounded-lg bg-surface-2/50 border border-border px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${statusColor}`}>
                    {t.status}
                  </span>
                  <span className="text-[10px] text-text-muted font-bold uppercase">{t.taskType || 'task'}</span>
                  <span className="text-[10px] text-text-muted ml-auto">{t.priority}</span>
                </div>
                <div className="text-xs font-medium truncate">{t.title || t.prompt || t.id}</div>
                <div className="text-[10px] text-text-muted mt-0.5">
                  {t.assignedAt ? new Date(t.assignedAt).toLocaleString() : '—'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 3-column identity grid mirroring AgentCapacityCard's stat-card pattern.
// Differentiates Level / Model / Department by color so they don't all look
// like generic gray pills.
function AgentIdentityCard({ node }: { node: OrgChartNode }) {
  const lvl = node.level ?? 0
  const lvlColors = levelColors(lvl)
  const model = MODEL_BADGES[node.model]
  const deptColor = node.departmentColor || '#6b7280'

  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="grid grid-cols-3 gap-2">
        {/* LEVEL */}
        <div className={`rounded-lg ring-1 ${lvlColors.ring} ${lvlColors.bg} px-2 py-2 text-center`}>
          <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Level</div>
          <div className={`text-[13px] font-extrabold mt-0.5 ${lvlColors.text}`}>
            {node.levelTitle || '—'}
          </div>
          {node.yearsOfExperience != null && (
            <div className="text-[10px] text-text-muted tabular-nums mt-0.5 font-mono">
              {node.yearsOfExperience.toFixed(1)}y
            </div>
          )}
        </div>
        {/* MODEL */}
        <div
          className="rounded-lg px-2 py-2 text-center border"
          style={{
            backgroundColor: model?.bg || 'rgba(107,114,128,0.08)',
            borderColor: model?.border || 'rgba(107,114,128,0.25)',
          }}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Model</div>
          <div
            className="text-[13px] font-extrabold mt-0.5"
            style={{ color: model?.text || 'var(--color-text)' }}
          >
            {model?.label || node.model || '—'}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5 capitalize">{node.tier}</div>
        </div>
        {/* DEPARTMENT */}
        <div
          className="rounded-lg px-2 py-2 text-center border"
          style={{
            backgroundColor: `${deptColor}15`,
            borderColor: `${deptColor}40`,
          }}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Dept</div>
          <div className="text-[13px] font-extrabold mt-0.5 truncate" style={{ color: deptColor }}>
            {node.departmentLabel || '—'}
          </div>
          {node.pod && (
            <div className="text-[10px] text-text-muted mt-0.5 uppercase tracking-wide">
              {node.pod}
            </div>
          )}
        </div>
      </div>
      {/* Caption row */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40 text-[10px] text-text-muted">
        <span className="capitalize">{node.tier} tier</span>
        {node.status && node.status !== 'active' && (
          <>
            <span>·</span>
            <span className={`capitalize font-bold ${
              node.status === 'pip' ? 'text-red-400' :
              node.status === 'probation' ? 'text-amber-400' :
              node.status === 'pending' ? 'text-sky-400' :
              'text-text-muted'
            }`}>
              {node.status}
            </span>
          </>
        )}
        {node.experiencePoints != null && (
          <>
            <span className="ml-auto tabular-nums">{node.experiencePoints} XP</span>
          </>
        )}
      </div>
    </div>
  )
}

// Parse a free-form agent description into structured sections so the
// detail panel reads like a profile card instead of a wall of text.
// Heuristics:
//   - First sentence → bold lead summary
//   - "Word: a, b, c, d" segment → bullet list under that word as label
//     (handles em-dash separators too: "single owner of X: a, b — placeholder ...")
//   - "Reports up to ..." → stripped (REPORTS TO panel already shows this)
//   - "Hired Sprint N" / "Hired Cohort N" / "Hired YYYY-MM-DD" → small badge
//   - Remaining sentences → paragraph footer
type ParsedDescription = {
  lead: string
  bulletLabel: string | null
  bullets: string[]
  rest: string[]
  hired: string | null
}

function parseDescription(raw: string): ParsedDescription {
  const text = raw.trim().replace(/\s+/g, ' ')
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(Boolean)
  const out: ParsedDescription = { lead: '', bulletLabel: null, bullets: [], rest: [], hired: null }
  if (sentences.length === 0) return out
  out.lead = sentences[0]
  const remaining: string[] = []
  for (let i = 1; i < sentences.length; i += 1) {
    const s = sentences[i]
    const hiredMatch = s.match(/^Hired\s+(.+?)\.?$/i)
    if (hiredMatch) {
      out.hired = hiredMatch[1].trim()
      continue
    }
    if (/^Reports?\s+(up\s+)?to\b/i.test(s)) continue
    // Bullet pattern: "X: a, b, c, d" — only fire on first match, ≥2 commas
    if (!out.bullets.length) {
      const colonIdx = s.indexOf(':')
      if (colonIdx > 0) {
        const label = s.slice(0, colonIdx).trim()
        const tail = s.slice(colonIdx + 1).replace(/\.$/, '').trim()
        // Split on comma, then split off em-dash trailing remarks
        const parts = tail.split(/,\s*/).map(p => p.trim()).filter(Boolean)
        if (parts.length >= 2 && label.length < 60) {
          out.bulletLabel = label
          for (const p of parts) {
            const dashSplit = p.split(/\s+[—–-]\s+/)
            if (dashSplit.length === 2 && dashSplit[1].length < 80) {
              out.bullets.push(dashSplit[0])
              remaining.push(dashSplit[1])
            } else {
              out.bullets.push(p)
            }
          }
          continue
        }
      }
    }
    remaining.push(s)
  }
  out.rest = remaining
  return out
}

// Visual description block — structured layout, single source of truth for
// how an agent's free-form description is presented in the detail panel.
function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  const parsed = useMemo(() => parseDescription(text), [text])
  const hasExpandableContent = parsed.bullets.length > 0 || parsed.rest.length > 0 || !!parsed.hired
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">Role</p>
      <p className="text-sm text-text leading-relaxed font-medium">
        {parsed.lead}
      </p>
      {expanded && (
        <>
          {parsed.bullets.length > 0 && (
            <div className="mt-3">
              {parsed.bulletLabel && (
                <p className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">
                  {parsed.bulletLabel}
                </p>
              )}
              <ul className="space-y-1">
                {parsed.bullets.map((b, i) => (
                  <li key={i} className="text-xs text-text-secondary leading-relaxed flex gap-2">
                    <span className="text-accent mt-1.5 shrink-0 inline-block w-1 h-1 rounded-full bg-accent" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {parsed.rest.length > 0 && (
            <p className="mt-3 text-xs text-text-muted leading-relaxed">
              {parsed.rest.join(' ')}
            </p>
          )}
          {parsed.hired && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-2 border border-border text-[10px] uppercase tracking-wider text-text-muted font-semibold">
              <span className="text-accent">Hired</span>
              <span className="text-text-secondary normal-case tracking-normal">{parsed.hired}</span>
            </div>
          )}
        </>
      )}
      {hasExpandableContent && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-accent hover:underline text-xs font-semibold"
        >
          {expanded ? 'Show less' : 'Show details'}
        </button>
      )}
    </div>
  )
}

function DetailPanel({
  node,
  allNodes,
  onClose,
  onNavigate,
  onOrgSaved,
  locked = false,
  onToggleLock,
}: {
  node: OrgChartNode
  allNodes: OrgChartNode[]
  onClose: () => void
  onNavigate: (id: string) => void
  onOrgSaved: () => void
  locked?: boolean
  onToggleLock?: (next: boolean) => void
}) {
  const [showOrgSetup, setShowOrgSetup] = useState(false)
  const { tierById } = useTaxonomy()
  const { emoji, cleanName } = extractEmoji(node.name)
  const TierIcon = getTierIcon(tierById[node.tier]?.icon)
  const directReports = allNodes.filter(n => n.reportsTo === node.id)
  const reportsToNode = node.reportsTo
    ? allNodes.find(n => n.id === node.reportsTo)
    : null

  return (
    <div className="absolute top-0 right-0 w-[340px] h-full bg-surface border-l border-border z-20 overflow-y-auto shadow-2xl animate-slide-in">
      {/* Header */}
      <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-start gap-3 z-10">
        <AgentIcon name={cleanName} uid={`detail-${node.id}`} size={44} global />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {emoji && <span className="text-xl">{emoji}</span>}
            <h3 className="text-base font-bold truncate">{cleanName}</h3>
            {locked && (
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="Position locked" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <TierIcon className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">{node.title}</span>
          </div>
        </div>
        {onToggleLock && (
          <button
            onClick={() => onToggleLock(!locked)}
            title={locked ? 'Unlock card position' : 'Lock card to current position'}
            className={`p-1.5 rounded-lg shrink-0 transition-colors ${
              locked
                ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                : 'hover:bg-surface-2 text-text-muted hover:text-amber-400'
            }`}
          >
            {locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Identity grid — 3-column stat layout: Level / Model / Department */}
        <AgentIdentityCard node={node} />

        {/* Live capacity + perf */}
        <AgentCapacityCard node={node} />

        {/* Recent tasks (Phase A) */}
        <AgentRecentTasks agentId={node.id} />

        {/* Description — first sentence by default with Show more toggle */}
        {node.description && <DescriptionBlock text={node.description} />}

        {/* Tools */}
        {node.tools && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">Tools</p>
            <div className="flex flex-wrap gap-1.5">
              {node.tools.split(',').map(t => (
                <span key={t.trim()} className="text-[11px] px-2 py-0.5 rounded-md bg-surface-2 text-text-muted font-mono">
                  {t.trim()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reports to */}
        {reportsToNode && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">Reports to</p>
            <button
              onClick={() => onNavigate(reportsToNode.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors w-full text-left"
            >
              <AgentIcon name={extractEmoji(reportsToNode.name).cleanName} uid={`rpt-${reportsToNode.id}`} size={24} global />
              <div>
                <span className="text-xs font-semibold">{extractEmoji(reportsToNode.name).cleanName}</span>
                <span className="text-[10px] text-text-muted block">{reportsToNode.title}</span>
              </div>
            </button>
          </div>
        )}

        {/* Direct reports */}
        {directReports.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-1.5">
              Direct reports ({directReports.length})
            </p>
            <div className="space-y-1.5">
              {directReports.map(r => {
                const { cleanName: rName } = extractEmoji(r.name)
                return (
                  <button
                    key={r.id}
                    onClick={() => onNavigate(r.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors w-full text-left"
                  >
                    <AgentIcon name={rName} uid={`dr-${r.id}`} size={24} global />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold truncate block">{rName}</span>
                      <span className="text-[10px] text-text-muted">{r.title}</span>
                    </div>
                    <div
                      className="w-2 h-2 rounded-full ml-auto shrink-0"
                      style={{ backgroundColor: r.phaseColor }}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Org Setup — editable org properties */}
        <div className="border-t border-border pt-4">
          <button
            onClick={() => setShowOrgSetup(s => !s)}
            className="w-full flex items-center justify-between text-[11px] uppercase tracking-wider text-text-muted font-semibold mb-2 hover:text-text transition-colors"
          >
            <span className="flex items-center gap-1.5"><Settings className="w-3 h-3" /> Org Setup</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showOrgSetup ? 'rotate-180' : ''}`} />
          </button>
          {showOrgSetup && (
            <OrgSetupForm
              agentId={node.id}
              initial={{
                department: node.department ?? null,
                subDepartment: node.subDepartment ?? null,
                pod: node.pod ?? null,
                reportsTo: node.reportsTo ?? null,
                secondaryReportsTo: node.secondaryReportsTo ?? null,
                title: node.title,
                tier: node.tier,
                status: node.status,
                squad: node.squad ?? null,
                tags: node.tags ?? { tech: [], 'work-type': [] },
                avatar: node.avatar ?? null,
                gender: node.gender ?? null,
              }}
              allNodes={allNodes}
              onSaved={onOrgSaved}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Search helper (shared between tree and list views) ───────────────────────

function computeSearchSets(allNodes: OrgChartNode[], search: string) {
  if (!search) return { matchIds: null, relevantIds: null }

  const q = search.toLowerCase()
  const matchIds = new Set(
    allNodes
      .filter(n =>
        n.name.toLowerCase().includes(q)
        || n.title.toLowerCase().includes(q)
        || n.id.toLowerCase().includes(q)
        || (n.description || '').toLowerCase().includes(q),
      )
      .map(n => n.id),
  )

  // Include ancestors of matches so tree paths stay visible
  const relevantIds = new Set<string>()
  const addAncestors = (id: string) => {
    if (relevantIds.has(id)) return // prevent cycles
    relevantIds.add(id)
    const node = allNodes.find(n => n.id === id)
    if (node?.reportsTo) addAncestors(node.reportsTo)
  }
  matchIds.forEach(id => addAncestors(id))

  return { matchIds, relevantIds }
}

// ── Tree View (ReactFlow) ────────────────────────────────────────────────────

function TreeViewInner({
  data,
  search,
  tagMatchIds,
  selectedNode,
  onSelectNode,
  selectedNodeData,
  onNavigateToNode,
  onOrgSaved,
}: {
  data: OrgChartData
  search: string
  tagMatchIds: Set<string> | null
  selectedNode: string | null
  onSelectNode: (id: string | null) => void
  selectedNodeData: OrgChartNode | null
  onNavigateToNode: (id: string) => void
  onOrgSaved: () => void
}) {
  const { tierById } = useTaxonomy()

  // Persistent drag positions + per-node lock state. Locked nodes survive the
  // Auto-adjust button (only unlocked positions get cleared) and are
  // non-draggable.
  const [positionOverrides, setPositionOverrides] = useState<Record<string, { x: number; y: number; locked: boolean }>>({})
  const reloadPositions = useCallback(async () => {
    try {
      const { getOrgChartPositions } = await import('../lib/api')
      const { positions } = await getOrgChartPositions()
      const out: Record<string, { x: number; y: number; locked: boolean }> = {}
      for (const [nid, p] of Object.entries(positions)) {
        out[nid] = { x: p.x, y: p.y, locked: !!p.locked }
      }
      setPositionOverrides(out)
    } catch { /* non-critical */ }
  }, [])
  useEffect(() => { reloadPositions() }, [reloadPositions])

  const { rfNodes: rawNodes, rfEdges: initialEdges } = useMemo(
    () => computeDepartmentLayout(data.nodes, data.departments, tierById),
    [data.nodes, data.departments, tierById],
  )

  // Overlay saved positions + lock state onto the computed layout. Locked
  // nodes get `draggable=false` and a `data.locked=true` flag so the card
  // component can render a padlock indicator.
  const initialNodes = useMemo(() => {
    if (Object.keys(positionOverrides).length === 0) return rawNodes
    return rawNodes.map(n => {
      const o = positionOverrides[n.id]
      if (!o) return n
      return {
        ...n,
        position: { x: o.x, y: o.y },
        draggable: !o.locked,
        data: { ...(n.data as object), locked: o.locked },
      }
    })
  }, [rawNodes, positionOverrides])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [capturing, setCapturing] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const reactFlow = useReactFlow()

  // Track browser fullscreen state
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen()
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Fullscreen failed')
    }
  }, [])

  const handleScreenshot = useCallback(async () => {
    if (capturing) return
    const container = containerRef.current
    if (!container) return

    const viewport = container.querySelector<HTMLElement>('.react-flow__viewport')
    if (!viewport) {
      toast('error', 'Unable to capture — viewport not found')
      return
    }

    setCapturing(true)
    try {
      // Compute bounds of all nodes so we capture the whole tree
      const bounds = getNodesBounds(nodes)
      const padding = 40
      const imageWidth = Math.ceil(bounds.width) + padding * 2
      const imageHeight = Math.ceil(bounds.height) + padding * 2
      const viewportTransform = getViewportForBounds(
        bounds,
        imageWidth,
        imageHeight,
        0.5, // minZoom
        2,   // maxZoom
        0.08, // padding (fraction)
      )

      // Read theme background color from CSS var
      const bgColor = getComputedStyle(document.body)
        .getPropertyValue('--color-bg')
        .trim() || '#09090b'

      const dataUrl = await toPng(viewport, {
        backgroundColor: bgColor,
        width: imageWidth,
        height: imageHeight,
        pixelRatio: 2,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${viewportTransform.x}px, ${viewportTransform.y}px) scale(${viewportTransform.zoom})`,
        },
        // Skip elements that shouldn't appear in the screenshot
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true
          const cls = node.classList
          if (!cls) return true
          return !cls.contains('react-flow__controls')
            && !cls.contains('react-flow__minimap')
            && !cls.contains('react-flow__attribution')
            && !cls.contains('react-flow__panel')
        },
      })

      // Trigger browser download
      const link = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const filename = `org-chart-${ts}.png`
      link.download = filename
      link.href = dataUrl
      link.click()

      toast('success', `Screenshot saved: ${filename}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Screenshot failed')
    } finally {
      setCapturing(false)
    }
  }, [nodes, capturing])

  // Sync layout state when the source layout changes (data.nodes / data.departments
  // updated via initial load or SSE). Search dimming is applied on top of the
  // freshly-computed positions so node coordinates never go stale.
  // The previous version mapped over `nds` (existing state), which meant new
  // nodes from a re-layout (e.g. after registry edits) were never inserted and
  // removed nodes lingered with old positions.
  useEffect(() => {
    const { matchIds: searchMatchIds } = computeSearchSets(data.nodes, search)

    // Combine search matchIds + tagMatchIds: AND logic — node must satisfy both filters
    const matchIds: Set<string> | null = (() => {
      if (!searchMatchIds && !tagMatchIds) return null
      if (searchMatchIds && tagMatchIds) return new Set([...searchMatchIds].filter(id => tagMatchIds.has(id)))
      return searchMatchIds ?? tagMatchIds
    })()

    const nextNodes = initialNodes.map(n => {
      if (n.type === 'orgLeader') {
        const leaderData = n.data as LeaderNodeData
        return {
          ...n,
          data: {
            ...leaderData,
            dimmed: matchIds ? !matchIds.has(leaderData.id) : false,
          },
        }
      }
      if (n.type === 'orgDept') {
        const deptData = n.data as DepartmentNodeData
        const updatedMembers = deptData.members.map(m => ({
          ...m,
          dimmed: matchIds ? !matchIds.has(m.id) : false,
        }))
        const anyMatch = matchIds
          ? updatedMembers.some(m => !m.dimmed)
          : true
        return {
          ...n,
          data: {
            ...deptData,
            members: updatedMembers,
            dimmed: !anyMatch,
          },
        }
      }
      return n
    })

    const nextEdges = initialEdges.map(e => {
      if (!matchIds) return { ...e, style: { ...e.style, opacity: e.style?.opacity ?? 0.55 } }
      const isDeptColEdge = typeof e.target === 'string' && e.target.startsWith('dept-')
      if (isDeptColEdge) {
        const deptId = e.target.slice(5)
        const deptMembers = data.nodes.filter(n => n.department === deptId)
        const hasMatch = deptMembers.some(m => matchIds.has(m.id))
        return { ...e, style: { ...e.style, opacity: hasMatch ? 0.55 : 0.08 } }
      }
      const headId = e.target
      const head = data.nodes.find(n => n.id === headId)
      const subtreeMatch = head
        ? matchIds.has(head.id) || data.nodes.some(n => n.department === head.department && matchIds.has(n.id))
        : false
      return { ...e, style: { ...e.style, opacity: subtreeMatch ? 0.6 : 0.08 } }
    })

    setNodes(nextNodes)
    setEdges(nextEdges)
  }, [initialNodes, initialEdges, search, tagMatchIds, data.nodes, setNodes, setEdges])

  // Refit the viewport whenever the layout dimensions change (new agents added,
  // dept heads appear/disappear, etc.). Without this, the initial `fitView`
  // prop only fires on mount — if the layout grows taller after data refresh,
  // users see a clipped view + a stale minimap.
  useEffect(() => {
    if (initialNodes.length === 0) return
    // Defer to next frame so React Flow has applied the new positions before
    // it computes node bounds for fit-to-view.
    const id = window.requestAnimationFrame(() => {
      reactFlow.fitView({ padding: 0.12, duration: 300, maxZoom: 1 })
    })
    return () => window.cancelAnimationFrame(id)
  }, [initialNodes, reactFlow])

  // Leader nodes are clicked directly; department members bubble up via context.
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'orgLeader') {
        onSelectNode(node.id === selectedNode ? null : node.id)
      }
      // Department node clicks are handled by individual member buttons inside
    },
    [onSelectNode, selectedNode],
  )

  const handlePaneClick = useCallback(() => {
    onSelectNode(null)
  }, [onSelectNode])

  // Stable callback for OrgSelectContext — toggles selection on click
  const handleMemberSelect = useCallback((id: string) => {
    onSelectNode(id === selectedNode ? null : id)
  }, [onSelectNode, selectedNode])

  // Shared lock-toggle handler — used by detail panel + per-card lock buttons.
  // Locked cards survive Auto-adjust layout and are non-draggable.
  const nodesRef = useRef<typeof nodes>(nodes)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  const handleToggleLock = useCallback(async (id: string, next: boolean) => {
    try {
      const { toggleOrgChartLock, saveOrgChartPositions } = await import('../lib/api')
      const current = positionOverrides[id]
      if (next && !current) {
        const liveNode = nodesRef.current.find(n => n.id === id)
        if (liveNode) {
          await saveOrgChartPositions([{ nodeId: id, x: liveNode.position.x, y: liveNode.position.y }])
        }
      }
      await toggleOrgChartLock(id, next)
      await reloadPositions()
      const agentLabel = data.nodes.find(n => n.id === id)?.name ? extractEmoji(data.nodes.find(n => n.id === id)!.name).cleanName : id
      toast('success', next ? `${agentLabel} — position locked` : `${agentLabel} — position unlocked`)
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Lock toggle failed')
    }
  }, [positionOverrides, reloadPositions])

  const lockedIds = useMemo(() => {
    const s = new Set<string>()
    for (const [id, p] of Object.entries(positionOverrides)) {
      if (p.locked) s.add(id)
    }
    return s
  }, [positionOverrides])

  // ── Sub-department edit modal state (Phase 6) ─────────────────────────────
  // Opens when user clicks the gear icon on a sub-dept card header.
  const [subDeptEdit, setSubDeptEdit] = useState<{ deptId: string; subId: string } | null>(null)
  const handleEditSubDept = useCallback((deptId: string, subDeptId: string) => {
    setSubDeptEdit({ deptId, subId: subDeptId })
  }, [])
  // Resolve the OrgChartSubDepartment + dept metadata from the live chart data
  // so the modal preloads with current values (label, color, emoji, order, ...).
  const editSubDeptResolved = useMemo(() => {
    if (!subDeptEdit) return null
    const dept = data?.departments?.find(d => d.id === subDeptEdit.deptId)
    const sub = dept?.subDepartments?.find(s => s.id === subDeptEdit.subId)
    return { dept, sub }
  }, [subDeptEdit, data])
  const handleSubDeptSaved = useCallback(() => {
    // Refetch the org chart so cards render with new label/color/emoji/order.
    onOrgSaved?.()
  }, [onOrgSaved])

  const selectContextValue = useMemo(
    () => ({
      selectedId: selectedNode,
      onSelect: handleMemberSelect,
      lockedIds,
      onToggleLock: handleToggleLock,
      onEditSubDept: handleEditSubDept,
    }),
    [selectedNode, handleMemberSelect, lockedIds, handleToggleLock, handleEditSubDept],
  )

  return (
    <OrgSelectContext.Provider value={selectContextValue}>
    <div
      ref={containerRef}
      className={`w-full h-full relative ${isFullscreen ? 'bg-bg' : ''}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={(_, node) => {
          // Persist drag position when a node is dropped.
          import('../lib/api').then(({ saveOrgChartPositions }) =>
            saveOrgChartPositions([{ nodeId: node.id, x: node.position.x, y: node.position.y }])
              .then(() => {
                // Update local override map so subsequent layout recomputes
                // (e.g. SSE refetch) keep this manual placement.
                setPositionOverrides(prev => ({
                  ...prev,
                  [node.id]: {
                    x: node.position.x,
                    y: node.position.y,
                    locked: prev[node.id]?.locked ?? false,
                  },
                }))
              })
              .catch(() => toast('error', 'Failed to save position')),
          )
        }}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1, minZoom: 0.05 }}
        minZoom={0.05}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        className="bg-bg"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-bg" />
        <Controls
          showInteractive={false}
          className="!bg-surface !border-border !rounded-xl !shadow-lg [&>button]:!bg-surface [&>button]:!border-border [&>button]:!text-text-muted [&>button:hover]:!bg-surface-2"
        />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as Record<string, unknown>
            return (typeof d.phaseColor === 'string' ? d.phaseColor : null) || '#6b7280'
          }}
          nodeStrokeColor="rgba(255,255,255,0.4)"
          nodeStrokeWidth={3}
          nodeBorderRadius={6}
          maskColor="rgba(15,15,20,0.45)"
          maskStrokeColor="rgba(255,255,255,0.3)"
          maskStrokeWidth={2}
          className="!bg-surface !border-border !rounded-xl"
          style={{ width: 240, height: 180 }}
          pannable
          zoomable
        />
      </ReactFlow>

      {/* Action buttons — shifts left when DetailPanel is open so the
          toolbar doesn't overlap the panel header. */}
      <div
        className="absolute top-4 z-30 flex items-center gap-1.5 transition-[right] duration-200"
        style={{ right: selectedNodeData ? 340 + 16 : 16 }}
      >
        <button
          onClick={async () => {
            try {
              const lockedCount = Object.values(positionOverrides).filter(p => p.locked).length
              const unlockedCount = Object.values(positionOverrides).filter(p => !p.locked).length
              // Server-side: DELETE only unlocked rows. Locked positions stay.
              if (unlockedCount > 0) {
                const { resetOrgChartPositions } = await import('../lib/api')
                await resetOrgChartPositions()
                // Reload from server so positionOverrides reflects what's left
                // (= the locked entries).
                await reloadPositions()
              }
              // Re-render: locked nodes keep their saved positions (via the
              // useMemo that overlays positionOverrides on rawNodes). Unlocked
              // nodes snap back to auto-computed coords.
              // setNodes is driven by the existing useEffect that watches
              // initialNodes — touching positionOverrides triggers a recompute.
              setEdges(initialEdges)
              if (lockedCount > 0) {
                toast('success', `Layout auto-adjusted (${lockedCount} locked card${lockedCount === 1 ? '' : 's'} preserved)`)
              } else {
                toast('success', 'Layout auto-adjusted to fit screen')
              }
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  reactFlow.fitView({
                    padding: 0.05,
                    duration: 400,
                    maxZoom: 1,
                    minZoom: 0.05,
                  })
                })
              })
            } catch (e: unknown) {
              toast('error', e instanceof Error ? e.message : 'Auto-adjust failed')
            }
          }}
          title={(() => {
            const locked = Object.values(positionOverrides).filter(p => p.locked).length
            const unlocked = Object.values(positionOverrides).filter(p => !p.locked).length
            if (unlocked === 0 && locked === 0) return 'Auto-adjust layout (fit to screen)'
            if (locked === 0) return `Auto-adjust layout (clears ${unlocked} dragged card${unlocked === 1 ? '' : 's'})`
            return `Auto-adjust layout (clears ${unlocked} unlocked, ${locked} locked stay)`
          })()}
          className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-surface border border-border text-text-muted text-xs font-bold shadow-lg hover:text-accent hover:bg-surface-2 hover:border-accent/30 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Auto-adjust layout
        </button>
        <button
          onClick={handleScreenshot}
          disabled={capturing}
          title="Download full org chart as PNG"
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border text-text-muted shadow-lg hover:text-accent hover:bg-surface-2 hover:border-accent/30 disabled:opacity-60 disabled:cursor-wait transition-all"
        >
          {capturing ? (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <Camera className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen org chart'}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border text-text-muted shadow-lg hover:text-accent hover:bg-surface-2 hover:border-accent/30 transition-all"
        >
          {isFullscreen
            ? <Minimize2 className="w-4 h-4" />
            : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Detail panel — rendered inside fullscreen container so it stays visible */}
      {selectedNodeData && (
        <DetailPanel
          node={selectedNodeData}
          allNodes={data.nodes}
          onClose={() => onSelectNode(null)}
          onNavigate={onNavigateToNode}
          onOrgSaved={onOrgSaved}
          locked={!!positionOverrides[selectedNodeData.id]?.locked}
          onToggleLock={(next) => handleToggleLock(selectedNodeData.id, next)}
        />
      )}

      {/* Sub-department edit modal — opens from the gear icon on any sub-dept card. */}
      <EditSubDepartmentModal
        open={!!subDeptEdit && !!editSubDeptResolved?.sub}
        deptId={subDeptEdit?.deptId || null}
        deptLabel={editSubDeptResolved?.dept?.label || null}
        deptColor={editSubDeptResolved?.dept?.color || null}
        subDept={editSubDeptResolved?.sub || null}
        onClose={() => setSubDeptEdit(null)}
        onSaved={handleSubDeptSaved}
      />
    </div>
    </OrgSelectContext.Provider>
  )
}

function TreeView(props: {
  data: OrgChartData
  search: string
  tagMatchIds: Set<string> | null
  selectedNode: string | null
  onSelectNode: (id: string | null) => void
  selectedNodeData: OrgChartNode | null
  onNavigateToNode: (id: string) => void
  onOrgSaved: () => void
}) {
  return (
    <ReactFlowProvider>
      <TreeViewInner {...props} />
    </ReactFlowProvider>
  )
}


// ── Main Page ────────────────────────────────────────────────────────────────

export default function OrgChartPage() {
  const [data, setData] = useState<OrgChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [tagFilters, setTagFilters] = useState<TagFilters>(EMPTY_TAG_FILTERS)
  const [squadFilters, setSquadFilters] = useState<string[]>([])
  // Dynamic taxonomy — overrides static SQUADS/SQUAD_BY_ID imports for filter UI
  const { squads: SQUADS, squadById: SQUAD_BY_ID } = useTaxonomy()
  const [tagPanelOpen, setTagPanelOpen] = useState(false)
  const [showTech, setShowTech] = useState(false)
  const [drift, setDrift] = useState<DriftData | null>(null)
  const [globalAgents, setGlobalAgents] = useState<Agent[]>([])
  const [configureId, setConfigureId] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.all([
      getOrgChart(),
      getDrift().catch(() => ({ onlyOnDisk: [], onlyInRegistry: [] })),
      getGlobalAgents().catch(() => []),
    ])
      .then(([chart, driftData, agents]) => {
        setData(chart)
        setDrift(driftData)
        setGlobalAgents(agents)
        setError(null)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load org chart')
      })
      .finally(() => setLoading(false))
  }, [])

  // Silent refetch triggered by SSE. Debounced so a burst of file events (e.g.
  // `git checkout` touching many agents) does not cause refetch storms.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = setTimeout(() => {
      Promise.all([
        getOrgChart(),
        getDrift().catch(() => ({ onlyOnDisk: [], onlyInRegistry: [] })),
        getGlobalAgents().catch(() => []),
      ])
        .then(([chart, driftData, agents]) => {
          setData(chart)
          setDrift(driftData)
          setGlobalAgents(agents)
        })
        .catch(err => apiError('Sync org chart', err))
    }, 300)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const es = subscribeOrgChart((ev) => {
      if (ev.type === 'ready') {
        setLive(true)
        return
      }
      if (
        ev.type === 'agent:upsert' || ev.type === 'agent:remove' ||
        // Phase A — task lifecycle: refetch so the load dot 🟢🟡🔴
        // flips live when a dispatch fires or completes anywhere.
        ev.type === 'task:created'   || ev.type === 'task:started' ||
        ev.type === 'task:completed' || ev.type === 'task:failed'  ||
        ev.type === 'task:cancelled'
      ) {
        scheduleRefetch()
      }
    })
    es.onopen = () => setLive(true)
    es.onerror = () => setLive(false)
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
      es.close()
    }
  }, [scheduleRefetch])

  const handleOrgSaved = useCallback(() => {
    // Reload org chart + drift after any org property change
    loadData()
    setSelectedNode(null)
    setConfigureId(null)
  }, [loadData])

  const selectedNodeData = useMemo(
    () => data?.nodes.find(n => n.id === selectedNode) ?? null,
    [data, selectedNode],
  )

  // Combined filter: tag filters + squad filters → set of matching node IDs (null = no filter)
  const tagMatchIds = useMemo<Set<string> | null>(() => {
    if (!data || !hasAnyFilter(tagFilters, squadFilters)) return null
    return new Set(data.nodes.filter(n => {
      if (hasActiveTagFilters(tagFilters) && !nodeMatchesTags(n, tagFilters)) return false
      if (squadFilters.length > 0 && !squadFilters.includes(n.squad || '')) return false
      return true
    }).map(n => n.id))
  }, [data, tagFilters, squadFilters])

  const toggleTag = useCallback((cat: string, val: string) => {
    setTagFilters(prev => {
      const arr = prev[cat] || []
      const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
      return { ...prev, [cat]: next }
    })
  }, [])

  const toggleSquad = useCallback((id: string) => {
    setSquadFilters(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])
  }, [])

  const clearAllFilters = useCallback(() => {
    setTagFilters(EMPTY_TAG_FILTERS)
    setSquadFilters([])
  }, [])

  const configureAgent = useMemo(
    () => configureId ? globalAgents.find(a => a.filename === configureId) ?? null : null,
    [configureId, globalAgents],
  )

  const handleNavigateToNode = useCallback((id: string) => {
    setSelectedNode(id)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted">
        <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full mr-3" />
        Loading org chart...
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-400 font-medium">{error || 'Failed to load org chart'}</p>
          <button
            onClick={loadData}
            className="mt-3 px-4 py-1.5 text-sm bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-5 pb-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Title + stat chips */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/20 to-purple/20 ring-1 ring-accent/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight">Team</h1>
                <p className="text-[11px] text-text-muted">Organization chart</p>
              </div>
            </div>

            {/* Inline stat chips */}
            <div className="hidden md:flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                {data.stats.totalAgents} members
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 text-[11px] font-semibold">
                {data.stats.byModel.opus || 0} Opus
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-semibold">
                {data.stats.byModel.sonnet || 0} Sonnet
              </span>
              <span
                title={live ? 'Live — syncing with disk in real time' : 'Disconnected — reconnecting…'}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  live ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {live ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Search + view toggle */}
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  // Enter = smart-route the query (open AssignTaskModal pre-filled).
                  // Plain typing keeps filtering the chart.
                  if (e.key === 'Enter' && search.trim()) {
                    e.preventDefault()
                    setAssignModalOpen(true)
                  }
                }}
                placeholder="Search… or press Enter to smart-route a task"
                title="Type to filter agents. Press Enter to dispatch a new task with this description."
                className="w-full pl-9 pr-12 py-2 text-xs bg-surface border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none transition-all"
              />
              {search.trim() && (
                <span
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded font-bold border border-border pointer-events-none"
                  title="Press Enter to dispatch"
                >
                  ↵ ROUTE
                </span>
              )}
            </div>
            <button
              onClick={() => setTagPanelOpen(v => !v)}
              title="Filter by squad, tech, domain or work type"
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                hasAnyFilter(tagFilters, squadFilters)
                  ? 'bg-accent text-white border-accent'
                  : tagPanelOpen
                  ? 'bg-surface-2 text-text border-border'
                  : 'bg-surface border-border text-text-muted hover:text-text hover:bg-surface-2'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filter
              {hasAnyFilter(tagFilters, squadFilters) && (
                <span className="ml-0.5 bg-white/25 text-white px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none">
                  {squadFilters.length + countActiveTagFilters(tagFilters)}
                </span>
              )}
            </button>
            <button
              onClick={() => setAssignModalOpen(true)}
              title="Smart-route a new task to the best agent"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-accent to-purple-500 text-white shadow-sm shadow-accent/25 hover:shadow-md hover:shadow-accent/30 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Assign Task
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {tagPanelOpen && (
          <div className="mt-3 bg-surface border border-border rounded-xl p-3 space-y-2.5">
            {/* Squad row */}
            <div className="flex items-start gap-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-12 shrink-0 pt-1.5">Squad</span>
              <div className="flex flex-wrap gap-2">
                {SQUADS.map(sq => {
                  const active = squadFilters.includes(sq.id)
                  return (
                    <button
                      key={sq.id}
                      onClick={() => toggleSquad(sq.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border"
                      style={active
                        ? { background: sq.color, color: '#fff', borderColor: sq.color }
                        : { background: `${sq.color}18`, color: sq.color, borderColor: `${sq.color}40` }
                      }
                    >
                      <span>{sq.emoji}</span>
                      {sq.label}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Dynamic tag category rows — driven by useTaxonomy().categories */}
            {Object.entries(tagCategories).map(([catId, catDef], catIdx) => {
              const tagKeys = Object.keys(catDef.tags)
              const activeVals = tagFilters[catId] || []
              const isCollapsible = tagKeys.length > 8
              const isExpanded = !isCollapsible || showTech
              return (
                <div key={catId}>
                  <div className="border-t border-border" />
                  <div className="flex items-start gap-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted w-12 shrink-0 pt-1">
                      {catDef.label}
                    </span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {(isExpanded ? tagKeys : tagKeys.slice(0, 6)).map(tv => {
                        const active = activeVals.includes(tv)
                        return (
                          <button
                            key={tv}
                            onClick={() => toggleTag(catId, tv)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all border ${
                              active
                                ? 'bg-accent text-white border-accent'
                                : 'bg-surface-2 text-text-secondary border-border hover:border-accent/50 hover:text-text'
                            }`}
                          >
                            {tv}
                          </button>
                        )
                      })}
                      {isCollapsible && catIdx === 1 && (
                        isExpanded ? (
                          <button onClick={() => setShowTech(false)} className="px-2 py-0.5 rounded-full text-[11px] text-text-muted hover:text-text">− hide</button>
                        ) : (
                          <button onClick={() => setShowTech(true)} className="px-2 py-0.5 rounded-full text-[11px] text-text-muted hover:text-accent">
                            +{tagKeys.length - 6} more {activeVals.length > 0 && <span className="text-blue-400 font-semibold">({activeVals.length})</span>}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {hasAnyFilter(tagFilters, squadFilters) && (
              <div className="pt-1 border-t border-border flex items-center gap-2">
                <span className="text-[11px] text-text-muted">
                  {tagMatchIds?.size ?? 0} agent{(tagMatchIds?.size ?? 0) !== 1 ? 's' : ''} match
                </span>
                <button onClick={clearAllFilters} className="text-[11px] text-accent hover:underline ml-auto">
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active filter chips (shown when panel closed) */}
        {!tagPanelOpen && hasAnyFilter(tagFilters, squadFilters) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {squadFilters.map(id => {
              const sq = SQUAD_BY_ID[id]
              if (!sq) return null
              return (
                <button
                  key={id}
                  onClick={() => toggleSquad(id)}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border"
                  style={{ background: sq.color, color: '#fff', borderColor: sq.color }}
                >
                  {sq.emoji} {sq.label} <X className="w-3 h-3 ml-0.5" />
                </button>
              )
            })}
            {Object.entries(tagFilters).map(([cat, vals]) =>
              vals.map(v => (
                <button
                  key={`${cat}-${v}`}
                  onClick={() => toggleTag(cat, v)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-accent text-white"
                >
                  {v} <X className="w-3 h-3" />
                </button>
              ))
            )}
            <button onClick={clearAllFilters} className="px-2 py-0.5 rounded-full text-[11px] text-text-muted bg-surface-2 hover:bg-surface-3">
              Clear all
            </button>
          </div>
        )}

        {/* Mobile stat chips */}
        <div className="flex md:hidden items-center gap-1.5 mt-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            {data.stats.totalAgents} members
          </span>
          <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 text-[11px] font-semibold">
            {data.stats.byModel.opus || 0} Opus
          </span>
          <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 text-[11px] font-semibold">
            {data.stats.byModel.sonnet || 0} Sonnet
          </span>
        </div>

        {/* Needs Setup banner — agents on disk without org registration */}
        {drift && drift.onlyOnDisk.length > 0 && (
          <div className="mt-3 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-400 flex-1">
              <span className="font-semibold">{drift.onlyOnDisk.length} agent{drift.onlyOnDisk.length !== 1 ? 's' : ''}</span>
              {' '}not registered in the org chart:
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {drift.onlyOnDisk.map(id => (
                <button
                  key={id}
                  onClick={() => setConfigureId(id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-colors ${
                    configureId === id
                      ? 'bg-amber-500/40 text-amber-300 ring-1 ring-amber-400/50'
                      : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        <div className="h-full mx-8 mb-4 rounded-2xl border border-border overflow-hidden relative">
          <TreeView
            data={data}
            search={search}
            tagMatchIds={tagMatchIds}
            selectedNode={selectedNode}
            onSelectNode={setSelectedNode}
            selectedNodeData={selectedNodeData}
            onNavigateToNode={handleNavigateToNode}
            onOrgSaved={handleOrgSaved}
          />
          {configureId && (
            <UnregisteredPanel
              agentId={configureId}
              agentInfo={configureAgent}
              allNodes={data.nodes}
              onClose={() => setConfigureId(null)}
              onSaved={handleOrgSaved}
            />
          )}
        </div>
      </div>

      <AssignTaskModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        preferredAgent={selectedNode || undefined}
        initialQuery={search}
        onAssigned={() => loadData()}
      />
    </div>
  )
}
