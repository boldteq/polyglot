// gate-functional had 5 of its 7 BLOCKING checks unproven (QA-2).
//
// This one genuinely needs a browser — it measures the RENDERED page (uncaught JS exceptions, whether
// a cart drawer actually opens, whether its Checkout button is reachable). But "needs a browser" is not
// the same as "needs a real storefront": Playwright is already vendored for Lens (chromium 148 launches
// here), so a local node:http server + the vendored browser reproduces every one of these.
//
// What they protect is the shopper's actual path: a page that throws on load, a PDP with no
// add-to-cart, a cart drawer with no Checkout button, or a Checkout button pushed below the fold on
// mobile — the real checkout route. Unproven, any of those could ship.
//
// async `spawn`, never `spawnSync` — the server is in this process and spawnSync would deadlock it.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gate-functional.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

const shell = (body, head = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Store</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${head}</head><body>${body}</body></html>`

// A PDP that behaves like a modern AJAX theme: the form is intercepted, /cart/add is POSTed in the
// background and the drawer opens — so the page stays put and the drawer can actually be exercised.
// A full-page-POST form would navigate away from the PDP and the drawer checks could never run.
const DRAWER_CSS = `<style>
  .cart-drawer { display:none; position:fixed; top:0; right:0; width:320px; height:100vh; background:#fff }
  .cart-drawer.active { display:block }
</style>`

const goodPdp = ({ atc = true, drawer = 'ok' } = {}) => shell(`
<h1>Matcha</h1><span class="price">1200</span>
${atc ? '<form action="/cart/add" method="post" id="atc"><button type="submit" name="add">Add to cart</button></form>' : ''}
<button class="js-cart-toggle" data-cart-drawer-toggle>Cart</button>
<div id="CartDrawer" class="cart-drawer drawer">
  <h2>Your cart</h2>
  ${drawer === 'no-checkout' ? '' : `<a href="/checkout" class="cart__checkout-button button"
      style="${drawer === 'cutoff' ? 'position:absolute;top:4000px' : 'position:relative'}">Checkout</a>`}
</div>
<script>
  function openDrawer() { document.getElementById('CartDrawer').classList.add('active') }
  document.querySelector('.js-cart-toggle').addEventListener('click', openDrawer)
  var f = document.getElementById('atc')
  if (f) f.addEventListener('submit', function (e) {
    e.preventDefault()
    fetch('/cart/add', { method: 'POST' }).then(openDrawer)
  })
</script>`, DRAWER_CSS)

function serve(pages) {
  // /cart.js is stateful: addToCartFlow reads item_count, clicks, then polls for an increase.
  let itemCount = 0
  return http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname
    const send = (b, t = 'text/html') => { res.writeHead(200, { 'content-type': t }); res.end(b) }
    // cartDrawerCheck adds an item SILENTLY via /products/<handle>.js + /cart/add.js before opening the
    // drawer — without those the check returns drawer:'skip' and the drawer blockers can never fire.
    if (p.startsWith('/products/') && p.endsWith('.js')) {
      return send(JSON.stringify({ id: 1, title: 'Matcha', variants: [{ id: 111, available: true, price: 120000 }] }), 'application/json')
    }
    if (p === '/cart/add' || p === '/cart/add.js') { itemCount += 1; return send(JSON.stringify({ id: 111, quantity: 1 }), 'application/json') }
    if (p === '/cart.js') return send(JSON.stringify({ item_count: itemCount, items: [] }), 'application/json')
    if (p === '/robots.txt') return send('User-agent: *\nSitemap: http://127.0.0.1/sitemap.xml\n', 'text/plain')
    if (p === '/sitemap.xml') return send('<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1/</loc></url></urlset>', 'application/xml')
    if (p === '/products.json') return send(JSON.stringify({ products: [{ handle: 'matcha', title: 'Matcha' }] }), 'application/json')
    if (p === '/collections.json') return send(JSON.stringify({ collections: [{ handle: 'drinks', title: 'Drinks' }] }), 'application/json')
    if (p.startsWith('/products/')) {
      if (pages.pdp === 'DEAD') return req.socket.destroy()   // connection reset → navigation genuinely fails
      return send(pages.pdp ?? goodPdp())
    }
    if (p === '/cart') return send(pages.cart ?? shell('<h1>Cart</h1><a href="/checkout">Checkout</a>'))
    return send(pages.home ?? shell('<h1>Home</h1><a href="/collections/all" class="button">Shop now</a>'))
  })
}

async function runGate(pages = {}, which = 'pdp') {
  const server = serve(pages)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-'))
  const { code, out } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [GATE, '--pages', which], {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
      env: { ...process.env, THEME_PREVIEW_URL: `http://127.0.0.1:${port}`, REPORT_DIR: reportDir },
    })
    let buf = ''
    child.stdout.on('data', (d) => { buf += d })
    child.stderr.on('data', (d) => { buf += d })
    child.on('exit', (c) => resolve({ code: c, out: buf }))
  })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'functionality.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  await new Promise((r2) => server.close(r2))
  return { code, out, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}

console.log('gate-functional — real chromium against a local storefront')
{
  const { ids, out } = await runGate()
  const funnel = [...ids].filter((i) => /fn\.(load|pageerror|no-atc|cart-drawer)/.test(i))
  funnel.length === 0 ? ok('a working PDP raises none of the five') : bad(`false blocks: ${funnel.join(', ')} — ${out.slice(-160)}`)
}

console.log('\n── the page must actually load and not throw ──')
{
  const throws = shell('<h1>Matcha</h1><form action="/cart/add"><button name="add">Add to cart</button></form>',
    '<script>window.addEventListener("load", function(){ null.x })</script>')
  const { ids } = await runGate({ pdp: throws })
  ids.has('fn.pageerror') ? ok('uncaught JS exception → fn.pageerror') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('\n── the page has to load at all ──')
{
  // a template the browser cannot navigate to at all. (A 500 *with* a body is deliberately NOT this:
  // it renders, so it surfaces as a content problem instead — verified while building this case.)
  const { ids } = await runGate({ pdp: 'DEAD' })
  ids.has('fn.load') ? ok('PDP that cannot be navigated to → fn.load') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('\n── the PDP must be buyable ──')
{
  const { ids } = await runGate({ pdp: goodPdp({ atc: false }) })
  ids.has('fn.no-atc') ? ok('PDP with no /cart/add form → fn.no-atc') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('\n── the cart drawer is the real mobile checkout path ──')
{
  const { ids } = await runGate({ pdp: goodPdp({ drawer: 'no-checkout' }) })
  ids.has('fn.cart-drawer-no-checkout') ? ok('drawer opens with no Checkout → fn.cart-drawer-no-checkout') : bad(`got [${[...ids].join(', ')}]`)
}
{
  const { ids } = await runGate({ pdp: goodPdp({ drawer: 'cutoff' }) })
  ids.has('fn.cart-drawer-checkout-cutoff') ? ok('Checkout pushed below the viewport → fn.cart-drawer-checkout-cutoff') : bad(`got [${[...ids].join(', ')}]`)
}

console.log(failures === 0 ? '\nfunctional-url: ALL CASES PASS' : `\nfunctional-url: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
