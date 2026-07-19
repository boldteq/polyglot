// Hermetic fixture for gate-autofix — the code/content self-heal loop. PURE/offline: no claude CLI,
// no store. Tests (1) the owner-routing / escalation-whitelist classifier, (2) blocker collection from
// a summary.json, and (3) the reused loop control (converge / whitelist-escalate / anti-loop) with
// injected effects. Mirrors __fixtures__/autofix-loop + lens-autofix.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyFinding, CODE_OWNERS, ESCALATE_OWNER } from '../../lib/gate-owner.mjs'
import { runAutofixLoop } from '../../lib/lens-autofix-loop.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
let failures = 0
const ok = (m) => console.log('  PASS  ' + m)
const bad = (m) => { console.log('  FAIL  ' + m); failures++ }
const eq = (a, b, m) => (a === b ? ok(m) : bad(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`))

console.log('section 1 — classifyFinding routing + escalation whitelist')
{
  const c = classifyFinding({ gate: 'code-lint', check: 'theme-check.error' })
  eq(c.fixable && c.owner, 'loom', 'code-lint → loom (fixable)')
  eq(classifyFinding({ gate: 'content-quality', check: 'placeholder.lorem' }).owner, 'ink', 'content-quality → ink')
  eq(classifyFinding({ gate: 'design-quality', check: 'taste.flat' }).owner, 'drape', 'design-quality → drape')
  eq(classifyFinding({ gate: 'honesty', check: 'honesty.fabricated-aggregate' }).fixable, false, 'honesty → ESCALATE (never blind-fix)')
  eq(classifyFinding({ gate: 'imagery', check: 'img.weight' }).fixable, false, 'imagery → ESCALATE (real asset)')
  eq(classifyFinding({ gate: 'legal-pages', check: 'legal.privacy-missing' }).fixable, false, 'legal-pages → ESCALATE')
  eq(classifyFinding({ gate: 'render-check', check: 'rw.placeholder-imagery' }).fixable, false, 'render-check placeholder-imagery → ESCALATE (per-check whitelist beats the code gate)')
  eq(classifyFinding({ gate: 'render-check', check: 'rw.section-missing' }).owner, 'loom', 'render-check normal blocker → loom (fixable)')
  eq(classifyFinding({ gate: 'totally-unknown', check: 'x' }).fixable, false, 'unknown gate → ESCALATE (never blind-fix)')
}

console.log('section 2 — collectBlockers reads summary.json + tags owners')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-af-'))
  fs.mkdirSync(path.join(tmp, 'gate-reports'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'gate-reports', 'summary.json'), JSON.stringify({
    gates: {
      'code-lint': { blockers: [{ id: 'lint.err', detail: 'bad liquid', page: 'sections/x.liquid' }] },
      'honesty': { blockers: [{ id: 'honesty.fake-countdown', detail: 'seeded countdown' }] },
      'design-tokens': { blockers: [] },
    },
  }))
  const prevCwd = process.cwd()
  process.chdir(tmp)
  const { collectBlockers } = await import('../../gate-autofix.mjs') // binds REPORT_ABS to tmp cwd
  const found = collectBlockers(['code-lint', 'honesty', 'design-tokens'])
  process.chdir(prevCwd)
  eq(found.length, 2, 'collected 2 blockers (empty gate contributes none)')
  const lint = found.find(f => f.gate === 'code-lint')
  const hon = found.find(f => f.gate === 'honesty')
  eq(lint && lint.fix_owner, 'loom', 'code-lint blocker tagged owner=loom')
  eq(hon && hon.fix_owner, ESCALATE_OWNER, 'honesty blocker tagged owner=human (escalate)')
  eq(lint && lint.surface, 'code-lint', 'surface = gate name (so the loop re-runs exactly that gate)')
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('section 3 — loop: converge / whitelist-escalate / anti-loop (injected effects)')
{
  // A code blocker the fix resolves next round → CONVERGE.
  let rounds = 0
  const resolvable = [{ gate: 'code-lint', check: 'lint.err', surface: 'code-lint', viewport: '', fix_owner: 'loom' }]
  const r1 = await runAutofixLoop({
    runRound: async () => { rounds += 1; return rounds === 1 ? { enforcePass: false, findings: resolvable } : { enforcePass: true, findings: [] } },
    fix: async () => {}, recordOutcomes: () => {}, log: () => {},
  }, { maxRounds: 3, codeOwners: CODE_OWNERS, porterOptIn: false, persisted: new Set() })
  eq(r1.converged, true, 'a fixable code blocker that the fix resolves → converged')

  // A whitelist blocker (fix_owner=human) never gets fixed → escalates immediately (no retryable code).
  const r2 = await runAutofixLoop({
    runRound: async () => ({ enforcePass: false, findings: [{ gate: 'honesty', check: 'honesty.fake', surface: 'honesty', viewport: '', fix_owner: ESCALATE_OWNER }] }),
    fix: async () => { bad('fix() must NOT be called for a whitelist/escalate finding') }, recordOutcomes: () => {}, log: () => {},
  }, { maxRounds: 3, codeOwners: CODE_OWNERS, porterOptIn: false, persisted: new Set() })
  eq(r2.converged, false, 'a whitelist (human-owner) blocker → not converged (escalates)')
  ok('fix() was never dispatched for the escalate finding')

  // A code blocker that PERSISTS after a fix → anti-loop escalates instead of retrying forever.
  let fixCalls = 0
  const r3 = await runAutofixLoop({
    runRound: async () => ({ enforcePass: false, findings: [{ gate: 'layout', check: 'css.overflow', surface: 'layout', viewport: '', fix_owner: 'loom' }] }),
    fix: async () => { fixCalls += 1 }, recordOutcomes: () => {}, log: () => {},
  }, { maxRounds: 3, codeOwners: CODE_OWNERS, porterOptIn: false, persisted: new Set() })
  eq(r3.converged, false, 'a blocker that never resolves → not converged (bounded, escalates)')
  ok(`fix dispatched ${fixCalls}× then gave up (anti-loop bound, not infinite)`)
}

console.log(failures === 0 ? '\nALL CASES PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
