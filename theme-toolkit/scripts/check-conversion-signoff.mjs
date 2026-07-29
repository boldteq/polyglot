#!/usr/bin/env node
// Conversion sign-off gate (#21) — makes catalyst's lift_target MACHINE-CHECKABLE (Plan P0 gaps 1+3).
// The conversion gate #7 enforces CRO MECHANICS (hero-cta / pdp-atc / free-ship-bar / decoder-citation)
// but NOT the lift TARGET — gate-conversion.mjs says "lift_target … NOT enforced here". So a store could
// ship with catalyst signing any number (or none). This gate verifies the structured sign-off artifact
// docs/cro/catalyst-signoff.json: present + signed + the canonical rule applied correctly
// (lift_target = niche_benchmark × multiplier, 2.5 normal / 1.5 sparse-niche) + surfaces + decoder depth.
// It records the COMPUTED target — it NEVER claims a MEASURED lift (that's the post-launch 30/90 loop).
//
// Artifact (catalyst emits): { niche, niche_benchmark, multiplier, lift_target, sparse_niche,
//   surfaces:[], decoder_brands_cited:[], signed_by, signed_at, signoff_sha }
//
// Usage: node check-conversion-signoff.mjs
// Env: SIGNOFF_FILE (docs/cro/catalyst-signoff.json) · REPORT_DIR · DS_REQUIRE_SCOPE=1 (publish-grade)
// Exit: 0 = signed-off + math correct · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const FILE = process.env.SIGNOFF_FILE || 'docs/cro/catalyst-signoff.json'
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.CRO_REQUIRE === '1'
const blockers = []
const warnings = []
const add = (id, detail, evidence = '') => blockers.push({ id, page: FILE, detail, evidence })
// #26 mechanic-binding: warn-first (block only at publish-grade) — a spec'd-but-unbound mechanic is a
// CRO leak, but the static marker scan is heuristic, so don't hard-block in dev.
const bindIssue = (id, detail, evidence = '') => (REQUIRE ? blockers : warnings).push({ id, page: FILE, detail, evidence })

// #26 — a CRO mechanic the sign-off declares must RENDER: a recognizable marker in the theme source.
// Markers are deliberately broad (catch the pattern, not one app). An unknown mechanic is skipped (can't
// prove a negative). PURE + exported for the fixture.
const MECHANIC_MARKERS = {
  'free-ship-bar': /free[\s-]?ship|shipping[\s-]?(bar|goal|progress|threshold)|cart[\s-_]?goal/i,
  'sticky-atc': /sticky[\s-]?(atc|add[\s-]?to[\s-]?cart|buy|product|bar)|product[\s-_]?sticky|js-sticky-atc/i,
  'subscription-toggle': /subscription|subscribe|selling_plan|recharge|seal[\s_]?subscription|skio/i,
  'quantity-tier-pricing': /tier[\s-]?pric|volume[\s-]?(price|discount)|quantity[\s-]?(break|discount)|qty[\s-]?(break|discount)/i,
  'upsell': /upsell|cross[\s-]?sell|frequently[\s-]?bought|you[\s-]?may[\s-]?also|recommend/i,
  'comparison-table': /comparison|vs[\s-]?them|us[\s-]?vs|compare[\s-]?table|comparison[\s-]?table/i,
  'bundle': /bundle|build[\s-]?(your|a)[\s-]?(box|bundle)|build-your/i,
  'countdown': /countdown|count[\s-]?down|timer/i,
  'reviews': /review|judge\.?me|loox|yotpo|stamped|okendo|rating/i,
  'trust-badge-row': /trust[\s-]?badge|guarantee|secure[\s-]?checkout|money[\s-]?back|cert/i,
}
export function mechanicBindingGaps(mechanics, themeText) {
  const hay = String(themeText || '')
  const gaps = []
  for (const m of mechanics || []) {
    const re = MECHANIC_MARKERS[String(m).trim().toLowerCase()]
    if (!re) continue // unknown mechanic → can't verify, skip (don't false-flag)
    if (!re.test(hay)) gaps.push(m)
  }
  return gaps
}
function themeCorpus() {
  let t = ''
  for (const d of ['sections', 'snippets', 'templates', 'assets']) {
    const abs = path.resolve(cwd, d)
    let entries = []
    try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isFile() || !/\.(liquid|json|js)$/.test(e.name)) continue
      try { t += `\n${fs.readFileSync(path.join(abs, e.name), 'utf-8')}` } catch { /* skip */ }
    }
  }
  return t
}

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('conversion-signoff', 21, { cwd, pass, blockers, warnings, evidence: { file: FILE, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  console.log(`conversion-signoff: ${code === 2 ? 'ENV-ERROR' : pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

const near = (a, b, tol = 0.006) => Math.abs(Number(a) - Number(b)) <= tol

function main() {
  const abs = path.resolve(cwd, FILE)
  if (!fs.existsSync(abs)) {
    if (REQUIRE) { add('cro.signoff-missing', `no ${FILE} — catalyst's conversion sign-off is MANDATORY before publish (records the per-niche lift_target + which surfaces carry the CRO patterns). A store cannot ship without a machine-checkable sign-off.`); return finish(null, { present: false }) }
    warnings.push({ id: 'cro.signoff-not-done', page: FILE, detail: `no ${FILE} yet — catalyst sign-off pending (warns in dev; BLOCKS at publish-grade)`, evidence: '' })
    return finish(null, { present: false })
  }
  let j
  try { j = JSON.parse(fs.readFileSync(abs, 'utf-8')) } catch (e) { return finish(`${FILE} is not valid JSON: ${e.message}`) }

  // 1. signed
  if (!j.signed_by) add('cro.unsigned', `no signed_by — record who signed off (catalyst)`)
  if (!j.signed_at) add('cro.unsigned', `no signed_at timestamp`)
  // H2 (2026-07-29): signoff_sha binds the sign-off to the reviewed commit. A field the spec declares but
  // the gate never reads is theater — require it to be a real git sha when present. (The niche_benchmark
  // cross-check against the on-disk pack pairs with the Batch-4 pack-benchmark anchoring.)
  if (j.signoff_sha != null && !/^[a-f0-9]{7,40}$/i.test(String(j.signoff_sha))) add('cro.bad-signoff-sha', `signoff_sha "${j.signoff_sha}" is not a git sha (7–40 hex) — it must bind the sign-off to the reviewed commit`)

  // 2. the canonical rule: lift_target = niche_benchmark × multiplier (2.5 normal / 1.5 sparse)
  const benchmark = Number(j.niche_benchmark)
  const sparse = j.sparse_niche === true
  const expectedMult = sparse ? 1.5 : 2.5
  if (!Number.isFinite(benchmark) || benchmark <= 0) add('cro.no-benchmark', `niche_benchmark missing/invalid (${j.niche_benchmark}) — catalyst must read it from the niche pack / ecom-niche-lift-benchmarks.md`)
  else {
    if (j.multiplier != null && !near(j.multiplier, expectedMult, 0.001)) add('cro.bad-multiplier', `multiplier ${j.multiplier} but a ${sparse ? 'sparse' : 'normal'} niche requires ×${expectedMult} (sparse-niche fallback is ×1.5, else ×2.5)`)
    const expectedTarget = benchmark * expectedMult
    if (!Number.isFinite(Number(j.lift_target))) add('cro.no-lift-target', `lift_target missing`)
    else if (!near(j.lift_target, expectedTarget)) add('cro.lift-target-wrong', `lift_target ${j.lift_target} ≠ niche_benchmark ${benchmark} × ${expectedMult} = ${expectedTarget.toFixed(3)} — the canonical rule (lift_target = niche_benchmark × ${expectedMult}) was applied wrong`, `${j.lift_target} vs ${expectedTarget.toFixed(3)}`)
  }

  // 3. surfaces the lift target chases (must name them)
  if (!Array.isArray(j.surfaces) || j.surfaces.length === 0) add('cro.no-surfaces', `surfaces[] empty — name the priority surfaces the lift_target chases (e.g. pdp-hero, cart, checkout)`)

  // 4. decoder brand depth — ≥5 for a confident benchmark; <5 must declare sparse_niche
  const brands = Array.isArray(j.decoder_brands_cited) ? j.decoder_brands_cited.length : 0
  if (brands < 5) {
    if (!sparse) add('cro.thin-decoder', `only ${brands} decoder brand(s) cited (<5) but sparse_niche is not set — either cite ≥5 from the teardown library or declare sparse_niche:true (which switches the multiplier to ×1.5)`)
    else if (brands < 1) add('cro.no-decoder', `0 decoder brands cited even in sparse mode — cite at least the brands the benchmark was derived from`)
  }

  // 5. #26 mechanic-binding — each declared mechanic must render a marker in the theme (CRO leak guard).
  let mechanicGaps = []
  if (Array.isArray(j.mechanics) && j.mechanics.length) {
    mechanicGaps = mechanicBindingGaps(j.mechanics, themeCorpus())
    for (const m of mechanicGaps) bindIssue('cro.mechanic-unbound', `mechanic "${m}" is signed off but no render marker found in the theme (sections/snippets/templates/assets) — it's spec'd but not built. Wire it, or remove it from the sign-off.`, m)
  }

  finish(null, { present: true, niche: j.niche, lift_target: j.lift_target, benchmark, sparse, surfaces: (j.surfaces || []).length, decoderBrands: brands, mechanics: Array.isArray(j.mechanics) ? j.mechanics.length : 0, mechanicGaps })
}

if (isMain(import.meta.url)) {
  try { main() } catch (e) { finish(`unexpected failure: ${e.message}`) }
}
