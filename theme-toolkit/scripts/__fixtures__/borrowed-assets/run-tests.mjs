// Hermetic fixture for gate #55 borrowed-assets. PURE core + git end-to-end (temp repo with a `base` tag).
// No MCP, no network. Proves: hardcoded stock/placeholder image URLs are caught; merchant-settings imagery,
// asset_url, cdn.shopify.com, and the Shopify placeholder_svg_tag are NOT (low false-positive); placeholder
// services block even in dev, stock CDNs block only at publish-grade; empty build → N/A (not a vacuous pass).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { imageHostHits, PLACEHOLDER_HOSTS, STOCK_HOSTS } from '../../check-borrowed-assets.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))
const truthy = (v, m) => (v ? ok(m) : bad(m))

console.log('case (a) imageHostHits — classifies stock vs placeholder; ignores merchant/local imagery')
{
  eq(imageHostHits('<img src="https://images.unsplash.com/photo-123?w=800">').map((h) => h.kind), ['stock'], 'unsplash → stock')
  eq(imageHostHits('background-image:url(//placehold.co/600x400)').map((h) => h.kind), ['placeholder'], 'placehold.co → placeholder')
  eq(imageHostHits('src="https://picsum.photos/500"').map((h) => h.kind), ['placeholder'], 'picsum → placeholder')
  eq(imageHostHits('{{ section.settings.image | image_url: width: 800 | image_tag }}'), [], 'merchant-settings image → clean')
  eq(imageHostHits("{{ 'hero.jpg' | asset_url }}"), [], 'local asset_url → clean')
  eq(imageHostHits('<img src="https://cdn.shopify.com/s/files/1/x/real.jpg">'), [], "merchant's own cdn.shopify.com → clean")
  eq(imageHostHits('{{ product.featured_image | image_url | placeholder_svg_tag }}'), [], 'Shopify placeholder_svg_tag (not a URL) → clean')
}

console.log('case (b) host lists — disjoint + burst is stock, cdn.shopify is NOT listed')
{
  truthy(!STOCK_HOSTS.includes('cdn.shopify.com') && !PLACEHOLDER_HOSTS.includes('cdn.shopify.com'), "cdn.shopify.com (merchant uploads) is never a borrowed host")
  truthy(STOCK_HOSTS.includes('burst.shopifycdn.com'), 'burst.shopifycdn (Shopify free stock) is flagged as stock')
  truthy(imageHostHits('a https://images.unsplash.com/x and https://images.unsplash.com/x again').length === 1, 'de-dupes the same URL')
}

// ── git end-to-end ───────────────────────────────────────────────────────────
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-borrowed-assets.mjs')
const git = (dir, args) => execFileSync('git', ['-c', 'user.email=t@t.co', '-c', 'user.name=t', ...args], { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })
function makeRepo(baseFiles, buildFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'borrow-'))
  const put = (rel, c) => { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), c) }
  put('sections/_base.liquid', '<div>base</div>') // ensure sections/ exists (theme-repo check)
  for (const [rel, c] of Object.entries(baseFiles)) put(rel, c)
  git(dir, ['init', '-q']); git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'base']); git(dir, ['tag', 'base'])
  if (Object.keys(buildFiles).length) {
    for (const [rel, c] of Object.entries(buildFiles)) put(rel, c)
    git(dir, ['add', '-A']); git(dir, ['commit', '-qm', 'build'])
  }
  return dir
}
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'borrow-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'borrowed-assets.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const wIds = (rep) => new Set((rep?.warnings || []).map((w) => w.id))
const bIds = (rep) => new Set((rep?.blockers || []).map((b) => b.id))

console.log('case (c) hardcoded stock URL → warn in dev, BLOCK at publish-grade')
{
  const dir = makeRepo({}, { 'sections/hero.liquid': '<img src="https://images.unsplash.com/photo-99?w=1600" alt="hero">' })
  const dev = run(dir)
  dev.code === 0 && wIds(dev.rep).has('borrowed.stock-image') ? ok('stock in dev → WARN, exit 0') : bad(`stock dev: code ${dev.code} w ${[...wIds(dev.rep)]}`)
  const strict = run(dir, { DS_REQUIRE_SCOPE: '1' })
  strict.code === 1 && bIds(strict.rep).has('borrowed.stock-image') ? ok('stock at publish-grade → BLOCK, exit 1') : bad(`stock strict: code ${strict.code} b ${[...bIds(strict.rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (d) placeholder service → BLOCK even in dev (a dev leftover)')
{
  const dir = makeRepo({}, { 'sections/promo.liquid': '<img src="https://placehold.co/1200x600">' })
  const { code, rep } = run(dir)
  code === 1 && bIds(rep).has('borrowed.placeholder-image') ? ok('placehold.co → BLOCK, exit 1 (dev)') : bad(`placeholder: code ${code} b ${[...bIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (e) NO false block — merchant-settings + asset_url imagery passes even at publish-grade')
{
  const dir = makeRepo({}, { 'sections/hero.liquid': '<img src="{{ section.settings.image | image_url: width: 1600 | image_tag }}">\n<div style="background:url({{ \'bg.jpg\' | asset_url }})"></div>' })
  const { code, rep } = run(dir, { DS_REQUIRE_SCOPE: '1' })
  code === 0 && bIds(rep).size === 0 ? ok('proper imagery → PASS even at publish-grade') : bad(`clean: code ${code} b ${[...bIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (f) empty build (base tag, no media changed) → N/A, not a vacuous pass')
{
  const dir = makeRepo({}, {})
  const { code, rep } = run(dir)
  code === 0 && rep?.pass === true && [...wIds(rep)].some((x) => x.includes('n-a')) && bIds(rep).size === 0
    ? ok('nothing changed → N/A warn, pass (skip != vacuous-pass)') : bad(`n-a: code ${code} w ${[...wIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(failures ? `\nborrowed-assets: ${failures} FAILED` : '\nborrowed-assets: ALL CASES PASS')
process.exit(failures ? 1 : 0)
