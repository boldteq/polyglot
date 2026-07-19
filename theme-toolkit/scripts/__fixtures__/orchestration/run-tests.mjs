// Hermetic fixture for gate #44 check-orchestration. PURE: exercises auditGraph() against synthetic
// registries + a synthetic live-gate-number set — no spawn, no fs. Proves the graph coherence checks
// (dangling require / missing gate citation / missing critical gate / orphan produce) BITE and don't
// false-positive on a clean graph.
import { auditGraph } from '../../check-orchestration.mjs'

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

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
