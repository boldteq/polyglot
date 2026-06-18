# PagePilot Craft Proof — one archetype, two themes, crafted not pasted

**What this proves:** the PagePilot library (theme-agnostic HTML/CSS source-of-truth) is *crafted* into a theme per the `pagepilot-theme-crafting-protocol.md` — **never pasted** — and the SAME concept adapts differently per theme environment.

Archetype: **ARCH-PP-01** (universal DTC advertorial PDP) → `main` buy module → `benefits` (benefit-grid) → `stats` (quantified-social-proof) → `faq` → `related` cross-sell.

## Dawn 15.4.1 path (`dawn/`)
- **Reuse-first:** buy module → native `main-product`, benefit-grid → native `multicolumn`, FAQ → native `collapsible-content`, cross-sell → native `related-products` — all REUSE/CONFIGURE (80% of zones).
- **BUILD-CUSTOM only where Dawn has no native section:** `sections/pp-stat-circles.liquid` (animated percentage rings + gradient stat cards). Built ENTIRELY on Dawn's built-in CSS vars + color scheme — **zero hardcoded color/radius/width** (5× `var(--color-*)`, 2× `var(--media-radius)`, 4× `var(--page-width)`).
- `templates/product.pagepilot-advertorial.json` assembles the ARCH-PP-01 order. `merchant-editability.md` documents the custom section's customizer controls.
- **Validation (run, not eyeballed):**
  - `shopify theme check` on the Dawn base + these files → **0 offenses on the crafted files** (the only 2 repo errors are pre-existing Dawn `featured-product.liquid` locale-schema baseline, unrelated).
  - `node theme-toolkit/scripts/check-inbuilt-css-first.mjs` (SECTIONS_DIR=pagepilot-craft-proof/dawn/sections) → **PASS, 0 blockers** (no hardcoded-dup-of-var, no Tailwind/`data-block-id`, `{% schema %}` present).
  - `node theme-toolkit/scripts/check-reuse-map.mjs` (in `dawn/`) → **PASS** (80% reuse; scratch custom justified).

## Minimog 6.0.0 path (`minimog/`)
- **100% REUSE/CONFIGURE, zero custom:** buy module → product main, benefit-grid → `icon-box`, quantified-social-proof → `icon-box` (static big-number — the animated ring is *dropped* on Minimog rather than built custom, reuse-first), FAQ → `collapsible-tabs`, cross-sell → `product-recommendations`, sticky → `mobile-sticky-bar` (footer group). All sections verified present in the Minimog 6.0.0 base.
- `templates/product.pagepilot-advertorial.json` is a representative configure-only template (exact block keys set in the customizer). `node theme-toolkit/scripts/check-reuse-map.mjs` (in `minimog/`) → **PASS** (100% reuse).

## The point
Same PagePilot concept → **Dawn: a custom section built on theme vars** (no native exists); **Minimog: pure reuse of an active section**. The library never ships as a paste — it is crafted to the theme + branding every time, inbuilt-CSS-first. Copy/stats/reviews are placeholders flagged "bind real data."

> Validation re-run: `cd pagepilot-craft-proof/dawn && shopify theme check` (after copying `sections/pp-stat-circles.liquid` + `templates/*.json` into a Dawn theme), then `check-inbuilt-css-first.mjs` + `check-reuse-map.mjs`.
