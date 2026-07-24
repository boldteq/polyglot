#!/usr/bin/env node
// Self-test for check-repo-hygiene.mjs (#48) — the corpus no rule and no other gate can see
// (.theme-check.yml, config/settings_schema.json theme_info, locales/*.schema.json, asset FILENAMES,
// git history).
//
// The .jpg/.png fixtures are text bytes with an image extension on purpose: the gate stats size and
// reads names, it never decodes an image. Keeping them as text keeps the fixtures diffable.
//
// A fixture dir is not a git repo, so every case runs with HYGIENE_SCAN_ALL=1 (the documented
// fixtures-only full-scan opt-in) except the scope case, which deliberately proves the warn-skip.
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.resolve(HERE, '..', '..', 'check-repo-hygiene.mjs')
let failures = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); failures += 1 }

function runIn(dir, extraEnv = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-'))
  const env = {
    ...process.env,
    REPORT_DIR: reportDir,
    BASE_REF: '__no_such_base__',
    HYGIENE_SCAN_ALL: '1',
    HYGIENE_IMAGE_MAX_KB: '',
    ...extraEnv,
  }
  for (const k of Object.keys(env)) if (env[k] === '') delete env[k]
  const r = spawnSync('node', [GATE], { cwd: dir, env, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'repo-hygiene.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return {
    code: r.status,
    ids: new Set((rep?.blockers || []).map(b => b.id)),
    warns: new Set((rep?.warnings || []).map(w => w.id)),
    scanned: rep?.evidence?.scanned,
    blockers: rep?.blockers || [],
    warnings: rep?.warnings || [],
  }
}
const run = (caseDir, extraEnv) => runIn(path.join(HERE, caseDir), extraEnv)

console.log('case (a) clean repo (own-project theme-check.yml, own theme_info, locale parity, chrome-only assets) → expect exit 0')
{
  const { code, ids, warns, scanned } = run('clean')
  code === 0 ? pass('exit 0 (pass)') : fail(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`)
  ids.size === 0 ? pass('no blockers') : fail(`unexpected blockers: ${[...ids].join(', ')}`)
  // gate #45 gate-integrity treats "pass with scanned:0" as a skip masquerading as a pass
  scanned > 0 ? pass(`evidence.scanned = ${scanned} (a real scan, not a skip)`) : fail(`evidence.scanned=${scanned}`)
  // chrome must not be mistaken for client content
  !ids.has('hygiene.content-image-in-assets') ? pass('favicon/og-image/logo/icon- are chrome, not content') : fail('chrome asset flagged as client content')
  // a fixture dir is inside the TOOLKIT's repo, not its own — the history scan must decline, loudly
  warns.has('hygiene.committed-binary.skipped') ? pass('history scan declines outside a repo root instead of scanning an ancestor') : fail(`missing skip warning (saw ${[...warns].join(', ') || 'none'})`)
}

console.log('\ncase (b) broken repo → expect exit 1 + every blocking id')
{
  const { code, ids, warns, blockers } = run('broken')
  code === 1 ? pass('exit 1 (block)') : fail(`expected 1 got ${code}`)
  for (const id of [
    'hygiene.theme-check-foreign',            // header names BuenaVida, repo is "broken"
    'hygiene.theme-check-foreign.dead-ignore', // OrphanedSnippet ignores snippets/bv-*.liquid that do not exist
    'hygiene.theme-check-foreign.no-excludes', // no toolkit/ gate-reports/ docs/ excludes
    'hygiene.theme-info-stock',               // Dawn/Shopify while a custom section ships
    'hygiene.content-image-in-assets',        // about-team-1.jpg / menu-hero.jpg
  ]) ids.has(id) ? pass(`blocker: ${id}`) : fail(`missing blocker ${id} (saw ${[...ids].join(', ') || 'none'})`)

  const deadCount = blockers.filter(b => b.id === 'hygiene.theme-check-foreign.dead-ignore').length
  deadCount === 2 ? pass('one blocker per dead ignore path (2)') : fail(`expected 2 dead-ignore blockers, got ${deadCount}`)

  const contentCount = blockers.filter(b => b.id === 'hygiene.content-image-in-assets').length
  contentCount === 2 ? pass('both content-shaped filenames caught') : fail(`expected 2 content blockers, got ${contentCount}`)

  // WARN tier — remediable in bulk / usually licensed, so they must not stop a publish on their own
  warns.has('hygiene.schema-locale-gap') ? pass('warn: schema-locale-gap (the gap #51 skips by design)') : fail(`missing hygiene.schema-locale-gap (saw ${[...warns].join(', ') || 'none'})`)
  warns.has('hygiene.thirdparty-brand-asset.icon') ? pass('warn: visa.svg is an icon, not a brand photo') : fail('thirdparty icon not warned')
  !ids.has('hygiene.thirdparty-brand-asset') ? pass('an icon-sized mark does NOT block') : fail('icon-sized mark blocked (severity split broken)')

  const gap = run('broken').warnings.find(w => w.id === 'hygiene.schema-locale-gap')
  const gapDetail = gap?.detail || ''
  gapDetail.includes('1 theme-editor label key(s)') ? pass('gap count is exact (1 missing key)') : fail(`gap detail wrong: ${gapDetail}`)
}

console.log('\ncase (c) third-party brand PHOTO blocks, and the size floor is the icon/photo split')
{
  // HYGIENE_IMAGE_MAX_KB=0 puts every raster above the floor — the documented tunable, used here to
  // exercise the photo branch without committing a real multi-hundred-KB binary to the repo.
  const { code, ids, blockers } = run('brand-photo', { HYGIENE_IMAGE_MAX_KB: '0' })
  ids.has('hygiene.thirdparty-brand-asset') ? pass('blocker: swiggy/zomato banner above the floor') : fail(`missing thirdparty brand photo blocker (saw ${[...ids].join(', ') || 'none'})`)
  ids.has('hygiene.content-image-in-assets') ? pass('blocker: storefront.jpg caught by SIZE, not by name') : fail('the size-floor branch never fired')
  code === 1 ? pass('exit 1') : fail(`expected 1 got ${code}`)
  // a third-party asset is reported ONCE, under the more specific id
  const dupe = blockers.filter(b => b.page.includes('swiggy'))
  dupe.length === 1 ? pass('a brand asset is reported once, not twice') : fail(`swiggy asset reported ${dupe.length}×`)

  // ...and at the DEFAULT floor the same tiny file is an icon (warn), not a photo (block)
  const dflt = run('brand-photo')
  dflt.warns.has('hygiene.thirdparty-brand-asset.icon') ? pass('same file under the floor → icon warn') : fail(`expected icon warn, saw ${[...dflt.warns].join(', ')}`)
  dflt.code === 0 ? pass('icons alone do not block') : fail(`expected 0 got ${dflt.code}`)
}

console.log('\ncase (d) no .theme-check.yml at all → warn, do not block')
{
  const { code, warns, ids } = run('no-theme-check')
  warns.has('hygiene.theme-check-missing') ? pass('warn: hygiene.theme-check-missing') : fail(`missing warning (saw ${[...warns].join(', ') || 'none'})`)
  code === 0 ? pass('exit 0 — an absent config is remediable, not publish-stopping') : fail(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`)
}

console.log('\ncase (e) unresolvable base ref → WARN + skip, never a silent green')
{
  // Without HYGIENE_SCAN_ALL there is no scope: the asset scan and the custom-work precondition must
  // announce that they were SKIPPED. A gate that quietly scans nothing and reports pass is the
  // cravinbyandy failure this whole workstream exists to stop.
  const { code, warns, ids } = run('broken', { HYGIENE_SCAN_ALL: '' })
  warns.has('hygiene.scope-unresolved') ? pass('warn: hygiene.scope-unresolved') : fail(`missing scope warning (saw ${[...warns].join(', ') || 'none'})`)
  !ids.has('hygiene.content-image-in-assets') ? pass('asset scan skipped (not silently passed)') : fail('assets scanned without a scope')
  !ids.has('hygiene.theme-info-stock') ? pass('theme_info check skipped — custom work cannot be proven without a base') : fail('theme-info fired without a scope')
  // the whole-repo config checks still run — they need no base ref
  code === 1 && ids.has('hygiene.theme-check-foreign') ? pass('whole-repo .theme-check.yml checks still run') : fail(`config checks lost with the scope (exit ${code}, ids ${[...ids].join(', ')})`)
}

console.log('\ncase (f) binaries in git history → warn, loudly, with the commit')
{
  // Needs a REAL repo root: the gate refuses to scan an ancestor worktree's history.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-git-'))
  const git = (...a) => spawnSync('git', a, { cwd: d, stdio: ['ignore', 'ignore', 'ignore'] })
  fs.mkdirSync(path.join(d, 'config'), { recursive: true })
  fs.cpSync(path.join(HERE, 'clean', 'config'), path.join(d, 'config'), { recursive: true })
  fs.cpSync(path.join(HERE, 'clean', '.theme-check.yml'), path.join(d, '.theme-check.yml'))
  // the theme BASE ships its own design-source binary — the vendor's problem, not this build's
  fs.writeFileSync(path.join(d, 'vendor-manual.pdf'), 'v'.repeat(4096))
  git('init', '-q', '.')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'import base')
  git('tag', 'base')
  fs.writeFileSync(path.join(d, 'walkthrough.mp4'), 'x'.repeat(4096))
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'add video')
  // deleting it does NOT remove it from the pack — that is exactly the point of the check
  fs.rmSync(path.join(d, 'walkthrough.mp4'))
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'remove video')

  const { code, warns, warnings } = runIn(d, { BASE_REF: 'base', HYGIENE_SCAN_ALL: '' })
  warns.has('hygiene.committed-binary') ? pass('warn: hygiene.committed-binary on a DELETED-but-committed mp4') : fail(`missing committed-binary (saw ${[...warns].join(', ') || 'none'})`)
  const all = warnings.filter(x => x.id === 'hygiene.committed-binary').map(x => x.page).join(' ')
  !all.includes('vendor-manual.pdf')
    ? pass('a binary the theme BASE already carried is not blamed on this build')
    : fail(`base-tag blob reported against the build: ${all}`)
  const w = warnings.find(x => x.id === 'hygiene.committed-binary')
  const wPage = w?.page || ''
  const wDetail = w?.detail || ''
  const RE_COMMIT = new RegExp('\\bin [0-9a-f]{7,}\\b')
  wPage.includes('walkthrough.mp4') ? pass('reports the path') : fail(`path missing: ${wPage}`)
  RE_COMMIT.test(wDetail) ? pass('reports the commit that added it') : fail(`commit missing: ${wDetail}`)
  code === 0 ? pass('exit 0 — history rewriting is a human decision, so this warns') : fail(`expected 0 got ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('\ncase (g2) the toolkit\'s OWN output committed into the client repo → warn to gitignore it')
{
  // Real defect (cravinbyandy): 42 gate-reports/*.json tracked in the client's theme repo. .shopifyignore
  // stops them pushing, but they bloat every clone. Warn, name the fix (a .gitignore line).
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-tool-'))
  const git = (...a) => spawnSync('git', a, { cwd: d, stdio: ['ignore', 'ignore', 'ignore'] })
  fs.mkdirSync(path.join(d, 'config'), { recursive: true })
  fs.mkdirSync(path.join(d, 'gate-reports'), { recursive: true })
  fs.cpSync(path.join(HERE, 'clean', 'config'), path.join(d, 'config'), { recursive: true })
  fs.cpSync(path.join(HERE, 'clean', '.theme-check.yml'), path.join(d, '.theme-check.yml'))
  fs.writeFileSync(path.join(d, 'gate-reports', 'summary.json'), '{"pass":true}')
  git('init', '-q', '.')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'build + reports')
  git('tag', 'base')
  const { code, warns, warnings } = runIn(d, { BASE_REF: 'base', HYGIENE_SCAN_ALL: '' })
  warns.has('hygiene.committed-tooling') ? pass('warn: committed-tooling on a tracked gate-reports/') : fail(`missing committed-tooling (saw ${[...warns].join(', ') || 'none'})`)
  const w = warnings.find(x => x.id === 'hygiene.committed-tooling')
  ;(w?.detail || '').includes('.gitignore') ? pass('names the fix (add to .gitignore)') : fail('no remediation named')
  code === 0 ? pass('exit 0 — untracking is a human decision, so this warns') : fail(`expected 0 got ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('\ncase (h) a pristine vendored base must not block before the build has authored anything')
{
  // Dawn's OWN .theme-check.yml, stock theme_info, no toolkit//gate-reports//docs/ on disk, zero custom
  // sections. This used to BLOCK on no-excludes — a hard stop on an untouched vendored file.
  // Runs in the REAL base-diff mode (base == HEAD), not the fixture full-scan opt-in.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-base-'))
  const git = (...a) => spawnSync('git', a, { cwd: d, stdio: ['ignore', 'ignore', 'ignore'] })
  fs.mkdirSync(path.join(d, 'sections'), { recursive: true })
  fs.mkdirSync(path.join(d, 'config'), { recursive: true })
  const stockYml = '# For a full list of rules, see https://shopify.dev/themes/tools/theme-check/checks\nextends: theme-check:recommended\n'
  fs.writeFileSync(path.join(d, '.theme-check.yml'), stockYml)
  fs.writeFileSync(path.join(d, 'config', 'settings_schema.json'), JSON.stringify([{ name: 'theme_info', theme_name: 'Dawn', theme_version: '15.5.0', theme_author: 'Shopify' }], null, 2))
  fs.writeFileSync(path.join(d, 'sections', 'image-banner.liquid'), '<div>stock</div>\n')
  git('init', '-q', '.')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'import dawn')
  git('tag', 'base')
  const stock = { BASE_REF: 'base', HYGIENE_SCAN_ALL: '' }
  const { code, ids } = runIn(d, stock)
  code === 0 ? pass('exit 0 — a stock clone is not a hygiene defect') : fail(`expected 0 got ${code}; blockers=${[...ids].join(', ')}`)
  !ids.has('hygiene.theme-check-foreign.no-excludes') ? pass('no exclude demanded for dirs that do not exist yet') : fail('no-excludes fired on a pristine base')
  !ids.has('hygiene.theme-check-foreign') ? pass('a stock header names no foreign project') : fail('foreign fired on a stock config')
  !ids.has('hygiene.theme-info-stock') ? pass('stock theme_info is correct until custom sections ship') : fail('theme-info fired with no custom work')

  // ...and a header naming the BASE THEME is the vendor, not another client
  fs.writeFileSync(path.join(d, '.theme-check.yml'), '# Minimog — theme-check configuration\nextends: :default\n')
  const vendor = runIn(d, stock)
  !vendor.ids.has('hygiene.theme-check-foreign') ? pass('"Minimog" in the header is the base theme, not a foreign client') : fail('vendor theme name read as a foreign project')

  // ...while a genuinely foreign CLIENT name still blocks
  fs.writeFileSync(path.join(d, '.theme-check.yml'), '# BuenaVida — theme-check configuration\nextends: :default\n')
  const foreign = runIn(d, stock)
  foreign.ids.has('hygiene.theme-check-foreign') ? pass('a foreign CLIENT name still blocks') : fail('the vendor guard swallowed a real foreign config')

  // ...and once the build ships a custom section, the stock theme_info IS the defect
  fs.writeFileSync(path.join(d, '.theme-check.yml'), stockYml)
  fs.writeFileSync(path.join(d, 'sections', 'meet-andy.liquid'), '<div>custom</div>\n')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'custom section')
  const built = runIn(d, stock)
  built.ids.has('hygiene.theme-info-stock') ? pass('stock theme_info blocks once custom sections exist') : fail(`theme-info silent with custom work (saw ${[...built.ids].join(', ') || 'none'})`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('\ncase (i) a resolved-but-empty scope declares itself instead of passing green on nothing')
{
  // A theme nested inside a monorepo: no config files, no locales, no assets added, history declined.
  // pass:true + scanned:0 with no marker is what gate #45 blocks as integrity.vacuous-pass.
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-empty-'))
  fs.mkdirSync(path.join(d, 'theme', 'sections'), { recursive: true })
  const git = (...a) => spawnSync('git', a, { cwd: d, stdio: ['ignore', 'ignore', 'ignore'] })
  fs.writeFileSync(path.join(d, 'theme', 'sections', 'a.liquid'), 'a\n')
  git('init', '-q', '.')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'base')
  git('tag', 'base')
  fs.writeFileSync(path.join(d, 'theme', 'sections', 'a.liquid'), 'b\n')
  git('add', '-A'); git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-q', '-m', 'work')
  const { code, warns, scanned } = runIn(path.join(d, 'theme'), { BASE_REF: 'base', HYGIENE_SCAN_ALL: '' })
  scanned === 0 ? pass('evidence.scanned = 0 (honest)') : fail(`expected scanned 0 got ${scanned}`)
  warns.has('hygiene.n-a-empty-scope') ? pass('warn: hygiene.n-a-empty-scope — "examined nothing" is stated, not implied') : fail(`missing n-a marker (saw ${[...warns].join(', ') || 'none'})`)
  code === 0 ? pass('exit 0 — an empty scope is not a defect, it is an absence of signal') : fail(`expected 0 got ${code}`)
  fs.rmSync(d, { recursive: true, force: true })
}

console.log('\ncase (g) an unexpected failure exits 2 with a crash report, never a green pass')
{
  // `locales` present as a FILE where a directory is expected — readdirSync throws ENOTDIR.
  const { code, ids } = run('crash')
  code === 2 ? pass('exit 2 (env error)') : fail(`expected 2 got ${code}`)
  ids.has('repo-hygiene.crash') ? pass('blocker: repo-hygiene.crash') : fail(`missing crash blocker (saw ${[...ids].join(', ') || 'none'})`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} ASSERTION(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
