#!/usr/bin/env node
// Self-test for check-design-review-board.mjs (gate #31). Proves: a conformant 8-role board PASSES;
// a BLOCK verdict / a confidence <70 / a missing role (partial board) each BLOCK at publish-grade;
// a missing artifact WARNS in dev but BLOCKS at publish-grade. Hermetic — temp dirs, no network.
// Run: node scripts/__fixtures__/design-review-board/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-design-review-board.mjs');
let failures = 0;
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1; };

const ROLES = ['creative_director', 'brand_strategist', 'cro_director', 'shopify_architect', 'seo_director', 'mobile_ux', 'accessibility', 'qa_lead'];
function board(overrides = {}) {
  const roles = {};
  for (const r of ROLES) roles[r] = { verdict: 'approve', confidence: 90, impact: 'ok' };
  if (overrides.block) roles[overrides.block] = { verdict: 'block', confidence: 90, note: 'fails the lens' };
  if (overrides.lowconf) roles[overrides.lowconf] = { verdict: 'approve', confidence: 50 };
  if (overrides.drop) delete roles[overrides.drop];
  return { page: 'home', convened_by: 'atrium', timestamp: 't', roles };
}
function run({ artifact, env = {} }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drb-'));
  const reportDir = path.join(dir, 'gate-reports'); fs.mkdirSync(reportDir, { recursive: true });
  const file = path.join(dir, 'board.json');
  if (artifact !== undefined) fs.writeFileSync(file, JSON.stringify(artifact));
  const r = spawnSync(process.execPath, [GATE], { cwd: dir, encoding: 'utf-8', env: { ...process.env, DRB_FILE: file, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', DRB_REQUIRE: '', ...env } });
  let rep = null; try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'design-review-board.json'), 'utf-8')); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, ids: new Set((rep?.blockers || []).map((b) => b.id)), warnIds: new Set((rep?.warnings || []).map((w) => w.id)) };
}

const E = { DRB_REQUIRE: '1' }; // publish-grade — findings BLOCK
console.log('design-review-board — gate #31 (DRB_REQUIRE=1 for BLOCK cases)');
{ const r = run({ artifact: board(), env: E }); r.code === 0 ? ok('conformant 8-role board → PASS') : bad(`conformant → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ artifact: board({ block: 'cro_director' }), env: E }); (r.code === 1 && r.ids.has('drb.role-blocked')) ? ok('a BLOCK verdict → BLOCK (drb.role-blocked)') : bad(`block → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ artifact: board({ lowconf: 'seo_director' }), env: E }); (r.code === 1 && r.ids.has('drb.low-confidence')) ? ok('confidence <70 → BLOCK (drb.low-confidence)') : bad(`lowconf → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ artifact: board({ drop: 'accessibility' }), env: E }); (r.code === 1 && r.ids.has('drb.role-missing')) ? ok('partial board (missing role) → BLOCK (drb.role-missing)') : bad(`partial → exit ${r.code} (${[...r.ids].join(',')})`); }
{ const r = run({ env: {} }); (r.code === 0 && r.warnIds.has('drb.missing')) ? ok('missing artifact, dev → WARN (exit 0)') : bad(`missing-dev → exit ${r.code} warns=${[...r.warnIds].join(',')}`); }
{ const r = run({ env: E }); (r.code === 1 && r.ids.has('drb.missing')) ? ok('missing artifact, publish-grade → BLOCK') : bad(`missing-pub → exit ${r.code} (${[...r.ids].join(',')})`); }

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
