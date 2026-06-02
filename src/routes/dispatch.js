'use strict';

const express = require('express');
const router = express.Router();

const tasks = require('../lib/tasks');
const db = require('../db');
const org = require('../org');
const configService = require('../lib/configService');

// Cost tier penalty for the dispatch scoring formula. Sourced from
// `models` SQLite table via configService.
function tierCostPenalty(model) {
  return configService.getModelCostPenalty(model);
}

function priorityBoost(priority) {
  const policy = configService.getDispatchPolicy();
  const boost = policy?.priority_boost || {};
  return typeof boost[priority] === 'number' ? boost[priority] : 0;
}

// Score formula (weights from dispatch_policy table):
//   skillScore   * skill_weight
// + (1-loadPct)  * load_weight
// + successRate  * success_weight
// - costPenalty  * costWeight (dynamic — normal vs over-budget downgrade)
// + priorityBoost
function rankCandidate(c, opts = {}) {
  const policy = configService.getDispatchPolicy();
  const skill = c.skillScore || 0;
  const loadPct = c.maxConcurrentTasks > 0
    ? Math.min(1, (c.activeTaskCount || 0) / c.maxConcurrentTasks)
    : 1;
  const sr = typeof c.successRate === 'number' ? c.successRate : 0.7;
  const cost = tierCostPenalty(c.model);
  const costWeight = typeof opts.costWeight === 'number'
    ? opts.costWeight
    : (policy?.cost_weight_normal ?? 0.1);

  const score =
      skill * (policy?.skill_weight   ?? 0.5)
    + (1 - loadPct) * (policy?.load_weight    ?? 0.2)
    + sr * (policy?.success_weight ?? 0.2)
    - cost * costWeight
    + priorityBoost(opts.priority);

  return Math.max(0, score);
}

// Compute budget context for a dispatch. Returns:
//   { overBudget: boolean, burnPct: number|null, costWeight: number,
//     downgrade: boolean, exemptTask: boolean }
//
// downgrade=true means we're past the 110% threshold AND the task isn't in
// the exempt list. costWeight gets cranked up to bias toward cheap tier.
function computeBudgetContext(taskType) {
  const dispatchPolicy = configService.getDispatchPolicy();
  const normalWeight = dispatchPolicy?.cost_weight_normal ?? 0.1;
  const downgradeWeight = dispatchPolicy?.cost_weight_downgrade ?? 0.45;
  const empty = (extra = {}) => ({
    overBudget: false, burnPct: null, costWeight: normalWeight, downgrade: false, exemptTask: false, ...extra,
  });
  try {
    const routing = db.loadModelRouting() || {};
    const rules = routing.downgradeRules || [];
    const downgradeRule = rules.find((r) => r.trigger === 'monthly_burn_above_pct');
    if (!downgradeRule) return empty();

    const cutoffMs = Date.now() - 30 * 24 * 3600 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const runs = db.getRecentAgentRuns(30 * 24);
    const totalCost = runs.reduce((acc, r) => {
      if (r.timestamp < cutoffIso) return acc;
      return acc + (r.estimatedCost || 0);
    }, 0);
    const totalBudget = routing.totalMonthlyBudgetUsd || 0;
    if (totalBudget <= 0) return empty();

    const burnPct = (totalCost / totalBudget) * 100;
    const overBudget = burnPct > (downgradeRule.threshold || 110);
    const exemptTasks = downgradeRule.exempt_tasks || [];
    const exemptTask = !!taskType && exemptTasks.includes(taskType);
    const downgrade = overBudget && !exemptTask;

    return {
      overBudget,
      burnPct: Math.round(burnPct * 10) / 10,
      costWeight: downgrade ? downgradeWeight : normalWeight,
      downgrade,
      exemptTask,
    };
  } catch (err) {
    console.warn('[dispatch] computeBudgetContext failed:', err.message);
    return empty();
  }
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

/**
 * GET /api/dispatch/recommend?q=<free text>
 * Returns top agents ranked by skill overlap with the query.
 */
router.get('/dispatch/recommend', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q is required' });

  const tokens = tokenize(q);
  if (tokens.length === 0) return res.json({ results: [] });

  const registry = org.loadRegistry();
  const agents = registry.agents || {};

  const scored = [];

  for (const [id, agent] of Object.entries(agents)) {
    if (agent.status === 'retired') continue;

    const skills = agent.skills || {};
    let rawScore = 0;
    const matchedSkills = [];

    for (const token of tokens) {
      for (const [skillKey, skillData] of Object.entries(skills)) {
        // exact or substring match against skill key
        if (skillKey === token || skillKey.includes(token) || token.includes(skillKey)) {
          const contribution = (skillData.score || 0) * Math.log1p(skillData.hits || 0);
          rawScore += contribution;
          if (!matchedSkills.includes(skillKey)) matchedSkills.push(skillKey);
        }
      }
    }

    if (rawScore > 0) {
      scored.push({
        agentId: id,
        name: agent.title ? `${id} — ${agent.title}` : id,
        department: agent.department || null,
        level: agent.levelTitle || null,
        tier: agent.tier || null,
        status: agent.status || 'active',
        score: rawScore,
        matchedSkills,
      });
    }
  }

  // Normalize scores to 0-1 range
  const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 1);
  scored.forEach(s => { s.score = Math.round((s.score / maxScore) * 100) / 100; });

  scored.sort((a, b) => b.score - a.score);

  res.json({ query: q, tokens, results: scored.slice(0, 5) });
});

/**
 * POST /api/dispatch/assign
 *
 * Smart dispatch — picks the best agent for a task based on:
 *   skill match × current load × success rate × cost tier × priority.
 *
 * Body:
 *   { query, taskType?, priority?, estimatedTokens?, preferredAgent?,
 *     dryRun?, title? }
 *
 * Returns:
 *   200 { ok, taskId, agentId, score, candidates } on success
 *   200 { ok, dryRun: true, candidates }              when dryRun=true
 *   400 if query missing / invalid
 *   429 if no eligible agent has capacity
 */
const VALID_TASK_TYPES = new Set(['build', 'bug', 'spike', 'review', 'design', 'research', 'deploy', 'test', 'workflow', 'general']);
const VALID_PRIORITIES = new Set(['p0', 'p1', 'p2', 'p3']);
const MAX_QUERY_LEN = 2000;
const MAX_TITLE_LEN = 200;
const MAX_EST_TOKENS = 2_000_000;

router.post('/dispatch/assign', (req, res) => {
  const { query, taskType, priority = 'p2', estimatedTokens = 0,
    preferredAgent, dryRun = false, title } = req.body || {};

  // ── Input validation ──────────────────────────────────────────────────
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query is required (string)' });
  }
  if (query.length > MAX_QUERY_LEN) {
    return res.status(400).json({ error: `query too long (max ${MAX_QUERY_LEN} chars)` });
  }
  if (taskType && !VALID_TASK_TYPES.has(taskType)) {
    return res.status(400).json({
      error: `invalid taskType "${taskType}"`,
      valid: Array.from(VALID_TASK_TYPES),
    });
  }
  if (!VALID_PRIORITIES.has(priority)) {
    return res.status(400).json({
      error: `invalid priority "${priority}"`,
      valid: Array.from(VALID_PRIORITIES),
    });
  }
  if (typeof estimatedTokens !== 'number' || estimatedTokens < 0 || estimatedTokens > MAX_EST_TOKENS) {
    return res.status(400).json({ error: `estimatedTokens must be a number 0..${MAX_EST_TOKENS}` });
  }
  if (preferredAgent && (typeof preferredAgent !== 'string' || preferredAgent.length > 100)) {
    return res.status(400).json({ error: 'preferredAgent must be a short string id' });
  }
  if (title && (typeof title !== 'string' || title.length > MAX_TITLE_LEN)) {
    return res.status(400).json({ error: `title must be a string ≤ ${MAX_TITLE_LEN} chars` });
  }

  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return res.status(400).json({ error: 'query produced no usable tokens' });
  }

  // 1. Build candidate set — same skill scoring as /recommend, top-10
  const registry = org.loadRegistry();
  const agentEntries = Object.entries(registry.agents || {});
  const skillRanked = [];
  for (const [id, agent] of agentEntries) {
    if (agent.status === 'retired') continue;
    const skills = agent.skills || {};
    let rawScore = 0;
    const matchedSkills = [];
    for (const token of tokens) {
      for (const [skillKey, skillData] of Object.entries(skills)) {
        if (skillKey === token || skillKey.includes(token) || token.includes(skillKey)) {
          rawScore += (skillData.score || 0) * Math.log1p(skillData.hits || 0);
          if (!matchedSkills.includes(skillKey)) matchedSkills.push(skillKey);
        }
      }
    }
    if (rawScore > 0) {
      skillRanked.push({ id, agent, rawScore, matchedSkills });
    }
  }

  if (skillRanked.length === 0) {
    return res.status(404).json({ error: 'no agents matched the query', tokens });
  }

  // Normalize skill scores to 0-1
  const maxRaw = skillRanked.reduce((m, c) => Math.max(m, c.rawScore), 1);
  for (const c of skillRanked) c.skillScore = c.rawScore / maxRaw;

  // 2. Hydrate with live load + perf signals + cost tier
  const loads = tasks.getAllAgentLoad();
  const candidates = skillRanked
    .map((c) => {
      const load = loads[c.id] || { activeTaskCount: 0, maxConcurrentTasks: 3, loadStatus: 'free' };
      const stats = c.agent.stats || {};
      return {
        agentId: c.id,
        title: c.agent.title || null,
        department: c.agent.department || null,
        tier: c.agent.tier || null,
        status: c.agent.status || 'active',
        model: c.agent.model || configService.getConfig('defaults.model'),
        skillScore: Math.round(c.skillScore * 100) / 100,
        matchedSkills: c.matchedSkills,
        successRate: typeof stats.successRate === 'number' ? stats.successRate : null,
        totalRuns: stats.totalRuns || 0,
        avgDurationMs: stats.avgDurationMs || null,
        activeTaskCount: load.activeTaskCount,
        maxConcurrentTasks: load.maxConcurrentTasks,
        loadStatus: load.loadStatus,
      };
    });

  // 3. Filter eligibility — only active agents with capacity + proven not-broken
  //    successRate < 0.6 only disqualifies if the agent has enough run history
  //    (totalRuns >= 5) to make that signal meaningful. Brand-new agents with
  //    0 runs (successRate=0 by default) shouldn't be locked out forever.
  const eligible = candidates.filter((c) => {
    if (c.status !== 'active') return false;
    if (c.activeTaskCount >= c.maxConcurrentTasks) return false;
    if (
      typeof c.successRate === 'number' && c.successRate < 0.6 &&
      typeof c.totalRuns === 'number' && c.totalRuns >= 5
    ) return false;
    return true;
  });

  // 4. Score + sort — apply budget-aware cost weighting if monthly burn is over.
  //    Exempt tasks (billing/auth/deploy/security_review) keep normal weighting.
  const budget = computeBudgetContext(taskType);
  for (const c of eligible) {
    c.score = Math.round(rankCandidate(c, { priority, costWeight: budget.costWeight }) * 1000) / 1000;
  }
  eligible.sort((a, b) => b.score - a.score);

  // 5. preferredAgent override (only if eligible)
  let chosen = null;
  if (preferredAgent) {
    chosen = eligible.find((c) => c.agentId === preferredAgent) || null;
  }
  if (!chosen) chosen = eligible[0] || null;

  if (!chosen) {
    return res.status(429).json({
      error: 'no eligible agent — all matches at capacity, retired, or below 0.6 success rate',
      candidates: candidates.slice(0, 5),
    });
  }

  // Dry-run: just return the ranking, don't create the task
  if (dryRun) {
    return res.json({
      ok: true,
      dryRun: true,
      query,
      tokens,
      chosen: chosen.agentId,
      score: chosen.score,
      budget,
      candidates: eligible.slice(0, 5),
    });
  }

  // 6. Create the task — increments agent load via tasks.createTask
  let task;
  try {
    task = tasks.createTask({
      agentId: chosen.agentId,
      source: 'auto-route',
      taskType: taskType || 'general',
      title: title || query.slice(0, 80),
      prompt: query,
      priority,
      estimatedTokens,
      metadata: {
        dispatcher: 'POST /api/dispatch/assign',
        score: chosen.score,
        skillScore: chosen.skillScore,
        matchedSkills: chosen.matchedSkills,
        loadAtAssignment: { active: chosen.activeTaskCount, max: chosen.maxConcurrentTasks },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  res.json({
    ok: true,
    taskId: task.id,
    agentId: chosen.agentId,
    score: chosen.score,
    reason: explainScore(chosen, { priority, budget }),
    budget,
    candidates: eligible.slice(0, 5),
  });
});

function explainScore(c, opts) {
  const parts = [];
  parts.push(`skill=${c.skillScore.toFixed(2)}`);
  parts.push(`load=${c.activeTaskCount}/${c.maxConcurrentTasks}`);
  if (typeof c.successRate === 'number') parts.push(`success=${c.successRate.toFixed(2)}`);
  parts.push(`tier=${c.model}`);
  if (opts.priority && opts.priority !== 'p2') parts.push(`priority=${opts.priority}`);
  if (opts.budget?.downgrade) parts.push(`budget-downgrade(burn=${opts.budget.burnPct}%)`);
  return parts.join(' · ');
}

function validateTaskId(req, res, next) {
  const id = req.params.id;
  if (!id || typeof id !== 'string' || id.length > 200) {
    return res.status(400).json({ error: 'invalid task id' });
  }
  const t = tasks.getTask(id);
  if (!t) return res.status(404).json({ error: `task ${id} not found` });
  req.task = t;
  next();
}

/**
 * POST /api/dispatch/tasks/:id/complete
 * Mark a task as complete. Decrements agent load.
 * Body: { output?, actualTokens?, actualCostUsd? }
 */
router.post('/dispatch/tasks/:id/complete', validateTaskId, (req, res) => {
  try {
    const updated = tasks.markComplete(req.params.id, req.body?.output, {
      actualTokens: typeof req.body?.actualTokens === 'number' ? req.body.actualTokens : undefined,
      actualCostUsd: typeof req.body?.actualCostUsd === 'number' ? req.body.actualCostUsd : undefined,
    });
    res.json({ ok: true, task: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/dispatch/tasks/:id/fail', validateTaskId, (req, res) => {
  try {
    const updated = tasks.markFailed(req.params.id, req.body?.error || 'failed', {
      actualTokens: typeof req.body?.actualTokens === 'number' ? req.body.actualTokens : undefined,
      actualCostUsd: typeof req.body?.actualCostUsd === 'number' ? req.body.actualCostUsd : undefined,
    });
    res.json({ ok: true, task: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/dispatch/tasks/:id/cancel', validateTaskId, (req, res) => {
  try {
    const updated = tasks.cancel(req.params.id, req.body?.reason || 'cancelled');
    res.json({ ok: true, task: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/dispatch/tasks/:id', (req, res) => {
  const t = tasks.getTask(req.params.id);
  if (!t) return res.status(404).json({ error: 'task not found' });
  res.json(t);
});

router.get('/dispatch/agents/:id/tasks', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  res.json({ items: tasks.recentForAgent(req.params.id, limit) });
});

module.exports = router;
