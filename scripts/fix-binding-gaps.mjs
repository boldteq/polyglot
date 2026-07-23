#!/usr/bin/env node
// fix-binding-gaps.mjs — close the C2 gap the A5-precursor lint found: cards that DECLARE a mapped
// color var (e.g. --line: rgba(...) — skipped by the P0 hex-only pass) but don't list it in their
// ## Design-system bindings block. Adds the missing var(s) to the block's **Color:** list. Idempotent.

import fs from 'node:fs'
import path from 'node:path'

const COMPONENTS = path.join(process.env.HOME, '.claude/memory/design/ecom/component-library-premium/components')
const dry = process.argv.includes('--dry')

const ROLE = {
  '--fg': 'color.scheme.text', '--muted': 'color.scheme.text (subdued)',
  '--accent': 'color.scheme.button_bg / accent', '--accent-soft': 'color.scheme.accent (tint)',
  '--accent-ink': 'color.scheme.button_text on accent', '--accent-fg': 'color.scheme.button_text',
  '--line': 'color.scheme.border', '--hair': 'color.scheme.border (hairline)',
  '--card-bg': 'color.scheme.bg (card surface)', '--panel-bg': 'color.scheme.bg (panel surface)',
  '--surface': 'color.scheme.bg (surface)', '--box-bg': 'color.scheme.bg (box surface)',
  '--field-bg': 'color.scheme.bg (field)', '--tab-bg': 'color.scheme.bg (tab)',
  '--band-bg': 'color.scheme.bg (band)', '--chip-bg': 'color.scheme.bg (chip)',
  '--row-alt': 'color.scheme.bg (zebra row)', '--thumb-bg': 'color.scheme.bg (thumb)',
  '--badge-bg': 'color.scheme.accent (badge)',
  '--star': 'color.scheme.accent (rating)', '--ok': 'semantic success', '--verified': 'semantic success (verified)',
  '--urgent': 'color.scheme.accent (promo/urgency)',
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : (e.name.endsWith('.md') && e.name !== '_index.md' && e.name !== 'README.md' ? [path.join(d, e.name)] : []))

let fixed = 0, added = 0
for (const p of walk(COMPONENTS)) {
  let body = fs.readFileSync(p, 'utf8')
  const bindMatch = body.match(/(##\s+Design-system bindings\b[\s\S]*?)(?=\n##\s|$)/)
  if (!bindMatch) continue
  const bindSec = bindMatch[1]
  const declared = [...new Set([...body.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]))].filter((v) => ROLE[v])
  const missing = declared.filter((v) => !bindSec.includes(v))
  if (!missing.length) continue

  const rows = missing.map((v) => `- \`${v}\` → ${ROLE[v]}  (binds \`rgb(var(--color-*))\` scheme role)`).join('\n')
  let newSec
  if (/\*\*Color:\*\*/.test(bindSec)) {
    // append after the last existing color row in the **Color:** list
    newSec = bindSec.replace(/(\*\*Color:\*\*\n(?:- .*\n?)*)/, (blk) => blk.replace(/\n?$/, '\n') + rows + '\n')
  } else {
    // no Color block yet — insert one right after the intro line
    // replacer function so `rows` (generated from var names + role prose) is inert; the capture comes
    // from the args instead of `$1`. As a string, a `$&`/`` $` `` in it would splice the match/prefix
    // back in — the HYG-1 corruption class.
    newSec = bindSec.replace(/(##\s+Design-system bindings\b.*\n(?:_.*_\n)?)/, (_m, g1) => `${g1}\n**Color:**\n${rows}\n`)
  }
  // bindSec is a STRING needle, and newSec is generated — same hazard, same fix.
  body = body.replace(bindSec, () => newSec)
  if (!dry) fs.writeFileSync(p, body)
  fixed++; added += missing.length
}
console.log(`${dry ? '[DRY] ' : ''}cards fixed=${fixed} · color-rows added=${added}`)
