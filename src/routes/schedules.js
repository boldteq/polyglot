'use strict';

const { randomUUID } = require('crypto');

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cron = require('node-cron');
const { spawn } = require('child_process');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

const activeJobs = new Map();
const inflightJobs = new Set(); // guard: prevent overlapping runs per schedule

function genId() { return randomUUID(); }

function findAgentFile(agentName) {
  if (!agentName || typeof agentName !== 'string') return null;
  const dir = path.join(CLAUDE_DIR, 'agents');
  try {
    if (!fs.existsSync(dir)) return null;
    const target = agentName.toLowerCase();
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const fname = file.replace(/\.md$/, '');
      if (fname === agentName || fname.toLowerCase() === target) return path.join(dir, file);
    }
  } catch {
    return null;
  }
  return null;
}

function validateAgentExists(agentName) {
  return findAgentFile(agentName) !== null;
}

function runClaudeSync(prompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const claudePath = process.env.CLAUDE_PATH || 'claude';
    const childEnv = { ...process.env, HOME: os.homedir() };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;
    delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
    delete childEnv.CLAUDE_AGENT_SDK_VERSION;
    const proc = spawn(claudePath, ['-p'], { env: childEnv });
    let out = '', err = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
    }, timeoutMs);

    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (killed) reject(new Error(`Node execution timed out after ${timeoutMs / 1000}s`));
      else if (code !== 0) reject(new Error(err.trim() || `claude exited ${code}`));
      else resolve(out.trim());
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();
  });
}

function logAgentRun(entry) {
  const estimateTokens = (text) => Math.ceil((text || '').length / 4);
  const estimateCost = (i, o) => (i * 3 + o * 15) / 1_000_000;
  const inputTokens = estimateTokens(entry.prompt || '');
  const outputTokens = estimateTokens(entry.output || '');
  const run = {
    id: randomUUID(),
    agentName: entry.agentName || 'unknown',
    prompt: (entry.prompt || '').slice(0, 200),
    source: entry.source || 'unknown',
    timestamp: new Date().toISOString(),
    duration: entry.duration || 0,
    status: entry.status || 'success',
    promptChars: (entry.prompt || '').length,
    outputChars: (entry.output || '').length,
    estimatedTokens: inputTokens + outputTokens,
    estimatedCost: estimateCost(inputTokens, outputTokens),
    error: entry.error || null,
    metadata: entry.metadata || {},
  };
  try { db.insertAgentRun(run); } catch (err) {
    console.error('[logAgentRun] DB insert failed:', err.message);
    db.insertErrorLog({ source: 'schedule', message: `DB insert failed for agent run: ${err.message}`, stack: err.stack, context: { agentName: entry.agentName } });
  }
  return run;
}

function buildScheduledPrompt(schedule) {
  const file = findAgentFile(schedule.agentName);
  if (!file) {
    throw new Error(`Agent '${schedule.agentName}' not found`);
  }
  const instructions = fs.readFileSync(file, 'utf-8');
  return `${instructions}\n\n---\n\n## Task:\n${schedule.prompt}\n\n---\n\nIMPORTANT: Produce the actual deliverable directly. Do NOT write meta-commentary. Output only the finished work product.`;
}

function persistRunStatus(id, status) {
  try { db.updateScheduleRunStatus(id, new Date().toISOString(), status); }
  catch (err) {
    console.error('[schedule] failed to persist run status:', err.message);
    db.insertErrorLog({ source: 'schedule', message: `Failed to persist run status: ${err.message}`, stack: err.stack, context: { scheduleId: id, status } });
  }
}

function startScheduleJob(schedule) {
  if (activeJobs.has(schedule.id)) {
    activeJobs.get(schedule.id).stop();
    activeJobs.delete(schedule.id);
  }
  if (!schedule.enabled) return;
  if (!cron.validate(schedule.cron)) {
    console.warn(`[schedule] invalid cron — job not scheduled: id=${schedule.id} name="${schedule.name}" cron="${schedule.cron}"`);
    return;
  }

  const job = cron.schedule(schedule.cron, async () => {
    // Inflight guard — skip tick if previous run still in progress
    if (inflightJobs.has(schedule.id)) {
      console.warn(`[schedule] skipping tick — previous run still in progress: id=${schedule.id} name="${schedule.name}"`);
      return;
    }
    inflightJobs.add(schedule.id);
    const startTime = Date.now();
    // Re-read fresh state so a paused/deleted schedule doesn't fire stale closure work
    const fresh = db.getScheduleById(schedule.id);
    if (!fresh || !fresh.enabled) {
      inflightJobs.delete(schedule.id);
      return;
    }

    try {
      const prompt = buildScheduledPrompt(fresh);
      const output = await runClaudeSync(prompt, 300000);
      logAgentRun({
        agentName: fresh.agentName, prompt: fresh.prompt, output,
        source: 'schedule', duration: Date.now() - startTime, status: 'success',
        metadata: { scheduleId: fresh.id },
      });
      persistRunStatus(fresh.id, 'success');
    } catch (err) {
      logAgentRun({
        agentName: fresh.agentName, prompt: fresh.prompt, output: '',
        source: 'schedule', duration: Date.now() - startTime, status: 'error',
        error: err.message, metadata: { scheduleId: fresh.id },
      });
      persistRunStatus(fresh.id, 'error');
    } finally {
      inflightJobs.delete(schedule.id);
    }
  });
  activeJobs.set(schedule.id, job);
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
    if (active > 0) console.log(`  Schedules: ${active} active cron job(s) restored`);
    if (invalid > 0) console.warn(`  Schedules: ${invalid} schedule(s) skipped due to invalid cron expressions`);
  } catch (err) {
    console.error('[bootSchedules] failed:', err.message);
    db.insertErrorLog({ source: 'schedule', message: `bootSchedules failed: ${err.message}`, stack: err.stack, context: { type: 'boot' } });
  }
}

// GET /api/schedules
router.get('/schedules', rateLimit('read'), (req, res) => {
  res.json(db.loadSchedules());
});

// POST /api/schedules
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
    db.insertErrorLog({ source: 'schedule', message: `Schedule create failed: ${err.message}`, stack: err.stack, context: { name: schedule.name } });
    return res.status(500).json({ error: 'Failed to persist schedule' });
  }

  if (schedule.enabled) startScheduleJob(schedule);
  res.json(schedule);
});

// PUT /api/schedules/:id
router.put('/schedules/:id', rateLimit('write'), (req, res) => {
  const id = req.params.id;
  const existing = db.getScheduleById(id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  const { name, agentName, prompt, cronExpr, enabled } = req.body || {};

  if (cronExpr !== undefined && !cron.validate(cronExpr)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }
  if (agentName !== undefined && !validateAgentExists(agentName)) {
    return res.status(400).json({ error: `Agent '${agentName}' not found` });
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }
  if (prompt !== undefined && (typeof prompt !== 'string' || !prompt.trim())) {
    return res.status(400).json({ error: 'prompt cannot be empty' });
  }

  const fields = { updatedAt: new Date().toISOString() };
  if (name !== undefined) fields.name = name.trim();
  if (agentName !== undefined) fields.agentName = agentName.trim();
  if (prompt !== undefined) fields.prompt = prompt;
  if (cronExpr !== undefined) fields.cron = cronExpr;
  if (enabled !== undefined) fields.enabled = enabled;

  try {
    db.updateScheduleFields(id, fields);
  } catch (err) {
    console.error('[schedules PUT] update failed:', err.message);
    db.insertErrorLog({ source: 'schedule', message: `Schedule update failed: ${err.message}`, stack: err.stack, context: { id } });
    return res.status(500).json({ error: 'Failed to update schedule' });
  }

  const updated = db.getScheduleById(id);
  if (!updated) return res.status(404).json({ error: 'Schedule not found after update' });

  if (updated.enabled) {
    startScheduleJob(updated);
  } else if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }

  res.json(updated);
});

// DELETE /api/schedules/:id
router.delete('/schedules/:id', rateLimit('write'), (req, res) => {
  const id = req.params.id;
  if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }
  try {
    db.deleteScheduleById(id);
  } catch (err) {
    console.error('[schedules DELETE] delete failed:', err.message);
    db.insertErrorLog({ source: 'schedule', message: `Schedule delete failed: ${err.message}`, stack: err.stack, context: { id } });
    return res.status(500).json({ error: 'Failed to delete schedule' });
  }
  res.json({ ok: true });
});

module.exports = { router, bootSchedules };
