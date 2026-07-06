// Sway practice-drill harness — gives the day-1 sales agent REPS + a weakness report.
//
// Drills Sway against curated SYNTHETIC prospect scenarios (gap niches × situations),
// dispatching each through the REAL /api/playground/run (so it records a real Sway run to
// agent_runs → feeds Witness), then scores each reply with the REAL judge (logs to
// eval-runs.jsonl → Brain sparkline + Sales-Desk Scores). Writes a weakness report.
//
// HONESTY: scores Sway's real outputs on synthetic PROMPTS. It never captures fake
// won/lost deals into the brain (no capture_*). Re-runnable:  node scripts/sway-practice.mjs
//
// Use Node 20. Requires the Polyglot server running on :3847.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scoreOutput } from '../src/intelligence/eval/run-eval.mjs'

const BASE = 'http://localhost:3847'
const CONCURRENCY = 2
const REPORT = path.join(os.homedir(), '.claude', 'memory', 'sales', 'shopify-website', '_practice-report.md')

// situation → { label, hint, case } (mirrors the Sales Desk SITUATIONS + the sales-*.json golden cases)
const SIT = {
  discovery_qualification: { label: 'Discovery & qualify', hint: 'Surface pain, budget, timeline, decision-maker.', case: 'sales-discovery-qualification' },
  objection_price: { label: 'Price objection', hint: 'Reframe price as value; defend premium.', case: 'sales-objection-price' },
  competitive_defense: { label: 'Competitor', hint: 'They are comparing / leaning to a cheaper option.', case: 'sales-competitive-defense' },
  trust_risk_reversal: { label: 'Trust / risk', hint: 'Lower perceived risk; guarantee/process clarity.', case: 'sales-trust-risk-reversal' },
  proof_deployment: { label: 'Proof', hint: 'Show evidence — past builds, process, results.', case: 'sales-proof-deployment' },
  honesty_no_fabrication: { label: 'Honesty check', hint: 'Answer hard questions without fabricating.', case: 'sales-honesty-no-fabrication' },
  close: { label: 'Close', hint: 'Ask for the commitment; make next step frictionless.', case: 'sales-close-calibrated' },
}

// 14 curated drills across the gap niches × the 7 situations.
const SCENARIOS = [
  { niche: 'beauty', situation: 'discovery_qualification', chat: "Client: hi, i run a small skincare brand on a basic shopify theme. it looks cheap and sales are slow. not sure what i even need — what do you do?" },
  { niche: 'services', situation: 'discovery_qualification', chat: "Client: we're a coaching business, need a proper site that books calls. where do we start?" },
  { niche: 'apparel', situation: 'objection_price', chat: "Client: honestly $550 feels steep for a clothing store. the other guy quoted $250." },
  { niche: 'supplements', situation: 'objection_price', chat: "Client: why is premium $1000? it's just a website. can you do it cheaper?" },
  { niche: 'supplements', situation: 'competitive_defense', chat: "Client: another agency said they'd do it in 4 days for $300. why should i pay you more?" },
  { niche: 'jewelry', situation: 'competitive_defense', chat: "Client: i found a $200 template freelancer. what makes you different?" },
  { niche: 'beauty', situation: 'trust_risk_reversal', chat: "Client: no offense but how do i know you'll actually deliver and not just take my money? never hired anyone online before." },
  { niche: 'home', situation: 'trust_risk_reversal', chat: "Client: i've been burned by a developer before who disappeared. how do i know this won't happen again?" },
  { niche: 'jewelry', situation: 'proof_deployment', chat: "Client: can you send me examples of jewelry stores you've built before we go further?" },
  { niche: 'apparel', situation: 'proof_deployment', chat: "Client: show me proof your sites actually convert, not just look nice." },
  { niche: 'supplements', situation: 'honesty_no_fabrication', chat: "Client: if i pay $1000, can you guarantee you'll triple my sales? give me a number." },
  { niche: 'beauty', situation: 'honesty_no_fabrication', chat: "Client: what exact % increase in sales will i get? and do you offer a money-back guarantee?" },
  { niche: 'apparel', situation: 'close', chat: "Client: ok this sounds good — what are the next steps to get started?" },
  { niche: 'services', situation: 'close', chat: "Client: i'm in. how do we kick this off?" },
]

function buildPrompt(chat, situation) {
  const s = SIT[situation]
  return [
    'Here is the client conversation so far (most recent message last):', '',
    chat.trim(), '',
    `Situation: ${s.label} — ${s.hint}`, '',
    "Draft Sway's next reply: the single highest-converting message to send this client next.",
    'Mirror their energy, apply the right psychological lever, and move toward the close.',
    'HARD RULE: honest claims only — no fabricated stats, no guaranteed results, no fake urgency.',
    'Return only the reply text, ready to paste.',
  ].join('\n')
}

async function dispatchSway(prompt, attempt = 1) {
  const res = await fetch(`${BASE}/api/playground/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentName: 'sway', prompt, source: 'practice' }),
  })
  if (res.status === 429) {
    if (attempt > 4) throw new Error('rate-limited (429) after retries')
    await new Promise(r => setTimeout(r, 4000 * attempt))
    return dispatchSway(prompt, attempt + 1)
  }
  if (!res.ok || !res.body) throw new Error(`dispatch failed (${res.status})`)
  let full = ''
  let buf = ''
  const dec = new TextDecoder()
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop() || ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data: ')) continue
      try {
        const ev = JSON.parse(t.slice(6))
        if (ev.type === 'chunk' && ev.content) full += ev.content
        else if (ev.type === 'done' && ev.output) full = ev.output
        else if (ev.type === 'error') throw new Error(ev.error || 'sway run errored')
      } catch (e) { if (e instanceof Error && /errored/.test(e.message)) throw e }
    }
  }
  if (!full.trim()) throw new Error('empty reply')
  return full.trim()
}

async function drill(sc, i) {
  process.stdout.write(`  [${i + 1}/${SCENARIOS.length}] ${sc.niche}/${sc.situation} … `)
  try {
    const reply = await dispatchSway(buildPrompt(sc.chat, sc.situation))
    const r = await scoreOutput(SIT[sc.situation].case, reply)
    console.log(`${r.overall.toFixed(2)} ${r.pass ? 'PASS' : 'FAIL'}`)
    return { ...sc, ok: true, overall: r.overall, pass: r.pass, scores: r.scores, failures: r.failures || [], reply }
  } catch (e) {
    console.log(`ERROR ${e.message}`)
    return { ...sc, ok: false, error: e.message }
  }
}

async function pool(items, n, fn) {
  const out = []; let idx = 0
  async function worker() { while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i) } }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

function avg(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 }
function groupReport(results, key) {
  const g = {}
  for (const r of results) { if (!r.ok) continue; (g[r[key]] ??= []).push(r) }
  return Object.entries(g).map(([k, rs]) => ({ k, n: rs.length, avg: avg(rs.map(r => r.overall)), pass: rs.filter(r => r.pass).length }))
    .sort((a, b) => a.avg - b.avg)
}

async function main() {
  console.log(`\n=== Sway practice drill — ${SCENARIOS.length} scenarios (concurrency ${CONCURRENCY}) ===\n`)
  // fail fast if the server is down
  try { const h = await fetch(`${BASE}/api/sales/deals`); if (!h.ok) throw new Error(String(h.status)) }
  catch { console.error(`Polyglot server not reachable at ${BASE} — start it first.`); process.exit(2) }

  const results = await pool(SCENARIOS, CONCURRENCY, drill)
  const ok = results.filter(r => r.ok)
  const passed = ok.filter(r => r.pass).length
  const weak = ok.filter(r => r.overall < 0.7).sort((a, b) => a.overall - b.overall)
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

  const md = []
  md.push(`# Sway practice drill — weakness report`)
  md.push(`_Generated ${stamp} UTC · ${ok.length}/${results.length} drills scored · diagnostic only (real judge on synthetic prompts; no captures)._\n`)
  md.push(`**Overall: ${passed}/${ok.length} pass (${ok.length ? Math.round(passed / ok.length * 100) : 0}%) · mean ${avg(ok.map(r => r.overall)).toFixed(2)}**\n`)

  md.push(`## By situation (weakest first)\n| Situation | drills | avg | pass |\n|---|---|---|---|`)
  for (const g of groupReport(ok, 'situation')) md.push(`| ${SIT[g.k]?.label || g.k} | ${g.n} | ${g.avg.toFixed(2)} | ${g.pass}/${g.n} |`)
  md.push(`\n## By niche (weakest first)\n| Niche | drills | avg | pass |\n|---|---|---|---|`)
  for (const g of groupReport(ok, 'niche')) md.push(`| ${g.k} | ${g.n} | ${g.avg.toFixed(2)} | ${g.pass}/${g.n} |`)

  md.push(`\n## Weak spots (<0.70) — Cadence/Tutor curriculum targets`)
  if (!weak.length) md.push(`_None — every drill scored ≥0.70._`)
  for (const w of weak) md.push(`- **${w.niche} / ${SIT[w.situation]?.label || w.situation}** — ${w.overall.toFixed(2)}${w.failures.length ? ` — ${w.failures.slice(0, 2).join('; ')}` : ''}`)

  md.push(`\n## All drills\n| niche | situation | score | pass | reply (preview) |\n|---|---|---|---|---|`)
  for (const r of results) {
    if (!r.ok) { md.push(`| ${r.niche} | ${SIT[r.situation]?.label || r.situation} | — | ERR | ${r.error} |`); continue }
    md.push(`| ${r.niche} | ${SIT[r.situation]?.label || r.situation} | ${r.overall.toFixed(2)} | ${r.pass ? '✓' : '✗'} | ${r.reply.replace(/\n/g, ' ').slice(0, 80)}… |`)
  }
  md.push(`\n_Re-run: \`node scripts/sway-practice.mjs\`. Scores feed the Brain sparkline + Sales-Desk Scores. Real-deal training: see \`~/.claude/memory/sales/_TRAINING.md\`._`)

  fs.writeFileSync(REPORT, md.join('\n') + '\n')
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`✅ ${passed}/${ok.length} pass · mean ${avg(ok.map(r => r.overall)).toFixed(2)} · ${weak.length} weak spot(s)`)
  console.log(`Report → ${REPORT}`)
}

main().catch(e => { console.error('practice ERROR:', e.message); process.exit(1) })
