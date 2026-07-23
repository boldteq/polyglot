#!/usr/bin/env node
// #30 — redirect-map validation (gate #25). On a migration/redesign, the redirect map is what keeps
// SEO equity + bookmarks alive; a broken map (self-redirect, loop, multi-hop chain, target that 404s)
// silently bleeds rankings. beacon signs redirects off — this makes the map machine-checkable BEFORE
// publish. SKIPS cleanly when there's no redirect map (a greenfield/refresh with no migration never
// false-fires), so it sits in the static sweep harmlessly.
//
// Static checks (hermetic, no network) on the map rows [{from,to}]:
//   redirect.self        — from === to (a redirect to itself). BLOCK.
//   redirect.loop        — a cycle in the chain (A→B→A). BLOCK.
//   redirect.bad-target  — target is neither a "/"-path nor an absolute URL. BLOCK.
//   redirect.chain       — a multi-hop chain (A→B→C); should point straight at the final dest (≤1 hop).
//                          WARN in dev, BLOCK at publish-grade (DS_REQUIRE_SCOPE=1 / REDIRECTS_ENFORCE=1).
//   redirect.duplicate-source / redirect.bad-source — advisory WARN.
//
// Opt-in live crawl (REDIRECTS_CRAWL=1 + a base URL): fetch each source, assert it lands on a 200 in
// ≤1 hop. Non-hermetic — runs only in dogfood/CI.
//
// Env: REDIRECTS_FILE (auto: redirects.csv | docs/seo/redirects.csv | redirects.json) · REPORT_DIR ·
//      DS_REQUIRE_SCOPE=1 | REDIRECTS_ENFORCE=1 (chain→BLOCK) · REDIRECTS_CRAWL=1 + REDIRECTS_BASE_URL
// Exit: 0 = pass/skip · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const STRICT = process.env.DS_REQUIRE_SCOPE === '1' || process.env.REDIRECTS_ENFORCE === '1'
const CRAWL = process.env.REDIRECTS_CRAWL === '1'
const BASE_URL = process.env.REDIRECTS_BASE_URL || process.env.THEME_PREVIEW_URL || ''
const CANDIDATES = ['redirects.csv', 'docs/seo/redirects.csv', 'redirects.json', 'docs/seo/redirects.json']

// PURE: validate the redirect map. strict flips chain WARN→BLOCK. Returns {blockers,warnings,count}.
export function analyzeRedirects(rows, { strict = false } = {}) {
  const blockers = []
  const warnings = []
  const B = (id, page, detail) => blockers.push({ id, page, detail, evidence: '' })
  const W = (id, page, detail) => warnings.push({ id, page, detail, evidence: '' })
  const eligible = (id, page, detail) => (strict ? B(id, page, detail) : W(id, page, detail))
  const norm = (s) => String(s ?? '').trim()
  const map = new Map()
  const counts = new Map()
  let clean = 0
  for (const r of rows || []) {
    const from = norm(r.from)
    const to = norm(r.to)
    if (!from || !to) { W('redirect.empty', '-', `row missing from/to: ${JSON.stringify(r)}`); continue }
    if (!from.startsWith('/')) W('redirect.bad-source', from, `source should be a root-relative path starting with "/" (got "${from}")`)
    if (!(to.startsWith('/') || /^https?:\/\//i.test(to))) { B('redirect.bad-target', from, `target "${to}" is neither a "/"-path nor an absolute URL — it will 404`); continue }
    if (from === to) { B('redirect.self', from, 'redirects to itself (infinite no-op)'); continue }
    counts.set(from, (counts.get(from) || 0) + 1)
    if (!map.has(from)) map.set(from, to)
    clean += 1
  }
  for (const [from, n] of counts) if (n > 1) W('redirect.duplicate-source', from, `source "${from}" appears ${n}× — only the first applies; remove the duplicates`)
  // follow each chain over internal ("/"-path) targets → detect loops + multi-hop chains
  for (const from of map.keys()) {
    let cur = map.get(from)
    const trail = [from]
    const guard = new Set([from])
    let hops = 0
    while (cur && cur.startsWith('/') && map.has(cur)) {
      if (guard.has(cur)) { B('redirect.loop', from, `redirect loop: ${[...trail, cur].join(' → ')}`); hops = -1; break }
      hops += 1
      guard.add(cur)
      trail.push(cur)
      cur = map.get(cur)
      if (hops > 20) { B('redirect.loop', from, `redirect chain from ${from} exceeds 20 hops (treated as a loop)`); hops = -1; break }
    }
    if (hops > 0) eligible('redirect.chain', from, `multi-hop chain (${hops + 1} hops): ${from} → … → ${cur}. Point the source straight at the final destination (≤1 hop) — chains are slow and shed link equity.`)
  }
  return { blockers, warnings, count: clean }
}

// parse a redirects file (Shopify CSV export "Redirect from,Redirect to" / generic from,to / JSON)
function parseRows(file, text) {
  if (/\.json$/i.test(file)) {
    const data = JSON.parse(text)
    if (Array.isArray(data)) return data.map(r => ({ from: r.from ?? r.path ?? r['Redirect from'], to: r.to ?? r.target ?? r['Redirect to'] }))
    return Object.entries(data).map(([from, to]) => ({ from, to }))
  }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows = []
  for (const line of lines) {
    if (/^("?redirect from"?|"?from"?)\s*,/i.test(line)) continue // header
    const i = line.indexOf(',')
    if (i === -1) continue
    const from = line.slice(0, i).trim().replace(/^"|"$/g, '')
    const to = line.slice(i + 1).trim().replace(/^"|"$/g, '')
    rows.push({ from, to })
  }
  return rows
}

const blockers = []
const warnings = []
function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('redirects', 25, { cwd, pass, blockers, warnings, evidence: { strict: STRICT, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`redirects: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

async function liveCrawl(rows) {
  if (!BASE_URL) { warnings.push({ id: 'redirect.crawl-no-url', page: '-', detail: 'REDIRECTS_CRAWL=1 but no REDIRECTS_BASE_URL / THEME_PREVIEW_URL — skipping live crawl', evidence: '' }); return }
  const origin = BASE_URL.replace(/\/+$/, '')
  for (const { from } of rows.slice(0, 200)) {
    if (!from?.startsWith('/')) continue
    try {
      const res = await fetch(origin + from, { redirect: 'manual' })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location') || ''
        const follow = await fetch(loc.startsWith('http') ? loc : origin + loc, { redirect: 'manual' }).catch(() => null)
        if (follow && follow.status >= 300 && follow.status < 400) (STRICT ? blockers : warnings).push({ id: 'redirect.multi-hop-live', page: from, detail: `${from} takes >1 hop live (→ ${loc} → …) — collapse to a single 301`, evidence: '' })
      } else if (res.status >= 400) {
        blockers.push({ id: 'redirect.dead-live', page: from, detail: `${from} returns ${res.status} live (no redirect) — legacy URL is dead`, evidence: '' })
      }
    } catch (e) { warnings.push({ id: 'redirect.crawl-error', page: from, detail: `crawl error: ${e.message}`, evidence: '' }) }
  }
}

async function main() {
  const file = process.env.REDIRECTS_FILE || CANDIDATES.find(c => fs.existsSync(path.resolve(cwd, c)))
  if (!file || !fs.existsSync(path.resolve(cwd, file))) {
    warnings.push({ id: 'redirect.n-a-no-map', page: '-', detail: 'no redirect map (redirects.csv / docs/seo/redirects.csv / redirects.json) — not a migration, skipping', evidence: '' })
    return finish(null, { scope: 'n/a' })
  }
  let rows
  try { rows = parseRows(file, fs.readFileSync(path.resolve(cwd, file), 'utf-8')) } catch (e) { return finish(`${file} unparseable: ${e.message}`) }
  const res = analyzeRedirects(rows, { strict: STRICT })
  blockers.push(...res.blockers)
  warnings.push(...res.warnings)
  if (CRAWL) await liveCrawl(rows)
  finish(null, { file, rows: rows.length, valid: res.count })
}

if (isMain(import.meta.url)) {
  main().catch(err => finish(`unexpected failure: ${err.message}`))
}
