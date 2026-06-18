// Onboard 3 new Shopify Website Team craft agents (drape/ink/beacon) + fix the WordPress
// registry drift (9 agents on disk but not in SQLite; their `wordpress-website` department
// is also missing from departments.json). Idempotent. Dry-run by default; pass --apply to commit.
//
//   node scripts/onboard-shopify-craft-and-fix-wp-drift.mjs           # dry run
//   node scripts/onboard-shopify-craft-and-fix-wp-drift.mjs --apply   # commit
//
// Node 20 only (better-sqlite3). org.js is CommonJS → load via createRequire.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const org = require(path.join(HERE, '..', 'src', 'org.js'))

const APPLY = process.argv.includes('--apply')
const ORG_DIR = path.join(os.homedir(), '.claude', 'org')
const DEPTS = path.join(ORG_DIR, 'departments.json')
const SQUADS = path.join(ORG_DIR, 'squads.json')
const AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents')

const log = (...a) => console.log(...a)
const tag = APPLY ? '[APPLY]' : '[DRY ]'

// ── tiny frontmatter reader (just the scalar fields we need) ──────────────────
function frontmatter(id) {
  const file = path.join(AGENTS_DIR, `${id}.md`)
  if (!fs.existsSync(file)) return null
  const txt = fs.readFileSync(file, 'utf-8')
  const m = txt.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([a-zA-Z_]+):\s*(.+)$/)
    if (mm) fm[mm[1]] = mm[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return fm
}

// ── 1) departments.json: add the wordpress-website top-level department if missing ──
function ensureWordpressDept() {
  const j = JSON.parse(fs.readFileSync(DEPTS, 'utf-8'))
  const depts = j.departments || j
  if (depts['wordpress-website']) { log(`${tag} dept wordpress-website: already exists`); return false }
  const maxOrder = Math.max(...Object.values(depts).map(d => d.order ?? 0))
  depts['wordpress-website'] = {
    id: 'wordpress-website',
    label: 'WordPress Website',
    description: 'Client-owned WordPress sites (WP CLI + GitHub workflow). grove leads seed/weave/craft/wire/root/trunk/canopy/bark on theme-first WooCommerce/FSE builds.',
    head: 'grove',
    color: '#21759b',
    icon: 'Globe',
    order: maxOrder + 1,
    active: true,
    subDepartments: {
      'wordpress-website-team': {
        id: 'wordpress-website-team', label: 'WordPress Website Team',
        description: 'grove (lead) + seed, weave, craft, wire, root, trunk, canopy, bark (+ zeph dotted SEO, catalyst dotted CRO).',
        order: 0, pod: 'wordpress-website-team', lead: 'grove', memberCount: 9,
        cardLabel: 'WordPress Website Team', cardEmoji: '🌐', color: '#21759b', icon: 'Globe',
        displayMode: 'expanded', status: 'active',
      },
    },
  }
  log(`${tag} dept wordpress-website: CREATE (head=grove, order=${maxOrder + 1})`)
  if (APPLY) fs.writeFileSync(DEPTS, JSON.stringify(j, null, 2) + '\n')
  return true
}

// ── 2) squads.json: add drape/ink/beacon to shopify-website members ──
function ensureSquadMembers() {
  const j = JSON.parse(fs.readFileSync(SQUADS, 'utf-8'))
  const squads = j.squads || j
  const sw = squads['shopify-website']
  const add = ['drape', 'ink', 'beacon'].filter(a => !sw.members.includes(a))
  if (!add.length) { log(`${tag} squad shopify-website: drape/ink/beacon already members`); return false }
  sw.members.push(...add)
  log(`${tag} squad shopify-website: ADD ${add.join(', ')}`)
  if (APPLY) fs.writeFileSync(SQUADS, JSON.stringify(j, null, 2) + '\n')
  return true
}

// ── 3) upsert the 12 agents into SQLite via the canonical org.upsertAgent ──
const NEW_SHOPIFY = [
  { id: 'drape', tier: 'leadership', squad: 'shopify-website' },
  { id: 'ink', tier: 'creative', squad: 'shopify-website' },
  { id: 'beacon', tier: 'analyst', squad: 'shopify-website' },
]
const WP_AGENTS = ['grove', 'seed', 'weave', 'craft', 'wire', 'root', 'trunk', 'canopy', 'bark']

function upsertAll() {
  const reg = org.loadRegistry()
  const existing = new Set(Object.keys(reg.agents || reg || {}))
  const rows = []

  for (const a of NEW_SHOPIFY) {
    const fm = frontmatter(a.id) || {}
    rows.push({
      id: a.id,
      patch: {
        name: fm.name || a.id, description: fm.description || '',
        department: 'engineering', subDepartment: 'shopify-website-team', pod: 'shopify-website-team',
        reportsTo: fm.reportsTo || 'atrium', secondaryReportsTo: fm.secondaryReportsTo || null,
        title: fm.title || '', tier: a.tier, model: fm.model || 'sonnet',
        squad: a.squad, status: 'active', role: fm.role || '', class: fm.class || 'BUILDER',
        hiredAt: '2026-06-16T00:00:00.000Z', level: 1,
      },
      already: existing.has(a.id),
    })
  }
  for (const id of WP_AGENTS) {
    const fm = frontmatter(id)
    if (!fm) { log(`${tag}   ⚠ ${id}: no disk frontmatter — skip`); continue }
    rows.push({
      id,
      patch: {
        name: fm.name || id, description: fm.description || '',
        department: fm.department || 'wordpress-website', subDepartment: fm.subDepartment || 'wordpress-website-team',
        pod: fm.pod || 'wordpress-website-team', reportsTo: fm.reportsTo || 'grove',
        title: fm.title || '', tier: fm.tier || 'engineer', model: fm.model || 'sonnet',
        squad: fm.squad || 'wordpress-website', status: 'active', role: fm.role || '', class: fm.class || 'BUILDER',
      },
      already: existing.has(id),
    })
  }

  for (const r of rows) {
    log(`${tag} upsert ${r.id.padEnd(8)} → ${r.patch.department}/${r.patch.subDepartment} squad=${r.patch.squad} ${r.already ? '(update)' : '(NEW)'}`)
    if (APPLY) org.upsertAgent(r.id, r.patch, { action: r.already ? 'update' : 'hire', actor: 'yash', skipHistory: false })
  }
  return rows.length
}

log(`\n=== Onboard Shopify craft agents + fix WP drift ${tag} ===\n`)
ensureWordpressDept()
ensureSquadMembers()
const n = upsertAll()
log(`\n${tag} ${n} agent upserts ${APPLY ? 'COMMITTED' : 'planned'}.`)
if (!APPLY) log('Re-run with --apply to commit.\n')
else log('Done. App refreshes via SSE.\n')
