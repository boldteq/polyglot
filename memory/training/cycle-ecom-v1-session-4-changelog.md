# Ecom Training Cycle v1 — Session 4 Changelog

**Date:** 2026-04-27
**Session:** 4 of 8 (focus: Elio cart/checkout/motion + token)
**Format:** AskUserQuestion popup, all 14 selected "Recommended"
**Patches composed:** 16

## Per-Q lessons

### ECOM-ELI-013 — Cart drawer vs page
Drawer default; page wins ONLY for B2B / configurable products / cart >5 items typical.
Patches: `skills/elio/cart-checkout-design-protocol.md`, `agents/elio.md`

### ECOM-ELI-014 — Free-shipping threshold formula
AOV-derived: 1.4× median-niche-AOV rounded to $5. Apparel $70, supplements $50, beauty $40, CPG $30, home $105.
Patches: `skills/elio/cart-checkout-design-protocol.md`, `skills/ecom-cro/cart-checkout-mechanics.md` (cross-ref)

### ECOM-ELI-015 — Checkout step count
Single-page default; multi-step ONLY for high-AOV (>$200) configurable / B2B.
Patches: `skills/elio/cart-checkout-design-protocol.md`

### ECOM-ELI-016 — Motion budget
300ms cumulative per surface; 200ms max per single interaction. Token-defined timing scale enforces.
Patches: `skills/elio/ecom-motion-interaction-protocol.md`

### ECOM-ELI-017 — Mobile 375px priority order
(1) hero image (2) ATC button (3) price (4) headline (5) variant selector. Sticky ATC mandatory.
Patches: `skills/elio/mobile-ecom-design-protocol.md`

### ECOM-ELI-018 — Token-debt protocol
Ship with `temp-token: --color-temp-X /* token-debt: [reason] */`. Token agent 7-day SLA to canonicalize. Tracked in `token-debt-log.md`.
Patches: `agents/elio.md`, `agents/token.md`, `skills/token/design-tokens-architecture.md`

### ECOM-TOK-001 — OKLCH ramp formula
culori npm. 10-step L=98/95/88/78/65/52/42/35/28/18. 500=brand base. Chroma per step adjusted for saturation perception.
Patches: `skills/token/design-tokens-architecture.md`

### ECOM-TOK-002 — Contrast strict + alt-pair
WCAG AA strict on ALL tokens. Brand-identity colors that fail AA on white/black get exception ONLY if alt-pair body-text-safe variant exists. Never silently fail.
Patches: `skills/token/design-tokens-architecture.md`, `agents/token.md`

### ECOM-TOK-003 — Polaris bridge winner
Storefront brand wins. Admin embed gets brand color overlay via Polaris AppProvider customProperties. Polaris navy stays for non-brand chrome.
Patches: `skills/token/polaris-storefront-bridge.md`

### ECOM-TOK-004 — Figma sync direction
Code-wins default; vega-approved designer-led changes promote via `figma-wins-override` flag in sync report.
Patches: `skills/token/figma-variable-sync.md`

### ECOM-TOK-005 — Token addition triage
3-tier: (1) extend existing ramp (best) → (2) add new semantic with rationale (acceptable) → (3) reject + reply with composition (default rejection). Reuse-first.
Patches: `skills/token/design-tokens-architecture.md`, `agents/token.md`

### ECOM-TOK-006 — Dark mode default
Light only by default. Opt-in for tech / sleep / luxury when client requests. Don't auto-build dark mode.
Patches: `skills/token/design-tokens-architecture.md`, `agents/token.md`

### ECOM-TOK-007 — Font defaults
Sans-only (Inter body + Manrope display) default. Premium = serif heading + sans body. Luxury = all-serif. Tech/supplements/CPG stay sans.
Patches: `memory/design/core/typography.md`, `skills/token/design-tokens-architecture.md`

### ECOM-TOK-008 — Deprecation 30/60 + rare namespace
Auto-flag at 30 days unused. Preserve in `rare/` namespace if tagged 'rare-but-valid'. Remove others at 60 days.
Patches: `skills/token/design-tokens-architecture.md`, `agents/token.md`

## Stats
- Q answered: 14/14
- Patches composed: 16
- Patches applied: 16
- Drift: 0

## Cross-ref
- Curriculum: `~/.claude/memory/curriculum/ecom-team-training-v1.md` Session 4
- Prior sessions: `cycle-ecom-v1-session-{1,2,3}-changelog.md`
