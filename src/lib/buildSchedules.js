'use strict';

// Post-publish results loop — the build-level scheduler the factory was missing.
//
// WHY: `workspace.js` literally admitted "Build-level scheduling (lumen 48h watch,
// catalyst 30/90d loop) is not wired into the schedule registry yet." The factory
// shipped stores but never learned from consequences. This wires it.
//
// DESIGN: on `build.published`, register six checkpoints keyed by `due_at` (epoch ms).
// A periodic checker (wired into the systemSchedules hourly + boot tick) runs every
// checkpoint whose due_at has passed and is still pending — so it fires correctly on a
// non-24/7 Mac via the SAME catch-up pattern as the brain ACT-layer fix (no cron that
// silently misses its minute). Handlers are injectable so the whole loop is hermetically
// testable with a fake clock + a mock database; the real handlers spawn the toolkit
// scripts (lumen-watch-sweep / orbit-measure / catalyst-verdict) whose live runs need a
// published store + analytics creds (the dogfood).

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('../db');

const HOUR = 3_600_000;
const DAY = 86_400_000;

// The post-publish checkpoint schedule, all keyed off the published moment T.
const CHECKPOINTS = [
  { kind: 'watch', label: 't+2h', offset: 2 * HOUR },
  { kind: 'watch', label: 't+24h', offset: 24 * HOUR },
  { kind: 'watch', label: 't+48h', offset: 48 * HOUR },   // watch-clear is decided here
  { kind: 'results', label: 'baseline', offset: 48 * HOUR }, // orbit baseline AFTER watch-clear
  { kind: 'results', label: 'd30', offset: 30 * DAY },
  { kind: 'results', label: 'd90', offset: 90 * DAY },
];

// Register the post-publish checkpoints for a build. Idempotent: ids are
// `<buildId>:<label>` + the table INSERTs OR IGNOREs, so re-registering the same build
// (e.g. a re-publish) never duplicates. Returns the registered checkpoint ids.
function registerBuildSchedules(buildId, { publishedAt, repoDir, store = null, now = Date.now(), database = db } = {}) {
  if (!buildId) throw new Error('registerBuildSchedules: buildId required');
  if (!repoDir) throw new Error('registerBuildSchedules: repoDir required');
  if (!publishedAt) throw new Error('registerBuildSchedules: publishedAt (epoch ms) required');
  const ids = [];
  for (const c of CHECKPOINTS) {
    const row = {
      id: `${buildId}:${c.label}`,
      build_id: buildId,
      store,
      repo_dir: repoDir,
      kind: c.kind,
      label: c.label,
      due_at: publishedAt + c.offset,
      status: 'pending',
      published_at: publishedAt,
      created_at: now,
    };
    database.insertBuildSchedule(row);
    ids.push(row.id);
  }
  return ids;
}

// Run every checkpoint that is due (due_at ≤ now) and still pending. This is the catch-up
// tick: an overdue checkpoint (Mac was asleep at due_at) runs on the next invocation. A
// failing handler marks only that row failed and never blocks the others. Returns a
// summary {due, ran[], failed[]}. Handlers are injectable for tests.
async function runDueBuildSchedules({ now = Date.now(), database = db, handlers = defaultHandlers, log = () => {} } = {}) {
  const due = database.dueBuildSchedules(now);
  const ran = [];
  const failed = [];
  for (const row of due) {
    database.markBuildScheduleStatus(row.id, 'running', now, null);
    try {
      const handler = row.kind === 'watch' ? handlers.watch : handlers.results;
      if (typeof handler !== 'function') throw new Error(`no handler for kind=${row.kind}`);
      const result = await handler(row);
      database.markBuildScheduleStatus(row.id, 'done', Date.now(), safeJson(result));
      ran.push({ id: row.id, kind: row.kind, label: row.label, result });
      log(`build-schedule ${row.id} → done`);
    } catch (err) {
      database.markBuildScheduleStatus(row.id, 'failed', Date.now(), safeJson({ error: err.message }));
      failed.push({ id: row.id, error: err.message });
      log(`build-schedule ${row.id} → FAILED: ${err.message}`);
    }
  }
  return { due: due.length, ran, failed };
}

function safeJson(v) { try { return JSON.stringify(v || {}); } catch { return '{}'; } }

// Resolve a toolkit script: prefer the repo's VENDORED copy (what runs in a client repo),
// fall back to Polyglot's master. Mirrors buildRuns.resolveMaestro.
function resolveScript(repoDir, name) {
  const vendored = path.join(repoDir, 'toolkit', 'scripts', name);
  if (fs.existsSync(vendored)) return vendored;
  return path.resolve(process.cwd(), 'theme-toolkit', 'scripts', name);
}

// Spawn a toolkit script in the build repo; resolves {exitCode, stdoutTail}. Bounded.
function spawnScript(name, repoDir, env = {}, args = []) {
  return new Promise((resolve) => {
    const script = resolveScript(repoDir, name);
    if (!fs.existsSync(script)) { resolve({ exitCode: -1, error: `${name} not found` }); return; }
    let out = '';
    const proc = spawn(process.execPath, [script, ...args], { cwd: repoDir, env: { ...process.env, ...env } });
    proc.stdout.on('data', (d) => { out = (out + d).slice(-4000); });
    proc.stderr.on('data', (d) => { out = (out + d).slice(-4000); });
    proc.on('error', (err) => resolve({ exitCode: -1, error: err.message }));
    proc.on('close', (code) => resolve({ exitCode: code, stdoutTail: out.slice(-800) }));
  });
}

// Production handlers — spawn the toolkit scripts in the build repo. Live runs need a
// published store URL (watch) + analytics creds (orbit), proven at the dogfood; tests
// inject mocks. The watch targets the live published storefront (https://<store>), but a
// WATCH_STORE_URL override is honored for a custom domain or a password-protected dev/test
// store where the .myshopify.com URL isn't directly capturable (dogfood finding 2026-06-21).
const defaultHandlers = {
  async watch(row) {
    const override = process.env.WATCH_STORE_URL || '';
    const storeUrl = override || (row.store ? `https://${String(row.store).replace(/^https?:\/\//, '')}` : '');
    return spawnScript('lumen-watch-sweep.mjs', row.repo_dir, { STORE_URL: storeUrl, WATCH_LABEL: row.label });
  },
  async results(row) {
    const measure = await spawnScript('orbit-measure.mjs', row.repo_dir, { RESULTS_LABEL: row.label, STORE: row.store || '' });
    // The verdict is only emitted at the 30/90d results checkpoints (baseline just seeds the file).
    let verdict = null;
    if (row.label !== 'baseline') verdict = await spawnScript('catalyst-verdict.mjs', row.repo_dir, { RESULTS_LABEL: row.label });
    return { measure, verdict };
  },
};

module.exports = { registerBuildSchedules, runDueBuildSchedules, resolveScript, CHECKPOINTS, defaultHandlers };
