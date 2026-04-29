# Liquid Code Review Checklist

**Owner:** onyx (Pod D)
**Cross-pod consumers:** loom, sage (mentor)
**Status:** v1.0 (foundational; refined per project + Sage Stack B mentor sessions)

## Purpose

Final theme review checklist. Onyx synthesizes Figma source-of-truth + theme-check + lumen QA + own audit into single APPROVE/BLOCK decision.

## 5 Audit Dimensions

### 1. Liquid Code Review
- No `{% include %}` (use `{% render %}`)
- No raw HTML when Liquid object exists
- No N+1 in loops (`{{ all_products[handle] }}` inside `{% for %}`)
- Sections have `{% schema %}` blocks
- Blocks have name + type + settings
- No hardcoded colors/fonts/spacing
- Lazy-loading on below-fold images
- Section CSS scoped (`.section-{type}` namespace)
- Pagination on lists >24 items

### 2. Figma vs Built Visual Diff
- Side-by-side: Figma frame vs built section
- Pixel diff <5px on viewports 375 / 768 / 1280 / 1920
- Token map verified
- Typography, color, spacing match
- Hover/focus/active states present
- Motion matches Figma prototypes

### 3. Online Store 2.0 Audit
- JSON templates for all main pages
- Sections support customizer drag-drop
- App Block slots defined where needed
- Section groups (header/footer) properly architected
- No deprecated tags/filters
- Schema settings ordered logically

### 4. Performance Budget
- Theme JS <100KB gzipped
- Theme CSS <80KB gzipped
- Hero image <200KB
- Critical CSS inlined for above-fold
- Lighthouse mobile LCP <2.5s
- CLS <0.1
- Web Pixels API used

### 5. Brand Fidelity
- Brand kit referenced + matched
- Voice/copy match quill/spark output
- Microcopy consistent
- Empty states branded
- Error states branded
- No placeholder text shipped

## Pass / Block Decision

- 0 critical issues → APPROVE → mantle proceeds
- ≥1 critical issue → BLOCK with itemized list to specific owner

## Block Severity Levels

- **Critical** (block) — perf regression, theme-check error, deprecated tag, raw HTML, schema violation, a11y AA violation
- **Major** (block) — Figma diff >10px, brand-color mismatch, missing mobile breakpoint
- **Minor** (warn) — code style, comment clarity, refactor opportunity (don't block)

## Reporting Format

```json
{
  "client_project_id": "uuid",
  "audit_results": {
    "liquid_review": "pass | issues[]",
    "figma_visual_diff": "pass (Xpx max) | fail",
    "online_store_2_0": "pass | issues[]",
    "performance_budget": "pass | issues[]",
    "brand_fidelity": "pass | issues[]"
  },
  "verdict": "approve | block",
  "blockers": [
    {
      "audit": "...",
      "severity": "block | warn",
      "specific_issue": "...",
      "file_path": "...",
      "line_range": "...",
      "owner": "loom | conduit | lattice | stitch",
      "fix_suggested": "..."
    }
  ]
}
```

## Anti-Patterns

1. Approve without Figma-vs-built diff
2. Approve `error`-class theme-check failures
3. Approve LCP-regressing change
4. Approve deprecated tag usage
5. Approve raw HTML when Liquid object exists
6. Approve metafield/metaobject usage without lattice schema match
7. Approve API integration without conduit security review
8. Approve theme-check warnings on customer-facing flows
9. Approve a11y violations of WCAG 2.1 AA
10. Approve under client-deadline pressure when blocker exists (escalate atrium → Yash per HR Constitution Q10)

## Skill File References

- `~/.claude/skills/onyx/liquid-code-review-checklist.md`
- `~/.claude/skills/onyx/figma-vs-built-visual-diff-protocol.md`
- `~/.claude/skills/onyx/online-store-2-0-best-practices-audit.md`
- `~/.claude/skills/onyx/theme-perf-budget-audit.md`
- `~/.claude/skills/onyx/brand-fidelity-audit-from-figma.md`

<!-- AUTHORING TODO: Build a per-project review template + capture canonical block patterns after first 5 reviews. Sage Stack B audit checklist mentor session schedule (TBD). -->
