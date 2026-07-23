// The colour swap must be IDENTITY, or it is vandalism (CB-1, 2026-07-23).
//
// Replacing `#6C6C6C` with `var(--ds-color-body-gray)` is only safe when that var IS `#6C6C6C`. Two
// ways to get it wrong, both silent:
//   · swapping a literal that merely LOOKS close to a token → the client's colour quietly changes
//   · swapping in a theme that never loads design-system.css → the custom property is undefined, the
//     whole declaration is invalid, and the colour is DELETED rather than preserved
// So: exact canonical equality only, and --apply refuses unless the cascade is generated AND wired.
//
// Pure functions + the real CLI against temp themes. No client repo, no network.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { canonicalColor, tokenMap, snapCss, snapLiquidStyles } from '../../snap-colors-to-tokens.mjs'

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'snap-colors-to-tokens.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const DS = { color: { body_gray: '#6C6C6C', dark_green: '#2C3D1E', surface: '#FFFFFF', on_green_muted: 'rgba(255,255,255,0.8)', _source: 'the brand PDF' } }

console.log('case (a) canonicalisation — equal colours compare equal, different ones never do')
{
  eq(canonicalColor('#6C6C6C'), '#6c6c6c', 'case folded')
  eq(canonicalColor('#abc'), '#aabbcc', '3-digit expanded')
  eq(canonicalColor('rgb(108, 108, 108)'), '#6c6c6c', 'rgb() → hex, so it matches the hex token')
  eq(canonicalColor('rgba(255,255,255,1)'), '#ffffff', 'fully-opaque rgba collapses to hex')
  eq(canonicalColor('rgba(255, 255, 255, 0.8)'), 'rgba(255,255,255,0.8)', 'alpha preserved + whitespace stripped')
  eq(canonicalColor('#6c6c6d'), '#6c6c6d', 'a one-digit difference stays distinct')
  eq(canonicalColor('var(--x)'), null, 'not a colour → null, never a guess')
  eq(canonicalColor('#12345678'), null, '8-digit hex is not assumed equal to its 6-digit prefix')
}

console.log('case (b) the token map skips documentation keys and keeps values verbatim')
{
  const m = tokenMap(DS)
  eq(m.get('#6c6c6c'), '--ds-color-body-gray', 'snake_case → kebab-case token name')
  eq(m.get('rgba(255,255,255,0.8)'), '--ds-color-on-green-muted', 'rgba token indexed')
  eq([...m.values()].some((v) => v.includes('source')), false, '_source is not a token')
}

console.log('case (c) THE RULE — only exact matches are swapped')
{
  const tokens = tokenMap(DS)
  const css = '.a{color:#6C6C6C;background:#6c6c6d;border-color:rgb(44,61,30)}'
  const { text, swaps, skipped } = snapCss(css, tokens)
  eq(swaps.length, 2, 'the exact hex and the rgb() equal to a token are swapped')
  text.includes('var(--ds-color-body-gray)') ? ok('#6C6C6C → body-gray') : bad('exact hex not swapped')
  text.includes('var(--ds-color-dark-green)') ? ok('rgb(44,61,30) → dark-green (same colour, different notation)') : bad('rgb form not swapped')
  text.includes('#6c6c6d') ? ok('the near-miss literal is LEFT ALONE') : bad('a near-miss was swapped — the colour changed')
  eq(skipped.length, 1, 'and it is reported, not silently dropped')
  eq(skipped[0].reason, 'no token has this exact value', 'with the reason')
}

console.log('case (d) shadow/filter values are left alone (the gate exempts them too)')
{
  const tokens = tokenMap(DS)
  const css = '.a{box-shadow:0 0 4px #6C6C6C;filter:drop-shadow(0 0 2px #6C6C6C);color:#6C6C6C}'
  const { text, swaps } = snapCss(css, tokens)
  eq(swaps.length, 1, 'only the real colour property is swapped')
  eq((text.match(/#6C6C6C/gi) || []).length, 2, 'both shadow literals survive untouched')
}

console.log('case (e2) an already-correct rgb(var(--color-*)) binding is NOT treated as a literal')
{
  // Caught on real data: a naive `[^)]*` truncates at the inner `)` and reports 194 phantom literals
  // like `rgba(var(--color-foreground` — those are correct scheme bindings the gate exempts.
  const tokens = tokenMap(DS)
  const css = '.a{color:rgb(var(--color-foreground));background:rgba(var(--color-background),0.5)}'
  const { text, swaps, skipped } = snapCss(css, tokens)
  eq(swaps.length, 0, 'nothing swapped')
  eq(skipped.length, 0, 'and nothing reported as an unmatched literal')
  eq(text, css, 'file untouched')
}

console.log('case (e) a file with nothing to snap is returned byte-identical')
{
  const css = '.a{color:var(--ds-color-body-gray);margin:0}'
  const { text, swaps } = snapCss(css, tokenMap(DS))
  eq(swaps.length, 0, 'no swaps')
  eq(text, css, 'text unchanged — no cosmetic reformatting of files we did not edit')
}

// ── the CLI safety gate ──────────────────────────────────────────────────────────────────
function theme({ wired, cascade }) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'))
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.mkdirSync(path.join(d, 'assets'), { recursive: true })
  fs.mkdirSync(path.join(d, 'layout'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'design', 'design-system.json'), JSON.stringify(DS))
  fs.writeFileSync(path.join(d, 'assets', 'section-x.css'), '.a{color:#6C6C6C}')
  if (cascade) fs.writeFileSync(path.join(d, 'assets', 'design-system.css'), ':root{--ds-color-body-gray:#6C6C6C;}')
  fs.writeFileSync(path.join(d, 'layout', 'theme.liquid'),
    wired ? "<head>{{ 'design-system.css' | asset_url | stylesheet_tag }}</head>" : '<head></head>')
  return d
}
const run = (d, args) => spawnSync(process.execPath, [CLI, ...args], { cwd: d, encoding: 'utf-8' })

console.log('case (f) --apply REFUSES when the cascade is missing or unwired (it would delete colours)')
{
  for (const [label, opts] of [['no cascade', { cascade: false, wired: true }], ['unwired', { cascade: true, wired: false }]]) {
    const d = theme(opts)
    const r = run(d, ['--apply'])
    // bind before testing — a statement STARTING with a regex literal parses as division
    const explained = /REFUSING to apply/.test(r.stderr)
    r.status === 1 ? ok(`${label} → refused (exit 1)`) : bad(`${label}: expected exit 1, got ${r.status}`)
    explained ? ok(`${label} → says why`) : bad(`${label}: no explanation`)
    fs.readFileSync(path.join(d, 'assets', 'section-x.css'), 'utf-8').includes('#6C6C6C')
      ? ok(`${label} → the stylesheet was NOT modified`) : bad(`${label}: it edited the file anyway`)
    fs.rmSync(d, { recursive: true, force: true })
  }
}

console.log('case (g) a dry run is safe even with the cascade missing, and writes nothing')
{
  const d = theme({ cascade: false, wired: false })
  const r = run(d, [])
  const previewed = /would snap/.test(r.stdout)
  r.status === 0 ? ok('dry run exits 0') : bad(`dry run exit ${r.status}: ${r.stderr.slice(0, 90)}`)
  previewed ? ok('reports what it would do') : bad('no preview output')
  fs.readFileSync(path.join(d, 'assets', 'section-x.css'), 'utf-8').includes('#6C6C6C')
    ? ok('file untouched by the dry run') : bad('dry run wrote to disk')
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('case (h) with both preconditions met, --apply writes the swap')
{
  const d = theme({ cascade: true, wired: true })
  const r = run(d, ['--apply'])
  r.status === 0 ? ok('applies cleanly') : bad(`exit ${r.status}: ${r.stderr.slice(0, 90)}`)
  const out = fs.readFileSync(path.join(d, 'assets', 'section-x.css'), 'utf-8')
  out.includes('var(--ds-color-body-gray)') ? ok('literal replaced by the token') : bad(`not swapped: ${out}`)
  out.includes('#6C6C6C') ? bad('the literal is still there') : ok('no literal hex remains')
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('\ninline {% style %} blocks in sections/snippets (editability.1.3)')
{
  // assets/*.css was the only thing this tool ever saw, which is why cravinbyandy still had 74
  // `hex/rgb where a scheme var exists` findings AFTER every stylesheet literal had been bound —
  // the colours were sitting in inline {% style %} blocks.
  const T = tokenMap({ color: { dark_green: '#2C3D1E', surface: '#FFFFFF' } })

  const one = snapLiquidStyles('{% style %}\n.a { color: #2c3d1e; }\n{% endstyle %}', T)
  const boundVar = /var\(--ds-color-dark-green\)/
  one.swaps.length === 1 && boundVar.test(one.text)
    ? ok('a literal inside {% style %} is swapped') : bad(`got ${one.swaps.length}: ${one.text}`)

  // {% stylesheet %} (the section-scoped form) too
  const two = snapLiquidStyles('{% stylesheet %}.b { color: #FFFFFF; }{% endstylesheet %}', T)
  two.swaps.length === 1 ? ok('{% stylesheet %} blocks are covered') : bad('stylesheet block missed')

  // THE SAFETY RULE: markup OUTSIDE the style block must never be touched — a hex in a Liquid
  // attribute or in copy is not CSS, and rewriting it would corrupt the template.
  const outside = '<div data-c="#2c3d1e">#2c3d1e</div>\n{% style %}.c { color: #2c3d1e; }{% endstyle %}\n<p>#2c3d1e</p>'
  const r3 = snapLiquidStyles(outside, T)
  const bodyOnly = (r3.text.match(/#2c3d1e/gi) || []).length === 3 && r3.swaps.length === 1
  bodyOnly ? ok('only the style block is rewritten; surrounding markup is untouched')
    : bad(`swaps=${r3.swaps.length} remaining=${(r3.text.match(/#2c3d1e/gi) || []).length}`)

  // Liquid interpolation inside a style block is a merchant setting, not a literal — it must survive
  const interp = snapLiquidStyles('{% style %}.d { color: {{ section.settings.c }}; background: #2c3d1e; }{% endstyle %}', T)
  const keptInterp = /\{\{ section\.settings\.c \}\}/   // bind first: a statement STARTING with a regex parses as division
  keptInterp.test(interp.text) && interp.swaps.length === 1
    ? ok('a merchant-set colour is left alone; the literal beside it still swaps') : bad('interpolation damaged')

  // a file with no style block at all must come back byte-identical
  const none = '<div class="x">#2c3d1e</div>'
  snapLiquidStyles(none, T).text === none ? ok('a file with no style block is returned unchanged') : bad('file without a style block was modified')
}

console.log(failures === 0 ? '\nsnap-colors: ALL CASES PASS' : `\nsnap-colors: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
