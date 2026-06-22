'use strict';

// Workspace — per-platform observability panel. A VIEW-ONLY slice of data Polyglot
// already has, grouped by build platform (Shopify / WordPress). It does NOT create
// stores, run pipelines, or touch theme code — that work lives in VS Code. It answers
// one question: "for THIS platform, what builds exist and what have its agents done?"
//
// Sources (all reads, zero new tables, zero migration):
//   • builds  → reuses the Lens build discovery (gate-reports/lens on disk)
//   • agents  → existing cost_logs, filtered by a platform→agent-roster map
//
// New platforms are added by appending one entry to PLATFORMS — no schema change.

const { Router } = require('express');
const path = require('path');
const db = require('../db');
const lens = require('./lens');
const { buildIdFor, dirFor, registerDirs } = require('../lib/workspace/buildId');
const { readGateReports } = require('../lib/workspace/readGateReports');
const { parseChangesMd } = require('../lib/workspace/parseChangesMd');
const { toggleItem, addItem, addWaiver } = require('../lib/workspace/writeChangesMd');
const { parseBaselineMd } = require('../lib/workspace/parseBaselineMd');
const { readBuildFiles } = require('../lib/workspace/readBuildFiles');
const { parseDesignSystem } = require('../lib/workspace/parseDesignSystem');
const { listActions, getAction } = require('../lib/workspace/actionRegistry');
const { findBuildArtifacts } = require('../lib/workspace/findBuildArtifacts');
const { deriveCurrentStep } = require('../lib/workspace/currentStep');
const { computeBuildScore } = require('../lib/workspace/computeBuildScore');
const { platformAgentActivity, buildAgentActivity, rosterFor } = require('../lib/workspace/projectFilter');
const gatesSpec = require('../lib/workspace/gatesSpec.json');
const pipelineSpec = require('../lib/workspace/pipelineSpec.json');
const { bus, startDiskWatcher } = require('../lib/workspace/diskWatcher');
const { startGateHarvester } = require('../lib/gateFindings');
const { startIndexer } = require('../lib/workspace/indexer');
const actionRunner = require('../lib/workspace/actionRunner');
const { syncProjectsFromDisk } = require('../lib/workspace/projectSync');
const { readGitStatus, readThemeLock, readRepoFile, gitDiff } = require('../lib/workspace/gitStatus');
const { buildProjectActivity } = require('../lib/workspace/projectActivity');

const router = Router();

// platform → the agent team that builds it. A cost_logs.agentName in this list
// attributes that spend/run to the platform. Source of truth: CLAUDE.md rosters.
const PLATFORMS = {
  shopify: {
    label: 'Shopify',
    agents: ['atrium', 'compass', 'stitch', 'loom', 'conduit', 'lattice',
      'keystone', 'porter', 'drape', 'ink', 'beacon', 'mantle', 'lumen', 'onyx'],
  },
  wordpress: {
    label: 'WordPress',
    agents: ['grove', 'seed', 'weave', 'craft', 'wire', 'root', 'trunk', 'canopy', 'bark'],
  },
};

// crude platform tag for a discovered build dir. Most builds live under the Shopify
// Task folder; WordPress builds (when they exist) carry "wordpress"/"wp" in the path.
function platformForDir(dir) {
  const p = dir.toLowerCase();
  if (p.includes('wordpress') || p.includes('/wp-') || p.includes('wp-content')) return 'wordpress';
  return 'shopify';
}

// Broader than Lens discovery: a build is ANY dir with a gate-reports/ folder
// (Lens-captured or not). Lens's discoverReportDirs only finds dirs with a
// lens/ subdir or visual-truth.json, which misses real builds that ran static
// gates but no Lens capture (e.g. "gpt test 1"). Walk the same roots ≤4 deep.
const fs = require('fs');
function discoverGateReportDirs(root, depth = 0, out = []) {
  if (depth > 4 || !fs.existsSync(root)) return out;
  let entries; try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  const gr = path.join(root, 'gate-reports');
  // count it only if gate-reports has at least one .json (else it's an empty husk).
  // push the BUILD DIR (root), not the gate-reports dir — assembleBuild reads
  // gates/CHANGES relative to the build dir (matches Lens discovery's contract).
  try {
    if (fs.existsSync(gr) && fs.readdirSync(gr).some((f) => f.endsWith('.json'))) out.push(root);
  } catch { /* unreadable */ }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'gate-reports') continue;
    discoverGateReportDirs(path.join(root, e.name), depth + 1, out);
  }
  return out;
}

// Polyglot-internal build dirs that are NOT client work (the app's own repo +
// toolkit/test output + the bundled Lens demo). Excluded so the Workspace list
// shows only real client builds. (The Lens page's own /lens/runs still surfaces
// the bundled sample as out-of-box demo data — that's a separate endpoint.)
// Dirs here are BUILD dirs (parent of gate-reports) after normalization.
function isInternalDir(abs) {
  const cwd = path.resolve(process.cwd());
  if (abs === cwd) return true;                                       // Polyglot repo root
  if (abs.startsWith(cwd + path.sep)) return true;                    // any Polyglot subdir (data/lens-sample, toolkit, scripts, …)
  return false;
}

// Client label for a build dir = the dir's own basename (e.g. "gpt test 1").
// The bundled sample keeps its friendly name.
function buildClientLabel(buildDir) {
  const base = path.basename(buildDir);
  return base === 'lens-sample' ? 'sample' : base;
}

function discoverBuilds() {
  const seen = new Set();
  const out = [];
  // union of Lens discovery (lens-captured) + broader gate-reports discovery.
  // Normalize every hit to the BUILD DIR: Lens returns "<build>/gate-reports"
  // (or the bundled "data/lens-sample"); strip a trailing gate-reports so
  // assembleBuild reads CHANGES.md / gate-reports / docs relative to the build.
  const toBuildDir = (d) => {
    const abs = path.resolve(d);
    return path.basename(abs) === 'gate-reports' ? path.dirname(abs) : abs;
  };
  const dirs = new Set();
  for (const root of lens.buildsRoots()) {
    for (const dir of lens.discoverReportDirs(root)) dirs.add(toBuildDir(dir));
    for (const dir of discoverGateReportDirs(root)) dirs.add(toBuildDir(dir));
  }
  for (const abs of dirs) {
    if (isInternalDir(abs)) continue;
    {
      if (seen.has(abs)) continue;
      seen.add(abs);
      const lensDir = path.join(abs, 'lens');
      const manifest = lens.readJson(path.join(lensDir, 'lens-manifest.json'));
      const gate18 = lens.readJson(path.join(abs, 'visual-truth.json')) || lens.readJson(path.join(lensDir, 'visual-truth.json'));
      out.push({
        dir: abs,
        platform: platformForDir(abs),
        client: buildClientLabel(abs),
        store: (manifest && manifest.previewUrl) || null,
        capturedAt: (manifest && manifest.capturedAt_ms) || null,
        pass: gate18 ? !!gate18.pass : null,
        blockers: gate18 && Array.isArray(gate18.blockers) ? gate18.blockers.length : 0,
        present: !!manifest,
      });
    }
  }
  return out;
}

// Aggregate cost_logs for a platform's agent roster over the last `days`.
function agentActivity(agents, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const byAgent = [];
  let runs = 0, costUsd = 0;
  for (const name of agents) {
    const rows = db.getCostLogs({ agentName: name, since, limit: 2000 });
    if (!rows.length) continue;
    const c = rows.reduce((s, r) => s + (r.costUsd || 0), 0);
    byAgent.push({ agentName: name, runs: rows.length, costUsd: Math.round(c * 10000) / 10000 });
    runs += rows.length; costUsd += c;
  }
  byAgent.sort((a, b) => b.runs - a.runs);
  return { runs, costUsd: Math.round(costUsd * 10000) / 10000, sinceDays: days, byAgent };
}

// ── Build assembly (P0) — score + step + gates summary for one dir ───────────
// Plain Map + TTL cache (NOT lru-cache, plan §C3). Busted on demand.
const _cache = new Map(); // key → { at, val }
const TTL_MS = 30_000;
function cached(key, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.val;
  const val = fn();
  _cache.set(key, { at: Date.now(), val });
  return val;
}
function bustCache() { _cache.clear(); }

// How many roster agents for this platform are unhealthy (pip/probation).
function rosterUnhealthy(platform) {
  try {
    const reg = db.loadRegistry ? db.loadRegistry() : null;
    const agents = (reg && reg.agents) || {};
    const def = PLATFORMS[platform];
    if (!def) return 0;
    let n = 0;
    for (const name of def.agents) {
      const a = agents[name];
      if (a && (a.status === 'pip' || a.status === 'probation')) n += 1;
    }
    return n;
  } catch { return 0; }
}

// Assemble the full scored summary for one build dir. Disk-first; tolerant of
// every missing artifact (plan §C5).
function assembleBuild(dir) {
  return cached(`build:${dir}`, () => {
    const abs = path.resolve(dir);
    const id = buildIdFor(abs);
    const platform = platformForDir(abs);
    const client = buildClientLabel(abs);
    const art = findBuildArtifacts(abs);

    const lensDir = path.join(abs, 'lens');
    const manifest = lens.readJson(path.join(lensDir, 'lens-manifest.json'));
    const gate18 = lens.readJson(path.join(abs, 'visual-truth.json')) || lens.readJson(path.join(lensDir, 'visual-truth.json'));
    const lensVerdict = gate18 ? (gate18.pass ? 'pass' : 'block') : null;

    const gates = readGateReports(abs);
    const blockersOpen = gates.reduce((s, g) => s + (g.pass ? 0 : g.findings.filter((f) => f.severity === 'blocker').length), 0)
      + (gate18 && Array.isArray(gate18.blockers) ? gate18.blockers.length : 0);

    const changes = parseChangesMd(art.changes.path);
    const step = deriveCurrentStep(abs, { gateReportCount: gates.length, lensPresent: art.lensDir.exists && !!gate18 });

    const score = computeBuildScore({
      gates, lensVerdict, changes, step,
      schedulesOpen: 0, // P0: schedules not yet build-scoped
      agentRosterUnhealthy: rosterUnhealthy(platform),
      blockersOpen,
      artifacts: { brandBible: art.brandBible.exists, goals: art.goals.exists, baseline: art.baseline.exists },
    });

    return {
      buildId: id,
      dir: abs,
      platform,
      client,
      store: (manifest && manifest.previewUrl) || null,
      capturedAt: (manifest && manifest.capturedAt_ms) || null,
      present: !!manifest,
      lensVerdict,
      gates: { total: gates.length, passed: gates.filter((g) => g.pass).length, blockersOpen },
      changes: { present: changes.present, rate: changes.rate, checked: changes.checked, total: changes.total },
      step,
      score: score.score,
      grade: score.grade,
      scoreBreakdown: score.breakdown,
      pending: score.pending,
      maxRealistic: score.maxRealistic,
    };
  });
}

// All builds, assembled + scored. Registers ids for later dirFor() resolution.
function allAssembledBuilds() {
  const dirs = discoverBuilds().map((b) => b.dir);
  registerDirs(dirs);
  return dirs.map(assembleBuild).sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
}

// List-view source (P3): prefer the derived workspace_build_index cache so list
// endpoints don't rescan disk. Falls back to live assembly when the index is
// empty (never built) or stale (>90s — the indexer rebuilds every 60s + on
// change, so >90s means the rebuilder isn't running). The index is a CACHE only.
const INDEX_STALE_MS = 90_000;
function listBuilds() {
  try {
    const cached = db.getWorkspaceIndex ? db.getWorkspaceIndex() : [];
    const age = db.workspaceIndexAgeMs ? db.workspaceIndexAgeMs(Date.now()) : Infinity;
    if (cached.length && age < INDEX_STALE_MS) {
      registerDirs(cached.map((b) => b.dir)); // keep buildId→dir resolvable from cache
      return cached.sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));
    }
  } catch (err) { console.error('[workspace] index read failed, using live assembly:', err.message); }
  return allAssembledBuilds();
}

// GET /api/workspace/platforms — the switcher options (no data, just labels).
router.get('/workspace/platforms', (_req, res) => {
  res.json({ platforms: Object.entries(PLATFORMS).map(([id, p]) => ({ id, label: p.label })) });
});

// ── P0 routes ───────────────────────────────────────────────────────────────
// NOTE: these LITERAL routes MUST be registered before '/workspace/:platform'
// below, or the :platform param greedily matches 'builds'/'clients'/etc.

// GET /api/workspace/builds — flat cross-platform list, assembled + scored.
router.get('/workspace/builds', (_req, res) => {
  try {
    const builds = listBuilds();
    res.json({
      builds,
      summary: {
        total: builds.length,
        passing: builds.filter((b) => b.lensVerdict === 'pass').length,
        blocked: builds.filter((b) => b.lensVerdict === 'block').length,
        avgScore: builds.length ? Math.round(builds.reduce((s, b) => s + b.score, 0) / builds.length) : 0,
      },
    });
  } catch (err) {
    console.error('[workspace] /builds failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/clients — one row per client, aggregated across platforms.
router.get('/workspace/clients', (_req, res) => {
  try {
    const builds = listBuilds();
    const map = new Map();
    for (const b of builds) {
      const key = `${b.platform}:${b.client}`;
      const r = map.get(key) || { client: b.client, platform: b.platform, store: b.store, builds: 0, blocked: 0, bestScore: 0, lastCapturedAt: null };
      r.builds += 1;
      if (b.lensVerdict === 'block') r.blocked += 1;
      if (b.score > r.bestScore) r.bestScore = b.score;
      if (!r.store && b.store) r.store = b.store;
      if ((b.capturedAt || 0) > (r.lastCapturedAt || 0)) r.lastCapturedAt = b.capturedAt;
      map.set(key, r);
    }
    const clients = [...map.values()].sort((a, b) => b.builds - a.builds);
    res.json({ clients, summary: { total: clients.length } });
  } catch (err) {
    console.error('[workspace] /clients failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/escalations — builds with a GENUINE problem (not merely
// incomplete). A low score caused ONLY by not-yet-produced artifacts (Lens/
// goals/results pending) is "incomplete", not "failing" — we don't escalate
// that as noise. Escalate on: gate FAIL, Lens BLOCK, open blockers, OR a score
// below the bar that the pending-artifact gap alone does NOT explain.
router.get('/workspace/escalations', (_req, res) => {
  try {
    const builds = listBuilds();
    const escalations = builds
      .map((b) => {
        const reasons = [];
        if (b.gates.blockersOpen > 0) reasons.push(`${b.gates.blockersOpen} open blocker(s)`);
        if (b.lensVerdict === 'block') reasons.push('Lens BLOCK');
        if (b.gates.total > 0 && b.gates.passed < b.gates.total) reasons.push(`${b.gates.total - b.gates.passed} gate(s) not passing`);
        // score below the bar beyond what pending artifacts explain → real shortfall
        if (b.score < 70 && b.maxRealistic - b.score > 15) reasons.push(`score ${b.score} — ${b.maxRealistic - b.score}pts below this build's reachable max`);
        return reasons.length ? { ...b, reasons } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    res.json({ escalations, summary: { total: escalations.length } });
  } catch (err) {
    console.error('[workspace] /escalations failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── P3: hybrid project registry (intake rows ↔ disk builds) ──────────────────
// Normalize for matching an intake project to a discovered build.
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// GET /api/workspace/projects — intake projects merged with their live build
// (auto-linked by name/domain when not yet linked) + the discovered builds that
// have no project row, so the UI can offer to link them.
router.get('/workspace/projects', (_req, res) => {
  try {
    // auto-link existing projects + auto-adopt discovered builds → one unified list.
    res.json(syncProjectsFromDisk(listBuilds));
  } catch (err) {
    console.error('[workspace] /projects failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspace/projects/sync — explicit rescan/adopt (idempotent). Must be
// registered BEFORE '/workspace/projects/:id' so 'sync' isn't matched as an :id.
router.post('/workspace/projects/sync', (_req, res) => {
  try { res.json(syncProjectsFromDisk(listBuilds)); }
  catch (err) { console.error('[workspace] /projects/sync failed:', err.message); res.status(500).json({ error: err.message }); }
});

// POST /api/workspace/projects — create an intake project (panel "New Project").
router.post('/workspace/projects', (req, res) => {
  try {
    const { name, niche, domain } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
    const id = db.createClientProject({ name: name.trim(), niche: niche || null, domain: domain || null, intake: req.body || {} });
    res.status(201).json({ id });
  } catch (err) {
    console.error('[workspace] create project failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/workspace/projects/:id — edit project metadata (name/niche/domain/intake).
router.patch('/workspace/projects/:id', (req, res) => {
  try {
    if (!db.getClientProject(req.params.id)) return res.status(404).json({ error: 'project not found' });
    const { name, niche, domain, intake, status } = req.body || {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'name must be non-empty' });
    if (status !== undefined && !db.PROJECT_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${db.PROJECT_STATUSES.join('|')}` });
    db.updateClientProject(req.params.id, { name: name?.trim(), niche, domain, intake });
    if (status !== undefined) db.setClientProjectStatus(req.params.id, status);
    res.json({ ok: true, project: db.getClientProject(req.params.id) });
  } catch (err) {
    console.error('[workspace] patch project failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/workspace/projects/:id[?hard=1] — archive (default) or hard-delete.
router.delete('/workspace/projects/:id', (req, res) => {
  try {
    if (!db.getClientProject(req.params.id)) return res.status(404).json({ error: 'project not found' });
    const hard = String(req.query.hard || '') === '1';
    const ok = hard ? db.deleteClientProject(req.params.id) : db.archiveClientProject(req.params.id);
    res.json({ ok, mode: hard ? 'deleted' : 'archived' });
  } catch (err) {
    console.error('[workspace] delete project failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspace/projects/:id/link — link a project to a discovered build.
router.post('/workspace/projects/:id/link', (req, res) => {
  try {
    if (!db.getClientProject(req.params.id)) return res.status(404).json({ error: 'project not found' });
    const { buildId } = req.body || {};
    const dir = buildId ? dirFor(buildId) : null;
    if (buildId && !dir) { allAssembledBuilds(); } // warm id→dir
    const resolved = buildId ? dirFor(buildId) : null;
    if (buildId && !resolved) return res.status(404).json({ error: 'build not found' });
    db.linkProjectBuildDir(req.params.id, resolved); // null buildId unlinks
    res.json({ ok: true, build_dir: resolved });
  } catch (err) {
    console.error('[workspace] link project failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/projects/:id — project row merged with its live build (via
// build_dir). Null-safe for intake-only projects (no build yet).
router.get('/workspace/projects/:id', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    let build = null, buildId = null, artifacts = {};
    if (project.build_dir && fs.existsSync(project.build_dir)) {
      build = assembleBuild(project.build_dir);
      buildId = build.buildId;
      registerDirs([project.build_dir]);
      const art = findBuildArtifacts(project.build_dir);
      artifacts = Object.fromEntries(Object.entries(art).map(([k, v]) => [k, v.exists]));
    }
    res.json({ project, build, buildId, artifacts, hasBuild: !!build });
  } catch (err) {
    console.error('[workspace] /projects/:id failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/projects/:id/repo — repo connection: path + read-only git
// state + theme-lock + shallow file tree. Dir is server-resolved (never a param).
router.get('/workspace/projects/:id/repo', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const dir = project.build_dir;
    if (!dir || !fs.existsSync(dir)) return res.json({ connected: false, build_dir: dir || null });
    res.json({ connected: true, build_dir: dir, git: readGitStatus(dir), themeLock: readThemeLock(dir), files: readBuildFiles(dir) });
  } catch (err) {
    console.error('[workspace] /projects/:id/repo failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/projects/:id/activity?limit&since — unified history timeline.
router.get('/workspace/projects/:id/activity', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (!project.build_dir || !fs.existsSync(project.build_dir)) return res.json({ events: [], nextSince: null, total: 0 });
    const build = assembleBuild(project.build_dir);
    registerDirs([project.build_dir]);
    const limit = Number(req.query.limit) || 50;
    const since = typeof req.query.since === 'string' ? req.query.since : null;
    res.json(buildProjectActivity({ build, dir: project.build_dir, buildId: build.buildId, limit, since }));
  } catch (err) {
    console.error('[workspace] /projects/:id/activity failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/projects/:id/schedules — post-publish monitoring checkpoints
// (lumen 48h watch + orbit/catalyst 30/90d results) from the build_schedules table.
// Was previously hardcoded-empty; now actually queries the registered schedules.
router.get('/workspace/projects/:id/schedules', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (!project.build_dir || !fs.existsSync(project.build_dir)) return res.json({ present: false, schedules: [] });
    const build = assembleBuild(project.build_dir);
    const rows = (db.listBuildSchedules ? db.listBuildSchedules(build.buildId) : []).map((r) => {
      let result = null; try { result = r.result_json ? JSON.parse(r.result_json) : null; } catch { /* */ }
      return { id: r.id, kind: r.kind, label: r.label, dueAt: r.due_at, status: r.status, ranAt: r.ran_at, publishedAt: r.published_at, result };
    });
    res.json({ present: rows.length > 0, schedules: rows });
  } catch (err) {
    console.error('[workspace] /projects/:id/schedules failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/projects/:id/file?path=<rel> — view ONE file's content in the
// panel (read-only, path-contained to the repo, text-only, size-capped).
router.get('/workspace/projects/:id/file', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (!project.build_dir || !fs.existsSync(project.build_dir)) return res.status(404).json({ error: 'no repo linked' });
    const rel = typeof req.query.path === 'string' ? req.query.path : '';
    if (!rel) return res.status(400).json({ error: 'path required' });
    const r = readRepoFile(project.build_dir, rel);
    if (!r.ok) return res.status(r.error === 'path escapes repo' ? 403 : 404).json(r);
    res.json(r);
  } catch (err) {
    console.error('[workspace] /projects/:id/file failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/projects/:id/diff — read-only git diff of the working tree.
router.get('/workspace/projects/:id/diff', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    if (!project.build_dir || !fs.existsSync(project.build_dir)) return res.json({ isRepo: false, files: [], diff: '' });
    res.json(gitDiff(project.build_dir));
  } catch (err) {
    console.error('[workspace] /projects/:id/diff failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── P1: Build Detail section helpers + routes ────────────────────────────────

// Resolve a buildId (from the URL) to its dir. dirFor() works once builds have
// been discovered this process; if cold, run a discovery pass to populate it.
function resolveBuildDir(buildId) {
  let dir = dirFor(buildId);
  if (!dir) { allAssembledBuilds(); dir = dirFor(buildId); } // warm the id→dir map
  return dir;
}

// Full per-gate detail: join the canonical gatesSpec (19 gates) with whatever
// reports exist on disk, so the UI shows EVERY gate (pass/fail/missing) + findings.
function buildGatesDetail(dir) {
  const reports = readGateReports(dir); // [{ id, pass, findings[], reportFile, ts }]
  const byName = new Map(reports.map((r) => [r.id, r]));
  const gates = gatesSpec.gates.map((g) => {
    const rep = byName.get(g.name) || byName.get(String(g.number)) || null;
    const status = rep ? (rep.pass ? 'pass' : 'fail') : 'missing';
    return {
      number: g.number, name: g.name, kind: g.kind, blocking: g.blocking,
      status,
      findings: rep ? rep.findings : [],
      reportFile: rep ? rep.reportFile : g.reportFile,
      ts: rep ? rep.ts : null,
    };
  });
  // include any on-disk report not in the spec (forward-compat) as extra rows
  for (const r of reports) {
    if (!gatesSpec.gates.some((g) => g.name === r.id || String(g.number) === r.id)) {
      gates.push({ number: null, name: r.id, kind: 'unknown', blocking: false, status: r.pass ? 'pass' : 'fail', findings: r.findings, reportFile: r.reportFile, ts: r.ts });
    }
  }
  return {
    total: gates.length,
    reported: gates.filter((g) => g.status !== 'missing').length,
    passed: gates.filter((g) => g.status === 'pass').length,
    failed: gates.filter((g) => g.status === 'fail').length,
    missing: gates.filter((g) => g.status === 'missing').length,
    gates,
  };
}

// Pipeline status: each of the 18 steps with reached/current + artifact presence.
function buildPipelineDetail(dir) {
  const gateCount = readGateReports(dir).length;
  const gate18 = lens.readJson(path.join(dir, 'visual-truth.json')) || lens.readJson(path.join(dir, 'lens', 'visual-truth.json'));
  const step = deriveCurrentStep(dir, { gateReportCount: gateCount, lensPresent: !!gate18 });
  const steps = pipelineSpec.steps.map((s) => {
    const artifactPath = s.artifact ? path.join(dir, s.artifact) : null;
    let artifactExists = false;
    try { artifactExists = artifactPath ? fs.existsSync(artifactPath) : false; } catch { /* */ }
    const status = s.step < step.current ? 'done' : s.step === step.current ? 'current' : 'pending';
    return { ...s, status, artifactExists };
  });
  return { current: step.current, total: step.total, steps };
}

// GET /api/workspace/builds/:buildId — merged Build-Detail overview payload.
router.get('/workspace/builds/:buildId', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    const build = assembleBuild(dir);
    const art = findBuildArtifacts(dir);
    res.json({
      build,
      artifacts: Object.fromEntries(Object.entries(art).map(([k, v]) => [k, v.exists])),
      agents: buildAgentActivity(build.platform, dir),
      project: db.getProjectByBuildDir ? db.getProjectByBuildDir(dir) : null,
    });
  } catch (err) {
    console.error('[workspace] /builds/:buildId failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/pipeline — 18-step status.
router.get('/workspace/builds/:buildId/pipeline', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    res.json(buildPipelineDetail(dir));
  } catch (err) {
    console.error('[workspace] /pipeline failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/gates — all gates × status × findings.
router.get('/workspace/builds/:buildId/gates', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    res.json(buildGatesDetail(dir));
  } catch (err) {
    console.error('[workspace] /gates failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/changes — parsed CHANGES.md checklist.
router.get('/workspace/builds/:buildId/changes', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    res.json(parseChangesMd(path.join(dir, 'CHANGES.md')));
  } catch (err) {
    console.error('[workspace] /changes failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper: resolve the CHANGES.md path for a known build, 404 if no build / no file.
function changesPathFor(buildId) {
  const dir = resolveBuildDir(buildId);
  if (!dir) return { err: 404 };
  const p = path.join(dir, 'CHANGES.md');
  if (!fs.existsSync(p)) return { err: 404 };
  return { p };
}

// POST …/changes/toggle {index, checked} — flip one acceptance item.
router.post('/workspace/builds/:buildId/changes/toggle', (req, res) => {
  try {
    const { p, err } = changesPathFor(req.params.buildId);
    if (err) return res.status(err).json({ error: 'build or CHANGES.md not found' });
    const { index, checked } = req.body || {};
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'index (int ≥0) required' });
    if (typeof checked !== 'boolean') return res.status(400).json({ error: 'checked (bool) required' });
    res.json(toggleItem(p, index, checked));
  } catch (err) {
    console.error('[workspace] changes/toggle failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST …/changes/item {text} — append a new unchecked acceptance item.
router.post('/workspace/builds/:buildId/changes/item', (req, res) => {
  try {
    const { p, err } = changesPathFor(req.params.buildId);
    if (err) return res.status(err).json({ error: 'build or CHANGES.md not found' });
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.length > 1000) return res.status(400).json({ error: 'text (≤1000 chars) required' });
    res.json(addItem(p, text));
  } catch (err) {
    console.error('[workspace] changes/item failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// POST …/changes/waiver {text} — add a waiver (bypasses a gate; confirm-gated in UI).
router.post('/workspace/builds/:buildId/changes/waiver', (req, res) => {
  try {
    const { p, err } = changesPathFor(req.params.buildId);
    if (err) return res.status(err).json({ error: 'build or CHANGES.md not found' });
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.length > 1000) return res.status(400).json({ error: 'text (≤1000 chars) required' });
    res.json(addWaiver(p, text));
  } catch (err) {
    console.error('[workspace] changes/waiver failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/agents — build-scoped agent activity when
// cockpit dispatches have been stamped (cost_logs.buildId), else platform-level.
router.get('/workspace/builds/:buildId/agents', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    const platform = platformForDir(dir);
    res.json(buildAgentActivity(platform, dir, 7, req.params.buildId));
  } catch (err) {
    console.error('[workspace] /agents failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/dispatches — REAL per-build agent activity:
// the dispatches run FROM the cockpit against this build (stable `wsd-<buildId>`
// playground thread). Unlike /agents (platform-level), this is genuinely scoped
// to this build because the cockpit creates the thread with the buildId. Empty
// until the first dispatch. Proven path: getPlaygroundThread('wsd-<id>').
router.get('/workspace/builds/:buildId/dispatches', (req, res) => {
  try {
    if (!resolveBuildDir(req.params.buildId)) return res.status(404).json({ error: 'build not found' });
    const thread = db.getPlaygroundThread(`wsd-${req.params.buildId}`.slice(0, 64));
    if (!thread) return res.json({ present: false, turns: [] });
    const turns = (thread.messages || []).map((m) => ({
      role: m.role, status: m.status || null, timestamp: m.timestamp || null,
      duration: m.duration || null,
      // strip the cockpit prompt preamble from the user turn for a clean "task" view
      content: m.role === 'user' ? String(m.content || '').replace(/^[\s\S]*?\nTask:\n/, '').trim() || m.content : m.content,
    }));
    res.json({ present: turns.length > 0, agent: thread.agentName || null, turns });
  } catch (err) {
    console.error('[workspace] /dispatches failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/schedules — schedules tagged to this build.
// No build-tag convention exists on schedules yet, so this is honestly empty
// (loadSchedules has no per-build scoping). Returns a note so the UI is honest.
router.get('/workspace/builds/:buildId/schedules', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    let all = [];
    try { all = db.loadSchedules ? db.loadSchedules() : []; } catch { /* */ }
    // best-effort: match a schedule whose name/tag mentions the client folder name
    const base = path.basename(dir).toLowerCase();
    const matched = all.filter((s) => JSON.stringify(s).toLowerCase().includes(base));
    res.json({
      schedules: matched,
      total: matched.length,
      note: matched.length ? null : 'No schedules are scoped to this build. Build-level scheduling (lumen 48h watch, catalyst 30/90d loop) is not wired into the schedule registry yet.',
    });
  } catch (err) {
    console.error('[workspace] /schedules failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/results — orbit baseline.md (IF present).
router.get('/workspace/builds/:buildId/results', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    res.json(parseBaselineMd(path.join(dir, 'docs', 'results', 'baseline.md')));
  } catch (err) {
    console.error('[workspace] /results failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/docs[?file=relpath] — agent-produced docs.
// Lists docs/**/*.{md,json} (the build's discovery/design/content/schema/results
// artifacts). With ?file=, returns that one file's text (path-guarded to docs/).
// Read-only: to CHANGE an artifact, dispatch its owning agent (the architectural
// boundary). Tolerant of absence — empty list when docs/ has nothing.
router.get('/workspace/builds/:buildId/docs', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    const docsRoot = path.join(dir, 'docs');

    // single-file read (path-traversal guarded to docs/)
    if (typeof req.query.file === 'string' && req.query.file) {
      const abs = path.resolve(docsRoot, req.query.file);
      if (!(abs === docsRoot || abs.startsWith(docsRoot + path.sep)) || !/\.(md|json|txt)$/i.test(abs)) {
        return res.status(403).json({ error: 'forbidden path' });
      }
      if (!fs.existsSync(abs)) return res.status(404).json({ error: 'doc not found' });
      return res.json({ file: req.query.file, content: fs.readFileSync(abs, 'utf-8') });
    }

    // listing — walk docs/ ≤2 deep for .md/.json/.txt
    const out = [];
    const walk = (base, rel, depth) => {
      if (depth > 2) return;
      let entries; try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(base, e.name), childRel, depth + 1);
        else if (/\.(md|json|txt)$/i.test(e.name)) {
          let size = 0; try { size = fs.statSync(path.join(base, e.name)).size; } catch { /* */ }
          out.push({ file: childRel, name: e.name, kind: e.name.split('.').pop().toLowerCase(), size });
        }
      }
    };
    if (fs.existsSync(docsRoot)) walk(docsRoot, '', 0);
    out.sort((a, b) => a.file.localeCompare(b.file));
    res.json({ present: out.length > 0, docs: out });
  } catch (err) {
    console.error('[workspace] /docs failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/files — shallow build file tree (VS Code links).
router.get('/workspace/builds/:buildId/files', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    res.json(readBuildFiles(dir));
  } catch (err) {
    console.error('[workspace] /files failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/builds/:buildId/design-system — visual design-system viewer.
router.get('/workspace/builds/:buildId/design-system', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    res.json(parseDesignSystem(dir));
  } catch (err) {
    console.error('[workspace] /design-system failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspace/builds/:buildId/dispatch — build a context-prefixed prompt
// to dispatch the owning agent against this build. Returns { agentName, prompt,
// threadId } that the client drives through the existing /api/playground/run
// pipeline (reattach-surviving). Server resolves the dir (never a client path)
// and restricts the agent to the build's platform roster.
router.post('/workspace/builds/:buildId/dispatch', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    const { agent, task } = req.body || {};
    if (!agent || typeof agent !== 'string') return res.status(400).json({ error: 'agent required' });
    if (!task || typeof task !== 'string' || task.length > 4000) return res.status(400).json({ error: 'task required (≤4000 chars)' });

    const platform = platformForDir(dir);
    if (!rosterFor(platform).includes(agent)) {
      return res.status(403).json({ error: `agent "${agent}" is not on the ${platform} roster` });
    }

    const client = buildClientLabel(dir);
    const prompt = [
      `You are working on the Shopify theme build for client "${client}".`,
      `The theme repo is at: ${dir}`,
      `Read/edit files there as needed (use absolute paths). Do NOT push, publish, or write to the live store — local theme edits only.`,
      ``,
      `Task:`,
      task.trim(),
    ].join('\n');

    // Stable per-build thread so a reload can reattach to a running dispatch.
    const threadId = `wsd-${req.params.buildId}`.slice(0, 64);
    res.json({ agentName: agent, prompt, threadId });
  } catch (err) {
    console.error('[workspace] dispatch build failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Cockpit actions (allowlisted, confirm-gated — see actionRegistry.js) ──────

// GET /api/workspace/actions/registry — the available safe actions (+ whether
// each entry's required env is satisfied). MUST be registered BEFORE the
// `/actions/:runId` param route below or `registry` matches as a runId.
router.get('/workspace/actions/registry', (_req, res) => {
  res.json({ actions: listActions() });
});

// POST /api/workspace/builds/:buildId/actions/rerun-gates — back-compat alias for
// the shipped ActionsBar. Equivalent to the generic route with actionId=gates:static.
router.post('/workspace/builds/:buildId/actions/rerun-gates', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    const rec = actionRunner.runStaticGates({ buildId: req.params.buildId, dir });
    res.status(202).json(rec);
  } catch (err) {
    console.error('[workspace] rerun-gates failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspace/builds/:buildId/actions/:actionId — generic allowlisted
// runner for SAFE actions only. The actionId MUST be a registry entry (unknown
// → 403); any non-`safe` tier (e.g. deploy/publish) is REJECTED here (403) and
// can only run via the dedicated /workspace/projects/:id/publish flow. Resolves
// dir from the known buildId (never a client path).
router.post('/workspace/builds/:buildId/actions/:actionId', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    const entry = getAction(req.params.actionId);
    if (!entry) return res.status(403).json({ error: `unknown action: ${req.params.actionId}` });
    if (entry.tier !== 'safe') {
      return res.status(403).json({ error: `action '${entry.id}' (tier: ${entry.tier}) cannot run from this route — use the publish flow`, tier: entry.tier });
    }
    const rec = actionRunner.runAction({ buildId: req.params.buildId, dir, actionId: req.params.actionId });
    res.status(202).json(rec);
  } catch (err) {
    if (err.code === 'UNKNOWN_ACTION') return res.status(403).json({ error: err.message });
    console.error('[workspace] action failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspace/projects/:id/publish — the ONLY path to the deploy-tier
// publish actions. Body: { mode: 'preflight' | 'flip', confirm? }.
//   • preflight → runs publish:preflight (--dry-run): full gate chain, NEVER
//     flips. No confirmation needed (it can't mutate the store).
//   • flip → requires `confirm` to equal the build's theme-lock store EXACTLY;
//     the runner re-checks the same store-confirm before spawning. Mismatch or
//     missing → 400, and the flip is never spawned.
// Dir + store are ALWAYS server-resolved from build_dir / theme-lock — never a
// request param. Returns the action run record; poll GET /workspace/actions/:runId.
router.post('/workspace/projects/:id/publish', (req, res) => {
  try {
    const project = db.getClientProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const dir = project.build_dir;
    if (!dir || !fs.existsSync(dir)) return res.status(409).json({ error: 'project has no linked build dir' });
    const lock = readThemeLock(dir);
    const store = lock && lock.store;
    if (!store) return res.status(409).json({ error: 'this build has no theme-lock store — cannot publish' });

    const mode = req.body && req.body.mode;
    if (mode === 'preflight') {
      const rec = actionRunner.runAction({ buildId: assembleBuild(dir).buildId, dir, actionId: 'publish:preflight' });
      return res.status(202).json({ ...rec, store, themeName: lock.themeName, themeId: lock.themeId });
    }
    if (mode === 'flip') {
      const confirm = req.body && req.body.confirm;
      if (!confirm || String(confirm) !== String(store)) {
        return res.status(400).json({ error: 'confirm must equal the exact store domain to publish', store, code: 'CONFIRM_REQUIRED' });
      }
      const rec = actionRunner.runAction({ buildId: assembleBuild(dir).buildId, dir, actionId: 'publish:flip', confirmStore: confirm });
      return res.status(202).json({ ...rec, store, themeName: lock.themeName, themeId: lock.themeId });
    }
    return res.status(400).json({ error: "mode must be 'preflight' or 'flip'" });
  } catch (err) {
    if (err.code === 'CONFIRM_REQUIRED' || err.code === 'NO_LOCK_STORE') return res.status(400).json({ error: err.message });
    console.error('[workspace] /projects/:id/publish failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/actions/:runId — poll an action's status + log.
router.get('/workspace/actions/:runId', (req, res) => {
  const rec = actionRunner.getRun(req.params.runId);
  if (!rec) return res.status(404).json({ error: 'run not found' });
  res.json(rec);
});

// POST /api/workspace/actions/:runId/cancel — best-effort cancel.
router.post('/workspace/actions/:runId/cancel', (req, res) => {
  const ok = actionRunner.cancelRun(req.params.runId);
  res.json({ cancelled: ok });
});

// GET /api/workspace/stream — SSE: gate:update / changes:update / lens:update /
// score:update. Driven by the disk watcher. Read-only; one multiplexed channel.
router.get('/workspace/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: {"ok":true}\n\n`);

  const onEvent = (payload) => {
    try { res.write(`event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`); }
    catch { /* client gone */ }
  };
  bus.on('event', onEvent);

  // heartbeat so proxies don't drop the idle stream; unref so it can't hold exit
  const hb = setInterval(() => { try { res.write(`event: ping\ndata: {}\n\n`); } catch { /* */ } }, 25000);
  if (typeof hb.unref === 'function') hb.unref();

  req.on('close', () => { clearInterval(hb); bus.off('event', onEvent); });
});

// GET /api/workspace/:platform — builds + agent activity for one platform.
router.get('/workspace/:platform', (req, res) => {
  const id = String(req.params.platform || '').toLowerCase();
  const def = PLATFORMS[id];
  if (!def) return res.status(404).json({ error: `unknown platform: ${id}` });

  let allBuilds = [];
  try { allBuilds = discoverBuilds(); }
  catch (err) { console.error('[workspace] build discovery failed:', err.message); }
  const builds = allBuilds.filter((b) => b.platform === id)
    .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0));

  let agents = { runs: 0, costUsd: 0, sinceDays: 7, byAgent: [] };
  try { agents = agentActivity(def.agents); }
  catch (err) { console.error('[workspace] agent activity failed:', err.message); }

  const clients = new Set(builds.map((b) => b.client));
  res.json({
    platform: id,
    label: def.label,
    builds,
    agents,
    summary: {
      builds: builds.length,
      clients: clients.size,
      blocked: builds.filter((b) => b.pass === false).length,
      passed: builds.filter((b) => b.pass === true).length,
    },
  });
});

// Called once on server boot to begin live updates + the index rebuilder.
// Safe to call repeatedly (both are idempotent).
function startWatcher() {
  try { startDiskWatcher({ roots: lens.buildsRoots(), bust: bustCache }); }
  catch (err) { console.error('[workspace] startWatcher failed:', err.message); }
  try { startIndexer({ assembler: allAssembledBuilds, bus }); }
  catch (err) { console.error('[workspace] startIndexer failed:', err.message); }
  // Feed Lens/gate defects into the self-improving brain (P0-1): on each gate-report change,
  // harvest the build's defects → gate_defect training_signals → governor auto-promotes recurring
  // ones into the owning agent's guardrails. Best-effort; never blocks the watcher.
  try { startGateHarvester({ bus }); }
  catch (err) { console.error('[workspace] startGateHarvester failed:', err.message); }
}

module.exports = { router, assembleBuild, allAssembledBuilds, listBuilds, bustCache, buildAgentActivity, dirFor, startWatcher };
