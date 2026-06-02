#!/usr/bin/env node
// Migrate per-agent squad field from v1 (shopify-ecom, saas-stack-a, …) to
// v2 (shopify-website, shopify-app, saas-design-dev, …) using squads.json
// `members[]` as the source of truth. Writes to BOTH Polyglot SQLite and
// the legacy ~/.claude/org/registry.json so both data sources stay in sync.
//
// Usage:
//   node scripts/migrate-squads-v2.mjs            # dry-run (no writes)
//   node scripts/migrate-squads-v2.mjs --apply    # commit changes
//
// Idempotent. Safe to re-run. Logs every change.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(REPO_ROOT, 'data', 'polyglot.db')
const SQUADS_PATH = path.join(os.homedir(), '.claude', 'org', 'squads.json')
const REGISTRY_PATH = path.join(os.homedir(), '.claude', 'org', 'registry.json')

const APPLY = process.argv.includes('--apply')

function readJson(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${p}`)
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function buildSquadMap(squadsData) {
  // agentId → primary squad id. Only uses `members[]` (not `dottedMembers[]`)
  // because dotted is a cross-team chip; primary squad is where they live.
  const map = new Map()
  const collisions = []
  for (const [squadId, squad] of Object.entries(squadsData.squads || {})) {
    for (const memberId of squad.members || []) {
      if (map.has(memberId) && map.get(memberId) !== squadId) {
        collisions.push({ agent: memberId, primary: map.get(memberId), also: squadId })
      } else {
        map.set(memberId, squadId)
      }
    }
  }
  return { map, collisions }
}

function main() {
  console.log(`\n=== Squad Migration v2 (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`)

  // 1. Load source of truth
  const squadsData = readJson(SQUADS_PATH)
  const { map: squadMap, collisions } = buildSquadMap(squadsData)
  console.log(`squads.json: ${Object.keys(squadsData.squads || {}).length} squads, ${squadMap.size} unique members`)
  if (collisions.length > 0) {
    console.warn(`\n⚠️  ${collisions.length} agent(s) listed in multiple squad.members[]:`)
    for (const c of collisions) console.warn(`   ${c.agent}: primary=${c.primary}, also=${c.also} (primary wins)`)
  }

  // 2. Open SQLite
  if (!fs.existsSync(DB_PATH)) {
    console.error(`\n❌ SQLite db not found at ${DB_PATH}. Run Polyglot once to initialize.`)
    process.exit(1)
  }
  const db = new Database(DB_PATH)

  // 3. Read SQLite agents
  const dbAgents = db.prepare('SELECT id, name, squad, status FROM agents').all()
  console.log(`\nSQLite: ${dbAgents.length} agents found.`)

  const sqliteChanges = []
  for (const row of dbAgents) {
    const targetSquad = squadMap.get(row.id) || null
    if (row.squad === targetSquad) continue
    sqliteChanges.push({ id: row.id, name: row.name, from: row.squad, to: targetSquad })
  }

  // 4. Read registry.json
  const registry = readJson(REGISTRY_PATH)
  const registryChanges = []
  for (const [id, agent] of Object.entries(registry.agents || {})) {
    const targetSquad = squadMap.get(id) || null
    if (agent.squad === targetSquad) continue
    registryChanges.push({ id, name: agent.name, from: agent.squad || null, to: targetSquad })
  }

  // 5. Print plan
  console.log(`\n── SQLite changes pending: ${sqliteChanges.length} ──`)
  for (const c of sqliteChanges) {
    console.log(`  ${c.id.padEnd(28)} ${String(c.from || 'null').padEnd(20)} → ${c.to || 'null'}`)
  }
  console.log(`\n── registry.json changes pending: ${registryChanges.length} ──`)
  for (const c of registryChanges) {
    console.log(`  ${c.id.padEnd(28)} ${String(c.from || 'null').padEnd(20)} → ${c.to || 'null'}`)
  }

  const unmapped = dbAgents.filter(r => !squadMap.has(r.id)).map(r => r.id)
  if (unmapped.length > 0) {
    console.warn(`\n⚠️  ${unmapped.length} agent(s) in SQLite NOT listed in any squad.members[]:`)
    for (const id of unmapped) console.warn(`   ${id} (will get squad=null)`)
  }

  if (!APPLY) {
    console.log(`\n📋 Dry-run complete. ${sqliteChanges.length + registryChanges.length} total writes pending.`)
    console.log(`   Re-run with --apply to commit.\n`)
    db.close()
    return
  }

  // 6. Apply
  console.log(`\n── Applying ──`)
  const update = db.prepare('UPDATE agents SET squad = ?, updatedAt = ? WHERE id = ?')
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    for (const c of sqliteChanges) {
      update.run(c.to, now, c.id)
    }
  })
  tx()
  console.log(`  SQLite: ${sqliteChanges.length} rows updated.`)

  if (registryChanges.length > 0) {
    for (const c of registryChanges) {
      if (!registry.agents[c.id]) continue
      registry.agents[c.id].squad = c.to
    }
    registry.updatedAt = now
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2))
    console.log(`  registry.json: ${registryChanges.length} entries updated.`)
  }

  db.close()
  console.log(`\n✅ Migration complete. Restart Polyglot or wait for SSE taxonomy:update event to refresh open tabs.\n`)
}

try { main() } catch (err) {
  console.error(`\n❌ Migration failed: ${err.message}`)
  console.error(err.stack)
  process.exit(1)
}
