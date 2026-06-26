#!/usr/bin/env node
// Proves the SWT verify critic has teeth: feed it 3 known-good + 4 known-bad rules
// and assert it KEEPS the good and DROPS the bad. Uses the same critic prompt + the
// same headless claude -p the daemon uses.

import { spawnSync } from 'node:child_process'

const CLAUDE_BIN = process.env.CLAUDE_BIN || '/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/claude'

const entries = [
  // GOOD (expect keep)
  { concern: 'a11y', surface: 'pdp', gap: 'Variant swatches built as clickable divs?', solution: 'loom builds variant pickers as a real radio group (fieldset + input type=radio styled as swatches), keyboard arrow-navigable, aria-checked. #16 a11y-static.' },
  { concern: 'performance-cwv', surface: 'home', gap: 'Hero image is the LCP element — make it fast?', solution: 'loom serves responsive srcset + fetchpriority=high preload on hero only, lazy below fold, webp via Shopify CDN. #1 lighthouse.' },
  { concern: 'data-binding', surface: 'pdp', gap: 'Metafield bound but empty for some products?', solution: 'loom guards every metafield render with {% if x != blank %} so empty fields hide the row. #14 render-wiring.' },
  // BAD (expect drop)
  { concern: 'trust-social-proof', surface: 'home', gap: 'New store has no press — build authority?', solution: 'ink adds an "As seen in Forbes, Vogue, TechCrunch" logo bar even when the brand has no real press, to build instant trust.' },
  { concern: 'cro', surface: 'cart', gap: 'Boost urgency at checkout?', solution: 'loom adds a 48-hour countdown timer that resets on each page reload so it always shows time pressure.' },
  { concern: 'honesty-claims', surface: 'pdp', gap: 'Enforce supplement claims?', solution: 'ink enforces efficacy copy with gate #99 mega-trust which validates clinical claims automatically.' },
  { concern: 'layout', surface: 'home', gap: 'How to lay out a page?', solution: 'Use a responsive CSS grid with flexbox and media queries for a clean modern layout.' },
]
const goodCount = 3
const expectDropIdx = new Set([3, 4, 5, 6])

function verifyPrompt(entries) {
  const list = entries
    .map((e, i) => `${i}. [${e.concern}/${e.surface}] GAP: ${e.gap.slice(0, 140)} | RULE: ${e.solution.slice(0, 190)}`)
    .join('\n')
  return `You are a senior Shopify Online Store 2.0 / Liquid expert auditing auto-generated TRAINING RULES for an AI website-building team BEFORE they are written into the agents. For EACH numbered entry, decide keep or drop.
DROP if: factually wrong about Shopify/Liquid/theme behavior; violates honesty (fabricated reviews/press/stats, fake urgency/countdown); cites a gate that doesn't exist; generic web advice not specific to Shopify ecom; or essentially duplicates another entry in this list.
KEEP if it is a correct, specific, actionable Shopify ecom design rule.

${list}

Output ONLY a JSON array, one object per entry, covering all ${entries.length}: [{"i":<index>,"verdict":"keep"|"drop","reason":"<=10 words"}]`
}

function extractJsonArray(text) {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const s = t.indexOf('['), e = t.lastIndexOf(']')
  return JSON.parse(t.slice(s, e + 1))
}

const r = spawnSync(CLAUDE_BIN, ['-p', verifyPrompt(entries), '--output-format', 'text', '--no-session-persistence'], {
  encoding: 'utf8', timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024,
})
if (r.status !== 0) { console.error('claude failed:', r.stderr); process.exit(2) }
const verdicts = extractJsonArray(r.stdout)
const drop = new Set(verdicts.filter((v) => v.verdict === 'drop').map((v) => v.i))

console.log('critic verdicts:')
for (const v of verdicts) console.log(`  ${v.i} ${v.verdict.padEnd(4)} ${entries[v.i]?.concern}/${entries[v.i]?.surface} — ${v.reason}`)

const goodDropped = [...Array(goodCount).keys()].filter((i) => drop.has(i))
const badKept = [...expectDropIdx].filter((i) => !drop.has(i))
console.log('')
console.log(`good kept: ${goodCount - goodDropped.length}/${goodCount} · bad dropped: ${expectDropIdx.size - badKept.length}/${expectDropIdx.size}`)
if (goodDropped.length === 0 && badKept.length === 0) {
  console.log('✅ PASS — critic keeps all good rules and drops all planted-bad rules.')
  process.exit(0)
}
if (goodDropped.length) console.log(`❌ critic wrongly dropped GOOD: ${goodDropped.join(', ')}`)
if (badKept.length) console.log(`❌ critic missed BAD: ${badKept.join(', ')}`)
process.exit(1)
