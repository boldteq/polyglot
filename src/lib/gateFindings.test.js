'use strict';

// Self-test for the Gate/Lens → Brain harvester (P0-1). Hermetic: a throwaway POLYGLOT_DB_PATH
// + HOME so nothing real is touched. Proves: harvest groups + attributes defects, emit creates
// gate_defect training_signals, re-harvest of the same build never double-counts, recurrence
// across builds accumulates to the governor's auto bar, and the governor auto-promotes it.
// Run: node --test src/lib/gateFindings.test.js   (covered by `pnpm test`).

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');

// ── isolation: set BEFORE requiring db / gateFindings ──
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gatefind-'));
process.env.HOME = path.join(TMP, 'home');
process.env.USERPROFILE = process.env.HOME;
process.env.POLYGLOT_DB_PATH = path.join(TMP, 'polyglot.db');
fs.mkdirSync(path.join(process.env.HOME, '.claude', 'agents'), { recursive: true });

const db = require('../db');
const { harvestBuildFindings, emitGateSignals } = require('./gateFindings');

// build a fixture build dir with a Lens FAIL (loom defect + an onyx finding that must be skipped)
// + a mapped static gate (render-wiring → loom) + an unmapped gate (must be skipped).
function makeBuild(name) {
  const d = path.join(TMP, name);
  fs.mkdirSync(path.join(d, 'gate-reports', 'lens', 'judge'), { recursive: true });
  fs.writeFileSync(path.join(d, 'gate-reports', 'lens', 'judge', 'pdp-desktop.json'), JSON.stringify({
    surface: 'pdp', viewport: '1440x900', verdict: 'FAIL', confidence: 80,
    findings: [
      { check: 'spacing-rhythm', severity: 'blocker', evidence: 'hero padding sits off the spacing scale', fix_owner: 'loom' },
      { check: 'broken-state', severity: 'blocker', evidence: 'test store name in footer', fix_owner: 'onyx' }, // onyx not a Lens owner → skip
    ], passed_checks: [],
  }));
  fs.writeFileSync(path.join(d, 'gate-reports', 'render-wiring.json'), JSON.stringify({
    gate: 'render-wiring', gateNumber: 14, pass: false,
    blockers: [{ id: 'rw.scheme-unwired', detail: 'color-scheme referenced but the css is empty' }], warnings: [],
  }));
  fs.writeFileSync(path.join(d, 'gate-reports', 'some-unknown-gate.json'), JSON.stringify({ gate: 'some-unknown-gate', pass: false, blockers: [{ detail: 'whatever' }] }));
  return d;
}

test('harvest groups + attributes defects; skips unowned + unmapped', () => {
  const h = harvestBuildFindings(makeBuild('b1'));
  assert.ok(h.findings.length >= 2, 'at least the loom lens defect + loom render-wiring defect');
  assert.ok(h.findings.every((f) => f.owner === 'loom'), 'only owner=loom (onyx lens finding + unmapped gate skipped)');
  assert.ok(h.findings.every((f) => f.signature && f.signature.length > 0), 'every finding has a normalized signature');
  assert.ok(h.findings.some((f) => f.sources.some((s) => s.startsWith('lens:'))), 'a lens-sourced defect is present');
  assert.ok(h.findings.some((f) => f.sources.some((s) => s.startsWith('gate:'))), 'a static-gate defect is present');
});

test('emit creates gate_defect signals; re-harvest of the same build does not double-count', () => {
  emitGateSignals(path.join(TMP, 'b1'), { database: db }); // b1 already made above
  const sigs1 = db.getTrainingSignals({ kind: 'gate_defect', agent: 'loom', limit: 2000 });
  assert.ok(sigs1.length >= 1, 'gate_defect signal(s) created for loom');
  const spacing = sigs1.find((s) => /spacing|padding|scale/.test(s.signature));
  assert.ok(spacing, 'the spacing defect became a signal');
  assert.equal(spacing.occurrences, 1, 'one occurrence after one build');
  assert.deepEqual(spacing.projects, ['b1'], 'one project after one build');
  // re-harvest the SAME build → no double count
  emitGateSignals(path.join(TMP, 'b1'), { database: db });
  const again = db.getTrainingSignals({ kind: 'gate_defect', agent: 'loom', limit: 2000 }).find((s) => s.id === spacing.id);
  assert.equal(again.occurrences, 1, 're-harvest of the same build is idempotent (no double-count)');
});

test('recurrence across builds accumulates to the governor auto bar; governor auto-promotes', async () => {
  emitGateSignals(makeBuild('b2'), { database: db });
  emitGateSignals(makeBuild('b3'), { database: db });
  const spacing = db.getTrainingSignals({ kind: 'gate_defect', agent: 'loom', limit: 2000 }).find((s) => /spacing|padding|scale/.test(s.signature));
  assert.ok(spacing.occurrences >= 3, `recurred ≥3× (got ${spacing.occurrences})`);
  assert.ok(spacing.projects.length >= 2, `across ≥2 builds (got ${spacing.projects.length})`);

  const governor = await import('../intelligence/governor.mjs');
  const proposal = { agent: 'loom', targetFile: 'loom.md', patchType: 'anti_pattern', section: 'autolearn', rollback_content: '', after_text: '🚫 keep spacing on the scale', signal: { kind: 'gate_defect', severity: spacing.severity, occurrences: spacing.occurrences, projects: spacing.projects } };
  const auto = governor.decide(proposal, { evalCalibrated: true });
  assert.equal(auto.decision, 'auto', 'a recurring gate_defect auto-promotes (calibrated + rollback-armed)');
  const weak = governor.decide({ ...proposal, signal: { kind: 'gate_defect', severity: 'medium', occurrences: 1, projects: ['x'] } }, { evalCalibrated: true });
  assert.equal(weak.decision, 'review', 'a one-off gate_defect routes to review, never auto');
});

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });
