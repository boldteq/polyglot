#!/usr/bin/env node
// Self-test for check-post-publish.mjs (Step-17 T+0 smoke). fetch injected → hermetic.
//   (a) serving + open + robots/sitemap ok → ok, 0 blockers
//   (b) storefront 5xx → BLOCK (storefront-200 critical)
//   (c) password ON (/ lands on /password) → BLOCK (password-off critical) even with 200
//   (d) robots/sitemap 404 → still ok (advisory only) + warnings recorded
//   (e) GET / throws → BLOCK
// Run: node scripts/__fixtures__/post-publish/run-tests.mjs · Exit 0 = all pass.

import { postPublishSmoke } from '../../check-post-publish.mjs'

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const ORIGIN = 'https://shop.myshopify.com'
// fake fetch from a map: path → { status, finalPath? (redirect target) } | 'throw'
const mkFetch = (map) => async (url) => {
  const p = new URL(url).pathname
  const v = map[p]
  if (v === 'throw') throw new Error('network down')
  const status = v?.status ?? 200
  const finalPath = v?.finalPath ?? p
  return { status, url: `${ORIGIN}${finalPath}` }
}
const crit = (r) => r.checks.filter(c => c.critical && !c.ok).map(c => c.name)

console.log('(a) serving + open + robots/sitemap ok → ok')
{ const r = await postPublishSmoke({ storeUrl: ORIGIN, fetch: mkFetch({ '/': { status: 200 }, '/robots.txt': { status: 200 }, '/sitemap.xml': { status: 200 } }) })
  r.ok && crit(r).length === 0 ? ok('ok, no critical fails') : bad(`got ok=${r.ok} crit=${JSON.stringify(crit(r))}`) }

console.log('(b) storefront 5xx → BLOCK')
{ const r = await postPublishSmoke({ storeUrl: ORIGIN, fetch: mkFetch({ '/': { status: 503 } }) })
  !r.ok && crit(r).includes('storefront-200') ? ok('blocked on 503') : bad(`got ok=${r.ok} crit=${JSON.stringify(crit(r))}`) }

console.log('(c) password ON (/ → /password) → BLOCK even with 200')
{ const r = await postPublishSmoke({ storeUrl: ORIGIN, fetch: mkFetch({ '/': { status: 200, finalPath: '/password' } }) })
  !r.ok && crit(r).includes('password-off') ? ok('blocked on still-password-protected') : bad(`got ok=${r.ok} crit=${JSON.stringify(crit(r))}`) }

console.log('(d) robots/sitemap 404 → still ok (advisory only)')
{ const r = await postPublishSmoke({ storeUrl: ORIGIN, fetch: mkFetch({ '/': { status: 200 }, '/robots.txt': { status: 404 }, '/sitemap.xml': { status: 404 } }) })
  r.ok ? ok('ok despite advisory misses') : bad(`expected ok, got ${JSON.stringify(crit(r))}`)
  const warns = r.checks.filter(c => !c.critical && !c.ok).map(c => c.name)
  warns.includes('robots') && warns.includes('sitemap') ? ok('robots+sitemap recorded as warnings') : bad(`warns=${JSON.stringify(warns)}`) }

console.log('(e) GET / throws → BLOCK')
{ const r = await postPublishSmoke({ storeUrl: ORIGIN, fetch: mkFetch({ '/': 'throw' }) })
  !r.ok && crit(r).includes('storefront-200') ? ok('blocked on network failure') : bad(`got ok=${r.ok} crit=${JSON.stringify(crit(r))}`) }

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
