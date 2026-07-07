import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Play, Save, Trash2, Plus, Zap, ChevronRight,
  CheckCircle, AlertCircle, Loader, Terminal, FileText,
  LayoutTemplate, X, Sparkles, Copy, Settings2, RotateCcw, HelpCircle,
  ArrowRight, Clock, Eye, Trash, Search, ChevronDown,
  StopCircle, Layers, AlertTriangle, SearchX, Download, UserCheck,
} from 'lucide-react'
import { getUnifiedAgents, getRunHistory, getRunDetail, deleteRun, clearRunHistory, getOrchestrationTemplates, startOrchestrationRun, getOrchestrationRun, cancelOrchestrationRun, advanceStep, exportOrchestration, retryStep } from '../lib/api'
import type { RunHistoryItem, RunHistoryDetail, PipelineTemplate, OrchestrationRun, OrchestrationStep, DAGExport } from '../lib/api'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { writeToClipboard } from '../lib/clipboard'
import { formatAgentDisplay } from '../lib/agentDisplay'
import type { UnifiedAgent } from '../types'
import { toast } from '../components/Toast'
import AgentIcon from '../components/AgentIcon'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { SkeletonCards } from '../components/Skeleton'

// ---- Custom Node ----
interface AgentNodeData {
  label: string
  agentName?: string
  scope?: string
  description?: string
  instructions?: string
  retryCount?: number
  condition?: string
  isApproval?: boolean
  status?: 'idle' | 'running' | 'done' | 'error' | 'skipped'
  output?: string
  isStart?: boolean
  isCustom?: boolean
  executionOrder?: number
  [key: string]: unknown
}

function AgentNode({ data, selected }: { data: AgentNodeData; selected: boolean }) {
  const statusMap: Record<string, string> = {
    idle: 'border-border shadow-card',
    running: 'border-purple shadow-card animate-pulse',
    done: 'border-green shadow-card',
    error: 'border-red shadow-card',
    skipped: 'border-yellow/50 shadow-card opacity-60',
  }
  const statusStyles = statusMap[data.status || 'idle'] || statusMap.idle

  return (
    <div
      className={`relative min-w-[200px] max-w-[240px] rounded-xl border bg-surface backdrop-blur-sm transition-all duration-300 ${statusStyles} ${selected ? 'ring-2 ring-accent/50 ring-offset-2 ring-offset-bg' : ''}`}
    >
      {data.executionOrder != null && (
        <span className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-gradient-to-br from-purple to-accent text-white text-[11px] font-bold flex items-center justify-center shadow-card z-10">
          {data.executionOrder}
        </span>
      )}
      <Handle type="target" position={Position.Left} className="!w-3.5 !h-3.5 !bg-accent !border-2 !border-surface !-left-[7px]" />

      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5 mb-1.5">
          {data.isStart ? (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
          ) : data.isApproval ? (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber to-yellow flex items-center justify-center shrink-0" title="Approval gate — pauses for human review">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
          ) : data.isCustom ? (
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber to-orange flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4 text-white" />
            </div>
          ) : (
            <AgentIcon
              name={data.label as string}
              uid={`node-icon-${data.label}`}
              size={28}
              global={!data.agentName || data.scope === 'Global'}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight truncate">{data.label}</p>
            {data.scope && <p className="text-[11px] text-text-muted">{data.scope}</p>}
          </div>
          {data.status === 'running' && <Loader className="w-4 h-4 text-purple animate-spin ml-auto shrink-0" />}
          {data.status === 'done' && <CheckCircle className="w-4 h-4 text-green ml-auto shrink-0" />}
          {data.status === 'error' && <AlertCircle className="w-4 h-4 text-red ml-auto shrink-0" />}
        </div>

        {data.description && (
          <p className="text-[11px] text-text-muted leading-snug line-clamp-2 mt-1">{data.description}</p>
        )}

        {data.output && (
          <div className="mt-2.5 pt-2 border-t border-border/50">
            <p className="text-[10px] text-text-muted mb-0.5 font-medium">Output</p>
            <p className="text-[11px] text-text leading-snug line-clamp-3">{data.output}</p>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!w-3.5 !h-3.5 !bg-accent !border-2 !border-surface !-right-[7px]" />
    </div>
  )
}

const nodeTypes: NodeTypes = { agentNode: AgentNode }

// ---- Orchestration Templates ----
const TEMPLATES = [
  {
    name: 'Plan \u2192 Code \u2192 Review',
    description: 'Classic app-building pipeline',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 60, y: 180 }, data: { label: 'Task Input', isStart: true, description: 'Your initial task or feature request' } },
      { id: 'n2', type: 'agentNode', position: { x: 320, y: 60 }, data: { label: 'Planner', isCustom: true, description: 'Break task into implementation steps', instructions: 'You are a software architect. Break the given task into clear, actionable implementation steps. Output a numbered list of steps with technical details.' } },
      { id: 'n3', type: 'agentNode', position: { x: 320, y: 300 }, data: { label: 'Researcher', isCustom: true, description: 'Research best approaches and patterns', instructions: 'You are a research expert. Given the task, identify the best libraries, patterns, and approaches. Output concise recommendations.' } },
      { id: 'n4', type: 'agentNode', position: { x: 600, y: 180 }, data: { label: 'Developer', isCustom: true, description: 'Write the implementation', instructions: 'You are a senior developer. Given the plan and research, write the full implementation. Output clean, production-grade code with comments.' } },
      { id: 'n5', type: 'agentNode', position: { x: 880, y: 180 }, data: { label: 'Reviewer', isCustom: true, description: 'Review and improve the code', instructions: 'You are a code reviewer. Review the implementation for bugs, security issues, and improvements. Output an improved version with explanations.' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', animated: true },
      { id: 'e2', source: 'n1', target: 'n3', animated: true },
      { id: 'e3', source: 'n2', target: 'n4', animated: true },
      { id: 'e4', source: 'n3', target: 'n4', animated: true },
      { id: 'e5', source: 'n4', target: 'n5', animated: true },
    ],
  },
  {
    name: 'Research \u2192 Write \u2192 Polish',
    description: 'Content & documentation pipeline',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 60, y: 150 }, data: { label: 'Topic Input', isStart: true, description: 'Topic or documentation request' } },
      { id: 'n2', type: 'agentNode', position: { x: 320, y: 150 }, data: { label: 'Researcher', isCustom: true, description: 'Gather key information', instructions: 'Research the given topic thoroughly. Extract key concepts, examples, and technical details.' } },
      { id: 'n3', type: 'agentNode', position: { x: 580, y: 150 }, data: { label: 'Writer', isCustom: true, description: 'Write structured content', instructions: 'Write clear, well-structured content based on the research. Use headers, examples, and clear language.' } },
      { id: 'n4', type: 'agentNode', position: { x: 840, y: 150 }, data: { label: 'Editor', isCustom: true, description: 'Polish and finalize', instructions: 'Edit and polish the content. Fix clarity, tone, structure. Output the final polished version.' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', animated: true },
      { id: 'e2', source: 'n2', target: 'n3', animated: true },
      { id: 'e3', source: 'n3', target: 'n4', animated: true },
    ],
  },
  {
    name: 'Research \u2192 Architect \u2192 Build',
    description: 'Competitive research, architecture, then implementation',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 60, y: 150 }, data: { label: 'Brief', isStart: true, description: 'Product brief or feature idea' } },
      { id: 'n2', type: 'agentNode', position: { x: 320, y: 150 }, data: { label: 'Researcher', isCustom: true, description: 'Market research & competitive intel', instructions: 'You are a market research specialist. Research the top 3-5 competitors for the given product/feature. Analyze their strengths, weaknesses, pricing, and user complaints. Identify a USP opportunity.' } },
      { id: 'n3', type: 'agentNode', position: { x: 580, y: 150 }, data: { label: 'Architect', isCustom: true, description: 'Architecture & technical planning', instructions: 'You are a system architect. Based on the competitive research, design a technical architecture including: stack selection, data model, API design, auth strategy, and sprint plan. Output a concrete, buildable plan.' } },
      { id: 'n4', type: 'agentNode', position: { x: 840, y: 150 }, data: { label: 'Developer', isCustom: true, description: 'Build the feature', instructions: 'You are a senior full-stack developer. Based on the architecture plan, write production-grade code. Include all files needed with proper TypeScript types, error handling, and best practices.' } },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', animated: true },
      { id: 'e2', source: 'n2', target: 'n3', animated: true },
      { id: 'e3', source: 'n3', target: 'n4', animated: true },
    ],
  },
]

// ---- Run Log Entry ----
interface RunLog {
  nodeId: string | null
  label: string | null
  type: 'start' | 'done' | 'error' | 'complete' | 'skipped' | 'retry'
  output?: string
  error?: string
  finalOutput?: string
  ts?: number
}

// Tracks the in-flight DURABLE run across a page refresh so we can reconnect to a
// still-running orchestration on reload. { runId, orchId } — mirrors Playground's
// ACTIVE_RUN_KEY pattern. The run lives server-side; this is just the viewer's bookmark.
const ACTIVE_RUN_KEY = 'polyglot.orchestration.activeRun'

// Map a durable step's status → the legacy RunLog event the UI's processSSEEvent
// already understands. `completed`/`failed` carry the step's output/error.
// A re-pended step (pending while running) surfaces as a retry.
function stepToRunLogEvent(step: { nodeId: string; status: string; output?: string | null; error?: string | null }): RunLog | null {
  const nodeId = step.nodeId
  switch (step.status) {
    case 'running':   return { type: 'start', nodeId, label: null }
    case 'completed': return { type: 'done', nodeId, label: null, output: step.output ?? undefined }
    case 'approved':  return { type: 'done', nodeId, label: null, output: step.output ?? '[APPROVED]' }
    case 'failed':    return { type: 'error', nodeId, label: null, error: step.error ?? 'Step failed' }
    case 'rejected':  return { type: 'error', nodeId, label: null, error: step.error ?? 'Rejected' }
    case 'skipped':   return { type: 'skipped', nodeId, label: null }
    case 'pending':   return { type: 'retry', nodeId, label: null }
    default:          return null // 'paused' has no node-status mapping; handled at run level
  }
}

// Returns true if adding source->target would create a cycle in the directed graph.
function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
  if (source === target) return true
  const adj = new Map<string, string[]>()
  for (const e of edges) { const a = adj.get(e.source) ?? []; a.push(e.target); adj.set(e.source, a) }
  // can we already reach `source` from `target`? if so, adding source->target closes a loop
  const stack = [target]; const seen = new Set<string>()
  while (stack.length) { const n = stack.pop()!; if (n === source) return true; if (seen.has(n)) continue; seen.add(n); for (const m of adj.get(n) ?? []) stack.push(m) }
  return false
}

// Sidebar tab types
type SidebarTab = 'agents' | 'templates' | 'saved' | 'history'

// ---- Main Page ----
export default function Orchestration() {
  const { data: allAgents } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [orchName, setOrchName] = useState('My Orchestration')
  const [orchId, setOrchId] = useState<string | null>(null)
  const [task, setTask] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [runLog, setRunLog] = useState<RunLog[]>([])
  const [showRunPanel, setShowRunPanel] = useState(false)
  // HITL approval gate — set when the durable run pauses at an approval node.
  const [pendingApproval, setPendingApproval] = useState<{ nodeId: string; label: string } | null>(null)
  const [approving, setApproving] = useState(false)
  // The run currently shown in the panel. Unlike activeRunIdRef (nulled the
  // moment the run goes terminal, so the SSE reader knows to stop), this stays
  // set so a Retry button on a failed step's log entry still knows which run
  // to retry against after it's no longer "running". Cleared only by
  // resetRunState / starting a genuinely new run.
  const [lastRunId, setLastRunId] = useState<string | null>(null)
  const [retryingNodeId, setRetryingNodeId] = useState<string | null>(null)
  // DAG export modal (mermaid + JSON of the saved pipeline).
  const [exportData, setExportData] = useState<DAGExport | null>(null)
  const [savedList, setSavedList] = useState<{ id: string; name: string; updatedAt: string; nodeCount: number; edgeCount: number }[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<typeof TEMPLATES[0] | null>(null)
  const [showClearHistory, setShowClearHistory] = useState(false)
  const [pendingDeleteSaved, setPendingDeleteSaved] = useState<{ id: string; name: string } | null>(null)
  // C12: gate the first multi-node run of a session behind a cost confirm.
  const runConfirmedRef = useRef(false)
  const [showRunConfirm, setShowRunConfirm] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [viewingOutputNodeId, setViewingOutputNodeId] = useState<string | null>(null)
  const [historyList, setHistoryList] = useState<RunHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [viewingRun, setViewingRun] = useState<RunHistoryDetail | null>(null)
  const [apiTemplates, setApiTemplates] = useState<PipelineTemplate[]>([])

  // Sidebar
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('agents')
  const [agentSearch, setAgentSearch] = useState('')

  // Use ref for ID counter
  const nodeCounterRef = useRef(100)
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const sseBufferRef = useRef('')
  // The in-flight durable run's id. Drives Stop→server-cancel and lets us
  // reconnect to a background run after a page refresh.
  const activeRunIdRef = useRef<string | null>(null)
  // True once the page is unloading (refresh/navigate/close). On unload the
  // in-flight fetch rejects with a generic network error (not an AbortError), so
  // we must NOT treat that as a terminal — otherwise we'd wipe the reattach marker
  // and the reloaded page couldn't reconnect to the still-running run.
  const unloadingRef = useRef(false)

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null
  const viewingNode = nodes.find(n => n.id === viewingOutputNodeId) ?? null
  const viewingOutput = viewingNode ? (viewingNode.data as AgentNodeData).output : null

  // Filter agents by search
  const filteredAgents = useMemo(() => {
    if (!allAgents) return []
    if (!agentSearch.trim()) return allAgents
    const q = agentSearch.toLowerCase()
    return allAgents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.scopeLabel?.toLowerCase().includes(q)
    )
  }, [allAgents, agentSearch])

  // Group agents by scope
  const groupedAgents = useMemo(() => {
    const groups: Record<string, UnifiedAgent[]> = {}
    for (const agent of filteredAgents) {
      const key = agent.scopeLabel || 'Other'
      if (!groups[key]) groups[key] = []
      groups[key].push(agent)
    }
    return groups
  }, [filteredAgents])

  // Compute topological execution order
  const executionOrder = useMemo(() => {
    const inDegree: Record<string, number> = {}
    const adj: Record<string, string[]> = {}
    for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = [] }
    for (const e of edges) {
      if (adj[e.source]) adj[e.source].push(e.target)
      inDegree[e.target] = (inDegree[e.target] || 0) + 1
    }
    const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
    const order: Record<string, number> = {}
    let step = 1
    while (queue.length) {
      const id = queue.shift()!
      order[id] = step++
      for (const next of (adj[id] || [])) {
        inDegree[next]--
        if (inDegree[next] === 0) queue.push(next)
      }
    }
    return order
  }, [nodes, edges])

  const nodesWithOrder = useMemo(() =>
    nodes.map(n => ({
      ...n,
      data: { ...n.data, executionOrder: executionOrder[n.id] }
    })) as Node[],
    [nodes, executionOrder]
  )

  // Design-time disconnected nodes (only meaningful with >1 node)
  const disconnectedNodeLabels = useMemo(() => {
    if (nodes.length <= 1) return []
    const connectedIds = new Set<string>()
    for (const e of edges) { connectedIds.add(e.source); connectedIds.add(e.target) }
    return nodes.filter(n => !connectedIds.has(n.id)).map(n => (n.data as AgentNodeData).label)
  }, [nodes, edges])

  // Run progress
  const totalNonStartNodes = nodes.filter(n => !(n.data as AgentNodeData).isStart).length
  const completedNodes = runLog.filter(l => l.type === 'done' && !((l as unknown as { skipped?: boolean }).skipped)).length
  const progressPercent = totalNonStartNodes > 0 ? Math.round((completedNodes / totalNonStartNodes) * 100) : 0

  // Auto-scroll run log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [runLog])

  // Keyboard layer: ⌘S save, Esc close panels, ⌘Enter run
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (nodes.length > 0 && !saving) handleSave()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (showRunPanel && task.trim() && !running) handleRun()
        return
      }
      if (e.key === 'Escape') {
        setSelectedNodeId(null)
        setViewingOutputNodeId(null)
        setShowGuide(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, saving, showRunPanel, task, running])

  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/orchestrations')
      const data = await res.json()
      setSavedList(data.map((o: { id: string; name: string; updatedAt: string; nodes?: unknown[]; edges?: unknown[] }) => ({
        id: o.id,
        name: o.name,
        updatedAt: o.updatedAt,
        nodeCount: o.nodes?.length ?? 0,
        edgeCount: o.edges?.length ?? 0,
      })))
    } catch (e) {
      console.warn('[orchestration] loadSaved failed:', e instanceof Error ? e.message : e)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await getRunHistory()
      setHistoryList(data)
    } catch (e) {
      console.warn('[orchestration] loadHistory failed:', e instanceof Error ? e.message : e)
    }
    setHistoryLoading(false)
  }, [])

  useEffect(() => { loadSaved() }, [loadSaved])

  // Load API pipeline templates once
  useEffect(() => {
    getOrchestrationTemplates().then(setApiTemplates).catch(err => console.error('[orchestration] templates fetch failed:', err instanceof Error ? err.message : err))
  }, [])

  // Load history when switching to history tab
  useEffect(() => {
    if (sidebarTab === 'history') loadHistory()
    if (sidebarTab === 'saved') loadSaved()
  }, [sidebarTab, loadHistory, loadSaved])

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) {
        toast('error', "A node can't connect to itself")
        return
      }
      const targetNode = nodes.find(n => n.id === connection.target)
      if (targetNode && (targetNode.data as AgentNodeData).isStart) {
        toast('error', "Start nodes can't have an incoming connection")
        return
      }
      if (connection.source && connection.target && wouldCreateCycle(edges, connection.source, connection.target)) {
        toast('error', 'That connection would create a loop')
        return
      }
      setEdges(eds => addEdge({ ...connection, animated: true }, eds))
    },
    [setEdges, nodes, edges]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const nd = node.data as AgentNodeData
    if (showRunPanel && (nd.status === 'done' || nd.status === 'error')) {
      setViewingOutputNodeId(node.id)
    } else {
      setSelectedNodeId(node.id)
    }
  }, [showRunPanel])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const addAgentNode = useCallback((agent: UnifiedAgent) => {
    const id = `node-${nodeCounterRef.current++}`
    setNodes(nds => [...nds, {
      id,
      type: 'agentNode',
      position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: {
        label: agent.name,
        agentName: agent.name,
        scope: agent.scopeLabel,
        description: agent.description,
        status: 'idle',
      },
    }])
  }, [setNodes])

  const addStartNode = useCallback(() => {
    const id = `node-${nodeCounterRef.current++}`
    setNodes(nds => [...nds, {
      id,
      type: 'agentNode',
      position: { x: 60 + Math.random() * 100, y: 100 + Math.random() * 200 },
      data: {
        label: 'Task Input',
        isStart: true,
        description: 'Entry point \u2014 passes your task to downstream nodes',
        status: 'idle',
      },
    }])
  }, [setNodes])

  const addCustomNode = useCallback(() => {
    const id = `node-${nodeCounterRef.current++}`
    setNodes(nds => [...nds, {
      id,
      type: 'agentNode',
      position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: {
        label: 'Custom Step',
        isCustom: true,
        description: 'Click to configure',
        instructions: '',
        status: 'idle',
      },
    }])
  }, [setNodes])

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return
    setNodes(nds => nds.filter(n => n.id !== selectedNodeId))
    setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }, [selectedNodeId, setNodes, setEdges])

  const updateSelectedNodeData = useCallback((patch: Partial<AgentNodeData>) => {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n
    ))
  }, [selectedNodeId, setNodes])

  const applyTemplate = useCallback((tpl: typeof TEMPLATES[0]) => {
    setNodes(tpl.nodes.map(n => ({ ...n, data: { ...n.data, status: 'idle' } })) as Node[])
    setEdges(tpl.edges as Edge[])
    setOrchName(tpl.name)
    setOrchId(null)
    setRunLog([])
    setSelectedNodeId(null)
    setViewingOutputNodeId(null)
    setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.15 }), 50)
  }, [setNodes, setEdges])

  const loadTemplate = useCallback((tpl: typeof TEMPLATES[0]) => {
    if (nodes.length > 0) { setPendingTemplate(tpl); return }
    applyTemplate(tpl)
  }, [nodes.length, applyTemplate])

  // Returns the saved orchestration id (callers that don't need it can ignore the
  // return). The durable run flow needs a SAVED orchestration, so handleRun awaits
  // this to ensure an id exists before POSTing a run.
  const handleSave = async (): Promise<string | null> => {
    if (!orchName.trim()) { toast('error', 'Name your orchestration first'); return null }
    setSaving(true)
    try {
      const res = await fetch('/api/orchestrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orchId || undefined, name: orchName, nodes, edges }),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.statusText}`)
      const data = await res.json()
      setOrchId(data.id)
      loadSaved()
      toast('success', 'Orchestration saved')
      return data.id as string
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to save')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleLoad = async (id: string) => {
    try {
      const res = await fetch(`/api/orchestrations/${id}`)
      if (!res.ok) throw new Error('Not found')
      const orc = await res.json()
      setNodes(orc.nodes.map((n: Node) => ({ ...n, data: { ...n.data, status: 'idle', output: undefined } })))
      setEdges(orc.edges)
      setOrchName(orc.name)
      setOrchId(orc.id)
      setRunLog([])
      setSelectedNodeId(null)
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.15 }), 50)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to load')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/orchestrations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      loadSaved()
      if (orchId === id) { setOrchId(null); setNodes([]); setEdges([]) }
      toast('success', 'Deleted')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const clearCanvas = () => {
    setNodes([])
    setEdges([])
    setOrchId(null)
    setRunLog([])
    setSelectedNodeId(null)
    setShowClearConfirm(false)
  }

  const newOrchestration = () => {
    setNodes([])
    setEdges([])
    setOrchId(null)
    setOrchName('My Orchestration')
    setRunLog([])
    setSelectedNodeId(null)
    setViewingOutputNodeId(null)
    setTask('')
    setShowRunPanel(false)
  }

  // Stop = explicit cancel. A refresh/navigate does NOT stop a run (it keeps
  // executing server-side); only this kills the durable run. Drop the reattach
  // marker so a later reload doesn't try to reconnect to a cancelled run.
  const cancelRun = () => {
    const runId = activeRunIdRef.current
    if (runId) cancelOrchestrationRun(runId, 'cancelled by user').catch(() => { /* best-effort; stream ends anyway */ })
    activeRunIdRef.current = null
    try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* ignore */ }
    abortRef.current?.abort()
  }

  // Resolve a paused approval gate. Approve re-drives the durable executor
  // (downstream nodes run); Reject cancels the run. The open SSE stream shows
  // the continuation live, so no re-attach needed.
  const resolveApproval = useCallback(async (approved: boolean) => {
    const runId = activeRunIdRef.current
    if (!runId || !pendingApproval) return
    setApproving(true)
    try {
      await advanceStep(runId, pendingApproval.nodeId, approved, approved ? undefined : 'Rejected from run panel')
      setPendingApproval(null)
      toast(approved ? 'success' : 'warn', approved ? 'Approved — resuming pipeline' : 'Rejected — run cancelled')
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to resolve approval')
    } finally {
      setApproving(false)
    }
  }, [pendingApproval])

  // Export the saved pipeline as Mermaid + JSON.
  const handleExport = useCallback(async () => {
    if (!orchId) { toast('warn', 'Save the pipeline first to export it'); return }
    try {
      setExportData(await exportOrchestration(orchId))
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Export failed')
    }
  }, [orchId])

  const processSSEEvent = useCallback((event: RunLog) => {
    setRunLog(log => [...log, { ...event, ts: event.ts ?? Date.now() }])
    if (event.type === 'start' && event.nodeId) {
      setNodes(nds => nds.map(n =>
        n.id === event.nodeId ? { ...n, data: { ...n.data, status: 'running' } } : n
      ))
    }
    if (event.type === 'done' && event.nodeId) {
      setNodes(nds => nds.map(n =>
        n.id === event.nodeId ? { ...n, data: { ...n.data, status: 'done', output: event.output } } : n
      ))
    }
    if (event.type === 'error' && event.nodeId) {
      setNodes(nds => nds.map(n =>
        n.id === event.nodeId ? { ...n, data: { ...n.data, status: 'error' } } : n
      ))
    }
    if (event.type === 'skipped' && event.nodeId) {
      setNodes(nds => nds.map(n =>
        n.id === event.nodeId ? { ...n, data: { ...n.data, status: 'skipped' } } : n
      ))
    }
    if (event.type === 'retry' && event.nodeId) {
      setNodes(nds => nds.map(n =>
        n.id === event.nodeId ? { ...n, data: { ...n.data, status: 'running' } } : n
      ))
    }
  }, [setNodes])

  // Resolve a node's label from the live canvas so mapped step events show a
  // human label in the run log (durable steps carry only nodeId).
  const labelForNode = useCallback((nodeId: string | null): string | null => {
    if (!nodeId) return null
    const n = nodes.find(nd => nd.id === nodeId)
    return (n?.data as AgentNodeData | undefined)?.label ?? nodeId
  }, [nodes])

  // Feed one durable step through the legacy event mapping + processSSEEvent.
  const applyStep = useCallback((step: { nodeId: string; status: string; output?: string | null; error?: string | null }) => {
    const ev = stepToRunLogEvent(step)
    if (!ev) return
    processSSEEvent({ ...ev, label: labelForNode(ev.nodeId) })
  }, [processSSEEvent, labelForNode])

  // Consume the durable run's NAMED-event SSE stream and drive the UI. Shared by
  // a fresh run (handleRun) and a reconnect-on-reload (reattach effect).
  //
  // The durable stream uses `event: <name>\ndata: <json>\n\n` framing (unlike the
  // legacy data-only stream), so the parser tracks the current `event:` name and
  // pairs it with the next `data:` line; a blank line resets the pending name.
  const streamDurableRun = useCallback(async (runId: string) => {
    activeRunIdRef.current = runId
    setLastRunId(runId)
    setRunning(true)
    setShowRunPanel(true)
    setSelectedNodeId(null)
    setViewingOutputNodeId(null)
    sseBufferRef.current = ''
    abortRef.current = new AbortController()

    // Only a real run-level terminal EVENT (completed/failed/cancelled) clears the
    // reattach marker. A socket close from a refresh/navigate must leave it intact
    // so the reloaded page reconnects to the still-running server-side run.
    let reachedTerminal = false

    try {
      const response = await fetch(`/api/orchestrations/runs-v2/${encodeURIComponent(runId)}/stream`, {
        signal: abortRef.current.signal,
      })
      if (!response.body) throw new Error('No response body')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let pendingEvent = 'message' // current `event:` name awaiting its `data:`

      const dispatch = (name: string, raw: string) => {
        let payload: unknown
        try { payload = JSON.parse(raw) } catch { console.error('[orchestration/durable-sse parse]', raw.slice(0, 120)); return }
        if (name === 'snapshot') {
          const run = payload as OrchestrationRun
          // Reset every canvas node to idle, then replay each step so a reload
          // rebuilds the exact progress-so-far (running/done/error/skipped).
          setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'idle', output: undefined } })))
          for (const step of (run.steps || [])) applyStep(step)
        } else if (name === 'step:any') {
          applyStep(payload as OrchestrationStep)
        } else if (name === 'run:completed') {
          reachedTerminal = true
          setPendingApproval(null)
          const run = payload as Partial<OrchestrationRun>
          setRunLog(log => [...log, { type: 'complete', nodeId: null, label: null, finalOutput: run.finalOutput ?? '', ts: Date.now() }])
        } else if (name === 'run:failed') {
          reachedTerminal = true
          setPendingApproval(null)
          const run = payload as Partial<OrchestrationRun>
          setRunLog(log => [...log, { type: 'error', nodeId: null, label: null, error: run.error || 'Run failed', ts: Date.now() }])
        } else if (name === 'run:cancelled') {
          reachedTerminal = true
          setPendingApproval(null)
          setRunLog(log => [...log, { type: 'error', nodeId: null, label: null, error: 'Run cancelled', ts: Date.now() }])
        } else if (name === 'run:paused') {
          // HITL approval gate — the run is still alive; leave `running` true.
          // Surface an Approve/Reject bar for the paused step so the run can advance.
          const run = payload as OrchestrationRun
          const paused = (run.steps || []).find(s => s.status === 'paused')
            || (run.currentNodeId ? (run.steps || []).find(s => s.nodeId === run.currentNodeId) : undefined)
          if (paused) {
            const label = typeof paused.metadata?.label === 'string' ? paused.metadata.label : paused.nodeId
            setPendingApproval({ nodeId: paused.nodeId, label })
          }
          toast('warn', 'Paused for approval')
        }
      }

      const processLine = (line: string) => {
        if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); return }
        if (line.startsWith('data: ')) { dispatch(pendingEvent, line.slice(6)); return }
        if (line.trim() === '') { pendingEvent = 'message' } // record separator
        // ':' comment lines (heartbeats) are ignored.
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBufferRef.current += decoder.decode(value, { stream: true })
        const parts = sseBufferRef.current.split('\n')
        sseBufferRef.current = parts.pop() ?? ''
        for (const line of parts) processLine(line)
        if (reachedTerminal) break
      }
      // Flush any trailing complete line in the buffer.
      if (sseBufferRef.current.trim()) {
        for (const line of sseBufferRef.current.split('\n')) processLine(line)
      }
    } catch (err: unknown) {
      // AbortError on Stop/navigation is expected — never a real failure. A genuine
      // network drop leaves the run going server-side; the reattach marker stays so
      // a reload reconnects.
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setRunLog(log => [...log, { type: 'error', nodeId: null, label: null, error: err instanceof Error ? err.message : String(err), ts: Date.now() }])
      }
    } finally {
      setRunning(false)
      abortRef.current = null
      sseBufferRef.current = ''
      // Clear the reattach marker ONLY on a real terminal AND when not unloading.
      // A refresh/navigate (no terminal) leaves it so the reloaded page reconnects.
      if (reachedTerminal && !unloadingRef.current) {
        activeRunIdRef.current = null
        try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* ignore */ }
        // Refresh run history so the just-finished durable run appears in the list.
        loadHistory()
      }
    }
  }, [setNodes, applyStep, loadHistory])

  // Retry a single failed step from an already-terminal run. Re-executes just
  // that node server-side, then reopens the SAME run's SSE stream (the server
  // never actually closes it on terminal — it just forwards events keyed on
  // runId, regardless of the run's overall status) to show the retry's live
  // progress. If it succeeds and every other step is already clear, the
  // backend promotes the run 'failed' → 'completed' and this reflects that too.
  const retryFailedStep = useCallback(async (nodeId: string) => {
    if (!lastRunId || retryingNodeId) return
    setRetryingNodeId(nodeId)
    try {
      await retryStep(lastRunId, nodeId)
      streamDurableRun(lastRunId)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Retry failed to start')
    } finally {
      setRetryingNodeId(null)
    }
  }, [lastRunId, retryingNodeId, streamDurableRun])

  const handleRun = async () => {
    if (!task.trim()) { toast('error', 'Enter a task to get started'); return }
    if (nodes.length === 0) { toast('error', 'Add nodes to the canvas first'); return }

    if (nodes.length > 1) {
      const connectedIds = new Set<string>()
      for (const e of edges) { connectedIds.add(e.source); connectedIds.add(e.target) }
      const disconnected = nodes.filter(n => !connectedIds.has(n.id))
      if (disconnected.length > 0) {
        const names = disconnected.map(n => (n.data as AgentNodeData).label).join(', ')
        toast('error', `Connect all nodes first. Disconnected: ${names}`)
        return
      }
    }

    // C12: confirm before firing N real Claude runs (once per session).
    if (!runConfirmedRef.current) {
      setShowRunConfirm(true)
      return
    }

    // Durable runs require a SAVED orchestration (the server loads its nodes by id).
    // If unsaved, save first to mint an id; bail if that fails.
    let id = orchId
    if (!id) {
      id = await handleSave()
      if (!id) { toast('error', 'Save the orchestration before running'); return }
    }

    setRunLog([])
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'idle', output: undefined } })))

    try {
      const { runId } = await startOrchestrationRun(id, { task })
      // Persist the reattach bookmark so a refresh mid-run reconnects on reload.
      try { localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ runId, orchId: id })) } catch { /* quota */ }
      await streamDurableRun(runId)
    } catch (err: unknown) {
      setRunLog(log => [...log, { type: 'error', nodeId: null, label: null, error: err instanceof Error ? err.message : String(err), ts: Date.now() }])
      toast('error', err instanceof Error ? err.message : 'Failed to start run')
    }
  }

  // Mark the page as unloading so an in-flight run's network-error-on-unload isn't
  // mistaken for a real terminal (which would wipe the reattach marker). Mirrors
  // Playground's onHide effect.
  useEffect(() => {
    const onHide = () => { unloadingRef.current = true }
    window.addEventListener('pagehide', onHide)
    window.addEventListener('beforeunload', onHide)
    return () => { window.removeEventListener('pagehide', onHide); window.removeEventListener('beforeunload', onHide) }
  }, [])

  // On load, reconnect to a durable run that was still running when the page was
  // last refreshed/navigated away. THIS is the "survive refresh" payoff: the run
  // never stopped server-side; we reconnect a viewer and keep streaming. One-shot.
  const reattachCheckedRef = useRef(false)
  useEffect(() => {
    if (reattachCheckedRef.current) return
    reattachCheckedRef.current = true
    let raw: string | null = null
    try { raw = localStorage.getItem(ACTIVE_RUN_KEY) } catch { return }
    if (!raw) return
    let saved: { runId?: string; orchId?: string } | null = null
    try { saved = JSON.parse(raw) } catch { try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* */ }; return }
    if (!saved?.runId) { try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* */ }; return }
    const { runId } = saved
    getOrchestrationRun(runId).then(run => {
      if (run.status === 'running' || run.status === 'paused') {
        // Restore the orchestration identity from the run, then reconnect. The
        // snapshot event will rebuild node states from the run's steps.
        if (run.orchestrationId) setOrchId(run.orchestrationId)
        if (run.orchestrationName) setOrchName(run.orchestrationName)
        streamDurableRun(runId)
      } else {
        // Finished/cancelled while we were away — result is persisted; drop marker.
        try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* */ }
        loadHistory()
      }
    }).catch(() => { try { localStorage.removeItem(ACTIVE_RUN_KEY) } catch { /* */ } })
  }, [streamDurableRun, loadHistory])

  const finalOutput = runLog.find(l => l.type === 'complete')?.finalOutput || ''

  const copyToClipboard = async (text: string) => {
    if (await writeToClipboard(text)) toast('success', 'Copied')
  }

  const showNodeEdit = !!selectedNode && !showRunPanel

  const resetRunState = () => {
    setRunLog([])
    setLastRunId(null)
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'idle', output: undefined } })))
  }

  // Format duration
  const fmtDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <ConfirmDialog
        open={showRunConfirm}
        title="Run this pipeline?"
        message={`This fires ${totalNonStartNodes} real Claude run${totalNonStartNodes === 1 ? '' : 's'} (one per agent node) and costs tokens. Shown once per session.`}
        confirmLabel="Run pipeline"
        onClose={() => setShowRunConfirm(false)}
        onConfirm={() => {
          runConfirmedRef.current = true
          setShowRunConfirm(false)
          handleRun()
        }}
      />
      <ConfirmDialog
        open={!!pendingTemplate}
        danger
        title="Replace current pipeline?"
        message={`This replaces your current ${nodes.length} node(s).`}
        confirmLabel="Replace"
        onConfirm={() => { if (pendingTemplate) applyTemplate(pendingTemplate); setPendingTemplate(null) }}
        onClose={() => setPendingTemplate(null)}
      />
      <ConfirmDialog
        open={showClearHistory}
        danger
        title="Clear all run history?"
        message="This permanently deletes the run history."
        confirmLabel="Clear history"
        onConfirm={async () => {
          try {
            await clearRunHistory()
            setHistoryList([])
          } catch (err) {
            toast('error', err instanceof Error ? err.message : 'Failed to clear history')
          }
          setShowClearHistory(false)
        }}
        onClose={() => setShowClearHistory(false)}
      />
      <ConfirmDialog
        open={!!pendingDeleteSaved}
        danger
        title="Delete this orchestration?"
        message={pendingDeleteSaved ? `"${pendingDeleteSaved.name}" will be permanently deleted.` : ''}
        confirmLabel="Delete"
        onConfirm={() => { if (pendingDeleteSaved) handleDelete(pendingDeleteSaved.id); setPendingDeleteSaved(null) }}
        onClose={() => setPendingDeleteSaved(null)}
      />
      {/* ======== LEFT SIDEBAR ======== */}
      <div className="w-[260px] min-w-[260px] bg-surface border-r border-border flex flex-col">
        {/* Sidebar tabs */}
        <div className="flex border-b border-border shrink-0" role="tablist" aria-label="Orchestration panels">
          {([
            { key: 'agents' as SidebarTab, icon: Layers, label: 'Agents' },
            { key: 'templates' as SidebarTab, icon: LayoutTemplate, label: 'Templates' },
            { key: 'saved' as SidebarTab, icon: FileText, label: 'Saved' },
            { key: 'history' as SidebarTab, icon: Clock, label: 'History' },
          ]).map((tab, i, tabs) => (
            <button
              key={tab.key}
              onClick={() => setSidebarTab(tab.key)}
              role="tab"
              aria-selected={sidebarTab === tab.key}
              tabIndex={sidebarTab === tab.key ? 0 : -1}
              onKeyDown={e => {
                if (e.key === 'ArrowRight') { e.preventDefault(); setSidebarTab(tabs[(i + 1) % tabs.length].key) }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); setSidebarTab(tabs[(i - 1 + tabs.length) % tabs.length].key) }
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors relative ${
                sidebarTab === tab.key
                  ? 'text-accent'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {sidebarTab === tab.key && (
                <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* ---- Agents Tab ---- */}
        {sidebarTab === 'agents' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search */}
            <div className="px-3 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input
                  value={agentSearch}
                  onChange={e => setAgentSearch(e.target.value)}
                  placeholder="Search agents..."
                  className="input pl-8 text-xs"
                />
              </div>
            </div>

            {/* Quick add buttons */}
            <div className="px-3 pb-2 flex gap-2 shrink-0">
              <button
                onClick={addStartNode}
                title="Add a Start (task input) node"
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/15 hover:border-accent/40 transition-colors text-xs font-medium"
              >
                <Zap className="w-3.5 h-3.5" />
                Start
              </button>
              <button
                onClick={addCustomNode}
                title="Add a Custom (free-prompt) node"
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-amber/10 border border-amber/20 text-amber hover:bg-amber/15 hover:border-amber/40 transition-colors text-xs font-medium"
              >
                <Terminal className="w-3.5 h-3.5" />
                Custom
              </button>
            </div>

            {/* Agent list */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
              {Object.entries(groupedAgents).map(([scope, agents]) => (
                <div key={scope}>
                  <p className="text-[10px] text-text-muted font-semibold px-1 mb-1.5">{scope}</p>
                  <div className="space-y-0.5">
                    {agents.map(agent => (
                      <button
                        key={`${agent.scopeLabel}-${agent.name}`}
                        onClick={() => addAgentNode(agent)}
                        aria-label={`Add ${agent.name} to pipeline`}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-2 transition-colors text-left group"
                      >
                        <AgentIcon name={agent.name} uid={`pal-${agent.scopeLabel}-${agent.name}`} size={26} global={agent.scopeLabel === 'Global'} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate group-hover:text-accent transition-colors">{formatAgentDisplay({ name: agent.name }).realName}</p>
                          {agent.description && (
                            <p className="text-[10px] text-text-muted truncate">{agent.description}</p>
                          )}
                        </div>
                        <Plus className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {filteredAgents.length === 0 && (
                <EmptyState
                  icon={agentSearch ? SearchX : Search}
                  title={agentSearch ? 'No agents match your search' : 'No agents found'}
                  size="sm"
                  card={false}
                  action={agentSearch ? { label: 'Clear search', onClick: () => setAgentSearch('') } : undefined}
                />
              )}
            </div>
          </div>
        )}

        {/* ---- Templates Tab ---- */}
        {sidebarTab === 'templates' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {apiTemplates.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-text-muted px-1 mb-1">Agent Pipelines</p>
                {apiTemplates.map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => loadTemplate({ name: tpl.name, description: tpl.description, nodes: tpl.nodes as unknown as typeof TEMPLATES[0]['nodes'], edges: tpl.edges as unknown as typeof TEMPLATES[0]['edges'] })}
                    className="w-full p-3.5 rounded-xl border border-accent/20 hover:border-accent/40 hover:bg-accent-muted/50 text-left transition-all group"
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-purple/20 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold group-hover:text-accent transition-colors">{tpl.name}</p>
                        <p className="text-[10px] text-text-muted">{tpl.nodes.length} agents</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent transition-colors shrink-0" />
                    </div>
                    <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">{tpl.description}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {tpl.nodes.map((n, i) => (
                        <span key={n.id} className="flex items-center gap-1 text-[10px] text-text-secondary">
                          {i > 0 && <ArrowRight className="w-2.5 h-2.5 text-text-muted" />}
                          <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">{n.data.agentName}</span>
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
                <div className="mx-1 my-2 border-t border-border" />
                <p className="text-[10px] font-semibold text-text-muted px-1 mb-1">Custom Pipelines</p>
              </>
            )}
            {!apiTemplates.length && <p className="text-xs text-text-muted px-1 mb-2">Pre-built pipelines to get started quickly</p>}
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.name}
                onClick={() => loadTemplate(tpl)}
                className="w-full p-3.5 rounded-xl border border-border hover:border-accent/30 hover:bg-accent-muted/50 text-left transition-all group"
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple/20 to-accent/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold group-hover:text-accent transition-colors">{tpl.name}</p>
                    <p className="text-[10px] text-text-muted">{tpl.nodes.length} nodes</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-accent transition-colors shrink-0" />
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">{tpl.description}</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {tpl.nodes.map((n, i) => (
                    <span key={n.id} className="flex items-center gap-1 text-[10px] text-text-secondary">
                      {i > 0 && <ArrowRight className="w-2.5 h-2.5 text-text-muted" />}
                      <span className="px-1.5 py-0.5 rounded bg-surface-2 font-medium">{n.data.label}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ---- Saved Tab ---- */}
        {sidebarTab === 'saved' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {savedList.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No saved pipelines yet"
                description="Save a pipeline to reuse it later."
                size="sm"
                card={false}
              />
            ) : (
              savedList.map(o => (
                <div key={o.id} className="p-3 rounded-xl border border-border hover:border-accent/20 group transition-all">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-muted flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{o.name}</p>
                      <p className="text-[10px] text-text-muted">{o.nodeCount} nodes · {new Date(o.updatedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={() => handleLoad(o.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-accent bg-accent-muted rounded-lg hover:bg-accent/20 transition-colors"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => setPendingDeleteSaved({ id: o.id, name: o.name })}
                      aria-label={`Delete ${o.name}`}
                      className="px-2.5 py-1.5 text-text-muted hover:text-red hover:bg-red-muted rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ---- History Tab ---- */}
        {sidebarTab === 'history' && (
          <div className="flex-1 flex flex-col min-h-0">
            {viewingRun ? (
              /* Detailed run view */
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <button
                  onClick={() => setViewingRun(null)}
                  className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                >
                  <ChevronRight className="w-3 h-3 rotate-180" /> Back to list
                </button>

                <div className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold">{viewingRun.orchestrationName}</p>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                      viewingRun.status === 'completed' ? 'bg-green-muted text-green' : 'bg-red-muted text-red'
                    }`}>
                      {viewingRun.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-text-muted">
                    {new Date(viewingRun.startedAt).toLocaleString()} · {fmtDuration(viewingRun.duration)}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-2 leading-relaxed line-clamp-3">{viewingRun.task}</p>
                </div>

                {/* Node outputs */}
                {viewingRun.nodes.map(node => {
                  const output = viewingRun.nodeOutputs[node.id]
                  return (
                    <div key={node.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        {node.isStart ? <Zap className="w-3.5 h-3.5 text-accent" /> :
                         node.isCustom ? <Terminal className="w-3.5 h-3.5 text-amber" /> :
                         <Sparkles className="w-3.5 h-3.5 text-purple" />}
                        <p className="text-[11px] font-semibold flex-1">{node.label}</p>
                        {output && (
                          <button onClick={() => copyToClipboard(output)} aria-label="Copy output" className="p-0.5 text-text-muted hover:text-text">
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {output ? (
                        <pre className="text-[10px] text-text-secondary whitespace-pre-wrap leading-relaxed max-h-[150px] overflow-y-auto">{output}</pre>
                      ) : (
                        <p className="text-[10px] text-text-muted">No output</p>
                      )}
                    </div>
                  )
                })}

                {viewingRun.finalOutput && (
                  <div className="rounded-xl bg-accent-muted border border-accent/20 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold text-accent">Final Output</p>
                      <button onClick={() => copyToClipboard(viewingRun.finalOutput)} aria-label="Copy final output" className="text-text-muted hover:text-text">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <pre className="text-[10px] text-text whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto">{viewingRun.finalOutput}</pre>
                  </div>
                )}

                <button
                  onClick={() => {
                    setTask(viewingRun.task)
                    setViewingRun(null)
                    setShowRunPanel(true)
                  }}
                  className="btn-primary btn-md w-full"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Re-run with same task
                </button>
              </div>
            ) : (
              /* History list */
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {historyList.length > 0 && (
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={() => setShowClearHistory(true)}
                      className="text-[10px] text-red hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {historyLoading ? (
                  <SkeletonCards count={4} />
                ) : historyList.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="No runs yet"
                    description="Run an orchestration to see history."
                    size="sm"
                    card={false}
                  />
                ) : (
                  historyList.map(run => (
                    <div key={run.id} className="p-3 rounded-xl border border-border hover:border-accent/20 group transition-all">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          run.status === 'completed' ? 'bg-green-muted' : 'bg-red-muted'
                        }`}>
                          {run.status === 'completed' ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold truncate">{run.orchestrationName}</p>
                          <p className="text-[10px] text-text-muted">
                            {run.nodeCount} nodes · {fmtDuration(run.duration)} · {new Date(run.startedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-text-muted truncate mt-1.5 px-0.5">{run.task}</p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={async () => {
                            try {
                              const detail = await getRunDetail(run.id)
                              setViewingRun(detail)
                            } catch { toast('error', 'Failed to load') }
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-accent bg-accent-muted rounded-lg hover:bg-accent/20 transition-colors"
                        >
                          <Eye className="w-3 h-3" /> View
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await deleteRun(run.id)
                              setHistoryList(prev => prev.filter(r => r.id !== run.id))
                            } catch (err) {
                              toast('error', err instanceof Error ? err.message : 'Failed to delete run')
                            }
                          }}
                          aria-label={`Delete run for ${run.orchestrationName}`}
                          className="px-2.5 py-1.5 text-text-muted hover:text-red hover:bg-red-muted rounded-lg transition-colors"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======== MAIN AREA ======== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-3">
            <input
              value={orchName}
              onChange={e => setOrchName(e.target.value)}
              aria-label="Orchestration name"
              className="text-sm font-semibold bg-transparent outline-none focus:ring-0 text-text w-56 border-b border-transparent hover:border-border focus:border-accent rounded-none"
            />
            <div className="flex items-center gap-1.5 text-text-muted text-[11px]">
              <span className="px-1.5 py-0.5 rounded bg-surface-2">{nodes.length} nodes</span>
              <span className="px-1.5 py-0.5 rounded bg-surface-2">{edges.length} edges</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowGuide(true)} aria-label="How orchestration works" className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent-muted transition-colors" title="How it works">
              <HelpCircle className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border mx-0.5" />
            <button onClick={newOrchestration} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-text-secondary hover:bg-surface-2 transition-colors" title="New">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
            <button onClick={() => setShowClearConfirm(true)} disabled={nodes.length === 0} aria-label="Clear canvas" className="p-2 rounded-lg text-text-muted hover:text-red hover:bg-red-muted transition-colors disabled:opacity-20" title="Clear">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-5 bg-border mx-0.5" />
            <button
              onClick={handleSave}
              disabled={nodes.length === 0 || saving}
              title={nodes.length === 0 ? 'Add nodes before saving' : ''}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleExport}
              disabled={!orchId}
              title={orchId ? 'Export as Mermaid + JSON' : 'Save the pipeline first to export it'}
              aria-label="Export pipeline"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => {
                if (running) { setShowRunPanel(true); return }
                if (!showRunPanel) { setShowRunPanel(true); return }
                if (task.trim()) { handleRun(); return }
              }}
              disabled={nodes.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-accent to-purple text-white hover:opacity-90 transition-all disabled:opacity-30 shadow-soft shadow-accent/20"
            >
              {running ? (
                <><Loader className="w-3.5 h-3.5 animate-spin" /> Running...</>
              ) : showRunPanel && task.trim() ? (
                <><Play className="w-3.5 h-3.5" /> Run Now</>
              ) : (
                <><Play className="w-3.5 h-3.5" /> Run</>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Flow Canvas */}
          <div className="flex-1 min-w-0">
            {nodes.length === 0 ? (
              /* ---- Empty State ---- */
              <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-bg">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple/20 to-accent/20 flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-purple" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-accent to-purple flex items-center justify-center">
                    <Zap className="w-3 h-3 text-white" />
                  </div>
                </div>
                <h1 className="text-lg font-bold text-text mb-2">Agent Orchestration</h1>
                <p className="text-text-muted text-sm mb-8 max-w-md leading-relaxed">
                  Chain your Claude agents into powerful multi-step pipelines.
                  Each agent processes the output of the previous step.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSidebarTab('templates')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-purple text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all shadow-card shadow-accent/20"
                  >
                    <LayoutTemplate className="w-4 h-4" />
                    Use a Template
                  </button>
                  <button
                    onClick={() => { addStartNode(); addCustomNode() }}
                    className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-surface-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Start from Scratch
                  </button>
                </div>
                <button
                  onClick={() => setShowGuide(true)}
                  className="mt-6 flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  How does orchestration work?
                </button>
              </div>
            ) : (
              <div className="h-full flex flex-col min-h-0">
                {disconnectedNodeLabels.length > 0 && !running && (
                  <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-amber bg-amber/10 border border-amber/20 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{disconnectedNodeLabels.length} node(s) not connected: {disconnectedNodeLabels.join(', ')}. Connect them before running.</span>
                  </div>
                )}
                <div className="flex-1 min-h-0">
              <ReactFlow
                nodes={nodesWithOrder}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                deleteKeyCode={["Backspace", "Delete"]}
                onInit={(instance) => {
                  rfInstanceRef.current = instance
                  instance.fitView({ padding: 0.15 })
                }}
                proOptions={{ hideAttribution: true }}
                className="bg-bg"
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-border)" />
                <Controls className="!bg-surface !border-border !rounded-xl !shadow-card" />
                <MiniMap
                  className="!bg-surface !border-border !rounded-xl"
                  nodeColor="var(--color-accent)"
                  maskColor="var(--color-surface-2)"
                />
              </ReactFlow>
                </div>
              </div>
            )}
          </div>

          {/* ---- Node Edit Panel ---- */}
          {showNodeEdit && selectedNode && (
            <div className="w-[320px] min-w-[320px] border-l border-border bg-surface flex flex-col">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-accent" />
                  Edit Node
                </p>
                <button onClick={() => setSelectedNodeId(null)} aria-label="Close node editor" className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                <div>
                  <label htmlFor="node-label" className="text-xs font-medium text-text-muted block mb-2">Label</label>
                  <input
                    id="node-label"
                    value={(selectedNode.data as AgentNodeData).label ?? ''}
                    onChange={e => updateSelectedNodeData({ label: e.target.value })}
                    className="input"
                    placeholder="Node label"
                  />
                </div>

                <div>
                  <label htmlFor="node-description" className="text-xs font-medium text-text-muted block mb-2">Description</label>
                  <input
                    id="node-description"
                    value={(selectedNode.data as AgentNodeData).description ?? ''}
                    onChange={e => updateSelectedNodeData({ description: e.target.value })}
                    className="input"
                    placeholder="What does this step do?"
                  />
                </div>

                <div>
                  <label htmlFor="node-instructions" className="text-xs font-medium text-text-muted block mb-2">
                    Instructions
                    {(selectedNode.data as AgentNodeData).agentName && (
                      <span className="ml-1.5 text-[10px] font-normal opacity-60">(overrides agent default)</span>
                    )}
                  </label>
                  <textarea
                    id="node-instructions"
                    value={(selectedNode.data as AgentNodeData).instructions ?? ''}
                    onChange={e => updateSelectedNodeData({ instructions: e.target.value })}
                    rows={10}
                    className="input resize-none leading-relaxed"
                    placeholder="Describe what this step should do. Leave empty to use the agent's built-in instructions."
                  />
                </div>

                {/* Retry + Condition */}
                {!(selectedNode.data as AgentNodeData).isStart && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="node-retry" className="text-xs font-medium text-text-muted block mb-1">Retry on Failure</label>
                      <select
                        id="node-retry"
                        value={(selectedNode.data as AgentNodeData).retryCount ?? 0}
                        onChange={e => updateSelectedNodeData({ retryCount: parseInt(e.target.value) })}
                        className="input"
                      >
                        <option value={0}>No retry</option>
                        <option value={1}>1 retry</option>
                        <option value={2}>2 retries</option>
                        <option value={3}>3 retries</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="node-condition" className="text-xs font-medium text-text-muted block mb-1">Condition</label>
                      <input
                        id="node-condition"
                        value={(selectedNode.data as AgentNodeData).condition ?? ''}
                        onChange={e => updateSelectedNodeData({ condition: e.target.value })}
                        placeholder="e.g. PASS"
                        className="input"
                      />
                      <p className="text-[9px] text-text-muted mt-0.5">Skip node if upstream output doesn't contain this text</p>
                    </div>
                  </div>
                )}

                {!(selectedNode.data as AgentNodeData).isStart && (
                  <label htmlFor="node-approval" className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-surface-2 cursor-pointer">
                    <input
                      id="node-approval"
                      type="checkbox"
                      checked={(selectedNode.data as AgentNodeData).isApproval ?? false}
                      onChange={e => updateSelectedNodeData({ isApproval: e.target.checked })}
                      className="shrink-0 w-4 h-4 mt-0.5 accent-amber"
                    />
                    <span>
                      <span className="text-xs font-medium text-text-muted flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-amber" /> Approval gate
                      </span>
                      <span className="text-[9px] text-text-muted block mt-0.5">Pause the run here for a human to approve or reject before continuing</span>
                    </span>
                  </label>
                )}

                <div className="pt-3 border-t border-border space-y-1">
                  <p className="text-[10px] text-text-muted">ID: <code className="font-mono text-text-secondary">{selectedNode.id}</code></p>
                  {(selectedNode.data as AgentNodeData).scope && (
                    <p className="text-[10px] text-text-muted">Scope: <span className="text-text-secondary">{(selectedNode.data as AgentNodeData).scope}</span></p>
                  )}
                  {(selectedNode.data as AgentNodeData).agentName && (
                    <p className="text-[10px] text-text-muted">Agent: <span className="text-text-secondary">{(selectedNode.data as AgentNodeData).agentName}</span></p>
                  )}
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-border shrink-0">
                <button
                  onClick={deleteSelectedNode}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl border border-red/20 text-red hover:bg-red-muted transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Node
                </button>
              </div>
            </div>
          )}

          {/* ---- Run Panel ---- */}
          {showRunPanel && (
            <div className="w-[380px] min-w-[380px] border-l border-border bg-surface flex flex-col">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Play className="w-4 h-4 text-accent" />
                  Run Pipeline
                </p>
                <button onClick={() => setShowRunPanel(false)} aria-label="Close run panel" className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Task input */}
              <div className="px-5 py-4 border-b border-border shrink-0">
                <label htmlFor="run-task" className="text-xs font-medium text-text-muted block mb-2">What should this pipeline do?</label>
                <textarea
                  id="run-task"
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  placeholder="e.g. Build a React hook for infinite scroll with TypeScript..."
                  rows={3}
                  className="input resize-none leading-relaxed"
                />

                <div className="flex gap-2 mt-3">
                  {!running && runLog.length > 0 ? (
                    <>
                      <button
                        onClick={handleRun}
                        disabled={!task.trim() || nodes.length === 0}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent to-purple text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-30 transition-all"
                      >
                        <RotateCcw className="w-4 h-4" /> Re-run
                      </button>
                      <button
                        onClick={resetRunState}
                        title="Clear previous run results"
                        className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-surface-2 transition-colors"
                      >
                        Clear log
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleRun}
                        disabled={!task.trim() || running || nodes.length === 0}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent to-purple text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-30 transition-all shadow-soft shadow-accent/20"
                      >
                        {running ? <><Loader className="w-4 h-4 animate-spin" /> Running...</> : <><Play className="w-4 h-4" /> Start Run</>}
                      </button>
                      {running && (
                        <button
                          onClick={cancelRun}
                          className="flex items-center gap-1.5 px-4 py-2.5 border border-red/30 text-red rounded-xl text-sm font-medium hover:bg-red-muted transition-colors"
                        >
                          <StopCircle className="w-4 h-4" /> Stop
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {(running || runLog.length > 0) && (
                <div className="px-5 py-2.5 border-b border-border shrink-0">
                  <div className="flex items-center justify-between text-[11px] text-text-muted mb-1.5">
                    <span>{running ? 'Processing...' : runLog.some(l => l.type === 'error' && !l.nodeId) ? 'Failed' : 'Complete'}</span>
                    <span>{completedNodes}/{totalNonStartNodes} steps · {progressPercent}%</span>
                  </div>
                  <div
                    className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Pipeline progress"
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        runLog.some(l => l.type === 'error')
                          ? 'bg-red'
                          : running
                          ? 'bg-gradient-to-r from-accent to-purple animate-pulse'
                          : 'bg-gradient-to-r from-accent to-purple'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* HITL approval gate */}
              {pendingApproval && (
                <div className="px-5 py-3 border-b border-border shrink-0 bg-amber/5">
                  <p className="text-xs font-semibold text-text flex items-center gap-1.5 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber" />
                    Approval needed — <span className="text-amber">{pendingApproval.label}</span>
                  </p>
                  <p className="text-[11px] text-text-muted mb-2.5">The pipeline is paused at this gate. Approve to continue, or reject to cancel the run.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveApproval(true)}
                      disabled={approving}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => resolveApproval(false)}
                      disabled={approving}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-red/40 text-red rounded-lg text-xs font-semibold hover:bg-red-muted disabled:opacity-40 transition"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Run log */}
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {runLog.length === 0 && (
                  <div className="text-center py-10">
                    <Play className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-30" />
                    <p className="text-xs text-text-muted">Enter a task and click Start Run</p>
                  </div>
                )}

                {runLog.map((log, i) => (
                  <div key={i} className={`rounded-xl px-3.5 py-3 text-xs transition-all ${
                    log.type === 'start' ? 'bg-purple/5 border border-purple/15' :
                    log.type === 'done' ? 'bg-green/5 border border-green/15' :
                    log.type === 'error' ? 'bg-red/5 border border-red/15' :
                    'bg-accent/5 border border-accent/15'
                  }`}>
                    <div className="flex items-center gap-2 font-medium">
                      {log.type === 'start' && <><Loader className="w-3.5 h-3.5 animate-spin text-purple" /><span className="text-purple">{log.label}</span><span className="text-text-muted font-normal ml-auto">running</span></>}
                      {log.type === 'done' && <><CheckCircle className="w-3.5 h-3.5 text-green" /><span className="text-green">{log.label}</span><span className="text-text-muted font-normal ml-auto">done</span></>}
                      {log.type === 'error' && <><AlertCircle className="w-3.5 h-3.5 text-red" /><span className="text-red">{log.label || 'Error'}</span></>}
                      {log.type === 'complete' && <><Sparkles className="w-3.5 h-3.5 text-accent" /><span className="text-accent">Pipeline complete</span></>}
                      {log.ts != null && <span className="text-[10px] text-text-muted font-normal ml-auto tabular-nums">{new Date(log.ts).toLocaleTimeString()}</span>}
                    </div>
                    {log.output && (
                      <div className="mt-2">
                        <p className="text-text-secondary leading-relaxed line-clamp-4">{log.output}</p>
                        {log.nodeId && (
                          <button
                            onClick={() => setViewingOutputNodeId(log.nodeId)}
                            className="text-[11px] text-accent hover:underline mt-1.5 font-medium"
                          >
                            View full output
                          </button>
                        )}
                      </div>
                    )}
                    {log.error && <p className="text-red mt-1.5 leading-relaxed">{log.error}</p>}
                    {log.type === 'error' && log.nodeId && !running && (
                      <button
                        onClick={() => retryFailedStep(log.nodeId as string)}
                        disabled={retryingNodeId === log.nodeId}
                        className="flex items-center gap-1.5 text-[11px] text-red hover:underline mt-1.5 font-medium disabled:opacity-50"
                      >
                        {retryingNodeId === log.nodeId
                          ? <><Loader className="w-3 h-3 animate-spin" /> Retrying...</>
                          : <><RotateCcw className="w-3 h-3" /> Retry this step</>}
                      </button>
                    )}
                  </div>
                ))}

                {finalOutput && (
                  <div className="mt-3 rounded-xl bg-surface-2 border border-border p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-semibold text-text-muted">Final Output</p>
                      <button
                        onClick={() => copyToClipboard(finalOutput)}
                        className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text transition-colors px-2 py-1 rounded-lg hover:bg-surface"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <pre className="text-xs text-text whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">{finalOutput}</pre>
                  </div>
                )}

                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======== MODALS ======== */}

      {/* Clear Confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)} aria-hidden="true" />
          <div className="relative bg-surface border border-border rounded-2xl p-6 w-[380px] shadow-pop" role="dialog" aria-modal="true" aria-labelledby="clear-canvas-title">
            <h3 id="clear-canvas-title" className="text-base font-bold mb-2">Clear canvas?</h3>
            <p className="text-sm text-text-muted mb-6">This removes all {nodes.length} nodes and {edges.length} edges. Cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-surface-2 transition-colors">
                Cancel
              </button>
              <button onClick={clearCanvas} className="px-4 py-2.5 text-sm rounded-xl bg-red text-white hover:opacity-90 font-medium transition-opacity">
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowGuide(false)} aria-hidden="true" />
          <div className="relative bg-surface border border-border rounded-2xl w-[580px] max-h-[80vh] shadow-pop flex flex-col" role="dialog" aria-modal="true" aria-labelledby="guide-title">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h3 id="guide-title" className="text-base font-bold flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-accent" />
                How Orchestration Works
              </h3>
              <button onClick={() => setShowGuide(false)} aria-label="Close guide" className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <p className="text-sm text-text leading-relaxed">
                Build <span className="text-accent font-semibold">multi-agent pipelines</span> by chaining Claude agents.
                Each node processes upstream output and passes its result downstream.
              </p>

              <div className="space-y-3">
                {[
                  { step: '1', title: 'Add Nodes', desc: 'Click agents from the sidebar or use Start/Custom buttons. Each becomes a step in your pipeline.' },
                  { step: '2', title: 'Connect Them', desc: 'Drag from the right handle (output) to the left handle (input) of another node to create flow.' },
                  { step: '3', title: 'Configure', desc: 'Click any node to edit its label, description, and custom instructions.' },
                  { step: '4', title: 'Run', desc: 'Click Run, enter your task, and watch each node execute in order. Purple badges show sequence.' },
                  { step: '5', title: 'Review', desc: 'Nodes turn green (done) or red (error). Click any completed node to see its full output.' },
                ].map(item => (
                  <div key={item.step} className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">{item.step}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-text-muted leading-relaxed mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-border">
                {[
                  { icon: Zap, color: 'text-accent', bg: 'bg-accent-muted', title: 'Start Node', desc: 'Entry point. Passes task without calling Claude.' },
                  { icon: Terminal, color: 'text-amber', bg: 'bg-amber-muted', title: 'Custom Step', desc: 'Node with your own freeform instructions.' },
                  { icon: ArrowRight, color: 'text-purple', bg: 'bg-purple-muted', title: 'Execution Order', desc: 'Purple badges show the sequence.' },
                  { icon: ChevronDown, color: 'text-green', bg: 'bg-green-muted', title: 'Context Passing', desc: 'Nodes get all upstream outputs merged.' },
                ].map(item => (
                  <div key={item.title} className="bg-surface-2 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                      <p className="text-xs font-semibold">{item.title}</p>
                    </div>
                    <p className="text-[11px] text-text-muted leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-border">
                <p className="text-[11px] font-semibold text-text-muted mb-2">Tips</p>
                <ul className="space-y-1 text-xs text-text-muted">
                  <li>Press <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] font-mono">Backspace</kbd> to delete selected nodes</li>
                  <li>
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] font-mono">⌘S</kbd> save ·{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] font-mono">⌘↵</kbd> run ·{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-[10px] font-mono">Esc</kbd> close panels
                  </li>
                  <li>Connect one node to many for fan-out, many to one for fan-in</li>
                  <li>Save orchestrations to re-run with different tasks</li>
                  <li>Run history persists so you can review past results</li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-border shrink-0">
              <button
                onClick={() => setShowGuide(false)}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-accent to-purple text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Output Viewer Modal */}
      {viewingOutputNodeId && viewingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setViewingOutputNodeId(null)} aria-hidden="true" />
          <div className="relative bg-surface border border-border rounded-2xl w-[640px] max-h-[80vh] shadow-pop flex flex-col" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                {(viewingNode.data as AgentNodeData).status === 'done' ? (
                  <CheckCircle className="w-4 h-4 text-green" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red" />
                )}
                <h3 className="text-sm font-bold">{(viewingNode.data as AgentNodeData).label}</h3>
                <span className="text-xs text-text-muted">Output</span>
              </div>
              <div className="flex items-center gap-2">
                {viewingOutput && (
                  <button onClick={() => copyToClipboard(viewingOutput)} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text px-2.5 py-1.5 rounded-lg hover:bg-surface-2 transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                )}
                <button onClick={() => setViewingOutputNodeId(null)} aria-label="Close output viewer" className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {viewingOutput ? (
                <pre className="text-sm text-text whitespace-pre-wrap leading-relaxed">{viewingOutput}</pre>
              ) : (
                <p className="text-sm text-text-muted">No output available.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export DAG modal — Mermaid + JSON of the saved pipeline */}
      {exportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setExportData(null)} aria-hidden="true" />
          <div className="relative bg-surface border border-border rounded-2xl w-[680px] max-h-[82vh] shadow-pop flex flex-col" role="dialog" aria-modal="true" aria-label="Export pipeline">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-bold">{exportData.name}</h3>
                <span className="text-xs text-text-muted">{exportData.nodeCount} nodes · {exportData.edgeCount} edges</span>
              </div>
              <button onClick={() => setExportData(null)} aria-label="Close export" className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-text-muted">Mermaid</span>
                  <button onClick={() => copyToClipboard(exportData.mermaid)} className="flex items-center gap-1.5 text-[11px] text-accent hover:underline">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <pre className="text-xs bg-surface-2 border border-border rounded-lg p-3 overflow-x-auto leading-relaxed">{exportData.mermaid}</pre>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-text-muted">JSON</span>
                  <button onClick={() => copyToClipboard(JSON.stringify(exportData.json, null, 2))} className="flex items-center gap-1.5 text-[11px] text-accent hover:underline">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <pre className="text-xs bg-surface-2 border border-border rounded-lg p-3 overflow-x-auto leading-relaxed max-h-[240px]">{JSON.stringify(exportData.json, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
