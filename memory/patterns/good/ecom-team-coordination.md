# Ecom Team Coordination — Pipeline + Readiness Gate

**Date:** 2026-04-27
**Owner:** rex (authority) + cadence (HR custodian) + bolt (Polyglot infra)
**Sponsor:** Yash
**Status:** spec ready · pipeline ships W3 · readiness gate enforcing W4

---

## Why this exists

9 ecom agents hired (Phase 1) operate as independent specialists today. Without coordination they'd ship in parallel with no acceptance criteria between phases — design specs without mobile breakdown, copy without voice ratification, mechanics without trigger conditions for sequence. Production ecom builds need ORCHESTRATED phases with structured handoffs and quality gates.

This doc defines:
1. The canonical ecom-team build pipeline (7 phases, 9 agents)
2. Per-phase approval gates and what unblocks each
3. The training-readiness gate (composite_score ≥7.0 before agent dispatch)
4. Polyglot integration points (orchestrations.js, dispatch.js, OrgChart UI)
5. Failure modes + escalation paths

---

## Canonical pipeline — "Ecom Team Build" template

```
[start: Yash brief — "Build PDP for [client/niche]"]
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 1 — Brand intelligence                                │
│  ├─ decoder: niche audit (5 brands × abbreviated teardown) │
│  └─ output: niche-audit-[niche]-[date].md                  │
└─────────────────────────────────────────────────────────────┘
   │ GATE 1 — catalyst.approval
   │ Requires: ≥3 decoder brands, ≥6/8 dimensions captured per brand
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2 — CRO strategy                                      │
│  └─ catalyst: funnel diagnosis + ICE-scored test priorities │
│  └─ output: cro-roadmap.md + test-001..003 specs           │
└─────────────────────────────────────────────────────────────┘
   │ GATE 2 — catalyst dispatches in parallel
   │ Requires: lift_target ≥0.4, decoder_evidence ≥3 per test
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3 — Parallel design + copy                            │
│  ├─ elio:  design specs (PDP/cart/hero per surface)         │
│  ├─ spark: above-fold copy variants (3 per surface)         │
│  └─ merch: PDP body + microcopy slot fills                  │
└─────────────────────────────────────────────────────────────┘
   │ GATE 3 — vega ratifies design + quill ratifies copy voice
   │ Requires: voice_scorecard ≥8 on copy; mobile_specced on design
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 4 — Mechanics                                         │
│  └─ ecom-cro: cart state machine, abandon triggers,         │
│              upsell eligibility, subscription mechanics     │
└─────────────────────────────────────────────────────────────┘
   │ GATE 4 — catalyst.approval (scope-split clean)
   │ Requires: scope_split_clean === true, no copy strings
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 5 — Figma deliverables                                │
│  └─ figma-synth: JSX→.fig + Code Connect mappings           │
└─────────────────────────────────────────────────────────────┘
   │ GATE 5 — vega.review
   │ Requires: all components mapped, screenshot diff <5%
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 6 — Tokens                                            │
│  └─ token: token additions + Figma var sync                 │
└─────────────────────────────────────────────────────────────┘
   │ GATE 6 — automatic (contrast validator pass)
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 7 — Lifecycle email                                   │
│  └─ sequence: welcome / cart-abandon / post-purchase /      │
│              win-back / subscription nurture                │
└─────────────────────────────────────────────────────────────┘
   │ GATE 7 — quill ratifies voice
   ▼
[end: handoff to pod-frontend (Stack B/C) for implementation]
```

### Pipeline definition (Polyglot orchestrations.js template)

```javascript
// File: Polyglot/src/lib/orchestrations/ecom-team-pipeline.js

module.exports = {
  id: 'ecom-team-build',
  name: 'Ecom Team Build (9 agents, 7 phases)',
  description: 'Full ecom build pipeline — decoder → catalyst → [elio + spark + merch] → ecom-cro → figma-synth → token → sequence',
  category: 'ecom',
  estimatedDurationMinutes: 480, // 8 hours wall-clock for moderate brief
  estimatedCostUSD: 30,
  nodes: [
    {
      id: 'phase-1-decoder',
      agent: 'decoder',
      label: 'Brand intelligence (niche audit)',
      prompt: 'Run niche audit per skills/decoder/niche-audit-protocol.md. 5 brands, abbreviated teardown. Output to niche-audits/[niche]-[date].md.',
      timeout: 7200,
      gate: {
        type: 'approval',
        approver: 'catalyst',
        validation: 'handoff.deliverables.decoder_evidence.length >= 3',
        timeout: 3600,
      },
    },
    {
      id: 'phase-2-catalyst',
      agent: 'catalyst',
      label: 'CRO strategy + test prioritization',
      prompt: 'Read decoder niche audit. Produce funnel diagnosis + ICE-scored test roadmap (top 3 tests). Output cro-roadmap.md + per-test specs.',
      depends_on: ['phase-1-decoder'],
      timeout: 7200,
      gate: {
        type: 'auto',
        validation: 'handoff.deliverables.lift_target >= 0.4',
      },
    },
    {
      id: 'phase-3a-elio',
      agent: 'elio',
      label: 'Design specs',
      prompt: 'Per catalyst test specs, produce design specs for PDP/cart/hero. Mobile-first. Hand off slots to spark + merch + ecom-cro.',
      depends_on: ['phase-2-catalyst'],
      parallel_with: ['phase-3b-spark', 'phase-3c-merch'],
      timeout: 14400,
    },
    {
      id: 'phase-3b-spark',
      agent: 'spark',
      label: 'Above-fold copy (3 variants per surface)',
      prompt: 'Per catalyst test specs + decoder niche, produce 3 hero/CTA variants per surface. Voice scorecard ≥8.',
      depends_on: ['phase-2-catalyst'],
      parallel_with: ['phase-3a-elio', 'phase-3c-merch'],
      timeout: 7200,
    },
    {
      id: 'phase-3c-merch',
      agent: 'merch',
      label: 'PDP body + microcopy',
      prompt: 'Per catalyst test specs + decoder niche, produce PDP body (benefits-first) + objection-handling + cart microcopy slot fills.',
      depends_on: ['phase-2-catalyst'],
      parallel_with: ['phase-3a-elio', 'phase-3b-spark'],
      timeout: 14400,
    },
    {
      id: 'gate-3-merge',
      type: 'merge_gate',
      depends_on: ['phase-3a-elio', 'phase-3b-spark', 'phase-3c-merch'],
      gate: {
        type: 'approval',
        approver: ['vega', 'quill'],
        validation: [
          'phase-3a-elio.handoff.validation.mobile_specced === true',
          'phase-3b-spark.handoff.validation.voice_scorecard >= 8',
          'phase-3c-merch.handoff.validation.voice_scorecard >= 8',
        ],
      },
    },
    {
      id: 'phase-4-ecom-cro',
      agent: 'ecom-cro',
      label: 'Mechanics (cart state, abandon triggers, upsell)',
      prompt: 'Per elio surface zones + decoder mechanic patterns, spec cart state machine + abandon triggers + upsell logic. Slot IDs only — no copy strings.',
      depends_on: ['gate-3-merge'],
      timeout: 14400,
      gate: {
        type: 'approval',
        approver: 'catalyst',
        validation: 'handoff.validation.scope_split_clean === true',
      },
    },
    {
      id: 'phase-5-figma-synth',
      agent: 'figma-synth',
      label: 'JSX→.fig + Code Connect',
      prompt: 'Convert elio component specs to Figma file via mcp__claude_ai_Figma__create_new_file + use_figma. Register Code Connect mappings.',
      depends_on: ['phase-4-ecom-cro'],
      timeout: 10800,
      gate: {
        type: 'approval',
        approver: 'vega',
      },
    },
    {
      id: 'phase-6-token',
      agent: 'token',
      label: 'Token additions + Figma var sync',
      prompt: 'Add new tokens per elio + figma-synth requests. Run weekly Figma var sync. Validate contrast.',
      depends_on: ['phase-5-figma-synth'],
      timeout: 5400,
      gate: {
        type: 'auto',
        validation: 'contrast-validator passes (WCAG AA)',
      },
    },
    {
      id: 'phase-7-sequence',
      agent: 'sequence',
      label: 'Lifecycle email sequences',
      prompt: 'Per ecom-cro abandon triggers + brand voice, produce welcome / cart-abandon / post-purchase / win-back / subscription sequences.',
      depends_on: ['phase-4-ecom-cro'], // can run parallel with 5+6
      parallel_with: ['phase-5-figma-synth', 'phase-6-token'],
      timeout: 10800,
      gate: {
        type: 'approval',
        approver: 'quill',
      },
    },
  ],
  finalHandoff: {
    to: 'pod-b-frontend', // or pod-c-frontend for Stack C
    artifact: 'full-ecom-build-spec',
  },
};
```

---

## Training-readiness gate

### Endpoint

`GET /api/dispatch/readiness/:agentId` (new in `Polyglot/src/routes/dispatch.js`)

### Logic

```javascript
async function getReadiness(agentId) {
  // 1. Composite score from last 14 days of agent_runs
  const runs = await db.query(
    `SELECT classification, gate_pass_rate, first_try_success, rework_cycles
     FROM agent_runs
     WHERE agent_id = ? AND timestamp > datetime('now', '-14 days')`,
    [agentId]
  );

  const composite = computeCompositeScore(runs);

  // 2. Patches applied count
  const patchesApplied = await db.query(
    `SELECT COUNT(*) as n FROM training_patches
     WHERE agent_id = ? AND applied = 1`,
    [agentId]
  )[0].n;

  // 3. Probation status
  const agent = await db.query(`SELECT status FROM agents WHERE id = ?`, [agentId])[0];

  // 4. Decision
  const minComposite = 7.0;
  const minPatches = 5;

  const blockers = [];
  if (composite < minComposite) blockers.push(`composite_score ${composite.toFixed(1)} < ${minComposite} threshold`);
  if (patchesApplied < minPatches) blockers.push(`only ${patchesApplied}/${minPatches} minimum patches applied`);
  if (agent.status === 'pip') blockers.push(`agent on PIP — cadence override required`);
  if (agent.status === 'retired') blockers.push(`agent retired — cannot dispatch`);

  const ready = blockers.length === 0;

  return {
    ready,
    composite_score: composite,
    patches_applied: patchesApplied,
    status: agent.status,
    blockers,
    threshold: { composite: minComposite, patches: minPatches },
    mode: getCurrentReadinessMode(), // 'advisory' or 'enforcing'
    timestamp: new Date().toISOString(),
  };
}
```

### Modes

- **W2-W3 — ADVISORY**: pipeline proceeds even if not ready; warning logged + cadence digest
- **W4+ — ENFORCING**: pipeline blocks node; escalate to cadence; cadence can override per run

### Mode toggle

Stored in `~/.claude/org/config.json`:
```json
{
  "readiness_mode": "advisory" | "enforcing",
  "readiness_thresholds": {
    "composite_min": 7.0,
    "patches_min": 5
  }
}
```

Cadence flips to `enforcing` after W4 promotion review.

---

## Pipeline execution flow

### 1. Yash invokes
```bash
# Polyglot UI: Pipelines → "Ecom Team Build" → Run
# OR API: POST /api/orchestrations/run
{
  "templateId": "ecom-team-build",
  "brief": { "client": "client-acme", "niche": "apparel-DTC", ... }
}
```

### 2. Orchestrator pre-flight
- For each node, call `/api/dispatch/readiness/[agent]`
- If any agent not ready (advisory mode) → log warnings, proceed
- If any agent not ready (enforcing mode) → return 423 Locked, list blockers, escalate to cadence

### 3. Per-node execution
- Spawn `claude -p` with agent prompt + brief context
- Capture output handoff JSON
- Validate against `ecom-handoff-schema.md` via `Polyglot/src/lib/handoff-validate.js`
- Store handoff in `agent_runs.metadata`
- Insert `agent_events.event_type='handoff'` to Supabase

### 4. Gate evaluation
- For `gate.type === 'auto'`: run validation expression, pass/fail
- For `gate.type === 'approval'`: await `.waitForApproval()` (60-min timeout default)
- For `gate.type === 'merge_gate'`: wait for all parallel deps, validate each, single approval

### 5. Failure
- Node fails → mark `agent_runs.status='failed'`, log error
- Pipeline pauses on first failure (no cascading)
- Cadence + Yash notified
- Resume after fix via `POST /api/orchestrations/resume/[runId]/[nodeId]`

### 6. Completion
- All phases pass gates → `agent_runs.metadata.final_handoff` populated
- Final artifact location returned to caller (typically `client/specs/` directory)
- Pipeline run logged in `run_history` table

---

## OrgChart UI integration

`Polyglot/client/src/pages/OrgChart.tsx` — add readiness badge next to status badge in member rows:

```tsx
// In renderMemberRow, after status badge:
{member.readiness && (
  <span
    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 whitespace-nowrap border ${
      member.readiness.ready
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
        : member.readiness.composite_score < 5.0
        ? 'bg-red-500/15 text-red-400 border-red-500/30'
        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    }`}
    title={member.readiness.ready
      ? `Ready · composite ${member.readiness.composite_score.toFixed(1)} · ${member.readiness.patches_applied} patches`
      : `Blocked: ${member.readiness.blockers.join('; ')}`
    }
  >
    {member.readiness.ready ? '✓ READY' : `⚠ ${member.readiness.composite_score.toFixed(1)}`}
  </span>
)}
```

Data sourced from `getReadiness(agentId)` batched in `getOrgChart()` response.

---

## File deliverables

| File | Status | Lines | Owner |
|------|--------|-------|-------|
| `Polyglot/src/lib/orchestrations/ecom-team-pipeline.js` | NEW | ~250 | bolt-style infra (or rex direct) |
| `Polyglot/src/lib/handoff-validate.js` | NEW | ~150 | validation against ecom-handoff-schema.md |
| `Polyglot/src/routes/orchestrations.js` | MODIFY | +30 | register pipeline template |
| `Polyglot/src/routes/dispatch.js` | MODIFY | +60 | add readiness endpoint |
| `Polyglot/src/org.js` | MODIFY | +20 | enrich org-chart node with readiness |
| `Polyglot/client/src/lib/api.ts` | MODIFY | +20 | readiness type + getter |
| `Polyglot/client/src/pages/OrgChart.tsx` | MODIFY | +40 | render readiness badge |
| `~/.claude/org/config.json` | NEW | ~30 | readiness_mode + thresholds |
| `~/.claude/agents/{9 ecom agents}.md` | MODIFY | +5 each | reference handoff schema |

---

## Sequencing (W2-W4)

| W | Work | Mode |
|---|------|------|
| W2 | Author this doc + handoff schema. Implement `handoff-validate.js`. Embed schema reference in 9 agent .md files. | Advisory |
| W3 | Implement ecom-team-pipeline.js + register in orchestrations.js. Add readiness endpoint. Wire OrgChart badge. First manual pipeline run. | Advisory |
| W3 end | Run pipeline test with mock brief. Validate end-to-end. | Advisory |
| W4 | Flip readiness_mode to `enforcing`. Run live ecom build with real client brief. Cadence reviews handoff metrics. | Enforcing |
| Post-W4 | Continuous improvement. Pipeline refinement based on agent_runs data. | Enforcing |

---

## Failure modes + recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Decoder produces <3 brands | Gate 1 fails | Pause, decoder retries with extended timeout, escalate after 2 retries |
| Catalyst lift_target <0.4 | Gate 2 fails | Catalyst self-revisits with relaxed niche baseline (per ECOM-CAT-002 lesson) |
| Voice scorecard <8 on copy | Gate 3 partial fail | Quill flags specific copy chunks, spark/merch revises |
| Mobile not specced | Gate 3 partial fail | Elio reverts to mobile-first protocol, blocks until fix |
| Scope split violation | Gate 4 fails | Catalyst rejects PR, redirects to correct agent, logs violation |
| Figma upload fails | Gate 5 detection | figma-synth retries with Anima.app fallback (Plan B from skill file) |
| Token contrast fail | Gate 6 fails | Token re-runs OKLCH ramp with adjusted lightness, alerts vega |
| Sequence voice fail | Gate 7 fails | Quill flags subject-line + body, sequence revises |
| Pipeline timeout | Per-node timeout exceeded | Cadence + Yash notified, manual resume after triage |
| Composite score regression after pipeline | 48h post-completion review | Tutor identifies offending patch, rolls back, alerts cadence |

---

## Cross-references

- Handoff schema: `~/.claude/memory/patterns/good/ecom-handoff-schema.md`
- Curriculum: `~/.claude/memory/curriculum/ecom-team-training-v1.md`
- Mira extraction: `~/.claude/skills/mira/curriculum-extraction-protocol.md`
- Tutor patches: `~/.claude/memory/patterns/good/hr-tutor-curriculum-design.md`
- Polyglot dispatch: `Polyglot/src/routes/dispatch.js`
- Polyglot orchestrations: `Polyglot/src/routes/orchestrations.js`
- Polyglot OrgChart: `Polyglot/client/src/pages/OrgChart.tsx`
- Plan: `~/.claude/plans/so-we-have-to-dynamic-shell.md` Phase 2 Deliverables E + F
