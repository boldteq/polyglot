// check-section-cohesion (#19) had ALL 3 of its blocking checks unproven — the last URL-gate gap (QA-2).
//
// Cohesion is a render-time property: it is about what the browser actually paints across sections,
// so it cannot be read off the Liquid source. But "render-time" does not mean "needs a real store" —
// Playwright is vendored for Lens, so a local node:http server plus a design-system.json contract
// reproduces all three.
//
// What they protect:
//   cohesion.type-offscale — one section hardcoding 19px when the ladder is 18/20, or a 73px one-off.
//     This is the single most common reason a built page reads as several sites stapled together.
//   cohesion.multi-h1     — only the hero owns the H1; a second is a real a11y + SEO bug.
//   cohesion.no-surfaces  — at publish grade, rendering NOTHING must not read as "cohesion verified".
//     This is the "a skipped gate is never a passed gate" invariant for this gate specifically.
//
// async `spawn`, never `spawnSync` — the server is in this process and spawnSync would deadlock it.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-section-cohesion.mjs')
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

// the type ladder the fixture pages are held to
const DESIGN_SYSTEM = { typography: { allowed_px: [16, 20, 32, 48] }, spacing: { scale: [16, 24, 32, 48, 64] } }

// A content section as the gate recognises one: `.shopify-section`, taller than 20px, and NOT matching
// the chrome pattern (header/footer/drawer/popup/...), which is excluded from cohesion by design.
const section = (id, { h1 = false, fontPx = 20, text = 'Seasonal menu' } = {}) => `
<div id="shopify-section-${id}" class="shopify-section" style="min-height:200px;padding:32px">
  <div>
    ${h1 ? `<h1 style="font-size:48px">${text}</h1>` : `<h2 style="font-size:32px">${text}</h2>`}
    <p style="font-size:${fontPx}px">House blend coffee, ceremonial matcha and a menu that moves with the season.</p>
  </div>
</div>`

const home = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Store</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:system-ui}</style></head><body>${body}</body></html>`

// two sections, every rendered size on the ladder, exactly one h1 — the cohesive baseline
const CLEAN = home(section('hero', { h1: true }) + section('story'))

function serve(bodyByPath = {}, { products = [{ handle: 'matcha' }] } = {}) {
  return http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname
    const send = (b, t = 'text/html') => { res.writeHead(200, { 'content-type': t }); res.end(b) }
    if (p === '/products.json') return send(JSON.stringify({ products }), 'application/json')
    if (p === '/collections.json') return send(JSON.stringify({ collections: [{ handle: 'drinks' }] }), 'application/json')
    if (p.startsWith('/products/')) return send(bodyByPath.pdp ?? CLEAN)
    if (p.startsWith('/collections/')) return send(bodyByPath.collection ?? CLEAN)
    return send(bodyByPath.home ?? CLEAN)
  })
}

async function runGate(bodyByPath = {}, { surfaces = 'home', env = {}, serveOpts = {} } = {}) {
  const server = serve(bodyByPath, serveOpts)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cohesion-'))
  fs.mkdirSync(path.join(cwd, 'docs', 'design'), { recursive: true })
  fs.writeFileSync(path.join(cwd, 'docs', 'design', 'design-system.json'), JSON.stringify(DESIGN_SYSTEM))
  const reportDir = path.join(cwd, 'gate-reports')
  const { code, out } = await new Promise((resolve) => {
    const child = spawn(process.execPath, [GATE, '--surfaces', surfaces], {
      cwd,
      env: { ...process.env, THEME_PREVIEW_URL: `http://127.0.0.1:${port}`, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', ...env },
    })
    let buf = ''
    child.stdout.on('data', (d) => { buf += d })
    child.stderr.on('data', (d) => { buf += d })
    child.on('exit', (c) => resolve({ code: c, out: buf }))
  })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'section-consistency.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(cwd, { recursive: true, force: true })
  await new Promise((r2) => server.close(r2))
  return { code, out, ids: new Set((rep?.blockers || []).map((b) => b.id)) }
}

console.log('check-section-cohesion — real chromium against a local storefront')
{
  const { ids, out } = await runGate()
  const own = [...ids].filter((i) => /^cohesion\./.test(i))
  own.length === 0 ? ok('a cohesive page raises none of the three') : bad(`false blocks: ${own.join(', ')} — ${out.slice(-200)}`)
}

console.log('\n── every rendered size must sit on the one type ladder ──')
{
  // 19px against a 16/20/32/48 ladder — the "reads as two different sites" defect
  const drift = home(section('hero', { h1: true }) + section('story', { fontPx: 19 }))
  const { ids } = await runGate({ home: drift })
  ids.has('cohesion.type-offscale') ? ok('a section hardcoding 19px → cohesion.type-offscale') : bad(`got [${[...ids].join(', ')}]`)
}
{
  // a one-off display size nowhere near the ladder
  const oneOff = home(section('hero', { h1: true }) + section('story', { fontPx: 73 }))
  const { ids } = await runGate({ home: oneOff })
  ids.has('cohesion.type-offscale') ? ok('a 73px one-off → cohesion.type-offscale') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('\n── only the hero owns the H1 ──')
{
  const twoH1 = home(section('hero', { h1: true }) + section('story', { h1: true, text: 'Our story' }))
  const { ids } = await runGate({ home: twoH1 })
  ids.has('cohesion.multi-h1') ? ok('two content sections rendering an <h1> → cohesion.multi-h1') : bad(`got [${[...ids].join(', ')}]`)
}

console.log('\n── rendering nothing is not the same as passing ──')
{
  // No surface resolves (no products, and we ask only for pdp). At publish grade that must BLOCK:
  // a gate that measured zero pages has proven zero things.
  const { ids } = await runGate({}, { surfaces: 'pdp', serveOpts: { products: [] }, env: { DS_REQUIRE_SCOPE: '1' } })
  ids.has('cohesion.no-surfaces') ? ok('no surface rendered at publish grade → cohesion.no-surfaces') : bad(`got [${[...ids].join(', ')}]`)

  // ...and in a normal dev run the same situation must NOT block, or every early build stalls
  const dev = await runGate({}, { surfaces: 'pdp', serveOpts: { products: [] } })
  dev.ids.has('cohesion.no-surfaces') ? bad('no-surfaces blocked without DS_REQUIRE_SCOPE') : ok('without DS_REQUIRE_SCOPE it does not block')
}

console.log(failures === 0 ? '\nsection-cohesion: ALL CASES PASS' : `\nsection-cohesion: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
