'use strict';

// Regression guard for the v45 webhook-persistence bug: saveWebhooks()'s
// INSERT only ever wrote 8 fixed columns while webhooks.js sets orchestrationId
// (since v44 shipped, citing webhooks as the precedent — the irony: that
// precedent never actually persisted) plus lastTriggeredAt/triggerCount on
// every create/trigger. All three were silently dropped on save: a created
// orchestration-webhook would respond with the field set, then revert to
// neither an agent nor a pipeline on the very next load. node:test runs each
// file in its own process, so setting POLYGLOT_DB_PATH here doesn't leak.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-webhooks-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

const db = require('./db');

before(() => { db.getDb(); }); // runs migrations, incl. v45

after(() => {
  try { db.getDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});

test('webhooks: orchestrationId survives a save/reload cycle', () => {
  db.saveWebhooks([{
    id: 'wh_orc', name: 'Nightly pipeline', agentName: null, orchestrationId: 'orc-abc',
    secret: 'sekret', createdAt: new Date().toISOString(), lastTriggeredAt: null, triggerCount: 0,
  }]);
  const reloaded = db.loadWebhooks().find((w) => w.id === 'wh_orc');
  assert.equal(reloaded.orchestrationId, 'orc-abc');
  assert.equal(reloaded.agentName, null);
});

test('webhooks: lastTriggeredAt + triggerCount persist across trigger → save → reload', () => {
  db.saveWebhooks([{
    id: 'wh_trig', name: 'Trigger test', agentName: 'koda', orchestrationId: null,
    prompt: 'do stuff', secret: 's', createdAt: new Date().toISOString(),
    lastTriggeredAt: null, triggerCount: 0,
  }]);
  // Simulate POST /webhooks/trigger/:id's read-mutate-save.
  const webhooks = db.loadWebhooks();
  const wh = webhooks.find((w) => w.id === 'wh_trig');
  wh.lastTriggeredAt = '2026-07-04T00:00:00.000Z';
  wh.triggerCount = (wh.triggerCount || 0) + 1;
  db.saveWebhooks(webhooks);

  const after1 = db.loadWebhooks().find((w) => w.id === 'wh_trig');
  assert.equal(after1.lastTriggeredAt, '2026-07-04T00:00:00.000Z');
  assert.equal(after1.triggerCount, 1);

  // Trigger again — counter increments, not just persists a static value.
  after1.triggerCount += 1;
  db.saveWebhooks(db.loadWebhooks().map((w) => (w.id === 'wh_trig' ? after1 : w)));
  assert.equal(db.loadWebhooks().find((w) => w.id === 'wh_trig').triggerCount, 2);
});

test('webhooks: an agent-only webhook keeps orchestrationId null (no cross-contamination)', () => {
  db.saveWebhooks([
    { id: 'wh_a', name: 'Agent hook', agentName: 'koda', orchestrationId: null, prompt: 'x', secret: 's', createdAt: new Date().toISOString(), lastTriggeredAt: null, triggerCount: 0 },
    { id: 'wh_b', name: 'Pipeline hook', agentName: null, orchestrationId: 'orc-xyz', secret: 's', createdAt: new Date().toISOString(), lastTriggeredAt: null, triggerCount: 0 },
  ]);
  const list = db.loadWebhooks();
  const a = list.find((w) => w.id === 'wh_a');
  const b = list.find((w) => w.id === 'wh_b');
  assert.equal(a.orchestrationId, null);
  assert.equal(a.agentName, 'koda');
  assert.equal(b.orchestrationId, 'orc-xyz');
  assert.equal(b.agentName, null);
});
