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
const claudeBinary = require('../lib/claudeBinary');
const configService = require('../lib/configService');

// Strip API keys + bearer tokens from stderr before surfacing to the client.
// Prevents accidental credential leakage into logs/UI.
function redactSecrets(s) {
  if (!s) return s;
  return String(s)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***REDACTED***')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***REDACTED***')
    .replace(/(api[_-]?key["\s:=]+)[^\s"]+/gi, '$1***REDACTED***');
}

// Resolve an agent key against the agent content map using multiple lookup
// strategies. Returns { match, key, candidates } so the caller can serve a
// helpful error when the user picks a name that doesn't exist.
function resolveAgentLookup(agentContentMap, agentName) {
  const tried = [];
  const tryKey = (k) => {
    if (!k) return null;
    tried.push(k);
    return agentContentMap[k] || null;
  };
  let match = tryKey(agentName);
  if (!match) match = tryKey(path.basename(String(agentName), '.md'));
  if (!match) match = tryKey(String(agentName).toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
  if (!match) match = tryKey(String(agentName).replace(/^[^\w]+/, '').trim());
  return {
    match,
    tried,
    candidates: match ? undefined : Object.keys(agentContentMap).slice(0, 20),
  };
}

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
  // Pillar 1: when the stream-json `result` event gave us REAL usage, record it
  // in cost_logs as estimated=0 (overrides the chars/4 estimate above).
  if (entry.usage && (entry.usage.inputTokens != null || entry.usage.outputTokens != null)) {
    try {
      db.logCost({
        runId: run.id,
        agentName: run.agentName,
        model: entry.usage.model || (run.metadata && run.metadata.model) || null,
        inputTokens: entry.usage.inputTokens || 0,
        outputTokens: entry.usage.outputTokens || 0,
        costUsd: entry.usage.costUsd,
        estimated: false,
        source: run.source,
      });
    } catch (err) { console.error('[logAgentRun] real cost log failed:', err.message); }
  }
  return run;
}

// Persist the user-facing playground_history row directly from the run handler,
// at EVERY terminal state (success/error/timeout/cancel) — so no run is ever
// lost from the history UI just because the frontend never sent its follow-up
// POST (aborts, server-side timeouts, stream death never reach the frontend).
// Idempotent on the shared id, so a later frontend POST just overwrites.
function persistPlaygroundRow({ historyId, agentName, prompt, output, duration, status, error, reqId, threadId, turnIndex }) {
  try {
    db.upsertPlaygroundHistoryRow({
      id: historyId,
      agentName: agentName || 'custom',
      prompt: (prompt || '').slice(0, 10_000),
      output: (output || '').slice(0, 500_000),
      duration: duration || 0,
      status,
      error: error || null,
      timestamp: new Date().toISOString(),
      metadata: { reqId, source: 'backend' },
      threadId: threadId || null,
      turnIndex: typeof turnIndex === 'number' ? turnIndex : null,
    });
  } catch (e) { console.error('[playground] history persist failed:', e.message); }
}

// In-memory idempotency store (TTL 5 min). Prevents double-runs on network retries.
const idemStore = new Map(); // key → { output, done, timestamp }
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of idemStore) { if (v.timestamp < cutoff) idemStore.delete(k); }
}, 60_000).unref();

// POST /api/playground/run
router.post('/playground/run', rateLimit('heavy'), (req, res) => {
  // Content-type guard — body-parser silently produces `{}` for non-JSON
  // bodies, which used to surface as a confusing "Prompt is required" 400.
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'JSON body required' });
  }
  const { agentName, prompt: userPrompt, customInstructions, timeoutMs, idempotencyKey, model } = req.body;
  let { historyId, threadId } = req.body;
  if (!userPrompt) return res.status(400).json({ error: 'Prompt is required' });
  // Optional model override ("Fast" toggle). Allowlist only — never pass arbitrary
  // strings to the CLI. "fast" → haiku (the fastest tier) for snappy conversational
  // testing; the agent's heavy model is the default when Fast is off.
  const MODEL_ALIASES = { fast: 'haiku', sonnet: 'sonnet', haiku: 'haiku', opus: 'opus', default: null };
  let cliModel = null;
  if (model != null) {
    if (typeof model !== 'string' || !(model in MODEL_ALIASES)) {
      return res.status(400).json({ error: 'Invalid model' });
    }
    cliModel = MODEL_ALIASES[model];
  }
  if (typeof userPrompt !== 'string' || userPrompt.length > 20000)
    return res.status(400).json({ error: 'Prompt must be 1–20,000 chars' });
  if (customInstructions && (typeof customInstructions !== 'string' || customInstructions.length > 10000))
    return res.status(400).json({ error: 'Custom instructions must be ≤10,000 chars' });
  // historyId / threadId are short client-generated ids; reject anything weird.
  const okId = (v) => v == null || (typeof v === 'string' && v.length > 0 && v.length <= 64 && !/[^\w-]/.test(v));
  if (!okId(historyId)) return res.status(400).json({ error: 'Invalid historyId' });
  if (!okId(threadId)) return res.status(400).json({ error: 'Invalid threadId' });
  if (agentName && (
    typeof agentName !== 'string' ||
    agentName.length > 200 ||
    agentName.includes('/') ||
    agentName.includes('\\') ||
    agentName.includes('..') ||
    agentName.includes('\0')
  )) return res.status(400).json({ error: 'Invalid agent name' });

  // Attachments (optional). Written to a temp dir + referenced by path in the
  // prompt so the `claude` CLI reads them with its own Read tool — cost-free, no
  // API. Bounded: ≤3 files, ≤5MB each (base64 inflates ~1.37×, so cap raw ~7MB).
  let attachFiles = [];
  if (req.body.files !== undefined) {
    if (!Array.isArray(req.body.files) || req.body.files.length > 3)
      return res.status(400).json({ error: 'Up to 3 files allowed' });
    for (const f of req.body.files) {
      if (!f || typeof f.name !== 'string' || typeof f.content !== 'string')
        return res.status(400).json({ error: 'Invalid file payload' });
      if (f.content.length > 7_000_000)
        return res.status(400).json({ error: `File "${f.name.slice(0, 40)}" too large (max 5MB)` });
    }
    attachFiles = req.body.files;
  }

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
  // Canonical history id: the frontend sends its own genId so both sides write
  // the same playground_history row (deduped via INSERT OR REPLACE). Fall back
  // to reqId when a non-UI caller doesn't supply one.
  if (!historyId) historyId = reqId;
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
      persistPlaygroundRow({ historyId, agentName, prompt: userPrompt, output: '', duration: 0, status: 'error', error: 'invalid_agent_name', reqId, threadId });
      try { res.end(); } catch {}
      return;
    }

    const lookup = resolveAgentLookup(agentContentMap, agentName);
    instructions = lookup.match || '';

    if (!instructions) {
      send({
        type: 'error',
        code: 'agent_not_found',
        error: `Agent "${agentName}" not found`,
        cause: `Tried keys: ${lookup.tried.join(', ')}`,
        tip: 'Pick one of the valid agent names below or fix the agent filename.',
        candidates: lookup.candidates,
        reqId,
      });
      logAgentRun({ agentName: agentName || 'custom', prompt: userPrompt, output: '', source: req.body.source || 'playground', duration: 0, status: 'error', error: 'agent_not_found', metadata: { reqId, tried: lookup.tried } });
      persistPlaygroundRow({ historyId, agentName, prompt: userPrompt, output: '', duration: 0, status: 'error', error: 'agent_not_found', reqId, threadId });
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

  // Thread continuity: replay prior turns as context (the `claude -p` spawn stays
  // single-shot). Load the thread's messages and build a transcript, truncating
  // OLDEST turns first to keep the assembled prompt within the 20k char cap.
  let priorMessages = [];
  let turnIndex = 0;
  if (threadId) {
    try {
      const thread = db.getPlaygroundThread(threadId);
      if (thread) {
        priorMessages = thread.messages || [];
        turnIndex = priorMessages.filter(m => m.role === 'user').length;
      }
    } catch (err) {
      console.warn('[playground] thread load failed', { threadId, reqId, msg: err.message });
    }
  }

  let conversationContext = '';
  if (priorMessages.length > 0) {
    // Skip non-success assistant turns (e.g. `Error: client_disconnect` junk) — they
    // pollute the prompt, confuse the model, and slow the first token. Cap each
    // message so one giant turn can't bloat the context.
    const PER_MSG_CAP = 1500;
    const clean = priorMessages.filter(m => !(m.role === 'assistant' && m.status && m.status !== 'success'));
    const turns = clean.map(m => {
      const body = (m.content || '').slice(0, PER_MSG_CAP);
      return `${m.role === 'user' ? 'User' : 'Assistant'}: ${body}`;
    });
    // Drop oldest turns until the context comfortably fits alongside instructions.
    const budget = 20000 - (instructions ? instructions.length : 0) - userPrompt.length - 500;
    while (turns.length > 0 && turns.join('\n\n').length > Math.max(2000, budget)) {
      turns.shift();
    }
    if (turns.length > 0) {
      conversationContext = `## Conversation so far:\n${turns.join('\n\n')}\n\n## Current message:\n`;
    }
  }

  let fullPrompt = '';
  if (instructions) {
    fullPrompt = `${instructions}\n\n---\n\n## Task:\n${conversationContext}${userPrompt}\n\n---\n\nIMPORTANT: Produce the actual deliverable directly. Do NOT write meta-commentary. Output only the finished work product.`;
  } else if (conversationContext) {
    fullPrompt = `${conversationContext}${userPrompt}`;
  } else {
    fullPrompt = userPrompt;
  }

  // Resolve timeouts + binary path from app_config (with env override fallback)
  const cfgWallTimeout = configService.getConfig('time.playground_wall_timeout_ms');
  const cfgIdleTimeout = configService.getConfig('time.playground_idle_timeout_ms');
  const cfgHeartbeat = configService.getConfig('time.playground_heartbeat_ms');
  const defaultWall = typeof cfgWallTimeout === 'number' ? cfgWallTimeout : 120000;
  const timeout = Math.max(5000, Math.min(timeoutMs ?? defaultWall, 600000));
  const IDLE_MS = Number(process.env.PLAYGROUND_IDLE_MS) || (typeof cfgIdleTimeout === 'number' ? cfgIdleTimeout : 90000);
  const HEARTBEAT_MS = Number(process.env.PLAYGROUND_HEARTBEAT_MS) || (typeof cfgHeartbeat === 'number' ? cfgHeartbeat : 15000);

  const claudePath = claudeBinary.getClaudePath();
  if (!claudePath) {
    const pre = claudeBinary.runPreflight();
    send({
      type: 'error',
      code: 'claude_binary_missing',
      error: 'Claude CLI not found on this server.',
      cause: pre.binary.error || 'PATH lookup + CLAUDE_PATH env both failed.',
      tip: 'Install: npm install -g @anthropic-ai/claude-code. Or set CLAUDE_PATH env / app_config defaults.claude_path to the absolute path of the claude binary.',
      reqId,
    });
    logAgentRun({ agentName: agentName || 'custom', prompt: userPrompt, output: '', source: req.body.source || 'playground', duration: 0, status: 'error', error: 'claude_binary_missing', metadata: { reqId } });
    persistPlaygroundRow({ historyId, agentName, prompt: userPrompt, output: '', duration: 0, status: 'error', error: 'claude_binary_missing', reqId, threadId });
    try { res.end(); } catch {}
    return;
  }

  // Materialise attachments to a temp dir + tell the agent where they are. The
  // CLI Read tool handles text/images/PDF. attachDir is cleaned up in finish().
  let attachDir = null;
  if (attachFiles.length) {
    try {
      attachDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-pg-'));
      const absPaths = [];
      for (const f of attachFiles) {
        const safe = (path.basename(f.name).replace(/[^\w.\- ]/g, '_').slice(0, 120)) || 'file';
        const dest = path.join(attachDir, safe);
        const buf = f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : Buffer.from(f.content, 'utf8');
        fs.writeFileSync(dest, buf);
        absPaths.push(dest);
      }
      fullPrompt += `\n\n## Attached files\nThe user attached these files — read them with your Read tool as needed:\n${absPaths.map((p) => `- ${p}`).join('\n')}`;
    } catch (err) {
      console.error('[playground] attachment write failed:', err.message);
      attachDir = null;
    }
  }

  const childEnv = { ...process.env, HOME: os.homedir() };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
  delete childEnv.CLAUDE_AGENT_SDK_VERSION;
  // Subscription-only (default ON): strip API-key credentials so the CLI MUST use
  // the logged-in Claude Code session (`claude login`) and can never silently fall
  // back to metered pay-per-token API billing. Overridable via app_config.
  const subscriptionOnly = configService.getConfig('playground.subscription_only') !== false;
  if (subscriptionOnly) {
    delete childEnv.ANTHROPIC_API_KEY;
    delete childEnv.ANTHROPIC_AUTH_TOKEN;
  }
  // stream-json gives token-by-token deltas (live typing) + a final `result`
  // event with authoritative text AND real token usage/cost. --verbose is
  // required by the CLI for stream-json; --include-partial-messages emits the
  // incremental content_block_delta events we forward as `chunk`s.
  const spawnArgs = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  // "Fast" toggle / model override — run the same agent prompt on a faster model.
  if (cliModel) spawnArgs.push('--model', cliModel);
  const proc = spawn(
    claudePath,
    spawnArgs,
    { env: childEnv, detached: true }
  );
  // Stderr ring buffer — keep last ~2KB for diagnostic surfacing on failure.
  let stderrTail = '';
  const STDERR_TAIL_CAP = 2048;
  let fullOutput = '';       // accumulated assistant text (from text deltas)
  let resultText = null;     // authoritative final text from the `result` event
  let realUsage = null;      // { inputTokens, outputTokens, costUsd, model } from `result`
  let sessionId = null;      // CLI session id (for future native --resume)
  let jsonBuf = '';          // partial-line buffer for newline-delimited JSON
  let lastActivityAt = Date.now();
  let killReason = null;
  let sigkillTimer = null;

  function hardKill(reason) {
    if (killReason) return;
    killReason = reason;
    const killSignal = (sig) => {
      // Validate pid before signalling. `process.kill(-0, sig)` would crash the
      // parent on a bad pid; `process.kill(NaN, sig)` throws TypeError.
      try {
        if (proc.pid && Number.isFinite(proc.pid) && proc.pid > 0) {
          process.kill(-proc.pid, sig);
        } else if (proc.pid) {
          proc.kill(sig);
        }
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
    if (attachDir) { try { fs.rmSync(attachDir, { recursive: true, force: true }); } catch { /* best-effort */ } attachDir = null; }
    try { res.end(); } catch {}
  };

  const playgroundStartTime = Date.now();
  send({ type: 'start', agent: agentName || 'custom', historyId, threadId: threadId || null, reqId });

  // Parse one newline-delimited stream-json event. Forwards text deltas as
  // `chunk` (live typing) and tool-use as `activity`. Never throws — a malformed
  // or partial line is ignored. Returns false if a send applied backpressure.
  const handleStreamEvent = (line) => {
    const t = line.trim();
    if (!t) return true;
    let ev;
    try { ev = JSON.parse(t); } catch { return true; } // partial/garbage line
    switch (ev.type) {
      case 'system': {
        if (ev.session_id) sessionId = ev.session_id;
        if (ev.subtype === 'init') return send({ type: 'activity', message: 'Agent initializing…' });
        return true;
      }
      case 'stream_event': {
        const e = ev.event;
        if (!e) return true;
        if (e.type === 'content_block_start' && e.content_block && e.content_block.type === 'tool_use') {
          const tool = e.content_block.name || 'tool';
          return send({ type: 'activity', message: `Using ${tool}…` });
        }
        if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta' && e.delta.text) {
          fullOutput += e.delta.text;
          if (fullOutput.length > 400_000 && !ended) { /* size guard handled at done */ }
          return send({ type: 'chunk', content: e.delta.text });
        }
        return true;
      }
      case 'assistant': {
        // Fallback accumulator — if partial deltas were unavailable, capture the
        // assistant message text so we still have output.
        try {
          const blocks = ev.message && ev.message.content;
          if (Array.isArray(blocks) && !fullOutput) {
            const txt = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
            if (txt) fullOutput = txt;
          }
        } catch { /* ignore */ }
        return true;
      }
      case 'result': {
        if (typeof ev.result === 'string' && ev.result.trim()) resultText = ev.result;
        if (ev.is_error) killReason = killReason || 'agent_error';
        // Real token usage + cost (Pillar 1) — recorded at close via baseLog.usage.
        const u = ev.usage || {};
        realUsage = {
          inputTokens: u.input_tokens ?? 0,
          outputTokens: u.output_tokens ?? 0,
          costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : undefined,
          model: ev.model || (ev.modelUsage && Object.keys(ev.modelUsage)[0]) || null,
        };
        return true;
      }
      default:
        return true;
    }
  };

  proc.stdout.on('data', (data) => {
    if (ended) return;
    touchActivity();
    if (streamDead) return;
    jsonBuf += data.toString();
    const lines = jsonBuf.split('\n');
    jsonBuf = lines.pop() || '';
    let backpressured = false;
    for (const line of lines) {
      if (handleStreamEvent(line) === false) backpressured = true;
    }
    if (backpressured) {
      proc.stdout.pause();
      res.once('drain', () => {
        if (!ended && !streamDead) proc.stdout.resume();
      });
    }
  });

  proc.stderr.on('data', (data) => {
    if (ended) return;
    touchActivity();
    const raw = data.toString();
    // Accumulate redacted stderr into a ring buffer regardless of streamDead
    // — we still want to surface the tail on close.
    stderrTail = (stderrTail + redactSecrets(raw)).slice(-STDERR_TAIL_CAP);
    if (streamDead) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    // Log full stderr server-side; send only safe, non-sensitive lines to client.
    console.log('[playground:stderr]', { agent: agentName || 'custom', reqId, msg: trimmed.slice(0, 500) });
    const safePattern = /^(\[INFO\]|\[WARN\]|Thinking|Agent|Processing|Claude|Running)/i;
    const safeMsg = safePattern.test(trimmed) ? redactSecrets(trimmed).slice(0, 500) : '[agent working…]';
    send({ type: 'activity', message: safeMsg });
  });
  proc.stderr.on('error', (err) => {
    console.warn('[playground] stderr stream error', { agent: agentName || 'custom', reqId, code: err.code, msg: err.message });
  });

  proc.on('close', (code) => {
    if (ended) { if (sigkillTimer) clearTimeout(sigkillTimer); return; }
    // Flush any trailing partial JSON line buffered at stream end.
    if (jsonBuf.trim()) { try { handleStreamEvent(jsonBuf); } catch { /* ignore */ } jsonBuf = ''; }
    const runSource = req.body.source || 'playground';
    const duration = Date.now() - playgroundStartTime;
    const baseLog = {
      agentName: agentName || 'custom',
      prompt: userPrompt,
      source: runSource,
      duration,
      // Real token usage + cost from the stream-json `result` event (Pillar 1).
      usage: realUsage || undefined,
      metadata: { reqId, exitCode: code, killReason, sessionId },
    };

    // Per-branch outcome → single source for both agent_runs + playground_history
    // + the thread message append below. status/error/finalOutput are computed
    // here so persistence is uniform across every terminal path. Prefer the
    // authoritative `result` text over the concatenated deltas.
    let status = 'success';
    let runError = null;
    let finalOutput = (resultText != null ? resultText : fullOutput).trim();

    if (killReason === 'wall_timeout') {
      send({
        type: 'error',
        code: 'wall_timeout',
        error: `Timed out after ${timeout / 1000}s`,
        stderrTail: stderrTail.slice(-500),
        durationMs: duration,
        reqId,
      });
      status = 'error'; runError = `wall_timeout_${timeout / 1000}s`;
      logAgentRun({ ...baseLog, output: finalOutput, status, error: runError });
    } else if (killReason === 'idle_timeout') {
      send({
        type: 'error',
        code: 'idle_timeout',
        error: `Agent produced no output for ${Math.round(IDLE_MS / 1000)}s (idle timeout). Process killed.`,
        stderrTail: stderrTail.slice(-500),
        tip: 'Increase time.playground_idle_timeout_ms in Settings → Tuning if your agent is legitimately slow.',
        durationMs: duration,
        reqId,
      });
      status = 'error'; runError = `idle_timeout_${Math.round(IDLE_MS / 1000)}s`;
      logAgentRun({ ...baseLog, output: finalOutput, status, error: runError });
    } else if (killReason === 'stdin_error') {
      status = 'error'; runError = 'stdin_error';
      logAgentRun({ ...baseLog, output: finalOutput, status, error: runError });
    } else if (killReason === 'client_disconnect') {
      status = 'cancelled'; runError = 'client_disconnect';
      logAgentRun({ ...baseLog, output: finalOutput, status, error: runError });
    } else if (killReason === 'stream_dead') {
      status = 'error'; runError = 'stream_dead';
      logAgentRun({ ...baseLog, output: finalOutput, status, error: runError });
    } else if (code !== 0) {
      const partial = fullOutput.trim() ? ' after partial output' : '';
      send({
        type: 'error',
        code: `exit_${code}`,
        error: `claude exited with code ${code}${partial}`,
        stderrTail: stderrTail.slice(-500),
        tip: stderrTail.toLowerCase().includes('not authenticated') || stderrTail.toLowerCase().includes('login')
          ? 'Run `claude login` to authenticate the CLI.'
          : 'Inspect stderrTail for the actual error from the claude CLI.',
        durationMs: duration,
        reqId,
      });
      status = 'error'; runError = `exit_code_${code}`;
      logAgentRun({ ...baseLog, output: finalOutput, status, error: runError });
    } else if (code === 0 && !finalOutput) {
      const lowered = stderrTail.toLowerCase();
      const tip = lowered.includes('not authenticated') || lowered.includes('login') || lowered.includes('credentials')
        ? 'Run `claude login` to authenticate.'
        : lowered.includes('rate limit') || lowered.includes('429')
        ? 'You hit an upstream rate limit. Retry after a minute.'
        : 'Make sure the Claude Code CLI is logged in (`claude login`) and installed (`claude --version`). Hit /setup → Run Self-Test for full diagnostics.';
      send({
        type: 'error',
        code: 'empty_output',
        error: 'claude exited 0 but produced no output.',
        stderrTail: stderrTail.slice(-500),
        tip,
        durationMs: duration,
        reqId,
      });
      status = 'error'; runError = 'empty_output'; finalOutput = '';
      logAgentRun({ ...baseLog, output: '', status, error: runError });
    } else {
      const trimmedOutput = finalOutput;
      send({ type: 'done', output: trimmedOutput, exitCode: code, durationMs: duration, historyId, threadId: threadId || null });
      status = 'success'; runError = null; finalOutput = trimmedOutput;
      logAgentRun({ ...baseLog, output: trimmedOutput, status: 'success' });
      // Cache for idempotency replay (5-min TTL)
      if (idempotencyKey) {
        idemStore.set(idempotencyKey, { output: trimmedOutput, timestamp: Date.now() });
      }
    }

    // Durable user-facing history row at EVERY terminal state (never lost).
    persistPlaygroundRow({
      historyId, agentName, prompt: userPrompt, output: finalOutput,
      duration, status, error: runError, reqId, threadId, turnIndex,
    });

    // Thread message append: record the user turn + the assistant turn so the
    // conversation can be reopened and continued. Append for both success and
    // error (error turns carry the failure status so the thread reflects reality).
    if (threadId) {
      try {
        db.createPlaygroundThread({ id: threadId, title: userPrompt.slice(0, 80), agentName: agentName || 'custom' });
        db.appendPlaygroundMessage(threadId, { id: `${historyId}-u`, role: 'user', content: userPrompt, status: 'success', metadata: { reqId } });
        db.appendPlaygroundMessage(threadId, { id: `${historyId}-a`, role: 'assistant', content: finalOutput || (runError ? `Error: ${runError}` : ''), status, duration, metadata: { reqId, error: runError } });
      } catch (e) { console.error('[playground] thread append failed:', e.message); }
    }

    finish();
  });

  proc.on('error', (err) => {
    if (ended) return;
    // Log full error server-side; send structured error to client with cause+tip.
    console.error('[playground] spawn error', { agent: agentName || 'custom', reqId, code: err.code, msg: err.message });
    const cause = err.code === 'ENOENT'
      ? `claude binary not found at "${claudePath}"`
      : err.code === 'EACCES'
      ? `permission denied: ${claudePath} is not executable`
      : `spawn ${err.code || 'failed'}: ${err.message}`;
    send({
      type: 'error',
      code: `spawn_${err.code || 'failed'}`,
      error: 'Failed to start claude.',
      cause,
      tip: 'Visit /setup and click Run Self-Test for full diagnostics.',
      reqId,
    });
    const spawnDuration = Date.now() - playgroundStartTime;
    logAgentRun({
      agentName: agentName || 'custom',
      prompt: userPrompt,
      output: fullOutput.trim(),
      source: req.body.source || 'playground',
      duration: spawnDuration,
      status: 'error',
      error: `spawn_error: ${err.code || 'unknown'}`,
      metadata: { reqId, killReason, claudePath },
    });
    persistPlaygroundRow({
      historyId, agentName, prompt: userPrompt, output: fullOutput.trim(),
      duration: spawnDuration, status: 'error', error: `spawn_error_${err.code || 'unknown'}`,
      reqId, threadId, turnIndex,
    });
    finish();
  });

  let stdinErrorHandled = false;
  const handleStdinErr = (err) => {
    if (stdinErrorHandled || ended) return;
    stdinErrorHandled = true;
    console.error('[playground] stdin error', { agent: agentName || 'custom', reqId, code: err.code, msg: err.message });
    send({
      type: 'error',
      code: `stdin_${err.code || 'failed'}`,
      error: 'Failed to deliver prompt to agent.',
      cause: err.message || String(err),
      tip: 'The claude process may have exited before reading stdin. Check stderrTail or rerun.',
      stderrTail: stderrTail.slice(-500),
      reqId,
    });
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

// GET /api/playground/preflight
// Returns binary/auth/env diagnostics + optional agent-existence check.
// Frontend calls this before /playground/run so it can show actionable
// errors inline instead of waiting for the spawn to fail.
router.get('/playground/preflight', rateLimit('read'), (req, res) => {
  try {
    const pre = claudeBinary.runPreflight();
    const agentName = String(req.query.agent || '').trim();
    let agentCheck = null;
    if (agentName) {
      const config = loadConfig();
      const map = getAgentContentMap(CLAUDE_DIR, config);
      const lookup = resolveAgentLookup(map, agentName);
      agentCheck = {
        ok: !!lookup.match,
        tried: lookup.tried,
        candidates: lookup.candidates,
      };
    }
    res.json({
      binary: pre.binary,
      auth: pre.auth,
      env: pre.env,
      agent: agentCheck,
      okToRun: pre.binary.ok && (!agentName || agentCheck.ok),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/playground/history
router.get('/playground/history', rateLimit('read'), (req, res) => {
  res.json(loadPlaygroundHistory());
});

// POST /api/playground/history
// Non-destructive row upsert (was: rewrite-the-whole-table, which raced and
// could clobber backend-written rows). The frontend sends the SAME id the
// backend used for this run, so INSERT OR REPLACE converges on one row.
router.post('/playground/history', rateLimit('write'), (req, res) => {
  const { id, agent, agentName, prompt, output, duration, status, error, timestamp, threadId, turnIndex } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const MAX_OUTPUT = 500_000;
  const rawOutput = output || '';
  const truncated = rawOutput.length > MAX_OUTPUT;
  const entry = {
    id: id || genId(),
    agentName: agentName || agent || 'Unknown',
    prompt: (prompt || '').slice(0, 10_000),
    output: rawOutput.slice(0, MAX_OUTPUT),
    duration: duration || 0,
    status: status || 'success',
    error: error || null,
    timestamp: timestamp || new Date().toISOString(),
    metadata: { source: 'frontend' },
    threadId: threadId || null,
    turnIndex: typeof turnIndex === 'number' ? turnIndex : null,
  };
  try {
    db.upsertPlaygroundHistoryRow(entry);
  } catch (err) {
    console.error('[playground] history upsert failed:', err.message);
    return res.status(500).json({ error: 'history persist failed' });
  }
  res.status(truncated ? 207 : 200).json({ ...entry, truncated });
});

// DELETE /api/playground/history/:id
router.delete('/playground/history/:id', rateLimit('write'), (req, res) => {
  db.deletePlaygroundHistoryRow(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/playground/history
router.delete('/playground/history', rateLimit('write'), (req, res) => {
  db.clearPlaygroundHistory();
  res.json({ ok: true });
});

// ── Playground Threads ──────────────────────────────────────────────────────

// GET /api/playground/threads — list threads (newest first) with messageCount
router.get('/playground/threads', rateLimit('read'), (req, res) => {
  res.json(db.listPlaygroundThreads());
});

// GET /api/playground/threads/:id — full transcript for reopen
router.get('/playground/threads/:id', rateLimit('read'), (req, res) => {
  const thread = db.getPlaygroundThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  res.json(thread);
});

// POST /api/playground/threads — create an empty thread
router.post('/playground/threads', rateLimit('write'), (req, res) => {
  const { id, title, agentName } = req.body || {};
  const threadId = (typeof id === 'string' && /^[\w-]{1,64}$/.test(id)) ? id : genId();
  try {
    const thread = db.createPlaygroundThread({ id: threadId, title: title || 'New conversation', agentName });
    res.json(thread);
  } catch (err) {
    console.error('[playground] create thread failed:', err.message);
    res.status(500).json({ error: 'create thread failed' });
  }
});

// POST /api/playground/threads/:id/seed — promote a finished one-shot run into a
// thread by inserting its user prompt + assistant output as the first turn, so
// the next reply has turn-1 context. Idempotent-ish: only seeds an empty thread.
router.post('/playground/threads/:id/seed', rateLimit('write'), (req, res) => {
  const threadId = req.params.id;
  const { prompt, output, agentName, status } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  try {
    const existing = db.getPlaygroundThread(threadId);
    if (existing && existing.messages && existing.messages.length > 0) {
      return res.json({ ok: true, alreadySeeded: true });
    }
    db.createPlaygroundThread({ id: threadId, title: String(prompt).slice(0, 80), agentName: agentName || 'custom' });
    const base = `seed-${threadId}`;
    db.appendPlaygroundMessage(threadId, { id: `${base}-u`, role: 'user', content: String(prompt).slice(0, 20000), status: 'success' });
    db.appendPlaygroundMessage(threadId, { id: `${base}-a`, role: 'assistant', content: String(output || '').slice(0, 500000), status: status || 'success' });
    res.json({ ok: true, thread: db.getPlaygroundThread(threadId) });
  } catch (err) {
    console.error('[playground] seed thread failed:', err.message);
    res.status(500).json({ error: 'seed thread failed' });
  }
});

// PATCH /api/playground/threads/:id — rename a conversation
router.patch('/playground/threads/:id', rateLimit('write'), (req, res) => {
  const { title } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (title.length > 200) return res.status(400).json({ error: 'title too long (max 200)' });
  try {
    const thread = db.renamePlaygroundThread(req.params.id, title);
    if (!thread) return res.status(404).json({ error: 'thread not found' });
    res.json(thread);
  } catch (err) {
    console.error('[playground] rename thread failed:', err.message);
    res.status(500).json({ error: 'rename thread failed' });
  }
});

// DELETE /api/playground/threads/:id — delete thread + its messages (cascade)
router.delete('/playground/threads/:id', rateLimit('write'), (req, res) => {
  db.deletePlaygroundThread(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
