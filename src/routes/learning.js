'use strict';

const { Router } = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const db = require('../db');

const router = Router();

function loadAgentLearning() {
  const d = db.loadAgentLearning();
  return d.agents ? d : { agents: {}, taskTypes: {}, routing: {}, updatedAt: null };
}
function saveAgentLearning(data) {
  data.updatedAt = new Date().toISOString();
  db.saveAgentLearning(data);
}

function loadClaims() { return db.loadClaims(); }
function saveClaims(data) { db.saveClaims(data); }

function loadModelRouting() {
  const d = db.loadModelRouting();
  if (d.rules) return d;
  return {
    rules: [
      { pattern: 'copy|tagline|headline|microcopy|CTA|subject line', model: 'haiku', tier: 'simple', agents: ['quill'] },
      { pattern: 'test|lint|format|rename|refactor simple', model: 'haiku', tier: 'simple', agents: ['luna'] },
      { pattern: 'build|implement|feature|component|page|API', model: 'sonnet', tier: 'medium', agents: ['koda'] },
      { pattern: 'review|audit|security|compliance', model: 'sonnet', tier: 'medium', agents: ['sage'] },
      { pattern: 'debug|fix|triage|root cause', model: 'sonnet', tier: 'medium', agents: ['vex'] },
      { pattern: 'architecture|system design|data model|migration', model: 'opus', tier: 'complex', agents: ['arya'] },
      { pattern: 'orchestrate|coordinate|full build|sprint', model: 'opus', tier: 'complex', agents: ['yash'] },
      { pattern: 'research|competitor|market|positioning', model: 'sonnet', tier: 'medium', agents: ['nova'] },
      { pattern: 'SEO|structured data|sitemap|core web vitals', model: 'sonnet', tier: 'medium', agents: ['zeph'] },
      { pattern: 'deploy|CI/CD|release|rollback', model: 'sonnet', tier: 'medium', agents: ['bolt'] },
      { pattern: 'monitor|alert|incident|sentry', model: 'haiku', tier: 'simple', agents: ['hawk'] },
      { pattern: 'knowledge|extract|lesson|train|memory', model: 'haiku', tier: 'simple', agents: ['mira'] },
      { pattern: 'design|visual|UI|UX|layout|component spec', model: 'sonnet', tier: 'medium', agents: ['vega'] },
    ],
    costs: {
      haiku: { input: 0.25, output: 1.25, label: 'Fast & cheap' },
      sonnet: { input: 3, output: 15, label: 'Balanced' },
      opus: { input: 15, output: 75, label: 'Deep reasoning' },
    },
    updatedAt: new Date().toISOString(),
  };
}
function saveModelRouting(data) {
  data.updatedAt = new Date().toISOString();
  db.saveModelRouting(data);
}

function recordLearning(agentName, taskType, outcome) {
  const learningDb = loadAgentLearning();

  if (!learningDb.agents[agentName]) {
    learningDb.agents[agentName] = {
      totalRuns: 0, successRuns: 0, failedRuns: 0,
      avgDuration: 0, avgTokens: 0, avgCost: 0,
      taskTypes: {},
      streak: 0, bestStreak: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: null,
    };
  }
  const agent = learningDb.agents[agentName];
  agent.totalRuns++;
  agent.lastSeen = new Date().toISOString();

  if (outcome.success) {
    agent.successRuns++;
    agent.streak = Math.max(0, agent.streak) + 1;
    agent.bestStreak = Math.max(agent.bestStreak, agent.streak);
  } else {
    agent.failedRuns++;
    agent.streak = 0;
  }

  const alpha = 0.1;
  agent.avgDuration = agent.avgDuration === 0 ? (outcome.duration || 0) :
    agent.avgDuration * (1 - alpha) + (outcome.duration || 0) * alpha;
  agent.avgTokens = agent.avgTokens === 0 ? (outcome.tokens || 0) :
    agent.avgTokens * (1 - alpha) + (outcome.tokens || 0) * alpha;
  agent.avgCost = agent.avgCost === 0 ? (outcome.cost || 0) :
    agent.avgCost * (1 - alpha) + (outcome.cost || 0) * alpha;

  const tt = taskType || 'general';
  if (!agent.taskTypes[tt]) {
    agent.taskTypes[tt] = { runs: 0, successes: 0, avgDuration: 0 };
  }
  const tts = agent.taskTypes[tt];
  tts.runs++;
  if (outcome.success) tts.successes++;
  tts.avgDuration = tts.avgDuration * (1 - alpha) + (outcome.duration || 0) * alpha;

  if (!learningDb.taskTypes[tt]) {
    learningDb.taskTypes[tt] = { bestAgent: null, bestRate: 0, agents: {} };
  }
  learningDb.taskTypes[tt].agents[agentName] = {
    successRate: Math.round((tts.successes / tts.runs) * 100),
    avgDuration: Math.round(tts.avgDuration),
    runs: tts.runs,
  };

  let bestAgent = null, bestRate = 0;
  for (const [name, stats] of Object.entries(learningDb.taskTypes[tt].agents)) {
    if (stats.runs >= 3 && stats.successRate > bestRate) {
      bestRate = stats.successRate;
      bestAgent = name;
    }
  }
  learningDb.taskTypes[tt].bestAgent = bestAgent;
  learningDb.taskTypes[tt].bestRate = bestRate;

  saveAgentLearning(learningDb);
  return { agent: agentName, taskType: tt, successRate: Math.round((agent.successRuns / agent.totalRuns) * 100) };
}

// Cleanup stale claims (>30 min) every 5 minutes
setInterval(() => {
  try {
    const claims = loadClaims();
    const cutoff = Date.now() - 30 * 60 * 1000;
    let cleaned = 0;
    for (const [taskId, claim] of Object.entries(claims)) {
      if (new Date(claim.claimedAt).getTime() < cutoff && claim.status === 'active') {
        claim.status = 'expired';
        cleaned++;
      }
    }
    if (cleaned > 0) saveClaims(claims);
  } catch {}
}, 5 * 60 * 1000);

// GET /api/learning
router.get('/learning', rateLimit('read'), (req, res) => {
  res.json(loadAgentLearning());
});

// GET /api/learning/route/:taskType
router.get('/learning/route/:taskType', rateLimit('read'), (req, res) => {
  const learningDb = loadAgentLearning();
  const tt = req.params.taskType;
  const taskData = learningDb.taskTypes[tt];
  if (!taskData || !taskData.bestAgent) {
    return res.json({ taskType: tt, recommendation: null, message: 'Not enough data yet' });
  }
  res.json({
    taskType: tt,
    recommendation: taskData.bestAgent,
    successRate: taskData.bestRate,
    alternatives: Object.entries(taskData.agents)
      .sort((a, b) => b[1].successRate - a[1].successRate)
      .map(([name, stats]) => ({ name, ...stats })),
  });
});

// GET /api/learning/agent/:name
router.get('/learning/agent/:name', rateLimit('read'), (req, res) => {
  const learningDb = loadAgentLearning();
  const agent = learningDb.agents[req.params.name];
  if (!agent) return res.status(404).json({ error: 'Agent not found in learning data' });
  res.json({ name: req.params.name, ...agent, successRate: Math.round((agent.successRuns / agent.totalRuns) * 100) });
});

// POST /api/learning/record
router.post('/learning/record', rateLimit('write'), (req, res) => {
  const { agentName, taskType, success, duration, tokens, cost, feedback } = req.body;
  if (!agentName) return res.status(400).json({ error: 'agentName required' });
  const result = recordLearning(agentName, taskType, { success: !!success, duration, tokens, cost, feedback });
  res.json(result);
});

// DELETE /api/learning/agent/:name
router.delete('/learning/agent/:name', rateLimit('write'), (req, res) => {
  const learningDb = loadAgentLearning();
  delete learningDb.agents[req.params.name];
  for (const tt of Object.values(learningDb.taskTypes)) {
    delete tt.agents[req.params.name];
  }
  saveAgentLearning(learningDb);
  res.json({ ok: true });
});

// POST /api/routing/recommend
router.post('/routing/recommend', rateLimit('read'), (req, res) => {
  const { agentName, taskDescription } = req.body;
  const routing = loadModelRouting();

  for (const rule of routing.rules) {
    if (rule.agents && rule.agents.includes(agentName)) {
      return res.json({
        model: rule.model,
        tier: rule.tier,
        reason: `Agent ${agentName} defaults to ${rule.model}`,
        cost: routing.costs[rule.model],
      });
    }
  }

  if (taskDescription) {
    const desc = taskDescription.toLowerCase();
    for (const rule of routing.rules) {
      const patterns = rule.pattern.split('|');
      if (patterns.some(p => desc.includes(p.trim().toLowerCase()))) {
        return res.json({
          model: rule.model,
          tier: rule.tier,
          reason: `Task matched pattern: ${rule.pattern}`,
          cost: routing.costs[rule.model],
        });
      }
    }
  }

  res.json({
    model: 'sonnet',
    tier: 'medium',
    reason: 'Default (no specific rule matched)',
    cost: routing.costs.sonnet,
  });
});

// GET /api/routing
router.get('/routing', rateLimit('read'), (req, res) => {
  res.json(loadModelRouting());
});

// PUT /api/routing
router.put('/routing', rateLimit('write'), (req, res) => {
  const routing = loadModelRouting();
  if (req.body.rules) routing.rules = req.body.rules;
  if (req.body.costs) routing.costs = req.body.costs;
  saveModelRouting(routing);
  res.json({ ok: true });
});

// GET /api/routing/savings
router.get('/routing/savings', rateLimit('read'), (req, res) => {
  const runs = db.loadAgentRuns();
  const routing = loadModelRouting();

  let allOpusCost = 0, routedCost = 0;
  for (const run of runs) {
    const tokens = run.estimatedTokens || 0;
    const inputTokens = Math.ceil(tokens * 0.7);
    const outputTokens = tokens - inputTokens;

    allOpusCost += (inputTokens * 15 + outputTokens * 75) / 1_000_000;

    let model = 'sonnet';
    for (const rule of routing.rules) {
      if (rule.agents && rule.agents.includes(run.agentName)) { model = rule.model; break; }
    }
    const costs = routing.costs[model] || routing.costs.sonnet;
    routedCost += (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
  }

  res.json({
    totalRuns: runs.length,
    allOpusCost: Math.round(allOpusCost * 10000) / 10000,
    routedCost: Math.round(routedCost * 10000) / 10000,
    savings: Math.round((1 - routedCost / (allOpusCost || 1)) * 100),
    message: `Estimated ${Math.round((1 - routedCost / (allOpusCost || 1)) * 100)}% savings with model routing`,
  });
});

// POST /api/claims
router.post('/claims', rateLimit('write'), (req, res) => {
  const { taskId, agentName, description } = req.body;
  if (!taskId || !agentName) return res.status(400).json({ error: 'taskId and agentName required' });

  const claims = loadClaims();
  const existing = claims[taskId];

  if (existing && existing.status === 'active') {
    const age = Date.now() - new Date(existing.claimedAt).getTime();
    if (age < 30 * 60 * 1000) {
      return res.status(409).json({
        error: 'Task already claimed',
        claimedBy: existing.agentName,
        claimedAt: existing.claimedAt,
        age: Math.round(age / 1000) + 's',
      });
    }
  }

  claims[taskId] = {
    agentName,
    description: description || '',
    status: 'active',
    claimedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
  };
  saveClaims(claims);
  res.json({ ok: true, taskId, claimedBy: agentName });
});

// PUT /api/claims/:taskId
router.put('/claims/:taskId', rateLimit('write'), (req, res) => {
  const claims = loadClaims();
  const claim = claims[req.params.taskId];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });

  const { status, result } = req.body;
  claim.status = status || 'completed';
  claim.completedAt = new Date().toISOString();
  claim.result = result || null;
  saveClaims(claims);
  res.json({ ok: true, claim });
});

// POST /api/claims/:taskId/handoff
router.post('/claims/:taskId/handoff', rateLimit('write'), (req, res) => {
  const claims = loadClaims();
  const claim = claims[req.params.taskId];
  if (!claim) return res.status(404).json({ error: 'Claim not found' });

  const { toAgent, reason } = req.body;
  if (!toAgent) return res.status(400).json({ error: 'toAgent required' });

  const previousAgent = claim.agentName;
  claim.agentName = toAgent;
  claim.claimedAt = new Date().toISOString();
  claim.handoffHistory = claim.handoffHistory || [];
  claim.handoffHistory.push({ from: previousAgent, to: toAgent, reason, at: new Date().toISOString() });
  saveClaims(claims);
  res.json({ ok: true, handoff: { from: previousAgent, to: toAgent } });
});

// GET /api/claims
router.get('/claims', rateLimit('read'), (req, res) => {
  const claims = loadClaims();
  const { status, agent } = req.query;
  let entries = Object.entries(claims).map(([taskId, c]) => ({ taskId, ...c }));
  if (status) entries = entries.filter(c => c.status === status);
  if (agent) entries = entries.filter(c => c.agentName === agent);
  res.json(entries);
});

// GET /api/claims/:taskId
router.get('/claims/:taskId', rateLimit('read'), (req, res) => {
  const claims = loadClaims();
  const claim = claims[req.params.taskId];
  if (!claim || claim.status !== 'active') {
    return res.json({ claimed: false });
  }
  res.json({ claimed: true, ...claim });
});

module.exports = { router, recordLearning };
