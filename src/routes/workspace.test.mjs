import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Spin the workspace router on an ephemeral port using node:http (agent:false,
// per repo doctrine — avoids fetch keep-alive leaks pinning the test process).
let server, base;
before(async () => {
  const express = require('express');
  const { router } = require('./workspace.js');
  const app = express();
  app.use('/api', router);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); });

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}${path}`, { agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(body); } catch { return null; } })() }));
    });
    req.on('error', reject);
  });
}

test('GET /workspace/builds returns scored builds + summary', async () => {
  const { status, json } = await get('/api/workspace/builds');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.builds));
  assert.ok(json.summary && typeof json.summary.avgScore === 'number');
  for (const b of json.builds) {
    assert.equal(typeof b.buildId, 'string');
    assert.ok(b.score >= 0 && b.score <= 100);
    assert.ok(b.step && b.step.total === 18);
    assert.ok(b.gates && typeof b.gates.total === 'number');
  }
});

test('GET /workspace/clients aggregates one row per client', async () => {
  const { status, json } = await get('/api/workspace/clients');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.clients));
  for (const c of json.clients) {
    assert.equal(typeof c.client, 'string');
    assert.ok(c.builds >= 1);
  }
});

test('GET /workspace/escalations flags builds below the bar', async () => {
  const { status, json } = await get('/api/workspace/escalations');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.escalations));
  for (const e of json.escalations) {
    assert.ok(Array.isArray(e.reasons) && e.reasons.length > 0);
  }
});

test('build detail + pipeline + gates resolve for a discovered build', async () => {
  const list = await get('/api/workspace/builds');
  if (!list.json.builds.length) return; // no builds on disk in this env — skip
  const id = list.json.builds[0].buildId;

  const detail = await get(`/api/workspace/builds/${id}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.json.build && detail.json.agents);
  assert.equal(detail.json.agents.correlation, 'platform'); // honest per §C1

  const pipeline = await get(`/api/workspace/builds/${id}/pipeline`);
  assert.equal(pipeline.status, 200);
  assert.equal(pipeline.json.steps.length, 18);

  const gates = await get(`/api/workspace/builds/${id}/gates`);
  assert.equal(gates.status, 200);
  assert.ok(gates.json.gates.length >= 19); // 19 canonical + any extras
});

test('unknown buildId 404s, not 500', async () => {
  const { status } = await get('/api/workspace/builds/deadbeefdead');
  assert.equal(status, 404);
});
