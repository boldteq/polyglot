// Hermetic fixture for gate #45 check-gate-integrity — "a skipped gate is not a passed gate".
// PURE: exercises auditReports() against synthetic gate reports. Proves the cravinbyandy failure state
// (8 gates pass:true while their scan was skipped) BLOCKS, that genuinely-N/A gates only WARN, and
// that a CHANGES.md waiver exempts a named gate.
import { auditReports, skippedMarker } from '../../check-gate-integrity.mjs'

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

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
