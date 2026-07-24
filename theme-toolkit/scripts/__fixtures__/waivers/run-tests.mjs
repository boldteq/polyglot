#!/usr/bin/env node
// Self-test for lib/waivers.mjs (audit P3.4 — the bypass-hatch guard). A publish bypass
// (THEME_PUSH_ALLOW_STALE / THEME_PUSH_SKIP_LENS) is only legitimate WITH a recorded reason, and every
// use leaves a durable trace. Proves the reader + logger hermetically, no repo / CLI.
//   (a) no CHANGES.md            → no waiver
//   (b) CHANGES.md, no ## Waivers → no waiver
//   (c) ## Waivers, empty        → no waiver (an empty heading is not a justification)
//   (d) ## Waivers + a bullet     → the reason text is returned
//   (e) ## Waivers stops at the next ## heading (doesn't swallow later sections)
//   (f) logWaiver appends a durable JSONL record with ts/flag/reason
// Run: node scripts/__fixtures__/waivers/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readWaiverText, changesHasWaiver, logWaiver } from '../../lib/waivers.mjs'

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const repo = (changes) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'waiver-')); if (changes != null) fs.writeFileSync(path.join(d, 'CHANGES.md'), changes); return d }

console.log('(a) no CHANGES.md → no waiver')
{ const d = repo(null); readWaiverText(d) === null && changesHasWaiver(d) === false ? ok('no file → null / false') : bad('should be null'); fs.rmSync(d, { recursive: true, force: true }) }

console.log('(b) CHANGES.md without a ## Waivers section → no waiver')
{ const d = repo('# Changes\n- [x] built the hero\n'); readWaiverText(d) === null ? ok('no ## Waivers → null') : bad(`got ${readWaiverText(d)}`); fs.rmSync(d, { recursive: true, force: true }) }

console.log('(c) ## Waivers heading with no bullet → no waiver (empty heading ≠ justification)')
{ const d = repo('# Changes\n\n## Waivers\n\n'); readWaiverText(d) === null && changesHasWaiver(d) === false ? ok('empty Waivers → null') : bad('empty heading must not count'); fs.rmSync(d, { recursive: true, force: true }) }

console.log('(d) ## Waivers + a bullet → the reason is returned')
{ const d = repo('# Changes\n\n## Waivers\n- SKIP_LENS: preview URL down, client demo in 10min; visual re-checked manually.\n')
  const w = readWaiverText(d)
  w && /preview URL down/.test(w) && changesHasWaiver(d) === true ? ok('reason returned + hasWaiver true') : bad(`got ${w}`); fs.rmSync(d, { recursive: true, force: true }) }

console.log('(e) ## Waivers section stops at the next ## heading')
{ const d = repo('## Waivers\n- real reason\n\n## Notes\n- not a waiver bullet\n')
  const w = readWaiverText(d); w === 'real reason' ? ok('reads only the Waivers section') : bad(`bled into another section: ${w}`); fs.rmSync(d, { recursive: true, force: true }) }

console.log('(f) logWaiver appends a durable JSONL record')
{ const d = repo('## Waivers\n- x\n')
  logWaiver('THEME_PUSH_SKIP_LENS', 'x', d, '2026-07-24T00:00:00Z')
  logWaiver('THEME_PUSH_ALLOW_STALE', 'y', d, '2026-07-24T01:00:00Z')
  const lines = fs.readFileSync(path.join(d, 'gate-reports', 'waivers.jsonl'), 'utf-8').trim().split('\n')
  const first = JSON.parse(lines[0])
  lines.length === 2 && first.flag === 'THEME_PUSH_SKIP_LENS' && first.reason === 'x' && first.ts === '2026-07-24T00:00:00Z'
    ? ok('two durable records with flag/reason/ts') : bad(`got ${JSON.stringify(lines)}`)
  fs.rmSync(d, { recursive: true, force: true }) }

console.log(failures === 0 ? '\nwaivers: ALL CASES PASS' : `\nwaivers: ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
