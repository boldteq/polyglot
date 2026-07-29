// Hermetic fixture for gate #54 structural-differentiation. PURE core + git end-to-end (temp repos with a
// `base` tag). No MCP, no network, no global registry (STRUCT_NO_REGISTRY=1 except the cross-build case,
// which uses a temp registry file). Proves: a recolour of the base is flagged; adding OR rebuilding a real
// section is NOT (the §Z "never punish real work" guard); cross-build near-dup warns; empty theme → N/A.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tokenStream, schemaSignature, isCosmeticOnly, cosine, isNonTrivialSection, structuralFingerprint, freqVec } from '../../check-structural-differentiation.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))
const truthy = (v, m) => (v ? ok(m) : bad(m))

const HERO_BASE = '<div class="hero"><h1 class="hero__title">{{ section.settings.heading }}</h1><p class="hero__sub">x</p></div>\n{% schema %}{"name":"Hero","settings":[{"type":"text","id":"heading","default":"Old"},{"type":"color","id":"bg","default":"#ffffff"}]}{% endschema %}\n{% stylesheet %}.hero{background:#ffffff;padding:20px}{% endstylesheet %}'
// same DOM + same schema TYPES/IDS — only defaults + css values differ → a recolour
const HERO_RECOLOUR = '<div class="hero"><h1 class="hero__title">{{ section.settings.heading }}</h1><p class="hero__sub">x</p></div>\n{% schema %}{"name":"Hero","settings":[{"type":"text","id":"heading","default":"New Brand"},{"type":"color","id":"bg","default":"#c0392b"}]}{% endschema %}\n{% stylesheet %}.hero{background:#c0392b;padding:48px}{% endstylesheet %}'
// genuinely rebuilt structure (different DOM + different schema shape), in place, no new file
const HERO_REBUILT = '<section class="editorial"><figure class="editorial__media"><img></figure><div class="editorial__copy"><h1 class="editorial__h">x</h1><ul class="editorial__list"><li>a</li><li>b</li></ul></div></section>\n{% schema %}{"name":"Hero","settings":[{"type":"image_picker","id":"img"},{"type":"richtext","id":"body"},{"type":"url","id":"cta"}]}{% endschema %}'
const STORY_CUSTOM = '<section class="story"><div class="story__grid"><article class="story__card">a</article><article class="story__card">b</article></div></section>\n{% schema %}{"name":"Story","settings":[{"type":"richtext","id":"body"}]}{% endschema %}'

console.log('case (a) tokenStream — tag.sortedClasses, strips liquid/schema/stylesheet')
{
  eq(tokenStream(HERO_BASE), ['div.hero', 'h1.hero__title', 'p.hero__sub'], 'DOM structure only (no schema/css tags, no {{ }})')
}

console.log('case (b) schemaSignature — TYPES+ids, not DEFAULTS (a recolour has the same signature)')
{
  eq(schemaSignature(HERO_BASE), schemaSignature(HERO_RECOLOUR), 'recolour → identical schema signature')
  eq(schemaSignature(HERO_BASE), ['set:text:heading', 'set:color:bg'], 'setting type:id list')
  truthy(JSON.stringify(schemaSignature(HERO_REBUILT)) !== JSON.stringify(schemaSignature(HERO_BASE)), 'a rebuilt section has a different signature')
}

console.log('case (c) isCosmeticOnly — value-only edit true; structural rebuild false')
{
  truthy(isCosmeticOnly(HERO_BASE, HERO_RECOLOUR), 'recolour (same structure, diff values) → cosmetic')
  truthy(!isCosmeticOnly(HERO_BASE, HERO_REBUILT), 'genuine rebuild → NOT cosmetic')
}

console.log('case (d) cosine + (e) isNonTrivialSection')
{
  const v = freqVec(['a', 'a', 'b'])
  eq(Number(cosine(v, v).toFixed(3)), 1, 'identical vectors → 1')
  eq(cosine(freqVec(['a']), freqVec(['b'])), 0, 'disjoint → 0')
  truthy(isNonTrivialSection(STORY_CUSTOM) && !isNonTrivialSection('<div></div>'), 'real section non-trivial, stub trivial')
  truthy(Object.keys(structuralFingerprint([HERO_BASE, STORY_CUSTOM])).length >= 5, 'build fingerprint has structure')
}

// ── git end-to-end ───────────────────────────────────────────────────────────
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-structural-differentiation.mjs')
const git = (dir, args) => execFileSync('git', ['-c', 'user.email=t@t.co', '-c', 'user.name=t', ...args], { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })
function makeRepo(baseFiles, buildFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'struct-'))
  const put = (rel, c) => { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), c) }
  for (const [rel, c] of Object.entries(baseFiles)) put(rel, c)
  git(dir, ['init', '-q']); git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'base']); git(dir, ['tag', 'base'])
  if (Object.keys(buildFiles).length) {
    for (const [rel, c] of Object.entries(buildFiles)) { if (c === null) fs.rmSync(path.join(dir, rel), { force: true }); else put(rel, c) }
    git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'build'])
  }
  return dir
}
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'struct-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, STRUCT_NO_REGISTRY: '1', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'structural-differentiation.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const wIds = (rep) => new Set((rep?.warnings || []).map((w) => w.id))
const bIds = (rep) => new Set((rep?.blockers || []).map((b) => b.id))

console.log('case (f) recolour-only build → cosmetic-only flagged (warn in dev, BLOCK at publish-grade)')
{
  const dir = makeRepo({ 'sections/hero.liquid': HERO_BASE }, { 'sections/hero.liquid': HERO_RECOLOUR })
  const dev = run(dir)
  dev.code === 0 && wIds(dev.rep).has('struct.cosmetic-only') ? ok('recolour in dev → WARN, exit 0') : bad(`recolour dev: code ${dev.code} w ${[...wIds(dev.rep)]}`)
  const strict = run(dir, { DS_REQUIRE_SCOPE: '1' })
  strict.code === 1 && bIds(strict.rep).has('struct.cosmetic-only') ? ok('recolour at publish-grade → BLOCK, exit 1') : bad(`recolour strict: code ${strict.code} b ${[...bIds(strict.rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (g) added a real custom section → NOT flagged (differentiation is architectural)')
{
  const dir = makeRepo({ 'sections/hero.liquid': HERO_BASE }, { 'sections/hero.liquid': HERO_RECOLOUR, 'sections/custom-story.liquid': STORY_CUSTOM })
  const { code, rep } = run(dir)
  code === 0 && !wIds(rep).has('struct.cosmetic-only') && bIds(rep).size === 0 ? ok('recolour + 1 new custom section → PASS') : bad(`add-custom: code ${code} w ${[...wIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (h) §Z guard — rebuilding a section in place (real structural change) is NOT flagged')
{
  const dir = makeRepo({ 'sections/hero.liquid': HERO_BASE }, { 'sections/hero.liquid': HERO_REBUILT })
  const { code, rep } = run(dir, { DS_REQUIRE_SCOPE: '1' })
  code === 0 && bIds(rep).size === 0 ? ok('genuine in-place rebuild → PASS even at publish-grade') : bad(`rebuild: code ${code} b ${[...bIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (i) cross-build near-dup → warn (two builds, shared registry)')
{
  const reg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'struct-reg-')), 'fp.json')
  const build = { 'sections/hero.liquid': HERO_RECOLOUR, 'sections/custom-story.liquid': STORY_CUSTOM }
  const d1 = makeRepo({ 'sections/hero.liquid': HERO_BASE }, build)
  run(d1, { FINGERPRINT_REGISTRY: reg, STRUCT_NO_REGISTRY: '', STRUCT_BUILD_NAME: 'client-one' }) // registers
  const d2 = makeRepo({ 'sections/hero.liquid': HERO_BASE }, build)
  const r2 = run(d2, { FINGERPRINT_REGISTRY: reg, STRUCT_NO_REGISTRY: '', STRUCT_BUILD_NAME: 'client-two' })
  wIds(r2.rep).has('struct.cross-build-dup') ? ok('second identical build → cross-build-dup WARN') : bad(`cross-build: w ${[...wIds(r2.rep)]}`)
  fs.rmSync(d1, { recursive: true, force: true }); fs.rmSync(d2, { recursive: true, force: true }); fs.rmSync(path.dirname(reg), { recursive: true, force: true })
}

console.log('case (j) empty theme (base tag, no sections changed) → N/A, not a vacuous pass')
{
  const dir = makeRepo({ 'sections/hero.liquid': HERO_BASE }, {}) // no build changes
  const { code, rep } = run(dir)
  code === 0 && rep?.pass === true && [...wIds(rep)].some((x) => x.includes('n-a')) && !wIds(rep).has('struct.cosmetic-only')
    ? ok('nothing changed → N/A warn, pass (skip != vacuous-pass)') : bad(`n-a: code ${code} w ${[...wIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(failures ? `\nstructural-differentiation: ${failures} FAILED` : '\nstructural-differentiation: ALL CASES PASS')
process.exit(failures ? 1 : 0)
