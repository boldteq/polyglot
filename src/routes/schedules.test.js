'use strict';

// Scheduler tick-lifecycle regression tests. The unit under test is the real
// prepareTick → runTickBody → finish() path + the inflightJobs map, exercised
// over real HTTP against an isolated temp DB. No real `claude` spawn — the LLM
// + agent-file layer is stubbed BEFORE schedules.js destructures it.
//
// PRIMARY GUARD: the P0 where finish() referenced an out-of-scope `schedule`,
// threw ReferenceError every tick, and left every schedule wedged "running"
// forever (each ran exactly once, then bricked). See schedules.js A1.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-sched-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

// Stub the LLM + agent-file layer on the cached module object before
// schedules.js requires + destructures it (CommonJS shares the exports object).
// NOTE: schedules.js destructures these at load → it captures THESE references.
// So the stubs must be STABLE wrappers that delegate to mutable behavior, which
// each test flips, rather than functions we reassign after load (a reassign
// wouldn't reach schedules.js's already-captured reference).
const runClaude = require('./../lib/runClaude');
let llmBehavior = async () => ({ text: 'ok', usage: null });
let agentExists = true;
runClaude.runClaudeSync = (...a) => llmBehavior(...a);
runClaude.buildAgentPrompt = () => 'PROMPT';
runClaude.validateAgentExists = () => agentExists;

const express = require('express');
const db = require('./../db');
const { router } = require('./schedules');

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

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(base + p);
    const r = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: { 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function waitFor(fn, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

function seed(id) {
  const now = new Date().toISOString();
  db.insertSchedule({ id, name: `sched-${id}`, agentName: 'tester', prompt: 'do a thing', cron: '0 9 * * *', enabled: 1, createdAt: now, updatedAt: now, lastRunAt: null, lastRunStatus: null });
}

test('A1: a tick completes, clears inflight, and can run again (not wedged "running")', async () => {
  const id = 'sched-a1';
  seed(id);

  const r1 = await req('POST', `/schedules/${id}/run-now`, {});
  assert.equal(r1.status, 202);
  assert.equal(r1.json.status, 'started');

  // THE A1 PROOF: with the bug, finish() throws before inflightJobs.delete, so
  // this never clears and the row is pinned "running" forever.
  const cleared = await waitFor(async () => {
    const inf = await req('GET', '/schedules/inflight');
    return !inf.json.inflight.some((x) => x.id === id);
  });
  assert.ok(cleared, 'inflight never cleared — schedule wedged "running" (P0 regression)');

  const runs = await req('GET', `/schedules/${id}/runs`);
  assert.equal(runs.json.runs[0].status, 'success', 'run row should be recorded success');

  const r2 = await req('POST', `/schedules/${id}/run-now`, {});
  assert.equal(r2.status, 202, 'second run-now blocked — inflight leaked');
});

test('A4: schedule:complete records the finish time as lastRunStatus=success', async () => {
  const id = 'sched-a4';
  seed(id);
  const r1 = await req('POST', `/schedules/${id}/run-now`, {});
  assert.equal(r1.status, 202);
  const ok = await waitFor(async () => {
    const list = await req('GET', '/schedules');
    const row = list.json.find((s) => s.id === id);
    return row && row.lastRunStatus === 'success' && row.lastRunAt;
  });
  assert.ok(ok, 'schedule row should reflect a completed success run with a lastRunAt');
});

test('A3: a schedule whose agent is missing auto-pauses instead of failing forever', async () => {
  const id = 'sched-a3';
  seed(id);
  // Flip the stub behavior to "agent missing" for this run only.
  llmBehavior = async () => { throw new Error("Agent 'tester' not found"); };
  agentExists = false;
  try {
    const r1 = await req('POST', `/schedules/${id}/run-now`, {});
    assert.equal(r1.status, 202);
    const paused = await waitFor(async () => {
      const list = await req('GET', '/schedules');
      const row = list.json.find((s) => s.id === id);
      return row && row.enabled === false;
    });
    assert.ok(paused, 'missing-agent schedule should auto-pause');
  } finally {
    llmBehavior = async () => ({ text: 'ok', usage: null });
    agentExists = true;
  }
});
