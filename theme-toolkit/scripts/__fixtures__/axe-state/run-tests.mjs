#!/usr/bin/env node
// Self-test for #37 — the a11y STATE_MATRIX (which interactive surfaces gate-axe opens before re-scanning).
// The browser open+rescan is dogfood-only; this proves the matrix is well-formed + covers the key states.
// Run (Node 20): node scripts/__fixtures__/axe-state/run-tests.mjs · Exit 0 = all pass.

import { STATE_MATRIX } from '../../gate-axe.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

console.log('STATE_MATRIX — well-formed + covers the key interactive surfaces')
Array.isArray(STATE_MATRIX) && STATE_MATRIX.length >= 3 ? pass(`${STATE_MATRIX.length} states defined`) : fail('STATE_MATRIX not a ≥3 array')
for (const s of STATE_MATRIX) {
  const ok = s && typeof s.name === 'string' && Array.isArray(s.open) && s.open.length > 0 && s.open.every(x => typeof x === 'string') && Number.isFinite(s.settleMs)
  ok ? pass(`state "${s?.name}" — ${s?.open?.length} open selector(s), settle ${s?.settleMs}ms`) : fail(`malformed state: ${JSON.stringify(s)}`)
  // BUG-2: every state must carry assertOpen proof-of-open selectors (so a click that doesn't open isn't counted as open)
  const hasAssert = Array.isArray(s?.assertOpen) && s.assertOpen.length > 0 && s.assertOpen.every(x => typeof x === 'string')
  hasAssert ? pass(`state "${s?.name}" — ${s.assertOpen.length} assertOpen selector(s) (BUG-2)`) : fail(`state "${s?.name}" missing assertOpen[] — a click without an open-assertion scans a CLOSED panel`)
}
const names = new Set(STATE_MATRIX.map(s => s.name))
for (const need of ['cart-drawer', 'mobile-nav', 'search-modal']) {
  names.has(need) ? pass(`covers "${need}"`) : fail(`missing state "${need}"`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
