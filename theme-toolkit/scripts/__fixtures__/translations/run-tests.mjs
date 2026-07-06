#!/usr/bin/env node
// Self-test for #51 — locale completeness (flattenKeys + localeParityGaps pure + the gate end to end).
// Run (Node 20): node scripts/__fixtures__/locale-completeness/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { flattenKeys, localeParityGaps } from '../../check-locale-completeness.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-locale-completeness.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('flattenKeys + localeParityGaps — pure')
eq(flattenKeys({ a: { b: 1 }, c: 2 }).sort(), ['a.b', 'c'], 'nested keys flatten to dot-paths')
eq(localeParityGaps({ en: { a: 1, b: 2 }, fr: { a: 1 } }, 'en'), { fr: ['b'] }, 'fr missing b → gap')
eq(localeParityGaps({ en: { a: 1 }, fr: { a: 1 } }, 'en'), {}, 'full parity → no gaps')
eq(localeParityGaps({ en: { a: { x: 1, y: 2 } }, de: { a: { x: 1 } } }, 'en'), { de: ['a.y'] }, 'nested missing key → gap')

console.log('check-locale-completeness gate — end to end')
function runGate(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, LOCALE_ENFORCE: '', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'translations.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const allIds = (rep) => new Set([...(rep?.blockers || []), ...(rep?.warnings || [])].map(x => x.id))
function build(localeFiles) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'loc-'))
  fs.mkdirSync(path.join(d, 'locales'), { recursive: true })
  for (const [f, obj] of Object.entries(localeFiles)) fs.writeFileSync(path.join(d, 'locales', f), JSON.stringify(obj))
  return d
}
{
  const d = build({ 'en.default.json': { hero: { title: 'Hi', cta: 'Buy' } }, 'fr.json': { hero: { title: 'Salut' } } })
  const dev = runGate(d)
  dev.code === 0 && (dev.rep?.warnings || []).some(w => w.id === 'locale.missing-keys') ? pass('fr missing key (dev) → warn, exit 0') : fail(`dev: code ${dev.code} ids ${[...allIds(dev.rep)]}`)
  const strict = runGate(d, { LOCALE_ENFORCE: '1' })
  strict.code === 1 && (strict.rep?.blockers || []).some(b => b.id === 'locale.missing-keys') ? pass('+ENFORCE → BLOCK') : fail(`enforce: code ${strict.code}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const d = build({ 'en.default.json': { hero: { title: 'Hi' } } })
  const { code, rep } = runGate(d)
  code === 0 && allIds(rep).has('locale.n-a-monolingual') ? pass('single locale → SKIP/PASS') : fail(`mono: code ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
