// The design-system cascade must expose BRAND COLOURS, not just type/spacing (CB-1, 2026-07-23).
//
// The generator emitted type, spacing, weight and font tokens but skipped `color` entirely, so the
// PDF-authoritative palette in design-system.json had no CSS variable anywhere in the theme. That is
// the reason every custom section hardcodes literals — there was nothing to bind to. On cravinbyandy
// it accounts for 201 of 476 design-token blockers (165 `ds.color-hex` + 36 `ds.color-literal`).
//
// Emitting them is what makes the CB-1 swap provably IDENTITY: `#6C6C6C` → `var(--ds-color-body-gray)`
// where that var holds exactly `#6C6C6C`, so no rendered colour changes. Dawn's `--color-*` scheme
// vars cannot serve this purpose — they resolve per section scheme, so pinning a fixed brand colour to
// one would change the result wherever a section runs under a different scheme.
//
// Runs the real generator against temp contracts — no theme, no network.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'generate-design-system-css.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const has = (css, line, m) => (css.includes(line) ? ok(m) : bad(`${m} — missing: ${line}`))

const BASE = { typography: { allowed_px: [64, 51, 22, 18, 16], allowed_weights: [400, 700] }, spacing: { scale: [4, 8, 16, 60] } }

function gen(contract) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-'))
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'design', 'design-system.json'), JSON.stringify(contract))
  const outFile = path.join(d, 'out.css')
  const r = spawnSync(process.execPath, [GEN, '--out', outFile], { cwd: d, encoding: 'utf-8' })
  const css = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf-8') : ''
  fs.rmSync(d, { recursive: true, force: true })
  return { css, code: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

console.log('case (a) THE GAP — brand colours become CSS variables')
{
  const { css, code } = gen({ ...BASE, color: { pink: '#FFE1F3', dark_green: '#2C3D1E', body_gray: '#6C6C6C' } })
  code === 0 ? ok('generator exits 0') : bad(`exit ${code}`)
  has(css, '--ds-color-pink: #FFE1F3;', 'pink emitted')
  has(css, '--ds-color-body-gray: #6C6C6C;', 'snake_case key → kebab-case var')
  has(css, '--ds-color-dark-green: #2C3D1E;', 'dark_green → --ds-color-dark-green')
}

console.log('case (b) values are copied VERBATIM — the swap must be identity, never a re-interpretation')
{
  const { css } = gen({ ...BASE, color: { on_green_muted: 'rgba(255,255,255,0.8)', surface: '#FFFFFF' } })
  has(css, '--ds-color-on-green-muted: rgba(255,255,255,0.8);', 'rgba() passes through untouched')
  has(css, '--ds-color-surface: #FFFFFF;', 'hex case preserved (not lowercased or shortened)')
}

console.log('case (c) documentation keys are NOT tokens')
{
  // design-system.json carries `_source` prose explaining where the palette came from
  const { css } = gen({ ...BASE, color: { _source: 'Official brand kit — Cravin-Brand-Document.pdf', pink: '#FFE1F3' } })
  css.includes('--ds-color--source')
    ? bad('a `_`-prefixed documentation key was emitted as a token')
    : ok('_source is skipped')
  has(css, '--ds-color-pink: #FFE1F3;', 'real tokens still emitted alongside it')
}

console.log('case (d) a contract with no colours still generates (colour is additive, not required)')
{
  const { css, code, out } = gen(BASE)
  code === 0 ? ok('exit 0 without a color block') : bad(`exit ${code}: ${out.slice(0, 80)}`)
  css.includes('--ds-color-') ? bad('emitted a colour token from nothing') : ok('no colour tokens invented')
  has(css, '--ds-h1:', 'the existing type cascade is unaffected')
}

console.log('case (e) non-string values are ignored rather than stringified into garbage')
{
  const { css } = gen({ ...BASE, color: { pink: '#FFE1F3', palette: { nested: '#000' }, count: 3, blank: '  ' } })
  has(css, '--ds-color-pink: #FFE1F3;', 'valid token emitted')
  for (const bad_ of ['--ds-color-palette', '--ds-color-count', '--ds-color-blank']) {
    css.includes(bad_) ? bad(`${bad_} emitted from a non-string/empty value`) : ok(`${bad_} correctly skipped`)
  }
}

console.log(failures === 0 ? '\nds-cascade-color: ALL CASES PASS' : `\nds-cascade-color: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
