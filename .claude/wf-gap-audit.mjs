export const meta = {
  name: 'saos-dgs-gap-audit',
  description: 'Adversarial read-only audit of everything built this session (SAOS + DGS + revision protocol + gate + ~15 agent patches) to find every remaining gap, contradiction, dangling reference, and missing wiring.',
  phases: [{ title: 'Audit', detail: '6 parallel auditors, one per dimension' }],
}

const DOCS = [
  '~/.claude/memory/patterns/good/shopify-agency-operating-system.md',
  '~/.claude/memory/patterns/good/shopify-technical-goals-discovery.md',
  '~/.claude/memory/patterns/good/shopify-design-governance-system.md',
  '~/.claude/memory/patterns/good/shopify-design-system-contract-schema.md',
  '~/.claude/memory/patterns/good/shopify-revision-feedback-protocol.md',
].join('\n  ')

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    dimension: { type: 'string' },
    summary: { type: 'string' },
    gaps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          where: { type: 'string' },
          problem: { type: 'string' },
          recommended_fix: { type: 'string' },
        },
        required: ['severity', 'where', 'problem', 'recommended_fix'],
      },
    },
  },
  required: ['dimension', 'summary', 'gaps'],
}

const AUDITORS = [
  {
    key: 'cross-ref-integrity',
    prompt: `Audit CROSS-REFERENCE INTEGRITY of the 5 new KB docs:
  ${DOCS}
For each doc-to-doc and doc-to-artifact reference: does the target exist?
- Every referenced KB file (\`*.md\`) — does it exist on disk? (Read/glob ~/.claude/memory/patterns/good/ + stacks/)
- Every named ARTIFACT the docs promise (docs/design/design-system.json, docs/design/design-system.md, docs/brand/brand-direction.md, docs/discovery/goals.json, docs/discovery/preflight-audit.md, gate-reports/design-system.json, gate-reports/consistency.md, section-reuse-map.md, CHANGES.md) — is each one given a concrete schema/template/owner somewhere, or merely NAMED without definition?
- Every executable referenced (check-design-system.mjs, theme-gates.mjs, gate-conversion.mjs) — does it exist at Polyglot/theme-toolkit/scripts/?
Report each dangling reference or under-specified artifact as a gap.`,
  },
  {
    key: 'pipeline-vs-doctrine',
    prompt: `Audit whether atrium's ACTUAL EXECUTED PIPELINE matches what the doctrines CLAIM it does. Read ~/.claude/agents/atrium.md (the "## 18-Step Workflow Execution" block, the "Autonomous mode" artifact checklist, and the "Handoff Contracts" section) AND ~/.claude/memory/patterns/good/shopify-design-governance-system.md (§7 the 10-phase map, "Step 5.5") + shopify-agency-operating-system.md.
Find every place where a doctrine says atrium does X but atrium's actual numbered workflow / autonomous checklist / handoff contracts do NOT include X. Specifically check:
- Is a Design-System phase (token writes the contract) actually inserted into the numbered Steps (between theme-base Step 5 and stitch Step 6)? Or only in an appended section?
- Is a Brand-Strategy / brand-direction lock phase in the numbered Steps?
- Is there a vega RATIFICATION gate in the numbered steps?
- Do the autonomous /shopify-store artifact checklist items include design-system.json + brand-direction.md as REQUIRED?
- Are there handoff contracts (atrium → decoder for brand-direction, atrium → token for design-system, atrium → vega for ratification)?
Report each missing wiring as a gap with where + the recommended insertion point.`,
  },
  {
    key: 'gate-integration-correctness',
    prompt: `Audit the design-system gate. Read Polyglot/theme-toolkit/scripts/check-design-system.mjs, theme-gates.mjs (the GATES array + run logic), check-reuse-map.mjs (the sibling pattern), and shopify-design-system-contract-schema.md §3.
Check:
- Is check-design-system.mjs REGISTERED in theme-gates.mjs GATES (so a full run / --verify includes it)? If not, it can be silently skipped — report as a gap with the exact registration needed.
- Does the gate's logic actually enforce every allowlist the contract schema promises (allowed_px, spacing.scale, radius.tokens, color, second-token)? Any check promised in the schema doc but missing in code, or vice versa?
- Any false-positive risks (would it block legitimate theme-native code: var() usage, calc/clamp with var, %/vw units, base-theme files)? Any false-negative (drift it would miss)?
- Is the BASE_REF scoping reliable, and does it match check-reuse-map's convention?
Report gaps with concrete fixes.`,
  },
  {
    key: 'contradictions',
    prompt: `Audit for CONTRADICTIONS across all session work. Read the 5 new docs:
  ${DOCS}
plus ~/.claude/memory/patterns/good/section-reuse-first-protocol.md, theme-anti-overengineering-rules.md, changes-list-protocol.md.
Find any place two docs (or a doc and an existing protocol) give CONFLICTING instructions, numbers, or ownership. Specifically:
- SAOS request-triage Class D "fast-lane micro-change" vs DGS "design-system-first gates ALL design/build" — reconciled for existing-store changes vs new builds, or contradictory?
- Revision protocol vs changes-list-protocol — consistent on how a change is tracked?
- Any conflicting numbers (reuse %, lift targets, gate counts, sign-off counts, font-size/spacing rules)?
- Any case where two agents are told they OWN the same decision in a conflicting way (e.g. who ratifies the design system, who owns brand-direction)?
Report each contradiction with the two conflicting locations + the recommended resolution.`,
  },
  {
    key: 'agent-patch-coverage',
    prompt: `Audit AGENT-PATCH COVERAGE + CORRECTNESS. The session trained these agents — read a representative sample (~/.claude/agents/atrium.md, vega.md, token.md, onyx.md, lumen.md, loom.md, elio.md, decoder.md, mantle.md, conduit.md, lattice.md, catalyst.md, porter.md, keystone.md) focusing on their SAOS / DGS / revision sections + tool lists.
Check:
- Are any agents told to RUN or OWN something outside their actual tools/scope (e.g. an agent without Bash told to run check-design-system.mjs; a read-only agent told to Edit)?
- Are there agents that SHOULD participate in the design-system/consistency system but were NOT trained (e.g. conduit, lattice, catalyst, porter, keystone — should any of them have a DGS or revision role)?
- Any ownership stated inconsistently across two agents (e.g. both claim to own the consistency audit differently)?
- Did any patch land in the wrong place or reference a wrong lens/role?
Report gaps with the agent + the fix.`,
  },
  {
    key: 'completeness-critic',
    prompt: `Be the COMPLETENESS CRITIC for the whole "Shopify Agency Operating System" the session built (SAOS posture + DGS design-governance + revision protocol + the gate). Read the 5 docs:
  ${DOCS}
Ask: what is MISSING ENTIRELY for this to behave like a senior agency that delivers consistent, premium stores with minimal revisions? Consider:
- Is there a single clear "Definition of Done" tying gates + consistency + sign-offs + numeric targets?
- Is brand-direction.md given a fillable template (decoder needs one)?
- Is the design-system gate in CI / the publish (--verify) path?
- Is there guidance for the FIRST interaction when a brief arrives (what atrium says/asks first)?
- Anything about handling an EXISTING store (the design-system extracted from a live theme vs authored fresh)?
- Any measurement/accountability loop for design consistency specifically (not just CRO)?
Report each true gap (only genuine omissions, not nice-to-haves) with a recommended fix + severity.`,
  },
]

log(`Gap audit: ${AUDITORS.length} adversarial auditors over the session's work`)

const results = await parallel(
  AUDITORS.map(a => () => agent(a.prompt, { label: `audit:${a.key}`, phase: 'Audit', schema: FINDINGS_SCHEMA }))
)

const clean = results.filter(Boolean)
const all = clean.flatMap(r => (r.gaps || []).map(g => ({ dimension: r.dimension, ...g })))
const bySeverity = (s) => all.filter(g => g.severity === s)

return {
  dimensions_audited: clean.map(r => r.dimension),
  total_gaps: all.length,
  critical: bySeverity('critical'),
  high: bySeverity('high'),
  medium: bySeverity('medium'),
  low: bySeverity('low'),
}
