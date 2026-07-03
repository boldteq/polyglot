'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { rateLimit } = require('../middleware/rateLimit');
const { validateAgentExists } = require('../lib/runClaude');
const { listAgents } = require('../lib/cache');
const { topoSort } = require('../lib/graph');
const db = require('../db');

const router = Router();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');

function loadWebhooks() { return db.loadWebhooks(); }
function saveWebhooks(list) { try { db.saveWebhooks(list); } catch (err) { console.error('[saveWebhooks] DB write failed:', err.message); throw err; } }
function loadOrchestrations() { return db.loadOrchestrations(); }

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

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
      if (killed) reject(new Error(`Execution timed out after ${timeoutMs / 1000}s`));
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

function buildScheduledPrompt(schedule) {
  let instructions = '';
  const globalAgentsDir = path.join(CLAUDE_DIR, 'agents');
  if (fs.existsSync(globalAgentsDir)) {
    for (const file of fs.readdirSync(globalAgentsDir).filter(f => f.endsWith('.md'))) {
      const fname = file.replace('.md', '');
      if (fname === schedule.agentName || fname.toLowerCase() === schedule.agentName.toLowerCase()) {
        instructions = fs.readFileSync(path.join(globalAgentsDir, file), 'utf-8');
        break;
      }
    }
  }
  if (instructions) {
    return `${instructions}\n\n---\n\n## Task:\n${schedule.prompt}\n\n---\n\nIMPORTANT: Produce the actual deliverable directly. Do NOT write meta-commentary. Output only the finished work product.`;
  }
  return schedule.prompt;
}

// GET /api/webhooks
router.get('/webhooks', rateLimit('read'), (req, res) => {
  const webhooks = loadWebhooks().map(w => ({ ...w, secret: '****' + w.secret.slice(-8) }));
  res.json(webhooks);
});

// GET /api/webhooks/:id/secret
router.get('/webhooks/:id/secret', rateLimit('read'), (req, res) => {
  const webhook = loadWebhooks().find(w => w.id === req.params.id);
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });
  res.json({ secret: webhook.secret });
});

// POST /api/webhooks
router.post('/webhooks', rateLimit('write'), (req, res) => {
  const { name, agentName, orchestrationId } = req.body;
  if (!name || (!agentName && !orchestrationId)) return res.status(400).json({ error: 'name and either agentName or orchestrationId required' });
  // Validate the agent at create time (parity with POST /api/schedules) so a
  // webhook can't persist pointing at a non-existent agent and fail only at fire time.
  if (agentName && !validateAgentExists(agentName)) return res.status(400).json({ error: `Agent '${agentName}' not found` });

  const webhook = {
    id: 'wh_' + genId(),
    name,
    agentName: agentName || null,
    orchestrationId: orchestrationId || null,
    secret: crypto.randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
    lastTriggeredAt: null,
    triggerCount: 0,
  };
  const webhooks = loadWebhooks();
  webhooks.push(webhook);
  saveWebhooks(webhooks);
  res.json(webhook);
});

// DELETE /api/webhooks/:id
router.delete('/webhooks/:id', rateLimit('write'), (req, res) => {
  saveWebhooks(loadWebhooks().filter(w => w.id !== req.params.id));
  res.json({ ok: true });
});

// POST /api/webhooks/trigger/:id
router.post('/webhooks/trigger/:id', rateLimit('heavy'), async (req, res) => {
  const webhooks = loadWebhooks();
  const webhook = webhooks.find(w => w.id === req.params.id);
  if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

  // Constant-time secret comparison — this is the ONE network-reachable auth
  // gate (webhook trigger bypasses localOnly), so timing-safe matters (C6 audit).
  const secret = req.headers['x-webhook-secret'];
  const provided = Buffer.from(String(secret || ''));
  const expected = Buffer.from(String(webhook.secret || ''));
  if (!secret || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  webhook.lastTriggeredAt = new Date().toISOString();
  webhook.triggerCount = (webhook.triggerCount || 0) + 1;
  saveWebhooks(webhooks);

  const payload = JSON.stringify(req.body || {}, null, 2);
  const startTime = Date.now();

  try {
    if (webhook.agentName) {
      const prompt = buildScheduledPrompt({ agentName: webhook.agentName, prompt: `Webhook triggered: ${webhook.name}\n\nPayload:\n${payload}` });
      const output = await runClaudeSync(prompt, 300000);
      logAgentRun({ agentName: webhook.agentName, prompt: `Webhook: ${webhook.name}`, output, source: 'webhook', duration: Date.now() - startTime, status: 'success', metadata: { webhookId: webhook.id } });
      res.json({ success: true, output: output.slice(0, 500) });
    } else if (webhook.orchestrationId) {
      const orc = loadOrchestrations().find(o => o.id === webhook.orchestrationId);
      if (!orc) return res.status(404).json({ error: 'Orchestration not found' });
      // Cost guard: an unattended webhook spawns one paid LLM run per node.
      // Cap fan-out so a misconfigured/replayed trigger can't run away (C6 audit).
      const MAX_WEBHOOK_NODES = parseInt(process.env.WEBHOOK_MAX_NODES, 10) || 25;
      if ((orc.nodes || []).length > MAX_WEBHOOK_NODES) {
        return res.status(400).json({ error: `Orchestration exceeds webhook node cap (${MAX_WEBHOOK_NODES})` });
      }
      const orcResults = {};
      let orcLastOutput = payload;
      const orcOrder = topoSort(orc.nodes, orc.edges || []);
      const orcNodeMap = Object.fromEntries(orc.nodes.map(n => [n.id, n]));
      const agentContentMap = {};
      const globalAgents = listAgents(path.join(CLAUDE_DIR, 'agents'));
      for (const a of globalAgents) agentContentMap[a.name] = a.body || a.raw;

      for (const nid of orcOrder) {
        const nd = orcNodeMap[nid];
        if (!nd) continue;
        if (nd.data?.isStart) { orcResults[nid] = `Webhook: ${webhook.name}\n\n${payload}`; continue; }
        const aName = nd.data?.agentName;
        const baseInst = aName ? (agentContentMap[aName] || '') : '';
        const nodeInst = nd.data?.instructions || '';
        const incoming = (orc.edges || []).filter(e => e.target === nid);
        let ctx = incoming.length > 0
          ? incoming.map(e => `## Output from ${orcNodeMap[e.source]?.data?.label || e.source}:\n${orcResults[e.source] || ''}`).join('\n\n')
          : `## Task:\n${payload}`;
        let p = '';
        if (baseInst) p += baseInst + '\n\n';
        if (nodeInst) p += `## Your Specific Task:\n${nodeInst}\n\n`;
        p += `---\n\n${ctx}\n\n---\n\nIMPORTANT: Produce the actual deliverable directly.`;
        const nStart = Date.now();
        try {
          const out = await runClaudeSync(p);
          orcResults[nid] = out;
          orcLastOutput = out;
          logAgentRun({ agentName: aName || 'custom', prompt: p.slice(0, 500), output: out, source: 'webhook', duration: Date.now() - nStart, status: 'success', metadata: { webhookId: webhook.id, orchestrationId: webhook.orchestrationId, nodeId: nid } });
        } catch (err) {
          logAgentRun({ agentName: aName || 'custom', prompt: p.slice(0, 500), output: '', source: 'webhook', duration: Date.now() - nStart, status: 'error', error: err.message, metadata: { webhookId: webhook.id } });
          return res.json({ success: false, error: err.message });
        }
      }
      res.json({ success: true, output: orcLastOutput.slice(0, 500) });
    } else {
      res.status(400).json({ error: 'Webhook has no agent or orchestration configured' });
    }
  } catch (err) {
    logAgentRun({ agentName: webhook.agentName || 'webhook', prompt: `Webhook: ${webhook.name}`, output: '', source: 'webhook', duration: Date.now() - startTime, status: 'error', error: err.message, metadata: { webhookId: webhook.id } });
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
