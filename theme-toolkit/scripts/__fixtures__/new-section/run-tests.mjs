#!/usr/bin/env node
// Self-test for new-section.mjs — the section scaffold (RC3: new sections shipped 0 `t:` keys).
// A scaffold that emits *something* proves nothing; every assertion below is a rule the gate stack
// enforces later, checked here at the source instead.
//   (a) the emitted {% schema %} parses and has ZERO raw label/info/name/content strings
//   (b) every emitted t: key resolves in en.default.schema.json AFTER the run
//   (c) the emitted CSS has no hex, no rgba(), no font-family, no !important
//   (d) the emitted liquid has the color-scheme wrapper, the {% style %} padding block, the != blank
//       guards, the text_alignment modifier class, and the placeholder_svg_tag empty state
//   (e) every range default sits on the min + N*step grid (Shopify silently drops a range that does not)
//   (f) re-running is idempotent — no duplicate locale keys
//   (g) a content-specific --role is REFUSED (STD-NAME-01)
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GEN = path.resolve(HERE, '..', '..', 'new-section.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const ok = (cond, m, extra = '') => (cond ? pass(m) : fail(`${m}${extra ? ` — ${extra}` : ''}`))

const staged = []
function stage(caseDir = 'clean') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsec-'))
  fs.cpSync(path.join(HERE, caseDir), dir, { recursive: true })
  staged.push(dir)
  return dir
}
function run(dir, args) {
  const r = spawnSync('node', [GEN, ...args], { cwd: dir, env: { ...process.env }, encoding: 'utf-8' })
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` }
}
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf-8')
const has = (dir, rel) => fs.existsSync(path.join(dir, rel))
const parseLocale = (text) => JSON.parse(text.replace(/^\s*\/\*[\s\S]*?\*\//, ''))

const TRANSLATABLE = new Set(['label', 'info', 'content', 'name'])
function collect(node, trail, hits) {
  if (Array.isArray(node)) { node.forEach((v, i) => collect(v, [...trail, i], hits)); return }
  if (!node || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && TRANSLATABLE.has(k)) hits.push({ path: [...trail, k].join('.'), value: v })
    else collect(v, [...trail, k], hits)
  }
}
function schemaOf(liquid) {
  const m = liquid.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/)
  if (!m) throw new Error('no {% schema %} block')
  return JSON.parse(m[1])
}
function resolve(root, dotted) {
  let n = root
  for (const seg of dotted.split('.')) {
    if (!n || typeof n !== 'object' || !(seg in n)) return undefined
    n = n[seg]
  }
  return n
}

// ── full scaffold: blocks + image ─────────────────────────────────────────────
console.log('case (a-e) --name story-panel --role "Story panel" --blocks item --image')
const full = stage()
{
  const { code, out } = run(full, ['--name', 'story-panel', '--role', 'Story panel', '--blocks', 'item', '--image', '1'])
  ok(code === 0, 'exit 0', out)
  ok(has(full, 'sections/story-panel.liquid'), 'sections/story-panel.liquid written')
  ok(has(full, 'assets/section-story-panel.css'), 'assets/section-story-panel.css written')

  const liquid = read(full, 'sections/story-panel.liquid')
  const schema = schemaOf(liquid)
  pass('(a) {% schema %} parses as JSON')

  const hits = []
  collect(schema, [], hits)
  const raw = hits.filter(h => !h.value.startsWith('t:'))
  ok(raw.length === 0, `(a) ${hits.length} label/info/name/content values, all t: keys`, raw.map(h => `${h.path}="${h.value}"`).join(', '))
  ok(hits.length >= 12, `(a) the scaffold actually emits keys (${hits.length})`, 'a schema with no translatable strings would pass vacuously')

  const en = parseLocale(read(full, 'locales/en.default.schema.json'))
  const missing = hits.map(h => h.value.slice(2)).filter(k => typeof resolve(en, k) !== 'string')
  ok(missing.length === 0, '(b) every t: key resolves in en.default.schema.json', missing.join(', '))

  // the locale splice must not eat the file it edits
  ok(read(full, 'locales/en.default.schema.json').startsWith('/*'), '(b) the auto-generated banner survives the splice')
  ok(resolve(en, 'sections.zzz-sentinel.name') === 'Sentinel section', '(b) pre-existing sections keys survive')
  ok(resolve(en, 'settings_schema.global.settings.zzz_last.label') === 'Sentinel — must stay last', '(b) unrelated top-level keys survive')

  // a locale file with NO "sections" key at all gets the whole branch created
  const fr = parseLocale(read(full, 'locales/fr.schema.json'))
  ok(typeof resolve(fr, 'sections.story-panel.name') === 'string', '(b) a locale with no sections{} gets the branch created')
  ok(resolve(fr, 'settings_schema.global.settings.zzz_last.label') === 'Sentinelle', '(b) …without losing its own keys')

  const css = read(full, 'assets/section-story-panel.css')
  ok(!/#[0-9a-f]{3,8}\b/i.test(css), '(c) no hex literal in the CSS')
  ok(!/rgba\(/i.test(css), '(c) no rgba() literal')
  ok(!/font-family/i.test(css), '(c) no font-family')
  ok(!/!important/.test(css), '(c) no !important')
  ok(/rgb\(var\(--color-foreground\)\)/.test(css), '(c) colours bind to the scheme vars')
  for (const mod of ['--left', '--center', '--right']) {
    ok(css.includes(`.story-panel__header${mod}`), `(c) alignment modifier class ${mod}`)
  }

  ok(/class="story-panel color-\{\{ section\.settings\.color_scheme \}\} gradient"/.test(liquid), '(d) color-scheme wrapper class')
  ok(/\{%-\s*style\s*-%\}[\s\S]*\.section-\{\{ section\.id \}\}-padding[\s\S]*times: 0\.75[\s\S]*min-width: 750px/.test(liquid), '(d) {% style %} padding block with the mobile 0.75 scale + 750px query')
  for (const f of ['subheading', 'heading', 'description']) {
    ok(liquid.includes(`{%- if section.settings.${f} != blank -%}`), `(d) != blank guard on ${f}`)
  }
  ok(liquid.includes('story-panel__header--{{ section.settings.heading_alignment }}'), '(d) alignment is a modifier class, not an inline style')
  ok(!/style="[^"]*text-align/.test(liquid), '(d) …and no inline text-align anywhere')
  ok(liquid.includes("placeholder_svg_tag: 'placeholder-svg"), '(d) placeholder_svg_tag empty state')
  ok(/\| image_url: width:/.test(liquid) && /\| image_tag:/.test(liquid), '(d) image_url + image_tag (not the deprecated img_url)')
  ok(!/\bimg_url\b/.test(liquid), '(d) no deprecated img_url')
  ok(/widths:/.test(liquid) && /sizes:/.test(liquid) && /loading: 'lazy'/.test(liquid), '(d) responsive widths/sizes + lazy loading')
  ok(liquid.includes('{%- for block in section.blocks -%}'), '(d) block loop')
  ok(liquid.includes('{{ block.shopify_attributes }}'), '(d) block.shopify_attributes (theme-editor selection)')

  const ranges = schema.settings.filter(s => s.type === 'range')
  ok(ranges.length === 2, '(e) two padding ranges emitted')
  for (const r of ranges) {
    ok(Number.isInteger((r.default - r.min) / r.step), `(e) ${r.id} default ${r.default} on the ${r.min}+N*${r.step} grid`)
    ok(Number.isInteger((r.max - r.min) / r.step), `(e) ${r.id} span ${r.min}..${r.max} is a whole number of steps`)
  }

  // the settings the standard names, present and typed correctly
  const byId = Object.fromEntries(schema.settings.filter(s => s.id).map(s => [s.id, s]))
  ok(byId.color_scheme?.type === 'color_scheme' && byId.color_scheme.default === 'scheme-1', '(a) color_scheme defaults to scheme-1')
  ok(byId.subheading?.type === 'inline_richtext', '(a) subheading is inline_richtext')
  ok(byId.heading?.type === 'text', '(a) heading is text')
  ok(byId.description?.type === 'richtext', '(a) description is richtext')
  ok(byId.heading_alignment?.type === 'text_alignment', '(a) heading_alignment uses the text_alignment input type')
  ok(byId.image?.type === 'image_picker', '(a) --image emits an image_picker (not a text field holding a filename)')
  ok(schema.settings.some(s => s.type === 'header' && s.content), '(a) a header group for layout')
  ok(schema.blocks?.[0]?.type === 'item' && Array.isArray(schema.presets), '(a) block type + presets')
}

// ── (e/g) range grid is asserted by the generator itself, not only by this suite ──
console.log('\ncase: the generator itself refuses an off-grid range default')
{
  const dir = stage()
  const tplDir = fs.mkdtempSync(path.join(os.tmpdir(), 'newsec-tpl-'))
  fs.cpSync(path.resolve(HERE, '..', '..', '..', 'templates', 'section'), tplDir, { recursive: true })
  const f = path.join(tplDir, 'schema.json.tpl')
  fs.writeFileSync(f, fs.readFileSync(f, 'utf-8').replace('"default": 36', '"default": 37'))
  const r = spawnSync('node', [GEN, '--name', 'grid-probe', '--role', 'Grid probe'],
    { cwd: dir, env: { ...process.env, TEMPLATE_DIR: tplDir }, encoding: 'utf-8' })
  ok(r.status === 2, '(e) off-grid default is an ENV-ERROR (exit 2)', `got ${r.status}`)
  ok(/not on the 0 \+ N\*4 grid/.test(`${r.stdout}${r.stderr}`), '(e) …and says which grid it missed')
  ok(!has(dir, 'sections/grid-probe.liquid'), '(e) …having written nothing')
  fs.rmSync(tplDir, { recursive: true, force: true })
}

// ── minimal scaffold ──────────────────────────────────────────────────────────
console.log('\ncase: minimal scaffold (no --blocks, no --image)')
{
  const dir = stage()
  const { code, out } = run(dir, ['--name', 'promo-band', '--role', 'Promo band'])
  ok(code === 0, 'exit 0', out)
  const liquid = read(dir, 'sections/promo-band.liquid')
  const schema = schemaOf(liquid)
  ok(!liquid.includes('placeholder_svg_tag'), 'no image machinery without --image')
  ok(!liquid.includes('shopify_attributes'), 'no block loop without --blocks')
  ok(schema.blocks === undefined, 'no blocks[] in the schema')
  ok(schema.presets?.[0]?.blocks === undefined, 'no preset blocks either')
  const hits = []
  collect(schema, [], hits)
  ok(hits.every(h => h.value.startsWith('t:')), 'still 100% t: keys')
  const en = parseLocale(read(dir, 'locales/en.default.schema.json'))
  ok(hits.every(h => typeof resolve(en, h.value.slice(2)) === 'string'), 'still 100% resolvable')
  const css = read(dir, 'assets/section-promo-band.css')
  ok(!/__item|__list/.test(css), 'no dead block CSS emitted')
}

// ── (f) idempotence ───────────────────────────────────────────────────────────
console.log('\ncase (f) re-running is idempotent — no duplicate locale keys')
{
  const before = read(full, 'locales/en.default.schema.json')
  const { code, out } = run(full, ['--name', 'story-panel', '--role', 'Story panel', '--blocks', 'item', '--image', '--force'])
  ok(code === 0, 'exit 0 with --force', out)
  const after = read(full, 'locales/en.default.schema.json')
  ok(after === before, '(f) the locale file is byte-identical on the second run')
  ok((after.match(/"story-panel"/g) || []).length === 1, '(f) exactly one "story-panel" key')
  parseLocale(after)
  pass('(f) locale still parses')
  ok(/key already present/.test(out), '(f) the run reports the locale as unchanged rather than claiming a write')
}

console.log('\ncase: a second run WITHOUT --force refuses instead of clobbering')
{
  const { code, out } = run(full, ['--name', 'story-panel', '--role', 'Story panel'])
  ok(code === 1, 'exit 1', out)
  ok(/already exists/.test(out), 'says the section already exists')
}

// ── (g) STD-NAME-01 ───────────────────────────────────────────────────────────
console.log('\ncase (g) content-specific --role is REFUSED (STD-NAME-01)')
for (const [role, why] of [
  ['Meet Andy', '"Meet <person>"'],
  ["Andy's story", 'possessive'],
  ['Our story', '"Our <x>"'],
  ['Story by Andy', 'capitalised personal name mid-label'],
]) {
  const dir = stage()
  const { code, out } = run(dir, ['--name', 'story-panel', '--role', role])
  ok(code === 1, `(g) --role "${role}" → exit 1 (${why})`, out.trim())
  ok(/STD-NAME-01/.test(out), `(g) …cites STD-NAME-01 for "${role}"`)
  ok(/Try: --role "Story panel"/.test(out), `(g) …and suggests a role-based alternative for "${role}"`)
  ok(!has(dir, 'sections/story-panel.liquid'), `(g) …writing nothing for "${role}"`)
}

console.log('\ncase: role-shaped names are NOT refused (a false refusal is as bad as a miss)')
for (const role of ['Story panel', 'Value props', 'FAQ accordion', 'Logo list']) {
  const dir = stage()
  const { code, out } = run(dir, ['--name', 'probe-section', '--role', role])
  ok(code === 0, `role "${role}" accepted`, out.trim())
}

// ── refusals + env errors ─────────────────────────────────────────────────────
console.log('\ncase: refusals and env errors')
{
  const { code, out } = run(path.join(HERE, 'broken', 'not-a-theme'), ['--name', 'story-panel', '--role', 'Story panel'])
  ok(code === 1, 'not a theme repo → exit 1', out.trim())
  ok(!has(path.join(HERE, 'broken', 'not-a-theme'), 'sections/story-panel.liquid'), '…and the fixture dir is untouched')
}
{
  const dir = stage()
  const { code, out } = run(dir, ['--name', 'StoryPanel', '--role', 'Story panel'])
  ok(code === 1, 'non-kebab --name → exit 1', out.trim())
}
{
  const dir = stage('broken/malformed-locale')
  const { code, out } = run(dir, ['--name', 'story-panel', '--role', 'Story panel'])
  ok(code === 2, 'unparseable locale JSON → exit 2 (env error)', out.trim())
  ok(!has(dir, 'sections/story-panel.liquid'), '…having written NOTHING (validate-all-then-write)')
  ok(!has(dir, 'assets/section-story-panel.css'), '…including the CSS')
}
{
  const dir = stage()
  const { code, out } = run(dir, ['--name', 'story-panel', '--role', 'Story panel', '--dry-run'])
  ok(code === 0, '--dry-run → exit 0', out.trim())
  ok(/would write\s+sections\/story-panel\.liquid/.test(out), '--dry-run names the files')
  ok(!has(dir, 'sections/story-panel.liquid'), '--dry-run writes nothing')
  ok(!has(dir, 'assets/section-story-panel.css'), '--dry-run writes no CSS')
  ok(read(dir, 'locales/en.default.schema.json') === read(path.join(HERE, 'clean'), 'locales/en.default.schema.json'), '--dry-run leaves locales untouched')
}

// ── (h) gate #8 design-tokens conformance, asserted at the source ─────────────
// Adversarial probe 2026-07-23: the scaffold's CSS BLOCKED gate #8 with 6 ds.spacing findings on a
// skeleton theme, because check-design-system resolves rem at 16px unless the base carries Dawn's
// 62.5% reset. The values are correct AT 62.5% (0.8rem = 8px). Pinned here so a future edit to
// section.css.tpl cannot introduce a length that is off-scale under the root the theme actually uses.
console.log('\ncase (h) emitted CSS spacing lands on the DS scale at Dawn\'s 62.5% rem root')
{
  const dir = stage()
  run(dir, ['--name', 'story-panel', '--role', 'Story panel', '--blocks', 'item', '--image'])
  const css = read(dir, 'assets/section-story-panel.css')
  // the scale the toolkit's own reference contract ships (docs/design/design-system.json)
  const SCALE = new Set([0, 4, 8, 12, 16, 24, 32, 48, 64])
  const SPACING_PROP = /(?:^|[;{])\s*(margin|padding|gap|row-gap|column-gap|margin-top|margin-bottom|margin-left|margin-right|margin-inline|margin-block|padding-top|padding-bottom|padding-left|padding-right|inset)\s*:([^;}]+)/g
  const offScale = []
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(SPACING_PROP)) {
    for (const len of m[2].matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)) {
      const px = len[2] === 'px' ? parseFloat(len[1]) : parseFloat(len[1]) * 10
      if (!SCALE.has(Math.abs(px))) offScale.push(`${m[1]}: ${len[0]} → ${px}px`)
    }
  }
  ok(offScale.length === 0, 'every spacing length is on the 4px scale at 1rem = 10px', offScale.join(', '))
  ok(!/font-size\s*:/.test(css), 'no font-size — the section inherits the theme type scale, it does not fork it')
  ok(!/!important/.test(css), 'no !important')
}

for (const d of staged) fs.rmSync(d, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
