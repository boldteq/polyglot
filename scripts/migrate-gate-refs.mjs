#!/usr/bin/env node
// Reconciles existing gate CITATIONS to the new branded names, driven by gate-migration-map.json.
// SAFE by design: replacements are NUMBER-ANCHORED (`#13 honesty` → `#13 candor`) so common-word
// brand names (flow / harmony / brief / proof / media / search …) never corrupt prose that merely
// uses those English words. Also rewrites the daemon's GATES prompt string. Idempotent.
// Dry-run by default; --apply to write.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const HOME = process.env.HOME
const MAP = JSON.parse(fs.readFileSync(path.join(HERE, 'gate-migration-map.json'), 'utf8'))
const APPLY = process.argv.includes('--apply')

// pairs: {oldNum, oldName, newNum, newName}
const pairs = [
  ...MAP.renames.map((r) => ({ oldNum: r.number, oldName: r.old, newNum: r.number, newName: r.new })),
  ...MAP.merges.flatMap((m) => m.absorbs.map((a) => ({ oldNum: a.number, oldName: a.old, newNum: m.number, newName: m.new }))),
]
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const numRe = (n) => esc(String(n))

function rewrite(text) {
  let t = text
  for (const p of pairs) {
    // primary citation form: "#<oldNum> <oldName>"  (optional whitespace) → "#<newNum> <newName>"
    t = t.replace(new RegExp(`#\\s*${numRe(p.oldNum)}\\s+${esc(p.oldName)}\\b`, 'g'), () => `#${p.newNum} ${p.newName}`)
    // reverse form: "<oldName> (#<oldNum>)" → "<newName> (#<newNum>)"
    t = t.replace(new RegExp(`\\b${esc(p.oldName)}\\s*\\(#\\s*${numRe(p.oldNum)}\\)`, 'g'), () => `${p.newName} (#${p.newNum})`)
  }
  // merges retire numbers — rewrite a BARE retired "#<oldNum>" to its merge target number (retired
  // numbers are unique to their absorbed gate, so this is safe). Renames keep their number untouched.
  for (const p of pairs) {
    if (p.newNum !== p.oldNum) t = t.replace(new RegExp(`#${numRe(p.oldNum)}\\b`, 'g'), () => `#${p.newNum}`)
  }
  return t
}

// targets: agents + KB good docs (incl. brain + digest) + the daemon prompt string
const targets = []
const agentsDir = path.join(HOME, '.claude/agents')
const goodDir = path.join(HOME, '.claude/memory/patterns/good')
for (const d of [agentsDir, goodDir]) {
  if (!fs.existsSync(d)) continue
  for (const f of fs.readdirSync(d)) if (f.endsWith('.md')) targets.push(path.join(d, f))
}
targets.push(path.join(ROOT, 'scripts/swt-train-loop.mjs')) // GATES prompt string

let changed = 0
for (const fp of targets) {
  const t = fs.readFileSync(fp, 'utf8')
  const n = rewrite(t)
  if (n !== t) {
    const hits = t.length - n.length
    console.log(`  ${path.relative(HOME, fp)}  (~${Math.abs(hits)} byte delta)`)
    changed++
    if (APPLY) fs.writeFileSync(fp, n)
  }
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${changed} file(s) with citation updates.`)
