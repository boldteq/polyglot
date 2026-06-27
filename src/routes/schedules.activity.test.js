'use strict';

// Batch-1 backend: the global activity feed (db.getScheduleActivity) filters to
// schedule/system runs only with status/kind/scheduleId filters + pagination, and
// cronUtil.computeNextRuns returns N ascending future fire times.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-activity-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'polyglot.db');
const db = require('./../db');
db.getDb();
const { computeNextRuns } = require('./../lib/cronUtil');

const iso = (minAgo) => new Date(Date.now() - minAgo * 60_000).toISOString();
function seedRun(id, source, status, ts, meta) {
  db.getDb().prepare('INSERT INTO agent_runs (id,agentName,prompt,source,timestamp,status,metadata) VALUES (?,?,?,?,?,?,?)')
    .run(id, 'tester', 'p', source, ts, status, JSON.stringify(meta || {}));
}

test('computeNextRuns returns N ascending future ISO times (and [] on bad input)', () => {
  const r = computeNextRuns('0 9 * * *', 4);
  assert.equal(r.length, 4);
  for (let i = 1; i < r.length; i++) assert.ok(r[i] > r[i - 1], 'ascending');
  assert.ok(r[0] > new Date().toISOString(), 'first is in the future');
  assert.deepEqual(computeNextRuns(null), []);
  assert.deepEqual(computeNextRuns('not a cron'), []);
});

test('getScheduleActivity returns only schedule runs, with filters + pagination', () => {
  seedRun('u1', 'schedule', 'success', iso(5), { scheduleId: 'sched-A' });
  seedRun('u2', 'schedule', 'error', iso(4), { scheduleId: 'sched-A' });
  seedRun('s1', 'system-schedule', 'success', iso(3), { systemId: 'sys-witness' });
  seedRun('x1', 'playground', 'success', iso(2), {}); // must be excluded

  const all = db.getScheduleActivity({ limit: 50 });
  assert.ok(all.runs.every((r) => r.source !== 'playground'), 'excludes non-schedule sources');
  assert.ok(all.total >= 3);

  assert.ok(db.getScheduleActivity({ status: 'error' }).runs.every((r) => r.status === 'error'));
  assert.ok(db.getScheduleActivity({ kind: 'user' }).runs.every((r) => r.source === 'schedule'));
  assert.ok(db.getScheduleActivity({ kind: 'system' }).runs.every((r) => r.source === 'system-schedule'));

  const bySched = db.getScheduleActivity({ scheduleId: 'sched-A' });
  assert.ok(bySched.runs.length >= 2 && bySched.runs.every((r) => r.metadata.scheduleId === 'sched-A'));

  const page = db.getScheduleActivity({ limit: 1, offset: 0 });
  assert.equal(page.runs.length, 1, 'limit applied');
  assert.ok(page.total >= 3, 'total ignores limit (for pagination)');

  // F12: stats span the scope regardless of status filter
  assert.ok(page.stats && page.stats.total >= 3 && page.stats.failed >= 1, 'stats returned');
});

test('getScheduleActivity q searches agent/error text server-side', () => {
  db.getDb().prepare('INSERT INTO agent_runs (id,agentName,prompt,source,timestamp,status,error,metadata) VALUES (?,?,?,?,?,?,?,?)')
    .run('q1', 'tester', 'p', 'schedule', iso(1), 'error', 'unique-timeout-xyz', '{}');
  const hit = db.getScheduleActivity({ q: 'unique-timeout-xyz' });
  assert.ok(hit.runs.length >= 1 && hit.runs.every((r) => (r.error || '').includes('unique-timeout-xyz')));
  assert.equal(db.getScheduleActivity({ q: 'no-such-text-zzz' }).runs.length, 0);
});
