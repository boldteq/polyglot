// check-briefs had ALL 7 of its blocking checks unproven (QA-1's second-worst).
//
// This is compass's Step-4 gate: it runs BEFORE design is dispatched, so when it fires it stops a
// build from starting on briefs that would send drape and ink down the wrong path. Every one of those
// blockers could halt a client project and none had ever been shown to fire. An unproven blocker is
// indistinguishable from an absent one.
//
// Each case plants exactly one defect against a known-good brief and asserts the specific id.
// Hermetic: temp dirs only.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-briefs.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

// a brief that satisfies every rule: valid status, a canonical recipe anchor, owned slots,
// and both conversion surfaces (spark hero + merch body) so STORE_BUILD is satisfied too.
const GOOD = `# Home brief
status: ready
recipe: home-v1

| Slot | Owner | Status |
|---|---|---|
| hero headline | spark | ready |
| pdp body copy | merch | ready |
`

function run(briefs, env = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'briefs-'))
  const dir = path.join(d, 'content', 'briefs')
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(briefs)) fs.writeFileSync(path.join(dir, name), body)
  const reportDir = path.join(d, 'gate-reports')
  const r = spawnSync(process.execPath, [GATE], { cwd: d, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: reportDir, STORE_BUILD: '', ...env } })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'briefs.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}
const expectBlock = (name, briefs, id, env) => {
  const { code, ids } = run(briefs, env)
  if (code === 1 && ids.has(id)) ok(`${name} → ${id}`)
  else bad(`${name}: expected exit 1 + ${id}, got exit ${code} + [${[...ids].join(', ') || 'none'}]`)
}

console.log('check-briefs — every BLOCKING rule, planted one at a time')
{
  const { code, ids } = run({ 'home.md': GOOD })
  code === 0 ? ok('the clean brief passes (no false blocks)') : bad(`clean brief blocked: [${[...ids].join(', ')}]`)
}

console.log('\n── per-brief rules ──')
expectBlock('no status line', { 'home.md': GOOD.replace('status: ready\n', '') }, 'briefs.status-invalid')
expectBlock('status outside ready|partial|missing', { 'home.md': GOOD.replace('status: ready', 'status: done') }, 'briefs.status-invalid')
expectBlock('neither `recipe:` nor `no-recipe:` anchor', { 'home.md': GOOD.replace('recipe: home-v1\n', '') }, 'briefs.no-recipe-anchor')
expectBlock('lorem ipsum in the copy', { 'home.md': `${GOOD}\nLorem ipsum dolor sit amet.\n` }, 'briefs.placeholder-content')
expectBlock('status:ready but still contains a bare TBD', { 'home.md': `${GOOD}\nHeadline: TBD\n` }, 'briefs.placeholder-content')
expectBlock('status:ready but still contains TODO', { 'home.md': `${GOOD}\nCTA: TODO\n` }, 'briefs.placeholder-content')
expectBlock('a content slot with no owner',
  { 'home.md': GOOD.replace('| hero headline | spark | ready |', '| hero headline |  | ready |') }, 'briefs.slot-no-owner')

console.log('\n── across the brief set ──')
{
  // >20% status:missing blocks design dispatch (protocol §0): 2 of 5 = 40%
  const missing = GOOD.replace('status: ready', 'status: missing')
  expectBlock('>20% of briefs are status:missing', {
    'a.md': GOOD, 'b.md': GOOD, 'c.md': GOOD, 'd.md': missing, 'e.md': missing,
  }, 'briefs.too-many-missing')

  // exactly 20% must NOT block — the threshold is >20%, and a false block here stalls a real build
  const { code } = run({ 'a.md': GOOD, 'b.md': GOOD, 'c.md': GOOD, 'd.md': GOOD, 'e.md': missing })
  code === 0 ? ok('exactly 20% missing → allowed (threshold is >20%)') : bad('20% missing falsely blocked')
}

console.log('\n── STORE_BUILD conversion surfaces ──')
expectBlock('no spark-owned hero slot',
  { 'home.md': GOOD.replace('| hero headline | spark | ready |', '| intro text | ink | ready |') },
  'briefs.no-spark-hero', { STORE_BUILD: '1' })
expectBlock('no merch-owned body slot',
  { 'home.md': GOOD.replace('| pdp body copy | merch | ready |', '| footer note | ink | ready |') },
  'briefs.no-merch-body', { STORE_BUILD: '1' })
{
  // the same brief WITHOUT STORE_BUILD must not demand conversion surfaces — a non-ecom site
  // (brochure, portfolio) legitimately has neither, and blocking it would be a false positive
  const noSurfaces = GOOD.replace('| hero headline | spark | ready |', '| intro text | ink | ready |')
    .replace('| pdp body copy | merch | ready |', '| footer note | ink | ready |')
  const { code } = run({ 'home.md': noSurfaces })
  code === 0 ? ok('non-store build → conversion surfaces not required') : bad('conversion surfaces demanded outside STORE_BUILD')
}

console.log('\n── drafting markers are expected below status:ready ──')
{
  // a partial brief legitimately carries TBDs — blocking those would stall normal drafting
  const partialTbd = GOOD.replace('status: ready', 'status: partial') + '\nHeadline: TBD\n'
  const { code, ids } = run({ 'home.md': partialTbd })
  code === 0 && !ids.has('briefs.placeholder-content')
    ? ok('status:partial + TBD → warn, not block') : bad(`partial brief with TBD was blocked: [${[...ids].join(', ')}]`)
}

console.log('\n── no false blocks on legitimate variants ──')
{
  const noRecipe = GOOD.replace('recipe: home-v1', 'no-recipe: bespoke campaign page, nothing in the library fits')
  run({ 'home.md': noRecipe }).code === 0 ? ok('`no-recipe:` justification accepted as an anchor') : bad('no-recipe anchor falsely blocked')
  const partial = GOOD.replace('status: ready', 'status: partial')
  run({ 'home.md': partial }).code === 0 ? ok('status: partial accepted') : bad('status: partial falsely blocked')
}

console.log(failures === 0 ? '\nbriefs: ALL CASES PASS' : `\nbriefs: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
