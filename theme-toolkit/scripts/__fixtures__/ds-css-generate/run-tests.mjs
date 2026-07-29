#!/usr/bin/env node
// Regression fixture for generate-design-system-css.mjs — the doc-string/brand_palette bug the haircare
// dogfood surfaced (2026-07-29). Before the fix the generator (a) emitted `color.rule`/`color.system`/
// `color.wiring_handoff` prose as bogus `--ds-color-rule: <a paragraph>` vars, and (b) MISSED the real
// swatches when they were nested under `color.brand_palette` (the 2026-07 contract shape) — so a build's
// brand colours were unreachable from the kit while paragraphs leaked into the CSS. Also proves shadows.
//
// Run (Node 20): node scripts/__fixtures__/ds-css-generate/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GEN = path.resolve(HERE, '..', '..', 'generate-design-system-css.mjs')
let f = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); f += 1 }

const DS = {
  typography: { allowed_px: [56, 42, 32, 24, 16], allowed_weights: [400, 600] },
  spacing: { scale: [0, 8, 16, 24, 48], section_rhythm_px: 96 },
  color: {
    system: 'a paragraph describing the whole colour system in prose',
    rule: 'one disciplined accent on a restrained base',
    wiring_handoff: 'loom writes these into config/settings_data.json',
    brand_palette: { forest: '#2F3D2A', cream: '#F6F1E7', terracotta: '#C06B4E' },
  },
  shadow: { tokens: { sm: '0 1px 2px rgba(31,27,22,.08)', md: '0 6px 20px rgba(31,27,22,.12)' } },
  radius: { tokens: { md: 12 } },
}

function generate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dscss-'))
  fs.mkdirSync(path.join(dir, 'docs', 'design'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'docs', 'design', 'design-system.json'), JSON.stringify(DS))
  const r = spawnSync('node', [GEN], { cwd: dir, encoding: 'utf-8' })
  let css = ''
  try { css = fs.readFileSync(path.join(dir, 'assets', 'design-system.css'), 'utf-8') } catch { /* not written */ }
  fs.rmSync(dir, { recursive: true, force: true })
  return { code: r.status, css }
}

console.log('generate-design-system-css — brand_palette swatches + doc-string guard + shadows')
{
  const { code, css } = generate()
  code === 0 ? pass('generator exits 0') : fail(`expected exit 0, got ${code}`)
  // (a) the real swatches (nested under brand_palette) ARE emitted
  ;/--ds-color-forest:\s*#2F3D2A/i.test(css) ? pass('brand_palette swatch --ds-color-forest emitted') : fail('missing --ds-color-forest (brand_palette not walked)')
  ;/--ds-color-cream:\s*#F6F1E7/i.test(css) && /--ds-color-terracotta:\s*#C06B4E/i.test(css) ? pass('all brand_palette swatches emitted') : fail('a brand_palette swatch is missing')
  // (b) the prose doc fields are NOT emitted as colour vars
  ;!/--ds-color-(rule|system|wiring-handoff)/i.test(css) ? pass('doc-string color fields excluded (no --ds-color-rule/system/wiring-handoff)') : fail('a prose doc field leaked into a --ds-color-* var')
  ;!/disciplined accent|a paragraph describing|loom writes these/i.test(css) ? pass('no prose paragraph leaked into the CSS') : fail('a prose paragraph leaked into the generated CSS')
  // (c) shadow tokens emitted
  ;/--ds-shadow-sm:\s*0 1px 2px/i.test(css) && /--ds-shadow-md:/i.test(css) ? pass('shadow tokens emitted (--ds-shadow-sm/md)') : fail('shadow tokens missing')
}

console.log(f === 0 ? '\nds-css-generate: ALL CASES PASS' : `\nds-css-generate: ${f} FAILED`)
process.exit(f ? 1 : 0)
