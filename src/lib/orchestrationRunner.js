'use strict';

// Polyglot Orchestration Runtime — Phase B.
//
// Persistent, resumable workflow runs on top of the existing in-memory
// `executeNode` flow in src/routes/orchestrations.js. Each run materializes
// orchestration_runs + per-node orchestration_steps rows so:
//
//   - state survives server restart
//   - failed steps are retryable individually
//   - approval gates can pause + resume across processes
//   - the UI can replay any past run from the DB
//
// Every state transition emits a typed event on agentSync.events so SSE
// clients (Orchestration page run panel, future cross-app dashboard)
// pick them up live with no extra wiring.

const { events } = require('./agentSync');
const db = require('../db');

const VALID_RUN_STATUS = new Set(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']);
const VALID_STEP_STATUS = new Set([
  'pending', 'running', 'completed', 'failed', 'skipped', 'paused', 'approved', 'rejected',
]);

let runCounter = 0;
let stepCounter = 0;
function newRunId() {
  runCounter += 1;
  return `run-${Date.now()}-${runCounter}-${Math.random().toString(36).slice(2, 7)}`;
}
function newStepId() {
  stepCounter += 1;
  return `step-${Date.now()}-${stepCounter}-${Math.random().toString(36).slice(2, 7)}`;
}
function nowIso() { return new Date().toISOString(); }
function getDb() { return db.getDb(); }
function safeJsonParse(s, fallback) { try { return JSON.parse(s || '{}'); } catch { return fallback; } }

// ── Lifecycle ──────────────────────────────────────────────────────────────

// Create a new run from a saved orchestration. Walks the nodes array,
// inserts an orchestration_runs row + an orchestration_steps row per node
// (status='pending'). Returns the run with its steps.
function createRun({ orchestrationId, orchestrationName, task, nodes, createdBy = 'system', metadata = {} }) {
  if (!orchestrationId) throw new Error('createRun requires orchestrationId');
  if (!task) throw new Error('createRun requires task');
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error('createRun requires non-empty nodes array');

  const id = newRunId();
  const now = nowIso();
  const d = getDb();

  d.transaction(() => {
    d.prepare(`
      INSERT INTO orchestration_runs
      (id, orchestrationId, orchestrationName, task, status, currentNodeId, startedAt, createdBy, metadata)
      VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?, ?)
    `).run(id, orchestrationId, orchestrationName || null, task, now, createdBy, JSON.stringify(metadata || {}));

    const stepStmt = d.prepare(`
      INSERT INTO orchestration_steps
      (id, runId, nodeId, stepIndex, agentName, status, metadata)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `);

    nodes.forEach((node, idx) => {
      stepStmt.run(
        newStepId(),
        id,
        node.id,
        idx,
        node.data?.agentName || null,
        JSON.stringify({
          label: node.data?.label || null,
          isStart: !!node.data?.isStart,
          isApproval: !!node.data?.isApproval,
          retryCount: node.data?.retryCount || 0,
          fallbackAgent: node.data?.fallbackAgent || null,
          timeoutMinutes: node.data?.timeoutMinutes || 60,
          instructions: node.data?.instructions || '',
        }),
      );
    });
  })();

  const run = getRun(id);
  events.emit('run:created', run);
  return run;
}

// Read run + ordered steps. Used by polling clients and SSE handshake.
function getRun(runId) {
  const d = getDb();
  const run = d.prepare('SELECT * FROM orchestration_runs WHERE id = ?').get(runId);
  if (!run) return null;
  const steps = d.prepare(`
    SELECT * FROM orchestration_steps
    WHERE runId = ?
    ORDER BY stepIndex ASC
  `).all(runId);
  return {
    ...run,
    metadata: safeJsonParse(run.metadata, {}),
    steps: steps.map((s) => ({ ...s, metadata: safeJsonParse(s.metadata, {}) })),
  };
}

function listRuns({ orchestrationId, status, limit = 50 } = {}) {
  let sql = 'SELECT * FROM orchestration_runs';
  const where = [];
  const args = [];
  if (orchestrationId) { where.push('orchestrationId = ?'); args.push(orchestrationId); }
  if (status) { where.push('status = ?'); args.push(status); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY startedAt DESC LIMIT ?';
  args.push(limit);
  return getDb().prepare(sql).all(...args).map((r) => ({ ...r, metadata: safeJsonParse(r.metadata, {}) }));
}

// ── Run-level transitions ─────────────────────────────────────────────────

function markRunRunning(runId, currentNodeId = null) {
  return updateRunStatus(runId, 'running', { currentNodeId });
}
function markRunPaused(runId, currentNodeId) {
  return updateRunStatus(runId, 'paused', { currentNodeId });
}
function markRunCompleted(runId, finalOutput) {
  return updateRunStatus(runId, 'completed', { finalOutput });
}
function markRunFailed(runId, error) {
  return updateRunStatus(runId, 'failed', { error });
}
function markRunCancelled(runId, reason = 'cancelled') {
  return updateRunStatus(runId, 'cancelled', { error: reason });
}

function updateRunStatus(runId, status, fields = {}) {
  if (!VALID_RUN_STATUS.has(status)) throw new Error(`invalid run status "${status}"`);
  const run = getRun(runId);
  if (!run) throw new Error(`run ${runId} not found`);
  if (['completed', 'failed', 'cancelled'].includes(run.status)) return run;

  const now = nowIso();
  const sets = ['status = ?'];
  const args = [status];

  if (fields.currentNodeId !== undefined) {
    sets.push('currentNodeId = ?');
    args.push(fields.currentNodeId);
  }
  if (fields.finalOutput !== undefined) {
    sets.push('finalOutput = ?');
    args.push(fields.finalOutput);
  }
  if (fields.error !== undefined) {
    sets.push('error = ?');
    args.push(fields.error);
  }
  if (status === 'running' && !run.startedAt) {
    sets.push('startedAt = ?');
    args.push(now);
  }
  if (['completed', 'failed', 'cancelled'].includes(status)) {
    sets.push('completedAt = ?');
    args.push(now);
    if (run.startedAt) {
      sets.push('duration = ?');
      args.push(Date.parse(now) - Date.parse(run.startedAt));
    }
  }
  args.push(runId);

  getDb().prepare(`UPDATE orchestration_runs SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  const updated = getRun(runId);

  // Mirror terminal runs into the legacy run_history table so the Studio
  // "History" tab (which reads run_history) shows runs the durable executor
  // just produced. Without this the two tables are disjoint and a user can't
  // see the run they just launched. Telemetry-only — never block the transition.
  if (['completed', 'failed', 'cancelled'].includes(status)) {
    try { mirrorToRunHistory(updated); } catch (err) {
      console.error(`[orchestrationRunner] run_history mirror failed for ${runId}: ${err.message}`);
    }
  }

  events.emit(`run:${status}`, updated);
  return updated;
}

// After a single failed step is retried and SUCCEEDS, check whether the run can
// now be promoted 'failed' → 'completed'. updateRunStatus's terminal guard
// (line above: `if ([...].includes(run.status)) return run`) exists to stop an
// accidental/racy re-transition — e.g. a stale async callback re-completing an
// already-cancelled run — but it also blocks this legitimate case, so this is a
// deliberate, narrow bypass rather than a general relaxation. Only promotes a
// 'failed' run (never 'cancelled' — a human deliberately stopped that one, and
// a silent flip to 'completed' would misrepresent their action) when every step
// is now in a terminal-success state. No-ops (returns null) if the run isn't
// 'failed' or another step is still failed/pending — the caller does nothing
// further in that case, same as any other retry that didn't fully clear the run.
function reevaluateRunAfterRetry(runId) {
  const run = getRun(runId);
  if (!run || run.status !== 'failed') return null;
  const steps = run.steps || [];
  const allClear = steps.length > 0 && steps.every((s) => ['completed', 'skipped', 'approved'].includes(s.status));
  if (!allClear) return null;

  const now = nowIso();
  const lastOutput = [...steps].reverse().find((s) => s.output != null)?.output ?? run.finalOutput ?? null;
  const sets = ["status = 'completed'", 'completedAt = ?', 'finalOutput = ?', 'error = NULL'];
  const args = [now, lastOutput];
  if (run.startedAt) { sets.push('duration = ?'); args.push(Date.parse(now) - Date.parse(run.startedAt)); }
  args.push(runId);
  getDb().prepare(`UPDATE orchestration_runs SET ${sets.join(', ')} WHERE id = ?`).run(...args);

  const updated = getRun(runId);
  try { mirrorToRunHistory(updated); } catch (err) {
    console.error(`[orchestrationRunner] run_history mirror failed for ${runId} (post-retry promotion): ${err.message}`);
  }
  events.emit('run:completed', updated);
  return updated;
}

// Project a durable run (+ its steps) into the run_history row shape the Studio
// History tab expects. Edges aren't tracked at the step level, so the replay
// graph shows nodes + per-step logs without connectors (acceptable for history).
function mirrorToRunHistory(run) {
  const steps = run.steps || [];
  const nodeOutputs = {};
  const logs = [];
  const nodes = steps.map((s) => {
    const m = s.metadata || {};
    if (s.output != null) nodeOutputs[s.nodeId] = s.output;
    logs.push({
      nodeId: s.nodeId,
      label: m.label || null,
      type: s.status,
      output: s.output || undefined,
      error: s.error || undefined,
    });
    return { id: s.nodeId, label: m.label || s.nodeId, agentName: s.agentName || undefined, isStart: !!m.isStart, isCustom: false };
  });
  db.insertRunHistory({
    id: run.id,
    orchestrationName: run.orchestrationName || 'Untitled',
    orchestrationId: run.orchestrationId || null,
    task: run.task,
    status: run.status,
    nodeCount: steps.length,
    nodes,
    edges: [],
    logs,
    nodeOutputs,
    finalOutput: run.finalOutput || null,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    duration: run.duration || 0,
  });
}

// ── Step-level transitions ────────────────────────────────────────────────

function markStepRunning(runId, nodeId, taskId = null) {
  return updateStepStatus(runId, nodeId, 'running', { taskId, startedAt: nowIso() });
}
function markStepCompleted(runId, nodeId, output) {
  return updateStepStatus(runId, nodeId, 'completed', { output, completedAt: nowIso() });
}
function markStepFailed(runId, nodeId, error) {
  return updateStepStatus(runId, nodeId, 'failed', { error, completedAt: nowIso() });
}
function markStepSkipped(runId, nodeId) {
  return updateStepStatus(runId, nodeId, 'skipped', { completedAt: nowIso() });
}
function markStepPaused(runId, nodeId) {
  return updateStepStatus(runId, nodeId, 'paused', {});
}

function updateStepStatus(runId, nodeId, status, fields = {}) {
  if (!VALID_STEP_STATUS.has(status)) throw new Error(`invalid step status "${status}"`);
  const d = getDb();
  const step = d.prepare('SELECT * FROM orchestration_steps WHERE runId = ? AND nodeId = ?').get(runId, nodeId);
  if (!step) throw new Error(`step (run=${runId}, node=${nodeId}) not found`);

  const sets = ['status = ?'];
  const args = [status];

  if (fields.taskId !== undefined) {
    sets.push('taskId = ?');
    args.push(fields.taskId);
  }
  if (fields.output !== undefined) {
    sets.push('output = ?');
    args.push(fields.output);
  }
  if (fields.error !== undefined) {
    sets.push('error = ?');
    args.push(fields.error);
  }
  if (fields.startedAt) {
    sets.push('startedAt = ?');
    args.push(fields.startedAt);
  }
  if (fields.completedAt) {
    sets.push('completedAt = ?');
    args.push(fields.completedAt);
    if (step.startedAt) {
      sets.push('duration = ?');
      args.push(Date.parse(fields.completedAt) - Date.parse(step.startedAt));
    }
  }
  args.push(runId, nodeId);

  d.prepare(`UPDATE orchestration_steps SET ${sets.join(', ')} WHERE runId = ? AND nodeId = ?`).run(...args);

  const updated = d.prepare('SELECT * FROM orchestration_steps WHERE runId = ? AND nodeId = ?').get(runId, nodeId);
  const event = { ...updated, metadata: safeJsonParse(updated.metadata, {}) };
  events.emit(`step:${status}`, event);
  events.emit('step:any', event);
  return event;
}

// Increment retryCount on a step + reset its status to 'pending' so the
// runner can pick it up again.
function retryStep(runId, nodeId) {
  const d = getDb();
  const step = d.prepare('SELECT * FROM orchestration_steps WHERE runId = ? AND nodeId = ?').get(runId, nodeId);
  if (!step) throw new Error(`step (run=${runId}, node=${nodeId}) not found`);
  d.prepare(`
    UPDATE orchestration_steps
    SET status = 'pending',
        error = NULL,
        startedAt = NULL,
        completedAt = NULL,
        duration = 0,
        retryCount = COALESCE(retryCount, 0) + 1
    WHERE runId = ? AND nodeId = ?
  `).run(runId, nodeId);
  const updated = d.prepare('SELECT * FROM orchestration_steps WHERE runId = ? AND nodeId = ?').get(runId, nodeId);
  events.emit('step:retried', { ...updated, metadata: safeJsonParse(updated.metadata, {}) });
  return updated;
}

// Prepare a stale in-flight run for durable RESUME (Pillar 4). Resets any step
// left 'running' (interrupted by the crash) back to 'pending' so the resume-aware
// executor re-runs only it, and bumps metadata.resumeCount as a re-drive budget.
// Completed/skipped steps are left intact (the executor skips them = idempotent).
// Returns the new resumeCount so the caller can cap re-drives.
function prepareResume(runId) {
  const d = getDb();
  const run = d.prepare('SELECT * FROM orchestration_runs WHERE id = ?').get(runId);
  if (!run) throw new Error(`run ${runId} not found`);
  // Never resurrect a terminal run (guards against a race with cancel/complete).
  if (['completed', 'failed', 'cancelled'].includes(run.status)) {
    return safeJsonParse(run.metadata, {}).resumeCount || 0;
  }
  const meta = safeJsonParse(run.metadata, {});
  meta.resumeCount = (meta.resumeCount || 0) + 1;
  d.transaction(() => {
    d.prepare(`
      UPDATE orchestration_steps
      SET status = 'pending', error = NULL, startedAt = NULL, completedAt = NULL, duration = 0
      WHERE runId = ? AND status = 'running'
    `).run(runId);
    d.prepare(`UPDATE orchestration_runs SET status = 'running', error = NULL, metadata = ? WHERE id = ?`)
      .run(JSON.stringify(meta), runId);
  })();
  return meta.resumeCount;
}

// Approve / reject a paused approval-gate step. Approving moves status →
// 'approved' so the runner advances. Rejecting → 'rejected' which terminates
// the run with status='cancelled'.
function advanceStep(runId, nodeId, approved, reason = null) {
  const status = approved ? 'approved' : 'rejected';
  const updated = updateStepStatus(runId, nodeId, status, {
    completedAt: nowIso(),
    output: reason || (approved ? 'approved' : 'rejected'),
  });
  if (!approved) markRunCancelled(runId, reason || 'rejected at approval gate');
  return updated;
}

// ── Boot recovery ────────────────────────────────────────────────────────
//
// When the server restarts, any orchestration_runs row in 'running' or
// 'paused' state is now stale (no in-process executor owns it). Mark them
// 'failed' on boot so callers can inspect / retry. Approval-paused runs
// are preserved (durable across restarts by design).

function recoverInflightRuns() {
  const d = getDb();
  const stale = d.prepare(`SELECT id FROM orchestration_runs WHERE status = 'running'`).all();
  for (const { id } of stale) {
    try {
      updateRunStatus(id, 'failed', { error: 'server restart while in-flight; mark failed for retry' });
      // Cascade: any 'running' step inside also marked failed
      d.prepare(`
        UPDATE orchestration_steps
        SET status = 'failed',
            error = 'server restart while in-flight',
            completedAt = ?
        WHERE runId = ? AND status = 'running'
      `).run(nowIso(), id);
    } catch (err) {
      try { require('./logger').error(err, { category: 'orchestration', meta: { runId: id, phase: 'recovery' } }); }
      catch { console.error(`[orchestrationRunner] recovery failed for run ${id}: ${err.message}`); }
    }
  }
  if (stale.length > 0) {
    console.log(`[orchestrationRunner] recovered ${stale.length} stale in-flight run(s) → marked failed`);
  }
  return stale.length;
}

module.exports = {
  // Lifecycle
  createRun,
  getRun,
  listRuns,
  // Run transitions
  markRunRunning,
  markRunPaused,
  markRunCompleted,
  markRunFailed,
  markRunCancelled,
  // Step transitions
  markStepRunning,
  markStepCompleted,
  markStepFailed,
  markStepSkipped,
  markStepPaused,
  retryStep,
  prepareResume,
  advanceStep,
  reevaluateRunAfterRetry,
  // Boot recovery
  recoverInflightRuns,
};
