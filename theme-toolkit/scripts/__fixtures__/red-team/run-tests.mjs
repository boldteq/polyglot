#!/usr/bin/env node
// Self-test for check-red-team.mjs (gate #32). Proves: a conformant 4-attack red-team PASSES; a missing
// attack / an unanswered status / an accepted-without-rationale each BLOCK at publish-grade; a missing
// artifact WARNS in dev but BLOCKS at publish-grade. Hermetic — temp dirs.
// Run: node scripts/__fixtures__/red-team/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-red-team.mjs');
let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };

const ATTACKS = ['design_fail', 'wont_convert', 'competitor_outperforms', 'customer_leaves'];
function rt(overrides = {}) {
  const attacks = {};
  for (const a of ATTACKS) attacks[a] = { finding: 'an issue', status: 'resolved', rationale: 'fixed it in the build' };
  if (overrides.drop) delete attacks[overrides.drop];
  if (overrides.unanswered) attacks[overrides.unanswered] = { finding: 'x', status: 'open' };
  if (overrides.acceptedNoRationale) attacks[overrides.acceptedNoRationale] = { finding: 'x', status: 'accepted' };
  return { page: 'home', commissioned_by: 'atrium', attacks };
}
function run({ artifact, env = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
  const reportDir = path.join(dir, 'gate-reports'); fs.mkdirSync(reportDir, { recursive: true });
  const file = path.join(dir, 'red-team.json');
  if (artifact !== undefined) fs.writeFileSync(file, JSON.stringify(artifact));
  const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf-8', env: { ...process.env, REDTEAM_FILE: file, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', REDTEAM_REQUIRE: '', ...env } });
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'red-team.json'), 'utf-8')); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, ids: new Set((rep?.blockers || []).map((b) => b.id)), warnIds: new Set((rep?.warnings || []).map((w) => w.id)) };
}

const E = { REDTEAM_REQUIRE: '1' };
console.log('red-team — gate #32 (REDTEAM_REQUIRE=1 for BLOCK cases)');
{ const r = run({ artifact: rt(), env: E }); r.code === 0 ? ok('conformant 4-attack red-team → PASS') : bad(`conformant → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ artifact: rt({ drop: 'wont_convert' }), env: E }); (r.code === 1 && r.ids.has('rt.attack-missing')) ? ok('missing attack → BLOCK (rt.attack-missing)') : bad(`missing → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ artifact: rt({ unanswered: 'customer_leaves' }), env: E }); (r.code === 1 && r.ids.has('rt.unanswered')) ? ok('unanswered status → BLOCK (rt.unanswered)') : bad(`unanswered → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ artifact: rt({ acceptedNoRationale: 'design_fail' }), env: E }); (r.code === 1 && r.ids.has('rt.accepted-no-rationale')) ? ok('accepted w/o rationale → BLOCK') : bad(`accepted-no-rationale → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ env: {} }); (r.code === 0 && r.warnIds.has('rt.missing')) ? ok('missing artifact, dev → WARN (exit 0)') : bad(`missing-dev → exit ${r.code} warns=${[...r.warnIds].join(',')}`); }
{ const r = run({ env: E }); (r.code === 1 && r.ids.has('rt.missing')) ? ok('missing artifact, publish-grade → BLOCK') : bad(`missing-pub → exit ${r.code} (${[...r.ids].join(',')})`); }

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
