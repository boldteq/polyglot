/**
 * Experience Module — computes per-agent experience level, years of
 * experience, and skill vectors from multiple signals:
 *
 *   1. Training depth   → word count of the agent's .md file
 *   2. Tenure           → days since hiredAt
 *   3. Runs             → count from agent-runs.json
 *   4. Successes        → success_rate * run count
 *   5. Patterns         → patterns/good/*.md files where this agent is cited
 *   6. Antipatterns     → lessons/bugs.jsonl entries where agent_that_shipped matches
 *
 * The formula is deterministic, transparent, and tunable via
 * ~/.claude/org/experience-weights.json (optional override).
 *
 * YoE (years of experience) is scaled to feel human:
 *   ~10 KB of training content = 1 year
 *   ~20 runs = 1 year
 *   ~90 days of tenure = 1 year
 *
 * Levels map to human career titles from Trainee (0) to Distinguished (8).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');
const MEMORY_DIR = path.join(CLAUDE_DIR, 'memory');
const WEIGHTS_PATH = path.join(CLAUDE_DIR, 'org', 'experience-weights.json');

// Path to Polyglot's run-tracking files (caller-controlled in tests)
const POLYGLOT_ROOT = path.resolve(__dirname, '..');
const AGENT_RUNS_PATH = path.join(POLYGLOT_ROOT, 'agent-runs.json');

// ──────────────────────────────────────────────────────────────────────────
//  Weights — tunable via ~/.claude/org/experience-weights.json
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  trainingKbPerYear: 10,   // 10 KB of .md content = 1 YoE
  runsPerYear: 20,         // 20 runs = 1 YoE
  daysPerYear: 90,         // 90 days tenure = 1 YoE
  patternWeight: 0.5,      // each pattern contributed = +0.5 YoE
  antipatternPenalty: 0.3, // each antipattern triggered = -0.3 YoE
  successBonus: 0.5,       // high success rate bonus (max +0.5 YoE)
};

function loadWeights() {
  try {
    const dbModule = require('./db');
    const stored = dbModule.loadExperienceWeights();
    if (stored && Object.keys(stored).length > 0) return { ...DEFAULT_WEIGHTS, ...stored };
  } catch (e) {
    try { require('./lib/logger').warn(`loadWeights fallback: ${e.message}`, { category: 'db' }); } catch {}
  }
  return { ...DEFAULT_WEIGHTS };
}

// ──────────────────────────────────────────────────────────────────────────
//  Levels
// ──────────────────────────────────────────────────────────────────────────

const LEVEL_THRESHOLDS = [
  { level: 0, title: 'Trainee',       minYoE: 0,    maxYoE: 1,  color: '#9ca3af', canMentor: false, canShipProd: false },
  { level: 1, title: 'Junior',        minYoE: 1,    maxYoE: 3,  color: '#6ee7b7', canMentor: false, canShipProd: false },
  { level: 2, title: 'Mid',           minYoE: 3,    maxYoE: 5,  color: '#34d399', canMentor: false, canShipProd: true },
  { level: 3, title: 'Senior',        minYoE: 5,    maxYoE: 8,  color: '#10b981', canMentor: true,  canShipProd: true },
  { level: 4, title: 'Lead',          minYoE: 8,    maxYoE: 12, color: '#3b82f6', canMentor: true,  canShipProd: true },
  { level: 5, title: 'Principal',     minYoE: 12,   maxYoE: 18, color: '#8b5cf6', canMentor: true,  canShipProd: true },
  { level: 6, title: 'Staff',         minYoE: 18,   maxYoE: 25, color: '#a855f7', canMentor: true,  canShipProd: true },
  { level: 7, title: 'Distinguished', minYoE: 25,   maxYoE: 40, color: '#f59e0b', canMentor: true,  canShipProd: true },
  { level: 8, title: 'Fellow',        minYoE: 40,   maxYoE: Infinity, color: '#eab308', canMentor: true, canShipProd: true },
];

function levelForYoE(yoe) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (yoe >= LEVEL_THRESHOLDS[i].minYoE) return LEVEL_THRESHOLDS[i];
  }
  return LEVEL_THRESHOLDS[0];
}

// ──────────────────────────────────────────────────────────────────────────
//  Signal collection
// ──────────────────────────────────────────────────────────────────────────

function readAgentFileStats(agentId) {
  const mdPath = path.join(AGENTS_DIR, `${agentId}.md`);
  if (!fs.existsSync(mdPath)) {
    return { sizeBytes: 0, words: 0, lines: 0, exists: false };
  }
  try {
    const content = fs.readFileSync(mdPath, 'utf-8');
    const sizeBytes = Buffer.byteLength(content, 'utf-8');
    const words = content.split(/\s+/).filter(Boolean).length;
    const lines = content.split(/\n/).length;
    return { sizeBytes, words, lines, exists: true };
  } catch {
    return { sizeBytes: 0, words: 0, lines: 0, exists: false };
  }
}

function loadAgentRuns() {
  try {
    const dbModule = require('./db');
    return dbModule.loadAgentRuns(10000);
  } catch (e) {
    try { require('./lib/logger').warn(`loadAgentRuns fallback: ${e.message}`, { category: 'db' }); } catch {}
    return [];
  }
}

function computeRunStats(agentId, allRuns) {
  const runs = allRuns.filter((r) => r.agentName === agentId);
  const total = runs.length;
  const successes = runs.filter((r) => r.status === 'success').length;
  const failures = runs.filter((r) => r.status === 'failed' || r.status === 'error').length;
  const successRate = total > 0 ? successes / total : 0;
  const totalDuration = runs.reduce((s, r) => s + (r.duration || 0), 0);
  const avgDurationMs = total > 0 ? totalDuration / total : 0;
  const lastRunAt = runs.length > 0
    ? runs.map((r) => r.timestamp).sort().slice(-1)[0]
    : null;
  return { totalRuns: total, successRuns: successes, failedRuns: failures, successRate, avgDurationMs, lastRunAt };
}

function countPatternsContributed(agentId) {
  const goodDir = path.join(MEMORY_DIR, 'patterns', 'good');
  if (!fs.existsSync(goodDir)) return 0;
  let count = 0;
  const files = fs.readdirSync(goodDir).filter((f) => f.endsWith('.md'));
  const needle = new RegExp(`\\b${agentId}\\b`, 'i');
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(goodDir, f), 'utf-8');
      // Look in source/contributor blocks
      if (/source:|contributor:|author:/i.test(content) && needle.test(content)) {
        count++;
      }
    } catch {}
  }
  return count;
}

function countAntipatternsTriggered(agentId) {
  const bugsPath = path.join(MEMORY_DIR, 'lessons', 'bugs.jsonl');
  if (!fs.existsSync(bugsPath)) return 0;
  try {
    const lines = fs.readFileSync(bugsPath, 'utf-8').split('\n').filter(Boolean);
    let count = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.agent_that_shipped === agentId || entry.agent === agentId) count++;
      } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  Skill vector — keyword scan of agent .md body
// ──────────────────────────────────────────────────────────────────────────

const SKILL_KEYWORDS = {
  react:        ['react', 'jsx', 'tsx', 'hooks', 'useeffect', 'usestate'],
  typescript:   ['typescript', 'tsc', 'strict mode', 'interface', 'generic'],
  nextjs:       ['next.js', 'nextjs', 'app router', 'server component', 'route handler'],
  supabase:     ['supabase', 'rls', 'row level security', 'postgres'],
  shopify:      ['shopify', 'polaris', 'admin api', 'storefront', 'embedded app'],
  billing:      ['stripe', 'dodo', 'billing', 'subscription', 'payment', 'checkout'],
  auth:         ['auth', 'oauth', 'session', 'jwt', 'magic link', 'otp'],
  testing:      ['test', 'vitest', 'jest', 'playwright', 'e2e', 'unit test'],
  design:       ['figma', 'design system', 'tailwind', 'shadcn', 'polaris'],
  seo:          ['seo', 'meta tags', 'sitemap', 'schema.org', 'core web vitals'],
  deployment:   ['deploy', 'railway', 'vercel', 'docker', 'ci/cd'],
  ai:           ['llm', 'prompt', 'streaming', 'tool use', 'anthropic', 'openai'],
  marketing:    ['landing page', 'copy', 'funnel', 'conversion', 'email campaign'],
  research:     ['validation', 'icp', 'persona', 'interview', 'market size'],
  debugging:    ['bug', 'stack trace', 'root cause', 'regression', 'incident'],
  architecture: ['architecture', 'data model', 'api design', 'scalab', 'system design'],
};

function computeSkillVector(agentId) {
  const mdPath = path.join(AGENTS_DIR, `${agentId}.md`);
  if (!fs.existsSync(mdPath)) return {};
  try {
    const content = fs.readFileSync(mdPath, 'utf-8').toLowerCase();
    const skills = {};
    for (const [skill, keywords] of Object.entries(SKILL_KEYWORDS)) {
      let hits = 0;
      for (const kw of keywords) {
        const re = new RegExp(`\\b${kw.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        const matches = content.match(re);
        if (matches) hits += matches.length;
      }
      if (hits > 0) {
        // Normalize: log-scale so a few hits ≈ 0.3, many hits ≈ 0.9
        const score = Math.min(1, Math.log10(hits + 1) / Math.log10(50));
        skills[skill] = { score: Math.round(score * 100) / 100, hits };
      }
    }
    return skills;
  } catch {
    return {};
  }
}

function identifyWeaknesses(skills, threshold = 0.3) {
  return Object.entries(skills)
    .filter(([, data]) => data.score < threshold)
    .map(([skill]) => skill);
}

// ──────────────────────────────────────────────────────────────────────────
//  Experience computation
// ──────────────────────────────────────────────────────────────────────────

/**
 * Compute a full experience profile for one agent.
 *
 * @param {object} registryRecord — from ~/.claude/org/registry.json
 * @param {array}  allRuns        — from agent-runs.json (pass once for all agents)
 * @returns {object} Full experience profile to merge back into registry
 */
function computeExperience(registryRecord, allRuns) {
  const weights = loadWeights();
  const agentId = registryRecord.id;
  const hiredAt = registryRecord.hiredAt ? new Date(registryRecord.hiredAt) : new Date();
  const ageDays = Math.max(0, (Date.now() - hiredAt.getTime()) / (1000 * 60 * 60 * 24));

  // 1. Training depth
  const fileStats = readAgentFileStats(agentId);
  const fileKb = fileStats.sizeBytes / 1024;

  // 2. Run stats
  const runStats = computeRunStats(agentId, allRuns);

  // 3. Pattern contributions
  const patternsContributed = countPatternsContributed(agentId);

  // 4. Antipatterns triggered
  const antipatternsTriggered = countAntipatternsTriggered(agentId);

  // 5. Compute YoE
  const yoeTraining = fileKb / weights.trainingKbPerYear;
  const yoeRuns = runStats.totalRuns / weights.runsPerYear;
  const yoeTenure = ageDays / weights.daysPerYear;
  const yoePatterns = patternsContributed * weights.patternWeight;
  const yoeSuccess = runStats.successRate * weights.successBonus;
  const yoeAntipatterns = -antipatternsTriggered * weights.antipatternPenalty;

  const yearsOfExperience = Math.max(
    0,
    yoeTraining + yoeRuns + yoeTenure + yoePatterns + yoeSuccess + yoeAntipatterns
  );

  // 6. Level from YoE
  const levelInfo = levelForYoE(yearsOfExperience);

  // 7. Skills
  const skills = computeSkillVector(agentId);
  const weaknesses = identifyWeaknesses(skills);

  // 8. Experience points (separate from YoE, used for UI progress bars)
  const experiencePoints = Math.round(yearsOfExperience * 100);

  // 9. Next level threshold (for progress-to-next-level UI)
  const nextLevel = LEVEL_THRESHOLDS[levelInfo.level + 1] || null;
  const progressToNext = nextLevel
    ? Math.min(1, (yearsOfExperience - levelInfo.minYoE) / (nextLevel.minYoE - levelInfo.minYoE))
    : 1;

  return {
    // Level
    level: levelInfo.level,
    levelTitle: levelInfo.title,
    levelColor: levelInfo.color,
    canMentor: levelInfo.canMentor,
    canShipProd: levelInfo.canShipProd,
    // Experience
    yearsOfExperience: Math.round(yearsOfExperience * 10) / 10,
    experiencePoints,
    progressToNext: Math.round(progressToNext * 100) / 100,
    nextLevelTitle: nextLevel?.title || null,
    // Breakdown (for HR UI transparency)
    breakdown: {
      training: Math.round(yoeTraining * 10) / 10,
      runs: Math.round(yoeRuns * 10) / 10,
      tenure: Math.round(yoeTenure * 10) / 10,
      patterns: Math.round(yoePatterns * 10) / 10,
      success: Math.round(yoeSuccess * 10) / 10,
      antipatterns: Math.round(yoeAntipatterns * 10) / 10,
    },
    // Underlying stats
    stats: {
      fileSizeKb: Math.round(fileKb * 10) / 10,
      fileWords: fileStats.words,
      totalRuns: runStats.totalRuns,
      successRuns: runStats.successRuns,
      failedRuns: runStats.failedRuns,
      successRate: Math.round(runStats.successRate * 100) / 100,
      avgDurationMs: Math.round(runStats.avgDurationMs),
      lastRunAt: runStats.lastRunAt,
      ageDays: Math.round(ageDays * 10) / 10,
      patternsContributed,
      antipatternsTriggered,
    },
    // Skills
    skills,
    weaknesses,
    // Metadata
    computedAt: new Date().toISOString(),
  };
}

/**
 * Recompute experience for every agent in the registry and write the result
 * back to registry.json. Called nightly by Roster (Phase 5 cron) and on
 * demand via POST /api/hr/recompute-experience.
 *
 * @param {object} orgModule — the src/org.js module (injected to avoid circular dep)
 * @returns {object} Summary { updated, errors, durationMs }
 */
function recomputeAllExperience(orgModule) {
  const started = Date.now();
  const allRuns = loadAgentRuns();
  const registry = orgModule.loadRegistry();
  const agentIds = Object.keys(registry.agents || {});

  let updated = 0;
  const errors = [];

  for (const id of agentIds) {
    try {
      const record = registry.agents[id];
      const profile = computeExperience(record, allRuns);
      registry.agents[id] = { ...record, ...profile };
      updated++;
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  orgModule.saveRegistry(registry);

  return {
    updated,
    total: agentIds.length,
    errors,
    durationMs: Date.now() - started,
  };
}

module.exports = {
  LEVEL_THRESHOLDS,
  DEFAULT_WEIGHTS,
  loadWeights,
  levelForYoE,
  readAgentFileStats,
  loadAgentRuns,
  computeRunStats,
  countPatternsContributed,
  countAntipatternsTriggered,
  computeSkillVector,
  identifyWeaknesses,
  computeExperience,
  recomputeAllExperience,
};
