#!/usr/bin/env node
// Self-test for #34 — image-quality (imageInfo header decode + analyzeImage rules + scanImages).
// Buffers are crafted with real format headers so dimension decode is exercised hermetically.
// Run (Node 20): node scripts/__fixtures__/image-quality/run-tests.mjs · Exit 0 = all pass.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { imageInfo, analyzeImage, scanImages } from '../../check-image-quality.mjs'

let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? pass(m) : fail(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

// ── header builders ──
function png(w, h) { const b = Buffer.alloc(24); b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47; b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b }
function gif(w, h) { const b = Buffer.alloc(16); b.write('GIF89a', 0, 'binary'); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8); return b }
function webp(w, h) { const b = Buffer.alloc(30); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8X', 12); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b }
function jpeg(w, h) { const b = Buffer.alloc(20); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xc0; b.writeUInt16BE(0x11, 4); b[6] = 0x08; b.writeUInt16BE(h, 7); b.writeUInt16BE(w, 9); return b }

console.log('imageInfo — header decode')
eq(imageInfo(png(800, 600)), { format: 'png', width: 800, height: 600 }, 'PNG dimensions')
eq(imageInfo(gif(400, 300)), { format: 'gif', width: 400, height: 300 }, 'GIF dimensions')
eq(imageInfo(webp(1200, 900)), { format: 'webp', width: 1200, height: 900 }, 'WebP (VP8X) dimensions')
eq(imageInfo(jpeg(2000, 1500)), { format: 'jpeg', width: 2000, height: 1500 }, 'JPEG (SOF0) dimensions')
eq(imageInfo(Buffer.from('not an image at all yo')), null, 'garbage → null')

console.log('analyzeImage — rules')
{
  const f = analyzeImage({ name: 'big.jpg', ext: '.jpg', sizeBytes: 600 * 1024, width: 2000 }, { maxKB: 500, minWidth: 800 })
  f.some(x => x.id === 'image.oversized' && x.severityHint === 'block') ? pass('>500KB → oversized (block hint)') : fail(`oversized: ${JSON.stringify(f)}`)
}
{
  const f = analyzeImage({ name: 'tiny.png', ext: '.png', sizeBytes: 20 * 1024, width: 400 }, { maxKB: 500, minWidth: 800 })
  f.some(x => x.id === 'image.low-res') ? pass('width<minWidth → low-res') : fail(`low-res: ${JSON.stringify(f)}`)
}
{
  const f = analyzeImage({ name: 'hero.jpg', ext: '.jpg', sizeBytes: 100 * 1024, width: 1600 }, { maxKB: 500, minWidth: 800, hasNextGenSibling: false })
  f.some(x => x.id === 'image.legacy-format') ? pass('.jpg with no webp sibling → legacy-format') : fail(`legacy: ${JSON.stringify(f)}`)
  const f2 = analyzeImage({ name: 'hero.jpg', ext: '.jpg', sizeBytes: 100 * 1024, width: 1600 }, { maxKB: 500, minWidth: 800, hasNextGenSibling: true })
  !f2.some(x => x.id === 'image.legacy-format') ? pass('.jpg WITH webp sibling → no legacy-format') : fail('legacy wrongly flagged with sibling')
}
{
  const f = analyzeImage({ name: 'ok.webp', ext: '.webp', sizeBytes: 80 * 1024, width: 1600 }, { maxKB: 500, minWidth: 800 })
  f.length === 0 ? pass('compliant webp → no findings') : fail(`webp findings: ${JSON.stringify(f)}`)
}

console.log('scanImages — directory walk')
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'imgq-'))
  const big = Buffer.concat([jpeg(2000, 1500), Buffer.alloc(600 * 1024)]) // valid JPEG header, padded > 500KB
  fs.writeFileSync(path.join(d, 'big.jpg'), big)
  fs.writeFileSync(path.join(d, 'small.png'), png(400, 300))
  const r = scanImages(d, { maxKB: 500, minWidth: 800 })
  r.scanned === 2 ? pass('scanned 2 images') : fail(`scanned ${r.scanned}`)
  const fids = new Set(r.findings.map(f => f.id))
  fids.has('image.oversized') ? pass('big.jpg → oversized') : fail(`no oversized: ${[...fids]}`)
  fids.has('image.low-res') ? pass('small.png → low-res') : fail(`no low-res: ${[...fids]}`)
  fs.rmSync(d, { recursive: true, force: true })
}
{
  const r = scanImages(path.join(os.tmpdir(), 'does-not-exist-xyz'), {})
  eq(r, { scanned: 0, findings: [] }, 'missing dir → empty scan (no throw)')
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
