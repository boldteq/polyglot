'use strict';

// Pillar 1/5 db writers/readers against an ISOLATED temp DB. node:test runs each
// file in its own process, so setting POLYGLOT_DB_PATH here doesn't leak.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'polyglot-obs-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'test.db');

const db = require('./db');

before(() => { db.getDb(); }); // run migrations v1..v23 on the temp DB

test('cost_logs: real-vs-estimated spend roll-up', () => {
  db.logCost({ runId: 'r1', agentName: 'spark', model: 'claude-opus-4-8', inputTokens: 1200, outputTokens: 800, costUsd: 0.078, estimated: false, source: 'test' });
  db.logCost({ runId: 'r2', agentName: 'spark', model: 'claude-sonnet-4-6', inputTokens: 500, outputTokens: 300, estimated: true, source: 'test' });
  const spend = db.getSpend();
  assert.equal(spend.calls, 2);
  assert.equal(spend.realCalls, 1);
  assert.equal(spend.realCostUsd, 0.078);
});

test('agent_events + delegation auto-event', () => {
  db.logAgentEvent('r1', 'gate', { gate: 'conversion', pass: true });
  db.trackDelegation({ parentRunId: 'r1', parentAgent: 'atrium', childAgent: 'loom', childRunId: 'r2', task: 'build hero' });
  const events = db.getAgentEvents('r1').map((e) => e.type);
  assert.ok(events.includes('gate'));
  assert.ok(events.includes('delegation')); // trackDelegation emits an event
  const dels = db.getDelegations({ parentRunId: 'r1' });
  assert.equal(dels.length, 1);
  assert.equal(dels[0].childAgent, 'loom');
});

test('eval_scores: record + dedupe + read', () => {
  const first = db.recordEvalScore({ caseId: 'cro-valueprop', agent: 'spark', overall: 0.91, pass: true, scores: { correctness: 0.9 }, ts: '2026-06-14T00:00:00Z' });
  const dupe = db.recordEvalScore({ caseId: 'cro-valueprop', agent: 'spark', overall: 0.91, pass: true, ts: '2026-06-14T00:00:00Z' });
  assert.equal(first, true);
  assert.equal(dupe, false); // same dedupKey ignored
  const rows = db.getEvalScores({ agent: 'spark' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].overall, 0.91);
  assert.equal(rows[0].pass, true);
});

test('policy_audit: write + decision filter + JSON round-trip', () => {
  db.logPolicyAudit({ decision: 'allow', agentId: 'spark', taskType: 'design', priority: 'p2', source: 'dispatch/assign', violations: [], context: { rawSkill: 0.9 } });
  db.logPolicyAudit({ decision: 'block', agentId: 'koda', taskType: 'build', priority: 'p1', source: 'dispatch/assign', violations: [{ code: 'budget_exceeded', severity: 'block' }], context: { burnPct: 160 } });
  const blocks = db.getPolicyAudit({ decision: 'block' });
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].agentId, 'koda');
  assert.equal(blocks[0].violations[0].code, 'budget_exceeded');
  assert.equal(blocks[0].context.burnPct, 160);
});

test('getModelRoutingViolation detects tier mismatch, null when correct', () => {
  db.saveModelRouting({ enforcementMode: 'block', tiers: {
    fast: { shortName: 'sonnet', model: 'claude-sonnet-4-6', agents: ['koda'] },
    deep: { shortName: 'opus', model: 'claude-opus-4-8', agents: ['arya'] },
  } });
  const v = db.getModelRoutingViolation('koda', 'claude-opus-4-8');
  assert.ok(v && v.expected === 'sonnet' && v.actual === 'opus' && v.mode === 'block');
  assert.equal(db.getModelRoutingViolation('koda', 'claude-sonnet-4-6'), null);
  assert.equal(db.getModelRoutingViolation('nobody', 'opus'), null);
});
