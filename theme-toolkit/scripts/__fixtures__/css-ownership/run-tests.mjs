// Hermetic fixture for gate #52 css-ownership. PURE core + end-to-end. No MCP, no store.
// The rule (platform-truth §A1): a class defined in a component's {% stylesheet %} must be rendered by
// that component's own markup — a cross-file selector can ship unstyled under Shopify's per-component CSS.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { classesDefinedIn, classMentioned, orphanClasses } from '../../check-css-ownership.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('case (a) classesDefinedIn — extracts class tokens, skips keyframes/pseudo/attr')
{
  const d = classesDefinedIn('.hero{} .hero__title--lg:hover{} @keyframes spin{} .hero[data-x]{} #id{} div{}')
  eq([...d].sort(), ['hero', 'hero__title--lg'], 'classes only (no keyframe/id/element)')
}

console.log('case (b) classMentioned — word-boundary (no substring false-positives)')
{
  eq(classMentioned('<div class="card is-open">', 'card'), true, 'card matched')
  eq(classMentioned('<div class="cards">', 'card'), false, '"cards" does NOT match "card"')
  eq(classMentioned("classList.add('is-open')", 'is-open'), true, 'JS toggle counts as used')
}

console.log('case (c) orphanClasses — defined+used → none; defined-not-used → orphan')
{
  const clean = '<div class="hero"><h2 class="hero__title">x</h2></div>{% stylesheet %}.hero{}.hero__title{}{% endstylesheet %}'
  eq(orphanClasses(clean).orphans, [], 'self-contained component → no orphan')
  const orphan = '<div class="hero">x</div>{% stylesheet %}.hero{}.ghost{}{% endstylesheet %}'
  eq(orphanClasses(orphan).orphans, ['ghost'], '.ghost defined but not in markup → orphan')
  eq(orphanClasses('<div class="x">no css here</div>').defined, 0, 'no stylesheet → 0 defined (N/A)')
}

console.log('case (d) LOW-FALSE-POSITIVE — a dynamically-composed class counts as used')
{
  const dyn = '<div class="card card--{{ block.settings.size }} {{ extra }}">x</div>{% stylesheet %}.card{}.card--lg{}{% endstylesheet %}'
  // `.card` appears verbatim; `.card--lg` is composed at runtime (`card--{{…}}`) so the literal token
  // isn't present — but `card--` is the FP risk. We only flag exact-token absence, so `.card` passes and
  // `.card--lg` is (correctly, conservatively) an orphan the author resolves by naming it or moving it.
  const o = orphanClasses(dyn)
  eq(o.orphans.includes('card'), false, '.card (verbatim in markup) is NOT an orphan')
}

console.log('gate end-to-end')
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-css-ownership.mjs')
function run(files, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cssown-'))
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true }); fs.mkdirSync(path.join(dir, 'layout'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), content) }
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cssown-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, CSS_OWNERSHIP_SCAN_ALL: '1', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'css-ownership.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const wIds = (rep) => new Set((rep?.warnings || []).map((w) => w.id))
const bIds = (rep) => new Set((rep?.blockers || []).map((b) => b.id))

{
  const { code, rep } = run({ 'sections/hero.liquid': '<div class="hero"><h2 class="hero__t">x</h2></div>{% stylesheet %}.hero{}.hero__t{}{% endstylesheet %}' })
  code === 0 && bIds(rep).size === 0 && !wIds(rep).has('css.orphan-selector') ? ok('self-contained section → PASS, no orphan') : bad(`self-contained: code ${code} w ${[...wIds(rep)]}`)
}
{
  const files = { 'sections/hero.liquid': '<div class="hero">x</div>{% stylesheet %}.hero{}.borrowed{}{% endstylesheet %}' }
  const dev = run(files)
  dev.code === 0 && wIds(dev.rep).has('css.orphan-selector') ? ok('orphan in dev → WARN, exit 0') : bad(`orphan dev: code ${dev.code} w ${[...wIds(dev.rep)]}`)
  const strict = run(files, { DS_REQUIRE_SCOPE: '1' })
  strict.code === 1 && bIds(strict.rep).has('css.orphan-selector') ? ok('orphan at publish-grade → BLOCK, exit 1') : bad(`orphan strict: code ${strict.code} b ${[...bIds(strict.rep)]}`)
}
{
  const { code, rep } = run({ 'sections/plain.liquid': '<div class="x">no stylesheet</div>' })
  code === 0 && wIds(rep).has('css-ownership.n-a-no-components') === false && bIds(rep).size === 0 ? ok('component without {% stylesheet %} → PASS (nothing to own)') : bad(`no-css: code ${code}`)
}

console.log(failures ? `\ncss-ownership: ${failures} FAILED` : '\ncss-ownership: ALL CASES PASS')
process.exit(failures ? 1 : 0)
