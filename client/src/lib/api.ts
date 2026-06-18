import type { Agent, AppConfig, Project, UnifiedAgent, UnifiedCommand, UnifiedRule, Template, TrainingCorrection, Category } from '../types'
import { toast } from '../components/Toast'
import { clientLogger } from './clientLogger'

const BASE = '/api'

async function request<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  const { timeoutMs = 8000, signal: externalSignal, ...rest } = options ?? {}
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), timeoutMs)
  const signal = externalSignal
    ? (AbortSignal as unknown as { any: (sigs: AbortSignal[]) => AbortSignal }).any(
        [externalSignal, controller.signal],
      )
    : controller.signal
  const method = (rest.method || 'GET').toUpperCase()
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...rest,
      signal,
    })
    clearTimeout(tid)
    if (!res.ok) {
      // Content-type-aware error parsing. When the server's SPA fallback eats
      // an /api/* path (route missing OR backend stale), the body is HTML —
      // calling res.json() throws + we used to toast bare "HTTP 404", masking
      // the real reason. Detect HTML explicitly and surface a CTA.
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      let data: { error?: string; code?: string; hint?: string } = {}
      if (ct.includes('application/json')) {
        data = await res.json().catch(() => ({}))
      } else {
        const text = await res.text().catch(() => '')
        const lead = text.trimStart().slice(0, 16).toLowerCase()
        if (lead.startsWith('<!doctype') || lead.startsWith('<html')) {
          data = {
            error: `Backend returned HTML for ${method} ${path} (${res.status}).`,
            hint: 'Endpoint missing OR backend running stale code — restart server: pm2 restart polyglot',
            code: 'html_response',
          }
        } else {
          data = { error: `HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}` }
        }
      }
      // Skip noisy 4xx that are intentional client-state (e.g. 404 polling)
      // — only log 5xx + 401/403/409 + 429. Also log html_response explicitly
      // because that signals a real config/deploy problem.
      if (res.status >= 500 || [401, 403, 409, 429].includes(res.status) || data.code === 'html_response') {
        if (path !== '/logs/client-error') {
          clientLogger.warn(`${method} ${path} → ${res.status}${data.code ? ` [${data.code}]` : ''}`, {
            category: 'api', status: res.status, route: path,
            meta: { error: data.error, hint: data.hint, code: data.code },
          })
        }
      }
      const message = data.hint
        ? `${data.error} ${data.hint}`
        : (data.error || `API error: ${res.status}`)
      throw new Error(message)
    }
    return res.json()
  } catch (err) {
    clearTimeout(tid)
    // Network failures (CORS / offline / DNS) — log unless user-cancel
    const isAbort = err instanceof Error && err.name === 'AbortError'
    if (!isAbort && path !== '/logs/client-error') {
      clientLogger.warn(err instanceof Error ? err : String(err), {
        category: 'api', route: path,
        meta: { phase: 'network' },
      })
    }
    throw err
  }
}

async function requestWithRetry<T>(path: string, options?: RequestInit & { timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
  try {
    return await request<T>(path, options)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    await new Promise(r => setTimeout(r, 500))
    return request<T>(path, options)
  }
}

/**
 * Standard error handler for catch blocks in API call chains.
 * Logs full error to console + shows user-facing toast.
 *
 * Use:
 *   getThing().catch(err => apiError('Load thing', err))
 *
 * Replaces silent `.catch(() => {})` patterns. Truncates long error messages
 * to keep toast readable. Skips toast for AbortError (intentional cancellation).
 */
export function apiError(label: string, err: unknown): void {
  // Don't toast user-cancelled aborts (e.g., navigation away from streaming).
  if (err instanceof DOMException && err.name === 'AbortError') return
  if (err instanceof Error && err.name === 'AbortError') return

  const detail = err instanceof Error ? err.message : String(err)
  // request() already POSTed the raw network/HTTP failure with category:'api'.
  // This adds the labeled UI-context layer so debuggers can correlate.
  clientLogger.warn(err instanceof Error ? err : detail, {
    category: 'api', meta: { label },
  })
  const safeDetail = detail && detail !== '[object Object]' ? `: ${detail.slice(0, 100)}` : ''
  toast('error', `${label}${safeDetail}`)
}

// Sanitize name for safe file creation
export function sanitizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^-+|-+$/g, '')
}

// Config
export const getConfig = () => request<AppConfig>('/config')
export const updateProjectDirs = (dirs: string[]) =>
  request('/config/project-dirs', { method: 'POST', body: JSON.stringify({ dirs }) })

// Global CLAUDE.md
export const getGlobalClaudeMd = () =>
  request<{ content: string; exists: boolean }>('/global/claude-md')
export const updateGlobalClaudeMd = (content: string) =>
  request('/global/claude-md', { method: 'PUT', body: JSON.stringify({ content }) })

// Global Agents
export const getGlobalAgents = () => request<Agent[]>('/global/agents')
export const getGlobalAgent = (name: string) => request<Agent>(`/global/agents/${name}`)
export const updateGlobalAgent = (name: string, content: string, opts?: { createOnly?: boolean }) =>
  request(`/global/agents/${name}${opts?.createOnly ? '?createOnly=1' : ''}`, { method: 'PUT', body: JSON.stringify({ content }) })
export const deleteGlobalAgent = (name: string) =>
  request(`/global/agents/${name}`, { method: 'DELETE' })

// Global Settings
export const getGlobalSettings = () => request<Record<string, unknown>>('/global/settings')
export const updateGlobalSettings = (settings: Record<string, unknown>) =>
  request('/global/settings', { method: 'PUT', body: JSON.stringify({ settings }) })

// Projects
export const getProjects = () => request<Project[]>('/projects')

// Project CLAUDE.md
export const getProjectClaudeMd = (id: string) =>
  request<{ content: string; exists: boolean; path: string }>(`/projects/${id}/claude-md`)
export const updateProjectClaudeMd = (id: string, content: string) =>
  request(`/projects/${id}/claude-md`, { method: 'PUT', body: JSON.stringify({ content }) })

// Project Agents
export const getProjectAgents = (id: string) => request<Agent[]>(`/projects/${id}/agents`)
export const getProjectAgent = (id: string, name: string) =>
  request<Agent>(`/projects/${id}/agents/${name}`)
export const updateProjectAgent = (id: string, name: string, content: string, opts?: { createOnly?: boolean }) =>
  request(`/projects/${id}/agents/${name}${opts?.createOnly ? '?createOnly=1' : ''}`, { method: 'PUT', body: JSON.stringify({ content }) })
export const deleteProjectAgent = (id: string, name: string) =>
  request(`/projects/${id}/agents/${name}`, { method: 'DELETE' })

// Project Commands (full CRUD)
export interface MdFile {
  name: string
  content: string
  path: string
  updatedAt: string
}
export const getProjectCommands = (id: string) => request<MdFile[]>(`/projects/${id}/commands`)
export const getProjectCommand = (id: string, name: string) =>
  request<MdFile>(`/projects/${id}/commands/${name}`)
export const updateProjectCommand = (id: string, name: string, content: string) =>
  request(`/projects/${id}/commands/${name}`, { method: 'PUT', body: JSON.stringify({ content }) })
export const deleteProjectCommand = (id: string, name: string) =>
  request(`/projects/${id}/commands/${name}`, { method: 'DELETE' })

// Project Rules (full CRUD)
export const getProjectRules = (id: string) => request<MdFile[]>(`/projects/${id}/rules`)
export const getProjectRule = (id: string, name: string) =>
  request<MdFile>(`/projects/${id}/rules/${name}`)
export const updateProjectRule = (id: string, name: string, content: string) =>
  request(`/projects/${id}/rules/${name}`, { method: 'PUT', body: JSON.stringify({ content }) })
export const deleteProjectRule = (id: string, name: string) =>
  request(`/projects/${id}/rules/${name}`, { method: 'DELETE' })

// Global Rules
export const getGlobalRules = () => request<MdFile[]>('/global/rules')
export const getGlobalRule = (name: string) => request<MdFile>(`/global/rules/${name}`)
export const updateGlobalRule = (name: string, content: string) =>
  request(`/global/rules/${name}`, { method: 'PUT', body: JSON.stringify({ content }) })
export const deleteGlobalRule = (name: string) =>
  request(`/global/rules/${name}`, { method: 'DELETE' })

// Rule Templates
export interface RuleTemplate {
  id: string
  name: string
  description: string
  category: string
  content: string
}
export const getRuleTemplates = () => request<RuleTemplate[]>('/rule-templates')
export const applyRuleTemplateGlobal = (templateId: string) =>
  request('/global/rules/from-template', { method: 'POST', body: JSON.stringify({ templateId }) })
export const applyRuleTemplateProject = (projectId: string, templateId: string) =>
  request(`/projects/${projectId}/rules/from-template`, { method: 'POST', body: JSON.stringify({ templateId }) })

// Auto-Init Rules
export const initProjectRules = (projectId: string, templates?: string[]) =>
  request(`/projects/${projectId}/init-rules`, { method: 'POST', body: JSON.stringify({ templates: templates || [] }) })
export const initAllRules = (templates?: string[]) =>
  request('/init-rules', { method: 'POST', body: JSON.stringify({ templates: templates || [] }) })

// Copy / Move agent
export const copyAgent = (from: string, to: string, agentName: string) =>
  request('/copy-agent', { method: 'POST', body: JSON.stringify({ from, to, agentName }) })
export const moveAgent = (from: string, to: string, agentName: string) =>
  request('/move-agent', { method: 'POST', body: JSON.stringify({ from, to, agentName }) })

// Directory browser
export interface BrowseResult {
  current: string
  displayPath: string
  parent: string | null
  breadcrumbs: { name: string; path: string }[]
  directories: { name: string; path: string; displayPath: string; hasProjects: boolean }[]
}
export const browseDirectory = (dirPath?: string) =>
  request<BrowseResult>(`/browse${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`)

// Unified endpoints
export const getUnifiedAgents = () => request<UnifiedAgent[]>('/unified/agents')
export const getUnifiedAgentsByCategory = (category: string) =>
  request<UnifiedAgent[]>(`/unified/agents?category=${encodeURIComponent(category)}`)
export const getUnifiedCommands = () => request<UnifiedCommand[]>('/unified/commands')
export const getUnifiedRules = () => request<UnifiedRule[]>('/unified/rules')

// Categories
export const getCategories = () => request<Category[]>('/categories')
export const createCategory = (name: string) =>
  request<{ ok: boolean; name: string }>('/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
export const renameCategory = (oldName: string, newName: string) =>
  request<{ ok: boolean; updated: number; newName: string }>('/categories/rename', {
    method: 'POST',
    body: JSON.stringify({ oldName, newName }),
  })
export const deleteCategory = (category: string, reassignTo?: string) =>
  request<{ ok: boolean; updated: number; reassignedTo: string }>('/categories/delete', {
    method: 'POST',
    body: JSON.stringify({ category, reassignTo }),
  })
export const reorderCategories = (order: string[]) =>
  request<{ ok: boolean; order: string[] }>('/categories/reorder', {
    method: 'POST',
    body: JSON.stringify({ order }),
  })

// Templates
export const getTemplates = () => request<Template[]>('/templates')
export const getTemplate = (name: string) => request<Template>(`/templates/${name}`)
export const updateTemplate = (name: string, content: string) =>
  request<Template>(`/templates/${name}`, { method: 'PUT', body: JSON.stringify({ content }) })
export const deleteTemplate = (name: string) =>
  request(`/templates/${name}`, { method: 'DELETE' })

// Training
export const getTraining = (agentName: string) =>
  request<TrainingCorrection[]>(`/training/${agentName}`)
export const addTraining = (agentName: string, issue: string, correction: string) =>
  request<TrainingCorrection>(`/training/${agentName}`, {
    method: 'POST',
    body: JSON.stringify({ issue, correction }),
  })
export const updateTraining = (agentName: string, id: string, data: Partial<TrainingCorrection>) =>
  request<TrainingCorrection>(`/training/${agentName}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
export const deleteTraining = (agentName: string, id: string) =>
  request(`/training/${agentName}/${id}`, { method: 'DELETE' })
export const bakeTraining = (agentName: string) =>
  request<{ ok: boolean; baked: number }>(`/training/${agentName}/bake`, { method: 'POST' })

// Claude AI
export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiSession {
  id: string
  title: string
  messages: AiMessage[]
  createdAt: string
  updatedAt: string
  messageCount?: number
}

export const sendAiChat = (messages: AiMessage[], system?: string) =>
  request<{ content: string }>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, system }),
  })

export async function streamAiChat(
  messages: AiMessage[],
  system: string | undefined,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${BASE}/ai/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system }),
    signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(data.error || `API error: ${res.status}`)
  }
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      try {
        const event = JSON.parse(trimmed.slice(6))
        if (event.type === 'chunk') {
          fullContent += event.content
          onChunk(event.content)
        } else if (event.type === 'done') {
          fullContent = event.content
        } else if (event.type === 'error') {
          throw new Error(event.error)
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }
  return fullContent
}

// History
export const getAiHistory = () => request<AiSession[]>('/ai/history')
export const getAiSession = (id: string) => request<AiSession>(`/ai/history/${id}`)
export const saveAiSession = (session: { id?: string; title: string; messages: AiMessage[] }) =>
  request<{ id: string }>('/ai/history', { method: 'POST', body: JSON.stringify(session) })
export const deleteAiSession = (id: string) =>
  request(`/ai/history/${id}`, { method: 'DELETE' })

// Orchestration Run History
export interface RunHistoryItem {
  id: string
  orchestrationName: string
  orchestrationId: string | null
  task: string
  status: 'completed' | 'failed' | 'cancelled'
  nodeCount: number
  startedAt: string
  completedAt: string
  duration: number
}

export interface RunHistoryDetail extends RunHistoryItem {
  nodes: { id: string; label: string; agentName?: string; isStart?: boolean; isCustom?: boolean }[]
  edges: { source: string; target: string }[]
  logs: { nodeId: string | null; label: string | null; type: string; output?: string; error?: string; finalOutput?: string }[]
  nodeOutputs: Record<string, string>
  finalOutput: string
}

export const getRunHistory = () => request<RunHistoryItem[]>('/orchestrations/runs')
export const getRunDetail = (id: string) => request<RunHistoryDetail>(`/orchestrations/runs/${id}`)
export const deleteRun = (id: string) => request(`/orchestrations/runs/${id}`, { method: 'DELETE' })
export const clearRunHistory = () => request('/orchestrations/runs', { method: 'DELETE' })

// Full app context
export interface AppContext {
  globalClaudeMd: { path: string; content: string }
  globalAgentsDir: string
  globalAgents: { name: string; description: string; path: string; content: string }[]
  globalRulesDir: string
  globalRules: { name: string; path: string; content: string }[]
  projects: {
    name: string
    path: string
    agentsDir: string
    commandsDir: string
    rulesDir: string
    claudeMd: { path: string; content: string }
    agents: { name: string; description: string; path: string; content: string }[]
    commands: { name: string; path: string; content: string }[]
    rules: { name: string; path: string; content: string }[]
  }[]
}
export const getAiContext = () => request<AppContext>('/ai/context')

// Apply AI file suggestion
export const applyAiFile = (filePath: string, content: string) =>
  request('/ai/apply', { method: 'POST', body: JSON.stringify({ filePath, content }) })

// Memory Brain
export interface MemoryFrontmatter {
  name?: string
  description?: string
  type?: string
  priority?: string
  maintainer?: string
  last_updated?: string
  [key: string]: string | undefined
}

export interface MemoryNode {
  type: 'file' | 'dir'
  name: string
  path: string
  size?: number
  modifiedAt?: string
  frontmatter?: MemoryFrontmatter
  children?: MemoryNode[]
}

export interface MemorySearchResult {
  path: string
  name: string
  frontmatter: MemoryFrontmatter
  snippet: string
  matchType: 'name' | 'frontmatter' | 'path' | 'content'
}

export interface MemoryStats {
  totalFiles: number
  totalSize: number
  totalFolders: number
  typeCount: Record<string, number>
  folderCount: Record<string, number>
}

export const getMemoryTree = () => request<MemoryNode[]>('/memory')
export const getMemoryFile = (filePath: string) =>
  request<{ path: string; content: string }>(`/memory/file?path=${encodeURIComponent(filePath)}`)
export const updateMemoryFile = (filePath: string, content: string) =>
  request('/memory/file', { method: 'PUT', body: JSON.stringify({ path: filePath, content }) })
export const createMemoryFile = (filePath: string) =>
  request('/memory/file', { method: 'POST', body: JSON.stringify({ path: filePath }) })
export const deleteMemoryFile = (filePath: string) =>
  request(`/memory/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' })
export const searchMemory = (query: string) =>
  request<MemorySearchResult[]>(`/memory/search?q=${encodeURIComponent(query)}`)
export const getMemoryStats = () => request<MemoryStats>('/memory/stats')
export const createMemoryFolder = (folderPath: string) =>
  request('/memory/folder', { method: 'POST', body: JSON.stringify({ path: folderPath }) })
export const deleteMemoryFolder = (folderPath: string) =>
  request(`/memory/folder?path=${encodeURIComponent(folderPath)}`, { method: 'DELETE' })
export const moveMemoryFile = (from: string, to: string) =>
  request('/memory/move', { method: 'POST', body: JSON.stringify({ from, to }) })

// Memory Audit History
export interface DiffHunk {
  line: number
  removed: string[]
  added: string[]
}

export interface MemoryLogEntry {
  id: string
  timestamp: string
  action: 'create' | 'update' | 'delete' | 'move' | 'create_folder' | 'delete_folder'
  path: string
  linesAdded: number
  linesRemoved: number
  sizeBefore?: number
  sizeAfter?: number
  diff?: DiffHunk[]
  contentSnapshot?: string
  fromPath?: string
  toPath?: string
  frontmatter?: MemoryFrontmatter
}

export interface MemoryHistoryResponse {
  total: number
  offset: number
  limit: number
  entries: MemoryLogEntry[]
}

export interface MemoryHistoryStats {
  totalEntries: number
  actionCounts: Record<string, number>
  dailyCounts: Record<string, number>
  hotFiles: { path: string; changes: number }[]
  totalAdded: number
  totalRemoved: number
  firstEntry: string | null
  lastEntry: string | null
}

export const getMemoryHistory = (params?: {
  action?: string
  path?: string
  q?: string
  limit?: number
  offset?: number
  from?: string
  to?: string
}) => {
  const qs = new URLSearchParams()
  if (params?.action) qs.set('action', params.action)
  if (params?.path) qs.set('path', params.path)
  if (params?.q) qs.set('q', params.q)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  return request<MemoryHistoryResponse>(`/memory/history?${qs.toString()}`)
}

export const getMemoryLogEntry = (id: string) =>
  request<MemoryLogEntry>(`/memory/history/${id}`)

export const getMemoryFileHistory = (filePath: string) =>
  request<MemoryLogEntry[]>(`/memory/history/file/${encodeURIComponent(filePath)}`)

export const getMemoryHistoryStats = () =>
  request<MemoryHistoryStats>('/memory/history-stats')

export const clearMemoryHistory = () =>
  request('/memory/history', { method: 'DELETE' })

// ── Approvals ────────────────────────────────────────────────────────────────
export interface PendingApproval {
  key: string
  runId: string
  nodeId: string
  nodeLabel: string
  createdAt: string
  timeoutMinutes: number
}
export const getPendingApprovals = () => request<PendingApproval[]>('/orchestrations/approvals')
export const approveNode = (runId: string, nodeId: string) =>
  request(`/orchestrations/approve/${runId}/${nodeId}`, { method: 'POST' })
export const rejectNode = (runId: string, nodeId: string, reason?: string) =>
  request(`/orchestrations/reject/${runId}/${nodeId}`, { method: 'POST', body: JSON.stringify({ reason }) })

// ── Pipeline Templates ────────────────────────────────────────────────────────
export interface PipelineTemplateNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: { agentName: string; label: string; prompt: string }
}

export interface PipelineTemplateEdge {
  id: string
  source: string
  target: string
  type: string
}

export interface PipelineTemplate {
  id: string
  name: string
  description: string
  icon: string
  nodes: PipelineTemplateNode[]
  edges: PipelineTemplateEdge[]
}

export const getOrchestrationTemplates = () => request<PipelineTemplate[]>('/orchestrations/templates')

// ── DAG Export ───────────────────────────────────────────────────────────────
export interface DAGExport {
  id: string
  name: string
  json: { nodes: unknown[]; edges: unknown[] }
  mermaid: string
  nodeCount: number
  edgeCount: number
}
export const exportOrchestration = (id: string) => request<DAGExport>(`/orchestrations/${id}/export`)

// ── Agent Versioning ─────────────────────────────────────────────────────────
export interface AgentVersion {
  filename: string
  timestamp: string
  size: number
}
export const getAgentVersions = (name: string) => request<AgentVersion[]>(`/global/agents/${name}/versions`)
export const getAgentVersion = (name: string, ts: string) => request<{ content: string }>(`/global/agents/${name}/versions/${ts}`)
export const rollbackAgent = (name: string, ts: string) => request(`/global/agents/${name}/rollback/${ts}`, { method: 'POST' })

// ── Project Conversations ────────────────────────────────────────────────────
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ConversationSummary {
  id: string
  title: string
  agentName: string | null
  messageCount: number
  lastMessageAt: string
  createdAt: string
}

export interface Conversation {
  id: string
  projectId: string
  title: string
  agentName: string | null
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
}

export const getProjectConversations = (projectId: string) =>
  request<ConversationSummary[]>(`/projects/${projectId}/conversations`)
export const getProjectConversation = (projectId: string, id: string) =>
  request<Conversation>(`/projects/${projectId}/conversations/${id}`)
export const createProjectConversation = (projectId: string, data: { title: string; agentName?: string }) =>
  request<Conversation>(`/projects/${projectId}/conversations`, { method: 'POST', body: JSON.stringify(data) })
export const deleteProjectConversation = (projectId: string, id: string) =>
  request(`/projects/${projectId}/conversations/${id}`, { method: 'DELETE' })

export async function streamProjectChat(
  projectId: string,
  conversationId: string,
  message: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${BASE}/projects/${projectId}/conversations/${conversationId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(data.error || `API error: ${res.status}`)
  }
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      try {
        const event = JSON.parse(trimmed.slice(6))
        if (event.type === 'chunk') { fullContent += event.content; onChunk(event.content) }
        else if (event.type === 'done') { fullContent = event.content }
        else if (event.type === 'error') { throw new Error(event.error) }
      } catch (e) { if (e instanceof SyntaxError) continue; throw e }
    }
  }
  return fullContent
}

// Project activity
export const getProjectActivity = (projectId: string, limit?: number) =>
  request<{ total: number; runs: AgentRunEntry[] }>(`/projects/${projectId}/activity${limit ? `?limit=${limit}` : ''}`)

// ── Org Chart ────────────────────────────────────────────────────────────────
export interface OrgChartNode {
  id: string
  name: string
  title: string
  model: string
  tools: string
  description: string
  phase: string | null
  phaseLabel: string | null
  phaseColor: string
  reportsTo: string | null
  tier: string
  department?: string | null
  departmentLabel?: string | null
  departmentColor?: string
  // Org Structure v2 (2026-04-27)
  subDepartment?: string | null
  subDepartmentLabel?: string | null
  subDepartmentDescription?: string | null
  subDepartmentOrder?: number
  // Visual fields propagated from departments.json (2026-04-30)
  subDepartmentCardLabel?: string | null
  subDepartmentCardEmoji?: string | null
  subDepartmentColor?: string | null
  subDepartmentIcon?: string | null
  subDepartmentDisplayMode?: 'expanded' | 'collapsed' | 'hidden'
  subDepartmentStatus?: 'active' | 'planned' | 'archived'
  pod?: string | null
  secondaryReportsTo?: string | null
  status?: 'active' | 'probation' | 'pip' | 'pending' | 'retired'
  level?: number | null
  levelTitle?: string | null
  yearsOfExperience?: number | null
  experiencePoints?: number | null
  tags?: { tech: string[]; domain: string[]; 'work-type': string[] }
  squad?: string | null
  avatar?: string | null
  gender?: 'male' | 'female' | 'neutral' | string | null
  // Phase A — Routing Engine (2026-04-28): live capacity + perf signals
  activeTaskCount?: number
  maxConcurrentTasks?: number
  loadStatus?: 'free' | 'busy' | 'overloaded'
  busyUntilAt?: string | null
  lastDispatchAt?: string | null
  successRate?: number | null
  avgDurationMs?: number | null
}

// Phase A: Task lifecycle (work units that may span many LLM runs)
export interface Task {
  id: string
  agentId: string
  source: string | null
  taskType: string | null
  title: string | null
  prompt: string | null
  status: 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled'
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  estimatedTokens: number
  actualTokens: number
  estimatedCostUsd: number
  actualCostUsd: number
  assignedAt: string | null
  startedAt: string | null
  completedAt: string | null
  output: string | null
  error: string | null
  metadata: Record<string, unknown>
}

export interface DispatchAssignResult {
  ok: boolean
  taskId?: string
  agentId?: string
  score?: number
  reason?: string
  dryRun?: boolean
  chosen?: string
  candidates: Array<{
    agentId: string
    title: string | null
    department: string | null
    tier: string | null
    status: string
    model: string
    skillScore: number
    matchedSkills: string[]
    successRate: number | null
    avgDurationMs: number | null
    activeTaskCount: number
    maxConcurrentTasks: number
    loadStatus: 'free' | 'busy' | 'overloaded'
    score?: number
  }>
}

export const dispatchAssign = (body: {
  query: string
  taskType?: string
  priority?: 'p0' | 'p1' | 'p2' | 'p3'
  estimatedTokens?: number
  preferredAgent?: string
  dryRun?: boolean
  title?: string
}) =>
  request<DispatchAssignResult>('/dispatch/assign', { method: 'POST', body: JSON.stringify(body) })

export const completeTask = (taskId: string, body?: { output?: string; actualTokens?: number; actualCostUsd?: number }) =>
  request<{ ok: boolean; task: Task }>(`/dispatch/tasks/${taskId}/complete`, { method: 'POST', body: JSON.stringify(body || {}) })

export const failTask = (taskId: string, body?: { error?: string; actualTokens?: number; actualCostUsd?: number }) =>
  request<{ ok: boolean; task: Task }>(`/dispatch/tasks/${taskId}/fail`, { method: 'POST', body: JSON.stringify(body || {}) })

export const cancelTask = (taskId: string, body?: { reason?: string }) =>
  request<{ ok: boolean; task: Task }>(`/dispatch/tasks/${taskId}/cancel`, { method: 'POST', body: JSON.stringify(body || {}) })

export const getTask = (taskId: string) =>
  request<Task>(`/dispatch/tasks/${taskId}`)

export const getAgentTasks = (agentId: string, limit = 20) =>
  request<{ items: Task[] }>(`/dispatch/agents/${agentId}/tasks?limit=${limit}`)

// ── Phase B — Persistent Orchestration Runs ──────────────────────────────

export interface OrchestrationStep {
  id: string
  runId: string
  nodeId: string
  stepIndex: number
  agentName: string | null
  taskId: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused' | 'approved' | 'rejected'
  output: string | null
  error: string | null
  retryCount: number
  startedAt: string | null
  completedAt: string | null
  duration: number
  metadata: Record<string, unknown>
}

export interface OrchestrationRun {
  id: string
  orchestrationId: string
  orchestrationName: string | null
  task: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  currentNodeId: string | null
  startedAt: string | null
  completedAt: string | null
  duration: number
  createdBy: string | null
  finalOutput: string | null
  error: string | null
  metadata: Record<string, unknown>
  steps: OrchestrationStep[]
}

export const startOrchestrationRun = (orchestrationId: string, body: { task: string; createdBy?: string; metadata?: Record<string, unknown> }) =>
  request<{ ok: boolean; runId: string; statusUrl: string }>(
    `/orchestrations/${orchestrationId}/runs`,
    { method: 'POST', body: JSON.stringify(body) },
  )

export const getOrchestrationRun = (runId: string) =>
  request<OrchestrationRun>(`/orchestrations/runs-v2/${runId}`)

export const listOrchestrationRuns = (orchestrationId: string, opts?: { status?: string; limit?: number }) => {
  const qs = new URLSearchParams()
  if (opts?.status) qs.set('status', opts.status)
  if (opts?.limit) qs.set('limit', String(opts.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<{ items: Omit<OrchestrationRun, 'steps'>[] }>(`/orchestrations/${orchestrationId}/runs${suffix}`)
}

export const cancelOrchestrationRun = (runId: string, reason?: string) =>
  request<{ ok: boolean; run: OrchestrationRun }>(
    `/orchestrations/runs-v2/${runId}/cancel`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  )

export const advanceStep = (runId: string, nodeId: string, approved: boolean, reason?: string) =>
  request<{ ok: boolean; step: OrchestrationStep }>(
    `/orchestrations/runs-v2/${runId}/steps/${nodeId}/advance`,
    { method: 'POST', body: JSON.stringify({ approved, reason }) },
  )

export const retryStep = (runId: string, nodeId: string) =>
  request<{ ok: boolean; step: OrchestrationStep }>(
    `/orchestrations/runs-v2/${runId}/steps/${nodeId}/retry`,
    { method: 'POST' },
  )

// ── Phase A/B/C — Governance dashboard ────────────────────────────────────

export interface GovernanceCostTier {
  model: string
  agents: string[]
  runs: number
  estTokens: number
  estCostUsd: number
  budgetUsd: number
  burnPct: number | null
}

export interface GovernancePolicyViolation {
  runId: string
  agentName: string
  timestamp: string
  expected: string
  actual: string
  tier: string
  detectedAt: string
}

export interface GovernanceCostResponse {
  windowHours: number
  cutoff: string
  enforcementMode: string
  tiers: Record<string, GovernanceCostTier>
  total: { estCostUsd: number; budgetUsd: number; burnPct: number | null }
  violations: GovernancePolicyViolation[]
  violationCount: number
}

export interface Escalation {
  id: string
  issueId: string
  title: string
  taskId: string | null
  agentId: string
  ownerId: string
  summary: string
  severity: string
  tier: 'specialist' | 'pod-lead' | 'vp' | 'yash'
  status: 'open' | 'resolved'
  openedAt: string
  updatedAt: string
  resolvedAt: string | null
  outcome?: string
  history: Array<{ tier: string; at: string; by: string; action: string; outcome?: string }>
}

export const getGovernanceCost = () => request<GovernanceCostResponse>('/governance/cost')
export const setEnforcementMode = (mode: 'advisory' | 'warn' | 'block') =>
  request<{ ok: boolean; enforcementMode: string; updatedAt: string }>(
    '/governance/enforcement-mode',
    { method: 'POST', body: JSON.stringify({ mode }) },
  )
export const getGovernanceEscalations = (opts?: { open?: boolean; limit?: number }) => {
  const qs = new URLSearchParams()
  if (opts?.open) qs.set('open', '1')
  if (opts?.limit) qs.set('limit', String(opts.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<{ items: Escalation[] }>(`/governance/escalations${suffix}`)
}

// SSE — live updates for one run. Mirrors `subscribeOrgChart`.
// onEvent receives typed events: snapshot | run:* | step:any
export function subscribeToRun(
  runId: string,
  onEvent: (e: { type: string; data: OrchestrationRun | OrchestrationStep | unknown }) => void,
): EventSource {
  const es = new EventSource(`${BASE}/orchestrations/runs-v2/${runId}/stream`)
  const wire = (type: string) => (ev: MessageEvent) => {
    try { onEvent({ type, data: JSON.parse(ev.data) }) } catch { /* ignore */ }
  }
  es.addEventListener('snapshot', wire('snapshot'))
  es.addEventListener('run:running', wire('run:running'))
  es.addEventListener('run:paused', wire('run:paused'))
  es.addEventListener('run:completed', wire('run:completed'))
  es.addEventListener('run:failed', wire('run:failed'))
  es.addEventListener('run:cancelled', wire('run:cancelled'))
  es.addEventListener('step:any', wire('step:any'))
  return es
}


export interface OrgChartSubDepartment {
  id: string
  label: string
  description: string
  order: number
  pod: string | null
  members: OrgChartNode[]
  // Visual fields (Phase 1 schema extension — for dynamic card rendering)
  cardLabel?: string | null
  cardEmoji?: string | null
  color?: string | null
  icon?: string | null
  displayMode?: 'expanded' | 'collapsed' | 'hidden'
  status?: 'active' | 'planned' | 'archived'
  lead?: string | null
  memberCount?: number | null
}

// Patch shape for editing a sub-department's editable fields.
export interface OrgChartSubDepartmentPatch {
  label?: string
  description?: string
  cardLabel?: string
  cardEmoji?: string
  color?: string
  icon?: string
  order?: number
  displayMode?: 'expanded' | 'collapsed' | 'hidden'
  status?: 'active' | 'planned' | 'archived'
  lead?: string | null
  memberCount?: number | null
}

export interface OrgChartEdge {
  from: string
  to: string
}

export interface OrgChartPhase {
  id: string
  label: string
  description: string
  color: string
  agents: { id: string; name: string; title: string; model: string; description: string }[]
}

export interface OrgChartDepartment {
  id: string
  label: string
  description: string
  color: string
  icon: string
  head: string
  members: OrgChartNode[]
  // Org Structure v2 — sub-department breakdown
  subDepartments?: OrgChartSubDepartment[]
  orphanMembers?: OrgChartNode[]
}

export interface OrgChartData {
  nodes: OrgChartNode[]
  edges: OrgChartEdge[]
  phases: OrgChartPhase[]
  departments: OrgChartDepartment[]
  stats: {
    totalAgents: number
    byModel: Record<string, number>
    byTier: Record<string, number>
    byPhase: Record<string, number>
    byDepartment?: Record<string, number>
    byStatus?: Record<string, number>
    byLevel?: Record<string, number>
  }
}

export const getOrgChart = () => request<OrgChartData>('/org-chart')

// Persistent drag-and-drop positions for the org-chart tree.
export interface NodePositionMap {
  [nodeId: string]: { x: number; y: number; locked?: boolean; updatedAt: string }
}
export const getOrgChartPositions = () =>
  request<{ positions: NodePositionMap }>('/org-chart/positions')

export const saveOrgChartPositions = (positions: Array<{ nodeId: string; x: number; y: number }>) =>
  request<{ ok: boolean; saved: number }>('/org-chart/positions', {
    method: 'POST',
    body: JSON.stringify({ positions }),
  })

// Auto-adjust path: clears unlocked positions only. Pass {includeLocked:true}
// to wipe everything including pinned cards.
export const resetOrgChartPositions = (opts?: { includeLocked?: boolean }) => {
  const qs = opts?.includeLocked ? '?includeLocked=1' : ''
  return request<{ ok: boolean; cleared: number }>(`/org-chart/positions${qs}`, { method: 'DELETE' })
}

export const toggleOrgChartLock = (nodeId: string, locked: boolean) =>
  request<{ ok: boolean; nodeId: string; locked: boolean }>(
    `/org-chart/positions/${encodeURIComponent(nodeId)}/lock`,
    { method: 'POST', body: JSON.stringify({ locked }) },
  )

// Server-Sent Events stream — auto-reconnects on disconnect.
// Events: 'agent:upsert' | 'agent:remove' | 'ready' | 'taxonomy:update'
//       | 'task:created' | 'task:started' | 'task:completed' | 'task:failed' | 'task:cancelled'
export const ORG_CHART_STREAM_URL = `${BASE}/org-chart/stream`
export type OrgChartStreamEventType =
  | 'agent:upsert' | 'agent:remove' | 'ready' | 'taxonomy:update'
  | 'task:created' | 'task:started' | 'task:completed' | 'task:failed' | 'task:cancelled'
export interface OrgChartStreamEvent {
  type: OrgChartStreamEventType
  agentId?: string
  taskId?: string
}
// Schedules SSE subscriber — uses the same /org-chart/stream pipe (multiplexed)
// but only forwards schedule:* events with full payloads (id, kind, status,
// duration, etc.) so the Schedules page can patch row state in place without
// refetching the list every 30s.
export type ScheduleStreamEventType =
  | 'schedule:start' | 'schedule:complete' | 'schedule:error'
  | 'schedule:cancelled' | 'schedule:upsert'
export interface ScheduleStreamEvent {
  type: ScheduleStreamEventType
  id: string
  kind: ScheduleKind
  name?: string
  agentName?: string
  status?: 'success' | 'error' | 'cancelled'
  lastRunAt?: string
  startedAt?: string
  duration?: number
  error?: string
  removed?: boolean
  retryCount?: number
  runId?: string
  ts?: number
}
export function subscribeSchedules(onEvent: (e: ScheduleStreamEvent) => void): EventSource {
  const es = new EventSource(ORG_CHART_STREAM_URL)
  const handle = (type: ScheduleStreamEventType) => (ev: MessageEvent) => {
    try {
      const data = ev.data ? JSON.parse(ev.data) : {}
      onEvent({ type, ...data })
    } catch {
      onEvent({ type, id: '', kind: 'user' })
    }
  }
  es.addEventListener('schedule:start',     handle('schedule:start'))
  es.addEventListener('schedule:complete',  handle('schedule:complete'))
  es.addEventListener('schedule:error',     handle('schedule:error'))
  es.addEventListener('schedule:cancelled', handle('schedule:cancelled'))
  es.addEventListener('schedule:upsert',    handle('schedule:upsert'))
  return es
}

export function subscribeOrgChart(onEvent: (e: OrgChartStreamEvent) => void): EventSource {
  const es = new EventSource(ORG_CHART_STREAM_URL)
  const handle = (type: OrgChartStreamEventType) => (ev: MessageEvent) => {
    try {
      const data = ev.data ? JSON.parse(ev.data) : {}
      onEvent({ type, agentId: data.agentId, taskId: data.id })
    } catch (e) {
      clientLogger.warn(e instanceof Error ? e : 'sse parse failed', {
        category: 'sse', meta: { stream: 'org-chart', type },
      })
      onEvent({ type })
    }
  }
  es.addEventListener('ready', handle('ready'))
  es.addEventListener('agent:upsert', handle('agent:upsert'))
  es.addEventListener('agent:remove', handle('agent:remove'))
  es.addEventListener('taxonomy:update', handle('taxonomy:update'))
  es.addEventListener('task:created',   handle('task:created'))
  es.addEventListener('task:started',   handle('task:started'))
  es.addEventListener('task:completed', handle('task:completed'))
  es.addEventListener('task:failed',    handle('task:failed'))
  es.addEventListener('task:cancelled', handle('task:cancelled'))
  // Note: a closed EventSource on nav/server-restart is normal — EventSource
  // auto-reconnects, so we intentionally do NOT log it as an error (Bug 5b noise).
  return es
}

// ── Taxonomy: dynamic squads + tags ──────────────────────────────────────────
// v2 (2026-05-19): squads carry `lead`, ordered `roleBands`, `dottedMembers`,
// and optional `placeholder` flag for not-yet-hired teams. Used by AllAgents
// + OrgChart vertical view.
export interface SquadDef {
  id: string
  label: string
  description?: string
  color: string
  emoji: string
  members?: string[]
  lead?: string | null
  roleBands?: string[]
  dottedMembers?: string[]
  placeholder?: boolean
}
export interface TagInfo {
  label: string
  description?: string
}
export interface TagCategoryDef {
  label: string
  description?: string
  color?: string
  bgColor?: string
  textColor?: string
  tags: Record<string, TagInfo>
}
export interface TierDef {
  id: string
  label: string
  description?: string
  color?: string
  icon?: string
  order?: number
}
export interface TaxonomyData {
  squads: SquadDef[]
  squadOrder?: string[]
  agentRoleBand?: Record<string, string>
  roleBandLabels?: Record<string, string>
  categories: Record<string, TagCategoryDef>
  tiers: TierDef[]
}

export const getTaxonomy = () => request<TaxonomyData>('/taxonomy')

export const createSquad = (squad: Partial<SquadDef> & { id: string; label: string }) =>
  request<{ ok: boolean; squad: SquadDef }>('/taxonomy/squad', { method: 'POST', body: JSON.stringify(squad) })

export const updateSquadDef = (id: string, patch: Partial<SquadDef>) =>
  request<{ ok: boolean; squad: SquadDef }>(`/taxonomy/squad/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

// Conflict response shape returned by DELETE squad/tag when agents still reference them.
export interface TaxonomyDeleteConflict {
  error: string
  agentCount: number
  agentIds: string[]
}

// 200 path on DELETE — returns either ok+deleted (no cascade) or ok+cascaded count.
export interface TaxonomyDeleteResult {
  ok: boolean
  deleted?: string | { category: string; tag: string }
  cascaded?: number
}

// Throws on conflict — caller can detect via instanceof Error + parsing message,
// or use the explicit `tryDelete*` helpers below which return the raw 409 shape.
export const deleteSquadDef = (id: string, opts?: { cascade?: boolean }) => {
  const qs = opts?.cascade ? '?cascade=1' : ''
  return request<TaxonomyDeleteResult>(`/taxonomy/squad/${id}${qs}`, { method: 'DELETE' })
}

// Returns either the success result or the 409 conflict body (without throwing).
// Lets the UI offer a cascade re-confirm in the same dialog.
export async function tryDeleteSquadDef(id: string): Promise<TaxonomyDeleteResult | TaxonomyDeleteConflict> {
  const res = await fetch(`${BASE}/taxonomy/squad/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
  const body = await res.json().catch(() => ({}))
  if (res.status === 409) return body as TaxonomyDeleteConflict
  if (!res.ok) throw new Error(body.error || `API error: ${res.status}`)
  return body as TaxonomyDeleteResult
}

export const createTag = (category: string, tag: string, info: { label?: string; description?: string } = {}) =>
  request<{ ok: boolean; category: string; tag: string }>('/taxonomy/tag', {
    method: 'POST',
    body: JSON.stringify({ category, tag, ...info }),
  })

export const updateTagDef = (category: string, tag: string, patch: { label?: string; description?: string }) =>
  request<{ ok: boolean; category: string; tag: string; info: { label: string; description: string } }>(
    `/taxonomy/tag/${category}/${tag}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )

export const deleteTagDef = (category: string, tag: string, opts?: { cascade?: boolean }) => {
  const qs = opts?.cascade ? '?cascade=1' : ''
  return request<TaxonomyDeleteResult>(`/taxonomy/tag/${category}/${tag}${qs}`, { method: 'DELETE' })
}

// ── Tier CRUD ────────────────────────────────────────────────────────────────
export const createTier = (tier: Partial<TierDef> & { id: string; label: string }) =>
  request<{ ok: boolean; tier: TierDef }>('/taxonomy/tier', { method: 'POST', body: JSON.stringify(tier) })

export const updateTierDef = (id: string, patch: Partial<TierDef>) =>
  request<{ ok: boolean; tier: TierDef }>(`/taxonomy/tier/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteTierDef = (id: string) =>
  request<{ ok: boolean; deleted: string }>(`/taxonomy/tier/${id}`, { method: 'DELETE' })

export async function tryDeleteTagDef(category: string, tag: string): Promise<TaxonomyDeleteResult | TaxonomyDeleteConflict> {
  const res = await fetch(`${BASE}/taxonomy/tag/${category}/${tag}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' } })
  const body = await res.json().catch(() => ({}))
  if (res.status === 409) return body as TaxonomyDeleteConflict
  if (!res.ok) throw new Error(body.error || `API error: ${res.status}`)
  return body as TaxonomyDeleteResult
}

export interface DriftData { onlyOnDisk: string[]; onlyInRegistry: string[] }
export const getDrift = () => request<DriftData>('/org/drift')

export interface OrgAgentPatch {
  department?: string | null
  subDepartment?: string | null
  pod?: string | null
  reportsTo?: string | null
  secondaryReportsTo?: string | null
  title?: string
  tier?: string
  status?: string
  squad?: string | null
  tags?: { tech: string[]; 'work-type': string[]; domain?: string[] }
  avatar?: string | null
  gender?: 'male' | 'female' | 'neutral' | string | null
}

export interface OrgPatchResult {
  ok: boolean
  agent: OrgChartNode
  historyId: number | null
}

export const updateOrgAgent = (id: string, patch: OrgAgentPatch): Promise<OrgPatchResult> =>
  request<OrgPatchResult>(`/org/agent/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

// ── Sub-department mutations (card-level visual editing) ─────────────────────

export interface SubDepartmentPatchResult {
  ok: boolean
  before: OrgChartSubDepartment
  after: OrgChartSubDepartment
  version: number
}

/**
 * Patch a sub-department's editable fields (label, cardLabel, cardEmoji,
 * color, icon, order, displayMode, status, lead, memberCount).
 * Server atomically rewrites ~/.claude/org/departments.json + bumps version.
 * Triggers a taxonomy:update SSE so all open clients refetch.
 */
export const updateSubDepartment = (
  deptId: string,
  subId: string,
  patch: OrgChartSubDepartmentPatch,
): Promise<SubDepartmentPatchResult> =>
  request<SubDepartmentPatchResult>(
    `/departments/${encodeURIComponent(deptId)}/subdepartment/${encodeURIComponent(subId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
  )

// ── Bulk + Undo + History ────────────────────────────────────────────────────
export interface BulkResult {
  ok: boolean
  batchId: string
  updated: Array<{ id: string; ok: boolean; agent?: OrgChartNode; error?: string }>
}

export const bulkUpdateOrgAgents = (agentIds: string[], patch: OrgAgentPatch): Promise<BulkResult> =>
  request<BulkResult>('/org/agents/bulk', { method: 'POST', body: JSON.stringify({ agentIds, patch }) })

export const undoOrgChange = (historyId: number) =>
  request(`/org/undo/${historyId}`, { method: 'POST' })

export const undoOrgBatch = (batchId: string) =>
  request(`/org/undo-batch/${batchId}`, { method: 'POST' })

export interface HistoryEntry {
  id: number
  agent_id: string
  action: string
  patch: Record<string, unknown> | null
  actor: string
  batch_id: string | null
  undone: boolean
  created_at: string
}

export const getOrgHistory = (params: { limit?: number; agentId?: string; batchId?: string } = {}) => {
  const qs = new URLSearchParams()
  if (params.limit)   qs.set('limit', String(params.limit))
  if (params.agentId) qs.set('agentId', params.agentId)
  if (params.batchId) qs.set('batchId', params.batchId)
  const suffix = qs.toString() ? `?${qs}` : ''
  return request<{ history: HistoryEntry[] }>(`/org/history${suffix}`)
}

// ── Smart Dispatch ────────────────────────────────────────────────────────────
export interface DispatchResult {
  agentId: string
  name: string
  department: string | null
  level: string | null
  tier: string | null
  status: string
  score: number
  matchedSkills: string[]
}

export interface DispatchResponse {
  query: string
  tokens: string[]
  results: DispatchResult[]
}

export const getDispatchRecommendation = (q: string) =>
  request<DispatchResponse>(`/dispatch/recommend?q=${encodeURIComponent(q)}`)

// ── Goal Cascade ─────────────────────────────────────────────────────────────
export interface ProjectGoal {
  id: string
  projectId: string
  projectName: string
  goal: string
  description: string
  priority: 'high' | 'medium' | 'low'
  status: string
  createdAt: string
  updatedAt: string
}

export interface AgentGoal {
  id: string
  agentName: string
  projectGoalId: string | null
  goal: string
  description: string
  status: 'active' | 'completed' | 'paused'
  createdAt: string
  updatedAt: string
}

export interface GoalCascade {
  mission: string
  missionDescription: string
  projectGoals: ProjectGoal[]
  agentGoals: AgentGoal[]
  updatedAt?: string
}

export const getGoals = () => request<GoalCascade>('/goals')
export const updateMission = (mission: string, description?: string) =>
  request<GoalCascade>('/goals/mission', { method: 'PUT', body: JSON.stringify({ mission, description }) })
export const createProjectGoal = (data: { projectId: string; projectName: string; goal: string; description?: string; priority?: string }) =>
  request<ProjectGoal>('/goals/project', { method: 'POST', body: JSON.stringify(data) })
export const deleteProjectGoal = (id: string) =>
  request(`/goals/project/${id}`, { method: 'DELETE' })
export const createAgentGoal = (data: { agentName: string; projectGoalId?: string; goal: string; description?: string }) =>
  request<AgentGoal>('/goals/agent', { method: 'POST', body: JSON.stringify(data) })
export const updateAgentGoal = (id: string, data: Partial<{ goal: string; description: string; status: string }>) =>
  request<AgentGoal>(`/goals/agent/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteAgentGoal = (id: string) =>
  request(`/goals/agent/${id}`, { method: 'DELETE' })

// ── Agent Run Analytics ──────────────────────────────────────────────────────
export interface AgentRunEntry {
  id: string
  agentName: string
  prompt: string
  source: 'playground' | 'orchestration' | 'schedule' | 'webhook' | 'sdk' | 'ai-chat'
  timestamp: string
  duration: number
  status: 'success' | 'error'
  promptChars: number
  outputChars: number
  estimatedTokens: number
  estimatedCost: number
  error: string | null
  metadata: Record<string, unknown>
}

export interface AgentAnalyticsSummary {
  [agentName: string]: {
    runCount: number
    avgDuration: number
    successRate: number
    totalEstimatedCost: number
    totalTokens: number
  }
}

export const getAnalyticsRuns = (params?: {
  agent?: string; status?: string; source?: string; from?: string; to?: string; limit?: number; offset?: number
}) => {
  const qs = new URLSearchParams()
  if (params?.agent) qs.set('agent', params.agent)
  if (params?.status) qs.set('status', params.status)
  if (params?.source) qs.set('source', params.source)
  if (params?.from) qs.set('from', params.from)
  if (params?.to) qs.set('to', params.to)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  return request<{ total: number; runs: AgentRunEntry[] }>(`/analytics/runs?${qs.toString()}`)
}

export const getAnalyticsSummary = () => request<AgentAnalyticsSummary>('/analytics/summary')

export interface RoutingSavings {
  totalRuns: number
  allOpusCost: number
  routedCost: number
  savings: number
  message: string
}

export const getRoutingSavings = () => request<RoutingSavings>('/routing/savings')

// ── Schedules ────────────────────────────────────────────────────────────────
export type ScheduleKind = 'user' | 'system'
/**
 * Schedule lifecycle status:
 *   - 'running'   — handler in progress (set by SSE start OR persisted on server)
 *   - 'success'   — handler completed cleanly
 *   - 'error'     — handler threw
 *   - 'cancelled' — operator killed via /cancel endpoint
 *   - 'crashed'   — server died mid-handler, reconciled at next boot
 */
export type ScheduleStatus = 'success' | 'error' | 'running' | 'cancelled' | 'crashed' | null

export interface CostEstimate { lowUsd: number; highUsd: number }

export interface Schedule {
  id: string
  kind: ScheduleKind
  builtin?: boolean
  name: string
  description?: string
  agentName: string
  prompt: string
  cron: string | null
  trigger?: string | null
  enabled: boolean
  createdAt: string | null
  updatedAt: string | null
  lastRunAt: string | null
  lastRunStatus: ScheduleStatus
  nextRunAt: string | null
  needsLlm?: boolean
  cancellable?: boolean
  costEstimate?: CostEstimate | null
  /** Set transiently when an inflight run exists for this schedule. */
  runId?: string | null
}

export interface InflightRun {
  id: string
  kind: ScheduleKind
  runId: string
  startedAt: string
  agentName?: string | null
}

export interface ScheduleRun {
  id: string
  agentName: string
  prompt: string
  source: string
  timestamp: string
  duration: number
  status: 'success' | 'error' | 'running' | 'cancelled' | 'crashed'
  promptChars: number
  outputChars: number
  estimatedTokens: number
  estimatedCost: number
  error: string | null
  metadata: Record<string, unknown>
}

export interface CronPreset { label: string; value: string }

export const getSchedules = () => request<Schedule[]>('/schedules')
export const getSystemSchedules = () => request<Schedule[]>('/schedules/system')
export const getCronPresets = () =>
  request<{ presets: CronPreset[] }>('/schedules/presets')
export const validateCronOnServer = (cronExpr: string) =>
  request<{ valid: boolean; nextRunAt: string | null; error: string | null }>(
    '/schedules/validate-cron',
    { method: 'POST', body: JSON.stringify({ cronExpr }) },
  )
export const createSchedule = (data: { name: string; agentName: string; prompt: string; cronExpr: string; enabled?: boolean }) =>
  request<Schedule>('/schedules', { method: 'POST', body: JSON.stringify(data) })
export const updateSchedule = (id: string, data: Partial<{ name: string; agentName: string; prompt: string; cronExpr: string; enabled: boolean }>) =>
  request<Schedule>(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteSchedule = (id: string) =>
  request(`/schedules/${id}`, { method: 'DELETE' })
export const getScheduleRuns = (id: string, limit = 50) =>
  request<{ runs: ScheduleRun[] }>(`/schedules/${encodeURIComponent(id)}/runs?limit=${limit}`)
export const runScheduleNow = (id: string) =>
  request<{
    ok?: boolean
    status?: 'started'
    skipped?: boolean
    reason?: string
    runId?: string
    kind?: ScheduleKind
    error?: string
  }>(`/schedules/${encodeURIComponent(id)}/run-now`, { method: 'POST', body: '{}' })

export const cancelScheduleRun = (id: string) =>
  request<{ ok?: boolean; runId?: string; error?: string }>(
    `/schedules/${encodeURIComponent(id)}/cancel`,
    { method: 'POST', body: '{}' },
  )

export const getInflightSchedules = () =>
  request<{ inflight: InflightRun[] }>('/schedules/inflight')

// ── Webhooks ─────────────────────────────────────────────────────────────────
export interface Webhook {
  id: string
  name: string
  agentName: string | null
  orchestrationId: string | null
  secret: string
  createdAt: string
  lastTriggeredAt: string | null
  triggerCount: number
}

export const getWebhooks = () => request<Webhook[]>('/webhooks')
export const getWebhookSecret = (id: string) => request<{ secret: string }>(`/webhooks/${id}/secret`)
export const createWebhook = (data: { name: string; agentName?: string; orchestrationId?: string }) =>
  request<Webhook>('/webhooks', { method: 'POST', body: JSON.stringify(data) })
export const deleteWebhook = (id: string) =>
  request(`/webhooks/${id}`, { method: 'DELETE' })

// Docs
export interface DocMeta {
  slug: string
  filename: string
  title: string
  description: string
}
export const getDocs = () => request<DocMeta[]>('/docs')
export const getDoc = (slug: string) => request<{ slug: string; content: string }>(`/docs/${slug}`)

// ── Playground History ───────────────────────────────────────────────────────

export type PlaygroundRunStatus = 'success' | 'error' | 'cancelled' | 'timeout'

export interface PlaygroundHistoryItem {
  id: string
  agent: string
  agentName: string
  prompt: string
  output: string
  duration: number
  status: PlaygroundRunStatus
  error?: string | null
  timestamp: string
  threadId?: string | null
  turnIndex?: number | null
}

export interface PlaygroundThreadMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: string
  duration: number
  timestamp: string
}

export interface PlaygroundThread {
  id: string
  title: string
  agentName: string | null
  createdAt: string
  updatedAt: string
  messageCount?: number
  messages?: PlaygroundThreadMessage[]
}

export interface PlaygroundPreflight {
  binary: { ok: boolean; path: string | null; version: string | null; source: string | null; error: string | null }
  auth: { ok: boolean; hasApiKey: boolean; hint: string | null; source?: 'subscription' | 'api_key' | 'unknown'; subscriptionOnly?: boolean }
  env: { home: string; platform: string; node?: string; nodeOk?: boolean | null }
  agent: { ok: boolean; tried: string[]; candidates?: string[] } | null
  okToRun: boolean
  generatedAt: string
}

// ── Agent Health ─────────────────────────────────────────────────────────────

export interface AgentHealth {
  status: 'healthy' | 'warning' | 'over' | 'sparse'
  suggestion: string | null
  usage: number // 0.0 to 1.2+
  actual: { lines: number; chars: number }
  budget: { lines: number; chars: number; allowOversize: boolean }
  violations: Array<{ kind: string; actual: number; budget: number; limit?: number }>
  warnings: Array<{ kind: string; actual: number; budget: number }>
  estimatedTokens: number
  sizeKb: number
  rawChars: number
}

export const getAgentHealth = (
  name: string,
  opts: { scope: 'global' | 'project'; projectId?: string; content?: string }
) => request<AgentHealth>(`/agents/${name}/health`, {
  method: 'POST',
  body: JSON.stringify(opts),
})

export const getPlaygroundHistory = () => requestWithRetry<PlaygroundHistoryItem[]>('/playground/history')
export const savePlaygroundHistoryItem = (item: PlaygroundHistoryItem) =>
  request<PlaygroundHistoryItem>('/playground/history', { method: 'POST', body: JSON.stringify(item) })
export const deletePlaygroundHistoryItem = (id: string) =>
  request(`/playground/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const clearPlaygroundHistoryApi = () =>
  request('/playground/history', { method: 'DELETE' })

// Preflight: binary/auth/env readiness. Surfaced as a banner so the user gets an
// actionable message instead of an 18s spin ending in claude_binary_missing.
export const getPlaygroundPreflight = (agent?: string) =>
  request<PlaygroundPreflight>(`/playground/preflight${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`)

// Threads (multi-turn conversations)
export const getPlaygroundThreads = () => requestWithRetry<PlaygroundThread[]>('/playground/threads')
export const getPlaygroundThread = (id: string) =>
  request<PlaygroundThread>(`/playground/threads/${encodeURIComponent(id)}`)
export const createPlaygroundThread = (body: { id?: string; title?: string; agentName?: string }) =>
  request<PlaygroundThread>('/playground/threads', { method: 'POST', body: JSON.stringify(body) })
export const seedPlaygroundThread = (id: string, body: { prompt: string; output: string; agentName?: string; status?: string }) =>
  request<{ ok: boolean; thread?: PlaygroundThread; alreadySeeded?: boolean }>(`/playground/threads/${encodeURIComponent(id)}/seed`, { method: 'POST', body: JSON.stringify(body) })
export const renamePlaygroundThread = (id: string, title: string) =>
  request<PlaygroundThread>(`/playground/threads/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) })
export const deletePlaygroundThread = (id: string) =>
  request(`/playground/threads/${encodeURIComponent(id)}`, { method: 'DELETE' })

// Background-run resilience: is a generation still running for this conversation
// (e.g. after a page refresh)? Used to re-attach to the live stream on reload.
export interface ActivePlaygroundRun {
  active: boolean
  runId?: string
  threadId?: string | null
  agentName?: string
  prompt?: string
  output?: string
  startedAt?: number
}
export const getActivePlaygroundRun = (threadId: string) =>
  request<ActivePlaygroundRun>(`/playground/active?threadId=${encodeURIComponent(threadId)}`)
export const cancelPlaygroundRun = (runId: string) =>
  request<{ ok: boolean; alreadyDone?: boolean }>(`/playground/run/${encodeURIComponent(runId)}/cancel`, { method: 'POST', body: '{}' })

// ── Backup System ─────────────────────────────────────────────────────────────

export type BackupErrorCode =
  | 'REPO_NOT_FOUND'
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NON_FAST_FORWARD'
  | 'LFS_REQUIRED'
  | 'NETWORK'
  | 'UNKNOWN'
  | 'NOT_CONFIGURED'
  | 'NO_TOKEN'
  | 'BAD_URL'
  | 'OK'

export type BackupFixAction =
  | 'create_remote'
  | 'change_repo'
  | 'reconnect'
  | 'retry_push'
  | 'verify_remote'

export interface BackupDiagnosis {
  code: BackupErrorCode
  title: string
  detail: string
  fix: string
  actions: BackupFixAction[]
}

export interface BackupStatus {
  configured: boolean
  enabled: boolean
  repoUrl: string | null
  repoOwner: string | null
  repoName: string | null
  watchActive: boolean
  lastBackupAt: string | null
  lastBackupStatus: string | null
  lastBackupError: string | null
  lastBackupDiagnosis: BackupDiagnosis | null
  commitCount: number
  lastCommitSha: string | null
  pendingQueue: number
  /** Files modified in CLAUDE_DIR since last successful backup. null when no prior backup. */
  pendingChanges: number | null
  pendingChangesSample: string[]
  pendingChangesScanLimited: boolean
  lastFailedPush: { at: string; error: string; diagnosis?: BackupDiagnosis } | null
  includePaths: string[]
  snapshotCount: number
  maxSnapshots: number
  healthy: boolean
}

export interface BackupVerifyResult {
  ok: boolean
  code: BackupErrorCode
  detail: string
  repo?: { owner: string; name: string }
  user?: string
  scopes?: string[]
  isPrivate?: boolean
  defaultBranch?: string
  canCreate?: boolean
}

export interface BackupLogLine {
  t: string
  level: 'info' | 'warn' | 'error' | 'raw'
  event: string
  [k: string]: unknown
}

export interface BackupCommit {
  hash: string
  shortHash: string
  date: string
  message: string
  author: string
}

export interface BackupDiffFile {
  file: string
  changes: number
  insertions: number
  deletions: number
  binary: boolean
}

export interface BackupSnapshot {
  name: string
  ts: string
  agent: string
  relPath: string
  size: number
  mtime: string
}

export const getBackupStatus = () => request<BackupStatus>('/backup/status')

export const connectBackup = (repoUrl: string, token: string) =>
  request<{
    ok: boolean
    error?: string
    diagnosis?: BackupDiagnosis | BackupVerifyResult
    stage?: 'verify' | 'initial_backup'
    verify?: BackupVerifyResult
  }>('/backup/connect', {
    method: 'POST',
    body: JSON.stringify({ repoUrl, token }),
  })

export const disconnectBackup = () =>
  request<{ ok: boolean }>('/backup/disconnect', { method: 'POST' })

export const runBackupNow = () =>
  request<{
    ok: boolean
    committed?: boolean
    pushed?: boolean
    message?: string
    error?: string
    diagnosis?: BackupDiagnosis
  }>('/backup/now', { method: 'POST' })

export const verifyBackupRemote = () =>
  request<BackupVerifyResult>('/backup/verify-remote')

export const createBackupRemote = (isPrivate = true) =>
  request<{
    ok: boolean
    repo?: { owner: string; name: string }
    url?: string
    alreadyExists?: boolean
    error?: string
    status?: number
  }>('/backup/create-remote', {
    method: 'POST',
    body: JSON.stringify({ private: isPrivate }),
  })

export const retryBackupPush = () =>
  request<{ ok: boolean; error?: string; diagnosis?: BackupDiagnosis }>('/backup/retry-push', {
    method: 'POST',
  })

export const getBackupLogs = (lines = 200) =>
  request<BackupLogLine[]>(`/backup/logs?lines=${lines}`)

export const listBackupCommits = (limit?: number) =>
  request<BackupCommit[]>(`/backup/commits${limit ? `?limit=${limit}` : ''}`)

export const previewBackupRestore = (commitSha: string) =>
  request<{ ok: boolean; commitSha: string; totalFiles: number; changes: BackupDiffFile[]; truncated?: boolean; error?: string }>(
    '/backup/restore/preview',
    { method: 'POST', body: JSON.stringify({ commitSha }) },
  )

export const applyBackupRestore = (commitSha: string) =>
  request<{ ok: boolean; commitSha: string; error?: string }>('/backup/restore/apply', {
    method: 'POST',
    body: JSON.stringify({ commitSha }),
  })

export const listBackupSnapshots = () => request<BackupSnapshot[]>('/backup/snapshots')

export const restoreBackupSnapshot = (name: string) =>
  request<{ ok: boolean; restoredTo?: string; error?: string }>('/backup/snapshots/restore', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

// ── HR / Organization ────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'probation' | 'pip' | 'pending' | 'retired'

export interface SkillScore {
  score: number
  hits: number
  lastUsed?: string
}

export interface AgentStats {
  fileSizeKb: number
  fileWords: number
  totalRuns: number
  successRuns: number
  failedRuns: number
  successRate: number
  avgDurationMs: number
  lastRunAt: string | null
  ageDays: number
  patternsContributed: number
  antipatternsTriggered: number
}

export interface AgentBreakdown {
  training: number
  runs: number
  tenure: number
  patterns: number
  success: number
  antipatterns: number
}

export interface AgentRecord {
  id: string
  name?: string
  department: string
  phase: string | null
  reportsTo: string | null
  title: string
  tier: string
  role?: string
  hiredAt: string
  status: AgentStatus
  level: number
  levelTitle: string
  levelColor: string
  canMentor: boolean
  canShipProd: boolean
  yearsOfExperience: number
  experiencePoints: number
  progressToNext: number
  nextLevelTitle: string | null
  breakdown: AgentBreakdown
  stats: AgentStats
  skills: Record<string, SkillScore>
  weaknesses: string[]
  lastPromoted?: string
  lastReview?: string
  retiredAt?: string
  retiredReason?: string
  pip?: {
    openedAt: string
    deadline: string
    reason: string
    openedBy: string
    closedAt?: string
    outcome?: string
  }
  directReports?: Array<{ id: string; title: string; level: number }>
  squad?: string | null
  subDepartment?: string | null
  pod?: string | null
  tags?: { tech: string[]; 'work-type': string[]; domain?: string[] }
  avatar?: string | null
  gender?: 'male' | 'female' | 'neutral' | string | null
}

export interface LevelThreshold {
  level: number
  title: string
  minYoE: number
  maxYoE: number
  color: string
  canMentor: boolean
  canShipProd: boolean
}

export interface RegistryCounts {
  total: number
  active: number
  probation: number
  pip: number
  pending: number
  retired: number
}

export interface RegistryResponse {
  version: number
  updatedAt: string | null
  total: number
  counts: RegistryCounts
  agents: AgentRecord[]
}

export interface Department {
  id: string
  label: string
  description: string
  head: string
  color: string
  icon: string
  order: number
  active: boolean
  subDepartments?: Record<string, {
    id: string
    label: string
    description?: string
    order?: number
    pod?: string | null
    // Visual fields (Phase 1 schema extension — for dynamic card rendering)
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

export interface Phase {
  id: string
  label: string
  description: string
  color: string
  order: number
}

export interface CapabilityGapResult {
  canHandle: boolean
  confidence: number
  bestMatches: Array<{
    agent: string
    title: string
    level: number
    score: number
    matched: Array<{ skill: string; score: number }>
    missing: string[]
  }>
  gaps: string[]
  recommendation: string
  inferredSkills: string[]
}

export interface RecommendationsResponse {
  generatedAt: string
  completedAt: string
  runsClassified: number
  pipCandidates: Array<{ agent: string; reasons: string[]; severity: string }>
  promotionCandidates: Array<{
    agent: string
    fromLevel: number
    toLevel: number
    fromTitle: string
    signals: string[]
  }>
}

export interface WitnessLogEntry {
  t: string
  agent: string
  runId: string | null
  class: string
  durationMs?: number
  taskType?: string
  project?: string | null
  [k: string]: unknown
}

export interface TrainingQueueItem {
  id: string
  agent: string
  skill: string
  reason: string
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'completed' | 'failed'
  queuedAt: string
  completedAt?: string
}

export interface CadenceReview {
  week: string
  reviewedAt: string
  director: string
  promotions: Array<{ agent: string; to: string }>
  pipsOpened: Array<{ agent: string }>
  pipsClosed: Array<{ agent: string; outcome: string }>
  retirements: Array<{ agent: string; reason: string }>
  newHires: Array<{ agent: string; department: string }>
  capabilityGaps: unknown[]
  recommendations?: RecommendationsResponse
}

export const getHrRegistry = () => request<RegistryResponse>('/hr/registry')

export interface HrSnapshot {
  registry: RegistryResponse
  counts: RegistryCounts
  recommendations: RecommendationsResponse
  latestReview: CadenceReview
  drift: DriftData
  generatedAt: string
}

export const getHrSnapshot = () => request<HrSnapshot>('/hr/snapshot')

// ─────────────────────────────────────────────────────────────────────────
// App Config (Phase 2 — Static→Dynamic refactor)
// ─────────────────────────────────────────────────────────────────────────

export interface AppConfigData {
  health: { threshold_healthy: number; threshold_degraded: number }
  time: {
    pip_window_days: number
    sweep_hours: number
    cadence_review_days: number
    drift_retention_days: number
    claim_expiry_minutes: number
  }
  api_limits: {
    runs_dashboard: number
    runs_analytics: number
    governance: number
    bulk_ops: number
    db_explorer: number
    logs_stream: number
    top_agents: number
  }
  ui_caps: {
    top_agents: number
    stack_trace_lines: number
    memory_preview_lines: number
    playground_history: number
    recent_runs: number
    memory_history_items: number
    schedules_dashboard: number
  }
  defaults: {
    model: string
    tier: string
    status: string
    budget_lines: number
    budget_chars: number
  }
}

export interface DispatchPolicy {
  skill_weight: number
  load_weight: number
  success_weight: number
  cost_weight_normal: number
  cost_weight_downgrade: number
  priority_boost: { p0: number; p1: number; p2: number; p3: number }
}

export interface PodDef {
  id: string
  prefix: string
  department: string | null
  description: string | null
}

export interface ModelDef {
  id: string
  display_name: string
  tier: string
  cost_penalty: number
  enabled: number
}

export interface ModelPolicyRow {
  id: number
  pattern: string
  model: string
  tier: string
  agents: string[]
  priority: number
  enabled: boolean
}

export interface AppConfigResponse {
  config: AppConfigData
  dispatchPolicy: DispatchPolicy
  pods: PodDef[]
  models: ModelDef[]
  modelPolicy: ModelPolicyRow[]
  fallbackActive: boolean
}

export interface ConfigSchemaEntry {
  type: 'number' | 'string' | 'enum' | 'boolean'
  label: string
  description?: string
  min?: number
  max?: number
  step?: number
  minLength?: number
  maxLength?: number
  options?: string[]
}

export interface ConfigAuditEntry {
  id: number
  key: string
  before: unknown
  after: unknown
  changedAt: string
  source: string | null
}

export const getAppConfig = () => request<AppConfigResponse>('/app-config')

export const getConfigSchemas = () =>
  request<{ keys: Record<string, ConfigSchemaEntry> }>('/app-config/schemas')

export const updateAppConfigKey = (key: string, value: unknown, category?: string) =>
  request<{ ok: boolean; key: string; value: unknown }>(`/app-config/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value, category }),
  })

export const updateDispatchPolicy = (policy: DispatchPolicy) =>
  request<{ ok: boolean; policy: DispatchPolicy }>('/app-config/dispatch-policy', {
    method: 'PUT',
    body: JSON.stringify(policy),
  })

export const upsertPod = (pod: PodDef) =>
  request<{ ok: boolean; pod: PodDef }>(`/app-config/pods/${encodeURIComponent(pod.id)}`, {
    method: 'PUT',
    body: JSON.stringify(pod),
  })

export const deletePod = (id: string) =>
  request<{ ok: boolean }>(`/app-config/pods/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const upsertModel = (model: { id: string; displayName: string; tier: string; costPenalty: number; enabled?: number }) =>
  request<{ ok: boolean; model: ModelDef }>(`/app-config/models/${encodeURIComponent(model.id)}`, {
    method: 'PUT',
    body: JSON.stringify(model),
  })

export const replaceModelPolicy = (rows: Array<Omit<ModelPolicyRow, 'id' | 'enabled'> & { enabled?: number }>) =>
  request<{ ok: boolean; count: number }>('/app-config/model-policy', {
    method: 'PUT',
    body: JSON.stringify({ rows }),
  })

export const getConfigAudit = (params?: { key?: string; limit?: number }) => {
  const qs = new URLSearchParams()
  if (params?.key) qs.set('key', params.key)
  if (params?.limit != null) qs.set('limit', String(params.limit))
  return request<{ items: ConfigAuditEntry[] }>(`/app-config/audit${qs.toString() ? `?${qs}` : ''}`)
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 — Server-side aggregations
// ─────────────────────────────────────────────────────────────────────────

export interface AnalyticsAggregate {
  range: string
  totalRuns: number
  totalCost: number
  avgDuration: number
  successRate: number
  dailyTrend: Array<{
    label: string
    date: string
    total: number
    success: number
    error: number
    cost: number
  }>
  topAgents: Array<{
    name: string
    runCount: number
    successRate: number
    totalCost: number
    avgDuration: number
  }>
  generatedAt: string
}

export interface FleetHealth {
  total: number
  counts: RegistryCounts
  healthy: number
  degraded: number
  critical: number
  thresholds: { healthy: number; degraded: number }
  perAgent: Record<string, number>
  generatedAt: string
}

export interface TopAgentsResponse {
  range: string
  limit: number
  agents: AnalyticsAggregate['topAgents']
  generatedAt: string
}

export const getAnalyticsAggregate = (range: '1d' | '7d' | '30d' | 'all' = '7d') =>
  request<AnalyticsAggregate>(`/analytics/aggregate?range=${range}`)

export const getTopAgents = (params?: { range?: string; limit?: number }) => {
  const qs = new URLSearchParams()
  if (params?.range) qs.set('range', params.range)
  if (params?.limit != null) qs.set('limit', String(params.limit))
  return request<TopAgentsResponse>(`/analytics/top-agents${qs.toString() ? `?${qs}` : ''}`)
}

export const getFleetHealth = () => request<FleetHealth>('/hr/fleet-health')

export const getHrAgent = (id: string) => request<AgentRecord>(`/hr/agent/${id}`)

export const getHrRecommendations = () =>
  request<RecommendationsResponse>('/hr/recommendations')

export const getHrTrainingQueue = () =>
  request<{ version: number; updatedAt: string | null; items: TrainingQueueItem[] }>(
    '/hr/training-queue',
  )

export const queueHrTraining = (agent: string, skill: string, reason: string, priority = 'medium') =>
  request('/hr/training-queue', {
    method: 'POST',
    body: JSON.stringify({ agent, skill, reason, priority }),
  })

export const getHrWitnessLog = (params?: { agent?: string; days?: number; limit?: number }) => {
  const qs = new URLSearchParams()
  if (params?.agent) qs.set('agent', params.agent)
  if (params?.days != null) qs.set('days', String(params.days))
  if (params?.limit != null) qs.set('limit', String(params.limit))
  return request<WitnessLogEntry[]>(`/hr/witness-log${qs.toString() ? `?${qs}` : ''}`)
}

export const runWitnessSweep = () =>
  request<RecommendationsResponse>('/hr/witness-sweep', { method: 'POST' })

export const runCadenceReview = () =>
  request<CadenceReview>('/hr/cadence-review', { method: 'POST' })

export const getLatestReview = () => request<CadenceReview>('/hr/reviews/latest')

export const promoteAgent = (agent: string) =>
  request<{ ok: boolean; agent?: AgentRecord; error?: string }>(`/hr/promote/${agent}`, {
    method: 'POST',
  })

export const openAgentPip = (agent: string, reason?: string) =>
  request<{ ok: boolean; agent?: AgentRecord; error?: string }>(`/hr/pip/${agent}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })

export const closeAgentPip = (agent: string, outcome: 'pass' | 'fail') =>
  request<{ ok: boolean; agent?: AgentRecord; error?: string }>(`/hr/pip/${agent}/close`, {
    method: 'POST',
    body: JSON.stringify({ outcome }),
  })

export const retireAgent = (agent: string, reason?: string) =>
  request<{ ok: boolean; agent?: AgentRecord; error?: string }>(`/hr/retire/${agent}`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })

export const unretireAgent = (agent: string) =>
  request<{ ok: boolean; agent?: AgentRecord; error?: string }>(`/hr/unretire/${agent}`, {
    method: 'POST',
  })

export interface HireRequest {
  id: string
  name?: string
  department: string
  phase?: string | null
  reportsTo?: string
  title?: string
  tier?: string
  role?: string
  description?: string
}

export const hireAgent = (request_: HireRequest) =>
  request<{ ok: boolean; agent?: AgentRecord; error?: string }>('/hr/hire', {
    method: 'POST',
    body: JSON.stringify(request_),
  })

export const detectCapabilityGap = (brief: string, requiredSkills?: string[]) =>
  request<CapabilityGapResult>('/hr/detect-gap', {
    method: 'POST',
    body: JSON.stringify({ brief, requiredSkills }),
  })

export const recomputeExperience = () =>
  request<{ updated: number; total: number; errors: unknown[]; durationMs: number }>(
    '/experience/recompute',
    { method: 'POST' },
  )

export const getExperienceLevels = () =>
  request<{ levels: LevelThreshold[]; weights: Record<string, number> }>('/experience/levels')

export const getDepartments = () =>
  request<{ departments: Department[]; phases: Phase[] }>('/departments')

// ── Database Explorer ───────────────────────────────────────────────────────

export interface DbTableInfo {
  name: string
  rowCount: number
  columns: Array<{ name: string; type: string; notnull: boolean; pk: boolean }>
}

export interface DbTableData {
  table: string
  total: number
  limit: number
  offset: number
  columns: string[]
  rows: Record<string, unknown>[]
}

export interface DbQueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  total: number
  duration: number
}

export interface DbStats {
  sizeBytes: number
  sizeKb: number
  sizeMb: string
  tableCount: number
  journalMode: string
  path: string
}

export const getDbTables = () => request<DbTableInfo[]>('/db/tables')
export const getDbTable = (name: string, limit = 100, offset = 0) =>
  request<DbTableData>(`/db/table/${name}?limit=${limit}&offset=${offset}`)
export const runDbQuery = (sql: string) =>
  request<DbQueryResult>('/db/query', { method: 'POST', body: JSON.stringify({ sql }) })
export const getDbStats = () => request<DbStats>('/db/stats')

export interface DbChangeEntry {
  id: number
  tableName: string
  rowKey: string
  action: string
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  changedAt: string
  reverted: boolean
  actor: string
}

export const updateDbRow = (table: string, pk: string, data: Record<string, unknown>) =>
  request<{ ok: boolean; row: Record<string, unknown> }>(`/db/table/${table}/${encodeURIComponent(pk)}`, {
    method: 'PUT', body: JSON.stringify(data),
  })
export const deleteDbRow = (table: string, pk: string) =>
  request<{ ok: boolean }>(`/db/table/${table}/${encodeURIComponent(pk)}`, { method: 'DELETE' })
export const getDbChanges = (table?: string, limit = 100) =>
  request<DbChangeEntry[]>(`/db/changes?${table ? `table=${table}&` : ''}limit=${limit}`)
export const revertDbChange = (id: number) =>
  request<{ ok: boolean }>(`/db/revert/${id}`, { method: 'POST' })

// ── Error Log ────────────────────────────────────────────────────────────────

export interface ErrorLogEntry {
  id: number
  ts: string
  level: 'error' | 'warn' | 'info' | 'debug' | string
  source: 'server' | 'client' | 'schedule' | 'db' | string
  message: string
  stack?: string | null
  context?: string | null
  resolved: number
  // v18 observability fields (all nullable)
  category?: string | null
  agent_id?: string | null
  request_id?: string | null
  route?: string | null
  method?: string | null
  status?: number | null
  duration_ms?: number | null
  user_agent?: string | null
}

export interface ErrorLogResponse {
  entries: ErrorLogEntry[]
  unresolved: number
  total: number
}

export interface ErrorLogQuery {
  limit?: number
  source?: string
  resolved?: number
  level?: string
  category?: string
  agentId?: string
  q?: string
  since?: string
  until?: string
  beforeId?: number
}

export const getErrorLog = (params?: ErrorLogQuery) => {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.source) qs.set('source', params.source)
  if (params?.resolved !== undefined) qs.set('resolved', String(params.resolved))
  if (params?.level) qs.set('level', params.level)
  if (params?.category) qs.set('category', params.category)
  if (params?.agentId) qs.set('agentId', params.agentId)
  if (params?.q) qs.set('q', params.q)
  if (params?.since) qs.set('since', params.since)
  if (params?.until) qs.set('until', params.until)
  if (params?.beforeId) qs.set('beforeId', String(params.beforeId))
  const q = qs.toString()
  return request<ErrorLogResponse>(`/logs${q ? `?${q}` : ''}`)
}

export interface ErrorLogHistogramBucket { bucket: string; level: string; n: number }
export const getErrorLogHistogram = (hours = 24) =>
  request<{ buckets: ErrorLogHistogramBucket[]; hours: number }>(`/logs/histogram?hours=${hours}`)

export const resolveAllErrorLog = (filter: { category?: string; level?: string; source?: string }) => {
  const qs = new URLSearchParams()
  if (filter.category) qs.set('category', filter.category)
  if (filter.level) qs.set('level', filter.level)
  if (filter.source) qs.set('source', filter.source)
  return request<{ ok: boolean; resolved: number }>(`/logs/resolve-all?${qs}`, { method: 'PATCH' })
}

export const runLogSelftest = () =>
  request<{ ok: boolean; ts: string; emitted: number }>('/logs/_selftest', { method: 'POST' })

export const getErrorLogCount = () =>
  request<{ unresolved: number }>('/logs/count')

export const postClientError = (body: { message: string; stack?: string; context?: object }) =>
  request<{ ok: boolean }>('/logs/client-error', { method: 'POST', body: JSON.stringify(body) })

export const resolveErrorLog = (id: number) =>
  request<{ ok: boolean }>(`/logs/${id}/resolve`, { method: 'PATCH' })

export const clearErrorLog = (all?: boolean) =>
  request<{ ok: boolean; deleted: number }>(`/logs${all ? '?all=1' : ''}`, { method: 'DELETE' })

export type LogStreamEvent =
  | { type: 'ready'; unresolved: number }
  | { type: 'new_error'; entry: ErrorLogEntry }
  | { type: 'resolved'; id: number }
  | { type: 'cleared'; all: boolean }

export function subscribeLogStream(onEvent: (e: LogStreamEvent) => void): EventSource {
  const es = new EventSource(`${BASE}/logs/stream`)
  const parse = (ev: MessageEvent) => {
    try { return ev.data ? JSON.parse(ev.data) : {} } catch (e) {
      // Don't recursively log to /logs/client-error if log-stream itself fails.
      // Just swallow — Logs page will fall back to GET poll.
      console.warn('[logs/stream parse]', e)
      return {}
    }
  }
  es.addEventListener('ready', (ev: MessageEvent) => onEvent({ type: 'ready', unresolved: parse(ev).unresolved ?? 0 }))
  es.addEventListener('new_error', (ev: MessageEvent) => onEvent({ type: 'new_error', entry: parse(ev) }))
  es.addEventListener('resolved', (ev: MessageEvent) => onEvent({ type: 'resolved', id: parse(ev).id }))
  es.addEventListener('cleared', (ev: MessageEvent) => onEvent({ type: 'cleared', all: parse(ev).all }))
  return es
}

// ── Learning Inbox (auto-learn from VS Code sessions) ────────────────────────
export type LearningType =
  | 'lesson' | 'bug' | 'decision' | 'feedback' | 'golden'
  // Continuity-brain candidate types (each approve = a human sign-off / identity-lock):
  | 'identity' | 'preference' | 'contradiction' | 'open_loop' | 'decay_review'
export type LearningStatus = 'pending' | 'approved' | 'rejected' | 'auto'

export interface LearningCandidate {
  id: string
  type: LearningType
  title: string
  // Most payloads are flat string maps; continuity types may carry typed fields
  // (confidence, oldId, etc.) so allow a broader value union without `any`.
  payload: Record<string, string | number | boolean | null>
  source: string | null
  sessionId: string | null
  project: string | null
  confidence: number
  status: LearningStatus
  createdAt: string
  reviewedAt: string | null
  capturedRef: string | null
}
export interface InboxCounts { pending: number; approved: number; rejected: number; auto: number }

export const getLearningInbox = (status: string) =>
  request<{ items: LearningCandidate[]; counts: InboxCounts }>(`/learning/inbox?status=${encodeURIComponent(status)}`)

export const getLearningInboxCounts = () => request<InboxCounts>('/learning/inbox/counts')

export interface LearningDigestStatus {
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunSummary: string | null
  sessionsScanned: number | null
  captured: number | null
  staged: number | null
  deduped: number | null
  scan: { upserted: number; repended: number } | null
  nextRunAt: string | null
}
export const getLearningStatus = () => request<LearningDigestStatus>('/learning/status')

export interface LearningDigestRun {
  id: string
  timestamp: string
  status: string
  durationMs: number
  sessions: number
  captured: number
  staged: number
  deduped: number
}
export interface LearningCapture {
  id: string
  type: LearningType
  title: string
  project: string | null
  created_at: string | null
}
export interface LearningCaptured {
  total: number
  byType: Record<string, number>
  byOrigin: Record<string, number>
  last7d: number
  prev7d: number
  weekly: { weekStart: string; count: number }[]
}
export interface LearningImprovement {
  enough: boolean
  sample: number
  thisWeekPct: number | null
  prevWeekPct: number | null
  deltaPct: number | null
  qualityMean: number | null
  qualitySample: number
}
export interface LearningOverview {
  counts: InboxCounts
  status: LearningDigestStatus
  sessions: { lastDay: number; lastWeek: number; total: number }
  deduped7d: number
  runs: LearningDigestRun[]
  recent: LearningCapture[]
  captured: LearningCaptured
  bySource: { autoSaved: number; reviewed: number; direct: number }
  memory: { patterns: number; feedbackDirectives: number }
  improvement: LearningImprovement
}
export const getLearningOverview = () => request<LearningOverview>('/learning/overview')

export const approveCandidate = (id: string) =>
  // capture embeds via local Ollama — allow a little longer than the default.
  request<{ ok: boolean; capturedRef: string }>(`/learning/inbox/${id}/approve`, { method: 'POST', timeoutMs: 20000 })

export const rejectCandidate = (id: string) =>
  request<{ ok: boolean }>(`/learning/inbox/${id}/reject`, { method: 'POST' })

export interface BulkApproveResult { ok: boolean; approved: string[]; failed: { id: string; error: string }[]; total: number }
export interface BulkRejectResult { ok: boolean; rejected: string[]; failed: { id: string; error: string }[]; total: number }

export const bulkApproveCandidates = (ids: string[]) =>
  // each item captures via Ollama — scale the timeout with batch size.
  request<BulkApproveResult>('/learning/inbox/bulk-approve', { method: 'POST', body: JSON.stringify({ ids }), timeoutMs: Math.min(120000, 15000 + ids.length * 5000) })

export const bulkRejectCandidates = (ids: string[]) =>
  request<BulkRejectResult>('/learning/inbox/bulk-reject', { method: 'POST', body: JSON.stringify({ ids }) })

export const editCandidate = (id: string, body: { title?: string; payload?: Record<string, string> }) =>
  request<{ ok: boolean; candidate: LearningCandidate }>(`/learning/inbox/${id}`, { method: 'PATCH', body: JSON.stringify(body) })

export type LearningStreamEvent =
  | { type: 'ready'; pending: number }
  | { type: 'candidate'; staged: number }
  | { type: 'reviewed'; id: string; status: string }

export function subscribeLearningStream(onEvent: (e: LearningStreamEvent) => void): EventSource {
  const es = new EventSource(`${BASE}/learning/inbox/stream`)
  const parse = (ev: MessageEvent): Record<string, unknown> => {
    try { return ev.data ? JSON.parse(ev.data) : {} } catch (e) { console.warn('[learning/stream parse]', e); return {} }
  }
  es.addEventListener('ready', (ev: MessageEvent) => onEvent({ type: 'ready', pending: Number(parse(ev).pending ?? 0) }))
  es.addEventListener('candidate', (ev: MessageEvent) => onEvent({ type: 'candidate', staged: Number(parse(ev).staged ?? 1) }))
  es.addEventListener('reviewed', (ev: MessageEvent) => onEvent({ type: 'reviewed', id: String(parse(ev).id ?? ''), status: String(parse(ev).status ?? '') }))
  return es
}

// ── Brain (Phase F: self-improving loop — Training Review + timeline) ─────────
export interface BrainStats {
  signals: { total: number; open: number; patched: number }
  patches: { total: number; applied: number; proposed: number; reverted: number }
  decisions: { auto: number; review: number; reject: number }
}
export interface MemoryFreshness {
  count?: number
  newestAgeDays: number | null
  avgAgeDays: number | null
  oldestAgeDays: number | null
  ageBuckets: Record<string, number>
}
export interface BrainHygiene {
  generatedAt: string
  totalChunks: number
  freshness: MemoryFreshness | null
  superseded: number
  decayFlaggedRefs: number
  staleCapturedTotal: number
  orphans: { retiredAgents: Record<string, number>; unregisteredAgents: Record<string, number>; retiredAgentChunkCount: number } | null
  recommendations: { kind: string; severity: string; detail: string; agents?: string[] }[]
}
export interface BrainTimelineEntry {
  id: number
  ts: string
  kind: string
  agent: string | null
  refId: string | null
  decision: string | null
  summary: string | null
  data: Record<string, unknown>
}
export interface EvalTrendPoint { ts: string; overall: number; agent: string | null; caseId: string | null }
export interface BrainOverview {
  stats: BrainStats
  hygiene: BrainHygiene | null
  eval: { trend: EvalTrendPoint[]; mean: number | null; sample: number }
  recentTimeline: BrainTimelineEntry[]
}
export const getBrainOverview = () => request<BrainOverview>('/brain/overview')

export interface BrainSignal {
  id: string
  ts: string
  agent: string
  kind: string
  signature: string
  severity: string
  occurrences: number
  projects: string[]
  evidence: Record<string, unknown>
  status: string
}
export interface BrainPatchImpact {
  scoreBefore?: number | null
  scoreAfter?: number | null
  runsObserved?: number
  regressionPct?: number | null
  revertReason?: string
}
export interface BrainPatch {
  id: string
  ts: string
  agent: string
  signalId: string | null
  patchType: string
  targetFile: string | null
  section: string | null
  before_text: string
  after_text: string
  decision: string
  decisionReasons: string[]
  status: string
  appliedAt: string | null
  revertedAt: string | null
  impact: BrainPatchImpact
  signal: Pick<BrainSignal, 'id' | 'kind' | 'severity' | 'signature' | 'occurrences' | 'projects' | 'evidence'> | null
  evidenceLabel: string | null
}
export const getBrainPatches = (status = 'proposed') =>
  request<{ items: BrainPatch[]; counts: BrainStats['patches'] }>(`/brain/patches?status=${encodeURIComponent(status)}`)
export const getBrainSignals = (status?: string, kind?: string) => {
  const qs = new URLSearchParams()
  if (status) qs.set('status', status)
  if (kind) qs.set('kind', kind)
  const q = qs.toString()
  return request<{ items: BrainSignal[] }>(`/brain/signals${q ? `?${q}` : ''}`)
}
export const updateBrainSignalStatus = (id: string, status: 'acknowledged' | 'dismissed' | 'open') =>
  request<{ ok: boolean; id: string; status: string }>(`/brain/signals/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
export const getBrainTimeline = (limit = 50) =>
  request<{ items: BrainTimelineEntry[] }>(`/brain/timeline?limit=${limit}`)
export const applyBrainPatch = (id: string) =>
  // surgical .md edit + reindex enqueue — allow a little longer than the default.
  request<{ ok: boolean; id: string; alreadyApplied: boolean }>(`/brain/patches/${id}/apply`, { method: 'POST', timeoutMs: 20000 })
export const rejectBrainPatch = (id: string) =>
  request<{ ok: boolean; id: string }>(`/brain/patches/${id}/reject`, { method: 'POST' })

export interface BrainMemoryEvent {
  type: 'memory'
  kind: string
  embedded?: number
  drained?: number
  generatedAt?: string
  decayFlaggedRefs?: number
}
export type BrainStreamEvent =
  | { type: 'ready'; proposed: number }
  | BrainMemoryEvent
  | { type: 'patch'; id: string; status: string }

export function subscribeBrainStream(onEvent: (e: BrainStreamEvent) => void): EventSource {
  const es = new EventSource(`${BASE}/brain/stream`)
  const parse = (ev: MessageEvent): Record<string, unknown> => {
    try { return ev.data ? JSON.parse(ev.data) : {} } catch (e) { console.warn('[brain/stream parse]', e); return {} }
  }
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  es.addEventListener('ready', (ev: MessageEvent) => onEvent({ type: 'ready', proposed: Number(parse(ev).proposed ?? 0) }))
  es.addEventListener('memory', (ev: MessageEvent) => {
    const p = parse(ev)
    onEvent({ type: 'memory', kind: String(p.kind ?? ''), embedded: num(p.embedded), drained: num(p.drained), generatedAt: str(p.generatedAt), decayFlaggedRefs: num(p.decayFlaggedRefs) })
  })
  es.addEventListener('patch', (ev: MessageEvent) => onEvent({ type: 'patch', id: String(parse(ev).id ?? ''), status: String(parse(ev).status ?? '') }))
  return es
}

// ── Observability / Hardening (Pillars 1·3·5·6) ──────────────────────────────
export interface Spend {
  calls: number
  tokens: number | null
  costUsd: number | null
  realCalls: number | null
  realCostUsd: number | null
}
export interface PolicyViolation { code: string; severity: 'block' | 'warn'; detail?: string }
export interface PolicyAuditRow {
  id: number
  ts: string
  decision: 'allow' | 'block'
  agentId: string | null
  taskType: string | null
  priority: string | null
  source: string | null
  violations: PolicyViolation[]
  context: Record<string, unknown>
}
export interface EvalScoreRow {
  id: number
  ts: string
  runId: string | null
  caseId: string | null
  agent: string | null
  taskType: string | null
  overall: number | null
  pass: boolean
  scores: Record<string, number>
  reasoning: string | null
}
export interface DelegationRow {
  id: number
  ts: string
  parentRunId: string | null
  parentAgent: string | null
  childAgent: string
  childRunId: string | null
  task: string | null
}
export interface CostLogRow {
  id: number
  runId: string | null
  agentName: string | null
  ts: string
  model: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  estimated: number
  source: string | null
}
export interface ObservabilitySummary {
  spend: Spend
  recentBlocks: PolicyAuditRow[]
  recentEvalScores: EvalScoreRow[]
  recentDelegations: DelegationRow[]
}

const qstr = (params: Record<string, string | number | undefined>): string => {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export const getObservabilitySummary = (since?: string) =>
  request<ObservabilitySummary>(`/observability/summary${qstr({ since })}`)
export const getSpend = (since?: string, agentName?: string) =>
  request<Spend>(`/observability/spend${qstr({ since, agentName })}`)
export const getCostLogs = (opts?: { runId?: string; agentName?: string; since?: string; limit?: number }) =>
  request<{ items: CostLogRow[] }>(`/observability/cost${qstr({ ...opts })}`)
export const getPolicyAudit = (opts?: { decision?: 'allow' | 'block'; agentId?: string; since?: string; limit?: number }) =>
  request<{ items: PolicyAuditRow[] }>(`/observability/policy-audit${qstr({ ...opts })}`)
export const getEvalScores = (opts?: { agent?: string; caseId?: string; limit?: number }) =>
  request<{ items: EvalScoreRow[] }>(`/observability/eval-scores${qstr({ ...opts })}`)
export const getDelegations = (opts?: { parentRunId?: string; childAgent?: string; limit?: number }) =>
  request<{ items: DelegationRow[] }>(`/observability/delegations${qstr({ ...opts })}`)

// ── Consolidation (Pillar 6) ─────────────────────────────────────────────────
export interface ConsolidationCluster {
  cluster: string
  size: number
  agents: string[]
  withRuns: number
  idle: string[]
}
export interface ConsolidationReport {
  windowDays: number
  activeAgents: number
  agentsWithRuns: number
  totalRuns: number
  dataSufficient: boolean
  note: string | null
  overlapClusters: ConsolidationCluster[]
  retireCandidates: Array<{ id: string; department: string; runs: number; runsPerWeek: number }>
  retireCandidatesLowConfidence: Array<{ id: string; department: string; runs: number; runsPerWeek: number }>
}
export const getConsolidationReport = (windowDays?: number) =>
  request<ConsolidationReport>(`/consolidation/report${qstr({ windowDays })}`)

// ── Semantic memory (Pillar 2 vector RAG) ────────────────────────────────────
export interface IntelHit {
  score: number
  source_type: string
  source_ref: string
  title?: string
  heading_path?: string
  text: string
}
export const searchIntelligence = (q: string, opts?: { k?: number; type?: string }) =>
  request<{ query: string; count: number; results: IntelHit[] }>(
    `/intelligence/search${qstr({ q, k: opts?.k, type: opts?.type })}`,
    { timeoutMs: 20000 }, // Ollama embed can be slow on a cold model
  )
export const getIntelligenceStats = () =>
  request<{ store: string; total: number; byType?: Record<string, number>; file?: string }>('/intelligence/stats')

// ── System Health cockpit (GET /api/system/status) ───────────────────────────
export type SubState = 'ok' | 'degraded' | 'down'
export interface SystemCron {
  id: string; name: string; enabled: boolean
  lastRunAt: string | null; lastRunStatus: string | null; nextRunAt: string | null; needsLlm: boolean
}
export interface SystemStatus {
  timestamp: string
  overall: SubState
  server: {
    state: SubState; note: string; uptimeSec: number
    db: { status: string; sizeMB?: number }
    launchAgent: { managed: boolean; pid?: number | null }
  }
  memory: {
    state: SubState; note: string; mcpUserScoped: boolean
    ollama: { ok: boolean; models?: string[]; error?: string }
    index: { ok?: boolean; store?: string; total: number; byType?: Record<string, number>; error?: string }
    lastReindex: { at: string | null; status: string | null } | null
  }
  evaluation: {
    state: SubState; note: string
    lastRun: { at: string | null; status: string | null } | null
    scores: { count: number; avgOverall: number | null; passRate: number | null }
  }
  observability: {
    state: SubState; note: string
    spend: { calls?: number; realCalls?: number | null; realCostUsd?: number | null; costUsd?: number | null; tokens?: number | null }
    recentBlocks: number; recentDelegations: number
  }
  vscode: {
    state: SubState; note: string; hookRegistered: boolean
    runs24h: { count: number; successRate: number | null }
  }
  crons: SystemCron[]
}
export const getSystemStatus = (force?: boolean) =>
  request<SystemStatus>(`/system/status${force ? '?force=1' : ''}`)
