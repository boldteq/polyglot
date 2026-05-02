export interface AgentResult {
  success: boolean
  output: string
  agent: string
  error?: string
}

export interface Agent {
  filename: string
  name: string
  description: string
  model: string
  body: string
}

/**
 * Call a global agent with a prompt.
 * @param agentName - e.g. "quill", "vex", "nova", "sage", "koda", "luna", "arya"
 * @param prompt - the task to send
 * @param timeoutMs - timeout in ms (default: 120000)
 */
export function callAgent(agentName: string, prompt: string, timeoutMs?: number): Promise<AgentResult>

/**
 * List all available global agents.
 */
export function listAgents(): Promise<Agent[]>

/**
 * Check if Polyglot is reachable.
 */
export function isOnline(): Promise<boolean>

export interface Category {
  name: string
  count: number
}

export interface Template {
  filename: string
  name: string
  description: string
}

/**
 * List all agent categories with counts.
 */
export function listCategories(): Promise<Category[]>

/**
 * List all output templates.
 */
export function listTemplates(): Promise<Template[]>

// ── Claims System ────────────────────────────────────────────────────────────

export interface ClaimResult {
  ok?: boolean
  taskId?: string
  claimedBy?: string
  error?: string
}

export interface ClaimCheck {
  claimed: boolean
  agentName?: string
  claimedAt?: string
}

/** Claim a task (prevents duplicate agent work). */
export function claimTask(taskId: string, agentName: string, description?: string): Promise<ClaimResult>

/** Release/complete a claimed task. */
export function releaseClaim(taskId: string, status?: 'completed' | 'released' | 'failed', result?: string): Promise<{ ok: boolean }>

/** Check if a task is already claimed. */
export function isTaskClaimed(taskId: string): Promise<ClaimCheck>

// ── Cost-Based Model Routing ─────────────────────────────────────────────────

export interface ModelRecommendation {
  model: 'haiku' | 'sonnet' | 'opus'
  tier: 'simple' | 'medium' | 'complex'
  reason: string
  cost?: { input: number; output: number; label: string }
}

/** Get recommended model tier for a task. */
export function getRecommendedModel(agentName: string, taskDescription?: string): Promise<ModelRecommendation>

// ── Agent Learning System ────────────────────────────────────────────────────

export interface LearningOutcome {
  success: boolean
  duration?: number
  tokens?: number
  cost?: number
}

export interface LearningResult {
  agent: string
  taskType: string
  successRate: number
}

export interface AgentRecommendation {
  taskType: string
  recommendation: string | null
  successRate?: number
  alternatives?: Array<{ name: string; successRate: number; avgDuration: number; runs: number }>
}

/** Record a learning event (agent performance tracking). */
export function recordAgentLearning(agentName: string, taskType: string, outcome: LearningOutcome): Promise<LearningResult>

/** Get the best agent for a task type (based on learning data). */
export function getBestAgent(taskType: string): Promise<AgentRecommendation>
