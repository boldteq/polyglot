// lens-capture could not see position:fixed elements — the same defect class as gate-functional's
// cart drawer, in the visual-truth layer this time (QA-4).
//
// Five sites used `el.offsetParent !== null` as "is it visible". offsetParent is null for EVERY
// position:fixed element.
//
// The nuance that decides which of them were actually DEAD: offsetParent is null only for the fixed
// element ITSELF — a normal child of a fixed banner still has one. So the everyday cases (an Accept
// button inside a fixed cookie bar, a cart icon inside a fixed sticky header) were fine, and this
// fixture confirms the pre-fix code handled them. What was genuinely dead:
//   · openCartDrawer's isOpenDrawer() — it tests the DRAWER element, which IS fixed, so it could
//     never report a drawer open. Verified against the pre-fix code: the toggle was clicked and the
//     drawer opened, yet Lens reported "no drawer" and skipped capturing the surface entirely.
//     Its generic branch was outright self-contradictory: it looked for position:fixed|absolute
//     panels and then required offsetParent !== null, so only `absolute` drawers could ever match.
//   · the remaining helpers now also handle a control that is ITSELF fixed (a floating close glyph,
//     a fixed sticky ATC bar) — previously invisible. Covered below.

// This drives the REAL exported functions against a real chromium — no copy of the predicate, because
// a fixture that re-implements the thing it is testing proves nothing.

import http from 'node:http'
import { dismissOccluders, openCartDrawer } from '../../lens-capture.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

const shell = (body, style = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Store</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui;min-height:200vh}${style}</style></head><body>${body}</body></html>`

// A cookie banner with a floating accept control that is itself position:fixed.
const COOKIE_PAGE = shell(`
<h1>Seasonal menu</h1>
<div id="cookie" style="position:fixed;bottom:0;left:0;right:0;height:120px;background:#111;color:#fff;padding:16px">
  <p>We use cookies.</p>
</div>
<!-- the control is ITSELF position:fixed — a floating accept/close glyph. This is the case the old
     offsetParent test could never see; a button merely nested inside the fixed bar was always fine. -->
<button id="acc" type="button" style="position:fixed;bottom:24px;right:24px;height:44px;width:120px">Accept</button>
<script>document.getElementById('acc').addEventListener('click', function () { document.getElementById('cookie').remove(); document.getElementById('acc').remove() })</script>`)

// A cart drawer + toggle exactly as themes ship them: the toggle lives in a FIXED sticky header and
// the drawer itself is FIXED. The toggle was always fine (it is a CHILD of the fixed header); the
// drawer element itself is what the old predicate could never see.
const CART_PAGE = shell(`
<header style="position:fixed;top:0;left:0;right:0;height:60px;background:#fff;border-bottom:1px solid #eee">
  <button id="cart-icon-bubble" aria-label="Cart" style="height:40px;width:40px">Cart</button>
</header>
<h1 style="padding-top:80px">Seasonal menu</h1>
<div id="CartDrawer" class="cart-drawer">
  <h2>Your cart</h2><a href="/checkout" class="button">Checkout</a>
</div>
<script>
  document.getElementById('cart-icon-bubble').addEventListener('click', function () {
    document.getElementById('CartDrawer').classList.add('active')
  })
</script>`, `.cart-drawer{display:none;position:fixed;top:0;right:0;width:340px;height:100vh;background:#fff}
.cart-drawer.active{display:block}`)

// A drawer that is genuinely NOT open must stay not-open — a false "opened" would have Lens capture
// and judge a cart state that no shopper can see.
const CART_CLOSED_PAGE = shell(`
<h1>Seasonal menu</h1>
<div id="CartDrawer" class="cart-drawer"><h2>Your cart</h2></div>`,
`.cart-drawer{display:none;position:fixed;top:0;right:0;width:340px;height:100vh;background:#fff}`)

function serve(html) {
  return http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html) })
}

let chromium
try { ({ chromium } = await import('playwright')) } catch {
  console.log('lens-visibility: SKIP — playwright not installed')
  process.exit(0)
}

async function withPage(html, fn) {
  const server = serve(html)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${server.address().port}/`
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.goto(url, { waitUntil: 'load' })
    return await fn(page)
  } finally {
    await browser.close().catch(() => {})
    await new Promise((r) => server.close(r))
  }
}

console.log('lens-capture — can it see position:fixed elements at all?')
{
  const gone = await withPage(COOKIE_PAGE, async (page) => {
    const acted = await dismissOccluders(page)
    const present = await page.locator('#cookie').count()
    return { acted, present }
  })
  gone.acted && gone.present === 0
    ? ok('an accept control that is ITSELF position:fixed is seen and clicked')
    : bad(`acted=${gone.acted} banner-still-present=${gone.present} — the occluder was invisible to Lens`)
}

console.log('\n── the cart drawer surface Lens is supposed to capture ──')
{
  const r = await withPage(CART_PAGE, async (page) => {
    const res = await openCartDrawer(page)
    const open = await page.locator('#CartDrawer.active').count()
    return { res, open }
  })
  r.res?.opened && r.open === 1
    ? ok('a fixed toggle in a fixed header opens a fixed drawer')
    : bad(`opened=${JSON.stringify(r.res)} drawer-active=${r.open} — Lens never captured this surface`)
}
{
  // no false positives: a hidden drawer must not read as open
  const r = await withPage(CART_CLOSED_PAGE, async (page) => openCartDrawer(page))
  r?.opened ? bad('a display:none drawer was reported open') : ok('a hidden drawer is not reported open')
}

console.log(failures === 0 ? '\nlens-visibility: ALL CASES PASS' : `\nlens-visibility: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
