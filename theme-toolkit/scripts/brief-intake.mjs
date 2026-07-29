#!/usr/bin/env node
// Upfront project-brief intake (A1/A3/A4) — the CANONICAL brief every SWT agent reads FIRST.
//
// The whole team was building niche-blind because there was no single, upfront, structured brief:
// the niche/brand/goal lived in a chat message (or nowhere), so drape guessed the look, the Lens judge
// defaulted to "general ecommerce", and the output came out generic/AI-shaped. This is the fix on the
// INPUT side — a `docs/brief.md` gathered ONCE at build start via VS Code popups (AskUserQuestion) with
// recommended defaults, then read by every downstream agent + resolved by the niche-wiring (A2) so the
// niche actually flows to the pixels.
//
// This is NOT a gate-manifest gate (kept deliberately simple). It is a helper the /shopify-build loop
// runs at STEP 0.5:
//   node brief-intake.mjs --check       exit 0 if docs/brief.md is complete, else 1 + the missing fields
//   node brief-intake.mjs --questions   print the canonical popup question set (JSON) to fire via AskUserQuestion
//   node brief-intake.mjs --scaffold    write a docs/brief.md template (only if absent) to fill from answers
//
// Env: BRIEF_FILE (docs/brief.md) · BRIEF_DIR (docs)
// Exit: 0 = complete / action done · 1 = incomplete (missing required fields) · 2 = usage/env error

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'

const cwd = process.cwd()
const BRIEF_DIR = process.env.BRIEF_DIR || 'docs'
const BRIEF_FILE = process.env.BRIEF_FILE || path.join(BRIEF_DIR, 'brief.md')

// ── the canonical upfront question set (recommended defaults FIRST so Yash can one-click) ─────────────
// Each entry maps 1:1 to a docs/brief.md field. `field` scalar → a `key: value` line; `list:true` → a
// `## <field>` bullet block. The agent fires these via AskUserQuestion, pre-selecting `recommended`.
export const QUESTIONS = [
  {
    field: 'niche', header: 'Niche', required: true,
    question: 'What niche / vertical is this store? (drives the DNA taste pack, the CRO benchmark, and the Lens judge)',
    recommended: 'infer from the products/brief',
    options: ['supplements', 'beauty', 'apparel', 'jewelry', 'home-decor', 'cpg-food', 'pet', 'electronics'],
  },
  {
    field: 'brand_direction', header: 'Brand feel', required: true,
    question: 'Brand personality / visual direction? (calibrated to out-premium the niche leaders — not one fixed look)',
    recommended: 'premium-minimal',
    options: ['premium-minimal', 'bold-playful', 'editorial-luxe', 'clean-clinical', 'warm-artisanal'],
  },
  {
    field: 'primary_goal', header: 'Primary goal', required: true,
    question: 'Primary conversion goal for the build?',
    recommended: 'maximize-aov',
    options: ['maximize-aov (bundles + subscribe + upsell)', 'maximize-cvr (frictionless PDP→checkout)', 'build-trust (proof-led, new brand)', 'launch-fast (MVP storefront)'],
  },
  {
    field: 'content_source', header: 'Content', required: true,
    question: 'Real client assets, or demo/seed content? (governs the honesty + real-asset gates)',
    recommended: 'real-assets',
    options: ['real-assets (client photos/copy/reviews)', 'demo-seed (placeholder, clearly marked)', 'mixed'],
  },
  {
    field: 'references', header: 'References', required: false, list: true,
    question: 'Reference stores / inspiration? (persisted so gate #46 can diff the built result against them)',
    recommended: "the niche's benchmark leaders",
    options: [],
  },
  {
    field: 'must_have_pages', header: 'Must-haves', required: false, list: true, multi: true,
    question: 'Which pages / sections are must-haves for v1?',
    recommended: 'home, product, collection, cart',
    options: ['home', 'product (PDP)', 'collection (PLP)', 'cart', 'about', 'contact', 'faq', 'blog'],
  },
  {
    field: 'constraints', header: 'Constraints', required: false, list: true,
    question: 'Any hard constraints? (theme base, locked brand colors, deadline, integrations)',
    recommended: 'none',
    options: [],
  },
]

const REQUIRED = QUESTIONS.filter(q => q.required).map(q => q.field)
const SCALAR = QUESTIONS.filter(q => !q.list).map(q => q.field)
const TBD_RE = /^\s*(tbd|todo|tbc|\?+|fill in|<[^>]*>)\s*$/i

// Parse docs/brief.md → { field: value|[values] }. Scalars = `field: value` lines; lists = `## field`
// heading followed by `- item` bullets. Tolerant of ordering + extra prose.
export function parseBrief(text) {
  const out = {}
  const lines = String(text || '').split('\n')
  // scalar `key: value` lines
  for (const line of lines) {
    const m = line.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i)
    if (m && SCALAR.includes(m[1].toLowerCase())) out[m[1].toLowerCase()] = m[2].trim()
  }
  // `## field` bullet blocks
  let cur = null
  for (const line of lines) {
    const h = line.match(/^\s*#{1,6}\s+([a-z_]+)\s*$/i)
    if (h) { const f = h[1].toLowerCase(); cur = QUESTIONS.find(q => q.list && q.field === f) ? f : null; if (cur) out[cur] = out[cur] || []; continue }
    if (cur) {
      const b = line.match(/^\s*[-*]\s+(.+?)\s*$/)
      if (b) out[cur].push(b[1].trim())
      else if (line.trim() && !line.startsWith('#')) { /* stray prose under a list heading — ignore */ }
    }
  }
  return out
}

// Which REQUIRED fields are missing or empty/TBD. Pure — drives --check and the fixture.
export function missingFields(parsed) {
  const miss = []
  for (const f of REQUIRED) {
    const v = parsed[f]
    if (v == null || (typeof v === 'string' && (v === '' || TBD_RE.test(v)))) miss.push(f)
  }
  return miss
}

// Render a docs/brief.md from an answers object ({field: value|[values]}). Used by --scaffold and the agent.
export function renderBrief(answers = {}, client = '') {
  const L = [`# Project Brief — ${client || answers.client || 'this store'}`, '',
    '> The canonical upfront brief. Gathered ONCE at build start (AskUserQuestion popups, recommended defaults).',
    '> Every SWT agent reads this FIRST; the niche below flows to the DNA pack, the CRO benchmark, and the Lens judge.', '']
  for (const q of QUESTIONS.filter(x => !x.list)) L.push(`${q.field}: ${answers[q.field] ?? (q.required ? '' : q.recommended)}`)
  L.push('')
  for (const q of QUESTIONS.filter(x => x.list)) {
    L.push(`## ${q.field}`)
    const vals = Array.isArray(answers[q.field]) ? answers[q.field] : (answers[q.field] ? [answers[q.field]] : [])
    if (vals.length) for (const v of vals) L.push(`- ${v}`)
    else L.push(`- ${q.recommended}`)
    L.push('')
  }
  return L.join('\n')
}

function main() {
  const arg = process.argv[2] || '--check'
  const abs = path.resolve(cwd, BRIEF_FILE)

  if (arg === '--questions') {
    process.stdout.write(JSON.stringify(QUESTIONS, null, 2) + '\n')
    process.exit(0)
  }

  if (arg === '--scaffold') {
    if (fs.existsSync(abs)) { console.log(`brief-intake: ${BRIEF_FILE} already exists — not overwriting`); process.exit(0) }
    fs.mkdirSync(path.resolve(cwd, BRIEF_DIR), { recursive: true })
    fs.writeFileSync(abs, renderBrief({}, path.basename(cwd)))
    console.log(`brief-intake: scaffolded ${BRIEF_FILE} — fill the required fields (${REQUIRED.join(', ')}) from the popup answers`)
    process.exit(0)
  }

  if (arg === '--check' || arg === undefined) {
    if (!fs.existsSync(abs)) {
      console.log(`brief-intake: BLOCK — no ${BRIEF_FILE}. Run the upfront intake first: fire the AskUserQuestion popups (\`brief-intake.mjs --questions\`), write the answers, then re-check. Required: ${REQUIRED.join(', ')}.`)
      process.exit(1)
    }
    const parsed = parseBrief(fs.readFileSync(abs, 'utf-8'))
    const miss = missingFields(parsed)
    if (miss.length) {
      console.log(`brief-intake: BLOCK — ${BRIEF_FILE} is missing required field(s): ${miss.join(', ')}. Ask these upfront (recommended defaults in \`--questions\`) and fill them.`)
      process.exit(1)
    }
    console.log(`brief-intake: OK — ${BRIEF_FILE} complete (niche="${parsed.niche}", brand="${parsed.brand_direction}", goal="${parsed.primary_goal}", content="${parsed.content_source}")`)
    process.exit(0)
  }

  console.error(`brief-intake: usage — --check | --questions | --scaffold`)
  process.exit(2)
}

if (isMain(import.meta.url)) main()
