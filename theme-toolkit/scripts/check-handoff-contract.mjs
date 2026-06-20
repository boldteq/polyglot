#!/usr/bin/env node
// check:handoff — the executable "missing contract = no dispatch" helper. Given a handoff contract
// name, it reads lib/aim-handoff-registry.json and asserts every `requires[]` for that contract is
// satisfied on disk before the receiving agent is dispatched. A `require` is either a path (checked
// with fs.existsSync) or an upstream contract event (resolved to that contract's on-disk produces[]).
//
// This is a DISPATCH gate, not a publish gate — it is deliberately NOT in theme-gates.mjs GATES[]
// (adding it would change the publish-readiness math + break the hermetic maestro fixtures). The
// orchestrator (the /shopify-store Maestro session, or atrium) calls it before handing work down.
//
//   node check-handoff-contract.mjs <event>     # assert one contract's inputs exist (exit 0/1)
//   node check-handoff-contract.mjs --list      # print every contract event
// Read-only. resolveRequire is pure + injectable so __fixtures__/handoff-contract proves it. Node 20 ESM.
// Exit: 0 = all requires satisfied · 1 = ≥1 missing · 2 = usage / unknown event.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REGISTRY = fileURLToPath(new URL('../lib/aim-handoff-registry.json', import.meta.url))

export function loadRegistry(file = REGISTRY) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

// the leading token of a produces/requires entry, dropping any " (description)" suffix
const head = (s) => String(s).split(/[\s(]/)[0]
// path-like = its head has a path separator or a known file extension
const isPathish = (s) => { const h = head(s); return h.includes('/') || /\.(json|md|csv|js|mjs|liquid)$/.test(h) }

// PURE: resolve one require against the registry + a fs-exists probe (injected for tests).
export function resolveRequire(registry, req, existsFn) {
  if (isPathish(req)) return { id: req, kind: 'path', ok: !!existsFn(head(req)) }
  const c = (registry.contracts || []).find(x => x.event === req)
  if (!c) return { id: req, kind: 'unknown', ok: false, note: 'not a known path or contract event' }
  const paths = (c.produces || []).filter(isPathish).map(head)
  if (!paths.length) return { id: req, kind: 'contract', ok: true, note: 'upstream contract has no on-disk artifact — soft pass' }
  const missing = paths.filter(p => !existsFn(p))
  return { id: req, kind: 'contract', ok: missing.length === 0, missing }
}

// PURE: evaluate a whole contract's readiness to dispatch.
export function checkContract(registry, event, existsFn) {
  const c = (registry.contracts || []).find(x => x.event === event)
  if (!c) return { event, found: false, ready: false, requires: [] }
  const requires = (c.requires || []).map(r => resolveRequire(registry, r, existsFn))
  return { event, found: true, ready: requires.every(r => r.ok), from: c.from, to: c.to, requires }
}

// ── CLI ───────────────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2)
  const registry = loadRegistry()
  if (argv[0] === '--list') {
    console.log('AIM handoff contracts:')
    for (const c of registry.contracts) console.log(`  ${c.event.padEnd(30)} ${c.from} → ${Array.isArray(c.to) ? c.to.join(',') : c.to}`)
    process.exit(0)
  }
  const event = argv[0]
  if (!event) { console.error('usage: check-handoff-contract.mjs <event> | --list'); process.exit(2) }
  const dir = process.cwd()
  const existsFn = (p) => fs.existsSync(path.resolve(dir, p))
  const r = checkContract(registry, event, existsFn)
  if (!r.found) { console.error(`check:handoff — unknown contract "${event}" (try --list)`); process.exit(2) }
  console.log(`check:handoff — ${event} (${r.from} → ${Array.isArray(r.to) ? r.to.join(',') : r.to})`)
  for (const req of r.requires) console.log(`  ${req.ok ? '✓' : '✗'} ${req.id}${req.missing?.length ? ` — missing: ${req.missing.join(', ')}` : ''}${req.note ? ` (${req.note})` : ''}`)
  console.log(r.ready ? `✓ READY to dispatch ${event}` : `✗ NOT READY — ${event} is missing inputs (no dispatch)`)
  process.exit(r.ready ? 0 : 1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
