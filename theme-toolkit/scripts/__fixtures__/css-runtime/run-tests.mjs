#!/usr/bin/env node
// Self-test for #5 — runtime CSS-layout analysis (analyzeRuntimeLayout, the pure core; the Playwright
// gather that feeds it is dogfood-only). Operates on per-viewport measurements {innerWidth, scrollWidth,
// offenders}. Run (Node 20): node scripts/__fixtures__/css-runtime/run-tests.mjs · Exit 0 = all pass.

import { analyzeRuntimeLayout } from '../../check-css-layout.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const ids = (f) => new Set(f.map(x => x.id))

console.log('analyzeRuntimeLayout — viewport + element overflow')
{
  const f = analyzeRuntimeLayout([{ viewport: { width: 375 }, innerWidth: 375, scrollWidth: 420, offenders: [{ sel: 'div.banner', width: 420 }] }])
  ids(f).has('runtime.viewport-overflow') ? pass('scrollWidth>innerWidth → viewport-overflow (block hint)') : fail(`overflow: ${[...ids(f)]}`)
  f.find(x => x.id === 'runtime.viewport-overflow')?.severityHint === 'block' ? pass('viewport-overflow is block-hinted') : fail('overflow not block-hinted')
}
{
  const f = analyzeRuntimeLayout([{ innerWidth: 375, scrollWidth: 375, offenders: [] }])
  f.length === 0 ? pass('no overflow → no findings') : fail(`clean produced: ${[...ids(f)]}`)
}
{
  // page itself fits but an element is wider than the viewport (e.g. clipped by overflow:hidden parent)
  const f = analyzeRuntimeLayout([{ innerWidth: 375, scrollWidth: 375, offenders: [{ sel: 'img.wide', width: 600 }] }])
  ids(f).has('runtime.element-overflow') ? pass('element wider than viewport → element-overflow') : fail(`element: ${[...ids(f)]}`)
}
{
  const f = analyzeRuntimeLayout([{ innerWidth: 375, scrollWidth: 376, offenders: [] }])
  f.length === 0 ? pass('1px within tolerance → no finding') : fail(`tol: ${[...ids(f)]}`)
}
{
  const f = analyzeRuntimeLayout(null)
  f.length === 0 ? pass('null samples → no throw, no findings') : fail('null mishandled')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
