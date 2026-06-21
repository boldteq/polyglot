#!/usr/bin/env node
// Self-test for #41 (sign-off: confidence + impact) + #45 (enforcement) on the LIVE registry.
//   • isEnforced: enforcement:"all" → every contract enforced unless it opts out with enforce:false.
//   • checkSignoff: a contract with a `signoff` block requires its JSON artifact to validate against
//     registry.signoffSchema (confidence 0-100 + impact{rev,conv,dev,maint} 1-5). Missing/invalid →
//     not ok. A contract with no signoff → required:false, ok:true (nothing to check).
//   • the shipped registry is well-formed for the new fields (signoffSchema present; signoff artifacts
//     point at a path the producing contract actually produces).
// Run (Node 20): node scripts/__fixtures__/handoff-confidence/run-tests.mjs · Exit 0 = all pass.

import { loadRegistry, checkSignoff, isEnforced, wipExceeded } from '../../check-handoff-contract.mjs'
import { validate } from '../../lib/jsonschema.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const reg = loadRegistry()
const VALID = JSON.stringify({ confidence: 88, impact: { rev: 4, conv: 5, dev: 2, maint: 3 }, approval_verdict: 'approved' })

console.log('registry — #45/#41 fields well-formed')
eq(reg.enforcement, 'all', 'enforcement policy is "all"')
eq(typeof reg.signoffSchema, 'object', 'signoffSchema present')
{
  // every contract that declares a signoff must point its artifact at one of its own produces[]
  const offenders = (reg.contracts || []).filter(c => c.signoff && !(c.produces || []).some(p => p.startsWith(c.signoff.artifact)))
  eq(offenders.map(c => c.event), [], 'every signoff.artifact is one of the contract produces[]')
}

console.log('isEnforced — #45 enforcement:"all"')
eq(isEnforced(reg, 'code_review_approved'), true, 'core contract enforced')
eq(isEnforced(reg, 'intake_ready'), true, 'intake enforced (policy all)')
eq(isEnforced(reg, 'totally_made_up'), false, 'unknown contract → not enforced')

console.log('checkSignoff — #41 confidence + impact')
eq(checkSignoff(reg, 'intake_ready', () => null).required, false, 'contract with no signoff → required:false')
eq(checkSignoff(reg, 'intake_ready', () => null).ok, true, 'no signoff → ok (nothing to check)')
{
  const ok = checkSignoff(reg, 'code_review_approved', () => VALID)
  eq(ok.required, true, 'code_review_approved requires a signoff')
  eq(ok.ok, true, 'valid confidence+impact artifact → ok')
}
{
  const missing = checkSignoff(reg, 'code_review_approved', () => null)
  eq(missing.ok, false, 'missing artifact → not ok')
  eq(missing.present, false, 'missing artifact → present:false')
}
{
  const badJson = checkSignoff(reg, 'code_review_approved', () => '{not json')
  eq(badJson.ok, false, 'unparseable artifact → not ok')
}
{
  const noImpact = checkSignoff(reg, 'code_review_approved', () => JSON.stringify({ confidence: 90 }))
  eq(noImpact.ok, false, 'missing impact → not ok')
  if (noImpact.errors.some(e => /impact/.test(e.path))) pass('error names the missing impact field')
  else fail(`expected an impact error, got ${JSON.stringify(noImpact.errors)}`)
}
{
  const outOfRange = checkSignoff(reg, 'code_review_approved', () => JSON.stringify({ confidence: 150, impact: { rev: 4, conv: 5, dev: 2, maint: 3 } }))
  eq(outOfRange.ok, false, 'confidence > 100 → not ok')
}
{
  const badAxis = checkSignoff(reg, 'code_review_approved', () => JSON.stringify({ confidence: 80, impact: { rev: 9, conv: 5, dev: 2, maint: 3 } }))
  eq(badAxis.ok, false, 'impact axis > 5 → not ok')
}

console.log('signoffSchema — directly validates the documented shape')
eq(validate({ confidence: 50, impact: { rev: 1, conv: 1, dev: 1, maint: 1 } }, reg.signoffSchema), [], 'minimal valid signoff has no errors')

console.log('#39/#40 — governance contracts (board + red-team)')
for (const ev of ['design_review_board', 'red_team']) {
  reg.contracts.some(c => c.event === ev) ? pass(`contract "${ev}" present`) : fail(`missing contract "${ev}"`)
  eq(isEnforced(reg, ev), true, `${ev} enforced`)
  eq(checkSignoff(reg, ev, () => VALID).ok, true, `${ev} signoff validates with confidence+impact`)
  eq(checkSignoff(reg, ev, () => null).ok, false, `${ev} missing signoff → not ok`)
}

console.log('#46 — wipExceeded (WIP cap)')
eq(reg.wipCap, 3, 'registry wipCap = 3')
eq(wipExceeded(3, 3), true, 'inflight == cap → exceeded')
eq(wipExceeded(4, 3), true, 'inflight > cap → exceeded')
eq(wipExceeded(2, 3), false, 'inflight < cap → ok')
eq(wipExceeded(0, undefined), false, '0 inflight, default cap → ok')

console.log(failures === 0 ? '\n✓ HANDOFF-CONFIDENCE — ALL ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
