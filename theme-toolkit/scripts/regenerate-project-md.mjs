#!/usr/bin/env node
// regenerate-project-md — the ONE human-scannable project status page (2026-08-25).
//
// Client repos have grown ~9 contract files (docs/brief.md, docs/design/*.json, section-reuse-map.md,
// build-state.json, CHANGES.md, gate-reports/*.json). None of them, read alone, answers Yash's daily
// question: "which page came from where, what's the mode, what's still open?". This script
// consolidates all of them into docs/project.md — auto-derived on every maestro-build run, never
// hand-edited. Missing sources gracefully collapse to "not yet declared" instead of crashing, so a
// fresh repo produces a valid (if mostly-empty) project.md on day one.
//
// Run from the CLIENT REPO ROOT:
//   node toolkit/scripts/regenerate-project-md.mjs           # write docs/project.md
//   node toolkit/scripts/regenerate-project-md.mjs --dry-run # print to stdout, no write
//
// Exit: 0 = wrote/printed the file · 1 = a truly unexpected fs error (all input files are optional).

import fs from 'node:fs'
import path from 'node:path'
import { isMain } from './lib/is-main.mjs'

const cwd = process.cwd()
const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run') || args.has('-n')

const NOT_DECLARED = '_not yet declared_'

// ── safe fs helpers ────────────────────────────────────────────────────────
// Every read is optional. A missing / unparsable file must never crash the run — it degrades to a
// "not yet declared" section so a brand-new repo still renders a valid project.md on day one.
function readTextSafe(rel) {
  const abs = path.join(cwd, rel)
  if (!fs.existsSync(abs)) return null
  try { return fs.readFileSync(abs, 'utf-8') } catch { return null }
}
function readJsonSafe(rel) {
  const raw = readTextSafe(rel)
  if (raw == null) return null
  // strip /* … */ comments (design-system.json occasionally carries authoring notes)
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  try { return JSON.parse(stripped) } catch { return null }
}

// ── brief.md parsers ───────────────────────────────────────────────────────
// The brief is authored freehand; we only extract three fields defensively. Any missing → null.
function parseBrief(md) {
  if (!md) return { brand: null, niche: null, mustHaves: [] }
  const brand =
    matchLineValue(md, /^\s*(?:-\s*)?\*{0,2}brand\*{0,2}\s*[:\-]\s*(.+)$/im) ||
    matchFirstH1(md) ||
    null
  const niche = matchLineValue(md, /^\s*(?:-\s*)?\*{0,2}niche\*{0,2}\s*[:\-]\s*(.+)$/im)
  const mustHaves = extractSectionList(md, /must[-\s]?haves?/i)
  return { brand, niche, mustHaves }
}
function matchLineValue(text, re) {
  const m = text.match(re)
  return m ? m[1].trim().replace(/\s{2,}/g, ' ') : null
}
function matchFirstH1(text) {
  const m = text.match(/^#\s+(.+?)\s*$/m)
  if (!m) return null
  // strip a leading "Brief — " / "Project — " prefix if present
  return m[1].replace(/^(project|brief|brand)\s*[—\-:]\s*/i, '').trim()
}
function extractSectionList(text, headingRe) {
  const lines = text.split(/\r?\n/)
  const idx = lines.findIndex((l) => /^#{1,6}\s+/.test(l) && headingRe.test(l.replace(/^#+\s+/, '')))
  if (idx === -1) return []
  const out = []
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^#{1,6}\s+/.test(line)) break
    const m = line.match(/^\s*(?:-|\*|\d+\.)\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/)
    if (m) out.push(m[1])
  }
  return out
}

// ── design-spec.md — dna_pack + brand direction ─────────────────────────────
function parseDesignSpec(md) {
  if (!md) return { dnaPack: null, brandDirection: null }
  const dnaPack =
    matchLineValue(md, /^\s*(?:-\s*)?\*{0,2}dna[_\s-]?pack\*{0,2}\s*[:\-]\s*(.+)$/im) ||
    matchLineValue(md, /^\s*(?:-\s*)?\*{0,2}pack\*{0,2}\s*[:\-]\s*(.+)$/im)
  const brandDirection =
    matchLineValue(md, /^\s*(?:-\s*)?\*{0,2}brand[_\s-]?direction\*{0,2}\s*[:\-]\s*(.+)$/im) ||
    matchLineValue(md, /^\s*(?:-\s*)?\*{0,2}direction\*{0,2}\s*[:\-]\s*(.+)$/im)
  return { dnaPack, brandDirection }
}

// ── section-reuse-map.md — extract the primary table ────────────────────────
// Format is a markdown table where rows are `| surface | source | reference | rung |` (order can
// vary — we discover the columns from the header row). Extra prose above/below the table is ignored.
function parseReuseMap(md) {
  if (!md) return []
  const lines = md.split(/\r?\n/)
  const tables = []
  let cur = null
  for (const line of lines) {
    const isRow = /^\s*\|.+\|\s*$/.test(line)
    if (isRow) {
      cur = cur || []
      cur.push(line)
    } else if (cur) {
      if (cur.length >= 2) tables.push(cur)
      cur = null
    }
  }
  if (cur && cur.length >= 2) tables.push(cur)
  const rows = []
  for (const tbl of tables) {
    const header = splitTableRow(tbl[0]).map((c) => c.toLowerCase())
    // require a header line + a divider line (---) as sanity check
    if (tbl.length < 3 || !/^\s*\|[\s:|-]+\|\s*$/.test(tbl[1])) continue
    const idx = {
      surface: findCol(header, ['surface', 'section', 'page']),
      source: findCol(header, ['source', 'origin', 'from']),
      reference: findCol(header, ['reference', 'ref']),
      rung: findCol(header, ['rung', 'ladder', 'kind', 'type']),
    }
    if (idx.surface === -1) continue
    for (let i = 2; i < tbl.length; i++) {
      const cells = splitTableRow(tbl[i])
      if (!cells.length) continue
      const get = (n) => (n >= 0 && n < cells.length ? cells[n].trim() : '')
      const surface = get(idx.surface)
      if (!surface || /^-+$/.test(surface)) continue
      rows.push({
        surface,
        source: get(idx.source) || '—',
        reference: get(idx.reference) || '—',
        rung: (get(idx.rung) || '').toUpperCase() || '—',
      })
    }
  }
  return rows
}
function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '')
  return trimmed.split('|').map((c) => c.trim())
}
function findCol(header, aliases) {
  for (const a of aliases) {
    const i = header.findIndex((h) => h === a || h.includes(a))
    if (i !== -1) return i
  }
  return -1
}

// ── build-state.json ───────────────────────────────────────────────────────
// Defensive: `pages` may be an object keyed by name, or an array. Unknown shape → empty.
function parseBuildState(obj) {
  if (!obj || typeof obj !== 'object') return { mode: null, theme: null, pages: [] }
  const mode = obj.mode || obj.build?.mode || null
  const theme = obj.theme || obj.build?.theme || obj.theme_name || null
  const rawPages = obj.pages
  const pages = []
  if (rawPages && typeof rawPages === 'object' && !Array.isArray(rawPages)) {
    for (const [name, val] of Object.entries(rawPages)) {
      pages.push(normalizePage(name, val))
    }
  } else if (Array.isArray(rawPages)) {
    for (const val of rawPages) {
      const name = val?.page || val?.name || val?.id || '—'
      pages.push(normalizePage(name, val))
    }
  }
  return { mode, theme, pages }
}
function normalizePage(name, val) {
  if (!val || typeof val !== 'object') return { page: name, status: String(val ?? '—'), blockers: 0, notes: '' }
  const blockers = Array.isArray(val.blockers) ? val.blockers.length : (Number(val.blockers) || 0)
  return {
    page: name,
    status: val.status || val.state || '—',
    blockers,
    notes: val.notes || val.note || (Array.isArray(val.blockers) ? val.blockers.slice(0, 2).join(', ') : ''),
  }
}
function statusGlyph(status) {
  const s = String(status).toLowerCase()
  if (/verified|pass|green|done/.test(s)) return `${status} ✓`
  if (/fail|red|block/.test(s)) return `${status} ✗`
  return status
}

// ── reference-map.json — for the requirement-coverage count ─────────────────
function surfacesFromReferenceMap(obj) {
  if (!obj || typeof obj !== 'object') return []
  const bag = obj.surfaces && typeof obj.surfaces === 'object' ? obj.surfaces : obj
  const out = []
  for (const [key, val] of Object.entries(bag)) {
    if (!val || typeof val !== 'object') continue
    out.push({
      surface: key,
      reference: val.reference || val.ref || val.name || '—',
      archetype: val.archetype || val.type || null,
    })
  }
  return out
}

// ── CHANGES.md — unchecked count ────────────────────────────────────────────
function countUnchecked(md) {
  if (!md) return null
  const matches = md.match(/^\s*-\s*\[ \]\s+/gm)
  return matches ? matches.length : 0
}

// ── gate summary ────────────────────────────────────────────────────────────
function summarizeGates(obj) {
  if (!obj || typeof obj !== 'object') return { blockers: null, warnings: null }
  const num = (v) => (typeof v === 'number' ? v : Array.isArray(v) ? v.length : null)
  const blockers =
    num(obj.blockers_total) ??
    num(obj.blockers) ??
    num(obj.blockersCount) ??
    (obj.totals ? num(obj.totals.blockers) : null) ??
    0
  const warnings =
    num(obj.warnings_total) ??
    num(obj.warnings) ??
    num(obj.warningsCount) ??
    (obj.totals ? num(obj.totals.warnings) : null) ??
    0
  return { blockers, warnings }
}

// ── requirement coverage ────────────────────────────────────────────────────
// A brief may enumerate requirements as `REQ-1: …` / `- [ ] REQ-42 …`. We extract the ids only; the
// human reads the brief for full text. Coverage against build-state.json is a best-effort match on
// the id appearing anywhere in the JSON (works for both flat and nested layouts).
function extractRequirements(briefMd) {
  if (!briefMd) return []
  const seen = new Set()
  const out = []
  const re = /\b(REQ[-_]?\d+[A-Za-z0-9._-]*)\b\s*[:\-–]?\s*([^\n]{0,80})?/g
  let m
  while ((m = re.exec(briefMd)) !== null) {
    const id = m[1].toUpperCase().replace(/_/g, '-')
    if (seen.has(id)) continue
    seen.add(id)
    const label = (m[2] || '').trim().replace(/^[—\-:]\s*/, '')
    out.push({ id, label })
  }
  return out
}
// A REQ passes iff (a) at least one file/surface cites it in the reuse map or reference map, AND
// (b) at least one of those cited surfaces is NOT in any gate failure list, AND (c) the overall
// gate summary passes. Older impl grepped the ENTIRE stringified gate report for `/fail|block/`,
// which matched every summary (they all carry a `blockers` / `blockers_total` field) and forced
// passing→0 regardless of real state. Per-REQ scoping fixes that.
function requirementsCoverage(reqs, sources) {
  const total = reqs.length
  if (total === 0) return { total: 0, mapped: 0, passing: 0 }
  const { reuseRaw, referenceMapObj, buildStateObj, gateSummaryObj } = sources

  // 1) Per-REQ surface citations. Scan two sources of truth defensively.
  const reqToSurfaces = new Map()
  for (const r of reqs) reqToSurfaces.set(r.id, new Set())

  // section-reuse-map.md — walk each table row; the surface is column 1.
  for (const line of String(reuseRaw || '').split(/\r?\n/)) {
    if (!/^\s*\|.+\|\s*$/.test(line)) continue
    const cells = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
    const surface = cells[0]
    if (!surface || /^-+$/.test(surface) || /^(surface|section|page)$/i.test(surface)) continue
    for (const r of reqs) if (line.includes(r.id)) reqToSurfaces.get(r.id).add(surface)
  }

  // reference-map.json — stringify each surface block separately so a REQ mentioned under surface A
  // does not leak into surface B.
  if (referenceMapObj && typeof referenceMapObj === 'object') {
    const bag = referenceMapObj.surfaces && typeof referenceMapObj.surfaces === 'object' ? referenceMapObj.surfaces : referenceMapObj
    for (const [surfaceKey, val] of Object.entries(bag)) {
      if (!val || typeof val !== 'object') continue
      const blob = JSON.stringify(val)
      for (const r of reqs) if (blob.includes(r.id)) reqToSurfaces.get(r.id).add(surfaceKey)
    }
  }

  // 2) Which surfaces are FAILING? Union of (build-state pages with blockers>0 or non-pass status)
  //    + gate-summary failure lists (failing_files / failing_pages / failing_surfaces / blockers[]).
  const failingSurfaces = new Set()
  if (buildStateObj && typeof buildStateObj === 'object' && buildStateObj.pages) {
    const rawPages = buildStateObj.pages
    const iter = Array.isArray(rawPages)
      ? rawPages
      : Object.entries(rawPages).map(([k, v]) => ({ page: k, ...(v && typeof v === 'object' ? v : {}) }))
    for (const p of iter) {
      const blockers = Array.isArray(p.blockers) ? p.blockers.length : Number(p.blockers) || 0
      const status = String(p.status || p.state || '').toLowerCase()
      if (blockers > 0 || /fail|block|red/.test(status)) {
        const key = p.page || p.name || p.id
        if (key) failingSurfaces.add(key)
      }
    }
  }
  const gs = gateSummaryObj && typeof gateSummaryObj === 'object' ? gateSummaryObj : null
  if (gs) {
    for (const list of [gs.failing_files, gs.failing_pages, gs.failing_surfaces, gs.blockers]) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        if (typeof item === 'string') failingSurfaces.add(item)
        else if (item && typeof item === 'object') {
          const key = item.file || item.page || item.surface || item.name
          if (key) failingSurfaces.add(key)
        }
      }
    }
  }
  const summaryPass = gs
    ? (gs.pass === true ||
       ((gs.blockers_total ?? gs.blockers ?? gs.blockersCount ?? (gs.totals && gs.totals.blockers) ?? 0) === 0 && gs.pass !== false))
    : false

  // 3) Roll up. mapped++ if any surface cites the REQ; passing++ requires an unfailed cited surface
  //    AND overall summary pass. If mapped === 0 then passing === 0 by construction.
  let mapped = 0
  let passing = 0
  for (const r of reqs) {
    const surfaces = reqToSurfaces.get(r.id)
    if (!surfaces || surfaces.size === 0) continue
    mapped++
    if (!summaryPass) continue
    for (const s of surfaces) {
      if (!failingSurfaces.has(s)) { passing++; break }
    }
  }
  return { total, mapped, passing }
}

// ── markdown builders ───────────────────────────────────────────────────────
function mdTable(headers, rows) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const head = `| ${headers.join(' | ')} |`
  const div = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.length
    ? rows.map((r) => `| ${headers.map((_, i) => esc(r[i])).join(' | ')} |`).join('\n')
    : `| ${headers.map(() => '—').join(' | ')} |`
  return [head, div, body].join('\n')
}

function build(sources) {
  const {
    brief, spec, buildState, reuseRows, reuseRaw, changesUnchecked, gateSummary,
    referenceMapObj, referenceMapSurfaces, buildStateObj, gateSummaryObj,
  } = sources

  const ts = new Date().toISOString()
  const brand = brief.brand || 'Unnamed project'
  const niche = brief.niche
    ? spec.dnaPack ? `${brief.niche} (dna_pack: ${spec.dnaPack})` : brief.niche
    : (spec.dnaPack ? `— (dna_pack: ${spec.dnaPack})` : NOT_DECLARED)
  const mode = buildState.mode || NOT_DECLARED
  const theme = buildState.theme || NOT_DECLARED

  // Source mapping table (Yash's "kaunsa page kahaan se")
  const reuseTableRows = reuseRows.length
    ? reuseRows.map((r) => [r.surface, r.source, r.reference, r.rung])
    : []
  const reuseSection = reuseRows.length
    ? mdTable(['Surface', 'Source', 'Reference', 'Rung'], reuseTableRows)
    : `${NOT_DECLARED} — no rows found in \`section-reuse-map.md\`.`

  // Build-state table
  const pageRows = buildState.pages.map((p) => [p.page, statusGlyph(p.status), String(p.blockers), p.notes || '—'])
  const buildSection = buildState.pages.length
    ? mdTable(['Page', 'Status', 'Blockers', 'Notes'], pageRows)
    : `${NOT_DECLARED} — \`docs/build-state.json\` has no \`pages\` yet.`

  // Requirements
  const requirements = extractRequirements(brief.raw)
  const coverage = requirementsCoverage(requirements, { reuseRaw, referenceMapObj, buildStateObj, gateSummaryObj })
  const firstTen = requirements.slice(0, 10)
    .map((r) => `  - \`${r.id}\`${r.label ? ` — ${r.label}` : ''}`).join('\n')
  const reqSection = requirements.length
    ? [
        `- Total requirements: **${coverage.total}**`,
        `- Mapped to files: **${coverage.mapped}**`,
        `- Passing all gates: **${coverage.passing}**`,
        `- First ${Math.min(10, requirements.length)} (see [brief.md](brief.md) for full list):`,
        firstTen,
      ].join('\n')
    : `${NOT_DECLARED} — no \`REQ-*\` ids found in the brief.`

  // Must-haves (auxiliary, if present)
  const mustHaveSection = brief.mustHaves.length
    ? brief.mustHaves.map((m) => `- ${m}`).join('\n')
    : null

  // Open items
  const changesLine = changesUnchecked === null
    ? `- CHANGES.md unchecked: ${NOT_DECLARED} — file missing.`
    : `- CHANGES.md unchecked: **${changesUnchecked}** — [link to CHANGES.md](../CHANGES.md)`
  const gateBlockersLine = gateSummary.blockers === null
    ? `- Gate blockers: ${NOT_DECLARED} — \`gate-reports/summary.json\` missing.`
    : `- Gate blockers: **${gateSummary.blockers}** (warnings: ${gateSummary.warnings ?? 0}) — [link to gate-reports/SUMMARY.md](../gate-reports/SUMMARY.md)`

  // Reference-map echo (kept short; the section-mapping table is the main show)
  const refMapLine = referenceMapSurfaces.length
    ? `- Reference map declares **${referenceMapSurfaces.length}** surface(s).`
    : `- Reference map: ${NOT_DECLARED}.`

  const lines = []
  lines.push(`# Project — ${brand}`)
  lines.push('')
  lines.push('> Auto-generated by `regenerate-project-md.mjs`. Never edit by hand.')
  lines.push(`> Last regenerated: ${ts}`)
  lines.push('')

  lines.push('## Overview')
  lines.push(`- Brand: ${brief.brand || NOT_DECLARED}`)
  lines.push(`- Niche: ${niche}`)
  lines.push(`- Mode: ${mode}`)
  lines.push(`- Theme: ${theme}`)
  if (spec.brandDirection) lines.push(`- Brand direction: ${spec.brandDirection}`)
  lines.push(refMapLine)
  lines.push('')

  if (mustHaveSection) {
    lines.push('### Must-haves (from brief)')
    lines.push(mustHaveSection)
    lines.push('')
  }

  lines.push('## Source mapping (Yash\'s "kaunsa page kahaan se")')
  lines.push(reuseSection)
  lines.push('')

  lines.push('## Build state')
  lines.push(buildSection)
  lines.push('')

  lines.push('## Requirement coverage')
  lines.push(reqSection)
  lines.push('')

  lines.push('## Open items')
  lines.push(changesLine)
  lines.push(gateBlockersLine)
  lines.push('')

  lines.push('## Detail files (links only)')
  lines.push('- Brief: [docs/brief.md](brief.md)')
  lines.push('- Reference map: [docs/design/reference-map.json](design/reference-map.json)')
  lines.push('- Design spec: [docs/design/design-spec.md](design/design-spec.md)')
  lines.push('- Design system: [docs/design/design-system.json](design/design-system.json)')
  lines.push('- Build state: [docs/build-state.json](build-state.json)')
  lines.push('- Section reuse map: [../section-reuse-map.md](../section-reuse-map.md)')
  lines.push('- CHANGES: [../CHANGES.md](../CHANGES.md)')
  lines.push('- Gate reports: [../gate-reports/](../gate-reports/)')
  lines.push('')

  return lines.join('\n')
}

// ── main ───────────────────────────────────────────────────────────────────
export function regenerate({ dryRun = false } = {}) {
  const briefRaw = readTextSafe('docs/brief.md')
  const specRaw = readTextSafe('docs/design/design-spec.md')
  const reuseRaw = readTextSafe('section-reuse-map.md')
  const changesRaw = readTextSafe('CHANGES.md')

  const brief = { ...parseBrief(briefRaw), raw: briefRaw || '' }
  const spec = parseDesignSpec(specRaw)
  const buildStateObj = readJsonSafe('docs/build-state.json')
  const buildState = parseBuildState(buildStateObj)
  const reuseRows = parseReuseMap(reuseRaw)
  const referenceMapObj = readJsonSafe('docs/design/reference-map.json')
  const referenceMapSurfaces = surfacesFromReferenceMap(referenceMapObj)
  const gateSummaryObj = readJsonSafe('gate-reports/summary.json')
  const gateSummary = summarizeGates(gateSummaryObj)
  const changesUnchecked = countUnchecked(changesRaw)

  const md = build({
    brief, spec, buildState, reuseRows, reuseRaw, changesUnchecked, gateSummary,
    referenceMapObj, referenceMapSurfaces, buildStateObj, gateSummaryObj,
  })

  if (dryRun) {
    process.stdout.write(md.endsWith('\n') ? md : md + '\n')
    return { path: null, wrote: false, bytes: Buffer.byteLength(md, 'utf-8') }
  }
  const outAbs = path.join(cwd, 'docs', 'project.md')
  fs.mkdirSync(path.dirname(outAbs), { recursive: true })
  fs.writeFileSync(outAbs, md.endsWith('\n') ? md : md + '\n')
  return { path: outAbs, wrote: true, bytes: Buffer.byteLength(md, 'utf-8') }
}

if (isMain(import.meta.url)) {
  try {
    const res = regenerate({ dryRun: DRY_RUN })
    if (!DRY_RUN) {
      const rel = path.relative(cwd, res.path) || res.path
      console.log(`✅ wrote ${rel} (${res.bytes} bytes)`)
    }
    process.exit(0)
  } catch (err) {
    console.error(`⛔ regenerate-project-md failed: ${err && err.message ? err.message : err}`)
    process.exit(1)
  }
}
