// Score a Sway reply against the sales golden set (reuses the real judge).
//
//   node scripts/sway-score.mjs --list
//   node scripts/sway-score.mjs --case sales-objection-price --reply reply.txt
//   node scripts/sway-score.mjs --auto sales_objection --reply -      # match case by task_type, read stdin
//   echo "<reply>" | node scripts/sway-score.mjs --auto sales_honesty --reply -
//
// Thin convenience over src/intelligence/eval/run-eval.mjs: --auto picks the sway
// golden case by task_type so you don't memorize case ids. Judge runs via Claude CLI
// (subscription). A fabrication / money-back / guaranteed-result reply → safety<0.5 → FAIL.
// Use Node 20.

import fs from 'node:fs'
import { loadCases, scoreOutput } from '../src/intelligence/eval/run-eval.mjs'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }

const SWAY = loadCases().filter(c => c.agent === 'sway')

if (has('--list') || args.length === 0) {
  console.log(`\n${SWAY.length} Sway golden cases:`)
  for (const c of SWAY) console.log(`  ${c.id.padEnd(32)} task_type=${c.task_type}  niche=${c.niche || '-'}`)
  console.log(`\n  --case <id> --reply <file|->     score against a specific case`)
  console.log(`  --auto <task_type> --reply <file|->  match the sway case by task_type, then score`)
  process.exit(0)
}

// resolve the case
let caseId = val('--case')
if (!caseId && has('--auto')) {
  const tt = val('--auto')
  const c = SWAY.find(x => x.task_type === tt)
  if (!c) { console.error(`no sway golden case with task_type "${tt}". Try --list.`); process.exit(2) }
  caseId = c.id
}
if (!caseId) { console.error('need --case <id> or --auto <task_type>. Try --list.'); process.exit(2) }

// read the reply
const replyArg = val('--reply') || '-'
let reply
try { reply = replyArg === '-' ? fs.readFileSync(0, 'utf-8') : fs.readFileSync(replyArg, 'utf-8') }
catch (e) { console.error(`can't read reply (${replyArg}): ${e.message}`); process.exit(2) }
if (!reply.trim()) { console.error('empty reply'); process.exit(2) }

console.log(`Scoring against "${caseId}" via the judge…`)
scoreOutput(caseId, reply).then(r => {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`case: ${r.case}  (${r.task_type})`)
  for (const [dim, s] of Object.entries(r.scores || {})) console.log(`  ${dim.padEnd(13)} ${s}`)
  console.log(`  ${'OVERALL'.padEnd(13)} ${r.overall}`)
  console.log(`${'─'.repeat(60)}`)
  console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'}${(r.failures && r.failures.length) ? '  — ' + r.failures.join('; ') : ''}`)
  if (r.reasoning) console.log(`\nwhy: ${r.reasoning}`)
  process.exit(r.pass ? 0 : 1)
}).catch(e => { console.error('score ERROR:', e.message); process.exit(1) })
