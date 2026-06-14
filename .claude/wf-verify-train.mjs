export const meta = {
  name: 'verification-acceptance-train',
  description: 'Train the QA/review agents on the Verification & Acceptance Protocol: the 6 validation layers, the functional gate, outcome-over-tests, bug-resolution, and the hard-block acceptance gate. Verify each.',
  phases: [
    { title: 'Patch', detail: 'each agent adds a Tier-1 pointer + its Verification-layer role' },
    { title: 'Verify', detail: 'fresh agent confirms additive + correct layer' },
  ],
}

const VP = '~/.claude/memory/patterns/good/shopify-verification-acceptance-protocol.md'

const SPECS = [
  {
    id: 'lumen', depth: 'full',
    role: 'QA Lead — owner of the 6-layer validation EXECUTION + the functional gate (#10)',
    duties: [
      'Run `node toolkit/scripts/gate-functional.mjs` (#10) as part of the Step-13 wall (BLOCKING) — Playwright DRIVES real flows (add-to-cart → /cart.js item_count increments, variant select, forms, nav) + edge cases (mobile/tablet/desktop viewports, horizontal overflow, broken images, console/JS errors). It does NOT just screenshot. Commit gate-reports/functional.json with your gate evidence; `theme-gates.mjs --verify --require-full` covers it.',
      'Execute ALL 6 validation layers (Technical/Visual/Functional/Requirement/Brand/CRO) on every touched surface, scaled by request class. GATES GREEN ≠ DONE — you verify the OUTCOME (did we solve what was asked), not the test-pass.',
      'Screenshot = evidence, NOT proof: before approving the visual layer answer the 5 questions — what differs · why · is it acceptable · does it break UX · does it break the design system.',
      'Bug retest: after ANY fix, re-run the repro + the in-scope layers on BOTH mobile AND desktop; confirm original issue gone + no regressions before sign-off.',
    ],
  },
  {
    id: 'onyx', depth: 'full', additive: true,
    role: 'Code Reviewer — Layer 1 (technical) + Layer 4 (requirement validation) + root-cause enforcement',
    duties: [
      'Layer 4 — REQUIREMENT VALIDATION: compare the ORIGINAL CHANGES.md request vs the current result. Did the code solve EXACTLY what was asked? A build that passes every audit but does not fulfill the stated requirement is BLOCKED — passing audits is a signal, not proof of done.',
      'Root-cause before any fix (§2): reject any fix that does not name the actual root cause vs the symptom. No superficial patches — symptom-patches are why bugs reappear.',
      'Layer 1 — technical: no console/Liquid/JS errors, no render failures or CSS conflicts.',
    ],
  },
  {
    id: 'vega', depth: 'full', additive: true,
    role: 'Design Director — Layer 2 (visual, INSPECTED) + Layer 5 (brand) validation authority',
    duties: [
      'Layer 2 — VISUAL: INSPECT alignment / spacing / typography / component consistency / responsive behavior — never approve on a screenshot MATCH alone. Apply the 5 screenshot questions (what differs · why · acceptable · breaks UX · breaks design system).',
      'Layer 5 — BRAND: validate every change against brand-direction.md + the locked design system + existing UI patterns + visual hierarchy. Off-brand or off-system = not done, even if it looks fine in isolation.',
    ],
  },
  {
    id: 'catalyst', depth: 'medium', additive: true,
    role: 'CRO Director — Layer 6 (CRO validation)',
    duties: [
      'Layer 6 — CRO validation: verify the change improves clarity, trust, conversion flow, and removes friction. A converting-but-broken surface (fails another layer) OR an on-brand-but-non-converting surface still FAILS acceptance. Coordinate with your Conversion Gate.',
    ],
  },
  {
    id: 'vex', depth: 'full',
    role: 'Reliability Engineer / Bug Fixer — owner of the bug-resolution framework',
    duties: [
      'NEVER stop after the first fix. Root-cause first (§2 — actual cause, not symptom) → fix → RETEST (the repro + the in-scope 6 layers on the touched surface) → up to 3 attempts → then verify: original issue gone + NO regressions, on BOTH mobile AND desktop. Only then mark complete.',
      'Self-critique mode before delivering (the 6 questions: what could still be wrong · what was assumed · what was not tested · what breaks on mobile · what breaks with real content · what a senior QA engineer would challenge). Fix what they surface first.',
      'Outcome over test-passed: a reappearing bug means a symptom was patched or the retest skipped a layer — both banned.',
    ],
  },
  {
    id: 'atrium', depth: 'light',
    role: 'Acceptance authority (pipeline already wired at Step 2 + Step 14.5)',
    duties: [
      'You own the FORMAL per-requirement acceptance (§7): 6 validation layers proven + the 11-point criteria + ≥95% confidence — else you do NOT mark complete: HARD-BLOCK Step 15 and escalate to Yash (uncertainty + validation needed + risks + next steps). Gates green ≠ done.',
      'You own the brief-completeness gate (§8): missing CRITICAL info (business/revenue/brand/audience/pain/objections/products) → STOP + emit the grouped priority-ordered questionnaire; non-critical → defaults. Both are in your numbered pipeline (Step 2 + Step 14.5) — this section is the doctrine pointer.',
    ],
  },
]

function patchPrompt(s) {
  const lengthGuide = s.depth === 'full' ? '~18-30 lines' : s.depth === 'medium' ? '~12-18 lines' : '~8-12 lines'
  return `Surgically TRAIN the Boldteq agent \`${s.id}\` by editing ONLY \`~/.claude/agents/${s.id}.md\`. Global prompt — be precise, ADDITIVE ONLY (delete/rewrite nothing; keep ALL existing sections incl. any prior SAOS/DGS/revision sections intact).

## Read first
1. \`~/.claude/agents/${s.id}.md\` — structure + voice.
2. \`${VP}\` — the Verification & Acceptance Protocol (core principle: outcome over test-passed; §1 signals-vs-proof; §2 root-cause-first; §3 the 6 layers; §4 Playwright/screenshot standards; §5 bug-resolution; §6 self-critique; §7 the 11-point acceptance + <95% hard-block; §8 brief-completeness gate).

## This agent's verification role (use VERBATIM; invent nothing)
- Role: ${s.role}
- Duties:
${s.duties.map(d => `  - ${d}`).join('\n')}

## Edit 1 — Tier-1 pointer
Add to this agent's load/Tier-1 list, matching its numbering/style:
- \`${VP}\` — Verification & Acceptance: outcome over test-passed, the 6 validation layers, the functional gate, bug-resolution, the hard-block acceptance gate
If no such list, add a short \`## Load First — Verification\` note after the H1.

## Edit 2 — append a "## Verification & Acceptance — <short role>" section (${lengthGuide})
Near the END (before any \`*Reference only*\` footer / closing sign-off; else EOF). Match the file's voice. Include: one line that gates are SIGNALS not proof and done = requirement-truly-solved; this agent's layer ownership + duties as crisp bullets; where relevant the exact command (\`node toolkit/scripts/gate-functional.mjs\`); a one-line pointer to ${VP} as source of truth. Scannable; reference the doc, don't duplicate it.

## Rules
- Additive only; frontmatter + H1 + all existing sections byte-for-byte intact except the two insertions. Use Edit (unique old_string). Touch no other file.
Return the structured result.`
}

function verifyPrompt(id) {
  return `Verify the Verification-protocol patch on \`~/.claude/agents/${id}.md\`. Read it. Be skeptical.
Check: (1) a \`## Verification & Acceptance\` section exists; (2) \`shopify-verification-acceptance-protocol.md\` is referenced; (3) the file still opens with its original frontmatter + H1 and all prior sections (incl. any SAOS/DGS) survive — additive only, no truncation; (4) the section names ${id}'s correct verification layer/role (not another agent's).
pass=true only if 1,2,3 hold and 4 is correct; else list concrete issues.`
}

const PATCH_SCHEMA = { type: 'object', additionalProperties: false, properties: { agent: { type: 'string' }, tier1_added: { type: 'boolean' }, section_added: { type: 'boolean' }, summary: { type: 'string' } }, required: ['agent', 'tier1_added', 'section_added', 'summary'] }
const VERIFY_SCHEMA = { type: 'object', additionalProperties: false, properties: { agent: { type: 'string' }, pass: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } }, required: ['agent', 'pass', 'issues'] }

log(`Verification training: ${SPECS.length} agents (lumen/onyx/vega/catalyst/vex/atrium)`)
const results = await pipeline(
  SPECS,
  (s) => agent(patchPrompt(s), { label: `patch:${s.id}`, phase: 'Patch', schema: PATCH_SCHEMA }),
  (patch, s) => agent(verifyPrompt(s.id), { label: `verify:${s.id}`, phase: 'Verify', schema: VERIFY_SCHEMA }).then(v => ({ patch, verify: v })),
)
const clean = results.filter(Boolean)
const failed = clean.filter(r => !r.verify || !r.verify.pass)
log(`Verification training done: ${clean.length - failed.length}/${SPECS.length} verified clean`)
return { total: SPECS.length, clean: clean.filter(r => r.verify?.pass).map(r => r.verify.agent), needs_attention: failed.map(r => ({ agent: r.patch?.agent || r.verify?.agent, issues: r.verify?.issues || ['verify null'] })) }
