// Hermetic fixture for gate #44 check-orchestration. PURE: exercises auditGraph() against synthetic
// registries + a synthetic live-gate-number set — no spawn, no fs. Proves the graph coherence checks
// (dangling require / missing gate citation / missing critical gate / orphan produce) BITE and don't
// false-positive on a clean graph.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { auditGraph, auditReportIdentity, auditEnforcement, stripComments, countWriteReportCalls } from '../../check-orchestration.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const has = (arr, id) => arr.some(x => x.id === id)

// Live manifest [{number,name}] that includes every critical gate + the ones the clean registry cites.
const LIVE = [
  { number: '0.4', name: 'discovery' }, { number: '0.5', name: 'foundation' },
  { number: '2', name: 'code-lint' }, { number: '7', name: 'conversion' },
  { number: '13', name: 'honesty' }, { number: '14', name: 'render-check' },
  { number: '18', name: 'visual-check' }, { number: '20', name: 'class-d-visual' },
]

const clean = {
  contracts: [
    { event: 'a', requires: ['CHANGES.md'], produces: ['x/'], gate: 'discovery (#0.4)' },
    // theme-check→code-lint(#2), render-check#14 — identity-valid; check-handoff-contract(#39) is an
    // enforcer/feature-id, NOT a gate → correctly ignored (this is the board/red-team masking fix).
    { event: 'b', requires: ['a'], produces: ['y/'], gate: 'theme-check (#2) + render-check (#14) + check-handoff-contract (#39)' },
    { event: 'published', requires: ['b'], produces: ['live'], gate: null },
  ],
}

console.log('case (a) clean graph → 0 blockers, 0 warnings')
{ const r = auditGraph(clean, LIVE)
  r.blockers.length === 0 ? ok('no blockers') : bad(`unexpected blockers: ${r.blockers.map(b => b.id).join(',')}`)
  r.warnings.length === 0 ? ok('no warnings') : bad(`unexpected warnings: ${r.warnings.map(w => w.id).join(',')}`) }

console.log('case (b) dangling require (points at an undefined event) → orch.dangling-require')
{ const reg = { contracts: [{ event: 'b', requires: ['ghost_event'], produces: [], gate: null }, ...clean.contracts.filter(c => c.event === 'published') ] }
  const r = auditGraph(reg, LIVE)
  has(r.blockers, 'orch.dangling-require') ? ok('dangling require blocked') : bad('missed dangling require') }

console.log('case (c) wrong-gate citation (name maps to a different number) → orch.gate-citation-mismatch')
{ const reg = { contracts: [{ event: 'b', requires: [], produces: [], gate: 'commerce-readiness (#15)' }] } // commerce-readiness→conversion is #7, not #15
  const r = auditGraph(reg, LIVE)
  has(r.blockers, 'orch.gate-citation-mismatch') ? ok('wrong-gate citation (#15) blocked by identity check') : bad('missed wrong-gate citation') }

console.log('case (c2) a #N paired with a NON-gate name (enforcer/feature id) is NOT flagged (board/red-team masking fix)')
{ const reg = { contracts: [{ event: 'b', requires: [], produces: [], gate: 'check-handoff-contract (#39)' }] }
  const r = auditGraph(reg, LIVE)
  !has(r.blockers, 'orch.gate-citation-mismatch') && !has(r.blockers, 'orch.gate-citation-missing') ? ok('non-gate #N citation correctly ignored') : bad('false-flagged an AIM feature-id citation') }

console.log('case (d) a critical eyes gate absent from the manifest → orch.critical-gate-missing')
{ const r = auditGraph(clean, LIVE.filter(g => g.name !== 'visual-check')) // drop #18
  has(r.blockers, 'orch.critical-gate-missing') ? ok('missing critical gate #18 blocked') : bad('missed missing critical gate') }

console.log('case (e) orphan produce (non-terminal event nothing requires) → orch.orphan-produce WARN')
{ const reg = { contracts: [
    { event: 'a', requires: ['CHANGES.md'], produces: ['x/'], gate: null },
    { event: 'lonely', requires: ['a'], produces: ['z/'], gate: null }, // nothing requires "lonely", not terminal
    { event: 'published', requires: ['a'], produces: ['live'], gate: null },
  ] }
  const r = auditGraph(reg, LIVE)
  has(r.warnings, 'orch.orphan-produce') ? ok('orphan produce warned') : bad('missed orphan produce')
  r.blockers.length === 0 ? ok('orphan is a warning, not a blocker') : bad('orphan should not block') }

console.log('case (f) terminal contracts + board/red_team CONSUMED by published are NOT orphans')
{ const reg = { contracts: [
    { event: 'a', requires: ['CHANGES.md'], produces: ['x/'], gate: null },
    { event: 'design_review_board', requires: ['a'], produces: ['docs/review/x.json'], gate: null },
    { event: 'red_team', requires: ['a'], produces: ['docs/review/y.json'], gate: null },
    { event: 'launch_watch_clear', requires: ['a'], produces: ['w'], gate: null },
    // published now REQUIRES board + red_team (H5 enforcement) → they are consumed, not orphans
    { event: 'published', requires: ['a', 'design_review_board', 'red_team'], produces: ['live'], gate: null },
  ] }
  const r = auditGraph(reg, LIVE)
  !has(r.warnings, 'orch.orphan-produce') ? ok('terminal + published-consumed contracts do not warn') : bad(`false orphan warn: ${r.warnings.map(w => w.page).join(',')}`) }

console.log('\nreport identity — a gate must write evidence under its MANIFEST name')
{
  // The defect this exists for: theme-gates reads gate-reports/<manifest-name>.json, so a gate writing
  // under any other name produces a report NOTHING reads. Found three times by hand before it was
  // mechanized — #19 wrote the retired alias `section-cohesion`, #44 wrote `check-orchestration`,
  // #45 wrote `check-gate-integrity` (the gate whose whole job is "skipped is not passed" was itself
  // unreadable). A wrong name is silent: the gate still prints PASS.
  const one = (name, number, src) => auditReportIdentity([{ name, number, script: 'x.mjs' }], () => src)

  has(one('seo', '6', "writeReport('search', 6, {})").blockers, 'orch.report-name-mismatch')
    ? ok('wrong report name → orch.report-name-mismatch') : bad('a gate writing under a retired alias was not caught')
  has(one('seo', '6', "writeReport('seo', 7, {})").blockers, 'orch.report-number-mismatch')
    ? ok('wrong gate number → orch.report-number-mismatch') : bad('a wrong gate number was not caught')

  const good = one('seo', '6', "writeReport('seo', 6, { pass: true })")
  good.blockers.length === 0 ? ok('a correctly-named report is clean') : bad(`false block: ${good.blockers.map(b => b.id).join(',')}`)

  // a gate naming itself through a constant must still be verified, not waved through —
  // that is exactly how #45 hid (`const SELF = 'check-gate-integrity'`)
  const viaConst = one('gate-integrity', '45', "const SELF = 'check-gate-integrity'\nwriteReport(SELF, 45, {})")
  has(viaConst.blockers, 'orch.report-name-mismatch') ? ok('name via a const is resolved and checked') : bad('a const-named report escaped the check')
  const constOk = one('gate-integrity', '45', "const SELF = 'gate-integrity'\nwriteReport(SELF, 45, {})")
  constOk.blockers.length === 0 ? ok('a correct const-named report is clean') : bad('false block on a const name')

  // unverifiable / unreadable cases must WARN, never silently pass as verified
  has(one('x', '1', 'writeReport(nameFrom(cfg), 1, {})').warnings, 'orch.report-name-unresolvable')
    ? ok('a computed report name warns rather than passing unverified') : bad('a computed name passed as verified')
  has(one('x', '1', 'no report call here').warnings, 'orch.report-no-call')
    ? ok('a gate with no writeReport call warns') : bad('a gate writing no report passed silently')
  has(auditReportIdentity([{ name: 'x', number: '1', script: 'gone.mjs' }], () => null).warnings, 'orch.report-script-unreadable')
    ? ok('an unreadable gate script warns') : bad('an unreadable script passed silently')
}

{
  // The trap that made this check lie: `// ... sections/*.liquid ...` is a real comment line in these
  // gates. Stripping block comments BEFORE line comments let that `/*` open a fake block that ran to
  // the next `*/` and swallowed the rest of the file — check-honesty (#13, a critical gate) then
  // looked like it wrote no report at all. Comment and string state must be tracked in one pass.
  const tricky = ["// scope: sections/*.liquid + snippets/*.liquid", "writeReport('honesty', 13, {})"].join('\n')
  const ident = auditReportIdentity([{ name: 'honesty', number: '13', script: 'h.mjs' }], () => tricky)
  ident.blockers.length === 0 && ident.warnings.length === 0
    ? ok('a `/*` inside a line comment does not swallow the file') : bad(`glob-in-comment broke the scan: ${[...ident.blockers, ...ident.warnings].map(x => x.id).join(',')}`)

  // and a genuine mention inside a comment or a message string is still not counted as a call
  countWriteReportCalls(stripComments("// call writeReport(name, n) here\nconst m = 'use writeReport(x, 1)'")) === 0
    ? ok('writeReport mentioned in a comment or a string is not counted as a call') : bad('a mention was counted as a call')
  countWriteReportCalls(stripComments("writeReport('a', 1, {})")) === 1
    ? ok('a real call is counted') : bad('a real call was missed')
}

console.log('\nreport identity — against the REAL live manifest')
{
  // the regression that matters: every shipped gate must be readable right now
  const HERE = path.dirname(fileURLToPath(import.meta.url))
  const SCRIPTS = path.resolve(HERE, '..', '..')
  const man = JSON.parse(execFileSync(process.execPath, [path.join(SCRIPTS, 'theme-gates.mjs'), '--list-json'], { encoding: 'utf-8' }))
    .map((g) => ({ number: String(g.number), name: String(g.name), script: g.script }))
  let read = 0
  const r = auditReportIdentity(man, (sc) => { try { const t = fs.readFileSync(path.join(SCRIPTS, sc), 'utf-8'); read += 1; return t } catch { return null } })
  // guard the guard: if nothing was actually read, "0 blockers" would be vacuous
  read === man.length && man.length > 30
    ? ok(`all ${read} live gate scripts were actually inspected`) : bad(`only ${read}/${man.length} gate scripts read`)
  r.blockers.length === 0
    ? ok('every live gate writes its report under its manifest name') : bad(`invisible reports: ${r.blockers.map(b => `${b.page} (${b.evidence})`).join(', ')}`)
}

console.log('\nenforcement graduation — a warn-capable gate must carry a dated, reasoned enforcement object')
{
  // A gate is warn-capable if its source (or an absorbed sub-gate's source) reads an *_ENFORCE flag.
  const SRC = {
    'warn-cap.mjs': "const ENFORCE = process.env.FOO_ENFORCE === '1'\nwriteReport('g', 1, {})",
    'plain.mjs': "const x = 1\nwriteReport('g', 1, {})",
    'merged.mjs': "runAbsorbed([{ script: 'check-sub.mjs', report: 'sub' }], { cwd })",
    'check-sub.mjs': "const E = process.env.BAR_ENFORCE === '1'",
    'commented.mjs': "// a note mentioning FOO_ENFORCE === '1' only inside a comment\nconst x = 1",
  }
  const read = (s) => (s in SRC ? SRC[s] : null)
  const one = (gate) => auditEnforcement([gate], read)
  const okEnf = { policy: 'block', provenBuilds: 1, reason: 'proven on a real build', since: '2026-07-23' }

  has(one({ number: '1', name: 'g', script: 'warn-cap.mjs' }).blockers, 'orch.warn-only-unreasoned')
    ? ok('warn-capable gate with NO enforcement object → orch.warn-only-unreasoned') : bad('a warn-capable gate with no enforcement escaped')
  one({ number: '1', name: 'g', script: 'warn-cap.mjs', enforcement: okEnf }).blockers.length === 0
    ? ok('warn-capable gate with a dated, reasoned enforcement object is clean') : bad('false block on a reasoned enforcement object')
  one({ number: '1', name: 'g', script: 'plain.mjs' }).blockers.length === 0
    ? ok('a gate with no *_ENFORCE flag is not required to declare enforcement') : bad('false block on a non-warn-capable gate')
  one({ number: '1', name: 'g', script: 'commented.mjs' }).blockers.length === 0
    ? ok('an *_ENFORCE flag mentioned only in a comment does not trip warn-capability') : bad('a commented flag falsely tripped warn-capability')
  has(one({ number: '1', name: 'g', script: 'merged.mjs' }).blockers, 'orch.warn-only-unreasoned')
    ? ok('warn-capability follows a runAbsorbed sub-gate (imagery→art-direction, content-quality→copy-quality)') : bad('a merged gate absorbing a warn-capable sub-gate was not detected')
  has(one({ number: '1', name: 'g', script: 'warn-cap.mjs', enforcement: { policy: 'warn', reason: '   ', since: '2026-07-23' } }).blockers, 'orch.warn-only-unreasoned')
    ? ok('an empty enforcement reason → orch.warn-only-unreasoned') : bad('an empty enforcement reason escaped')
  has(one({ number: '1', name: 'g', script: 'warn-cap.mjs', enforcement: { policy: 'warn', reason: 'x', since: 'soon' } }).blockers, 'orch.warn-only-unreasoned')
    ? ok('a non-date since → orch.warn-only-unreasoned') : bad('a bad since date escaped')
}

console.log('\nenforcement graduation — against the REAL live manifest')
{
  // The regression that matters: the 13 warn-only gates must not be able to sit un-enforced silently.
  const HERE = path.dirname(fileURLToPath(import.meta.url))
  const SCRIPTS = path.resolve(HERE, '..', '..')
  const man = JSON.parse(execFileSync(process.execPath, [path.join(SCRIPTS, 'theme-gates.mjs'), '--list-json'], { encoding: 'utf-8' }))
    .map((g) => ({ number: String(g.number), name: String(g.name), script: g.script, enforcement: g.enforcement }))
  const readSrc = (sc) => { try { return fs.readFileSync(path.join(SCRIPTS, sc), 'utf-8') } catch { return null } }
  // guard the guard: STRIP enforcement from the live manifest → the check MUST now block ≥11 gates. This
  // proves warn-capable gates genuinely exist in the stack, so "0 blockers WITH enforcement" is a real
  // pass and not vacuous (the source-scan actually found the *_ENFORCE flags).
  const stripped = man.map(g => ({ number: g.number, name: g.name, script: g.script }))
  const rStripped = auditEnforcement(stripped, readSrc)
  rStripped.blockers.length >= 11
    ? ok(`stripping enforcement surfaces ${rStripped.blockers.length} warn-capable live gates (guard is not vacuous)`) : bad(`stripping enforcement surfaced only ${rStripped.blockers.length} warn-capable gates — expected ≥11`)
  const r = auditEnforcement(man, readSrc)
  r.blockers.length === 0
    ? ok('every warn-capable live gate carries a dated, reasoned enforcement object') : bad(`unreasoned warn-only gate(s): ${r.blockers.map(b => `${b.page} (${b.detail.slice(0, 40)})`).join(', ')}`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
