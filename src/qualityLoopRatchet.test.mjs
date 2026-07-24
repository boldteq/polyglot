import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// autoRatchet writes into GOLDEN_DIR, a module-level const captured at import — set it BEFORE importing.
const TMP_GOLDEN = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-golden-'));
process.env.GOLDEN_DIR = TMP_GOLDEN;
process.env.RATCHET_AUTO = ''; // ensure default-on for the mint tests
const { autoRatchet } = await import('../scripts/quality-loop.mjs');

// A minimal "fixed build": a summary.json where `gate` passes, plus a sections/ dir (for the sanity score).
function mkBuild(gateStates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-build-'));
  fs.mkdirSync(path.join(dir, 'gate-reports'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'gate-reports', 'summary.json'), JSON.stringify({ sha: 'deadbeef', gates: gateStates }));
  return dir;
}
const ts = '2026-07-24T00:00:00.000Z';
const caseFile = (buildId, gate) => path.join(TMP_GOLDEN, `regression-${buildId.replace(/\s+/g, '-').toLowerCase()}-${gate}.json`);

test('a FAIL→PASS gate auto-mints a portable, valid regression case', () => {
  const build = mkBuild({ 'reference-match': { pass: true } });
  const minted = autoRatchet(build, 'store one', ['reference-match'], ts);
  assert.equal(minted.length, 1, 'one case minted');
  const f = caseFile('store one', 'reference-match');
  assert.ok(fs.existsSync(f), 'regression case file written');
  const c = JSON.parse(fs.readFileSync(f, 'utf-8'));
  assert.deepEqual(c.must_pass.gates_green, ['reference-match'], 'anchors to the fixed gate');
  assert.equal(c.niche, 'regression');
});

test('re-running the same fixed build is idempotent (dedup by file — no noise)', () => {
  const build = mkBuild({ 'reference-match': { pass: true } });
  const first = autoRatchet(build, 'store dedup', ['reference-match'], ts);
  const second = autoRatchet(build, 'store dedup', ['reference-match'], ts);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0, 'second run mints nothing — the bug is already locked in');
});

test('refuses to ratchet a gate that is not actually green (a ratchet locks a FIX, not a defect)', () => {
  const build = mkBuild({ 'reference-match': { pass: false } });
  const minted = autoRatchet(build, 'store failing', ['reference-match'], ts);
  assert.equal(minted.length, 0, 'a still-failing gate is refused');
  assert.ok(!fs.existsSync(caseFile('store failing', 'reference-match')));
});

test('RATCHET_AUTO=0 opts out entirely', () => {
  const build = mkBuild({ 'reference-match': { pass: true } });
  const prev = process.env.RATCHET_AUTO;
  process.env.RATCHET_AUTO = '0';
  try {
    const minted = autoRatchet(build, 'store optout', ['reference-match'], ts);
    assert.equal(minted.length, 0, 'no mint when opted out');
  } finally { process.env.RATCHET_AUTO = prev; }
});

test('no fixed gates → no-op', () => {
  assert.deepEqual(autoRatchet('/nonexistent', 'store none', [], ts), []);
});
