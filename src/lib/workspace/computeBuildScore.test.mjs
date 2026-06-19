import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeBuildScore } = require('./computeBuildScore.js');

const ALL_GATES_PASS = Array.from({ length: 19 }, () => ({ pass: true }));

// Fixture 1 — pristine: full docs tree, all gates pass, lens pass, 100% changes.
test('pristine build scores A and ~100', () => {
  const r = computeBuildScore({
    gates: ALL_GATES_PASS,
    lensVerdict: 'pass',
    changes: { present: true, rate: 100 },
    step: { current: 18, total: 18 },
    schedulesOpen: 1,
    agentRosterUnhealthy: 0,
    blockersOpen: 0,
    artifacts: { brandBible: true, goals: true, baseline: true },
  });
  assert.equal(r.grade, 'A');
  assert.ok(r.score >= 95, `expected ≥95, got ${r.score}`);
  assert.equal(r.maxRealistic, 100);
  assert.equal(r.pending.length, 0);
});

// Fixture 2 — mid-build: half gates, no lens, half changes, no docs tree.
test('mid build scores in the middle, flags pending artifacts', () => {
  const r = computeBuildScore({
    gates: Array.from({ length: 19 }, (_, i) => ({ pass: i < 10 })),
    lensVerdict: null,
    changes: { present: true, rate: 50 },
    step: { current: 9, total: 18 },
    schedulesOpen: 0,
    agentRosterUnhealthy: 0,
    blockersOpen: 0,
    artifacts: { brandBible: false, goals: false, baseline: false },
  });
  assert.ok(r.score > 30 && r.score < 80, `expected 30–80, got ${r.score}`);
  assert.ok(r.pending.includes('goals.json'));
  assert.equal(r.maxRealistic, 85); // -5 brand -5 goals -5 results
});

// Fixture 3 — blocked: gates pass but lens BLOCKS and there are open blockers.
test('blocked build is penalized and BLOCK-RISK', () => {
  const r = computeBuildScore({
    gates: ALL_GATES_PASS,
    lensVerdict: 'block',
    changes: { present: true, rate: 90 },
    step: { current: 14, total: 18 },
    schedulesOpen: 1,
    agentRosterUnhealthy: 1,
    blockersOpen: 5, // -15 cap
    artifacts: { brandBible: false, goals: false, baseline: false },
  });
  const penalty = r.breakdown.find((b) => b.key === 'blockers_penalty');
  assert.equal(penalty.earned, -15);
  assert.equal(r.breakdown.find((b) => b.key === 'lens_verdict').earned, 0);
});

// Fixture 4 — empty build: nothing on disk. Must NOT crash, score low but ≥0.
test('empty build does not crash and scores low', () => {
  const r = computeBuildScore({});
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(Array.isArray(r.breakdown));
  // lens missing → half credit (10); pipeline step 1 → small; everything else 0
  assert.ok(r.score < 30, `expected <30, got ${r.score}`);
});
