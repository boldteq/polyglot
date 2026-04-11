---
name: Design language preference
description: User now wants pure Polaris web components with no inline CSS — use <s-box>, <s-badge>, <s-heading>, <s-stack>, <s-text-field>, <s-select>, <s-switch>, <s-banner> everywhere
type: feedback
---

Use Polaris web components for ALL UI — no custom inline CSS style objects:
- Card containers: `<s-box padding="base" borderWidth="base" borderRadius="base">`
- Section headings: `<s-heading>`
- Status badges: `<s-badge tone="success|neutral|info|caution|critical">`
- Body text: `<s-text tone="neutral">` or `<s-text color="subdued">`
- Layout: `<s-stack direction="inline|block" gap="base|small-200|large">`
- Text inputs: `<s-text-field label="..." value={...} onChange={...}>`
- Select dropdowns: `<s-select label="..." value={...} onChange={...}>` with `<s-option>` children
- Number inputs: `<s-number-field label="..." value={String(n)} min={1} max={100} onChange={...}>`
- Toggle switches: `<s-switch checked={bool} onChange={(e) => set((e.target as HTMLInputElement).checked)}>`
- Alert banners: `<s-banner tone="info|caution|warning|success|critical" heading="...">`
- Separators: `<s-divider>`

**Still requires native HTML (no Polaris equivalent):**
- Table editor cells (interactive table with inline inputs — keep native `<table>`)
- Status pill tabs (All/Active/Draft filter pills — keep native `<button>` with custom styles)
- Progress bars (keep custom `<div>` fill bar)
- Widget mockup preview (keep custom styled div)

**Why:** User explicitly asked for "no extra css" and "all components using Polaris" — migrated all three main pages to pure Polaris web components.

**How to apply:** Every new component must use `<s-box>`, `<s-stack>`, `<s-badge>`, `<s-heading>`, `<s-text>`, etc. Do NOT add `const cardStyle`, `const badgeStyle`, or any style constant objects. Do NOT use inline `style={{...}}` for layout/color/typography.
