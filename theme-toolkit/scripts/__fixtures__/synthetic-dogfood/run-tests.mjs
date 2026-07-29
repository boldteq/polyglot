// Hermetic fixture for swt-synthetic-dogfood — proves the two PURE halves (no cp, no git, no gates):
//   briefToInputs()      — a brief spec maps to the exact, well-formed input files the SWT agents receive
//   defectsFromSummary() — a gate summary maps to a flat, owner-attributable defect list (blockers only)
import { briefToInputs, defectsFromSummary } from '../../swt-synthetic-dogfood.mjs'
import { parseBrief, missingFields } from '../../brief-intake.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const SPEC = {
  niche: 'haircare', brand: 'Wildroot', surfaces: ['hero', 'about', 'pdp'],
  design_system: { typography: { allowed_px: [56, 42, 16] }, spacing: { scale: [0, 8, 16] } },
  goals: { conversion: { cvr_target_pct: 2.8 } },
  products: [{ handle: 'x', title: 'X' }],
  reference: { surface: 'home', name: 'hero', archetype: 'slideshow' },
}

console.log('case (a) briefToInputs emits every input file the agents + gates need')
{
  const f = briefToInputs(SPEC)
  ;['brief.json', 'docs/design/design-system.json', 'docs/discovery/goals.json', 'docs/design/brand-direction.md', 'docs/products.json', 'CHANGES.md', '.shopifyignore']
    .every((k) => k in f) ? ok('all 7 input paths present') : bad(`missing an input path: ${Object.keys(f)}`)
}

console.log('case (b) the emitted JSON is valid + carries the load-bearing gate inputs')
{
  const f = briefToInputs(SPEC)
  const ds = JSON.parse(f['docs/design/design-system.json'])
  eq(Array.isArray(ds.typography.allowed_px) && ds.typography.allowed_px.length > 0, true, 'design-system has a non-empty type scale (preflight + #8 need it)')
  const brief = JSON.parse(f['brief.json'])
  eq(brief.niche, 'haircare', 'brief carries the niche')
  eq(brief.id, 'synthetic-haircare-wildroot', 'brief id derives from niche + brand')
  eq(f['.shopifyignore'].includes('toolkit/'), true, 'shopifyignore excludes the vendored toolkit')
  eq(f['CHANGES.md'].split('\n').filter((l) => l.startsWith('- [ ]')).length, 3, 'one CHANGES item per surface')
}

console.log('case (c) briefToInputs tolerates a minimal spec (defaults, never throws)')
{
  const f = briefToInputs({ niche: 'x', brand: 'B', design_system: { typography: { allowed_px: [16] }, spacing: { scale: [0] } }, goals: {} })
  eq(JSON.parse(f['brief.json']).surfaces.length, 3, 'defaults to hero/about/pdp when surfaces omitted')
  eq(JSON.parse(f['docs/products.json']).length, 0, 'no products → empty catalog, not a crash')
}

console.log('case (a2) niche-wiring: the brief spec materializes docs/brief.md + docs/build-state.json (A2)')
{
  const f = briefToInputs(SPEC)
  ;('docs/brief.md' in f && 'docs/build-state.json' in f) ? ok('canonical niche artifacts emitted') : bad(`missing niche artifact: ${Object.keys(f)}`)
  const bs = JSON.parse(f['docs/build-state.json'])
  eq(bs.niche, 'haircare', 'build-state.json carries the niche (what A2 lens-judge/design-quality read first)')
  eq(bs.client, 'Wildroot', 'build-state.json carries the client/brand label')
  const parsed = parseBrief(f['docs/brief.md'])
  eq(missingFields(parsed).length, 0, 'the materialized docs/brief.md is a COMPLETE intake brief (no missing required field)')
  eq(parsed.niche, 'haircare', 'brief.md niche matches the spec')
  // minimal spec must still yield a complete, non-throwing brief
  const mf = briefToInputs({ niche: 'x', brand: 'B', design_system: { typography: { allowed_px: [16] }, spacing: { scale: [0] } }, goals: {} })
  eq(missingFields(parseBrief(mf['docs/brief.md'])).length, 0, 'minimal spec still yields a complete brief.md')
}

console.log('case (d) defectsFromSummary flattens ONLY blockers, attributed to their gate')
{
  const summary = {
    gates: {
      'repo-hygiene': { pass: false, blockers: [{ id: 'rh.x', page: 'a.liquid', detail: 'bad' }], warnings: [{ id: 'w' }] },
      'design-tokens': { pass: true, blockers: [] },
      'honesty': { pass: false, blockers: [{ id: 'h.claim' }, { id: 'h.urgency', detail: 'fake countdown' }] },
    },
  }
  const d = defectsFromSummary(summary)
  eq(d.length, 3, 'exactly the 3 blockers — warnings are not defects')
  eq(d[0].gate, 'repo-hygiene', 'first defect attributed to its gate')
  eq(d.some((x) => x.id === 'h.urgency'), true, 'carries every blocker id')
  eq(defectsFromSummary({}).length, 0, 'empty/malformed summary → no defects, never throws')
}

console.log(failures ? `\nsynthetic-dogfood: ${failures} FAILED` : '\nsynthetic-dogfood: ALL CASES PASS')
process.exit(failures ? 1 : 0)
