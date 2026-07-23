// A client repo VENDORS a copy of the toolkit, so every fix shipped in Polyglot reaches a client only
// when that copy is refreshed — and nothing detected staleness (QA-6).
//
// Measured on the real client repo 2026-07-23: cravinbyandy's vendored copy was missing ELEVEN gate
// scripts — done-check, gate-integrity (#45), orchestration (#44), reference-match (#46),
// class-d-visual (#20), gate-autofix, preflight-repo itself, snap-colors-to-tokens, generate-reuse-map,
// reference-ingest, audit-unproven-guards — while BOTH sides reported toolkitVersion 1.0.0. Identical
// version, eleven missing gates: the evidence read exactly like a current run. CB-1 sat "blocked" for
// weeks because snap-colors-to-tokens, its own tool, was simply not in the repo.
//
// Two independent checks, because they fail in different ways:
//   missingGateScripts — offline, needs no source tree: every gate the vendored manifest ITSELF
//     declares must have its script on disk. Catches a partial/botched copy.
//   versionDrift       — against the source toolkit when reachable. Unreachable must report UNKNOWN,
//     never "up to date" — an unverifiable freshness claim is the thing that hid this for weeks.

import { missingGateScripts, versionDrift } from '../../preflight-repo.mjs'

let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }

const ROWS = [
  { number: 44, name: 'orchestration', script: 'check-orchestration.mjs' },
  { number: 45, name: 'gate-integrity', script: 'check-gate-integrity.mjs' },
  { number: 6, name: 'seo', script: 'gate-seo.mjs' },
]

console.log('missingGateScripts — a partial vendored copy must be loud, not silent')
{
  const all = new Set(ROWS.map((r) => r.script))
  const complete = missingGateScripts(ROWS, (s) => all.has(s))
  complete.length === 0 ? ok('a complete copy reports nothing missing') : bad(`false positive: ${complete.join(', ')}`)
}
{
  // the real cravinbyandy shape: the manifest declares gates whose scripts were never copied
  const partial = new Set(['gate-seo.mjs'])
  const miss = missingGateScripts(ROWS, (s) => partial.has(s))
  miss.length === 2 && miss.some((m) => m.includes('check-orchestration.mjs')) && miss.some((m) => m.includes('#45'))
    ? ok('missing gate scripts are listed with gate number + name') : bad(`got ${JSON.stringify(miss)}`)
}
{
  // an unreadable manifest yields no rows — that must not read as "complete"
  missingGateScripts([], () => false).length === 0 && missingGateScripts(null, () => false).length === 0
    ? ok('no rows → empty list (the caller treats rows.length === 0 as a failure, not a pass)')
    : bad('empty/null manifest mishandled')
}

console.log('\n── versionDrift — "unknown" must never be reported as "current" ──')
{
  const same = versionDrift('1.1.0', '1.1.0')
  same.known && !same.drifted ? ok('matching versions → known, not drifted') : bad(JSON.stringify(same))
}
{
  const diff = versionDrift('1.0.0', '1.1.0')
  diff.known && diff.drifted && /1\.0\.0/.test(diff.detail) && /1\.1\.0/.test(diff.detail)
    ? ok('a stale vendored copy → drifted, with both versions named') : bad(JSON.stringify(diff))
}
{
  // this is the load-bearing one: no source tree must NOT be a silent pass
  const unknown = versionDrift('1.0.0', null)
  !unknown.known && /UNKNOWN/i.test(unknown.detail)
    ? ok('unreachable source → UNKNOWN, explicitly') : bad(`unreachable source was not reported as unknown: ${JSON.stringify(unknown)}`)
  unknown.drifted === false && !unknown.known
    ? ok('unknown is not reported as drifted either (it is unverified, not proven stale)') : bad(JSON.stringify(unknown))
}
{
  // whitespace/newline differences are formatting, not drift (TOOLKIT_VERSION is a one-line file)
  const trimmed = versionDrift('1.1.0\n', ' 1.1.0 ')
  !trimmed.drifted ? ok('trailing whitespace is not drift') : bad('whitespace read as a version difference')
}

console.log(failures === 0 ? '\npreflight-drift: ALL CASES PASS' : `\npreflight-drift: ${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
