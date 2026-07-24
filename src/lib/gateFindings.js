'use strict';

// Gate/Lens → Brain harvester (Plan v2 · P0-1, the keystone).
//
// The self-improving brain (brainSignals → governor → trainer) learns from agent_runs
// failures, Yash corrections, and VS Code antipatterns — but NEVER from what the gates +
// Lens actually catch on a real build. This module closes that loop: after a build's gate
// reports change, it reads gate-reports/*.json + gate-reports/lens/judge/*.json, normalizes
// each defect to a stable signature, attributes it to the owning agent, and emits a
// `gate_defect` training_signal. The governor then auto-promotes a recurring defect (≥3
// builds, ≥2 distinct builds) into a guardrail in the owning agent's .md — rollback-armed,
// eval-gated. A defect Lens sees 3× → the agent stops causing it next build.
//
// REUSES (no new tables, no re-implementation):
//   • readGateReports()       — src/lib/workspace/readGateReports.js (static gate-reports/*.json)
//   • normalizeSignature()    — src/lib/brainSignals.js (the same fuzzy dedup key the trainer matches)
//   • db.upsertTrainingSignal / db.logSelfImprovement — src/db.js
//   • the diskWatcher `bus` 'gate:update'/'lens:update' events — src/lib/workspace/diskWatcher.js
//
// Lens fix_owner (loom|drape|ink|conduit|porter) attributes the visual findings directly;
// static gates map to their owner via GATE_OWNER. Findings with no resolvable owner are
// SKIPPED (an unattributable signal can't become an agent-.md patch — same rule as brainSignals).

const fs = require('fs');
const path = require('path');
const db = require('../db');
const { readGateReports } = require('./workspace/readGateReports');
const { normalizeSignature } = require('./brainSignals');

// Static gate id → owning agent. Lens findings carry their own fix_owner. Unmapped gates
// are intentionally skipped (no false attribution). Mirrors the AIM gate-owner table.
// CANONICAL gate ids — these MUST match the names gates actually write their reports under.
// Mirrored from the toolkit's source of truth, theme-toolkit/scripts/lib/gate-owner.mjs
// (CODE_GATE_OWNER); gateFindingsOwners.test.mjs fails if the two ever drift apart.
//
// TEST-1 (2026-07-23): this table had silently rotted. Six keys named gates that no longer exist —
// theme-check→code-lint, render-wiring→render-check, a11y-static→static-a11y,
// design-system→design-tokens, antipatterns→dead-code, functional→functionality. Because an
// unmapped gate is skipped (`if (!owner) continue`), the harvester was dropping most static-gate
// defects on the floor: on a real store only 4 of 15 keys matched any report on disk. The gate→
// training-signal loop was starved and said nothing about it — the same silent-skip failure mode as
// HYG-1 and the skipped-but-passing gates.
const CANONICAL_GATE_OWNER = {
  'code-lint': 'loom', 'editability': 'loom', 'dead-code': 'loom', 'layout': 'loom',
  'design-tokens': 'loom', 'consistency': 'loom', 'render-check': 'loom', 'section-reuse': 'loom',
  'brand-sync': 'loom', 'static-a11y': 'loom', 'translations': 'loom', 'social-assets': 'loom',
  'consent': 'loom', 'class-d-visual': 'loom',
  'content-quality': 'ink',
  'design-quality': 'drape', 'reference-match': 'drape',
  'analytics-wiring': 'conduit', 'app-conflicts': 'conduit', 'email-triggers': 'conduit',
  // 2026-07-23/24 — routed in the toolkit from birth so an unrouted gate can never silently turn a
  // self-healable fix into a human escalation again (that hole is what made #43 rule-pack useless).
  'rule-pack': 'loom', 'shopify-validate': 'loom', 'schema-authoring': 'loom', 'repo-hygiene': 'loom',
  'mobile': 'loom', 'link-health': 'loom', 'section-consistency': 'loom',
};

// Gates owned here but not present in the toolkit's auto-fix table (they are not blind-fixable, yet
// their defects are still real training signal). Kept separate so the drift test can tell the two apart.
const EXTRA_GATE_OWNER = {
  'honesty': 'ink', 'seo': 'beacon',
  'functionality': 'loom', 'performance': 'loom',
  'visual-check': 'loom', 'imagery': 'loom', 'conversion': 'loom',
};

// Historical report names, so builds captured before the renames still attribute correctly.
const LEGACY_GATE_ALIAS = {
  'theme-check': 'code-lint', 'render-wiring': 'render-check', 'wiring': 'render-check',
  'a11y-static': 'static-a11y', 'design-system': 'design-tokens', 'antipatterns': 'dead-code',
  'functional': 'functionality', 'section-cohesion': 'section-consistency',
  'reuse-map': 'section-reuse',
  'css-layout': 'layout', 'mobile-layout': 'mobile',
  'lighthouse': 'performance', 'visual-quality': 'visual-check', 'commerce-readiness': 'conversion',
};

const GATE_OWNER = { ...CANONICAL_GATE_OWNER, ...EXTRA_GATE_OWNER };
for (const [legacy, canonical] of Object.entries(LEGACY_GATE_ALIAS)) {
  if (GATE_OWNER[canonical] && !GATE_OWNER[legacy]) GATE_OWNER[legacy] = GATE_OWNER[canonical];
}
const LENS_OWNERS = new Set(['loom', 'drape', 'ink', 'conduit', 'porter']);
const sevRank = (s) => (s === 'blocker' ? 2 : s === 'warning' ? 1 : 0);
const sigSeverity = (s) => (s === 'blocker' ? 'high' : 'medium');

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

// Read gate-reports/lens/judge/*.json → raw findings with a resolved owner (fix_owner).
function readLensFindings(buildDir) {
  const judgeDir = path.join(buildDir, 'gate-reports', 'lens', 'judge');
  let files;
  try { files = fs.readdirSync(judgeDir).filter((f) => f.endsWith('.json')); }
  catch { return []; }
  const out = [];
  for (const file of files) {
    const v = readJson(path.join(judgeDir, file));
    if (!v || !Array.isArray(v.findings)) continue;
    for (const f of v.findings) {
      const owner = String(f.fix_owner || '').toLowerCase();
      if (!LENS_OWNERS.has(owner)) continue; // unattributable → skip
      const text = f.evidence || f.check || '';
      out.push({ owner, severity: f.severity || 'warning', text, source: `lens:${v.surface || file.replace(/\.json$/, '')}`, sigSeed: `${f.check || ''} ${text}` });
    }
  }
  return out;
}

// Read static gate-reports/*.json (via the canonical reader) → findings with a mapped owner.
function readStaticGateFindings(buildDir) {
  const out = [];
  for (const gate of readGateReports(buildDir)) {
    const owner = GATE_OWNER[gate.id];
    if (!owner) continue; // unmapped gate → skip (no false attribution)
    for (const f of (gate.findings || [])) {
      if (sevRank(f.severity) === 0) continue; // only blockers + warnings are defects
      out.push({ owner, severity: f.severity, text: f.text, source: `gate:${gate.id}`, sigSeed: `${gate.id} ${f.text}` });
    }
  }
  return out;
}

// Harvest one build → defects grouped by (owner, signature). ONE entry per (owner, signature)
// per build (multiple surfaces/gates with the same normalized defect collapse to one), so
// `occurrences` later tracks builds-it-recurred-in, not surface count.
function harvestBuildFindings(buildDir) {
  const client = path.basename(buildDir);
  const raw = [...readLensFindings(buildDir), ...readStaticGateFindings(buildDir)];
  const groups = new Map(); // key: owner|signature
  for (const r of raw) {
    const signature = normalizeSignature(r.sigSeed);
    if (!signature) continue;
    const key = `${r.owner}|${signature}`;
    const g = groups.get(key);
    if (g) {
      g.collapsed += 1;
      if (sevRank(r.severity) > sevRank(g.severity)) g.severity = r.severity;
      g.sources.add(r.source);
    } else {
      groups.set(key, { owner: r.owner, signature, severity: r.severity, sample: r.text, sources: new Set([r.source]), collapsed: 1 });
    }
  }
  const findings = [...groups.values()].map((g) => ({ owner: g.owner, signature: g.signature, severity: g.severity, sample: g.sample, sources: [...g.sources], collapsed: g.collapsed }));
  return { buildDir, client, findings };
}

// Emit a gate_defect training_signal per harvested defect (1 occurrence + 1 project per build,
// so recurrence across builds accumulates toward the governor's 3-occ/2-project auto bar).
// Idempotent per build: re-harvesting the SAME build is a no-op on occurrences because we key
// the project by client and use mode:'increment' with a per-build guard via the projects union.
function emitGateSignals(buildDir, { database = db, project = null } = {}) {
  const harvest = harvestBuildFindings(buildDir);
  const proj = project || harvest.client;
  let emitted = 0; const signals = [];
  for (const f of harvest.findings) {
    // Guard against double-count on a re-harvest of the same build: if this build is already
    // in the signal's project set, don't re-increment. Check existing first.
    const existing = database.getTrainingSignals
      ? database.getTrainingSignals({ kind: 'gate_defect', agent: f.owner, limit: 2000 }).find((s) => s.signature === f.signature)
      : null;
    if (existing && Array.isArray(existing.projects) && existing.projects.includes(proj)) { signals.push({ id: existing.id, reHarvest: true }); continue; }
    const res = database.upsertTrainingSignal({
      agent: f.owner,
      kind: 'gate_defect',
      signature: f.signature,
      severity: sigSeverity(f.severity),
      projects: [proj],
      evidence: { source: 'gate_harvest', sample: String(f.sample || '').slice(0, 280), sources: f.sources, build: harvest.client },
      occurrences: 1,
      mode: 'increment',
    });
    if (!res) continue;
    signals.push(res);
    if (res.isNew) {
      emitted += 1;
      if (database.logSelfImprovement) database.logSelfImprovement({ kind: 'signal', agent: f.owner, refId: res.id, summary: `gate_defect: ${f.signature.slice(0, 70)} (${f.sources.join(',')})`, data: { kind: 'gate_defect', severity: f.severity, sources: f.sources } });
    }
  }
  return { buildDir, client: harvest.client, findings: harvest.findings.length, emitted, signals };
}

// Subscribe to the diskWatcher bus: on a gate/lens report change, debounce per build dir, then
// harvest → emit. Best-effort: a harvest error never crashes the watcher. Idempotent (one
// harvester per process). Call from workspace startWatcher() after startDiskWatcher().
let started = false;
function startGateHarvester({ bus, debounceMs = 2500, database = db, log = console } = {}) {
  if (started || !bus) return;
  started = true;
  const timers = new Map(); // buildDir → timeout
  bus.on('event', (e) => {
    if (!e || (e.type !== 'gate:update' && e.type !== 'lens:update') || !e.file) return;
    const idx = e.file.indexOf(`${path.sep}gate-reports${path.sep}`);
    if (idx < 0) return;
    const buildDir = e.file.slice(0, idx);
    clearTimeout(timers.get(buildDir));
    const t = setTimeout(() => {
      timers.delete(buildDir);
      try {
        const r = emitGateSignals(buildDir, { database });
        if (r.emitted) log.log?.(`[gate-harvest] ${r.client}: ${r.findings} defect(s), ${r.emitted} new brain signal(s)`);
      } catch (err) { log.warn?.(`[gate-harvest] ${buildDir}: ${err.message}`); }
    }, debounceMs);
    if (typeof t.unref === 'function') t.unref();
    timers.set(buildDir, t);
  });
  log.log?.('[gate-harvest] started — Lens/gate defects now feed the brain');
}

module.exports = { harvestBuildFindings, emitGateSignals, startGateHarvester, GATE_OWNER, CANONICAL_GATE_OWNER, EXTRA_GATE_OWNER, LEGACY_GATE_ALIAS };
