#!/usr/bin/env node
// Self-test for maestro-escalate.mjs (the "ask the human" consolidator). Proves the WHITELIST
// discipline: owner-fixable findings stay in the auto-fix backlog (never questions); only whitelist
// hits (porter store-data, brand identity, real-asset-missing, legal, money) become batched questions.
// buildEscalation is pure (injected inputs) so this needs no disk; case e exercises the disk wrapper.
// Run (Node 20): node scripts/__fixtures__/maestro-escalate/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildEscalation, classify, consolidateEscalation } from '../../maestro-escalate.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

// ── case a: owner-fixable vs whitelist split ──
console.log('case a — a loom finding is backlog (not a question); a porter finding is a question')
{
  const r = buildEscalation({ autofix: { unresolved: [
    { check: 'overflow', severity: 'blocker', fix_owner: 'loom', evidence: 'hero overflows 12px on mobile' },
    { check: 'empty-collection', severity: 'blocker', fix_owner: 'porter', evidence: 'collection page has 0 products' },
  ] } })
  eq(r.questions.length, 1, 'exactly one question (the porter/store-data finding)')
  eq(r.questions[0].owner, 'porter', 'the question is the porter finding')
  eq(r.questions[0].whitelist_hit, 'real-asset-missing', 'porter finding tagged real-asset-missing')
  eq(r.backlog.length, 1, 'the loom finding is auto-fix backlog, NOT a question')
  eq(r.backlog[0].owner, 'loom', 'backlog item is the loom finding')
  eq(r.blocked, true, 'blocked when there is a question')
}

// ── case b: escalated surfaces + surface error carried; error w/o owner is backlog ──
console.log('case b — escalated surfaces carried; an owner-less surface error is backlog, not a question')
{
  const r = buildEscalation({ report: {
    escalated: ['pdp'],
    surfaces: [
      { surface: 'home', status: 'PASS', rounds: 1 },
      { surface: 'pdp', status: 'FAIL', rounds: 3, error: 'theme:push timed out' },
    ],
  } })
  eq(r.escalatedSurfaces, ['pdp'], 'escalated surface carried through')
  eq(r.blocked, true, 'blocked when a surface escalated')
  eq(r.questions.length, 0, 'an infra surface-error is not a human question')
  eq(r.backlog.length, 1, 'the surface error lands in the backlog')
}

// ── case c: porter work-order adds a question ──
console.log('case c — a non-empty porter work-order becomes one pointer question')
{
  const r = buildEscalation({ workorder: '# Porter work-order\n- HUMAN: confirm brand name\n' })
  eq(r.questions.length, 1, 'work-order → one question')
  eq(r.questions[0].owner, 'porter', 'work-order question owned by porter')
  eq(r.blocked, true, 'blocked on a work-order')
}

// ── case d: nothing to escalate → not blocked, no questions ──
console.log('case d — absent/empty sources → not blocked')
{
  const r = buildEscalation({})
  eq(r.blocked, false, 'no sources → not blocked')
  eq(r.questions.length, 0, 'no questions')
  eq(r.backlog.length, 0, 'no backlog')
}

// ── case e: the disk wrapper writes both artifacts with the right shape ──
console.log('case e — consolidateEscalation writes docs/ESCALATION.md + docs/questions.json')
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-esc-'))
  fs.mkdirSync(path.join(dir, 'gate-reports/lens'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'gate-reports/lens/autofix-escalation.json'), JSON.stringify({ rounds: 3, unresolved: [{ check: 'empty-collection', severity: 'blocker', fix_owner: 'porter', evidence: 'no products' }] }))
  const r = consolidateEscalation({ dir, buildStateDir: 'docs' })
  eq(fs.existsSync(path.join(dir, 'docs/ESCALATION.md')), true, 'ESCALATION.md written')
  eq(fs.existsSync(path.join(dir, 'docs/questions.json')), true, 'questions.json written')
  const q = JSON.parse(fs.readFileSync(path.join(dir, 'docs/questions.json'), 'utf-8'))
  eq(q.blocked, true, 'questions.json records blocked=true')
  eq(q.questions.length, 1, 'questions.json carries the porter question')
  eq(/NEEDS YOU/.test(fs.readFileSync(path.join(dir, 'docs/ESCALATION.md'), 'utf-8')), true, 'ESCALATION.md shows the blocked banner')
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── case f: classify maps text + owner correctly ──
console.log('case f — classify: brand-name text is a question, a generic loom render finding is not')
{
  eq(classify({ fix_owner: 'loom', check: 'overflow', evidence: 'hero overflows' }), null, 'loom render finding → null (owner-fixable)')
  eq(classify({ fix_owner: 'loom', check: 'placeholder', evidence: 'store name reads GPT TEST 1.0' })?.whitelist, 'brand-identity', 'brand/store-name text → brand-identity')
  eq(classify({ fix_owner: 'porter', check: 'x', evidence: 'y' })?.whitelist, 'real-asset-missing', 'porter owner → real-asset-missing')
}

console.log(failures === 0 ? '\n✓ MAESTRO-ESCALATE — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
