// Hermetic test for the build-quality dashboard aggregator (roadmap Phase 5.2). Pure — no DB, no UI.
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { aggregateBuildQuality } = require('./lib/buildQuality.js');

const buildScore = (agent, overall, ts, pass = overall >= 0.9) => ({ agent, taskType: 'build', caseId: `build:${ts}`, overall, pass, ts });

test('per-builder latest + mean + count, worst latest first', () => {
  const r = aggregateBuildQuality({ evalScores: [
    buildScore('loom', 1.0, '2026-07-24T01:00:00Z'),
    buildScore('loom', 0.5, '2026-07-24T02:00:00Z'),   // latest for loom
    buildScore('drape', 0.8, '2026-07-24T03:00:00Z'),   // latest for drape
  ] });
  assert.equal(r.buildCount, 3);
  // loom latest 0.5 (worst) sorts before drape 0.8
  assert.deepEqual(r.builders.map((b) => b.agent), ['loom', 'drape']);
  const loom = r.builders.find((b) => b.agent === 'loom');
  assert.equal(loom.latest, 0.5);
  assert.equal(loom.mean, 0.75); // (1.0 + 0.5)/2
  assert.equal(loom.n, 2);
});

test('ignores non-build eval scores (e.g. sales)', () => {
  const r = aggregateBuildQuality({ evalScores: [
    buildScore('loom', 0.9, '2026-07-24T01:00:00Z'),
    { agent: 'sway', taskType: 'sales', caseId: 'sales-close', overall: 0.4, pass: false, ts: '2026-07-24T02:00:00Z' },
  ] });
  assert.equal(r.buildCount, 1);
  assert.equal(r.builders.length, 1);
  assert.equal(r.builders[0].agent, 'loom');
});

test('pass rate over builds only', () => {
  const r = aggregateBuildQuality({ evalScores: [
    buildScore('loom', 1.0, 't1', true), buildScore('loom', 0.5, 't2', false), buildScore('drape', 1.0, 't3', true),
  ] });
  assert.equal(r.passRate, 0.67); // 2 of 3
});

test('top failing gates ranked by fail count from the trend', () => {
  const r = aggregateBuildQuality({ trendLines: [
    { byGate: { 'design-quality': { pass: false }, 'code-lint': { pass: true } } },
    { byGate: { 'design-quality': { pass: false }, 'code-lint': { pass: false } } },
    { byGate: { 'design-quality': { pass: true }, 'code-lint': { pass: false } } },
  ] });
  // design-quality fails 2/3, code-lint 2/3 — both surface; ranked by fails then rate
  const dq = r.topFailingGates.find((g) => g.gate === 'design-quality');
  assert.equal(dq.fails, 2);
  assert.equal(dq.builds, 3);
  assert.equal(dq.rate, 0.67);
  assert.ok(r.topFailingGates.length === 2);
});

test('golden score + cases surfaced from the baseline', () => {
  const r = aggregateBuildQuality({ goldenBaseline: { meanScore: 1, passed: 3, cases: 3 } });
  assert.equal(r.goldenScore, 1);
  assert.equal(r.goldenCases, 3);
});

test('empty inputs → safe zeros/nulls (no crash, no fake numbers)', () => {
  const r = aggregateBuildQuality({});
  assert.equal(r.buildCount, 0);
  assert.equal(r.passRate, null);
  assert.equal(r.goldenScore, null);
  assert.deepEqual(r.builders, []);
  assert.deepEqual(r.topFailingGates, []);
});
