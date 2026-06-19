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
const { parseBaselineMd } = require('../lib/workspace/parseBaselineMd');
const { readBuildFiles } = require('../lib/workspace/readBuildFiles');
const { findBuildArtifacts } = require('../lib/workspace/findBuildArtifacts');
const { deriveCurrentStep } = require('../lib/workspace/currentStep');
const { computeBuildScore } = require('../lib/workspace/computeBuildScore');
const { platformAgentActivity, buildAgentActivity } = require('../lib/workspace/projectFilter');
const gatesSpec = require('../lib/workspace/gatesSpec.json');
const pipelineSpec = require('../lib/workspace/pipelineSpec.json');
const { bus, startDiskWatcher } = require('../lib/workspace/diskWatcher');

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
    const builds = allAssembledBuilds();
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
    const builds = allAssembledBuilds();
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
    const builds = allAssembledBuilds();
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

// GET /api/workspace/builds/:buildId/agents — platform-level agent activity.
// (Per-build attribution isn't tracked yet — see projectFilter.js header.)
router.get('/workspace/builds/:buildId/agents', (req, res) => {
  try {
    const dir = resolveBuildDir(req.params.buildId);
    if (!dir) return res.status(404).json({ error: 'build not found' });
    const platform = platformForDir(dir);
    res.json(buildAgentActivity(platform, dir));
  } catch (err) {
    console.error('[workspace] /agents failed:', err.message);
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

// Called once on server boot to begin live updates. Safe to call repeatedly.
function startWatcher() {
  try { startDiskWatcher({ roots: lens.buildsRoots(), bust: bustCache }); }
  catch (err) { console.error('[workspace] startWatcher failed:', err.message); }
}

module.exports = { router, assembleBuild, allAssembledBuilds, bustCache, buildAgentActivity, dirFor, startWatcher };
