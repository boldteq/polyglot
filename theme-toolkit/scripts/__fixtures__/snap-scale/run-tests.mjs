// snap-scale-to-ladder — the CB-3 companion to snap-colors-to-tokens.
//
// The two tools are deliberately NOT symmetrical. snap-colors could be fully mechanical because its
// rule is IDENTITY: a literal is swapped only when it already equals a token, so the render cannot
// change. Type and spacing have no such luxury — snapping 15px to 16px CHANGES WHAT RENDERS, and on
// cravinbyandy 15px appears 18 times, i.e. most body copy on the site.
//
// So the load-bearing behaviour here is the REFUSAL: --apply must decline when any move exceeds the
// bar, because "which size did they mean?" is a design decision and guessing it silently is the exact
// anti-pattern this workstream exists to stop. These cases pin that the refusal cannot be lost.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { nearest, snapCss, snapLiquid } from '../../snap-scale-to-ladder.mjs'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'snap-scale-to-ladder.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const L = { type: [16, 32], space: [8, 16, 24] }

console.log('nearest — the arithmetic the whole tool rests on')
{
  nearest(15, [16, 32]) === 16 && nearest(30, [16, 32]) === 32 && nearest(24, [16, 32]) === 16
    ? ok('picks the closest step (ties resolve low)') : bad('nearest is wrong')
  nearest(5, []) === null ? ok('an empty ladder snaps nothing') : bad('empty ladder mishandled')
}

console.log('\n── what it moves, and what it must never touch ──')
{
  const r = snapCss('.a { font-size: 15px; padding: 9px; }', L)
  const px = r.changes.map((c) => `${c.from}->${c.to}`).sort().join(',')
  px === '15->16,9->8' ? ok(`font-size and padding both snap (${px})`) : bad(`got ${px}`)

  // already on the ladder → untouched, and NOT reported as a change
  snapCss('.a { font-size: 16px; padding: 24px; }', L).changes.length === 0
    ? ok('on-ladder values are left alone') : bad('on-ladder value was "snapped"')

  // bound to a token → the token is the source of truth
  snapCss('.a { font-size: var(--ds-h2); }', L).changes.length === 0
    ? ok('a var()-bound value is never rewritten') : bad('var() binding was overwritten')

  // CB-2's lesson: a constant inside calc()/clamp() is geometry, not rhythm
  const f = snapCss('.a { padding-top: max(0px, calc(47vw - 655px - 7rem)); }', L)
  f.changes.length === 0 && f.skipped.length === 1
    ? ok('a formula constant is skipped and REPORTED, not silently ignored') : bad(`formula: ${f.changes.length} changes`)

  // positioning is geometry too — snapping `top` moves the element
  snapCss('.a { top: 33.5px; left: 9px; }', L).changes.length === 0
    ? ok('positioning props are not rhythm and are not snapped') : bad('positioning was snapped')

  // only the inside of a style block in a .liquid
  const lq = snapLiquid('<div data-x="9px">9px</div>{% style %}.a { padding: 9px; }{% endstyle %}', L)
  lq.changes.length === 1 && (lq.text.match(/9px/g) || []).length === 2
    ? ok('only the {% style %} body is rewritten; markup keeps its text') : bad(`liquid: ${lq.changes.length} changes`)
}

console.log('\n── THE REFUSAL: a big move is a design decision, not a mechanical one ──')
function run(files, args = []) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'snapscale-'))
  fs.mkdirSync(path.join(d, 'docs', 'design'), { recursive: true })
  fs.mkdirSync(path.join(d, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs', 'design', 'design-system.json'),
    JSON.stringify({ typography: { allowed_px: [16, 32], rem_root_px: 16 }, spacing: { scale: [8, 16, 24] } }))
  for (const [rel, body] of Object.entries(files)) fs.writeFileSync(path.join(d, rel), body)
  const r = spawnSync(process.execPath, [GATE, ...args], { cwd: d, encoding: 'utf-8' })
  const after = Object.fromEntries(Object.keys(files).map((rel) => [rel, fs.readFileSync(path.join(d, rel), 'utf-8')]))
  fs.rmSync(d, { recursive: true, force: true })
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), after }
}
{
  // 15 -> 16 is 1px: imperceptible, allowed
  const small = run({ 'assets/a.css': '.a { font-size: 15px; }' }, ['--apply'])
  small.code === 0 && /font-size: 16px/.test(small.after['assets/a.css'])
    ? ok('a 1px move applies') : bad(`small move: code ${small.code} ${small.after['assets/a.css']}`)

  // 24 -> 32 is 8px: a different size entirely. MUST refuse, and MUST NOT write.
  const big = run({ 'assets/b.css': '.b { font-size: 24px; }' }, ['--apply'])
  big.code === 1 && /REFUSED/.test(big.out) && /font-size: 24px/.test(big.after['assets/b.css'])
    ? ok('an 8px move is REFUSED and the file is untouched') : bad(`big move: code ${big.code}, file now ${big.after['assets/b.css']}`)

  // refusal is per-RUN, not per-file: one oversized move blocks the batch, so a partial write can
  // never leave the theme half-snapped
  const mixed = run({ 'assets/c.css': '.c { font-size: 15px; }', 'assets/d.css': '.d { font-size: 24px; }' }, ['--apply'])
  mixed.code === 1 && /font-size: 15px/.test(mixed.after['assets/c.css'])
    ? ok('one oversized move blocks the whole batch (no partial write)') : bad('batch wrote partially')

  // ...and the bar can be raised, but only deliberately.
  // 24 is equidistant from 16 and 32, and ties resolve LOW (asserted at the top) — so it lands on 16.
  const raised = run({ 'assets/e.css': '.e { font-size: 24px; }' }, ['--apply', '--max-delta', '8'])
  const landedLow = /font-size: 16px/
  raised.code === 0 && landedLow.test(raised.after['assets/e.css'])
    ? ok('--max-delta raises the bar explicitly (24 -> 16, tie resolves low)') : bad(`raised: code ${raised.code} file ${raised.after['assets/e.css']}`)

  // dry run is the default and never writes
  const dry = run({ 'assets/f.css': '.f { font-size: 15px; }' })
  dry.code === 0 && /font-size: 15px/.test(dry.after['assets/f.css']) && /would snap/.test(dry.out)
    ? ok('dry run reports and writes nothing') : bad('dry run wrote')

  // a GENERATED file holds the tokens themselves — never rewrite it
  const gen = run({ 'assets/g.css': '/* GENERATED by generate-design-system-css.mjs */\n.g { font-size: 15px; }' }, ['--apply'])
  const untouched = /font-size: 15px/   // bind first: a statement STARTING with a regex parses as division
  untouched.test(gen.after['assets/g.css']) ? ok('a GENERATED file is never rewritten') : bad('generated file was snapped')
}

console.log(failures === 0 ? '\nsnap-scale: ALL CASES PASS' : `\nsnap-scale: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
