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
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const FILE = process.env.SIGNOFF_FILE || 'docs/cro/catalyst-signoff.json'
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.CRO_REQUIRE === '1'
const blockers = []
const warnings = []
const add = (id, detail, evidence = '') => blockers.push({ id, page: FILE, detail, evidence })

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

  finish(null, { present: true, niche: j.niche, lift_target: j.lift_target, benchmark, sparse, surfaces: (j.surfaces || []).length, decoderBrands: brands })
}

try { main() } catch (e) { finish(`unexpected failure: ${e.message}`) }
