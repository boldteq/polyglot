'use strict';

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const matter = require('gray-matter');
const db = require('../db');
const { rateLimit } = require('../middleware/rateLimit');
const { validateName, validateProjectId, resolveProjectPath, isValidName, isPathAllowed } = require('../lib/validators');
const { parseAgent, parseAgentMeta, listAgents, listAgentsMeta, _invalidateAgentCache } = require('../lib/cache');
const { atomicWriteText, readFileSafe, ensureDir } = require('../lib/atomicIo');
const { loadConfig } = require('../lib/config');
const { discoverProjects } = require('../lib/discovery');

const router = Router();

// Budget-health memo for /api/unified/agents. checkBudget() regex-parses
// agent.raw for ~55 agents on every request. Result is pure given agent content,
// so we key by filename + a content signature (updatedAt is mtime-derived in
// parseAgent, so it changes on any edit → auto-invalidates, never stale, no TTL).
const _healthCache = new Map();

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const VERSIONS_DIR = path.join(__dirname, '..', '..', 'agent-versions');
const TEMPLATES_DIR = path.join(CLAUDE_DIR, 'templates');
const TRAINING_DIR = path.join(CLAUDE_DIR, 'training');

if (!fs.existsSync(VERSIONS_DIR)) fs.mkdirSync(VERSIONS_DIR, { recursive: true });

function snapshotAgent(agentName, content) {
  const agentDir = path.join(VERSIONS_DIR, agentName);
  if (!fs.existsSync(agentDir)) fs.mkdirSync(agentDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  atomicWriteText(path.join(agentDir, `${ts}.md`), content);
  const versions = fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).sort().reverse();
  for (const old of versions.slice(20)) {
    try { fs.unlinkSync(path.join(agentDir, old)); } catch {}
  }
}

// GET /api/global/agents
router.get('/global/agents', (req, res) => {
  const dir = path.join(CLAUDE_DIR, 'agents');
  if (req.query.full === '1') {
    return res.json(listAgents(dir));
  }
  res.json(listAgentsMeta(dir));
});

// GET /api/global/agents/:name
router.get('/global/agents/:name', validateName, (req, res) => {
  const filePath = path.join(CLAUDE_DIR, 'agents', req.params.name + '.md');
  if (req.query.meta === '1') {
    const meta = parseAgentMeta(filePath);
    if (!meta) return res.status(404).json({ error: 'Not found' });
    return res.json(meta);
  }
  const agent = parseAgent(filePath);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json(agent);
});

// PUT /api/global/agents/:name
router.put('/global/agents/:name', validateName, rateLimit('write'), (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  const dir = path.join(CLAUDE_DIR, 'agents');
  ensureDir(dir);
  const filePath = path.join(dir, req.params.name + '.md');

  // Create-only guard: never let a "create" silently overwrite an existing
  // agent's .md with a blank template (C10 audit).
  if (req.query.createOnly === '1' && fs.existsSync(filePath)) {
    return res.status(409).json({ error: `An agent named "${req.params.name}" already exists.` });
  }

  if (process.env.POLYGLOT_BUDGET_ENFORCE !== '0' && req.query.force !== '1') {
    try {
      const { checkBudget } = require('../compactor/budget');
      const check = checkBudget({ agentId: req.params.name, content: req.body.content });
      if (!check.ok) {
        return res.status(409).json({
          error: 'over_budget',
          message: `Agent body exceeds budget. Run the compactor or append ?force=1 to override.`,
          budget: check.budget,
          actual: check.actual,
          violations: check.violations,
          runCompactor: check.suggestion,
        });
      }
      if (check.warnings.length > 0) res.setHeader('X-Budget-Warnings', JSON.stringify(check.warnings));
    } catch (err) {
      console.warn(`[budget] check failed for ${req.params.name}: ${err.message}`);
    }
  }

  if (fs.existsSync(filePath)) {
    try { snapshotAgent(req.params.name, fs.readFileSync(filePath, 'utf-8')); } catch {}
  }
  atomicWriteText(filePath, req.body.content);
  res.json({ ok: true, agent: parseAgent(filePath) });
});

// DELETE /api/global/agents/:name
router.delete('/global/agents/:name', validateName, rateLimit('write'), (req, res) => {
  const filePath = path.join(CLAUDE_DIR, 'agents', req.params.name + '.md');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  _invalidateAgentCache(filePath);
  res.json({ ok: true });
});

// GET /api/global/agents/:name/versions
router.get('/global/agents/:name/versions', validateName, rateLimit('read'), (req, res) => {
  const agentDir = path.join(VERSIONS_DIR, req.params.name);
  if (!fs.existsSync(agentDir)) return res.json([]);
  const versions = fs.readdirSync(agentDir).filter(f => f.endsWith('.md')).sort().reverse();
  res.json(versions.map(f => {
    const stat = fs.statSync(path.join(agentDir, f));
    return { filename: f, timestamp: f.replace('.md', '').replace(/-/g, (m, i) => i > 15 ? '.' : i === 10 ? 'T' : '-') + 'Z', size: stat.size };
  }));
});

// GET /api/global/agents/:name/versions/:ts
router.get('/global/agents/:name/versions/:ts', validateName, rateLimit('read'), (req, res) => {
  const fp = path.join(VERSIONS_DIR, req.params.name, req.params.ts);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Version not found' });
  res.json({ content: fs.readFileSync(fp, 'utf-8') });
});

// POST /api/global/agents/:name/rollback/:ts
router.post('/global/agents/:name/rollback/:ts', validateName, rateLimit('write'), (req, res) => {
  const versionPath = path.join(VERSIONS_DIR, req.params.name, req.params.ts);
  if (!fs.existsSync(versionPath)) return res.status(404).json({ error: 'Version not found' });
  const agentPath = path.join(CLAUDE_DIR, 'agents', req.params.name + '.md');
  if (fs.existsSync(agentPath)) snapshotAgent(req.params.name, fs.readFileSync(agentPath, 'utf-8'));
  atomicWriteText(agentPath, fs.readFileSync(versionPath, 'utf-8'));
  res.json({ ok: true, restoredFrom: req.params.ts });
});

// GET /api/projects/:id/agents
router.get('/projects/:id/agents', validateProjectId, (req, res) => {
  const agents = listAgents(path.join(req.projectPath, '.claude', 'agents'));
  res.json(agents);
});

// GET /api/projects/:id/agents/:name
router.get('/projects/:id/agents/:name', validateProjectId, validateName, (req, res) => {
  const agent = parseAgent(path.join(req.projectPath, '.claude', 'agents', req.params.name + '.md'));
  if (!agent) return res.status(404).json({ error: 'Not found' });
  res.json(agent);
});

// PUT /api/projects/:id/agents/:name
router.put('/projects/:id/agents/:name', validateProjectId, validateName, rateLimit('write'), (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  const dir = path.join(req.projectPath, '.claude', 'agents');
  ensureDir(dir);
  const filePath = path.join(dir, req.params.name + '.md');
  if (req.query.createOnly === '1' && fs.existsSync(filePath)) {
    return res.status(409).json({ error: `An agent named "${req.params.name}" already exists.` });
  }
  atomicWriteText(filePath, req.body.content);
  res.json({ ok: true, agent: parseAgent(filePath) });
});

// DELETE /api/projects/:id/agents/:name
router.delete('/projects/:id/agents/:name', validateProjectId, validateName, rateLimit('write'), (req, res) => {
  const filePath = path.join(req.projectPath, '.claude', 'agents', req.params.name + '.md');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// POST /api/agents/:name/health
router.post('/agents/:name/health', validateName, rateLimit('write'), (req, res) => {
  const { scope, projectId, content } = req.body || {};
  let filePath = null;
  let raw = typeof content === 'string' ? content : null;

  if (!raw) {
    if (scope === 'project' && projectId) {
      const projects = discoverProjects(loadConfig().projectDirs);
      const proj = projects.find(p => p.id === projectId);
      if (!proj) return res.status(404).json({ error: 'Project not found' });
      filePath = path.join(proj.path, '.claude', 'agents', req.params.name + '.md');
    } else {
      filePath = path.join(CLAUDE_DIR, 'agents', req.params.name + '.md');
    }
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Agent not found' });
    raw = fs.readFileSync(filePath, 'utf-8');
  }

  try {
    const { checkBudget } = require('../compactor/budget');
    const check = checkBudget({ agentId: req.params.name, content: raw });
    const linePct = check.actual.lines / Math.max(1, check.budget.lines);
    const charPct = check.actual.chars / Math.max(1, check.budget.chars);
    const usage = Math.max(linePct, charPct);

    const estimatedTokens = Math.ceil(raw.length / 4);
    const sizeKb = (raw.length / 1024);

    let status = 'healthy';
    let suggestion = null;
    if (check.violations.length > 0) {
      status = 'over';
      suggestion = `Agent is ${Math.round(usage * 100)}% of budget — consider compacting or splitting into sub-agents.`;
    } else if (check.warnings.length > 0) {
      status = 'warning';
      suggestion = `Approaching budget limit (${Math.round(usage * 100)}%). Trim verbose sections before it blocks saves.`;
    } else if (usage < 0.2) {
      status = 'sparse';
      suggestion = `Only ${Math.round(usage * 100)}% of budget used. Consider adding more detail to improve agent quality.`;
    } else {
      status = 'healthy';
      suggestion = `Agent is well-optimized at ${Math.round(usage * 100)}% of budget.`;
    }

    res.json({
      status,
      suggestion,
      usage,
      actual: check.actual,
      budget: check.budget,
      violations: check.violations,
      warnings: check.warnings,
      estimatedTokens,
      sizeKb: Math.round(sizeKb * 100) / 100,
      rawChars: raw.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Health check failed' });
  }
});

// POST /api/copy-agent
router.post('/copy-agent', rateLimit('write'), (req, res) => {
  const { from, to, agentName } = req.body;
  if (!isValidName(agentName)) return res.status(400).json({ error: 'Invalid agent name' });

  let srcPath, destDir;
  if (from === 'global') {
    srcPath = path.join(CLAUDE_DIR, 'agents', agentName + '.md');
  } else {
    const fromPath = resolveProjectPath(from);
    if (!fromPath) return res.status(400).json({ error: 'Invalid source project' });
    if (!isPathAllowed(fromPath)) return res.status(403).json({ error: 'Source outside allowed directories' });
    srcPath = path.join(fromPath, '.claude', 'agents', agentName + '.md');
  }
  if (to === 'global') {
    destDir = path.join(CLAUDE_DIR, 'agents');
  } else {
    const toPath = resolveProjectPath(to);
    if (!toPath) return res.status(400).json({ error: 'Invalid target project' });
    if (!isPathAllowed(toPath)) return res.status(403).json({ error: 'Target outside allowed directories' });
    destDir = path.join(toPath, '.claude', 'agents');
  }
  ensureDir(destDir);
  const content = readFileSafe(srcPath);
  if (!content) return res.status(404).json({ error: 'Source agent not found' });
  atomicWriteText(path.join(destDir, agentName + '.md'), content);
  res.json({ ok: true });
});

// POST /api/move-agent
router.post('/move-agent', rateLimit('write'), (req, res) => {
  const { from, to, agentName } = req.body;
  if (!isValidName(agentName)) return res.status(400).json({ error: 'Invalid agent name' });

  let srcPath, destDir;
  if (from === 'global') {
    srcPath = path.join(CLAUDE_DIR, 'agents', agentName + '.md');
  } else {
    const fromPath = resolveProjectPath(from);
    if (!fromPath) return res.status(400).json({ error: 'Invalid source project' });
    if (!isPathAllowed(fromPath)) return res.status(403).json({ error: 'Source outside allowed directories' });
    srcPath = path.join(fromPath, '.claude', 'agents', agentName + '.md');
  }
  if (to === 'global') {
    destDir = path.join(CLAUDE_DIR, 'agents');
  } else {
    const toPath = resolveProjectPath(to);
    if (!toPath) return res.status(400).json({ error: 'Invalid target project' });
    if (!isPathAllowed(toPath)) return res.status(403).json({ error: 'Target outside allowed directories' });
    destDir = path.join(toPath, '.claude', 'agents');
  }
  ensureDir(destDir);
  const content = readFileSafe(srcPath);
  if (!content) return res.status(404).json({ error: 'Source agent not found' });
  atomicWriteText(path.join(destDir, agentName + '.md'), content);
  if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
  res.json({ ok: true });
});

// GET /api/unified/agents
router.get('/unified/agents', (req, res) => {
  const config = loadConfig();
  const projects = discoverProjects(config.projectDirs);

  const orgMod = require('../org');
  let registryById = {};
  let departmentsById = {};
  try {
    const registry = orgMod.loadRegistry();
    registryById = registry?.agents || {};
    const deps = orgMod.loadDepartments();
    departmentsById = deps?.departments || {};
  } catch { /* org unavailable */ }

  const { checkBudget } = require('../compactor/budget');
  const computeBudgetHealth = (agent) => {
    try {
      if (!agent.raw) return null;
      const agentId = agent.filename.replace(/\.md$/, '');
      const check = checkBudget({ agentId, content: agent.raw });
      const linePct = check.actual.lines / Math.max(1, check.budget.lines);
      const charPct = check.actual.chars / Math.max(1, check.budget.chars);
      const usage = Math.max(linePct, charPct);
      let status = 'healthy';
      if (check.violations.length > 0) status = 'over';
      else if (check.warnings.length > 0) status = 'warning';
      else if (usage < 0.2) status = 'sparse';
      const estimatedTokens = Math.ceil(agent.raw.length / 4);
      return {
        status,
        usage,
        actual: check.actual,
        budget: check.budget,
        violations: check.violations,
        warnings: check.warnings,
        estimatedTokens,
        sizeKb: Math.round((agent.raw.length / 1024) * 100) / 100,
      };
    } catch (err) {
      console.error(`[health] Failed to compute budget health for agent "${agent.filename}":`, err.message);
      return null;
    }
  };

  const budgetHealthFor = (agent) => {
    if (!agent.raw) return null;
    const sig = `${agent.updatedAt}:${agent.raw.length}`;
    const hit = _healthCache.get(agent.filename);
    if (hit && hit.sig === sig) return hit.health;
    const health = computeBudgetHealth(agent);
    _healthCache.set(agent.filename, { sig, health });
    return health;
  };

  const enrich = (agent) => {
    const rec = registryById[agent.filename] || null;
    const dept = rec?.department || null;
    const deptInfo = dept ? departmentsById[dept] : null;
    const subDept = rec?.subDepartment || null;
    const subDeptInfo = subDept && deptInfo?.subDepartments
      ? deptInfo.subDepartments[subDept] || null
      : null;
    const health = budgetHealthFor(agent);
    return {
      ...agent,
      org: rec ? {
        level: rec.level ?? null,
        levelTitle: rec.levelTitle ?? null,
        yearsOfExperience: rec.yearsOfExperience ?? null,
        experiencePoints: rec.experiencePoints ?? null,
        tier: rec.tier || null,
        title: rec.title || null,
        status: rec.status || null,
        department: dept,
        departmentLabel: deptInfo?.label || null,
        departmentColor: deptInfo?.color || null,
        subDepartment: subDept,
        subDepartmentLabel: subDeptInfo?.label || null,
        subDepartmentDescription: subDeptInfo?.description || null,
        pod: rec.pod || null,
        reportsTo: rec.reportsTo || null,
        secondaryReportsTo: rec.secondaryReportsTo || null,
        squad: rec.squad || null,
        avatar: rec.avatar || null,
        gender: rec.gender || null,
        isLeader: Boolean(deptInfo && deptInfo.head === agent.filename),
        isSubLeader: Boolean(subDept === 'lead' || (subDeptInfo && rec.tier === 'leadership')),
      } : null,
      health,
    };
  };

  const results = [];
  const globalAgents = listAgents(path.join(CLAUDE_DIR, 'agents'));
  for (const agent of globalAgents) {
    results.push(enrich({ ...agent, scope: 'global', scopeLabel: 'Global', projectId: null, projectName: null }));
  }

  for (const project of projects) {
    for (const agent of project.agents) {
      results.push(enrich({ ...agent, scope: 'project', scopeLabel: project.name, projectId: project.id, projectName: project.name }));
    }
  }

  const { category, tags } = req.query;
  let filtered = results;
  if (category) {
    filtered = filtered.filter(a => (a.frontmatter?.category || 'uncategorized') === category);
  }
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim().toLowerCase());
    filtered = filtered.filter(a => {
      const agentTags = (a.frontmatter?.tags || '').split(',').map(t => t.trim().toLowerCase());
      return tagList.some(t => agentTags.includes(t));
    });
  }

  filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(filtered);
});

// GET /api/projects/:id/claude-md
router.get('/projects/:id/claude-md', validateProjectId, (req, res) => {
  const content = readFileSafe(path.join(req.projectPath, 'CLAUDE.md'));
  res.json({ content: content || '', exists: content !== null, path: req.projectPath });
});

// PUT /api/projects/:id/claude-md
router.put('/projects/:id/claude-md', validateProjectId, rateLimit('write'), (req, res) => {
  if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
  atomicWriteText(path.join(req.projectPath, 'CLAUDE.md'), req.body.content);
  res.json({ ok: true });
});

module.exports = router;
