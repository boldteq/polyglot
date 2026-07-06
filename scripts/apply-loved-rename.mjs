#!/usr/bin/env node
// Renames the gate scripts' writeReport first-arg + their fixture dirs from the round-2 ABSTRACT
// names to the loved PURPOSE names. Pure renames (no merges). Dry-run by default; --apply to write.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SCRIPTS = path.join(ROOT, 'theme-toolkit/scripts')
const FX = path.join(SCRIPTS, '__fixtures__')
const APPLY = process.argv.includes('--apply')

// abstract → loved  (script = file that calls writeReport; fixture = __fixtures__ dir, null if none)
const MAP = [
  { o: 'anchor', n: 'theme-lock', script: 'shopify-theme-guard.mjs', fixture: 'anchor' },
  { o: 'brief', n: 'discovery', script: 'check-discovery.mjs', fixture: 'brief' },
  { o: 'blueprint', n: 'foundation', script: 'check-bootstrap.mjs', fixture: 'blueprint' },
  { o: 'speed', n: 'performance', script: 'gate-lighthouse.mjs', fixture: null },
  { o: 'syntax', n: 'code-lint', script: 'gate-theme-check.mjs', fixture: null },
  { o: 'access', n: 'accessibility', script: 'gate-axe.mjs', fixture: null },
  { o: 'search', n: 'seo', script: 'gate-seo.mjs', fixture: null },
  { o: 'convert', n: 'conversion', script: 'gate-conversion.mjs', fixture: null },
  { o: 'tokens', n: 'design-tokens', script: 'check-design-system.mjs', fixture: 'tokens' },
  { o: 'harmony', n: 'consistency', script: 'check-consistency.mjs', fixture: 'harmony' },
  { o: 'flow', n: 'functionality', script: 'gate-functional.mjs', fixture: null },
  { o: 'hygiene', n: 'dead-code', script: 'check-antipatterns.mjs', fixture: 'hygiene' },
  { o: 'taste', n: 'design-quality', script: 'check-design-quality.mjs', fixture: 'taste' },
  { o: 'candor', n: 'honesty', script: 'check-honesty.mjs', fixture: 'candor' },
  { o: 'wiring', n: 'render-check', script: 'check-render-wiring.mjs', fixture: 'wiring' },
  { o: 'forms', n: 'static-a11y', script: 'check-a11y-static.mjs', fixture: 'forms' },
  { o: 'lens', n: 'visual-check', script: 'check-visual-truth.mjs', fixture: 'lens' },
  { o: 'cohesion', n: 'section-consistency', script: 'check-section-cohesion.mjs', fixture: null },
  { o: 'cards', n: 'library-cards', script: 'check-card-bindings.mjs', fixture: 'cards' },
  { o: 'ladder', n: 'section-reuse', script: 'check-reuse-map.mjs', fixture: 'ladder' },
  { o: 'media', n: 'imagery', script: 'check-media-quality.mjs', fixture: 'media' },
  { o: 'reroute', n: 'redirects', script: 'check-redirects.mjs', fixture: 'reroute' },
  { o: 'apps', n: 'app-conflicts', script: 'check-app-conflicts.mjs', fixture: 'apps' },
  { o: 'locale', n: 'translations', script: 'check-locale-completeness.mjs', fixture: 'locale' },
  { o: 'lifecycle', n: 'email-triggers', script: 'check-email-triggers.mjs', fixture: 'lifecycle' },
  { o: 'cascade', n: 'brand-sync', script: 'check-ds-cascade.mjs', fixture: 'cascade' },
  { o: 'tribunal', n: 'review-board', script: 'check-governance.mjs', fixture: 'tribunal' },
  { o: 'thumb', n: 'mobile', script: 'check-mobile-layout.mjs', fixture: 'thumb' },
  { o: 'proof', n: 'content-quality', script: 'check-placeholder-text.mjs', fixture: 'proof' },
]
// non-gate-named fixtures that READ an abstract report file → rewrite to loved report name
const READ_FIXES = [
  { fixture: 'a11y', from: 'forms.json', to: 'static-a11y.json' },
  { fixture: 'design-quality-baseline', from: 'taste.json', to: 'design-quality.json' },
  { fixture: 'discovery-schema', from: 'brief.json', to: 'discovery.json' },
  { fixture: 'regressions', from: 'lens.json', to: 'visual-check.json' },
]

function rmFirst(text, pats, repl) {
  for (const p of pats) { const i = text.indexOf(p); if (i !== -1) return text.slice(0, i) + repl + text.slice(i + p.length) }
  return text
}
let edits = 0
for (const j of MAP) {
  const sp = path.join(SCRIPTS, j.script)
  if (fs.existsSync(sp)) {
    const t = fs.readFileSync(sp, 'utf8')
    const n = rmFirst(t, [`writeReport('${j.o}'`, `writeReport("${j.o}"`], `writeReport('${j.n}'`)
    if (n !== t) { console.log(`  writeReport ${j.script}: '${j.o}'→'${j.n}'`); edits++; if (APPLY) fs.writeFileSync(sp, n) }
  }
  if (j.fixture) {
    const oldDir = path.join(FX, j.fixture), newDir = path.join(FX, j.n)
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      console.log(`  git mv __fixtures__/${j.fixture}→${j.n}`); edits++
      if (APPLY) { const r = spawnSync('git', ['mv', oldDir, newDir], { cwd: ROOT, encoding: 'utf8' }); if (r.status !== 0) fs.renameSync(oldDir, newDir) }
    }
    const dir = APPLY ? newDir : oldDir
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
      if (!/\.(mjs|js|json|md)$/.test(f)) continue
      const fp = path.join(dir, f), t = fs.readFileSync(fp, 'utf8')
      const n = t.split(`'${j.o}'`).join(`'${j.n}'`).split(`"${j.o}"`).join(`"${j.n}"`).split(`${j.o}.json`).join(`${j.n}.json`).split(`gate-reports/${j.o}`).join(`gate-reports/${j.n}`)
      if (n !== t) { console.log(`    token ${j.n}/${f}`); edits++; if (APPLY) fs.writeFileSync(fp, n) }
    }
  }
}
for (const r of READ_FIXES) {
  const fp = path.join(FX, r.fixture, 'run-tests.mjs')
  if (fs.existsSync(fp)) { const t = fs.readFileSync(fp, 'utf8'); const n = t.split(`'${r.from}'`).join(`'${r.to}'`)
    if (n !== t) { console.log(`  read-fix ${r.fixture}: ${r.from}→${r.to}`); edits++; if (APPLY) fs.writeFileSync(fp, n) } }
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${edits} edit(s).`)
