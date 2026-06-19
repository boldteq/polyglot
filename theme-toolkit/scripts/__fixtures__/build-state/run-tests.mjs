#!/usr/bin/env node
// Self-test for build-state.mjs (the Maestro's carried memory).
//   (a) init seeds surfaces + design summary + priority-surface decision from goals/ds/brand.
//   (b) record <surface> PASS updates the row + appends a cross-surface decision.
//   (c) recording a 2nd surface PRESERVES the first (no clobber).
//   (d) re-init PRESERVES recorded verdicts + decisions (idempotent merge — safe mid-build).
// Run (Node 20): node scripts/__fixtures__/build-state/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.resolve(HERE, '..', '..', 'build-state.mjs')

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function scaffold() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildstate-'))
  fs.mkdirSync(path.join(repo, 'docs/discovery'), { recursive: true })
  fs.mkdirSync(path.join(repo, 'docs/design'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'docs/discovery/goals.json'), JSON.stringify({
    conversion: { cvr_target_pct: 2.8, priority_surfaces: ['hero', 'pdp', 'cart'] },
  }))
  fs.writeFileSync(path.join(repo, 'docs/design/design-system.json'), JSON.stringify({
    typography: { fonts: { heading: { family: 'Fraunces' }, body: { family: 'Inter' } }, scale: { ratio: 1.25 } },
    color: { accent: '#6b4eff' }, color_schemes: ['scheme-1', 'scheme-2'], spacing: { scale: [0, 8, 16, 96] },
  }))
  fs.writeFileSync(path.join(repo, 'docs/design/brand-direction.md'), '# Brand\nCalm, clinical-but-warm sleep brand.\n')
  return repo
}
function run(repo, argv) {
  return spawnSync('node', [SCRIPT, ...argv], { cwd: repo, env: { ...process.env, BUILD_STATE_TS: '2026-01-01T00:00:00Z' }, encoding: 'utf-8' })
}
const state = (repo) => JSON.parse(fs.readFileSync(path.join(repo, 'docs/build-state.json'), 'utf-8'))

const repo = scaffold()

console.log('case (a) init → surfaces + design summary + priority decision')
{
  const r = run(repo, ['init']); if (r.status !== 0) fail(`init exit ${r.status}: ${r.stderr}`)
  const s = state(repo)
  if (s.surfaces.length === 6) pass('6 default surfaces seeded'); else fail(`expected 6 surfaces, got ${s.surfaces.length}`)
  if (s.designSystem?.heading === 'Fraunces' && s.designSystem?.accent === '#6b4eff') pass('design summary extracted (heading+accent)'); else fail(`design summary wrong: ${JSON.stringify(s.designSystem)}`)
  if (s.designSystem?.typeRatio === 1.25 && s.designSystem?.colorSchemes === 2) pass('type ratio + scheme count extracted'); else fail(`ratio/schemes wrong: ${JSON.stringify(s.designSystem)}`)
  if (s.decisions.some(d => /priority surfaces/.test(d))) pass('priority-surface decision seeded'); else fail(`no priority decision: ${JSON.stringify(s.decisions)}`)
}

console.log('case (b) record home PASS --rounds 2 --decision')
{
  run(repo, ['record', 'home', 'PASS', '--rounds', '2', '--decision', 'one accent only (amber on navy)'])
  const s = state(repo); const home = s.surfaces.find(x => x.surface === 'home')
  if (home?.status === 'done' && home?.lens === 'PASS' && home?.rounds === 2) pass('home recorded PASS/done/rounds=2'); else fail(`home row wrong: ${JSON.stringify(home)}`)
  if (s.decisions.includes('one accent only (amber on navy)')) pass('cross-surface decision appended'); else fail('decision not appended')
}

console.log('case (c) record pdp WIP → preserves home')
{
  run(repo, ['record', 'pdp', 'WIP'])
  const s = state(repo)
  const home = s.surfaces.find(x => x.surface === 'home'); const pdp = s.surfaces.find(x => x.surface === 'pdp')
  if (pdp?.status === 'wip') pass('pdp recorded wip'); else fail(`pdp wrong: ${JSON.stringify(pdp)}`)
  if (home?.lens === 'PASS' && home?.rounds === 2) pass('home PASS preserved (no clobber)'); else fail(`home clobbered: ${JSON.stringify(home)}`)
}

console.log('case (d) re-init → preserves recorded verdicts + decisions (idempotent)')
{
  run(repo, ['init'])
  const s = state(repo)
  const home = s.surfaces.find(x => x.surface === 'home')
  if (home?.lens === 'PASS' && home?.rounds === 2) pass('re-init preserved home PASS'); else fail(`re-init clobbered home: ${JSON.stringify(home)}`)
  if (s.decisions.includes('one accent only (amber on navy)')) pass('re-init preserved decisions'); else fail('re-init lost decisions')
  // and the md companion renders
  const md = fs.readFileSync(path.join(repo, 'docs/build-state.md'), 'utf-8')
  if (/Cross-surface decisions/.test(md) && /one accent only/.test(md)) pass('build-state.md renders decisions'); else fail('md missing decisions')
}

fs.rmSync(repo, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
