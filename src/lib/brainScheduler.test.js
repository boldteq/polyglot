'use strict';

// Structural regression guard for the brain's scheduled nerves (FIX #2/#4/#8).
// The handler BODIES are exercised end-to-end by scripts/brain-proof.mjs; this guard
// instead pins the SCHEDULE itself — the ordering + presence that the body fixes
// silently depend on:
//   • #8 — sys-intel-eval must fire BEFORE sys-tutor on Sunday, or tutor's autos run
//     against a stale calibration read.
//   • #2 — sys-witness (classify + eval-drop) must precede sys-brain-aggregate, or the
//     cross-project aggregator generalizes over un-classified runs.
//   • #4 — sys-brain-aggregate must exist with a daily cron (its boot catch-up relies
//     on the definition being present + overdue-checkable).
// A renamed handler or a reordered cron flips a check here instead of silently
// breaking the loop in production.

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brainsched-'));
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'probe.db');

const test = require('node:test');
const assert = require('node:assert/strict');
const sched = require('./systemSchedules');

// "min hour dom mon dow" → a comparable weekly ordinal (Sun=0 … Sat=6).
function cronOrdinal(expr) {
  const [min, hour, , , dow] = expr.trim().split(/\s+/);
  const d = dow === '*' ? 0 : Number(dow);
  return ((d * 24) + Number(hour)) * 60 + Number(min);
}
function defById(id) {
  return sched.getDefinitions().find((d) => d.id === id);
}

test('all four brain handlers are registered', () => {
  const byHandler = new Set(sched.getDefinitions().map((d) => d.handler));
  for (const h of ['witnessSweep', 'brainAggregate', 'tutorTraining', 'intelEval']) {
    assert.ok(byHandler.has(h), `handler "${h}" must be registered`);
  }
  assert.equal(typeof sched.runHandler, 'function', 'runHandler is the dispatch entry point');
});

test('#8 — sys-intel-eval fires before sys-tutor (calibration is fresh for autos)', () => {
  const evalDef = defById('sys-intel-eval');
  const tutorDef = defById('sys-tutor');
  assert.ok(evalDef && tutorDef, 'both definitions exist');
  assert.equal(evalDef.handler, 'intelEval');
  assert.equal(tutorDef.handler, 'tutorTraining');
  assert.ok(
    cronOrdinal(evalDef.cron) < cronOrdinal(tutorDef.cron),
    `intel-eval (${evalDef.cron}) must precede tutor (${tutorDef.cron})`
  );
});

test('#2 — sys-witness precedes sys-brain-aggregate (aggregate sees classified runs)', () => {
  const witness = defById('sys-witness');
  const aggregate = defById('sys-brain-aggregate');
  assert.ok(witness && aggregate, 'both definitions exist');
  assert.ok(
    cronOrdinal(witness.cron) < cronOrdinal(aggregate.cron),
    `witness (${witness.cron}) must precede aggregate (${aggregate.cron})`
  );
});

test('#4 — sys-brain-aggregate has a daily cron and a callable overdue-check', () => {
  const aggregate = defById('sys-brain-aggregate');
  assert.ok(aggregate, 'sys-brain-aggregate is registered');
  assert.match(aggregate.cron, /^\d+\s+\d+\s+\*\s+\*\s+\*$/, 'a plain daily cron (no dow restriction)');
  assert.equal(typeof sched.runIfOverdue, 'function', 'boot catch-up uses runIfOverdue');
});

test('every definition has an id + a string handler', () => {
  for (const d of sched.getDefinitions()) {
    assert.ok(d.id, 'definition has an id');
    assert.equal(typeof d.handler, 'string', `${d.id} has a string handler`);
  }
});

// Handler-drift guard: every definition's handler string MUST have an implemented function
// (the runtime only catches this when the schedule actually fires — this catches it at test time).
test('every definition handler is implemented in HANDLERS', () => {
  const names = new Set(sched.handlerNames());
  for (const d of sched.getDefinitions()) {
    assert.ok(names.has(d.handler), `${d.id}: handler "${d.handler}" is not implemented in HANDLERS`);
  }
});

test('sys-lens-calibrate is registered (weekly, lensCalibrateSample, no LLM)', () => {
  const cal = defById('sys-lens-calibrate');
  assert.ok(cal, 'sys-lens-calibrate is registered');
  assert.equal(cal.handler, 'lensCalibrateSample', 'handler name correct');
  assert.equal(cal.needsLlm, false, 'local, no token cost');
  assert.match(cal.cron, /^\d+\s+\d+\s+\*\s+\*\s+\d$/, 'a weekly (day-of-week) cron');
});

test.after(() => {
  try { require('../db').getDb().close(); } catch { /* not opened / already closed */ }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
});
