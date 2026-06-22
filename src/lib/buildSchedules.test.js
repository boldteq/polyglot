'use strict';

// Hermetic proof of the post-publish scheduler keystone (fixes workspace.js:477). No real
// db, no real handlers, fake clock — proves register + due-selection + CATCH-UP (the
// non-24/7-Mac case) + failure isolation + no-re-run.

const { test } = require('node:test');
const assert = require('node:assert');
const { registerBuildSchedules, runDueBuildSchedules, onPublishFlipComplete } = require('./buildSchedules');

// In-memory mock of the db build_schedules CRUD (honors INSERT OR IGNORE by id).
function mockDb() {
  const rows = new Map();
  return {
    rows,
    insertBuildSchedule(r) { if (!rows.has(r.id)) rows.set(r.id, { ...r }); },
    dueBuildSchedules(now) { return [...rows.values()].filter(r => r.status === 'pending' && r.due_at <= now).sort((a, b) => a.due_at - b.due_at); },
    markBuildScheduleStatus(id, status, ranAt, resultJson) { const r = rows.get(id); if (r) { r.status = status; r.ran_at = ranAt; r.result_json = resultJson; } },
    listBuildSchedules(buildId) { return [...rows.values()].filter(r => r.build_id === buildId); },
  };
}

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000, DAY = 86_400_000;

test('registerBuildSchedules: 6 checkpoints, correct due_at, idempotent', () => {
  const d = mockDb();
  const ids = registerBuildSchedules('b1', { publishedAt: T0, repoDir: '/tmp/b1', store: 's.myshopify.com', now: T0, database: d });
  assert.equal(ids.length, 6);
  assert.equal(d.rows.size, 6);
  assert.equal(d.rows.get('b1:t+48h').due_at, T0 + 48 * HOUR);
  assert.equal(d.rows.get('b1:d90').due_at, T0 + 90 * DAY);
  registerBuildSchedules('b1', { publishedAt: T0, repoDir: '/tmp/b1', now: T0, database: d });
  assert.equal(d.rows.size, 6, 're-register must not duplicate');
});

test('runDueBuildSchedules: only due checkpoints fire; pending→done', async () => {
  const d = mockDb();
  registerBuildSchedules('b2', { publishedAt: T0, repoDir: '/tmp/b2', now: T0, database: d });
  const calls = [];
  const handlers = { watch: async (r) => { calls.push(r.label); return { ok: true }; }, results: async (r) => { calls.push(r.label); return { ok: true }; } };
  const res = await runDueBuildSchedules({ now: T0 + 3 * HOUR, database: d, handlers });
  assert.deepEqual(calls, ['t+2h']);
  assert.equal(res.ran.length, 1);
  assert.equal(d.rows.get('b2:t+2h').status, 'done');
  assert.equal(d.rows.get('b2:t+24h').status, 'pending');
});

test('CATCH-UP: an overdue (asleep) Mac fires ALL passed checkpoints on the next tick', async () => {
  const d = mockDb();
  registerBuildSchedules('b3', { publishedAt: T0, repoDir: '/tmp/b3', now: T0, database: d });
  const calls = [];
  const handlers = { watch: async (r) => { calls.push(r.label); }, results: async (r) => { calls.push(r.label); } };
  const res = await runDueBuildSchedules({ now: T0 + 50 * HOUR, database: d, handlers });
  assert.equal(res.ran.length, 4, 't+2h, t+24h, t+48h (watch) + baseline (results)');
  assert.deepEqual(calls.sort(), ['baseline', 't+24h', 't+2h', 't+48h']);
  assert.equal(d.rows.get('b3:d30').status, 'pending');
});

test('a failing handler is isolated; others still run; row marked failed', async () => {
  const d = mockDb();
  registerBuildSchedules('b4', { publishedAt: T0, repoDir: '/tmp/b4', now: T0, database: d });
  const handlers = { watch: async (r) => { if (r.label === 't+24h') throw new Error('sweep boom'); }, results: async () => {} };
  const res = await runDueBuildSchedules({ now: T0 + 50 * HOUR, database: d, handlers });
  assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].id, 'b4:t+24h');
  assert.equal(d.rows.get('b4:t+24h').status, 'failed');
  assert.equal(d.rows.get('b4:t+2h').status, 'done');
  assert.equal(d.rows.get('b4:t+48h').status, 'done');
});

test('done checkpoints never re-run', async () => {
  const d = mockDb();
  registerBuildSchedules('b5', { publishedAt: T0, repoDir: '/tmp/b5', now: T0, database: d });
  let n = 0;
  const handlers = { watch: async () => { n += 1; }, results: async () => { n += 1; } };
  await runDueBuildSchedules({ now: T0 + 3 * HOUR, database: d, handlers });
  await runDueBuildSchedules({ now: T0 + 3 * HOUR, database: d, handlers });
  assert.equal(n, 1, 'a done checkpoint must not re-run');
});

// ── S7: publish-flip → post-publish loop decision (exit-0-only) ──
function flipDeps() {
  const calls = [];
  return {
    calls,
    register: (bid, opts) => { calls.push(['register', bid, opts.store, opts.repoDir]); return registerBuildSchedules(bid, { ...opts, database: mockDb() }); },
    setStatus: (pid, s) => calls.push(['setStatus', pid, s]),
    now: () => T0,
    log: () => {},
  };
}
const CTX = { buildId: 'pub1', repoDir: '/tmp/pub1', store: 's.myshopify.com', projectId: 'proj1' };

test('onPublishFlipComplete: clean live flip (exit 0) registers 6 + flips status to published', () => {
  const d = flipDeps();
  const out = onPublishFlipComplete({ exitCode: 0, status: 'done' }, CTX, { register: d.register, setStatus: d.setStatus, now: d.now, log: d.log });
  assert.equal(out.registered, true);
  assert.equal(out.ids.length, 6);
  assert.equal(out.statusSet, true);
  assert.deepEqual(d.calls, [['register', 'pub1', 's.myshopify.com', '/tmp/pub1'], ['setStatus', 'proj1', 'published']]);
});

test('onPublishFlipComplete: blocked/degraded/error flips (exit 1/2/3) register nothing, flip no status', () => {
  for (const code of [1, 2, 3]) {
    const d = flipDeps();
    const out = onPublishFlipComplete({ exitCode: code, status: 'failed' }, CTX, { register: d.register, setStatus: d.setStatus, log: d.log });
    assert.equal(out.registered, false, `exit ${code} must not register`);
    assert.equal(out.statusSet, false, `exit ${code} must not flip status`);
    assert.equal(d.calls.length, 0, `exit ${code} must make no calls`);
  }
});

test('onPublishFlipComplete: null rec is a no-op (never throws)', () => {
  const d = flipDeps();
  const out = onPublishFlipComplete(null, CTX, { register: d.register, setStatus: d.setStatus, log: d.log });
  assert.equal(out.registered, false);
  assert.equal(d.calls.length, 0);
});

test('onPublishFlipComplete: a throwing register never crashes + never flips status after', () => {
  const calls = [];
  const out = onPublishFlipComplete({ exitCode: 0, status: 'done' }, CTX, {
    register: () => { throw new Error('db down'); },
    setStatus: (pid, s) => calls.push(['setStatus', pid, s]),
    log: () => {},
  });
  assert.equal(out.registered, false, 'registration failed → not registered');
  // status flip still attempted (independent of registration) — the build IS live
  assert.deepEqual(calls, [['setStatus', 'proj1', 'published']]);
});
