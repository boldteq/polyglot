#!/usr/bin/env node
// Gate #40 link-health (Signal · quality, url-kind) — no broken internal links + a designed 404.
// Dead internal links waste 3-5% of traffic + crawl budget; a bare/missing 404 dead-ends users.
// Two halves: (a) STATIC — templates/404.* exists and has recovery links (search/home/collections);
// (b) URL (when THEME_PREVIEW_URL set) — fetch the homepage, sample internal links, flag any 404/5xx,
// and confirm a random bad path returns a 404 status with a real page. Warn-first; BLOCKS at
// publish-grade. url-kind → fixture-exempt. Exit: 0 pass · 1 block · 2 env-error (no URL).

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const ENFORCE = process.env.LINK_HEALTH_REQUIRE === '1' || process.env.DS_REQUIRE_SCOPE === '1'
const url = process.env.THEME_PREVIEW_URL || null
const blockers = []
const warnings = []

// (a) static — the 404 template exists + has recovery affordances
function read404() {
  for (const base of ['templates/404.liquid', 'templates/404.json']) {
    try {
      let txt = fs.readFileSync(path.resolve(cwd, base), 'utf8')
      if (base.endsWith('.json')) { // JSON template → resolve its sections' liquid for the recovery check
        try { const j = JSON.parse(txt); txt += Object.values(j.sections || {}).map((s) => { try { return fs.readFileSync(path.resolve(cwd, `sections/${s.type}.liquid`), 'utf8') } catch { return '' } }).join('\n') } catch {}
      }
      return txt
    } catch {}
  }
  return null
}
const t404 = read404()
if (t404 == null) {
  (ENFORCE ? blockers : warnings).push({ id: 'link.no-404-template', page: 'templates/404', detail: 'no templates/404 template — a missing 404 page dead-ends lost traffic; add a designed 404 with recovery links' })
} else if (!/(routes\.search_url|\/search|routes\.root_url|\/collections|href)/i.test(t404)) {
  warnings.push({ id: 'link.404-no-recovery', page: 'templates/404', detail: '404 page has no recovery links (search / home / shop) — add a clear path back so a 404 isn\'t a dead-end' })
}

async function crawl() {
  const origin = url.replace(/\/$/, '')
  const headers = { 'user-agent': 'BoldteqThemeGates/1.0' }
  let res, home
  try { res = await fetch(origin, { headers }); home = await res.text() } catch (e) { return { env: `homepage fetch failed: ${e.message}` } }
  // password wall: a locked storefront redirects to /password; a plain fetch can't authenticate, so the
  // crawl finds 0 real links and would falsely PASS. Return an env-error (out() → exit 2), never green.
  if (/\/password\/?$/.test(new URL(res.url).pathname) || /<form[^>]+action=["'][^"']*\/password/i.test(home)) {
    return { env: 'store is password-protected (landed on /password) — a fetch crawl sees no real links; set THEME_STORE_PASSWORD or open the store to run link-health' }
  }
  const links = [...new Set([...home.matchAll(/href=["'](\/[a-z0-9/_?=&#%.\-]*)["']/gi)].map((m) => m[1]))]
    .filter((h) => /^\/(products|collections|pages|blogs|policies)\//.test(h)).slice(0, 25)
  let broken = 0, checked = 0
  for (const h of links) {
    try { const r = await fetch(origin + h.split('#')[0], { headers, redirect: 'follow' }); checked++; if (r.status === 404 || r.status >= 500) { broken++; (ENFORCE ? blockers : warnings).push({ id: 'link.broken', page: h, detail: `internal link returns ${r.status} — fix or remove the dead link` }) } } catch {}
  }
  // a random bad path must 404 (not 200 soft-404)
  try { const r = await fetch(`${origin}/__boldteq_no_such_path_404_probe__`, { headers }); if (r.status !== 404) warnings.push({ id: 'link.soft-404', page: '/<bad-path>', detail: `a missing path returned ${r.status} not 404 — soft-404s confuse crawlers; the 404 template should serve a real 404 status` }) } catch {}
  return { checked, broken }
}

const out = async () => {
  let evidence = { enforce: ENFORCE, has404: t404 != null }
  if (url) { const c = await crawl(); evidence = { ...evidence, ...c }; if (c.env) { writeReport('link-health', 40, { cwd, pass: false, blockers, warnings, evidence: { ...evidence, reason: c.env }, duration_ms: Date.now() - t0 }, REPORT_DIR); console.error(`link-health: ENV — ${c.env}`); process.exit(2) } }
  else warnings.push({ id: 'link.no-url', page: '-', detail: 'no THEME_PREVIEW_URL — only the static 404-template check ran; set a preview URL for the broken-link crawl' })
  const pass = blockers.length === 0
  writeReport('link-health', 40, { cwd, pass, blockers, warnings, evidence, duration_ms: Date.now() - t0 }, REPORT_DIR)
  console.log(`link-health: ${pass ? 'PASS' : 'BLOCK'} — 404-template=${t404 != null}${url ? ` · ${evidence.broken || 0}/${evidence.checked || 0} broken` : ' · (static only, no URL)'}`)
  process.exit(pass ? 0 : 1)
}
out()
