'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { rateLimit } = require('../middleware/rateLimit');
const { loadConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');
const db = require('../db');

const router = Router();

const HOME = os.homedir();

// Q32: Module-level agent content cache — invalidated when any .md file changes.
// Prevents re-reading 40+ files on every /playground/run request.
let _agentCache = null;     // { map: {}, mtime: 0 }
let _cacheTimer = null;

function invalidateAgentCache() {
  _agentCache = null;
}

function getAgentContentMap(claudeDir, config) {
  const globalAgentsDir = path.join(claudeDir, 'agents');
  // Check if any .md file is newer than our cached snapshot
  let maxMtime = 0;
  if (fs.existsSync(globalAgentsDir)) {
    for (const file of fs.readdirSync(globalAgentsDir)) {
      if (!file.endsWith('.md')) continue;
      try {
        const mtime = fs.statSync(path.join(globalAgentsDir, file)).mtimeMs;
        if (mtime > maxMtime) maxMtime = mtime;
      } catch { /* skip */ }
    }
  }
  if (_agentCache && _agentCache.mtime >= maxMtime) return _agentCache.map;

  const map = {};
  if (fs.existsSync(globalAgentsDir)) {
    for (const file of fs.readdirSync(globalAgentsDir).filter(f => f.endsWith('.md'))) {
      try {
        const content = fs.readFileSync(path.join(globalAgentsDir, file), 'utf-8');
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        const key = nameMatch ? nameMatch[1].trim() : file.replace('.md', '');
        map[key] = content;
        map[file.replace('.md', '')] = content;
      } catch { /* skip unreadable file */ }
    }
  }
  const projects = discoverProjects(config.projectDirs);
  for (const p of projects) {
    for (const a of (p.agents || [])) {
      map[a.name] = a.body || a.raw;
      if (a.filename) map[a.filename] = a.body || a.raw;
    }
  }
  _agentCache = { map, mtime: maxMtime };
  return map;
}
const CLAUDE_DIR = path.join(HOME, '.claude');
const TEMPLATES_DIR = path.join(CLAUDE_DIR, 'templates');
const TRAINING_DIR = path.join(CLAUDE_DIR, 'training');

function loadPlaygroundHistory() { return db.loadPlaygroundHistory(); }
function savePlaygroundHistory(list) { try { db.savePlaygroundHistory(list); } catch (err) { console.error('[savePlaygroundHistory] DB write failed:', err.message); throw err; } }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function logAgentRun(entry) {
  const estimateTokens = (text) => Math.ceil((text || '').length / 4);
  const estimateCost = (i, o) => (i * 3 + o * 15) / 1_000_000;
  const inputTokens = estimateTokens(entry.prompt || '');
  const outputTokens = estimateTokens(entry.output || '');
  const run = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
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
  try { db.insertAgentRun(run); } catch (err) { console.error('[logAgentRun] DB insert failed:', err.message); }
  return run;
}

// In-memory idempotency store (TTL 5 min). Prevents double-runs on network retries.
const idemStore = new Map(); // key → { output, done, timestamp }
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of idemStore) { if (v.timestamp < cutoff) idemStore.delete(k); }
}, 60_000).unref();

// POST /api/playground/run
router.post('/playground/run', rateLimit('heavy'), (req, res) => {
  const { agentName, prompt: userPrompt, customInstructions, timeoutMs, idempotencyKey } = req.body;
  if (!userPrompt) return res.status(400).json({ error: 'Prompt is required' });
  if (typeof userPrompt !== 'string' || userPrompt.length > 20000)
    return res.status(400).json({ error: 'Prompt must be 1–20,000 chars' });
  if (customInstructions && (typeof customInstructions !== 'string' || customInstructions.length > 10000))
    return res.status(400).json({ error: 'Custom instructions must be ≤10,000 chars' });
  if (agentName && (
    typeof agentName !== 'string' ||
    agentName.length > 200 ||
    agentName.includes('/') ||
    agentName.includes('\\') ||
    agentName.includes('..') ||
    agentName.includes('\0')
  )) return res.status(400).json({ error: 'Invalid agent name' });

  // Idempotency guard: if this key was already processed, replay cached result.
  if (idempotencyKey) {
    const cached = idemStore.get(idempotencyKey);
    if (cached) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'done', output: cached.output, cached: true })}\n\n`);
      try { res.end(); } catch {}
      return;
    }
  }

  const reqId = crypto.randomUUID();
  res.setTimeout(0);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let ended = false;
  let streamDead = false;

  const safeWrite = (raw) => {
    if (ended || streamDead) return true;
    try {
      return res.write(raw);
    } catch (err) {
      streamDead = true;
      console.error('[playground] sse write failed', { agent: agentName || 'custom', reqId, code: err.code, msg: err.message });
      try { if (typeof hardKill === 'function') hardKill('stream_dead'); } catch { /* proc not ready yet */ }
      return false;
    }
  };
  const send = (data) => safeWrite(`data: ${JSON.stringify(data)}\n\n`);
  const sendComment = (text) => safeWrite(`: ${text}\n\n`);

  let instructions = '';
  if (agentName) {
    const config = loadConfig();
    const agentContentMap = getAgentContentMap(CLAUDE_DIR, config);
    // Validate agentName is a safe basename before any path.join usage below.
    if (agentName.includes('/') || agentName.includes('\\') || agentName.includes('..') || agentName.includes('\0')) {
      send({ type: 'error', error: 'Invalid agent name' });
      logAgentRun({ agentName: 'invalid', prompt: userPrompt, output: '', source: req.body.source || 'playground', duration: 0, status: 'error', error: 'invalid_agent_name', metadata: { reqId } });
      try { res.end(); } catch {}
      return;
    }

    instructions = agentContentMap[agentName] || '';

    if (!instructions) {
      send({ type: 'error', error: `Agent "${agentName}" not found` });
      logAgentRun({ agentName: agentName || 'custom', prompt: userPrompt, output: '', source: req.body.source || 'playground', duration: 0, status: 'error', error: 'agent_not_found', metadata: { reqId } });
      try { res.end(); } catch {}
      return;
    }

    try {
      const matter = require('gray-matter');
      const agentPath = path.join(CLAUDE_DIR, 'agents', agentName + '.md');
      if (fs.existsSync(agentPath)) {
        const { data: agentMeta } = matter(fs.readFileSync(agentPath, 'utf-8'));
        if (agentMeta.output_template) {
          const tmplPath = path.join(TEMPLATES_DIR, agentMeta.output_template + '.md');
          if (fs.existsSync(tmplPath)) {
            const { content: tmplBody } = matter(fs.readFileSync(tmplPath, 'utf-8'));
            instructions += '\n\n## OUTPUT FORMAT (MANDATORY)\nYou MUST structure your response exactly as follows. Do not deviate from this format.\n\n' + tmplBody.trim();
          }
        }
      }
    } catch (err) {
      console.warn('[playground] output_template load failed', { agent: agentName, reqId, msg: err.message });
      send({ type: 'warning', scope: 'instructions', message: `output_template load failed: ${err.message}` });
    }

    try {
      const agentKey = agentName.replace(/\s.*$/, '').toLowerCase();
      const trainingFiles = [agentName, agentKey].map(n => path.join(TRAINING_DIR, n + '.json'));
      for (const tf of trainingFiles) {
        if (fs.existsSync(tf)) {
          const corrections = JSON.parse(fs.readFileSync(tf, 'utf-8')).filter(c => c.status === 'active');
          if (corrections.length > 0) {
            instructions += '\n\n## TRAINING CORRECTIONS (Follow these strictly)\n' +
              corrections.map((c, i) => `${i + 1}. [${c.timestamp.split('T')[0]}] ${c.correction}`).join('\n');
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[playground] training corrections load failed', { agent: agentName, reqId, msg: err.message });
      send({ type: 'warning', scope: 'instructions', message: `training corrections load failed: ${err.message}` });
    }
  }

  if (customInstructions) {
    instructions = customInstructions;
  }

  let fullPrompt = '';
  if (instructions) {
    fullPrompt = `${instructions}\n\n---\n\n## Task:\n${userPrompt}\n\n---\n\nIMPORTANT: Produce the actual deliverable directly. Do NOT write meta-commentary. Output only the finished work product.`;
  } else {
    fullPrompt = userPrompt;
  }

  const timeout = Math.max(5000, Math.min(timeoutMs ?? 120000, 600000));
  const IDLE_MS = Number(process.env.PLAYGROUND_IDLE_MS) || 90000;
  const HEARTBEAT_MS = Number(process.env.PLAYGROUND_HEARTBEAT_MS) || 15000;
  const claudePath = process.env.CLAUDE_PATH || 'claude';
  const childEnv = { ...process.env, HOME: os.homedir() };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
  delete childEnv.CLAUDE_AGENT_SDK_VERSION;
  const proc = spawn(claudePath, ['-p'], { env: childEnv, detached: true });
  let fullOutput = '';
  let lastActivityAt = Date.now();
  let killReason = null;
  let sigkillTimer = null;

  function hardKill(reason) {
    if (killReason) return;
    killReason = reason;
    const killSignal = (sig) => {
      try {
        if (proc.pid) process.kill(-proc.pid, sig);
      } catch {
        try { proc.kill(sig); } catch { /* already dead */ }
      }
    };
    killSignal('SIGTERM');
    sigkillTimer = setTimeout(() => killSignal('SIGKILL'), 5000);
    if (sigkillTimer && typeof sigkillTimer.unref === 'function') sigkillTimer.unref();
  }

  const touchActivity = () => { lastActivityAt = Date.now(); };

  const timer = setTimeout(() => { hardKill('wall_timeout'); }, timeout);

  const idleTimer = setInterval(() => {
    if (killReason) return;
    const idleFor = Date.now() - lastActivityAt;
    if (idleFor >= IDLE_MS) {
      send({ type: 'stalled', reason: 'no_output', idleMs: idleFor });
      hardKill('idle_timeout');
      clearInterval(idleTimer);
    }
  }, 5000);
  if (typeof idleTimer.unref === 'function') idleTimer.unref();

  const heartbeatTimer = setInterval(() => sendComment('hb ' + Date.now()), HEARTBEAT_MS);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

  const finish = () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    if (sigkillTimer) clearTimeout(sigkillTimer);
    clearInterval(idleTimer);
    clearInterval(heartbeatTimer);
    try { res.end(); } catch {}
  };

  const playgroundStartTime = Date.now();
  send({ type: 'start', agent: agentName || 'custom' });

  proc.stdout.on('data', (data) => {
    if (ended) return;
    touchActivity();
    if (streamDead) return;
    const chunk = data.toString();
    fullOutput += chunk;
    const ok = send({ type: 'chunk', content: chunk });
    if (ok === false) {
      proc.stdout.pause();
      res.once('drain', () => {
        if (!ended && !streamDead) proc.stdout.resume();
      });
    }
  });

  proc.stderr.on('data', (data) => {
    if (ended) return;
    touchActivity();
    if (streamDead) return;
    const raw = data.toString().trim();
    if (!raw) return;
    // Log full stderr server-side; send only safe, non-sensitive lines to client.
    console.log('[playground:stderr]', { agent: agentName || 'custom', reqId, msg: raw.slice(0, 500) });
    const safePattern = /^(\[INFO\]|\[WARN\]|Thinking|Agent|Processing|Claude|Running)/i;
    const safeMsg = safePattern.test(raw) ? raw.slice(0, 500) : '[agent working…]';
    send({ type: 'activity', message: safeMsg });
  });
  proc.stderr.on('error', (err) => {
    console.warn('[playground] stderr stream error', { agent: agentName || 'custom', reqId, code: err.code, msg: err.message });
  });

  proc.on('close', (code) => {
    if (ended) { if (sigkillTimer) clearTimeout(sigkillTimer); return; }
    const runSource = req.body.source || 'playground';
    const duration = Date.now() - playgroundStartTime;
    const baseLog = {
      agentName: agentName || 'custom',
      prompt: userPrompt,
      source: runSource,
      duration,
      metadata: { reqId, exitCode: code, killReason },
    };

    if (killReason === 'wall_timeout') {
      send({ type: 'error', error: `Timed out after ${timeout / 1000}s` });
      logAgentRun({ ...baseLog, output: fullOutput.trim(), status: 'error', error: `wall_timeout_${timeout / 1000}s` });
    } else if (killReason === 'idle_timeout') {
      send({ type: 'error', error: `Agent produced no output for ${Math.round(IDLE_MS / 1000)}s (idle timeout). Process killed.` });
      logAgentRun({ ...baseLog, output: fullOutput.trim(), status: 'error', error: `idle_timeout_${Math.round(IDLE_MS / 1000)}s` });
    } else if (killReason === 'stdin_error') {
      logAgentRun({ ...baseLog, output: fullOutput.trim(), status: 'error', error: 'stdin_error' });
    } else if (killReason === 'client_disconnect') {
      logAgentRun({ ...baseLog, output: fullOutput.trim(), status: 'cancelled', error: 'client_disconnect' });
    } else if (killReason === 'stream_dead') {
      logAgentRun({ ...baseLog, output: fullOutput.trim(), status: 'error', error: 'stream_dead' });
    } else if (code !== 0) {
      const partial = fullOutput.trim() ? ' after partial output' : '';
      send({ type: 'error', error: `claude exited with code ${code}${partial}` });
      logAgentRun({ ...baseLog, output: fullOutput.trim(), status: 'error', error: `exit_code_${code}` });
    } else if (code === 0 && !fullOutput.trim()) {
      send({ type: 'error', error: 'claude exited 0 but produced no output. This usually means the prompt was rejected, auth failed, or the CLI wrote to a path that was empty. Check CLAUDE_PATH and credentials.' });
      logAgentRun({ ...baseLog, output: '', status: 'error', error: 'empty_output' });
    } else {
      const trimmedOutput = fullOutput.trim();
      send({ type: 'done', output: trimmedOutput, exitCode: code, durationMs: duration });
      logAgentRun({ ...baseLog, output: trimmedOutput, status: 'success' });
      // Cache for idempotency replay (5-min TTL)
      if (idempotencyKey) {
        idemStore.set(idempotencyKey, { output: trimmedOutput, timestamp: Date.now() });
      }
    }
    finish();
  });

  proc.on('error', (err) => {
    if (ended) return;
    // Log full error server-side; send generic message to client (no internal paths/codes).
    console.error('[playground] spawn error', { agent: agentName || 'custom', reqId, code: err.code, msg: err.message });
    send({ type: 'error', error: 'Failed to start agent process. Check server logs.' });
    logAgentRun({
      agentName: agentName || 'custom',
      prompt: userPrompt,
      output: fullOutput.trim(),
      source: req.body.source || 'playground',
      duration: Date.now() - playgroundStartTime,
      status: 'error',
      error: `spawn_error: ${err.code || 'unknown'}`,
      metadata: { reqId, killReason },
    });
    finish();
  });

  let stdinErrorHandled = false;
  const handleStdinErr = (err) => {
    if (stdinErrorHandled || ended) return;
    stdinErrorHandled = true;
    console.error('[playground] stdin error', { agent: agentName || 'custom', reqId, code: err.code, msg: err.message });
    send({ type: 'error', error: 'Failed to deliver prompt to agent. Check server logs.' });
    hardKill('stdin_error');
  };
  proc.stdin.on('error', handleStdinErr);

  const writeOk = proc.stdin.write(fullPrompt, 'utf8', (err) => {
    if (err) { handleStdinErr(err); return; }
  });
  if (writeOk) {
    try { proc.stdin.end(); } catch (err) { handleStdinErr(err); }
  } else {
    proc.stdin.once('drain', () => {
      try { proc.stdin.end(); } catch (err) { handleStdinErr(err); }
    });
  }

  res.on('close', () => {
    if (!killReason) hardKill('client_disconnect');
  });
});

// GET /api/playground/history
router.get('/playground/history', rateLimit('read'), (req, res) => {
  res.json(loadPlaygroundHistory());
});

// POST /api/playground/history
router.post('/playground/history', rateLimit('write'), (req, res) => {
  const { id, agent, agentName, prompt, output, duration, status, timestamp } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const MAX_OUTPUT = 500_000;
  const rawOutput = output || '';
  const truncated = rawOutput.length > MAX_OUTPUT;
  const entry = {
    id: id || genId(),
    agent: agent || '',
    agentName: agentName || 'Unknown',
    prompt: (prompt || '').slice(0, 10_000),
    output: rawOutput.slice(0, MAX_OUTPUT),
    truncated,
    duration: duration || 0,
    status: status || 'success',
    timestamp: timestamp || new Date().toISOString(),
  };
  const list = loadPlaygroundHistory();
  list.unshift(entry);
  // Hard cap: keep latest 200 entries; prune rows older than 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const pruned = list
    .filter(h => new Date(h.timestamp).getTime() > thirtyDaysAgo)
    .slice(0, 200);
  savePlaygroundHistory(pruned);
  res.status(truncated ? 207 : 200).json({ ...entry, truncated });
});

// DELETE /api/playground/history/:id
router.delete('/playground/history/:id', rateLimit('write'), (req, res) => {
  const list = loadPlaygroundHistory().filter(h => h.id !== req.params.id);
  savePlaygroundHistory(list);
  res.json({ ok: true });
});

// DELETE /api/playground/history
router.delete('/playground/history', rateLimit('write'), (req, res) => {
  savePlaygroundHistory([]);
  res.json({ ok: true });
});

module.exports = router;
