#!/usr/bin/env node
// audit-dead-pages — REPORT-ONLY orphan-page finder (Plan v3 · A hygiene).
//
// Cross-references every client/src/pages/*.tsx against the rest of client/src: a page is "wired" if
// any OTHER file references it by import path (`pages/<Stem>`) — routers lazy/static-import pages that
// way. Pages with zero inbound references are ORPHAN CANDIDATES. This NEVER deletes — it prints a table
// for a human to review (a page can be route-registered dynamically, so confirm before removing).
//
// Run: node scripts/audit-dead-pages.mjs   ·   Exit: 0 (always — it's a report)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'client', 'src')
const PAGES = path.join(SRC, 'pages')

function walk(dir, out = []) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p)
  }
  return out
}

if (!fs.existsSync(PAGES)) { console.error(`audit-dead-pages: ${PAGES} not found`); process.exit(0) }

const pageFiles = fs.readdirSync(PAGES, { withFileTypes: true }).filter(e => e.isFile() && /\.(tsx?|jsx?)$/.test(e.name)).map(e => e.name)
const allSrc = walk(SRC)
// concat every source file's text ONCE (cheap; client/src is small) for substring search
const corpus = allSrc.map(f => ({ f, text: (() => { try { return fs.readFileSync(f, 'utf-8') } catch { return '' } })() }))

const orphans = []
const wired = []
for (const name of pageFiles) {
  const stem = name.replace(/\.(tsx?|jsx?)$/, '')
  const selfAbs = path.join(PAGES, name)
  // referenced if ANY non-self file mentions the import path `pages/<stem>` (with a word boundary after)
  const re = new RegExp(`pages/${stem.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(["'./\\s)]|$)`)
  const ref = corpus.some(({ f, text }) => f !== selfAbs && re.test(text))
  if (ref) wired.push(stem); else orphans.push(stem)
}

console.log(`audit-dead-pages — ${pageFiles.length} page(s) in client/src/pages`)
console.log(`  wired:  ${wired.length}`)
console.log(`  ORPHAN candidates (no \`pages/<name>\` import found — REVIEW, do not auto-delete): ${orphans.length}`)
for (const o of orphans.sort()) console.log(`    · ${o}.tsx`)
console.log(`\nNOTE: report only — a page may be registered dynamically. Confirm each before removing.`)
process.exit(0)
