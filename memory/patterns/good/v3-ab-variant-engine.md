# v3 A/B Variant Engine

**Owner:** catalyst (primary) + ecom-cro (mechanic-axis variants)
**Source:** v3 Production Design System §5
**Adopted:** 2026-04-30 — Hard rules

---

## Single-axis discipline (HARD REJECT MULTI-AXIS)

A variant is a controlled deviation from the baseline along ONE axis. catalyst auto-rejects variants mutating >1 axis. Multi-axis = uninterpretable outcomes.

```ts
type VariantAxis =
  | 'hero_visual'        // same copy, different visual treatment
  | 'headline'           // different value-prop framings
  | 'cta_copy'           // different button text
  | 'cta_color'          // saturated vs muted
  | 'social_proof_type'  // logos vs testimonials vs numbers
  | 'pricing_structure'  // 3-tier vs 4-tier vs comparison
  | 'layout_pattern'     // hero stack vs split vs centered
  | 'form_length'        // 1-step vs multi-step
  | 'trust_placement';   // hero vs near-CTA vs footer
```

---

## Default axis per surface (Boldteq adopted)

| Surface | Default suggested axis |
|---------|------------------------|
| Hero / homepage | `headline` |
| PDP | `hero_visual` |
| Pricing | `pricing_structure` |
| Cart | `cta_copy` |
| Checkout | `form_length` |
| Listing/category | `layout_pattern` |
| Social proof zones | `social_proof_type` |
| Trust strips | `trust_placement` |

catalyst auto-suggests on variant request. Designer can override.

---

## Variant artifact

```ts
interface Variant {
  id:           string;
  axis:         VariantAxis;
  control:      ComponentSpec;
  treatment:    ComponentSpec;
  hypothesis:   Hypothesis;
  status:       'draft' | 'running' | 'concluded';
  outcomes?:    VariantOutcome;
}
```

---

## Hypothesis schema (ALL 6 FIELDS REQUIRED)

```ts
interface Hypothesis {
  statement:           string;       // "Headline 'Ship in a week' will outperform 'Build faster' for SaaS founders"
  rationale:           string;       // why we believe this
  primary_metric:      string;       // 'signup_rate'
  secondary_metrics:   string[];     // 'time_on_page', 'scroll_depth'
  min_detectable_effect: number;     // 0.10 = 10% relative lift
  confidence_target:   number;       // 0.95
  expected_sample:     number;       // computed from baseline + MDE
}
```

catalyst rejects variant without all 6 required fields. Pre-registration prevents p-hacking.

---

## Sample size calculation

```ts
function planExperiment(baseline: number, mde: number, alpha = 0.05, power = 0.8): SamplePlan {
  const n = computeSampleSize(baseline, mde, alpha, power);
  return {
    sample_per_arm: n,
    total_sample:   n * 2,
    estimated_days: Math.ceil(n / dailyTrafficEstimate()),
    can_decide_early: true,    // Bayesian early stopping enabled
  };
}
```

---

## Bayesian conclusion (THRESHOLDS LOCKED)

```ts
function concludeVariant(v: Variant, samples: SampleData): VariantOutcome {
  const ctrl_posterior = Beta(samples.control.successes + 1, samples.control.failures + 1);
  const trt_posterior  = Beta(samples.treatment.successes + 1, samples.treatment.failures + 1);

  const p_treatment_wins = monteCarloProbability(trt_posterior, ctrl_posterior, 100_000);
  const expected_lift = (samples.treatment.rate - samples.control.rate) / samples.control.rate;

  let winner: 'control' | 'treatment' | 'inconclusive';
  if (p_treatment_wins > 0.95) winner = 'treatment';
  else if (p_treatment_wins < 0.05) winner = 'control';
  else winner = 'inconclusive';

  return { winner, p_treatment_wins, expected_lift, sample_size: samples.total };
}
```

**Boldteq winner declaration:** P(treatment wins) > 0.95 AND MDE >= 0.10.

---

## Winner promotion (HUMAN-RATIFIED)

Auto-promote when:
1. `winner === 'treatment'`
2. `expected_lift >= 0.10`
3. vega ratifies (design lead approval)

```ts
async function promoteWinner(variant: Variant): Promise<void> {
  if (variant.outcomes?.winner !== 'treatment') return;
  if (variant.outcomes.expected_lift < 0.10) return;
  if (!await vega.ratify(variant)) return;

  // Promote to baseline in project state
  await memory.project_state.update(variant.project_id, {
    components: replaceComponent(project.components, variant.control.id, variant.treatment),
  });

  // Update pattern library with proof
  await memory.pattern_library.recordWin({
    pattern: variant.treatment.pattern_id,
    sample: variant.outcomes.sample_size,
    lift:   variant.outcomes.expected_lift,
  });
}
```

vega-gate prevents silent visual changes from auto-promotion.

---

## Generator example — headline variants

```ts
function generateHeadlineAlternatives(spec: DesignSpec, ctx: BusinessContext): Variant[] {
  const baseline = currentHeadline(spec);

  return [
    { axis:'headline', control: baseline,
      treatment: { ...baseline, text: framingByJTBD(ctx.audience.jobs_to_be_done[0]) },
      hypothesis: { statement: 'JTBD-specific framing converts better than benefit-led', ... } },
    { axis:'headline', control: baseline,
      treatment: { ...baseline, text: framingByOutcome(ctx.audience.motivations[0]) },
      hypothesis: { statement: 'Outcome-led framing converts better than feature-led', ... } },
  ];
}
```

---

## Cross-references

- Memory outcome storage: `v3-memory-architecture.md`
- Business context for hypothesis input: `v3-business-context-resolver.md`
- Control panel variant board: `v3-control-panel-spec.md`
- Existing CRO playbook: `~/.claude/memory/patterns/good/cro-decoded-patterns.md`
