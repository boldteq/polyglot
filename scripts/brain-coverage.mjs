#!/usr/bin/env node
// Brain coverage guard — detects SILENT memory loss: a source file enumerable on disk but with ZERO
// chunks in the semantic index (the failure that wiped the FAQ brain). A clean reindex should leave
// every enumerated source represented; a gap means a prune dropped it without re-adding.
//
// Usage: node scripts/brain-coverage.mjs [--json]
// Exit: 0 = full coverage · 1 = one or more enumerated sources missing from the index.
// Importable: brainCoverage() → { total, indexed, missing[], enumerationErrors[] } for the scheduler.

import { enumerateSources } from '../src/intelligence/sources.mjs'
import { getStore } from '../src/intelligence/store.mjs'

export async function brainCoverage() {
  const sources = enumerateSources()
  const store = getStore()
  const indexed = new Set()
  const all = store.allRecords ? await store.allRecords() : (store._load ? [...store._load().values()] : [])
  for (const r of all) indexed.add(r.source_ref)
  const missing = sources.filter((s) => !indexed.has(s.source_ref))
  return { total: sources.length, indexed: sources.length - missing.length, missing, enumerationErrors: sources.enumerationErrors || [] }
}

async function main() {
  const r = await brainCoverage()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ total: r.total, indexed: r.indexed, missing: r.missing.map((m) => m.source_ref), enumerationErrors: r.enumerationErrors }))
    process.exit(r.missing.length ? 1 : 0)
  }
  if (r.enumerationErrors.length) console.error(`⚠ enumeration incomplete — ${r.enumerationErrors.length} dir(s) unreadable (coverage may be understated)`)
  if (r.missing.length === 0) { console.log(`✅ brain coverage: all ${r.total} enumerated sources are in the index (0 missing)`); process.exit(0) }
  console.error(`❌ brain coverage: ${r.missing.length}/${r.total} enumerated source(s) MISSING from the index (silent loss):`)
  for (const m of r.missing.slice(0, 20)) console.error(`   - ${m.source_ref}`)
  if (r.missing.length > 20) console.error(`   … +${r.missing.length - 20} more`)
  console.error('   → restore with: node src/intelligence/reindex.mjs')
  process.exit(1)
}

if (process.argv[1] && process.argv[1].endsWith('brain-coverage.mjs')) main()
