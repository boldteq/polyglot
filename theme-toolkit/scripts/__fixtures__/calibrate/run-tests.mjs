#!/usr/bin/env node
// Self-test for the Lens calibration loop (WS-G): pure sampleFrames + computeCalibration, and the
// collect → sample → grade → apply IO round-trip. Run: node scripts/__fixtures__/calibrate/run-tests.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.resolve(HERE, '..', '..', 'lens-calibrate.mjs')
const { sampleFrames, computeCalibration } = await import(SCRIPT)
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

console.log('sampleFrames — deterministic spread')
{
  const corpus = Array.from({ length: 100 }, (_, i) => ({ key: `home-mobile-${i}` }))
  const s = sampleFrames(corpus, 20)
  s.length === 20 ? ok('100 corpus → 20 sampled') : bad(`sampled ${s.length}`)
  const s2 = sampleFrames(corpus, 20); JSON.stringify(s) === JSON.stringify(s2) ? ok('deterministic (same sample twice)') : bad('non-deterministic sample')
  sampleFrames([{ a: 1 }, { a: 2 }], 20).length === 2 ? ok('corpus < n → returns all') : bad('small corpus wrong')
}

console.log('computeCalibration — disagreement → suggestion (≥50% of ≥3)')
{
  const graded = [
    { check: 'premium-feel', grade: 'disagree' }, { check: 'premium-feel', grade: 'disagree' }, { check: 'premium-feel', grade: 'disagree' }, { check: 'premium-feel', grade: 'agree' },
    { check: 'horizontal-overflow', grade: 'agree' }, { check: 'horizontal-overflow', grade: 'agree' }, { check: 'horizontal-overflow', grade: 'agree' },
    { check: 'hierarchy', grade: 'disagree' }, { check: 'hierarchy', grade: 'agree' }, // only 2 graded → below min
  ]
  const { suggestions } = computeCalibration(graded)
  const pf = suggestions.find(s => s.check === 'premium-feel')
  pf && pf.disagreeRate === 0.75 ? ok('premium-feel 3/4 disagree → suggestion @ 0.75') : bad(`premium-feel sugg ${JSON.stringify(pf)}`)
  !suggestions.find(s => s.check === 'horizontal-overflow') ? ok('high-agreement check → no suggestion') : bad('overflow should not suggest')
  !suggestions.find(s => s.check === 'hierarchy') ? ok('<3 graded → no suggestion (insufficient signal)') : bad('hierarchy should be below min')
}

console.log('collect → sample → grade → apply (IO round-trip)')
{
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'cal-repo-'))
  const jd = path.join(repo, 'gate-reports', 'lens', 'judge'); fs.mkdirSync(jd, { recursive: true })
  fs.writeFileSync(path.join(jd, 'home-mobile.json'), JSON.stringify({ key: 'home-mobile', surface: 'home', verdict: 'FAIL', confidence: 82, findings: [{ check: 'premium-feel', severity: 'warning' }] }))
  fs.writeFileSync(path.join(jd, 'pdp-desktop.json'), JSON.stringify({ key: 'pdp-desktop', surface: 'pdp', verdict: 'PASS', confidence: 95, findings: [] }))
  const corpus = path.join(repo, 'corpus.jsonl'); const out = path.join(repo, 'out'); fs.mkdirSync(out, { recursive: true })
  const env = { ...process.env, LENS_CALIBRATE_CORPUS: corpus, LENS_CALIBRATE_OUT: out }
  const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: repo, env, encoding: 'utf-8' })
  run(['--collect', repo])
  const corpusLines = fs.readFileSync(corpus, 'utf-8').split('\n').filter(Boolean)
  corpusLines.length === 2 ? ok('--collect appended 2 verdicts to corpus') : bad(`corpus has ${corpusLines.length}`)
  run(['--sample', '20'])
  const q = JSON.parse(fs.readFileSync(path.join(out, 'calibration-queue.json'), 'utf-8'))
  q.queue.length >= 1 ? ok(`--sample wrote ${q.queue.length} grading row(s)`) : bad('sample queue empty')
  // grade: disagree with premium-feel 3×
  q.queue = [{ check: 'premium-feel', grade: 'disagree' }, { check: 'premium-feel', grade: 'disagree' }, { check: 'premium-feel', grade: 'disagree' }]
  fs.writeFileSync(path.join(out, 'calibration-queue.json'), JSON.stringify(q))
  run(['--apply'])
  const sug = JSON.parse(fs.readFileSync(path.join(out, 'calibration-suggestions.json'), 'utf-8'))
  sug.suggestions.find(s => s.check === 'premium-feel') ? ok('--apply produced a premium-feel suggestion') : bad('apply produced no suggestion')
  fs.rmSync(repo, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
