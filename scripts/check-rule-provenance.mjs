#!/usr/bin/env node
// check-rule-provenance — a corpus health report, NOT a theme build gate.
//
// THE GAP (audit 2026-07-24): the 5,253 trained rules across the SWT packs carry ZERO shopify.dev
// citations. Every rule was model-recall, which is the measured reason authored themes drifted off
// Shopify spec. Stage 5 grounded the GENERATOR (new rules must be doc-true, the critic drops invented
// schema keys) — this reports how far the EXISTING backlog is from being cited, so the gap is visible
// and trackable instead of silent. Warn-first by design: it never blocks a build (it can't — the packs
// live in ~/.claude, not in a client repo), it prints a coverage number and the worst-offending rules.
//
// A rule "asserts a Shopify behaviour" (and so SHOULD carry a citation) when it names a concrete Shopify
// mechanism: a schema key/setting type, a Liquid object/filter/tag, a metafield/metaobject, or a route.
// Pure design/UX/CRO/copy rules are exempt — there is no shopify.dev page for "16px body copy".
//
// Usage: node scripts/check-rule-provenance.mjs [--json] [--packs <dir>] [--top <n>]
// Exit: 0 always (report, not a gate). Non-zero only on an unreadable packs dir (env error).

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const PACKS = (() => {
  const i = args.indexOf('--packs')
  return i !== -1 && args[i + 1] ? args[i + 1] : path.join(os.homedir(), '.claude/memory/patterns/good/swt-rules')
})()
const TOP = (() => { const i = args.indexOf('--top'); return i !== -1 && args[i + 1] ? Number(args[i + 1]) : 15 })()

// Shopify-mechanism signals — a rule mentioning any of these is making a checkable platform claim.
// Kept deliberately concrete: a schema key, a real Liquid filter/object, a metafield, a route.
const SHOPIFY_SIGNAL = new RegExp([
  // schema authoring
  'visible_if', 'enabled_on', 'disabled_on', 'max_blocks', '\\bpresets?\\b', '\\blimit\\b',
  'settings_schema', 'block\\.settings', 'section\\.settings', 'color_scheme', 'text_alignment',
  'image_picker', 'link_list', 'inline_richtext', '\\brichtext\\b', 'range setting', 'select setting',
  // liquid objects/filters/tags
  'content_for', 'shopify_attributes', 'paginate', 'placeholder_svg_tag', 'image_url', 'image_tag',
  '\\| money\\b', '\\| t\\b', 'metafield', 'metaobject', 'linklists', 'routes\\.', 'cart\\.', 'product\\.',
  'collection\\.', 'request\\.', '{%-? *schema', '{%-? *render', '{%-? *section', '{%-? *style',
].join('|'), 'i')

const CITATION = /shopify\.dev|help\.shopify\.com/i

function packFiles() {
  if (!fs.existsSync(PACKS)) return null
  return fs.readdirSync(PACKS).filter(f => f.endsWith('.md') && !f.startsWith('_')).map(f => path.join(PACKS, f))
}

// One rule = one "- [ENFORCED]/[guideline] ..." bullet line in a pack.
function scanPack(file) {
  const agent = path.basename(file, '.md')
  const lines = fs.readFileSync(file, 'utf-8').split('\n')
  let enforced = 0; let shopifyClaims = 0; let cited = 0
  const uncited = []
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\[(ENFORCED|guideline)\]\s*(.+)$/)
    if (!m) continue
    if (m[1] === 'ENFORCED') enforced += 1
    const body = m[2]
    if (!SHOPIFY_SIGNAL.test(body)) continue // a pure taste/CRO rule — no citation expected
    shopifyClaims += 1
    if (CITATION.test(body)) cited += 1
    else if (m[1] === 'ENFORCED') uncited.push({ agent, text: body.slice(0, 140) })
  }
  return { agent, enforced, shopifyClaims, cited, uncited }
}

function main() {
  const files = packFiles()
  if (!files) { console.error(`rule-provenance: ENV-ERROR — packs dir not found: ${PACKS}`); process.exit(2) }

  const per = files.map(scanPack)
  const shopifyClaims = per.reduce((a, p) => a + p.shopifyClaims, 0)
  const cited = per.reduce((a, p) => a + p.cited, 0)
  const enforced = per.reduce((a, p) => a + p.enforced, 0)
  const uncited = per.flatMap(p => p.uncited)
  const pct = shopifyClaims ? ((cited / shopifyClaims) * 100).toFixed(1) : '100.0'

  if (asJson) {
    console.log(JSON.stringify({ packs: files.length, enforced, shopifyClaims, cited, citationRate: `${pct}%`, uncitedEnforced: uncited.length, sample: uncited.slice(0, TOP) }, null, 2))
    process.exit(0)
  }

  console.log('SWT rule provenance — how far the backlog is from Shopify-cited\n')
  console.log(`  packs scanned          : ${files.length}`)
  console.log(`  ENFORCED rules         : ${enforced}`)
  console.log(`  rules asserting Shopify: ${shopifyClaims}  (the ones that SHOULD cite a doc)`)
  console.log(`  of those, cited        : ${cited}  (${pct}%)`)
  console.log(`  ENFORCED + Shopify-claim + UNCITED (the backlog): ${uncited.length}\n`)
  console.log(`  worst offenders (first ${Math.min(TOP, uncited.length)} of ${uncited.length}):`)
  for (const u of uncited.slice(0, TOP)) console.log(`   [${u.agent}] ${u.text}`)
  console.log('\n  Fix path: the generator now demands doc-grounding for NEW platform-authoring rules (swt-train-loop),')
  console.log('  and the critic drops invented schema keys. This backlog shrinks as re-grounded slices replace old ones.')
  process.exit(0)
}

main()
