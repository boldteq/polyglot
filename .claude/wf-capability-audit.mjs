export const meta = {
  name: 'shopify-agency-capability-audit',
  description: 'Brutally honest expert-panel audit of the Shopify Agency OS — capability %, maturity, equivalent-years, gaps, failure modes, readiness, scaling. Grounded in the real agent files + gates + docs; designed-vs-proven calibrated.',
  phases: [
    { title: 'Departments', detail: '14 department auditors score the matrix on real artifacts' },
    { title: 'Cross-cutting', detail: 'failure modes · missing capabilities · readiness/scaling/brutal-reality' },
  ],
}

const A = '~/.claude/agents'
const M = '~/.claude/memory/patterns/good'
const T = 'theme-toolkit/scripts'

const MANDATE = `BRUTAL-HONESTY MANDATE — you are an independent, skeptical, world-class expert auditor. Do NOT be optimistic; do NOT protect assumptions; default to critical.

CRITICAL CALIBRATION (apply to every score):
- Separate DESIGNED capability (a prompt/doc/gate EXISTS) from PROVEN capability (validated on real client store builds). This system has shipped ZERO real client stores end-to-end through the pipeline — so PROVEN execution is near-zero; almost everything is designed/trained, not validated on output.
- Weight PROVEN heavily. An excellent-doc department with no shipped real output must NOT score above ~70% capability. Pristine process ≠ pristine output.
- The agents are LLM prompts. They follow process, apply patterns, and run executable gates well — but have REAL ceilings on taste, original creative direction, brand strategy, novel CRO insight, and senior judgment on ambiguous trade-offs. Penalize these hard; AI design output trends generic.
- The encoded KNOWLEDGE (the docs/playbooks) is often genuinely senior-level (15-25yr). The JUDGMENT/EXECUTION is LLM-mid-level augmented by those playbooks. Reflect this split in equivalent_experience.
- capability_pct = REAL-WORLD deliverable capability vs a top human agency, NOT doc completeness.
- Read the REAL files listed. Cite specifics. Never invent a score.`

const DEPT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    department: { type: 'string' },
    capability_pct: { type: 'integer' },
    maturity: { type: 'string', enum: ['Beginner', 'Intermediate', 'Advanced', 'Agency', 'Enterprise', 'Industry-Leading'] },
    equivalent_experience: { type: 'string' },
    confidence_pct: { type: 'integer' },
    designed_vs_proven: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    missing_capabilities: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
  required: ['department', 'capability_pct', 'maturity', 'equivalent_experience', 'confidence_pct', 'designed_vs_proven', 'strengths', 'missing_capabilities', 'risks', 'recommendations'],
}

const DEPTS = [
  { d: 'Discovery & Client Intake', assess: 'requirement gathering, question quality, stakeholder alignment, scope clarity, risk identification', files: [`${A}/compass.md`, `${A}/atrium.md`, `${M}/shopify-technical-goals-discovery.md`, `${M}/website-content-discovery-protocol.md`] },
  { d: 'Brand Strategy', assess: 'brand positioning, personality, archetype, competitive differentiation, storytelling, visual direction', files: [`${A}/decoder.md`, `${A}/vega.md`, `${A}/nova.md`, `${M}/shopify-design-governance-system.md`, `${M}/shopify-agency-scaling-ops.md`] },
  { d: 'Research', assess: 'competitor analysis, market research, customer psychology, trend identification, opportunity discovery', files: [`${A}/nova.md`, `${A}/scout.md`, `${A}/atlas.md`, `${A}/decoder.md`, `${M}/ecom-research-to-build-pipeline.md`] },
  { d: 'UX', assess: 'user journeys, information architecture, navigation, user-flow optimization, mobile-first', files: [`${A}/elio.md`, `${A}/pixel.md`, `${M}/autonomous-design-spec-protocol.md`, `~/.claude/memory/stacks/shopify/themes/theme-page-recipes.md`] },
  { d: 'UI & Design System', assess: 'visual hierarchy, design systems, consistency enforcement, premium design quality, custom branded DTC experiences', files: [`${A}/vega.md`, `${A}/token.md`, `${A}/elio.md`, `${M}/shopify-design-governance-system.md`, `${M}/shopify-design-system-contract-schema.md`, `${T}/check-design-system.mjs`] },
  { d: 'CRO', assess: 'conversion strategy, trust building, offer positioning, AOV optimization, objection handling, landing-page optimization', files: [`${A}/catalyst.md`, `${A}/ecom-cro.md`, `${A}/spark.md`, `${M}/shopify-conversion-gate-checklist.md`, `${M}/ecom-niche-lift-benchmarks.md`] },
  { d: 'Shopify Architecture', assess: 'theme architecture, section architecture, scalability, maintainability, Shopify best practices', files: [`${A}/atrium.md`, `${A}/stitch.md`, `${M}/theme-base-selection-protocol.md`, `${M}/section-reuse-first-protocol.md`] },
  { d: 'Development', assess: 'Liquid expertise, CSS architecture, JS architecture, code quality, reusability, maintainability', files: [`${A}/loom.md`, `${A}/conduit.md`, `${A}/lattice.md`, `${M}/theme-anti-overengineering-rules.md`] },
  { d: 'Technical SEO', assess: 'on-page SEO, technical SEO, schema, site architecture, internal linking', files: [`${A}/zeph.md`, `${M}/shopify-onpage-seo-checklist.md`, `${T}/gate-seo.mjs`] },
  { d: 'Performance', assess: 'Core Web Vitals, theme optimization, app-impact management, front-end performance, asset optimization', files: [`${A}/lumen.md`, `${M}/theme-anti-overengineering-rules.md`, `${T}/gate-lighthouse.mjs`, `${T}/check-asset-budget.mjs`] },
  { d: 'QA', assess: 'testing processes, regression prevention, bug verification, mobile testing, cross-browser testing', files: [`${A}/lumen.md`, `${M}/storefront-theme-qa-protocol.md`, `${M}/shopify-verification-acceptance-protocol.md`, `${M}/theme-edge-state-standards.md`] },
  { d: 'Playwright & Automated Testing (CRITICAL)', assess: 'visual-testing reliability, screenshot limitations, functional coverage, edge-case coverage, regression detection, root-cause capability. SPECIFICALLY identify: why bugs survive despite passing tests; what manual reviews remain required; what additional validation layers should exist', files: [`${T}/gate-functional.mjs`, `${T}/gate-axe.mjs`, `${T}/lib/pages.mjs`, `${M}/shopify-verification-acceptance-protocol.md`] },
  { d: 'Project Management', assess: 'task orchestration, priority management, communication, handoff quality, scaling readiness', files: [`${A}/atrium.md`, `${M}/shopify-agency-scaling-ops.md`, `${M}/shopify-definition-of-done.md`, `${M}/changes-list-protocol.md`] },
  { d: 'Executive Leadership', assess: 'strategic decision-making, business thinking, risk management, agency-ownership mentality, long-term scalability', files: [`${A}/yash.md`, `${M}/shopify-agency-governance-os.md`] },
]

function deptPrompt(dept) {
  return `${MANDATE}

DEPARTMENT TO AUDIT: ${dept.d}
Assess specifically: ${dept.assess}

Read these REAL files first (ground every claim in them — quote specifics):
${dept.files.map(f => `- ${f}`).join('\n')}

Score the capability matrix honestly:
- capability_pct (0-100): real-world deliverable capability vs a top human Shopify/DTC agency (designed-vs-proven calibrated — proven is near-zero).
- maturity: Beginner / Intermediate / Advanced / Agency / Enterprise / Industry-Leading.
- equivalent_experience: e.g. "knowledge ~15yr, execution ~4yr" — split encoded-knowledge vs LLM-judgment if they differ.
- confidence_pct: your confidence in this score.
- designed_vs_proven: 1-2 sentences — what is genuinely designed/strong vs what is unproven/aspirational here.
- strengths / missing_capabilities / risks / recommendations: concrete, specific, ranked by importance.

Be brutal. If a department is strong on paper but unproven, say so and cap the score accordingly.`
}

phase('Departments')
const deptResults = await parallel(DEPTS.map(dept => () => agent(deptPrompt(dept), { label: `audit:${dept.d.slice(0, 20)}`, phase: 'Departments', schema: DEPT_SCHEMA })))

phase('Cross-cutting')
const FAILURE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { failure_modes: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, why: { type: 'string' }, detect: { type: 'string' }, prevent: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] } }, required: ['name', 'why', 'detect', 'prevent', 'severity'] } } },
  required: ['failure_modes'],
}
const MISSING_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { missing_capabilities: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { capability: { type: 'string' }, revenue_impact: { type: 'string', enum: ['H', 'M', 'L'] }, client_satisfaction_impact: { type: 'string', enum: ['H', 'M', 'L'] }, scalability_impact: { type: 'string', enum: ['H', 'M', 'L'] }, risk_level: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] } }, required: ['capability', 'revenue_impact', 'client_satisfaction_impact', 'scalability_impact', 'risk_level'] } } },
  required: ['missing_capabilities'],
}
const READINESS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    readiness: { type: 'object', additionalProperties: false, properties: { solo_client_pct: { type: 'integer' }, small_agency_pct: { type: 'integer' }, mid_size_pct: { type: 'integer' }, enterprise_pct: { type: 'integer' }, high_volume_pct: { type: 'integer' } }, required: ['solo_client_pct', 'small_agency_pct', 'mid_size_pct', 'enterprise_pct', 'high_volume_pct'] },
    scaling: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { level: { type: 'string' }, feasible: { type: 'boolean' }, bottlenecks: { type: 'array', items: { type: 'string' } }, required_improvements: { type: 'array', items: { type: 'string' } } }, required: ['level', 'feasible', 'bottlenecks', 'required_improvements'] } },
    brutal_reality: { type: 'object', additionalProperties: false, properties: { performs_at_25yr_level_where: { type: 'array', items: { type: 'string' } }, falls_short_where: { type: 'array', items: { type: 'string' } }, human_outperforms_where: { type: 'array', items: { type: 'string' } }, to_close_the_gap: { type: 'array', items: { type: 'string' } }, overall_verdict: { type: 'string' } }, required: ['performs_at_25yr_level_where', 'falls_short_where', 'human_outperforms_where', 'to_close_the_gap', 'overall_verdict'] },
  },
  required: ['readiness', 'scaling', 'brutal_reality'],
}

const docsForCross = `Read broadly across the system: ${A}/atrium.md, ${A}/yash.md, ${A}/lumen.md, ${A}/vega.md, ${M}/shopify-agency-operating-system.md, ${M}/shopify-design-governance-system.md, ${M}/shopify-verification-acceptance-protocol.md, ${M}/shopify-agency-governance-os.md, ${M}/shopify-agency-scaling-ops.md, ${M}/shopify-definition-of-done.md, and the gates in ${T}/.`

const [failure, missing, readiness] = await parallel([
  () => agent(`${MANDATE}\n\nProduce the TOP FAILURE MODES of this Shopify Agency OS (aim for 25-40, ranked by severity). For each: name · why it happens · how to detect it · how to prevent it · severity. Include the ones the system claims to have solved but realistically hasn't (design inconsistency, generic output, weak CRO execution, Playwright false-positives, technical-debt accumulation, requirement misunderstanding, scope drift) — and judge honestly whether the claimed prevention actually works.\n${docsForCross}`, { label: 'failure-modes', phase: 'Cross-cutting', schema: FAILURE_SCHEMA }),
  () => agent(`${MANDATE}\n\nProduce the TOP MISSING CAPABILITIES of this Shopify Agency OS (aim for 25-40, ranked). For each: the capability · revenue_impact (H/M/L) · client_satisfaction_impact (H/M/L) · scalability_impact (H/M/L) · risk_level. Think about what a top Shopify Plus / DTC / CRO agency has that this system lacks (real client comms, design taste, novel strategy, live ops/incident response, analytics depth, A/B testing infra, accessibility depth, legal/compliance, integrations breadth, proven track record, etc.).\n${docsForCross}`, { label: 'missing-caps', phase: 'Cross-cutting', schema: MISSING_SCHEMA }),
  () => agent(`${MANDATE}\n\nProduce the AGENCY READINESS + SCALING + BRUTAL REALITY assessment:\n- readiness %: solo-client, small-agency, mid-size, enterprise, high-volume.\n- scaling: for 10 / 50 / 100 / 500 concurrent clients — feasible? bottlenecks? required improvements?\n- brutal_reality: vs a real 25+ year Shopify agency — where it TRULY performs at that level, where it falls short, where human expertise still significantly outperforms it, what's required to close the gap, and a one-paragraph overall_verdict. Be brutally honest: this system has shipped zero real stores and its 'intelligence' is LLM prompts + executable gates.\n${docsForCross}`, { label: 'readiness-scaling', phase: 'Cross-cutting', schema: READINESS_SCHEMA }),
])

const depts = deptResults.filter(Boolean)
const avg = depts.length ? Math.round(depts.reduce((s, d) => s + d.capability_pct, 0) / depts.length) : null

return {
  overall_avg_capability_pct: avg,
  departments: depts.sort((a, b) => b.capability_pct - a.capability_pct),
  failure_modes: failure?.failure_modes || [],
  missing_capabilities: missing?.missing_capabilities || [],
  readiness: readiness?.readiness || null,
  scaling: readiness?.scaling || [],
  brutal_reality: readiness?.brutal_reality || null,
}
