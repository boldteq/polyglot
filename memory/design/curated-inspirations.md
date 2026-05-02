# Yash's Curated Design Inspirations

> Yash drops designs he likes here. Agents auto-match the right ones at build time.
> This is the HIGHEST PRIORITY design reference — Yash's taste > generic best practices.

Last updated: 2026-04-08

---

## How This Works

1. **Yash finds a SaaS he likes** → drops URL, screenshot, or description here
2. **Agent auto-tags it** → component type, niche, mood, what's good about it
3. **At build time** → Vega/Koda search this file FIRST, match by niche + component type
4. **Result** → every build reflects Yash's actual taste, not generic defaults

---

## Quick-Add Format

When Yash says "I like this" or "add this to inspirations", add an entry using this format:

```
### [Product Name] — [What specifically is good]
- **URL:** [url]
- **Type:** [dashboard | settings | landing | auth | pricing | sidebar | table | modal | onboarding | empty-state | nav | card | form | hero | footer | other]
- **Niche:** [dev-tool | hr | fintech | ai | analytics | ecommerce | pm | cms | marketing | communication | security | general]
- **Mood:** [minimal | premium | technical | playful | corporate | dark | warm | bold | elegant]
- **What Yash likes:** [specific things — layout, colors, spacing, animation, typography, etc.]
- **Screenshot:** [path if Yash provided one, or "not captured"]
- **Added:** [date]
```

---

## Inspirations by Component Type

### Dashboards
<!-- Add dashboard inspirations here -->

### Landing Pages
<!-- Add landing page inspirations here -->

### Settings Pages
<!-- Add settings page inspirations here -->

### Auth Pages (Login/Signup)
<!-- Add auth page inspirations here -->

### Pricing Pages
<!-- Add pricing page inspirations here -->

### Sidebars & Navigation
<!-- Add sidebar/nav inspirations here -->

### Data Tables
<!-- Add table inspirations here -->

### Modals & Dialogs
<!-- Add modal inspirations here -->

### Onboarding Flows
<!-- Add onboarding inspirations here -->

### Empty States
<!-- Add empty state inspirations here -->

### Cards & Widgets
<!-- Add card/widget inspirations here -->

### Forms
<!-- Add form inspirations here -->

### Hero Sections
<!-- Add hero inspirations here -->

### Footers
<!-- Add footer inspirations here -->

### Full App UIs (Overall Feel)
<!-- Add full app inspirations here -->

### Other
<!-- Add other inspirations here -->

---

## Inspirations by Niche

### Developer Tools
<!-- Auto-grouped: entries tagged niche=dev-tool -->

### HR / Recruiting
<!-- Auto-grouped: entries tagged niche=hr -->

### Fintech / Finance
<!-- Auto-grouped: entries tagged niche=fintech -->

### AI Products
<!-- Auto-grouped: entries tagged niche=ai -->

### Analytics / Data
<!-- Auto-grouped: entries tagged niche=analytics -->

### E-commerce
<!-- Auto-grouped: entries tagged niche=ecommerce -->

### Project Management
<!-- Auto-grouped: entries tagged niche=pm -->

### Content / CMS
<!-- Auto-grouped: entries tagged niche=cms -->

### Marketing / Email
<!-- Auto-grouped: entries tagged niche=marketing -->

### General (Applies to Any SaaS)
<!-- Auto-grouped: entries tagged niche=general -->

---

## Inspirations by Mood

### Minimal
<!-- Auto-grouped: entries tagged mood=minimal -->

### Premium / Elegant
<!-- Auto-grouped: entries tagged mood=premium or mood=elegant -->

### Dark / Technical
<!-- Auto-grouped: entries tagged mood=dark or mood=technical -->

### Playful / Warm
<!-- Auto-grouped: entries tagged mood=playful or mood=warm -->

### Bold
<!-- Auto-grouped: entries tagged mood=bold -->

---

## How Agents Use This File

### Vega (Design)
1. **ALWAYS load this file before designing any page**
2. Filter by: component type matching current task + niche matching current project
3. If matches found → use Yash's liked designs as PRIMARY reference (override generic patterns)
4. If no exact match → check mood section for general aesthetic direction
5. Cite which inspiration influenced the design: "Inspired by [Product] — [what was borrowed]"

### Koda (Build)
1. Load this file when building UI
2. Check if Vega's spec references a specific inspiration → study that entry
3. If building without Vega spec → filter by component type + niche → follow the patterns Yash likes

### Nova (Research)
1. Check this file when researching a new niche
2. If Yash already has inspirations for the niche → those apps are pre-approved references
3. Add competitive research findings that match Yash's established taste preferences

### Matching Priority at Build Time
```
1. Exact match: same component type + same niche     → USE THIS (highest priority)
2. Component match: same component type, any niche    → USE THIS as layout reference
3. Niche match: same niche, any component type         → USE THIS for color/mood direction
4. Mood match: same mood keywords                       → USE THIS for general feel
5. No match: fall back to design-vision-system.md defaults
```
