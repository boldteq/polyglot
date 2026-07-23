#!/usr/bin/env node
// Boldteq static-accessibility gate (#16) — the pre-deploy a11y net.
//
// axe (#5) is the authoritative a11y gate but it is URL-kind: it needs a live preview, so it
// NEVER runs at the static/dogfood stage — a11y defects ship uncaught until staging. This gate
// catches the high-frequency, statically-detectable a11y/mobile defects on the custom surface so
// they're fixed before push. Advisory by default (WARN); A11Y_STRICT=1 promotes to BLOCK.
//
// Checks (custom sections + their rendered snippets):
//   a11y.img-no-alt          — a literal <img> with no `alt` attribute (Liquid `| image_tag` auto-alts; exempt).
//   a11y.noninteractive-handler — a <div>/<span> with a click handler but no role="button"/tab + tabindex
//                                 (keyboard-inaccessible custom toggle/drawer — the round-1 custom-drawer risk).
//   a11y.input-font-small    — an input/select/textarea font-size < 16px → iOS Safari zooms on focus (mobile UX).
//
// Usage: node check-a11y-static.mjs
// Env: BASE_REF (default "base") · REUSE_MAP · REPORT_DIR · A11Y_STRICT=1 (WARN→BLOCK) ·
//      DS_REQUIRE_SCOPE=1 (unresolved scope blocks).
// Exit: 0 = pass · 1 = block (STRICT) · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'
const STRICT = process.env.A11Y_STRICT === '1'

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
// finding(): BLOCK under STRICT, else WARN.
const finding = (id, page, detail, evidence) => STRICT ? add(blockers, id, page, detail, evidence) : add(warnings, id, page, detail, evidence)

const read = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
const lineAt = (text, i) => text.slice(0, i).split('\n').length

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('static-a11y', 16, { cwd, pass, blockers, warnings, evidence: { strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`a11y-static: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── scope: the build's custom/extended surface ────────────────────────────────
function gitChanged() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections', 'snippets'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return out.split('\n').map(s => s.trim()).filter(Boolean)
  } catch { return null }
}
function reuseMapTargets() {
  const mapAbs = path.resolve(cwd, REUSE_MAP)
  if (!fs.existsSync(mapAbs)) return null
  const names = new Set()
  for (const line of fs.readFileSync(mapAbs, 'utf-8').split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (!cells.some(c => /^(EXTEND|CUSTOM)$/i.test(c))) continue
    for (const c of cells) {
      const m = c.match(/([a-z0-9][a-z0-9_-]+)/i)
      if (m && !/^(EXTEND|CUSTOM|REUSE|CONFIGURE|LIBRARY)$/i.test(m[1]) && fs.existsSync(path.resolve(cwd, 'sections', `${m[1]}.liquid`))) names.add(`sections/${m[1]}.liquid`)
    }
  }
  return names.size ? [...names] : null
}

// strip {% comment %}…{% endcomment %} + {% schema %}…{% endschema %} (JSON, not rendered HTML)
function stripNonHtml(s) {
  return s.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, ' ')
    .replace(/\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/g, ' ')
    .replace(/\{%-?\s*(style|stylesheet)[^%]*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}/g, m => m) // keep style for font-size scan elsewhere
}

function main() {
  let targets = gitChanged()
  if (targets === null) targets = reuseMapTargets()
  if (targets === null) {
    if (REQUIRE_SCOPE) add(blockers, 'a11y.scope-unresolved-strict', '.', `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP}, DS_REQUIRE_SCOPE=1 — cannot run static a11y`)
    else warnings.push({ id: 'a11y.scope-unresolved', page: '.', detail: `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP} — static a11y scan skipped`, evidence: '' })
    finish(null, { scope: 'unresolved' })
  }
  // dedupe by resolved+lowercased path — a reuse-map row can name the same file twice (and a
  // case-insensitive FS collapses Foo.liquid / foo.liquid), which would double-count findings.
  const seenPath = new Set()
  const addFile = (set, f) => { const k = path.resolve(cwd, f).toLowerCase(); if (!seenPath.has(k)) { seenPath.add(k); set.add(f) } }
  const files = new Set()
  for (const f of targets) if (/\.liquid$/.test(f) && fs.existsSync(path.resolve(cwd, f))) addFile(files, f)
  // include snippets the in-scope sections render
  for (const f of [...files]) {
    for (const m of read(f).matchAll(/\{%-?\s*render\s+['"]([a-z0-9_/-]+)['"]/gi)) {
      const sn = `snippets/${m[1]}.liquid`
      if (fs.existsSync(path.resolve(cwd, sn))) addFile(files, sn)
    }
  }
  const counts = { imgNoAlt: 0, handler: 0, inputFont: 0, autoplayMedia: 0, motionNoGuard: 0, imgNoDim: 0 }

  for (const file of files) {
    const raw = read(file)
    const html = stripNonHtml(raw)
    // a section that sets an img aspect-ratio anywhere already reserves space → don't flag CLS dimensions
    const sectionReservesRatio = /aspect-ratio/i.test(raw)

    // 1. <img> without alt (literal img tags only — Liquid image_tag auto-alts) + CLS dimension reservation
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      if (!/\balt\s*=/.test(m[0])) { finding('a11y.img-no-alt', `${file}:${lineAt(html, m.index)}`, `<img> with no alt attribute — screen readers announce nothing (use alt="" only for purely decorative images, or render via {{ image | image_tag }} which auto-alts)`, m[0].slice(0, 70)); counts.imgNoAlt += 1 }
      // CLS — a literal <img> must reserve space: width+height attrs, an inline aspect-ratio, or a section
      // aspect-ratio rule. Otherwise it loads with 0 height → layout shift (CLS, a Core Web Vital). WARN.
      const hasWH = /\bwidth\s*=/.test(m[0]) && /\bheight\s*=/.test(m[0])
      if (!hasWH && !/aspect-ratio/i.test(m[0]) && !sectionReservesRatio) {
        add(warnings, 'a11y.img-no-dimensions', `${file}:${lineAt(html, m.index)}`, `<img> has no width+height attributes and no aspect-ratio — it reserves no space → layout shift (CLS). Add width+height (or render via {{ image | image_tag }}, which sets them), or give images an aspect-ratio in CSS.`, m[0].slice(0, 70))
        counts.imgNoDim += 1
      }
    }
    // 2. non-interactive element with a click handler but no button/tab role + keyboard access
    for (const m of html.matchAll(/<(div|span|li)\b[^>]*>/gi)) {
      const tag = m[0]
      const hasHandler = /\bon[a-z]+\s*=|\b(?:@click|x-on:click|data-(?:toggle|drawer|tab|accordion|carousel))\b/i.test(tag)
      if (!hasHandler) continue
      const accessible = /\brole\s*=\s*["'](button|tab|link|menuitem|switch)["']/i.test(tag) && /\btabindex\s*=/.test(tag)
      if (!accessible) { finding('a11y.noninteractive-handler', `${file}:${lineAt(html, m.index)}`, `<${m[1]}> has a click/toggle handler but is not keyboard-accessible — add role="button" + tabindex="0" + a keydown handler, or use a real <button>`, tag.slice(0, 80)); counts.handler += 1 }
    }
    // 3. input/select/textarea font-size < 16px → iOS zoom-on-focus (mobile). Scan CSS targeting form controls.
    const css = (raw.match(/\{%-?\s*(?:style|stylesheet)[^%]*-?%\}([\s\S]*?)\{%-?\s*end(?:style|stylesheet)\s*-?%\}/gi) || []).join('\n')
      + '\n' + (raw.match(/style\s*=\s*"([^"]*)"/gi) || []).join('\n')
    for (const m of css.matchAll(/((?:input|select|textarea)[^{};]*)\{[^}]*?font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/gi)) {
      const px = m[3] === 'px' ? Number(m[2]) : Number(m[2]) * 16
      if (px < 16) { finding('a11y.input-font-small', `${file}`, `form control font-size ${m[2]}${m[3]} (≈${px}px) < 16px — iOS Safari zooms the viewport on focus (jarring mobile UX). Use ≥16px on inputs/selects/textareas.`, m[1].trim().slice(0, 50)); counts.inputFont += 1 }
    }
    // 4. autoplay media WITH sound (WCAG 1.4.2) — <video autoplay> w/o muted, <audio autoplay>, or a
    //    Shopify video_tag autoplay:true w/o muted:true. Autoplaying sound is a hard violation. block-eligible.
    for (const m of raw.matchAll(/<video\b[^>]*\bautoplay\b[^>]*>/gi)) {
      if (!/\bmuted\b/i.test(m[0])) { finding('a11y.autoplay-media', `${file}:${lineAt(raw, m.index)}`, `<video autoplay> without muted — autoplaying sound is a WCAG 1.4.2 violation + hostile UX. Add muted (or drop autoplay).`, m[0].slice(0, 70)); counts.autoplayMedia += 1 }
    }
    for (const m of raw.matchAll(/<audio\b[^>]*\bautoplay\b[^>]*>/gi)) {
      finding('a11y.autoplay-media', `${file}:${lineAt(raw, m.index)}`, `<audio autoplay> — autoplaying audio is a WCAG 1.4.2 violation. Remove autoplay; let the user start it.`, m[0].slice(0, 70)); counts.autoplayMedia += 1
    }
    for (const m of raw.matchAll(/\|\s*video_tag\b[^%}]*autoplay\s*:\s*true/gi)) {
      if (!/muted\s*:\s*true/i.test(m[0])) { finding('a11y.autoplay-media', `${file}:${lineAt(raw, m.index)}`, `video_tag autoplay:true without muted:true — autoplaying sound is a WCAG 1.4.2 violation. Add muted:true.`, m[0].slice(0, 70)); counts.autoplayMedia += 1 }
    }
    // 5. keyframe/animation motion with NO prefers-reduced-motion guard (WCAG 2.3.3 / vestibular safety). WARN.
    //    Only the `animation:` shorthand + @keyframes (continuous/decorative motion) — not hover `transition`s.
    const hasMotion = /@keyframes\b/i.test(css) || /\banimation\s*:(?!\s*none)/i.test(css)
    if (hasMotion && !/prefers-reduced-motion/i.test(css)) {
      add(warnings, 'a11y.motion-no-reduced-guard', file, 'section uses a keyframe/animation but has no `@media (prefers-reduced-motion: reduce)` guard — disable/soften the motion for users who request it (WCAG 2.3.3, vestibular safety).')
      counts.motionNoGuard += 1
    }
  }

  // QA-7: scope resolved but covers nothing — say so. Silence here is a green tick over an empty
  // scan, indistinguishable from a clean audit.
  if (files.size === 0) warnings.push({ id: 'a11y.n-a-empty-scope', page: '.', detail: 'scope resolved but covers 0 files — nothing was scanned for static a11y defects', evidence: '' })
  finish(null, { scanned: files.size, counts })
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
