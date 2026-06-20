#!/usr/bin/env node
// Self-test for shopify-theme-publish.mjs (the last-mile flip). Proves the gate chain hermetically —
// spawn + listThemes injected, no live store / shopify CLI. Cases mirror the design spec:
//   (a) missing publish-readiness.json → BLOCK
//   (b) publishReady:false           → BLOCK
//   (c) missing / invalid lock        → BLOCK
//   (d) live-role lock: singleTheme=false → BLOCK · singleTheme=true → allowed
//   (e) --store/--theme mismatch + each forbidden flag → BLOCK
//   (f) stale gate-verify (theme-gates exits 1) → BLOCK
//   (g) all-green → finalArgs === [theme,publish,--store,<lock>,--theme,<id>,--force]; spawn called once
//   + verifyFlip: now-live → ok · still-unpublished → fail · singleTheme-live → skip
// Run: node scripts/__fixtures__/theme-publish/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { publishPlan, verifyFlip } from '../../shopify-theme-publish.mjs'
import { newLock } from '../../lib/shopify-theme-lock.mjs'

const ME = path.dirname(fileURLToPath(import.meta.url))
let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

// build a temp repo; opts: { lock|rawLock, ready (bool|undefined=no file|'bad'), changes (bool) }
function repo(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-publish-'))
  if (opts.rawLock !== undefined) { if (opts.rawLock !== null) fs.writeFileSync(path.join(dir, '.boldteq-theme-lock.json'), opts.rawLock) }
  else if (opts.lock !== null) fs.writeFileSync(path.join(dir, '.boldteq-theme-lock.json'), `${JSON.stringify(opts.lock || newLock({ store: 's.myshopify.com', themeId: '111', themeName: 'X-dev', role: 'unpublished' }), null, 2)}\n`)
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  if (opts.ready === 'bad') fs.writeFileSync(path.join(dir, 'docs/publish-readiness.json'), '{not json')
  else if (opts.ready !== undefined) fs.writeFileSync(path.join(dir, 'docs/publish-readiness.json'), JSON.stringify({ publishReady: opts.ready, stage: opts.ready ? 'ready' : 'gates', reason: opts.ready ? 'ok' : 'blocked' }))
  if (opts.changes) fs.writeFileSync(path.join(dir, 'CHANGES.md'), '# Changes\n- [x] done\n')
  return dir
}
// fake spawn: status per script basename. {changesStatus, gatesStatus}. records calls.
const fakeSpawn = (cfg = {}) => { const calls = []; const fn = (cmd, args = []) => { const s = args.find(a => String(a).endsWith('.mjs')) || ''; calls.push(path.basename(String(s))); if (s.includes('check-changes-list')) return { status: cfg.changesStatus ?? 0 }; if (s.includes('theme-gates')) return { status: cfg.gatesStatus ?? 0 }; return { status: 0 } }; fn.calls = calls; return fn }
const clean = (d) => fs.rmSync(d, { recursive: true, force: true })

console.log('(a) missing publish-readiness.json → BLOCK')
{ const d = repo({ ready: undefined }); const p = publishPlan({ dir: d, spawn: fakeSpawn() }); p.blocked && /publish-readiness/.test(p.reason) ? ok('blocked on missing readiness') : bad(`got ${JSON.stringify(p)}`); clean(d) }

console.log('(b) publishReady:false → BLOCK')
{ const d = repo({ ready: false }); const p = publishPlan({ dir: d, spawn: fakeSpawn() }); p.blocked && /NOT PUBLISH-READY/.test(p.reason) ? ok('blocked on not-ready') : bad(`got ${p.reason}`); clean(d) }

console.log('(c) missing / invalid lock → BLOCK')
{ const d = repo({ lock: null, ready: true }); const p = publishPlan({ dir: d, spawn: fakeSpawn() }); p.blocked && /no \.boldteq-theme-lock/.test(p.reason) ? ok('blocked on missing lock') : bad(`got ${p.reason}`); clean(d)
  const d2 = repo({ rawLock: '{bad json', ready: true }); const p2 = publishPlan({ dir: d2, spawn: fakeSpawn() }); p2.blocked && p2.code === 2 ? ok('blocked on unreadable lock (code 2)') : bad(`got ${JSON.stringify(p2)}`); clean(d2) }

console.log('(d) live-role lock: singleTheme false → BLOCK; true → allowed')
{ const liveUnsafe = newLock({ store: 's.myshopify.com', themeId: '111', role: 'main', singleTheme: false })
  const d = repo({ lock: liveUnsafe, ready: true }); const p = publishPlan({ dir: d, spawn: fakeSpawn() }); p.blocked && /LIVE theme/.test(p.reason) ? ok('live + !singleTheme blocked') : bad(`got ${p.reason}`); clean(d)
  const liveSingle = newLock({ store: 's.myshopify.com', themeId: '111', role: 'main', singleTheme: true })
  const d2 = repo({ lock: liveSingle, ready: true }); const p2 = publishPlan({ dir: d2, spawn: fakeSpawn() }); p2.ok ? ok('live + singleTheme allowed through chain') : bad(`expected ok, got ${p2.reason}`); clean(d2) }

console.log('(e) --store/--theme mismatch + forbidden flags → BLOCK')
{ const d = repo({ ready: true })
  const mm = publishPlan({ dir: d, argv: ['--theme', '999'], spawn: fakeSpawn() }); mm.blocked && /≠ locked theme/.test(mm.reason) ? ok('--theme mismatch blocked') : bad(`got ${mm.reason}`)
  const ms = publishPlan({ dir: d, argv: ['--store', 'evil.myshopify.com'], spawn: fakeSpawn() }); ms.blocked && /≠ locked store/.test(ms.reason) ? ok('--store mismatch blocked') : bad(`got ${ms.reason}`)
  let allForbidden = true
  for (const f of ['--live', '-l', '--unpublished', '-u', '--development', '-d']) { const r = publishPlan({ dir: d, argv: [f], spawn: fakeSpawn() }); if (!(r.blocked && /conflicts with the publish flip/.test(r.reason))) { allForbidden = false; bad(`forbidden flag ${f} not blocked: ${r.reason}`) } }
  if (allForbidden) ok('all 6 forbidden flags blocked'); clean(d) }

console.log('(f) stale gate-verify → BLOCK')
{ const d = repo({ ready: true }); const sp = fakeSpawn({ gatesStatus: 1 }); const p = publishPlan({ dir: d, spawn: sp }); p.blocked && /gate evidence is stale/.test(p.reason) ? ok('stale gates blocked') : bad(`got ${p.reason}`); clean(d) }

console.log('(g) all-green → correct finalArgs + spawn called')
{ const d = repo({ ready: true, changes: true }); const sp = fakeSpawn(); const p = publishPlan({ dir: d, spawn: sp })
  p.ok ? ok('ok') : bad(`expected ok, got ${p.reason}`)
  JSON.stringify(p.finalArgs) === JSON.stringify(['theme', 'publish', '--store', 's.myshopify.com', '--theme', '111', '--force']) ? ok('finalArgs correct (--force flip)') : bad(`finalArgs=${JSON.stringify(p.finalArgs)}`)
  sp.calls.includes('check-changes-list.mjs') && sp.calls.includes('theme-gates.mjs') ? ok('ran changes-list + gate-verify') : bad(`spawn calls=${JSON.stringify(sp.calls)}`); clean(d) }

console.log('+ verifyFlip post-publish health check')
{ const lock = newLock({ store: 's.myshopify.com', themeId: '111', role: 'unpublished' })
  const live = { ok: true, themes: [{ id: '111', name: 'X', role: 'main' }] }
  const unp = { ok: true, themes: [{ id: '111', name: 'X', role: 'unpublished' }] }
  verifyFlip({ lock, listThemes: () => live }).ok ? ok('now-live → ok') : bad('now-live should pass')
  !verifyFlip({ lock, listThemes: () => unp }).ok ? ok('still-unpublished → fail (silent no-op caught)') : bad('still-unpublished should fail')
  verifyFlip({ lock: newLock({ store: 's', themeId: '1', role: 'main', singleTheme: true }), listThemes: () => { throw new Error('should not be called') } }).ok ? ok('singleTheme-live → skip (no call)') : bad('singleTheme-live should skip') }

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
