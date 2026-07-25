# 04 — Design taste, measurably

Verified 2026-07-25. Re-verify every 30 days with `sources.json`.

Precedence: `01-platform-truth-2026.md` outranks this file. Where a rule here conflicts
with a Shopify Theme Store requirement, the requirement wins and this file is wrong.

Every rule carries an evidence tag. **Tags must never drift upward.**

| Tag | Means | A gate may |
|---|---|---|
| `[E]` | Dated study, enforced platform requirement, or published measurement. Traceable to a primary source in `sources.json`. | **block** |
| `[P]` | Named practitioners agree. No measurement exists. | **warn** |
| `[H]` | Our taste. Defensible, unmeasured, labelled so nobody mistakes it for a finding. | **note** only |

---

## A. The correction that reframes this file

The brief was "all gates green still produced an AI-looking page," with the implied
diagnosis *too generic*. **The evidence points the other way, and we follow the evidence.**

Tuch et al. (2012; n=59 and n=82; exposures 17–1000 ms) found visual **prototypicality** —
looking like a typical example of its category — was the strongest predictor of first
impression at ηp²=.812, ahead of complexity at ηp²=.581. Lowest complexity plus highest
prototypicality scored highest. Baughan et al. (CHI 2020, n=165) replicated forward:
complexity degrades search efficiency and recall, not merely liking.

**Therefore: do not penalise conventional ecommerce layout, symmetric centring, or low
visual complexity.** Header with nav, cart affordance top-right, product grid, footer with
policies — that is the shape users reward. A rule that rewards asymmetry, overlap or
full-bleed *for their own sake* is optimising against the evidence.

What actually makes a generated store read as AI-built is four separately measurable things:

1. **Duplication** — the generator's fingerprint is more legible than the brand.
2. **Thinness** — copy and imagery that cannot answer a purchase question.
3. **Missing institutional signals** — no address, no phone, no policies, no real reviews.
4. **Borrowed assets** — stock photography, placeholder images, framework-default colour.

Every rule below serves one of those four. Anything that merely penalises *plain* is `[H]`.

---

## B. Differentiation is architectural, not cosmetic `[E]`

Shopify's Theme Store requirements, verbatim:

> "Cosmetic or additive alterations are insufficient. For example: spacing tweaks, color or
> typography swaps, gradients, shape dividers, background effects or blurs, animation or
> transition tweaks, or adding a few settings or sections to an existing codebase."

Uniqueness must be embedded at the **architectural level**. This is the cleanest available
definition of branded-versus-template and it is an enforced commercial standard, not an
opinion. Adopt it as ours.

**Operational test — B1.** No two stores we generate may be inter-convertible through theme
settings alone. If store B is reachable from store A by changing colours, fonts and spacing,
they are one store and both fail.

**Operational test — B2.** Serialise each generated theme to (a) the ordered list of section
schema `type` values, (b) a tag+sorted-class token stream per template, (c) the CSS custom
property block. Cosine-compare against every prior generation. **Warn at >0.90, reject at
>0.95.** Calibrate the floor against the spread among genuinely distinct human-built themes
before enforcing — an untuned threshold will either never fire or always fire.

---

## C. Platform-binding numbers `[E]`

Non-negotiable. Sourced from shopify.dev, re-verified 2026-07-25.

| # | Rule | Value |
|---|---|---|
| C1 | Lighthouse performance, averaged over home + product + collection, desktop and mobile | **≥ 60** |
| C2 | Lighthouse accessibility, same pages | **≥ 90** |
| C3 | Speed-score weighting — the collection page carries the most weight | `[(p × 31) + (c × 33) + (h × 13)] / 77` |
| C4 | Minified JS bundle | **≤ 16 KB** |
| C5 | Resource hints per template | **≤ 2** |
| C6 | Colour settings in `settings_schema.json` | **≥ 4**, every background paired with a foreground |
| C7 | `color_palette` — one per theme, in `settings_schema.json` only | **2–20 colours** |
| C8 | Body text contrast | **≥ 4.5:1** |
| C9 | Large text (>18pt), icons, input borders | **≥ 3:1** |
| C10 | Touch targets — requirements say 24×24, accessibility best-practice says 44×44. **Build to 44 to satisfy both.** | **≥ 44×44 CSS px** |
| C11 | Headings | h1–h6 **visually different from each other** |
| C12 | Typography | `font_picker` from Shopify's library. **Self-hosted/custom fonts are not accepted.** Load bold, italic and bold-italic via `font_modify`. |
| C13 | Core Web Vitals at the 75th percentile (Google, not Shopify-enforced) | LCP ≤ **2.5 s**, INP ≤ **200 ms**, CLS ≤ **0.1** |
| C14 | No Sass/SCSS. No pre-minified CSS/JS except ES6 and third-party libs. Scripts hosted on Shopify. | — |

**C12 has a design consequence worth stating plainly:** because exotic typefaces are barred,
brand distinctiveness in a Theme-Store-legal theme must come from **pairing, scale, weight and
rhythm** — not from the typeface itself. Plan for that constraint instead of fighting it.

---

## D. Craft rules `[P]`

Named-practitioner and standards-body consensus. Warn, do not block.

**Typography**
- D1 — Measure 45–75 characters; target 60–66. WCAG ceiling is 80. Set with `ch`.
- D2 — `line-height` unitless, **≥ 1.5** for body. Scale with measure: ~1.65 at 66ch, ~2.0 at 45ch.
- D3 — Leading ratio falls as size rises: ~1.50 at 16px down to ~1.12 at 57px. Headings are not body text with a bigger number.
- D4 — WCAG 2.2 text-spacing must survive: line-height 1.5×, paragraph spacing 2×, letter-spacing 0.12em, word-spacing 0.16em, with no loss of content.
- D5 — One ratio for the type scale. A ratio equal to the body line-height is the safest default.
- D6 — Body text on a storefront is **≥ 16px**. Never smaller.
- D7 — Never `font-optical-sizing: none`.

**Spacing and layout**
- D8 — Every spacing value ≥16px is a multiple of **4px**. Below 16px, 2px steps are allowed.
- D9 — Card grids use `repeat(auto-fit, minmax(<min>, 1fr))`. Components respond with `@container`, not viewport media queries.
- D10 — `text-wrap: balance` only on blocks of ≤6 lines. `text-wrap: pretty` as progressive enhancement only — no Firefox support.

**Colour**
- D11 — Author in **OKLCH**. `oklch()` and `color-mix()` are Baseline widely available (May 2023); relative colour syntax is Baseline newly available (Sept 2024) — treat as enhancement, not foundation.
- D12 — Never carry a palette by rotating HSL hue. HSL hue is not perceptually uniform; equal hue steps produce unequal lightness.
- D13 — Generate contrast-first: pick the required ratio, solve for the colour. Do not pick a colour then hope it passes.
- D14 — A 12-step role ramp (Radix model) beats an arbitrary tint set: steps have jobs — app background, subtle background, component, hover, active, border subtle, border, border hover, solid, solid hover, low-contrast text, high-contrast text.
- D15 — **Do not ship APCA.** Its licence prohibits commercial use without a signed agreement, and WCAG 3.0 (WD 2026-03-03) does not name it. WCAG 2.2 (Rec. 2024-12-12) ratios are the shippable standard.

**Motion**
- D16 — Respond to `prefers-reduced-motion` (Baseline widely available since Jan 2020). Not optional.
- D17 — Durations: ~100 ms reads as instant; 200–300 ms is the standard transition band; beyond ~400 ms motion starts to cost the user. NN/g and Material's token tables converge here.
- D18 — `linear()` easing is Baseline widely available (Dec 2023). Scroll-driven animations are **limited** (no Firefox) and View Transitions are **newly available** (Oct 2025) — both are enhancement-only, never load-bearing.
- D19 — There is no single `easing.emphasized` bezier in Material 3. If a rule cites one, it is wrong.

**Hierarchy**
- D20 — Hierarchy travels on **weight and colour**, not size alone. Expect ≥3 distinct text colours in a neutral ramp and ≥2 font weights. A page with one weight and one text colour has surrendered two of its three hierarchy channels.
- D21 — Prominence must track content priority. A top-decile-area element wrapping a single four-word text node is an inversion.

---

## E. House taste `[H]`

Ours. Unmeasured. Note-only, never blocking, and never described to a client as best practice.

- E1 — One signature element, repeated. A store should have exactly one thing you could describe over the phone.
- E2 — Vary section density deliberately. Not every band needs the same vertical padding — but see §A: uniform rhythm is not itself evidence of AI.
- E3 — Prefer a real type pairing with genuine contrast over one family at five weights.
- E4 — An owned accent colour that is not the framework default. See `05-ai-tells.md` AT-1 for the detectable version.
- E5 — Art-directed imagery over catalogue-on-white, where the merchant can supply it.

---

## F. Scoring a rendered screenshot `[E]`

For the Lens vision-judge. Reinecke et al. (CHI 2013; n=548, 450 sites, 500 ms exposure)
published a computable feature set — the most defensible automated aesthetic scorer available,
and it runs on a screenshot.

- **Complexity model (R²=.65):** quadtree decomposition by minimum colour/intensity entropy → leaf count; symmetry, balance and equilibrium of leaves; modified X-Y-cut space decomposition → text-group count and image-area count; text area; non-text area; colourfulness; hue.
- **Colourfulness model (R²=.78):** HSV mean hue/saturation/value; percentage of pixels matching each of the 16 W3C named colours; CIELab entropy; Hasler & Süsstrunk colourfulness; Yendrikhovskij colourfulness.
- **Combined → aesthetic appeal: R²=.48** with demographics.

Two honest caveats, both of which must stay attached to any score we compute:
**~50% of variance is unexplained**, and the models were fitted on 2013-era websites. A
fine-tuned CNN does better (Webthetics 2019: r=0.85 vs r=0.59 for hand-crafted features),
but the Reinecke features are *interpretable* — we can tell a merchant why a page scored low.
Prefer interpretable. Report the score as a signal, never as a verdict.

---

## G. What this file does not establish

Stated plainly so no one over-claims it later.

1. **There is no study of AI-generated storefronts.** Not one. Everything here transfers from adjacent domains — computational aesthetics, fraud detection, credibility research, copy homogenisation. Each transfer is an inference.
2. **The serious design press has not written the "AI slop visual signature" article.** Five differently-phrased searches returned content mills exclusively. The credible base is two NN/g expert reviews plus a computational-aesthetics literature that predates the phenomenon.
3. **Expert humans cannot reliably agree on "is this slop"** — Cohen's κ from −0.15 to 0.29 among trained annotators. We are automating a judgement humans make inconsistently. Use an ensemble with a structured rubric; never a single scalar verdict.
4. **Roughly half the intuitive proxies have no evidence at all** — distinct-type-sizes-used-vs-defined, identical vertical rhythm, identical card radius, gradient angle uniformity, saturation clustering, glassmorphism, zero asymmetry, tricolon layouts. They may be correct. They are `[H]`.
