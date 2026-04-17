# CRO Decoded Patterns — Top Brand Conversion Playbook

**Created:** 2026-04-18, v1.0 (skeleton — populated by `decoder` Cohort 4).
**Owned by:** `decoder` agent (writes), `catalyst` (CRO Lead, reviews), `spark` / `landing-cro` / `ecom-cro` (read on every task).
**Plan:** `~/.claude/plans/hr-team-agent-can-melodic-dolphin.md` — Yash locked "All three: Top 50 + weekly Decoder + on-demand niche" methodology to hit 40%+ conversion.

---

## How this file is built

This file is a LIVING playbook of conversion patterns extracted from top brands. Three sources:

1. **One-time top-50 audit** (Cohort 4 priority project) — Decoder teardowns 50 elite brands across 5 categories (10 SaaS, 10 Ecom, 10 B2B, 10 DTC, 10 Mobile-first). Result: ~2000-3000 lines added.
2. **Weekly teardown** — Decoder picks 1 new brand per week, teardowns landing/pricing/onboarding/email, extracts patterns. Adds ~50-100 lines/week.
3. **On-demand niche audits** — Before starting a new client project, Decoder audits top 5 competitors in that niche. Adds ~200 lines per niche.

**Quality gate:** Mira's 1-5 scoring framework. Patterns scoring < 3 (vague, generic, unsourced) are rejected. Only ≥ 3 enters this file.

---

## Top-50 brand list (Cohort 4 priority project)

### SaaS (10) — best for B2B SaaS landing pages, pricing, onboarding
1. Linear (linear.app) — minimalist, dark-by-default, keyboard-first messaging
2. Stripe (stripe.com) — developer-first, code-in-hero, "trusted by" social proof
3. Notion (notion.so) — flexibility narrative, template-driven, free-tier funnel
4. Vercel (vercel.com) — performance-as-pitch, ship-fast messaging
5. Framer (framer.com) — design-tool positioning, free-templates funnel
6. Posthog (posthog.com) — open-source moat, founder-led brand
7. Clerk (clerk.com) — developer-trust, code-snippet hero, integration breadth
8. Resend (resend.com) — minimalist, dev-first, template-marketplace funnel
9. Supabase (supabase.com) — open-source positioning, comparison-to-firebase
10. Webflow (webflow.com) — design-without-code, customer-showcase heavy

### Ecom (10) — best for product pages, cart, checkout flows
1. Shopify (shopify.com) — empower-merchants, GMV social proof
2. Allbirds (allbirds.com) — sustainability story, comfort hierarchy
3. Glossier (glossier.com) — community-driven, UGC-heavy
4. Casper (casper.com) — risk-reversal-heavy (100-day trial), comparison content
5. Brooklinen (brooklinen.com) — luxury-at-direct-pricing, bundle psychology
6. Warby Parker (warbyparker.com) — try-at-home, social mission
7. Away (awaytravel.com) — travel-lifestyle imagery, USB charger as hook
8. Bombas (bombas.com) — buy-one-give-one, sock category education
9. Outdoor Voices (outdoorvoices.com) — community + IRL events, recreation messaging
10. Gymshark (gymshark.com) — influencer marketing native, founder story

### B2B (10) — best for enterprise SaaS, sales-led funnels
1. Salesforce (salesforce.com) — customer-success-stories heavy
2. HubSpot (hubspot.com) — free-tools-as-funnel, "academy" content moat
3. Intercom (intercom.com) — conversational copy, product-led messaging
4. Asana (asana.com) — work-management positioning, role-based personas
5. Slack (slack.com) — productivity-narrative, integration breadth, team focus
6. Figma (figma.com) — collaboration-first, free-for-individuals funnel
7. Loom (loom.com) — async-comm pitch, "save 1hr/day" promise
8. Calendly (calendly.com) — friction-reducer pitch, testimonial-heavy
9. Zapier (zapier.com) — integration-count flex, no-code positioning
10. Airtable (airtable.com) — flexible-database pitch, template gallery funnel

### DTC (10) — best for consumer brand storytelling
1. Liquid Death — punk/edgy brand voice, viral-marketing native
2. Athletic Greens (AG1) — single-product focus, athlete endorsement
3. Dollar Shave Club — origin-story-heavy, subscription psychology
4. Manscaped — humor + masculinity, problem-solution-product structure
5. Olipop — soda-but-healthy, ingredient transparency
6. Magic Spoon — adult-cereal positioning, retro nostalgia
7. Caraway — non-toxic kitchenware, color-as-story
8. Our Place — multicultural cooking, "Always Pan" hero product
9. Fishwife — premium tinned fish, design-led packaging
10. Graza — squeeze-bottle olive oil, kitchen-utility positioning

### Mobile-first (10) — best for consumer mobile app onboarding
1. Robinhood — fee-free trading, simplicity-first onboarding
2. Cash App — peer-to-peer first, gradual feature reveal
3. Duolingo — gamification, streak-driven retention, mascot personality
4. Headspace — calm-focused brand, paid trial after limited free
5. Calm — sleep-stories hero, celebrity-narrator hook
6. Strava — community + leaderboards, segments-as-feature
7. Spotify — discover-engine pitch, free-tier ads-driven funnel
8. TikTok — algorithm-discovery, instant-personalization onboarding
9. Instagram — visual-first feed, stories-as-feature
10. BeReal — anti-feed positioning, FOMO-driven daily prompts

---

## Pattern extraction template (decoder's output format)

For each brand teardown, decoder writes a section like this:

```markdown
## [Brand Name] — [Category]

**Decoded:** [date], by decoder.
**Quality score:** [Mira 1-5].
**Source:** [URL screenshots in `~/.claude/memory/cro-evidence/<brand>/`].

### Hero (above-the-fold)
- Headline: "[exact text]"
- Subhead: "[exact text]"
- CTA primary: "[text]" + visual treatment (color, size, position)
- CTA secondary: "[text]" or none
- Visual: [describe — product shot, dashboard, illustration, video]
- Why it works: [pattern extracted, 2-3 sentences]

### Social proof block
- Type: [logos | numbers | testimonials | reviews | case studies]
- Position: [above-fold | below-fold | sticky | inline]
- Pattern: [what specifically — e.g., "5-logo strip with 'Trusted by 10K+ teams' framing"]

### Pricing page
- Tier count: [3 | 4 | "Talk to sales"-only]
- Default-highlighted tier: [name]
- Annual/monthly toggle: [yes / no / default]
- Risk reversal: [free trial | money-back | no card required]
- Comparison table: [yes / no / minimal]
- Psychology pattern: [decoy | anchor | bundle | etc.]

### Onboarding (post-signup)
- Steps: [count]
- Time-to-aha: [seconds]
- Use of placeholder/sample data: [yes / no]
- Empty-state copy quality: [good / generic]
- Use of progress indicator: [yes / no]

### Email sequences (if observed)
- Welcome: [time-to-send, subject line, key CTA]
- Activation: [trigger, send delay, CTA]
- Nurture cadence: [frequency]
- Pattern: [what makes it work]

### Friction reducers
- [List specific micro-patterns: tooltips, contextual help, undo, etc.]

### URLs
- Landing: [url]
- Pricing: [url]
- Onboarding screenshots: [internal storage]
```

---

## Cross-brand pattern library (the actual playbook)

After 10+ brand teardowns in a category, decoder synthesizes cross-brand patterns into this section. Example placeholders:

### Hero patterns that convert (target: ≥ 7/10 brands use)
- TBD (decoder fills after Cohort 4 audit)

### Pricing patterns that convert
- TBD

### Onboarding patterns that convert
- TBD

### Email patterns that convert
- TBD

### CTA copy patterns that convert
- TBD

### Friction-reduction patterns
- TBD

---

## How spark / landing-cro / ecom-cro use this file

Each CRO agent loads this file (read-only). When given a task:

1. Identify the niche (B2B SaaS? Ecom? DTC?)
2. Find 3 most-similar brands in this file
3. Extract their pattern (hero structure, CTA copy formula, social proof type, etc.)
4. Apply to the current project, adapting to brand voice
5. A/B test variant against control (catalyst designs the test)

If the niche has < 3 similar brands in the file, request decoder to do an on-demand niche audit BEFORE proceeding.

---

## Quality control (Mira scores every entry)

Mira scores each pattern entry on 4 dimensions, target ≥ 3 average:

| Dimension | 1 (rejected) | 3 (acceptable) | 5 (excellent) |
|---|---|---|---|
| Specificity | "Use clear copy" | "Hero headlines should be ≤8 words" | "Stripe's hero: 'Financial infrastructure for the internet' = 5 words, outcome-led, technical-but-aspirational" |
| Evidence | "Saw this somewhere" | "Observed on stripe.com 2026-04" | "stripe.com home page, captured 2026-04-18, screenshot at /cro-evidence/stripe/hero.png" |
| Actionability | "Be inspirational" | "Use outcome-led headlines" | "When SaaS targets developers, lead with infrastructure metaphor + 5-word headline + code-in-hero" |
| Scope | "Always" | "For B2B SaaS" | "For B2B SaaS targeting devs at companies with $1M+ ARR (developer audience)" |

Patterns scoring < 3 average are rejected. Decoder rewrites or moves to draft folder.

---

## Anti-patterns (NEVER do these)

1. **Never copy a brand's exact copy.** Patterns are FORMULAS. Copy is plagiarism.
2. **Never extract from brands you can't reach in market.** Decoding Apple is interesting but useless if you're not Apple-scale.
3. **Never use a pattern without source evidence.** All patterns must link to a screenshot in cro-evidence folder.
4. **Never skip the cross-brand synthesis.** Single-brand patterns are observations. Cross-brand patterns are playbooks.
5. **Never apply a pattern outside its tested scope.** Mobile-first onboarding ≠ B2B onboarding.
6. **Never let the file balloon past 5000 lines.** When it exceeds, move oldest single-brand sections to archive, keep cross-brand synthesis fresh.
7. **Never skip Mira quality scoring.** Score < 3 = rejected. No exceptions.
8. **Never let CRO agents A/B test without baseline data.** Need a control with stable conversion measurement.
9. **Never extract patterns from brands the user explicitly asked to avoid.** Yash override in feedback.md wins.
10. **Never present a pattern as "proven" without quantitative source.** Numbers required: "Increased conversion 23%" needs evidence.

---

## (Cohort 4 will populate the actual brand teardowns — this skeleton ships with Week 0)
