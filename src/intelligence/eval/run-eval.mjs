// Boldteq Intelligence — eval harness (Anthropic LLM-as-judge method).
// Two jobs:
//   1) SELF-TEST (calibration): every golden case carries a known good + bad fixture.
//      The judge must score good>bad, good=pass, bad=fail. This proves the judge (and
//      its rubric) actually discriminates quality — the regression guard ON the judge.
//   2) SCORE (production): score a REAL agent output against a golden case's rubric →
//      0-1 + pass/fail, persisted to data/intel/eval-runs.jsonl (the Witness loop tails it).
//
// CLI:
//   node run-eval.mjs --selftest                 # calibrate the judge across all golden cases
//   node run-eval.mjs --selftest --case <id>     # one case
//   node run-eval.mjs --score <id> --output file # score a real output (use - for stdin)
//   node run-eval.mjs --list                     # list golden cases

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { judge } from './judge.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = path.join(HERE, 'golden')
const RUNS_DIR = process.env.INTEL_DATA_DIR
  ? path.join(process.env.INTEL_DATA_DIR, 'eval-runs')
  : path.resolve(HERE, '..', '..', '..', 'data', 'intel', 'eval-runs')
const RUNS_LOG = path.join(RUNS_DIR, '..', 'eval-runs.jsonl')

export function loadCases() {
  let files = []
  try { files = fs.readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.json')) } catch { return [] }
  return files.map(f => {
    const c = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, f), 'utf-8'))
    c._file = f
    return c
  })
}

// simple bounded promise pool — claude calls are slow, don't hammer
async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx) }
  })
  await Promise.all(workers)
  return out
}

function persist(record) {
  fs.mkdirSync(RUNS_DIR, { recursive: true })
  fs.appendFileSync(RUNS_LOG, JSON.stringify(record) + '\n')
}

// ── SELF-TEST: prove the judge discriminates good from bad on every case ───────
export async function selfTest(cases, { concurrency = 3, stamp } = {}) {
  const testable = cases.filter(c => c.fixtures?.good && c.fixtures?.bad)
  const results = await pool(testable, concurrency, async (c) => {
    const rubric = c.rubric
    const [g, b] = await Promise.all([
      judge({ task: c.task, output: c.fixtures.good, reference: c.reference, rubric }),
      judge({ task: c.task, output: c.fixtures.bad, reference: c.reference, rubric }),
    ])
    const separation = +(g.overall - b.overall).toFixed(3)
    // calibrated = ranks good above bad AND the pass-gate lands on the right side
    const calibrated = g.overall > b.overall && g.pass === true && b.pass === false
    return { id: c.id, agent: c.agent, task_type: c.task_type, good: g.overall, bad: b.overall, separation, goodPass: g.pass, badPass: b.pass, calibrated, badFailures: b.failures?.length || 0 }
  })
  const calibrated = results.filter(r => r.calibrated).length
  const meanSep = results.length ? +(results.reduce((s, r) => s + r.separation, 0) / results.length).toFixed(3) : 0
  const report = { kind: 'selftest', at: stamp || new Date().toISOString(), total: results.length, calibrated, accuracy: results.length ? +(calibrated / results.length).toFixed(3) : 0, meanSeparation: meanSep, results }
  persist(report)
  return report
}

// ── SCORE: judge a real agent output against a golden case ─────────────────────
export async function scoreOutput(caseId, output, { stamp } = {}) {
  const c = loadCases().find(x => x.id === caseId)
  if (!c) throw new Error(`no golden case: ${caseId} (run --list)`)
  const v = await judge({ task: c.task, output, reference: c.reference, rubric: c.rubric })
  const record = { kind: 'score', at: stamp || new Date().toISOString(), case: caseId, agent: c.agent, task_type: c.task_type, overall: v.overall, pass: v.pass, scores: v.scores, reasoning: v.reasoning, failures: v.failures }
  persist(record)
  return record
}

// ── CLI ────────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const has = (f) => args.includes(f)
  const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
  const cases = loadCases()

  if (has('--list') || args.length === 0) {
    console.log(`\n${cases.length} golden cases in ${GOLDEN_DIR}:`)
    for (const c of cases) console.log(`  ${c.id.padEnd(32)} ${(c.agent || '?').padEnd(12)} ${c.task_type}${c.fixtures ? '  [self-testable]' : ''}`)
    console.log(`\n  --selftest [--case id]      calibrate the judge`)
    console.log(`  --score <id> --output file  score a real output (- = stdin)`)
    process.exit(0)
  }

  if (has('--selftest')) {
    const only = val('--case')
    const set = only ? cases.filter(c => c.id === only) : cases
    if (!set.length) { console.error(`no case ${only}`); process.exit(2) }
    console.log(`Self-testing ${set.filter(c => c.fixtures).length} case(s) — judging good+bad via Claude…`)
    selfTest(set).then(r => {
      console.log(`\n${'─'.repeat(72)}`)
      for (const x of r.results) {
        const mark = x.calibrated ? 'OK  ' : 'FAIL'
        console.log(`${mark} ${x.id.padEnd(30)} good ${x.good}  bad ${x.bad}  sep ${x.separation}  (pass ${x.goodPass}/${x.badPass})`)
      }
      console.log('─'.repeat(72))
      console.log(`Judge accuracy: ${r.calibrated}/${r.total} calibrated (${(r.accuracy * 100).toFixed(0)}%)  |  mean separation ${r.meanSeparation}`)
      console.log(`Logged → ${RUNS_LOG}`)
      process.exit(r.calibrated === r.total ? 0 : 1)
    }).catch(e => { console.error('eval ERROR:', e.message); process.exit(1) })
  } else if (has('--score')) {
    const id = val('--score')
    const outArg = val('--output') || '-'
    const output = outArg === '-' ? fs.readFileSync(0, 'utf-8') : fs.readFileSync(outArg, 'utf-8')
    scoreOutput(id, output).then(r => {
      console.log(`\n${r.case} (${r.agent}) — overall ${r.overall}  ${r.pass ? 'PASS' : 'FAIL'}`)
      console.log('scores:', JSON.stringify(r.scores))
      console.log('reasoning:', r.reasoning)
      if (r.failures?.length) console.log('failures:', JSON.stringify(r.failures, null, 2))
      console.log(`Logged → ${RUNS_LOG}`)
      process.exit(r.pass ? 0 : 1)
    }).catch(e => { console.error('score ERROR:', e.message); process.exit(1) })
  } else {
    console.error('unknown args; try --list')
    process.exit(2)
  }
}
