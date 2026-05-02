'use strict';

// Polyglot Tasks lifecycle helpers — Phase A of the Routing Engine.
//
// A "task" is a higher-level work unit (e.g. "fix the embed-token bug",
// "ship Pinzo settings page") that may decompose into many LLM calls
// (recorded in agent_runs). Tasks are assigned to exactly one agent and
// participate in capacity tracking — every active task increments
// agents.active_task_count so the dispatcher won't pick an overloaded
// specialist.
//
// Every state transition emits a typed event on the shared
// agentSync.events bus. The org-chart UI is already subscribed to that
// bus (via /api/org-chart/stream), so live load indicators will pulse
// 🟢🟡🔴 as soon as we surface the status fields.

const { events } = require('./agentSync');
const db = require('../db');

const VALID_STATUSES = new Set(['assigned', 'running', 'completed', 'failed', 'cancelled']);
const VALID_PRIORITIES = new Set(['p0', 'p1', 'p2', 'p3']);

let counter = 0;
function newTaskId() {
  counter += 1;
  return `task-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function getDb() {
  // db.js exports getDb() lazily — re-entered each call so testing/migration
  // doesn't pin a stale connection.
  return db.getDb();
}

// Read one task row + parsed metadata
function getTask(taskId) {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!row) return null;
  return { ...row, metadata: safeJsonParse(row.metadata, {}) };
}

function safeJsonParse(s, fallback) {
  try { return JSON.parse(s || '{}'); } catch { return fallback; }
}

// Create a new task. Increments the agent's active_task_count.
//
// input: { agentId, source?, taskType?, title?, prompt?, priority?,
//          estimatedTokens?, estimatedCostUsd?, metadata? }
function createTask(input) {
  if (!input || !input.agentId) {
    throw new Error('createTask requires { agentId, ... }');
  }
  const priority = input.priority || 'p2';
  if (!VALID_PRIORITIES.has(priority)) {
    throw new Error(`createTask: invalid priority "${priority}"`);
  }

  const id = input.id || newTaskId();
  const now = nowIso();
  const metadata = JSON.stringify(input.metadata || {});

  const d = getDb();

  // Atomic: insert task + bump agent load
  d.transaction(() => {
    d.prepare(`
      INSERT INTO tasks (id, agentId, source, taskType, title, prompt, status, priority,
        estimatedTokens, estimatedCostUsd, assignedAt, metadata)
      VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?)
    `).run(
      id,
      input.agentId,
      input.source || 'manual',
      input.taskType || 'general',
      input.title || null,
      input.prompt || null,
      priority,
      input.estimatedTokens || 0,
      input.estimatedCostUsd || 0,
      now,
      metadata,
    );

    d.prepare(`
      UPDATE agents
      SET active_task_count = COALESCE(active_task_count, 0) + 1,
          last_dispatch_at = ?
      WHERE id = ?
    `).run(now, input.agentId);
  })();

  const task = getTask(id);
  events.emit('task:created', task);
  return task;
}

// Mark task as running (agent picked it up). Idempotent: re-emitting from
// 'assigned' is fine, but won't transition out of terminal states.
function markRunning(taskId) {
  const task = getTask(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);
  if (task.status !== 'assigned') return task;
  const now = nowIso();
  getDb().prepare(`UPDATE tasks SET status = 'running', startedAt = ? WHERE id = ?`).run(now, taskId);
  const updated = getTask(taskId);
  events.emit('task:started', updated);
  return updated;
}

// Mark task complete. Decrements agent load and clears any busy hold.
function markComplete(taskId, output, { actualTokens, actualCostUsd } = {}) {
  return finalizeTask(taskId, 'completed', { output, actualTokens, actualCostUsd });
}

// Mark task failed. Same load-decrement as completion (the slot opens up).
function markFailed(taskId, error, { actualTokens, actualCostUsd } = {}) {
  return finalizeTask(taskId, 'failed', { error, actualTokens, actualCostUsd });
}

// Mark task cancelled (caller aborted before completion).
function cancel(taskId, reason = 'cancelled by caller') {
  return finalizeTask(taskId, 'cancelled', { error: reason });
}

function finalizeTask(taskId, terminalStatus, fields) {
  if (!['completed', 'failed', 'cancelled'].includes(terminalStatus)) {
    throw new Error(`finalizeTask: invalid terminal status "${terminalStatus}"`);
  }
  const task = getTask(taskId);
  if (!task) throw new Error(`task ${taskId} not found`);
  if (['completed', 'failed', 'cancelled'].includes(task.status)) return task; // already terminal

  const now = nowIso();
  const d = getDb();

  d.transaction(() => {
    d.prepare(`
      UPDATE tasks
      SET status = ?,
          completedAt = ?,
          output = COALESCE(?, output),
          error = COALESCE(?, error),
          actualTokens = COALESCE(?, actualTokens),
          actualCostUsd = COALESCE(?, actualCostUsd)
      WHERE id = ?
    `).run(
      terminalStatus,
      now,
      fields.output ?? null,
      fields.error ?? null,
      fields.actualTokens ?? null,
      fields.actualCostUsd ?? null,
      taskId,
    );

    // Decrement load — clamped at 0 to avoid bad state from out-of-order events
    d.prepare(`
      UPDATE agents
      SET active_task_count = MAX(0, COALESCE(active_task_count, 0) - 1),
          busy_until_at = NULL
      WHERE id = ?
    `).run(task.agentId);
  })();

  const updated = getTask(taskId);
  const evtName = terminalStatus === 'completed'
    ? 'task:completed'
    : terminalStatus === 'failed'
      ? 'task:failed'
      : 'task:cancelled';
  events.emit(evtName, updated);
  return updated;
}

// Read live load info for one agent. Returns { activeTaskCount,
// maxConcurrentTasks, loadStatus, busyUntilAt, lastDispatchAt }.
function getAgentLoad(agentId) {
  const row = getDb().prepare(`
    SELECT active_task_count AS activeTaskCount,
           max_concurrent_tasks AS maxConcurrentTasks,
           busy_until_at AS busyUntilAt,
           last_dispatch_at AS lastDispatchAt
    FROM agents
    WHERE id = ?
  `).get(agentId);
  if (!row) return null;
  return {
    ...row,
    loadStatus: classifyLoad(row.activeTaskCount, row.maxConcurrentTasks),
  };
}

// Classify a (count, max) pair into a stoplight state. UI uses this for
// 🟢🟡🔴 indicators in the org chart.
function classifyLoad(active, max) {
  const a = active || 0;
  const m = max || 3;
  if (a === 0) return 'free';
  if (a >= m) return 'overloaded';
  return 'busy';
}

// Bulk variant: load info for every active agent. Used by buildOrgChart.
function getAllAgentLoad() {
  const rows = getDb().prepare(`
    SELECT id,
           active_task_count AS activeTaskCount,
           max_concurrent_tasks AS maxConcurrentTasks,
           busy_until_at AS busyUntilAt,
           last_dispatch_at AS lastDispatchAt
    FROM agents
  `).all();
  const out = {};
  for (const r of rows) {
    out[r.id] = {
      activeTaskCount: r.activeTaskCount,
      maxConcurrentTasks: r.maxConcurrentTasks,
      busyUntilAt: r.busyUntilAt,
      lastDispatchAt: r.lastDispatchAt,
      loadStatus: classifyLoad(r.activeTaskCount, r.maxConcurrentTasks),
    };
  }
  return out;
}

// Reconciliation helper: re-derives active_task_count from the tasks table
// in case it ever drifts (e.g. crashed mid-transaction). Safe to call from
// the boot sequence or a periodic Witness sweep.
function reconcileLoad() {
  const d = getDb();
  d.exec(`
    UPDATE agents
    SET active_task_count = (
      SELECT COUNT(*) FROM tasks
      WHERE tasks.agentId = agents.id
        AND tasks.status IN ('assigned', 'running')
    )
  `);
}

// List recent tasks for an agent (for the deep-panel Tasks tab).
function recentForAgent(agentId, limit = 20) {
  const rows = getDb().prepare(`
    SELECT * FROM tasks WHERE agentId = ?
    ORDER BY assignedAt DESC LIMIT ?
  `).all(agentId, limit);
  return rows.map((r) => ({ ...r, metadata: safeJsonParse(r.metadata, {}) }));
}

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  newTaskId,
  createTask,
  markRunning,
  markComplete,
  markFailed,
  cancel,
  getTask,
  getAgentLoad,
  getAllAgentLoad,
  classifyLoad,
  reconcileLoad,
  recentForAgent,
};
