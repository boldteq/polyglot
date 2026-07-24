// Hermetic test for the golden-build-corpus scorer (roadmap Phase 2). The vision/IO is impure; the
// SCORING math (scoreCase / scoreCorpus) is pure and proven here without a repo or a model.
import { test } from 'node:test';
import assert from 'node:assert';
import { scoreCase, scoreCorpus } from '../scripts/eval-golden-builds.mjs';

const summaryWith = (gatesObj) => ({ gates: gatesObj });
const G = (pass, { skipped = false, blockers = 0 } = {}) => ({ pass, skipped, blockers: Array(blockers).fill({ id: 'x' }) });

test('a build meeting every criterion scores 1.0 and passes', () => {
  const summary = summaryWith({ 'secret-scan': G(true), 'code-lint': G(true), 'honesty': G(true) });
  const r = scoreCase(summary, ['hero', 'about'], { gates_green: ['secret-scan', 'code-lint'], sections_present: ['hero'], min_pass_rate: 1, max_blockers: 0 });
  assert.equal(r.pass, true);
  assert.equal(r.score, 1);
  assert.equal(r.failures.length, 0);
});

test('a required green gate that FAILED is a failure', () => {
  const summary = summaryWith({ 'secret-scan': G(true), 'code-lint': G(false, { blockers: 2 }) });
  const r = scoreCase(summary, [], { gates_green: ['secret-scan', 'code-lint'] });
  assert.equal(r.pass, false);
  assert.ok(r.failures.some((f) => f.includes('code-lint') && f.includes('failed')));
});

test('a SKIPPED gate is not a pass (skip ≠ pass)', () => {
  const summary = summaryWith({ 'code-lint': G(true, { skipped: true }) });
  const r = scoreCase(summary, [], { gates_green: ['code-lint'] });
  assert.equal(r.pass, false);
  assert.ok(r.failures.some((f) => f.includes('skipped')));
});

test('a missing required section is a failure', () => {
  const r = scoreCase(summaryWith({}), ['hero'], { sections_present: ['hero', 'reviews'] });
  assert.ok(r.failures.some((f) => f.includes('reviews') && f.includes('missing')));
  assert.ok(!r.failures.some((f) => f.includes('"hero"')));
});

test('min_pass_rate below the floor fails; at/above passes', () => {
  const summary = summaryWith({ a: G(true), b: G(true), c: G(false), d: G(false) }); // 50%
  assert.equal(scoreCase(summary, [], { min_pass_rate: 0.75 }).pass, false);
  assert.equal(scoreCase(summary, [], { min_pass_rate: 0.5 }).pass, true);
});

test('max_blockers ceiling is enforced', () => {
  const summary = summaryWith({ a: G(false, { blockers: 3 }) });
  assert.equal(scoreCase(summary, [], { max_blockers: 0 }).pass, false);
  assert.equal(scoreCase(summary, [], { max_blockers: 5 }).pass, true);
});

test('partial credit: score reflects the FRACTION of criteria met, never a fake 100%', () => {
  const summary = summaryWith({ a: G(true), b: G(false) });
  // 4 criteria: gate a (pass), gate b (fail), section hero (present), min_pass_rate 1.0 (50% < 1 → fail)
  const r = scoreCase(summary, ['hero'], { gates_green: ['a', 'b'], sections_present: ['hero'], min_pass_rate: 1 });
  assert.equal(r.checks, 4);
  assert.equal(r.score, 0.5); // 2 of 4 met
  assert.equal(r.pass, false);
});

test('no criteria → score null (a case that measures nothing is not a perfect score)', () => {
  const r = scoreCase(summaryWith({ a: G(true) }), [], {});
  assert.equal(r.score, null);
});

test('scoreCorpus aggregates only scorable cases and counts passes', () => {
  const agg = scoreCorpus([
    { pass: true, score: 1 },
    { pass: false, score: 0.5 },
    { pass: false, score: null }, // unscorable (e.g. reference missing) — excluded from the mean
  ]);
  assert.equal(agg.cases, 3);
  assert.equal(agg.scored, 2);
  assert.equal(agg.passed, 1);
  assert.equal(agg.meanScore, 0.75); // (1 + 0.5) / 2
});
