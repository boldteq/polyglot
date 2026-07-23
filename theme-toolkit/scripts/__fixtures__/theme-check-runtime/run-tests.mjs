// "CLI missing" and "CLI installed but this runtime can't launch it" are different problems with
// different fixes — collapsing them made gate #2 permanently inert (2026-07-23).
//
// What was actually happening: @shopify/cli was installed and on PATH, but crashed on launch under the
// Node this toolkit mandates — it imports `enableCompileCache` from `node:module`, which Node 20.20.1
// does not export (verified: undefined; Node 22.22.3 runs it fine). The old guard reported
// "shopify CLI not found on PATH — install @shopify/cli@3", so the remedy it printed could never work:
// reinstalling does not change the Node that launches it. Meanwhile theme-check — the Liquid linter —
// silently never ran on any build. It did report pass:false (honest, per gate #45), but it was
// unfixable by anyone following its own advice.
//
// These pin the taxonomy. The recovery path (find a Node that CAN launch it) is proven live: after the
// fix the gate ran on cravinbyandy via Node 22 and returned 0 errors / 8 warnings across 25 files.

// import from lib/, NOT the gate — importing the gate would RUN theme-check
import { classifyProbe } from '../../lib/cli-probe.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`))

console.log('case (a) genuinely absent → "missing" (install really is the fix)')
{
  eq(classifyProbe({ error: Object.assign(new Error('spawn shopify ENOENT'), { code: 'ENOENT' }) }).kind, 'missing', 'ENOENT code')
  eq(classifyProbe({ error: new Error('spawn shopify ENOENT') }).kind, 'missing', 'ENOENT in the message')
}

console.log('case (b) THE REGRESSION — installed but the runtime cannot load it')
{
  // the real stderr seen under Node 20.20.1
  const stderr = "file:///Users/y/.nvm/versions/node/v20.20.1/lib/node_modules/@shopify/cli/bin/run.js:4\n"
    + "import {enableCompileCache} from 'node:module'\n        ^^^^^^^^^^^^^^^^^^\n"
    + "SyntaxError: The requested module 'node:module' does not provide an export named 'enableCompileCache'"
  const c = classifyProbe({ status: 1, stderr })
  eq(c.kind, 'incompatible-runtime', 'classified as a runtime incompatibility, NOT as missing')
  c.detail && /enableCompileCache/.test(c.detail) ? ok('keeps the real error for the operator') : bad(`detail lost: ${c.detail}`)
}

console.log('case (c) other launcher failures are "broken", still not "missing"')
{
  // 'Cannot find module' is a broken INSTALL, not a runtime-version mismatch — 'broken' is correct.
  // What matters is only that it never reads as 'missing', since that prints the wrong remedy.
  eq(classifyProbe({ status: 1, stderr: 'Error: Cannot find module oclif' }).kind, 'broken', 'a broken install is broken')
  eq(classifyProbe({ status: 1, stderr: 'some unexpected failure' }).kind, 'broken', 'anything else → broken')
  eq(classifyProbe({ error: new Error('EACCES: permission denied') }).kind, 'broken', 'a non-ENOENT spawn error is broken, not missing')
}

console.log('case (d) a working CLI is ok')
{
  eq(classifyProbe({ status: 0, stdout: '4.1.0' }).kind, 'ok', 'exit 0 → ok')
}

console.log('case (e) "missing" is never reported for an installed-but-failing CLI')
{
  // the precise confusion that wasted the remedy: status!==0 must never map to 'missing'
  for (const stderr of ['SyntaxError: boom', 'ERR_MODULE_NOT_FOUND', 'random noise', '']) {
    const k = classifyProbe({ status: 1, stderr }).kind
    k === 'missing' ? bad(`status=1 with stderr ${JSON.stringify(stderr)} reported as missing`) : ok(`status=1 (${stderr.slice(0, 22) || 'empty'}) → ${k}`)
  }
}

console.log(failures === 0 ? '\ntheme-check-runtime: ALL CASES PASS' : `\ntheme-check-runtime: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
