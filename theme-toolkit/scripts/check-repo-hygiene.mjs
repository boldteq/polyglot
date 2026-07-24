#!/usr/bin/env node
// Gate #48 repo-hygiene — the corpus NO other gate and NO rule can see.
//
// The rule engine (check-rule-pack.mjs:67-74) walks sections/layout/snippets liquid, templates json and
// assets css. Everything this gate checks is outside that corpus, so a defect here is invisible to the
// entire stack AND to `shopify theme check`:
//   · .theme-check.yml            — a config copied verbatim from another client keeps ITS ignores, so
//                                   theme-check silences rules for files that do not exist here, and
//                                   (without excludes) walks toolkit/ + gate-reports/ + docs/ and buries
//                                   the real signal under our own tooling.
//   · config/settings_schema.json — theme_info still claiming the vendor theme after a custom build.
//   · locales/*.schema.json       — gate #51 (locale-completeness) excludes schema locales BY DESIGN, so
//                                   theme-editor label translations are checked by nothing at all.
//   · asset FILENAMES             — client CONTENT photos committed to assets/ are Prime-Directive-2
//                                   breakage: the merchant cannot change a photo the theme hardcodes.
//                                   Third-party BRAND artwork in assets/ is also a trademark exposure.
//   · git history                 — a 54MB mp4 added once is in the pack forever.
//
// Boldteq standard, not a Shopify rule: Shopify's Theme Store neither requires schema-locale parity nor
// bans content images in assets/. We are stricter because client themes get handed over to merchants.
//
// Usage:
//   node check-repo-hygiene.mjs                 audit the theme repo in cwd
//
// Env:
//   BASE_REF                git ref of the theme base (default "base"). Scopes the asset scan, the
//                           git-history scan (`--not <base>`) and the "custom work exists"
//                           precondition to what THIS build added. Unresolvable → WARN + skip those
//                           scans (never a silent green).
//                           DELIBERATE EXCEPTION — the two config-file checks are whole-repo. A
//                           .theme-check.yml copied from another client is normally committed BEFORE
//                           the base tag is cut (cravinbyandy: the BuenaVida config is inside the base
//                           tree), so a diff-scoped check could never fire on the defect it exists for.
//                           Both are guarded instead: `foreign` needs a positive non-vendor name claim,
//                           `no-excludes` only asks for dirs that exist, `theme-info-stock` needs custom
//                           sections — so a pristine vendored clone is silent.
//   HYGIENE_SCAN_ALL=1      force a full scan with no base ref. FIXTURES ONLY — a fixture dir is not a
//                           git repo, so without this every check would warn-skip and prove nothing.
//   HYGIENE_IMAGE_MAX_KB    content/brand-photo size floor, default 150.
//   HYGIENE_HISTORY_MAX_KB  history blob size floor for "large image ever committed", default 1024.
//   REPORT_DIR              default gate-reports
//
// BLOCKS on: foreign/dead/unscoped .theme-check.yml · stock theme_info on a custom build ·
//   client content images in assets/ · third-party brand PHOTOS in assets/.
// WARNS on: schema-locale gaps · binaries in git history · third-party brand ICONS ·
//   missing .theme-check.yml · unresolvable base ref · an empty scope (*.n-a-empty-scope, so gate #45
//   can tell "examined nothing" from "found nothing").
//
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { writeReport } from './lib/report.mjs'
// #51 owns the canonical pure locale parser (Shopify ships locale files with a leading /* */ header —
// valid Shopify, not strict JSON). Importing is safe: that module only runs main() when invoked directly.
import { flattenKeys, parseLocaleJson } from './check-locale-completeness.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const BASE_REF = process.env.BASE_REF || 'base'
const SCAN_ALL = process.env.HYGIENE_SCAN_ALL === '1'
const IMAGE_MAX_KB = Number(process.env.HYGIENE_IMAGE_MAX_KB || 150)
const HISTORY_MAX_KB = Number(process.env.HYGIENE_HISTORY_MAX_KB || 1024)

// ── severity split (the single source; `add` routes off this table) ──────────────────────────
const SEVERITY = {
  'hygiene.theme-check-foreign': 'block',
  'hygiene.theme-check-foreign.dead-ignore': 'block',
  'hygiene.theme-check-foreign.no-excludes': 'block',
  'hygiene.theme-info-stock': 'block',
  'hygiene.content-image-in-assets': 'block',
  'hygiene.thirdparty-brand-asset': 'block',
  'hygiene.thirdparty-brand-asset.icon': 'warn',
  'hygiene.schema-locale-gap': 'warn',
  'hygiene.committed-binary': 'warn',
  'hygiene.committed-binary.skipped': 'warn',
  'hygiene.committed-tooling': 'warn',
  'hygiene.theme-check-missing': 'warn',
  'hygiene.scope-unresolved': 'warn',
  'hygiene.n-a-empty-scope': 'warn',
}

const REQUIRED_EXCLUDES = ['toolkit', 'gate-reports', 'docs']
const VENDOR_THEMES = ['dawn', 'horizon', 'minimog', 'craft', 'sense', 'refresh', 'studio', 'taste', 'ride', 'colorblock', 'crave', 'publisher', 'origin', 'spotlight', 'trade']
const VENDOR_AUTHORS = ['shopify', 'the4', 'the4 studio', 'foxecom']
const RASTER_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']
const ASSET_EXT = [...RASTER_EXT, '.svg']
// video/archive/design-source — never belongs in a theme repo, and a git pack keeps it forever
const HISTORY_BINARY_EXT = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.psd', '.ai', '.sketch', '.fig', '.pdf']

// Theme CHROME — shipped with the theme, legitimately an asset. Tested BEFORE the content patterns so
// `menu-icon.svg` is chrome, not a "menu-" content photo.
const CHROME_NAME_PATTERNS = [/^logos?[-_.]|[-_]logos?[-_.]/, /favicon/, /^icons?[-_]|[-_]icons?[-_.]/, /placeholder/, /sprite/, /^og[-_]/, /^apple-touch/, /^swatch/, /^loading/]
// Client CONTENT — a photo of the shop, the team, the food. The merchant must be able to swap these.
const CONTENT_NAME_PATTERNS = [/(^|[-_])about[-_]/, /(^|[-_])hero[-_]photo/, /(^|[-_])menu[-_]/, /(^|[-_])catering[-_]/, /(^|[-_])team[-_]/, /(^|[-_])locations?[-_]/, /(^|[-_])gallery[-_]/, /(^|[-_])product[-_]/]
// Third-party marks. `discover` and `maestro` are real card brands but too collision-prone as words
// ("discover-our-menu.jpg") to be worth the false BLOCK — left out deliberately.
const THIRDPARTY_BRANDS = ['swiggy', 'zomato', 'ubereats', 'uber-eats', 'doordash', 'deliveroo', 'grubhub', 'zepto', 'blinkit', 'amazon', 'instagram', 'facebook', 'tiktok', 'youtube', 'whatsapp', 'pinterest', 'snapchat', 'linkedin', 'visa', 'mastercard', 'amex', 'american-express', 'paypal', 'klarna', 'afterpay', 'affirm', 'stripe', 'razorpay', 'paytm', 'phonepe', 'shopify-pay', 'shop-pay', 'apple-pay', 'google-pay']
// A header phrase that names the artifact, not a project — never read as a foreign-project claim.
const GENERIC_HEADER_WORDS = new Set(['themecheck', 'themecheckconfig', 'themecheckconfiguration', 'shopify', 'theme', 'config', 'configuration', 'settings', 'liquid', 'boldteq'])

const blockers = []
const warnings = []
const add = (id, page, detail, evidence = '') => {
  ;(SEVERITY[id] === 'block' ? blockers : warnings).push({ id, page, detail, evidence })
}

const scanned = { assets: 0, schemaLocales: 0, config: 0, history: 0 }

function finish() {
  const total = Object.values(scanned).reduce((a, b) => a + b, 0)
  // pass:true + scanned:0 is a masked skip to gate #45 (integrity.vacuous-pass). A nested theme with
  // no config files and an empty asset diff really does examine nothing — say so with an *.n-a-* marker
  // rather than let a green tick stand in for a scan. Same convention as #8/#9/#16/#22.
  if (total === 0 && !blockers.length) {
    add('hygiene.n-a-empty-scope', '.', `nothing was in scope — no .theme-check.yml, no config/settings_schema.json, no schema locales, no assets added since "${BASE_REF}", and no git history reachable from here. The gate contributes no quality signal on this tree.`, BASE_REF)
  }
  const pass = blockers.length === 0
  writeReport('repo-hygiene', 48, {
    cwd, pass, blockers, warnings,
    evidence: { scanned: total, scannedBreakdown: scanned, baseRef: BASE_REF, scanAll: SCAN_ALL, imageMaxKb: IMAGE_MAX_KB },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  console.log(`repo-hygiene: ${pass ? 'PASS' : 'BLOCK'} — ${total} file(s) scanned · ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  process.exit(pass ? 0 : 1)
}

const read = (rel) => { try { return fs.readFileSync(path.resolve(cwd, rel), 'utf-8') } catch { return null } }
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')
const isGenerated = (text) => /GENERATED by [\w.-]+/i.test(String(text).slice(0, 400))
// Shopify config/locale JSON ships with a leading /* */ header — same tolerance as parseLocaleJson.
const parseJsonc = (text) => parseLocaleJson(text)

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts })
}
// The gate audits THIS theme repo. A fixture dir sits inside the toolkit's own repo, so an ancestor
// worktree must not be mistaken for the subject — history would be Polyglot's, not the client's.
function isRepoRoot() {
  try { return path.resolve(git(['rev-parse', '--show-toplevel']).trim()) === path.resolve(cwd) } catch { return false }
}
function baseDiff(dirs, filter = 'AM') {
  try {
    git(['rev-parse', '--verify', `${BASE_REF}^{commit}`])
    return git(['diff', `--diff-filter=${filter}`, '--name-only', `${BASE_REF}..HEAD`, '--', ...dirs])
      .split('\n').map(s => s.trim()).filter(Boolean)
  } catch { return null }
}
function walk(dir, exts, acc = []) {
  const abs = path.resolve(cwd, dir)
  if (!fs.existsSync(abs)) return acc
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name)
    if (e.isDirectory()) walk(rel, exts, acc)
    else if (exts.some(x => e.name.toLowerCase().endsWith(x))) acc.push(rel)
  }
  return acc
}

// ── 1. .theme-check.yml [STD-HYG-03] ─────────────────────────────────────────────────────────
// Hand-rolled reader: we need only a leading comment header, top-level keys, and ignore/exclude list
// items. A YAML dep for that would be the whole toolkit's first runtime dependency.
export function parseThemeCheckYaml(text) {
  const header = []
  const topKeys = []
  const ignores = []
  const unquote = (s) => s.replace(/^['"]|['"]$/g, '').trim()
  let inHeader = true
  let topKey = null
  let ignoreIndent = -1
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim()) { inHeader = false; continue }
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) { if (inHeader) header.push(trimmed.replace(/^#+\s?/, '')); continue }
    inHeader = false
    const indent = line.match(/^\s*/)[0].length
    const item = trimmed.match(/^-\s*(.+)$/)
    if (item) {
      if (ignoreIndent >= 0 && indent > ignoreIndent) ignores.push({ key: topKey, path: unquote(item[1]) })
      continue
    }
    const kv = trimmed.match(/^([^:#]+):\s*(.*)$/)
    if (!kv) continue
    const key = kv[1].trim()
    if (indent === 0) { topKey = key; topKeys.push(key); ignoreIndent = -1 }
    if (/^(ignore|ignored|exclude|excludes|exclude_paths|ignored_paths)$/i.test(key)) {
      ignoreIndent = indent
      const inline = kv[2].trim()
      if (/^\[.*\]$/.test(inline)) for (const p of inline.slice(1, -1).split(',')) { const v = unquote(p); if (v) ignores.push({ key: topKey, path: v }) }
    } else if (indent <= ignoreIndent) ignoreIndent = -1
  }
  return { header, topKeys, ignores }
}

// PURE: the project name a header claims, or null when it only names the artifact.
// "BuenaVida — theme-check configuration (extends ...)" → "BuenaVida".
export function headerProjectName(header) {
  const first = (header || []).find(l => l.trim())
  if (!first) return null
  const claim = first.split(/\s+[—–-]\s+|:/)[0].trim()
  if (!claim || claim.split(/\s+/).length > 4) return null
  return GENERIC_HEADER_WORDS.has(norm(claim)) ? null : claim
}

function projectIdentity() {
  const names = [path.basename(path.resolve(cwd))]
  const sd = read('config/settings_data.json')
  if (sd) {
    try {
      const j = parseJsonc(sd)
      if (typeof j.current === 'string') names.push(j.current)
      for (const k of Object.keys(j.presets || {})) names.push(k)
    } catch { /* malformed settings_data is gate #16's problem, not ours */ }
  }
  const ss = read('config/settings_schema.json')
  if (ss) {
    try {
      const info = (parseJsonc(ss) || []).find(s => s && s.name === 'theme_info')
      if (info?.theme_name) names.push(info.theme_name)
    } catch { /* reported by the theme_info check below */ }
  }
  return names.filter(Boolean)
}

function checkThemeCheckYaml(identity) {
  const rel = fs.existsSync(path.resolve(cwd, '.theme-check.yml')) ? '.theme-check.yml'
    : fs.existsSync(path.resolve(cwd, '.theme-check.yaml')) ? '.theme-check.yaml' : null
  if (!rel) {
    add('hygiene.theme-check-missing', '.theme-check.yml', 'no .theme-check.yml — theme-check runs its bare default ruleset and walks toolkit/, gate-reports/ and docs/, so the real Liquid findings are buried. Add one that extends :default and excludes our tooling dirs.')
    return
  }
  scanned.config += 1
  const text = read(rel) || ''
  const { header, ignores } = parseThemeCheckYaml(text)

  const claim = headerProjectName(header)
  // A header naming the BASE theme ("# Minimog — theme check") names the vendor, not another client —
  // it ships with the theme and survives the repo being renamed to the store. Only a foreign CLIENT
  // name is the copied-from-another-build defect.
  const vendorClaim = claim && (VENDOR_THEMES.includes(norm(claim)) || VENDOR_AUTHORS.includes(String(claim).toLowerCase().trim()))
  if (claim && !vendorClaim && !identity.some(n => norm(n).includes(norm(claim)) || norm(claim).includes(norm(n)))) {
    add('hygiene.theme-check-foreign', rel, `${rel} names a DIFFERENT project ("${claim}") — this repo is "${identity[0]}". It was copied from another client build, so its rule config (and every ignore below) describes that theme, not this one. Rewrite it for this store.`, header[0]?.slice(0, 120) || '')
  }

  // (b) dead ignore = a rule silenced for a file that does not exist → the rule is silenced for nothing,
  // and the real files it should police are never checked. Glob patterns are skipped (not expandable
  // here without a matcher) rather than guessed at.
  // DIRECTORY entries are exempt: excluding `docs/` or `toolkit/` before those dirs exist is prophylactic
  // and correct — flagging it would make the required excludes in (c) self-contradictory. Only a dead
  // FILE reference (a path with an extension) is the carried-over-from-another-theme defect.
  const dead = ignores.filter(i => !/[*?[\]]/.test(i.path) && /\.[a-z0-9]+$/i.test(i.path) && !fs.existsSync(path.resolve(cwd, i.path)))
  for (const d of dead.slice(0, 10)) {
    add('hygiene.theme-check-foreign.dead-ignore', rel, `${d.key ? `${d.key}: ` : ''}ignores "${d.path}" which does not exist in this repo — a dead reference carried over from another theme. Remove it or the rule stays silenced for nothing.`, d.path)
  }
  if (dead.length > 10) add('hygiene.theme-check-foreign.dead-ignore', rel, `+${dead.length - 10} more dead ignore path(s) in ${rel}`, `${dead.length} total`)

  const covered = (dir) => ignores.some(i => {
    const p = i.path.replace(/^\.\//, '')
    return p === dir || p.startsWith(`${dir}/`) || p.startsWith(`${dir}*`)
  })
  // Only a directory that EXISTS can bury the signal. A pristine vendored base — Dawn's own
  // .theme-check.yml, no toolkit/, no gate-reports/, no docs/, zero custom work — used to BLOCK here,
  // a hard stop on an untouched vendored file before the build had authored anything.
  const missing = REQUIRED_EXCLUDES.filter(d => !covered(d) && fs.existsSync(path.resolve(cwd, d)))
  if (missing.length) {
    add('hygiene.theme-check-foreign.no-excludes', rel, `${rel} does not exclude ${missing.map(d => `${d}/`).join(', ')} — theme-check then walks our own vendored toolkit (incl. its node_modules + test fixtures), the gate reports and the docs, and the genuine Liquid findings are buried in that noise. Add them under a root "ignore:" list.`, missing.join(', '))
  }
}

// ── 2. theme_info still the vendor's [STD-HYG-04] ────────────────────────────────────────────
function checkThemeInfo(customWork) {
  const raw = read('config/settings_schema.json')
  if (raw === null) return
  scanned.config += 1
  let info = null
  try { info = (parseJsonc(raw) || []).find(s => s && s.name === 'theme_info') } catch { return }
  if (!info) return
  // Silent unless this build actually shipped custom sections — a stock vendored theme with untouched
  // theme_info is correct, and blocking it would fire on every repo the moment it is cloned.
  if (!customWork) return
  const isVendorTheme = VENDOR_THEMES.includes(norm(info.theme_name))
  const isVendorAuthor = VENDOR_AUTHORS.includes(String(info.theme_author || '').toLowerCase().trim())
  if (isVendorTheme && isVendorAuthor) {
    add('hygiene.theme-info-stock', 'config/settings_schema.json', `theme_info still claims the vendor theme (theme_name "${info.theme_name}", theme_author "${info.theme_author}") while this build ships ${customWork} custom section(s). The merchant's admin, the theme picker and any support ticket will name ${info.theme_name} instead of this store's theme. Set theme_name/theme_author/theme_documentation_url/theme_support_url to the client build.`, `${info.theme_name} / ${info.theme_author} / ${customWork} custom sections`)
  }
}

// ── 3. schema-locale parity [STD-HYG-05] — the gap gate #51 skips by design ───────────────────
function checkSchemaLocales() {
  const dir = path.resolve(cwd, 'locales')
  if (!fs.existsSync(dir)) return
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.schema.json')).sort()
  const defFile = files.find(f => f.endsWith('.default.schema.json'))
  if (!defFile || files.length < 2) return
  let defKeys
  try { defKeys = new Set(flattenKeys(parseLocaleJson(fs.readFileSync(path.join(dir, defFile), 'utf-8')))) } catch (e) {
    add('hygiene.schema-locale-gap', `locales/${defFile}`, `default schema locale is unparseable: ${e.message}`, '')
    return
  }
  scanned.schemaLocales += 1
  for (const f of files) {
    if (f === defFile) continue
    scanned.schemaLocales += 1
    let has
    try { has = new Set(flattenKeys(parseLocaleJson(fs.readFileSync(path.join(dir, f), 'utf-8')))) } catch (e) {
      add('hygiene.schema-locale-gap', `locales/${f}`, `schema locale is unparseable: ${e.message}`, '')
      continue
    }
    const missing = [...defKeys].filter(k => !has.has(k))
    if (!missing.length) continue
    add('hygiene.schema-locale-gap', `locales/${f}`, `${missing.length} theme-editor label key(s) present in ${defFile} are missing here — a merchant on this locale sees the raw key (or English) in the customizer. e.g. ${missing.slice(0, 5).join(', ')}`, missing.slice(0, 5).join(', '))
  }
}

// ── 4+5. asset filenames [STD-IMG-01 / STD-IMG-06] ───────────────────────────────────────────
const brandIn = (name) => THIRDPARTY_BRANDS.find(b => new RegExp(`(^|[^a-z0-9])${b.replace(/-/g, '[-_]?')}([^a-z0-9]|$)`).test(name))

function checkAssets(files) {
  const contentHits = []
  for (const rel of files) {
    const abs = path.resolve(cwd, rel)
    if (!fs.existsSync(abs)) continue // renamed/deleted after the diff was taken
    const ext = path.extname(rel).toLowerCase()
    if (!ASSET_EXT.includes(ext)) continue
    if (ext === '.svg' && isGenerated(read(rel) || '')) continue
    scanned.assets += 1
    const base = path.basename(rel).toLowerCase()
    const stem = base.slice(0, base.length - ext.length)
    const kb = Math.round(fs.statSync(abs).size / 1024)

    // brand marks first: a third-party file is reported ONCE, under the more specific id
    const brand = brandIn(stem)
    if (brand) {
      const isIcon = ext === '.svg' || kb <= IMAGE_MAX_KB
      if (isIcon) add('hygiene.thirdparty-brand-asset.icon', rel, `asset carries the third-party mark "${brand}" (${kb}KB) — icon-sized, so probably a legitimate payment/social badge. Confirm the mark is licensed for this use, and prefer Shopify's own payment-icon snippets where they exist.`, `${base} ${kb}KB`)
      else add('hygiene.thirdparty-brand-asset', rel, `third-party BRAND artwork "${brand}" shipped as a ${kb}KB theme asset — a photo/banner of another company's mark baked into the theme is a trademark exposure and cannot be taken down without a theme deploy. Remove it; if the partnership is real, porter uploads the approved artwork to Shopify Files and the section reads it from an image_picker setting.`, `${base} ${kb}KB`)
      continue
    }

    if (!RASTER_EXT.includes(ext)) continue
    if (CHROME_NAME_PATTERNS.some(re => re.test(stem))) continue
    const byName = CONTENT_NAME_PATTERNS.some(re => re.test(stem))
    const bySize = kb > IMAGE_MAX_KB
    if (byName || bySize) contentHits.push({ rel, base, kb, why: byName ? 'content-shaped filename' : `${kb}KB — larger than any theme chrome asset (floor ${IMAGE_MAX_KB}KB)` })
  }

  const REMEDY = 'porter uploads it to Shopify Files (or the product/page media) and the section reads it through an image_picker setting'
  for (const h of contentHits.slice(0, 20)) {
    add('hygiene.content-image-in-assets', h.rel, `client CONTENT image committed to assets/ (${h.why}) — a merchant cannot change a photo that lives in the theme code, which is exactly the "I can't swap my own photos" failure (Prime Directive 2). Remediation owner: ${REMEDY}.`, `${h.base} ${h.kb}KB`)
  }
  if (contentHits.length > 20) {
    add('hygiene.content-image-in-assets', 'assets', `+${contentHits.length - 20} more content image(s) in assets/ (${contentHits.length} total) — same remediation: ${REMEDY}.`, `${contentHits.length} total`)
  }
}

// ── 6. git history [STD-HYG-06] ──────────────────────────────────────────────────────────────
function checkHistory() {
  if (!isRepoRoot()) {
    add('hygiene.committed-binary.skipped', '.', `${cwd} is not the root of a git repo — history scan skipped. A binary already in the pack cannot be detected (or removed) without one.`)
    return
  }
  // Objects the BASE tag already carried are the vendor's, not this build's — `--not <base>` drops
  // every blob reachable from base (the same set `git pack-objects` calls "already have"). Without it
  // a design-source binary in the theme base's own import history was reported against the build.
  let baseArg = []
  try { git(['rev-parse', '--verify', `${BASE_REF}^{commit}`]); baseArg = ['--not', BASE_REF] } catch { /* unresolvable base is already reported by scope-unresolved */ }
  let blobs
  try {
    const objs = git(['rev-list', '--objects', '--all', ...baseArg]).split('\n').filter(l => l.includes(' '))
    if (objs.length > 60000) {
      add('hygiene.committed-binary.skipped', '.', `${objs.length} objects in history — above the 60000 scan ceiling; skipped to keep the gate fast. Run \`git rev-list --objects --all | git cat-file --batch-check\` manually if a bloat problem is suspected.`)
      return
    }
    const out = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize) %(rest)'], { input: `${objs.join('\n')}\n` })
    blobs = new Map()
    for (const line of out.split('\n')) {
      const m = line.match(/^\S+ blob (\d+) (.+)$/)
      if (!m) continue
      const size = Number(m[1]); const p = m[2].trim()
      if (!blobs.has(p) || blobs.get(p) < size) blobs.set(p, size)
    }
  } catch (e) {
    add('hygiene.committed-binary.skipped', '.', `history scan failed: ${e.message}`)
    return
  }
  scanned.history = blobs.size

  const offenders = []
  for (const [p, size] of blobs) {
    const ext = path.extname(p).toLowerCase()
    const kb = Math.round(size / 1024)
    if (HISTORY_BINARY_EXT.includes(ext)) offenders.push({ p, kb, why: `${ext} binary` })
    else if (RASTER_EXT.includes(ext) && kb > HISTORY_MAX_KB) offenders.push({ p, kb, why: `${kb}KB image (floor ${HISTORY_MAX_KB}KB)` })
  }
  if (!offenders.length) return

  // path → the commit that ADDED it. `git log` is newest-first, so overwriting leaves the OLDEST
  // (i.e. the original add) in the map.
  const addedIn = new Map()
  try {
    let sha = null
    for (const line of git(['log', '--all', '--diff-filter=A', '--name-only', '--pretty=format:%h']).split('\n')) {
      const s = line.trim()
      if (!s) continue
      if (/^[0-9a-f]{7,40}$/.test(s) && !s.includes('/')) { sha = s; continue }
      addedIn.set(s, sha)
    }
  } catch { /* offenders still reported, just without a commit */ }

  const sorted = offenders.sort((a, b) => b.kb - a.kb)
  for (const o of sorted.slice(0, 10)) {
    add('hygiene.committed-binary', o.p, `${o.why} was committed to git history${addedIn.get(o.p) ? ` in ${addedIn.get(o.p)}` : ''} — deleting the file does NOT remove it from the pack, so every clone of this repo carries it forever. Not auto-fixable: rewriting history is a human decision (git filter-repo + a force-push the client must be told about).`, `${o.p} ${o.kb}KB`)
  }
  if (sorted.length > 10) add('hygiene.committed-binary', '.', `+${sorted.length - 10} more binary/oversize blob(s) in history (${sorted.length} total)`, `${sorted.length} total`)
}

// The toolkit's OWN output committed into the client's theme repo (2026-07-23 audit: cravinbyandy had
// 42 gate-reports/*.json tracked in git). .shopifyignore keeps them from PUSHING to the store, but they
// still bloat every clone and read as "the repo the client owns is full of our machinery". Warn: the fix
// is a .gitignore line, and rewriting history to remove already-tracked ones is a human call.
const TOOLING_TRACKED = [
  { dir: 'gate-reports', why: "gate-reports/ (the toolkit's own QA output)" },
  { dir: 'toolkit', why: 'toolkit/ (the vendored gate toolkit itself)' },
]
function checkTrackedTooling() {
  let tracked
  try { tracked = git(['ls-files', '--', ...TOOLING_TRACKED.map(t => t.dir)]) } catch { return } // not a git repo → checkHistory already warned
  const lines = tracked.split('\n').filter(Boolean)
  for (const t of TOOLING_TRACKED) {
    const n = lines.filter(l => l === t.dir || l.startsWith(`${t.dir}/`)).length
    if (n === 0) continue
    const ignored = (() => { try { return /(^|\/)/.test(fs.readFileSync(path.resolve(cwd, '.gitignore'), 'utf-8')) && fs.readFileSync(path.resolve(cwd, '.gitignore'), 'utf-8').split('\n').some(l => l.trim().replace(/\/$/, '') === t.dir) } catch { return false } })()
    add('hygiene.committed-tooling', t.dir, `${n} file(s) under ${t.why} are TRACKED in git — the client's theme repo carries our machinery in every clone. Add \`${t.dir}/\` to .gitignore${ignored ? ' (it is listed but the files were committed before that — `git rm -r --cached ' + t.dir + '` to untrack)' : ''}. (.shopifyignore already stops it pushing to the store; this is repo hygiene, not a store risk.)`, `${n} tracked`)
  }
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────
function main() {
  const identity = projectIdentity()
  checkThemeCheckYaml(identity)
  checkSchemaLocales()
  checkHistory()
  checkTrackedTooling()

  const assetDiff = SCAN_ALL ? walk('assets', ASSET_EXT) : baseDiff(['assets'])
  const customDiff = SCAN_ALL
    ? walk('sections', ['.liquid']).length
    : (baseDiff(['sections'], 'A') || []).length || null
  if (assetDiff === null) {
    add('hygiene.scope-unresolved', '.', `base ref "${BASE_REF}" is unresolvable — the asset scan and the custom-work precondition were SKIPPED (not passed). Tag the theme base "base" so this build's added files can be identified.`, BASE_REF)
  } else {
    checkAssets(assetDiff)
  }
  checkThemeInfo(customDiff)
  finish()
}

try { main() } catch (e) {
  writeReport('repo-hygiene', 48, {
    cwd, pass: false,
    blockers: [{ id: 'repo-hygiene.crash', page: '(repo-hygiene)', detail: `unexpected failure: ${e.message}`, evidence: String(e.stack || '').slice(0, 400) }],
    warnings: [], evidence: { scanned: 0 }, duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  console.error(`repo-hygiene: CRASH — ${e.message}`)
  process.exit(2)
}
