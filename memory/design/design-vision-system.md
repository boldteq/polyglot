# Design Vision System — Per-Project Aesthetic Intelligence

> Every SaaS has a personality. This system ensures agents auto-discover, capture, and enforce the right design direction for each product — so every screen feels intentional, not generic.

Last updated: 2026-04-08

---

## Why This Exists

Without a project-specific design vision:
- Dashboard looks like a generic template (shadcn defaults with no personality)
- Colors, spacing, density feel arbitrary
- Landing page doesn't match app aesthetic
- Every SaaS we build looks the same
- Competitor UIs feel more polished because they have a clear direction

With this system:
- Vega auto-researches the niche before designing anything
- A Design Vision Brief is created per project (auto or manual)
- All agents (Vega, Koda, Quill) pull from the same vision
- Every screen feels like it belongs to the same product
- Our SaaS looks like it was designed by a studio, not scaffolded by AI

---

## Part 1: Design Vision Brief (Per-Project)

Every project gets a `design-vision.md` file in its root. This is the single source of truth for visual direction.

### Auto-Generation Trigger
When Rex dispatches Vega for the FIRST time on a new project, Vega MUST:
1. Check if `design-vision.md` exists in the project root
2. If NO → generate it using the protocol below
3. If YES → load it before any design work

### Template: design-vision.md

```markdown
# Design Vision — [Project Name]

## Product Identity
- **What it is:** [1-line description — e.g., "AI-powered resume screening for recruiters"]
- **Who uses it:** [Primary persona — e.g., "HR managers at 50-500 person companies"]
- **How it should feel:** [3-5 adjectives — e.g., "Professional, trustworthy, efficient, modern"]
- **Category:** [SaaS niche — e.g., "HR Tech / Recruiting"]

## Aesthetic Direction
- **Mood:** [Pick 1-2 from: Minimal | Dense | Playful | Serious | Premium | Technical | Warm | Corporate | Bold | Elegant]
- **Theme default:** [Light | Dark | System-adaptive]
- **Density:** [Spacious (content apps) | Balanced (most SaaS) | Compact (data-heavy tools)]
- **Visual tone:** [Flat | Subtle shadows | Glassmorphism | Neumorphism | Material-inspired]

## Design Anchors (Top 3 Inspirations)
These are the products whose design language we're channeling. NOT copying — channeling the same quality and feel.

| Rank | Product | What to Channel | What NOT to Copy |
|------|---------|----------------|-----------------|
| 1 | [e.g., Linear] | Dark theme, keyboard-first, minimal chrome, speed feel | Don't copy their issue tracker layout |
| 2 | [e.g., Stripe Dashboard] | Data table density, clean billing UI, trust signals | Don't copy their documentation style |
| 3 | [e.g., Notion] | Empty states, onboarding warmth, sidebar flexibility | Don't copy their block editor |

## Color Direction
- **Primary brand color:** [hex or description — e.g., "#6366F1 (Indigo)"]
- **Accent:** [hex or description — e.g., "#10B981 (Emerald for success states)"]
- **Neutral base:** [e.g., "Zinc scale" or "Slate scale" or "Neutral scale"]
- **Data viz palette:** [e.g., "Cool tones (blue/indigo/violet)" or "Warm (amber/orange/red)"]
- **Special:** [e.g., "Gradient on hero section", "Colored sidebar", "Monochrome with one accent"]

## Typography Direction
- **Heading font:** [e.g., "Inter (default)" or "Cal Sans (if premium)" or "Geist (if dev tool)"]
- **Body font:** [e.g., "Inter" — almost always Inter for SaaS]
- **Mono font:** [e.g., "JetBrains Mono" or "Geist Mono" — for code/technical content]
- **Heading style:** [e.g., "Bold, tight tracking" or "Semibold, normal tracking"]

## Layout Direction
- **Navigation:** [Sidebar (default) | Top bar | Both | Minimal (no persistent nav)]
- **Sidebar style:** [Full (icons + labels) | Compact (icons only, expand on hover) | Collapsible]
- **Content width:** [Narrow (prose-focused, max-w-3xl) | Medium (max-w-5xl) | Wide (full-width data)]
- **Card style:** [Bordered | Shadow | Flat with dividers | Glassmorphic]
- **Border radius:** [None (sharp) | Small (4px) | Medium (8px, default) | Large (12-16px, playful)]

## Component Preferences
- **Buttons:** [Solid primary | Outline primary | Ghost-heavy | Mixed]
- **Tables:** [Dense with row actions | Spacious with cards | Hybrid]
- **Modals vs Drawers:** [Prefer modals | Prefer side drawers | Context-dependent]
- **Icons:** [Lucide (default) | Phosphor | Heroicons | Custom]
- **Animations:** [Minimal (fast tools) | Moderate (balanced) | Rich (premium/marketing)]

## Page-Specific Notes
- **Dashboard:** [e.g., "4-card KPI row + main chart + activity feed. Dense but not cramped."]
- **Settings:** [e.g., "Single-column card stack. No tabs. Autosave."]
- **Landing page:** [e.g., "Hero with gradient, social proof bar, 3-column features, dark section for pricing"]
- **Auth pages:** [e.g., "Split layout — illustration left, form right. Minimal, fast."]

## Anti-Patterns (What This Product Should NEVER Look Like)
- [e.g., "Never look like a WordPress dashboard — no cluttered sidebars, no tiny fonts"]
- [e.g., "Never use Bootstrap-style cards with heavy borders"]
- [e.g., "Never feel slow — all interactions must feel instant"]
- [e.g., "Never use generic stock illustrations — use abstract geometric art or no illustrations"]
```

---

## Part 2: Auto-Research Protocol (Vega + Nova)

### When Nova Researches a New Product
Nova ALREADY researches competitors. This adds a DESIGN-SPECIFIC research layer:

```
DESIGN RESEARCH CHECKLIST (Nova adds to competitive report):

For each top-3 competitor:
□ Screenshot their dashboard (or describe layout precisely)
□ Screenshot their settings page
□ Screenshot their landing page hero
□ Note: theme (light/dark/both), density, nav style, card style
□ Note: primary color, accent color, font family
□ Note: animation level (none/subtle/rich)
□ Note: mobile experience quality (broken/acceptable/excellent)
□ Rate: overall visual quality (1-5, where 5 = Linear/Stripe level)

Niche auto-research (using reference-library.md sources):
□ Browse SaaS Interface for [niche] component examples
□ Browse SaaSPO for [niche] landing page examples
□ Browse SaaS UI Design for [niche] pattern examples
□ Note top 3 best-designed products in the niche
□ Note what they all have in common (this = table stakes)
□ Note what NONE of them do well (this = differentiation opportunity)
```

### When Vega Creates the Design Vision Brief
If Yash doesn't provide explicit direction, Vega auto-generates the brief:

```
VEGA AUTO-VISION PROTOCOL:

1. Read Nova's competitive report (specifically the design section)
2. Read reference-library.md → find niche section
3. Read best-saas-examples.md → find most relevant gold-standard apps
4. Read competitive-dominance-engine.md → design quality moat requirements

5. AUTO-DECIDE based on product type:
   ┌─────────────────────────┬────────────────────────────────────────────────┐
   │ Product Type            │ Default Design Direction                       │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Developer Tool          │ Dark theme, compact density, keyboard-first    │
   │                         │ Anchors: Linear, Vercel, Raycast              │
   │                         │ Mono font for code. Minimal animations.       │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ B2B SaaS (Enterprise)   │ Light theme, balanced density, professional   │
   │                         │ Anchors: Stripe, Salesforce, HubSpot         │
   │                         │ Trust signals. Blue/indigo palette.           │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ B2B SaaS (SMB)          │ Light + dark, balanced, modern + approachable │
   │                         │ Anchors: Notion, Cal.com, Resend             │
   │                         │ Warm accent color. Friendly empty states.     │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ HR / Recruiting         │ Light theme, spacious, trustworthy            │
   │                         │ Anchors: Ashby, Lever, BambooHR              │
   │                         │ Calm colors (blue/green). Data tables central.│
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Fintech / Finance       │ Light theme, dense, trust + precision         │
   │                         │ Anchors: Mercury, Stripe, Plausible           │
   │                         │ Monochrome + green accent. Numbers prominent. │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ E-commerce / Shopify    │ Light theme, Polaris design system             │
   │                         │ Anchors: Shopify Admin, Gorgias, Klaviyo     │
   │                         │ Follow Polaris exactly. No custom design.     │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ AI Product              │ Dark theme, medium density, futuristic        │
   │                         │ Anchors: v0.dev, Cursor, Anthropic Console   │
   │                         │ Purple/violet accent. Streaming UI patterns.  │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Analytics / Data        │ Light + dark, dense, information-rich         │
   │                         │ Anchors: Plausible, PostHog, Amplitude       │
   │                         │ Charts central. Blue palette. Compact tables. │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Content / CMS           │ Light theme, spacious, content-first          │
   │                         │ Anchors: Notion, Ghost, Hashnode              │
   │                         │ Clean typography. Generous whitespace.        │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Project Management      │ System-adaptive, balanced, productivity       │
   │                         │ Anchors: Linear, Height, Plane               │
   │                         │ Keyboard-first. Status colors. Board/list.   │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Communication / Chat    │ Light theme, spacious, conversational         │
   │                         │ Anchors: Slack, Discord, Intercom            │
   │                         │ Message bubbles. Presence indicators. Rich.   │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Marketing / Email       │ Light theme, visual, creative                 │
   │                         │ Anchors: Mailchimp, ConvertKit, Beehiiv      │
   │                         │ Drag-drop builders. Preview-heavy. Colorful. │
   ├─────────────────────────┼────────────────────────────────────────────────┤
   │ Security / Compliance   │ Light theme, dense, authoritative             │
   │                         │ Anchors: Infisical, Vanta, Drata             │
   │                         │ Dark blue/navy. Shield iconography. Badges.  │
   └─────────────────────────┴────────────────────────────────────────────────┘

6. Override with Yash's input if provided
7. Write design-vision.md to project root
8. Announce to Rex: "Design Vision Brief created — [3-word summary]"
```

---

## Part 3: How Yash Trains Design Direction

### Method 1: Quick Verbal Direction
Yash says something like:
- "Make it look like Linear but lighter"
- "I want Stripe-level polish"
- "Dark theme, dev tool vibes"
- "Clean and minimal, like Resend"

**What happens:** Vega interprets this → maps to the Vision-to-Tokens table → generates the Design Vision Brief → all agents follow it.

### Method 2: Reference URLs
Yash provides URLs:
- "Use this as inspiration: [URL]"
- "I like how [app] does their dashboard"
- "Study these 3 sites: [URL1], [URL2], [URL3]"

**What happens:** Nova/Vega fetch and analyze the URLs → extract design patterns → add to reference-library.md under the niche → incorporate into the Design Vision Brief.

### Method 3: Figma Link
Yash provides a Figma file/frame URL:
- "Here's my Figma design: [figma URL]"

**What happens:** Use the Figma MCP tool (`use_figma`) to inspect → extract colors, spacing, typography, layout → generate Design Vision Brief from actual design file → Koda builds to match pixel-perfect.

### Method 4: Screenshot
Yash uploads a screenshot of a design they like:
- "Make it look like this" + [screenshot]

**What happens:** Vega reads the screenshot → identifies layout pattern, color scheme, typography, density, card style → maps to our design tokens → incorporates into Design Vision Brief.

### Method 5: Mood Keywords
Yash uses mood words:
- "Premium and elegant"
- "Fast and technical"
- "Friendly and approachable"
- "Data-dense and powerful"

**What happens:** Vega maps mood keywords → design tokens using the table below.

---

## Part 4: Vision-to-Tokens Mapping

This is the translation layer from abstract "how it should feel" to concrete "what Tailwind classes to use."

### Mood → Design Tokens

```
MINIMAL
├── Border radius: rounded-md (6px)
├── Shadows: shadow-none or shadow-sm
├── Colors: monochrome + 1 accent
├── Density: spacious (p-6 gaps, gap-6 between cards)
├── Typography: tracking-tight headings, text-muted-foreground for secondary
├── Animations: none or fade only (150ms)
├── Cards: border only, no shadow
├── Example anchors: Resend, Vercel, Linear

PREMIUM / ELEGANT
├── Border radius: rounded-lg to rounded-xl (12-16px)
├── Shadows: shadow-lg with subtle blur
├── Colors: deep palette (slate/zinc base), gold/violet/emerald accents
├── Density: spacious with generous padding (p-8)
├── Typography: font-semibold headings with tight tracking, larger sizes
├── Animations: smooth transitions (200-300ms), subtle hover lifts
├── Cards: shadow + subtle border, hover: shadow-xl
├── Example anchors: Stripe, Mercury, Clerk

TECHNICAL / DATA-DENSE
├── Border radius: rounded-sm to rounded-md (4-6px)
├── Shadows: shadow-sm or none
├── Colors: cool palette (slate base), blue/cyan accents for data
├── Density: compact (p-3 gaps, gap-3, text-sm default)
├── Typography: text-sm body, mono font for numbers/codes
├── Animations: minimal, instant feel
├── Cards: bordered, tight spacing, tabular data
├── Example anchors: PostHog, Grafana, Supabase Dashboard

PLAYFUL / FRIENDLY
├── Border radius: rounded-xl to rounded-2xl (16-20px)
├── Shadows: shadow-md with colored shadows
├── Colors: vibrant palette, multiple accent colors, gradients allowed
├── Density: spacious with illustrations/icons
├── Typography: rounded font (Inter), larger body text, emoji in copy
├── Animations: bouncy (spring), scale effects, playful micro-interactions
├── Cards: shadow + rounded, hover: scale(1.02) + shadow-lg
├── Example anchors: Notion, Figma, Loom

PROFESSIONAL / CORPORATE
├── Border radius: rounded-md (6-8px)
├── Shadows: shadow-sm on cards
├── Colors: blue/navy primary, gray/slate neutrals, conservative
├── Density: balanced (p-4 to p-6)
├── Typography: Inter, normal weight body, semibold headings
├── Animations: subtle fade/slide only
├── Cards: shadow-sm + border, structured layouts
├── Example anchors: Salesforce, HubSpot, Zendesk

DARK / DEVELOPER
├── Border radius: rounded-md (6px)
├── Shadows: none (use border + bg-muted instead)
├── Colors: zinc/neutral dark base, neon accents (green/purple/cyan)
├── Density: compact to balanced
├── Typography: mono font prominent, text-sm, keyboard shortcut badges
├── Animations: instant (<100ms), no bounce, slide only
├── Cards: bg-muted/bg-card with border, no shadow
├── Example anchors: Linear, GitHub, Warp, Cursor
```

### Product Category → Key Design Decisions

```
┌──────────────────┬──────────┬──────────┬───────────┬───────────┬──────────────┐
│ Category         │ Theme    │ Density  │ Nav Style │ Card Radi │ Animation    │
├──────────────────┼──────────┼──────────┼───────────┼───────────┼──────────────┤
│ Dev Tool         │ Dark     │ Compact  │ Sidebar   │ rounded-md│ Minimal      │
│ B2B Enterprise   │ Light    │ Balanced │ Top+Side  │ rounded-lg│ Subtle       │
│ B2B SMB          │ Both     │ Balanced │ Sidebar   │ rounded-lg│ Moderate     │
│ HR/Recruiting    │ Light    │ Spacious │ Sidebar   │ rounded-lg│ Subtle       │
│ Fintech          │ Light    │ Dense    │ Sidebar   │ rounded-md│ Minimal      │
│ E-commerce       │ Light    │ Balanced │ Polaris   │ Polaris   │ Polaris      │
│ AI Product       │ Dark     │ Medium   │ Sidebar   │ rounded-lg│ Moderate     │
│ Analytics        │ Both     │ Dense    │ Sidebar   │ rounded-md│ Minimal      │
│ Content/CMS      │ Light    │ Spacious │ Sidebar   │ rounded-xl│ Smooth       │
│ Project Mgmt     │ Both     │ Balanced │ Sidebar   │ rounded-md│ Fast         │
│ Communication    │ Light    │ Spacious │ Sidebar   │ rounded-xl│ Rich         │
│ Marketing/Email  │ Light    │ Balanced │ Sidebar   │ rounded-xl│ Rich         │
│ Security         │ Light    │ Dense    │ Sidebar   │ rounded-md│ None         │
└──────────────────┴──────────┴──────────┴───────────┴───────────┴──────────────┘
```

---

## Part 5: How Agents Consume the Design Vision

### Rex (Orchestrator)
- After Nova completes research, check if design-vision.md exists
- If not, dispatch Vega to create it BEFORE any build work
- Include design-vision.md in every Vega/Koda dispatch context

### Nova (Research)
- Add design research section to competitive report (Part 2 checklist)
- Provide top 3 design anchors with reasons
- Note design differentiation opportunities

### Vega (Design)
- **ALWAYS load design-vision.md FIRST** before any design work
- Use it as the constraint system for all design specs
- Every spec must reference the vision: "Per design vision → [decision]"
- During visual review, check output against the vision anchors
- If a page doesn't match the vision aesthetic → flag and fix

### Koda (Build)
- **Load design-vision.md before building ANY UI**
- Apply the color direction to theme config
- Apply the density/spacing to layout choices
- Apply the component preferences (modals vs drawers, button styles, etc.)
- When Vega's spec says "per design vision" → load and follow

### Quill (Copy)
- Load design-vision.md to match copy tone to visual tone
- Playful design = casual copy. Professional design = formal copy.
- Dense design = terse copy. Spacious design = descriptive copy.

### Sage (Audit)
- Check that shipped UI matches the design-vision.md
- Flag inconsistencies: "Landing page uses rounded-xl but vision says rounded-md"
- Verify all anchors' key qualities are present

---

## Part 6: Updating the Vision Mid-Project

Yash can update the design vision at any time:
- "Change the accent color to emerald"
- "Make the dashboard more dense, like PostHog"
- "Switch to dark theme default"
- "Add Notion as a third design anchor"

**What happens:**
1. Vega updates design-vision.md
2. Vega reviews all existing pages against the new direction
3. Vega dispatches change specs to Koda for any pages that need updating
4. Takes screenshots to verify consistency

---

## Part 7: Multi-Project Design Library

Over time, design visions accumulate:

```
~/.claude/memory/design/visions/
  hr-recruiting-saas.md      ← Vision from an HR tool project
  ai-dev-tool.md             ← Vision from a dev tool project
  fintech-dashboard.md       ← Vision from a finance project
  shopify-analytics-app.md   ← Vision from a Shopify project
```

When building a NEW project in a similar niche, Vega loads the existing vision as a starting point rather than generating from scratch. This creates a compound learning effect — each project's design decisions improve the next one.

### Saving a Vision for Reuse
After a project ships and Yash is happy with the design:
1. Mira copies design-vision.md to `~/.claude/memory/design/visions/[niche-description].md`
2. Adds the project name and what worked well
3. This becomes a template for the next project in that niche

---

## Quick Reference: Yash → Design Direction Commands

| Yash Says | What Agents Do |
|-----------|---------------|
| "Make it look like [App]" | Vega studies [App]'s UI → creates vision anchored to it |
| "Dark theme, dev vibes" | Vega uses DARK/DEVELOPER mood → compact density, neon accents |
| "Premium feel" | Vega uses PREMIUM/ELEGANT mood → rounded-xl, shadows, smooth animations |
| "Clean and simple" | Vega uses MINIMAL mood → monochrome, no shadows, spacious |
| "Here's my Figma: [URL]" | Vega extracts tokens from Figma → generates vision from actual design |
| "[Screenshot]" | Vega reads screenshot → maps visual patterns → generates vision |
| "Like our HR project" | Vega loads saved vision from `visions/hr-recruiting-saas.md` |
| "Study these sites: [URLs]" | Nova fetches + analyzes → Vega incorporates into vision |
| No direction given | Vega auto-decides from product type + niche + competitive landscape |
