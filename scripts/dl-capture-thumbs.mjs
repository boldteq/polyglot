#!/usr/bin/env node
// Capture crisp PNG card thumbnails for the Design Library (components + templates)
// so the grid serves static images instead of 200+ live iframes — instant, legible,
// zero CPU. Re-run whenever components/templates change.
//
//   node scripts/dl-capture-thumbs.mjs            # against http://localhost:3847
//   BASE=http://localhost:3998 node scripts/dl-capture-thumbs.mjs
//
// Output: ~/.claude/memory/design/ecom/component-library-premium/.thumbs/{components,templates}/<path-with-__>.png
import { createRequire } from 'module'
import { mkdirSync } from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:3847'
const THUMBS = path.join(os.homedir(), '.claude/memory/design/ecom/component-library-premium/.thumbs')
const CONC = Number(process.env.CONC || 5)
const safe = (p) => p.replace(/\//g, '__') + '.png'

mkdirSync(path.join(THUMBS, 'components'), { recursive: true })
mkdirSync(path.join(THUMBS, 'templates'), { recursive: true })

const get = async (u) => (await fetch(BASE + u)).json()
const idx = await get('/api/design-library/index')
const comps = []
for (const f of idx.families) for (const c of f.categories) for (const x of c.components) comps.push(x.path)
const tpls = (await get('/api/design-library/templates')).templates.map((t) => t.path)
console.log(`capturing ${comps.length} components + ${tpls.length} templates → ${THUMBS}`)

const browser = await chromium.launch()
async function captureSet(kind, list, urlFor) {
  let done = 0, failed = 0
  const queue = [...list]
  await Promise.all(Array.from({ length: CONC }, async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage()
    while (queue.length) {
      const p = queue.shift()
      try {
        await page.goto(BASE + urlFor(p), { waitUntil: 'load', timeout: 15000 })
        await page.waitForTimeout(250)
        await page.screenshot({ path: path.join(THUMBS, kind, safe(p)), clip: { x: 0, y: 0, width: 1280, height: 800 } })
        done++
      } catch (e) { failed++; console.log('  ✗', p, String(e).slice(0, 60)) }
    }
    await page.close()
  }))
  console.log(`${kind}: ${done} captured, ${failed} failed`)
}
await captureSet('components', comps, (p) => `/api/design-library/preview?path=${encodeURIComponent(p)}&static=1`)
await captureSet('templates', tpls, (p) => `/api/design-library/template-preview?path=${encodeURIComponent(p)}&static=1`)
await browser.close()
console.log('done')
