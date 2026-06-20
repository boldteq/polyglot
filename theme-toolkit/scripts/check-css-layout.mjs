#!/usr/bin/env node
// Boldteq static CSS-layout gate (#22) — the DETERMINISTIC complement to Lens.
//
// Lens (#18) is a vision judge: it catches layout at PIXELS but demotes sub-confidence calls to
// warnings, so the deterministic 80% — a viewport-overflow `100vw`, a no-wrap flex row, a nowrap
// text run — can slip through as "warning, 72% confidence." This gate catches those statically on
// the BUILD's own CSS (custom section {% style %} blocks + build-authored assets/*.css), BEFORE a
// preview even exists. It complements Lens; it does not replace it. It deliberately scans ONLY the
// build's surface (scope = git base..HEAD on sections/snippets/assets, else the reuse-map's
// CUSTOM/EXTEND sections) so vendor Dawn/Minimog CSS (which legitimately uses 100vw) is never flagged.
//
// Checks (high-signal, low-false-positive — only the first BLOCKs at publish; the rest are advisory):
//   css.viewport-overflow  — width/min-width:100vw with NO max-width + NO box-sizing in the same rule
//                            → 100vw includes the scrollbar → horizontal scroll on the whole page.
//                            (blocker-eligible: WARN in dev, BLOCK at publish-grade / CSS_LAYOUT_STRICT=1)
//   css.flex-no-wrap       — display:flex (row) with no flex-wrap + no flex-direction:column → a row
//                            that can't wrap overflows on narrow viewports. (advisory WARN)
//   css.text-nowrap        — white-space:nowrap on non-button content → long text overflows. (advisory WARN)
//   css.negative-margin    — a large negative horizontal margin (≤ -40px) → can push content past the
//                            viewport edge. (advisory WARN)
//
// Usage: node check-css-layout.mjs
// Env: BASE_REF (default "base") · REUSE_MAP · REPORT_DIR · CSS_LAYOUT_STRICT=1 (WARN→BLOCK) ·
//      DS_REQUIRE_SCOPE=1 (publish-grade: the blocker-eligible finding BLOCKs; unresolved scope BLOCKs).
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const BASE_REF = process.env.BASE_REF || 'base'
const REUSE_MAP = process.env.REUSE_MAP || 'section-reuse-map.md'
const REQUIRE_SCOPE = process.env.DS_REQUIRE_SCOPE === '1'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1' || process.env.CSS_LAYOUT_STRICT === '1'

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
// blocker-eligible finding: BLOCK at publish-grade (STRICT), else WARN. (advisory findings call add(warnings) directly)
const finding = (id, page, detail, evidence) => (STRICT ? add(blockers, id, page, detail, evidence) : add(warnings, id, page, detail, evidence))

const read = (f) => { try { return fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { return '' } }
const lineAt = (text, i) => text.slice(0, i).split('\n').length

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('css-layout', 22, { cwd, pass, blockers, warnings, evidence: { strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`css-layout: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── scope: the build's custom/extended surface (sections/snippets/assets), never vendor base CSS ──
function gitChanged() {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections', 'snippets', 'assets'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return out.split('\n').map(s => s.trim()).filter(Boolean).filter(f => /\.(liquid|css)$/.test(f))
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

// extract CSS text from a target: a .css file → whole file; a .liquid → its {% style %}/{% stylesheet %} blocks.
function cssOf(file, raw) {
  if (/\.css$/.test(file)) return raw
  return (raw.match(/\{%-?\s*(?:style|stylesheet)[^%]*-?%\}([\s\S]*?)\{%-?\s*end(?:style|stylesheet)\s*-?%\}/gi) || []).join('\n')
}
// the innermost rule body enclosing index i (so an @media-nested rule resolves to its OWN body).
function enclosingRule(css, i) {
  const open = css.lastIndexOf('{', i)
  const close = css.indexOf('}', i)
  if (open === -1 || close === -1) return css.slice(Math.max(0, i - 140), i + 140)
  return css.slice(open, close + 1)
}

function main() {
  let targets = gitChanged()
  if (targets === null) { const rm = reuseMapTargets(); targets = rm }
  if (targets === null) {
    if (REQUIRE_SCOPE) add(blockers, 'css.scope-unresolved-strict', '.', `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP}, DS_REQUIRE_SCOPE=1 — cannot run static CSS-layout scan`)
    else add(warnings, 'css.scope-unresolved', '.', `base ref "${BASE_REF}" unresolvable and no ${REUSE_MAP} — CSS-layout scan skipped`)
    finish(null, { scope: 'unresolved' })
  }
  const seen = new Set()
  const files = []
  for (const f of targets) { const k = path.resolve(cwd, f).toLowerCase(); if (!seen.has(k) && fs.existsSync(path.resolve(cwd, f)) && /\.(liquid|css)$/.test(f)) { seen.add(k); files.push(f) } }
  const counts = { overflow: 0, flexNoWrap: 0, textNowrap: 0, negMargin: 0 }

  for (const file of files) {
    const css = cssOf(file, read(file))
    if (!css.trim()) continue

    // 1. viewport-overflow: width/min-width:100vw with no max-width + no box-sizing in the same rule (BLOCKER-eligible)
    for (const m of css.matchAll(/\b(?:min-)?width\s*:\s*100vw\b/gi)) {
      const rule = enclosingRule(css, m.index)
      if (!/\bmax-width\s*:/i.test(rule) && !/\bbox-sizing\s*:\s*border-box/i.test(rule)) {
        finding('css.viewport-overflow', `${file}:${lineAt(css, m.index)}`, `100vw width with no max-width / box-sizing:border-box guard — 100vw includes the scrollbar, so this overflows the viewport horizontally (page-wide scroll). Use width:100% or add max-width:100% + box-sizing:border-box.`, m[0])
        counts.overflow += 1
      }
    }
    // 2. flex row that can't wrap (advisory WARN)
    for (const m of css.matchAll(/\bdisplay\s*:\s*flex\b/gi)) {
      const rule = enclosingRule(css, m.index)
      if (!/\bflex-wrap\s*:/i.test(rule) && !/\bflex-direction\s*:\s*column/i.test(rule)) {
        add(warnings, 'css.flex-no-wrap', `${file}:${lineAt(css, m.index)}`, `display:flex (row) with no flex-wrap:wrap and no flex-direction:column — a non-wrapping row can overflow on narrow viewports. Add flex-wrap:wrap if children are content.`, rule.trim().slice(0, 60))
        counts.flexNoWrap += 1
      }
    }
    // 3. white-space:nowrap (advisory WARN — fine on buttons/nav, risky on long text)
    for (const m of css.matchAll(/\bwhite-space\s*:\s*nowrap\b/gi)) {
      add(warnings, 'css.text-nowrap', `${file}:${lineAt(css, m.index)}`, `white-space:nowrap — long text will overflow rather than wrap. Confirm this is a button/label, not body copy.`, enclosingRule(css, m.index).trim().slice(0, 50))
      counts.textNowrap += 1
    }
    // 4. large negative horizontal margin (advisory WARN — can push content past the viewport edge)
    for (const m of css.matchAll(/\bmargin(?:-(?:left|right|inline)[a-z-]*)?\s*:\s*[^;{}]*?-(\d{2,})px/gi)) {
      if (Number(m[1]) >= 40) { add(warnings, 'css.negative-margin', `${file}:${lineAt(css, m.index)}`, `large negative horizontal margin (-${m[1]}px) — can push content past the viewport edge → horizontal scroll. Verify it's clipped by an overflow:hidden parent.`, m[0]); counts.negMargin += 1 }
    }
  }

  finish(null, { scanned: files.length, counts })
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
