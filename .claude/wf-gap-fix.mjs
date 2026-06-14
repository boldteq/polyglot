export const meta = {
  name: 'saos-dgs-gap-fix',
  description: 'Apply the remaining audit fixes: doc reconciliations (contradictions, artifacts), the brand-direction template, the Definition of Done, and DGS sections for the 3 uncovered agents. Verify each.',
  phases: [
    { title: 'Fix', detail: 'one agent per file applies its audit-recommended fixes' },
    { title: 'Verify', detail: 'fresh agent confirms the fixes landed + file intact' },
  ],
}

const P = '~/.claude/memory/patterns/good'
const A = '~/.claude/agents'

const TASKS = [
  {
    key: 'doc-saos', file: `${P}/shopify-agency-operating-system.md`,
    fixes: [
      'Class-D reconciliation (§2 triage table, Class-D row): append — "If the tweak touches a value the design system governs (font-size, spacing, color, radius, button, card), the DGS conformance gate (check-design-system.mjs) STILL runs on the touched file — Class D never waives drift enforcement, only the discovery/round-table DEPTH."',
      'Gate-count single-sourcing (§4 Step-13 wall description + §8): add the two DGS gates to the Step-13 blocking wall — "plus the DGS design-system conformance gate (check-design-system.mjs #8) and the store-wide consistency gate (check-consistency.mjs #9), both blocking — see shopify-design-governance-system.md." So the publish-gate count is single-sourced in the parent doctrine.',
      'Custom-share remediation language (§5): change "CUSTOM >30% of zones needs a scope amendment" to "needs a CHANGES.md ## Waivers entry (the scope-amendment record) per section-reuse-first-protocol §9" so both docs point at ONE mechanism (the audit found a 30%-vs-40% seam).',
    ],
  },
  {
    key: 'doc-dgs', file: `${P}/shopify-design-governance-system.md`,
    fixes: [
      'Ratify vs sign-off (§1 + §8 RACI): distinguish "ratify" (internal quality gate — vega) from "sign off" (client approval gate — client), BOTH mandatory in sequence at Step 5.5. Add to §1 and the §8 RACI a Client column/note: "vega ratifies internal coherence THEN the client signs off brand-direction.md + the design system before design dispatch — both required to pass Step 5.5." (Yash ratified 4 client sign-offs: brand-direction, sitemap, design-system, homepage preview.)',
      'consistency.md is now executable (§4): update Mechanism 4 — the countable half is now `node toolkit/scripts/check-consistency.mjs` (#9 → gate-reports/consistency.md + consistency.json; BLOCKS on store-wide distinct font-size count >6, distinct radii > radius.tokens, button-class variety, card variety). vega visual sweep + lumen device QA are the HUMAN layer ON TOP. Stop hedging "or the audit section of lumen report" — name the script + the artifact.',
      'Class-D / existing-store scope (§1, §3): scope the absolute "no Liquid before the design system" language — "on a NEW build, no Liquid is built before the design system exists; on an EXISTING store, Class-C/D changes still conform to the live theme tokens, and the conformance gate runs on every touched custom/extend file regardless of class." (design-system-first = new-build precondition; conformance gate = all-class enforcer.)',
      'Existing-store extraction sub-flow (add to §1): when existing_store=true, token+conduit EXTRACT a draft design-system.json from the live theme (settings_data.json + custom section CSS → observed font-size set, spacing, radii, button classes, flagged "extracted, un-ratified"), then reconcile to brand-direction (keep/tighten/fix off-scale) → the same locked, ratified contract. So existing stores get the same gate coverage + a grounded cleanup roadmap.',
      'Post-launch consistency accountability (add to §8 or a new short section): consistency degrades live (client edits, later Class-B sections). Add — re-run check-design-system + check-consistency STORE-WIDE (not just touched surfaces) at the post-launch watch checkpoints (T+48h/30d) and on every Class-B/C change that adds a section, owned by vega/onyx; add a "consistency regression" signal to the results loop alongside the CRO end-state.',
      'Wire the gate registration fact: the gates are now registered in theme-gates.mjs (design-system #8, consistency #9, static) so `theme-gates.mjs --verify --require-full` covers them; mantle\'s publish refusal is mechanically real. Update M3 to say so.',
    ],
  },
  {
    key: 'doc-schema', file: `${P}/shopify-design-system-contract-schema.md`,
    fixes: [
      'Add a NEW §5 "brand-direction.md template" — a fillable fenced-markdown skeleton (the 6 DGS fields: brand personality 5 adj + 5 anti-adj; visual direction paragraph + 3 reference brands with what-specifically; content tone; emotional triggers; trust signals; premium cues) PLUS the premium-scorecard self-check (7 questions) PLUS an explicit "each value here is what design-system.json must trace to" mapping block so vega\'s ratification link-check is mechanical. Default ambition = ADAPTIVE PER NICHE.',
      'Update §3 gate section: the gate is now registered (check-design-system.mjs #8) + a sibling check-consistency.mjs (#9) does the store-wide cross-page checks (distinct font-size count, radius variety, button/card variety → gate-reports/consistency.md). Note both run via `theme-gates.mjs --verify`. Note the gate now catches clamp()/calc() drift and does NOT false-flag --brand-* vars.',
      'Path-qualify any bare "theme-page-recipes.md" reference to "stacks/shopify/themes/theme-page-recipes.md" (a WordPress copy also exists — avoid ambiguity).',
    ],
  },
  {
    key: 'doc-revision', file: `${P}/shopify-revision-feedback-protocol.md`,
    fixes: [
      'CHANGES.md lifecycle cross-wire (§5): add — "the item is closed per changes-list-protocol.md: flip [ ]→[x], append the evidence: line, and the deploy gate runs check-changes-list.mjs; the consistency re-audit (check-design-system + check-consistency store-wide) is an ADDITIONAL gate ON TOP of that flow, not instead of it."',
      'Ratify vs client sign-off (§1 decision-authority table): clarify that vega RATIFIES (internal coherence) and the CLIENT SIGNS OFF — both gates, in sequence — for brand-direction.md and the design system; remove any implication that vega ratification alone unblocks the build.',
      'Update §2/§5 gate command references to `node toolkit/scripts/check-design-system.mjs` + add `node toolkit/scripts/check-consistency.mjs` for the store-wide re-audit.',
    ],
  },
  {
    key: 'doc-dod', file: `${P}/shopify-definition-of-done.md`, create: true,
    fixes: [
      'CREATE a single authoritative "Definition of Done" doc for a Shopify website build. Enumerate EVERY blocking condition with its evidence artifact: (1) all gates green — the 6 lumen gates + catalyst conversion (gate-reports/conversion.json) + DGS design-system (gate-reports/design-system.json) + consistency (gate-reports/consistency.json) + zeph SEO + onyx 8-audit; (2) store-wide consistency audit cleared (vega sweep + check-consistency); (3) CHANGES.md zero-unchecked (check-changes-list.mjs exit 0); (4) the 4 client sign-offs recorded (brand-direction, sitemap, design-system, homepage preview) + the pre-publish confirm; (5) numeric goals.json targets built-toward (design-intent ≥ target); (6) the 6-artifact handover pack. Format: a checklist table (condition · evidence artifact · owner). State mantle\'s publish refusal cites THIS doc as the source of truth, and reference it from website-launch-cutover-protocol.md T-minus readiness. Keep ~60-90 lines. Owner: atrium; enforced by mantle. Cross-link SAOS + DGS + revision + changes-list protocols. End with the standard "*Reference only...*" footer.',
    ],
  },
  {
    key: 'agent-lattice', file: `${A}/lattice.md`, agent: true,
    fixes: [
      'Add a short "## Design Governance System (DGS)" section + Tier-1 pointers to shopify-design-governance-system.md + shopify-design-system-contract-schema.md. Role: model ONLY on-system content — metafield/metaobject VALUES that render through the locked design-system tokens; never introduce content that forces an off-scale treatment. Coordinate with token (the contract) + onyx (conformance). One CSS/design system (Rule 9). Additive only; keep ~12-18 lines.',
    ],
  },
  {
    key: 'agent-catalyst', file: `${A}/catalyst.md`, agent: true,
    fixes: [
      'Add a short "## Design Governance System (DGS)" section + Tier-1 pointers to shopify-design-governance-system.md + shopify-design-system-contract-schema.md. Role: the Conversion Gate and the DGS design-cohesion gate are BOTH Step-13 blocking gates in the same parallel wall — a converting surface that BREAKS the locked design system still fails; coordinate with vega/onyx so CRO mechanics use on-system tokens (no bespoke buttons/spacing for a "louder" CTA). CRO must not introduce drift. Additive only; ~12-18 lines.',
    ],
  },
  {
    key: 'agent-conduit', file: `${A}/conduit.md`, agent: true,
    fixes: [
      'Add a short "## Design Governance System (DGS)" section + Tier-1 pointers to shopify-design-governance-system.md + shopify-design-system-contract-schema.md. Role: 3rd-party app blocks + injected widget UI (Klaviyo, reviews, etc.) must respect the locked contract — prefer theme-native slots; flag any app-injected off-scale type/buttons/colors to vega/onyx. On EXISTING stores you help token EXTRACT the live theme\'s de-facto tokens for the draft contract. Additive only; ~12-18 lines.',
    ],
  },
  {
    key: 'agent-lumen-tighten', file: `${A}/lumen.md`, agent: true,
    fixes: [
      'Tighten the DGS wording: the design-system gate is now REGISTERED in theme-gates.mjs (#8) + a new consistency gate (#9), so `node toolkit/scripts/theme-gates.mjs --verify --require-full` DOES cover them. Update lumen to: run BOTH `node toolkit/scripts/check-design-system.mjs` AND `node toolkit/scripts/check-consistency.mjs` as part of the Step-13 wall; commit gate-reports/design-system.json + gate-reports/consistency.json + consistency.md with the 6-gate evidence; they are verified by the orchestrator/--verify (not merely implied). Additive/surgical edit to the existing DGS section only.',
    ],
  },
]

function fixPrompt(t) {
  const action = t.create
    ? `CREATE the file \`${t.file}\` per the spec below.`
    : `EDIT the existing file \`${t.file}\` — read it first, then apply each fix surgically and ADDITIVELY (do not delete/rewrite unrelated content; ${t.agent ? 'keep all existing sections incl. any prior SAOS/DGS sections intact' : 'preserve the doc structure + the *Reference only* footer'}).`
  return `You are applying audit-recommended fixes to ONE file. ${action}

These fixes come from an adversarial audit — implement each one faithfully (the audit already specified the exact change):

${t.fixes.map((f, i) => `### Fix ${i + 1}\n${f}`).join('\n\n')}

Rules:
- Surgical + additive. Match the file's existing markdown voice + heading style.
- Use Edit (or Write only if create:true). Verify each old_string is unique.
- Touch NO other file.
- After editing, re-read the changed region to confirm it landed.

Return a short structured result of what changed.`
}

function verifyPrompt(t) {
  return `Verify the fixes on \`${t.file}\`. Read it. Be skeptical.
Confirm: (1) each of the ${t.fixes.length} intended fixes is present in the file; (2) the file is well-formed markdown and ${t.create ? 'is a complete, coherent new doc with a footer' : 'its original content + structure survived (additive only)'}; (3) no broken references or contradictions introduced.
Return pass=true only if all fixes landed and nothing broke; else list concrete issues.`
}

const FIX_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { file: { type: 'string' }, fixes_applied: { type: 'number' }, summary: { type: 'string' } },
  required: ['file', 'fixes_applied', 'summary'],
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { file: { type: 'string' }, pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } },
  required: ['file', 'pass', 'issues'],
}

log(`Gap-fix: ${TASKS.length} files (doc reconciliations + Definition of Done + 4 agent patches)`)

const results = await pipeline(
  TASKS,
  (t) => agent(fixPrompt(t), { label: `fix:${t.key}`, phase: 'Fix', schema: FIX_SCHEMA }),
  (fix, t) => agent(verifyPrompt(t), { label: `verify:${t.key}`, phase: 'Verify', schema: VERIFY_SCHEMA })
    .then(v => ({ key: t.key, fix, verify: v })),
)

const clean = results.filter(Boolean)
const failed = clean.filter(r => !r.verify || !r.verify.pass)
log(`Gap-fix done: ${clean.length - failed.length}/${TASKS.length} verified clean`)

return {
  total: TASKS.length,
  clean: clean.filter(r => r.verify?.pass).map(r => r.key),
  needs_attention: failed.map(r => ({ key: r.key, issues: r.verify?.issues || ['verify null'] })),
}
