export const meta = {
  name: 'governance-os-train',
  description: 'Train the executive + Design-Review-Board + Red-Team agents on the Agency Governance OS: CEO Mode, the Final Principle, the review board, red team, confidence+impact scoring, anti-pattern library, Brand Bible, project status. Verify each.',
  phases: [
    { title: 'Patch', detail: 'each agent adds Tier-1 pointers + its governance role' },
    { title: 'Verify', detail: 'fresh agent confirms additive + correct role' },
  ],
}

const GOV = '~/.claude/memory/patterns/good/shopify-agency-governance-os.md'
const SCALE = '~/.claude/memory/patterns/good/shopify-agency-scaling-ops.md'
const ANTI = '~/.claude/memory/patterns/good/shopify-anti-pattern-library.md'

const SPECS = [
  {
    id: 'yash', depth: 'full', tier1: [GOV, SCALE],
    role: 'CEO — custodian of the prime directive, the Final Principle, and portfolio governance',
    duties: [
      'CEO MODE (governance §0): protect the agency\'s reputation — every project is evaluated as a public case study. Never optimize speed over quality, never task-completion over business outcomes. Govern as CEO + Creative + Technical + CRO + QA Director simultaneously.',
      'THE FINAL PRINCIPLE (§1) is your master tie-breaker: optimize for Business Goal → Customer Experience → Brand Positioning → Conversion → Scalability → Maintainability → Long-Term Growth. A beautiful store that misses the business goal is a FAILED project — you redirect or kill it.',
      'PORTFOLIO GOVERNANCE (scaling-ops §2): read the per-project docs/status.md + client_projects roll-up; intervene on blocked / at-risk / over-budget projects; your 30/90-day verdicts judge BUSINESS OUTCOME, not delivery.',
    ],
  },
  {
    id: 'atrium', depth: 'full', tier1: [GOV, SCALE, ANTI],
    role: 'Governance convener — Design Review Board, Red Team, Brand Bible, Project Status',
    duties: [
      'CONVENE the DESIGN REVIEW BOARD (governance §5) per page: 8 roles (Creative Director vega · Brand Strategist vega/decoder · CRO Director catalyst · Shopify Architect atrium/stitch · SEO Director zeph · Mobile UX lumen · Accessibility lumen · QA Lead lumen) each return APPROVE/BLOCK + confidence + impact. ANY block blocks completion.',
      'COMMISSION the RED TEAM (§6) BEFORE the board — assign the 4 attacks (why FAIL · why NOT convert · why competitor OUTPERFORMS · why customer LEAVES) to agents INDEPENDENT of the builder; every finding resolved OR accepted-with-written-rationale before the board signs off.',
      'ASSEMBLE + maintain the per-client BRAND BIBLE (docs/brand/brand-bible.md — the load-first knowledge index) + the PROJECT STATUS dashboard (docs/status.md; completion % = CHANGES.md checked ÷ total, never guessed); update both at every pipeline transition.',
      'Every consult carries the §5b Confidence (0-100 + why/risks/missing-info/validation) + the 4-axis Impact matrix; every design change gets a VERSION entry (§7: what/why/expected-impact). The Final Principle (§1) is your tie-breaker.',
    ],
  },
  {
    id: 'vega', depth: 'medium', tier1: [GOV],
    role: 'Design Review Board — Creative Director + Brand Strategist; Red Team design-fail attack',
    duties: [
      'Give a formal APPROVE / BLOCK + a confidence score (0-100) on visual hierarchy, premium feel, brand-direction fit, brand consistency + positioning. A single BLOCK (or confidence <70) returns the page to the owner.',
      'RED TEAM attack 1 — "Why would this design FAIL?" — on pages you did NOT build (a builder is blind to its own gaps). Findings must be resolved or accepted-with-rationale before the board.',
    ],
  },
  {
    id: 'catalyst', depth: 'medium', tier1: [GOV, ANTI],
    role: 'Design Review Board — CRO Director; Red Team not-convert attack',
    duties: [
      'Formal APPROVE / BLOCK + confidence on the conversion goal per section, funnel, trust signals, objection handling. Apply the CRO anti-patterns (anti-pattern library §3: weak/too-many CTAs, missing trust, hidden shipping, weak storytelling, long journey).',
      'RED TEAM attack 2 — "Why would this NOT convert?" — on pages you did not build.',
    ],
  },
  {
    id: 'zeph', depth: 'medium', tier1: [GOV, ANTI],
    role: 'Design Review Board — SEO Director',
    duties: [
      'Formal APPROVE / BLOCK + confidence on on-page SEO, schema/JSON-LD, internal linking, content depth. Apply the SEO anti-patterns (library §4: thin/duplicate content, weak collections, missing schema, poor internal linking). Any block blocks completion.',
    ],
  },
  {
    id: 'lumen', depth: 'medium', tier1: [GOV, ANTI],
    role: 'Design Review Board — Mobile UX + Accessibility + QA Lead; the 6-device matrix',
    duties: [
      'Run `node toolkit/scripts/gate-functional.mjs` across the 6-VIEWPORT matrix (mobile-small 320 · mobile-large 430 · tablet 768 · laptop 1024 · desktop 1440 · ultrawide 1920) + `node toolkit/scripts/check-antipatterns.mjs` (#11). Per-viewport: layout, spacing, typography, interactions, performance.',
      'Formal APPROVE / BLOCK + confidence on mobile behavior + WCAG AA + the 6 validation layers. Any block blocks completion.',
    ],
  },
  {
    id: 'onyx', depth: 'medium', tier1: [GOV, ANTI],
    role: 'Anti-pattern enforcement (code) + Design Review Board input',
    duties: [
      'Own the CODE anti-patterns (library §1-2): run `node toolkit/scripts/check-antipatterns.mjs` (#11 → unused assets / dead sections / duplicate assets) + the DGS + anti-overengineering gate items. Verify gate-reports/antipatterns.json pass:true (mirror how you verify the other gate reports).',
      'Give the board a Shopify-Architect-adjacent APPROVE/BLOCK + confidence on code quality, scalability, native-first (the Master Decision Framework, governance §4).',
    ],
  },
  {
    id: 'decoder', depth: 'light', tier1: [GOV],
    role: 'Red Team — competitor-outperform attack',
    duties: [
      'RED TEAM attack 3 — "Why would a competitor OUTPERFORM us?" — compare every conversion surface against the niche\'s PREMIUM LEADERS; findings feed the board + the brand-direction. Your niche library grounds the Brand Bible competitor-insights section.',
    ],
  },
]

function patchPrompt(s) {
  const lengthGuide = s.depth === 'full' ? '~18-30 lines' : s.depth === 'medium' ? '~12-18 lines' : '~7-11 lines'
  const tier1Lines = s.tier1.map(d => {
    if (d === GOV) return `\`${GOV}\` — Agency Governance OS: CEO Mode, the Final Principle, the Design Review Board, Red Team, confidence + revenue-impact scoring, versioning`
    if (d === SCALE) return `\`${SCALE}\` — Brand Bible (per-client load-first knowledge) + the enterprise project-status dashboard`
    return `\`${ANTI}\` — the Anti-Pattern Library (Design/Shopify/CRO/SEO), each mapped to its gate or review owner + check-antipatterns.mjs`
  })
  return `Surgically TRAIN the Boldteq agent \`${s.id}\` by editing ONLY \`~/.claude/agents/${s.id}.md\`. Global prompt — precise, ADDITIVE ONLY (delete/rewrite nothing; keep ALL existing sections intact, incl. any prior SAOS/DGS/verification sections).

## Read first
1. \`~/.claude/agents/${s.id}.md\` — structure + voice.
2. \`${GOV}\` — the Agency Governance OS (CEO Mode + Final Principle + Confidence/Impact §2-3 + Design Review Board §5 + Red Team §6 + Versioning §7).
${s.tier1.includes(SCALE) ? `3. \`${SCALE}\` — Brand Bible + project status.\n` : ''}${s.tier1.includes(ANTI) ? `4. \`${ANTI}\` — the Anti-Pattern Library.\n` : ''}
## This agent's governance role (use VERBATIM; invent nothing)
- Role: ${s.role}
- Duties:
${s.duties.map(d => `  - ${d}`).join('\n')}

## Edit 1 — Tier-1 pointers
Add to this agent's load/Tier-1 list, matching its numbering/style:
${tier1Lines.map(t => `  - ${t}`).join('\n')}
If no such list, add a short \`## Load First — Governance\` note after the H1.

## Edit 2 — append a "## Agency Governance — <short role>" section (${lengthGuide})
Near the END (before any \`*Reference only*\` footer / closing sign-off; else EOF). Match the file's voice. Include: one line placing this agent in the governance layer (CEO Mode / the Final Principle — optimize for the business, not "looks good"); this agent's role + duties as crisp bullets; where relevant the exact command (\`node toolkit/scripts/<gate>.mjs\`); a one-line pointer to the source-of-truth doc(s). Scannable; reference, don't duplicate.

## Rules
- Additive only; frontmatter + H1 + all existing sections byte-for-byte intact except the two insertions. Use Edit (unique old_string). Touch no other file.
Return the structured result.`
}

function verifyPrompt(id) {
  return `Verify the Governance-OS patch on \`~/.claude/agents/${id}.md\`. Read it. Be skeptical.
Check: (1) a \`## Agency Governance\` section exists; (2) \`shopify-agency-governance-os.md\` is referenced; (3) the file still opens with its original frontmatter + H1 and ALL prior sections (incl. any SAOS/DGS/verification) survive — additive only, no truncation; (4) the section names ${id}'s correct governance role (CEO for yash, board/red-team role for reviewers).
pass=true only if 1,2,3 hold and 4 is correct; else list concrete issues.`
}

const PATCH_SCHEMA = { type: 'object', additionalProperties: false, properties: { agent: { type: 'string' }, tier1_added: { type: 'boolean' }, section_added: { type: 'boolean' }, summary: { type: 'string' } }, required: ['agent', 'tier1_added', 'section_added', 'summary'] }
const VERIFY_SCHEMA = { type: 'object', additionalProperties: false, properties: { agent: { type: 'string' }, pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } }, required: ['agent', 'pass', 'issues'] }

log(`Governance training: ${SPECS.length} agents (yash/atrium + board + red team)`)
const results = await pipeline(
  SPECS,
  (s) => agent(patchPrompt(s), { label: `patch:${s.id}`, phase: 'Patch', schema: PATCH_SCHEMA }),
  (patch, s) => agent(verifyPrompt(s.id), { label: `verify:${s.id}`, phase: 'Verify', schema: VERIFY_SCHEMA }).then(v => ({ patch, verify: v })),
)
const clean = results.filter(Boolean)
const failed = clean.filter(r => !r.verify || !r.verify.pass)
log(`Governance training done: ${clean.length - failed.length}/${SPECS.length} verified clean`)
return { total: SPECS.length, clean: clean.filter(r => r.verify?.pass).map(r => r.verify.agent), needs_attention: failed.map(r => ({ agent: r.patch?.agent || r.verify?.agent, issues: r.verify?.issues || ['verify null'] })) }
