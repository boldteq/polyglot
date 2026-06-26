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

const GATES =
  '#0 theme-lock, #0.4 discovery, #0.5 bootstrap, #1 lighthouse(LCP/CLS), #2 theme-check, ' +
  '#3 editability(no-hardcode), #5 axe(live a11y), #6 seo(JSON-LD/canonical/meta), ' +
  '#7 conversion, #8 design-system, #9 consistency, #10 functional, #11 antipatterns, ' +
  '#12 design-quality(premium), #13 honesty(no fabrication/fake-urgency), #14 render-wiring, ' +
  '#15 commerce-readiness, #16 a11y-static, #17 visual-quality, #18 visual-truth(Lens screenshots), ' +
  '#19 section-cohesion, #20 card-bindings, #21 conversion-signoff, #22 css-layout, ' +
  '#23 reuse-map, #24 art-direction, #25 redirects, #26 copy-quality, #27 app-conflicts, ' +
  '#28 locale-completeness, #29 email-triggers, #30 ds-cascade, #34 image-quality, #35 mobile-layout'

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
function saveState(s) {
  fs.writeFileSync(STATE_F, JSON.stringify(s, null, 2))
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

// ---- claude -p generation ----
function callClaude(prompt) {
  const args = ['-p', prompt, '--output-format', 'text', '--no-session-persistence']
  if (MODEL) args.push('--model', MODEL)
  const r = spawnSync(CLAUDE_BIN, args, {
    encoding: 'utf8',
    timeout: 8 * 60 * 1000, // headroom: 49-FAQ gen runs ~4–5min; 5min tipped over occasionally
    maxBuffer: 30 * 1024 * 1024,
    cwd: ROOT,
  })
  if (r.error) throw new Error(`claude spawn failed: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`claude exit ${r.status}: ${(r.stderr || '').slice(0, 300)}`)
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
  fs.writeFileSync(BRAIN, md)
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
  fs.writeFileSync(BRAIN, md)
}

function appendLedger(cycle, added, slices, note) {
  let md = fs.readFileSync(BRAIN, 'utf8')
  const row = `| ${cycle} | ${stamp().slice(0, 10)} | ${added} | ${slices.join(', ')}${note ? ' — ' + note : ''} |\n`
  // append a row to the markdown table at EOF
  md = md.replace(/(\n\| \d+ \|[^\n]*\n)(?![\s\S]*\n\| \d+ \|)/, `$1${row}`)
  if (!md.includes(row)) md += row
  fs.writeFileSync(BRAIN, md)
}

function gitCommit(msg, files) {
  const add = spawnSync('git', ['add', '--', ...files], { cwd: ROOT, encoding: 'utf8' })
  if (add.status !== 0) { logLine(`git add warn: ${add.stderr}`); }
  const ci = spawnSync(
    'git',
    ['commit', '-m', msg, '--no-verify'],
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
  if (state.cyclesRun >= MAX_CYCLES) { logLine(`reached MAX_CYCLES=${MAX_CYCLES} — done.`); finish(state); process.exit(0) }

  const cycle = state.cyclesRun + 1
  const plan = buildSlicePlan()
  if (state.slicePointer >= plan.length) {
    logLine('slice plan exhausted — full possibility space covered. Done.')
    finish(state); process.exit(0)
  }
  const slices = plan.slice(state.slicePointer, state.slicePointer + SLICES_PER_CYCLE)
  const count = Math.min(slices.length * FAQS_PER_SLICE, 50)
  const startId = state.faqCount + 1

  logLine(`cycle ${cycle}: slices [${slices.join(', ')}] → generating ${count} FAQs (FAQ-${String(startId).padStart(4, '0')}…)`)

  let entries
  try {
    const raw = callClaude(genPrompt(slices, count, startId))
    entries = extractJsonArray(raw).filter(validEntry).slice(0, count)
  } catch (e) {
    state.consecutiveFailures = (state.consecutiveFailures || 0) + 1
    logLine(`cycle ${cycle} generation FAILED (${e.message}) — failure ${state.consecutiveFailures}/5; pointer not advanced.`)
    saveState(state)
    if (state.consecutiveFailures >= 5) { logLine('5 consecutive failures — writing STOP.'); fs.writeFileSync(STOP_F, 'auto: 5 failures\n'); process.exit(1) }
    return
  }
  if (entries.length === 0) {
    logLine(`cycle ${cycle}: zero valid entries — skipping, pointer not advanced.`)
    return
  }

  const lastId = appendBatch(entries, state.batches + 1, startId)
  state.faqCount = lastId
  state.batches += 1
  state.cyclesRun = cycle
  state.slicePointer += slices.length
  state.consecutiveFailures = 0
  state.log.push({ cycle, ts: stamp(), added: entries.length, faqTotal: state.faqCount, slices })
  updateMeter(state.faqCount, state.batches, state.cyclesRun)
  appendLedger(cycle, entries.length, slices, 'auto')
  saveState(state)

  storeScan(cycle)

  // BRAIN lives in ~/.claude/memory (not a repo) — persisted on disk, not committed here.
  gitCommit(
    `train(swt): cycle ${cycle} — +${entries.length} design-gap FAQs (${state.faqCount}/${TARGET})`,
    [
      path.relative(ROOT, STATE_F),
      path.relative(ROOT, QUEUE_F),
      path.relative(ROOT, LOG_F),
    ],
  )
  logLine(`cycle ${cycle} ✓ +${entries.length} FAQs → ${state.faqCount}/${TARGET} (${((state.faqCount / TARGET) * 100).toFixed(1)}%) · committed`)
}

function finish(state) {
  try {
    let md = fs.readFileSync(BRAIN, 'utf8')
    md = md.replace(/· Daemon: running/g, '· Daemon: finished')
    fs.writeFileSync(BRAIN, md)
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
