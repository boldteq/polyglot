#!/usr/bin/env node
// Self-test for lib/preview-server.mjs (the --auto-preview lifecycle). spawn/probe/sleep are injected
// so this runs with no real `shopify theme dev`, no network, no wall-clock.
//
//   (a) ready after N polls → body runs with the url; server torn down (SIGTERM) exactly once after.
//   (b) ready on the first poll → body runs; minimal probing.
//   (c) never ready → throws a timeout; server STILL torn down.
//   (d) body throws → error propagates; server STILL torn down (finally).
//   (e) dev server exits before ready → throws; torn down.
//   (f) the poll budget = ceil(timeoutMs/pollMs) (bounded — never loops forever).
// Run (Node 20): node scripts/__fixtures__/preview-server/run-tests.mjs · Exit 0 = all pass.

import { withPreviewServer } from '../../lib/preview-server.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

// fake child records kill signals; fake spawn returns it
function fakeChild() {
  const kills = []
  return { kills, kill: (sig) => kills.push(sig), on: () => {} }
}
const fakeSpawn = (child) => () => child
const noSleep = async () => {}
// probe that returns false `failN` times then true
const probeReadyAfter = (failN) => { let n = 0; return async () => (n++ >= failN) }

// ── case a: ready after 3 polls ──
console.log('case a — ready after 3 polls → body runs, server torn down once')
{
  const child = fakeChild()
  let bodyUrl = null
  const out = await withPreviewServer(
    { url: 'http://x:9292', spawn: fakeSpawn(child), probe: probeReadyAfter(3), sleep: noSleep },
    async (url) => { bodyUrl = url; return 'done' },
  )
  eq(out, 'done', 'returns the body result')
  eq(bodyUrl, 'http://x:9292', 'body received the url')
  eq(child.kills, ['SIGTERM'], 'server torn down exactly once (SIGTERM)')
}

// ── case b: ready immediately ──
console.log('case b — ready on first poll → minimal probing')
{
  const child = fakeChild()
  let probes = 0
  const probe = async () => { probes++; return true }
  await withPreviewServer({ url: 'http://x', spawn: fakeSpawn(child), probe, sleep: noSleep }, async () => 'ok')
  eq(probes, 1, 'probed exactly once when ready immediately')
  eq(child.kills.length, 1, 'still torn down')
}

// ── case c: never ready → throws, still torn down ──
console.log('case c — never ready → timeout throw + teardown')
{
  const child = fakeChild()
  let threw = false
  try {
    await withPreviewServer(
      { url: 'http://x', spawn: fakeSpawn(child), probe: async () => false, sleep: noSleep, timeoutMs: 4500, pollMs: 1500 },
      async () => 'never',
    )
  } catch (e) { threw = /did not become ready/.test(e.message) }
  eq(threw, true, 'threw a readiness-timeout error')
  eq(child.kills, ['SIGTERM'], 'server torn down even on timeout')
}

// ── case d: body throws → still torn down ──
console.log('case d — body throws → error propagates + teardown')
{
  const child = fakeChild()
  let msg = null
  try {
    await withPreviewServer(
      { url: 'http://x', spawn: fakeSpawn(child), probe: async () => true, sleep: noSleep },
      async () => { throw new Error('body boom') },
    )
  } catch (e) { msg = e.message }
  eq(msg, 'body boom', 'body error propagates')
  eq(child.kills, ['SIGTERM'], 'server torn down even when body throws')
}

// ── case e: dev server exits before ready ──
console.log('case e — dev server exits before ready → throws + teardown')
{
  let exitCb = null
  const child = { kills: [], kill(sig) { this.kills.push(sig) }, on: (ev, cb) => { if (ev === 'exit') exitCb = cb } }
  // probe never ready; trigger the exit after spawn
  const spawn = () => { queueMicrotask(() => exitCb && exitCb()); return child }
  let threw = false
  try {
    await withPreviewServer({ url: 'http://x', spawn, probe: async () => false, sleep: noSleep, timeoutMs: 4500, pollMs: 1500 }, async () => 'x')
  } catch (e) { threw = /exited before becoming ready|did not become ready/.test(e.message) }
  eq(threw, true, 'threw when the dev server died early')
  eq(child.kills.length >= 1, true, 'torn down after early exit')
}

// ── case f: poll budget is bounded ──
console.log('case f — poll budget = ceil(timeoutMs/pollMs)')
{
  const child = fakeChild()
  let probes = 0
  try {
    await withPreviewServer(
      { url: 'http://x', spawn: fakeSpawn(child), probe: async () => { probes++; return false }, sleep: noSleep, timeoutMs: 9000, pollMs: 1500 },
      async () => 'x',
    )
  } catch { /* expected timeout */ }
  eq(probes, 6, 'probed exactly ceil(9000/1500)=6 times then gave up (bounded, no infinite loop)')
}

console.log(failures === 0 ? '\n✓ PREVIEW-SERVER — ALL LIFECYCLE ASSERTIONS PASS' : `\n✗ ${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
