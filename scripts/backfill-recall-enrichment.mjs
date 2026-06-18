#!/usr/bin/env node
// backfill-recall-enrichment.mjs — add the recall match-guidance line to every CARD that lacks it,
// and backfill Slug/pageType on legacy TEMPLATE records. Deterministic + idempotent (safe to re-run).
//
// Card line inserted right after the "**Category:** · **Concept:** · **Rung:**" header:
//   **Section family:** <family from _section-taxonomy.json> · **Use when:** <1st sentence of Conversion job> · **Matches section names:** <aliases from title/concept/category>
// Template backfill: legacy records missing **Slug:** get one (derived from filename); missing ## pageType
//   get a one-line section derived from the filename suffix (pdp/landing/subscription).
//
// Usage: node scripts/backfill-recall-enrichment.mjs            # apply
//        node scripts/backfill-recall-enrichment.mjs --dry      # report what would change, write nothing

import fs from 'node:fs'
import path from 'node:path'

const LIB = path.join(process.env.HOME, '.claude/memory/design/ecom/component-library-premium')
const COMPONENTS = path.join(LIB, 'components')
const TEMPLATES = path.join(LIB, 'templates')
const TAX = path.join(LIB, '_section-taxonomy.json')
const dry = process.argv.includes('--dry')

// category -> family label
const tax = JSON.parse(fs.readFileSync(TAX, 'utf8'))
const famOf = {}
for (const [, fam] of Object.entries(tax.families)) for (const c of fam.categories) famOf[c] = fam.label

const STOP = new Set(['the','a','an','and','or','of','for','with','to','in','on','your','our','this','that','is','it','by','as','at','from','grid','card','block','section','row','bar','list'])
const aliasesFrom = (title, concept, category) => {
  const out = new Set()
  if (concept) out.add(concept.replace(/-/g, ' '))
  if (category) out.add(category.replace(/-/g, ' '))
  const titleWords = (title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))
  if (titleWords.length) out.add(titleWords.slice(0, 4).join(' '))
  return [...out].filter(Boolean).slice(0, 5).join(', ')
}

let cardsEnriched = 0, cardsSkipped = 0, cardsNoHeader = 0
const catDirs = fs.readdirSync(COMPONENTS).filter((d) => { try { return fs.statSync(path.join(COMPONENTS, d)).isDirectory() } catch { return false } })
for (const cat of catDirs) {
  const fam = famOf[cat] || 'Logistics & Chrome'
  for (const f of fs.readdirSync(path.join(COMPONENTS, cat))) {
    if (!f.endsWith('.md') || f === '_index.md' || f === 'README.md') continue
    const p = path.join(COMPONENTS, cat, f)
    let body = fs.readFileSync(p, 'utf8')
    if (/\*\*Section family:\*\*/.test(body)) { cardsSkipped++; continue }
    // header line carries both Category and Rung
    const lines = body.split('\n')
    const hi = lines.findIndex((l) => l.includes('**Category:**') && l.includes('**Rung:**'))
    if (hi === -1) { cardsNoHeader++; continue }
    const title = (body.match(/^#\s+(.+)$/m) || [])[1] || ''
    const concept = (body.match(/\*\*Concept:\*\*\s*(?:NEW:\s*)?([a-z0-9-]+)/i) || [])[1] || ''
    // first sentence of Conversion job
    let useWhen = ''
    const cj = body.match(/\*\*Conversion job:\*\*\s*([\s\S]*?)(?:\n\n|\n##|\n\*\*Source)/i)
    if (cj) { useWhen = cj[1].replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0]; if (useWhen.length > 160) useWhen = useWhen.slice(0, 157).trim() + '…' }
    if (!useWhen) useWhen = `Use in the ${fam} part of the page.`
    const matches = aliasesFrom(title, concept, cat)
    const line = `**Section family:** ${fam} · **Use when:** ${useWhen} · **Matches section names:** ${matches}`
    lines.splice(hi + 1, 0, line)
    body = lines.join('\n')
    if (!dry) fs.writeFileSync(p, body)
    cardsEnriched++
  }
}

// ---- legacy templates: Slug + pageType backfill ----
let tplSlug = 0, tplPageType = 0, tplPageTypeField = 0, tplNiche = 0
const pageTypeFromName = (n) => {
  if (/-subscription-/.test(n) || /-subscription$/.test(n)) return 'SUBSCRIPTION-LANDING'
  if (/-landing$/.test(n)) return 'LANDING'
  if (/-pdp$/.test(n)) return 'PDP'
  if (/-homepage$/.test(n)) return 'HOMEPAGE'
  return 'PDP'
}
for (const f of fs.readdirSync(TEMPLATES).filter((x) => x.endsWith('.md'))) {
  const p = path.join(TEMPLATES, f)
  let body = fs.readFileSync(p, 'utf8')
  let changed = false
  const slug = f.replace(/\.md$/, '')
  const pt = pageTypeFromName(slug)
  if (!/\*\*Slug:\*\*/.test(body)) {
    // insert after H1
    body = body.replace(/^(#\s+.+\n)/, `$1\n**Slug:** ${slug}\n`)
    tplSlug++; changed = true
  }
  if (!/\*\*Page type:\*\*/i.test(body)) {
    // insert after the Slug line if present, else after H1
    if (/\*\*Slug:\*\*.*\n/.test(body)) body = body.replace(/(\*\*Slug:\*\*.*\n)/, `$1**Page type:** ${pt}\n`)
    else body = body.replace(/^(#\s+.+\n)/, `$1\n**Page type:** ${pt}\n`)
    tplPageTypeField = tplPageTypeField + 1; changed = true
  }
  if (!/##\s+pageType\b/i.test(body)) {
    body = body.replace(/\s*$/, `\n\n## pageType\n${pt} — backfilled from record slug; see the ordered section list above for the page's conversion spine.\n`)
    tplPageType++; changed = true
  }
  if (!/##\s+Niche note\b/i.test(body)) {
    body = body.replace(/\s*$/, `\n\n## Niche note\nNiche structure banked. Taste/DNA status tracked centrally in components/_index.md ("New niches surfaced"); apply the closest existing DNA pack and escalate niche-specific taste to Yash.\n`)
    tplNiche = tplNiche + 1; changed = true
  }
  if (changed && !dry) fs.writeFileSync(p, body)
}

console.log(`${dry ? '[DRY RUN] ' : ''}Cards: ${cardsEnriched} enriched, ${cardsSkipped} already had the line, ${cardsNoHeader} no header (skipped)`)
console.log(`${dry ? '[DRY RUN] ' : ''}Templates: ${tplSlug} got Slug, ${tplPageTypeField || 0} got **Page type:**, ${tplPageType} got ## pageType, ${tplNiche || 0} got ## Niche note`)
