#!/usr/bin/env node
// One-time migration: assign department slugs to agent frontmatter.
// Idempotent — re-running is safe, already-correct files report OK.
// Usage:
//   node scripts/migrate-agent-departments.mjs            # apply
//   node scripts/migrate-agent-departments.mjs --dry-run  # preview
//   node scripts/migrate-agent-departments.mjs --verbose  # include OK lines

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import matter from 'gray-matter'

const DRY_RUN = process.argv.includes('--dry-run')
const VERBOSE = process.argv.includes('--verbose')

const HOME = os.homedir()

const DEPARTMENT_MAP = {
  // Engineering
  koda: 'engineering',
  dato: 'engineering',
  vex: 'engineering',
  luna: 'engineering',
  sage: 'engineering',
  riko: 'engineering',
  bolt: 'engineering',
  hawk: 'engineering',
  // Design
  vega: 'design',
  // Research
  scout: 'research',
  nova: 'research',
  atlas: 'research',
  pulse: 'research',
  harvest: 'research',
  // Ops/Strategy
  rex: 'ops-strategy',
  arya: 'ops-strategy',
  verdict: 'ops-strategy',
  orbit: 'ops-strategy',
  ledger: 'ops-strategy',
  echo: 'ops-strategy',
  // HR
  cadence: 'hr',
  roster: 'hr',
  witness: 'hr',
  forge: 'hr',
  tutor: 'hr',
  mira: 'hr',
  // Content/SEO
  quill: 'content-seo',
  zeph: 'content-seo',
}

function atomicWriteText(filePath, text) {
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, text, 'utf-8')
  fs.renameSync(tmp, filePath)
}

function loadConfig() {
  const cfgPath = path.resolve(process.cwd(), 'config.json')
  if (!fs.existsSync(cfgPath)) return { projectDirs: [] }
  try {
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  } catch {
    return { projectDirs: [] }
  }
}

function collectAgentDirs() {
  const dirs = new Set()

  // Global agents
  const globalDir = path.join(HOME, '.claude', 'agents')
  if (fs.existsSync(globalDir)) dirs.add(globalDir)

  // Per-project agents
  const { projectDirs = [] } = loadConfig()
  for (const d of projectDirs) {
    const resolved = d.replace(/^~/, HOME)
    if (!fs.existsSync(resolved)) continue
    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const agentsDir = path.join(resolved, entry.name, '.claude', 'agents')
        if (fs.existsSync(agentsDir)) dirs.add(agentsDir)
      }
    } catch {}
  }

  return [...dirs]
}

function migrateFile(filePath) {
  const base = path.basename(filePath, '.md').toLowerCase()
  const target = DEPARTMENT_MAP[base]
  if (!target) return { status: 'SKIP', reason: 'not in map' }

  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    return { status: 'ERROR', reason: err.message }
  }

  let parsed
  try {
    parsed = matter(raw)
  } catch (err) {
    return { status: 'ERROR', reason: `frontmatter parse: ${err.message}` }
  }

  const current = parsed.data?.category
  if (current === target) return { status: 'OK', current }

  const nextData = { ...parsed.data, category: target }
  const out = matter.stringify(parsed.content, nextData)

  if (!DRY_RUN) {
    try {
      atomicWriteText(filePath, out)
    } catch (err) {
      return { status: 'ERROR', reason: err.message }
    }
  }

  return { status: 'UPDATE', from: current ?? '(none)', to: target }
}

function main() {
  const dirs = collectAgentDirs()
  if (dirs.length === 0) {
    console.error('No agent directories found. Run from the Polyglot repo root.')
    process.exit(1)
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Scanning ${dirs.length} agent director${dirs.length === 1 ? 'y' : 'ies'}:`)
  for (const d of dirs) console.log(`  - ${d.replace(HOME, '~')}`)
  console.log('')

  const counts = { UPDATE: 0, OK: 0, SKIP: 0, ERROR: 0 }
  const byDept = {}

  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    for (const f of files) {
      const full = path.join(dir, f)
      const result = migrateFile(full)
      counts[result.status]++

      const rel = full.replace(HOME, '~')
      if (result.status === 'UPDATE') {
        byDept[result.to] = (byDept[result.to] || 0) + 1
        console.log(`UPDATE  ${rel}  ${result.from} -> ${result.to}`)
      } else if (result.status === 'ERROR') {
        console.log(`ERROR   ${rel}  ${result.reason}`)
      } else if (result.status === 'OK') {
        byDept[result.current] = (byDept[result.current] || 0) + 1
        if (VERBOSE) console.log(`OK      ${rel}  (${result.current})`)
      } else if (result.status === 'SKIP' && VERBOSE) {
        console.log(`SKIP    ${rel}  (${result.reason})`)
      }
    }
  }

  console.log('')
  console.log('Summary:')
  console.log(`  UPDATE: ${counts.UPDATE}`)
  console.log(`  OK:     ${counts.OK}`)
  console.log(`  SKIP:   ${counts.SKIP}`)
  console.log(`  ERROR:  ${counts.ERROR}`)
  console.log('')
  console.log('By department (mapped agents only):')
  for (const [dept, n] of Object.entries(byDept).sort()) {
    console.log(`  ${dept}: ${n}`)
  }

  if (counts.ERROR > 0) process.exit(2)
}

main()
