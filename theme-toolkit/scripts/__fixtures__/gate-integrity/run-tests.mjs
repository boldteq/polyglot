// Hermetic fixture for gate #45 check-gate-integrity — "a skipped gate is not a passed gate".
// PURE: exercises auditReports() against synthetic gate reports. Proves the cravinbyandy failure state
// (8 gates pass:true while their scan was skipped) BLOCKS, that genuinely-N/A gates only WARN, and
// that a CHANGES.md waiver exempts a named gate.
import { auditReports, skippedMarker, emptyScan, orphanReports } from '../../check-gate-integrity.mjs'

let failures = 0
const eqNull = (v, m) => (v === null ? ok(m) : bad(`${m} — got ${JSON.stringify(v)}`))
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const has = (arr, id) => arr.some((x) => x.id === id)

console.log('case (a) the cravinbyandy state: pass:true + scope-unresolved → BLOCK')
{
  const r = auditReports([
    { name: 'design-tokens', json: { pass: true, blockers: [], warnings: [{ id: 'ds.scope-unresolved' }] } },
    { name: 'consistency', json: { pass: true, blockers: [], warnings: [{ id: 'consistency.scope-unresolved' }] } },
  ])
  has(r.blockers, 'integrity.skip-counted-as-pass') ? ok('skip-counted-as-pass blocked') : bad('missed skip-counted-as-pass')
  r.blockers.length === 2 ? ok('one blocker per offending gate') : bad(`expected 2 blockers, got ${r.blockers.length}`)
}

console.log('case (b) the root cause is called out once with the fix')
{
  const r = auditReports([
    { name: 'editability', json: { pass: false, blockers: [{ id: 'editability.base-tag-missing' }], warnings: [] } },
    { name: 'foundation', json: { pass: true, blockers: [], warnings: [{ id: 'bootstrap.no-baseline-tag' }] } },
  ])
  has(r.blockers, 'integrity.no-baseline-tag') ? ok('no-baseline-tag blocked') : bad('missed no-baseline-tag')
  r.blockers.filter((b) => b.id === 'integrity.no-baseline-tag').length === 1 ? ok('reported once, not per-gate') : bad('root cause duplicated')
}

console.log('case (c) a genuinely NOT-APPLICABLE gate only WARNS (no false block)')
{
  const r = auditReports([
    { name: 'redirects', json: { pass: true, blockers: [], warnings: [{ id: 'redirect.n-a-no-map' }] } },
    { name: 'email-triggers', json: { pass: true, blockers: [], warnings: [{ id: 'email.n-a-no-spec' }] } },
  ])
  r.blockers.length === 0 ? ok('n/a gates do not block') : bad(`n/a should not block (got ${r.blockers.map(b => b.id).join(',')})`)
  has(r.warnings, 'integrity.gate-not-applicable') ? ok('n/a surfaced as a warning') : bad('missed n/a warning')
}

console.log('case (d) a clean run is clean')
{
  const r = auditReports([
    { name: 'code-lint', json: { pass: true, blockers: [], warnings: [] } },
    { name: 'layout', json: { pass: true, blockers: [], warnings: [{ id: 'css.text-nowrap' }] } },
  ])
  r.blockers.length === 0 && r.warnings.length === 0 ? ok('no false positives on a real pass') : bad(`false positive: ${JSON.stringify([...r.blockers, ...r.warnings].map(x => x.id))}`)
}

console.log('case (e) skipped:true + pass:true → BLOCK; a CHANGES.md waiver exempts it')
{
  const rep = [{ name: 'honesty', json: { pass: true, skipped: true, blockers: [], warnings: [] } }]
  has(auditReports(rep).blockers, 'integrity.skipped-but-pass') ? ok('skipped-but-pass blocked') : bad('missed skipped-but-pass')
  auditReports(rep, new Set(['honesty'])).blockers.length === 0 ? ok('named waiver exempts the gate') : bad('waiver ignored')
}

console.log('case (f) a BLOCKING gate that genuinely ran is not double-flagged')
{
  const r = auditReports([{ name: 'code-lint', json: { pass: false, blockers: [{ id: 'theme-check.SyntaxError' }], warnings: [] } }])
  r.blockers.length === 0 ? ok('real failures are the other gate\'s job, not integrity\'s') : bad('integrity should not re-report real blockers')
}

// ── ENV-2 (2026-07-23): the skipped-but-pass check could never fire ──────────────────────
// It tested ONLY a top-level `skipped: true`, which NO gate has ever written (audited: 0 occurrences
// across every gate script and every report on disk). The real shape is `evidence.skipped`, emitted by
// 8 gates (theme-check, lighthouse, axe, seo, functional, conversion, theme-link, theme-relink). So the
// one check whose entire job is "a skipped gate is not a passed gate" was inert while its docstring
// promised otherwise. No live false-pass exists today — all 8 set pass:false — so this is preventative.
console.log('case ENV-2 — a gate that env-skips but claims pass is BLOCKED')
{
  const r = auditReports([{ name: 'lighthouse', json: { pass: true, blockers: [], warnings: [], evidence: { skipped: 'env', reason: 'THEME_PREVIEW_URL not set' } } }])
  const hit = r.blockers.find(b => b.id === 'integrity.skipped-but-pass')
  hit ? ok('evidence.skipped + pass:true → BLOCK') : bad('the real skip shape is still not detected')
  hit && /did not actually run/.test(hit.detail) ? ok('detail names the problem') : bad('unhelpful detail')
}

console.log('case ENV-2b — the legacy top-level shape still works')
{
  const r = auditReports([{ name: 'x', json: { pass: true, blockers: [], warnings: [], skipped: true } }])
  r.blockers.some(b => b.id === 'integrity.skipped-but-pass') ? ok('legacy skipped:true still caught') : bad('legacy shape regressed')
}

console.log('case ENV-2c — NO FALSE POSITIVES on an empty skip list or an honest failure')
{
  // the imagery gate emits `skipped: []` on a clean merge — that means nothing was skipped
  const empty = auditReports([{ name: 'imagery', json: { pass: true, blockers: [], warnings: [], evidence: { skipped: [] } } }])
  empty.blockers.length === 0 ? ok('skipped: [] is not a skip') : bad('empty skip list false-flagged')
  // a gate that skipped AND reported pass:false is behaving correctly — nothing to block
  const honest = auditReports([{ name: 'axe', json: { pass: false, blockers: [], warnings: [], evidence: { skipped: 'env' } } }])
  honest.blockers.some(b => b.id === 'integrity.skipped-but-pass') ? bad('an honest pass:false skip was flagged') : ok('skip + pass:false → not flagged')
  eqNull(skippedMarker({ evidence: { skipped: '' } }), 'an empty reason string is not a skip')
}

console.log('\nvacuous pass — green over an EMPTY scan (QA-7)')
{
  // "no findings" and "nothing was looked at" are different facts wearing the same green tick.
  // Several gates already RECORD the count (static-a11y writes `scanned: 0`) — nothing read it.
  emptyScan({ evidence: { scanned: 0 } }) === 'scanned' ? ok('an explicit scanned:0 is detected') : bad('scanned:0 missed')
  emptyScan({ evidence: { scanned: 12 } }) === null ? ok('a non-zero scan is not flagged') : bad('non-zero scan flagged')
  // absence of the field is UNKNOWN, never "fine" — judging gates that do not report a size would
  // invent a fact, which is the failure mode this whole workstream exists to stop
  emptyScan({ evidence: {} }) === null && emptyScan({}) === null && emptyScan(null) === null
    ? ok('a gate that reports no scan size is left alone (unknown != fine)') : bad('missing field mishandled')
  emptyScan({ evidence: { filesScanned: 0 } }) === 'filesScanned' ? ok('alternate field names are honoured') : bad('filesScanned missed')

  const r = auditReports([{ name: 'static-a11y', json: { gate: 'static-a11y', pass: true, evidence: { scanned: 0 }, blockers: [], warnings: [] } }])
  r.blockers.some(b => b.id === 'integrity.vacuous-pass')
    ? ok('pass + scanned:0 + no declaration → integrity.vacuous-pass') : bad(`got ${JSON.stringify(r.blockers.map(b => b.id))}`)

  // ...but a gate that SAYS it did not run, or says it was N/A, is already honest — not vacuous too
  const skipped = auditReports([{ name: 'x', json: { gate: 'x', pass: true, evidence: { scanned: 0, skipped: 'env' }, blockers: [], warnings: [] } }])
  !skipped.blockers.some(b => b.id === 'integrity.vacuous-pass') ? ok('a declared skip is not double-reported as vacuous') : bad('skip double-reported')
  const na = auditReports([{ name: 'y', json: { gate: 'y', pass: true, evidence: { scanned: 0 }, blockers: [], warnings: [{ id: 'y.n-a-no-input' }] } }])
  !na.blockers.some(b => b.id === 'integrity.vacuous-pass') ? ok('a declared N/A is not reported as vacuous') : bad('N/A double-reported')

  // and a real, populated pass must stay clean
  const good = auditReports([{ name: 'z', json: { gate: 'z', pass: true, evidence: { scanned: 40 }, blockers: [], warnings: [] } }])
  good.blockers.length === 0 ? ok('a gate that actually scanned raises nothing') : bad(`false block: ${good.blockers.map(b => b.id)}`)
}

console.log('\nretired gates leave fossils — a report is not evidence if its gate is gone (CB-21)')
{
  // theme-gates clears gate-reports/<name>.json only for gates it is ABOUT TO RUN, so when a gate
  // leaves the stack its last report stays forever. cravinbyandy carried a repo-hygiene.json from an
  // older sha reporting 29 blockers for a gate that no longer exists. Two harms: it inflates every
  // count over the directory, and THIS gate audited it as if it were current.
  const live = ['seo', 'honesty', 'conversion']
  orphanReports(['seo', 'honesty', 'repo-hygiene'], live).join(',') === 'repo-hygiene'
    ? ok('a report with no live gate is identified as an orphan') : bad('orphan not detected')
  orphanReports(['seo', 'honesty'], live).length === 0
    ? ok('reports matching live gates are never orphans') : bad('false orphan')
  orphanReports([], live).length === 0 && orphanReports(['x'], []).join(',') === 'x'
    ? ok('empty inputs behave') : bad('empty input mishandled')

  // THE POINT: a fossil must not be audited. A retired gate's report claiming pass-while-skipped
  // would otherwise raise a blocker about a gate that no longer exists.
  const fossil = { name: 'repo-hygiene', json: { gate: 'repo-hygiene', pass: true, evidence: { skipped: 'env' }, blockers: [], warnings: [] } }
  const audited = auditReports([fossil])
  audited.blockers.some((b) => b.id === 'integrity.skipped-but-pass')
    ? ok('(baseline) that fossil WOULD raise a blocker if audited') : bad('baseline wrong — the fossil is not audit-worthy')
  // ...which is exactly why main() filters orphans out BEFORE calling auditReports. Pinning the
  // contract the filter relies on:
  orphanReports([fossil.name], live).length === 1
    ? ok('so it is excluded from the audit and reported as integrity.orphan-report') : bad('filter contract broken')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
