#!/usr/bin/env node
// #34 — image-quality gate (porter-side, pre-upload). Porter uploads whatever it's handed; a store of
// 4MB JPEGs or 300px hero crops looks cheap + tanks LCP no matter how good the theme is. This scans a
// local image directory BEFORE upload and flags weight / resolution / format problems, so the fix
// happens once at the source. Dependency-free: image dimensions are read from file headers
// (PNG/JPEG/GIF/WebP), not a decode lib.
//
// Checks (per image):
//   image.oversized       — file > MAX_KB (default 500KB). WARN in dev; BLOCK at strict (a too-heavy
//                           image is the #1 LCP killer). (IMAGE_QUALITY_STRICT=1 / PORTER_REQUIRE_CONTENT=1)
//   image.low-res         — decoded width < MIN_WIDTH (default 800px) → crops blurry on a 2x PDP. WARN.
//   image.legacy-format   — .jpg/.jpeg/.png with no next-gen (.webp/.avif) sibling → advisory WARN.
//   image.unreadable      — couldn't read dimensions (corrupt / unknown container). WARN.
//
// Usage: node check-image-quality.mjs [dir]        (default: IMAGES_DIR, else assets/)
// Env: IMAGES_DIR · MAX_KB (500) · MIN_WIDTH (800) · IMAGE_QUALITY_STRICT=1 · REPORT_DIR
// Exit: 0 = pass/skip · 1 = block · 2 = env error
//
// imageInfo + analyzeImage are PURE + exported so __fixtures__/image-quality proves them. Node 20 ESM.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'])
const NEXT_GEN = new Set(['.webp', '.avif'])

// PURE: decode {format,width,height} from an image file header buffer. null if unrecognized/truncated.
export function imageInfo(buf) {
  if (!buf || buf.length < 16) return null
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }
  // GIF (GIF87a / GIF89a)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { format: 'gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }
  // WEBP (RIFF....WEBP)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const fourcc = buf.toString('ascii', 12, 16)
    if (fourcc === 'VP8X' && buf.length >= 30) return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (fourcc === 'VP8 ' && buf.length >= 30) return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    if (fourcc === 'VP8L' && buf.length >= 25) {
      const b = buf.readUInt32LE(21)
      return { format: 'webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
    }
    return { format: 'webp', width: 0, height: 0 }
  }
  // JPEG — scan SOF markers
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o += 1; continue }
      const marker = buf[o + 1]
      // SOF0–SOF15 carry dimensions, except DHT(C4) DAC(CC) and the RST/SOI/EOI markers
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: 'jpeg', width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5) }
      }
      const len = buf.readUInt16BE(o + 2)
      if (len < 2) break
      o += 2 + len
    }
    return { format: 'jpeg', width: 0, height: 0 }
  }
  return null
}

// PURE: classify one image against the rules → finding objects (no severity escalation here).
export function analyzeImage(img, { maxKB = 500, minWidth = 800, hasNextGenSibling = false } = {}) {
  const findings = []
  const ext = img.ext
  const kb = Math.round(img.sizeBytes / 1024)
  if (img.sizeBytes > maxKB * 1024) findings.push({ id: 'image.oversized', detail: `${img.name} is ${kb}KB (> ${maxKB}KB) — compress / resize before upload; the heaviest above-the-fold image is the LCP bottleneck.`, severityHint: 'block' })
  if (img.width && img.width < minWidth) findings.push({ id: 'image.low-res', detail: `${img.name} is ${img.width}px wide (< ${minWidth}px) — will look soft on a 2x PDP/hero. Source a larger original.`, severityHint: 'warn' })
  if (!img.width && img.width !== 0) findings.push({ id: 'image.unreadable', detail: `${img.name} — could not read dimensions (corrupt or unsupported container).`, severityHint: 'warn' })
  if ((ext === '.jpg' || ext === '.jpeg' || ext === '.png') && !NEXT_GEN.has(ext) && !hasNextGenSibling) {
    findings.push({ id: 'image.legacy-format', detail: `${img.name} is ${ext} with no .webp/.avif sibling — next-gen formats are ~30% smaller. Convert on upload.`, severityHint: 'advise' })
  }
  return findings
}

function walk(dir, out = []) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (IMG_EXT.has(path.extname(e.name).toLowerCase())) out.push(p)
  }
  return out
}

// Scan an image directory → { scanned, findings:[{id,page,detail,severityHint}] }. Reusable: the
// standalone gate AND porter-preflight (#34 wiring) both call this so the logic lives once.
export function scanImages(dirAbs, { maxKB = 500, minWidth = 800 } = {}) {
  const out = { scanned: 0, findings: [] }
  if (!fs.existsSync(dirAbs)) return out
  const files = walk(dirAbs)
  const lower = files.map(f => f.toLowerCase())
  for (const f of files) {
    const ext = path.extname(f).toLowerCase()
    let buf = null
    try { buf = fs.readFileSync(f) } catch { continue }
    const stem = path.join(path.dirname(f), path.basename(f, ext)).toLowerCase()
    const hasNextGenSibling = [...NEXT_GEN].some(g => lower.includes(`${stem}${g}`))
    const info = imageInfo(buf) || {}
    out.scanned += 1
    for (const fnd of analyzeImage({ name: f, ext, sizeBytes: buf.length, width: info.width }, { maxKB, minWidth, hasNextGenSibling })) {
      out.findings.push({ ...fnd, page: f })
    }
  }
  return out
}

function main() {
  const t0 = Date.now()
  const cwd = process.cwd()
  const dir = process.argv[2] || process.env.IMAGES_DIR || 'assets'
  const maxKB = Number(process.env.MAX_KB || '500')
  const minWidth = Number(process.env.MIN_WIDTH || '800')
  // publish-grade (DS_REQUIRE_SCOPE=1) arms the oversized-image BLOCK — the #1 LCP killer must FAIL the
  // publish gate, not merely warn (2026-07-29 audit G8). IMAGE_QUALITY_STRICT / PORTER_REQUIRE_CONTENT stay.
  const STRICT = process.env.IMAGE_QUALITY_STRICT === '1' || process.env.PORTER_REQUIRE_CONTENT === '1' || process.env.DS_REQUIRE_SCOPE === '1'
  const dirAbs = path.resolve(cwd, dir)
  const blockers = []
  const warnings = []

  const finish = (evidence = {}) => {
    const pass = blockers.length === 0
    writeReport('image-quality', 34, { cwd, pass, blockers, warnings, evidence: { dir, maxKB, minWidth, strict: STRICT, ...evidence }, duration_ms: Date.now() - t0 })
    console.log(`image-quality: ${pass ? 'PASS' : 'BLOCK'} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
    for (const b of blockers) console.log(`  BLOCK ${b.id}: ${b.detail}`)
    for (const w of warnings.slice(0, 12)) console.log(`  warn  ${w.id}: ${w.detail}`)
    process.exit(pass ? 0 : 1)
  }

  if (!fs.existsSync(dirAbs)) { warnings.push({ id: 'image.n-a-no-dir', page: dir, detail: `no ${dir} directory — nothing to scan (skip)`, evidence: '' }); return finish({ scanned: 0 }) }
  const { scanned, findings } = scanImages(dirAbs, { maxKB, minWidth })
  for (const fnd of findings) {
    const isBlock = fnd.severityHint === 'block' && STRICT
    const list = isBlock ? blockers : warnings
    list.push({ id: fnd.id, page: path.relative(cwd, fnd.page), detail: fnd.detail, evidence: '', severity: isBlock ? 'block' : (fnd.severityHint === 'block' ? 'warn' : fnd.severityHint) })
  }
  finish({ scanned })
}

if (isMain(import.meta.url)) {
  main()
}
