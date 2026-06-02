'use strict';

// System schedules — built-in HR / automation cycles that run on cron or
// event triggers. Single source of truth for:
//   - Roster nightly recompute (02:00 UTC)
//   - Witness daily sweep (03:00 UTC)
//   - Cadence weekly review (Mon 09:00 UTC)
//   - Tutor weekly training (Sun 02:00 UTC)
//   - Forge monthly capability-gap scan (1st of month 04:00 UTC)
//   - Mira post-build lesson extraction (event-driven, debounced 60s)
//
// All system handlers persist their runs via the stub-then-complete pattern:
//   1. db.insertAgentRunStub(...) creates a 'running' row visible immediately
//      in the drawer + crash-safe (orphan rows reconciled on next boot)
//   2. handler executes
//   3. db.completeAgentRun(runId, {...}) updates the same row to terminal
//      status (success / error / cancelled)
// SSE events fire via agentSync.emitScheduleEvent at start + terminal state.

const { randomUUID } = require('crypto');
const cron = require('node-cron');
const { CronExpressionParser } = require('cron-parser');

const db = require('../db');
const agentSync = require('./agentSync');
const { runClaudeSync, buildAgentPrompt, validateAgentExists } = require('./runClaude');

// ── Definitions ────────────────────────────────────────────────────────────

const DEFINITIONS = [
  {
    id: 'sys-roster',
    name: 'Roster nightly recompute',
    description: 'Refresh per-agent experience profiles + skill vectors.',
    cron: '0 2 * * *',
    agentName: 'roster',
    handler: 'rosterRecompute',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-witness',
    name: 'Witness daily sweep',
    description: 'Classify last 24h agent runs, flag PIP/promotion candidates.',
    cron: '0 3 * * *',
    agentName: 'witness',
    handler: 'witnessSweep',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-cadence',
    name: 'Cadence weekly review',
    description: 'Apply promotions, open PIPs, run weekly org health review.',
    cron: '0 9 * * 1',
    agentName: 'cadence',
    handler: 'cadenceReview',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-tutor',
    name: 'Tutor weekly training',
    description: 'Read last 7d training signals, apply training patches.',
    cron: '0 2 * * 0',
    agentName: 'tutor',
    handler: 'tutorTraining',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.30 },
  },
  {
    id: 'sys-forge',
    name: 'Forge monthly gap scan',
    description: 'Detect capability gaps, draft new agent templates.',
    cron: '0 4 1 * *',
    agentName: 'forge',
    handler: 'forgeGapScan',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.50 },
  },
  {
    id: 'sys-mira',
    name: 'Mira lesson extraction',
    description: 'Extract lessons after successful build runs (event-driven, 60s debounce).',
    cron: null,
    trigger: 'event:agent_run.build.success',
    agentName: 'mira',
    handler: 'miraExtract',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.02, highUsd: 0.20 },
  },
];

const DEFAULT_ENABLED = true;
const HANDLER_TIMEOUT_MS = 5 * 60 * 1000;
const MIRA_DEBOUNCE_MS = 60 * 1000;

// In-memory state
const activeJobs = new Map();      // id → cron job
// inflight: Map<scheduleId, { runId, startedAt, child? }>
const inflight = new Map();
let injectedDeps = null;            // { org, experience, hr, loadRecentAgentRuns }
let miraDebounceTimer = null;
let miraQueuedBuildIds = [];

// ── Public lookup ──────────────────────────────────────────────────────────

function getDefinitions() {
  return DEFINITIONS.slice();
}

function findDefinition(id) {
  return DEFINITIONS.find(d => d.id === id) || null;
}

function isEnabled(id) {
  const override = db.getSystemOverride(id);
  if (override) return !!override.enabled;
  return DEFAULT_ENABLED;
}

// Same shape as user `Schedule` rows so the frontend can render them in the
// same list. `kind:'system'`, plus `nextRunAt` computed via cron-parser, plus
// `builtin:true` flag so UI hides edit/delete affordances.
function getAllForApi() {
  return DEFINITIONS.map(def => {
    const override = db.getSystemOverride(def.id);
    const enabled = override ? !!override.enabled : DEFAULT_ENABLED;
    // Last run is the most recent agent_runs row with this systemId.
    const recent = db.getScheduleRunsFor(def.id, { limit: 1 });
    const last = recent[0] || null;
    return {
      id: def.id,
      kind: 'system',
      builtin: true,
      name: def.name,
      description: def.description,
      agentName: def.agentName,
      prompt: def.description,
      cron: def.cron,
      trigger: def.trigger || null,
      enabled,
      lastRunAt: last?.timestamp || null,
      lastRunStatus: last?.status || null,
      nextRunAt: enabled ? computeNextRunAt(def.cron) : null,
      createdAt: null,
      updatedAt: override?.updatedAt || null,
      needsLlm: !!def.needsLlm,
      cancellable: !!def.cancellable,
      costEstimate: def.costEstimate || null,
    };
  });
}

function setEnabled(id, enabled) {
  const def = findDefinition(id);
  if (!def) throw new Error(`Unknown system schedule: ${id}`);
  const result = db.upsertSystemOverride(id, !!enabled);
  // Restart job in place — start or stop based on new state.
  startJob(def);
  agentSync.emitScheduleEvent('upsert', { id, kind: 'system' });
  return result;
}

// ── Cron next-run helper ───────────────────────────────────────────────────

function computeNextRunAt(cronExpr) {
  if (!cronExpr) return null;
  try {
    const it = CronExpressionParser.parse(cronExpr, { tz: 'Etc/UTC' });
    return it.next().toDate().toISOString();
  } catch {
    return null;
  }
}

// ── Inflight introspection ─────────────────────────────────────────────────

function getInflight() {
  const out = [];
  for (const [id, state] of inflight.entries()) {
    const def = findDefinition(id);
    out.push({
      id,
      kind: 'system',
      runId: state.runId,
      startedAt: state.startedAt,
      agentName: def?.agentName || null,
    });
  }
  return out;
}

function cancelInflight(id) {
  const state = inflight.get(id);
  if (!state) return { ok: false, reason: 'not_running' };
  const def = findDefinition(id);
  if (def && !def.cancellable) return { ok: false, reason: 'not_cancellable' };
  if (state.child && typeof state.child._polyglotCancel === 'function') {
    state.child._polyglotCancel();
    return { ok: true, runId: state.runId };
  }
  return { ok: false, reason: 'no_subprocess' };
}

// ── Handlers ───────────────────────────────────────────────────────────────

const HANDLERS = {
  async rosterRecompute() {
    const { org, experience } = requireDeps();
    const summary = experience.recomputeAllExperience(org);
    return {
      output: `Roster recompute: ${summary.updated}/${summary.total} agents refreshed`,
      metadata: { summary },
    };
  },

  async witnessSweep() {
    const { org, experience, hr, loadRecentAgentRuns } = requireDeps();
    const recent = loadRecentAgentRuns(24);
    const result = hr.runWitnessSweep(org, experience, recent);

    let escalationsAdvanced = 0;
    try {
      const escalation = require('./escalation');
      const advanced = escalation.autoAdvanceExpired();
      escalationsAdvanced = advanced.length;
    } catch (err) {
      console.warn(`[systemSchedules] escalation sweep failed: ${err.message}`);
    }

    try {
      const tasks = require('./tasks');
      tasks.reconcileLoad();
    } catch (err) {
      console.warn(`[systemSchedules] task reconcile failed: ${err.message}`);
    }

    return {
      output: `Witness sweep: ${result.runsClassified} runs, ${result.pipCandidates.length} PIP, ${result.promotionCandidates.length} promo, ${escalationsAdvanced} escalations advanced`,
      metadata: { sweep: result, escalationsAdvanced },
    };
  },

  async cadenceReview() {
    const { org, experience, hr, loadRecentAgentRuns } = requireDeps();
    const recent = loadRecentAgentRuns(24 * 7);
    const review = hr.runCadenceReview(org, experience, recent);
    return {
      output: `Cadence weekly review ${review.week}: ${review.promotions.length} promotions, ${review.pipsOpened.length} PIPs`,
      metadata: { review },
    };
  },

  async tutorTraining(def, ctx) {
    if (!validateAgentExists('tutor')) {
      throw new Error('tutor agent .md not found in ~/.claude/agents/');
    }
    const task = [
      'Run the weekly training batch.',
      '1. Read training_signals + training_queue from the last 7 days via the SQLite db (data/polyglot.db).',
      '2. For each signal/queue item, draft a training patch (no edits yet — produce the patch text).',
      '3. Output: a numbered list of (agent, weakness, patch summary, priority).',
      'Keep output ≤ 80 lines. Skip empty queues with a single line.',
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const output = await runClaudeSync(prompt, HANDLER_TIMEOUT_MS, {
      onProc: (child) => ctx?.registerProc?.(child),
    });
    return { output, metadata: { llm: true } };
  },

  async forgeGapScan(def, ctx) {
    let gapsCount = 0;
    try {
      const recent = db.getRecentGaps?.(30) || [];
      gapsCount = Array.isArray(recent) ? recent.length : 0;
    } catch {}

    if (!validateAgentExists('forge')) {
      throw new Error('forge agent .md not found in ~/.claude/agents/');
    }

    const task = [
      'Run the monthly capability-gap scan.',
      '1. Survey the last 30 days of dispatch failures + escalations from agent_runs.',
      '2. Identify any role / skill cluster with no qualified agent.',
      '3. For each gap: name the role, skills required, and propose a new agent template (1-paragraph spec).',
      'If no gaps detected, output exactly: "NO_GAPS_DETECTED"',
      `Recent gap-log size: ${gapsCount} entries.`,
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const output = await runClaudeSync(prompt, HANDLER_TIMEOUT_MS, {
      onProc: (child) => ctx?.registerProc?.(child),
    });
    return { output, metadata: { llm: true, gapsCount } };
  },

  async miraExtract(def, ctx) {
    const buildIds = ctx?.buildIds || [];
    if (!validateAgentExists('mira')) {
      throw new Error('mira agent .md not found in ~/.claude/agents/');
    }
    const task = [
      'Extract lessons from the recent successful builds.',
      `Build run IDs (last 60s window): ${buildIds.slice(0, 25).join(', ') || '(none — full sweep)'}`,
      '1. For each build, identify reusable patterns + antipatterns + project decisions.',
      '2. Append concise entries (≤6 lines each) to ~/.claude/memory/patterns/good/ and ~/.claude/memory/patterns/avoid/ as appropriate.',
      '3. Update MEMORY.md index entries if new files were added.',
      'Output: short summary of what was extracted (≤30 lines).',
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const output = await runClaudeSync(prompt, HANDLER_TIMEOUT_MS, {
      onProc: (child) => ctx?.registerProc?.(child),
    });
    return { output, metadata: { llm: true, buildIds } };
  },
};

function requireDeps() {
  if (!injectedDeps) {
    throw new Error('systemSchedules.bootAll(deps) must run before handler dispatch');
  }
  return injectedDeps;
}

// ── Dispatch ───────────────────────────────────────────────────────────────

// Run a system handler. Inserts stub row → emits start → invokes handler →
// completes row → emits terminal SSE. Returns the inflight descriptor
// immediately if caller passes `{ async: true }` — promise resolves to the
// final run record otherwise.
async function runHandler(id, opts = {}) {
  const def = findDefinition(id);
  if (!def) throw new Error(`Unknown system schedule: ${id}`);

  if (inflight.has(id)) {
    return { skipped: true, reason: 'inflight', runId: inflight.get(id).runId };
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Stub row visible immediately — crash-safe.
  try {
    db.insertAgentRunStub({
      id: runId,
      agentName: def.agentName || 'system',
      prompt: def.description || '',
      source: 'system-schedule',
      metadata: { systemId: def.id, handler: def.handler },
    });
  } catch (err) {
    console.error('[systemSchedules] stub insert failed:', err.message);
    throw err;
  }

  const ctx = {
    runId,
    buildIds: opts.buildIds,
    registerProc: (child) => {
      const state = inflight.get(id);
      if (state) state.child = child;
    },
  };

  inflight.set(id, { runId, startedAt, child: null });
  agentSync.emitScheduleEvent('start', {
    id, kind: 'system', name: def.name, agentName: def.agentName,
    startedAt, runId,
  });

  const finish = (status, result = {}) => {
    const duration = Date.now() - startTime;
    try {
      db.completeAgentRun(runId, {
        status,
        duration,
        output: result.output || '',
        error: result.error || null,
        metadataPatch: result.metadata || {},
      });
    } catch (err) {
      console.error('[systemSchedules] completeAgentRun failed:', err.message);
    }
    const evt = status === 'success' ? 'complete' : status === 'cancelled' ? 'cancelled' : 'error';
    agentSync.emitScheduleEvent(evt, {
      id, kind: 'system', status, runId,
      lastRunAt: startedAt, duration, error: result.error,
    });
    inflight.delete(id);
    return { ok: status === 'success', runId, status, duration, output: result.output, error: result.error };
  };

  // Fire-and-forget wrapper used when caller wants async (the run-now route
  // returns 202 immediately while this resolves in background).
  const exec = async () => {
    try {
      const handler = HANDLERS[def.handler];
      if (!handler) throw new Error(`Handler not implemented: ${def.handler}`);
      const result = await handler(def, ctx);
      console.log(`[systemSchedule] ${def.id} ✓ — ${result?.output?.split('\n')[0] || ''}`);
      return finish('success', { output: result?.output, metadata: result?.metadata });
    } catch (err) {
      const status = err.cancelled ? 'cancelled' : 'error';
      console.warn(`[systemSchedule] ${def.id} ${status === 'cancelled' ? '⊘' : '✗'} — ${err.message}`);
      return finish(status, { error: err.message, metadata: { trace: (err.stack || '').slice(0, 500) } });
    }
  };

  if (opts.async) {
    setImmediate(() => { exec().catch(e => console.warn(`[systemSchedule] ${id} unhandled: ${e.message}`)); });
    return { ok: true, runId, status: 'started', kind: 'system' };
  }

  return exec();
}

function startJob(def) {
  if (activeJobs.has(def.id)) {
    try { activeJobs.get(def.id).stop(); } catch {}
    activeJobs.delete(def.id);
  }
  if (!isEnabled(def.id)) return;
  if (!def.cron) return;
  if (!cron.validate(def.cron)) {
    console.warn(`[systemSchedule] invalid cron — skipping: ${def.id} "${def.cron}"`);
    return;
  }
  const job = cron.schedule(def.cron, () => {
    runHandler(def.id, { async: false }).catch(err =>
      console.warn(`[systemSchedule] ${def.id} unhandled: ${err.message}`)
    );
  }, { timezone: 'Etc/UTC' });
  activeJobs.set(def.id, job);
}

// ── Event-driven Mira trigger ──────────────────────────────────────────────

function onBuildSuccessEvent(payload) {
  if (!payload) return;
  if (payload.source !== 'build') return;
  if (payload.status !== 'success') return;
  if (!isEnabled('sys-mira')) return;

  if (payload.runId) miraQueuedBuildIds.push(payload.runId);
  if (miraDebounceTimer) clearTimeout(miraDebounceTimer);
  miraDebounceTimer = setTimeout(() => {
    const ids = miraQueuedBuildIds.slice();
    miraQueuedBuildIds = [];
    miraDebounceTimer = null;
    runHandler('sys-mira', { buildIds: ids, async: true }).catch(err =>
      console.warn(`[systemSchedule] sys-mira unhandled: ${err.message}`)
    );
  }, MIRA_DEBOUNCE_MS);
}

// ── Boot / shutdown ────────────────────────────────────────────────────────

function bootAll(deps = {}) {
  injectedDeps = deps;
  let active = 0;
  let disabled = 0;
  for (const def of DEFINITIONS) {
    if (def.cron) {
      if (isEnabled(def.id) && cron.validate(def.cron)) {
        startJob(def);
        active += 1;
      } else if (!isEnabled(def.id)) {
        disabled += 1;
      }
    }
  }
  agentSync.events.on('agent_run.recorded', onBuildSuccessEvent);

  // Log retention — 03:15 UTC nightly. Plain DB op, no LLM, no agent_runs stub.
  startLogRetentionJob();

  console.log(`  System schedules: ${active} cron-driven active, ${disabled} disabled, sys-mira event-listener wired, log-retention nightly`);
}

let _logRetentionJob = null;
function startLogRetentionJob() {
  if (_logRetentionJob) { try { _logRetentionJob.stop(); } catch {} }
  _logRetentionJob = cron.schedule('15 3 * * *', () => {
    try {
      const r = db.pruneErrorLog({ resolvedDays: 7, allDays: 30 });
      const log = require('./logger');
      log.info('log retention pruned', { category: 'schedule', meta: r });
    } catch (err) {
      const log = require('./logger');
      log.error(err, { category: 'schedule', meta: { handler: 'logRetention' } });
    }
  }, { timezone: 'Etc/UTC' });
}

function stopAll() {
  for (const [id, job] of activeJobs.entries()) {
    try { job.stop(); } catch {}
    activeJobs.delete(id);
  }
  if (miraDebounceTimer) {
    clearTimeout(miraDebounceTimer);
    miraDebounceTimer = null;
  }
  if (_logRetentionJob) { try { _logRetentionJob.stop(); } catch {} _logRetentionJob = null; }
  try { agentSync.events.off('agent_run.recorded', onBuildSuccessEvent); } catch {}
}

module.exports = {
  bootAll,
  stopAll,
  runHandler,
  setEnabled,
  isEnabled,
  getAllForApi,
  getDefinitions,
  findDefinition,
  computeNextRunAt,
  getInflight,
  cancelInflight,
  _activeJobs: activeJobs,
  _inflight: inflight,
};
