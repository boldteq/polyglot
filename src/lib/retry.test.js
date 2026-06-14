'use strict';

// Pillar 4 retry helper — pure, deterministic (injected sleep/rng). Node 20 `node:test`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withRetry, isPermanentError, backoffMs, createBudget } = require('./retry');

const noSleep = async () => {};
const rngMin = () => 0;

test('transient failure retries then succeeds', async () => {
  let calls = 0;
  const r = await withRetry(async (a) => { calls += 1; if (a < 3) throw new Error('network timeout'); return `ok@${a}`; }, { sleep: noSleep, rng: rngMin });
  assert.equal(r, 'ok@3');
  assert.equal(calls, 3);
});

test('permanent failure is not retried', async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => { calls += 1; throw new Error("agent 'x' not found"); }, { sleep: noSleep }));
  assert.equal(calls, 1);
});

test('classifier: permanent vs transient', () => {
  assert.equal(isPermanentError(Object.assign(new Error('x'), { code: 'MODEL_ROUTING_BLOCKED' })), true);
  assert.equal(isPermanentError(Object.assign(new Error('Cancelled'), { cancelled: true })), true);
  assert.equal(isPermanentError(new Error('invalid api key')), true);
  assert.equal(isPermanentError(new Error('validation failed')), true);
  // these must stay transient (the regex-tightening fix)
  assert.equal(isPermanentError(new Error('invalid chunk encoding')), false);
  assert.equal(isPermanentError(new Error('getaddrinfo host not found temporarily')), false);
  assert.equal(isPermanentError(new Error('Claude execution timed out after 60s')), false);
});

test('exhausts maxAttempts then throws the LAST error', async () => {
  let calls = 0;
  let thrown = null;
  try { await withRetry(async () => { calls += 1; throw new Error(`flaky ${calls}`); }, { maxAttempts: 4, sleep: noSleep, rng: rngMin }); }
  catch (e) { thrown = e; }
  assert.equal(calls, 4);
  assert.equal(thrown.message, 'flaky 4');
});

test('shared budget caps total retries (cost breaker)', async () => {
  const budget = createBudget(2);
  let calls = 0;
  await assert.rejects(() => withRetry(async () => { calls += 1; throw new Error('timeout'); }, { maxAttempts: 10, budget, sleep: noSleep, rng: rngMin }));
  assert.equal(calls, 3); // 1 initial + 2 budgeted retries
  assert.equal(budget.used(), 2);
});

test('backoff grows exponentially, capped, with jitter floor', () => {
  const b1 = backoffMs(1, { baseMs: 1000, capMs: 30000 }, () => 1);
  const b2 = backoffMs(2, { baseMs: 1000, capMs: 30000 }, () => 1);
  const b3 = backoffMs(3, { baseMs: 1000, capMs: 30000 }, () => 1);
  assert.ok(b1 < b2 && b2 < b3 && b3 <= 30000);
  assert.equal(backoffMs(1, { baseMs: 1000 }, () => 0), 500); // jitter floor = half the window
});

test('maxAttempts < 1 throws a descriptive error (not undefined)', async () => {
  await assert.rejects(() => withRetry(async () => 'x', { maxAttempts: 0, sleep: noSleep }), /no attempts/);
});

test('onRetry fires once before the successful retry', async () => {
  const events = [];
  await withRetry(async (a) => { if (a < 2) throw new Error('timeout'); return 'x'; }, { sleep: noSleep, rng: rngMin, onRetry: (e) => events.push(e) });
  assert.equal(events.length, 1);
  assert.equal(events[0].attempt, 1);
  assert.equal(typeof events[0].delayMs, 'number');
});
