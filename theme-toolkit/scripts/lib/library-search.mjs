// library-search — rank the pre-built Shopify section-card corpus for a given design intent
// so agents pick a LIBRARY-rung section instead of authoring BUILD-CUSTOM from scratch (P6 force-reuse).
//
// Corpus reality (checked 2026-08):
//   - ~/.claude/memory/design/ecom/component-library-premium/_registry.json — canonical {path → numeric id} map
//   - ~/.claude/memory/design/ecom/component-library-premium/components/*/*.md — 142 cards, markdown-metadata
//       header lines (NOT YAML front-matter):
//         # Title
//         **Category:** hero  ·  **Concept:** lifestyle-hero
//         **Section family:** Hero & Above-the-Fold · **Use when:** ... · **Matches section names:** a, b, c
//         **Niche compat:** exclude [haircare, supplements, ...] ...
//   - ~/.claude/memory/design/ecom/niche-dna-packs/*.json — each pack's canonical_components.list[] adds
//       niche-preferred archetype names ("lifestyle-hero", "ingredient-spotlight", …)
//
// Ranking weights (per P6 spec):
//   +10  exact archetype match (query.archetype == card concept OR category)
//   +6   near archetype match  (query.archetype tokens contained in card concept / matches / category)
//   +5   section_family match
//   +3   per unique must-have keyword found in card matches / tags / body signals
//   +2   card's niche affinity includes the queried niche (explicit include OR positive mention)
//   +5   card appears in the queried niche pack's canonical_components.list
//   HARD FILTER: card explicitly excludes the queried niche → dropped (score = -Infinity)
//
// Pure functions exported for fixtures. isMain guard for CLI.
// No external npm deps — node built-ins only. Missing corpus dirs degrade gracefully (empty result + stderr).

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import os from 'node:os'

// ─── corpus locations ─────────────────────────────────────────────────────────
const HOME = process.env.HOME || os.homedir()
export const DEFAULT_CORPUS_DIR = path.join(HOME, '.claude/memory/design/ecom/component-library-premium/components')
export const DEFAULT_REGISTRY_FILE = path.join(HOME, '.claude/memory/design/ecom/component-library-premium/_registry.json')
export const DEFAULT_NICHE_PACKS_DIR = path.join(HOME, '.claude/memory/design/ecom/niche-dna-packs')

// ─── PURE helpers ─────────────────────────────────────────────────────────────
const lower = (s) => String(s == null ? '' : s).toLowerCase()

// Normalise an archetype/concept/slug to a canonical shape: lowercase, hyphenated, no `.md`, no leading numbers.
export function normaliseSlug(s) {
  return lower(s).trim()
    .replace(/\.md$/, '')
    .replace(/^new:\s*/, '')
    .replace(/[_\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Split a slug into tokens (for token-overlap matching).
export function tokens(s) {
  return normaliseSlug(s).split('-').filter(Boolean)
}

// Are ALL query tokens present in the target's tokens? (order-independent)
function tokensSubset(queryTokens, targetTokens) {
  if (!queryTokens.length) return false
  const set = new Set(targetTokens)
  return queryTokens.every(t => set.has(t))
}

// Strip inline markdown emphasis/code so "**foo**" and "`foo`" match "foo".
function stripMd(s) {
  return String(s || '').replace(/[`*_~]/g, '')
}

// ─── PURE: parseCard ──────────────────────────────────────────────────────────
// Parse one card .md text → structured record. `sourcePath` is the path RELATIVE
// to the components/ dir (e.g. "hero/lifestyle-overlay-hero.md"); callers do the fs read.
// Returns { cardId, path, title, concept, category, sectionFamily, matches[], nicheInclude[], nicheExclude[], body }.
export function parseCard(mdText, sourcePath = '') {
  const text = String(mdText || '')
  const relPath = sourcePath.replace(/\\/g, '/')
  const slug = path.basename(relPath, '.md')
  const folder = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : ''

  const rec = {
    cardId: slug,
    path: relPath,
    title: '',
    concept: '',
    category: folder,       // folder is the ground-truth category; header may override
    sectionFamily: '',
    matches: [],            // "Matches section names:" comma-split — the closest thing to `tags`
    nicheInclude: [],       // parsed from "Niche compat: include [...]"
    nicheExclude: [],       // parsed from "Niche compat: exclude [...]"
    body: text,
  }

  // Title = first "# ..." line
  const titleM = text.match(/^#\s+(.+?)\s*$/m)
  if (titleM) rec.title = titleM[1].trim()

  // Header lines are `**Key:** value  ·  **Key2:** value2 …` — walk all bold-key spans.
  // Grab the raw first ~1.5KB (headers live at the very top) to keep this fast on long cards.
  const head = text.slice(0, 2000)

  // Category
  const catM = head.match(/\*\*Category:\*\*\s*([^\n·]+?)(?=\s*·|\s*\n|$)/i)
  if (catM) rec.category = stripMd(catM[1]).trim().toLowerCase() || rec.category

  // Concept (strip "NEW: " prefix that some cards use)
  const conM = head.match(/\*\*Concept:\*\*\s*([^\n·]+?)(?=\s*·|\s*\n|$)/i)
  if (conM) rec.concept = stripMd(conM[1]).trim().replace(/^NEW:\s*/i, '')

  // Section family
  const sfM = head.match(/\*\*Section family:\*\*\s*([^\n·]+?)(?=\s*·|\s*\n|$)/i)
  if (sfM) rec.sectionFamily = stripMd(sfM[1]).trim()

  // Matches section names → the closest thing to `tags[]`
  const mnM = head.match(/\*\*Matches section names:\*\*\s*([^\n·]+?)(?=\s*·|\s*\n|$)/i)
  if (mnM) {
    rec.matches = stripMd(mnM[1]).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  }

  // Niche compat: `exclude [a, b]` and/or `include [a, b]`
  const nichM = head.match(/\*\*Niche compat:\*\*\s*([^\n]+)/i)
  if (nichM) {
    const line = nichM[1]
    const exM = line.match(/exclude\s*\[([^\]]*)\]/i)
    if (exM) rec.nicheExclude = exM[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const inM = line.match(/include\s*\[([^\]]*)\]/i)
    if (inM) rec.nicheInclude = inM[1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  }

  return rec
}

// ─── PURE: loadCorpus ─────────────────────────────────────────────────────────
// Read every card into memory. Missing dirs → return { cards: [], warnings: [...] } (never throws).
// Registry (if present) is authoritative for which paths count as a card and their numeric ids.
export function loadCorpus({ corpusDir = DEFAULT_CORPUS_DIR, registryFile = DEFAULT_REGISTRY_FILE } = {}) {
  const warnings = []
  const cards = []

  if (!fs.existsSync(corpusDir)) {
    warnings.push(`corpus dir not found: ${corpusDir}`)
    return { cards, warnings, registry: null }
  }

  let registry = null
  if (fs.existsSync(registryFile)) {
    try {
      registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'))
    } catch (err) {
      warnings.push(`registry parse failed: ${err.message}`)
      registry = null
    }
  } else {
    warnings.push(`registry file not found (falling back to fs walk): ${registryFile}`)
  }

  // Prefer the registry's byPath (authoritative), fall back to a fs walk.
  let relPaths
  if (registry && registry.byPath && typeof registry.byPath === 'object') {
    relPaths = Object.keys(registry.byPath)
  } else {
    relPaths = []
    for (const folder of safeReaddir(corpusDir)) {
      const abs = path.join(corpusDir, folder)
      if (!isDir(abs)) continue
      for (const f of safeReaddir(abs)) {
        if (f.endsWith('.md') && !f.startsWith('_')) relPaths.push(`${folder}/${f}`)
      }
    }
  }

  for (const rel of relPaths) {
    const abs = path.join(corpusDir, rel)
    if (!fs.existsSync(abs)) {
      warnings.push(`registry references missing file: ${rel}`)
      continue
    }
    let md
    try { md = fs.readFileSync(abs, 'utf8') }
    catch (err) { warnings.push(`read failed: ${rel} — ${err.message}`); continue }
    const card = parseCard(md, rel)
    if (registry?.byPath?.[rel] != null) card.registryId = registry.byPath[rel]
    cards.push(card)
  }

  return { cards, warnings, registry }
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir) } catch { return [] }
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

// ─── PURE: loadNichePack ──────────────────────────────────────────────────────
// Returns { niche, canonical: [...] } or null if the pack is missing/unreadable.
// canonical is `canonical_components.list` from the pack (or []).
export function loadNichePack(niche, { packsDir = DEFAULT_NICHE_PACKS_DIR } = {}) {
  if (!niche) return null
  if (!fs.existsSync(packsDir)) return null
  const target = normaliseSlug(niche)

  // Try direct filename hit first (fast path).
  const direct = path.join(packsDir, `${target}.json`)
  const candidates = fs.existsSync(direct)
    ? [direct]
    : safeReaddir(packsDir)
        .filter(f => f.endsWith('.json') && !f.startsWith('_'))
        .filter(f => normaliseSlug(f.replace(/\.json$/, '')) === target)
        .map(f => path.join(packsDir, f))

  if (!candidates.length) return null
  try {
    const pack = JSON.parse(fs.readFileSync(candidates[0], 'utf8'))
    const list = pack?.canonical_components?.list
    return {
      niche: target,
      packName: pack?.niche || target,
      canonical: Array.isArray(list) ? list.map(String) : [],
    }
  } catch { return null }
}

// ─── PURE: scoreCard ──────────────────────────────────────────────────────────
// score = number, why = human-readable evidence rows.
// A card that explicitly excludes the queried niche returns { score: -Infinity } (hard-filtered).
export function scoreCard(card, query = {}, nichePack = null) {
  const why = []
  let score = 0

  const qArchetype = query.archetype ? normaliseSlug(query.archetype) : ''
  const qArchTokens = qArchetype ? tokens(qArchetype) : []
  const qSectionFamily = query.sectionFamily ? lower(query.sectionFamily).trim() : ''
  const qMustHave = Array.isArray(query.mustHave) ? query.mustHave.filter(Boolean) : []
  const qNiche = query.niche ? normaliseSlug(query.niche) : ''

  // ── hard filter: explicit niche exclusion drops the card ──
  if (qNiche && card.nicheExclude.map(normaliseSlug).includes(qNiche)) {
    return { score: -Infinity, why: [`hard-filter: card excludes niche "${qNiche}"`] }
  }

  // ── 1. archetype match ──
  if (qArchetype) {
    const cardConcept = normaliseSlug(card.concept)
    const cardCategory = normaliseSlug(card.category)
    const cardSlug = normaliseSlug(card.cardId)
    if (cardConcept === qArchetype || cardCategory === qArchetype || cardSlug === qArchetype) {
      score += 10
      why.push(`+10 archetype exact-match "${qArchetype}"`)
    } else {
      // Near match: query tokens are all present in the concept, category, matches, or slug tokens.
      const targetTokens = new Set([
        ...tokens(cardConcept),
        ...tokens(cardCategory),
        ...tokens(cardSlug),
        ...card.matches.flatMap(m => tokens(m)),
      ])
      if (tokensSubset(qArchTokens, [...targetTokens])) {
        score += 6
        why.push(`+6 archetype near-match (all "${qArchetype}" tokens present)`)
      }
    }
  }

  // ── 2. section_family match ──
  if (qSectionFamily && card.sectionFamily) {
    const cardSf = lower(card.sectionFamily)
    if (cardSf === qSectionFamily || cardSf.includes(qSectionFamily) || qSectionFamily.includes(cardSf)) {
      score += 5
      why.push(`+5 section_family match "${card.sectionFamily}"`)
    }
  }

  // ── 3. must-have keywords ──
  if (qMustHave.length) {
    // Search space: matches (tags), concept, category, title, first-1.5KB of body — case-insensitive substring.
    const haystackParts = [
      card.matches.join(' '),
      card.concept,
      card.category,
      card.title,
      card.body.slice(0, 1500),
    ]
    const haystack = lower(haystackParts.join('  '))
    const seen = new Set()
    for (const raw of qMustHave) {
      const kw = lower(raw).trim()
      if (!kw || seen.has(kw)) continue
      if (haystack.includes(kw)) {
        score += 3
        seen.add(kw)
        why.push(`+3 must-have "${raw}"`)
      }
    }
  }

  // ── 4. niche affinity ──
  if (qNiche) {
    const includes = card.nicheInclude.map(normaliseSlug)
    if (includes.includes(qNiche)) {
      score += 2
      why.push(`+2 niche affinity (explicit include)`)
    } else {
      // Fallback: niche name literally mentioned in matches/concept/title (positive mention).
      const nichHay = lower([card.matches.join(' '), card.concept, card.title].join(' '))
      if (nichHay.includes(qNiche)) {
        score += 2
        why.push(`+2 niche affinity (mentioned in matches/concept)`)
      }
    }
  }

  // ── 5. canonical_components mention in the niche pack ──
  if (nichePack && nichePack.canonical && nichePack.canonical.length) {
    const cardConcept = normaliseSlug(card.concept)
    const cardSlug = normaliseSlug(card.cardId)
    const matchTokens = card.matches.map(normaliseSlug)
    let hit = null
    for (const entry of nichePack.canonical) {
      const e = normaliseSlug(entry)
      if (!e) continue
      if (e === cardConcept || e === cardSlug || matchTokens.includes(e)) { hit = entry; break }
    }
    if (hit) {
      score += 5
      why.push(`+5 canonical for niche "${nichePack.niche}" (list entry "${hit}")`)
    }
  }

  return { score, why }
}

// ─── PURE: searchLibrary ──────────────────────────────────────────────────────
// Rank the corpus for one query. Returns [{ cardId, score, path, why }, ...] top N.
// opts lets callers inject pre-loaded corpus/nichePack for tests (fixtures don't hit disk).
export function searchLibrary(query = {}, opts = {}) {
  // Defensive: null / non-object query would crash on `.limit`/`.archetype` access below.
  // The default param only catches `undefined`, so `searchLibrary(null)` slips past it.
  // Normalise to {} so malformed input returns { results: [] } gracefully instead of throwing.
  if (query == null || typeof query !== 'object') query = {}
  const limit = Number.isFinite(query.limit) && query.limit > 0 ? Math.floor(query.limit) : 3

  const { cards, warnings } =
    opts.corpus
      ? { cards: opts.corpus, warnings: opts.warnings || [] }
      : loadCorpus({ corpusDir: opts.corpusDir, registryFile: opts.registryFile })

  const nichePack =
    opts.nichePack !== undefined
      ? opts.nichePack
      : (query.niche ? loadNichePack(query.niche, { packsDir: opts.packsDir }) : null)

  if (!cards.length) {
    return { results: [], warnings, nichePack, corpusSize: 0 }
  }

  const scored = []
  for (const card of cards) {
    const { score, why } = scoreCard(card, query, nichePack)
    if (score <= 0 || !Number.isFinite(score)) continue
    scored.push({ cardId: card.cardId, score, path: card.path, why })
  }
  scored.sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
  return {
    results: scored.slice(0, limit),
    warnings,
    nichePack: nichePack ? { niche: nichePack.niche, canonicalCount: nichePack.canonical.length } : null,
    corpusSize: cards.length,
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
function parseArgv(argv) {
  const out = { archetype: '', sectionFamily: '', mustHave: [], niche: '', limit: 3 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--archetype': out.archetype = next() || ''; break
      case '--section-family': out.sectionFamily = next() || ''; break
      case '--must-have': out.mustHave = (next() || '').split(',').map(s => s.trim()).filter(Boolean); break
      case '--niche': out.niche = next() || ''; break
      case '--limit': out.limit = Number(next()) || 3; break
      case '-h': case '--help': out._help = true; break
      default:
        if (a.startsWith('--')) process.stderr.write(`[library-search] unknown flag: ${a}\n`)
    }
  }
  return out
}

function printHelp() {
  process.stdout.write([
    'library-search — rank the pre-built Shopify section-card corpus for a design intent.',
    '',
    'Usage:',
    '  node lib/library-search.mjs --archetype <slug> [--section-family "<name>"]',
    '                              [--must-have "kw1,kw2"] [--niche <slug>] [--limit N]',
    '',
    'Example:',
    '  node lib/library-search.mjs --archetype hero-slideshow --niche haircare \\',
    '                              --must-have "pagination-dots,full-bleed"',
    '',
    'Writes JSON to ./gate-reports/library-search.json (creates the dir if needed).',
    '',
  ].join('\n'))
}

function humanRender(query, out) {
  const lines = []
  lines.push(`library-search — query: ${JSON.stringify(query)}`)
  if (out.nichePack) lines.push(`  niche pack: ${out.nichePack.niche} (${out.nichePack.canonicalCount} canonical entries)`)
  lines.push(`  corpus: ${out.corpusSize} cards`)
  for (const w of out.warnings) lines.push(`  warn: ${w}`)
  if (!out.results.length) {
    lines.push('  no matches (score > 0) — consider widening --archetype or dropping --must-have.')
  } else {
    lines.push(`  top ${out.results.length}:`)
    for (const r of out.results) {
      lines.push(`    - ${r.cardId}  (score ${r.score})  ${r.path}`)
      for (const w of r.why) lines.push(`        ${w}`)
    }
  }
  return lines.join('\n') + '\n'
}

async function runCli(argv) {
  const args = parseArgv(argv)
  if (args._help) { printHelp(); return 0 }
  if (!args.archetype && !args.sectionFamily && !args.mustHave.length) {
    process.stderr.write('[library-search] need at least one of: --archetype, --section-family, --must-have\n')
    printHelp()
    return 2
  }

  const query = {
    archetype: args.archetype,
    sectionFamily: args.sectionFamily,
    mustHave: args.mustHave,
    niche: args.niche,
    limit: args.limit,
  }
  const out = searchLibrary(query)
  process.stdout.write(humanRender(query, out))

  // Write JSON for the reuse-map gate to read. Fail soft — never break the CLI on report write.
  try {
    const reportDir = path.join(process.cwd(), 'gate-reports')
    fs.mkdirSync(reportDir, { recursive: true })
    const reportPath = path.join(reportDir, 'library-search.json')
    const payload = {
      generated_at: new Date().toISOString(),
      query,
      corpus_size: out.corpusSize,
      niche_pack: out.nichePack,
      warnings: out.warnings,
      results: out.results,
    }
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2))
    process.stdout.write(`wrote ${reportPath}\n`)
  } catch (err) {
    process.stderr.write(`[library-search] report write failed: ${err.message}\n`)
  }
  return 0
}

// isMain guard
const isMain = (() => {
  try { return url.fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1] || '') }
  catch { return false }
})()

if (isMain) {
  runCli(process.argv.slice(2)).then(code => process.exit(code)).catch(err => {
    process.stderr.write(`[library-search] fatal: ${err.stack || err.message}\n`)
    process.exit(1)
  })
}
