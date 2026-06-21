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
  app.use(express.json()); // dispatch route reads req.body (prod mounts this globally)
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

function post(path) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${base}${path}`);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(body); } catch { return null; } })() }));
    });
    req.on('error', reject);
    req.end();
  });
}

function postJson(path, obj) {
  return new Promise((resolve, reject) => {
    const u = new URL(`${base}${path}`);
    const payload = JSON.stringify(obj);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, json: (() => { try { return JSON.parse(body); } catch { return null; } })() }));
    });
    req.on('error', reject);
    req.end(payload);
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

test('P2 section routes resolve (changes/agents/schedules/results/files)', async () => {
  const list = await get('/api/workspace/builds');
  if (!list.json.builds.length) return;
  const id = list.json.builds[0].buildId;

  const changes = await get(`/api/workspace/builds/${id}/changes`);
  assert.equal(changes.status, 200);
  assert.equal(typeof changes.json.present, 'boolean');

  const agents = await get(`/api/workspace/builds/${id}/agents`);
  assert.equal(agents.status, 200);
  assert.equal(agents.json.correlation, 'platform');

  const schedules = await get(`/api/workspace/builds/${id}/schedules`);
  assert.equal(schedules.status, 200);
  assert.ok('total' in schedules.json);

  const results = await get(`/api/workspace/builds/${id}/results`);
  assert.equal(results.status, 200);
  assert.equal(typeof results.json.present, 'boolean');

  const files = await get(`/api/workspace/builds/${id}/files`);
  assert.equal(files.status, 200);
  assert.ok(Array.isArray(files.json.tree));
});

test('unknown buildId 404s, not 500', async () => {
  const { status } = await get('/api/workspace/builds/deadbeefdead');
  assert.equal(status, 404);
});

test('P3 index: listBuilds falls back to live assembly when index empty', async () => {
  const db = require('../db.js');
  // wipe the derived cache — /builds must still return real builds (live fallback)
  try { db.getDb().prepare('DELETE FROM workspace_build_index').run(); } catch { /* table may not exist in this db */ }
  const { status, json } = await get('/api/workspace/builds');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.builds)); // works whether or not any build dirs exist
});

test('P4 action: rerun-gates on unknown buildId 404s (no path injection)', async () => {
  const r = await post('/api/workspace/builds/deadbeefdead/actions/rerun-gates');
  assert.equal(r.status, 404);
});

test('P4 action: unknown runId 404s', async () => {
  const r = await get('/api/workspace/actions/nope-123');
  assert.equal(r.status, 404);
});

test('Cockpit: action registry lists safe actions + env availability', async () => {
  const { status, json } = await get('/api/workspace/actions/registry');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.actions) && json.actions.length >= 5);
  for (const a of json.actions) {
    assert.equal(a.tier, 'safe');               // P1 is safe-only
    assert.equal(typeof a.available, 'boolean');
    assert.ok(a.confirm && a.confirm.title);
  }
  // store:preflight requires env → unavailable here (no token in test env)
  const pre = json.actions.find((a) => a.id === 'store:preflight');
  assert.ok(pre && pre.available === false && pre.unavailableReason);
});

test('Cockpit: generic action with unknown id → 403 (allowlist guard)', async () => {
  const list = await get('/api/workspace/builds');
  if (!list.json.builds.length) return;
  const id = list.json.builds[0].buildId;
  const r = await post(`/api/workspace/builds/${id}/actions/evil:hack`);
  assert.equal(r.status, 403);
});

test('Cockpit: env-gated action returns blocked (not spawned) when env missing', async () => {
  const list = await get('/api/workspace/builds');
  if (!list.json.builds.length) return;
  const id = list.json.builds[0].buildId;
  const r = await post(`/api/workspace/builds/${id}/actions/store:preflight`);
  assert.equal(r.status, 202);
  assert.equal(r.json.status, 'blocked');       // never spawned
  assert.match(r.json.log, /missing env/i);
});

test('Dispatch: builds a roster agent prompt; rejects non-roster + bad input', async () => {
  const list = await get('/api/workspace/builds');
  if (!list.json.builds.length) return;
  const id = list.json.builds[0].buildId;

  const ok = await postJson(`/api/workspace/builds/${id}/dispatch`, { agent: 'loom', task: 'fix hero spacing' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.agentName, 'loom');
  assert.match(ok.json.threadId, /^wsd-/);
  assert.match(ok.json.prompt, /theme repo is at/i);
  assert.match(ok.json.prompt, /live store/i);
  assert.match(ok.json.prompt, /local theme edits only/i);

  const nonRoster = await postJson(`/api/workspace/builds/${id}/dispatch`, { agent: 'koda', task: 'x' });
  assert.equal(nonRoster.status, 403);

  const noTask = await postJson(`/api/workspace/builds/${id}/dispatch`, { agent: 'loom' });
  assert.equal(noTask.status, 400);
});

test('Projects: list merges intake rows + unlinked builds; create works', async () => {
  const list = await get('/api/workspace/projects');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.json.projects));
  assert.ok(Array.isArray(list.json.unlinkedBuilds));

  const created = await postJson('/api/workspace/projects', { name: 'WS Test Project', niche: 'test' });
  assert.equal(created.status, 201);
  assert.ok(typeof created.json.id === 'string');

  const noName = await postJson('/api/workspace/projects', { niche: 'x' });
  assert.equal(noName.status, 400);

  // CLEAN UP: don't leave the test project in the real registry (no delete API
  // yet — remove directly, mirroring the index round-trip test's hygiene).
  try { require('../db.js').getDb().prepare('DELETE FROM client_projects WHERE id = ?').run(created.json.id); } catch { /* */ }
});

test('Cockpit: design-system route returns present flag', async () => {
  const list = await get('/api/workspace/builds');
  if (!list.json.builds.length) return;
  const id = list.json.builds[0].buildId;
  const r = await get(`/api/workspace/builds/${id}/design-system`);
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.present, 'boolean');
});

test('P3 index: replace + read round-trips, prunes vanished builds', async () => {
  const db = require('../db.js');
  if (!db.replaceWorkspaceIndex) return; // older db w/o migration
  const now = Date.now();
  const fake = (id) => ({ buildId: `wstest-${id}`, dir: `/tmp/wstest-${id}`, client: id, platform: 'shopify',
    step: { current: 3 }, score: 42, grade: 'BLOCK-RISK', lensVerdict: null,
    gates: { blockersOpen: 0 }, capturedAt: now });
  try {
    db.replaceWorkspaceIndex([fake('a'), fake('b')], now);
    assert.equal(db.getWorkspaceIndex().filter((b) => b.buildId.startsWith('wstest-')).length, 2);
    // replacing with only 'a' must prune 'b'
    db.replaceWorkspaceIndex([fake('a')], now);
    const ids = db.getWorkspaceIndex().map((b) => b.buildId);
    assert.ok(ids.includes('wstest-a') && !ids.includes('wstest-b'));
    assert.ok(db.workspaceIndexAgeMs(now + 1000) >= 1000);
  } finally {
    // CLEAN UP: derived cache must not leak fake builds into other tests / the
    // running app. Remove our rows directly (don't rebuild — keep it hermetic).
    try {
      const conn = db.getDb();
      for (const id of ['wstest-a', 'wstest-b']) conn.prepare('DELETE FROM workspace_build_index WHERE buildId = ?').run(id);
    } catch { /* */ }
  }
});
