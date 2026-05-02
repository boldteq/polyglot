/**
 * HR Module — People operations for the Polyglot agent factory.
 *
 * Exposes operations that Cadence, Roster, and Witness execute via their
 * agent .md prompts, and that the /hr UI calls directly.
 *
 * Depends on:
 *   - src/org.js       — registry + departments source of truth
 *   - src/experience.js — level/YoE/skills computation
 *
 * Owned data paths (all under ~/.claude/org/):
 *   - reviews/YYYY-WW.json         — weekly Cadence review files
 *   - reviews/latest.md            — human-readable latest summary for Yash
 *   - witness-log.jsonl            — append-only accountability log
 *   - daily-scores.jsonl           — per-agent daily accountability scores
 *   - recommendations.json         — current Witness PIP/promotion candidates
 *   - training-queue.json          — pending curriculum per agent
 *   - capability-gaps.jsonl        — append-only log of detected gaps
 *   - antipattern-signatures.json  — detection rules
 *   - onboarding/<agent>.json      — probationary checklists for new hires
 *   - playbooks/onboarding.md      — standard onboarding steps
 *   - playbooks/pip.md             — PIP protocol
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const dbModule = require('./db');

const HOME = os.homedir();
const ORG_DIR = path.join(HOME, '.claude', 'org');
const REVIEWS_DIR = path.join(ORG_DIR, 'reviews');
const ONBOARDING_DIR = path.join(ORG_DIR, 'onboarding');
const PLAYBOOKS_DIR = path.join(ORG_DIR, 'playbooks');

const WITNESS_LOG = path.join(ORG_DIR, 'witness-log.jsonl');
const DAILY_SCORES = path.join(ORG_DIR, 'daily-scores.jsonl');
const RECOMMENDATIONS = path.join(ORG_DIR, 'recommendations.json');
const TRAINING_QUEUE = path.join(ORG_DIR, 'training-queue.json');
const CAPABILITY_GAPS = path.join(ORG_DIR, 'capability-gaps.jsonl');
const ANTIPATTERN_SIGS = path.join(ORG_DIR, 'antipattern-signatures.json');
const SKILL_INDEX = path.join(ORG_DIR, 'skill-index.json');

// ──────────────────────────────────────────────────────────────────────────
//  File helpers
// ──────────────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function appendJsonl(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(obj) + '\n');
}

// Compact a JSONL file when it exceeds maxLines — keep only the most recent entries.
// Archives the full file to <file>.archive-<date> before truncating.
function compactJsonlIfNeeded(filePath, maxLines) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length <= maxLines) return;
    // Archive first
    const archivePath = filePath + '.archive-' + new Date().toISOString().slice(0, 10);
    try { fs.renameSync(filePath, archivePath); } catch {}
    // Write trimmed file (most recent entries)
    const trimmed = lines.slice(-Math.floor(maxLines * 0.8)).join('\n') + '\n';
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, trimmed, 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch {}
}

function readJsonl(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function currentIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────────────────
//  Registry views
// ──────────────────────────────────────────────────────────────────────────

function getRegistry(orgModule) {
  const reg = orgModule.loadRegistry();
  const agents = Object.values(reg.agents || {});
  // Sort: by department, then by level desc, then by name
  agents.sort((a, b) => {
    if (a.department !== b.department) return (a.department || '').localeCompare(b.department || '');
    if ((b.level || 0) !== (a.level || 0)) return (b.level || 0) - (a.level || 0);
    return a.id.localeCompare(b.id);
  });
  return {
    version: reg.version || 1,
    updatedAt: reg.updatedAt,
    total: agents.length,
    agents,
  };
}

function getAgentProfile(orgModule, agentId) {
  const record = orgModule.findAgent(agentId);
  if (!record) return null;
  // Enrich with direct reports + manager
  const reports = orgModule.findDirectReports(agentId);
  return {
    ...record,
    directReports: reports.map((r) => ({ id: r.id, title: r.title, level: r.level })),
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  Witness operations — accountability log
// ──────────────────────────────────────────────────────────────────────────

function logWitnessEvent({ agent, runId, classification, meta = {} }) {
  const entry = {
    t: new Date().toISOString(),
    agent,
    runId: runId || null,
    class: classification,
    ...meta,
  };
  dbModule.appendWitnessEvent(entry);
  return entry;
}

function getWitnessLog({ agent, days = 30, limit = 500 } = {}) {
  return dbModule.getWitnessLog({ agent, days, limit });
}

/**
 * Run the daily Witness sweep — classify recent runs, detect antipatterns,
 * compute daily scores, generate PIP/promotion recommendations.
 *
 * @param {object} orgModule    — src/org.js
 * @param {object} experienceModule — src/experience.js
 * @param {array}  agentRuns    — last 24h of agent-runs.json entries
 */
function runWitnessSweep(orgModule, experienceModule, agentRuns) {
  const startedAt = new Date().toISOString();
  const registry = orgModule.loadRegistry();
  const agents = registry.agents || {};

  // 1. Classify each run in the window
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = agentRuns.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  const classified = [];

  for (const run of recent) {
    let classification = 'SUCCESS';
    if (run.status === 'failed' || run.status === 'error' || run.error) {
      classification = 'FAILURE';
    } else if (run.duration && run.duration > 600000) {
      classification = 'TIMEOUT';
    } else if (run.status === 'success') {
      classification = 'SUCCESS';
    } else {
      classification = 'UNCLASSIFIED';
    }
    const entry = logWitnessEvent({
      agent: run.agentName,
      runId: run.id,
      classification,
      meta: {
        durationMs: run.duration,
        taskType: run.taskType || 'general',
        project: run.metadata?.projectId || null,
      },
    });
    classified.push(entry);
  }

  // 2. Compute daily scores
  const scoresByAgent = {};
  for (const entry of classified) {
    if (!scoresByAgent[entry.agent]) {
      scoresByAgent[entry.agent] = { agent: entry.agent, success: 0, failure: 0, antipattern: 0, regression: 0, score: 0 };
    }
    const s = scoresByAgent[entry.agent];
    if (entry.class === 'SUCCESS') s.success++;
    else if (entry.class === 'FAILURE' || entry.class === 'TIMEOUT') s.failure++;
    else if (entry.class === 'ANTIPATTERN') s.antipattern++;
    else if (entry.class === 'REGRESSION') s.regression++;
  }
  for (const s of Object.values(scoresByAgent)) {
    s.score = s.success * 1 - s.failure * 1 - s.antipattern * 2 - s.regression * 3;
    s.date = new Date().toISOString().slice(0, 10);
    dbModule.appendDailyScore(s);
  }

  // 3. Generate PIP + promotion recommendations
  const pipCandidates = [];
  const promotionCandidates = [];

  // Lazy-required so hr.js can stay independent in test contexts
  let escalation = null;
  try { escalation = require('./lib/escalation'); } catch { /* optional */ }

  for (const id of Object.keys(agents)) {
    const a = agents[id];
    if (a.status === 'retired' || a.status === 'pip') continue;

    const stats = a.stats || {};
    const successRate = stats.successRate ?? 1;
    const antipatterns = stats.antipatternsTriggered || 0;

    // PIP triggers
    let pipReason = null;
    let pipSeverity = null;
    if (stats.totalRuns >= 20 && successRate < 0.7) {
      pipReason = `Success rate ${Math.round(successRate * 100)}%`;
      pipSeverity = successRate < 0.5 ? 'high' : 'medium';
      pipCandidates.push({ agent: id, reasons: [pipReason], severity: pipSeverity });
    } else if (antipatterns >= 3) {
      pipReason = `${antipatterns} antipatterns triggered`;
      pipSeverity = 'medium';
      pipCandidates.push({ agent: id, reasons: [pipReason], severity: pipSeverity });
    }

    // Auto-open escalation for any new PIP candidate. Severity maps:
    //   PIP severity 'high'   → P1 escalation
    //   PIP severity 'medium' → P2
    // Tier starts at 'pod-lead' since this is already past specialist-level
    // self-correction (Witness only flags after 20+ runs of poor data).
    if (pipReason && escalation) {
      try {
        escalation.open({
          issueId: `pip-${id}-${new Date().toISOString().slice(0, 10)}`,
          agentId: id,
          ownerId: 'cadence',
          title: `PIP candidate: ${id}`,
          summary: pipReason,
          severity: pipSeverity === 'high' ? 'p1' : 'p2',
          tier: 'pod-lead',
        });
      } catch { /* dedup will handle re-runs of the same day */ }
    }

    // Promotion eligibility — level crossed threshold, success rate high, 30+ days at level
    if (a.level != null && a.level < 8 && successRate >= 0.85 && antipatterns === 0) {
      const needsRuns = a.level >= 3 ? (stats.patternsContributed || 0) >= 1 : true;
      if (needsRuns) {
        promotionCandidates.push({
          agent: id,
          fromLevel: a.level,
          toLevel: a.level + 1,
          fromTitle: a.levelTitle,
          signals: [
            `${a.yearsOfExperience} YoE`,
            `${Math.round(successRate * 100)}% success`,
            `${stats.patternsContributed || 0} patterns`,
            `${antipatterns} antipatterns`,
          ],
        });
      }
    }
  }

  const recommendations = {
    generatedAt: startedAt,
    completedAt: new Date().toISOString(),
    runsClassified: classified.length,
    pipCandidates,
    promotionCandidates,
  };
  dbModule.saveRecommendations(recommendations);

  return recommendations;
}

// ──────────────────────────────────────────────────────────────────────────
//  Cadence operations — promotion, PIP, hire, retire
// ──────────────────────────────────────────────────────────────────────────

function promoteAgent(orgModule, experienceModule, agentId) {
  const record = orgModule.findAgent(agentId);
  if (!record) return { ok: false, error: 'Agent not found' };
  if (record.status === 'retired') return { ok: false, error: 'Cannot promote a retired agent' };

  const currentLevel = record.level ?? 0;
  if (currentLevel >= 8) return { ok: false, error: 'Already at max level (Fellow)' };

  const nextThreshold = experienceModule.LEVEL_THRESHOLDS[currentLevel + 1];
  if (!nextThreshold) return { ok: false, error: 'No higher level available' };

  // Grant a promotion bonus: enough XP to cross the threshold
  const bonusYears = Math.max(0, nextThreshold.minYoE - (record.yearsOfExperience || 0)) + 0.1;

  const updated = orgModule.upsertAgent(agentId, {
    level: currentLevel + 1,
    levelTitle: nextThreshold.title,
    levelColor: nextThreshold.color,
    canMentor: nextThreshold.canMentor,
    canShipProd: nextThreshold.canShipProd,
    yearsOfExperience: Math.round(((record.yearsOfExperience || 0) + bonusYears) * 10) / 10,
    lastPromoted: new Date().toISOString(),
    lastReview: new Date().toISOString(),
    status: record.status === 'probation' ? 'active' : record.status,
  });

  logWitnessEvent({
    agent: agentId,
    classification: 'PROMOTION',
    meta: { fromLevel: currentLevel, toLevel: currentLevel + 1, toTitle: nextThreshold.title },
  });

  return { ok: true, agent: updated };
}

function openPip(orgModule, agentId, reason) {
  const record = orgModule.findAgent(agentId);
  if (!record) return { ok: false, error: 'Agent not found' };
  if (record.status === 'pip') return { ok: false, error: 'Already on PIP' };

  const deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const updated = orgModule.upsertAgent(agentId, {
    status: 'pip',
    pip: {
      openedAt: new Date().toISOString(),
      deadline,
      reason: reason || 'Performance below threshold',
      openedBy: 'cadence',
    },
  });

  logWitnessEvent({ agent: agentId, classification: 'PIP_OPENED', meta: { deadline, reason } });
  return { ok: true, agent: updated };
}

function closePip(orgModule, agentId, outcome) {
  const record = orgModule.findAgent(agentId);
  if (!record) return { ok: false, error: 'Agent not found' };
  if (record.status !== 'pip') return { ok: false, error: 'Not on PIP' };

  const updated = orgModule.upsertAgent(agentId, {
    status: outcome === 'pass' ? 'active' : 'retired',
    pip: { ...record.pip, closedAt: new Date().toISOString(), outcome },
  });

  logWitnessEvent({ agent: agentId, classification: 'PIP_CLOSED', meta: { outcome } });
  return { ok: true, agent: updated };
}

function retireAgent(orgModule, agentId, reason) {
  const record = orgModule.findAgent(agentId);
  if (!record) return { ok: false, error: 'Agent not found' };

  const updated = orgModule.upsertAgent(agentId, {
    status: 'retired',
    retiredAt: new Date().toISOString(),
    retiredReason: reason || 'No longer in active rotation',
  });

  logWitnessEvent({ agent: agentId, classification: 'RETIRED', meta: { reason } });
  return { ok: true, agent: updated };
}

function unretireAgent(orgModule, agentId) {
  const record = orgModule.findAgent(agentId);
  if (!record) return { ok: false, error: 'Agent not found' };
  if (record.status !== 'retired') return { ok: false, error: 'Not retired' };

  const updated = orgModule.upsertAgent(agentId, {
    status: 'active',
    retiredAt: null,
    retiredReason: null,
  });

  logWitnessEvent({ agent: agentId, classification: 'UNRETIRED' });
  return { ok: true, agent: updated };
}

// ──────────────────────────────────────────────────────────────────────────
//  Hire — register a new agent + start probationary period
// ──────────────────────────────────────────────────────────────────────────

function hireAgent(orgModule, { id, name, department, phase, reportsTo, title, tier, role, description }) {
  if (!id || !department) return { ok: false, error: 'id and department are required' };

  const existing = orgModule.findAgent(id);
  if (existing) return { ok: false, error: 'Agent already exists' };

  const now = new Date().toISOString();
  const record = orgModule.upsertAgent(id, {
    id,
    name: name || id,
    description: description || '',
    department,
    phase: phase || null,
    reportsTo: reportsTo || 'cadence',
    title: title || 'New Hire',
    tier: tier || 'engineer',
    role: role || null,
    hiredAt: now,
    status: 'probation',
    level: 0,
    levelTitle: 'Trainee',
    yearsOfExperience: 0,
    experiencePoints: 0,
  });

  // Create onboarding checklist
  const checklistPath = path.join(ONBOARDING_DIR, `${id}.json`);
  writeJson(checklistPath, {
    agent: id,
    hiredAt: now,
    stage: 'probation',
    runsRequired: 10,
    runsCompleted: 0,
    steps: [
      { id: 'create_md', done: false, label: 'Agent .md file exists on disk' },
      { id: 'load_memory', done: false, label: 'Memory brain loaded into first run' },
      { id: 'shadow_3', done: false, label: 'First 3 runs shadowed by senior agent' },
      { id: 'independent_7', done: false, label: '7 independent runs with Witness watching' },
      { id: 'probation_review', done: false, label: 'Cadence probationary review' },
    ],
    createdAt: now,
  });

  logWitnessEvent({ agent: id, classification: 'HIRED', meta: { department, reportsTo } });
  return { ok: true, agent: record };
}

// ──────────────────────────────────────────────────────────────────────────
//  Training queue
// ──────────────────────────────────────────────────────────────────────────

function getTrainingQueue() {
  return dbModule.getTrainingQueue();
}

function queueTraining({ agent, skill, reason, priority = 'medium' }) {
  const queue = getTrainingQueue();
  queue.items = queue.items || [];
  queue.items.push({
    id: `train-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    agent,
    skill,
    reason,
    priority,
    status: 'pending',
    queuedAt: new Date().toISOString(),
  });
  queue.updatedAt = new Date().toISOString();
  dbModule.saveTrainingQueue(queue);
  return queue;
}

function completeTraining(itemId, outcome = 'passed') {
  const queue = getTrainingQueue();
  const item = (queue.items || []).find((i) => i.id === itemId);
  if (!item) return { ok: false, error: 'Item not found' };
  item.status = outcome === 'passed' ? 'completed' : 'failed';
  item.completedAt = new Date().toISOString();
  queue.updatedAt = new Date().toISOString();
  dbModule.saveTrainingQueue(queue);
  return { ok: true, item };
}

// ──────────────────────────────────────────────────────────────────────────
//  Capability gap detection
// ──────────────────────────────────────────────────────────────────────────

/**
 * Given a brief (natural language task description), find out if the
 * current roster can handle it. Uses simple keyword matching against
 * each agent's skill vector from registry.json.
 */
function detectCapabilityGap(orgModule, brief, requiredSkillsHint = []) {
  const registry = orgModule.loadRegistry();
  const agents = Object.values(registry.agents || {})
    .filter((a) => a.status === 'active' || a.status === 'probation');

  // Infer required skills from brief text if not explicitly given
  const inferredSkills = new Set(requiredSkillsHint);
  const briefLower = (brief || '').toLowerCase();
  const SKILL_HINTS = {
    react: ['react', 'component', 'frontend', 'ui'],
    typescript: ['typescript', 'ts'],
    nextjs: ['next.js', 'app router'],
    supabase: ['supabase', 'postgres', 'rls'],
    shopify: ['shopify', 'storefront', 'polaris'],
    billing: ['stripe', 'billing', 'subscription', 'payment', 'dodo'],
    auth: ['auth', 'oauth', 'session', 'login', 'sign in'],
    testing: ['test', 'vitest', 'playwright'],
    design: ['design', 'figma', 'ui/ux'],
    seo: ['seo', 'sitemap', 'meta'],
    deployment: ['deploy', 'railway', 'docker'],
    ai: ['llm', 'gpt', 'claude', 'prompt'],
    marketing: ['landing', 'copy', 'funnel', 'email'],
    research: ['validate', 'icp', 'interview', 'market'],
    debugging: ['bug', 'fix', 'error', 'crash'],
    architecture: ['architecture', 'system design', 'scalab'],
  };
  for (const [skill, hints] of Object.entries(SKILL_HINTS)) {
    if (hints.some((h) => briefLower.includes(h))) inferredSkills.add(skill);
  }

  const required = [...inferredSkills];
  if (required.length === 0) {
    return {
      canHandle: true,
      confidence: 0.5,
      bestMatches: [],
      gaps: [],
      recommendation: 'proceed',
      note: 'No specific skills inferred from brief',
      inferredSkills: [],
    };
  }

  // Score each agent against required skills
  const scored = agents.map((a) => {
    const skills = a.skills || {};
    let totalScore = 0;
    const matched = [];
    const missing = [];
    for (const req of required) {
      const s = skills[req]?.score || 0;
      if (s > 0) matched.push({ skill: req, score: s });
      else missing.push(req);
      totalScore += s;
    }
    return {
      agent: a.id,
      title: a.title,
      level: a.level,
      score: Math.round((totalScore / required.length) * 100) / 100,
      matched,
      missing,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const bestMatches = scored.slice(0, 3);

  // Determine gap + recommendation
  const topScore = bestMatches[0]?.score || 0;
  const allMissing = required.filter((r) => !scored.some((s) => s.matched.find((m) => m.skill === r && m.score >= 0.4)));
  const canHandle = topScore >= 0.7 && allMissing.length === 0;

  let recommendation;
  if (canHandle) recommendation = 'proceed';
  else if (topScore >= 0.4) recommendation = `train-${bestMatches[0].agent}`;
  else recommendation = 'hire';

  // Log the gap
  dbModule.appendCapabilityGap({
    t: new Date().toISOString(),
    brief: brief.slice(0, 200),
    inferredSkills: required,
    gaps: allMissing,
    bestAgent: bestMatches[0]?.agent || null,
    topScore,
    canHandle,
    recommendation,
  });

  return {
    canHandle,
    confidence: topScore,
    bestMatches,
    gaps: allMissing,
    recommendation,
    inferredSkills: required,
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  Weekly Cadence review
// ──────────────────────────────────────────────────────────────────────────

/**
 * Run the weekly Cadence review and write the review file + latest summary.
 * Applies all decisions (promotions/PIPs/retirements).
 */
function runCadenceReview(orgModule, experienceModule, agentRuns) {
  const week = currentIsoWeek();
  const reviewedAt = new Date().toISOString();

  // 1. Refresh experience so decisions use current data
  experienceModule.recomputeAllExperience(orgModule);

  // 2. Run a Witness sweep first so recommendations are current
  runWitnessSweep(orgModule, experienceModule, agentRuns);
  const recommendations = dbModule.loadRecommendations();
  if (!recommendations.pipCandidates) recommendations.pipCandidates = [];
  if (!recommendations.promotionCandidates) recommendations.promotionCandidates = [];

  // 3. Apply promotions
  const promotions = [];
  for (const cand of recommendations.promotionCandidates || []) {
    const result = promoteAgent(orgModule, experienceModule, cand.agent);
    if (result.ok) promotions.push({ agent: cand.agent, to: result.agent.levelTitle });
  }

  // 4. Apply PIPs
  const pipsOpened = [];
  for (const cand of recommendations.pipCandidates || []) {
    const result = openPip(orgModule, cand.agent, cand.reasons.join('; '));
    if (result.ok) pipsOpened.push({ agent: cand.agent });
  }

  // 5. Write review file
  const review = {
    week,
    reviewedAt,
    director: 'cadence',
    promotions,
    pipsOpened,
    pipsClosed: [],
    retirements: [],
    newHires: [],
    capabilityGaps: dbModule.getRecentGaps(10),
    recommendations,
  };
  dbModule.saveReview(week, review);

  // 6. Write human-readable latest.md
  const latest = [
    `# Cadence Review — ${week}`,
    `_${reviewedAt}_`,
    '',
    `**Promotions:** ${promotions.length}`,
    ...promotions.map((p) => `- ${p.agent} → ${p.to}`),
    '',
    `**PIPs opened:** ${pipsOpened.length}`,
    ...pipsOpened.map((p) => `- ${p.agent}`),
    '',
    `**Recommendations pending:**`,
    `- Promotion candidates: ${(recommendations.promotionCandidates || []).length}`,
    `- PIP candidates: ${(recommendations.pipCandidates || []).length}`,
  ].join('\n');
  fs.writeFileSync(path.join(REVIEWS_DIR, 'latest.md'), latest);

  return review;
}

function getLatestReview() {
  return dbModule.getLatestReview();
}

function getRecommendations() {
  const r = dbModule.loadRecommendations();
  return r.pipCandidates ? r : { pipCandidates: [], promotionCandidates: [] };
}

module.exports = {
  // paths
  ORG_DIR,
  REVIEWS_DIR,
  WITNESS_LOG,
  RECOMMENDATIONS,
  TRAINING_QUEUE,

  // registry views
  getRegistry,
  getAgentProfile,

  // witness
  logWitnessEvent,
  getWitnessLog,
  runWitnessSweep,

  // cadence decisions
  promoteAgent,
  openPip,
  closePip,
  retireAgent,
  unretireAgent,
  hireAgent,

  // training
  getTrainingQueue,
  queueTraining,
  completeTraining,

  // capability gap
  detectCapabilityGap,

  // reviews
  runCadenceReview,
  getLatestReview,
  getRecommendations,

  // utility
  currentIsoWeek,
};
