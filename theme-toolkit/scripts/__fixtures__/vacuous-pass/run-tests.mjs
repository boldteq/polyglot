// audit-vacuous-pass — the classifier that decides whether a gate's green tick on an EMPTY theme
// means anything (QA-7).
//
// Measured against the live stack: 33 static gates run on a theme with no sections, no assets and no
// templates — and `base` resolving fine, so this is NOT the known missing-tag case. Result: 7 declare
// N/A (the convention already exists), 9 are absence-checks, 1 writes no report, and 16 report a bare
// PASS. `theme-gates --verify --require-full` treats every one of those as assurance before publish.
//
// The classifier deliberately has FOUR outcomes rather than pass/fail, because "PASS on zero files" is
// not automatically a bug: an absence-check ("no hardcoded secrets") is genuinely satisfied by an
// empty theme, while a scan-based gate ("every section is on the type ladder") proved nothing. The
// allowlist is the record of that judgement, so a newly-added gate cannot quietly join the vacuous set.

import { classify, ABSENCE_CHECKS, makeEmptyTheme } from '../../audit-vacuous-pass.mjs'
import fs from 'node:fs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const pass = (over = {}) => ({ gate: 'g', pass: true, evidence: {}, blockers: [], warnings: [], ...over })

console.log('classify — four outcomes, because "green on nothing" is not always a bug')
{
  classify('scan-gate', pass()).verdict === 'VACUOUS'
    ? ok('a scan-based gate passing on an empty theme → VACUOUS') : bad('a bare pass was not flagged')
  classify('secret-scan', pass()).verdict === 'absence-check'
    ? ok('an allowlisted absence-check is not flagged') : bad('absence-check misclassified')
  classify('g', pass({ evidence: { skipped: 'env' } })).verdict === 'declares-skip'
    ? ok('a declared skip is honest, not vacuous') : bad('skip misclassified')
  classify('g', pass({ warnings: [{ id: 'g.n-a-no-input' }] })).verdict === 'declares-n-a'
    ? ok('a declared N/A is honest, not vacuous') : bad('N/A misclassified')
  classify('g', pass({ pass: false })).verdict === 'not-pass'
    ? ok('a blocking gate is not a vacuous pass') : bad('a blocked gate was called vacuous')
  classify('g', null).verdict === 'no-report'
    ? ok('no report at all is its own verdict, not a pass') : bad('missing report treated as a pass')
}

console.log('\n── the allowlist is a claim someone stands behind ──')
{
  // every entry must be a gate whose meaning really is "nothing bad is present", so if this set ever
  // grows silently the audit stops being a check and becomes a rubber stamp
  ABSENCE_CHECKS.size > 0 && ABSENCE_CHECKS.has('secret-scan') && !ABSENCE_CHECKS.has('design-tokens')
    ? ok('absence-checks are allowlisted; scan-based gates are not') : bad(`allowlist looks wrong: ${[...ABSENCE_CHECKS].join(', ')}`)
}

console.log('\n── the empty theme must be genuinely empty AND genuinely resolvable ──')
{
  // the whole finding rests on scope resolution SUCCEEDING and yielding zero files. If the fixture
  // repo had no `base` tag it would reproduce the already-known missing-tag bug instead, and the
  // result would say nothing new.
  const dir = makeEmptyTheme()
  const hasBase = fs.existsSync(`${dir}/.git`) && fs.readdirSync(`${dir}/.git/refs/tags`).includes('base')
  const empty = fs.readdirSync(`${dir}/sections`).length === 0
  hasBase && empty
    ? ok('a git repo with a resolvable `base` tag and zero theme files') : bad(`base=${hasBase} emptySections=${empty}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nvacuous-pass: ALL CASES PASS' : `\nvacuous-pass: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
