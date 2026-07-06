#!/usr/bin/env node
// Self-test for lens-capture's PURE planning helpers (WS-A capture depth). The browser capture itself
// is live-only, but the matrix/key/state logic is hermetically testable — this proves it.
// Run: node scripts/__fixtures__/capture-plan/run-tests.mjs · Exit 0 = all pass.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
const MOD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'lens-capture.mjs')
const { frameKey, frameStates, contentStates, planCaptures, addLocale } = await import(MOD)

let failures = 0
const ok = (m) => console.log(`  PASS  ${m}`)
const bad = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (name, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? ok(name) : bad(`${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`))

console.log('frameKey — backward-compatible base + suffixes')
eq('base = surface-viewport (no suffix, existing verdicts keep working)', frameKey({ surface: 'home', viewport: 'mobile' }), 'home-mobile')
eq('explicit base/default = no suffix', frameKey({ surface: 'home', viewport: 'desktop', state: 'base', locale: 'default' }), 'home-desktop')
eq('content state appends', frameKey({ surface: 'cart', viewport: 'mobile', state: 'populated' }), 'cart-mobile-populated')
eq('drawer state appends (BUG-1)', frameKey({ surface: 'pdp', viewport: 'mobile', state: 'drawer' }), 'pdp-mobile-drawer')
eq('non-default locale appends', frameKey({ surface: 'home', viewport: 'mobile', locale: 'fr' }), 'home-mobile-fr')
eq('state + locale both append', frameKey({ surface: 'cart', viewport: 'tablet', state: 'populated', locale: 'de' }), 'cart-tablet-populated-de')

console.log('frameStates — fast vs full, long vs short surfaces')
eq('fast = rest + scrollEnd only', frameStates('home', 'fast'), ['rest', 'scrollEnd'])
eq('full/home (long) = mid-scroll + hover', frameStates('home', 'full'), ['rest', 'scroll25', 'scroll50', 'scroll75', 'scrollEnd', 'hover'])
eq('full/pdp (long) = mid-scroll + hover', frameStates('pdp', 'full'), ['rest', 'scroll25', 'scroll50', 'scroll75', 'scrollEnd', 'hover'])
eq('full/search (short) = no mid-scroll, no hover', frameStates('search', 'full'), ['rest', 'scrollEnd'])
eq('full/cart (short) = no mid-scroll, no hover', frameStates('cart', 'full'), ['rest', 'scrollEnd'])

console.log('contentStates — own-verdict page states')
eq('cart/full → populated', contentStates('cart', 'full'), ['populated'])
eq('pdp/full → drawer (BUG-1: capture the cart drawer open)', contentStates('pdp', 'full'), ['drawer'])
eq('home/full → none', contentStates('home', 'full'), [])
eq('cart/fast → none (cost-gated)', contentStates('cart', 'fast'), [])
eq('pdp/fast → none (cost-gated)', contentStates('pdp', 'fast'), [])

console.log('addLocale — pure URL rewrite')
eq('appends ?locale', addLocale('https://x.com/products/a', 'fr'), 'https://x.com/products/a?locale=fr')
eq('merges into existing query', addLocale('https://x.com/search?q=a', 'de'), 'https://x.com/search?q=a&locale=de')

console.log('planCaptures — matrix size + order (locale → viewport → theme → surface)')
{
  const surfaces = [{ surface: 'home', url: 'h' }, { surface: 'pdp', url: 'p' }]
  const viewports = [{ name: 'mobile', width: 375, height: 812 }, { name: 'desktop', width: 1440, height: 900 }]
  const plan = planCaptures({ surfaces, viewports, locales: ['default', 'fr'], themes: ['light'] })
  plan.length === 2 * 2 * 1 * 2 ? ok(`matrix size = ${plan.length} (2 loc × 2 vp × 1 theme × 2 surf)`) : bad(`matrix size ${plan.length} != 8`)
  eq('first spec', plan[0], { surface: 'home', url: 'h', viewport: 'mobile', width: 375, height: 812, device: null, theme: 'light', locale: 'default' })
  plan.every(p => p.surface && p.viewport && p.locale) ? ok('every spec has surface+viewport+locale') : bad('a spec is missing a key dim')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
