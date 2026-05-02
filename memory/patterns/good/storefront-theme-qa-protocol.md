# Storefront Theme QA Protocol

**Owner:** lumen (Shopify Website Team)
**Cross-pod consumers:** onyx, mantle, atrium, luna (mentor)
**Status:** v1.0 (foundational; expanded with edge cases per project)

## Purpose

Define the 5 quality gates every Shopify Website Team theme must pass before onyx review. Mobile-first. Private-window only. No compromise under deadline pressure.

## 5 Gates (all must pass)

### Gate 1: Lighthouse (Mobile + Desktop)
Targets:
- LCP <2.5s mobile / <1.5s desktop
- CLS <0.1
- TBT <200ms mobile
- INP <200ms

Pages: `/`, `/products/{handle}`, `/collections/{handle}`, `/cart`, `/search?q=test`

### Gate 2: Shopify theme-check
- Run: `shopify theme check`
- Pass: zero errors. Warnings allowed only off customer-facing flow.
- Boldteq's `.theme-check.yml` extends Shopify defaults (see lumen skill file).

### Gate 3: Customizer Settings Smoke
- Open every section in customizer
- Cycle every preset + every settings combination
- Save → reload → verify state persists
- No console errors at any time

### Gate 4: Cross-Browser Matrix
- Safari iOS 17+ (real device or BrowserStack)
- Chrome Android 120+ (real device or BrowserStack)
- Firefox 120+, Edge 120+ (Desktop)
- Safari + Chrome Desktop
- Pages: home + PDP + Cart + Collection minimum

### Gate 5: Accessibility (WCAG 2.1 AA)
- axe-core auto-scan: 0 violations on home/PDP/Collection/Cart
- Manual screen reader (VoiceOver iOS + NVDA Desktop) on PDP + Cart
- Keyboard-only nav through PDP → ATC → checkout redirect
- Reduced-motion respected

## Pass Condition

ALL 5 gates pass on ALL listed pages. ANY blocker → return to loom/conduit/lattice/stitch with specific reproduction steps.

## Reporting Format

```json
{
  "client_project_id": "uuid",
  "lighthouse": { "mobile": {...}, "desktop": {...} },
  "theme_check": "clean | failed",
  "customizer_smoke": "passed | blockers[]",
  "cross_browser": { "matrix_results": {...} },
  "axe": { "violations": 0 },
  "manual_a11y": "pass | fail with reasons",
  "verdict": "pass | block",
  "blockers": []
}
```

## Anti-Patterns

1. Sign off without all 5 gates pass
2. Test only on dev preview (must test staging publish)
3. Skip mobile testing
4. Accept LCP regression
5. Ship with theme-check errors
6. Trust automated a11y alone (manual screen reader required)
7. Test with cached browser state
8. Compress test scope under deadline pressure (escalate to atrium)
9. Skip checkout smoke
10. Miss documenting reproduction steps in failure reports

## Skill File References

- `~/.claude/skills/lumen/lighthouse-storefront-budget.md`
- `~/.claude/skills/lumen/theme-check-required-rules.md`
- `~/.claude/skills/lumen/customizer-settings-smoke-test-suite.md`
- `~/.claude/skills/lumen/cross-browser-storefront-matrix.md`
- `~/.claude/skills/lumen/checkout-flow-non-regression-suite.md`
- `~/.claude/skills/lumen/axe-accessibility-protocol-for-themes.md`

<!-- AUTHORING TODO: Capture per-niche QA additions (Shopify Plus B2B, multi-currency, multi-language) as encountered. Build automated Playwright suite after first 3 projects. -->
