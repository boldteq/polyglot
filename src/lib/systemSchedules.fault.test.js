'use strict';

// Batch-2: recordFault surfaces handler-internal failures instead of swallowing
// them — logs to error_log, collects into the run's faults[], and (only for
// critical/loop-breaking faults) stages a 'system-fault' Learning-Inbox candidate.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sched-fault-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'polyglot.db');

const ss = require('./systemSchedules');
const db = require('../db');
db.getDb();

test('recordFault logs to error_log, collects faults[], and stages ONLY critical faults', () => {
  const faults = [];

  // critical fault → error_log + faults[] + inbox candidate
  ss.recordFault(faults, 'sys-test', 'demo-step', new Error('boom'), { critical: true });
  assert.equal(faults.length, 1);
  assert.equal(faults[0].where, 'demo-step');
  assert.match(faults[0].message, /boom/);

  const errCount = db.getDb()
    .prepare("SELECT COUNT(*) n FROM error_log WHERE message LIKE '%sys-test/demo-step%'")
    .get().n;
  assert.ok(errCount >= 1, 'fault written to error_log');

  let staged = db.listLearningInbox({ status: 'pending' }).filter((c) => c.type === 'system-fault');
  assert.equal(staged.length, 1, 'critical fault staged a system-fault candidate');

  // non-critical fault → logged + collected, but NOT staged to the inbox
  ss.recordFault(faults, 'sys-test', 'minor-step', new Error('meh'));
  assert.equal(faults.length, 2);
  staged = db.listLearningInbox({ status: 'pending' }).filter((c) => c.type === 'system-fault');
  assert.equal(staged.length, 1, 'non-critical fault does NOT stage an inbox candidate');
});
