#!/usr/bin/env node
// Gate #39 social-assets (Signal · quality) — favicon + social-share (OG/Twitter) image metadata.
// A missing favicon reads as broken; a missing og:image halves social-share CTR. Static: scan the
// layout (theme.liquid) + meta snippets + settings for a favicon and og:image/twitter:image.
// Warn-first; BLOCKS at publish-grade. SKIPS when there's no layout. Exit: 0 pass · 1 block · 2 env.

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const ENFORCE = process.env.SOCIAL_REQUIRE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const blockers = []
const warnings = []

function read(...rels) { for (const r of rels) { try { return fs.readFileSync(path.resolve(cwd, r), 'utf8') } catch {} } return null }
function readDir(dir, exts) { const out = []; try { for (const f of fs.readdirSync(dir)) if (exts.some((e) => f.endsWith(e))) out.push(fs.readFileSync(path.join(dir, f), 'utf8')) } catch {} return out }

const layout = read('layout/theme.liquid')
if (layout == null) {
  writeReport('social-assets', 39, { cwd, pass: true, blockers, warnings, evidence: { reason: 'no layout/theme.liquid' }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log('social-assets: PASS (no layout)'); process.exit(0)
}
const meta = [layout, ...readDir(path.join(cwd, 'snippets'), ['.liquid']), read('config/settings_data.json') || ''].join('\n')

const hasFavicon = /rel=["']?(?:shortcut )?icon/i.test(meta) || /favicon/i.test(meta) || /settings\.favicon/i.test(meta)
const hasOgImage = /property=["']og:image["']|og:image|"og_image"|settings\.share_image|page_image/i.test(meta)
const hasTwitter = /name=["']twitter:(?:image|card)["']|twitter:image|summary_large_image/i.test(meta)

const push = (cond, id, detail) => { if (!cond) { const it = { id, page: 'layout/theme.liquid', detail }; if (ENFORCE) blockers.push(it); else warnings.push(it) } }
push(hasFavicon, 'social.no-favicon', 'no favicon set — add a favicon (settings.favicon → link rel="icon"); a missing icon reads as a broken/untrusted store')
push(hasOgImage, 'social.no-og-image', 'no og:image meta — social shares will have no preview image (halves share CTR); add an Open Graph image (settings.share_image)')
push(hasTwitter, 'social.no-twitter-card', 'no twitter:card/twitter:image meta — Twitter/X shares render bare; add summary_large_image + twitter:image')

const pass = blockers.length === 0
writeReport('social-assets', 39, { cwd, pass, blockers, warnings, evidence: { enforce: ENFORCE, hasFavicon, hasOgImage, hasTwitter }, duration_ms: Date.now() - t0 }, REPORT_DIR)
console.log(`social-assets: ${pass ? 'PASS' : 'BLOCK'} — favicon=${hasFavicon} og=${hasOgImage} twitter=${hasTwitter}`)
process.exit(pass ? 0 : 1)
