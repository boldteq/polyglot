// Hermetic fixture for gate #53 ai-tells. PURE core + end-to-end. No MCP, no store, no network.
// Doctrine: shopify-design-taste-doctrine.md — AT-10 cliché headlines (warn/block-at-publish) + AT-5 missing
// institutional signals (warn). Never penalises plain layout (§Z). See check-ai-tells.mjs header.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { clicheHits, headlineCorpusFromLiquid, headlineCorpusFromLocale, institutionalSignals } from '../../check-ai-tells.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('case (a) clicheHits — flags each LLM-default template, clean copy → none')
{
  eq(clicheHits('Elevate your everyday ritual').map((h) => h.id), ['elevate-your'], 'elevate-your')
  eq(clicheHits('Unlock the power of clean skin').map((h) => h.id), ['unlock-power'], 'unlock-power')
  eq(clicheHits('More than just a candle').map((h) => h.id), ['more-than-just'], 'more-than-just')
  eq(clicheHits("It's not just coffee, it's a ritual").map((h) => h.id), ['negative-parallelism'], 'negative-parallelism')
  eq(clicheHits('In today’s fast-paced world').map((h) => h.id), ['todays-world'], 'todays-world (curly apostrophe)')
  eq(clicheHits('Handmade soy candles, poured in small batches').length, 0, 'clean brand copy → NO hit (low FP)')
}

console.log('case (b) headlineCorpusFromLiquid — <h1>/<h2> text + heading-ish schema defaults only')
{
  const raw = '<section><h1>Hero Headline</h1><p>body copy here</p><h2>Sub Line</h2></section>{% schema %}{"settings":[{"id":"heading","default":"Schema Heading"},{"id":"body_text","default":"not a heading"}]}{% endschema %}'
  eq(headlineCorpusFromLiquid(raw).sort(), ['Hero Headline', 'Schema Heading', 'Sub Line'], 'h1 + h2 + heading default; body setting excluded')
  eq(headlineCorpusFromLiquid('<div>no headings, no schema</div>'), [], 'no headings → empty corpus')
}

console.log('case (c) headlineCorpusFromLocale — heading-ish keys only, at any depth')
{
  const obj = { hero: { heading: 'Big Title', body: 'not a heading' }, cart: { title: 'Cart' } }
  eq(headlineCorpusFromLocale(obj).sort(), ['Big Title', 'Cart'], 'heading + title captured; body excluded')
}

console.log('case (d) institutionalSignals — policy + contact presence')
{
  eq(institutionalSignals('<a href="{{ shop.privacy_policy.url }}">Privacy</a> <a href="mailto:hi@b.com">Email</a>'), { policy: true, contact: true }, 'shop.*_policy + mailto → both present')
  eq(institutionalSignals('<a href="tel:+15551234">Call us</a>'), { policy: false, contact: true }, 'tel: → contact only')
  eq(institutionalSignals('See our refund policy for details'), { policy: true, contact: false }, 'policy link text → policy only')
  eq(institutionalSignals('<h1>Just a headline, nothing else</h1>'), { policy: false, contact: false }, 'stripped theme → neither')
}

console.log('gate end-to-end')
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-ai-tells.mjs')
function run(files, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitells-'))
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true })
  for (const [rel, content] of Object.entries(files)) { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), content) }
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitells-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, AI_TELLS_SCAN_ALL: '1', DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'ai-tells.json'), 'utf-8')) } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const wIds = (rep) => new Set((rep?.warnings || []).map((w) => w.id))
const bIds = (rep) => new Set((rep?.blockers || []).map((b) => b.id))

// signals wired (footer with policy + contact) so AT-5 stays quiet across cases that only test AT-10
const footer = '<footer><a href="{{ shop.privacy_policy.url }}">Privacy</a><a href="mailto:hi@brand.com">Email</a></footer>'

{
  const { code, rep } = run({ 'sections/hero.liquid': '<h1>Handmade soy candles, poured in small batches</h1>', 'sections/footer.liquid': footer })
  code === 0 && bIds(rep).size === 0 && !wIds(rep).has('ai.cliche-headline') && !wIds(rep).has('ai.missing-policy-links') && !wIds(rep).has('ai.missing-contact')
    ? ok('clean copy + wired signals → PASS, no warnings') : bad(`clean: code ${code} w ${[...wIds(rep)]}`)
}
{
  const files = { 'sections/hero.liquid': '<h1>Elevate your everyday ritual</h1>', 'sections/footer.liquid': footer }
  const dev = run(files)
  dev.code === 0 && wIds(dev.rep).has('ai.cliche-headline') ? ok('cliché hero in dev → WARN, exit 0') : bad(`cliché dev: code ${dev.code} w ${[...wIds(dev.rep)]}`)
  const strict = run(files, { DS_REQUIRE_SCOPE: '1' })
  strict.code === 1 && bIds(strict.rep).has('ai.cliche-headline') ? ok('cliché hero at publish-grade → BLOCK, exit 1') : bad(`cliché strict: code ${strict.code} b ${[...bIds(strict.rep)]}`)
}
{
  const { code, rep } = run({ 'sections/hero.liquid': '<h1>Fresh roasted coffee, shipped weekly</h1>' })
  code === 0 && wIds(rep).has('ai.missing-policy-links') && wIds(rep).has('ai.missing-contact') && !wIds(rep).has('ai.cliche-headline')
    ? ok('stripped theme (no policy/contact, clean copy) → 2 missing-signal warns, exit 0') : bad(`stripped: code ${code} w ${[...wIds(rep)]}`)
}
{
  // §Z guard proof: a plain/conventional layout with real copy must NOT trip anything
  const { code, rep } = run({ 'sections/hero.liquid': '<h1>Ceramic mugs for slow mornings</h1><p>Wheel-thrown in our Leeds studio.</p>', 'sections/footer.liquid': footer })
  code === 0 && bIds(rep).size === 0 && [...wIds(rep)].filter((x) => x.startsWith('ai.')).length === 0 ? ok('plain conventional layout → clean (never penalise plain, §Z)') : bad(`plain: code ${code} w ${[...wIds(rep)]}`)
}

console.log(failures ? `\nai-tells: ${failures} FAILED` : '\nai-tells: ALL CASES PASS')
process.exit(failures ? 1 : 0)
