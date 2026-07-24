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
import { SHOPIFY_SIGNAL, CITATION } from './lib/shopify-mechanism.mjs'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const PACKS = (() => {
  const i = args.indexOf('--packs')
  return i !== -1 && args[i + 1] ? args[i + 1] : path.join(os.homedir(), '.claude/memory/patterns/good/swt-rules')
})()
const TOP = (() => { const i = args.indexOf('--top'); return i !== -1 && args[i + 1] ? Number(args[i + 1]) : 15 })()
// --enforce turns the report into a GATE (D1): exit 1 if the ENFORCED-uncited backlog exceeds --max
// (default 0). Report-only (exit 0) without it, so the standalone corpus view stays advisory.
const ENFORCE = args.includes('--enforce')
const MAX_UNCITED = (() => { const i = args.indexOf('--max'); return i !== -1 && args[i + 1] ? Number(args[i + 1]) : 0 })()

// SHOPIFY_SIGNAL + CITATION now live in scripts/lib/shopify-mechanism.mjs — the SAME predicate the
// swt-distribute D1 reject uses, so the audit and the gate can never drift apart.

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

  const blocked = ENFORCE && uncited.length > MAX_UNCITED
  const code = blocked ? 1 : 0

  if (asJson) {
    console.log(JSON.stringify({ packs: files.length, enforced, shopifyClaims, cited, citationRate: `${pct}%`, uncitedEnforced: uncited.length, enforce: ENFORCE, maxUncited: MAX_UNCITED, blocked, sample: uncited.slice(0, TOP) }, null, 2))
    process.exit(code)
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
  console.log('  and swt-distribute REJECTS an uncited new mechanism rule (D1). This backlog shrinks as re-grounded slices replace old ones.')
  if (ENFORCE) console.log(`\n  ${blocked ? `BLOCK — ${uncited.length} ENFORCED-uncited rule(s) > --max ${MAX_UNCITED}` : `OK — ${uncited.length} ENFORCED-uncited ≤ --max ${MAX_UNCITED}`}`)
  process.exit(code)
}

main()
