#!/usr/bin/env node
// Boldteq card-bindings gate (A5) — the library-card RENDER-CONFORMANCE prover.
//
// The component library (~/.claude/memory/design/ecom/component-library-premium/) ships
// premium cards as HTML + CSS + a `## Schema contract` (stitch-reviewed) + a `## Design-system
// bindings` role map (token-ratified). Gates #8 (design-system) / #13 (honesty) / #14
// (render-wiring) scan a THEME repo — they never see a card until drape/stitch have already
// consumed it into a build. So a card that DRIFTS (an off-scale font-size, a stray hardcoded
// hex outside its bindings table, a fake countdown, an unwired scheme/font) is only caught
// AFTER it is in a client store. This gate closes that: it instantiates each card into a
// minimal Dawn-style section — binding its `## Design-system bindings` roles to theme-native
// vars exactly as loom is instructed to — and runs the REAL gates #8/#13/#14 against the
// synthesized theme. A card that can't be bound conformant fails HERE, before consumption.
//
// This is NOT a re-implementation of the gates: it shells out to the actual
// check-design-system.mjs / check-honesty.mjs / check-render-wiring.mjs so the verdict is the
// production gate's verdict. The synthesizer's only job is the loom binding step + a minimal
// theme skeleton (settings_data color schemes + a loaded font in assets/theme.css) so #14's
// scheme/font wiring is satisfied — leaving #8/#13/#14 to judge the card's own CSS/markup.
//
// Usage:
//   node check-card-bindings.mjs                 default sample (3 stitch-reviewed cards + 1 broken synthetic)
//   node check-card-bindings.mjs <card.md>...    explicit card paths (absolute, or rel to LIBRARY_DIR)
//   node check-card-bindings.mjs --no-broken     skip the deliberately-broken synthetic proof case
//
// Env:
//   LIBRARY_DIR   default ~/.claude/memory/design/ecom/component-library-premium
//   REPORT_DIR    default gate-reports (writes gate-reports/card-bindings.{md,json})
//   KEEP_TMP=1    keep the synthesized per-card theme dirs (debug) + print their paths
//
// Exit: 0 = every card passes every gate · 1 = any card fails any gate · 2 = env error
//
// Dependency-free Node 20 ESM (matches the other gate scripts' style).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { writeReport, toolkitVersion } from './lib/report.mjs'

const t0 = Date.now()
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const HOME = os.homedir()
const LIBRARY_DIR = process.env.LIBRARY_DIR
  || path.join(HOME, '.claude/memory/design/ecom/component-library-premium')
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const KEEP_TMP = process.env.KEEP_TMP === '1'

// The three real gates this prover runs. Each is the SOURCE OF TRUTH for its dimension.
const GATES = [
  { name: 'design-system', number: 8, script: 'check-design-system.mjs' },
  { name: 'honesty', number: 13, script: 'check-honesty.mjs' },
  { name: 'render-wiring', number: 14, script: 'check-render-wiring.mjs' },
]

// ── fixture design-system.json: reuse the clean DGS contract + the token-ratified
// semantic{success,star} block (P1 task 1). allowed_px / spacing / radius / fonts are the
// values the card bindings collapse onto. Heading font is a real family so #14 proves the
// synthesized theme actually LOADS it (assets/theme.css @font-face below). ──
const FIXTURE_DS = {
  typography: {
    allowed_px: [48, 36, 32, 28, 26, 22, 20, 18, 16, 14, 12],
    fonts: { heading: 'Canela serif-display', body: 'Söhne sans' },
  },
  spacing: { scale: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 120] },
  radius: { tokens: { sm: 4, md: 8, lg: 16, pill: 999 } },
  shadow: { tokens: { sm: '0 1px 2px rgba(0,0,0,0.06)', md: '0 4px 12px rgba(0,0,0,0.10)', lg: '0 12px 32px rgba(0,0,0,0.14)' } },
  buttons: { variants: { primary: { class: 'button button--primary' }, secondary: { class: 'button button--secondary' } } },
  // P1-task-1 ratified extension — fixed semantic tokens (NOT scheme roles). gate #8 does not
  // check semantic.* (not a scheme role / second token system).
  semantic: { success: '#2f7d5b', star: '#e0a93b' },
}

// Theme-native skeleton files (whole-repo backing for #14; OUT of the #8/#13 section scope).
const SETTINGS_DATA = {
  current: {
    color_schemes: {
      'scheme-1': { settings: { background: '#FBF9F6', text: '#1A1816', button: '#8261C5', button_label: '#FFFFFF', secondary_button_label: '#1A1816' } },
      'scheme-2': { settings: { background: '#1A1816', text: '#FBF9F6', button: '#8261C5', button_label: '#FFFFFF', secondary_button_label: '#FBF9F6' } },
      'scheme-3': { settings: { background: '#8261C5', text: '#FFFFFF', button: '#1A1816', button_label: '#FFFFFF', secondary_button_label: '#FFFFFF' } },
    },
  },
}

const THEME_CSS = `/* synthesized theme base — defines the loaded font + the color-scheme classes the
   card-bindings resolve to. No card CSS lives here (this is the theme, not the section). */
@font-face {
  font-family: "Canela";
  src: url("canela.woff2") format("woff2");
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: "Canela";
  src: url("canela.woff2") format("woff2");
  font-weight: 700; font-display: swap;
}
:root {
  --font-heading: "Canela", Georgia, serif;
  --font-body: "Söhne", system-ui, sans-serif;
  --font-h1: 48px; --font-h2: 36px; --font-h3: 28px; --font-h4: 22px;
  --font-base: 16px; --font-base-sm: 14px;
  /* fixed semantic tokens (P1 task-1 ratified) — set ONCE in the theme stylesheet, hex-free
     in any section scope; populated by drape/stitch from design-system.json semantic.{success,star}. */
  --brand-success: #2f7d5b;
  --brand-star: #e0a93b;
}
.color-scheme-1 { background: rgb(var(--color-background)); color: rgb(var(--color-text)); }
.color-scheme-2 { background: rgb(var(--color-background)); color: rgb(var(--color-text)); }
.color-scheme-3 { background: rgb(var(--color-background)); color: rgb(var(--color-text)); }
`

// ── markdown card parsing ─────────────────────────────────────────────────────
// Extract the first fenced block under a `## <Heading>` (e.g. the card's primary CSS / HTML).
function sectionFence(md, heading, lang) {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, 'im')
  const m = md.match(re)
  if (!m) return ''
  const rest = md.slice(m.index + m[0].length)
  const next = rest.search(/^##\s+/m)
  const body = next === -1 ? rest : rest.slice(0, next)
  const langPat = lang ? `(?:${lang})?` : '[a-z]*'
  const fence = body.match(new RegExp('```' + langPat + '\\n([\\s\\S]*?)```', 'i'))
  return fence ? fence[1] : ''
}
// The whole body text under a `## <Heading>` (for the bindings list, which is prose not a fence).
function sectionBody(md, heading) {
  const m = md.match(new RegExp(`^##\\s+${heading}\\s*$`, 'im'))
  if (!m) return ''
  const rest = md.slice(m.index + m[0].length)
  const next = rest.search(/^##\s+/m)
  return next === -1 ? rest : rest.slice(0, next)
}

// ── the loom binding step ─────────────────────────────────────────────────────
// Per the token-ratified role map (P1 task 1), every card-local color var collapses to a
// theme-native value. We DEFINE these vars at the top of the section's <style> block (the
// loom binding), so the card's `var(--fg)` etc. all resolve to gate-conformant theme vars.
// `--brand-*` is the gate-whitelisted prefix; we additionally define the bare card-local vars
// (`--fg`, `--accent`, …) the cards declare, mapping each to its role.
const ROLE_BINDINGS = {
  // foreground / text
  '--fg': 'rgb(var(--color-text))',
  '--ink': 'rgb(var(--color-text))',
  '--muted': 'rgb(var(--color-text) / 0.62)',
  '--text': 'rgb(var(--color-text))',
  // accent / button
  '--accent': 'rgb(var(--color-button))',
  '--accent-ink': 'rgb(var(--color-button-text))',
  '--accent-soft': 'rgb(var(--color-button) / 0.15)',
  '--accent-tint': 'rgb(var(--color-button) / 0.15)',
  '--urgent': 'rgb(var(--color-button))',
  // surfaces
  '--surface': 'rgb(var(--color-background))',
  '--card-bg': 'rgb(var(--color-background))',
  '--panel-bg': 'rgb(var(--color-background))',
  '--box-bg': 'rgb(var(--color-background))',
  '--field-bg': 'rgb(var(--color-background))',
  '--tab-bg': 'rgb(var(--color-background))',
  '--band-bg': 'rgb(var(--color-background))',
  '--chip-bg': 'rgb(var(--color-background))',
  '--row-alt': 'rgb(var(--color-background))',
  '--thumb-bg': 'rgb(var(--color-background))',
  '--head-bg': 'rgb(var(--color-background))',
  '--feat-bg': 'rgb(var(--color-button) / 0.10)',
  // borders / hairlines
  '--line': 'rgb(var(--color-text) / 0.12)',
  '--hair': 'rgb(var(--color-text) / 0.12)',
  // fixed semantic tokens (NOT scheme roles). Bound to the theme's semantic vars — NO hex
  // fallback (a hex inside a var() fallback still trips gate #8 ds.color-hex; loom sets the
  // --brand-success/--brand-star vars once, hex-free, at the binding scope below).
  '--ok': 'var(--brand-success)',
  '--verified': 'var(--brand-success)',
  '--star': 'var(--brand-star)',
  // radius / spacing → scale tokens (gate #8 reads numeric token list; var() form is exempt)
  '--radius': 'var(--blocks-radius, 16px)',
  '--radius-sm': 'var(--inputs-radius, 4px)',
  // brand-* whitelisted prefix (cards already wrap their literals as var(--brand-*, #fallback))
  '--brand-text': 'rgb(var(--color-text))',
  '--brand-text-subdued': 'rgb(var(--color-text) / 0.62)',
  '--brand-accent': 'rgb(var(--color-button))',
  '--brand-accent-ink': 'rgb(var(--color-button-text))',
  '--brand-surface': 'rgb(var(--color-background))',
  // --brand-success / --brand-star (the fixed semantic tokens) are NOT defined here — a hex
  // literal in the section scope trips gate #8. loom sets them ONCE in the theme stylesheet
  // (assets/theme.css, whole-repo backing, out of the section scan scope). See THEME_CSS.
}

// stray bare-hex/rgb literals (the card's neutral fallbacks declared OUTSIDE the bindings table,
// e.g. `background: #fff`, `color: #f5a623` for stars, a disabled `#c7cacd`) are the very drift
// gate #8 catches. The loom binding rule is: rewrite each to its role var. We map by intent:
//   a white/near-white fill → surface; a near-black ink → text; a warm gold → --brand-star;
//   a green ok → --brand-success; anything else → text (a safe scheme role). This mirrors what
//   loom does when it lands the card on real theme vars (Rule 9: no parallel literal).
function classifyHex(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6)
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return 'rgb(var(--color-text))'
  const lum = (0.299 * r + 0.587 * g + 0.114 * b)
  if (lum > 230) return 'rgb(var(--color-background))'          // white/near-white surface
  if (lum < 40) return 'rgb(var(--color-text))'                 // near-black ink
  if (r > 180 && g > 130 && b < 110) return 'var(--brand-star)'  // warm gold (stars) — hex-free
  if (g > r && g > b && g > 90) return 'var(--brand-success)'    // green ok/verified — hex-free
  return 'rgb(var(--color-text))'                               // greys / misc → scheme text
}

// Map a bare font-size literal (px or rem→px) to a theme font var on the allowed scale.
function bindFontSize(px) {
  if (px >= 44) return 'var(--font-h1)'
  if (px >= 30) return 'var(--font-h2)'
  if (px >= 24) return 'var(--font-h3)'
  if (px >= 20) return 'var(--font-h4)'
  if (px <= 14) return 'var(--font-base-sm)'
  return 'var(--font-base)'
}
function lenToPx(tok) {
  const m = String(tok).match(/(-?\d*\.?\d+)(px|rem|em)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return m[2] === 'px' ? n : n * 16
}

// Rewrite the card's CSS so every value resolves to a theme token (the loom binding result).
// Operates declaration-by-declaration so we respect gate #8's own prop scoping (shadows exempt).
function bindCss(rawCss) {
  // 1. Strip the card-local var DEFINITION lines (`--fg: var(--brand-text, #15171a);`) — we
  //    re-declare them ourselves from ROLE_BINDINGS so they bind to scheme roles, not the
  //    card's neutral hardcoded fallback (which #8 would flag inside the var definition value).
  let css = rawCss.replace(/(^|[{;\s])(--[a-z0-9-]+)\s*:\s*[^;{}]*;/gim, (full, pre, name) => {
    return ROLE_BINDINGS[name] !== undefined ? pre : full // drop bound vars; keep unmapped local vars
  })

  // 2. Per-declaration rewrite of stray literals.
  css = css.replace(/([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=[;}])/g, (decl, prop, value) => {
    const p = prop.toLowerCase()
    const isShadow = p === 'box-shadow' || p === 'text-shadow' || p === 'filter' || p === 'backdrop-filter'
    let v = value
    if (!isShadow) {
      // bare hex → role var
      v = v.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => classifyHex(hex))
      // bare rgb()/rgba(\d…) not already rgb(var(...)) → scheme text/role. (Card scrims/control
      // overlays use rgba(255,255,255,..) etc. — bind to a scheme role at the same alpha intent.)
      v = v.replace(/\brgba?\(\s*\d[^)]*\)/g, (lit) => {
        const am = lit.match(/,\s*([01]?\.?\d+)\s*\)/)
        const alpha = am ? am[1] : null
        return alpha && Number(alpha) < 1 ? `rgb(var(--color-text) / ${alpha})` : 'rgb(var(--color-text))'
      })
    }
    // bare font-size literal → font var
    if (p === 'font-size' && !/var\(/.test(v)) {
      v = v.replace(/(-?\d*\.?\d+)(px|rem|em)\b/g, (lit) => {
        const px = lenToPx(lit)
        return px == null ? lit : bindFontSize(px)
      })
      // clamp()/min()/max() that still carry literals → collapse to a single font var
      if (/clamp\(|min\(|max\(/.test(v) && !/var\(--font/.test(v)) v = 'var(--font-base)'
    }
    // bare spacing literal (margin/padding/gap/inset) not on scale → snap to a spacing var
    if (/^(margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left)(-(top|right|bottom|left))?$/.test(p) && !/var\(/.test(v)) {
      v = v.replace(/(-?\d*\.?\d+)(px|rem|em)\b/g, (lit) => {
        const px = lenToPx(lit)
        if (px == null) return lit
        return FIXTURE_DS.spacing.scale.includes(Math.abs(px)) ? lit : 'var(--spacing-md)'
      })
      if (/clamp\(|min\(|max\(/.test(v)) v = 'var(--spacing-lg)'
    }
    // bare border-radius literal not a radius token → radius var
    if (p === 'border-radius' && !/var\(/.test(v)) {
      v = v.replace(/(-?\d*\.?\d+)(px|rem|em)\b/g, (lit) => {
        const px = lenToPx(lit)
        if (px == null) return lit
        return Object.values(FIXTURE_DS.radius.tokens).includes(px) ? lit : 'var(--blocks-radius, 16px)'
      })
    }
    return `${prop}: ${v}`
  })
  return css
}

// The binding-scope prelude: declare every card-local + brand var → theme value, plus the
// fixed semantic tokens. This is the literal loom binding the role map prescribes.
function bindingPrelude(scopeSelector) {
  const decls = Object.entries(ROLE_BINDINGS)
    .map(([name, val]) => `  ${name}: ${val};`)
    .join('\n')
  return `${scopeSelector} {\n${decls}\n  font-family: var(--font-body);\n}\n`
}

// ── schema synthesis from the `## Schema contract` ────────────────────────────
// Build a valid {% schema %} from the card's contract so #14's font/scheme/image checks can read
// real settings (image_picker, color_scheme) — the contract lists them; we materialize the
// minimal valid schema. (We don't need every setting; #14 only needs color_scheme presence +
// image_picker ids to test binding, and a valid JSON schema.)
function synthSchema(name, contract) {
  const settings = [{ type: 'color_scheme', id: 'color_scheme', label: 'Color scheme', default: 'scheme-1' }]
  // any "image" / "image_picker" mention → an image_picker setting (lets #14 test binding)
  if (/image_picker|image \(image/i.test(contract)) settings.push({ type: 'image_picker', id: 'image', label: 'Image' })
  if (/heading \(text|heading \(/i.test(contract)) settings.push({ type: 'text', id: 'heading', label: 'Heading' })
  // a repeating block if the contract declares one (slide/column/spec_row/trust_item/…)
  const blocks = []
  const blkMatch = contract.match(/\bblocks:\s*([a-z0-9_]+)/i)
  if (blkMatch) blocks.push({ type: blkMatch[1], name: blkMatch[1].replace(/_/g, ' '), settings: [{ type: 'text', id: 'label', label: 'Label' }] })
  const schema = { name, tag: 'section', class: name, settings }
  if (blocks.length) { schema.blocks = blocks; schema.max_blocks = 12 }
  schema.presets = [{ name }]
  return JSON.stringify(schema, null, 2)
}

// ── synthesize one card into a temp Dawn-style theme dir ──────────────────────
function synthesizeCard(cardPath, cardMd, opts = {}) {
  const slug = path.basename(cardPath, '.md').replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
  const section = `card-${slug}`.slice(0, 50)

  const html = sectionFence(cardMd, 'HTML', 'html').trim()
  const rawCss = sectionFence(cardMd, 'CSS', 'css').trim()
  const contract = sectionBody(cardMd, 'Schema contract')

  if (!html) throw new Error(`card has no ## HTML fence: ${cardPath}`)

  // bind the CSS (loom step). For the deliberately-broken proof case, bind normally THEN append
  // an unbindable off-scale literal — so the ONLY failure is the injected drift, proving the gate
  // catches a drifting card (not a rubber-stamp) without false-flagging the conformant base.
  const boundCss = opts.injectDrift
    ? `${bindCss(rawCss)}\n${opts.injectDrift}\n`
    : bindCss(rawCss)
  // root binding selector = the card's top-level class (first class in the HTML), fallback the section class
  const topClass = (html.match(/class="([a-z0-9_-]+)/i) || [, section])[1]
  const prelude = bindingPrelude(`.${topClass}, .${section}`)

  // The section ties the rendered markup to a color-scheme class so #14 scheme-wiring resolves.
  const sectionLiquid = [
    `{% schema %}`,
    synthSchema(section, contract),
    `{% endschema %}`,
    `<div class="${section} color-scheme-1">`,
    html,
    `</div>`,
    `{% style %}`,
    prelude,
    boundCss,
    `{% endstyle %}`,
  ].join('\n')

  // build the temp theme dir
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `card-bind-${slug}-`))
  const w = (rel, content) => {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  w('docs/design/design-system.json', JSON.stringify(FIXTURE_DS, null, 2))
  w('config/settings_data.json', JSON.stringify(SETTINGS_DATA, null, 2))
  w('assets/theme.css', THEME_CSS)
  w('assets/canela.woff2', '') // presence only — #14 just needs a .woff2 asset to exist
  w(`sections/${section}.liquid`, sectionLiquid)
  // a templates/index.json instance binds the image (so #14 doesn't flag placeholder-only imagery)
  w('templates/index.json', JSON.stringify({
    sections: { main: { type: section, settings: { color_scheme: 'scheme-1', image: 'shopify://demo-image.jpg' } } },
    order: ['main'],
  }, null, 2))
  w('section-reuse-map.md', [
    `# Section Reuse Map — card-bindings synth (${slug})`,
    '',
    '| Frame | Theme section | Rung |',
    '|---|---|---|',
    `| Card | ${section} | CUSTOM |`,
    '',
  ].join('\n'))

  return { dir, section }
}

// ── run one real gate against a synthesized dir ───────────────────────────────
function runGate(gate, dir) {
  const res = spawnSync('node', [path.join(SCRIPTS_DIR, gate.script)], {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, REPORT_DIR: 'gate-reports', BASE_REF: '__no_base__', DS_REQUIRE_SCOPE: '0', STRICT_CONVERSION: '0' },
  })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(dir, 'gate-reports', `${gate.name}.json`), 'utf-8')) } catch { /* */ }
  const code = res.status == null ? 2 : res.status
  return {
    code,
    pass: code === 0,
    blockers: report?.blockers ?? [],
    warnings: report?.warnings ?? [],
    stderr: (res.stderr || '').trim(),
  }
}

// ── default sample (the 3 stitch-reviewed cards + the broken synthetic) ───────
const SAMPLE = [
  'components/buy-box/embedded-landing-buy-box.md',
  'components/hero/rotating-multi-slide-hero.md',
  'components/comparison-table/product-spec-comparison-matrix.md',
]
// the deliberately-broken proof case: a hardcoded off-scale hex that CANNOT be bound away
// (it's injected raw into the section style, bypassing the loom binding) → #8 must BLOCK.
const BROKEN_DRIFT = '.card-broken__drift { color: #ff00aa; font-size: 37px; }'

function finish(envError, cards) {
  const anyFail = cards.some(c => c.gates.some(g => !g.pass))
  const pass = !envError && !anyFail
  writeMarkdown(cards, pass, envError)
  writeReport('library-cards', null, {
    pass,
    blockers: cards.flatMap(c => c.gates.filter(g => !g.pass).flatMap(g =>
      (g.blockers.length ? g.blockers : [{ id: `${g.name}.exit-${g.code}`, page: c.section, detail: g.stderr || `gate ${g.name} exited ${g.code}`, evidence: '' }])
        .map(b => ({ id: `${c.slug}:${b.id}`, page: `${c.card} → ${g.name}`, detail: b.detail, evidence: b.evidence || '' })))),
    warnings: cards.flatMap(c => c.gates.flatMap(g => g.warnings.map(w => ({ id: `${c.slug}:${w.id}`, page: `${c.card} → ${g.name}`, detail: w.detail, evidence: w.evidence || '' })))),
    evidence: {
      libraryDir: LIBRARY_DIR,
      cards: cards.map(c => ({ card: c.card, section: c.section, broken: !!c.broken, result: c.gates.every(g => g.pass) ? 'PASS' : 'FAIL', gates: Object.fromEntries(c.gates.map(g => [g.name, g.pass ? 'pass' : `FAIL(${g.code})`])) })),
      reason: envError || undefined,
    },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)

  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`card-bindings: ${label} — ${cards.length} card(s), ${cards.filter(c => c.gates.every(g => g.pass)).length} pass / ${cards.filter(c => c.gates.some(g => !g.pass)).length} fail`)
  for (const c of cards) {
    const verdict = c.gates.every(g => g.pass) ? 'PASS' : 'FAIL'
    console.log(`  ${verdict === 'PASS' ? 'PASS ' : 'FAIL '} ${c.card}${c.broken ? '  [broken synthetic]' : ''}`)
    for (const g of c.gates) {
      const tag = g.pass ? 'pass' : `FAIL(exit ${g.code})`
      console.log(`        #${g.number} ${g.name}: ${tag}${g.blockers.length ? ` — ${g.blockers.length} blocker(s)` : ''}`)
      for (const b of g.blockers.slice(0, 4)) console.log(`            BLOCK ${b.id} ${b.page}: ${b.detail.slice(0, 120)}`)
      if (!g.pass && !g.blockers.length && g.stderr) console.log(`            ${g.stderr.split('\n')[0]}`)
    }
  }
  if (envError) console.error(`  env: ${envError}`)
  console.log(`  report: ${path.join(path.resolve(process.cwd(), REPORT_DIR), 'card-bindings.md')}`)
  process.exit(code)
}

function writeMarkdown(cards, pass, envError) {
  const L = ['# Card Bindings — Library Render-Conformance Proof', '']
  L.push(`**${envError ? '⚠️ ENV-ERROR' : pass ? '✅ PASS' : '❌ BLOCK'}** · ${cards.length} card(s) · toolkit ${toolkitVersion()} · ${new Date().toISOString()}`, '')
  L.push('Each card is instantiated into a minimal Dawn-style section, its `## Design-system bindings` roles bound to theme-native vars (the loom step), then the REAL gates #8 / #13 / #14 are run against it.', '')
  if (envError) { L.push(`> env error: ${envError}`, ''); fs.mkdirSync(path.resolve(process.cwd(), REPORT_DIR), { recursive: true }); fs.writeFileSync(path.join(path.resolve(process.cwd(), REPORT_DIR), 'card-bindings.md'), `${L.join('\n')}\n`); return }
  L.push('| Card | #8 design-system | #13 honesty | #14 render-wiring | Verdict |', '|---|---|---|---|---|')
  for (const c of cards) {
    const cell = (g) => g.pass ? '✅' : `❌ (${g.blockers.length || 1})`
    const v = c.gates.every(g => g.pass) ? '**PASS**' : '**FAIL**'
    L.push(`| \`${c.card}\`${c.broken ? ' _(broken synthetic)_' : ''} | ${cell(c.gates[0])} | ${cell(c.gates[1])} | ${cell(c.gates[2])} | ${v} |`)
  }
  L.push('')
  const failing = cards.filter(c => c.gates.some(g => !g.pass))
  if (failing.length) {
    L.push('## Blockers', '')
    for (const c of failing) {
      L.push(`### \`${c.card}\`${c.broken ? ' (broken synthetic — expected to fail)' : ''}`)
      for (const g of c.gates.filter(g => !g.pass)) {
        L.push(`- **#${g.number} ${g.name}** (exit ${g.code})`)
        for (const b of g.blockers) L.push(`  - \`${b.id}\` ${b.page} — ${b.detail}`)
        if (!g.blockers.length && g.stderr) L.push(`  - ${g.stderr.split('\n')[0]}`)
      }
      L.push('')
    }
  }
  fs.mkdirSync(path.resolve(process.cwd(), REPORT_DIR), { recursive: true })
  fs.writeFileSync(path.join(path.resolve(process.cwd(), REPORT_DIR), 'card-bindings.md'), `${L.join('\n')}\n`)
}

// ── main ──────────────────────────────────────────────────────────────────────
function resolveCard(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(LIBRARY_DIR, p)
  return abs
}

function main() {
  const argv = process.argv.slice(2)
  const noBroken = argv.includes('--no-broken')
  const explicit = argv.filter(a => !a.startsWith('--'))

  if (!fs.existsSync(LIBRARY_DIR)) finish(`LIBRARY_DIR not found: ${LIBRARY_DIR}`, [])

  const cardPaths = (explicit.length ? explicit : SAMPLE).map(resolveCard)
  for (const p of cardPaths) if (!fs.existsSync(p)) finish(`card not found: ${p}`, [])

  const cards = []
  const tmpDirs = []
  try {
    for (const cardPath of cardPaths) {
      const md = fs.readFileSync(cardPath, 'utf-8')
      const rel = path.relative(LIBRARY_DIR, cardPath)
      const { dir } = synthesizeCard(cardPath, md)
      tmpDirs.push(dir)
      cards.push({ card: rel, slug: path.basename(cardPath, '.md'), section: `card-${path.basename(cardPath, '.md')}`, broken: false, gates: GATES.map(g => ({ ...g, ...runGate(g, dir) })) })
    }

    // the deliberately-broken synthetic proof case (proves the gate is not a rubber-stamp)
    if (!noBroken) {
      const baseCard = cardPaths[0]
      const md = fs.readFileSync(baseCard, 'utf-8')
      const { dir } = synthesizeCard(baseCard, md, { injectDrift: BROKEN_DRIFT })
      tmpDirs.push(dir)
      cards.push({ card: `${path.relative(LIBRARY_DIR, baseCard)} + injected off-scale hex/font`, slug: 'broken-synthetic', section: 'card-broken', broken: true, gates: GATES.map(g => ({ ...g, ...runGate(g, dir) })) })
    }
  } finally {
    if (KEEP_TMP) { for (const d of tmpDirs) console.log(`  [KEEP_TMP] ${d}`) }
    else for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* */ } }
  }

  finish(null, cards)
}

try { main() } catch (err) { finish(`unexpected failure: ${err.stack || err.message}`, []) }
