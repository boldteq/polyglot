'use strict';

// AI Assistant background-run resilience — registry + reattach endpoints
// end-to-end over real HTTP, isolated temp DB. Proves an AI chat generation
// survives client disconnect: a run injected into the registry is discoverable
// via /ai/active, its buffered output replays on /ai/run/:id/stream, live
// broadcasts reach an attached viewer, an explicit /cancel force-stops it, and
// markDone evicts after the grace window. No real `claude` spawn — the registry
// IS the unit under test. Mirrors playground.reattach.test.js (s/threadId/
// sessionId/, AI-namespaced routes).

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-ai-reattach-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

const express = require('express');
const db = require('./../db');
const registry = require('./../lib/aiRuns');
const router = require('./ai');

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

// --- helpers -----------------------------------------------------------------

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get(base + p, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d || '{}') }); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function postJson(p, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload || {});
    const req = http.request(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d || '{}') }); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

// Open an SSE reattach stream and collect parsed events. Returns { req, events,
// done } where `done` resolves when the server ends the stream.
function openStream(runId) {
  const events = [];
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const req = http.get(base + `/ai/run/${runId}/stream`, (res) => {
    let buf = '';
    res.on('data', (c) => {
      buf += c.toString();
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      for (const line of parts) {
        const t = line.trim();
        if (t.startsWith('data: ')) { try { events.push(JSON.parse(t.slice(6))); } catch { /* ignore */ } }
      }
    });
    res.on('end', () => resolveDone());
  });
  return { req, events, done };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- tests -------------------------------------------------------------------

test('registry: createRun is discoverable by session; markDone clears active', () => {
  const run = registry.createRun({ id: 'a1', sessionId: 's1', output: '' });
  assert.equal(registry.getActiveBySession('s1').id, 'a1');
  assert.equal(registry.getRun('a1').status, 'running');
  registry.broadcast(run, { type: 'chunk', content: 'hello ' });
  registry.broadcast(run, { type: 'chunk', content: 'world' });
  assert.equal(run.output, 'hello world'); // chunks buffer for replay
  registry.markDone(run);
  assert.equal(registry.getActiveBySession('s1'), null); // no longer "active"
  assert.equal(registry.getRun('a1').status, 'done');    // still present in grace window
});

test('/ai/active reports a running run with its buffered output', async () => {
  const run = registry.createRun({ id: 'a2', sessionId: 's2', output: '' });
  registry.broadcast(run, { type: 'chunk', content: '1 2 3' });
  const { status, body } = await getJson('/ai/active?sessionId=s2');
  assert.equal(status, 200);
  assert.equal(body.active, true);
  assert.equal(body.runId, 'a2');
  assert.equal(body.output, '1 2 3');
  registry.markDone(run);
  const after = await getJson('/ai/active?sessionId=s2');
  assert.equal(after.body.active, false); // done → not active
});

test('/ai/active false for unknown session', async () => {
  const { body } = await getJson('/ai/active?sessionId=does-not-exist');
  assert.equal(body.active, false);
});

test('reattach: replays buffered output, then streams live, then terminal on done', async () => {
  const run = registry.createRun({ id: 'a3', sessionId: 's3', output: '' });
  registry.broadcast(run, { type: 'chunk', content: 'PARTIAL-' }); // generated before reattach

  const s = openStream('a3');
  await wait(150); // let the stream connect + replay

  // After connect we should have: a start (reattach) + a replay chunk of the buffer.
  const start = s.events.find((e) => e.type === 'start');
  assert.ok(start && start.reattach === true, 'start event with reattach flag');
  const replay = s.events.find((e) => e.type === 'chunk');
  assert.equal(replay.content, 'PARTIAL-', 'replays buffered output');

  // Now broadcast a LIVE chunk — the attached viewer must receive it.
  registry.broadcast(run, { type: 'chunk', content: 'LIVE' });
  await wait(100);
  const liveChunks = s.events.filter((e) => e.type === 'chunk').map((e) => e.content);
  assert.ok(liveChunks.includes('LIVE'), 'live chunk reached the reattached viewer');

  // Finish the run — viewer gets the terminal event + the stream ends.
  registry.broadcast(run, { type: 'done', content: 'PARTIAL-LIVE' });
  registry.markDone(run);
  await s.done;
  assert.ok(s.events.some((e) => e.type === 'done'), 'terminal done delivered');
});

test('reattach to an already-finished run replays output + sends stored finalEvent', async () => {
  const run = registry.createRun({ id: 'a4', sessionId: 's4', output: '' });
  registry.broadcast(run, { type: 'chunk', content: 'ANSWER' });
  registry.broadcast(run, { type: 'done', content: 'ANSWER' }); // records finalEvent
  registry.markDone(run); // finished, still in grace window

  const s = openStream('a4');
  await s.done; // finished runs close immediately
  assert.equal(s.events.find((e) => e.type === 'chunk').content, 'ANSWER');
  assert.ok(s.events.some((e) => e.type === 'done'), 'stored finalEvent replayed');
});

test('reattach to unknown run tells the client to fall back', async () => {
  const s = openStream('never-existed');
  await s.done;
  const err = s.events.find((e) => e.type === 'error');
  assert.equal(err.code, 'run_not_found');
});

test('/ai/run/:id/cancel force-stops a running run via its kill hook', async () => {
  let killReason = null;
  const run = registry.createRun({ id: 'a5', sessionId: 's5', output: '' });
  run.kill = (reason) => { killReason = reason; registry.markDone(run); };
  const { status, body } = await postJson('/ai/run/a5/cancel', {});
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(killReason, 'user_cancel');
  assert.equal(registry.getActiveBySession('s5'), null);
});

test('/ai/run/:id/cancel on an unknown/finished run is a no-op success', async () => {
  const { status, body } = await postJson('/ai/run/nope/cancel', {});
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.alreadyDone, true);
});
