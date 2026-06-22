'use strict';

// Settings + app-config write paths over real HTTP, isolated temp DB + temp HOME.
// Locks the `effortLevel`-class regression: an unknown top-level settings key must
// be rejected (400) BEFORE anything is written, and a whitelisted payload must save.
//
// CRITICAL: CLAUDE_DIR is computed from os.homedir() at module load (config.js),
// and PUT /global/settings writes settings.json there. We patch os.homedir to a
// temp dir BEFORE requiring the router so the test never clobbers the real
// ~/.claude/settings.json.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-config-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');
const FAKE_HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(FAKE_HOME, '.claude'), { recursive: true });
os.homedir = () => FAKE_HOME; // patched before the requires below

const express = require('express');
const db = require('./../db');
const router = require('./config');

let server;
let base;

before(async () => {
  db.getDb();
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  try { db.getDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// node:http with agent:false so no keep-alive socket pins the event loop.
function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const r = http.request(base + p, {
      method,
      agent: false,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json = {};
        try { json = buf ? JSON.parse(buf) : {}; } catch { /* leave {} */ }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

test('PUT /global/settings accepts whitelisted keys and persists them', async () => {
  const res = await req('PUT', '/global/settings', {
    settings: { model: 'claude-opus-4-7', permissions: { allow: [] } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.success, true);
  assert.deepEqual(res.json.ignored, []);
  // written to the FAKE home, never the real one
  const written = JSON.parse(fs.readFileSync(path.join(FAKE_HOME, '.claude', 'settings.json'), 'utf8'));
  assert.equal(written.model, 'claude-opus-4-7');
});

test('PUT /global/settings merges — preserves existing non-whitelisted keys, ignores new ones (effortLevel-class fix)', async () => {
  // The real settings.json is owned by the Claude Code CLI and holds keys outside
  // our whitelist (enabledPlugins, effortLevel, …). A reject-unknown replace used
  // to 400 the whole save once the file held any such key. It must now merge.
  const file = path.join(FAKE_HOME, '.claude', 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ model: 'old', effortLevel: 'high', enabledPlugins: { x: true } }));

  const res = await req('PUT', '/global/settings', {
    settings: { model: 'claude-opus-4-7', effortLevel: 'low', newJunk: 1 },
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));            // no longer a 400
  assert.ok(Array.isArray(res.json.ignored) && res.json.ignored.includes('newJunk'), 'new non-whitelisted key reported as ignored');

  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(written.model, 'claude-opus-4-7');         // whitelisted change applied
  assert.equal(written.effortLevel, 'high');              // existing non-whitelisted PRESERVED (not overwritten with 'low')
  assert.deepEqual(written.enabledPlugins, { x: true });  // existing non-whitelisted preserved
  assert.equal('newJunk' in written, false);              // new non-whitelisted dropped, never written
});

test('PUT /app-config/models/:id round-trips camelCase write → snake_case read', async () => {
  const put = await req('PUT', '/app-config/models/claude-test-1', {
    displayName: 'Test 1', tier: 'engineer', costPenalty: 0.3, enabled: 1,
  });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const get = await req('GET', '/app-config');
  assert.equal(get.status, 200, JSON.stringify(get.json));
  const found = (get.json.models || []).find((m) => m.id === 'claude-test-1');
  assert.ok(found, 'new model present in GET /app-config');
  assert.equal(found.display_name, 'Test 1');
  assert.equal(found.cost_penalty, 0.3);
});

test('PUT /app-config/models/:id rejects a missing required field', async () => {
  const res = await req('PUT', '/app-config/models/claude-bad', { displayName: 'No tier' });
  assert.equal(res.status, 400);
});
