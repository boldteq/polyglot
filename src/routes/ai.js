'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { rateLimit } = require('../middleware/rateLimit');
const { loadConfig } = require('../lib/config');
const { discoverProjects, listMdFiles } = require('../lib/discovery');
const { listAgents } = require('../lib/cache');
const { readFileSafe, ensureDir, atomicWriteText } = require('../lib/atomicIo');
const db = require('../db');

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

  const basename = path.basename(resolved).toLowerCase();
  const BLOCKED_FILES = ['.env', '.env.local', '.env.production', 'credentials.json', 'id_rsa', 'id_ed25519'];
  if (BLOCKED_FILES.includes(basename)) {
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
      console.error('[ai/chat] claude exited non-zero', { code, stderr: errOutput.slice(0, 500) });
      db.insertErrorLog({ source: 'server', message: `AI chat: claude exited code ${code}`, context: { stderr: errOutput.slice(0, 500) } });
      return res.status(500).json({ error: `Agent process exited with code ${code}` });
    }
    res.json({ content: output.trim() });
  });

  proc.on('error', (err) => {
    console.error('[ai/chat] spawn error', { code: err.code, msg: err.message });
    db.insertErrorLog({ source: 'server', message: `AI chat spawn error: ${err.message}`, stack: err.stack, context: { code: err.code } });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to start agent process' });
  });

  let stdinDone = false;
  proc.stdin.on('error', (err) => {
    if (stdinDone) return;
    stdinDone = true;
    console.error('[ai/chat] stdin error', { code: err.code, msg: err.message });
    try { proc.kill(); } catch {}
    if (!res.headersSent) res.status(500).json({ error: 'Failed to deliver prompt to agent' });
  });
  proc.stdin.write(prompt, 'utf8', (err) => {
    if (err) return;
    try { proc.stdin.end(); } catch {}
  });
});

// POST /api/ai/stream
router.post('/ai/stream', rateLimit('heavy'), (req, res) => {
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const claudePath = process.env.CLAUDE_PATH || 'claude';
  const childEnv = { ...process.env, HOME: os.homedir() };
  delete childEnv.CLAUDECODE;
  delete childEnv.CLAUDE_CODE_ENTRYPOINT;
  delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
  delete childEnv.CLAUDE_AGENT_SDK_VERSION;

  const proc = spawn(claudePath, ['-p'], { env: childEnv });
  let fullOutput = '';
  let errOutput = '';

  proc.stdout.on('data', (data) => {
    const chunk = data.toString();
    fullOutput += chunk;
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
  });

  proc.stderr.on('data', (data) => { errOutput += data.toString(); });

  let responded = false;
  const endStream = (eventData) => {
    if (responded) return;
    responded = true;
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    res.end();
  };

  proc.on('close', (code, signal) => {
    if (code !== 0 || signal) {
      console.error('[ai/stream] claude exited non-zero', { code, signal, stderr: errOutput.slice(0, 500) });
      db.insertErrorLog({ source: 'server', message: `AI stream: claude exited code ${code}`, context: { signal, stderr: errOutput.slice(0, 500) } });
      endStream({ type: 'error', error: `Agent process exited with code ${code}` });
    } else {
      endStream({ type: 'done', content: fullOutput.trim() });
    }
  });

  proc.on('error', (err) => {
    console.error('[ai/stream] spawn error', { code: err.code, msg: err.message });
    db.insertErrorLog({ source: 'server', message: `AI stream spawn error: ${err.message}`, stack: err.stack, context: { code: err.code } });
    endStream({ type: 'error', error: 'Failed to start agent process' });
  });

  // Filter stderr before forwarding to client (don't leak credentials / paths)
  proc.stderr.on('data', (data) => { errOutput += data.toString(); });

  let streamStdinDone = false;
  proc.stdin.on('error', (err) => {
    if (streamStdinDone) return;
    streamStdinDone = true;
    console.error('[ai/stream] stdin error', { code: err.code, msg: err.message });
    try { proc.kill(); } catch {}
    endStream({ type: 'error', error: 'Failed to deliver prompt to agent' });
  });
  proc.stdin.write(prompt, 'utf8', (err) => {
    if (err) return;
    try { proc.stdin.end(); } catch {}
  });

  const socket = req.socket;
  if (socket) {
    socket.on('close', () => {
      if (!responded) { try { proc.kill(); } catch {} }
    });
  }
});

module.exports = router;
