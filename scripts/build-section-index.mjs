#!/usr/bin/env node
// build-section-index.mjs — regenerate components/INDEX-BY-SECTION.md, a browsable
// "by section type" view of the whole component library: Section Family → Category → Cards.
// Reads _section-taxonomy.json (the family map) + each category's _index.md (card rows).
// Also reports coverage drift: category folders not assigned to any family, and families
// referencing categories that don't exist on disk.
//
// Usage: node scripts/build-section-index.mjs            # write the index
//        node scripts/build-section-index.mjs --check    # report drift only, write nothing (exit 1 on drift)

import fs from 'node:fs'
import path from 'node:path'

const LIB = path.join(process.env.HOME, '.claude/memory/design/ecom/component-library-premium')
const COMPONENTS = path.join(LIB, 'components')
const TAX = path.join(LIB, '_section-taxonomy.json')
const OUT = path.join(COMPONENTS, 'INDEX-BY-SECTION.md')
const checkOnly = process.argv.includes('--check')

const tax = JSON.parse(fs.readFileSync(TAX, 'utf8'))
const families = Object.entries(tax.families).sort((a, b) => (a[1].order || 99) - (b[1].order || 99))

const onDisk = fs.readdirSync(COMPONENTS).filter((d) => {
  try { return fs.statSync(path.join(COMPONENTS, d)).isDirectory() } catch { return false }
})

// --- coverage drift ---
const assigned = new Set()
for (const [, fam] of families) for (const c of fam.categories) assigned.add(c)
const unassigned = onDisk.filter((d) => !assigned.has(d))
const missing = [...assigned].filter((c) => !onDisk.includes(c))

// pull "| [Card](./x.md) | ... | conversion job |" rows from a category _index.md
const cardsOf = (cat) => {
  const idx = path.join(COMPONENTS, cat, '_index.md')
  let rows = []
  if (fs.existsSync(idx)) {
    for (const line of fs.readFileSync(idx, 'utf8').split('\n')) {
      const m = line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|(.*)\|\s*$/)
      if (!m) continue
      const name = m[1].trim()
      const href = m[2].trim()
      const lastCell = m[3].split('|').pop().trim() // conversion job is the last column
      rows.push({ name, href, job: lastCell })
    }
  }
  // fall back to raw files if _index has no parseable rows
  if (!rows.length) {
    try {
      rows = fs.readdirSync(path.join(COMPONENTS, cat))
        .filter((f) => f.endsWith('.md') && f !== '_index.md' && f !== 'README.md')
        .map((f) => ({ name: f.replace(/\.md$/, ''), href: `./${f}`, job: '' }))
    } catch { rows = [] }
  }
  return rows
}

const countCards = (cat) => {
  try { return fs.readdirSync(path.join(COMPONENTS, cat)).filter((f) => f.endsWith('.md') && f !== '_index.md' && f !== 'README.md').length }
  catch { return 0 }
}

if (checkOnly) {
  console.log(`Taxonomy coverage check — ${assigned.size} categories mapped across ${families.length} families`)
  if (unassigned.length) console.log(`\n❌ ${unassigned.length} category folder(s) NOT in any family (add to _section-taxonomy.json):\n  - ` + unassigned.join('\n  - '))
  if (missing.length) console.log(`\n⚠️  ${missing.length} family-listed categor(ies) have no folder on disk:\n  - ` + missing.join('\n  - '))
  if (!unassigned.length && !missing.length) console.log('✅ every category folder is in exactly one family; no drift')
  process.exit(unassigned.length ? 1 : 0)
}

// --- build the markdown ---
let totalCards = 0
let md = `# Component Library — Index by Section Type\n\n`
md += `> Browse the library by **what a section DOES**. Generated from \`_section-taxonomy.json\` + each category's \`_index.md\` — do not hand-edit; run \`node scripts/build-section-index.mjs\`. The by-PAGE view is in \`templates/\`.\n\n`
md += `**${families.length} section families · ${assigned.size} categories**\n\n`

// jump table
md += `| # | Section family | Categories | What it's for |\n|---|---|---|---|\n`
for (const [key, fam] of families) {
  md += `| ${fam.order} | [${fam.label}](#${fam.order}-${key}) | ${fam.categories.length} | ${fam.use_when.replace(/\n/g, ' ')} |\n`
}
md += `\n---\n\n`

for (const [key, fam] of families) {
  md += `## ${fam.order}. ${fam.label} {#${fam.order}-${key}}\n\n`
  md += `_${fam.purpose}_\n\n`
  md += `**Page position:** ${fam.page_position}  ·  **Use when:** ${fam.use_when}\n\n`
  for (const cat of fam.categories) {
    const n = countCards(cat)
    totalCards += n
    md += `### \`${cat}\` (${n})\n\n`
    const rows = cardsOf(cat)
    if (!rows.length) { md += `_no cards yet_\n\n`; continue }
    for (const r of rows) {
      const link = `components/${cat}/${path.basename(r.href)}`
      md += `- [${r.name}](${link})${r.job ? ` — ${r.job}` : ''}\n`
    }
    md += `\n`
  }
  md += `\n`
}

if (unassigned.length) md += `\n> ⚠️ **Unmapped categories** (not in any family — fix \`_section-taxonomy.json\`): ${unassigned.join(', ')}\n`

fs.writeFileSync(OUT, md)
console.log(`✅ wrote ${OUT}`)
console.log(`   ${families.length} families · ${assigned.size} categories · ${totalCards} cards`)
if (unassigned.length) console.log(`   ⚠️  ${unassigned.length} unmapped categories: ${unassigned.join(', ')}`)
if (missing.length) console.log(`   ⚠️  ${missing.length} family-listed categories missing on disk: ${missing.join(', ')}`)
process.exit(0)
