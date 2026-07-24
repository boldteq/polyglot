#!/usr/bin/env node
// Quality loop — the closed feedback loop that makes training MEASURABLE + AUTO-TRAINING.
// Reads ONE build's gate-reports, then:
//   (1) MEASURABLE: appends a quality snapshot (defects + pass-rate per agent/gate) to
//       scripts/swt-train/quality-trend.jsonl — the day-by-day scoreboard.
//   (2) AUTO-TRAIN: turns exact-text real defects into rule-pack CANDIDATES
//       (theme-toolkit/toolkit-rules/proposed.json, deduped + occurrence-counted), and PROMOTES
//       candidates seen across >= PROMOTE_MIN distinct builds into the ENFORCED team-default pack —
//       so a recurring real mistake can never silently recur on the next build.
//
// This HARDENS THE GATE; src/lib/gateFindings.js already trains the AGENT .md from the same defects.
// Same signal → belt (agent rule) + suspenders (gate enforcement).
//
// Usage: node scripts/quality-loop.mjs <buildDir> [buildId]
//   Env: PROMOTE_MIN (default 2) — distinct-build recurrence bar for auto-promotion.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url)) // fileURLToPath: repo path has a space
const REPO = path.join(HERE, '..')
const TREND = process.env.QUALITY_TREND || path.join(HERE, 'swt-train', 'quality-trend.jsonl')
const PROPOSED = path.join(REPO, 'theme-toolkit', 'toolkit-rules', 'proposed.json')
const TEAM = path.join(REPO, 'theme-toolkit', 'toolkit-rules', 'team-default.json')
const PROMOTE_MIN = Number(process.env.PROMOTE_MIN || 2)
// The Witness/Tutor scoreboard — the SAME log the sales path writes to (src/routes/sales.js →
// run-eval scoreOutput). Emitting a per-builder build score here (gap 1) is what finally makes the
// self-improvement loop turn for loom/drape/ink, not just sway. db.ingestEvalRuns() bridges these
// kind:'score' records into agent_runs → Witness classifies, Tutor measures impact.
const RUNS_LOG = process.env.EVAL_RUNS_LOG || path.join(REPO, 'data', 'intel', 'eval-runs.jsonl')

// gate id → owning agent (mirror of src/lib/gateFindings.js GATE_OWNER — keep in sync).
const GATE_OWNER = {
  'code-lint': 'loom', 'editability': 'loom', 'render-check': 'loom', 'conversion': 'loom',
  'static-a11y': 'loom', 'section-consistency': 'loom', 'consistency': 'loom', 'design-tokens': 'loom',
  'performance': 'loom', 'visual-check': 'loom', 'dead-code': 'loom', 'functionality': 'loom',
  'layout': 'loom', 'rule-pack': 'loom', 'translations': 'loom', 'price-binding': 'loom',
  'mobile': 'loom', 'accessibility': 'loom', 'imagery': 'drape', 'design-quality': 'drape',
  'content-quality': 'ink', 'honesty': 'ink', 'legal-pages': 'ink',
  'seo': 'beacon', 'social-assets': 'beacon', 'link-health': 'beacon', 'redirects': 'beacon',
  'consent': 'conduit', 'analytics-wiring': 'conduit', 'app-conflicts': 'conduit', 'email-triggers': 'conduit',
}
// exact-text defect classes whose forbidden literal lives in the finding (safe to forbid-text).
const TEXT_CLASSES = ['dev-leftover', 'placeholder', 'theme-default', 'forbidden-text', 'fabricat', 'hardcoded', 'fake']

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n')
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const slug = (s) => String(s).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'rule'

function readGateReports(buildDir) {
  const grDir = path.join(buildDir, 'gate-reports')
  let files = []
  try { files = fs.readdirSync(grDir).filter((f) => f.endsWith('.json') && f !== 'summary.json' && f !== 'lens.json') } catch { return [] }
  const out = []
  for (const f of files) {
    const r = readJson(path.join(grDir, f), null)
    if (!r || typeof r !== 'object') continue
    out.push({ gate: r.gate || f.replace(/\.json$/, ''), pass: r.pass === true, blockers: r.blockers || [], warnings: r.warnings || [] })
  }
  return out
}

// Extract a clean, short, regex-safe literal to forbid from a finding. null if not safe.
function literalFromFinding(f) {
  let lit = (typeof f.evidence === 'string' && f.evidence) ? f.evidence : ''
  const q = String(f.detail || '').match(/"([^"]{2,40})"/)
  if ((!lit || lit.length > 40) && q) lit = q[1]
  lit = String(lit).split(/[\n("]/)[0].trim()
  if (!lit || lit.length < 3 || lit.length > 40) return null
  if (!/^[\w$%&@#.,:;!?+\-/'\s]+$/.test(lit)) return null // reject html / heavy metachars
  return lit
}

// Collapse a build's gate results into ONE 0–1 quality score PER owning agent, and append each as a
// kind:'score' eval-run (the shape db.ingestEvalRuns reads). Gate pass-rate already folds in the Lens
// gate (#18 visual-check) and every static gate, so this one number IS gates+Lens per builder.
function emitBuildScores(byAgent, buildId, ts) {
  const records = []
  for (const [agent, a] of Object.entries(byAgent)) {
    if (agent === 'unknown' || !a.gatesTotal) continue
    const overall = +((a.gatesTotal - a.gatesFailed) / a.gatesTotal).toFixed(3)
    records.push({
      kind: 'score', at: ts, case: `build:${buildId}`, agent, task_type: 'build',
      overall, pass: a.gatesFailed === 0,
      scores: { gate_pass_rate: overall, gates_total: a.gatesTotal, gates_failed: a.gatesFailed, blockers: a.blockers, warnings: a.warnings },
      reasoning: `build ${buildId}: ${a.gatesTotal - a.gatesFailed}/${a.gatesTotal} owned gates passed (${a.blockers} blocker(s))`,
      source: 'quality-loop',
    })
  }
  if (records.length) {
    fs.mkdirSync(path.dirname(RUNS_LOG), { recursive: true })
    fs.appendFileSync(RUNS_LOG, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
  }
  return records
}

function main() {
  const buildDir = process.argv[2]
  if (!buildDir) { console.error('usage: node scripts/quality-loop.mjs <buildDir> [buildId]'); process.exit(2) }
  const buildId = (process.argv[3] || path.basename(buildDir)).replace(/\s+/g, '-')
  const reports = readGateReports(buildDir)
  if (reports.length === 0) { console.error(`quality-loop: no gate-reports in ${buildDir}/gate-reports`); process.exit(1) }

  // ---- (1) snapshot → quality-trend.jsonl ----
  const byAgent = {}, byGate = {}
  let totalBlockers = 0, totalWarnings = 0, gatesFailed = 0
  for (const r of reports) {
    const owner = GATE_OWNER[r.gate] || 'unknown'
    const nb = r.blockers.length, nw = r.warnings.length
    totalBlockers += nb; totalWarnings += nw
    if (!r.pass) gatesFailed += 1
    byGate[r.gate] = { blockers: nb, warnings: nw, pass: r.pass }
    byAgent[owner] ||= { blockers: 0, warnings: 0, gatesFailed: 0, gatesTotal: 0 }
    byAgent[owner].blockers += nb; byAgent[owner].warnings += nw; byAgent[owner].gatesTotal += 1; if (!r.pass) byAgent[owner].gatesFailed += 1
  }
  const passRate = Math.round(((reports.length - gatesFailed) / reports.length) * 100)
  const ts = new Date().toISOString()
  const snapshot = { ts, build: buildId, gatesTotal: reports.length, gatesFailed, passRate, totalBlockers, totalWarnings, byAgent, byGate }
  // ---- ratchet candidates: a gate that flipped FAIL→PASS since the last run of THIS build is a fix
  //      worth locking in forever (the audit's ratchet — "the same bug can't ship twice"). Read the
  //      prior snapshot for this build BEFORE appending, then surface fixed gates so the signal doesn't
  //      rely on discipline. (Non-blocking: it suggests `pnpm ratchet`, it doesn't auto-write noise.)
  const priorForBuild = (() => {
    try { const lines = fs.readFileSync(TREND, 'utf8').trim().split('\n').filter(Boolean)
      for (let i = lines.length - 1; i >= 0; i--) { const s = JSON.parse(lines[i]); if (s.build === buildId) return s } } catch { /* first run */ }
    return null
  })()
  fs.appendFileSync(TREND, JSON.stringify(snapshot) + '\n')
  const fixedGates = priorForBuild ? Object.keys(byGate).filter((g) => byGate[g].pass && priorForBuild.byGate && priorForBuild.byGate[g] && priorForBuild.byGate[g].pass === false) : []

  // ---- (1b) per-builder build score → eval-runs.jsonl (gap 1: the build fleet feeds Witness/Tutor) ----
  const scored = emitBuildScores(byAgent, buildId, ts)

  // ---- (2) candidates → proposed.json, promote recurring → team-default.json ----
  const proposed = readJson(PROPOSED, [])
  const byKey = new Map(proposed.filter((c) => c && c._key).map((c) => [c._key, c]))
  let newCand = 0, bumped = 0
  for (const r of reports) {
    const owner = GATE_OWNER[r.gate] || 'unknown'
    for (const f of r.blockers) {
      if (!TEXT_CLASSES.some((c) => String(f.id || '').includes(c))) continue
      const lit = literalFromFinding(f)
      if (!lit) continue
      const key = `${owner}|${lit.toLowerCase()}`
      let c = byKey.get(key)
      if (!c) {
        c = { _key: key, id: `auto-${slug(lit)}`, type: 'forbid-text', pattern: escapeRe(lit), severity: 'warn', message: `real defect caught by ${r.gate} on a live build`, owner, source: `auto:${r.gate}`, occurrences: 0, builds: [], firstSeen: ts, lastSeen: ts, status: 'proposed' }
        byKey.set(key, c); proposed.push(c); newCand += 1
      }
      if (!c.builds.includes(buildId)) { c.builds.push(buildId); c.occurrences = c.builds.length; c.lastSeen = ts; bumped += 1 }
    }
  }

  const team = readJson(TEAM, [])
  const teamIds = new Set(team.filter((r) => r && r.id).map((r) => r.id))
  let promoted = 0
  for (const c of proposed) {
    if (c.status === 'promoted' || c.occurrences < PROMOTE_MIN || teamIds.has(c.id)) continue
    team.push({ id: c.id, type: c.type, pattern: c.pattern, severity: c.severity, message: c.message, owner: c.owner, source: `auto-promoted:${String(c.source).replace(/^auto:/, '')}` })
    teamIds.add(c.id); c.status = 'promoted'; promoted += 1
  }
  writeJson(PROPOSED, proposed)
  if (promoted) writeJson(TEAM, team)

  console.log(`quality-loop: ${buildId} — ${reports.length} gates · ${gatesFailed} failed · pass-rate ${passRate}% · ${totalBlockers} blockers, ${totalWarnings} warnings`)
  console.log(`  trend: snapshot appended (${path.relative(REPO, TREND)})`)
  console.log(`  score: ${scored.length} per-builder eval-run(s) → ${path.relative(REPO, RUNS_LOG)} (${scored.map((r) => `${r.agent} ${(r.overall * 100).toFixed(0)}%`).join(', ') || 'none'})`)
  if (fixedGates.length) {
    console.log(`  ratchet: ${fixedGates.length} gate(s) fixed since the last run of this build — lock the fix in so it can't recur:`)
    for (const g of fixedGates) console.log(`     pnpm ratchet <buildDir> --gate ${g} --slug ${slug(g)}-fix --brief "<what broke>"`)
  }
  console.log(`  rules: +${newCand} new candidate(s), ${bumped} occurrence bump(s) · ${proposed.length} queued · promoted ${promoted} → enforced team-default (bar: ${PROMOTE_MIN} builds)`)
}
main()
