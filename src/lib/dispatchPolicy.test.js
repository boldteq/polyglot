'use strict';

// Pillar 5 dispatch policy gate — pure. Node 20 `node:test`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDispatch } = require('./dispatchPolicy');

test('clean dispatch is allowed with no violations', () => {
  const g = evaluateDispatch({ agentId: 'spark', status: 'active', rawSkill: 0.9, budget: { burnPct: 40 } });
  assert.equal(g.allow, true);
  assert.equal(g.violations.length, 0);
});

test('inactive agent is blocked', () => {
  const g = evaluateDispatch({ agentId: 'x', status: 'probation', rawSkill: 0.9 });
  assert.equal(g.blocked, true);
  assert.equal(g.violations[0].code, 'inactive_agent');
});

test('capability gap warns by default, blocks when configured', () => {
  const warn = evaluateDispatch({ agentId: 'x', status: 'active', rawSkill: 0.05 });
  assert.equal(warn.allow, true);
  assert.ok(warn.violations.some((v) => v.code === 'capability_gap' && v.severity === 'warn'));

  const block = evaluateDispatch({ agentId: 'x', status: 'active', rawSkill: 0.05 }, { capabilityBlock: true });
  assert.equal(block.blocked, true);
  assert.ok(block.violations.some((v) => v.code === 'capability_gap' && v.severity === 'block'));
});

test('budget hard cap blocks non-exempt, allows exempt', () => {
  const blocked = evaluateDispatch({ agentId: 'x', status: 'active', rawSkill: 0.9, budget: { burnPct: 160, exemptTask: false } });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.violations.some((v) => v.code === 'budget_exceeded'));

  const exempt = evaluateDispatch({ agentId: 'x', status: 'active', rawSkill: 0.9, budget: { burnPct: 160, exemptTask: true } });
  assert.equal(exempt.allow, true);
});

test('model routing: block-mode blocks, advisory warns', () => {
  const block = evaluateDispatch({ agentId: 'koda', status: 'active', rawSkill: 0.9, modelViolation: { expected: 'sonnet', actual: 'opus', tier: 'fast', mode: 'block' } });
  assert.equal(block.blocked, true);

  const advisory = evaluateDispatch({ agentId: 'koda', status: 'active', rawSkill: 0.9, modelViolation: { expected: 'sonnet', actual: 'opus', tier: 'fast', mode: 'advisory' } });
  assert.equal(advisory.allow, true);
  assert.ok(advisory.violations.some((v) => v.code === 'model_routing' && v.severity === 'warn'));
});

test('audit mode never blocks but still records violations', () => {
  const g = evaluateDispatch({ agentId: 'x', status: 'probation', rawSkill: 0.01, budget: { burnPct: 200 } }, { mode: 'audit' });
  assert.equal(g.allow, true);
  assert.equal(g.mode, 'audit');
  assert.ok(g.violations.length >= 2);
});

test('capability floor uses absolute rawSkill (not normalized)', () => {
  // rawSkill below the 0.15 default floor → gap surfaced even though a normalized top-pick is 1.0
  const g = evaluateDispatch({ agentId: 'x', status: 'active', rawSkill: 0.1, skillScore: 1.0 });
  assert.ok(g.violations.some((v) => v.code === 'capability_gap'));
});
