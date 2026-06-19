'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { rateLimit } = require('../middleware/rateLimit');
const { loadConfig } = require('../lib/config');
const { discoverProjects, listMdFiles } = require('../lib/discovery');
const { listAgents } = require('../lib/cache');
const { readFileSafe, ensureDir, atomicWriteText } = require('../lib/atomicIo');
const db = require('../db');
const aiRuns = require('../lib/aiRuns');

// Wall timeout for an abandoned background AI run: if every viewer detaches
// (refresh/navigate) and nobody reattaches, the process is force-killed after
// this so a truly-orphaned generation can't run forever. Reattach/cancel are
// unaffected — only a genuinely abandoned run hits this.
const AI_RUN_WALL_MS = 180_000;

// Validate a client-supplied short id (runId / sessionId). Mirrors the
// playground `okId` rule: 1–64 chars of [\w-].
function okShortId(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[\w-]+$/.test(v);
}

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const DOCS_PATH = path.join(__dirname, '..', '..', 'docs');

// ── Docs context cache ──────────────────────────────────────────────────────
let _docsCache = null;
let _docsCacheTime = 0;
const DOCS_CACHE_TTL = 5 * 60 * 1000;

function loadDocsContext() {
  const now = Date.now();
  if (_docsCache && (now - _docsCacheTime) < DOCS_CACHE_TTL) return _docsCache;
  try {
    if (!fs.existsSync(DOCS_PATH)) { _docsCache = ''; return ''; }
    const files = fs.readdirSync(DOCS_PATH).filter(f => f.endsWith('.md')).sort();
    const parts = files.map(f => {
      const content = fs.readFileSync(path.join(DOCS_PATH, f), 'utf-8').trim();
      return `### ${f}\n${content}`;
    });
    _docsCache = parts.join('\n\n---\n\n');
    _docsCacheTime = now;
    return _docsCache;
  } catch { return ''; }
}

function buildAiSystemPrompt(clientSystem) {
  const base = clientSystem || 'You are an expert Claude Code assistant helping users write and improve their Claude agents, commands, rules, and CLAUDE.md files. Be concise and practical.';
  const docs = loadDocsContext();
  if (!docs) return base;
  return `${base}

---

## Polyglot Documentation (your knowledge base — use this to answer questions)

${docs}

---

When a user asks how something works, what to add, or how to use any feature, answer using the documentation above. Be concise and practical.`;
}

function loadHistory() { return db.loadChatHistory(); }
function saveHistory(history) { try { db.saveChatHistory(history); } catch (err) { console.error('[saveChatHistory] DB write failed:', err.message); throw err; } }

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// GET /api/ai/history
router.get('/ai/history', (req, res) => {
  try {
    const history = loadHistory();
    res.json(history.map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt, messageCount: s.messages.length })));
  } catch (err) { res.status(500).json({ error: 'Failed to load history' }); }
});

// GET /api/ai/history/:id
router.get('/ai/history/:id', (req, res) => {
  try {
    const session = loadHistory().find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
  } catch (err) { res.status(500).json({ error: 'Failed to load session' }); }
});

// POST /api/ai/history
router.post('/ai/history', rateLimit('write'), (req, res) => {
  try {
    const { id, title, messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });
    const history = loadHistory();
    const now = new Date().toISOString();
    const sessionId = id || genId();
    const idx = history.findIndex(s => s.id === sessionId);
    const session = { id: sessionId, title: title || 'New Chat', messages, createdAt: now, updatedAt: now };
    if (idx >= 0) {
      session.createdAt = history[idx].createdAt;
      history[idx] = session;
    } else {
      history.unshift(session);
    }
    saveHistory(history.slice(0, 100));
    res.json({ id: sessionId });
  } catch (err) { res.status(500).json({ error: 'Failed to save history' }); }
});

// DELETE /api/ai/history/:id
router.delete('/ai/history/:id', rateLimit('write'), (req, res) => {
  try {
    saveHistory(loadHistory().filter(s => s.id !== req.params.id));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Failed to delete session' }); }
});

// GET /api/ai/context
router.get('/ai/context', (req, res) => {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  const globalAgentsList = listAgents(path.join(CLAUDE_DIR, 'agents'));
  const globalClaudeMdContent = readFileSafe(path.join(CLAUDE_DIR, 'CLAUDE.md'));

  const ctx = {
    globalClaudeMd: {
      path: path.join(CLAUDE_DIR, 'CLAUDE.md'),
      content: globalClaudeMdContent || '',
    },
    globalAgentsDir: path.join(CLAUDE_DIR, 'agents'),
    globalAgents: globalAgentsList.map(a => ({
      name: a.name,
      description: a.description,
      path: path.join(CLAUDE_DIR, 'agents', a.filename + '.md'),
      content: a.raw,
    })),
    globalRulesDir: path.join(CLAUDE_DIR, 'rules'),
    globalRules: listMdFiles(path.join(CLAUDE_DIR, 'rules')).map(r => ({
      name: r.name, path: r.path, content: r.content,
    })),
    projects: projects.map(p => ({
      name: p.name,
      path: p.path,
      agentsDir: path.join(p.path, '.claude', 'agents'),
      commandsDir: path.join(p.path, '.claude', 'commands'),
      rulesDir: path.join(p.path, '.claude', 'rules'),
      claudeMd: {
        path: path.join(p.path, 'CLAUDE.md'),
        content: readFileSafe(path.join(p.path, 'CLAUDE.md')) || '',
      },
      agents: p.agents.map(a => ({
        name: a.name,
        description: a.description,
        path: path.join(p.path, '.claude', 'agents', a.filename + '.md'),
        content: a.raw,
      })),
      commands: listMdFiles(path.join(p.path, '.claude', 'commands')).map(c => ({
        name: c.name, path: c.path, content: c.content,
      })),
      rules: listMdFiles(path.join(p.path, '.claude', 'rules')).map(r => ({
        name: r.name, path: r.path, content: r.content,
      })),
    })),
  };

  res.json(ctx);
});

// POST /api/ai/apply
router.post('/ai/apply', rateLimit('write'), (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath || typeof filePath !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: 'filePath and content required' });
  }
  if (filePath.includes('\0')) return res.status(400).json({ error: 'Invalid path' });

  const resolved = path.resolve(filePath.replace(/^~/, HOME));
  const config = loadConfig();
  const allowedRoots = [
    CLAUDE_DIR,
    ...config.projectDirs.map(d => path.resolve(d.replace(/^~/, HOME))),
  ];
  const allowed = allowedRoots.some(root =>
    resolved === root || resolved.startsWith(root + path.sep)
  );
  if (!allowed) return res.status(403).json({ error: 'Path outside allowed directories' });

  // Deny writes to secret/credential/config files by pattern, not an exact
  // basename list (C7 audit — the old list missed .env.* variants, .npmrc,
  // settings.json hook injection, .git/.aws/.ssh, *.pem/*.key).
  const lower = resolved.toLowerCase();
  const base = path.basename(lower);
  const segs = lower.split(path.sep);
  const BLOCKED_EXACT = new Set([
    'credentials.json', 'id_rsa', 'id_ed25519', 'id_ecdsa', '.npmrc',
    'settings.json', 'settings.local.json',
  ]);
  const blocked =
    base.startsWith('.env') ||
    base.endsWith('.pem') ||
    base.endsWith('.key') ||
    BLOCKED_EXACT.has(base) ||
    segs.includes('.git') || segs.includes('.aws') || segs.includes('.ssh');
  if (blocked) {
    return res.status(403).json({ error: 'Cannot write to sensitive files' });
  }

  try {
    ensureDir(path.dirname(resolved));
    atomicWriteText(resolved, content);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file' });
  }
});

// GET /api/ai/docs-cache
router.get('/ai/docs-cache', (req, res) => {
  res.json({ cached: !!_docsCache, age: _docsCacheTime ? Date.now() - _docsCacheTime : null, content: _docsCache || '' });
});

// POST /api/ai/chat
router.post('/ai/chat', rateLimit('heavy'), (req, res) => {
  res.setTimeout(0);
  const { messages, system } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const systemText = buildAiSystemPrompt(system);

  let prompt = systemText + '\n\n';
  for (const msg of messages) {
    if (msg.role === 'user') prompt += `Human: ${msg.content}\n\n`;
    else if (msg.role === 'assistant') prompt += `Assistant: ${msg.content}\n\n`;
  }
  prompt += 'Assistant:';

  const claudePath = process.env.CLAUDE_PATH || 'claude';
  const childEnv = { ...process.env, HOME: os.homedir() };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
  delete childEnv.CLAUDE_AGENT_SDK_VERSION;

  const proc = spawn(claudePath, ['-p'], { env: childEnv });

  let output = '';
  let errOutput = '';

  proc.stdout.on('data', (data) => { output += data.toString(); });
  proc.stderr.on('data', (data) => { errOutput += data.toString(); });

  proc.on('close', (code) => {
    if (code !== 0) {
      require('../lib/logger').error(`AI chat: claude exited code ${code}`, { category: 'integration', meta: { stderr: errOutput.slice(0, 500) } });
      return res.status(500).json({ error: `Agent process exited with code ${code}` });
    }
    res.json({ content: output.trim() });
  });

  proc.on('error', (err) => {
    require('../lib/logger').error(err, { category: 'integration', meta: { phase: 'spawn', surface: 'ai/chat', code: err.code } });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to start agent process' });
  });

  let stdinDone = false;
  proc.stdin.on('error', (err) => {
    if (stdinDone) return;
    stdinDone = true;
    require('../lib/logger').warn(`ai/chat stdin error: ${err.message}`, { category: 'integration', meta: { code: err.code } });
    try { proc.kill(); } catch {}
    if (!res.headersSent) res.status(500).json({ error: 'Failed to deliver prompt to agent' });
  });
  proc.stdin.write(prompt, 'utf8', (err) => {
    if (err) return;
    try { proc.stdin.end(); } catch {}
  });
});

// POST /api/ai/stream — background-run resilient AI chat.
//
// The RUN is the source of truth; the HTTP response is just one detachable
// viewer (mirrors the proven playground pattern). On client disconnect
// (refresh / navigate / tab close) we UNSUBSCRIBE — we never kill the process —
// so a returning client can re-attach to the live generation. The process dies
// only on an explicit Stop (cancel route) or the wall timeout for a truly
// abandoned run.
router.post('/ai/stream', rateLimit('heavy'), (req, res) => {
  res.setTimeout(0);
  const { messages, system } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  // Client-generated runId + sessionId (so a refresh can find + reattach the
  // run). Validate short [\w-]{1,64}; fall back to a crypto id if absent/bad.
  let { runId, sessionId } = req.body;
  if (runId != null && !okShortId(runId)) return res.status(400).json({ error: 'Invalid runId' });
  if (sessionId != null && !okShortId(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });
  if (!runId) runId = crypto.randomUUID();
  if (!sessionId) sessionId = null;

  const systemText = buildAiSystemPrompt(system);

  let prompt = systemText + '\n\n';
  for (const msg of messages) {
    if (msg.role === 'user') prompt += `Human: ${msg.content}\n\n`;
    else if (msg.role === 'assistant') prompt += `Assistant: ${msg.content}\n\n`;
  }
  prompt += 'Assistant:';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Register the run + attach the initial client as a subscriber. `send` fans
  // out to every subscriber (initial + reattached) and buffers chunks for replay.
  const run = aiRuns.createRun({ id: runId, sessionId, output: '' });
  aiRuns.subscribe(run, res);
  const send = (data) => { aiRuns.broadcast(run, data); };

  const claudePath = process.env.CLAUDE_PATH || 'claude';
  const childEnv = { ...process.env, HOME: os.homedir() };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
  delete childEnv.CLAUDE_AGENT_SDK_VERSION;

  const proc = spawn(claudePath, ['-p'], { env: childEnv });
  let fullOutput = '';
  let errOutput = '';

  // Expose force-stop so the explicit cancel route can end this background run.
  run.kill = () => { try { proc.kill(); } catch { /* already dead */ } };

  let responded = false;
  // Broadcast a terminal event to every viewer, then mark the run done (ends all
  // attached responses + schedules grace eviction). Idempotent.
  const endStream = (eventData) => {
    if (responded) return;
    responded = true;
    if (wallTimer) clearTimeout(wallTimer);
    send(eventData);
    aiRuns.markDone(run);
  };

  // Wall timeout for an abandoned run (no viewer reattaches). Reattach/cancel
  // don't reset this — only a genuinely orphaned generation hits it.
  const wallTimer = setTimeout(() => {
    if (responded) return;
    try { proc.kill(); } catch { /* already dead */ }
    endStream({ type: 'error', error: `AI chat timed out after ${AI_RUN_WALL_MS / 1000}s` });
  }, AI_RUN_WALL_MS);
  if (wallTimer.unref) wallTimer.unref();

  proc.stdout.on('data', (data) => {
    const chunk = data.toString();
    fullOutput += chunk;
    send({ type: 'chunk', content: chunk });
  });

  proc.stderr.on('data', (data) => { errOutput += data.toString(); });

  proc.on('close', (code, signal) => {
    if (code !== 0 || signal) {
      require('../lib/logger').error(`AI stream: claude exited code ${code}`, { category: 'integration', meta: { signal, stderr: errOutput.slice(0, 500) } });
      endStream({ type: 'error', error: `Agent process exited with code ${code}` });
    } else {
      endStream({ type: 'done', content: fullOutput.trim() });
    }
  });

  proc.on('error', (err) => {
    require('../lib/logger').error(err, { category: 'integration', meta: { phase: 'spawn', surface: 'ai/stream', code: err.code } });
    endStream({ type: 'error', error: 'Failed to start agent process' });
  });

  let streamStdinDone = false;
  proc.stdin.on('error', (err) => {
    if (streamStdinDone) return;
    streamStdinDone = true;
    require('../lib/logger').warn(`ai/stream stdin error: ${err.message}`, { category: 'integration', meta: { code: err.code } });
    try { proc.kill(); } catch {}
    endStream({ type: 'error', error: 'Failed to deliver prompt to agent' });
  });
  proc.stdin.write(prompt, 'utf8', (err) => {
    if (err) return;
    try { proc.stdin.end(); } catch {}
  });

  // Client disconnect (refresh / navigate / tab close) only DETACHES this viewer
  // — the generation keeps running so the user can re-attach after a reload.
  // The process is killed only by an explicit Stop (cancel route) or the wall
  // timeout. This is the core "survive refresh" fix.
  const onClose = () => { aiRuns.unsubscribe(run, res); };
  res.on('close', onClose);
  if (req.socket) req.socket.on('close', onClose);
});

// GET /api/ai/active?sessionId=X — is a run still generating for this chat
// session? The frontend calls this on load to decide whether to re-attach.
router.get('/ai/active', rateLimit('read'), (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const run = sessionId ? aiRuns.getActiveBySession(sessionId) : null;
  if (!run) return res.json({ active: false });
  res.json({
    active: true,
    runId: run.id,
    sessionId: run.sessionId,
    output: run.output,          // text generated so far
    startedAt: run.startedAt,
  });
});

// GET /api/ai/run/:id/stream — RE-ATTACH to a background run as an SSE viewer.
// Replays the text produced so far, then streams live until the run finishes.
// If the run is unknown/evicted, tells the client to fall back to its persisted
// session.
router.get('/ai/run/:id/stream', rateLimit('read'), (req, res) => {
  const run = aiRuns.getRun(req.params.id);
  res.setTimeout(0);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  if (!run) {
    res.write(`data: ${JSON.stringify({ type: 'error', code: 'run_not_found', error: 'Run not found — it may have finished. Restoring the conversation.' })}\n\n`);
    try { res.end(); } catch {}
    return;
  }
  // Re-announce + replay everything generated so far.
  res.write(`data: ${JSON.stringify({ type: 'start', runId: run.id, sessionId: run.sessionId, reattach: true })}\n\n`);
  if (run.output) res.write(`data: ${JSON.stringify({ type: 'chunk', content: run.output })}\n\n`);
  if (run.status === 'running') {
    aiRuns.subscribe(run, res);
    res.on('close', () => aiRuns.unsubscribe(run, res));
  } else {
    // Finished while we were away — send the terminal event + close.
    if (run.finalEvent) res.write(`data: ${JSON.stringify(run.finalEvent)}\n\n`);
    else res.write(`data: ${JSON.stringify({ type: 'done', content: run.output })}\n\n`);
    try { res.end(); } catch {}
  }
});

// POST /api/ai/run/:id/cancel — explicit Stop. Force-kills the background
// process (a refresh does NOT — only this does).
router.post('/ai/run/:id/cancel', rateLimit('write'), (req, res) => {
  const run = aiRuns.getRun(req.params.id);
  if (!run || run.status !== 'running') return res.json({ ok: true, alreadyDone: true });
  if (typeof run.kill === 'function') run.kill('user_cancel');
  res.json({ ok: true });
});

module.exports = router;
