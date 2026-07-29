#!/usr/bin/env node
// `swt` — ONE entrypoint for the whole Shopify build loop (SWT simplification Part B: 4+ drivers → 1 verb).
//
// The toolkit has ~17 driver scripts (theme-gates, brief-intake, lens-*, *-autofix, done-check, maestro-*).
// Remembering which to run when is exactly the "too complex" Yash flagged. This is a THIN aliaser: `swt <verb>`
// spawns the right script and passes every remaining arg straight through — zero new behavior, one thing to
// remember. It changes nothing about how the underlying scripts work; it just gives them a single front door.
//
// Usage (from the theme repo root; vendored path is `node toolkit/scripts/swt.mjs`):
//   swt                      list the verbs (the one place to look)
//   swt ready                is the repo provisioned?                 → preflight-repo.mjs
//   swt intake               gather/verify the upfront brief          → brief-intake.mjs
//   swt gates                the simplified 14-group gate view        → theme-gates.mjs --list-groups
//   swt test                 run the gate stack                       → theme-gates.mjs
//   swt quick                fast visual self-test (small change)     → lens-quick.mjs
//   swt capture | judge      full visual self-test                    → lens-capture.mjs / lens-judge.mjs
//   swt fix                  self-heal code/content blockers          → gate-autofix.mjs
//   swt heal                 self-heal visual blockers                → lens-autofix.mjs
//   swt done                 the DONE gate (must exit 0 to be done)   → done-check.mjs
//   swt status               build state                              → maestro-status.mjs
//   swt build                the autonomous build driver              → maestro-build.mjs
//   swt ref                  register a client reference              → reference-ingest.mjs
// Exit: passes through the invoked script's exit code · 2 = unknown verb.

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))

// verb → { script, prefix:[], help }. A prefix is fixed args prepended before the user's (e.g. gates→--list-groups).
const VERBS = {
  ready:   { script: 'preflight-repo.mjs', help: 'is the repo provisioned?' },
  intake:  { script: 'brief-intake.mjs', help: 'gather / verify the upfront brief (docs/brief.md)' },
  gates:   { script: 'theme-gates.mjs', prefix: ['--list-groups'], help: 'the simplified 14-group gate view' },
  test:    { script: 'theme-gates.mjs', help: 'run the gate stack' },
  quick:   { script: 'lens-quick.mjs', help: 'fast visual self-test (small change)' },
  capture: { script: 'lens-capture.mjs', help: 'capture render frames (full visual test, step 1)' },
  judge:   { script: 'lens-judge.mjs', help: 'judge the captured frames (full visual test, step 2)' },
  fix:     { script: 'gate-autofix.mjs', help: 'self-heal code/content blockers' },
  heal:    { script: 'lens-autofix.mjs', help: 'self-heal visual blockers' },
  done:    { script: 'done-check.mjs', help: 'the DONE gate — must exit 0 to be done' },
  status:  { script: 'maestro-status.mjs', help: 'build state' },
  build:   { script: 'maestro-build.mjs', help: 'the autonomous build driver' },
  ref:     { script: 'reference-ingest.mjs', help: 'register a client reference (screenshot/figma/video)' },
}

// PURE (exported for the fixture): verb → { script, prefix } | null. Case-insensitive; unknown → null.
export function resolveVerb(verb) {
  const v = VERBS[String(verb || '').trim().toLowerCase()]
  return v ? { script: v.script, prefix: v.prefix || [] } : null
}

function printVerbs(stream = console.log) {
  stream('swt — one entrypoint for the Shopify build loop. Verbs:')
  const w = Math.max(...Object.keys(VERBS).map(k => k.length))
  for (const [k, v] of Object.entries(VERBS)) stream(`  swt ${k.padEnd(w)}  ${v.help}`)
  stream('\nEvery arg after the verb is passed straight through (e.g. `swt test --gate honesty`, `swt intake --check`).')
}

function main() {
  const [verb, ...rest] = process.argv.slice(2)
  if (!verb || verb === 'help' || verb === '--help' || verb === '-h') { printVerbs(); process.exit(0) }
  const r = resolveVerb(verb)
  if (!r) { console.error(`swt: unknown verb "${verb}".\n`); printVerbs(console.error); process.exit(2) }
  const res = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, r.script), ...r.prefix, ...rest], { stdio: 'inherit' })
  process.exit(res.status == null ? 1 : res.status)
}

if (isMain(import.meta.url)) main()
