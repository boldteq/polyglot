#!/usr/bin/env node
// Self-test for #3 — per-gate freshness TTL (staleReportsByTtl, the pure core of theme-gates verify()).
// URL-gate evidence past its TTL is stale even at the matching SHA; static gates (no TTL) never time-out;
// unparseable / missing ts is skipped (the coherence + per-gate checks own those). nowMs is injected so
// the test is deterministic (no Date.now()).
// Run (Node 20): node scripts/__fixtures__/freshness-ttl/run-tests.mjs · Exit 0 = all pass.

import { staleReportsByTtl } from '../../lib/report.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const now = Date.parse('2026-06-21T12:00:00.000Z')
const iso = (ms) => new Date(ms).toISOString()
const ttlByGate = { lighthouse: DAY, axe: DAY, seo: DAY } // URL gates only

console.log('staleReportsByTtl — TTL applies only to gates with a TTL, only past age')
{
  const reports = [
    { gate: 'lighthouse', ts: iso(now - 2 * DAY) }, // 48h old, ttl 24h → STALE
    { gate: 'axe', ts: iso(now - 1 * HOUR) },        // 1h old → fresh
    { gate: 'seo', ts: iso(now - 23 * HOUR) },       // under ttl → fresh
    { gate: 'theme-check', ts: iso(now - 10 * DAY) },// static gate, no ttl → never stale
    { gate: 'lighthouse', ts: 'not-a-date' },        // unparseable ts → skipped
  ]
  const stale = staleReportsByTtl(ttlByGate, reports, now).map(s => s.gate).sort()
  eq(stale, ['lighthouse'], 'only the 48h-old lighthouse report is stale')
}

console.log('edge cases')
eq(staleReportsByTtl({}, [{ gate: 'lighthouse', ts: iso(now) }], now), [], 'no TTL map → nothing stale')
eq(staleReportsByTtl(ttlByGate, [], now), [], 'no reports → nothing stale')
eq(staleReportsByTtl(ttlByGate, null, now), [], 'null reports → no throw, nothing stale')
{
  const exactly = staleReportsByTtl(ttlByGate, [{ gate: 'axe', ts: iso(now - DAY) }], now)
  eq(exactly, [], 'age == ttl is NOT stale (strictly greater)')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
