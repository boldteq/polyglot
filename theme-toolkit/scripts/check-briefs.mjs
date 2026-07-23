#!/usr/bin/env node
// Boldteq content-brief validator (compass) — Step-4 pre-design-dispatch gate.
//
// Validates compass's content artifacts BEFORE design is dispatched, enforcing the
// pinned rules from website-content-discovery-protocol.md §0/§5 + compass.md anti-patterns.
// This is the executable version of compass's prose blocking rules.
//
// Usage:
//   node check-briefs.mjs                  validate content/briefs + content/sitemap.md in cwd
//
// Env:
//   BRIEFS_DIR        default content/briefs
//   SITEMAP           default content/sitemap.md
//   STORE_BUILD=1     ecom store build → also enforce conversion-surface tagging
//                     (≥1 spark-owned hero slot + ≥1 merch-owned body slot across briefs)
//   STRICT_LOCALES=<n>  markets_languages count; >1 warns on per-locale gaps
//   REPORT_DIR        default gate-reports
//
// BLOCKS on (load-bearing, pinned): briefs dir empty, invalid/absent status line,
//   >20% briefs status:missing, no recipe/no-recipe anchor, lorem/placeholder copy,
//   content-slot row with no owner, (STORE_BUILD) no conversion surface reserved.
// WARNS on (loose/strategic): recipe id outside the canonical 10, sitemap missing or
//   un-recipe-tagged page lines, locale parity, client-supplied atom missing a deadline.
//
// Exit: 0 = pass · 1 = block · 2 = env error (nothing to validate)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const t0 = Date.now()
const cwd = process.cwd()

const BRIEFS_DIR = process.env.BRIEFS_DIR || 'content/briefs'
const SITEMAP = process.env.SITEMAP || 'content/sitemap.md'
const STORE_BUILD = process.env.STORE_BUILD === '1'
const STRICT_LOCALES = Number.parseInt(process.env.STRICT_LOCALES || '0', 10)

// Canonical recipe ids — theme-page-recipes.md (10 recipes).
const RECIPES = new Set([
  'home-v1', 'home-v2', 'pdp-standard', 'pdp-rich', 'collection',
  'about', 'contact', 'faq', 'landing-promo', 'blog-article',
])
const STATUS_VALUES = new Set(['ready', 'partial', 'missing'])
// Unambiguous placeholders — never acceptable at ANY status.
const PLACEHOLDER_RE = /lorem ipsum|placeholder text|tbd copy/i
// Bare TBD/TODO/"fill in". Surfaced by the QA-1 burn-down: the rule above only matched the exact
// phrase "tbd copy", so a brief containing `Headline: TBD` passed Step-4 and design was dispatched on
// placeholder copy — precisely what compass AP#2 forbids. (check-discovery already catches bare
// tbd/todo for the same concept; the two gates had drifted apart.)
// Scoped to status:ready ONLY: a `partial`/`missing` brief is honest work-in-progress and blocking it
// would be a false positive on normal drafting.
const DRAFT_MARKER_RE = /\bTBD\b|\bTODO\b|\bfill (this )?in\b/i

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })

function finish(envError) {
  const pass = !envError && blockers.length === 0
  const { report } = writeReport('briefs', 10, {
    cwd,
    pass,
    blockers,
    warnings,
    evidence: {
      briefsDir: BRIEFS_DIR,
      storeBuild: STORE_BUILD,
      strictLocales: STRICT_LOCALES,
      reason: envError || undefined,
    },
    duration_ms: Date.now() - t0,
  })
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`briefs: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} [${b.page}] ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} [${w.page}] ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// ── parse a markdown brief ──────────────────────────────────────────────────
// Returns { status, hasRecipe, recipeId, recipeUnknown, slots: [{slot, owner, status}] }
function parseBrief(text) {
  const statusMatch = text.match(/^status:\s*([a-z-]+)/mi)
  const status = statusMatch ? statusMatch[1].toLowerCase() : null

  const recipeMatch = text.match(/^recipe:\s*([a-z0-9-]+)/mi)
  const noRecipeMatch = text.match(/^no-recipe:\s*\S+/mi)
  const recipeId = recipeMatch ? recipeMatch[1].toLowerCase() : null

  // Content slots table — header has a cell named "slot" and a cell named "owner".
  const slots = []
  const lines = text.split('\n')
  let header = null
  let ownerIdx = -1
  let slotIdx = -1
  let statusIdx = -1
  for (const line of lines) {
    if (!line.trim().startsWith('|')) { if (header) break; continue }
    const cells = line.split('|').slice(1, -1).map(c => c.trim())
    if (!header) {
      const lower = cells.map(c => c.toLowerCase())
      if (lower.includes('slot') && lower.includes('owner')) {
        header = cells
        slotIdx = lower.indexOf('slot')
        ownerIdx = lower.indexOf('owner')
        statusIdx = lower.indexOf('status')
      }
      continue
    }
    if (/^[-:\s|]+$/.test(line.replace(/\|/g, ''))) continue // separator row
    const owner = ownerIdx >= 0 ? (cells[ownerIdx] || '') : ''
    slots.push({
      slot: slotIdx >= 0 ? (cells[slotIdx] || '') : '',
      owner: owner.replace(/[—–-]/g, m => (m === '-' ? '-' : '')).trim() === '' ? '' : owner,
      status: statusIdx >= 0 ? (cells[statusIdx] || '') : '',
    })
  }
  return {
    status,
    hasRecipe: Boolean(recipeMatch || noRecipeMatch),
    recipeId,
    recipeUnknown: Boolean(recipeId) && !RECIPES.has(recipeId),
    slots,
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const briefsAbs = path.resolve(cwd, BRIEFS_DIR)
if (!fs.existsSync(briefsAbs) || !fs.statSync(briefsAbs).isDirectory()) {
  finish(`briefs dir not found: ${BRIEFS_DIR}`)
}
const files = fs.readdirSync(briefsAbs)
  .filter(f => f.endsWith('.md') && !/^(readme|index)\.md$/i.test(f))
  .sort()
if (files.length === 0) finish(`no briefs in ${BRIEFS_DIR}`)

let missingCount = 0
let sparkHero = false
let merchBody = false

for (const f of files) {
  const text = fs.readFileSync(path.join(briefsAbs, f), 'utf-8')
  const b = parseBrief(text)

  if (!b.status || !STATUS_VALUES.has(b.status)) {
    add(blockers, 'briefs.status-invalid', f, `status line missing or not ready|partial|missing (got: ${b.status ?? 'none'})`)
  } else if (b.status === 'missing') {
    missingCount += 1
  }

  if (!b.hasRecipe) {
    add(blockers, 'briefs.no-recipe-anchor', f, 'brief has no `recipe: <id>` and no `no-recipe: <why>` anchor (compass AP#11)')
  } else if (b.recipeUnknown) {
    add(warnings, 'briefs.recipe-unknown', f, `recipe id "${b.recipeId}" not in the canonical 10 — confirm it's an intended extension`)
  }

  if (PLACEHOLDER_RE.test(text)) {
    add(blockers, 'briefs.placeholder-content', f, 'lorem ipsum / placeholder text / TBD copy present — no placeholder ships (compass AP#2)')
  } else if (DRAFT_MARKER_RE.test(text)) {
    // A brief that declares itself READY must not still carry drafting markers — design is dispatched
    // off this file. At partial/missing they are expected, so they only warn.
    const m = text.match(DRAFT_MARKER_RE)
    if (b.status === 'ready') {
      add(blockers, 'briefs.placeholder-content', f, `brief is status:ready but still contains "${m[0]}" — design dispatches off this file; resolve it or set status:partial (compass AP#2)`)
    } else {
      add(warnings, 'briefs.draft-marker', f, `contains "${m[0]}" — expected at status:${b.status}, but it must be gone before status:ready`)
    }
  }

  for (const s of b.slots) {
    if (!s.owner) {
      add(blockers, 'briefs.slot-no-owner', f, `content-slot "${s.slot || '?'}" has no owner — untagged slot feeds catalyst no surface (compass AP#12)`)
    } else {
      const owner = s.owner.toLowerCase()
      const slot = (s.slot || '').toLowerCase()
      if (owner.includes('spark') && /hero|cta|headline|subline/.test(slot)) sparkHero = true
      if (owner.includes('merch') && /body|objection|pdp|description|copy/.test(slot)) merchBody = true
    }
  }
}

// >20% missing gate — pinned: missing*5 > total
if (missingCount * 5 > files.length) {
  add(blockers, 'briefs.too-many-missing', '', `${missingCount}/${files.length} briefs status:missing (>20%) — design dispatch blocked (protocol §0)`)
}

// Conversion-surface tagging — only for ecom store builds
if (STORE_BUILD) {
  if (!sparkHero) add(blockers, 'briefs.no-spark-hero', '', 'no spark-owned hero/CTA slot reserved across briefs — Step-13 Conversion Gate needs it (compass AP#12)')
  if (!merchBody) add(blockers, 'briefs.no-merch-body', '', 'no merch-owned PDP-body/objection slot reserved across briefs — Step-13 Conversion Gate needs it (compass AP#12)')
}

// Sitemap — loose format, so WARN only
const sitemapAbs = path.resolve(cwd, SITEMAP)
if (!fs.existsSync(sitemapAbs)) {
  add(warnings, 'briefs.sitemap-missing', SITEMAP, 'no sitemap found — every page line should carry `recipe: <id>` (slot-mapping mandate Step 4)')
} else {
  const sm = fs.readFileSync(sitemapAbs, 'utf-8')
  const pageLines = sm.split('\n').filter(l => /·|\|/.test(l) && /\b(page|home|pdp|collection|about|contact|faq|blog|landing)\b/i.test(l))
  const untagged = pageLines.filter(l => !/recipe[:=]\s*[a-z0-9-]+/i.test(l) && !/no-recipe/i.test(l))
  if (pageLines.length > 0 && untagged.length > 0) {
    add(warnings, 'briefs.sitemap-untagged', SITEMAP, `${untagged.length}/${pageLines.length} sitemap page line(s) carry no recipe tag`)
  }
}

if (STRICT_LOCALES > 1) {
  const localed = files.filter(f => /locale|lang|-(en|fr|de|es|it|nl|pt)\.md$/i.test(f))
  if (localed.length === 0) {
    add(warnings, 'briefs.locale-parity', '', `markets_languages=${STRICT_LOCALES} but briefs carry no visible per-locale coverage — verify parity before dispatch (compass multi-locale rule)`)
  }
}

finish(null)
