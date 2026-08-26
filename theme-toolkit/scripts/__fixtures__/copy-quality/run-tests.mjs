#!/usr/bin/env node
// Self-test for #23/#24/#25 — brief-level copy-quality checks (parseObjections / coverageGaps /
// heroFormulaDeclared pure + the end-to-end gate). MERGED 2026-08-25 (Phase 3 REMOVE 1) — the checks
// now live in check-copy-scorecard.mjs (#58); the pre-merge check-copy-quality.mjs was deleted. This
// fixture folder retains the `copy-quality` name because the checks it covers still are the copy-
// quality brief-level ones — the file path change is the only migration.
//
// Run (Node 20): node scripts/__fixtures__/copy-quality/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseObjections, coverageGaps, heroFormulaDeclared } from '../../check-copy-scorecard.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-copy-scorecard.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('parseObjections — inline + list')
eq(parseObjections('objections: too expensive; will it fit'), ['too expensive', 'will it fit'], 'inline `objections: a; b`')
eq(parseObjections('## Objections\n- is it safe\n- does it last\n\nnext'), ['is it safe', 'does it last'], 'heading + bullet list (stops at blank)')
eq(parseObjections('no objections here'), [], 'none → []')

console.log('coverageGaps — addressed vs not')
{
  const objs = ['is it safe for sensitive skin', 'will it last all day']
  const corpus = 'Our formula is dermatologist-tested and safe for sensitive skin types.'
  const gaps = coverageGaps(objs, corpus)
  gaps.length === 1 && /last all day/.test(gaps[0]) ? pass('covered objection drops, uncovered remains') : fail(`gaps: ${JSON.stringify(gaps)}`)
}
eq(coverageGaps([], 'x'), [], 'no objections → no gaps')

console.log('heroFormulaDeclared — formula + citation required')
eq(heroFormulaDeclared('hero_formula: problem-promise\nhero_citation: Ritual'), true, 'formula + citation → true')
eq(heroFormulaDeclared('hero_formula: problem-promise'), false, 'formula without citation → false')
eq(heroFormulaDeclared('just some copy'), false, 'neither → false')

console.log('check-copy-scorecard brief-level checks — end to end')
// The scorecard requires either a theme skeleton (sections/ or layout/) or a briefs directory to run.
// Each end-to-end scenario below creates a stub sections/ so the surface-scoring half is a trivial
// N/A (0 matching sections → all scores null, overall pass=true trivially) — the exit status is
// driven purely by the brief-level checks under test.
function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copyq-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, COPY_ENFORCE: '', DS_REQUIRE_SCOPE: '', COPY_SCORECARD_ENFORCE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'copy-scorecard.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const allIds = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))

{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'copyq-'))
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })                // theme stub → gate proceeds
  const { code, rep } = runGate(d)
  code === 0 && allIds(rep).has('copy.n-a-no-briefs') ? pass('no briefs → SKIP/PASS') : fail(`no-briefs: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'copyq-'))
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })                // theme stub
  fs.mkdirSync(path.join(d, 'content', 'briefs'), { recursive: true })
  fs.writeFileSync(path.join(d, 'content', 'briefs', 'pdp.md'), '# PDP brief\nhero_formula: problem-promise\nhero_citation: Ritual\n\nobjections:\n- is it safe for sensitive skin\n- will it actually work in thirty days\n')
  const dev = runGate(d)
  dev.code === 0 && [...allIds(dev.rep)].some(i => i === 'copy.objection-uncovered') ? pass('uncovered objection (dev) → warning, exit 0') : fail(`dev: code ${dev.code} ids ${[...allIds(dev.rep)]}`)
  const strict = runGate(d, { COPY_ENFORCE: '1' })
  strict.code === 1 && (strict.rep?.blockers || []).some(b => b.id === 'copy.objection-uncovered') ? pass('uncovered objection + COPY_ENFORCE → BLOCK') : fail(`enforce: code ${strict.code} ids ${[...allIds(strict.rep)]}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
