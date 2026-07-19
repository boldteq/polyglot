#!/usr/bin/env node
// SWT Autonomous Design Training Loop
// Every cycle: pick the next uncovered slices of the ~5,040-slice possibility space
// (24 design concerns × 30 surfaces), generate a batch of gap-FAQs (gap → deep
// solution w/ owner+gate → pros → cons → auto-fix), append to the FAQ brain, scan
// the dogfood store, git-commit, and log progress. Drives the team toward fully
// autonomous, conversion-grade, honest Shopify website design.
//
// Generation = headless `claude -p` (subscription vision/judgment, NO API key) — the
// same mechanism Lens uses. The daemon does all file writes deterministically; claude
// only returns JSON. NEVER pushes to the live store (mantle + Yash gate publish).
//
// Usage:
//   node scripts/swt-train-loop.mjs start        # run the loop (default)
//   node scripts/swt-train-loop.mjs once         # run exactly one cycle then exit
//   node scripts/swt-train-loop.mjs status       # print coverage meter + state
//   touch scripts/swt-train/STOP                 # graceful kill switch
//
// Env: CLAUDE_BIN, SWT_INTERVAL_MS (900000), SWT_MAX_CYCLES (60),
//      SWT_SLICES_PER_CYCLE (7), SWT_MODEL (inherit), SWT_STORE_SCAN (1)

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { distribute } from './swt-distribute.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const STATE_DIR = path.join(HERE, 'swt-train')
const BRAIN = path.join(
  process.env.HOME,
  '.claude/memory/patterns/good/shopify-website-faq-brain.md',
)
const STATE_F = path.join(STATE_DIR, 'state.json')
const QUEUE_F = path.join(STATE_DIR, 'store-fix-queue.md')
const LOG_F = path.join(STATE_DIR, 'cycle.log')
const STOP_F = path.join(STATE_DIR, 'STOP')
const REJECTED_F = path.join(STATE_DIR, 'rejected-rules.md')
const STORE = '/Users/yashbaldha/Desktop/Shopify Task/gpt test 1'

const CLAUDE_BIN =
  process.env.CLAUDE_BIN ||
  '/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/claude'
const INTERVAL_MS = Number(process.env.SWT_INTERVAL_MS || 15 * 60 * 1000)
const MAX_CYCLES = Number(process.env.SWT_MAX_CYCLES || 60)
const SLICES_PER_CYCLE = Number(process.env.SWT_SLICES_PER_CYCLE || 7)
const FAQS_PER_SLICE = 7
const TARGET = 5040
const MODEL = process.env.SWT_MODEL || '' // empty = inherit CLI default
const STORE_SCAN = process.env.SWT_STORE_SCAN !== '0'
// Round 2 (topup): the linear plan is breadth-only — once slicePointer reaches 720 it's "done"
// even though the critic dropped enough entries that ~35% of slices never reached the 7-FAQ
// quota. Gap mode re-walks the brain's REAL per-slice counts every cycle (self-correcting: a
// slice the critic guts this cycle just reappears next cycle) instead of trusting a stale pointer.
const GAP_MODE = process.env.SWT_MODE === 'topup'

const CONCERNS = [
  'layout', 'typography', 'color-contrast', 'spacing-rhythm',
  'imagery-art-direction', 'motion', 'mobile', 'a11y', 'cro',
  'trust-social-proof', 'copy-voice', 'honesty-claims', 'data-binding',
  'performance-cwv', 'seo-structured-data', 'i18n-currency-rtl',
  'states-empty-loading-error', 'edge-cases', 'legal-compliance',
  'merchandising', 'search-filtering', 'nav-ia', 'forms-validation',
  'email-lifecycle',
]
const SURFACES = [
  'home', 'collection', 'pdp', 'cart', 'cart-drawer', 'checkout-reassurance',
  'search', 'search-empty', 'account', 'article', 'blog', 'policy', '404',
  'order-confirmation', 'subscription', 'gift-card', 'contact', 'about',
  'faq-page', 'lookbook', 'store-locator', 'comparison', 'bundle-builder',
  'quiz-finder', 'landing-advertorial', 'header-nav', 'footer', 'mega-menu',
  'announcement-bar', 'password-page',
]

// Deterministic round-robin walk: rotate concern every step, advance surface
// every full concern lap → 720 unique (concern|surface) slices, breadth-first.
function buildSlicePlan() {
  const plan = []
  const total = CONCERNS.length * SURFACES.length
  for (let k = 0; k < total; k++) {
    const concern = CONCERNS[k % CONCERNS.length]
    const surface = SURFACES[Math.floor(k / CONCERNS.length) % SURFACES.length]
    plan.push(`${concern}|${surface}`)
  }
  return plan
}

const AGENTS =
  'atrium(lead/intake) · compass(content/sitemap) · drape(design-spec+design-system.json) · ' +
  'ink(on-page copy, honest claims) · beacon(SEO/JSON-LD) · stitch(Figma→Liquid+reuse-map) · ' +
  'loom(Liquid build/sections/CSS/JS) · conduit(Storefront+Admin API, app integ) · ' +
  'lattice(metafields/metaobjects) · keystone(store access) · porter(store data/products/images) · ' +
  'mantle(CLI deploy/publish) · lumen(QA gates/Lighthouse/axe) · onyx(final review/visual-quality)'

// Gate stack — 36 quality gates · 2 levels (setup/quality → category). Loved names. (theme-lock/library-cards/review-board removed.)
const GATES =
  '#0.4 discovery, #0.5 foundation, #0.6 secret-scan, ' +
  '#1 performance(LCP/CLS), #5 accessibility(live a11y), #6 seo(JSON-LD/canonical/meta), ' +
  '#10 functionality(clicks/ATC/no-JS-errors), #25 redirects, #39 social-assets(favicon/OG), #40 link-health(404/broken-links), ' +
  '#2 code-lint, #3 editability(no-hardcode), #11 dead-code, #22 layout(overflow), ' +
  '#7 conversion(CRO+can-transact+lift), #38 price-binding(no-hardcoded-prices), ' +
  '#13 honesty(no fabrication/fake-urgency), #36 content-quality(no-placeholder+copy), ' +
  '#18 visual-check(Lens vision-judge), #19 section-consistency, #20 class-d-visual(Class-D micro-change Lens evidence), #35 mobile, ' +
  '#8 design-tokens, #9 consistency, #12 design-quality(premium), #14 render-check, #23 section-reuse, #30 brand-sync, ' +
  '#16 static-a11y(alt/tap-targets), #24 imagery(weight/art-direction), #27 app-conflicts, #28 translations, #29 email-triggers, ' +
  '#37 legal-pages(privacy/terms/refund/shipping), #41 analytics-wiring(GA4/Meta), #42 consent(GDPR)'

// Normalize any legacy gate names claude's priors leak into the new branded names (number-anchored
// "#N old" → "#N new" + the dominant " · #N name · " citation form), so every stored FAQ is branded.
const GATE_BRAND_PAIRS = (() => {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(HERE, 'gate-migration-map.json'), 'utf8'))
    return [
      ...m.renames.map((r) => ({ oN: r.number, o: r.old, nN: r.number, n: r.new })),
      ...m.merges.flatMap((mg) => mg.absorbs.map((a) => ({ oN: a.number, o: a.old, nN: mg.number, n: mg.new }))),
    ]
  } catch { return [] }
})()
function brandGates(text) {
  let t = String(text || '')
  for (const p of GATE_BRAND_PAIRS) {
    const onum = String(p.oN).replace(/[.]/g, '\\.')
    t = t.replace(new RegExp(`#\\s*${onum}\\s+${p.o}\\b`, 'g'), `#${p.nN} ${p.n}`) // "#13 candor" → "#13 candor"
    t = t.replace(new RegExp(`\\b${p.o}\\s*\\(#\\s*${onum}\\)`, 'g'), `${p.n} (#${p.nN})`) // "candor (#13)"
  }
  return t
}

function genPrompt(slices, count, startId) {
  const sliceLines = slices
    .map((s) => {
      const [concern, surface] = s.split('|')
      return `- concern="${concern}" surface="${surface}"`
    })
    .join('\n')
  return `You are training the Boldteq Shopify Website Team to design a complete, conversion-grade, HONEST Shopify store fully autonomously. Produce a batch of "gap-FAQ" training entries: each captures a real situation/edge-case/possibility an AI builder must handle, and pins the canonical answer with explicit trade-offs.

TEAM (name a real owner per entry): ${AGENTS}
GATES (cite a real one that enforces the answer): ${GATES}

Cover these slices (≈${FAQS_PER_SLICE} distinct FAQs each, spanning that concern across that surface and its edge-cases):
${sliceLines}

HARD RULES:
- Specific to Shopify Online Store 2.0 Liquid themes (Dawn/Minimog base), real ecom behavior. NO generic web fluff.
- Every entry names an owning agent + an enforcing gate from the lists above.
- Cite gates by their EXACT name from the GATES list above (e.g. honesty, visual-check, design-tokens, render-check, static-a11y), NEVER removed gates (theme-lock/library-cards/review-board).
- Honesty doctrine: never fabricate reviews/press/stats/urgency; empty modules hide, not fake.
- "cons" must be a REAL trade-off + a mitigation, not a throwaway.
- Distinct from each other; concrete and actionable.

Output ONLY a JSON array of exactly ${count} objects, no prose, no markdown fences. Each object:
{"concern":"<one of the concern values above>","surface":"<surface>","gap":"<the situation as a question>","solution":"<owner agent · gate# · concrete rule/spec>","pros":"<why it wins>","cons":"<real trade-off + mitigation>","autofix":"<'mechanized — #N <gate>' or 'knowledge-only'>"}`
}

function loadState() {
  if (fs.existsSync(STATE_F)) return JSON.parse(fs.readFileSync(STATE_F, 'utf8'))
  return {
    target: TARGET,
    startedAt: stamp(),
    cyclesRun: 1, // Batch 1 authored manually
    batches: 1,
    faqCount: countBrainFaqs(),
    slicePointer: 0,
    consecutiveFailures: 0,
    log: [{ cycle: 1, ts: '2026-06-26', added: 50, faqTotal: 50, note: 'Batch 1 seed (manual)' }],
  }
}
// Atomic write (tmp + rename) — a crash mid-write can't leave a torn/corrupt file. The brain is the
// ONLY source (every pack/digest/index rebuilds from it) and has no other recovery point, so its
// in-place rewrites MUST be atomic. audit 2026-06-27.
function atomicWrite(file, content) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, file)
}
function saveState(s) {
  atomicWrite(STATE_F, JSON.stringify(s, null, 2))
}
function stamp() {
  return new Date().toISOString() // daemon process — Date is allowed here (not a workflow script)
}
function logLine(msg) {
  const line = `[${stamp()}] ${msg}\n`
  fs.appendFileSync(LOG_F, line)
  process.stdout.write(line)
}

function countBrainFaqs() {
  if (!fs.existsSync(BRAIN)) return 0
  const m = fs.readFileSync(BRAIN, 'utf8').match(/^### FAQ-\d{4}/gm)
  return m ? m.length : 0
}

// The next ID to assign MUST come from what's actually on disk, never from state.faqCount alone —
// a manual purge that removes entries from the MIDDLE of the range (not the tail) decouples "total
// count" from "highest assigned ID" (bit us for real 2026-07-02: purged 2 FAQs, faqCount patched to
// the new total 4293, but FAQ-4294/4295 were still on disk from before the purge — a restart would
// have silently duplicated their headers). Self-healing: doesn't matter what state.json says.
function maxBrainFaqId() {
  if (!fs.existsSync(BRAIN)) return 0
  const m = fs.readFileSync(BRAIN, 'utf8').match(/^### FAQ-(\d{4})/gm)
  if (!m) return 0
  return Math.max(...m.map((s) => Number(s.slice(-4))))
}

// real per-slice counts, tallied from the FAQ headers actually on disk (not the state pointer).
function countBrainSlices() {
  const counts = new Map()
  if (!fs.existsSync(BRAIN)) return counts
  const re = /^### FAQ-\d{4} · ([\w-]+) · ([\w-]+)/gm
  const md = fs.readFileSync(BRAIN, 'utf8')
  let m
  while ((m = re.exec(md))) {
    const key = `${m[1]}|${m[2]}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}
// under-quota slices, worst gap (zero-coverage) first — so a run cut short still lands the
// most valuable fills first. Empty return = every slice at/above FAQS_PER_SLICE. No pointer:
// recomputed fresh each cycle so a critic-gutted slice from cycle N is retried at cycle N+1.
function buildGapPlan() {
  const counts = countBrainSlices()
  return buildSlicePlan()
    .map((slice) => ({ slice, n: counts.get(slice) || 0 }))
    .filter((x) => x.n < FAQS_PER_SLICE)
    .sort((a, b) => a.n - b.n)
    .map((x) => x.slice)
}

// ---- claude -p generation ----
const GEN_TIMEOUT_MS = Number(process.env.SWT_GEN_TIMEOUT_MS || 12 * 60 * 1000) // 49-FAQ gen runs ~4-8min
function callClaude(prompt) {
  // NOTE: dropped --no-session-persistence (not a documented flag in claude 2.1.x). Keep args minimal.
  const args = ['-p', prompt, '--output-format', 'text']
  if (MODEL) args.push('--model', MODEL)
  const r = spawnSync(CLAUDE_BIN, args, {
    encoding: 'utf8',
    timeout: GEN_TIMEOUT_MS,
    maxBuffer: 30 * 1024 * 1024,
    cwd: ROOT,
  })
  if (r.error) {
    // distinguish a timeout (expected under load) from a real spawn failure, so the log is diagnosable.
    const why = (r.error.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') ? `timeout after ${Math.round(GEN_TIMEOUT_MS / 60000)}min` : r.error.message
    throw new Error(`claude generation failed: ${why}`)
  }
  // capture FULL stderr (the old 300-char slice hid the cause of every exit-1); fall back to stdout.
  if (r.status !== 0) throw new Error(`claude exit ${r.status}: ${(r.stderr || r.stdout || '(no output)').trim().slice(0, 1000)}`)
  return r.stdout || ''
}
function extractJsonArray(text) {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON array in output')
  return JSON.parse(t.slice(start, end + 1))
}
function validEntry(e) {
  return (
    e &&
    typeof e.concern === 'string' &&
    typeof e.surface === 'string' &&
    typeof e.gap === 'string' && e.gap.length > 10 &&
    typeof e.solution === 'string' && e.solution.length > 10 &&
    typeof e.pros === 'string' &&
    typeof e.cons === 'string'
  )
}

// ---- adversarial verify: a critic drops wrong/contradictory/fabricated rules
//      BEFORE they're written into agents. Degrades to keep-all on error; an
//      over-zealous critic (>70% dropped) is distrusted so it can't starve a cycle.
function verifyPrompt(entries) {
  const list = entries
    .map((e, i) => `${i}. [${e.concern}/${e.surface}] GAP: ${e.gap.slice(0, 140)} | RULE: ${e.solution.slice(0, 190)}`)
    .join('\n')
  return `You are a SKEPTICAL senior Shopify Online Store 2.0 / Liquid engineer auditing auto-generated TRAINING RULES that will be written into AI agents' instructions. A WRONG rule teaches the agents a falsehood that they then ship — so be ADVERSARIAL: when in doubt, DROP.

For EACH numbered entry, decide keep or drop. DROP if ANY of these is true:
- WRONG / INVENTED: factually wrong about Shopify/Liquid/theme behavior, OR uses a Liquid filter/object/property that does NOT exist (VERIFY the names are real — e.g. there is NO \`round_to_humanize\`, \`date_diff\`, \`time_ago\`, \`request.user_agent\`, \`shop.taxes_included\`; date math uses \`| date: '%s'\` epoch subtraction, currency uses Markets + \`| money\`, not a convert filter).
- GENERIC: web/CRO/typography/copy/email advice NOT bound to a SPECIFIC real Shopify mechanism (a real Liquid object/filter, section/block setting, metafield/metaobject, route, or a real gate). "Use 16px body / 150ms transitions / benefits-first copy / 12-16-24px spacing" = DROP — it applies to any website.
- DISHONEST: fabricated reviews/press/stats, fake urgency/countdown, OR cites a gate number that doesn't exist.
- REDUNDANT: restates a universal rule (alt text, semantic HTML, WCAG basics, "use a real link") with nothing new or Shopify-specific, OR duplicates another entry in this list.

KEEP ONLY if it is a REAL gap a Shopify theme builder genuinely hits AND the solution is CORRECT + SPECIFIC + actionable, naming a real Liquid object/filter/setting/metafield you can verify exists. A vague-but-true statement is NOT enough — it must be Shopify-specific and verifiable.

${list}

Output ONLY a JSON array, one object per entry, covering all ${entries.length}: [{"i":<index>,"verdict":"keep"|"drop","reason":"<=10 words"}]`
}
// Deterministic backstop — Liquid filters/objects/props that DO NOT EXIST but the generator
// hallucinates (audit 2026-06-27: these teach agents false Liquid). Curated to be ZERO false-positive
// (every one is verifiably not real Shopify Liquid), so a rule using one is wrong-by-construction and
// dropped regardless of what the LLM critic says. Grow this list as new hallucinations are caught.
const HALLUCINATED = [
  /\bround_to_humanize\b/i, /\|\s*date_diff\b/i, /\|\s*time_diff\b/i, /\|\s*time_ago\b/i, /\|\s*days_until\b/i,
  /\|\s*relative_time\b/i, /\|\s*ordinalize\b/i, /\|\s*currency_convert\b/i, /\|\s*convert_currency\b/i,
  /\|\s*money_round\b/i, /\|\s*to_currency\b/i, /\brequest\.user_agent\b/i, /\brequest\.is_mobile\b/i,
  /\brequest\.device\b/i, /\bshop\.taxes_included\b/i,
]
function hallucinatedToken(entry) {
  const text = `${entry.solution} ${entry.autofix || ''}`
  for (const re of HALLUCINATED) { const m = text.match(re); if (m) return `invented Liquid: ${m[0].replace(/^\|\s*/, '').trim()}` }
  return null
}

function verifyBatch(entries, cycle) {
  let verdicts
  try {
    verdicts = extractJsonArray(callClaude(verifyPrompt(entries)))
  } catch (e) {
    logLine(`cycle ${cycle} verify SKIPPED (${e.message}) — keeping all unverified`)
    return entries
  }
  const drops = new Map()
  for (const v of verdicts)
    if (v && v.verdict === 'drop' && Number.isInteger(v.i) && v.i >= 0 && v.i < entries.length)
      drops.set(v.i, String(v.reason || '').slice(0, 80))
  let kept = entries.filter((_, i) => !drops.has(i))
  if (kept.length < entries.length * 0.3) {
    logLine(`cycle ${cycle} verify ANOMALY (kept ${kept.length}/${entries.length}) — distrusting critic, keeping all`)
    return entries
  }
  // deterministic backstop (high-precision, additive — catches invented Liquid the LLM critic missed)
  for (let i = 0; i < entries.length; i += 1) {
    if (drops.has(i)) continue
    const h = hallucinatedToken(entries[i])
    if (h) drops.set(i, `${h} [deterministic]`)
  }
  kept = entries.filter((_, i) => !drops.has(i))
  if (drops.size > 0) {
    const lines = [...drops.entries()].map(
      ([i, r]) => `- cycle ${cycle} [${entries[i].concern}/${entries[i].surface}] "${entries[i].gap.slice(0, 80)}" — DROPPED: ${r}`,
    )
    fs.appendFileSync(REJECTED_F, lines.join('\n') + '\n')
  }
  return kept
}

function renderEntry(e, id) {
  const num = String(id).padStart(4, '0')
  return [
    `### FAQ-${num} · ${e.concern} · ${e.surface}`,
    `**Gap:** ${e.gap.trim()}`,
    `**Solution:** ${e.solution.trim()}`,
    `**Pros:** ${e.pros.trim()}`,
    `**Cons:** ${e.cons.trim()}`,
    `**Auto-fix:** ${(e.autofix || 'knowledge-only').trim()}`,
    '',
  ].join('\n')
}

function appendBatch(entries, batchNo, startId) {
  let md = fs.readFileSync(BRAIN, 'utf8')
  const lastId = startId + entries.length - 1
  const concernsTouched = [...new Set(entries.map((e) => e.concern))].slice(0, 6).join(', ')
  const header = `## Batch ${batchNo} — ${concernsTouched} (FAQ-${String(startId).padStart(4, '0')} … FAQ-${String(lastId).padStart(4, '0')})\n\n`
  const body = entries.map((e, i) => renderEntry(e, startId + i)).join('\n')
  const block = `\n${header}${body}\n`

  // insert before the Auto-fix ledger section
  const ledgerIdx = md.indexOf('## Auto-fix ledger')
  if (ledgerIdx === -1) md += block
  else md = md.slice(0, ledgerIdx) + block + '\n' + md.slice(ledgerIdx)
  atomicWrite(BRAIN, md)
  return lastId
}

function updateMeter(faqCount, batches, cycles) {
  let md = fs.readFileSync(BRAIN, 'utf8')
  const pct = ((faqCount / TARGET) * 100).toFixed(1)
  const line = `**FAQs: ${faqCount} / ${TARGET} (${pct}%)** · Batches: ${batches} · Cycles run: ${cycles} · Last updated: ${stamp().slice(0, 10)} · Daemon: running`
  md = md.replace(
    /<!-- SWT-FAQ-METER:START -->[\s\S]*?<!-- SWT-FAQ-METER:END -->/,
    `<!-- SWT-FAQ-METER:START -->\n${line}\n<!-- SWT-FAQ-METER:END -->`,
  )
  atomicWrite(BRAIN, md)
}

function appendLedger(cycle, added, slices, note) {
  let md = fs.readFileSync(BRAIN, 'utf8')
  const row = `| ${cycle} | ${stamp().slice(0, 10)} | ${added} | ${slices.join(', ')}${note ? ' — ' + note : ''} |\n`
  // append a row to the markdown table at EOF
  md = md.replace(/(\n\| \d+ \|[^\n]*\n)(?![\s\S]*\n\| \d+ \|)/, `$1${row}`)
  if (!md.includes(row)) md += row
  atomicWrite(BRAIN, md)
}

function gitCommit(msg, files) {
  const add = spawnSync('git', ['add', '--', ...files], { cwd: ROOT, encoding: 'utf8' })
  if (add.status !== 0) { logLine(`git add warn: ${add.stderr}`); }
  // PATH-RESTRICTED commit (`-- ...files`) so an unattended 15h loop can NEVER sweep Yash's WIP into
  // a training commit, even if something else is staged in the index.
  const ci = spawnSync(
    'git',
    ['commit', '-m', msg, '--no-verify', '--', ...files],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (ci.status !== 0 && !(ci.stdout || '').includes('nothing to commit'))
    logLine(`git commit warn: ${(ci.stdout || '') + (ci.stderr || '')}`)
}

// ---- store scan (best-effort, READ-ONLY: queue findings, never push live) ----
function storeScan(cycle) {
  if (!STORE_SCAN || !fs.existsSync(STORE)) return
  const gate = path.join(ROOT, 'theme-toolkit/scripts/check-honesty.mjs')
  if (!fs.existsSync(gate)) return
  let out = ''
  try {
    const r = spawnSync(process.execPath, [gate, STORE], {
      encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024, cwd: ROOT,
    })
    out = `exit ${r.status}\n${(r.stdout || '').slice(-1500)}${(r.stderr || '').slice(-400)}`
  } catch (e) {
    out = `scan error: ${e.message}`
  }
  const block = `\n### Cycle ${cycle} · ${stamp()} · honesty gate scan of gpt-test-1\n\`\`\`\n${out.trim()}\n\`\`\`\n> Safe-class fixes (alt text, reduced-motion guards, empty-state guards, metafield empty-guards) are auto-applicable via the toolkit autofix; anything ambiguous waits for Yash. NEVER pushed live.\n`
  fs.appendFileSync(QUEUE_F, block)
}

// ---- one cycle ----
function runCycle(state) {
  if (fs.existsSync(STOP_F)) { logLine('STOP file present — exiting.'); process.exit(0) }
  if (state.cyclesRun >= MAX_CYCLES) { logLine(`reached MAX_CYCLES=${MAX_CYCLES} — done.`); fs.writeFileSync(STOP_F, 'auto: complete (max cycles)\n'); finish(state); process.exit(0) }

  const cycle = state.cyclesRun + 1
  let slices
  if (GAP_MODE) {
    const gapPlan = buildGapPlan()
    if (gapPlan.length === 0) {
      logLine('gap plan empty — every slice at/above the 7-FAQ quota. Done.')
      fs.writeFileSync(STOP_F, 'auto: complete (gap plan exhausted)\n')
      finish(state); process.exit(0)
    }
    slices = gapPlan.slice(0, SLICES_PER_CYCLE)
  } else {
    const plan = buildSlicePlan()
    if (state.slicePointer >= plan.length) {
      logLine('slice plan exhausted — full possibility space covered. Done.')
      fs.writeFileSync(STOP_F, 'auto: complete (full 5040-slice coverage)\n') // signal watchdog/reindex to stop too
      finish(state); process.exit(0)
    }
    slices = plan.slice(state.slicePointer, state.slicePointer + SLICES_PER_CYCLE)
  }
  const count = Math.min(slices.length * FAQS_PER_SLICE, 50)
  const startId = maxBrainFaqId() + 1 // live scan, not state.faqCount — see maxBrainFaqId() comment

  logLine(`cycle ${cycle}: slices [${slices.join(', ')}] → generating ${count} FAQs (FAQ-${String(startId).padStart(4, '0')}…)`)

  let entries
  try {
    const raw = callClaude(genPrompt(slices, count, startId))
    entries = extractJsonArray(raw).filter(validEntry).slice(0, count)
  } catch (e) {
    // SWT_MAX_FAILURES (default 5) — for a long unattended run, set it high so a transient blip
    // (rate-limit window, model overload) doesn't kill hours of progress. The wall-clock STOP governs the end.
    const MAX_FAILURES = Number(process.env.SWT_MAX_FAILURES || 5)
    state.consecutiveFailures = (state.consecutiveFailures || 0) + 1
    logLine(`cycle ${cycle} generation FAILED (${e.message}) — failure ${state.consecutiveFailures}/${MAX_FAILURES}; pointer not advanced.`)
    saveState(state)
    if (state.consecutiveFailures >= MAX_FAILURES) { logLine(`${MAX_FAILURES} consecutive failures — writing STOP.`); fs.writeFileSync(STOP_F, `auto: ${MAX_FAILURES} failures\n`); process.exit(1) }
    return
  }
  if (entries.length === 0) {
    logLine(`cycle ${cycle}: zero valid entries — skipping, pointer not advanced.`)
    return
  }

  // VERIFY before these rules train the agents — drop wrong/contradictory/fabricated
  const before = entries.length
  entries = verifyBatch(entries, cycle)
  logLine(`cycle ${cycle} verify: kept ${entries.length}/${before} (dropped ${before - entries.length})`)

  // brand-normalize: rewrite any legacy gate names claude leaked into the new branded names
  entries = entries.map((e) => ({ ...e, solution: brandGates(e.solution), autofix: brandGates(e.autofix || '') }))

  const lastId = appendBatch(entries, state.batches + 1, startId)
  state.faqCount = lastId
  state.batches += 1
  state.cyclesRun = cycle
  if (!GAP_MODE) state.slicePointer += slices.length // gap mode recomputes its plan fresh each cycle
  state.consecutiveFailures = 0
  state.log.push({ cycle, ts: stamp(), added: entries.length, faqTotal: state.faqCount, slices })
  updateMeter(state.faqCount, state.batches, state.cyclesRun)
  appendLedger(cycle, entries.length, slices, 'auto')
  saveState(state)

  // IMPLEMENT: distribute every learning into the owning agents' .md + the team-wide
  // digest + the gate-gap queue. This is the "train the team" step — not just a doc.
  let dist = null
  try { dist = distribute() } catch (e) { logLine(`distribute warn: ${e.message}`) }
  if (dist) logLine(`cycle ${cycle} distributed → ${dist.rules} rules · ${dist.agentsUpdated}/14 agents trained · ${dist.gateGaps} gate-gaps`)
  // observability: a frozen vector index (Ollama down) must NOT hide behind a "✓ trained" line.
  if (dist && dist.reindex) logLine(`cycle ${cycle} reindex: ${dist.reindex.ok === null ? 'skipped (batched separately)' : dist.reindex.ok ? 'OK · ' + dist.reindex.out : 'FAILED (search stale!) — ' + dist.reindex.out}`)

  storeScan(cycle)

  // BRAIN, DIGEST + agent .md live in ~/.claude (not a repo) — persisted on disk.
  // The Polyglot repo commits only its own state/queue/log/gate-gaps.
  gitCommit(
    `train(swt): cycle ${cycle} — +${entries.length} FAQs → ${dist ? dist.rules + ' rules in ' + dist.agentsUpdated + '/14 agents' : 'distributed'} (${state.faqCount}/${TARGET})`,
    [
      path.relative(ROOT, STATE_F),
      path.relative(ROOT, QUEUE_F),
      path.relative(ROOT, LOG_F),
      path.relative(ROOT, path.join(STATE_DIR, 'gate-gaps.md')),
    ],
  )
  logLine(`cycle ${cycle} ✓ +${entries.length} FAQs → ${state.faqCount}/${TARGET} (${((state.faqCount / TARGET) * 100).toFixed(1)}%)${dist ? ` · ${dist.agentsUpdated}/14 agents trained` : ''} · committed`)
}

function finish(state) {
  try {
    let md = fs.readFileSync(BRAIN, 'utf8')
    md = md.replace(/· Daemon: running/g, '· Daemon: finished')
    atomicWrite(BRAIN, md)
    saveState(state)
  } catch {}
}

function loop() {
  const state = loadState()
  saveState(state)
  logLine(`SWT training daemon START — interval ${INTERVAL_MS / 60000}min · max ${MAX_CYCLES} cycles · ${SLICES_PER_CYCLE} slices/cycle · model ${MODEL || 'inherit'} · at ${state.faqCount}/${TARGET}`)
  const tick = () => {
    try { runCycle(state) } catch (e) { logLine(`cycle crash: ${e.stack || e.message}`) }
    if (!fs.existsSync(STOP_F) && state.cyclesRun < MAX_CYCLES) setTimeout(tick, INTERVAL_MS)
    else { finish(state); logLine('loop ended.'); }
  }
  tick() // first cycle immediately
}

const cmd = process.argv[2] || 'start'
if (cmd === 'status') {
  const s = loadState()
  console.log(JSON.stringify({
    faqCount: s.faqCount, target: TARGET, pct: ((s.faqCount / TARGET) * 100).toFixed(1) + '%',
    cyclesRun: s.cyclesRun, maxCycles: MAX_CYCLES, batches: s.batches,
    slicePointer: s.slicePointer, slicesTotal: CONCERNS.length * SURFACES.length,
    consecutiveFailures: s.consecutiveFailures || 0, startedAt: s.startedAt,
    lastLog: s.log.slice(-3),
  }, null, 2))
} else if (cmd === 'once') {
  const state = loadState(); saveState(state); runCycle(state)
} else {
  loop()
}
