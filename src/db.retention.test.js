'use strict';

// Bucket-1 retention safety tests. The critical invariant: pruning must NEVER
// delete an in-flight ('running') run, and stale-reconcile must flip ONLY runs
// that have been running longer than the age bound. Isolated temp DB.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-retention-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');
const db = require('./db');

before(() => { db.getDb(); });
after(() => {
  try { db.getDb().close(); } catch { /* already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const isoMin = (minAgo) => new Date(Date.now() - minAgo * 60_000).toISOString();

function seedRun(id, status, ts) {
  db.getDb().prepare('INSERT INTO agent_runs (id,agentName,prompt,source,timestamp,status) VALUES (?,?,?,?,?,?)')
    .run(id, 'tester', 'p', 'schedule', ts, status);
}

const has = (id) => !!db.getDb().prepare('SELECT 1 FROM agent_runs WHERE id=?').get(id);
const statusOf = (id) => (db.getDb().prepare('SELECT status FROM agent_runs WHERE id=?').get(id) || {}).status;

test('pruneAgentRuns removes old finished rows but keeps recent + ALL running', () => {
  seedRun('old-success', 'success', iso(200));
  seedRun('recent-success', 'success', iso(10));
  seedRun('old-running', 'running', iso(200)); // MUST survive — never delete a running row
  db.pruneAgentRuns({ daysOld: 180 });
  assert.equal(has('old-success'), false, 'old finished row should be pruned');
  assert.equal(has('recent-success'), true, 'recent row kept');
  assert.equal(has('old-running'), true, 'running row kept even though old');
});

test('reconcileStaleRuns flips only runs running longer than maxAgeMin', () => {
  seedRun('fresh-running', 'running', isoMin(5)); // < 30 min — must stay running
  db.reconcileStaleRuns({ maxAgeMin: 30 });
  assert.equal(statusOf('fresh-running'), 'running', 'fresh run stays running');
  assert.equal(statusOf('old-running'), 'crashed', 'old running run reconciled to crashed');
});

test('pruneCostLogs / pruneAgentEvents / pruneDelegations remove old, keep recent', () => {
  const d = db.getDb();
  d.prepare('INSERT INTO cost_logs (runId,agentName,ts,costUsd,totalTokens,estimated) VALUES (?,?,?,?,?,?)').run('r1', 'a', iso(100), 1, 10, 0);
  d.prepare('INSERT INTO cost_logs (runId,agentName,ts,costUsd,totalTokens,estimated) VALUES (?,?,?,?,?,?)').run('r2', 'a', iso(5), 2, 20, 0);
  assert.equal(db.pruneCostLogs({ daysOld: 90 }).removed, 1);

  d.prepare('INSERT INTO agent_events (runId,ts,type,data) VALUES (?,?,?,?)').run('r1', iso(60), 'note', '{}');
  d.prepare('INSERT INTO agent_events (runId,ts,type,data) VALUES (?,?,?,?)').run('r2', iso(5), 'note', '{}');
  assert.equal(db.pruneAgentEvents({ daysOld: 30 }).removed, 1);

  d.prepare('INSERT INTO delegations (ts,childAgent) VALUES (?,?)').run(iso(100), 'b');
  d.prepare('INSERT INTO delegations (ts,childAgent) VALUES (?,?)').run(iso(5), 'b');
  assert.equal(db.pruneDelegations({ daysOld: 90 }).removed, 1);
});

test('getSpendByAgent groups + ranks by cost', () => {
  const rows = db.getSpendByAgent({ since: iso(7), limit: 5 });
  assert.ok(rows.length >= 1, 'at least one agent');
  assert.equal(rows[0].agentName, 'a');
  assert.equal(rows[0].costUsd, 2); // r1 (cost 1, 100d) was pruned; only r2 (cost 2) remains
});
