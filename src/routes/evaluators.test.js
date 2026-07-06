'use strict';

// Evaluators CRUD + calibration over real HTTP, isolated temp DB. Verifies the
// seed, builtin read-only protection, custom create/update/delete, and the
// calibration endpoint shape.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-evals-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

const express = require('express');
const db = require('./../db');
const router = require('./evaluators');

let server, base;
before(async () => {
  db.getDb();
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((r) => (server ? server.close(r) : r()));
  try { db.getDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const req = (method, p, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request(base + p, { method, agent: false, headers: data ? { 'Content-Type': 'application/json' } : {} }, (res) => {
    let buf = '';
    res.on('data', (c) => { buf += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }));
  });
  r.on('error', reject);
  if (data) r.write(data);
  r.end();
});

test('GET /evaluators returns the seeded builtins', async () => {
  const { body } = await req('GET', '/evaluators');
  assert.ok(body.items.length >= 6);
  assert.ok(body.items.some((e) => e.id === 'default' && e.builtin === true));
});

test('builtin evaluators are read-only (PUT + DELETE blocked)', async () => {
  const put = await req('PUT', '/evaluators/default', { name: 'hacked' });
  assert.equal(put.status, 403);
  const del = await req('DELETE', '/evaluators/default');
  assert.equal(del.status, 403);
});

test('create → update → delete a custom evaluator', async () => {
  const created = await req('POST', '/evaluators', { name: 'Tone Check', description: 'voice', rubric: [{ dim: 'tone', desc: 'on brand' }] });
  assert.equal(created.status, 200);
  assert.equal(created.body.builtin, false);
  const id = created.body.id;

  const upd = await req('PUT', `/evaluators/${id}`, { rubric: [{ dim: 'tone', desc: 'on brand' }, { dim: 'clarity', desc: 'clear' }] });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.rubric.length, 2);

  const del = await req('DELETE', `/evaluators/${id}`);
  assert.equal(del.status, 200);
  const gone = await req('GET', `/evaluators/${id}`);
  assert.equal(gone.status, 404);
});

test('POST rejects a missing/invalid rubric', async () => {
  const r = await req('POST', '/evaluators', { name: 'No Rubric' });
  assert.equal(r.status, 400);
});

test('POST /evaluators/:id/run validates input (no spawn)', async () => {
  // Missing output → 400 (before any judge spawn).
  assert.equal((await req('POST', '/evaluators/default/run', { task: 't' })).status, 400);
  // Unknown evaluator → 404.
  assert.equal((await req('POST', '/evaluators/nope-xyz/run', { output: 'x' })).status, 404);
});

test('GET /evaluators/calibration returns a calibration shape', async () => {
  const { status, body } = await req('GET', '/evaluators/calibration');
  assert.equal(status, 200);
  assert.ok('calibration' in body); // null when no self-test ingested yet
});
