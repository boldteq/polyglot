'use strict';

// Batch-1 guards: (1) promoteAgent is idempotent within a cooldown — a duplicate
// cadence run can't double-apply the YoE bonus / level bump; (2) the redundant
// sys-mira-results schedule is removed (sys-mira kept). Isolated temp HOME + DB.

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-cadence-'));
process.env.HOME = path.join(TMP, 'home');
process.env.USERPROFILE = process.env.HOME;
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'polyglot.db');
fs.mkdirSync(path.join(process.env.HOME, '.claude', 'agents'), { recursive: true });
fs.mkdirSync(path.join(process.env.HOME, '.claude', 'org'), { recursive: true });

const hr = require('./hr');
const ss = require('./lib/systemSchedules');
const db = require('./db');
db.getDb();

test('promoteAgent is idempotent within the cooldown (no double promote)', () => {
  const experienceModule = {
    LEVEL_THRESHOLDS: {
      1: { title: 'L1', color: '#111', canMentor: false, canShipProd: false, minYoE: 1 },
      2: { title: 'L2', color: '#222', canMentor: true, canShipProd: true, minYoE: 2 },
    },
  };
  let record = { id: 'a', level: 0, yearsOfExperience: 0, status: 'active' };
  const org = {
    findAgent: () => record,
    upsertAgent: (_id, fields) => { record = { ...record, ...fields }; return record; },
  };

  const r1 = hr.promoteAgent(org, experienceModule, 'a');
  assert.equal(r1.ok, true, 'first promote succeeds');
  assert.equal(record.level, 1, 'level bumped to 1');
  assert.ok(record.lastPromoted, 'lastPromoted stamped');

  const r2 = hr.promoteAgent(org, experienceModule, 'a');
  assert.equal(r2.ok, false, 'second promote within cooldown is refused');
  assert.equal(r2.skipped, true, 'and marked skipped');
  assert.equal(record.level, 1, 'level NOT double-bumped');
});

test('sys-mira-results removed; sys-mira kept', () => {
  const ids = ss.getAllForApi().map((s) => s.id);
  assert.equal(ids.includes('sys-mira-results'), false, 'redundant results schedule removed');
  assert.equal(ids.includes('sys-mira'), true, 'build-success lesson extraction kept');
});
