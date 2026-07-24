// Hermetic test for the ratchet (roadmap "same bug can't ship twice"). Proves mintRegressionCase only
// locks in a REAL fix (refuses a still-failing or skipped gate) and produces a case that then CATCHES
// the defect's return. Uses a synthetic build dir (gate-reports/summary.json) — no client repo, no model.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mintRegressionCase } from '../scripts/ratchet-add.mjs';
import { scoreCase } from '../scripts/eval-golden-builds.mjs';

function build(gates, sections = ['hero']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'));
  fs.mkdirSync(path.join(dir, 'gate-reports'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'gate-reports', 'summary.json'), JSON.stringify({ sha: 'abc123', gates }));
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  for (const s of sections) fs.writeFileSync(path.join(dir, 'sections', `${s}.liquid`), '<div></div>');
  return dir;
}
const G = (pass, { skipped = false } = {}) => ({ pass, skipped, blockers: [], warnings: [] });

test('mints a regression case anchored to a now-GREEN gate', () => {
  const dir = build({ 'reference-match': G(true), 'code-lint': G(true) });
  const r = mintRegressionCase(dir, { gate: 'reference-match', slug: 'hero-archetype', brief: 'hero was a banner not a slideshow' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.case.id, 'regression-hero-archetype');
  assert.deepEqual(r.case.must_pass.gates_green, ['reference-match']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REFUSES to ratchet a still-FAILING gate (a ratchet locks in a fix, not a defect)', () => {
  const dir = build({ 'reference-match': G(false) });
  const r = mintRegressionCase(dir, { gate: 'reference-match', slug: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /still FAILING/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REFUSES a SKIPPED gate (skip ≠ pass)', () => {
  const dir = build({ 'code-lint': G(true, { skipped: true }) });
  const r = mintRegressionCase(dir, { gate: 'code-lint', slug: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /SKIPPED/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('REFUSES a gate that was not in the run', () => {
  const dir = build({ 'reference-match': G(true) });
  const r = mintRegressionCase(dir, { gate: 'ghost-gate', slug: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in this build/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the minted case CATCHES the defect if it returns (the whole point)', () => {
  const dir = build({ 'reference-match': G(true) });
  const r = mintRegressionCase(dir, { gate: 'reference-match', slug: 'hero-archetype' });
  assert.equal(r.ok, true);
  // fixed build → passes; re-broken build → the case FAILS (regression caught)
  const fixed = scoreCase({ gates: { 'reference-match': G(true) } }, ['hero'], r.case.must_pass);
  const broke = scoreCase({ gates: { 'reference-match': G(false) } }, ['hero'], r.case.must_pass);
  assert.equal(fixed.pass, true, 'passes on the fixed build');
  assert.equal(broke.pass, false, 'FAILS when the defect returns — the ratchet works');
  fs.rmSync(dir, { recursive: true, force: true });
});
