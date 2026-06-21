#!/usr/bin/env node
// Boldteq art-direction gate (#24) — the deterministic complement to Lens #18 `image-art-direction`.
//
// When docs/design/design-system.json declares `imagery.art_direction` (drape's contract that hero/
// banner imagery needs distinct mobile+desktop crops + a scrim), this asserts the THEME actually renders
// responsive art-direction on hero/banner sections — a <picture> with ≥2 <source>, a raw srcset, or a
// Shopify image_tag / image_url-with-widths. A hero that renders ONE fixed image crops to a blank/
// subject-less patch on mobile (the gpt-test-1 M2 defect). Lens #18 (vision) is the AUTHORITATIVE blocker;
// this is the cheap code-time hint that catches it before a preview even exists.
//
// WARN-ONLY (Phase A) by default — ART_DIRECTION_ENFORCE=1 flips to BLOCK after proving on ≥2 stores
// (doctrine: false-BLOCK is as bad as false-pass; Lens stays primary). SKIPS cleanly when no
// art_direction is declared (refreshes / non-hero builds never false-fire).
//
// Env: DESIGN_SYSTEM (docs/design/design-system.json) · BASE_REF (base) · ART_DIRECTION_ENFORCE=1 · REPORT_DIR
// Exit: 0 = pass/skip · 1 = block (ENFORCE only) · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const DS = process.env.DESIGN_SYSTEM || 'docs/design/design-system.json'
const BASE_REF = process.env.BASE_REF || 'base'
// Phase A default = warn-only; ART_DIRECTION_ENFORCE=1 = Phase B BLOCK (prove on ≥2 stores first).
const ENFORCE = process.env.ART_DIRECTION_ENFORCE === '1'

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })

function finish(envError) {
  if (!ENFORCE && blockers.length) {
    warnings.push(...blockers)
    warnings.push({ id: 'art-direction.warn-only', page: DS, detail: 'Phase A warn-only — set ART_DIRECTION_ENFORCE=1 to BLOCK on the above (Lens #18 image-art-direction stays the authoritative blocker meanwhile)', evidence: '' })
    blockers.length = 0
  }
  const pass = !envError && blockers.length === 0
  writeReport('art-direction', 24, { cwd, pass, blockers, warnings, evidence: { designSystem: DS, enforce: ENFORCE, reason: envError || undefined }, duration_ms: Date.now() - t0 })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`art-direction: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// hero/banner sections added since base (the build's custom surface); fall back to all sections if base
// is unresolvable (then we can't scope to custom — scan every hero-ish section file).
function heroSections() {
  let files = []
  try {
    execFileSync('git', ['rev-parse', '--verify', `${BASE_REF}^{commit}`], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = execFileSync('git', ['diff', '--diff-filter=AM', '--name-only', `${BASE_REF}..HEAD`, '--', 'sections'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    files = out.split('\n').map(s => s.trim()).filter(f => f.endsWith('.liquid'))
  } catch {
    try { files = fs.readdirSync(path.join(cwd, 'sections')).filter(f => f.endsWith('.liquid')).map(f => `sections/${f}`) } catch { files = [] }
  }
  return files.filter(f => /hero|banner|masthead|slideshow|marquee/i.test(path.basename(f)))
}

const rendersImage = (src) => /<img\b|image_picker|image_tag|image_url|\{\{\s*[\w.]*image/i.test(src)
// responsive art-direction signals: explicit <picture>+<source media>, a raw srcset, or Shopify's
// image_tag / image_url-with-widths (both emit srcset + sizes). Any one = responsive enough to pass.
const isResponsive = (src) => /<picture\b/i.test(src) || /srcset\s*=/.test(src) || /\|\s*image_tag\b/i.test(src) || /\bwidths\s*:/i.test(src) || /<source\b[^>]*\bmedia\s*=/i.test(src)

// #7 — responsive-coverage matrix. Declaring DISTINCT crops (mobile_aspect ≠ desktop_aspect) means true
// ART-DIRECTION (different framing per breakpoint), which resolution-srcset/image_tag does NOT provide
// (it rescales ONE crop). Genuine per-breakpoint crops require a <picture> with ≥1 <source media>.
export function distinctCrops(ad) {
  const hero = (ad && typeof ad === 'object' && ad.hero) ? ad.hero : ad
  if (!hero || typeof hero !== 'object') return false
  const m = hero.mobile_aspect ?? hero.mobile ?? hero.mobile_crop
  const d = hero.desktop_aspect ?? hero.desktop ?? hero.desktop_crop
  return !!(m && d && String(m) !== String(d))
}
export function hasArtDirectedSources(src) {
  return /<picture\b/i.test(src) && [...src.matchAll(/<source\b[^>]*\bmedia\s*=/gi)].length >= 1
}

function main() {
  const dsAbs = path.resolve(cwd, DS)
  if (!fs.existsSync(dsAbs)) { add(warnings, 'art-direction.n-a-no-contract', DS, `no ${DS} — art-direction not declared; not applicable, skipping`); return finish(null) }
  let contract
  try { contract = JSON.parse(fs.readFileSync(dsAbs, 'utf-8')) } catch (e) { return finish(`${DS} invalid JSON: ${e.message}`) }
  const ad = contract?.imagery?.art_direction
  if (!ad || (typeof ad === 'object' && !ad.hero && !Array.isArray(ad))) {
    add(warnings, 'art-direction.n-a-not-declared', DS, `${DS} declares no imagery.art_direction — not applicable, skipping (drape declares it for hero/banner with text-over-image or non-square crops)`)
    return finish(null)
  }
  const heroes = heroSections()
  if (!heroes.length) { add(warnings, 'art-direction.n-a-no-hero', '.', 'imagery.art_direction declared but no custom hero/banner section found to check'); return finish(null) }
  for (const f of heroes) {
    let src = ''
    try { src = fs.readFileSync(path.resolve(cwd, f), 'utf-8') } catch { continue }
    if (!rendersImage(src)) continue // a hero without an image is out of scope
    if (!isResponsive(src)) {
      add(blockers, 'art-direction.no-responsive-source', f, 'hero/banner renders an image but has NO responsive art-direction (<picture> with mobile+desktop <source>, a srcset, or Shopify image_tag / image_url widths) — the desktop image will crop to a blank/subject-less patch on mobile. Add a <picture> with a mobile source per imagery.art_direction.')
    } else if (distinctCrops(ad) && !hasArtDirectedSources(src)) {
      // #7 — responsive but NOT art-directed: distinct crops declared, yet only resolution-srcset rendered.
      // Advisory (Lens #18 is authoritative); flags the resolution-vs-art-direction gap early.
      warnings.push({ id: 'art-direction.crop-coverage', page: f, detail: `imagery.art_direction declares distinct mobile/desktop crops, but ${path.basename(f)} renders resolution-srcset only (image_tag/srcset rescales ONE crop). Use <picture> with a mobile + desktop <source media> for true per-breakpoint art-direction. Lens #18 verifies the render.`, evidence: '', severity: 'advise' })
    }
  }
  finish(null)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) { try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) } }
