// gate-conversion had 4 of its 11 BLOCKING checks unproven (QA-2).
//
// Same lesson as the SEO fixture: this gate needs no browser (zero Playwright references) — it fetches
// pages and reads markup, so a small node:http server is a storefront as far as it is concerned.
//
// What these four protect is the buy path itself: no hero CTA, no add-to-cart, no price, or a cart with
// no conversion mechanic at all. If they never fire, a store can ship with a broken funnel and this
// gate will still say the mechanical 60% passed.
//
// NB the fixture uses async `spawn`, never `spawnSync` — the server lives in this process and
// spawnSync blocks the event loop, so the server could never answer and both sides deadlock.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gate-conversion.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

const HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Cravin store page</title></head><body>'
const FOOT = '</body></html>'

// a home page with both conversion anchors: a hero heading AND a primary CTA
const home = ({ heading = true, cta = true } = {}) => `${HEAD}<main>
  ${heading ? '<section class="hero"><h1>A menu that changes with the season</h1></section>' : '<section><p>welcome</p></section>'}
  ${cta ? '<a class="button--primary" href="/collections/all">Shop now</a>' : ''}
</main>${FOOT}`

// a PDP with an add-to-cart form and a price
const pdp = ({ atc = true, price = true } = {}) => `${HEAD}<main>
  <h1>Ceremonial Matcha</h1>
  ${price ? '<span class="price">₹1,200</span>' : ''}
  ${atc ? '<form action="/cart/add" method="post"><button type="submit" name="add">Add to cart</button></form>' : ''}
</main>${FOOT}`

// a cart with (or without) a conversion mechanic — free-ship bar or upsell
const cart = ({ mechanic = true } = {}) => `${HEAD}<main>
  <h1>Your cart</h1>
  ${mechanic ? '<div class="free-shipping-bar">Spend ₹500 more for free shipping</div>' : ''}
  <a href="/checkout" class="button">Checkout</a>
</main>${FOOT}`

function serve(pages) {
  return http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname
    const send = (b, t = 'text/html') => { res.writeHead(200, { 'content-type': t }); res.end(b) }
    if (p === '/robots.txt') return send('User-agent: *\nSitemap: http://127.0.0.1/sitemap.xml\n', 'text/plain')
    if (p === '/sitemap.xml') return send('<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1/</loc></url></urlset>', 'application/xml')
    if (p === '/products.json') return send(JSON.stringify({ products: [{ handle: 'matcha', title: 'Matcha' }] }), 'application/json')
    if (p === '/collections.json') return send(JSON.stringify({ collections: [{ handle: 'drinks', title: 'Drinks' }] }), 'application/json')
    if (p.startsWith('/products/')) return send(pages.pdp ?? pdp())
    if (p === '/cart') return send(pages.cart ?? cart())
    return send(pages.home ?? home())
  })
}

async function runGate(pages = {}, { which = 'home,pdp,cart', env = {} } = {}) {
  const server = serve(pages)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-'))
  const { code } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [GATE, '--pages', which], {
      env: { ...process.env, THEME_PREVIEW_URL: `http://127.0.0.1:${port}`, REPORT_DIR: reportDir, ...env },
    })
    let buf = ''
    child.stdout.on('data', (d) => { buf += d })
    child.stderr.on('data', (d) => { buf += d })
    child.on('exit', (c) => resolve({ code: c, out: buf }))
  })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'conversion.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  await new Promise((r2) => server.close(r2))
  return { code, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}

console.log('gate-conversion — the buy path, driven by a real HTTP server')
{
  const { ids } = await runGate()
  const funnel = [...ids].filter((i) => /hero-cta|pdp-atc|pdp-price|cart-no-mechanic/.test(i))
  funnel.length === 0 ? ok('a complete funnel raises none of the four') : bad(`false blocks on a good store: ${funnel.join(', ')}`)
}

console.log('\n── the landing page must have a conversion anchor ──')
{
  const { ids } = await runGate({ home: home({ cta: false }) })
  ids.has('conversion.hero-cta') ? ok('hero with no primary CTA → hero-cta') : bad(`got [${[...ids].join(', ')}]`)
}
{
  const { ids } = await runGate({ home: home({ heading: false, cta: false }) })
  ids.has('conversion.hero-cta') ? ok('no hero heading AND no CTA → hero-cta') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('\n── the PDP must be buyable ──')
{
  const { ids } = await runGate({ pdp: pdp({ atc: false }) })
  ids.has('conversion.pdp-atc') ? ok('PDP with no add-to-cart path → pdp-atc') : bad(`got [${[...ids].join(', ')}]`)
}
{
  const { ids } = await runGate({ pdp: pdp({ price: false }) })
  ids.has('conversion.pdp-price') ? ok('PDP with no price → pdp-price') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('\n── the cart must carry a mechanic (STRICT only) ──')
{
  // a bare cart is a known AOV leak, but it is only load-bearing at publish grade
  const strict = await runGate({ cart: cart({ mechanic: false }) }, { env: { STRICT_CONVERSION: '1' } })
  strict.ids.has('conversion.cart-no-mechanic') ? ok('bare cart under STRICT → cart-no-mechanic') : bad(`got [${[...strict.ids].join(', ')}]`)

  // ...and must NOT block a normal dev run, or every early-stage build stalls on it
  const lenient = await runGate({ cart: cart({ mechanic: false }) })
  lenient.ids.has('conversion.cart-no-mechanic') ? bad('bare cart blocked without STRICT_CONVERSION') : ok('without STRICT it does not block')
}

console.log(failures === 0 ? '\nconversion-url: ALL CASES PASS' : `\nconversion-url: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
