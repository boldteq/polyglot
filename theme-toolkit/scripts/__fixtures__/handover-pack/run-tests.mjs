// Hermetic fixture for gate #56 handover-pack. PURE assessArtifact/loadSpec + gate end-to-end. No git,
// no MCP, no network. Proves: a complete 6-artifact pack passes even at publish-grade; a missing/thin
// artifact warns in dev but BLOCKs at publish-grade; no docs/handover/ yet → N/A (not a vacuous pass);
// a leftover {{…}} placeholder only WARNs (support.md's commercial terms never hard-block).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assessArtifact, loadSpec } from '../../check-handover-pack.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const truthy = (v, m) => (v ? ok(m) : bad(m))

console.log('case (a) assessArtifact — missing / thin / substantial / placeholder')
{
  truthy(assessArtifact(null).ok === false, 'null content → missing (ok:false)')
  truthy(assessArtifact('x'.repeat(300), 200).thin === false, 'substantial content → not thin')
  truthy(assessArtifact('short', 200).thin === true, 'under minBytes → thin')
  truthy(assessArtifact('All set. {{ monthly_retainer }} per month.', 5).placeholder === true, '{{…}} → placeholder')
  truthy(assessArtifact('A complete filled guide with real content and no gaps.', 5).placeholder === false, 'clean prose → no placeholder')
}

console.log('case (b) loadSpec — the canonical 6 artifacts, spec-as-data')
{
  const spec = loadSpec()
  truthy(spec.artifacts.length === 6 && spec.dir === 'docs/handover', 'spec has 6 artifacts under docs/handover')
  truthy(spec.artifacts.some((a) => a.file === 'support.md' && a.allowsPlaceholders), 'support.md allows commercial placeholders')
}

// ── gate end-to-end ──────────────────────────────────────────────────────────
const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'check-handover-pack.mjs')
const SPEC = loadSpec()
const filler = 'x'.repeat(SPEC.minBytes + 50)
function makeRepo(handoverFiles /* {file: content} | null to omit the dir entirely */) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handover-'))
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'sections', 'main.liquid'), '<div>x</div>')
  if (handoverFiles) {
    fs.mkdirSync(path.join(dir, 'docs', 'handover'), { recursive: true })
    for (const [f, c] of Object.entries(handoverFiles)) fs.writeFileSync(path.join(dir, 'docs', 'handover', f), c)
  }
  return dir
}
const fullPack = () => Object.fromEntries(SPEC.artifacts.map((a) => [a.file, `# ${a.title}\n\n${filler}`]))
function run(dir, env = {}) {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handover-rep-'))
  const r = spawnSync('node', [GATE], { cwd: dir, env: { ...process.env, REPORT_DIR: reportDir, DS_REQUIRE_SCOPE: '', ...env }, encoding: 'utf-8' })
  let rep = null
  try { rep = JSON.parse(fs.readFileSync(path.join(reportDir, 'handover-pack.json'), 'utf-8')) } catch { /* */ }
  fs.rmSync(reportDir, { recursive: true, force: true })
  return { code: r.status, rep }
}
const wIds = (rep) => new Set((rep?.warnings || []).map((w) => w.id))
const bIds = (rep) => new Set((rep?.blockers || []).map((b) => b.id))

console.log('case (c) complete pack → PASS even at publish-grade')
{
  const dir = makeRepo(fullPack())
  const { code, rep } = run(dir, { DS_REQUIRE_SCOPE: '1' })
  code === 0 && bIds(rep).size === 0 ? ok('all 6 artifacts present + substantial → PASS') : bad(`complete: code ${code} b ${[...bIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (d) missing one artifact → warn in dev, BLOCK at publish-grade')
{
  const files = fullPack(); delete files['support.md']
  const dir = makeRepo(files)
  const dev = run(dir)
  dev.code === 0 && wIds(dev.rep).has('handover.artifact-missing') ? ok('missing support.md in dev → WARN, exit 0') : bad(`missing dev: code ${dev.code} w ${[...wIds(dev.rep)]}`)
  const strict = run(dir, { DS_REQUIRE_SCOPE: '1' })
  strict.code === 1 && bIds(strict.rep).has('handover.artifact-missing') ? ok('missing support.md at publish-grade → BLOCK') : bad(`missing strict: code ${strict.code} b ${[...bIds(strict.rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (e) thin artifact → BLOCK at publish-grade')
{
  const files = fullPack(); files['apps.md'] = 'stub'
  const dir = makeRepo(files)
  const { code, rep } = run(dir, { DS_REQUIRE_SCOPE: '1' })
  code === 1 && bIds(rep).has('handover.artifact-thin') ? ok('thin apps.md at publish-grade → BLOCK') : bad(`thin: code ${code} b ${[...bIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (f) no docs/handover/ yet → N/A in dev (pass), BLOCK at publish-grade')
{
  const dir = makeRepo(null)
  const dev = run(dir)
  dev.code === 0 && [...wIds(dev.rep)].some((x) => x.includes('n-a')) && bIds(dev.rep).size === 0 ? ok('no pack in dev → N/A warn, pass (skip != vacuous-pass)') : bad(`n-a dev: code ${dev.code} w ${[...wIds(dev.rep)]}`)
  const strict = run(dir, { DS_REQUIRE_SCOPE: '1' })
  strict.code === 1 && bIds(strict.rep).has('handover.pack-missing') ? ok('no pack at publish-grade → BLOCK') : bad(`n-a strict: code ${strict.code} b ${[...bIds(strict.rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log('case (g) leftover {{…}} placeholder in support.md → WARN only, never blocks')
{
  const files = fullPack(); files['support.md'] = `# Support & SLA\n\n${filler}\nMonthly retainer: {{ retainer }}.`
  const dir = makeRepo(files)
  const { code, rep } = run(dir, { DS_REQUIRE_SCOPE: '1' })
  code === 0 && wIds(rep).has('handover.artifact-placeholder') && bIds(rep).size === 0 ? ok('support.md {{…}} → WARN, still PASS at publish-grade') : bad(`placeholder: code ${code} b ${[...bIds(rep)]} w ${[...wIds(rep)]}`)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(failures ? `\nhandover-pack: ${failures} FAILED` : '\nhandover-pack: ALL CASES PASS')
process.exit(failures ? 1 : 0)
