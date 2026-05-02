/**
 * @boldteq/agents
 * Call any global Claude agent from any Boldteq app.
 * Polyglot must be running (auto-starts on login via LaunchAgent).
 */

const POLYGLOT_URL = process.env.POLYGLOT_URL || 'http://localhost:3847'

/**
 * Call a global agent with a prompt.
 *
 * @param {string} agentName - e.g. "quill", "vex", "nova", "sage", "koda"
 * @param {string} prompt - the task to send
 * @param {number} [timeoutMs=120000] - timeout in ms
 * @returns {Promise<{ success: boolean, output: string, agent: string, error?: string }>}
 *
 * @example
 * const { callAgent } = require('@boldteq/agents')
 * const result = await callAgent('quill', 'Write a tagline for Pinzo')
 * console.log(result.output)
 */
async function callAgent(agentName, prompt, timeoutMs = 120000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${POLYGLOT_URL}/api/playground/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, prompt, source: 'sdk' }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Polyglot returned ${response.status}`)
    }

    const text = await response.text()
    const events = text
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => { try { return JSON.parse(line.slice(6)) } catch { return null } })
      .filter(Boolean)

    const errorEvent = events.find(e => e.type === 'error')
    if (errorEvent) return { success: false, output: '', agent: agentName, error: errorEvent.error }

    const doneEvent = events.find(e => e.type === 'done' || e.type === 'complete')
    return { success: true, output: doneEvent?.output || '', agent: agentName }

  } catch (err) {
    clearTimeout(timeout)
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      output: '',
      agent: agentName,
      error: msg.includes('abort')
        ? `Timed out after ${timeoutMs / 1000}s`
        : `Polyglot not reachable at ${POLYGLOT_URL} — is it running?`,
    }
  }
}

/**
 * List all available global agents.
 * @returns {Promise<Array<{ filename, name, description, model }>>}
 */
async function listAgents() {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/global/agents`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

/**
 * Check if Polyglot is reachable.
 * @returns {Promise<boolean>}
 */
async function isOnline() {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/global/agents`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * List all agent categories with counts.
 * @returns {Promise<Array<{ name: string, count: number }>>}
 */
async function listCategories() {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/categories`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

/**
 * List all output templates.
 * @returns {Promise<Array<{ filename, name, description }>>}
 */
async function listTemplates() {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/templates`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return []
  }
}

/**
 * Claim a task (prevents duplicate agent work).
 * @param {string} taskId - unique task identifier
 * @param {string} agentName - agent claiming the task
 * @param {string} [description] - what the task is
 * @returns {Promise<{ ok: boolean, taskId: string, claimedBy: string } | { error: string }>}
 */
async function claimTask(taskId, agentName, description) {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, agentName, description }),
    })
    return await res.json()
  } catch {
    return { error: 'Polyglot not reachable' }
  }
}

/**
 * Release/complete a claimed task.
 * @param {string} taskId
 * @param {'completed' | 'released' | 'failed'} status
 * @param {string} [result] - outcome description
 */
async function releaseClaim(taskId, status = 'completed', result) {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/claims/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, result }),
    })
    return await res.json()
  } catch {
    return { error: 'Polyglot not reachable' }
  }
}

/**
 * Check if a task is already claimed.
 * @param {string} taskId
 * @returns {Promise<{ claimed: boolean, agentName?: string }>}
 */
async function isTaskClaimed(taskId) {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/claims/${encodeURIComponent(taskId)}`)
    return await res.json()
  } catch {
    return { claimed: false }
  }
}

/**
 * Get recommended model tier for a task.
 * @param {string} agentName
 * @param {string} [taskDescription]
 * @returns {Promise<{ model: string, tier: string, reason: string }>}
 */
async function getRecommendedModel(agentName, taskDescription) {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/routing/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, taskDescription }),
    })
    return await res.json()
  } catch {
    return { model: 'sonnet', tier: 'medium', reason: 'fallback (hub unreachable)' }
  }
}

/**
 * Record a learning event (agent performance tracking).
 * @param {string} agentName
 * @param {string} taskType
 * @param {{ success: boolean, duration?: number, tokens?: number, cost?: number }} outcome
 */
async function recordAgentLearning(agentName, taskType, outcome) {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/learning/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, taskType, ...outcome }),
    })
    return await res.json()
  } catch {
    return { error: 'Polyglot not reachable' }
  }
}

/**
 * Get the best agent for a task type (based on learning data).
 * @param {string} taskType - e.g. 'copy', 'build', 'test', 'debug', 'review'
 * @returns {Promise<{ recommendation: string | null, successRate: number }>}
 */
async function getBestAgent(taskType) {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/learning/route/${encodeURIComponent(taskType)}`)
    return await res.json()
  } catch {
    return { recommendation: null, message: 'Hub unreachable' }
  }
}

module.exports = {
  callAgent, listAgents, isOnline, listCategories, listTemplates,
  // Claims system
  claimTask, releaseClaim, isTaskClaimed,
  // Model routing
  getRecommendedModel,
  // Learning system
  recordAgentLearning, getBestAgent,
}
