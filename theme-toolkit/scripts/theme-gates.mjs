#!/usr/bin/env node
// Boldteq theme-toolkit orchestrator — runs the QA gates against the theme repo in cwd.
//
// Usage:
//   node theme-gates.mjs                       full run (static gates, then URL gates when a
//                                              preview URL is configured — else static-only)
//   node theme-gates.mjs --static-only         theme-check + editability only
//   node theme-gates.mjs --gate <name>         run named gate(s) only (repeatable)
//   node theme-gates.mjs --report-dir <dir>    default: gate-reports
//   node theme-gates.mjs --verify [--require-full]
//
// Env:
//   THEME_PREVIEW_URL          preview URL for URL gates (or STORE + THEME_ID)
//   THEME_STORE_PASSWORD       storefront password (URL gates; STOREFRONT_PASSWORD accepted as alias)
//   SKIP_<GATE>=1              waive a gate (SKIP_THEME_CHECK, SKIP_EDITABILITY,
//                              SKIP_LIGHTHOUSE, SKIP_AXE, SKIP_SEO)
//   GATES_SEQUENTIAL=1         run gates one-at-a-time (default = up to 8 in parallel)
//
//   node theme-gates.mjs --list   print the live gate manifest (ground audits in THIS, not memory)
//
// summary.json: { toolkitVersion, ts, sha, dirty, branch, mode, url,
//                 gates: { <name>: { pass, blockers, warnings, skipped, reason } }, pass }
// pass = every executed gate passes AND no exit-2 skip without an explicit SKIP_<NAME>=1.
//
// --verify: summary is fresh iff dirty == false AND (sha == HEAD OR every file changed
// since sha is allowlisted: gate-reports/**, CHANGES.md, merchant-editability.md, docs/**).
// --require-full additionally requires mode == "full" && pass == true.
//
// Exit: 0 = pass/fresh · 1 = block/stale · 2 = env error

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn, execFileSync } from 'node:child_process'
import { readJson, toolkitVersion, gitInfo, countSeverities, staleReportsByTtl } from './lib/report.mjs'
import { applyPublishGrade } from './lib/publish-grade.mjs'

// Promisified gate spawn — buffers output, enforces a timeout. (P0 #14: parallel gate execution.)
function runGateProc(runner, gateArgs, opts) {
  return new Promise((resolve) => {
    const child = spawn(runner, gateArgs, { cwd: opts.cwd, env: opts.env })
    let stdout = ''; let stderr = ''
    child.stdout?.on('data', d => { stdout += d })
    child.stderr?.on('data', d => { stderr += d })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* */ } resolve({ code: 2, stdout, stderr, error: new Error('gate timed out') }) }, opts.timeout || 600_000)
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 2, stdout, stderr, error: err }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 2, stdout, stderr, error: null }) })
  })
}

// Bounded-concurrency pool — runs fn over items, at most `limit` at once.
async function pool(items, limit, fn) {
  let i = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]) }
  })
  await Promise.all(workers)
}

// Human-readable SUMMARY.md — humans read the .md, systems read the .json. Every failure is
// actionable in plain English (audit P3 + the autonomous-build human touchpoints).
function writeSummaryMd(dir, selected, results, summary) {
  const L = ['# Theme Gates — Summary', '']
  L.push(`**${summary.pass ? '✅ PASS' : '❌ BLOCK'}** · mode=${summary.mode} · ${selected.length} gate(s) · toolkit ${summary.toolkitVersion} · sha ${summary.sha ? summary.sha.slice(0, 7) : 'null'}${summary.dirty ? ' · dirty' : ''}`, '')
  if (summary.severityCounts) {
    const s = summary.severityCounts
    L.push(`severity: **${s.block}** block · ${s.warn} warn · ${s.advise} advise`, '')
  }
  const cls = (g) => { const r = results[g.name]; return r.waived || r.skipped ? 'skip' : r.pass ? 'pass' : 'block' }
  const blocked = selected.filter(g => cls(g) === 'block')
  const skipped = selected.filter(g => cls(g) === 'skip')
  const passed = selected.filter(g => cls(g) === 'pass')
  // HONEST HEADER (2026-07-22 cravinbyandy forensics): the summary Yash reads printed
  // "❌ BLOCK · 0 block · 7 gate(s)" while 26 un-run gate reports on disk held 58 blockers. Never let
  // the headline imply the run was clean or complete when it was neither.
  if (!summary.pass && summary.severityCounts && summary.severityCounts.block === 0 && skipped.length) {
    L.push(`> **Why BLOCK with 0 blockers?** ${skipped.length} gate(s) did not run (${skipped.map(g => g.name).join(', ')}). A gate that did not run is NOT a pass — resolve or waive it in \`## Waivers\`.`, '')
  }
  if (summary.mode === 'gate-subset') {
    L.push(`> ⚠️ **Partial run** — only ${selected.length} gate(s) were executed. This is NOT a publish-grade verdict and says nothing about the gates that were not run. Run the full stack (\`node toolkit/scripts/theme-gates.mjs\`) before trusting green.`, '')
  }
  // static-only (no THEME_PREVIEW_URL): the URL + Lens gates never ran, so the RENDERED design was not
  // authoritatively judged and the taste floor is warn-only. A ✅ here is a code-level pass, NOT "the design
  // is proper". Making that explicit is the whole point of the honest-header work (2026-07-29 audit #19).
  if (summary.mode === 'static-only') {
    L.push(`> ⚠️ **Static-only run** — the URL + Lens gates (functional / perf / a11y / SEO / **visual-truth #18**) were NOT in scope, so the rendered design was **not** authoritatively judged, and the taste floor (#12) is advisory. A ✅ below is a code-level pass, **not** a publish-grade "the design is proper" verdict. Set \`THEME_PREVIEW_URL\` and run \`--require-full\` before trusting green.`, '')
  }
  if (blocked.length) {
    L.push(`## ❌ Blocked (${blocked.length}) — fix before publish`, '')
    for (const g of blocked) {
      L.push(`### #${g.number} ${g.name} — ${results[g.name].blockers.length} blocker(s)`)
      for (const b of results[g.name].blockers) L.push(`- **${b.id}**${b.page ? ` \`${b.page}\`` : ''} — ${b.detail}`)
      L.push('')
    }
  }
  const warned = selected.filter(g => cls(g) !== 'skip' && (results[g.name].warnings || []).length)
  if (warned.length) {
    L.push('## ⚠️ Warnings (advisory)', '')
    for (const g of warned) {
      const w = results[g.name].warnings
      L.push(`### #${g.number} ${g.name} — ${w.length} warning(s)`)
      for (const x of w.slice(0, 6)) L.push(`- ${x.id}${x.page ? ` \`${x.page}\`` : ''} — ${x.detail}`)
      if (w.length > 6) L.push(`- …and ${w.length - 6} more (see ${g.name}.json)`)
      L.push('')
    }
  }
  // ## Not enforced on this run (S4 ledger) — every warn-policy gate that RAN, with its reason. A green
  // header only means the BLOCK-policy gates passed; these warn gates surfaced findings that did NOT block.
  // Making the un-enforced surface explicit is the whole point: green must never read as "everything judged".
  const notEnforced = selected.filter(g => cls(g) !== 'skip' && g.enforcement && g.enforcement.policy === 'warn')
  if (notEnforced.length) {
    L.push(`## 🟡 Not enforced on this run (${notEnforced.length})`, '', 'These ran in **warn-only** mode — their findings are advisory, not blockers. A PASS above does NOT mean these gates judged the build clean:', '')
    for (const g of notEnforced) L.push(`- **#${g.number} ${g.name}** — ${g.enforcement.reason}`)
    L.push('')
  }
  if (skipped.length) { L.push(`## ⏭️ Skipped / waived (${skipped.length})`, ''); for (const g of skipped) L.push(`- #${g.number} ${g.name} — ${results[g.name].reason || 'skipped'}`); L.push('') }
  if (passed.length) L.push(`## ✅ Passed (${passed.length})`, '', passed.map(g => `#${g.number} ${g.name}`).join(' · '), '')
  fs.writeFileSync(path.join(dir, 'SUMMARY.md'), `${L.join('\n')}\n`)
}

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
// SWT simplification Part A — the 49 gates presented as 14 concern-groups (gate-groups.json). ADDITIVE:
// the 49 gates still run unchanged; this only powers `--list-groups` + the end-of-run group rollup, so the
// output reads as 14 groups without touching execution/summary.json. Lossless map is guarded by #57.
function loadGateGroups() {
  try { return JSON.parse(fs.readFileSync(path.resolve(SCRIPTS_DIR, '..', 'gate-groups.json'), 'utf-8')).groups || [] } catch { return [] }
}
// script filename → group {id,title}; null when the map is absent or the gate isn't mapped.
function groupIndex(groups) {
  const idx = new Map()
  for (const g of groups) for (const m of g.members || []) idx.set(m, { id: g.id, title: g.title })
  return idx
}
const FRESHNESS_ALLOWLIST = ['gate-reports', 'CHANGES.md', 'merchant-editability.md', 'docs']
// #3 — URL-gate evidence reflects a LIVE render and drifts by wall-clock even at the same SHA, so it
// expires on a TTL. Static gates are deterministic from the committed tree → no time-TTL (SHA is their
// freshness). FRESHNESS_TTL_OFF=1 disables the check (dogfood / re-gate-then-verify edge).
const URL_GATE_TTL_MS = 24 * 60 * 60 * 1000

// Branded gate stack — 38 gates across 9 families (Bedrock · Forge · Catalyst · Integrity · Lens ·
// DNA · Press · Signal · Tribunal). `name` is the contract (report file, --gate, SKIP_<NAME>, fixture
// dir); `number` is display-only and STABLE (merges keep the lowest absorbed number; retired: 15/17/21/26/32/34).
// Old names still resolve via GATE_ALIAS (below) for one transition.
// 35 quality gates · 2 levels: stage (setup|quality) → category (plain-English).
// `name` is the contract (report file, --gate, SKIP_<NAME>, fixture dir). `desc` drives the info button.
// NOT gates (removed 2026-06-26): theme-lock = a publish-safety POLICY (enforced by shopify-theme-push.mjs
// + CI, not here); library-cards = component-library CI (COMPONENT_LIBRARY_AUDIT); review-board = retired
// human sign-off (script kept on disk). Old names still resolve via GATE_ALIAS for back-compat.
const GATES = [
  // ── SETUP · Prerequisites — must exist before quality matters ──
  { name: 'discovery', number: 0.4, stage: 'setup', category: 'Prerequisites', kind: 'static', runner: 'node', script: 'check-discovery.mjs', desc: 'The client brief — goals + brand direction — exists before any build starts.' },
  { name: 'foundation', number: 0.5, stage: 'setup', category: 'Prerequisites', kind: 'static', runner: 'node', script: 'check-bootstrap.mjs', desc: 'The design system + store identity are set up before QA can mean anything.' },
  { name: 'secret-scan', number: 0.6, stage: 'setup', category: 'Prerequisites', kind: 'static', runner: 'node', script: 'check-secret-scan.mjs', desc: 'No API keys / tokens / secrets committed in the theme — a leak is a security incident.' },
  // ── QUALITY · Performance & SEO ──
  { name: 'performance', number: 1, stage: 'quality', category: 'Performance & SEO', kind: 'url', runner: 'node', script: 'gate-lighthouse.mjs', freshnessTtlMs: URL_GATE_TTL_MS, desc: 'Page-speed budget (LCP/CLS) via Lighthouse — slow stores lose sales + ranking.' },
  { name: 'seo', number: 6, stage: 'quality', category: 'Performance & SEO', kind: 'url', runner: 'node', script: 'gate-seo.mjs', freshnessTtlMs: URL_GATE_TTL_MS, desc: 'Structured data, canonical + meta tags present — so Google can find + rank the store.' },
  { name: 'social-assets', number: 39, stage: 'quality', category: 'Performance & SEO', kind: 'static', runner: 'node', script: 'check-social-assets.mjs', desc: 'Favicon + social-share (OG/Twitter) images — no broken icon, full preview on shares.' },
  { name: 'link-health', number: 40, stage: 'quality', category: 'Performance & SEO', kind: 'url', runner: 'node', script: 'check-link-health.mjs', freshnessTtlMs: URL_GATE_TTL_MS, desc: 'No broken internal links + a real 404 page with a way back — no dead ends.' },
  { name: 'redirects', number: 25, stage: 'quality', category: 'Performance & SEO', kind: 'static', runner: 'node', script: 'check-redirects.mjs', enforcement: { policy: 'block', provenBuilds: 1, reason: 'A redirect chain / loop / dead target silently drops old URLs and their SEO — mechanically certain, not advice. Already BLOCK-eligible on publish-grade runs via DS_REQUIRE_SCOPE; graduated to block on every run.', since: '2026-07-23' }, desc: 'Migration redirect map is safe — no loops / dead targets that lose old URLs + SEO.' },
  // ── QUALITY · Code Quality ──
  { name: 'code-lint', number: 2, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'gate-theme-check.mjs', desc: 'Shopify theme-check passes — no Liquid/asset errors or bad-practice warnings.' },
  { name: 'editability', number: 3, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'bash', script: 'gate-editability-greps.sh', desc: 'No hardcoded content — every text/image/color is merchant-editable in the admin.' },
  { name: 'dead-code', number: 11, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-antipatterns.mjs', desc: 'No unused assets, orphan sections, or duplicate files bloating the theme.' },
  { name: 'orchestration', number: 44, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-orchestration.mjs', desc: 'The pipeline graph is coherent — no broken handoff edges, no gate citation points at a missing gate, and the eyes/dispatch gates that stop "skip reads as pass" are all present.' },
  { name: 'gate-integrity', number: 45, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-gate-integrity.mjs', desc: 'A skipped gate is not a passed gate — blocks when a gate reports pass while its scan was skipped (usually a missing `base` tag), so green can never mean "never ran".' },
  { name: 'reference-match', number: 46, stage: 'quality', category: 'Visual & Mobile', kind: 'static', runner: 'node', script: 'check-reference-match.mjs', enforcement: { policy: 'block', provenBuilds: 1, reason: "The reference is the client's literal ask, not advice. L1 (archetype-vs-section-type) already blocks pre-render; L2 (vision compare of the rendered frame vs the saved reference) graduates to block now — proven on cravinbyandy, where the image-banner-vs-slideshow hero reproduced and blocked. N/A-tolerant: no reference registered = pass.", since: '2026-07-23' }, desc: 'The build matches the reference the client actually sent — the declared component archetype vs the real section type (blocks), plus a vision compare of the rendered frame against the saved reference image. N/A when no reference is registered.' },
  { name: 'layout', number: 22, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-css-layout.mjs', desc: 'No CSS overflow / layout defects (100vw, no-wrap rows) that break the page width.' },
  { name: 'shopify-validate', number: 49, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-shopify-validate.mjs', desc: "Shopify's OWN validator (@shopify/dev-mcp) judges this build's Liquid — unknown filters, missing snippets, deprecated filters, schema validity. Our other gates enforce rules we wrote; this one enforces Shopify's." },
  { name: 'graphql-validate', number: 51, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-graphql-validate.mjs', desc: "Shopify's OWN validator (@shopify/dev-mcp validate_graphql_codeblocks) judges the build's Admin/Storefront GraphQL — rejects hallucinated fields/types against the real schema. Sibling to #49 (Liquid). N/A-tolerant: most themes ship zero GraphQL." },
  { name: 'css-ownership', number: 52, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-css-ownership.mjs', desc: "Per-component CSS ownership (platform-truth §A1, Dev-MCP-verified): a class defined in a section/block/snippet's {% stylesheet %} must be rendered by that same component's markup — a cross-file selector can ship unstyled under Shopify's per-component CSS model. Warn in dev, block at publish-grade." },
  { name: 'ai-tells', number: 53, stage: 'quality', category: 'Design Quality', kind: 'static', runner: 'node', script: 'check-ai-tells.mjs', desc: "Mechanical AI-design-tells (design-taste doctrine, from pack 05-ai-tells): AT-10 cliché-headline templates in the build's own headings (diff-scoped, 8 CC0 tripwires → warn/block-at-publish) + AT-5 missing institutional signals (whole-theme: no policy links or no contact affordance → warn). Never penalises plain layout (§Z: prototypicality is rewarded). Correctness gates miss desirability — this covers the two statically-checkable AI-tell axes." },
  { name: 'structural-differentiation', number: 54, stage: 'quality', category: 'Design Quality', kind: 'static', runner: 'node', script: 'check-structural-differentiation.mjs', desc: "The #1 AI-tell (duplication), enforced (design-taste axis 1). AT-2 cosmetic-only-vs-base: diffs each modified section's STRUCTURE (tag.class token stream + schema type/id signature, not css values) at git base vs HEAD — a recolour of the base with 0 new custom sections is flagged (Shopify Theme-Store rule: cosmetic changes are insufficient). Calibration-free (the base IS the baseline). AT-1 cross-build near-dup: cosine vs a registry of prior builds (>0.95 warn). Warn-first, block cosmetic-only at publish-grade; N/A without a base tag." },
  { name: 'borrowed-assets', number: 55, stage: 'quality', category: 'Design Quality', kind: 'static', runner: 'node', script: 'check-borrowed-assets.mjs', desc: "AI-tell axis 4 (borrowed assets), static slice. Scans the build's own liquid/css/js/json (base..HEAD) for hardcoded stock-CDN (unsplash/pexels/shutterstock/burst) or placeholder-service (placehold.co/picsum/…) image URLs — borrowed imagery is NN/g's #1 trust-negative and gate #24 checks weight/format but not provenance. Placeholder services BLOCK always; stock CDNs warn-first / block at publish-grade. Low-FP: merchant-settings images, asset_url, cdn.shopify.com never match. N/A without a base tag." },
  { name: 'handover-pack', number: 56, stage: 'quality', category: 'Content & Trust', kind: 'static', runner: 'node', script: 'check-handover-pack.mjs', desc: "The client Handover Pack (client-handover-pack.md §0) must be complete before publish: the 6 fixed artifacts under docs/handover/ (editing-guide, content-model, apps, analytics, performance, support) each exist and are non-thin. Artifact list is read from lib/handover-pack-spec.json (spec-as-data, not hardcoded). N/A before Step 16 (no docs/handover/ yet); at publish-grade a missing/thin artifact BLOCKs — closes the 'mantle refuses publish' rule that was prose + a manual CHANGES.md checkbox only." },
  { name: 'schema-authoring', number: 47, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-schema-authoring.mjs', desc: 'The admin panel a merchant actually gets: every section {% schema %} uses t: translation keys, typed settings (image_picker not a filename), blocks instead of pipe-syntax, role-based names, a colour scheme and dynamic alignment — the whole authoring surface no other gate parses.' },
  { name: 'repo-hygiene', number: 48, stage: 'quality', category: 'Code Quality', kind: 'static', runner: 'node', script: 'check-repo-hygiene.mjs', desc: 'The corpus no rule can see: .theme-check.yml belongs to THIS repo, theme_info is the client\'s not stock Dawn, schema locale keys are complete, and no client photos or third-party brand assets are shipped as theme assets.' },
  // ── QUALITY · Design System ──
  { name: 'design-tokens', number: 8, stage: 'quality', category: 'Design System', kind: 'static', runner: 'node', script: 'check-design-system.mjs', desc: 'Colors / spacing / type stay on the design-system scale — no hardcoded hex/px.' },
  { name: 'consistency', number: 9, stage: 'quality', category: 'Design System', kind: 'static', runner: 'node', script: 'check-consistency.mjs', desc: 'Store-wide style stays consistent — capped font sizes / weights / radii, no drift.' },
  { name: 'design-quality', number: 12, stage: 'quality', category: 'Design System', kind: 'static', runner: 'node', script: 'check-design-quality.mjs', enforcement: { policy: 'warn', provenBuilds: 0, reason: 'Enforcement is DATA-DRIVEN, not a global flag: a "tuned" DNA pack already BLOCKS measurable failures (calibration==="tuned"), and BASELINE_ENFORCE=1 blocks against the cross-niche floor. An un-tuned niche pack must stay warn or it blocks builds it cannot yet judge. The global always-on policy stays warn by design.', since: '2026-07-23' }, desc: "Hits the niche's premium taste bar (DNA pack) — looks designed, not generic." },
  { name: 'render-check', number: 14, stage: 'quality', category: 'Design System', kind: 'static', runner: 'node', script: 'check-render-wiring.mjs', desc: 'The design tokens actually render on the page, not just declared on paper.' },
  { name: 'section-reuse', number: 23, stage: 'quality', category: 'Design System', kind: 'static', runner: 'node', script: 'check-reuse-map.mjs', enforcement: { policy: 'warn', provenBuilds: 0, reason: 'The reuse RATIO (≥70%) is theme-base-dependent — Minimog is reuse-first but Dawn is custom-first (70-80% custom is expected), so a global ratio block would fail the very custom-first builds the doctrine asks for. Only the ratio stays warn; the missing-reuse-map case already blocks.', since: '2026-07-23' }, desc: '≥70% of sections reuse the theme base before going custom — no over-building.' },
  { name: 'brand-sync', number: 30, stage: 'quality', category: 'Design System', kind: 'static', runner: 'node', script: 'check-ds-cascade.mjs', enforcement: { policy: 'warn', provenBuilds: 0, reason: 'Cascade-regeneration drift (a brand edit that did not re-emit CSS everywhere) is advisory until proven false-positive-free on ≥2 stores. Still BLOCK-eligible on publish-grade runs via DS_REQUIRE_SCOPE.', since: '2026-07-23' }, desc: 'A brand change regenerates the CSS so it cascades everywhere — edit once.' },
  // ── QUALITY · Visual & Mobile ──
  { name: 'visual-check', number: 18, stage: 'quality', category: 'Visual & Mobile', kind: 'static', runner: 'node', script: 'check-visual-truth.mjs', desc: 'Lens vision-judges the real rendered pixels — catches what code checks can\'t.' },
  { name: 'class-d-visual', number: 20, stage: 'quality', category: 'Visual & Mobile', kind: 'static', runner: 'node', script: 'gate-class-d-visual.mjs', desc: 'A surface touched by a Class-D micro-change must have fresh, passing Lens evidence — closes the small-fix pixel-verification bypass (2026-07-18 audit). N/A (pass) when no touched surface is declared.' },
  { name: 'section-consistency', number: 19, stage: 'quality', category: 'Visual & Mobile', kind: 'url', runner: 'node', script: 'check-section-cohesion.mjs', freshnessTtlMs: URL_GATE_TTL_MS, desc: 'Sections feel like one page — consistent type scale, rhythm, alignment.' },
  { name: 'mobile', number: 35, stage: 'quality', category: 'Visual & Mobile', kind: 'static', runner: 'node', script: 'check-mobile-layout.mjs', enforcement: { policy: 'block', provenBuilds: 1, reason: 'Mobile-first defects (horizontal scroll, sub-min tap targets) are mechanically detectable and lose the majority of traffic. Already BLOCK-eligible on publish-grade runs via DS_REQUIRE_SCOPE; graduated to block on every run.', since: '2026-07-23' }, desc: 'Mobile-first: thumb-reach CTAs, tap-target sizes, no horizontal scroll.' },
  // ── QUALITY · Accessibility ──
  { name: 'accessibility', number: 5, stage: 'quality', category: 'Accessibility', kind: 'url', runner: 'node', script: 'gate-axe.mjs', freshnessTtlMs: URL_GATE_TTL_MS, desc: 'Live WCAG check (axe) on the rendered page — usable by everyone, legal-safe.' },
  { name: 'static-a11y', number: 16, stage: 'quality', category: 'Accessibility', kind: 'static', runner: 'node', script: 'check-a11y-static.mjs', desc: 'Pre-deploy a11y in the markup — alt text, labels, tap targets, before it ships.' },
  // ── QUALITY · Commerce & Conversion ──
  { name: 'conversion', number: 7, stage: 'quality', category: 'Commerce & Conversion', kind: 'url', runner: 'node', script: 'gate-conversion.mjs', freshnessTtlMs: URL_GATE_TTL_MS, desc: 'CRO mechanics: hero+CTA, working buy-path, trust signals, sticky add-to-cart.' },
  { name: 'price-binding', number: 38, stage: 'quality', category: 'Commerce & Conversion', kind: 'static', runner: 'node', script: 'check-price-binding.mjs', desc: 'Prices come from live Shopify data, never hardcoded — no fraud risk, multi-currency.' },
  { name: 'imagery', number: 24, stage: 'quality', category: 'Commerce & Conversion', kind: 'static', runner: 'node', script: 'check-media-quality.mjs', enforcement: { policy: 'warn', provenBuilds: 0, reason: 'Art-direction (responsive <picture>/srcset per device crop) is a heuristic about intent; Lens #18 image-art-direction is the authoritative blocker meanwhile. The per-slot weight/format half already blocks. Not yet proven false-positive-free on ≥2 stores — keep art-direction warn until it is.', since: '2026-07-23' }, desc: 'Image weight / format + art-direction — fast LCP, right crop per device.' },
  { name: 'functionality', number: 10, stage: 'quality', category: 'Commerce & Conversion', kind: 'url', runner: 'node', script: 'gate-functional.mjs', freshnessTtlMs: URL_GATE_TTL_MS, desc: 'The store actually works — clicks, add-to-cart, no JS / console errors.' },
  // ── QUALITY · Content & Trust ──
  { name: 'honesty', number: 13, stage: 'quality', category: 'Content & Trust', kind: 'static', runner: 'node', script: 'check-honesty.mjs', desc: 'Blocks fake reviews / fabricated scarcity / fake countdowns — trustworthy + legal.' },
  { name: 'content-quality', number: 36, stage: 'quality', category: 'Content & Trust', kind: 'static', runner: 'node', script: 'check-placeholder-text.mjs', enforcement: { policy: 'block', provenBuilds: 1, reason: 'A dev placeholder (lorem / TEST) in shipped copy is a mechanically-certain defect, never advisory. Already BLOCK-eligible on publish-grade runs via DS_REQUIRE_SCOPE; graduated to block on every run so a placeholder can never ship from a static-only VS Code loop. (The brief-level copy-quality checks that this gate used to absorb moved to check-copy-scorecard.mjs / gate #58 on 2026-08-25 — Phase 3 REMOVE 1.)', since: '2026-07-23' }, desc: 'No dev placeholders (lorem / TEST) in shipped copy.' },
  { name: 'copy-scorecard', number: 58, stage: 'quality', category: 'Content & Trust', kind: 'static', runner: 'node', script: 'check-copy-scorecard.mjs', enforcement: { policy: 'warn', provenBuilds: 0, reason: 'Quill\'s 9-check scorecard (hero-headline ≤8w, subhead ≤25w, cta ≤4w, FK-grade ≤10, passive <10%, avg sentence ≤20w, avg para ≤3s, banned-word=0, hero has number/unit) + the merged brief-level checks (hero-formula / objection-uncovered / voice-reference) from the retired copy-quality gate. Warn-first until proven false-positive-free on ≥2 stores; COPY_SCORECARD_ENFORCE=1 / COPY_ENFORCE=1 / DS_REQUIRE_SCOPE=1 flips to BLOCK for publish-grade.', since: '2026-08-25' }, desc: 'Copy scorecard (9 checks / surface) + brief-level hero-formula / objection / voice.' },
  { name: 'rule-pack', number: 43, stage: 'quality', category: 'Content & Trust', kind: 'static', runner: 'node', script: 'check-rule-pack.mjs', desc: 'Data-driven rules (team + per-store, JSON) — adds enforcement by appending a rule; auto-grown from real defects.' },
  // ── QUALITY · Localization & Tracking ──
  { name: 'translations', number: 28, stage: 'quality', category: 'Localization & Tracking', kind: 'static', runner: 'node', script: 'check-locale-completeness.mjs', enforcement: { policy: 'block', provenBuilds: 1, reason: 'A text key missing from a locale file ships an untranslated fallback to real customers. Shopify splits storefront (*.json) and schema (*.schema.json) locale files; completeness across every declared locale is mechanically checkable. Already BLOCK-eligible via DS_REQUIRE_SCOPE; graduated to block on every run.', since: '2026-07-23' }, desc: 'Every text key exists in every locale — no untranslated fallbacks.' },
  { name: 'app-conflicts', number: 27, stage: 'quality', category: 'Localization & Tracking', kind: 'static', runner: 'node', script: 'check-app-conflicts.mjs', enforcement: { policy: 'warn', provenBuilds: 0, reason: 'App-clash detection (popup wars / duplicate review widgets) is heuristic and store-specific; needs ≥2-store proof before an always-on block. Still BLOCK-eligible on publish-grade runs via DS_REQUIRE_SCOPE.', since: '2026-07-23' }, desc: 'No clashing apps (popup wars, duplicate reviews) that break the storefront.' },
  { name: 'email-triggers', number: 29, stage: 'quality', category: 'Localization & Tracking', kind: 'static', runner: 'node', script: 'check-email-triggers.mjs', enforcement: { policy: 'warn', provenBuilds: 0, reason: 'Depends on a declared lifecycle-email file that many builds legitimately omit; an always-on block would fire on builds that never claimed lifecycle email. Still BLOCK-eligible on publish-grade runs via DS_REQUIRE_SCOPE.', since: '2026-07-23' }, desc: 'Every declared lifecycle email actually has its trigger wired, or it never sends.' },
  { name: 'analytics-wiring', number: 41, stage: 'quality', category: 'Localization & Tracking', kind: 'static', runner: 'node', script: 'check-analytics-wiring.mjs', desc: 'GA4 / Meta pixel + commerce events wired — revenue is actually tracked.' },
  // ── QUALITY · Legal & Privacy ──
  { name: 'legal-pages', number: 37, stage: 'quality', category: 'Legal & Privacy', kind: 'static', runner: 'node', script: 'check-legal-pages.mjs', desc: 'Privacy / Terms / Refund / Shipping / Contact exist + are linked — launch-required.' },
  { name: 'consent', number: 42, stage: 'quality', category: 'Legal & Privacy', kind: 'static', runner: 'node', script: 'check-consent.mjs', desc: 'GDPR cookie-consent present + not blocking the CTA — compliant for EU/UK/CA.' },
]

// ── enforcement graduation (S4) ──────────────────────────────────────────────
// A warn-capable gate gates its blocking behind an *_ENFORCE flag its own script reads. The manifest's
// `enforcement.policy` is the DECISION; this table is the WIRING: gate name → the env var that flips it
// to BLOCK. On spawn, a gate whose manifest says policy:"block" gets its var set to '1' (runOne). So a
// graduation is one manifest edit — no gate-script change — and #44 (check-orchestration) blocks any
// warn-capable gate that carries no dated, reasoned `enforcement` object, so warn-only can never be a
// silent permanent state. The names come from the grep the S4 task ran (`_ENFORCE === '1'`).
const ENFORCE_ENV = {
  'reference-match': 'REFERENCE_MATCH_ENFORCE',
  'content-quality': 'PLACEHOLDER_ENFORCE',
  'copy-scorecard': 'COPY_SCORECARD_ENFORCE',
  'mobile': 'MOBILE_ENFORCE',
  'translations': 'LOCALE_ENFORCE',
  'redirects': 'REDIRECTS_ENFORCE',
  'imagery': 'ART_DIRECTION_ENFORCE',   // the art-direction half absorbed by check-media-quality.mjs
  'design-quality': 'DQ_FORCE_ENFORCE',
  'brand-sync': 'DS_CASCADE_ENFORCE',
  'app-conflicts': 'APP_CONFLICTS_ENFORCE',
  'email-triggers': 'EMAIL_ENFORCE',
  'section-reuse': 'REUSE_MAP_ENFORCE',
}

// Back-compat: old gate names still resolve via --gate <old> and SKIP_<OLD> for one transition.
// Maps every retired/renamed name → its current gate name. Built from scripts/gate-migration-map.json.
const GATE_ALIAS = {
  // round-2 abstract brand → loved purpose name
  'anchor': 'theme-lock', 'brief': 'discovery', 'blueprint': 'foundation', 'syntax': 'code-lint',
  'editable': 'editability', 'hygiene': 'dead-code', 'candor': 'honesty', 'cohesion': 'section-consistency',
  'thumb': 'mobile', 'tokens': 'design-tokens', 'harmony': 'consistency', 'taste': 'design-quality',
  'wiring': 'render-check', 'cards': 'library-cards', 'ladder': 'section-reuse', 'cascade': 'brand-sync',
  'forms': 'static-a11y', 'apps': 'app-conflicts', 'locale': 'translations', 'lifecycle': 'email-triggers',
  'speed': 'performance', 'access': 'accessibility', 'search': 'seo', 'flow': 'functionality',
  'reroute': 'redirects', 'convert': 'conversion', 'media': 'imagery', 'proof': 'content-quality',
  'tribunal': 'review-board', 'lens': 'visual-check',
  // original pre-brand → loved purpose name
  'bootstrap': 'foundation', 'theme-check': 'code-lint', 'antipatterns': 'dead-code', 'css-layout': 'layout',
  'section-cohesion': 'section-consistency', 'mobile-layout': 'mobile', 'design-system': 'design-tokens',
  'render-wiring': 'render-check', 'card-bindings': 'library-cards', 'reuse-map': 'section-reuse',
  'ds-cascade': 'brand-sync', 'a11y-static': 'static-a11y', 'locale-completeness': 'translations',
  'lighthouse': 'performance', 'axe': 'accessibility', 'functional': 'functionality',
  'commerce-readiness': 'conversion', 'conversion-signoff': 'conversion', 'art-direction': 'imagery',
  'image-quality': 'imagery', 'placeholder': 'content-quality', 'copy-quality': 'copy-scorecard',
  'design-review-board': 'review-board', 'red-team': 'review-board', 'visual-truth': 'visual-check',
  'visual-quality': 'visual-check',
}
// new name → [old names], for honoring legacy SKIP_<OLD>=1 waivers during the transition.
const GATE_ALIAS_REVERSE = Object.entries(GATE_ALIAS).reduce((m, [oldN, newN]) => { (m[newN] ||= []).push(oldN); return m }, {})

// ── args ──────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`Boldteq theme gates orchestrator

Usage:
  node theme-gates.mjs [--static-only] [--gate <name>]... [--report-dir <dir>]
  node theme-gates.mjs --verify [--require-full] [--report-dir <dir>]

Gates: ${GATES.map(g => `${g.name}(${g.number})`).join(', ')}
Exit codes: 0 pass/fresh · 1 block/stale · 2 env error
`)
}

function parseArgs(argv) {
  const out = { staticOnly: false, gates: [], reportDir: 'gate-reports', verify: false, requireFull: false, help: false }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--static-only') out.staticOnly = true
    else if (a === '--gate') out.gates.push(argv[++i])
    else if (a === '--report-dir') out.reportDir = argv[++i]
    else if (a === '--verify') out.verify = true
    else if (a === '--require-full') out.requireFull = true
    else if (a === '--help' || a === '-h') out.help = true
    else {
      console.error(`unknown arg: ${a} (see --help)`)
      process.exit(2)
    }
  }
  if (out.gates.some(g => !g) || !out.reportDir) {
    console.error('missing value for --gate / --report-dir')
    process.exit(2)
  }
  return out
}

function resolveUrl() {
  if (process.env.THEME_PREVIEW_URL) return process.env.THEME_PREVIEW_URL
  const store = process.env.STORE
  const themeId = process.env.THEME_ID
  if (store && themeId) {
    const origin = (store.startsWith('http') ? store : `https://${store}`).replace(/\/+$/, '')
    return `${origin}/?preview_theme_id=${encodeURIComponent(themeId)}`
  }
  return null
}

function skipEnvName(gateName) {
  return `SKIP_${gateName.toUpperCase().replace(/-/g, '_')}`
}

function matchesAllowlist(p) {
  return FRESHNESS_ALLOWLIST.some(pre => p === pre || p.startsWith(pre.endsWith('/') ? pre : `${pre}/`))
}

function gitHead(cwd) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function gitBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

// ── verify mode ───────────────────────────────────────────────────────────
function verify(args) {
  const cwd = process.cwd()
  const summaryPath = path.resolve(cwd, args.reportDir, 'summary.json')
  if (!fs.existsSync(summaryPath)) {
    console.error(`verify: ENV-ERROR — no summary at ${summaryPath}; run the gates first`)
    process.exit(2)
  }
  let summary
  try {
    summary = readJson(summaryPath)
  } catch (err) {
    console.error(`verify: ENV-ERROR — unreadable summary.json: ${err.message}`)
    process.exit(2)
  }
  const head = gitHead(cwd)
  if (!head) {
    console.error('verify: ENV-ERROR — not a git repository')
    process.exit(2)
  }
  if (!summary.sha) {
    console.error('verify: ENV-ERROR — summary has no sha (gates ran outside a git repo)')
    process.exit(2)
  }
  if (summary.dirty === true) {
    console.error('verify: STALE — summary was produced from a dirty working tree')
    process.exit(1)
  }
  // publish-grade (--require-full): CHANGES.md must be part of the gated sha — drop it from the
  // freshness allowlist so a post-gate edit to the ask-ledger forces a re-gate (else an item checked
  // off AFTER the gates ran would pass verify while changing publish-acceptance — adversarial #5).
  const allowlist = args.requireFull ? FRESHNESS_ALLOWLIST.filter(p => p !== 'CHANGES.md') : FRESHNESS_ALLOWLIST
  const { dirty: nowDirty } = gitInfo(cwd, allowlist)
  if (nowDirty) {
    console.error('verify: STALE — working tree has non-allowlisted uncommitted changes')
    process.exit(1)
  }
  if (summary.sha !== head) {
    let changed
    try {
      changed = execFileSync('git', ['diff', '--name-only', `${summary.sha}..HEAD`], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
        .split('\n')
        .filter(Boolean)
    } catch {
      console.error(`verify: STALE — summary sha ${summary.sha} not found in history`)
      process.exit(1)
    }
    const offending = changed.filter(p => !allowlist.some(pre => p === pre || p.startsWith(pre.endsWith('/') ? pre : `${pre}/`)))
    if (offending.length > 0) {
      console.error(`verify: STALE — ${offending.length} non-allowlisted file(s) changed since ${summary.sha.slice(0, 7)}:`)
      for (const p of offending.slice(0, 10)) console.error(`  ${p}`)
      process.exit(1)
    }
  }
  // evidence coherence: EVERY per-gate report in the dir must share the summary's sha.
  // Catches the piecemeal pattern — gates run one-by-one (check-*.mjs) at drifting SHAs produce
  // a report dir that no single tree ever generated, so summary.json alone (which is internally
  // consistent) can't see the incoherence. Stride dogfood 2026-06-19: 7 reports across 3 SHAs.
  const reportDirAbs = path.resolve(cwd, args.reportDir)
  const incoherent = []
  const gateReports = []
  try {
    for (const f of fs.readdirSync(reportDirAbs)) {
      if (!f.endsWith('.json') || f === 'summary.json') continue
      let rep
      try { rep = readJson(path.join(reportDirAbs, f)) } catch { continue }
      if (!rep) continue
      if (typeof rep.sha === 'string' && rep.sha !== summary.sha) incoherent.push(`${f}@${rep.sha.slice(0, 7)}`)
      gateReports.push({ gate: rep.gate ?? f.replace(/\.json$/, ''), ts: rep.ts })
    }
  } catch { /* dir scan is best-effort; absence of reports is handled by per-gate verify */ }
  if (incoherent.length > 0) {
    console.error(`verify: INCOHERENT — ${incoherent.length} gate-report(s) at a sha ≠ summary ${summary.sha.slice(0, 7)} (piecemeal/mixed-SHA run): ${incoherent.slice(0, 8).join(', ')}`)
    console.error('  re-run the full orchestrator (`pnpm gates`) so all evidence is produced together at one sha')
    process.exit(1)
  }
  // #3 — per-gate freshness TTL: URL-gate evidence past its TTL is STALE even when the SHA matches
  // (a lighthouse/axe result drifts with the live render). Static gates carry no TTL. FRESHNESS_TTL_OFF=1
  // disables (the dogfood re-gate-then-verify edge, where ts is current anyway).
  if (process.env.FRESHNESS_TTL_OFF !== '1') {
    const ttlByGate = Object.fromEntries(GATES.filter(g => Number.isFinite(g.freshnessTtlMs)).map(g => [g.name, g.freshnessTtlMs]))
    const stale = staleReportsByTtl(ttlByGate, gateReports, Date.now())
    if (stale.length > 0) {
      console.error(`verify: STALE — ${stale.length} URL-gate report(s) past freshness TTL (re-run the gates so the live-render evidence is current):`)
      for (const s of stale.slice(0, 8)) console.error(`  ${s.gate} — ${Math.round(s.ageMs / 3_600_000)}h old (ttl ${Math.round(s.ttlMs / 3_600_000)}h)`)
      process.exit(1)
    }
  }
  if (args.requireFull) {
    if (summary.mode !== 'full') {
      console.error(`verify: FAIL — --require-full but summary mode is "${summary.mode}"`)
      process.exit(1)
    }
    if (summary.pass !== true) {
      console.error('verify: FAIL — --require-full but summary pass=false')
      process.exit(1)
    }
    // defense-in-depth: a waived gate is only acceptable under --require-full with a CHANGES.md ## Waivers entry
    const unjustified = Object.entries(summary.gates || {})
      .filter(([name, g]) => g.waived && !changesWaives(cwd, name))
      .map(([name]) => name)
    if (unjustified.length > 0) {
      console.error(`verify: FAIL — --require-full but gate(s) waived without a CHANGES.md ## Waivers entry: ${unjustified.join(', ')}`)
      process.exit(1)
    }
  }
  console.log(`verify: FRESH — summary @ ${summary.sha.slice(0, 7)} (mode=${summary.mode}, pass=${summary.pass}, ts=${summary.ts})`)
  process.exit(0)
}

// A SKIP_<GATE>=1 waiver only counts as a legitimate pass on an authoritative
// (full) run if CHANGES.md `## Waivers` names the gate — otherwise the orchestrator
// must treat the waiver as a FAIL (audit fix: a waived gate cannot silently pass --require-full).
function changesWaives(cwd, gateName) {
  try {
    const text = fs.readFileSync(path.resolve(cwd, 'CHANGES.md'), 'utf-8')
    const m = text.match(/^##\s*Waivers\b([\s\S]*)/im)
    if (!m) return false
    const section = m[1].split(/\n##\s/)[0] // the Waivers section only — up to the next ## heading
    return new RegExp(`\\b${gateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(section)
  } catch {
    return false
  }
}

// ── run mode ──────────────────────────────────────────────────────────────
function indent(text) {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
    .map(l => `    │ ${l}`)
    .join('\n')
}

async function runGates(args) {
  const cwd = process.cwd()
  const url = resolveUrl()

  let mode
  let selected
  if (args.gates.length > 0) {
    mode = 'gate-subset'
    selected = args.gates.map(name => {
      const gate = GATES.find(g => g.name === name) || GATES.find(g => g.name === GATE_ALIAS[name])
      if (!gate) {
        console.error(`unknown gate: ${name} (valid: ${GATES.map(g => g.name).join(', ')})`)
        process.exit(2)
      }
      return gate
    })
    // ALWAYS-ON CORE (2026-07-22 cravinbyandy forensics): a --gate subset must never be able to
    // exclude the gates that prove the run itself is trustworthy. On cravinbyandy the final run was
    // `--gate` × 7 and it EXCLUDED #3 editability — the one gate that was BLOCKing on the missing
    // baseline tag — so the report read green while 8 gates were silently skipping. Force them in.
    const CORE = ['foundation', 'editability', 'gate-integrity']
    for (const name of CORE) {
      const g = GATES.find(x => x.name === name)
      if (g && !selected.some(s => s.name === g.name)) { selected.push(g); console.log(`note: forcing always-on core gate "${name}" into this subset (subsets may not hide run-integrity gates)`) }
    }
  } else if (args.staticOnly) {
    mode = 'static-only'
    selected = GATES.filter(g => g.kind === 'static')
  } else if (url) {
    mode = 'full'
    selected = [...GATES.filter(g => g.kind === 'static'), ...GATES.filter(g => g.kind === 'url')]
  } else {
    mode = 'static-only'
    selected = GATES.filter(g => g.kind === 'static')
    console.log('note: no preview URL (THEME_PREVIEW_URL / STORE+THEME_ID) — URL gates out of scope, mode=static-only')
  }

  const reportDirAbs = path.resolve(cwd, args.reportDir)
  fs.mkdirSync(reportDirAbs, { recursive: true })

  const results = {} // name → { pass, blockers, warnings, skipped, reason, waived, exitCode }
  const toSpawn = [] // gates needing a subprocess (after synchronous skip/waive pre-checks)

  for (const gate of selected) {
    // honor SKIP_<NEWNAME>=1 and any legacy SKIP_<OLDNAME>=1 (back-compat during the rename transition)
    const skipEnvs = [skipEnvName(gate.name), ...(GATE_ALIAS_REVERSE[gate.name] || []).map(skipEnvName)]
    const hitSkip = skipEnvs.find(e => process.env[e] === '1')
    if (hitSkip) {
      console.log(`  gate ${gate.name} ... WAIVED (${hitSkip}=1)`)
      results[gate.name] = { pass: false, blockers: [], warnings: [], skipped: true, reason: `waived via ${hitSkip}=1`, waived: true }
      continue
    }
    const scriptPath = path.join(SCRIPTS_DIR, gate.script)
    if (gate.kind === 'url' && !url) {
      console.log(`  gate ${gate.name} ... SKIP (no preview URL)`)
      results[gate.name] = { pass: false, blockers: [], warnings: [], skipped: true, reason: 'no preview URL', waived: false }
      continue
    }
    if (!fs.existsSync(scriptPath)) {
      console.log(`  gate ${gate.name} ... SKIP (gate script not found: scripts/${gate.script})`)
      results[gate.name] = { pass: false, blockers: [], warnings: [], skipped: true, reason: `gate script not found: scripts/${gate.script}`, waived: false }
      continue
    }
    const reportPath = path.join(reportDirAbs, `${gate.name}.json`)
    fs.rmSync(reportPath, { force: true }) // never read a stale report from a previous run
    toSpawn.push({ gate, scriptPath, reportPath })
  }

  // Shared child env (identical semantics to the old per-gate env).
  // Authoritative (full) run = publish-grade: the block-eligible warn gates BLOCK (DS_REQUIRE_SCOPE) and
  // conversion honesty runs strict. Extracted to lib/publish-grade.mjs so the invariant is unit-proven
  // (publish-grade.run-tests) and this critical wiring cannot silently regress. (B3)
  const baseEnv = applyPublishGrade(mode, { ...process.env, REPORT_DIR: args.reportDir })
  if (url) baseEnv.THEME_PREVIEW_URL = url
  if (!baseEnv.THEME_STORE_PASSWORD && process.env.STOREFRONT_PASSWORD) baseEnv.THEME_STORE_PASSWORD = process.env.STOREFRONT_PASSWORD

  // P0 #14 fix: run the gates with bounded concurrency — wall-clock = the SLOWEST gate, not the
  // SUM. Gates are independent processes writing separate reports, so this is safe. SEQUENTIAL=1
  // forces the old serial behavior. Verbose per-gate output is buffered + printed in selected order.
  const cap = process.env.GATES_SEQUENTIAL === '1' ? 1 : Math.max(1, Math.min(8, os.cpus?.().length || 4))
  const logs = {}
  const runOne = async ({ gate, scriptPath, reportPath }) => {
    // Graduation wiring: a gate the manifest marks policy:"block" is spawned with its *_ENFORCE var set,
    // so it BLOCKS instead of warns. Per-gate (not baseEnv) so one gate's enforce flag never leaks to
    // another — each var is read only by its own gate anyway, but scoping it keeps the intent explicit.
    const enfVar = ENFORCE_ENV[gate.name]
    const env = (enfVar && gate.enforcement && gate.enforcement.policy === 'block') ? { ...baseEnv, [enfVar]: '1' } : baseEnv
    const child = await runGateProc(gate.runner, [scriptPath], { cwd, env, timeout: 600_000 })
    let report = null
    try { report = readJson(reportPath) } catch { report = null }
    const code = child.error ? 2 : (child.code ?? 2)
    if (code === 0 || code === 1) {
      results[gate.name] = { pass: code === 0, blockers: report?.blockers ?? [], warnings: report?.warnings ?? [], skipped: false, reason: null, waived: false, exitCode: code }
      console.log(`  gate ${gate.name} ... ${code === 0 ? 'PASS' : 'BLOCK'}`)
    } else {
      const reason = report?.evidence?.reason ?? (child.error ? child.error.message : null) ?? String(child.stderr || '').split('\n').find(Boolean) ?? `gate exited ${code}`
      results[gate.name] = { pass: false, blockers: report?.blockers ?? [], warnings: report?.warnings ?? [], skipped: true, reason, waived: false, exitCode: code }
      console.log(`  gate ${gate.name} ... SKIP-ENV (exit ${code})`)
    }
    logs[gate.name] = indent(`${child.stdout || ''}${child.stderr || ''}`)
  }
  // gate-integrity AUDITS the other gates' reports, so it must run LAST and alone — inside the
  // parallel pool it would read stale/partial reports from the previous run and audit the wrong state.
  const integrityTask = toSpawn.find(t => t.gate.name === 'gate-integrity')
  const poolTasks = toSpawn.filter(t => t.gate.name !== 'gate-integrity')
  if (poolTasks.length) console.log(`  running ${poolTasks.length} gate(s) — up to ${cap} in parallel...`)
  await pool(poolTasks, cap, runOne)
  if (integrityTask) { console.log('  running gate-integrity last (audits this run\'s reports)...'); await runOne(integrityTask) }
  for (const gate of selected) { if (logs[gate.name]) console.log(logs[gate.name]) }

  // pass = all executed gates pass; a SKIP_<GATE>=1 waiver only passes on a FULL run if
  // CHANGES.md `## Waivers` justifies it (audit fix); a dev (static-only/subset) run still
  // honors bare waivers. A non-waived skip (exit 2 / no URL / missing script) always fails.
  const overallPass = Object.entries(results).every(([name, r]) =>
    r.waived
      ? (mode === 'full' ? changesWaives(cwd, name) : true)
      : r.skipped ? false : r.pass,
  )

  const { sha, dirty } = gitInfo(cwd, FRESHNESS_ALLOWLIST)
  // #1 — roll every finding up into {block, warn, advise} totals across the run (feeds the FP-trend
  // dashboard #2 + governance routing). Blockers carry severity 'block'; warnings 'warn' unless a gate
  // opted one down to 'advise'.
  const allFindings = []
  for (const r of Object.values(results)) allFindings.push(...(r.blockers || []), ...(r.warnings || []))
  const summary = {
    toolkitVersion: toolkitVersion(),
    ts: new Date().toISOString(),
    sha,
    dirty,
    branch: gitBranch(cwd),
    mode,
    url,
    gates: Object.fromEntries(
      Object.entries(results).map(([name, r]) => [
        name,
        { pass: r.pass, blockers: r.blockers, warnings: r.warnings, skipped: r.skipped, waived: r.waived, reason: r.reason },
      ]),
    ),
    severityCounts: countSeverities(allFindings),
    pass: overallPass,
  }
  fs.writeFileSync(path.join(reportDirAbs, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  writeSummaryMd(reportDirAbs, selected, results, summary) // human-readable companion (gate-reports/SUMMARY.md)

  // aligned table
  const rows = selected.map(g => {
    const r = results[g.name]
    const status = r.waived ? 'WAIVED' : r.skipped ? 'SKIP' : r.pass ? 'PASS' : 'BLOCK'
    return [String(g.number), g.name, status, r.skipped ? '—' : String(r.blockers.length), r.skipped ? '—' : String(r.warnings.length), r.reason ?? '—']
  })
  const header = ['#', 'GATE', 'RESULT', 'BLOCKERS', 'WARNINGS', 'NOTE']
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)))
  const fmt = row => row.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(`\n${fmt(header)}`)
  console.log(widths.map(w => '─'.repeat(w)).join('──'))
  for (const row of rows) console.log(fmt(row))
  // 14-group rollup (ADDITIVE — the 49 gates above are the source of truth; this only makes the result
  // read as 14 concern-groups so the stack feels less sprawling). Skips silently if gate-groups.json absent.
  const groups = loadGateGroups()
  if (groups.length) {
    const idx = groupIndex(groups)
    const roll = new Map(groups.map(g => [g.id, { title: g.title, block: 0, warn: 0, skip: 0, total: 0 }]))
    for (const g of selected) {
      const grp = idx.get(g.script)
      if (!grp || !roll.has(grp.id)) continue
      const r = results[g.name]; const acc = roll.get(grp.id)
      acc.total += 1
      if (r.skipped) acc.skip += 1
      else if (!r.pass && !r.waived) acc.block += 1
      else acc.warn += r.warnings.length
    }
    const active = [...roll.values()].filter(a => a.total > 0)
    const blocked = active.filter(a => a.block > 0)
    console.log(`\n14-group view — ${active.length - blocked.length}/${active.length} groups clean${blocked.length ? `, ${blocked.length} blocking:` : ''}`)
    for (const a of blocked) console.log(`  ✗ ${a.title} — ${a.block} blocking gate(s)`)
  }
  console.log(`\nmode=${mode} sha=${sha ? sha.slice(0, 7) : 'null'} dirty=${dirty} → ${overallPass ? 'PASS' : 'BLOCK'}`)
  console.log(`summary: ${path.join(reportDirAbs, 'summary.json')}`)

  process.exit(overallPass ? 0 : 1)
}

// ── main ──────────────────────────────────────────────────────────────────
// --list-json prints the manifest as machine-readable JSON (number/name/kind/runner/script) — the
// single source of truth for tooling that must reason about the gate stack (the stack-coherence
// meta-test, the workspace dashboard). Additive; never read GATES[] by parsing this file's text.
if (process.argv.includes('--list-json')) {
  const json = JSON.stringify(GATES.map(g => ({ number: g.number, name: g.name, stage: g.stage, category: g.category, kind: g.kind, runner: g.runner, script: g.script, enforcement: g.enforcement, desc: g.desc })), null, 2)
  // writeSync to fd 1 (not console.log + process.exit) — the manifest now exceeds the ~8KB stdout
  // pipe-flush boundary, so an async console.log gets TRUNCATED when process.exit() fires first.
  fs.writeSync(1, json + '\n')
  process.exit(0)
}
// --list prints the live gate manifest (number · name · kind · script). Ground any gap-audit
// in THIS, not from memory — agent audits go stale fast (atrium's 2026-06-19 audit claimed gates
// missing that already shipped). One command = the current source of truth.
if (process.argv.includes('--list')) {
  console.log(`Boldteq theme gate stack — ${GATES.length} gates · stage → category (toolkit ${toolkitVersion()})`)
  for (const stage of ['setup', 'quality']) {
    console.log(`\n══ ${stage.toUpperCase()} ══`)
    for (const cat of [...new Set(GATES.filter(g => g.stage === stage).map(g => g.category))]) {
      console.log(`  ▸ ${cat}`)
      for (const g of GATES.filter(g => g.stage === stage && g.category === cat)) console.log(`     #${String(g.number).padStart(4)} ${g.name.padEnd(20)} ${g.desc}`)
    }
  }
  console.log(`
Audit commands (the gates scan the CURRENT directory — run from the theme repo you're auditing):
  cd theme-toolkit            # the pnpm aliases live here
  pnpm theme:audit            # complete STATIC sweep → gate-reports/SUMMARY.md (human-readable)
  pnpm theme:audit:full       # + URL gates (lighthouse/axe/seo/conversion/functional) — needs THEME_PREVIEW_URL
  pnpm gates:list             # this manifest
  pnpm store:preflight        # live-store access + content-quality preflight (needs SHOPIFY_ADMIN_API_TOKEN)
  pnpm gates:verify           # check a PRIOR full run is fresh+passing (publish gate — does NOT run the gates)
In a client theme repo (toolkit vendored as toolkit/): run \`node toolkit/scripts/theme-gates.mjs --static-only\` from the repo root.`)
  process.exit(0)
}
// --list-groups prints the SIMPLIFIED 14-group view (gate-groups.json) — the same 49 gates, grouped by
// concern so the stack is easier to reason about. #57 (check-group-coverage) guarantees this is lossless.
if (process.argv.includes('--list-groups')) {
  const groups = loadGateGroups()
  if (!groups.length) { console.error('no gate-groups.json found (theme-toolkit/gate-groups.json)'); process.exit(2) }
  const byScript = new Map(GATES.map(g => [g.script, g]))
  console.log(`Boldteq theme gate stack — ${groups.length} groups over ${GATES.length} gates (toolkit ${toolkitVersion()})`)
  for (const grp of groups) {
    const members = (grp.members || []).map(m => byScript.get(m)).filter(Boolean)
    console.log(`\n▸ ${grp.title}  (${members.length})`)
    for (const g of members) console.log(`     #${String(g.number).padStart(4)} ${g.name.padEnd(24)} ${g.desc || ''}`)
  }
  console.log(`\nThe 14 groups run the SAME 49 gates (nothing is dropped) — check-group-coverage.mjs (#57) proves the map is lossless. Full detail: --list. Machine form: --list-json.`)
  process.exit(0)
}
const args = parseArgs(process.argv)
if (args.help) {
  printHelp()
  process.exit(0)
}
if (args.verify) verify(args)
else await runGates(args)
