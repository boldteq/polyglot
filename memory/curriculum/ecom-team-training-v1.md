# Ecom Team Training Curriculum v1 — 100 Questions

**Purpose:** Extract Yash's tacit ecom knowledge and convert to Tutor patches that train all 9 ecom agents (decoder, catalyst, elio, token, figma-synth, spark, ecom-cro, merch, sequence). Without this curriculum, agents produce generic "good ecom" output instead of Boldteq-grade ecom.

**Owner:** Yash answers · Mira extracts · Tutor patches · Cadence reviews
**Created:** 2026-04-27
**Schema version:** 1
**Pipeline:** Yash answer → Mira lesson → Supabase `training_patches` (P3) → Sunday batch apply → 48h impact measure → auto-rollback if regression >10%

---

## How to use this file

1. Yash invokes `/train ecom session N` in chat (N = 1..8).
2. Rex reads the corresponding question block from this file.
3. Rex asks all questions for that session in a single chat turn (numbered list).
4. Yash answers inline. Skip allowed → mark `yash_answer: SKIP — research needed`. Brevity OK (1-3 sentences typical).
5. Mira reads each Q+A pair, extracts a lesson, writes back to this file populating `mira_lesson_extracted` field.
6. Mira creates 1-2 `training_patches` rows per Q (one for agent .md, optionally one for skill file). `rollback_content` captured.
7. Sunday batch applies patches. Tuesday impact reviewed.

**Status legend per question:**
- `pending` — not yet asked
- `answered` — Yash answered, Mira yet to extract
- `extracted` — Mira lesson written
- `patched` — Tutor patch created in Supabase
- `applied` — Patch applied + 48h passed (composite_score logged)
- `skipped` — Yash deferred
- `rolled_back` — Patch caused regression, reverted

---

## Session schedule (chat batches)

| # | Focus | Q count | Question IDs |
|---|-------|---------|--------------|
| 1 | Brand voice + decoder | 13 | META-001..003, ECOM-DEC-001..010 |
| 2 | Catalyst CRO strategy | 12 | ECOM-CAT-001..012 |
| 3 | Elio PDP + hero | 12 | ECOM-ELI-001..012 |
| 4 | Elio cart/checkout/motion + token | 14 | ECOM-ELI-013..018, ECOM-TOK-001..008 |
| 5 | Spark + figma-synth | 18 | ECOM-SPK-001..010, ECOM-FIG-001..008 |
| 6 | Merch PDP body + objections | 12 | ECOM-MRC-001..012 |
| 7 | Merch microcopy + ecom-cro | 14 | ECOM-MRC-013..014, ECOM-XCR-001..012 |
| 8 | Sequence | 8 | ECOM-SEQ-001..008 |

**Total: 103 questions** (100 agent-tagged + 3 cross-cutting brand voice).

---
---

# SESSION 1 — Brand Voice + Decoder Priorities (13 Q)

## Cross-cutting brand voice (3 Q — applies to merch + spark + sequence + quill ratification)

```yaml
- id: META-001
  agent: cross-cutting (merch + spark + sequence + quill)
  category: brand-voice-positioning
  question: "What is Boldteq's positioning vs other ecom-build agencies/consultancies (Webstacks, Diviv, Built By, Eight25, etc.)? In 1-2 sentences, what specifically do we promise that they can't?"
  expected_answer_shape: "differentiator + proof + audience"
  reference_kb: "memory/content/brand-voices.md"
  difficulty: foundational
  pass_criteria: "answer names ≥1 specific competitor, ≥1 specific differentiator (not generic 'we care more')"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: META-002
  agent: cross-cutting
  category: brand-voice-tone
  question: "Pick 3 adjectives that DESCRIBE Boldteq voice and 3 that EXPLICITLY DON'T. Example structure — IS: confident, precise, founder-direct. IS NOT: salesy, hedged, agency-corporate."
  expected_answer_shape: "3 IS adjectives + 3 IS-NOT adjectives + brief explanation per pair"
  reference_kb: "memory/content/brand-voices.md"
  difficulty: foundational
  pass_criteria: "6 distinct adjectives, no overlap with banned list (leverage/synergy/innovative/seamless)"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: META-003
  agent: cross-cutting
  category: brand-voice-quality-bar
  question: "When you read a piece of copy/spec output and immediately know it's NOT Boldteq quality, what's the tell? Name 3 specific anti-signals (e.g., 'uses passive voice', 'leads with company history', 'uses words like world-class')."
  expected_answer_shape: "3 concrete anti-signals + why each one breaks brand"
  reference_kb: "memory/content/brand-voices.md"
  difficulty: applied
  pass_criteria: "3 specific signals, each detectable via grep or regex"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

## Decoder questions (10 Q — brand teardown methodology + niche prioritization)

```yaml
- id: ECOM-DEC-001
  agent: decoder
  category: brand-teardown-methodology
  question: "When a brand uses a hero pattern that contradicts your existing decoder library (e.g., Glossier shifts from product hero to lifestyle hero in their next redesign), how should you treat the older entry — re-teardown immediately, demote confidence, or create a new version?"
  expected_answer_shape: "decision rule + freshness threshold + handling of historical pattern"
  reference_kb: "skills/decoder/top-50-dtc-teardown-format.md"
  difficulty: applied
  pass_criteria: "answer addresses re-teardown trigger condition + how prior pattern is preserved/demoted + threshold for 'old enough to invalidate'"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-002
  agent: decoder
  category: niche-priority-order
  question: "Of the 50 brands in the priority queue, which 5 should be teardown FIRST (Week 1, days 1-3) for maximum downstream value to elio/spark/merch? What's the criterion?"
  expected_answer_shape: "5 brands + ranking criterion (depth of patterns / niche representativeness / source-of-imitation)"
  reference_kb: "memory/patterns/good/ecom-brand-teardowns.md"
  difficulty: foundational
  pass_criteria: "5 named brands + non-arbitrary ordering rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-003
  agent: decoder
  category: pattern-promotion-threshold
  question: "Plan says 3+ brands required to promote a pattern from teardown library to validated cro-decoded-patterns. But what if 2 brands show a pattern AND it has decoder-cited 30%+ lift in published case studies? Promote, hold at provisional, or require a third brand?"
  expected_answer_shape: "rule + edge-case handling + escalation path"
  reference_kb: "skills/decoder/pattern-extraction-rubric.md"
  difficulty: edge-case
  pass_criteria: "binary or tiered rule + cited evidence requirement"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-004
  agent: decoder
  category: niche-audit-trigger
  question: "When Catalyst requests a 'beauty niche audit' for a Boldteq client, how many brands should decoder teardown — top 5, top 10, or top 20? What's the time-budget rule?"
  expected_answer_shape: "brand count + per-brand time budget + total wall-clock"
  reference_kb: "skills/decoder/niche-audit-protocol.md"
  difficulty: applied
  pass_criteria: "specific number with rationale tied to client deadline + cost cap"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-005
  agent: decoder
  category: cross-niche-synthesis
  question: "If a pattern (e.g., free-shipping bar threshold $50) appears in apparel + supplements + CPG, can decoder declare it 'universal DTC pattern' or must it stay niche-tagged? What's the cross-niche promotion rule?"
  expected_answer_shape: "rule for cross-niche labeling + minimum niche count + special cases"
  reference_kb: "memory/patterns/good/cro-decoded-patterns.md"
  difficulty: applied
  pass_criteria: "rule cites minimum niche diversity + handles special cases (luxury vs mass-market split)"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-006
  agent: decoder
  category: evidence-rigor
  question: "Decoder MUST capture 8 dimensions per teardown. If a brand's checkout requires login (e.g., Costco), and decoder can't capture without an account, mark it N/A or skip the teardown entirely? What's the policy?"
  expected_answer_shape: "policy on partial teardowns + skip threshold + N/A annotation rules"
  reference_kb: "skills/decoder/top-50-dtc-teardown-format.md"
  difficulty: edge-case
  pass_criteria: "explicit N/A vs skip threshold (e.g., 'must have ≥6 of 8 dimensions to count')"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-007
  agent: decoder
  category: weekly-intel-cadence
  question: "Decoder runs 1 full + 5 quick scans per week. When should that ratio FLEX? E.g., during a Boldteq client onboarding, should decoder pause weekly scans and run 5 fulls instead?"
  expected_answer_shape: "ratio rule + flex trigger + decision authority"
  reference_kb: "agents/decoder.md (Process C)"
  difficulty: applied
  pass_criteria: "trigger conditions + who decides (catalyst? cadence? yash?)"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-008
  agent: decoder
  category: brand-list-evolution
  question: "The top-50 list is fixed in plan. When a NEW DTC unicorn emerges (e.g., a brand that hits $100M ARR after our list was published), how does decoder handle list updates — append, replace lowest-priority, or refuse until quarterly review?"
  expected_answer_shape: "list update mechanism + replacement criterion + frequency"
  reference_kb: "memory/patterns/good/ecom-brand-teardowns.md"
  difficulty: applied
  pass_criteria: "explicit add/replace policy + how priority recomputed"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-009
  agent: decoder
  category: pattern-invalidation
  question: "Catalyst runs an A/B test using a decoder-validated pattern, and the test LOSES (control wins). Does that single failed test invalidate the pattern, or is N=2 / N=3 failures required? What's the demotion threshold?"
  expected_answer_shape: "demotion rule + N-failure threshold + niche-specific vs universal handling"
  reference_kb: "skills/decoder/pattern-extraction-rubric.md (Demotion criteria)"
  difficulty: edge-case
  pass_criteria: "N-failure threshold + niche scoping + record retention"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-DEC-010
  agent: decoder
  category: bias-prevention
  question: "Decoder sees 30 brands using cart-drawer pattern but 20 using cart-page pattern. Both convert similarly in published data. How does decoder avoid majority-bias and surface the cart-PAGE pattern fairly to elio/ecom-cro?"
  expected_answer_shape: "bias-prevention mechanism + how minority patterns surfaced + decoder output structure"
  reference_kb: "skills/decoder/pattern-extraction-rubric.md"
  difficulty: edge-case
  pass_criteria: "explicit fairness rule + tagging structure that prevents majority bias"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# SESSION 2 — Catalyst CRO Strategy (12 Q)

```yaml
- id: ECOM-CAT-001
  agent: catalyst
  category: ICE-weighting
  question: "ICE scoring uses Impact × Confidence × Ease (max 1000). Should the three be equally weighted, or should Impact be 2x weighted vs Ease for ecom (where revenue impact dwarfs implementation cost)?"
  expected_answer_shape: "weight per dimension + rationale"
  reference_kb: "skills/catalyst/ab-test-prioritization.md"
  difficulty: applied
  pass_criteria: "explicit weights summing to 1.0 or fixed multipliers + ecom-specific reasoning"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-002
  agent: catalyst
  category: lift-baseline-source
  question: "40% lift mandate is measured against decoder baseline median. But what if a niche has sparse decoder data (only 3 brands teardown'd)? Does the 40% mandate still apply, or relax to 25%?"
  expected_answer_shape: "rule for low-evidence niches + mandate flex + escalation"
  reference_kb: "memory/patterns/good/ecom-funnel-cro-playbook.md"
  difficulty: edge-case
  pass_criteria: "explicit relaxation rule with N-brand threshold + alternative baseline"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-003
  agent: catalyst
  category: scope-split-edge-case
  question: "Spark wants to test a hero CTA that ALSO requires a new variant selector mechanic (not just text). Split into 2 PRs (spark CTA, ecom-cro mechanic), or single coordinated PR with catalyst as integrator?"
  expected_answer_shape: "PR-split rule + integration responsibility + sequencing"
  reference_kb: "skills/catalyst/scope-split-enforcement.md"
  difficulty: applied
  pass_criteria: "binary rule + integration owner + sequencing logic"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-004
  agent: catalyst
  category: stat-gate-tradeoff
  question: "Stat gates require 14-day minimum + 95% confidence + 10% effect. If a Boldteq client needs an answer in 7 days for a launch deadline, what does catalyst do — declare early winner, run with relaxed gates, or refuse to call?"
  expected_answer_shape: "client-deadline policy + gate-relaxation rules + escalation"
  reference_kb: "skills/catalyst/ab-test-prioritization.md"
  difficulty: edge-case
  pass_criteria: "explicit deadline-pressure handling + which gates are negotiable"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-005
  agent: catalyst
  category: holdout-strategy
  question: "Plan says 90/10 holdout for top tests, 8-week minimum. For Boldteq's first ecom client (small traffic, ~5K visitors/month), is 90/10 holdout viable, or should it be 80/20 or no holdout at all?"
  expected_answer_shape: "traffic-tier rule + holdout sizing + no-holdout fallback"
  reference_kb: "skills/catalyst/ab-test-prioritization.md"
  difficulty: applied
  pass_criteria: "traffic threshold + holdout %s + fallback"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-006
  agent: catalyst
  category: surface-priority-override
  question: "Default surface priority is PDP hero > cart > checkout > post-purchase. For a SUBSCRIPTION-DOMINANT brand (e.g., Athletic Greens clone), should priority shift to subscription toggle FIRST? When?"
  expected_answer_shape: "niche/business-model triggers that override default + new ordering"
  reference_kb: "memory/patterns/good/ecom-funnel-cro-playbook.md"
  difficulty: applied
  pass_criteria: "explicit business-model triggers + reordered priority lists"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-007
  agent: catalyst
  category: scope-violation-escalation
  question: "Scope-split P0 patch says 2 violations from same agent in 30 days → escalate to cadence. What if violations are GENUINE judgment calls (gray-area surface)? Still 2-strike rule, or does catalyst have discretion?"
  expected_answer_shape: "escalation policy + discretion rules + protection against false-positives"
  reference_kb: "skills/catalyst/scope-split-enforcement.md"
  difficulty: edge-case
  pass_criteria: "explicit appeal/discretion mechanism + false-positive protection"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-008
  agent: catalyst
  category: cross-pod-coordination
  question: "Catalyst dispatches elio + spark + merch in parallel. If elio finishes design before spark/merch finish copy, does elio's spec freeze or stay editable? What's the integration dance?"
  expected_answer_shape: "parallel-completion handling + spec-freeze rules + integration window"
  reference_kb: "agents/catalyst.md"
  difficulty: applied
  pass_criteria: "freeze rule + integration window + revision authority"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-009
  agent: catalyst
  category: weekly-report-format
  question: "Weekly CRO report goes to Echo + Yash. What 5 metrics should ALWAYS be in the report, in priority order? E.g., is it 'absolute revenue lift, then % lift, then test count' or different?"
  expected_answer_shape: "5 metrics + priority order + format (table/dashboard/prose)"
  reference_kb: "agents/catalyst.md (Process D)"
  difficulty: foundational
  pass_criteria: "5 specific metrics + ordering rationale"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-010
  agent: catalyst
  category: kill-criteria
  question: "After 60 days of testing on a project, if cumulative funnel lift is <10%, does catalyst declare 'CRO program failed' and pause, or push harder? What's the kill-or-double-down threshold?"
  expected_answer_shape: "60-day evaluation criteria + threshold + decision matrix"
  reference_kb: "agents/catalyst.md (Process E)"
  difficulty: edge-case
  pass_criteria: "explicit numeric threshold + kill/extend/double-down decision tree"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-011
  agent: catalyst
  category: discount-vs-organic-CRO
  question: "Boldteq philosophy on discounting — is discount a valid CRO lever (use freely if it lifts 40%+) or last-resort (preserve margin, prefer organic UX wins)? What's the rule for catalyst recommendations?"
  expected_answer_shape: "discount policy + when allowed + when forbidden"
  reference_kb: "memory/content/brand-voices.md"
  difficulty: foundational
  pass_criteria: "explicit allow/forbid rule + niche-specific exceptions"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-CAT-012
  agent: catalyst
  category: ecom-vs-saas-philosophy
  question: "Catalyst is shared between SaaS CRO concepts and ecom CRO. What's the SHARP DIFFERENCE in approach for ecom that doesn't apply to SaaS — e.g., is it 'always test on traffic, never on intuition' or 'mobile-first dominates'?"
  expected_answer_shape: "ecom-specific principle that differs from SaaS + 1-2 examples"
  reference_kb: "memory/patterns/good/cro-decoded-patterns.md"
  difficulty: applied
  pass_criteria: "principle stated as actionable rule + concrete divergence example"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# SESSION 3 — Elio PDP + Hero (12 Q)

```yaml
- id: ECOM-ELI-001
  agent: elio
  category: pdp-hero-decision
  question: "PDP hero block — gallery on LEFT, info on RIGHT (Allbirds pattern) vs gallery TOP, info BELOW (Glossier mobile-first pattern). What's the default for Boldteq builds, and when does niche flip the default?"
  expected_answer_shape: "default layout + niche-flip triggers (apparel/beauty/tech)"
  reference_kb: "skills/elio/ecom-pdp-design-protocol.md"
  difficulty: applied
  pass_criteria: "binary default + 2-3 niche flip rules with reasoning"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-002
  agent: elio
  category: variant-selector-density
  question: "Apparel PDP has color × size = 24 variant combinations. Display all as clickable swatches (24-button grid), 2-axis dropdown, or color swatches + size buttons (most-common pattern)? At what variant count does pattern shift?"
  expected_answer_shape: "variant-count thresholds + UX pattern per tier (low / medium / high cardinality)"
  reference_kb: "memory/design/ecom/pdp-patterns.md"
  difficulty: applied
  pass_criteria: "explicit threshold (e.g., <8 swatches, 8-20 hybrid, >20 dropdown) + niche exceptions"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-003
  agent: elio
  category: stock-urgency-pattern
  question: "Stock indicators — 'Only 3 left' vs 'Limited stock' vs no indicator at all. When is urgency ETHICAL (real low stock) vs MANIPULATIVE (false scarcity)? Boldteq policy?"
  expected_answer_shape: "policy on real vs fake urgency + threshold for displaying counts"
  reference_kb: "memory/design/ecom/pdp-patterns.md"
  difficulty: foundational
  pass_criteria: "explicit ethical line + threshold for showing counts vs vague text"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-004
  agent: elio
  category: trust-trio-placement
  question: "Trust trio (reviews stars + count, free-shipping promise, returns policy) — ABOVE the ATC button (Allbirds) vs BELOW (Casper). Which is Boldteq default? Niche flip rules?"
  expected_answer_shape: "default placement + niche/skepticism flip rules"
  reference_kb: "memory/design/ecom/trust-social-proof-patterns.md"
  difficulty: applied
  pass_criteria: "binary default + skepticism-tier rules (supplements vs commodities)"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-005
  agent: elio
  category: review-module-density
  question: "PDP reviews module — show 5 most recent (default), 5 most helpful (Amazon style), or 5 with photo (UGC bias)? Default for Boldteq + niche flips?"
  expected_answer_shape: "default sort + secondary sort + niche-specific overrides"
  reference_kb: "memory/design/ecom/pdp-patterns.md"
  difficulty: applied
  pass_criteria: "specific sort defaults + reasoning"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-006
  agent: elio
  category: cross-sell-rail-position
  question: "Cross-sell rail ('You may also like') — at BOTTOM of PDP (default, lowest interrupt) vs MID-SCROLL (between body + reviews, higher visibility)? Default + flip rules?"
  expected_answer_shape: "default position + flip rules (low-priced commodity vs high-priced considered purchase)"
  reference_kb: "memory/design/ecom/pdp-patterns.md"
  difficulty: applied
  pass_criteria: "default + 1-2 flip conditions + reasoning"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-007
  agent: elio
  category: pdp-image-count
  question: "Default PDP image count for apparel — 4 photos (Buck Mason minimal), 8 (most DTC), 15+ (Aritzia full editorial)? When do you scale up vs down?"
  expected_answer_shape: "default count + scale triggers (price tier / category / brand identity)"
  reference_kb: "memory/design/ecom/pdp-patterns.md"
  difficulty: applied
  pass_criteria: "specific default with min/max + scale triggers"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-008
  agent: elio
  category: hero-on-homepage
  question: "Homepage hero — single static (Allbirds), video background (Glossier), or split-hero (2 products side-by-side)? Default for Boldteq + brand-identity triggers?"
  expected_answer_shape: "default + 3 hero-type rules + niche overrides"
  reference_kb: "memory/design/ecom/hero-homepage-patterns.md"
  difficulty: applied
  pass_criteria: "explicit default + flip rules tied to brand archetype"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-009
  agent: elio
  category: hero-headline-position
  question: "Hero text — overlay on image (Glossier), beside image (Allbirds split), or banner above (Apple-style)? Boldteq default and when does layout flip?"
  expected_answer_shape: "default + flip rules"
  reference_kb: "memory/design/ecom/hero-homepage-patterns.md"
  difficulty: applied
  pass_criteria: "default + 2-3 specific flip conditions"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-010
  agent: elio
  category: subscription-toggle-default
  question: "Subscription-eligible product PDP — default selection 'Subscribe' or 'One-time'? Athletic Greens default-subscribes (high-friction default but high LTV). What's Boldteq default and what triggers flip?"
  expected_answer_shape: "default + 2 trigger conditions for flip + churn-risk consideration"
  reference_kb: "memory/design/ecom/subscription-dtc-patterns.md"
  difficulty: applied
  pass_criteria: "binary default + churn-prevention prerequisite for default-subscribe"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-011
  agent: elio
  category: post-purchase-confirmation
  question: "Confirmation page hierarchy — order details FIRST (info-priority) vs upsell module FIRST (revenue-priority) vs delight (thank-you message FIRST)? Boldteq default + niche flip?"
  expected_answer_shape: "default order of zones + flip rule by AOV/repeat-rate"
  reference_kb: "memory/design/ecom/post-purchase-patterns.md"
  difficulty: applied
  pass_criteria: "explicit zone ordering + flip trigger"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-012
  agent: elio
  category: stack-decision
  question: "Boldteq client wants ecom on Shopify — is the default Hydrogen + RR7 (Stack B storefront mode) or themed Liquid (legacy)? When does Liquid still win?"
  expected_answer_shape: "default stack + Liquid-still-wins triggers"
  reference_kb: "memory/stacks/shopify/storefront/INDEX.md"
  difficulty: applied
  pass_criteria: "explicit default + flip conditions (theme marketplace, theme app extensions, etc.)"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# SESSION 4 — Elio Cart/Checkout/Motion + Token (14 Q)

```yaml
- id: ECOM-ELI-013
  agent: elio
  category: cart-drawer-vs-page
  question: "Cart drawer (default, lower friction) vs cart page (more space, Amazon-style). When does Boldteq pick page over drawer? Bulk B2B, configurable products, anything else?"
  expected_answer_shape: "default + 2-3 explicit page-wins triggers"
  reference_kb: "memory/design/ecom/cart-checkout-patterns.md"
  difficulty: applied
  pass_criteria: "default + explicit triggers (cart size, configuration complexity, B2B)"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-014
  agent: elio
  category: free-shipping-threshold
  question: "Free-shipping threshold — Boldteq default $50 (apparel/CPG), $80 (premium), $100 (luxury)? What's the per-niche default and how does AOV influence it?"
  expected_answer_shape: "per-niche thresholds + AOV-based formula or rule"
  reference_kb: "skills/ecom-cro/cart-checkout-mechanics.md"
  difficulty: applied
  pass_criteria: "specific dollar thresholds per niche + AOV-derived formula"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-015
  agent: elio
  category: checkout-step-count
  question: "Single-page checkout (default, mobile-best) vs multi-step (more guidance for complex configurations). When does multi-step win? Configurable products, B2B, high-AOV?"
  expected_answer_shape: "default + multi-step triggers"
  reference_kb: "memory/design/ecom/cart-checkout-patterns.md"
  difficulty: applied
  pass_criteria: "default + 2-3 multi-step triggers with AOV/complexity thresholds"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-016
  agent: elio
  category: motion-budget
  question: "Motion budget — total animation duration on a typical PDP shouldn't exceed N seconds of cumulative motion or risk feeling slow. What's N? Per micro-interaction max?"
  expected_answer_shape: "cumulative motion budget per surface + per-interaction max"
  reference_kb: "skills/elio/ecom-motion-interaction-protocol.md"
  difficulty: applied
  pass_criteria: "explicit ms budgets per surface + per-interaction caps"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-017
  agent: elio
  category: mobile-breakpoint-priority
  question: "Mobile-first specs — at 375px viewport (smallest iPhone), what's the LAST element to fall off-screen if width is constrained — image, ATC, headline, price? Order of priority?"
  expected_answer_shape: "ranked element priority + responsive degradation order"
  reference_kb: "skills/elio/mobile-ecom-design-protocol.md"
  difficulty: applied
  pass_criteria: "explicit ranked list of elements"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-ELI-018
  agent: elio
  category: design-system-bridge
  question: "When elio's design needs a token that token agent hasn't created (e.g., a new gradient), elio waits for token to add OR ships with an inline value as a 'temp token'? Workflow + escalation?"
  expected_answer_shape: "blocking vs non-blocking workflow + temp-token policy + escalation timeline"
  reference_kb: "agents/elio.md"
  difficulty: applied
  pass_criteria: "explicit workflow + token-debt cleanup mechanism"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-001
  agent: token
  category: brand-color-from-vision
  question: "Brand brief gives a hex like '#FF6B35'. Token agent should translate that to OKLCH and generate ramp 50-900. What's the ramp formula — equal lightness steps, perceptually-uniform via OKLCH math, or tied to specific use cases?"
  expected_answer_shape: "ramp generation formula + lightness step rule + per-step naming"
  reference_kb: "skills/token/design-tokens-architecture.md"
  difficulty: applied
  pass_criteria: "specific formula or library reference + step values"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-002
  agent: token
  category: contrast-gate-strictness
  question: "WCAG 2.1 AA requires 4.5:1 (body) and 3:1 (UI/large). For Boldteq builds, do we strictly enforce AA, push to AAA (7:1), or relax for brand-identity colors (e.g., Pinterest red on white only 3.7:1)?"
  expected_answer_shape: "Boldteq strictness + brand-identity exception rule"
  reference_kb: "skills/token/design-tokens-architecture.md"
  difficulty: applied
  pass_criteria: "explicit threshold + exception process"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-003
  agent: token
  category: polaris-bridge-priority
  question: "Stack B has Polaris admin AND custom storefront. When the storefront brand color CONFLICTS with Polaris ('teal storefront vs Polaris navy'), which wins — Polaris (forced consistency for merchant trust) or Storefront (customer-facing primacy)?"
  expected_answer_shape: "default winner + override rule"
  reference_kb: "skills/token/polaris-storefront-bridge.md"
  difficulty: applied
  pass_criteria: "binary default + override mechanism"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-004
  agent: token
  category: figma-sync-direction
  question: "Code-wins is the default for Figma var sync. But if a designer makes a deliberate Figma change (cleared with vega), does code-wins still apply by default, or does the designer-led change auto-promote to code?"
  expected_answer_shape: "default direction + override workflow + freshness window"
  reference_kb: "skills/token/figma-variable-sync.md"
  difficulty: applied
  pass_criteria: "explicit override workflow + handoff rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-005
  agent: token
  category: token-addition-gate
  question: "Elio requests a new token (e.g., 'sunset-orange-hover'). Token agent triages — extend existing primary ramp, add new semantic, or reject? What's the gate criterion?"
  expected_answer_shape: "triage rules + 3-tier decision (extend/add/reject)"
  reference_kb: "skills/token/design-tokens-architecture.md"
  difficulty: applied
  pass_criteria: "explicit gate criteria + reuse-first principle"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-006
  agent: token
  category: dark-mode-default
  question: "Most ecom storefronts don't have dark mode (vs SaaS dashboards). Should Boldteq build dark mode by default for ecom, opt-in by client, or never (light only)?"
  expected_answer_shape: "default + opt-in trigger + per-niche rules"
  reference_kb: "memory/design/standards/dark-mode.md"
  difficulty: applied
  pass_criteria: "default + per-niche rules"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-007
  agent: token
  category: typography-pairings
  question: "Default font stack for ecom — sans-only (Inter / Manrope, modern DTC), serif heading + sans body (Aritzia / Cuyana, premium), all-serif (luxury)? Default + per-niche flip?"
  expected_answer_shape: "default pairing + 2-3 per-niche overrides"
  reference_kb: "memory/design/core/typography.md"
  difficulty: foundational
  pass_criteria: "specific font defaults + niche overrides"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-TOK-008
  agent: token
  category: token-deprecation
  question: "30-day rule: unused token → propose removal. But what if a token is used in ONE rare flow (e.g., loading-state-shimmer)? Keep, remove, or move to a 'rare' namespace?"
  expected_answer_shape: "rare-use policy + namespace-tier rules"
  reference_kb: "skills/token/design-tokens-architecture.md"
  difficulty: edge-case
  pass_criteria: "explicit rule for rare-but-valid tokens"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# SESSION 5 — Spark + Figma-Synth (18 Q)

```yaml
- id: ECOM-SPK-001
  agent: spark
  category: hero-formula-default
  question: "Default hero headline formula for unfamiliar niche — pain-solution ('Stop X. Start Y'), outcome+time ('Glowing skin in 14 days'), or anti-positioning ('Not your grandfather's wool')? Pick one default + flip rules."
  expected_answer_shape: "default formula + flip rules per niche"
  reference_kb: "skills/spark/hero-headline-formulas.md"
  difficulty: applied
  pass_criteria: "explicit default + niche-flip rules"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-002
  agent: spark
  category: cta-verb-priority
  question: "Of these CTA verbs — Shop, Try, Get, Add, Build — which is Boldteq's #1 default? When do you flip to others?"
  expected_answer_shape: "default verb + flip triggers"
  reference_kb: "skills/spark/cta-copy-variants.md"
  difficulty: foundational
  pass_criteria: "default verb + reasoning + flip rules"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-003
  agent: spark
  category: banned-words-strictness
  question: "Banned words list (leverage/synergy/innovative/seamless/robust/cutting-edge/next-gen/best-in-class). Are these AUTO-REJECT (regex grep blocks PR) or HEURISTIC (catalyst flags)? Boldteq enforcement?"
  expected_answer_shape: "enforcement mechanism + override mechanism"
  reference_kb: "skills/spark/cta-copy-variants.md"
  difficulty: foundational
  pass_criteria: "binary auto-reject vs heuristic + override path"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-004
  agent: spark
  category: variant-count-per-test
  question: "A/B test on hero copy — 2 variants (control + 1 challenger), 3 (control + 2), or 4+ (multivariate)? What's Boldteq default for stat-power balance?"
  expected_answer_shape: "default variant count + traffic-tier rules"
  reference_kb: "skills/spark/cta-copy-variants.md"
  difficulty: applied
  pass_criteria: "default + traffic-based scaling"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-005
  agent: spark
  category: niche-intensity-matrix
  question: "Apparel + beauty = HIGH above-fold density (visual + headline + trust). Tech = LOW (spec-driven). Where does HOME sit — high (lifestyle photography) or medium (configurator-friendly)?"
  expected_answer_shape: "intensity tier per niche + reasoning"
  reference_kb: "skills/spark/above-fold-conversion-psychology.md"
  difficulty: applied
  pass_criteria: "explicit tier per niche + 1-line rationale"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-006
  agent: spark
  category: hero-secondary-cta
  question: "Hero often has primary + secondary CTA. What's the SECONDARY default — 'See lookbook' (storytelling), 'Watch video' (demo), 'Read story' (founder bio)? Niche flip?"
  expected_answer_shape: "default secondary + niche flips"
  reference_kb: "skills/spark/cta-copy-variants.md"
  difficulty: applied
  pass_criteria: "default + 2-3 flip conditions"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-007
  agent: spark
  category: badge-usage
  question: "Hero badges ('Best seller', 'New', 'Just dropped') — show always when applicable, only on featured products, or only during launches? Boldteq default?"
  expected_answer_shape: "policy + use-case triggers"
  reference_kb: "skills/spark/hero-headline-formulas.md"
  difficulty: applied
  pass_criteria: "policy + when-to-show rules"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-008
  agent: spark
  category: trust-microcopy-slot
  question: "Below-CTA trust trio — 'Free shipping', '30-day returns', 'No subscription required'. Order of priority — which first if only space for one? Niche flip?"
  expected_answer_shape: "default first-trust + niche flips"
  reference_kb: "skills/spark/above-fold-conversion-psychology.md"
  difficulty: applied
  pass_criteria: "explicit ordering + per-niche overrides"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-009
  agent: spark
  category: emoji-policy
  question: "Spark CTAs — emoji ever (e.g., 'Shop now 🛍️'), or never? Some niches (fashion/CPG) use emoji effectively, others (luxury/tech) don't. Boldteq default + niche policy?"
  expected_answer_shape: "default + per-niche policy"
  reference_kb: "memory/content/brand-voices.md"
  difficulty: foundational
  pass_criteria: "explicit default + niche flips"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SPK-010
  agent: spark
  category: localization-variants
  question: "Spark generates English-first copy. For multi-locale builds (EU/UK/AU clients), does spark generate localized variants per request, or does that route to a translation specialist? Boldteq workflow?"
  expected_answer_shape: "scope rule + handoff to translation"
  reference_kb: "agents/spark.md"
  difficulty: applied
  pass_criteria: "explicit scope + handoff target"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-001
  agent: figma-synth
  category: jsx-ast-coverage
  question: "JSX→.fig pipeline parses TS AST. For components with GENERIC types (e.g., `Button<T>`), what's figma-synth's default — fall-back heuristic, manual review flag, or skip?"
  expected_answer_shape: "default + escalation path"
  reference_kb: "skills/figma-synth/jsx-to-fig-pipeline.md"
  difficulty: edge-case
  pass_criteria: "explicit handling + escalation"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-002
  agent: figma-synth
  category: code-connect-mapping-naming
  question: "Naming convention for `.figma.tsx` mapping files — `[component].figma.tsx` (alongside source) vs `[component].mapping.tsx` (in `__figma__/` dir)? Boldteq default?"
  expected_answer_shape: "naming + location"
  reference_kb: "skills/figma-synth/code-connect-mapping-protocol.md"
  difficulty: foundational
  pass_criteria: "explicit pattern"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-003
  agent: figma-synth
  category: ecom-mappings-library-scope
  question: "Canonical ecom mappings library has 10 components (ProductCard, VariantSelector, AddToCartCTA, CartDrawer, etc.). When a project has a custom component (e.g., FilterChip), does figma-synth add it to canonical library or keep project-local?"
  expected_answer_shape: "promotion criteria + reuse threshold"
  reference_kb: "skills/figma-synth/ecom-code-connect-mappings.md"
  difficulty: applied
  pass_criteria: "explicit promotion rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-004
  agent: figma-synth
  category: breaking-change-protocol
  question: "Pod frontend deletes a `variant: 'success'` prop from ProductCard. figma-synth detects drift on weekly audit. What's the same-day action — auto-update mapping, alert vega, alert designer using that frame?"
  expected_answer_shape: "action sequence + notification path + 24h SLA"
  reference_kb: "skills/figma-synth/code-connect-mapping-protocol.md"
  difficulty: applied
  pass_criteria: "step-by-step protocol"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-005
  agent: figma-synth
  category: deliverable-figma-vs-frame
  question: "When client requests a Figma deliverable, do they get full project file with all components or just the deliverable frame? Default + IP-protection rules?"
  expected_answer_shape: "default deliverable + IP rules + Boldteq library protection"
  reference_kb: "memory/patterns/good/figma-synth-workflow.md"
  difficulty: applied
  pass_criteria: "explicit policy + IP guardrails"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-006
  agent: figma-synth
  category: token-injection
  question: "When figma-synth uploads JSX→.fig, tokens come from token agent's variable map. What if the project's tokens.css has DRIFT (not yet synced to Figma)? Use stale Figma vars, push fresh, or block upload?"
  expected_answer_shape: "drift handling + sync-first vs ship-stale rule"
  reference_kb: "skills/figma-synth/jsx-to-fig-pipeline.md"
  difficulty: applied
  pass_criteria: "explicit rule + sync timing"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-007
  agent: figma-synth
  category: variant-explosion
  question: "Component with 4 variants × 3 sizes × 2 states = 24 figma variants. Figma performance degrades at 50+ variants per component-set. What's figma-synth's split rule — keep all-in-one, split by size, split by state?"
  expected_answer_shape: "split rule + threshold"
  reference_kb: "skills/figma-synth/jsx-to-fig-pipeline.md"
  difficulty: applied
  pass_criteria: "explicit threshold + split axis"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-FIG-008
  agent: figma-synth
  category: storybook-dependency
  question: "JSX→.fig works best with project Storybook. If project has NO Storybook, does figma-synth refuse, fall back to static screenshot, or auto-generate storybook stub?"
  expected_answer_shape: "fallback chain + setup-cost decision"
  reference_kb: "skills/figma-synth/jsx-to-fig-pipeline.md"
  difficulty: applied
  pass_criteria: "explicit fallback + when each tier triggers"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# SESSION 6 — Merch PDP Body + Objections (12 Q)

```yaml
- id: ECOM-MRC-001
  agent: merch
  category: pdp-body-order-strict
  question: "PDP body MUST follow benefits-first → bullets → objections → spec table. If a Boldteq client INSISTS on feature-list-first ('our customers are engineers, they want specs'), do you obey or push back? Where's the line?"
  expected_answer_shape: "policy + push-back script + escalation"
  reference_kb: "skills/merch/pdp-body-structure.md"
  difficulty: edge-case
  pass_criteria: "explicit policy + diplomatic push-back + escalation point"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-002
  agent: merch
  category: paragraph-length
  question: "PDP benefit paragraphs ≤60 words each (per skill file). For LUXURY brands (Gucci, Goop), can paragraphs go to 100 words for storytelling, or stay strict 60? Niche flex?"
  expected_answer_shape: "default cap + luxury flex rule + max ceiling"
  reference_kb: "skills/merch/pdp-body-structure.md"
  difficulty: applied
  pass_criteria: "explicit ceiling + luxury exception"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-003
  agent: merch
  category: bullet-count-default
  question: "Benefit bullets: 3-5 per skill file. Apparel often does 3 (sleek), supplements 5 (loaded with proof points). Default + niche flips?"
  expected_answer_shape: "default count + niche overrides"
  reference_kb: "skills/merch/pdp-body-structure.md"
  difficulty: foundational
  pass_criteria: "specific count per niche"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-004
  agent: merch
  category: objection-count
  question: "Objection-handling section: 3-5 questions. For HIGH-CONSIDERATION purchases (mattresses, technical gear), does merch go 7-10 objections, or stay strict 5 with rest in FAQ?"
  expected_answer_shape: "default + high-consideration flex + FAQ split"
  reference_kb: "skills/merch/objection-handling-frameworks.md"
  difficulty: applied
  pass_criteria: "default + flex rule + FAQ overflow logic"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-005
  agent: merch
  category: niche-objection-prioritization
  question: "Apparel objections: fit > shrinkage > itch > returns. What's the priority order for SUPPLEMENTS — efficacy/safety/interactions/refunds, or different?"
  expected_answer_shape: "ranked objection list per niche"
  reference_kb: "skills/merch/objection-handling-frameworks.md"
  difficulty: applied
  pass_criteria: "explicit ranking with rationale"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-006
  agent: merch
  category: spec-table-tone
  question: "Spec table is utility format — no marketing voice. But what about ingredients lists (LATIN names) or material specs (technical jargon)? Use jargon (precision) or simplify (accessibility)?"
  expected_answer_shape: "policy + niche-specific terminology rules"
  reference_kb: "skills/merch/pdp-body-structure.md"
  difficulty: applied
  pass_criteria: "explicit terminology rule + per-niche override"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-007
  agent: merch
  category: faq-vs-objection-split
  question: "FAQ section is separate from inline objections. What goes inline (top objections inline = top 3-5) vs FAQ (everything else)? Decision criterion?"
  expected_answer_shape: "split criterion + decision rule"
  reference_kb: "skills/merch/pdp-body-structure.md"
  difficulty: applied
  pass_criteria: "explicit decision rule + criteria for inline vs FAQ"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-008
  agent: merch
  category: founder-story-inclusion
  question: "Glossier/Drunk Elephant lead with founder story on PDP. Boldteq default — yes (storytelling lifts conversion), no (skip on PDP, save for /about), or only for premium niches?"
  expected_answer_shape: "default + niche-specific overrides"
  reference_kb: "memory/design/ecom/pdp-patterns.md"
  difficulty: applied
  pass_criteria: "default + 2-3 niche overrides"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-009
  agent: merch
  category: returns-copy-tone
  question: "Returns copy — confident-warm ('Don't love it? Send it back, free.') vs corporate-precise ('Free returns within 30 days of purchase via return portal.')? Boldteq default + brand-tier override?"
  expected_answer_shape: "default tone + brand-tier override"
  reference_kb: "skills/merch/objection-handling-frameworks.md"
  difficulty: applied
  pass_criteria: "explicit tone default + brand-tier rules"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-010
  agent: merch
  category: review-extraction-policy
  question: "Customer reviews on PDP — merch can extract STANDOUT review quotes for body copy (with permission). Default — extract liberally (with attribution), only for case studies, or never?"
  expected_answer_shape: "extraction policy + attribution rules"
  reference_kb: "memory/content/ecom/pdp-copy-patterns.md"
  difficulty: applied
  pass_criteria: "explicit policy + attribution + permission workflow"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-011
  agent: merch
  category: comparison-tables
  question: "Comparison table on PDP ('vs competitors' or 'vs old way'). Boldteq builds — yes for high-consideration, never (smug/risky), or only for the brand's #1 product?"
  expected_answer_shape: "policy + when allowed + ethical guardrails"
  reference_kb: "memory/design/ecom/pdp-patterns.md"
  difficulty: applied
  pass_criteria: "explicit policy + use-case triggers"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-012
  agent: merch
  category: scarcity-language
  question: "Scarcity language ('Only 50 made', 'Limited drop'). Boldteq policy — only when REAL (verifiable inventory), tolerate marketing-soft scarcity, or never use?"
  expected_answer_shape: "policy + verification requirement + ethical guardrails"
  reference_kb: "memory/content/brand-voices.md"
  difficulty: foundational
  pass_criteria: "explicit policy + verification rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# SESSION 7 — Merch Microcopy + Ecom-CRO Mechanics (14 Q)

```yaml
- id: ECOM-MRC-013
  agent: merch
  category: cart-empty-state
  question: "Cart empty state copy — playful ('Your cart's feeling lonely' Chubbies-style) vs functional ('Your cart is empty')? Boldteq default + brand-archetype flip?"
  expected_answer_shape: "default + brand-archetype overrides"
  reference_kb: "memory/content/ecom/cart-checkout-microcopy.md"
  difficulty: foundational
  pass_criteria: "default + 2-3 brand-archetype overrides"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-MRC-014
  agent: merch
  category: error-state-personality
  question: "Card-declined error — gentle ('Card was declined. Try again or use a different card.') vs blunt ('Declined. Try another card.')? Boldteq default tone for friction-heavy errors?"
  expected_answer_shape: "tone default + friction-tier rules"
  reference_kb: "memory/content/ecom/cart-checkout-microcopy.md"
  difficulty: applied
  pass_criteria: "explicit tone rule per friction tier"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-001
  agent: ecom-cro
  category: cart-state-machine-edge
  question: "Cart drawer is OPEN, user hits browser back button. Drawer closes (default) or back-navigation cancels and drawer stays open? Boldteq default for desktop vs mobile?"
  expected_answer_shape: "default per platform + UX consistency rationale"
  reference_kb: "skills/ecom-cro/cart-checkout-mechanics.md"
  difficulty: applied
  pass_criteria: "explicit per-platform rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-002
  agent: ecom-cro
  category: free-ship-progress-niche
  question: "Free-shipping bar threshold per niche — apparel $50, supplements $40, beauty $35, CPG $25? What's the formula AOV-based or category-based?"
  expected_answer_shape: "niche-specific thresholds + formula or rule"
  reference_kb: "skills/ecom-cro/cart-checkout-mechanics.md"
  difficulty: applied
  pass_criteria: "specific dollars per niche + AOV-derivation rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-003
  agent: ecom-cro
  category: upsell-eligibility-strict
  question: "Cart upsell row eligibility — 'not in cart, in stock, related-by-tag'. What's the FALLBACK if no related-by-tag products in stock — show bestsellers, hide row, or show 'recently viewed'?"
  expected_answer_shape: "fallback hierarchy"
  reference_kb: "skills/ecom-cro/upsell-bundle-patterns.md"
  difficulty: applied
  pass_criteria: "explicit fallback chain"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-004
  agent: ecom-cro
  category: subscription-default-criterion
  question: "Subscription-default-on (Athletic Greens style) ONLY when churn-prevention is strong. What metrics define 'strong' — cancel-flow conversion ≥30%, cancel rate ≤8%, or other?"
  expected_answer_shape: "specific churn-prevention thresholds"
  reference_kb: "skills/ecom-cro/subscription-mechanics.md"
  difficulty: applied
  pass_criteria: "explicit numeric thresholds"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-005
  agent: ecom-cro
  category: abandon-trigger-conditions
  question: "Cart-abandon trigger: cart>$30 + 60min + email captured + no-prior-7d. What's the MINIMUM cart value where abandon-recovery is worth firing — $20, $30, $50? AOV-based?"
  expected_answer_shape: "minimum value + AOV-derivation"
  reference_kb: "skills/ecom-cro/cart-checkout-mechanics.md"
  difficulty: applied
  pass_criteria: "explicit minimum + AOV rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-006
  agent: ecom-cro
  category: post-purchase-upsell-eligibility
  question: "Post-purchase 1-click upsell: same payment method on file + 30-min window + single product + higher-AOV than cart. Boldteq adds — must be complementary (not replacement)? Yes/no?"
  expected_answer_shape: "complementary rule + replacement-product handling"
  reference_kb: "skills/ecom-cro/upsell-bundle-patterns.md"
  difficulty: applied
  pass_criteria: "explicit complementary rule + edge-case handling"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-007
  agent: ecom-cro
  category: order-bump-position
  question: "Pre-purchase order bump position — above payment (default) vs above order review (less aggressive). Boldteq default + when does aggressive position win?"
  expected_answer_shape: "default position + aggressive flip rule"
  reference_kb: "skills/ecom-cro/upsell-bundle-patterns.md"
  difficulty: applied
  pass_criteria: "explicit default + flip"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-008
  agent: ecom-cro
  category: bundle-discount-formula
  question: "Bundle discount tiers — 2-pack 10%, 3-pack 15%, 5-pack 20%? Or AOV-based? Specific formula by niche?"
  expected_answer_shape: "tier formula + niche overrides"
  reference_kb: "skills/ecom-cro/upsell-bundle-patterns.md"
  difficulty: applied
  pass_criteria: "explicit tier formula + niche rules"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-009
  agent: ecom-cro
  category: variant-stockout-handling
  question: "Variant selector — color X is sold out. Display option DISABLED (greyed out, decoder pattern) vs HIDDEN (don't show)? Boldteq default + reasoning?"
  expected_answer_shape: "default + reasoning"
  reference_kb: "skills/ecom-cro/cart-checkout-mechanics.md"
  difficulty: foundational
  pass_criteria: "binary default + UX reasoning"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-010
  agent: ecom-cro
  category: cancellation-save-strategy
  question: "Subscription cancel flow save offers (Athletic Greens style): pause > reduce frequency > discount > swap > confirm cancel. What's the ORDER if it has to fit in 3 steps not 5?"
  expected_answer_shape: "3-step compressed sequence"
  reference_kb: "skills/ecom-cro/subscription-mechanics.md"
  difficulty: applied
  pass_criteria: "specific 3-step ordering with rationale"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-011
  agent: ecom-cro
  category: shipping-method-default
  question: "Default shipping method on checkout — Standard (free if threshold met) preselected, OR no preselect (force user pick)? Boldteq default for friction reduction?"
  expected_answer_shape: "default + reasoning"
  reference_kb: "skills/ecom-cro/cart-checkout-mechanics.md"
  difficulty: foundational
  pass_criteria: "binary default + UX reasoning"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-XCR-012
  agent: ecom-cro
  category: returning-customer-detection
  question: "Returning customer detection — ON typing email (auto-show 'Welcome back' immediately, requires real-time API), OR after submit (less responsive but cheaper)? Default + cost tradeoff?"
  expected_answer_shape: "default + cost-tier rule"
  reference_kb: "skills/ecom-cro/cart-checkout-mechanics.md"
  difficulty: applied
  pass_criteria: "explicit default + scaling rule"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# SESSION 8 — Sequence (8 Q)

```yaml
- id: ECOM-SEQ-001
  agent: sequence
  category: welcome-series-cadence
  question: "Welcome series 5 emails over 14 days (per skill file). For LUXURY brands (slower cadence), should it stretch to 21 or 30 days? Or stay strict 14?"
  expected_answer_shape: "default cadence + luxury flex rule"
  reference_kb: "skills/sequence/lifecycle-sequence-templates.md"
  difficulty: applied
  pass_criteria: "default + niche flex"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SEQ-002
  agent: sequence
  category: cart-abandon-discount-cap
  question: "Cart-abandon discount escalation — email 1 (no discount), email 2 (10% if cart>$40), email 3 (15%). Boldteq cap at 15% (don't go to 20%) — strict, or flex per niche?"
  expected_answer_shape: "cap + flex rules"
  reference_kb: "skills/sequence/cart-abandon-recovery-playbook.md"
  difficulty: applied
  pass_criteria: "explicit cap + flex condition"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SEQ-003
  agent: sequence
  category: win-back-stop-rule
  question: "Win-back sequence: day 60, 90, 120 — STOP at 120, no more emails (respect unsubscribe). Boldteq strict, or do we run a final 'farewell' at day 180?"
  expected_answer_shape: "stop rule + farewell-email policy"
  reference_kb: "skills/sequence/lifecycle-sequence-templates.md"
  difficulty: foundational
  pass_criteria: "explicit stop + farewell policy"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SEQ-004
  agent: sequence
  category: subscription-pre-renewal-timing
  question: "Pre-renewal email — 3 days before charge (default). For monthly subscriptions, 3 days = ~10% of cycle. For QUARTERLY subscriptions, 3 days = 3% of cycle. Should pre-renewal scale with frequency (e.g., 7 days for quarterly)?"
  expected_answer_shape: "scaling rule + per-frequency timing"
  reference_kb: "skills/sequence/subscription-nurture-patterns.md"
  difficulty: applied
  pass_criteria: "explicit scaling rule + per-frequency days"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SEQ-005
  agent: sequence
  category: subject-line-style
  question: "Subject lines: ≤50 chars. Style — declarative ('Your cart's still warm'), question ('Forget something?'), or {{firstName}}-personalized ('Yash, here's a nudge')? Boldteq default + niche flips?"
  expected_answer_shape: "default style + niche variations"
  reference_kb: "skills/sequence/cart-abandon-recovery-playbook.md"
  difficulty: applied
  pass_criteria: "default + niche overrides"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SEQ-006
  agent: sequence
  category: post-purchase-review-request-timing
  question: "Review request email — day 14 (default, allows usage). For supplements where effects take 30+ days, should it be day 30 or day 14 with day-30 reminder?"
  expected_answer_shape: "niche-based timing + reminder logic"
  reference_kb: "skills/sequence/lifecycle-sequence-templates.md"
  difficulty: applied
  pass_criteria: "per-niche timing + reminder logic"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SEQ-007
  agent: sequence
  category: send-time-optimization
  question: "Best send time for cart-abandon email 2 (24h after) — Tue-Thu 10am local (default). For luxury/B2B brands, does timing shift to weekdays-only mornings, or doesn't matter?"
  expected_answer_shape: "default + niche-specific timing rules"
  reference_kb: "skills/sequence/cart-abandon-recovery-playbook.md"
  difficulty: applied
  pass_criteria: "explicit default + niche flips"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied

- id: ECOM-SEQ-008
  agent: sequence
  category: cross-sequence-priority
  question: "User triggers BOTH cart-abandon AND post-purchase nurture (purchases something else while cart-abandon is mid-sequence). Which sequence wins — cancel cart-abandon, run both, or pause cart-abandon until post-purchase ends?"
  expected_answer_shape: "priority rule + interaction handling"
  reference_kb: "skills/sequence/lifecycle-sequence-templates.md"
  difficulty: edge-case
  pass_criteria: "explicit priority + interaction rules"
  yash_answer: ""
  mira_lesson_extracted: ""
  tutor_patch_id: ""
  status: applied
```

---

# Wrap-up — Final Review (after Session 8)

After all 103 questions answered + Mira extracted + Tutor patched, run final integration review:

1. **Cross-agent consistency check:** Read patches per surface (e.g., PDP) across elio + spark + merch + ecom-cro. Ensure no contradictions (e.g., spark says "Add to Bag" for apparel but elio defaulted layout assumes "Add to Cart" generic).
2. **Unresolved deferrals:** Count `status: skipped` rows. Schedule follow-up Session 9 if >5.
3. **Composite score impact:** Sum composite_score deltas across all agents. Target: cumulative +1.5 from baseline.
4. **First end-to-end test:** Dispatch ecom-team-pipeline with mock brief. Validate handoff JSONs across 9 agents.
5. **Mira gold-pattern extraction:** From all answers, identify 5 highest-leverage patterns to promote into `~/.claude/memory/patterns/good/` permanently.

---

## Status tracking

```yaml
sessions_completed: 8 (CURRICULUM COMPLETE)
total_questions: 103
questions_answered: 103
questions_extracted: 103
patches_applied: 21 (1 deferred to Polyglot W3)
patches_rolled_back: 0
team_composite_score_at_start: TBD (capture before Session 1)
team_composite_score_current: TBD
last_updated: 2026-04-27 (post-session-1)
```

---

## Cross-references
- Plan: `~/.claude/plans/so-we-have-to-dynamic-shell.md` Phase 2
- Tutor patch system: `~/.claude/memory/patterns/good/hr-tutor-curriculum-design.md`
- Mira lesson extraction: `~/.claude/skills/mira/curriculum-extraction-protocol.md` (NEW)
- Handoff schema: `~/.claude/memory/patterns/good/ecom-handoff-schema.md` (NEW)
- Coordination: `~/.claude/memory/patterns/good/ecom-team-coordination.md` (NEW)
- Supabase: `training_cycles`, `training_patches`, `training_signals` per `agent-ops-schema.md`
