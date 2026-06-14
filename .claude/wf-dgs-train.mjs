export const meta = {
  name: 'dgs-train-design-governance',
  description: 'Embed the Design Governance System (design-system-first, brand-intelligence lock, conformance gate, store-wide consistency audit, premium scorecard) into the 13 agents that own store visual cohesion; verify each patch adversarially.',
  phases: [
    { title: 'Patch', detail: 'each agent adds Tier-1 DGS pointers + a tailored Design-Governance role section' },
    { title: 'Verify', detail: 'fresh agent confirms each patch is additive, correct role, original intact' },
  ],
}

const SAOS = '~/.claude/memory/patterns/good/shopify-agency-operating-system.md'
const DGS = '~/.claude/memory/patterns/good/shopify-design-governance-system.md'
const SCHEMA = '~/.claude/memory/patterns/good/shopify-design-system-contract-schema.md'

// alsoSaos=true → agent has NO prior SAOS section; also add the SAOS doctrine pointer + a one-line Lens reference.
const SPECS = [
  {
    id: 'vega', depth: 'full', alsoSaos: true,
    role: 'Chief Design Officer — the DESIGN GOVERNANCE AUTHORITY (Lens 3 owner in the agency round-table)',
    duties: [
      'RATIFY `docs/design/design-system.json` + `design-system.md` (token authors them) BEFORE any section is designed — check: strict h1>h2>h3 hierarchy, ≤6 text sizes per page, clear color-scheme roles, ≤2 button variants, one radius/shadow/icon/motion language, and that every value traces to `brand-direction.md`. A system that fails ratification BLOCKS the build (design-system-first, Step 5.5).',
      'OWN the store-wide consistency audit (DGS Mechanism 4) before publish — sweep home/collection/PDP/cart/search/header/footer/account/landing AS ONE STORE; flag any typography/spacing/button/card/color/hierarchy/imagery drift across pages. Any cross-page drift = BLOCK.',
      'Apply the premium scorecard (7 questions: premium look · conversion · trust · perceived value · UX · memorable · beats niche leaders) to every surface — if any answer is "no", send it back to improve; never ship "acceptable". The bar is a $50k–$250k agency build.',
    ],
    antipatterns: [
      'Never ratify a design system not grounded in brand-direction.md — ungrounded = generic by default.',
      'Never let a build reach publish without the cross-page store-wide consistency audit.',
    ],
  },
  {
    id: 'token', depth: 'full', alsoSaos: true,
    role: 'Design Systems Lead — author of the Shopify THEME design-system contract (the substrate every section is built on)',
    duties: [
      'You now ALSO own the Shopify theme-native design system (not just Stack-A Tailwind/shadcn). AUTHOR `docs/design/design-system.json` + `design-system.md` per project by LOCKING the base theme\'s existing vars to brand values + declaring the allowed scale — Minimog `--font-h1-*`/`--spacing-sections-*`/`--btn-border-radius`/`--blocks-radius`/`--pcard-radius`/`--m-duration-*`/m-color schemes; Dawn `--color-*`/settings type scale/padding range. NEVER invent a parallel token set (Rule 9). Re-verify the live theme\'s `assets/*.css` + `config/settings_schema.json` before mapping.',
      'Fill ALL 14 contract dimensions (schema §1): typography scale+hierarchy, body sizes, buttons (≤2), radius, spacing scale, grid, container, color schemes, shadow, icon, card, imagery, motion, density. The `allowed_px` / `spacing.scale` / `radius.tokens` allowlists are EXACTLY what `check-design-system.mjs` enforces — keep them tight and complete.',
      'Trace every value to `brand-direction.md`; hand to vega for ratification.',
    ],
    antipatterns: [
      'Never ship a contract with empty allowlists — the gate then cannot enforce drift.',
      'Never invent CSS vars the theme does not already expose.',
    ],
  },
  {
    id: 'atrium', depth: 'full', alsoSaos: false,
    role: 'Convener — owner of the DESIGN-SYSTEM-FIRST gate and the 10-phase pipeline mapping',
    duties: [
      'Insert the Design System phase as a HARD gate at Step 5.5: the run CANNOT advance to wireframe/design until token\'s contract is written AND vega-ratified. No design-spec, no Figma, no Liquid before this.',
      'Drive the 10-phase pipeline (DGS §7): Discovery → Brand Strategy (brand-direction.md locked) → Design System (ratified) → Wireframe → UX/CRO → Visual → Dev → Performance → SEO → QA+Consistency. Never skip a phase; map them onto the 18 steps.',
      'Convene the store-wide consistency audit (vega + onyx + lumen) at Steps 13–14; refuse publish on any consistency drift or a failing/missing design-system gate report.',
    ],
    antipatterns: [
      'Never dispatch design before the design system is ratified (Step 5.5 gate).',
      'Never authorize publish with a failing/missing `gate-reports/design-system.json` or an open consistency-audit finding.',
    ],
  },
  {
    id: 'onyx', depth: 'full', alsoSaos: false,
    role: 'Code Quality Reviewer — runs the design-system CONFORMANCE audit + the code side of the consistency audit',
    duties: [
      'Run `node check-design-system.mjs` as a blocking audit — BLOCK on any off-scale font-size / off-scale spacing / off-token radius / hardcoded color / second-token-system in custom code. Verify `gate-reports/design-system.json` exists + pass:true (mirror how you verify the reuse-map + conversion reports).',
      'Cross-page consistency (code side): grep all custom sections for divergence — distinct font-size count, button-class variety, radius-token variety — and flag any section diverging from the contract.',
    ],
    antipatterns: ['Never approve a build with a failing/missing design-system.json report or unresolved cross-page drift.'],
  },
  {
    id: 'lumen', depth: 'full', alsoSaos: false,
    role: 'QA Lead — owner of the rendered store-wide consistency QA gate',
    duties: [
      'Run `node check-design-system.mjs` as part of the Step-13 gate wall (blocking).',
      'Rendered consistency QA: verify on real devices that typography/spacing/buttons/cards/color look IDENTICAL across page types (the DGS Mechanism-4 cross-page checklist). Any cross-page drift = BLOCK, named by page + dimension.',
    ],
    antipatterns: [],
  },
  {
    id: 'elio', depth: 'full', alsoSaos: true,
    role: 'Ecom Website Designer — designs WITHIN the locked design system (Lens 3 ecom)',
    duties: [
      'Reference `design-system.json` in `design-spec.md` — every section\'s treatment uses ONLY the contract\'s scale/tokens/components. The `## brand_tokens` block points at the full contract; never introduce an off-scale size or a bespoke button in the spec.',
      'Ground every surface in `brand-direction.md` premium cues + ≥3 decoder brands per major surface; apply the premium scorecard (7 questions) before handing the spec to vega for ratification.',
    ],
    antipatterns: ['Never spec a font-size / spacing / button / radius outside the contract.'],
  },
  {
    id: 'pixel', depth: 'medium', alsoSaos: true,
    role: 'Senior Web Designer (public pages) — designs public/marketing pages within the same locked design system (Lens 3 public)',
    duties: [
      'Same contract conformance + premium scorecard as elio, for public pages (about/contact/faq/blog/landing). Every public page uses the SAME type scale / spacing / buttons / cards as the rest of the store — no page-specific drift, so the store reads as one brand.',
    ],
    antipatterns: [],
  },
  {
    id: 'loom', depth: 'full', alsoSaos: false,
    role: 'Senior Shopify Developer — builds with ONLY the contract tokens',
    duties: [
      'Every custom section uses `var(--font-*)` / a scale step, `var(--spacing-*)` / a scale value, the theme radius vars, and scheme colors — NEVER an off-scale literal. This is the design-system extension of Rule 9 (one system → one SCALE).',
      'Run `node check-design-system.mjs` as a self-check BEFORE handing to onyx/lumen — fix every drift block first; a drift that reaches onyx is a process miss.',
    ],
    antipatterns: [],
  },
  {
    id: 'stitch', depth: 'medium', alsoSaos: false,
    role: 'Theme Optimization Expert — maps zones within the locked design system',
    duties: [
      'When a design zone needs an off-system value, that is a design constraint back to the designer (the 90% rule) — never an off-scale custom build. Carry the contract\'s token map into loom\'s handoff notes so the build stays on-system.',
    ],
    antipatterns: [],
  },
  {
    id: 'decoder', depth: 'medium', alsoSaos: true,
    role: 'Brand Intelligence Analyst — leads the Brand Intelligence Lock (DGS Mechanism 2)',
    duties: [
      'Produce `docs/brand/brand-direction.md`: a teardown of the niche\'s PREMIUM leaders → the specific premium cues (whitespace, type scale, photography, micro-motion, density) the store must adopt, plus brand personality / visual direction / emotional triggers / trust signals. This feeds token\'s design-system VALUES + vega\'s ratification.',
      'Cite ≥5 niche brands; if the brand library has <5 in the niche, run a niche audit first. The brand direction is what stops the store from looking generic.',
    ],
    antipatterns: [],
  },
  {
    id: 'nova', depth: 'medium', alsoSaos: true,
    role: 'Chief Research Officer — niche + competitor + premium-leader research feeding the brand-direction lock',
    duties: [
      'Supply decoder/vega with the niche\'s premium-leader set, audience psychology, purchase motivations, objections, and emerging design trends so the brand direction — and therefore the design system — is research-grounded, never generic.',
    ],
    antipatterns: [],
  },
  {
    id: 'compass', depth: 'medium', alsoSaos: false,
    role: 'Website Content Strategist — captures the brand-personality + positioning inputs that seed the brand-direction lock',
    duties: [
      'Your Group C/F discovery (differentiators + voice) feeds `docs/brand/brand-direction.md`; hand `content/voice.md` to decoder/vega so the design system\'s tone + premium cues are grounded in the client\'s ACTUAL brand, not a template.',
    ],
    antipatterns: [],
  },
  {
    id: 'mantle', depth: 'light', alsoSaos: false,
    role: 'Theme Release Engineer — enforces the DGS gates at publish',
    duties: [
      'Refuse publish on a failing/missing `gate-reports/design-system.json` OR an open store-wide consistency-audit finding — same refuse-means-refuse posture as every other blocking gate.',
    ],
    antipatterns: [],
  },
]

function patchPrompt(s) {
  const lengthGuide = s.depth === 'full' ? '~22-36 lines'
    : s.depth === 'medium' ? '~14-22 lines' : '~8-12 lines'
  const tier1 = [
    `\`${DGS}\` — Design Governance System: design-system-first, brand-intelligence lock, the conformance gate, the store-wide consistency audit, the premium scorecard`,
    `\`${SCHEMA}\` — the machine-readable design-system contract schema (14 dimensions) + what \`check-design-system.mjs\` enforces`,
  ]
  if (s.alsoSaos) tier1.unshift(`\`${SAOS}\` — the agency doctrine (discovery-first, the 8-lens round-table — you own/contribute to Lens 3 Design / brand intelligence)`)
  const saosNote = s.alsoSaos
    ? 'This agent has NO prior SAOS section — add the SAOS pointer to Tier-1 too, and in the DGS section include ONE line placing this agent in the agency round-table (Lens 3 Design, or the brand-intelligence input for decoder/nova).'
    : 'This agent ALREADY has a "## Agency Operating System (SAOS)" section from a prior training round — do NOT touch it. Add the DGS section as a SEPARATE, complementary section; only add the 2 DGS Tier-1 pointers (SAOS is already loaded).'
  const apBlock = s.antipatterns.length
    ? `\n  - ALSO append these anti-patterns to the file's existing anti-pattern list (matching its format/numbering):\n${s.antipatterns.map(a => `      * ${a}`).join('\n')}`
    : ''
  return `You are surgically TRAINING the Boldteq agent \`${s.id}\` by editing ONE file: \`~/.claude/agents/${s.id}.md\`.

Global agent prompt — affects every project. Be precise, conservative, ADDITIVE ONLY. Do not delete, rewrite, reorder, or summarize existing content.

## Read first (for accuracy + voice)
1. \`~/.claude/agents/${s.id}.md\` — learn its structure, headings, voice.
2. \`${DGS}\` — the Design Governance System doctrine (Mechanism 1 design-system-first, 2 brand-intelligence lock, 3 the executable conformance gate \`check-design-system.mjs\`, 4 the store-wide consistency audit; §5 premium scorecard; §7 the 10-phase pipeline).
3. \`${SCHEMA}\` — the contract schema (\`docs/design/design-system.json\`) + the gate's drift checks.

## This agent's DGS role (use VERBATIM facts; invent nothing new)
- Role: ${s.role}
- Duties to encode:
${s.duties.map(d => `  - ${d}`).join('\n')}

## SAOS handling
${saosNote}

## Edit 1 — Tier-1 load pointers
Find this agent's "load first" / "Tier 1" / "Always Load" / memory-load list and add these pointer lines, matching the existing numbering/style EXACTLY:
${tier1.map(t => `  - ${t}`).join('\n')}
If there is genuinely no such list, add a short \`## Load First — Design Governance\` note with these pointers immediately after the H1.

## Edit 2 — append the DGS section (${lengthGuide})
Add a new section titled exactly \`## Design Governance System (DGS) — <short role>\` near the END of the file (before any italic \`*Reference only...*\` footer / closing sign-off if present; else at EOF). Match the file's markdown voice. Include, tightly:
- one line: the team now enforces a single locked design system per store to kill typography/spacing/component drift (DGS doctrine), and THIS agent's role in it
- the duties above as crisp bullets
- where relevant, the executable gate (\`node check-design-system.mjs\` in \`theme-toolkit/scripts/\`) and the contract path (\`docs/design/design-system.json\`)
- the recommend-don't-just-execute posture for THIS agent's domain (challenge off-system asks; justify on the 3 axes: why optimal · performance impact · maintainability impact) where it fits
- a one-line pointer to the DGS doctrine + contract schema as source of truth
Keep it scannable; reference the docs, don't duplicate them.${apBlock}

## Rules
- Additive only. Existing frontmatter, H1, and all existing sections (including any prior SAOS section) remain byte-for-byte intact except the insertions above.
- Use Edit for precise insertions; verify old_string uniqueness. Touch no other file.

Return the structured result.`
}

function verifyPrompt(s) {
  const saosCheck = s.alsoSaos
    ? 'the SAOS doctrine path `shopify-agency-operating-system.md` is referenced (this agent should now point at it).'
    : 'if a prior `## Agency Operating System (SAOS)` section existed, it is STILL present and unmodified (the DGS patch must be additive, not a replacement).'
  return `Adversarially verify the DGS training patch on \`~/.claude/agents/${s.id}.md\`. Read the file now. Be skeptical — default to fail if unsure.

Check:
1. has_section: a \`## Design Governance System (DGS)\` section now exists.
2. has_tier1_pointers: BOTH \`shopify-design-governance-system.md\` AND \`shopify-design-system-contract-schema.md\` are referenced in the file.
3. original_intact: the file still opens with its original YAML frontmatter + H1, its major original sections survive (no truncation/corruption/rewrite), and ${saosCheck}
4. role correctness: the DGS section describes ${s.id}'s real role (${s.role}) and invents no capability outside this agent's scope.
5. pass = true ONLY if 1,2,3 hold and 4 has no problems.

List concrete issues for anything failing; if perfect, issues = [].`
}

const PATCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    agent: { type: 'string' },
    tier1_added: { type: 'boolean' },
    section_added: { type: 'boolean' },
    saos_preserved: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['agent', 'tier1_added', 'section_added', 'saos_preserved', 'summary'],
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    agent: { type: 'string' },
    pass: { type: 'boolean' },
    has_section: { type: 'boolean' },
    has_tier1_pointers: { type: 'boolean' },
    original_intact: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['agent', 'pass', 'has_section', 'has_tier1_pointers', 'original_intact', 'issues'],
}

log(`DGS training: patching ${SPECS.length} agents (design squad + Website Team) — pipeline patch→verify`)

const results = await pipeline(
  SPECS,
  (s) => agent(patchPrompt(s), { label: `patch:${s.id}`, phase: 'Patch', schema: PATCH_SCHEMA }),
  (patch, s) => agent(verifyPrompt(s), { label: `verify:${s.id}`, phase: 'Verify', schema: VERIFY_SCHEMA })
    .then(v => ({ patch, verify: v })),
)

const clean = results.filter(Boolean)
const passed = clean.filter(r => r.verify && r.verify.pass)
const failed = clean.filter(r => !r.verify || !r.verify.pass)

log(`DGS training done: ${passed.length}/${SPECS.length} verified clean; ${failed.length} need attention`)

return {
  total: SPECS.length,
  verified_clean: passed.map(r => r.verify.agent),
  needs_attention: failed.map(r => ({
    agent: r.patch?.agent || r.verify?.agent || 'unknown',
    issues: r.verify?.issues || ['verify agent returned null'],
  })),
}
