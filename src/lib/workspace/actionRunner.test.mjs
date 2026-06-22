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

test('the publish actions are deploy-tier (so the generic route rejects them)', () => {
  const { getAction } = require('./actionRegistry.js');
  assert.equal(getAction('publish:preflight').tier, 'deploy');
  assert.equal(getAction('publish:flip').tier, 'deploy');
  assert.equal(getAction('publish:flip').requiresStoreConfirm, true);
  // preflight is a pure dry-run — NOT store-confirm gated (it can never flip)
  assert.notEqual(getAction('publish:preflight').requiresStoreConfirm, true);
});
