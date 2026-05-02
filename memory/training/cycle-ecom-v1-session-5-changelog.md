# Ecom Training Cycle v1 — Session 5 Changelog

**Date:** 2026-04-27
**Session:** 5 of 8 (Spark + figma-synth)
**Format:** AskUserQuestion popup, all 18 selected "Recommended"
**Patches composed:** 20

## Per-Q lessons

### ECOM-SPK-001 — Hero headline default
**Decision:** Outcome+time formula default. Flips: pain-solution (skeptical), anti-positioning (disruption), curiosity (novelty drops).
Patches: `skills/spark/hero-headline-formulas.md`

### ECOM-SPK-002 — CTA verb default
**Decision:** 'Shop' default universal. Flips: 'Try' (risk-aversion), 'Get' (commitment), 'Add' (PDP ATC).
Patches: `skills/spark/cta-copy-variants.md`

### ECOM-SPK-003 — Banned words enforcement
**Decision:** Auto-reject regex. PR blocked. NO override.
Patches: `agents/spark.md`, `Polyglot/src/lib/handoff-validate.js` (W3 ship)

### ECOM-SPK-004 — Variant count by traffic
**Decision:** 3 variants <50K visitors/mo. 4 variants 50K+. 5+ multivariate only at 100K+.
Patches: `skills/spark/above-fold-conversion-psychology.md`

### ECOM-SPK-005 — Niche intensity (HOME)
**Decision:** Medium-High. Lifestyle photography heavy + outcome-led copy. Less density than apparel/beauty, more than tech.
Patches: `skills/spark/above-fold-conversion-psychology.md`

### ECOM-SPK-006 — Hero secondary CTA niche-flipped
**Decision:** 'See lookbook' (apparel/home), 'Watch video' (tech/sleep), 'Read story' (founder-led/supplements). Always exists as 2nd low-friction CTA.
Patches: `skills/spark/cta-copy-variants.md`

### ECOM-SPK-007 — Badge usage
**Decision:** Show only on featured products + during launches. NEVER on every PDP. 'Best seller' top 5-10% revenue. 'New' <30 days. 'Just dropped' 7-day launch window.
Patches: `skills/spark/hero-headline-formulas.md`, `agents/spark.md` Anti-Patterns

### ECOM-SPK-008 — Trust microcopy order
**Decision:** Free shipping > 30-day returns > niche-specific third. Free-ship wins on first impression (#1 cart-abandonment cause).
Patches: `skills/spark/cta-copy-variants.md`

### ECOM-SPK-009 — Emoji policy
**Decision:** NEVER in hero/CTA. Allowed sparingly (1 max) in lifecycle email subjects + sale promotions only.
Patches: `agents/spark.md`, `agents/sequence.md`, `memory/content/brand-voices.md`

### ECOM-SPK-010 — Localization
**Decision:** Spark generates EN + transcreation brief. Translation specialist (or client vendor) does locale adaptation. Spark verifies brand-voice equivalence on output.
Patches: `agents/spark.md`

### ECOM-FIG-001 — Generic types fallback
**Decision:** Heuristic fallback (extract concrete instances from usage) + flag for vega manual review. Don't block pipeline.
Patches: `skills/figma-synth/jsx-to-fig-pipeline.md`

### ECOM-FIG-002 — Mapping naming
**Decision:** `[component].figma.tsx` co-located alongside source. Standard Figma Code Connect doc convention.
Patches: `skills/figma-synth/code-connect-mapping-protocol.md`

### ECOM-FIG-003 — Library promotion
**Decision:** Promote custom component to canonical library when used in 3+ projects. Same threshold as decoder pattern promotion.
Patches: `skills/figma-synth/ecom-code-connect-mappings.md`

### ECOM-FIG-004 — Breaking change protocol
**Decision:** Auto-update mapping + Slack-notify vega + alert designers using affected Figma frames via in-Figma comment. 24h SLA.
Patches: `skills/figma-synth/code-connect-mapping-protocol.md`

### ECOM-FIG-005 — Figma deliverable scope
**Decision:** Deliverable frame only — Boldteq library stays internal. IP protection. Client gets: design frames + Code-Connect-mapped components + tokens. NO library/playbooks/unrelated work.
Patches: `memory/patterns/good/figma-synth-workflow.md`, `agents/figma-synth.md`

### ECOM-FIG-006 — Token drift handling
**Decision:** BLOCK upload, force token agent emergency sync (4h SLA). Auto-retry after sync. Escalate to vega if sync fails.
Patches: `skills/figma-synth/jsx-to-fig-pipeline.md`, `skills/token/figma-variable-sync.md` (cross-ref)

### ECOM-FIG-007 — Variant explosion split
**Decision:** Split at 30 variants (well below 50 Figma perf cliff). Axis: STATE (default/hover/active/disabled). Each state-variant = own component-set.
Patches: `skills/figma-synth/jsx-to-fig-pipeline.md`

### ECOM-FIG-008 — No Storybook fallback
**Decision:** Auto-generate temp Storybook stub via `npx storybook init` + scaffold stories from JSX. Log to project tech-debt for proper formalization later.
Patches: `skills/figma-synth/jsx-to-fig-pipeline.md`

## Stats
- Q answered: 18/18
- Patches composed: 20
- Patches applied: 20
- Drift: 0

## Cross-ref
- Curriculum: `~/.claude/memory/curriculum/ecom-team-training-v1.md` Session 5
