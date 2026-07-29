#!/usr/bin/env node
// Self-test for swt.mjs (the one-verb front door). Proves resolveVerb maps verbs → scripts (with prefixes),
// is case-insensitive, rejects unknowns, and that `swt` with no args lists the verbs (exit 0).
// Run (Node 20): node scripts/__fixtures__/swt-verb/run-tests.mjs · Exit 0 = all pass.

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveVerb } from '../../swt.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SWT = path.resolve(HERE, '..', '..', 'swt.mjs')
let f = 0
const pass = (m) => console.log(`  PASS  ${m}`)
const fail = (m) => { console.log(`  FAIL  ${m}`); f += 1 }
const eq = (g, w, m) => (JSON.stringify(g) === JSON.stringify(w) ? pass(m) : fail(`${m} — got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`))

console.log('resolveVerb — verb → { script, prefix }')
{
  eq(resolveVerb('intake'), { script: 'brief-intake.mjs', prefix: [] }, 'intake → brief-intake.mjs')
  eq(resolveVerb('done'), { script: 'done-check.mjs', prefix: [] }, 'done → done-check.mjs')
  eq(resolveVerb('gates'), { script: 'theme-gates.mjs', prefix: ['--list-groups'] }, 'gates → theme-gates.mjs --list-groups (the simplified view)')
  eq(resolveVerb('test'), { script: 'theme-gates.mjs', prefix: [] }, 'test → theme-gates.mjs (full run, no prefix)')
  eq(resolveVerb('INTAKE'), { script: 'brief-intake.mjs', prefix: [] }, 'case-insensitive')
  eq(resolveVerb('nope'), null, 'unknown verb → null')
  eq(resolveVerb(''), null, 'empty → null')
  eq(resolveVerb(undefined), null, 'undefined → null (no crash)')
}

console.log('every verb points at a real script filename')
{
  const verbs = ['ready', 'intake', 'gates', 'test', 'quick', 'capture', 'judge', 'fix', 'heal', 'done', 'status', 'build', 'ref']
  const bad = verbs.filter((v) => { const r = resolveVerb(v); return !r || !/^[a-z0-9-]+\.mjs$/.test(r.script) })
  bad.length === 0 ? pass(`all ${verbs.length} documented verbs resolve to a .mjs script`) : fail(`unresolved/odd verbs: ${bad.join(', ')}`)
}

console.log('CLI — `swt` with no args lists the verbs (exit 0), unknown verb → exit 2')
{
  const list = spawnSync('node', [SWT], { encoding: 'utf-8' })
  list.status === 0 && /swt intake/.test(list.stdout) ? pass('bare `swt` prints the verb list, exit 0') : fail(`bare swt: status=${list.status}, stdout head=${(list.stdout || '').slice(0, 40)}`)
  const bad = spawnSync('node', [SWT, 'frobnicate'], { encoding: 'utf-8' })
  bad.status === 2 ? pass('unknown verb → exit 2') : fail(`unknown verb status=${bad.status}`)
}

console.log(f === 0 ? '\nswt-verb: ALL CASES PASS' : `\nswt-verb: ${f} FAILED`)
process.exit(f ? 1 : 0)
