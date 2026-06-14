'use strict';

// GET /api/system/status — ONE aggregate the System Health cockpit polls. It does
// not compute new metrics; it stitches together signals that already exist (health,
// schedules, observability, intelligence index) + probes the external deps (Ollama,
// LaunchAgent, the user-scoped MCP, the SubagentStop hook). Each subsystem carries
// its own state (ok|degraded|down) + a one-line note so the UI just colors by state.
// Cached 8s (the page polls ~15s; nothing here should hammer launchctl/ollama).

const { Router } = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const router = Router();
const db = require('../db');
const systemSchedules = require('../lib/systemSchedules');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const HOME = os.homedir();
const CACHE_MS = 8000;
let _cache = { at: 0, data: null };

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const byId = (list, id) => (list || []).find((s) => s.id === id) || null;

async function probeOllama() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const j = await res.json();
    return { ok: true, models: (j.models || []).map((m) => m.name).slice(0, 8) };
  } catch (e) { return { ok: false, error: e.message }; }
}

function launchAgentStatus() {
  return new Promise((resolve) => {
    execFile('launchctl', ['list', 'io.boldteq.polyglot'], { timeout: 1500 }, (err, stdout) => {
      if (err) return resolve({ managed: false });
      const m = String(stdout).match(/"PID"\s*=\s*(\d+)/);
      resolve({ managed: true, pid: m ? Number(m[1]) : null });
    });
  });
}

async function indexStats() {
  try {
    const { getStore, storeKind } = await import('../intelligence/store.mjs');
    const s = await getStore().stats();
    return { ok: true, store: storeKind(), total: s.total || 0, byType: s.byType || {} };
  } catch (e) { return { ok: false, error: e.message, total: 0 }; }
}

async function build() {
  const timestamp = new Date().toISOString();

  // ── crons (also feeds memory/eval last-run) ──
  let crons = [];
  try {
    crons = systemSchedules.getAllForApi().map((s) => ({
      id: s.id, name: s.name, enabled: s.enabled, lastRunAt: s.lastRunAt,
      lastRunStatus: s.lastRunStatus, nextRunAt: s.nextRunAt, needsLlm: s.needsLlm,
    }));
  } catch { /* schedules unavailable */ }

  // ── server / always-on ──
  const server = { uptimeSec: Math.floor(process.uptime()) };
  try {
    const ping = db.getDb().prepare('SELECT 1 AS ok').get();
    server.db = { status: ping?.ok === 1 ? 'ok' : 'error' };
    const dbPath = path.join(__dirname, '..', '..', 'data', 'polyglot.db');
    if (fs.existsSync(dbPath)) server.db.sizeMB = Math.round(fs.statSync(dbPath).size / 1048576);
  } catch { server.db = { status: 'error' }; }
  server.launchAgent = await launchAgentStatus();
  server.state = server.db?.status === 'error' ? 'down' : server.launchAgent.managed ? 'ok' : 'degraded';
  server.note = server.db?.status === 'error' ? 'database unreachable'
    : server.launchAgent.managed ? `LaunchAgent-managed (pid ${server.launchAgent.pid ?? '?'}) · ${Math.floor(server.uptimeSec / 60)}m up`
      : 'running but NOT LaunchAgent-managed — no auto-restart';

  // ── memory brain (Pillar 2) ──
  const [ollama, index] = await Promise.all([probeOllama(), indexStats()]);
  const reindex = byId(crons, 'sys-intel-reindex');
  const mcpUserScoped = !!readJson(path.join(HOME, '.claude.json'))?.mcpServers?.['boldteq-memory'];
  const memory = {
    ollama, index, mcpUserScoped,
    lastReindex: reindex ? { at: reindex.lastRunAt, status: reindex.lastRunStatus } : null,
  };
  memory.state = !ollama.ok ? 'degraded' : (index.total > 0 ? 'ok' : 'degraded');
  memory.note = !ollama.ok ? 'Ollama unreachable — search/capture/reindex offline'
    : index.total > 0 ? `${index.total.toLocaleString()} chunks · MCP ${mcpUserScoped ? 'user-scoped ✓' : 'NOT user-scoped'}`
      : 'index empty — run reindex';

  // ── evaluation (Pillar 3) ──
  let scores = [];
  try { scores = db.getEvalScores({ limit: 50 }); } catch { /* table missing pre-migration */ }
  const evalSched = byId(crons, 'sys-intel-eval');
  const avgOverall = scores.length ? +(scores.reduce((a, e) => a + (e.overall || 0), 0) / scores.length).toFixed(3) : null;
  const passRate = scores.length ? +(scores.filter((e) => e.pass).length / scores.length).toFixed(2) : null;
  const evaluation = {
    lastRun: evalSched ? { at: evalSched.lastRunAt, status: evalSched.lastRunStatus } : null,
    scores: { count: scores.length, avgOverall, passRate },
  };
  evaluation.state = scores.length === 0 ? 'degraded' : (avgOverall >= 0.7 ? 'ok' : 'degraded');
  evaluation.note = scores.length === 0 ? 'no judge scores yet — run the eval self-test'
    : `avg ${avgOverall} · ${Math.round((passRate || 0) * 100)}% pass (${scores.length})`;

  // ── observability (Pillar 1/5) ──
  let spend = {}; let recentBlocks = 0; let recentDelegations = 0;
  try { spend = db.getSpend() || {}; } catch { /* table missing */ }
  try { recentBlocks = (db.getPolicyAudit({ decision: 'block', limit: 50 }) || []).length; } catch { /* */ }
  try { recentDelegations = (db.getDelegations({ limit: 50 }) || []).length; } catch { /* */ }
  const observability = { spend, recentBlocks, recentDelegations };
  observability.state = 'ok'; // wired = working; real-cost presence is informational
  observability.note = spend.realCalls > 0 ? `real cost tracked ($${spend.realCostUsd})` : 'no real-token runs recorded yet';

  // ── VS Code → learning loop (the new wiring) ──
  const hookRegistered = !!readJson(path.join(HOME, '.claude', 'settings.json'))?.hooks?.SubagentStop;
  let vs = [];
  try { vs = (db.getRecentAgentRuns(24) || []).filter((r) => r.source === 'vscode'); } catch { /* */ }
  const vsSuccess = vs.length ? +(vs.filter((r) => r.status === 'success').length / vs.length).toFixed(2) : null;
  const vscode = { hookRegistered, runs24h: { count: vs.length, successRate: vsSuccess } };
  vscode.state = !hookRegistered ? 'degraded' : (vs.length > 0 ? 'ok' : 'degraded');
  vscode.note = !hookRegistered ? 'SubagentStop hook not registered'
    : vs.length > 0 ? `${vs.length} VS Code run${vs.length === 1 ? '' : 's'} ingested (24h)`
      : 'hook set — no runs ingested yet (run a Task in VS Code)';

  const states = [server.state, memory.state, evaluation.state, observability.state, vscode.state];
  const overall = states.includes('down') ? 'down' : states.includes('degraded') ? 'degraded' : 'ok';

  return { timestamp, overall, server, memory, evaluation, observability, vscode, crons };
}

router.get('/system/status', async (req, res) => {
  if (_cache.data && Date.now() - _cache.at < CACHE_MS) return res.json(_cache.data);
  try {
    const data = await build();
    _cache = { at: Date.now(), data };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
