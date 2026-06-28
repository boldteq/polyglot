'use strict';

const { randomUUID } = require('crypto');
const { Router } = require('express');
const cron = require('node-cron');

const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');
const agentSync = require('../lib/agentSync');
const systemSchedules = require('../lib/systemSchedules');
const { runClaudeSync, buildAgentPrompt, validateAgentExists } = require('../lib/runClaude');
const { computeNextRunAt, computeNextRuns } = require('../lib/cronUtil');

const router = Router();

const activeJobs = new Map();
// inflightJobs: Map<scheduleId, { runId, startedAt, child? }>
const inflightJobs = new Map();
const retryTimers = new Map();
const RUN_TIMEOUT_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;
// C1: input bounds (kept in sync with ScheduleForm maxLength).
const NAME_MAX = 200;
const PROMPT_MAX = 20000;
// F3: auto-pause a schedule after this many consecutive failed runs.
const FAILURE_PAUSE_THRESHOLD = 5;

// MIRRORED by client/src/hooks/useCronPresets.ts FALLBACK_PRESETS (offline
// fallback). This route is the source of truth — update both on change.
const CRON_PRESETS = [
  { label: 'Every minute',         value: '* * * * *' },
  { label: 'Every 5 minutes',      value: '*/5 * * * *' },
  { label: 'Every hour',           value: '0 * * * *' },
  { label: 'Every day at 9am UTC', value: '0 9 * * *' },
  { label: 'Every Monday 9am UTC', value: '0 9 * * 1' },
  { label: 'Every Sunday 2am UTC', value: '0 2 * * 0' },
  { label: 'Every 1st of month',   value: '0 9 1 * *' },
];

function genId() { return randomUUID(); }

function decorateForApi(s) {
  if (!s) return s;
  return {
    ...s,
    kind: 'user',
    builtin: false,
    nextRunAt: s.enabled ? computeNextRunAt(s.cron) : null,
    // User schedules always invoke claude CLI → always LLM cost.
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.50 },
  };
}

function persistRunStatus(id, status, ts) {
  try { db.updateScheduleRunStatus(id, ts || new Date().toISOString(), status); }
  catch (err) {
    console.error('[schedule] failed to persist run status:', err.message);
    try {
      db.insertErrorLog({
        source: 'schedule',
        message: `Failed to persist run status: ${err.message}`,
        stack: err.stack,
        context: { scheduleId: id, status },
      });
    } catch {}
  }
}

// Synchronous setup: validates schedule, inserts stub row, registers
// inflight state, emits schedule:start. Returns { runId, inflightState,
// fresh } or { skipped:true }. Caller invokes executeTickBody() after.
function prepareTick(schedule, { retryCount = 0 } = {}) {
  if (inflightJobs.has(schedule.id)) {
    return { skipped: true, reason: 'inflight', runId: inflightJobs.get(schedule.id).runId };
  }
  const fresh = db.getScheduleById(schedule.id);
  if (!fresh) return { skipped: true, reason: 'deleted' };

  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  try {
    db.insertAgentRunStub({
      id: runId,
      agentName: fresh.agentName,
      prompt: fresh.prompt,
      source: 'schedule',
      metadata: { scheduleId: fresh.id, retryCount },
    });
  } catch (err) {
    console.error('[schedule] stub insert failed:', err.message);
    return { skipped: true, reason: 'stub_insert_failed', error: err.message };
  }

  const inflightState = { runId, startedAt, child: null, startTime: Date.now() };
  inflightJobs.set(schedule.id, inflightState);

  agentSync.emitScheduleEvent('start', {
    id: fresh.id, kind: 'user', name: fresh.name,
    agentName: fresh.agentName, startedAt, runId, retryCount,
  });
  return { runId, inflightState, fresh, startedAt };
}

// Async body of a tick — invokes the LLM handler and writes the final row.
// Called after prepareTick has set up inflight state + stub row + emitted
// schedule:start. Safe to call directly (run-now async path) or via
// executeTick (cron path).
async function runTickBody(prep, { retryCount = 0 } = {}) {
  const { runId, inflightState, fresh, startedAt } = prep;
  const startTime = inflightState.startTime;

  const finish = (status, { output = '', error = null, metadataPatch = {}, usage = null } = {}) => {
    const duration = Date.now() - startTime;
    const finishedAt = new Date().toISOString();
    try {
      db.completeAgentRun(runId, { status, duration, output, error, metadataPatch, usage });
    } catch (err) {
      console.error('[schedule] completeAgentRun failed:', err.message);
    }
    const runStatus = status === 'success' ? 'success' : status === 'cancelled' ? 'cancelled' : 'error';
    // A4: stamp the schedule row AND the SSE event with the completion time
    // (not startedAt) so the UI's "Last run" matches when the run finished.
    persistRunStatus(fresh.id, runStatus, finishedAt);
    const evt = status === 'success' ? 'complete' : status === 'cancelled' ? 'cancelled' : 'error';
    agentSync.emitScheduleEvent(evt, {
      id: fresh.id, kind: 'user', status, runId,
      lastRunAt: finishedAt, duration, error,
    });
    // A1: the ONLY place inflight clears on completion. runTickBody never binds
    // `schedule` — must use the in-scope `fresh.id` or finish() throws
    // ReferenceError and the schedule is wedged "running" forever.
    inflightJobs.delete(fresh.id);
    return { ok: status === 'success', runId, status, duration, output, error };
  };

  try {
    const prompt = buildAgentPrompt(fresh.agentName, fresh.prompt);
    const res = await runClaudeSync(prompt, RUN_TIMEOUT_MS, {
      onProc: (child) => { inflightState.child = child; },
      captureUsage: true, // Pillar 1: record REAL token cost
    });
    // captureUsage resolves { text, usage }; tolerate a bare string if JSON mode fell back.
    const output = typeof res === 'string' ? res : res.text;
    const usage = typeof res === 'string' ? null : res.usage;
    return finish('success', { output, usage });
  } catch (err) {
    if (err.cancelled) {
      return finish('cancelled', { error: err.message });
    }
    const result = finish('error', { error: err.message });

    // A3: a missing agent file is non-transient — retrying every tick just
    // spams identical errors. Auto-pause so it stops until the user fixes it.
    if (!validateAgentExists(fresh.agentName)) {
      console.warn(`[schedule] ${fresh.id} agent "${fresh.agentName}" missing — auto-pausing`);
      autoPauseSchedule(fresh.id, `agent "${fresh.agentName}" not found`);
      return result;
    }

    // F3: auto-pause after N consecutive failures. Retries (retryCount > 0) are a
    // second attempt within the same cron tick — exclude them so tick+retry counts
    // as 1 failure, not 2 (otherwise a schedule auto-pauses after 3 ticks not 5).
    const recentFails = db.getScheduleRunsFor(fresh.id, { limit: FAILURE_PAUSE_THRESHOLD * 2 });
    let streak = 0;
    for (const r of recentFails) {
      if (r.metadata?.retryCount > 0) continue;
      if (r.status === 'error' || r.status === 'crashed') streak += 1; else break;
      if (streak >= FAILURE_PAUSE_THRESHOLD) break;
    }
    if (streak >= FAILURE_PAUSE_THRESHOLD) {
      console.warn(`[schedule] ${fresh.id} failed ${FAILURE_PAUSE_THRESHOLD}× in a row — auto-pausing`);
      autoPauseSchedule(fresh.id, `failed ${FAILURE_PAUSE_THRESHOLD}× in a row`);
      return result;
    }

    // A2: one delayed retry, but only if the schedule still exists, is still
    // enabled, and isn't already running again. A per-minute cron may re-tick
    // inside the retry window — the inflight check (here + in prepareTick)
    // prevents a double LLM hit, and the row is re-read so a paused/edited
    // schedule isn't retried with stale data.
    if (retryCount === 0 && !retryTimers.has(fresh.id)) {
      console.warn(`[schedule] ${fresh.id} failed — scheduling ${RETRY_DELAY_MS / 1000}s retry`);
      const timer = setTimeout(() => {
        retryTimers.delete(fresh.id);
        const current = db.getScheduleById(fresh.id);
        if (!current || !current.enabled || inflightJobs.has(fresh.id)) return;
        executeTick(current, { retryCount: 1 }).catch(e =>
          console.warn(`[schedule] retry tick unhandled: ${e.message}`)
        );
      }, RETRY_DELAY_MS);
      retryTimers.set(fresh.id, timer);
    }
    return result;
  }
}

// Synchronous wrapper used by the cron callback — prepareTick + runTickBody.
async function executeTick(schedule, opts = {}) {
  const prep = prepareTick(schedule, opts);
  if (prep.skipped) return prep;
  return runTickBody(prep, opts);
}

function startScheduleJob(schedule) {
  if (activeJobs.has(schedule.id)) {
    try { activeJobs.get(schedule.id).stop(); } catch {}
    activeJobs.delete(schedule.id);
  }
  if (!schedule.enabled) return;
  if (!cron.validate(schedule.cron)) {
    console.warn(`[schedule] invalid cron — job not scheduled: id=${schedule.id} name="${schedule.name}" cron="${schedule.cron}"`);
    return;
  }
  const job = cron.schedule(schedule.cron, () => {
    executeTick(schedule).catch(err =>
      console.warn(`[schedule] tick unhandled: ${err.message}`)
    );
  }, { timezone: 'Etc/UTC' });
  activeJobs.set(schedule.id, job);
}

// A3: disable a schedule programmatically (e.g. its agent file vanished), tear
// down its cron job + any pending retry, and notify the UI via an SSE upsert.
function autoPauseSchedule(id, reason) {
  try {
    db.updateScheduleFields(id, { enabled: false, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[schedule] auto-pause persist failed:', err.message);
  }
  if (activeJobs.has(id)) {
    try { activeJobs.get(id).stop(); } catch {}
    activeJobs.delete(id);
  }
  const retry = retryTimers.get(id);
  if (retry) { clearTimeout(retry); retryTimers.delete(id); }
  agentSync.emitScheduleEvent('upsert', { id, kind: 'user', reason: reason || 'auto-paused' });
}

function bootSchedules() {
  try {
    const schedules = db.loadSchedules();
    let active = 0;
    let invalid = 0;
    for (const s of schedules) {
      if (!s.enabled) continue;
      if (!cron.validate(s.cron)) {
        invalid++;
        console.warn(`[schedule] invalid cron at boot — skipping: id=${s.id} name="${s.name}" cron="${s.cron}"`);
        continue;
      }
      startScheduleJob(s);
      active++;
    }
    if (active > 0) console.log(`  Schedules: ${active} user cron job(s) restored`);
    if (invalid > 0) console.warn(`  Schedules: ${invalid} schedule(s) skipped due to invalid cron expressions`);
  } catch (err) {
    console.error('[bootSchedules] failed:', err.message);
    try {
      db.insertErrorLog({
        source: 'schedule',
        message: `bootSchedules failed: ${err.message}`,
        stack: err.stack,
        context: { type: 'boot' },
      });
    } catch {}
  }
}

function stopAllSchedules() {
  for (const [id, job] of activeJobs.entries()) {
    try { job.stop(); } catch {}
    activeJobs.delete(id);
  }
  for (const [id, timer] of retryTimers.entries()) {
    try { clearTimeout(timer); } catch {}
    retryTimers.delete(id);
  }
  // A5: best-effort SIGTERM to in-flight LLM children so they terminate before
  // the process exits, instead of being orphaned and reconciled to 'crashed' on
  // next boot. proc.kill is synchronous, so the signal is delivered before the
  // caller's subsequent process.exit().
  for (const [, state] of inflightJobs.entries()) {
    try { state.child?._polyglotCancel?.(); } catch {}
  }
}

function getUserInflight() {
  const out = [];
  for (const [id, state] of inflightJobs.entries()) {
    out.push({
      id,
      kind: 'user',
      runId: state.runId,
      startedAt: state.startedAt,
    });
  }
  return out;
}

function cancelUserRun(id) {
  const state = inflightJobs.get(id);
  if (!state) return { ok: false, reason: 'not_running' };
  if (state.child && typeof state.child._polyglotCancel === 'function') {
    state.child._polyglotCancel();
    return { ok: true, runId: state.runId };
  }
  return { ok: false, reason: 'no_subprocess' };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

router.get('/schedules', rateLimit('read'), (req, res) => {
  try {
    res.json(db.loadSchedules().map(decorateForApi));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/schedules/system', rateLimit('read'), (req, res) => {
  try {
    res.json(systemSchedules.getAllForApi());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/schedules/presets', rateLimit('read'), (req, res) => {
  res.json({ presets: CRON_PRESETS });
});

// GET /api/schedules/inflight — currently-running runs (user + system).
// Frontend reads on mount to populate 'running' badges that survive page
// reload mid-handler.
router.get('/schedules/inflight', rateLimit('read'), (req, res) => {
  try {
    res.json({
      inflight: [...getUserInflight(), ...systemSchedules.getInflight()],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schedules/activity — global cross-schedule run feed (paginated + filtered).
// Powers the Activity view: every schedule + system-schedule run, newest first, with
// status/duration/error/faults/cost. Filters: status (comma list), kind, scheduleId, since.
router.get('/schedules/activity', rateLimit('read'), (req, res) => {
  try {
    const { status, kind, scheduleId, since, limit, offset, q } = req.query;
    res.json(db.getScheduleActivity({ limit, offset, status, kind, scheduleId, sinceIso: since, q }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/schedules/upcoming — merged upcoming-runs timeline across all ENABLED cron
// schedules (user + system). Event-driven schedules (no cron) are returned separately
// so the UI can label them "event-driven, no fixed time".
router.get('/schedules/upcoming', rateLimit('read'), (req, res) => {
  try {
    const perSchedule = Math.min(Math.max(parseInt(req.query.perSchedule, 10) || 3, 1), 10);
    const max = Math.min(Math.max(parseInt(req.query.count, 10) || 60, 1), 200);
    const users = db.loadSchedules().map(s => ({ id: s.id, name: s.name, agentName: s.agentName, cron: s.cron, enabled: !!s.enabled, kind: 'user' }));
    const systems = systemSchedules.getAllForApi().map(s => ({ id: s.id, name: s.name, agentName: s.agentName, cron: s.cron, trigger: s.trigger, enabled: !!s.enabled, kind: 'system' }));
    const upcoming = [];
    const eventDriven = [];
    for (const s of [...users, ...systems]) {
      if (!s.enabled) continue;
      if (!s.cron) { eventDriven.push({ id: s.id, name: s.name, agentName: s.agentName, kind: s.kind, trigger: s.trigger || 'event' }); continue; }
      for (const fireAt of computeNextRuns(s.cron, perSchedule)) {
        upcoming.push({ id: s.id, name: s.name, agentName: s.agentName, kind: s.kind, cron: s.cron, fireAt });
      }
    }
    upcoming.sort((a, b) => (a.fireAt < b.fireAt ? -1 : a.fireAt > b.fireAt ? 1 : 0));
    res.json({ upcoming: upcoming.slice(0, max), eventDriven });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/schedules/validate-cron', rateLimit('read'), (req, res) => {
  const { cronExpr } = req.body || {};
  if (typeof cronExpr !== 'string') {
    return res.status(400).json({ valid: false, error: 'cronExpr must be a string' });
  }
  const valid = cron.validate(cronExpr);
  res.json({
    valid,
    nextRunAt: valid ? computeNextRunAt(cronExpr) : null,
    error: valid ? null : 'Invalid cron expression',
  });
});

router.post('/schedules', rateLimit('write'), (req, res) => {
  const { name, agentName, prompt, cronExpr, enabled } = req.body || {};
  if (!name || !agentName || !prompt || !cronExpr) {
    return res.status(400).json({ error: 'name, agentName, prompt, cronExpr required' });
  }
  if (typeof name !== 'string' || typeof agentName !== 'string' || typeof prompt !== 'string' || typeof cronExpr !== 'string') {
    return res.status(400).json({ error: 'name, agentName, prompt, cronExpr must be strings' });
  }
  if (!name.trim() || !agentName.trim() || !prompt.trim()) {
    return res.status(400).json({ error: 'name, agentName, prompt cannot be empty' });
  }
  // C1: bound name/prompt — they are persisted, re-sent on every list fetch, and
  // re-embedded into the LLM call on every tick.
  if (name.trim().length > NAME_MAX || agentName.trim().length > NAME_MAX) {
    return res.status(400).json({ error: `name and agentName must be ≤ ${NAME_MAX} characters` });
  }
  if (prompt.trim().length > PROMPT_MAX) {
    return res.status(400).json({ error: `prompt must be ≤ ${PROMPT_MAX} characters` });
  }
  if (!cron.validate(cronExpr)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }
  if (!validateAgentExists(agentName)) {
    return res.status(400).json({ error: `Agent '${agentName}' not found` });
  }

  const now = new Date().toISOString();
  const schedule = {
    id: genId(),
    name: name.trim(),
    agentName: agentName.trim(),
    prompt: prompt.trim(),
    cron: cronExpr,
    enabled: enabled !== false,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    lastRunStatus: null,
  };

  try {
    db.insertSchedule(schedule);
  } catch (err) {
    console.error('[schedules POST] insert failed:', err.message);
    try {
      db.insertErrorLog({
        source: 'schedule',
        message: `Schedule create failed: ${err.message}`,
        stack: err.stack,
        context: { name: schedule.name },
      });
    } catch {}
    return res.status(500).json({ error: 'Failed to persist schedule' });
  }

  if (schedule.enabled) startScheduleJob(schedule);
  agentSync.emitScheduleEvent('upsert', { id: schedule.id, kind: 'user' });
  res.json(decorateForApi(schedule));
});

router.put('/schedules/:id', rateLimit('write'), (req, res) => {
  const id = req.params.id;

  if (id.startsWith('sys-')) {
    const def = systemSchedules.findDefinition(id);
    if (!def) return res.status(404).json({ error: 'System schedule not found' });
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'System schedules only accept { enabled: boolean }' });
    }
    try {
      systemSchedules.setEnabled(id, enabled);
      const row = systemSchedules.getAllForApi().find(s => s.id === id);
      return res.json(row);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const existing = db.getScheduleById(id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const { name, agentName, prompt, cronExpr, enabled } = req.body || {};

  if (cronExpr !== undefined && !cron.validate(cronExpr)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }
  if (agentName !== undefined && !validateAgentExists(agentName)) {
    return res.status(400).json({ error: `Agent '${agentName}' not found` });
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > NAME_MAX)) {
    return res.status(400).json({ error: `name must be 1–${NAME_MAX} characters` });
  }
  if (prompt !== undefined && (typeof prompt !== 'string' || !prompt.trim() || prompt.trim().length > PROMPT_MAX)) {
    return res.status(400).json({ error: `prompt must be 1–${PROMPT_MAX} characters` });
  }

  const fields = { updatedAt: new Date().toISOString() };
  if (name !== undefined) fields.name = name.trim();
  if (agentName !== undefined) fields.agentName = agentName.trim();
  if (prompt !== undefined) fields.prompt = prompt.trim(); // C2: match POST's trim
  if (cronExpr !== undefined) fields.cron = cronExpr;
  if (enabled !== undefined) fields.enabled = enabled;

  try {
    db.updateScheduleFields(id, fields);
  } catch (err) {
    console.error('[schedules PUT] update failed:', err.message);
    try {
      db.insertErrorLog({
        source: 'schedule',
        message: `Schedule update failed: ${err.message}`,
        stack: err.stack,
        context: { id },
      });
    } catch {}
    return res.status(500).json({ error: 'Failed to update schedule' });
  }

  const updated = db.getScheduleById(id);
  if (!updated) return res.status(404).json({ error: 'Schedule not found after update' });

  if (updated.enabled) {
    startScheduleJob(updated);
  } else if (activeJobs.has(id)) {
    try { activeJobs.get(id).stop(); } catch {}
    activeJobs.delete(id);
    const retry = retryTimers.get(id);
    if (retry) { clearTimeout(retry); retryTimers.delete(id); }
  }

  agentSync.emitScheduleEvent('upsert', { id, kind: 'user' });
  res.json(decorateForApi(updated));
});

router.delete('/schedules/:id', rateLimit('write'), (req, res) => {
  const id = req.params.id;
  if (id.startsWith('sys-')) {
    return res.status(400).json({ error: 'System schedules cannot be deleted — disable via PUT { enabled: false } instead' });
  }

  if (activeJobs.has(id)) {
    try { activeJobs.get(id).stop(); } catch {}
    activeJobs.delete(id);
  }
  const retry = retryTimers.get(id);
  if (retry) { clearTimeout(retry); retryTimers.delete(id); }

  try {
    db.deleteScheduleById(id);
  } catch (err) {
    console.error('[schedules DELETE] delete failed:', err.message);
    try {
      db.insertErrorLog({
        source: 'schedule',
        message: `Schedule delete failed: ${err.message}`,
        stack: err.stack,
        context: { id },
      });
    } catch {}
    return res.status(500).json({ error: 'Failed to delete schedule' });
  }

  agentSync.emitScheduleEvent('upsert', { id, kind: 'user', removed: true });
  res.json({ ok: true });
});

router.get('/schedules/:id/runs', rateLimit('read'), (req, res) => {
  const id = req.params.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  try {
    const runs = db.getScheduleRunsFor(id, { limit });
    res.json({ runs });
  } catch (err) {
    console.error('[schedules runs] fetch failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules/:id/run-now — ASYNC. Returns 202 with runId immediately,
// handler runs in background. Frontend tracks completion via SSE
// (schedule:start → schedule:complete | error | cancelled).
router.post('/schedules/:id/run-now', rateLimit('write'), async (req, res) => {
  const id = req.params.id;

  if (id.startsWith('sys-')) {
    try {
      const result = await systemSchedules.runHandler(id, { async: true });
      if (result.skipped) {
        // D1: 200 (not 409) so the client's result.skipped branch shows a
        // friendly "already running" toast instead of a thrown generic error.
        return res.status(200).json({ skipped: true, reason: result.reason || 'inflight', runId: result.runId });
      }
      return res.status(202).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const existing = db.getScheduleById(id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  // prepareTick runs synchronously: inserts stub row, sets inflight state,
  // emits schedule:start. Returns runId so we can respond 202 immediately
  // while runTickBody continues in background.
  const prep = prepareTick(existing);
  if (prep.skipped) {
    if (prep.reason === 'inflight') {
      // D1: 200 skipped (not 409) — see the system-schedule branch above.
      return res.status(200).json({ skipped: true, reason: 'inflight', runId: prep.runId });
    }
    return res.status(500).json({ error: prep.error || prep.reason });
  }

  setImmediate(() => {
    runTickBody(prep).catch(err =>
      console.warn(`[schedule] run-now body unhandled: ${err.message}`)
    );
  });

  res.status(202).json({ ok: true, status: 'started', kind: 'user', runId: prep.runId });
});

// POST /api/schedules/:id/cancel — kill a running handler. LLM handlers only;
// pure-JS handlers (Roster/Witness/Cadence) finish too fast to cancel.
router.post('/schedules/:id/cancel', rateLimit('write'), (req, res) => {
  const id = req.params.id;
  let result;
  if (id.startsWith('sys-')) {
    result = systemSchedules.cancelInflight(id);
  } else {
    result = cancelUserRun(id);
  }
  if (!result.ok) {
    // F4: expected operational outcomes return 200 with a friendly message so the
    // client surfaces it inline (request() throws on 4xx/5xx → generic error toast).
    const messages = {
      not_running: 'Run already finished',
      no_subprocess: 'Run is still starting — try again in a moment',
      not_cancellable: "This handler can't be cancelled",
    };
    return res.status(200).json({ ok: false, error: messages[result.reason] || result.reason });
  }
  res.json({ ok: true, runId: result.runId });
});

module.exports = { router, bootSchedules, stopAllSchedules };
