#!/usr/bin/env node
// Gate #0.4 — discovery-complete. The executable version of the prose gate in
// `shopify-technical-goals-discovery.md` §4 (which atrium was "supposed to run" but never was — so
// builds started with no structured brief and every downstream gate had nothing to anchor to). This
// is the DISPATCH-TIME hard refusal: no design/build handoff until the brief exists as DATA.
//
// "Brief in → store out" only works if the brief is captured as a machine-readable contract the
// whole pipeline reads from. This enforces that contract:
//   1. docs/discovery/goals.json present + parseable (the numeric-targets schema, §1 of the doc).
//   2. The load-bearing goal areas exist (revenue / conversion / seo / performance) and carry
//      baseline→target shape, not adjectives. conversion.priority_surfaces non-empty +
//      cvr_target_pct set (the lift_target driver every CRO gate keys off).
//   3. docs/design/brand-direction.md present + substantive (the design-direction artifact drape
//      designs from — not an empty stub).
//   4. Existing-store builds (EXISTING_STORE=1): docs/discovery/preflight-audit.md present (the
//      "before" baseline; §3). Autonomous greenfield runs don't require it.
//
// Posture mirrors #0.5/#17/#18: WARN in dev, BLOCK at dispatch/publish-grade
// (DS_REQUIRE_SCOPE=1 / DISCOVERY_REQUIRED=1). Pairs with #0.5 bootstrap (design-system.json) to
// form the complete "foundation exists before build" pre-gate.
//
// Usage: node check-discovery.mjs
// Env: REPORT_DIR (gate-reports) · DS_REQUIRE_SCOPE=1 | DISCOVERY_REQUIRED=1 (dispatch-grade: BLOCK)
//      · EXISTING_STORE=1 (also require preflight-audit.md)
//      · GOALS_FILE (docs/discovery/goals.json) · BRAND_FILE (docs/design/brand-direction.md)
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeReport } from './lib/report.mjs'
import { validate } from './lib/jsonschema.mjs'
import { llmJudge } from './lib/llm-judge.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.DISCOVERY_REQUIRED === '1'
const EXISTING_STORE = process.env.EXISTING_STORE === '1'
const JUDGE = process.env.DISCOVERY_JUDGE === '1' // #13: opt-in LLM positioning-quality judge (off in tests)
const GOALS_FILE = process.env.GOALS_FILE || 'docs/discovery/goals.json'
const BRAND_FILE = process.env.BRAND_FILE || 'docs/design/brand-direction.md'
const PREFLIGHT_FILE = 'docs/discovery/preflight-audit.md'
const SCHEMA_FILE = fileURLToPath(new URL('../schemas/goals.schema.json', import.meta.url))

// retained for the optional LLM judge pass (#13) — set by the static checks, read in main()
let parsedGoals = null
let brandText = null

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })
const issue = (id, page, detail, evidence = '') => (REQUIRE ? add(blockers, id, page, detail, evidence) : add(warnings, id, page, detail, evidence))

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('discovery', 0.4, {
    cwd, pass, blockers, warnings,
    evidence: { required: REQUIRE, existingStore: EXISTING_STORE, goalsFile: GOALS_FILE, reason: envError || undefined, ...evidence },
    duration_ms: Date.now() - t0,
  }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`discovery: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// A value is a real target if it's a finite number (baseline→target captured), not null/"" /an
// adjective string. The schema allows `null` for unknowns, but at DISPATCH-grade an in-scope goal
// with no target is the "goal as a vibe" anti-pattern.
const isNum = v => typeof v === 'number' && Number.isFinite(v)
const isNonEmptyArr = v => Array.isArray(v) && v.length > 0

// #13 — schema validation pass. Loads the published contract + reports each violation as a stable
// `discovery.schema:<path>` finding (REQUIRE-aware). Fail-open if the schema file itself is unreadable
// (a toolkit-install problem must not block a real brief — the procedural checks still run).
function checkSchema(goals) {
  let schema
  try { schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, 'utf-8')) } catch { return }
  for (const e of validate(goals, schema)) {
    issue(`discovery.schema:${e.path}`, GOALS_FILE, `goals.json shape violates the contract — ${e.path}: ${e.message} (schemas/goals.schema.json).`)
  }
}

// ── 1 + 2. goals.json ─────────────────────────────────────────────────────────
function checkGoals() {
  const p = path.resolve(cwd, GOALS_FILE)
  if (!fs.existsSync(p)) {
    issue('discovery.goals-missing', GOALS_FILE,
      `no ${GOALS_FILE} — the structured brief (numeric goals: revenue/conversion/seo/performance) is the contract the whole pipeline builds from. atrium must not dispatch design/build without it (shopify-technical-goals-discovery.md §4).`)
    return
  }
  let goals
  try { goals = JSON.parse(fs.readFileSync(p, 'utf-8')) } catch (e) { issue('discovery.goals-invalid', GOALS_FILE, `invalid JSON: ${e.message}`); return }
  if (!goals || typeof goals !== 'object') { issue('discovery.goals-invalid', GOALS_FILE, 'goals.json is not an object'); return }
  parsedGoals = goals

  // #13 — validate the SHAPE against the published contract (schemas/goals.schema.json). Catches
  // malformed types the procedural checks below don't (e.g. a numeric target captured as text). The
  // schema is the authoring reference; these findings are dispatch-grade blocks, dev-grade warnings.
  checkSchema(goals)

  // load-bearing areas present
  for (const area of ['revenue', 'conversion', 'seo', 'performance']) {
    if (!goals[area] || typeof goals[area] !== 'object') {
      issue('discovery.goals-area-missing', GOALS_FILE, `goals.${area} missing — every build needs ${area} targets (baseline→target). See §1 schema.`)
    }
  }

  // conversion is the lift-target driver every CRO gate (#7/#21) keys off — enforce its shape hard.
  const c = goals.conversion
  if (c && typeof c === 'object') {
    if (!isNonEmptyArr(c.priority_surfaces)) {
      issue('discovery.no-priority-surfaces', GOALS_FILE, `conversion.priority_surfaces is empty — name the funnel surfaces to optimize (hero/pdp/cart/checkout/post-purchase). CRO + Lens prioritize against this.`)
    }
    if (!isNum(c.cvr_target_pct)) {
      // target may legitimately be a niche default; absence at dispatch-grade is still a block (it
      // drives lift_target = niche_benchmark × 2.5). Dev → warning.
      issue('discovery.no-cvr-target', GOALS_FILE, `conversion.cvr_target_pct not a number — the lift target (niche_benchmark × 2.5) can't be computed. Resolve to the niche default + flag, never leave blank.`)
    }
  }

  // performance has hard defaults in the doc; a present-but-empty perf block is a warning (defaults apply).
  const perf = goals.performance
  if (perf && typeof perf === 'object' && !isNum(perf.lcp_target_s)) {
    warnings.push({ id: 'discovery.perf-default', page: GOALS_FILE, detail: 'performance.lcp_target_s not set — defaulting to <2.5s (lumen constant). Set explicitly if the client requires stricter.', evidence: '' })
  }

  // adjective-as-goal smell: any string value among the numeric target fields = the §5 anti-pattern.
  const numericKeys = /(_pct|_s|_ms|_monthly|_target|_current|aov_|lcp_|inp_|cls_|lighthouse_)/
  const adjectives = []
  const walk = (obj, prefix = '') => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (typeof v === 'string' && numericKeys.test(k) && !/^\s*\d/.test(v)) adjectives.push(`${key}="${v}"`)
      else if (v && typeof v === 'object') walk(v, key)
    }
  }
  walk(goals)
  if (adjectives.length) {
    issue('discovery.goal-as-adjective', GOALS_FILE, `numeric goal field(s) hold non-numeric text (the "faster/more sales" anti-pattern): ${adjectives.slice(0, 4).join(', ')}. Capture baseline→target numbers.`)
  }
}

// ── 3. brand-direction.md ─────────────────────────────────────────────────────
function checkBrandDirection() {
  const p = path.resolve(cwd, BRAND_FILE)
  if (!fs.existsSync(p)) {
    issue('discovery.brand-missing', BRAND_FILE,
      `no ${BRAND_FILE} — the design-direction artifact drape designs from (voice, references, palette/type intent, hard constraints). Without it design is generic-by-default.`)
    return
  }
  let text
  try { text = fs.readFileSync(p, 'utf-8') } catch (e) { issue('discovery.brand-unreadable', BRAND_FILE, `unreadable: ${e.message}`); return }
  brandText = text
  const words = text.replace(/[#>*_`-]/g, ' ').split(/\s+/).filter(Boolean).length
  if (words < 60) {
    issue('discovery.brand-stub', BRAND_FILE, `brand-direction.md is a stub (${words} words) — needs real direction (voice, 2–3 references + what to take, palette/type intent, constraints), not a placeholder.`)
  }
  if (/lorem ipsum|tbd|todo|placeholder|fill (this )?in/i.test(text)) {
    issue('discovery.brand-placeholder', BRAND_FILE, 'brand-direction.md contains placeholder text (lorem/TBD/TODO) — replace with real direction before design dispatch.')
  }
  // #16 — reference-brand ratification floor: the brief must name reference brands WITH a specific
  // "what to take", not bare adjectives — drape designs FROM these. Deterministic structural floor (the
  // deeper "specific section · pattern · lift" quality is the LLM positioning judge's job, #13). issue()
  // → dispatch block, dev warning.
  const refsMentioned = /referenc/i.test(text)
  const structuredRefs = [...text.matchAll(/[A-Z][A-Za-z0-9&.+'’ ]{1,30}\s*[—\-–:(]\s*\w/g)].length
  if (!refsMentioned || structuredRefs < 2) {
    issue('discovery.brand-references-thin', BRAND_FILE, `brand-direction.md needs ≥2 reference brands EACH with a specific "what to take" (e.g. "Ceremonia — editorial PDP rhythm; Everist — restrained palette") — generic references give drape nothing concrete to design from.`)
  }
}

// ── 4. preflight-audit.md (existing stores only) ──────────────────────────────
function checkPreflight() {
  if (!EXISTING_STORE) return
  const p = path.resolve(cwd, PREFLIGHT_FILE)
  if (!fs.existsSync(p)) {
    issue('discovery.preflight-missing', PREFLIGHT_FILE,
      `EXISTING_STORE=1 but no ${PREFLIGHT_FILE} — the technical baseline + "before" metrics are mandatory on an existing store (§3); without them success is unprovable and you rebuild blind.`)
  }
}

// ── #13 LLM positioning-quality judge (opt-in: DISCOVERY_JUDGE=1) ──────────────
// Static rules catch adjective-as-number; they can't tell "premium science-backed magnesium for
// poor sleepers, vs Ritual on price + transparency" from "good supplements for everyone". This asks
// the model. FAIL-OPEN: a null verdict (judge off / infra error) adds nothing. A "vague" verdict is a
// dispatch-grade block (you don't design from a vague brief), a dev-grade warning.
function judgePositioning() {
  if (!JUDGE || !parsedGoals) return
  const prompt = `You are a Shopify brand-strategy reviewer. Decide if this brief's POSITIONING is specific & actionable (clear ICP, pain, differentiation) or vague boilerplate. Reply with ONLY a JSON object: {"verdict":"specific"|"vague","reason":"<=18 words"}.\n\nGOALS.JSON:\n${JSON.stringify(parsedGoals).slice(0, 4000)}\n\nBRAND-DIRECTION.MD:\n${String(brandText || '(none)').slice(0, 4000)}`
  const v = llmJudge({ prompt })
  if (v && v.verdict === 'vague') {
    issue('discovery.vague-positioning', BRAND_FILE, `LLM positioning judge: brief reads as vague/boilerplate — ${v.reason || 'no specific ICP / pain / differentiation'}. Tighten before design dispatch.`)
  }
}

function main() {
  checkGoals()
  checkBrandDirection()
  checkPreflight()
  judgePositioning()
  finish(null)
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
