#!/usr/bin/env node
// Self-test for maestro-status.mjs (the morning snapshot). Scaffolds artifact combos in temp dirs and
// asserts the consolidated snapshot + the next-action + the rendered output.
//
//   (a) no artifacts → hasArtifacts=false, publishReady=null, "no build has run" + start action.
//   (b) all artifacts, publish-ready → publishReady=true, surfaces from build-state, gates PASS, publish action.
//   (c) not-ready at gates + blocked summary → publishReady=false, gates.blockers counted, gate next-action.
//   (d) escalated surfaces (build-state blocked, no maestro-report) → escalated derived, escalate next-action.
//   (e) formatStatus renders verdict + surfaces + gates + Next line.
// Run (Node 20): node scripts/__fixtures__/maestro-status/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { status, formatStatus, nextAction } from '../../maestro-status.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

function repo() { return fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-status-')) }
function writeDocs(dir, files) {
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'gate-reports'), { recursive: true })
  if (files.buildState) fs.writeFileSync(path.join(dir, 'docs', 'build-state.json'), JSON.stringify(files.buildState))
  if (files.report) fs.writeFileSync(path.join(dir, 'docs', 'maestro-report.json'), JSON.stringify(files.report))
  if (files.readiness) fs.writeFileSync(path.join(dir, 'docs', 'publish-readiness.json'), JSON.stringify(files.readiness))
  if (files.summary) fs.writeFileSync(path.join(dir, 'gate-reports', 'summary.json'), JSON.stringify(files.summary))
}
const rm = (d) => fs.rmSync(d, { recursive: true, force: true })

// ── case a: nothing run ──
console.log('case a — no artifacts → nothing-run snapshot')
{
  const dir = repo() // docs/ may not even exist
  const s = status({ dir })
  eq(s.hasArtifacts, false, 'hasArtifacts false')
  eq(s.publishReady, null, 'publishReady null')
  eq(/No build has run/.test(nextAction(s)), true, 'next action = start a build')
  rm(dir)
}

// ── case b: full + publish-ready ──
console.log('case b — all artifacts, publish-ready')
{
  const dir = repo()
  writeDocs(dir, {
    buildState: { client: 'Acme', niche: 'beauty', surfaces: [{ surface: 'home', status: 'done', lens: 'PASS', rounds: 2 }, { surface: 'pdp', status: 'done', lens: 'PASS', rounds: 1 }], decisions: ['one accent only (amber)'] },
    report: { converged: ['home', 'pdp'], escalated: [], surfaces: [] },
    readiness: { publishReady: true, stage: 'ready', reason: 'converged + gates passed' },
    summary: { pass: true, mode: 'full', sha: 'abc1234ff', gates: { 'theme-check': { blockers: [] } } },
  })
  const s = status({ dir })
  eq(s.publishReady, true, 'publishReady true')
  eq(s.converged, ['home', 'pdp'], 'converged from report')
  eq(s.gates.pass, true, 'gates PASS')
  eq(s.client, 'Acme', 'client carried from build-state')
  eq(/PUBLISH-READY/.test(nextAction(s)) && /theme:publish/.test(nextAction(s)), true, 'next action = flip live (theme:publish)')
  rm(dir)
}

// ── case c: not-ready at gates ──
console.log('case c — converged loop but gate stack blocked')
{
  const dir = repo()
  writeDocs(dir, {
    buildState: { surfaces: [{ surface: 'home', status: 'done', lens: 'PASS', rounds: 1 }] },
    readiness: { publishReady: false, stage: 'gates', reason: 'gate stack blocked (2 blocker(s))', loop: { allPass: true } },
    summary: { pass: false, mode: 'full', sha: 'deadbeef', gates: { seo: { blockers: [{ id: 'seo.title' }] }, axe: { blockers: [{ id: 'axe.contrast' }] } } },
  })
  const s = status({ dir })
  eq(s.publishReady, false, 'publishReady false')
  eq(s.stage, 'gates', 'stage = gates')
  eq(s.gates.blockers, 2, 'blocker count summed across gates')
  eq(/SUMMARY.md/.test(nextAction(s)), true, 'next action points to the gate summary')
}

// ── case d: escalated surfaces, no maestro-report (derive from build-state) ──
console.log('case d — escalated surfaces derived from build-state when no report present')
{
  const dir = repo()
  writeDocs(dir, {
    buildState: { surfaces: [{ surface: 'home', status: 'done', lens: 'PASS', rounds: 1 }, { surface: 'cart', status: 'blocked', lens: 'FAIL', rounds: 3 }] },
  })
  const s = status({ dir })
  eq(s.converged, ['home'], 'converged derived (done)')
  eq(s.escalated, ['cart'], 'escalated derived (blocked)')
  eq(/cart/.test(nextAction(s)) && /escalat/i.test(nextAction(s)), true, 'next action names the escalated surface')
  rm(dir)
}

// ── case e: formatStatus output ──
console.log('case e — formatStatus renders the snapshot')
{
  const dir = repo()
  writeDocs(dir, {
    buildState: { client: 'Acme', surfaces: [{ surface: 'home', status: 'done', lens: 'PASS', rounds: 2 }], decisions: ['pill buttons everywhere'] },
    readiness: { publishReady: false, stage: 'loop', reason: 'pdp did not converge' },
    summary: { pass: false, gates: { axe: { blockers: [{ id: 'x' }] } } },
  })
  const text = formatStatus(status({ dir }))
  eq(/NOT READY/.test(text), true, 'shows NOT READY verdict')
  eq(/Surfaces \(1\)/.test(text), true, 'lists surfaces with count')
  eq(/Gates:/.test(text) && /BLOCK/.test(text), true, 'shows gate block')
  eq(/Next:/.test(text), true, 'shows the Next action line')
  eq(/Coherence ledger/.test(text), true, 'shows the decision ledger')
  rm(dir)
}

console.log(failures === 0 ? '\n✓ MAESTRO-STATUS — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
