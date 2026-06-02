'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { rateLimit } = require('../middleware/rateLimit');
const { loadConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');
const { listAgents } = require('../lib/cache');
const { topoSort, topoLevels } = require('../lib/graph');
const db = require('../db');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

function loadOrchestrations() { return db.loadOrchestrations(); }
function loadRunHistory() { return db.loadRunHistory(); }
function loadApprovals() { return db.loadApprovals(); }
function saveApprovals(list) { try { db.saveApprovals(list); } catch (err) { console.error('[saveApprovals] DB write failed:', err.message); } }
function loadGlobalSettings() {
  const fp = path.join(CLAUDE_DIR, 'settings.json');
  try { if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {} return {};
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Pending approval resolvers (in-process — lives in module scope)
const pendingApprovalResolvers = new Map();

function waitForApproval(runId, nodeId, nodeLabel, timeoutMinutes = 60) {
  return new Promise((resolve, reject) => {
    const key = `${runId}:${nodeId}`;
    const timer = setTimeout(() => {
      pendingApprovalResolvers.delete(key);
      saveApprovals(loadApprovals().filter(a => a.key !== key));
      reject(new Error(`Approval timed out after ${timeoutMinutes} minutes`));
    }, timeoutMinutes * 60 * 1000);

    pendingApprovalResolvers.set(key, { resolve, reject, timer });

    const approvals = loadApprovals();
    approvals.push({ key, runId, nodeId, nodeLabel, createdAt: new Date().toISOString(), timeoutMinutes });
    saveApprovals(approvals);
  });
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

async function sendFailureAlert(agentName, nodeLabel, error, orchestrationName) {
  try {
    const settings = loadGlobalSettings();
    const url = settings.slackWebhookUrl;
    if (!url || !settings.alertOnFailure) return;
    const payload = {
      text: `:warning: *Agent Failure* in Polyglot`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: 'Agent Failure Alert' } },
        { type: 'section', fields: [
          { type: 'mrkdwn', text: `*Agent:*\n${agentName}` },
          { type: 'mrkdwn', text: `*Node:*\n${nodeLabel}` },
          { type: 'mrkdwn', text: `*Pipeline:*\n${orchestrationName || 'Direct'}` },
          { type: 'mrkdwn', text: `*Error:*\n${(error || '').slice(0, 200)}` },
        ]},
      ],
    };
    const http = require('http');
    const https = require('https');
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } });
    req.on('error', () => {});
    req.write(JSON.stringify(payload));
    req.end();
  } catch (err) { console.warn('[slack] Webhook failed:', err.message); }
}

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

// GET /api/orchestrations
// ── Pipeline Templates ────────────────────────────────────────────────────────
const PIPELINE_TEMPLATES = [
  {
    id: 'tpl-new-feature',
    name: 'New Feature',
    description: 'Plan → Architect → Build → Test → Review',
    icon: 'Sparkles',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 100, y: 200 }, data: { agentName: 'yash', label: 'Yash — Commander', prompt: '' } },
      { id: 'n2', type: 'agentNode', position: { x: 300, y: 200 }, data: { agentName: 'arya', label: 'Arya — Architecture', prompt: '' } },
      { id: 'n3', type: 'agentNode', position: { x: 500, y: 200 }, data: { agentName: 'koda', label: 'Koda — Feature Builder', prompt: '' } },
      { id: 'n4', type: 'agentNode', position: { x: 700, y: 200 }, data: { agentName: 'luna', label: 'Luna — Testing', prompt: '' } },
      { id: 'n5', type: 'agentNode', position: { x: 900, y: 200 }, data: { agentName: 'sage', label: 'Sage — Code Review', prompt: '' } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', type: 'smoothstep' },
      { id: 'e2-3', source: 'n2', target: 'n3', type: 'smoothstep' },
      { id: 'e3-4', source: 'n3', target: 'n4', type: 'smoothstep' },
      { id: 'e4-5', source: 'n4', target: 'n5', type: 'smoothstep' },
    ],
  },
  {
    id: 'tpl-bug-sprint',
    name: 'Bug Sprint',
    description: 'Diagnose → Fix → Test → Review',
    icon: 'Bug',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 100, y: 200 }, data: { agentName: 'vex', label: 'Vex — Bug Fixer', prompt: '' } },
      { id: 'n2', type: 'agentNode', position: { x: 300, y: 200 }, data: { agentName: 'koda', label: 'Koda — Feature Builder', prompt: '' } },
      { id: 'n3', type: 'agentNode', position: { x: 500, y: 200 }, data: { agentName: 'luna', label: 'Luna — Testing', prompt: '' } },
      { id: 'n4', type: 'agentNode', position: { x: 700, y: 200 }, data: { agentName: 'sage', label: 'Sage — Code Review', prompt: '' } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', type: 'smoothstep' },
      { id: 'e2-3', source: 'n2', target: 'n3', type: 'smoothstep' },
      { id: 'e3-4', source: 'n3', target: 'n4', type: 'smoothstep' },
    ],
  },
  {
    id: 'tpl-saas-launch',
    name: 'SaaS Launch',
    description: 'Validate → Size → Design → Scaffold → Build → Deploy',
    icon: 'Rocket',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 50, y: 200 }, data: { agentName: 'scout', label: 'Scout — Idea Validator', prompt: '' } },
      { id: 'n2', type: 'agentNode', position: { x: 250, y: 200 }, data: { agentName: 'atlas', label: 'Atlas — Market Sizer', prompt: '' } },
      { id: 'n3', type: 'agentNode', position: { x: 450, y: 200 }, data: { agentName: 'arya', label: 'Arya — Architecture', prompt: '' } },
      { id: 'n4', type: 'agentNode', position: { x: 650, y: 200 }, data: { agentName: 'riko', label: 'Riko — Project Setup', prompt: '' } },
      { id: 'n5', type: 'agentNode', position: { x: 850, y: 200 }, data: { agentName: 'koda', label: 'Koda — Feature Builder', prompt: '' } },
      { id: 'n6', type: 'agentNode', position: { x: 1050, y: 200 }, data: { agentName: 'bolt', label: 'Bolt — Deployment', prompt: '' } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', type: 'smoothstep' },
      { id: 'e2-3', source: 'n2', target: 'n3', type: 'smoothstep' },
      { id: 'e3-4', source: 'n3', target: 'n4', type: 'smoothstep' },
      { id: 'e4-5', source: 'n4', target: 'n5', type: 'smoothstep' },
      { id: 'e5-6', source: 'n5', target: 'n6', type: 'smoothstep' },
    ],
  },
  {
    id: 'tpl-content-push',
    name: 'Content Push',
    description: 'Copy → SEO → Distribution',
    icon: 'FileText',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 100, y: 200 }, data: { agentName: 'quill', label: 'Quill — Content & Copy', prompt: '' } },
      { id: 'n2', type: 'agentNode', position: { x: 350, y: 200 }, data: { agentName: 'zeph', label: 'Zeph — SEO', prompt: '' } },
      { id: 'n3', type: 'agentNode', position: { x: 600, y: 200 }, data: { agentName: 'echo', label: 'Echo — Distribution', prompt: '' } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', type: 'smoothstep' },
      { id: 'e2-3', source: 'n2', target: 'n3', type: 'smoothstep' },
    ],
  },
  {
    id: 'tpl-db-migration',
    name: 'DB Migration',
    description: 'Schema → Test → Review → Deploy',
    icon: 'Database',
    nodes: [
      { id: 'n1', type: 'agentNode', position: { x: 100, y: 200 }, data: { agentName: 'dato', label: 'Dato — Database Architect', prompt: '' } },
      { id: 'n2', type: 'agentNode', position: { x: 350, y: 200 }, data: { agentName: 'luna', label: 'Luna — Testing', prompt: '' } },
      { id: 'n3', type: 'agentNode', position: { x: 600, y: 200 }, data: { agentName: 'sage', label: 'Sage — Code Review', prompt: '' } },
      { id: 'n4', type: 'agentNode', position: { x: 850, y: 200 }, data: { agentName: 'bolt', label: 'Bolt — Deployment', prompt: '' } },
    ],
    edges: [
      { id: 'e1-2', source: 'n1', target: 'n2', type: 'smoothstep' },
      { id: 'e2-3', source: 'n2', target: 'n3', type: 'smoothstep' },
      { id: 'e3-4', source: 'n3', target: 'n4', type: 'smoothstep' },
    ],
  },
];

router.get('/orchestrations/templates', (req, res) => {
  res.json(PIPELINE_TEMPLATES);
});

router.get('/orchestrations', (req, res) => {
  res.json(loadOrchestrations());
});

// POST /api/orchestrations
router.post('/orchestrations', rateLimit('write'), (req, res) => {
  const { id, name, nodes, edges } = req.body;
  if (!name || !Array.isArray(nodes) || !Array.isArray(edges)) {
    return res.status(400).json({ error: 'name, nodes, edges required' });
  }
  // Validate graph integrity before persisting so a bad graph can never reach
  // the executor (C17 audit): every node needs a unique string id, every edge
  // endpoint must exist, and the graph must be acyclic.
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) {
      return res.status(400).json({ error: 'every node needs a non-empty string id' });
    }
  }
  if (new Set(nodes.map(n => n.id)).size !== nodes.length) {
    return res.status(400).json({ error: 'duplicate node ids' });
  }
  try {
    topoSort(nodes, edges); // throws GraphError (400) on dangling edge or cycle
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message });
  }
  const now = new Date().toISOString();
  const orcId = id || genId();
  const existing = loadOrchestrations().find(o => o.id === orcId);
  const orc = { id: orcId, name, nodes, edges, updatedAt: now, createdAt: existing?.createdAt || now };
  db.saveOrchestration(orc);
  res.json({ id: orcId });
});

// GET /api/orchestrations/runs (must be before /:id)
router.get('/orchestrations/runs', (req, res) => {
  const history = loadRunHistory();
  res.json(history.map(r => ({
    id: r.id,
    orchestrationName: r.orchestrationName,
    orchestrationId: r.orchestrationId,
    task: r.task,
    status: r.status,
    nodeCount: r.nodeCount,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    duration: r.duration,
  })));
});

// GET /api/orchestrations/runs/:id
router.get('/orchestrations/runs/:id', (req, res) => {
  const run = loadRunHistory().find(r => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// DELETE /api/orchestrations/runs/:id
router.delete('/orchestrations/runs/:id', rateLimit('write'), (req, res) => {
  db.deleteRunHistory(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/orchestrations/runs
router.delete('/orchestrations/runs', rateLimit('write'), (req, res) => {
  db.clearRunHistory();
  res.json({ ok: true });
});

// GET /api/orchestrations/approvals
router.get('/orchestrations/approvals', rateLimit('read'), (req, res) => {
  res.json(loadApprovals());
});

// POST /api/orchestrations/approve/:runId/:nodeId
// Atomic claim: Map.delete returns true only for the first caller; subsequent
// concurrent requests get 409 instead of double-resolving the promise.
router.post('/orchestrations/approve/:runId/:nodeId', rateLimit('write'), (req, res) => {
  const key = `${req.params.runId}:${req.params.nodeId}`;
  const resolver = pendingApprovalResolvers.get(key);
  if (!resolver) return res.status(404).json({ error: 'No pending approval found' });
  const claimed = pendingApprovalResolvers.delete(key);
  if (!claimed) return res.status(409).json({ error: 'Approval already resolved' });
  clearTimeout(resolver.timer);
  saveApprovals(loadApprovals().filter(a => a.key !== key));
  resolver.resolve();
  res.json({ ok: true, action: 'approved' });
});

// POST /api/orchestrations/reject/:runId/:nodeId
router.post('/orchestrations/reject/:runId/:nodeId', rateLimit('write'), (req, res) => {
  const key = `${req.params.runId}:${req.params.nodeId}`;
  const resolver = pendingApprovalResolvers.get(key);
  if (!resolver) return res.status(404).json({ error: 'No pending approval found' });
  const claimed = pendingApprovalResolvers.delete(key);
  if (!claimed) return res.status(409).json({ error: 'Approval already resolved' });
  clearTimeout(resolver.timer);
  saveApprovals(loadApprovals().filter(a => a.key !== key));
  resolver.reject(new Error(req.body?.reason || 'Rejected by user'));
  res.json({ ok: true, action: 'rejected' });
});

// GET /api/orchestrations/:id
router.get('/orchestrations/:id', (req, res) => {
  const orc = loadOrchestrations().find(o => o.id === req.params.id);
  if (!orc) return res.status(404).json({ error: 'Not found' });
  res.json(orc);
});

// DELETE /api/orchestrations/:id
router.delete('/orchestrations/:id', rateLimit('write'), (req, res) => {
  db.deleteOrchestration(req.params.id);
  res.json({ ok: true });
});

// GET /api/orchestrations/:id/export
router.get('/orchestrations/:id/export', rateLimit('read'), (req, res) => {
  const orc = loadOrchestrations().find(o => o.id === req.params.id);
  if (!orc) return res.status(404).json({ error: 'Orchestration not found' });

  let mermaid = 'graph TD\n';
  for (const node of orc.nodes) {
    const label = node.data?.label || node.id;
    const shape = node.data?.isStart ? `${node.id}([${label}])` : node.data?.isApproval ? `${node.id}{${label}}` : `${node.id}[${label}]`;
    mermaid += `  ${shape}\n`;
  }
  for (const edge of (orc.edges || [])) {
    const cond = orc.nodes.find(n => n.id === edge.target)?.data?.condition;
    mermaid += cond ? `  ${edge.source} -->|${cond}| ${edge.target}\n` : `  ${edge.source} --> ${edge.target}\n`;
  }

  res.json({
    id: orc.id,
    name: orc.name,
    json: { nodes: orc.nodes, edges: orc.edges },
    mermaid,
    nodeCount: orc.nodes.length,
    edgeCount: (orc.edges || []).length,
  });
});

// POST /api/orchestrations/run
router.post('/orchestrations/run', rateLimit('heavy'), async (req, res) => {
  res.setTimeout(0);
  const { nodes, edges, task } = req.body;
  if (!Array.isArray(nodes) || !task) return res.status(400).json({ error: 'nodes and task required' });

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  let order;
  try {
    order = topoSort(nodes, edges || []);
  } catch (err) {
    // Invalid graph (cycle / dangling edge) — fail clean, never crash (C8 audit).
    return res.status(err.statusCode || 400).json({ error: err.message });
  }

  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);
  const agentContentMap = {};

  const globalAgents = listAgents(path.join(CLAUDE_DIR, 'agents'));
  for (const a of globalAgents) agentContentMap[a.name] = a.body || a.raw;

  for (const p of projects) {
    for (const a of p.agents) agentContentMap[a.name] = a.body || a.raw;
  }

  const results = {};
  let lastOutput = task;
  const runId = genId();
  const startedAt = new Date().toISOString();
  const runLogs = [];
  let runStatus = 'completed';
  let clientDisconnected = false;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.on('close', () => { clientDisconnected = true; });

  const send = (data) => {
    runLogs.push(data);
    if (clientDisconnected) return;
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  async function executeNode(nodeId) {
    const node = nodeMap[nodeId];
    if (!node) return;

    if (node.data?.isStart) {
      results[nodeId] = task;
      send({ type: 'done', nodeId, label: node.data?.label || nodeId, output: task, skipped: true });
      return;
    }

    if (node.data?.isApproval) {
      const nodeLabel = node.data?.label || 'Approval';
      send({ type: 'waiting_approval', nodeId, label: nodeLabel });
      try {
        await waitForApproval(runId, nodeId, nodeLabel, node.data?.timeoutMinutes || 60);
        results[nodeId] = '[APPROVED]';
        send({ type: 'done', nodeId, label: nodeLabel, output: '[APPROVED]' });
      } catch (err) {
        runStatus = 'failed';
        results[nodeId] = `[REJECTED: ${err.message}]`;
        send({ type: 'error', nodeId, label: nodeLabel, error: err.message });
        throw err;
      }
      return;
    }

    const agentName = node.data?.agentName;
    const baseInstructions = agentName ? (agentContentMap[agentName] || '') : '';
    const nodeInstructions = node.data?.instructions || '';
    const nodeLabel = node.data?.label || agentName || nodeId;

    send({ type: 'start', nodeId, label: nodeLabel });

    const incomingEdges = (edges || []).filter(e => e.target === nodeId);
    let context = '';
    if (incomingEdges.length > 0) {
      context = incomingEdges.map(e => {
        const prevLabel = nodeMap[e.source]?.data?.label || e.source;
        return `## Output from ${prevLabel}:\n${results[e.source] || ''}`;
      }).join('\n\n');
    } else {
      context = `## Task:\n${task}`;
    }

    let prompt = '';
    if (baseInstructions) prompt += baseInstructions + '\n\n';
    if (nodeInstructions) prompt += `## Your Specific Task for This Step:\n${nodeInstructions}\n\n`;
    prompt += `---\n\n${context}\n\n`;
    prompt += `---\n\nIMPORTANT: Produce the actual deliverable directly. Do NOT write meta-commentary, evaluations, or descriptions of what you would do. Output only the finished work product itself.`;

    const condition = node.data?.condition;
    if (condition) {
      const incomingOutputs = incomingEdges.map(e => results[e.source] || '').join('\n');
      if (!incomingOutputs.includes(condition)) {
        results[nodeId] = `[SKIPPED: condition "${condition}" not matched]`;
        send({ type: 'skipped', nodeId, label: nodeLabel, condition });
        return;
      }
    }

    const maxRetries = Math.min(node.data?.retryCount || 0, 3);
    let attempt = 0;
    let nodeOutput = null;
    let lastErr = null;

    while (attempt <= maxRetries) {
      const nodeStart = Date.now();
      try {
        if (attempt > 0) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          send({ type: 'retry', nodeId, label: nodeLabel, attempt, backoffMs });
          await sleep(backoffMs);
        }
        nodeOutput = await runClaudeSync(prompt);
        logAgentRun({ agentName: agentName || 'custom', prompt: prompt.slice(0, 500), output: nodeOutput, source: 'orchestration', duration: Date.now() - nodeStart, status: 'success', metadata: { orchestrationId: req.body.orchestrationId, nodeId, attempt } });
        break;
      } catch (err) {
        lastErr = err;
        logAgentRun({ agentName: agentName || 'custom', prompt: prompt.slice(0, 500), output: '', source: 'orchestration', duration: Date.now() - nodeStart, status: 'error', error: err.message, metadata: { orchestrationId: req.body.orchestrationId, nodeId, attempt } });
        attempt++;
      }
    }

    if (nodeOutput !== null) {
      results[nodeId] = nodeOutput;
      lastOutput = nodeOutput;
      send({ type: 'done', nodeId, label: nodeLabel, output: nodeOutput });
    } else {
      const fallbackAgent = node.data?.fallbackAgent;
      if (fallbackAgent && agentContentMap[fallbackAgent]) {
        send({ type: 'fallback', nodeId, label: nodeLabel, fallbackAgent });
        const fbPrompt = (agentContentMap[fallbackAgent] || '') + '\n\n' + prompt.split('---')[1];
        try {
          nodeOutput = await runClaudeSync(fbPrompt);
          results[nodeId] = nodeOutput;
          lastOutput = nodeOutput;
          send({ type: 'done', nodeId, label: nodeLabel, output: nodeOutput, usedFallback: true });
          return;
        } catch (err) { console.warn('[orchestration] Fallback agent failed:', err.message); }
      }

      runStatus = 'failed';
      send({ type: 'error', nodeId, label: nodeLabel, error: lastErr?.message || 'Unknown error', retries: maxRetries });
      sendFailureAlert(agentName || 'custom', nodeLabel, lastErr?.message, req.body.orchestrationName);
      throw lastErr || new Error('Node failed');
    }
  }

  try {
    const levels = topoLevels(nodes, edges || []);
    for (const level of levels) {
      if (level.length === 1) {
        await executeNode(level[0]);
      } else {
        send({ type: 'parallel_start', nodeIds: level, count: level.length });
        await Promise.all(level.map(nodeId => executeNode(nodeId)));
        send({ type: 'parallel_done', nodeIds: level });
      }
    }
    try { send({ type: 'complete', finalOutput: lastOutput }); } catch {}
  } catch (err) {
    runStatus = 'failed';
    try {
      if (!err._handled) send({ type: 'error', nodeId: null, label: null, error: err.message });
    } catch {}
  }

  const completedAt = new Date().toISOString();
  const duration = new Date(completedAt) - new Date(startedAt);
  const runSession = {
    id: runId,
    orchestrationName: req.body.orchestrationName || 'Untitled',
    orchestrationId: req.body.orchestrationId || null,
    task,
    status: runStatus,
    nodeCount: nodes.length,
    nodes: nodes.map(n => ({ id: n.id, label: n.data?.label, agentName: n.data?.agentName, isStart: n.data?.isStart, isCustom: n.data?.isCustom })),
    edges: (edges || []).map(e => ({ source: e.source, target: e.target })),
    logs: runLogs,
    nodeOutputs: results,
    finalOutput: lastOutput,
    startedAt,
    completedAt,
    duration,
  };
  try { db.insertRunHistory(runSession); } catch (err) { console.error('[orchestration] Failed to save run history:', err.message); }

  try { if (!clientDisconnected) res.end(); } catch {}
});

// ──────────────────────────────────────────────────────────────────────────
// Phase B — Persistent / Resumable Orchestration Runs (2026-04-28)
//
// New endpoints layered on top of the existing in-memory `POST /run`. The
// in-memory route stays for backward compat (current Orchestration.tsx UI
// uses it). New flow:
//   1. POST /api/orchestrations/:id/runs    → create durable run + steps
//   2. GET  /api/orchestrations/runs/:id    → poll/replay
//   3. GET  /api/orchestrations/runs/:id/stream → live SSE
//   4. POST /api/orchestrations/runs/:id/cancel
//   5. POST /api/orchestrations/runs/:id/steps/:idx/advance  (approval)
//   6. POST /api/orchestrations/runs/:id/steps/:idx/retry
//
// Run execution is delegated to src/lib/orchestrationRunner.js helpers.
// Actual node execution still goes through `executeNode` inline in the run
// promise — we wrap each transition with persistent step writes.
// ──────────────────────────────────────────────────────────────────────────

const orchRunner = require('../lib/orchestrationRunner');
const tasks = require('../lib/tasks');
const { events: agentSyncEvents } = require('../lib/agentSync');

// On boot, mark any in-flight runs as failed (server restart loses executor state).
try { orchRunner.recoverInflightRuns(); } catch (err) { console.error('[orch] boot recovery failed:', err.message); }

// POST /api/orchestrations/:id/runs — start a durable run from a saved orchestration
router.post('/orchestrations/:id/runs', rateLimit('heavy'), async (req, res) => {
  res.setTimeout(0);
  try {
    const orc = (db.loadOrchestrations() || []).find((o) => o.id === req.params.id);
    if (!orc) return res.status(404).json({ error: 'orchestration not found' });

    const { task, createdBy, metadata } = req.body || {};
    if (!task) return res.status(400).json({ error: 'task is required' });

    const nodes = orc.nodes || [];
    if (nodes.length === 0) return res.status(400).json({ error: 'orchestration has no nodes' });

    const run = orchRunner.createRun({
      orchestrationId: orc.id,
      orchestrationName: orc.name,
      task,
      nodes,
      createdBy: createdBy || 'admin',
      metadata,
    });

    // Kick off execution asynchronously. Client follows progress via SSE.
    setImmediate(() => executeDurableRun(run.id, orc, task).catch((err) => {
      try { orchRunner.markRunFailed(run.id, err.message || String(err)); } catch {}
    }));

    res.json({ ok: true, runId: run.id, statusUrl: `/api/orchestrations/runs/${run.id}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orchestrations/runs/:id — fetch run + ordered steps
router.get('/orchestrations/runs-v2/:id', rateLimit('read'), (req, res) => {
  const run = orchRunner.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json(run);
});

// GET /api/orchestrations/:id/runs — list runs for an orchestration
router.get('/orchestrations/:id/runs', rateLimit('read'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const status = req.query.status || null;
  res.json({ items: orchRunner.listRuns({ orchestrationId: req.params.id, status, limit }) });
});

// GET /api/orchestrations/runs-v2/:id/stream — SSE for live updates
router.get('/orchestrations/runs-v2/:id/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  // Initial snapshot
  const initial = orchRunner.getRun(req.params.id);
  if (initial) {
    res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
  }

  const isMatch = (payload) => payload && (payload.runId === req.params.id || payload.id === req.params.id);
  const forward = (type) => (payload) => {
    if (!isMatch(payload)) return;
    res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const handlers = [
    ['run:running',   forward('run:running')],
    ['run:paused',    forward('run:paused')],
    ['run:completed', forward('run:completed')],
    ['run:failed',    forward('run:failed')],
    ['run:cancelled', forward('run:cancelled')],
    ['step:any',      forward('step:any')],
  ];
  for (const [name, h] of handlers) agentSyncEvents.on(name, h);

  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch {}
  }, 25000);

  const cleanup = () => {
    clearInterval(heartbeat);
    for (const [name, h] of handlers) agentSyncEvents.off(name, h);
  };
  req.on('close', cleanup);
  req.on('end', cleanup);
});

// POST /api/orchestrations/runs/:id/cancel
router.post('/orchestrations/runs-v2/:id/cancel', rateLimit('write'), (req, res) => {
  try {
    const updated = orchRunner.markRunCancelled(req.params.id, req.body?.reason || 'cancelled by user');
    res.json({ ok: true, run: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/orchestrations/runs/:id/steps/:nodeId/advance — approve/reject paused step
router.post('/orchestrations/runs-v2/:id/steps/:nodeId/advance', rateLimit('write'), (req, res) => {
  try {
    const { approved = true, reason } = req.body || {};
    const updated = orchRunner.advanceStep(req.params.id, req.params.nodeId, !!approved, reason);
    res.json({ ok: true, step: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/orchestrations/runs/:id/steps/:nodeId/retry
router.post('/orchestrations/runs-v2/:id/steps/:nodeId/retry', rateLimit('write'), (req, res) => {
  try {
    const updated = orchRunner.retryStep(req.params.id, req.params.nodeId);
    // Re-execute the single step asynchronously. We reload the run + orchestration
    // and call executeDurableRun for that one node.
    const run = orchRunner.getRun(req.params.id);
    const orc = (db.loadOrchestrations() || []).find((o) => o.id === run?.orchestrationId);
    if (run && orc) {
      setImmediate(() => executeSingleNode(run.id, orc, run.task, req.params.nodeId).catch((err) => {
        try { orchRunner.markStepFailed(req.params.id, req.params.nodeId, err.message || String(err)); } catch {}
      }));
    }
    res.json({ ok: true, step: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Durable executor ──────────────────────────────────────────────────────
//
// Walks the graph in topo order. For each step:
//   1. Mark step running + emit event
//   2. Create a Phase A `task` so capacity is tracked
//   3. Run claude (re-uses runClaudeSync from this module's top scope)
//   4. Mark step completed + complete the task
//   5. Pause on approval gates (durable — survives restart)
async function executeDurableRun(runId, orchestration, taskInput) {
  const nodes = orchestration.nodes || [];
  const edges = orchestration.edges || [];
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const order = topoSort(nodes, edges);

  orchRunner.markRunRunning(runId, order[0] || null);

  let lastOutput = taskInput;
  const outputs = {};

  for (const nodeId of order) {
    const node = nodeMap[nodeId];
    if (!node) continue;

    // Start node — passthrough, no execution
    if (node.data?.isStart) {
      orchRunner.markStepSkipped(runId, nodeId);
      outputs[nodeId] = taskInput;
      continue;
    }

    // Approval gate — pause durably
    if (node.data?.isApproval) {
      orchRunner.markStepPaused(runId, nodeId);
      orchRunner.markRunPaused(runId, nodeId);
      // The step row remains 'paused' until POST /steps/:nodeId/advance runs.
      // For now we end this executor invocation — caller will need to
      // re-trigger after the approval comes in. Simpler than promise-based
      // pause: keeps state durable.
      return;
    }

    const agentName = node.data?.agentName;
    if (!agentName) {
      orchRunner.markStepFailed(runId, nodeId, 'node has no agentName');
      orchRunner.markRunFailed(runId, `step ${nodeId} missing agentName`);
      return;
    }

    // Phase A: create a task to track capacity
    let task = null;
    try {
      task = tasks.createTask({
        agentId: agentName,
        source: 'orchestration',
        taskType: node.data?.taskType || 'workflow',
        title: node.data?.label || nodeId,
        prompt: node.data?.instructions || lastOutput,
        priority: node.data?.priority || 'p2',
        metadata: { runId, nodeId, orchestrationId: orchestration.id },
      });
    } catch (err) {
      orchRunner.markStepFailed(runId, nodeId, `task creation failed: ${err.message}`);
      orchRunner.markRunFailed(runId, err.message);
      return;
    }

    orchRunner.markStepRunning(runId, nodeId, task.id);
    tasks.markRunning(task.id);

    // Build prompt
    const prompt = composePrompt(agentName, node, lastOutput);
    let output;
    try {
      output = await runClaudeSync(prompt, (node.data?.timeoutMinutes || 60) * 60 * 1000);
      tasks.markComplete(task.id, output);
      orchRunner.markStepCompleted(runId, nodeId, output);
      outputs[nodeId] = output;
      lastOutput = output;
    } catch (err) {
      tasks.markFailed(task.id, err.message || String(err));
      orchRunner.markStepFailed(runId, nodeId, err.message || String(err));
      orchRunner.markRunFailed(runId, `step ${nodeId} failed: ${err.message || err}`);
      return;
    }
  }

  orchRunner.markRunCompleted(runId, lastOutput);
}

// Re-execute a single node (retry path).
async function executeSingleNode(runId, orchestration, taskInput, nodeId) {
  const nodes = orchestration.nodes || [];
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`node ${nodeId} not in orchestration`);
  const agentName = node.data?.agentName;
  if (!agentName) throw new Error('node has no agentName');

  const task = tasks.createTask({
    agentId: agentName,
    source: 'orchestration:retry',
    taskType: node.data?.taskType || 'workflow',
    title: `Retry: ${node.data?.label || nodeId}`,
    prompt: node.data?.instructions || taskInput,
    metadata: { runId, nodeId, retry: true },
  });

  orchRunner.markStepRunning(runId, nodeId, task.id);
  tasks.markRunning(task.id);

  try {
    const output = await runClaudeSync(
      composePrompt(agentName, node, taskInput),
      (node.data?.timeoutMinutes || 60) * 60 * 1000,
    );
    tasks.markComplete(task.id, output);
    orchRunner.markStepCompleted(runId, nodeId, output);
  } catch (err) {
    tasks.markFailed(task.id, err.message || String(err));
    orchRunner.markStepFailed(runId, nodeId, err.message || String(err));
  }
}

function composePrompt(agentName, node, lastOutput) {
  const instructions = node.data?.instructions || '';
  const base = instructions || `Use the @${agentName} agent.`;
  return lastOutput ? `${base}\n\n--- previous step output ---\n${lastOutput}` : base;
}

module.exports = { router, runClaudeSync };
