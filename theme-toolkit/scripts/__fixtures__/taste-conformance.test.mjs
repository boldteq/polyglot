// Hermetic fixture for gate #P9 check-taste-conformance. STRUCTURE mirrors reference-match/run-tests
// — end-to-end cases spawn the gate against a synthetic tmp repo (proving the N/A paths and the stub
// pathway light up correctly), while palette-match / palette-divergent exercise the exported PURE
// diff helper `colorDivergence` directly (that helper IS the enforcement pathway; the frame extractor
// is honestly stubbed today, per the gate's own contract, until color-thief-node is vendored — see
// case (e) for the deferred-report proof).
//
// Node assert for the checks; PASS/FAIL printed line-by-line so a CI reader can see which case broke.
// Each end-to-end case gets its own tmp dir via fs.mkdtempSync; all are cleaned up at the end.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  colorDivergence,
  parseHex,
  aggregate,
  heroFrameFor,
} from '../check-taste-conformance.mjs'

let failures = 0
const tmpDirs = []

function check(label, fn) {
  try { fn(); console.log('  PASS  ' + label) }
  catch (e) { console.log('  FAIL  ' + label + ' — ' + e.message); failures++ }
}

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-taste-conformance.mjs')

function makeTmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'taste-'))
  tmpDirs.push(d)
  return d
}

// Spin up an isolated tmp tree, optionally seed docs/design/taste-extract.json + a Lens manifest +
// zero-or-more frame files, then run the gate as a fresh child process. Returns { code, report }.
function runGate({ extract, manifest, frames = {}, env = {} } = {}) {
  const d = makeTmp()
  if (extract !== undefined) {
    fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
    fs.writeFileSync(
      path.join(d, 'docs', 'design', 'taste-extract.json'),
      typeof extract === 'string' ? extract : JSON.stringify(extract),
    )
  }
  const reportDir = path.join(d, 'gate-reports')
  const lensDir = path.join(reportDir, 'lens')
  if (manifest !== undefined) {
    fs.mkdirSync(lensDir, { recursive: true })
    fs.writeFileSync(
      path.join(lensDir, 'lens-manifest.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    )
  }
  for (const [rel, bytes] of Object.entries(frames)) {
    const abs = path.join(lensDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    // Minimal PNG-ish header — the stub only checks fs.existsSync, byte contents are irrelevant.
    fs.writeFileSync(abs, bytes ?? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  const r = spawnSync(process.execPath, [GATE], {
    cwd: d,
    encoding: 'utf-8',
    env: { ...process.env, REPORT_DIR: 'gate-reports', ...env },
  })
  let report = null
  try { report = JSON.parse(fs.readFileSync(path.join(reportDir, 'taste-conformance.json'), 'utf-8')) } catch { /* no report */ }
  return { code: r.status, report, stderr: r.stderr, stdout: r.stdout }
}

const warnIds = (r) => new Set((r?.warnings || []).map(w => w.id))
const blockIds = (r) => new Set((r?.blockers || []).map(b => b.id))

// ── case 1 ────────────────────────────────────────────────────────────────────
console.log('case (a) no docs/design/taste-extract.json → PASS with taste.n-a-no-extract')
{
  const { code, report } = runGate({}) // no extract at all
  check('exit 0', () => assert.equal(code, 0))
  check('report written', () => assert.ok(report, 'no report produced'))
  check('pass=true', () => assert.equal(report.pass, true))
  check('warning taste.n-a-no-extract emitted', () => assert.ok(warnIds(report).has('taste.n-a-no-extract'), `warnings=${[...warnIds(report)].join(',')}`))
  check('no blockers', () => assert.equal(blockIds(report).size, 0))
  check('evidence.extract_present=false', () => assert.equal(report.evidence.extract_present, false))
  check('evidence.mode="n/a"', () => assert.equal(report.evidence.mode, 'n/a'))
}

// ── case 2 ────────────────────────────────────────────────────────────────────
console.log('case (b) extract present, no Lens manifest → PASS with taste.n-a-no-lens-capture')
{
  const extract = { palette: { dominant: '#F5F1E8', accents: ['#2E2A26'] } }
  const { code, report } = runGate({ extract }) // no manifest
  check('exit 0', () => assert.equal(code, 0))
  check('pass=true (N/A tolerant)', () => assert.equal(report.pass, true))
  check('warning taste.n-a-no-lens-capture emitted', () => assert.ok(warnIds(report).has('taste.n-a-no-lens-capture'), `warnings=${[...warnIds(report)].join(',')}`))
  check('no blockers', () => assert.equal(blockIds(report).size, 0))
  check('evidence.extract_present=true', () => assert.equal(report.evidence.extract_present, true))
  check('evidence.mode="n/a-no-frames"', () => assert.equal(report.evidence.mode, 'n/a-no-frames'))
}

// ── case 3 ────────────────────────────────────────────────────────────────────
// The extractor is stubbed today, so we prove the diff pathway via the PURE helper the gate uses
// as its arbiter. When extract dominant matches the rendered dominant, colorDivergence.over must be
// false → no `taste.palette-drift` warning is possible.
console.log('case (c) palette-match — extract [#F5F1E8,#2E2A26] vs matching built dominant → no divergence')
{
  check('exact match → over=false, distance=0', () => {
    const div = colorDivergence('#F5F1E8', '#F5F1E8')
    assert.ok(div, 'null result')
    assert.equal(div.over, false)
    assert.equal(div.distance, 0)
    assert.equal(div.metric, 'rgb') // chroma-js not vendored → fallback path
  })
  check('near-match within default tolerance (20) → over=false', () => {
    const div = colorDivergence('#F5F1E8', '#F4F0E7')
    assert.ok(div && div.over === false, `div=${JSON.stringify(div)}`)
  })
  check('the darker accent maps too (parseHex round-trips)', () => {
    const p = parseHex('#2E2A26')
    assert.deepEqual(p, { r: 0x2E, g: 0x2A, b: 0x26 })
  })
  check('aggregate over zero diverged dimensions → share=0, not blocked', () => {
    const agg = aggregate([{ surface: 'home', status: 'compared', diverged: false }], true, 0.30)
    assert.equal(agg.diverged, 0)
    assert.equal(agg.share, 0)
    assert.equal(agg.blocked, false)
  })
}

// ── case 4 ────────────────────────────────────────────────────────────────────
// Divergent hex — extract dominant #F5F1E8 vs built dominant #FF0000. The diff helper must flag
// `over: true` with a finite reported distance; that's what triggers the gate's `taste.palette-drift`
// warning once the extractor is wired.
console.log('case (d) palette-divergent — extract [#F5F1E8] vs #FF0000 built → over=true + delta reported')
{
  check('divergent hex → over=true', () => {
    const div = colorDivergence('#F5F1E8', '#FF0000')
    assert.ok(div, 'null result')
    assert.equal(div.over, true)
  })
  check('distance is finite and > tolerance', () => {
    const div = colorDivergence('#F5F1E8', '#FF0000')
    assert.ok(Number.isFinite(div.distance) && div.distance > 0, `distance=${div?.distance}`)
    assert.ok(div.distance > div.tolerance, `${div.distance} !> ${div.tolerance}`)
  })
  check('default TOL_RGB=20 surfaced in the result', () => {
    const div = colorDivergence('#F5F1E8', '#FF0000')
    assert.equal(div.tolerance, 20)
    assert.equal(div.metric, 'rgb')
  })
  check('aggregate under ENFORCE with 100% diverged → blocked=true', () => {
    const agg = aggregate([{ surface: 'home', status: 'compared', diverged: true }], true, 0.30)
    assert.equal(agg.blocked, true)
    assert.equal(agg.share, 1)
  })
  check('advisory mode (enforce=false) → never blocks even at 100%', () => {
    const agg = aggregate([{ surface: 'home', status: 'compared', diverged: true }], false, 0.30)
    assert.equal(agg.blocked, false)
  })
  check('deferred dimensions do not count toward the denominator', () => {
    const agg = aggregate([
      { surface: 'home', status: 'compared', diverged: true },
      { surface: 'home', status: 'deferred' },
      { surface: 'home', status: 'n/a' },
    ], true, 0.30)
    assert.equal(agg.total, 1)
    assert.equal(agg.diverged, 1)
  })
  check('heroFrameFor picks the desktop hero when a matching viewport exists', () => {
    const m = { frames: [{ surface: 'home', viewport: 'desktop', frames: { hero: 'home/desktop/hero.png' } }] }
    const f = heroFrameFor('home', 'desktop', m)
    assert.ok(f, 'no frame resolved')
    assert.equal(f.rel, 'home/desktop/hero.png')
    assert.equal(f.kind, 'hero')
  })
}

// ── case 5 ────────────────────────────────────────────────────────────────────
// End-to-end: extract + manifest + frame all present. color-thief-node is NOT vendored → the
// extractor stub returns { deferred: true, note: 'extraction_deferred' }. The gate MUST still run,
// pass, and honestly report the deferred dimension (gate #45 gate-integrity relies on this).
console.log('case (e) missing color-thief — stub still runs, emits extraction_deferred report')
{
  const extract = { palette: { dominant: '#F5F1E8' } }
  const manifest = {
    frames: [
      { surface: 'home', viewport: 'desktop', frames: { hero: 'home/desktop/hero.png' } },
    ],
  }
  const frames = { 'home/desktop/hero.png': undefined /* default PNG header bytes */ }
  const { code, report, stderr } = runGate({ extract, manifest, frames })
  check('exit 0 (advisory mode, deferred ≠ block)', () => assert.equal(code, 0, `stderr=${stderr}`))
  check('report written', () => assert.ok(report, 'no report produced'))
  check('pass=true', () => assert.equal(report.pass, true))
  check('no blockers', () => assert.equal(blockIds(report).size, 0))
  check('warning taste.extraction-deferred emitted', () => assert.ok(warnIds(report).has('taste.extraction-deferred'), `warnings=${[...warnIds(report)].join(',')}`))
  check('evidence.frames_found=1 / frames_missing=0', () => {
    assert.equal(report.evidence.frames_found, 1)
    assert.equal(report.evidence.frames_missing, 0)
  })
  check('evidence.dimensions.palette.deferred=1', () => {
    const p = report.evidence.dimensions.palette
    assert.equal(p.deferred, 1, `palette=${JSON.stringify(p)}`)
    assert.equal(p.diverged, 0)
  })
  check('per-surface record notes deferred + carries the stub note', () => {
    const rec = report.evidence.surfaces[0]
    assert.ok(rec, 'no per-surface record')
    assert.equal(rec.surface, 'home')
    assert.equal(rec.dimensions.palette.status, 'deferred')
    assert.equal(rec.dimensions.palette.note, 'extraction_deferred')
    assert.equal(rec.dimensions.palette.ref, '#F5F1E8')
  })
  check('aggregate_divergence=0 (no considered dimensions when only deferred)', () => {
    assert.equal(report.evidence.aggregate_divergence, 0)
  })
}

// ── cleanup ───────────────────────────────────────────────────────────────────
for (const d of tmpDirs) {
  try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* best-effort */ }
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
