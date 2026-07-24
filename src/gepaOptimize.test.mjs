// Hermetic proof of the GEPA optimizer's SAFETY GUARANTEES (roadmap Phase 4.2). The LLM steps
// (propose/generate/judge) are mocked, so the guarantees are proven without a model or tokens:
//   1. NO REGRESSION — a variant is kept only if it beats the incumbent; else the base is retained.
//   2. NO OVERFIT   — a variant that improves TRAIN but regresses HELD-OUT is rejected.
import { test } from 'node:test';
import assert from 'node:assert';
import { aggregate, splitCases, selectWinner, evaluatePrompt, optimize } from '../scripts/gepa-optimize.mjs';

test('aggregate: mean/min/n over numeric scores, null on empty', () => {
  assert.deepEqual(aggregate([1, 0.5, 0.75]), { mean: 0.75, min: 0.5, n: 3 });
  assert.deepEqual(aggregate([]), { mean: null, min: null, n: 0 });
});

test('splitCases: deterministic, both sides non-empty, reproducible', () => {
  const cs = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}` }));
  const a = splitCases(cs, 0.34), b = splitCases(cs, 0.34);
  assert.ok(a.train.length && a.heldout.length, 'both sides populated');
  assert.equal(a.train.length + a.heldout.length, 6, 'no case lost or duplicated');
  assert.deepEqual(a.train.map((c) => c.id), b.train.map((c) => c.id), 'deterministic');
});

test('GUARANTEE 1 — no candidate beats the incumbent → incumbent retained (never a regression)', () => {
  const inc = { id: 'base', train: { mean: 0.80 }, heldout: { mean: 0.80 } };
  const cands = [
    { id: 'worse', train: { mean: 0.70 }, heldout: { mean: 0.70 } },
    { id: 'flat', train: { mean: 0.805 }, heldout: { mean: 0.80 } }, // < minGain 0.02
  ];
  const r = selectWinner(inc, cands, { minGain: 0.02 });
  assert.equal(r.changed, false);
  assert.equal(r.winner.id, 'base');
});

test('GUARANTEE 2 — a train-overfit variant (train up, held-out down) is REJECTED', () => {
  const inc = { id: 'base', train: { mean: 0.80 }, heldout: { mean: 0.80 } };
  const cands = [
    { id: 'overfit', train: { mean: 0.95 }, heldout: { mean: 0.72 } }, // big train gain, held-out REGRESSES
    { id: 'general', train: { mean: 0.86 }, heldout: { mean: 0.84 } }, // real generalizing gain
  ];
  const r = selectWinner(inc, cands, { minGain: 0.02 });
  assert.equal(r.winner.id, 'general', 'picks the generalizing variant, not the overfit one');
  assert.equal(r.changed, true);
});

test('selectWinner picks the best HELD-OUT among eligible (generalization-first)', () => {
  const inc = { id: 'base', train: { mean: 0.70 }, heldout: { mean: 0.70 } };
  const cands = [
    { id: 'a', train: { mean: 0.90 }, heldout: { mean: 0.78 } },
    { id: 'b', train: { mean: 0.80 }, heldout: { mean: 0.85 } }, // lower train, higher held-out → wins
  ];
  assert.equal(selectWinner(inc, cands, { minGain: 0.02 }).winner.id, 'b');
});

// End-to-end loop with mocked IO: a "good" variant produces high scores, others low.
function mockIO({ goodMarker = 'GOOD', goodScore = 0.9, baseScore = 0.7 } = {}) {
  return {
    generate: async (prompt) => (prompt.includes(goodMarker) ? 'great output' : 'meh output'),
    judge: async ({ output }) => (output === 'great output' ? goodScore : baseScore),
    propose: async () => ['a mediocre variant', `an improved ${goodMarker} variant`],
  };
}

test('optimize: end-to-end keeps the improving variant and reports the gain', async () => {
  const cases = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, task: `t${i}`, fixtures: { good: 'ref' } }));
  const res = await optimize({ agent: 'x', base: 'plain base', cases, rounds: 1, variants: 2, io: mockIO() });
  assert.equal(res.improved, true, 'reports an improvement');
  assert.ok(res.winner.heldout > res.base.heldout, 'held-out score rose');
  assert.match(res.winner.prompt, /GOOD/, 'the winning prompt is the improving variant');
});

test('optimize: when every variant is WORSE, it honestly no-ops (base retained, improved=false)', async () => {
  const cases = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, task: `t${i}`, fixtures: { good: 'ref' } }));
  // proposer only ever offers non-GOOD (worse) variants
  const io = { ...mockIO(), propose: async () => ['worse one', 'worse two'] };
  const res = await optimize({ agent: 'x', base: 'plain base', cases, rounds: 2, variants: 2, io });
  assert.equal(res.improved, false, 'no fake improvement');
  assert.equal(res.winner.id, 'base', 'base retained — never ships a regression');
});
