import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const actionRunner = require('./actionRunner.js');

// The deploy-tier publish flip must NEVER spawn without a store-name confirmation
// that matches the build's theme-lock. These tests assert the guard THROWS before
// any spawn — so we never touch a real store. (We never test the matching-confirm
// path here: that would spawn the real publish script.)
let dir;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-s6-'));
  fs.writeFileSync(path.join(dir, '.boldteq-theme-lock.json'),
    JSON.stringify({ store: 'acme.myshopify.com', themeId: '123', themeName: 'Acme', role: 'unpublished' }));
});
after(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

test('publish:flip throws CONFIRM_REQUIRED when no confirmStore is passed', () => {
  assert.throws(
    () => actionRunner.runAction({ buildId: 'b', dir, actionId: 'publish:flip' }),
    (e) => e.code === 'CONFIRM_REQUIRED',
  );
});

test('publish:flip throws CONFIRM_REQUIRED when confirmStore mismatches the lock', () => {
  assert.throws(
    () => actionRunner.runAction({ buildId: 'b', dir, actionId: 'publish:flip', confirmStore: 'wrong.myshopify.com' }),
    (e) => e.code === 'CONFIRM_REQUIRED',
  );
});

test('publish:flip throws NO_LOCK_STORE on a build with no theme-lock', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-s6-bare-'));
  try {
    assert.throws(
      () => actionRunner.runAction({ buildId: 'b', dir: bare, actionId: 'publish:flip', confirmStore: 'anything' }),
      (e) => e.code === 'NO_LOCK_STORE',
    );
  } finally { fs.rmSync(bare, { recursive: true, force: true }); }
});

test('runAction rejects extraArgs on an action NOT flagged allowsExtraArgs', () => {
  assert.throws(
    () => actionRunner.runAction({ buildId: 'b', dir, actionId: 'build-state:show', extraArgs: ['--gate', 'x'] }),
    (e) => e.code === 'NO_EXTRA_ARGS',
  );
});

test('runAction rejects non-string extraArgs even on a flagged action', () => {
  assert.throws(
    // gate:rerun allowsExtraArgs, but extraArgs must be plain strings
    () => actionRunner.runAction({ buildId: 'b', dir, actionId: 'gate:rerun', extraArgs: ['--gate', 123] }),
    (e) => e.code === 'BAD_EXTRA_ARGS',
  );
});

test('the publish actions are deploy-tier (so the generic route rejects them)', () => {
  const { getAction } = require('./actionRegistry.js');
  assert.equal(getAction('publish:preflight').tier, 'deploy');
  assert.equal(getAction('publish:flip').tier, 'deploy');
  assert.equal(getAction('publish:flip').requiresStoreConfirm, true);
  // preflight is a pure dry-run — NOT store-confirm gated (it can never flip)
  assert.notEqual(getAction('publish:preflight').requiresStoreConfirm, true);
});

// ── S7: onComplete fires once at the terminal state (the publish→monitor hook) ──
test('runAction onComplete fires once with the terminal record', async () => {
  // build-state:show is a safe, read-only action that completes fast (exits 1 in a
  // bare dir: "no build-state.json"). Either way it reaches a terminal state → fires.
  const done = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('onComplete never fired')), 20000);
    let count = 0, last = null;
    actionRunner.runAction({ buildId: 'b', dir, actionId: 'build-state:show', onComplete: (rec) => { count += 1; last = { ...rec, _count: count }; clearTimeout(t); resolve(last); } });
  });
  assert.equal(done._count, 1, 'fired exactly once');
  assert.ok(['done', 'failed', 'error'].includes(done.status), `terminal status, got ${done.status}`);
  assert.equal(typeof done.runId, 'string');
  assert.notEqual(done.exitCode, null, 'exitCode is set at terminal state');
});

test('runAction onComplete is NOT called on the env-blocked (no-spawn) path', async () => {
  // store:preflight requires env that the test env lacks → blocked, never spawns.
  let called = false;
  const rec = actionRunner.runAction({ buildId: 'b', dir, actionId: 'store:preflight', onComplete: () => { called = true; } });
  assert.equal(rec.status, 'blocked');
  await new Promise((r) => setTimeout(r, 150)); // give any stray async a chance
  assert.equal(called, false, 'a blocked action never spawned, so onComplete must not fire');
});
