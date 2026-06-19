#!/usr/bin/env node
// derive-schema-contracts.mjs — P1 task 2 (C4) mass-fill: add a `## Schema contract` AUTO-DRAFT to every
// card that lacks one, derived from its actual ## HTML. Marked AUTO-DRAFT — stitch ratifies setting names
// + block min/max before the contract is authoritative. Idempotent (skips cards that already have the section,
// so the hand-authored exemplars are preserved). Gate-#14 intent: declare what the Liquid will reference.
//
// Usage: node scripts/derive-schema-contracts.mjs --dry | node scripts/derive-schema-contracts.mjs

import fs from 'node:fs'
import path from 'node:path'

const COMPONENTS = path.join(process.env.HOME, '.claude/memory/design/ecom/component-library-premium/components')
const dry = process.argv.includes('--dry')

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.md') && e.name !== '_index.md' && e.name !== 'README.md' ? [path.join(d, e.name)] : []))

const htmlOf = (body) => {
  const sec = body.match(/##\s+HTML\b([\s\S]*?)(?=\n##\s|$)/)
  if (!sec) return ''
  const f = sec[1].match(/```html\n([\s\S]*?)```/i)
  return f ? f[1] : ''
}

let added = 0, skipped = 0
for (const p of walk(COMPONENTS)) {
  let body = fs.readFileSync(p, 'utf8')
  if (/##\s+Schema contract\b/.test(body)) { skipped++; continue }
  const html = htmlOf(body)
  if (!html) { skipped++; continue }

  // --- detectors ---
  const settings = ['`color_scheme` (color_scheme)']
  const refs = []
  const objects = []
  const blocks = []

  const imgs = (html.match(/<img\b/gi) || []).length
  const headings = (html.match(/<h[1-4]\b/gi) || []).length
  const paras = (html.match(/<p\b/gi) || []).length
  const links = (html.match(/<a\b[^>]*href/gi) || []).length
  const svgs = (html.match(/<svg\b/gi) || []).length
  const inputs = (html.match(/<(input|select|textarea)\b/gi) || []).length
  const lis = (html.match(/<li\b/gi) || []).length
  const hasLiquid = /\{\{|\{%/.test(html)
  const productRef = /\bproduct\.|\bvariant\b|featured_image|compare_at_price|selected_or_first_available/i.test(html)
  const collectionRef = /\bcollection\.|for .* in .*collection|product-card|featured-collection/i.test(html)
  const priceRef = /price|compare_at|\$\d|% ?off/i.test(html)

  if (headings) settings.push('`heading` (text)')
  if (paras > 1 || /tagline|subhead|desc|lede|intro/i.test(html)) settings.push('`body` (richtext)')
  if (imgs) settings.push(imgs > 1 ? '`image` ×N (image_picker — likely per-block)' : '`image` (image_picker)')
  if (links) settings.push('`cta_label` (text) + `cta_link` (url)')
  if (inputs) settings.push('form fields (the section ships a `/cart/add` or contact form — wire to the real endpoint)')

  if (svgs) refs.push("`{% render 'icon', icon: … %}` (inline SVG icons)")
  if (/\{%\s*render/.test(html)) refs.push('explicit `{% render %}` calls present in HTML — keep them')
  refs.push('section refs: none (in-page section)')

  if (productRef) objects.push('`product.{title, featured_image, selected_or_first_available_variant.{id,price,compare_at_price,available}, variants}`')
  if (collectionRef) objects.push('`collection.products` (grid/rail) or a metaobject list')
  if (priceRef && !productRef) objects.push('price/compare/discount → bind real variant data (honesty)')
  if (hasLiquid && !objects.length) objects.push('Liquid present — confirm bound objects at conversion')

  // blocks: a repeating list (>2 <li>) or a repeated card pattern → block type
  if (lis > 2) blocks.push(`\`item\` (icon? + label/text [+ image/link]) × {min:0, max:${Math.max(6, lis)}}  — one per <li>`)
  const repeatedCards = (html.match(/class="[a-z0-9_-]*__(card|tile|slide|col|item|cell|row)\b/gi) || []).length
  if (!lis && repeatedCards > 2) blocks.push(`\`card\` (repeating tile/slide/col) × {min:1, max:${Math.max(6, repeatedCards)}}`)

  // --- build the block ---
  const L = []
  L.push('\n## Schema contract')
  L.push('_AUTO-DRAFT (P1 task 2, derived from this card\'s HTML) — **stitch ratifies** setting names/types + block min/max before authoritative. Declares what the generated Liquid references so gate #14 (`check-render-wiring.mjs`) passes by construction._')
  L.push(`- **settings:** ${settings.join(', ')}`)
  L.push(`- **refs:** ${refs.join('; ')}`)
  L.push(`- **assigns/objects:** ${objects.length ? objects.join('; ') : 'none (static content via settings)'}`)
  L.push(`- **blocks:** ${blocks.length ? blocks.join('; ') : 'none (single instance)'}`)
  L.push('- **honesty (gate #13):** any rating/review/price/compare/discount/stock/countdown binds REAL store/provider data — never invented.')
  const block = L.join('\n') + '\n'

  if (/\n##\s+Variants/.test(body)) body = body.replace(/\n##\s+Variants/, block + '\n## Variants')
  else body = body.replace(/\s*$/, '\n' + block)
  if (!dry) fs.writeFileSync(p, body)
  added++
}
console.log(`${dry ? '[DRY] ' : ''}schema-contract drafts added=${added} · skipped (already had / no HTML)=${skipped}`)
