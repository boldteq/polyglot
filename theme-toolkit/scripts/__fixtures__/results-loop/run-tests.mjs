#!/usr/bin/env node
// Self-test for the post-publish results loop scripts (hermetic — temp dirs, no store/creds):
//   catalyst-verdict: SCALE / PIVOT / KILL / HOLD-INSUFFICIENT from baseline+results JSON
//   orbit-measure:    no creds → honest INSUFFICIENT scaffold (NEVER invents KPIs)
//   lumen-watch-sweep: no STORE_URL → "skipped" note, exit 0
// Run: node scripts/__fixtures__/results-loop/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, '..', '..'); // theme-toolkit/scripts
let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rl-')); }
function writeResults(dir, label, obj) {
  const rd = path.join(dir, 'docs', 'results');
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(path.join(rd, `${label}.json`), JSON.stringify(obj));
}
function run(script, dir, env = {}, args = []) {
  return spawnSync(process.execPath, [path.join(SCRIPTS, script), '--dir', dir, ...args], { encoding: 'utf-8', env: { ...process.env, ...env } });
}
function readVerdict(dir, label) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'results', `verdict-${label}.json`), 'utf-8')); } catch { return null; } }

// ── catalyst-verdict ─────────────────────────────────────────────────────────
function verdictCase(name, baselineCvr, d30Cvr, target, confidence, expected) {
  const dir = tmp();
  writeResults(dir, 'baseline', { kpis: { cvr: baselineCvr }, confidence: 'REPORTABLE' });
  writeResults(dir, 'd30', { kpis: { cvr: d30Cvr }, lift_target: { sitewide_cvr: target }, confidence });
  const r = run('catalyst-verdict.mjs', dir, { RESULTS_LABEL: 'd30' });
  const v = readVerdict(dir, 'd30');
  if (r.status === 0 && v && v.verdict === expected) ok(`catalyst-verdict ${name} → ${expected} (ratio ${v.ratio})`);
  else bad(`catalyst-verdict ${name}: expected ${expected}, got ${v?.verdict} (exit ${r.status}) ${r.stderr || ''}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('catalyst-verdict — SCALE / PIVOT / KILL / HOLD');
verdictCase('SCALE (+30% vs 25% target → ratio 1.2)', 0.02, 0.026, 0.25, 'REPORTABLE', 'SCALE-CRO');
verdictCase('PIVOT (+10% vs 25% → ratio 0.4)', 0.02, 0.022, 0.25, 'REPORTABLE', 'PIVOT-surface');
verdictCase('KILL (+2.5% vs 25% → ratio 0.1)', 0.02, 0.0205, 0.25, 'REPORTABLE', 'KILL-CRO-investment');
verdictCase('HOLD (INSUFFICIENT sample)', 0.02, 0.026, 0.25, 'INSUFFICIENT', 'HOLD-INSUFFICIENT');

// ── orbit-measure (no creds → honest INSUFFICIENT, never invents) ────────────
console.log('orbit-measure — graceful degrade');
{
  const dir = tmp();
  const r = run('orbit-measure.mjs', dir, { RESULTS_LABEL: 'baseline', STORE: 'acme.myshopify.com' });
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(dir, 'docs', 'results', 'baseline.json'), 'utf-8')); } catch { /* */ }
  if (r.status === 0 && j && j.confidence === 'INSUFFICIENT' && j.source === 'none' && Object.keys(j.kpis || {}).length === 0 && j.reason) {
    ok('orbit-measure no-creds → INSUFFICIENT scaffold, zero invented KPIs');
  } else bad(`orbit-measure: got ${JSON.stringify(j)} (exit ${r.status}) ${r.stderr || ''}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── lumen-watch-sweep (no STORE_URL → skipped note) ──────────────────────────
console.log('lumen-watch-sweep — graceful skip');
{
  const dir = tmp();
  const r = run('lumen-watch-sweep.mjs', dir, { WATCH_LABEL: 't+2h' }); // no STORE_URL
  const note = (() => { try { return fs.readFileSync(path.join(dir, 'docs', 'results', 'watch-t+2h.md'), 'utf-8'); } catch { return ''; } })();
  if (r.status === 0 && /Skipped/i.test(note)) ok('lumen-watch-sweep no-URL → skipped note, exit 0');
  else bad(`lumen-watch-sweep: exit ${r.status}, note="${note.slice(0, 60)}" ${r.stderr || ''}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
