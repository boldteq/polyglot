import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);

// Hermetic: a throwaway DB so we can stamp cost_logs.buildId and assert the
// per-build attribution landed (db v37). No real build dirs needed.
let tmp, db, pf, activity;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-s5-'));
  process.env.POLYGLOT_DB_PATH = path.join(tmp, 't.db');
  db = require('../../db');
  pf = require('./projectFilter.js');
  activity = require('./projectActivity.js');
  // build A: two cockpit dispatches (stamped) + one sub-$0.005 noise row
  db.logCost({ runId: 'a1', agentName: 'loom', costUsd: 0.12, buildId: 'buildA' });
  db.logCost({ runId: 'a2', agentName: 'onyx', costUsd: 0.34, buildId: 'buildA' });
  db.logCost({ runId: 'a3', agentName: 'loom', costUsd: 0.0001, buildId: 'buildA' }); // noise
  // build B: one dispatch
  db.logCost({ runId: 'b1', agentName: 'loom', costUsd: 0.99, buildId: 'buildB' });
  // platform noise with no buildId (cron/HR)
  db.logCost({ runId: 'x1', agentName: 'loom', costUsd: 0.05 });
});
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } });

test('getCostLogs({buildId}) scopes to exactly that build', () => {
  const a = db.getCostLogs({ buildId: 'buildA' });
  assert.equal(a.length, 3, 'all three buildA rows (incl noise) returned by raw query');
  const b = db.getCostLogs({ buildId: 'buildB' });
  assert.equal(b.length, 1);
});

test('buildScopedAgentActivity aggregates per-agent for one build', () => {
  const r = pf.buildScopedAgentActivity('buildA');
  assert.equal(r.runs, 3);
  assert.equal(r.costUsd, 0.4601);
  // sorted by runs desc; both agents present
  assert.deepEqual(r.byAgent.map((x) => x.agentName).sort(), ['loom', 'onyx']);
});

test('buildAgentActivity returns correlation:build when stamped dispatches exist', () => {
  const r = pf.buildAgentActivity('shopify', '/x', 7, 'buildA');
  assert.equal(r.correlation, 'build');
  assert.equal(r.note, null);
  assert.equal(r.runs, 3);
});

test('buildAgentActivity falls back to correlation:platform for an un-dispatched build', () => {
  const r = pf.buildAgentActivity('shopify', '/x', 7, 'buildNONE');
  assert.equal(r.correlation, 'platform');
  assert.ok(r.note && r.note.includes('platform-level'));
});

test('projectActivity surfaces a per-build spend total (noise < $0.005 excluded)', () => {
  const out = activity.buildProjectActivity({ build: { client: 'c', buildId: 'buildA' }, dir: tmp, buildId: 'buildA', limit: 50 });
  assert.ok(out.spend, 'spend summary present');
  assert.equal(out.spend.runs, 2, 'only the two ≥$0.005 dispatches counted');
  assert.equal(out.spend.totalCostUsd, 0.46);
  // cost events in the timeline are this build's, not platform noise
  const costEvents = out.events.filter((e) => e.kind === 'cost');
  assert.equal(costEvents.length, 2);
});

test('projectActivity spend is zero for a build with no dispatches', () => {
  const out = activity.buildProjectActivity({ build: { client: 'c', buildId: 'buildNONE' }, dir: tmp, buildId: 'buildNONE', limit: 50 });
  assert.equal(out.spend.runs, 0);
  assert.equal(out.spend.totalCostUsd, 0);
});
