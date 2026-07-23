#!/usr/bin/env node
// Number-anchored reconcile of historical gate citations: round-2 ABSTRACT name → loved name.
// "#13 candor" → "#13 honesty", "candor (#13)" → "honesty (#13)". Safe (anchored on the stable
// number, so common-word loved names never corrupt prose). Idempotent. --apply to write.

import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.HOME
const APPLY = process.argv.includes('--apply')
// [abstract, loved, number]
const P = [
  ['anchor', 'theme-lock', '0'], ['brief', 'discovery', '0.4'], ['blueprint', 'foundation', '0.5'],
  ['speed', 'performance', '1'], ['syntax', 'code-lint', '2'], ['editable', 'editability', '3'],
  ['access', 'accessibility', '5'], ['search', 'seo', '6'], ['convert', 'conversion', '7'],
  ['tokens', 'design-tokens', '8'], ['harmony', 'consistency', '9'], ['flow', 'functionality', '10'],
  ['hygiene', 'dead-code', '11'], ['taste', 'design-quality', '12'], ['candor', 'honesty', '13'],
  ['wiring', 'render-check', '14'], ['forms', 'static-a11y', '16'], ['lens', 'visual-check', '18'],
  ['cohesion', 'section-consistency', '19'], ['cards', 'library-cards', '20'], ['ladder', 'section-reuse', '23'],
  ['media', 'imagery', '24'], ['reroute', 'redirects', '25'], ['apps', 'app-conflicts', '27'],
  ['locale', 'translations', '28'], ['lifecycle', 'email-triggers', '29'], ['cascade', 'brand-sync', '30'],
  ['tribunal', 'review-board', '31'], ['thumb', 'mobile', '35'], ['proof', 'content-quality', '36'],
]
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function rewrite(t) {
  for (const [o, n, num] of P) {
    t = t.replace(new RegExp(`#\\s*${esc(num)}\\s+${o}\\b`, 'g'), () => `#${num} ${n}`)
    t = t.replace(new RegExp(`\\b${o}\\s*\\(#\\s*${esc(num)}\\)`, 'g'), () => `${n} (#${num})`)
  }
  return t
}
const targets = []
for (const d of [path.join(HOME, '.claude/agents'), path.join(HOME, '.claude/memory/patterns/good')]) {
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.md')) targets.push(path.join(d, f))
}
let changed = 0
for (const fp of targets) { const t = fs.readFileSync(fp, 'utf8'); const n = rewrite(t); if (n !== t) { changed++; if (APPLY) fs.writeFileSync(fp, n); console.log(`  ${path.relative(HOME, fp)}`) } }
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${changed} file(s).`)
