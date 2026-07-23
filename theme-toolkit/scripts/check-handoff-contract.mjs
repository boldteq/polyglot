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
import { isMain } from './lib/is-main.mjs'
import { validate } from './lib/jsonschema.mjs'

const REGISTRY = fileURLToPath(new URL('../lib/aim-handoff-registry.json', import.meta.url))

export function loadRegistry(file = REGISTRY) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

// the leading token of a produces/requires entry, dropping any " (description)" suffix
const head = (s) => String(s).split(/[\s(]/)[0]
// path-like = its head has a path separator or a known file extension
const isPathish = (s) => { const h = head(s); return h.includes('/') || /\.(json|md|csv|js|mjs|liquid)$/.test(h) }

// PURE: resolve one require against the registry + a fs-exists probe (injected for tests).
// Optional staleness (2026-07-19 audit H2 — a leftover artifact from a PRIOR build satisfies a bare
// existsSync and lets a downstream agent dispatch on outdated inputs): pass { mtimeFn, briefMtime }
// (briefMtime = CHANGES.md mtime, the current brief) → an artifact OLDER than the brief is flagged
// `stale:true`. WARN-not-BLOCK: an unchanged-but-valid artifact can legitimately predate a brief tweak,
// so `ok` is unaffected — the orchestrator sees the warning and decides to re-run the producer.
export function resolveRequire(registry, req, existsFn, opts = {}) {
  const { mtimeFn = null, briefMtime = null } = opts
  const staleOf = (paths) => {
    if (!mtimeFn || !briefMtime) return []
    return paths.filter(p => { const t = mtimeFn(p); return t != null && t < briefMtime })
  }
  if (isPathish(req)) {
    const h = head(req)
    const ok = !!existsFn(h)
    const stalePaths = ok ? staleOf([h]) : []
    return { id: req, kind: 'path', ok, stale: stalePaths.length > 0, stalePaths }
  }
  const c = (registry.contracts || []).find(x => x.event === req)
  if (!c) return { id: req, kind: 'unknown', ok: false, note: 'not a known path or contract event' }
  const paths = (c.produces || []).filter(isPathish).map(head)
  if (!paths.length) return { id: req, kind: 'contract', ok: true, note: 'upstream contract has no on-disk artifact — soft pass' }
  const missing = paths.filter(p => !existsFn(p))
  const stalePaths = staleOf(paths.filter(p => existsFn(p)))
  return { id: req, kind: 'contract', ok: missing.length === 0, missing, stale: stalePaths.length > 0, stalePaths }
}

// PURE: evaluate a whole contract's readiness to dispatch.
export function checkContract(registry, event, existsFn, opts = {}) {
  const c = (registry.contracts || []).find(x => x.event === event)
  if (!c) return { event, found: false, ready: false, requires: [] }
  const requires = (c.requires || []).map(r => resolveRequire(registry, r, existsFn, opts))
  return { event, found: true, ready: requires.every(r => r.ok), stale: requires.some(r => r.stale), from: c.from, to: c.to, requires }
}

// #45 — is this contract dispatch-enforced? Policy default is registry.enforcement === "all"; a
// contract may opt out with enforce:false (none do today). Enforced + not-ready = orchestrator must
// refuse the dispatch.
export function isEnforced(registry, event) {
  const c = (registry.contracts || []).find(x => x.event === event)
  if (!c) return false
  if (c.enforce === false) return false
  if (c.enforce === true) return true
  return registry.enforcement === 'all'
}

// #46 — PURE: is the squad at/over its WIP cap? inflight = current in-flight dispatch count (orchestrator-
// tracked), cap from registry.wipCap (default 3). At/over cap → refuse the new dispatch (queue it).
export function wipExceeded(inflight, cap) {
  const n = Number(inflight)
  const c = Number.isFinite(Number(cap)) ? Number(cap) : 3
  return Number.isFinite(n) && n >= c
}

// #41 — PURE: validate a contract's sign-off artifact (confidence + impact) against registry.signoffSchema.
// Contracts with no `signoff` block return required:false, ok:true (nothing to check). readFn(path) →
// file contents string or null. A required-but-missing/invalid sign-off is ok:false so the caller
// (dispatch gate) can refuse. Reuses the shared jsonschema validator.
export function checkSignoff(registry, event, readFn) {
  const c = (registry.contracts || []).find(x => x.event === event)
  if (!c || !c.signoff || !c.signoff.artifact) return { required: false, ok: true, present: false, errors: [] }
  const artifact = c.signoff.artifact
  const raw = readFn(artifact)
  if (raw == null) return { required: true, artifact, present: false, ok: false, errors: [{ path: artifact, message: 'sign-off artifact missing' }] }
  let doc
  try { doc = JSON.parse(raw) } catch (e) { return { required: true, artifact, present: true, ok: false, errors: [{ path: artifact, message: `invalid JSON: ${e.message}` }] } }
  const errors = validate(doc, registry.signoffSchema || {})
  return { required: true, artifact, present: true, ok: errors.length === 0, errors }
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
  const readFn = (p) => { try { return fs.readFileSync(path.resolve(dir, p), 'utf-8') } catch { return null } }
  const mtimeFn = (p) => { try { return fs.statSync(path.resolve(dir, p)).mtimeMs } catch { return null } }
  const briefMtime = mtimeFn('CHANGES.md') // the current brief — artifacts older than it may be from a prior build
  const r = checkContract(registry, event, existsFn, { mtimeFn, briefMtime })
  if (!r.found) { console.error(`check:handoff — unknown contract "${event}" (try --list)`); process.exit(2) }
  const so = checkSignoff(registry, event, readFn)
  const enforced = isEnforced(registry, event)
  console.log(`check:handoff — ${event} (${r.from} → ${Array.isArray(r.to) ? r.to.join(',') : r.to})${enforced ? ' [enforced]' : ''}`)
  for (const req of r.requires) console.log(`  ${req.ok ? '✓' : '✗'} ${req.id}${req.missing?.length ? ` — missing: ${req.missing.join(', ')}` : ''}${req.note ? ` (${req.note})` : ''}`)
  for (const req of r.requires) if (req.stale) console.log(`  ⚠ STALE: ${req.stalePaths.join(', ')} predate CHANGES.md (the current brief) — may be from a prior build; re-run the producing agent before dispatching (warn, not a block)`)
  if (so.required) console.log(`  ${so.ok ? '✓' : '✗'} sign-off ${so.artifact}${so.ok ? ' (confidence+impact ok)' : ` — ${so.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`}`)
  // #46/#47 — coordination guards on the SAME pre-dispatch check (orchestrator passes the live counts via env)
  const wipBlocked = process.env.WIP_INFLIGHT != null && wipExceeded(process.env.WIP_INFLIGHT, registry.wipCap)
  const busyBlocked = process.env.SPECIALIST_BUSY === '1'
  if (wipBlocked) console.log(`  ✗ WIP ${process.env.WIP_INFLIGHT} ≥ cap ${registry.wipCap ?? 3} (#46) — queue, don't dispatch`)
  if (busyBlocked) console.log(`  ✗ specialist unavailable (#47, SPECIALIST_BUSY=1) — queue, don't dispatch`)
  const ready = r.ready && so.ok && !wipBlocked && !busyBlocked
  console.log(ready ? `✓ READY to dispatch ${event}` : `✗ NOT READY — ${event} (missing inputs / sign-off / WIP / availability → no dispatch)`)
  process.exit(ready ? 0 : 1)
}

if (isMain(import.meta.url)) {
  main()
}
