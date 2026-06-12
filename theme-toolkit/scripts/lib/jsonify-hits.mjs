#!/usr/bin/env node
// stdin TSV (check_id<TAB>file<TAB>line<TAB>matched_text) → blockers[] JSON on stdout.
// Blocker shape matches lib/report.mjs: { id, page, detail, evidence }.
//
// Used by gate-editability-greps.sh to turn raw grep hits into schema-exact blockers.
// No external deps. Node 20 ESM.

import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

const CHECK_LABELS = {
  '1.1': 'hardcoded English in render output',
  '1.2': 'image URL not from settings',
  '1.3': 'literal hex/rgb color (bypasses color schemes)',
  '1.4': 'literal alt text',
  '1.5': 'hardcoded href',
  'base-tag-missing': 'no `base` git tag — mantle bootstrap incomplete',
}

export function hitsToBlockers(tsv) {
  const blockers = []
  for (const raw of String(tsv).split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line.trim()) continue
    const [checkId = '', file = '', lineNo = '', ...rest] = line.split('\t')
    const shortId = checkId.replace(/^editability\./, '')
    const label = CHECK_LABELS[shortId] ?? 'editability violation'
    blockers.push({
      id: checkId.startsWith('editability.') ? checkId : `editability.${checkId}`,
      page: file,
      detail: `${file}:${lineNo} — ${label}`,
      evidence: rest.join(' ').trim().slice(0, 300),
    })
  }
  return blockers
}

// CLI mode: node jsonify-hits.mjs < hits.tsv
// (realpath both sides — macOS /tmp is a symlink to /private/tmp and would break a plain URL compare)
const isMain = (() => {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (isMain) {
  let input = ''
  process.stdin.setEncoding('utf-8')
  for await (const chunk of process.stdin) input += chunk
  process.stdout.write(`${JSON.stringify(hitsToBlockers(input))}\n`)
}
