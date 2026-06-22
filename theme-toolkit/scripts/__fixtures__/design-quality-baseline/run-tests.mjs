#!/usr/bin/env node
// Self-test for #19 — BASELINE_ENFORCE fallback in check-design-quality. An UN-TUNED niche (or no pack)
// still meets the universal baseline floor when BASELINE_ENFORCE=1 (scored AS tuned). Self-contained:
// a temp DNA_PACKS_DIR with a minimal _baseline.json + an empty theme (0 components < the floor).
// Run (Node 20): node scripts/__fixtures__/design-quality-baseline/run-tests.mjs · Exit 0 = pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-design-quality.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

const BASELINE = JSON.stringify({
  $schema_version: '1.0', niche: 'Baseline', _meta: { calibration: 'tuned' },
  reference_brands: ['A', 'B', 'C'], type_scale: { ratio: 1.25, ratio_tolerance: 0.12, max_sizes_per_page: 7, heading_style: 'sans' },
  spacing_rhythm: { section_rhythm_px: [48, 128], rhythm_tolerance_px: 24, density: 'comfortable' },
  canonical_components: { required_min: 3, list: ['hero', 'product-grid', 'reviews-module', 'trust-badges', 'footer'] },
  hero_treatment: { archetype: 'single-focal-hero', carousel_allowed: true },
  color_roles: { scheme_count_max: 6 }, imagery: { product_ratio: '1:1', hero_ratio: '16:9' }, human_review: ['premium?'],
})

// build: a packs dir (with _baseline.json) + an empty theme repo declaring `dna_pack`
function build({ declarePack }) {
  const packs = fs.mkdtempSync(path.join(os.tmpdir(), 'dqb-packs-'))
  fs.writeFileSync(path.join(packs, '_baseline.json'), BASELINE)
  const theme = fs.mkdtempSync(path.join(os.tmpdir(), 'dqb-theme-'))
  fs.mkdirSync(path.join(theme, 'docs', 'design'), { recursive: true })
  fs.writeFileSync(path.join(theme, 'docs', 'design', 'design-spec.md'), declarePack ? `# spec\ndna_pack: ZzUntunedNicheXyz\ntheme_base: dawn\n` : '# spec\ntheme_base: dawn\n')
  return { packs, theme }
}
function run(theme, packs, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dqb-rep-'))
  const r = spawnSync('node', [GATE], { cwd: theme, env: { ...process.env, REPORT_DIR: reportDir, DNA_PACKS_DIR: packs, CONCEPT_MAP: path.join(packs, '__none__.json'), BASELINE_ENFORCE: '', DS_REQUIRE_SCOPE: '', DQ_FORCE_ENFORCE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'design-quality.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const ids = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))

console.log('(a) untuned niche + BASELINE_ENFORCE=1 + empty theme → baseline floor BLOCKS')
{
  const { packs, theme } = build({ declarePack: true })
  const { code, rep } = run(theme, packs, { BASELINE_ENFORCE: '1' })
  code === 1 ? pass('exit 1 (baseline floor enforced)') : fail(`expected 1, got ${code}; ids ${[...ids(rep)]}`)
  ids(rep).has('dq.baseline-fallback') ? pass('dq.baseline-fallback present') : fail('no baseline-fallback warning')
  ;(rep?.blockers || []).some(b => b.id === 'dq.components-below-floor') ? pass('components-below-floor BLOCKS (0 < 3)') : fail(`no components block: ${[...ids(rep)]}`)
  fs.rmSync(packs, { recursive: true, force: true }); fs.rmSync(theme, { recursive: true, force: true })
}

console.log('(b) untuned niche WITHOUT BASELINE_ENFORCE → no block (pack-missing warn)')
{
  const { packs, theme } = build({ declarePack: true })
  const { code, rep } = run(theme, packs)
  code === 0 ? pass('exit 0 (lenient without enforce)') : fail(`expected 0, got ${code}; ids ${[...ids(rep)]}`)
  !ids(rep).has('dq.components-below-floor') ? pass('no baseline block without the flag') : fail('blocked without enforce')
  fs.rmSync(packs, { recursive: true, force: true }); fs.rmSync(theme, { recursive: true, force: true })
}

console.log('(c) NO dna_pack declared + BASELINE_ENFORCE=1 → baseline floor still applies')
{
  const { packs, theme } = build({ declarePack: false })
  const { code, rep } = run(theme, packs, { BASELINE_ENFORCE: '1' })
  code === 1 && ids(rep).has('dq.baseline-fallback') ? pass('no-pack + enforce → baseline floor BLOCKS') : fail(`expected 1 + fallback, got ${code}; ids ${[...ids(rep)]}`)
  fs.rmSync(packs, { recursive: true, force: true }); fs.rmSync(theme, { recursive: true, force: true })
}

console.log('(d) pack self-validation — a schema-invalid pack (bad heading_style enum) → dq.pack-schema-invalid warning')
{
  const packs = fs.mkdtempSync(path.join(os.tmpdir(), 'dqb-packs-'))
  // a minimal _schema.json that enforces the heading_style enum (the exact defect the pet DRAFT had)
  fs.writeFileSync(path.join(packs, '_schema.json'), JSON.stringify({
    type: 'object',
    properties: { type_scale: { type: 'object', properties: { heading_style: { enum: ['sans', 'serif', 'serif-display', 'mixed'] } } } },
  }))
  // a niche pack with an INVALID heading_style (not in the enum) — like "friendly-humanist-sans"
  fs.writeFileSync(path.join(packs, 'badpack.json'), JSON.stringify({
    $schema_version: '1.0', niche: 'BadPack', reference_brands: ['A', 'B', 'C'],
    type_scale: { ratio: 1.25, ratio_tolerance: 0.08, max_sizes_per_page: 6, heading_style: 'friendly-humanist-sans' },
    spacing_rhythm: { section_rhythm_px: [56, 96], rhythm_tolerance_px: 16, density: 'comfortable' },
    canonical_components: { required_min: 1, list: ['hero'] },
    hero_treatment: { archetype: 'x', carousel_allowed: false },
    color_roles: { scheme_count_max: 4 }, imagery: { product_ratio: '1:1', hero_ratio: '16:9' }, human_review: ['ok?'],
  }))
  const theme = fs.mkdtempSync(path.join(os.tmpdir(), 'dqb-theme-'))
  fs.mkdirSync(path.join(theme, 'docs', 'design'), { recursive: true })
  fs.writeFileSync(path.join(theme, 'docs', 'design', 'design-spec.md'), '# spec\ndna_pack: BadPack\ntheme_base: dawn\n')
  const { rep } = run(theme, packs)
  const inv = (rep?.warnings || []).filter(w => w.id === 'dq.pack-schema-invalid')
  inv.length >= 1 && inv.some(w => /heading_style/.test(w.detail)) ? pass('schema-invalid pack flagged (heading_style enum)') : fail(`no dq.pack-schema-invalid for the bad enum: ${[...ids(rep)]}`)
  fs.rmSync(packs, { recursive: true, force: true }); fs.rmSync(theme, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
