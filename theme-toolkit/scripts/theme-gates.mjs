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
  if (skipped.length) { L.push(`## ⏭️ Skipped / waived (${skipped.length})`, ''); for (const g of skipped) L.push(`- #${g.number} ${g.name} — ${results[g.name].reason || 'skipped'}`); L.push('') }
  if (passed.length) L.push(`## ✅ Passed (${passed.length})`, '', passed.map(g => `#${g.number} ${g.name}`).join(' · '), '')
  fs.writeFileSync(path.join(dir, 'SUMMARY.md'), `${L.join('\n')}\n`)
}

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const FRESHNESS_ALLOWLIST = ['gate-reports', 'CHANGES.md', 'merchant-editability.md', 'docs']
// #3 — URL-gate evidence reflects a LIVE render and drifts by wall-clock even at the same SHA, so it
// expires on a TTL. Static gates are deterministic from the committed tree → no time-TTL (SHA is their
// freshness). FRESHNESS_TTL_OFF=1 disables the check (dogfood / re-gate-then-verify edge).
const URL_GATE_TTL_MS = 24 * 60 * 60 * 1000

const GATES = [
  // Gate 0 — theme lock: every push targets the linked theme only, never live/another store
  // (static; lenient on a missing lock — THEME_LOCK_REQUIRED=1 makes absence a blocker at publish).
  { name: 'theme-lock', number: 0, kind: 'static', runner: 'node', script: 'shopify-theme-guard.mjs' },
  // Gate 0.4 — discovery-complete: the structured BRIEF (docs/discovery/goals.json numeric targets
  // + docs/design/brand-direction.md) must exist before design/build dispatch. Mechanizes the prose
  // gate in shopify-technical-goals-discovery.md §4 — the dispatch-time refusal that makes "brief in
  // → store out" real. Static; warns in dev, BLOCKS at dispatch/publish-grade (DS_REQUIRE_SCOPE).
  { name: 'discovery', number: 0.4, kind: 'static', runner: 'node', script: 'check-discovery.mjs' },
  // Gate 0.5 — bootstrap-complete: the FOUNDATION must exist before any QA gate is meaningful
  // (design-system.json present, JSON templates/config parse, store identity not a placeholder,
  // baseline tag). Static; warns in dev, BLOCKS at publish-grade (DS_REQUIRE_SCOPE). Stops a build
  // reaching the gates on a broken base — where ~12 downstream gates "skip — scope unresolvable"
  // and the run reads as fine. Runs first so the failure is loud + at-the-door.
  { name: 'bootstrap', number: 0.5, kind: 'static', runner: 'node', script: 'check-bootstrap.mjs' },
  { name: 'lighthouse', number: 1, kind: 'url', runner: 'node', script: 'gate-lighthouse.mjs', freshnessTtlMs: URL_GATE_TTL_MS },
  { name: 'theme-check', number: 2, kind: 'static', runner: 'node', script: 'gate-theme-check.mjs' },
  { name: 'editability', number: 3, kind: 'static', runner: 'bash', script: 'gate-editability-greps.sh' },
  { name: 'axe', number: 5, kind: 'url', runner: 'node', script: 'gate-axe.mjs', freshnessTtlMs: URL_GATE_TTL_MS },
  { name: 'seo', number: 6, kind: 'url', runner: 'node', script: 'gate-seo.mjs', freshnessTtlMs: URL_GATE_TTL_MS },
  { name: 'conversion', number: 7, kind: 'url', runner: 'node', script: 'gate-conversion.mjs', freshnessTtlMs: URL_GATE_TTL_MS },
  // DGS — design cohesion (static; run in full + --static-only + covered by --verify/--require-full).
  { name: 'design-system', number: 8, kind: 'static', runner: 'node', script: 'check-design-system.mjs' },
  { name: 'consistency', number: 9, kind: 'static', runner: 'node', script: 'check-consistency.mjs' },
  // Verification Layer 3 — functional/interaction smoke (drives real flows, url-kind).
  { name: 'functional', number: 10, kind: 'url', runner: 'node', script: 'gate-functional.mjs', freshnessTtlMs: URL_GATE_TTL_MS },
  // Prevention — dead-code/bloat anti-patterns (static; the rest of the library is gates above + the review board).
  { name: 'antipatterns', number: 11, kind: 'static', runner: 'node', script: 'check-antipatterns.mjs' },
  // Design QUALITY — per-niche taste fingerprint vs the DNA pack (static; calibration-gated so
  // an untuned pack warns rather than blocks). Covered by --static-only + --verify/--require-full.
  { name: 'design-quality', number: 12, kind: 'static', runner: 'node', script: 'check-design-quality.mjs' },
  // Honesty — fake-urgency / fabricated-scarcity / unsourced-claim killer (static; blocks
  // evergreen countdowns + hardcoded scarcity, warns on fake-activity/unsourced stats).
  { name: 'honesty', number: 13, kind: 'static', runner: 'node', script: 'check-honesty.mjs' },
  // Render-wiring — tokens must RENDER, not just conform on paper (static; closes the #8/#12 blind
  // spot where color schemes + fonts are declared but never wired → flat black-on-white default).
  { name: 'render-wiring', number: 14, kind: 'static', runner: 'node', script: 'check-render-wiring.mjs' },
  // Commerce-readiness — the PDP must be able to TRANSACT, not just render (static; catches an
  // editorial-only product template with no form/price/variant — a store that sells nothing).
  { name: 'commerce-readiness', number: 15, kind: 'static', runner: 'node', script: 'check-commerce-readiness.mjs' },
  // Static a11y — the high-frequency a11y/mobile defects axe (#5, url-kind) can't catch pre-deploy
  // (advisory WARN; A11Y_STRICT=1 promotes to block). Complements, doesn't replace, the runtime axe gate.
  { name: 'a11y-static', number: 16, kind: 'static', runner: 'node', script: 'check-a11y-static.mjs' },
  // Visual-quality — "gates-green ≠ looks-good" (static VERIFIER of onyx's agentic visual review).
  // Warns if the review artifact is absent in dev; BLOCKS at publish-grade (DS_REQUIRE_SCOPE) when
  // missing/unapproved/<min-confidence/any-fail. The judgment is onyx's; this enforces it mechanically.
  { name: 'visual-quality', number: 17, kind: 'static', runner: 'node', script: 'check-visual-quality.mjs' },
  // Visual-truth (Lens · Layer 3) — the static ENFORCER of the Lens pass (lens-capture.mjs renders
  // every surface; vision subagents judge each frame against its rubric). This gate aggregates
  // gate-reports/lens/{lens-manifest,judge/*}.json → BLOCKS on render-error / overflow / broken image
  // / judge FAIL / low-confidence / blocker finding / systemic cross-frame defect. Warns if the Lens
  // pass is absent in dev; BLOCKS at publish-grade (DS_REQUIRE_SCOPE/LENS_REQUIRE). This is the
  // pixels-actually-looked-right signal #17 (self-attestation) cannot give. mantle blocks publish on it.
  { name: 'visual-truth', number: 18, kind: 'static', runner: 'node', script: 'check-visual-truth.mjs' },
  // Section-cohesion (#19, URL) — the render-time "do the sections feel like ONE page?" enforcer.
  // #8 locks the token SET + #9 counts store-wide variety, but neither sees a rendered page: section A
  // can ship h2=32 and section B h2=28 and both pass. This pulls COMPUTED styles per section on the
  // staging URL and BLOCKs cross-section drift (off-ladder type, off-scale padding, multi-H1) against
  // design-system.json. Content-only (chrome excluded). mantle gates publish.
  { name: 'section-cohesion', number: 19, kind: 'url', runner: 'node', script: 'check-section-cohesion.mjs', freshnessTtlMs: URL_GATE_TTL_MS },
  // Card-bindings (#20, LIBRARY) — proves a component-library card renders DGS-conformant + honest
  // + wired by instantiating it into a Dawn-style section (binding its ## Design-system bindings
  // roles to theme-native vars — the loom step) and running #8/#13/#14 against it. Catches a
  // drifting card BEFORE drape/stitch consume it. kind:'library' — it scans the LIBRARY, not the
  // theme repo in cwd, so it is EXCLUDED from the static/url theme sweeps; run it explicitly with
  // `--gate card-bindings` (CI library check) or `node check-card-bindings.mjs` directly.
  { name: 'card-bindings', number: 20, kind: 'library', runner: 'node', script: 'check-card-bindings.mjs' },
  // Conversion sign-off (#21, static) — makes catalyst's lift_target MACHINE-CHECKABLE. #7 enforces
  // CRO mechanics but not the lift TARGET; this verifies docs/cro/catalyst-signoff.json applied the
  // canonical rule (lift_target = niche_benchmark × 2.5, ×1.5 sparse) + is signed + names surfaces +
  // cites ≥5 decoder brands. Records the COMPUTED target, never a measured lift. mantle blocks publish.
  { name: 'conversion-signoff', number: 21, kind: 'static', runner: 'node', script: 'check-conversion-signoff.mjs' },
  // CSS-layout (#22, static) — the DETERMINISTIC complement to Lens #18. Lens's vision judge demotes
  // sub-confidence layout calls to warnings; this catches the deterministic 80% on the BUILD's own CSS
  // (custom section {% style %} blocks + build-authored assets/*.css; vendor Dawn/Minimog CSS out of
  // scope): viewport-overflow `100vw` (blocker at publish-grade), no-wrap flex rows / white-space:nowrap /
  // large negative margins (advisory). Covered by --static-only + --verify/--require-full.
  { name: 'css-layout', number: 22, kind: 'static', runner: 'node', script: 'check-css-layout.mjs' },
  // Section-reuse map (#23, static) — onyx Audit-7 / stitch self-check, now an authoritative manifest
  // gate (was an orphan validator: existed but unwired → falsely signalled coverage). Enforces the
  // reuse ladder: ≥70% REUSE+CONFIGURE share, Custom split reconciliation, scratch-custom needs a
  // `blueprint: none (...)` justification, Counts custom == new sections/*.liquid since base. SKIPS when
  // no new sections (not applicable — never false-BLOCKs a refresh). Phase A warn-only by default;
  // REUSE_MAP_ENFORCE=1 flips to BLOCK after the ≥2-store dogfood. Covered by --static-only + --require-full.
  { name: 'reuse-map', number: 23, kind: 'static', runner: 'node', script: 'check-reuse-map.mjs' },
  // Art-direction (#24, WS-C) — deterministic complement to Lens #18: when design-system.json declares
  // imagery.art_direction, hero/banner must render responsive sources (<picture>/srcset/image_tag).
  // WARN-ONLY (ART_DIRECTION_ENFORCE=1 to BLOCK after ≥2 stores); SKIPS when art_direction not declared.
  { name: 'art-direction', number: 24, kind: 'static', runner: 'node', script: 'check-art-direction.mjs' },
  // Redirects (#25, #30) — redirect-map validation: self-redirects/loops/multi-hop chains/dead targets
  // (beacon's SEO sign-off, made machine-checkable). Static + hermetic (validates the map rows); an
  // opt-in live crawl (REDIRECTS_CRAWL=1) asserts ≤1 hop to 200. SKIPS when there's no redirect map
  // (greenfield/refresh = not a migration). Covered by --static-only + --verify/--require-full.
  { name: 'redirects', number: 25, kind: 'static', runner: 'node', script: 'check-redirects.mjs' },
  // Copy-quality (#26, #23/#24/#25) — ink's DoD made machine-checkable: hero formula+citation,
  // objection coverage, voice reference. Warn-first (COPY_ENFORCE=1 / DS_REQUIRE_SCOPE → BLOCK); SKIPS
  // when there are no content/briefs. Covered by --static-only + --verify/--require-full.
  { name: 'copy-quality', number: 26, kind: 'static', runner: 'node', script: 'check-copy-quality.mjs' },
  // App-conflicts (#27, #55) — flags conflict groups (popup wars, duplicate review/subscription/cart
  // apps, competing page builders) with ≥2 members in the theme source. Warn-first
  // (APP_CONFLICTS_ENFORCE=1 / DS_REQUIRE_SCOPE → BLOCK); SKIPS when there's no theme.
  { name: 'app-conflicts', number: 27, kind: 'static', runner: 'node', script: 'check-app-conflicts.mjs' },
  // Locale-completeness (#28, #51) — every key in the default storefront locale must exist in every
  // other locale (no untranslated fallbacks). Warn-first (LOCALE_ENFORCE=1 / DS_REQUIRE_SCOPE → BLOCK);
  // SKIPS a monolingual store (<2 locale files).
  { name: 'locale-completeness', number: 28, kind: 'static', runner: 'node', script: 'check-locale-completeness.mjs' },
  // Email-triggers (#29, #35) — every declared lifecycle email (welcome/cart-abandon/post-purchase/…)
  // must have its trigger wired, or it never sends. Warn-first (EMAIL_ENFORCE=1 / DS_REQUIRE_SCOPE →
  // BLOCK); SKIPS when there's no docs/email/lifecycle.json (not an email build).
  { name: 'email-triggers', number: 29, kind: 'static', runner: 'node', script: 'check-email-triggers.mjs' },
  // DS-cascade (#30, #2) — a brand-change must CASCADE: assets/design-system.css must be regenerated
  // (its stamped ds-hash matches design-system.json) so editing the brand once propagates everywhere.
  // BLOCKS a stale/missing cascade at publish-grade (DS_CASCADE_ENFORCE=1 / DS_REQUIRE_SCOPE); warns on
  // sections hardcoding literals that won't cascade. SKIPS when there's no design-system.json.
  { name: 'ds-cascade', number: 30, kind: 'static', runner: 'node', script: 'check-ds-cascade.mjs' },
  // Image-quality (#34) — was an ORPHAN validator (tested but unwired → false coverage). Per-slot
  // resolution/aspect/weight at upload (an oversized hero is the #1 LCP killer). Warn-first
  // (IMAGE_QUALITY_STRICT=1 / PORTER_REQUIRE_CONTENT=1 → BLOCK); SKIPS when there's no images dir.
  { name: 'image-quality', number: 34, kind: 'static', runner: 'node', script: 'check-image-quality.mjs' },
  // Gate 31 — design-review-board: mechanizes the governance-OS §5 8-role sign-off (any block / any
  // confidence <70 / partial board → fail). Verifies the board-verdict artifact; warn-first (BLOCKS at
  // publish-grade DS_REQUIRE_SCOPE/DRB_REQUIRE). Makes "the board ran" machine-checkable, not prose.
  { name: 'design-review-board', number: 31, kind: 'static', runner: 'node', script: 'check-design-review-board.mjs' },
  // Gate 32 — red-team: mechanizes governance-OS §6. A dedicated adversary (independent of the builder)
  // attacks along 4 axes BEFORE the board; every finding must be resolved or accepted-with-rationale;
  // an unanswered attack blocks. Verifies the red-team artifact; warn-first (BLOCKS at publish-grade).
  { name: 'red-team', number: 32, kind: 'static', runner: 'node', script: 'check-red-team.mjs' },
  // Gate 35 — mobile-layout: the DETERMINISTIC enforcer of the mobile-first protocol (viewport meta,
  // font/tap-target floors, hover-only affordances, 100vw overflow guards, sticky mobile ATC) on the
  // build's custom surface — the hermetic complement to Lens's visual mobile judgment. Warn-first
  // (MOBILE_ENFORCE=1 / DS_REQUIRE_SCOPE → BLOCK on viewport-meta + sub-12px font); SKIPS when no custom
  // surface. Covered by --static-only + --verify/--require-full.
  { name: 'mobile-layout', number: 35, kind: 'static', runner: 'node', script: 'check-mobile-layout.mjs' },
]

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
      const gate = GATES.find(g => g.name === name)
      if (!gate) {
        console.error(`unknown gate: ${name} (valid: ${GATES.map(g => g.name).join(', ')})`)
        process.exit(2)
      }
      return gate
    })
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
    const skipEnv = skipEnvName(gate.name)
    if (process.env[skipEnv] === '1') {
      console.log(`  gate ${gate.name} ... WAIVED (${skipEnv}=1)`)
      results[gate.name] = { pass: false, blockers: [], warnings: [], skipped: true, reason: `waived via ${skipEnv}=1`, waived: true }
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
  const baseEnv = { ...process.env, REPORT_DIR: args.reportDir }
  if (url) baseEnv.THEME_PREVIEW_URL = url
  // Authoritative (full) run = publish-grade: static scope-aware gates BLOCK on an unresolvable
  // scan scope (no green-on-nothing) + the conversion gate runs strict.
  if (mode === 'full' && !baseEnv.DS_REQUIRE_SCOPE) baseEnv.DS_REQUIRE_SCOPE = '1'
  if (mode === 'full' && !baseEnv.STRICT_CONVERSION) baseEnv.STRICT_CONVERSION = '1'
  if (!baseEnv.THEME_STORE_PASSWORD && process.env.STOREFRONT_PASSWORD) baseEnv.THEME_STORE_PASSWORD = process.env.STOREFRONT_PASSWORD

  // P0 #14 fix: run the gates with bounded concurrency — wall-clock = the SLOWEST gate, not the
  // SUM. Gates are independent processes writing separate reports, so this is safe. SEQUENTIAL=1
  // forces the old serial behavior. Verbose per-gate output is buffered + printed in selected order.
  const cap = process.env.GATES_SEQUENTIAL === '1' ? 1 : Math.max(1, Math.min(8, os.cpus?.().length || 4))
  const logs = {}
  if (toSpawn.length) console.log(`  running ${toSpawn.length} gate(s) — up to ${cap} in parallel...`)
  await pool(toSpawn, cap, async ({ gate, scriptPath, reportPath }) => {
    const child = await runGateProc(gate.runner, [scriptPath], { cwd, env: baseEnv, timeout: 600_000 })
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
  })
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
  console.log(`\nmode=${mode} sha=${sha ? sha.slice(0, 7) : 'null'} dirty=${dirty} → ${overallPass ? 'PASS' : 'BLOCK'}`)
  console.log(`summary: ${path.join(reportDirAbs, 'summary.json')}`)

  process.exit(overallPass ? 0 : 1)
}

// ── main ──────────────────────────────────────────────────────────────────
// --list-json prints the manifest as machine-readable JSON (number/name/kind/runner/script) — the
// single source of truth for tooling that must reason about the gate stack (the stack-coherence
// meta-test, the workspace dashboard). Additive; never read GATES[] by parsing this file's text.
if (process.argv.includes('--list-json')) {
  console.log(JSON.stringify(GATES.map(g => ({ number: g.number, name: g.name, kind: g.kind, runner: g.runner, script: g.script })), null, 2))
  process.exit(0)
}
// --list prints the live gate manifest (number · name · kind · script). Ground any gap-audit
// in THIS, not from memory — agent audits go stale fast (atrium's 2026-06-19 audit claimed gates
// missing that already shipped). One command = the current source of truth.
if (process.argv.includes('--list')) {
  console.log(`Boldteq theme gate stack — ${GATES.length} gates (toolkit ${toolkitVersion()})`)
  for (const g of GATES) console.log(`  #${String(g.number).padStart(2)} ${g.name.padEnd(20)} ${g.kind.padEnd(7)} ${g.script}`)
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
const args = parseArgs(process.argv)
if (args.help) {
  printHelp()
  process.exit(0)
}
if (args.verify) verify(args)
else await runGates(args)
