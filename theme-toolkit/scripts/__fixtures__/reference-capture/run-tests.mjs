#!/usr/bin/env node
// Self-test for reference-capture.mjs (S3) — makes screenshot/reference capture AUTOMATIC.
// Hermetic + offline: no network, no Figma MCP, no claude spawn (CLAUDE_BIN is forced to a missing bin
// so gate #46 L2 self-skips), no dependency on ffmpeg for the assertions that must be deterministic.
//
//   (1) pure parseFigmaUrl — node id + file key parse across URL shapes and a bare id
//   (2) pure resolveArchetype — explicit / signal-inferred / ambiguous-null / invalid
//   (3) pure deriveName + isInsideRepo
//   (4) --image round-trip → lands in docs/design/references/ AND writes reference-map.json w/ archetype
//   (5) the round-trip entry is then READ by gate #46 check-reference-match (L1 pass on a match,
//       L1 block on a mismatch) — end-to-end, offline
//   (6) --file inside the repo is registered in place, NOT duplicated
//   (7) missing --surface errors cleanly (exit 2); ambiguous archetype asks for --archetype (exit 2)
//   (8) --figma prints the fetch + persist commands (cache probe spends no Figma call)
//   (9) --video with a missing file fails cleanly (exit 2) — the video path guards before touching ffmpeg

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseFigmaUrl, resolveArchetype, deriveName, isInsideRepo } from '../../reference-capture.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CAPTURE = path.resolve(HERE, '..', '..', 'reference-capture.mjs')
const CHECK = path.resolve(HERE, '..', '..', 'check-reference-match.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const ok = (cond, m) => (cond ? pass(m) : fail(m))

// A fresh temp "theme repo" and a helper to run reference-capture inside it.
function tmpRepo(prefix = 'refcap-') { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)) }
function writeFile(root, rel, body = 'x') { const abs = path.join(root, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, body); return abs }
function runCapture(root, args) {
  // Hermetic: these cases assert the TEXT-signal + persistence logic, so vision is off. The vision path
  // (an actual claude -p read of the image) is proven separately by lens-read-eval.mjs against real frames.
  const r = spawnSync('node', [CAPTURE, ...args], { cwd: root, encoding: 'utf-8', env: { ...process.env, REFERENCE_CAPTURE_NO_VISION: '1' } })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}
function readMap(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'docs/design/reference-map.json'), 'utf-8')) } catch { return null }
}
function sectionOf(map, surface, name) {
  const s = (map?.surfaces || []).find(x => x.surface === surface)
  return s ? (s.sections || []).find(x => x.name === name) || null : null
}

console.log('case (1) parseFigmaUrl — node id + file key across shapes')
{
  const a = parseFigmaUrl('https://www.figma.com/design/lInEfNo3UXiju5B3kq1Tvi/CravinByAndy?node-id=225-1294&t=xY')
  ok(a && a.fileKey === 'lInEfNo3UXiju5B3kq1Tvi' && a.nodeId === '225:1294', 'design URL → fileKey + node-id dash→colon')
  const b = parseFigmaUrl('https://www.figma.com/file/ABC123def/Name?node-id=10%3A5')
  ok(b && b.fileKey === 'ABC123def' && b.nodeId === '10:5', 'file URL → %3A decodes to colon')
  const c = parseFigmaUrl('225:1294')
  ok(c && c.fileKey === null && c.nodeId === '225:1294', 'bare colon node id → nodeId only, no fileKey')
  const d = parseFigmaUrl('225-1294')
  ok(d && d.nodeId === '225:1294', 'bare dash node id normalises to colon')
  ok(parseFigmaUrl('just some text') === null, 'non-figma text → null')
  ok(parseFigmaUrl('') === null, 'empty → null')
}

console.log('case (2) resolveArchetype — explicit / signals / ambiguous / invalid')
{
  ok(resolveArchetype({ archetype: 'carousel' }).archetype === 'carousel', 'explicit archetype wins')
  ok(!!resolveArchetype({ archetype: 'bogus' }).error, 'invalid explicit archetype → error')
  const s = resolveArchetype({ mustHave: ['pagination dots', 'auto-rotate', 'no arrows'] })
  ok(s.archetype === 'slideshow' && s.source === 'signals', '"pagination dots … no arrows" → slideshow (negation stripped)')
  ok(resolveArchetype({ name: 'faq-accordion' }).archetype === 'accordion', '"faq-accordion" → accordion')
  ok(resolveArchetype({ mustHave: ['dots and arrows'] }).archetype === 'slideshow', 'dots+arrows → slideshow (dots win)')
  const amb = resolveArchetype({ name: 'hero', mustHave: [] })
  ok(amb.archetype === null, 'bare "hero" is ambiguous → null (ask for --archetype, do not guess)')
  ok(resolveArchetype({ mustHave: ['left/right arrows', 'partially-cut card'] }).archetype === 'carousel', 'arrows + cut card → carousel')
  ok(resolveArchetype({ name: 'newsletter-signup' }).archetype === 'newsletter', '"newsletter-signup" → newsletter')
}

console.log('case (3) deriveName + isInsideRepo')
{
  ok(deriveName('/Users/x/Desktop/Hero Slideshow v2.png') === 'hero-slideshow-v2', 'kebab from messy basename')
  ok(deriveName('hero.png') === 'hero', 'simple basename')
  const root = '/tmp/theme'
  ok(isInsideRepo('/tmp/theme/docs/a.png', root) === true, 'a child path is inside the repo')
  ok(isInsideRepo('/tmp/other/a.png', root) === false, 'a sibling path is outside the repo')
}

console.log('case (4) --image round-trip → copied into references/ + reference-map.json with archetype')
{
  const root = tmpRepo()
  // A pasted image lives OUTSIDE the repo (on the Desktop, in /tmp, …) — capture must copy it IN.
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paste-'))
  const src = path.join(srcDir, 'whatever-the-user-pasted.png')
  fs.writeFileSync(src, 'PNGDATA')
  const { code, out, err } = runCapture(root, ['--surface', 'home', '--name', 'hero', '--image', src, '--must-have', 'pagination dots, auto-rotate, no arrows'])
  ok(code === 0, `exit 0 (got ${code})${code !== 0 ? ` :: ${err}` : ''}`)
  const copied = path.join(root, 'docs/design/references/home/hero.png')
  ok(fs.existsSync(copied), 'image copied into docs/design/references/home/hero.png')
  const entry = sectionOf(readMap(root), 'home', 'hero')
  ok(!!entry, 'reference-map.json has home/hero')
  ok(entry && entry.archetype === 'slideshow', 'archetype resolved to slideshow from --must-have signals')
  ok(entry && entry.reference === 'docs/design/references/home/hero.png', 'reference points at the in-repo copy')
  ok(out.includes('check-reference-match'), 'prints the single next command (check-reference-match)')
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(srcDir, { recursive: true, force: true })
}

console.log('case (5) the captured entry is READ by gate #46 check-reference-match (L1), end-to-end offline')
{
  const root = tmpRepo()
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paste-'))
  const src = path.join(srcDir, 'hero.png'); fs.writeFileSync(src, 'PNGDATA')
  runCapture(root, ['--surface', 'home', '--name', 'hero', '--image', src, '--archetype', 'slideshow'])
  // CLAUDE_BIN forced to a missing binary → #46 L2 self-skips (ref.judge-unavailable), no real spawn.
  const runCheck = () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'))
    const r = spawnSync('node', [CHECK], { cwd: root, encoding: 'utf-8', env: { ...process.env, REPORT_DIR: reportDir, CLAUDE_BIN: '__no_claude_here__' } })
    let rep = null
    try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'reference-match.json'), 'utf-8')) } catch { /* died */ }
    fs.rmSync(reportDir, { recursive: true, force: true })
    return { code: r.status, rep }
  }
  // matching build: a real slideshow section on the home template → L1 pass
  writeFile(root, 'templates/index.json', JSON.stringify({ sections: { hero: { type: 'slideshow' } }, order: ['hero'] }, null, 2))
  const good = runCheck()
  ok(good.code === 0, `L1 passes when the build matches the archetype (exit ${good.code})`)
  ok(good.rep && good.rep.evidence && good.rep.evidence.l1Pass >= 1, 'the report shows the entry was actually read (l1Pass ≥ 1)')
  // mismatched build: the exact cravinbyandy defect — slideshow declared, image-banner built → L1 block
  writeFile(root, 'templates/index.json', JSON.stringify({ sections: { hero: { type: 'image-banner' } }, order: ['hero'] }, null, 2))
  const bad = runCheck()
  ok(bad.code === 1, `L1 BLOCKS when the build ships image-banner against a slideshow reference (exit ${bad.code})`)
  const ids = new Set((bad.rep?.blockers || []).map(b => b.id))
  ok(ids.has('ref.archetype-absent') || ids.has('ref.archetype-mismatch'), 'blocker is an archetype conflict')
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(srcDir, { recursive: true, force: true })
}

console.log('case (6) --file inside the repo → referenced in place, NOT duplicated')
{
  const root = tmpRepo()
  // A reference already committed somewhere in the repo (not at the canonical references/ path).
  writeFile(root, 'docs/brand/promo.png', 'PNGDATA')
  const { code, err } = runCapture(root, ['--surface', 'home', '--name', 'promo', '--file', 'docs/brand/promo.png', '--archetype', 'image-banner'])
  ok(code === 0, `exit 0 (got ${code})${code !== 0 ? ` :: ${err}` : ''}`)
  ok(!fs.existsSync(path.join(root, 'docs/design/references/home/promo.png')), 'no canonical copy made — the in-repo file is not duplicated')
  const entry = sectionOf(readMap(root), 'home', 'promo')
  ok(entry && entry.reference === 'docs/brand/promo.png', 'reference points at the existing in-repo path')
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('case (7) honest degrades — missing --surface + ambiguous archetype both exit 2')
{
  const root = tmpRepo()
  const src = writeFile(root, 'tmp/x.png', 'PNGDATA')
  const noSurface = runCapture(root, ['--image', src, '--name', 'hero', '--archetype', 'slideshow'])
  ok(noSurface.code === 2, `missing --surface → exit 2 (got ${noSurface.code})`)
  ok(/surface/i.test(noSurface.err), 'error names the missing --surface')
  // ambiguous: a name with no structural signal and no --archetype → ask, don't guess
  const ambiguous = runCapture(root, ['--surface', 'home', '--name', 'mystery', '--image', src])
  ok(ambiguous.code === 2, `ambiguous archetype → exit 2 (got ${ambiguous.code})`)
  ok(/archetype/i.test(ambiguous.err), 'error asks for --archetype rather than guessing')
  ok(!fs.existsSync(path.join(root, 'docs/design/reference-map.json')), 'nothing is persisted on a clean failure')
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('case (8) --figma → prints the fetch + persist commands (cache probe, no Figma call)')
{
  const root = tmpRepo()
  const { code, out } = runCapture(root, ['--figma', 'https://www.figma.com/design/KEY123/x?node-id=1-2', '--surface', 'home', '--name', 'hero', '--archetype', 'slideshow'])
  ok(code === 0, `exit 0 (got ${code})`)
  ok(out.includes('get_screenshot'), 'names get_screenshot as the one fetch')
  ok(out.includes('1:2'), 'prints the normalised node id')
  ok(out.includes('KEY123'), 'prints the file key')
  ok(out.includes('check-reference-match'), 'names the next verification command')
  ok(!fs.existsSync(path.join(root, 'docs/design/reference-map.json')), 'probe persists nothing (no fetch happened)')
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('case (9) --video with a missing file fails cleanly (exit 2), before touching ffmpeg')
{
  const root = tmpRepo()
  const { code, err } = runCapture(root, ['--video', path.join(root, 'no-such.mp4'), '--at', '1:30', '--surface', 'home', '--name', 'hero', '--archetype', 'slideshow'])
  ok(code === 2, `missing video → exit 2 (got ${code})`)
  ok(/video/i.test(err), 'error names the missing --video')
  fs.rmSync(root, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
