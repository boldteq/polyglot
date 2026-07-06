'use strict';

// Datasets + Experiments routes over real HTTP, isolated temp DB. The async
// runner spawns claude (real cost) so it's NOT exercised here — we seed
// experiment rows via db and test datasets/list/get/compare + POST validation.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-exp-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

const express = require('express');
const db = require('./../db');
const router = require('./experiments');

let server, base;
before(async () => {
  db.getDb();
  // Seed two finished experiments to test compare without spawning claude.
  for (const id of ['exp-a', 'exp-b']) {
    db.createExperiment({ id, datasetId: 'sway', agent: 'sway', total: 1 });
    db.setExperimentStatus(id, 'done', { summary: { cases: 1, passed: 1, avgOverall: id === 'exp-a' ? 0.6 : 0.9, costUsd: 0.01 } });
  }
  db.addExperimentResult({ experimentId: 'exp-a', caseId: 'case-1', agent: 'sway', output: 'x', scores: {}, overall: 0.6, pass: true, costUsd: 0.01 });
  db.addExperimentResult({ experimentId: 'exp-b', caseId: 'case-1', agent: 'sway', output: 'y', scores: {}, overall: 0.9, pass: true, costUsd: 0.01 });

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

test('GET /datasets returns the golden cases', async () => {
  const { status, body } = await req('GET', '/datasets');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items) && body.items.length > 0);
  assert.ok('hasFixtures' in body.items[0] && 'niche' in body.items[0]);
});

test('GET /experiments lists seeded experiments', async () => {
  const { body } = await req('GET', '/experiments');
  assert.ok(body.items.length >= 2);
});

test('GET /experiments/:id returns results', async () => {
  const { status, body } = await req('GET', '/experiments/exp-a');
  assert.equal(status, 200);
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].caseId, 'case-1');
});

test('GET /experiments/compare joins by case + computes delta', async () => {
  const { status, body } = await req('GET', '/experiments/compare?a=exp-a&b=exp-b');
  assert.equal(status, 200);
  const row = body.rows.find((r) => r.caseId === 'case-1');
  assert.equal(row.aOverall, 0.6);
  assert.equal(row.bOverall, 0.9);
  assert.equal(row.delta, 0.3); // b - a
});

test('POST /experiments validates agent + caseIds', async () => {
  assert.equal((await req('POST', '/experiments', { caseIds: ['x'] })).status, 400);          // no agent
  assert.equal((await req('POST', '/experiments', { agent: 'sway' })).status, 400);            // no caseIds
  assert.equal((await req('POST', '/experiments', { agent: 'sway', caseIds: Array(99).fill('x') })).status, 400); // too many
  assert.equal((await req('POST', '/experiments', { agent: 'no-such-agent-xyz', caseIds: ['x'] })).status, 404);  // unknown agent
});

test('POST /experiments rejects an unknown evaluatorId', async () => {
  // agent 'sage' exists; evaluator does not → 404 (validated before launch).
  const r = await req('POST', '/experiments', { agent: 'sage', caseIds: ['code-review-rls'], evaluatorId: 'no-such-eval' });
  assert.equal(r.status, 404);
});

test('createExperiment persists evaluatorId', () => {
  db.createExperiment({ id: 'exp-ev', datasetId: 'sage', agent: 'sage', evaluatorId: 'correctness', total: 1 });
  assert.equal(db.getExperimentRow('exp-ev').evaluatorId, 'correctness');
});

test('POST /experiments/:id/cancel flips a running experiment', async () => {
  db.createExperiment({ id: 'exp-c', datasetId: 'sway', agent: 'sway', total: 5 });
  db.setExperimentStatus('exp-c', 'running');
  const { status, body } = await req('POST', '/experiments/exp-c/cancel');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(db.getExperimentRow('exp-c').status, 'cancelled');
});
