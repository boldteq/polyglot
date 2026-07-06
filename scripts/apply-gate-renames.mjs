#!/usr/bin/env node
// Applies the MECHANICAL half of the gate rename from gate-migration-map.json:
//   per renamed/host gate → swap writeReport('<old>' → '<new>' in its script,
//   git mv __fixtures__/<old> → __fixtures__/<new>, and rewrite the gate-name token
//   inside the moved fixture (report.gate assertions + <old>.json reads).
// Merge LOGIC folding + the new media/tribunal scripts are done by hand, not here.
// Dry-run by default; pass --apply to write.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SCRIPTS = path.join(ROOT, 'theme-toolkit/scripts')
const FX = path.join(SCRIPTS, '__fixtures__')
const MAP = JSON.parse(fs.readFileSync(path.join(HERE, 'gate-migration-map.json'), 'utf8'))
const APPLY = process.argv.includes('--apply')

// in-place host renames: the surviving merge script keeps running but its gate name changes
const hostRenames = MAP.merges
  .map((m) => {
    const host = m.absorbs.find((a) => a.isHost)
    return host ? { old: host.old, new: m.new, script: m.script, fixture: host.fixture } : null
  })
  .filter(Boolean)

const renameJobs = [
  ...MAP.renames.filter((r) => !r.noWriteReport).map((r) => ({ old: r.old, new: r.new, script: r.script, fixture: r.fixture })),
  ...hostRenames,
]

function rmFirst(text, patterns, repl) {
  for (const p of patterns) {
    const i = text.indexOf(p)
    if (i !== -1) return text.slice(0, i) + repl + text.slice(i + p.length)
  }
  return text
}

let edits = 0
for (const j of renameJobs) {
  // 1) writeReport('<old>'  →  '<new>'
  const sp = path.join(SCRIPTS, j.script)
  if (fs.existsSync(sp)) {
    const txt = fs.readFileSync(sp, 'utf8')
    const next = rmFirst(txt, [`writeReport('${j.old}'`, `writeReport("${j.old}"`], `writeReport('${j.new}'`)
    if (next !== txt) {
      console.log(`  writeReport  ${j.script}: '${j.old}' → '${j.new}'`)
      edits++
      if (APPLY) fs.writeFileSync(sp, next)
    } else if (!txt.includes(`writeReport('${j.new}'`)) {
      console.log(`  ! no writeReport('${j.old}') found in ${j.script}`)
    }
  } else {
    console.log(`  ! script missing: ${j.script}`)
  }

  // 2) git mv fixture dir + rewrite gate-name token inside it
  if (j.fixture) {
    const oldDir = path.join(FX, j.fixture)
    const newDir = path.join(FX, j.new)
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      console.log(`  git mv      __fixtures__/${j.fixture} → __fixtures__/${j.new}`)
      edits++
      if (APPLY) {
        const r = spawnSync('git', ['mv', oldDir, newDir], { cwd: ROOT, encoding: 'utf8' })
        if (r.status !== 0) { console.log(`    git mv failed (${r.stderr.trim()}); falling back to fs.renameSync`); fs.renameSync(oldDir, newDir) }
      }
    }
    // rewrite the gate-name token inside the (new) fixture files
    const dir = APPLY ? newDir : oldDir
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!/\.(mjs|js|json|md)$/.test(f)) continue
        const fp = path.join(dir, f)
        const t = fs.readFileSync(fp, 'utf8')
        const n = t
          .split(`'${j.old}'`).join(`'${j.new}'`)
          .split(`"${j.old}"`).join(`"${j.new}"`)
          .split(`${j.old}.json`).join(`${j.new}.json`)
          .split(`gate-reports/${j.old}`).join(`gate-reports/${j.new}`)
        if (n !== t) {
          console.log(`    token rewrite ${j.new}/${f}`)
          edits++
          if (APPLY) fs.writeFileSync(fp, n)
        }
      }
    }
  }
}
console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${edits} edit(s). ${APPLY ? '' : 'Re-run with --apply to write.'}`)
