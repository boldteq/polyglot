#!/usr/bin/env node
// lumen-watch-sweep — one post-publish watch sweep against the LIVE store (T+2h/24h/48h).
// Re-captures the live surfaces (Lens), checks for regressions a build-time gate can't see
// (the live store drifting: an app injecting overflow, a pixel breaking, a collection going
// empty), writes docs/results/watch-<label>.md, and at T+48h decides watch-clear vs escalate
// (the entry gate for Step-18 post-mortem, per website-launch-cutover-protocol.md §4/§6).
//
// GRACEFUL DEGRADE: needs STORE_URL (the live published store). Absent → writes an honest
// "skipped (no STORE_URL)" note + exits 0 (the real sweep is the dogfood). Present → runs
// lens-capture against the live URL + classifies findings.
//
// Env: STORE_URL (live store) · WATCH_LABEL (t+2h|t+24h|t+48h) · LENS_SURFACES (optional)
// Usage: STORE_URL=https://acme.com WATCH_LABEL=t+48h node lumen-watch-sweep.mjs --dir <repo>

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const o = { dir: process.cwd(), resultsDir: null, label: process.env.WATCH_LABEL || 't+2h', url: process.env.STORE_URL || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') o.dir = argv[++i];
    else if (a === '--results-dir') o.resultsDir = argv[++i];
    else if (a === '--label') o.label = argv[++i];
    else if (a === '--url') o.url = argv[++i];
  }
  return o;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } }

function writeNote(resultsDir, label, lines) {
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `watch-${label}.md`), `# Post-publish watch — ${label}\n\n${lines.join('\n')}\n`);
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const resultsDir = o.resultsDir || path.join(o.dir, 'docs', 'results');

  if (!o.url) {
    writeNote(resultsDir, o.label, ['**Skipped:** no STORE_URL — the live watch sweep is the dogfood step (needs the published store URL). No regression check performed.']);
    console.log(`lumen-watch-sweep: ${o.label} skipped (no STORE_URL) — note written.`);
    process.exit(0);
  }

  // Re-capture the live surfaces. lens-capture reads THEME_PREVIEW_URL; for a published store
  // that's the live URL. Best-effort: if capture tooling/browser isn't available, degrade.
  const captureScript = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'lens-capture.mjs');
  const env = { ...process.env, THEME_PREVIEW_URL: o.url };
  if (process.env.LENS_SURFACES) env.LENS_SURFACES = process.env.LENS_SURFACES;
  const cap = spawnSync(process.execPath, [captureScript], { cwd: o.dir, env, encoding: 'utf-8', timeout: 180_000 });

  const manifest = readJson(path.join(resultsDir, '..', '..', 'gate-reports', 'lens', 'lens-manifest.json'))
    || readJson(path.join(o.dir, 'gate-reports', 'lens', 'lens-manifest.json'));

  // Classify regressions from the capture's DOM facts (overflow / broken images / errors).
  const frames = manifest?.frames || [];
  const regressions = [];
  for (const f of frames) {
    if (f.overflowPx > 0) regressions.push({ surface: f.surface, viewport: f.viewport, kind: 'overflow', detail: `${f.overflowPx}px` });
    if ((f.brokenImages || []).length) regressions.push({ surface: f.surface, viewport: f.viewport, kind: 'broken-image', detail: `${f.brokenImages.length}` });
    if (f.renderError) regressions.push({ surface: f.surface, viewport: f.viewport, kind: 'render-error', detail: f.renderError });
  }
  const captureFailed = cap.status !== 0 && frames.length === 0;
  const severity = regressions.some(r => r.kind === 'render-error') ? 'P0'
    : regressions.length ? 'P1' : 'none';

  const lines = [
    `**Live URL:** ${o.url}`,
    `**Captured frames:** ${frames.length}${captureFailed ? ' (capture degraded — browser/tooling unavailable)' : ''}`,
    `**Regressions:** ${regressions.length} (severity ${severity})`,
    ...regressions.map(r => `- ${r.kind} @ ${r.surface}/${r.viewport}: ${r.detail}`),
  ];
  writeNote(resultsDir, o.label, lines);

  // At T+48h, decide watch-clear (clean) vs escalate.
  if (o.label === 't+48h') {
    if (regressions.length === 0 && !captureFailed) {
      fs.writeFileSync(path.join(resultsDir, 'watch-clear.json'), `${JSON.stringify({ cleared: true, at: process.env.WATCH_TS || null, url: o.url }, null, 2)}\n`);
      console.log('lumen-watch-sweep: t+48h WATCH-CLEAR — no regressions. (results.watch_cleared)');
    } else {
      fs.writeFileSync(path.join(resultsDir, 'watch-escalation.json'), `${JSON.stringify({ cleared: false, severity, regressions, captureFailed }, null, 2)}\n`);
      console.log(`lumen-watch-sweep: t+48h ESCALATE (${severity}) — ${regressions.length} regression(s); NOT cleared.`);
    }
  } else {
    console.log(`lumen-watch-sweep: ${o.label} — ${regressions.length} regression(s) (severity ${severity}).`);
  }
  process.exit(0);
}

main();
