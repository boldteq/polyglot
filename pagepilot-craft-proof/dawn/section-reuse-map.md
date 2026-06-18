# Section Reuse Map — PagePilot ARCH-PP-01 crafted on Dawn 15.4.1

Proof that the same PagePilot library adapts to Dawn by CRAFTING (never pasting): native sections REUSE/CONFIGURE; only the no-native concept is BUILD-CUSTOM, built on Dawn's own CSS vars.

Counts: {reused: 2, configured: 2, extended: 0, custom: 1}
Custom split: {library: 0, scratch: 1}

| Design frame (PagePilot concept) | Theme section | Rung |
|---|---|---|
| buy-module-hero | main-product | CONFIGURE |
| benefit-grid | multicolumn | CONFIGURE |
| quantified-social-proof | pp-stat-circles | CUSTOM |
| objection-handling-faq | collapsible-content | CONFIGURE |
| cross-sell-aov | related-products | REUSE |
| (template assembly) | product.pagepilot-advertorial.json | REUSE |

Reuse+configure share: 4/5 mapped content zones = 80% (≥70% ✓).

scratch custom justification: `pp-stat-circles` — blueprint: none (Dawn has no native animated percentage-ring / big-number stat section per `dawn-section-capability-matrix.md`; `multicolumn` cannot render the animated ring). Built entirely on Dawn vars (`--color-button`, `--color-button-text`, `--media-radius`, `--page-width`, scheme colors) — verified by `check-inbuilt-css-first.mjs` (0 blockers). Honesty: every stat is a placeholder → bind real self-reported data + disclaimer.
