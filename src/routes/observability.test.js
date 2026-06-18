'use strict';

// Observability + consolidation routes end-to-end over real HTTP, isolated temp DB.
// (Intelligence route is excluded here — it needs Ollama + the vector index, which
//  aren't available in CI; it's covered by the live smoke during the hardening work.)
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-route-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

const express = require('express');
const db = require('./../db');
const router = require('./observability');

let server;
let base;

before(async () => {
  db.getDb();
  // seed one row in each surface
  db.logCost({ runId: 'r1', agentName: 'spark', model: 'claude-opus-4-8', inputTokens: 1000, outputTokens: 500, costUsd: 0.0525, estimated: false, source: 'test' });
  db.logPolicyAudit({ decision: 'block', agentId: 'koda', taskType: 'build', priority: 'p1', source: 'dispatch/assign', violations: [{ code: 'budget_exceeded', severity: 'block' }], context: { burnPct: 160 } });
  db.trackDelegation({ parentRunId: 'orch1', parentAgent: 'orchestration', childAgent: 'loom', childRunId: 'r2', task: 'build hero' });
  db.recordEvalScore({ caseId: 'cro-valueprop', agent: 'spark', overall: 0.91, pass: true, ts: '2026-06-14T00:00:00Z' });

  const app = express();
  app.use('/api', router);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  try { db.getDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// node:http with `agent: false` so no keep-alive socket pool is created. Global
// fetch() (undici) would pin the event loop with an idle keep-alive socket and force
// a dependency on --test-force-exit; this lets the process exit on its own.
const get = (p) => new Promise((resolve, reject) => {
  const req = http.request(base + p, { agent: false }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
    });
  });
  req.on('error', reject);
  req.end();
});

test('GET /observability/spend returns real cost', async () => {
  const spend = await get('/observability/spend');
  assert.equal(spend.realCalls, 1);
  assert.equal(spend.realCostUsd, 0.0525);
});

test('GET /observability/summary aggregates all four surfaces', async () => {
  const s = await get('/observability/summary');
  assert.ok(s.spend);
  assert.equal(s.recentBlocks.length, 1);
  assert.equal(s.recentEvalScores.length, 1);
  assert.equal(s.recentDelegations.length, 1);
});

test('GET /observability/policy-audit filters by decision', async () => {
  const pa = await get('/observability/policy-audit?decision=block');
  assert.equal(pa.items.length, 1);
  assert.equal(pa.items[0].agentId, 'koda');
});

test('GET /consolidation/report returns a valid shape', async () => {
  const r = await get('/consolidation/report?windowDays=30');
  assert.equal(typeof r.activeAgents, 'number');
  assert.ok(Array.isArray(r.overlapClusters));
  assert.equal(typeof r.dataSufficient, 'boolean');
});
