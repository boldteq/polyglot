#!/usr/bin/env node
// audit-library-content.mjs — DEEP content-completeness audit of the ecom component library.
// Complements verify-library-ingest.mjs (which checks structural integrity / cross-refs).
// This checks that every CARD and TEMPLATE was actually extracted with real content — not a stub.
//
// Per CARD: H1, "Category/Concept/Rung" header, Conversion job, non-empty ## HTML code block,
//           ## CSS, ## Responsive notes, and a stub heuristic (tiny file / empty code fences).
// Per CARD (advisory): the match-guidance enrichment line (Section family / Use when / Matches).
// Per TEMPLATE: H1, Slug/URL/Niche/Page type front-matter, ordered section table, pageType, Niche note.
// Cross-ref (advisory): every "Concept:" key referenced by a card resolves in _concept-section-map.json.
//
// Usage: node scripts/audit-library-content.mjs            # whole library
//        node scripts/audit-library-content.mjs --builder ecomposer
//        node scripts/audit-library-content.mjs --json
// Exit 0 = no hard failures (advisories allowed). Exit 1 = at least one card/template incomplete.

import fs from 'node:fs'
import path from 'node:path'

const LIB = path.join(process.env.HOME, '.claude/memory/design/ecom/component-library-premium')
const COMPONENTS = path.join(LIB, 'components')
const TEMPLATES = path.join(LIB, 'templates')
const MAP = path.join(LIB, '_concept-section-map.json')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const bi = argv.indexOf('--builder')
const builder = bi !== -1 ? argv[bi + 1] : null

const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return null } }
const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

// code-fence content for a given ## heading (```lang ... ```)
const fenceUnder = (body, heading) => {
  const re = new RegExp(`##\\s+${heading}\\b([\\s\\S]*?)(?=\\n##\\s|$)`, 'i')
  const sec = body.match(re)
  if (!sec) return null
  const fence = sec[1].match(/```[a-z]*\n([\s\S]*?)```/i)
  return fence ? fence[1].trim() : (sec[1].trim() ? '__no-fence-but-text__' : '')
}

// ---- gather cards ----
const cardFiles = []
if (isDir(COMPONENTS)) {
  for (const cat of fs.readdirSync(COMPONENTS).filter((d) => isDir(path.join(COMPONENTS, d)))) {
    for (const f of fs.readdirSync(path.join(COMPONENTS, cat))) {
      if (f.endsWith('.md') && f !== '_index.md' && f !== 'README.md') cardFiles.push(`${cat}/${f}`)
    }
  }
}

const cardDefects = [] // {card, issues:[]}
let enrichCovered = 0
let stubCount = 0
const conceptKeys = (() => { try { return new Set(Object.keys(JSON.parse(read(MAP)))) } catch { return new Set() } })()
const missingConcepts = new Set()

for (const rel of cardFiles) {
  const body = read(path.join(COMPONENTS, rel)) || ''
  const issues = []
  if (!/^#\s+\S/m.test(body)) issues.push('no H1 title')
  // Convention (post-Atrium-P0): header carries Category + Concept; rung lives in _concept-section-map.json, NOT on the card.
  if (!/\*\*Category:\*\*/.test(body) || !/\*\*Concept:\*\*/.test(body)) issues.push('missing Category/Concept header')
  if (/\*\*Category:\*\*[^\n]*\*\*Rung:\*\*/.test(body)) issues.push('C1 violation: **Rung:** on card header (rung belongs only in _concept-section-map.json)')
  if (!/\*\*Section family:\*\*/.test(body)) issues.push('no recall line (**Section family:** …)')
  if (!/##\s+Design-system bindings\b/.test(body)) issues.push('C2 violation: no ## Design-system bindings section')
  // Tailwind utilities appear as STANDALONE class tokens (class="flex items-center px-4").
  // Token-EXACT check so BEM names that merely contain "grid"/"flex" (svc-grid, pain-grid, track--grid) are NOT flagged.
  const UTIL_EXACT = new Set(['flex','grid','block','inline-flex','inline-block','w-full','h-full','text-center','text-left','text-right','items-center','items-start','items-end','justify-center','justify-between','justify-start','justify-end','flex-col','flex-row','flex-wrap','mx-auto'])
  const UTIL_RE = /^(?:px|py|pt|pb|pl|pr|mx|my|mt|mb|ml|mr|gap|space-x|space-y|w|h|text|bg|rounded|shadow)-(?:\d|sm|md|lg|xl|full|center)/
  let utilHit = false
  for (const cm2 of body.matchAll(/class="([^"]*)"/g)) {
    for (const tok of cm2[1].trim().split(/\s+/)) { if (UTIL_EXACT.has(tok) || UTIL_RE.test(tok)) { utilHit = true; break } }
    if (utilHit) break
  }
  if (utilHit) issues.push('C3 violation: Tailwind-shaped utility classes in HTML (use BEM/theme-native)')
  if (!/\*\*Conversion job:\*\*/i.test(body)) issues.push('no Conversion job')
  const html = fenceUnder(body, 'HTML')
  if (html === null) issues.push('no ## HTML section')
  else if (!html || html === '__no-fence-but-text__' || html.length < 40) { issues.push('## HTML empty/stub'); stubCount++ }
  if (!/##\s+CSS\b/i.test(body)) issues.push('no ## CSS section')
  if (!/##\s+Responsive notes\b/i.test(body)) issues.push('no ## Responsive notes')
  if (body.length < 600) issues.push(`suspiciously short (${body.length}b — possible stub)`)

  // advisory: enrichment line
  if (/\*\*Section family:\*\*/.test(body)) enrichCovered++

  // advisory: concept resolves in the map
  const cm = body.match(/\*\*Concept:\*\*\s*(?:NEW:\s*)?([a-z0-9-]+)/i)
  if (cm && conceptKeys.size && !conceptKeys.has(cm[1])) missingConcepts.add(`${rel} → ${cm[1]}`)

  if (issues.length) cardDefects.push({ card: rel, issues })
}

// ---- gather templates ----
let templateFiles = isDir(TEMPLATES) ? fs.readdirSync(TEMPLATES).filter((f) => f.endsWith('.md')) : []
if (builder) templateFiles = templateFiles.filter((f) => f.startsWith(`${builder}-`))

const tplDefects = []
for (const tf of templateFiles) {
  const body = read(path.join(TEMPLATES, tf)) || ''
  const issues = []
  if (!/^#\s+(Template —|Template:)/m.test(body) && !/^#\s+\S/m.test(body)) issues.push('no H1')
  if (!/\*\*Slug:\*\*/.test(body)) issues.push('no Slug')
  if (!/\*\*Page type:\*\*/i.test(body)) issues.push('no Page type')
  if (!/\*\*Niche:\*\*/i.test(body)) issues.push('no Niche')
  if (!/^\|\s*#\s*\|/m.test(body) && !/^\|\s*\d+\s*\|/m.test(body)) issues.push('no ordered section table')
  if (!/##\s+pageType\b/i.test(body)) issues.push('no ## pageType')
  if (!/##\s+Niche note\b/i.test(body)) issues.push('no ## Niche note')
  if (body.length < 500) issues.push(`suspiciously short (${body.length}b)`)
  if (issues.length) tplDefects.push({ template: tf, issues })
}

// ---- report ----
const hardFails = cardDefects.length + tplDefects.length
const summary = {
  cards_checked: cardFiles.length,
  cards_with_defects: cardDefects.length,
  stub_html: stubCount,
  templates_checked: templateFiles.length,
  templates_with_defects: tplDefects.length,
  enrichment_coverage: `${enrichCovered}/${cardFiles.length}`,
  concepts_unresolved: missingConcepts.size,
}

if (asJson) {
  console.log(JSON.stringify({ scope: builder || 'whole-library', summary, cardDefects, tplDefects, missingConcepts: [...missingConcepts] }, null, 2))
} else {
  console.log(`\nDeep content audit — scope: ${builder ? `builder=${builder}` : 'whole library'}`)
  console.log(`Cards: ${cardFiles.length} checked · ${cardDefects.length} with defects · ${stubCount} stub HTML`)
  console.log(`Templates: ${templateFiles.length} checked · ${tplDefects.length} with defects`)
  console.log(`Enrichment (Section family line): ${enrichCovered}/${cardFiles.length} cards`)
  console.log(`Concept cross-ref: ${missingConcepts.size} card concept(s) not in _concept-section-map.json\n`)
  if (cardDefects.length) {
    console.log('❌ CARD DEFECTS:')
    for (const d of cardDefects) console.log(`  - ${d.card}: ${d.issues.join('; ')}`)
    console.log('')
  }
  if (tplDefects.length) {
    console.log('❌ TEMPLATE DEFECTS:')
    for (const d of tplDefects) console.log(`  - ${d.template}: ${d.issues.join('; ')}`)
    console.log('')
  }
  if (missingConcepts.size) {
    console.log('⚠️  CONCEPTS NOT IN MAP (advisory — matcher won\'t find these):')
    for (const m of missingConcepts) console.log(`  - ${m}`)
    console.log('')
  }
  console.log(hardFails ? `❌ AUDIT FAIL — ${hardFails} item(s) incomplete` : `✅ AUDIT PASS — every card + template has full content`)
  console.log('')
}

process.exit(hardFails ? 1 : 0)
