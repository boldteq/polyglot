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

test('GET /observability/trace/:runId assembles the nested tree + totals', async () => {
  // Seed a parent run that delegated to a child run (the `before` block already
  // added the orch1→r2 delegation + r1 cost); add the run rows + child cost.
  db.insertAgentRun({ id: 'orch1', agentName: 'orchestration', prompt: 'build', source: 'orchestration', timestamp: '2026-06-27T00:00:00Z', duration: 5000, status: 'success', promptChars: 5, outputChars: 10, estimatedTokens: 0, estimatedCost: 0, error: null, metadata: {} });
  db.insertAgentRun({ id: 'r2', agentName: 'loom', prompt: 'hero', source: 'orchestration', timestamp: '2026-06-27T00:00:01Z', duration: 2000, status: 'success', promptChars: 4, outputChars: 8, estimatedTokens: 0, estimatedCost: 0, error: null, metadata: {} });
  db.logCost({ runId: 'r2', agentName: 'loom', model: 'claude-sonnet-4-6', inputTokens: 200, outputTokens: 100, costUsd: 0.01, estimated: false, source: 'test' });

  const t = await get('/observability/trace/orch1');
  assert.equal(t.tree.runId, 'orch1');
  assert.equal(t.tree.agentName, 'orchestration');
  assert.equal(t.tree.children.length, 1);
  assert.equal(t.tree.children[0].runId, 'r2');
  assert.equal(t.tree.children[0].agentName, 'loom');
  assert.equal(t.tree.children[0].costUsd, 0.01);
  assert.equal(t.totals.nodeCount, 2);
  assert.ok(t.totals.spanMs >= 0);
});

test('GET /observability/trace/:runId does not double-count a shared child (diamond)', async () => {
  // Two delegation edges from orch1 → the same childRunId r2 (fan-in). r2 must be
  // counted once and appear once, not duplicated as a synthetic 'delegated' leaf.
  db.trackDelegation({ parentRunId: 'orch1', parentAgent: 'orchestration', childAgent: 'loom', childRunId: 'r2', task: 'build hero again' });
  const t = await get('/observability/trace/orch1');
  assert.equal(t.tree.children.length, 1);        // r2 appears once
  assert.equal(t.totals.nodeCount, 2);            // orch1 + r2, not 3
});

test('GET /observability/trace/:runId returns null tree for an unknown run', async () => {
  const t = await get('/observability/trace/does-not-exist');
  assert.equal(t.tree, null);
  assert.equal(t.totals.nodeCount, 0);
});

test('GET /consolidation/report returns a valid shape', async () => {
  const r = await get('/consolidation/report?windowDays=30');
  assert.equal(typeof r.activeAgents, 'number');
  assert.ok(Array.isArray(r.overlapClusters));
  assert.equal(typeof r.dataSufficient, 'boolean');
});
