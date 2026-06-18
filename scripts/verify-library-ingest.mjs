#!/usr/bin/env node
// verify-library-ingest.mjs — read-only integrity gate for the ecom component library
// (~/.claude/memory/design/ecom/component-library-premium). Runs the same checks a
// batch-ingest workflow's Verify stage runs, but standalone + deterministic, so a batch
// is never left unverified when a long workflow run dies before its Verify stage.
//
// Usage:
//   node scripts/verify-library-ingest.mjs                 # whole library
//   node scripts/verify-library-ingest.mjs --builder ecomposer   # scope template/log checks to one builder prefix
//   node scripts/verify-library-ingest.mjs --json          # machine-readable output
//
// Exit 0 = all PASS (WARN allowed). Exit 1 = one or more FAIL. Read-only — never writes.

import fs from 'node:fs'
import path from 'node:path'

const LIB = path.join(process.env.HOME, '.claude/memory/design/ecom/component-library-premium')
const COMPONENTS = path.join(LIB, 'components')
const TEMPLATES = path.join(LIB, 'templates')
const MAP = path.join(LIB, '_concept-section-map.json')
const LOG = path.join(COMPONENTS, '_templates-ingested.md')

const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const bi = argv.indexOf('--builder')
const builder = bi !== -1 ? argv[bi + 1] : null // e.g. "ecomposer" → scope to templates/ecomposer-*.md

const results = [] // { name, status: 'PASS'|'FAIL'|'WARN', detail }
const add = (name, status, detail) => results.push({ name, status, detail })

const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return null } }
const isDir = (p) => { try { return fs.statSync(p).isDirectory() } catch { return false } }

// --- enumerate the library ---
const categoryDirs = fs.existsSync(COMPONENTS)
  ? fs.readdirSync(COMPONENTS).filter((d) => isDir(path.join(COMPONENTS, d)))
  : []

const cardsByDir = {} // dir -> [cardBasename.md]
const allCardPaths = new Set() // "cat/card.md"
for (const dir of categoryDirs) {
  const cards = fs.readdirSync(path.join(COMPONENTS, dir))
    .filter((f) => f.endsWith('.md') && f !== '_index.md' && f !== 'README.md')
  cardsByDir[dir] = cards
  for (const c of cards) allCardPaths.add(`${dir}/${c}`)
}

const allTemplateFiles = fs.existsSync(TEMPLATES)
  ? fs.readdirSync(TEMPLATES).filter((f) => f.endsWith('.md'))
  : []
const templateFiles = builder
  ? allTemplateFiles.filter((f) => f.startsWith(`${builder}-`))
  : allTemplateFiles

// ============ CHECK 1: concept-map JSON valid + _meta + $schema_version ============
{
  const raw = read(MAP)
  if (raw == null) {
    add('JSON valid', 'FAIL', `${MAP} not found`)
  } else {
    try {
      const j = JSON.parse(raw)
      const hasMeta = '_meta' in j
      const hasVer = '$schema_version' in j
      const keys = Object.keys(j).filter((k) => !k.startsWith('_') && !k.startsWith('$')).length
      if (!hasMeta || !hasVer) add('JSON valid', 'FAIL', `parses but missing ${!hasMeta ? '_meta ' : ''}${!hasVer ? '$schema_version' : ''}`)
      else add('JSON valid', 'PASS', `parses; _meta + $schema_version intact; ${keys} concepts`)
    } catch (e) {
      add('JSON valid', 'FAIL', `JSON.parse error: ${e.message}`)
    }
  }
}

// ============ CHECK 2: dangling refs — every `cat/card.md` cited in a template resolves ============
{
  const dangling = []
  const refRe = /`([a-z0-9-]+\/[a-z0-9-]+\.md)`/g
  for (const tf of templateFiles) {
    const body = read(path.join(TEMPLATES, tf)) || ''
    const seen = new Set()
    let m
    while ((m = refRe.exec(body))) {
      const ref = m[1]
      if (seen.has(ref)) continue
      seen.add(ref)
      if (!allCardPaths.has(ref)) dangling.push(`${ref}  (in ${tf})`)
    }
  }
  if (dangling.length) add('Dangling refs', 'FAIL', `${dangling.length} backtick path(s) do not resolve on disk:\n      - ` + dangling.join('\n      - '))
  else add('Dangling refs', 'PASS', `all backtick component paths in ${templateFiles.length} template record(s) resolve`)
}

// ============ CHECK 3: orphan cards — every card is listed in its category _index.md ============
{
  const orphans = []
  const noIndex = []
  for (const dir of categoryDirs) {
    const cards = cardsByDir[dir]
    if (!cards.length) continue
    const idx = read(path.join(COMPONENTS, dir, '_index.md'))
    if (idx == null) { noIndex.push(`${dir}/ (${cards.length} card(s), no _index.md)`); continue }
    for (const c of cards) if (!idx.includes(c)) orphans.push(`${dir}/${c}`)
  }
  if (orphans.length || noIndex.length) {
    const parts = []
    if (orphans.length) parts.push(`${orphans.length} card(s) not in their _index.md: ` + orphans.join(', '))
    if (noIndex.length) parts.push(`${noIndex.length} dir(s) missing _index.md: ` + noIndex.join(', '))
    add('Orphan cards', 'FAIL', parts.join(' | '))
  } else add('Orphan cards', 'PASS', `every card across ${categoryDirs.length} categories is indexed`)
}

// ============ CHECK 4: duplicate card basenames across folders (multi-run debris) ============
{
  const byBase = {}
  for (const ref of allCardPaths) {
    const base = ref.split('/')[1]
    ;(byBase[base] ||= []).push(ref)
  }
  const dups = Object.entries(byBase).filter(([, paths]) => paths.length > 1)
  if (dups.length) add('No dup cards', 'FAIL', `${dups.length} card name(s) exist in >1 folder:\n      - ` + dups.map(([b, p]) => `${b}: ${p.join(' , ')}`).join('\n      - '))
  else add('No dup cards', 'PASS', `${allCardPaths.size} card files, all basenames unique across folders`)
}

// ============ CHECK 5: ingest-log coverage — each template record has a log row ============
{
  const log = read(LOG)
  if (log == null) add('Ingest log', 'FAIL', `${LOG} not found`)
  else {
    const missing = templateFiles.map((f) => f.replace(/\.md$/, '')).filter((slug) => !log.includes(slug))
    if (missing.length) add('Ingest log', 'WARN', `${missing.length} template(s) have no log mention: ` + missing.join(', '))
    else add('Ingest log', 'PASS', `all ${templateFiles.length} template record(s) appear in _templates-ingested.md`)
  }
}

// ============ CHECK 6: dedup collapse — near-identical slug families (-v2/-v3/...) have no own record ============
{
  // a "-vN" template file existing on disk means a collapsed sibling was given its own record (should not happen)
  const versioned = templateFiles.filter((f) => /-v\d+\.md$/.test(f))
  if (versioned.length) add('Dedup collapse', 'FAIL', `${versioned.length} collapsed-sibling record(s) exist as own files (should be folded into canonical): ` + versioned.join(', '))
  else add('Dedup collapse', 'PASS', `no -vN sibling records on disk (dedup families collapsed to canonical)`)
}

// ============ CHECK 7: honesty heuristic (WARN) — risk cards should carry a binding note ============
{
  // Only TRUE dark-pattern structures that MUST bind real data — not incidental copy mentions of % / award / discount.
  const RISK = /countdown|count-?down|scarcity|sold[- ]?out|only \d+ left|in stock: \d|people (are )?viewing|live[- ]?viewer|compare[- ]?at|installment|\bbnpl\b|voted #?1|\d{2,3}% (satisfaction|of (customers|users|buyers)|recommend)|\b\d[\d,]*\+? (reviews|customers|sold)\b/i
  const HONEST = /honest|bind (a )?real|real (store|provider|product|inventory|price|rating|review|concurrency|survey)|never (invent|fake)|or be omitted|or omit|native [\w/-]+ (section|field)|review-app field|compare-at .*(native|real|metafield)|metafield/i
  // When --builder is set, only check cards the in-scope templates actually reference (keeps per-batch runs focused);
  // a whole-library run scans every card.
  let scope = allCardPaths
  if (builder) {
    const refRe2 = /`([a-z0-9-]+\/[a-z0-9-]+\.md)`/g
    const referenced = new Set()
    for (const tf of templateFiles) {
      const body = read(path.join(TEMPLATES, tf)) || ''
      let m
      while ((m = refRe2.exec(body))) if (allCardPaths.has(m[1])) referenced.add(m[1])
    }
    scope = referenced
  }
  const flagged = []
  for (const ref of scope) {
    const body = read(path.join(COMPONENTS, ref)) || ''
    if (RISK.test(body) && !HONEST.test(body)) flagged.push(ref)
  }
  if (flagged.length) add('Honesty notes', 'WARN', `${flagged.length} risk-bearing card(s)${builder ? ` referenced by ${builder} templates` : ''} lack an explicit real-data-binding note (review manually):\n      - ` + flagged.join('\n      - '))
  else add('Honesty notes', 'PASS', `every in-scope risk-bearing card carries a real-data-binding / honest-by-construction note`)
}

// ============ CHECK 8: claim accuracy (WARN) — no known-false milestone wording ============
{
  const idx = read(path.join(COMPONENTS, '_index.md')) || ''
  const badClaims = []
  if (/first non-GemPages ingest/i.test(idx)) badClaims.push('"first non-GemPages ingest" (false — Replo + EComposer assets predate)')
  if (/all prior templates were GemPages/i.test(idx)) badClaims.push('"all prior templates were GemPages" (false)')
  if (badClaims.length) add('Claim accuracy', 'WARN', `overstated wording in components/_index.md: ` + badClaims.join(' ; '))
  else add('Claim accuracy', 'PASS', `no known-false milestone wording in components/_index.md`)
}

// --- report ---
const fails = results.filter((r) => r.status === 'FAIL')
const warns = results.filter((r) => r.status === 'WARN')

if (asJson) {
  console.log(JSON.stringify({ scope: builder || 'whole-library', results, fail: fails.length, warn: warns.length }, null, 2))
} else {
  const icon = { PASS: '✅', FAIL: '❌', WARN: '⚠️ ' }
  console.log(`\nLibrary integrity gate — scope: ${builder ? `builder=${builder}` : 'whole library'}  (${templateFiles.length} template records, ${allCardPaths.size} cards)\n`)
  for (const r of results) console.log(`${icon[r.status]} ${r.name.padEnd(16)} ${r.detail}`)
  console.log(`\n${fails.length ? '❌ GATE FAIL' : '✅ GATE PASS'} — ${fails.length} fail, ${warns.length} warn, ${results.length - fails.length - warns.length} pass\n`)
}

process.exit(fails.length ? 1 : 0)
