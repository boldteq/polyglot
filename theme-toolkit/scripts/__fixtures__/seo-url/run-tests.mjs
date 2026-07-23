// gate-seo had 15 of its 16 BLOCKING checks unproven — the worst URL-gate gap (QA-2).
//
// URL gates were treated as "hard to fixture because they need a live page". They don't: gate-seo
// talks plain `fetch` (no browser), and resolvePages discovers handles from /products.json,
// /collections.json and sitemap.xml. So a ~40-line node:http server IS a storefront as far as this
// gate is concerned. That removes the excuse for the whole class.
//
// Each case serves a page with exactly one planted SEO defect and asserts the specific blocker id.
// Hermetic: an ephemeral port on 127.0.0.1, no network, no store.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gate-seo.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

// ── a minimal but SEO-clean storefront page ──────────────────────────────────
const page = (over = {}) => {
  const o = {
    title: 'Cravin by Andy — seasonal cafe menu in Mumbai',
    desc: 'A Mumbai cafe serving a seasonal menu, house blend coffee and ceremonial matcha, with catering and thoughtful gifting.',
    canonical: 1, h1: 1, noindex: false, og: true, jsonld: 'WebPage', img: true, ...over,
  }
  const canon = Array.from({ length: o.canonical }, () => '<link rel="canonical" href="http://127.0.0.1/">').join('\n')
  const h1s = Array.from({ length: o.h1 }, (_, i) => `<h1>Heading ${i + 1}</h1>`).join('\n')
  const og = o.og
    ? `<meta property="og:title" content="Cravin by Andy"><meta property="og:description" content="${o.desc}">
       <meta property="og:image" content="http://127.0.0.1/a.jpg"><meta property="og:type" content="website">
       <meta property="og:url" content="http://127.0.0.1/"><meta name="twitter:card" content="summary_large_image">`
    : ''
  const ld = o.jsonld === null ? '' :
    o.jsonld === 'BROKEN' ? '<script type="application/ld+json">{ not json </script>'
      : `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': o.jsonld, name: 'Cravin' })}</script>
         <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Cravin', url: 'http://127.0.0.1/' })}</script>`
  const img = o.img
    ? '<img src="/a.jpg" alt="A seasonal salad bowl" width="800" height="600" loading="lazy">'
    : '<img src="/a.jpg">'
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>${o.title}</title>
${o.desc ? `<meta name="description" content="${o.desc}">` : ''}
${canon}
${o.noindex ? '<meta name="robots" content="noindex">' : ''}
${og}
${ld}
</head><body>${h1s}<main>${img}</main></body></html>`
}

// ── the storefront ───────────────────────────────────────────────────────────
function serve(overridesByPath = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const p = url.pathname
    const send = (body, type = 'text/html') => { res.writeHead(200, { 'content-type': type }); res.end(body) }
    if (p === '/robots.txt') return send('User-agent: *\nSitemap: http://127.0.0.1/sitemap.xml\n', 'text/plain')
    if (p === '/sitemap.xml') return send('<?xml version="1.0"?><urlset><url><loc>http://127.0.0.1/</loc></url></urlset>', 'application/xml')
    if (p === '/products.json') return send(JSON.stringify({ products: [{ handle: 'matcha', title: 'Matcha' }] }), 'application/json')
    if (p === '/collections.json') return send(JSON.stringify({ collections: [{ handle: 'drinks', title: 'Drinks' }] }), 'application/json')
    const key = p === '/' ? 'home' : p.startsWith('/products/') ? 'pdp' : p.startsWith('/collections/') ? 'collection'
      : p === '/cart' ? 'cart' : p.startsWith('/search') ? 'search' : 'other'
    return send(page(overridesByPath[key] ?? overridesByPath.all ?? {}))
  })
  return server
}

async function runGate(overrides = {}, pages = 'home') {
  const server = serve(overrides)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'))
  // spawn, NOT spawnSync: the storefront server lives in THIS process, and spawnSync blocks the event
  // loop — so the server could never answer the gate's fetch and both sides deadlocked until the
  // timeout. (Cost an hour; the gate was fine all along.)
  const { code, out } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [GATE, '--pages', pages], {
      env: { ...process.env, THEME_PREVIEW_URL: `http://127.0.0.1:${port}`, REPORT_DIR: reportDir },
    })
    let buf = ''
    child.stdout.on('data', (d) => { buf += d })
    child.stderr.on('data', (d) => { buf += d })
    child.on('exit', (c) => resolve({ code: c, out: buf }))
  })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'seo.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  await new Promise((r2) => server.close(r2))
  return { code, out, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}
const expectId = async (name, overrides, id, pages = 'home') => {
  const { ids, code, out } = await runGate(overrides, pages)
  ids.has(id) ? ok(`${name} → ${id}`) : bad(`${name}: expected ${id}, got [${[...ids].join(', ') || 'none'}] (exit ${code}) ${out.slice(0, 100)}`)
}

console.log('gate-seo — driven by a real HTTP server, one planted defect at a time')
{
  const { code, ids } = await runGate()
  code === 0 ? ok('the SEO-clean page passes') : bad(`clean page blocked: [${[...ids].join(', ')}]`)
}

console.log('\n── <head> essentials ──')
await expectId('no <title>', { all: { title: '' } }, 'seo.title')
await expectId('title far too long', { all: { title: 'x'.repeat(120) } }, 'seo.title')
// APPLY.description scopes this to pdp/collection/article — on home it correctly does NOT fire,
// which is itself worth pinning (see the scoping case at the end).
await expectId('no meta description (pdp)', { all: { desc: '' } }, 'seo.meta-description', 'pdp')
await expectId('meta description too short (pdp)', { all: { desc: 'too short' } }, 'seo.meta-description', 'pdp')
await expectId('two canonical tags', { all: { canonical: 2 } }, 'seo.canonical-count')
await expectId('no canonical tag', { all: { canonical: 0 } }, 'seo.canonical-count')
await expectId('noindex on an indexable page', { all: { noindex: true } }, 'seo.noindex')
await expectId('missing social meta', { all: { og: false } }, 'seo.og-tags')

console.log('\n── document structure ──')
await expectId('two <h1> elements', { all: { h1: 2 } }, 'seo.h1-count')
await expectId('no <h1> at all', { all: { h1: 0 } }, 'seo.h1-count')

console.log('\n── structured data ──')
await expectId('unparseable JSON-LD', { all: { jsonld: 'BROKEN' } }, 'seo.jsonld-parse')

console.log('\n── images ──')
await expectId('image with no alt (pdp)', { all: { img: false } }, 'seo.img-alt', 'pdp')

console.log('\n── page-type SCOPING is deliberate, not a miss ──')
{
  // meta-description applies to pdp/collection/article only. A home page without one must NOT block —
  // if that ever changes silently, every store's home page starts failing the SEO gate.
  const { ids } = await runGate({ all: { desc: '' } }, 'home')
  ids.has('seo.meta-description') ? bad('home page was held to the pdp meta-description rule') : ok('home is exempt from meta-description, as scoped')
}

console.log('\n── no false positives ──')
{
  // the clean page must raise NONE of the ids we just proved — otherwise every case above is suspect
  const { ids } = await runGate()
  const leaked = [...ids]
  leaked.length === 0 ? ok('the clean page raises no blocker at all') : bad(`clean page leaked: ${leaked.join(', ')}`)
}

console.log(failures === 0 ? '\nseo-url: ALL CASES PASS' : `\nseo-url: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
