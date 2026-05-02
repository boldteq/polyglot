# Boldteq Org Structure v2 — Department + Sub-Department Hierarchy

**Date:** 2026-04-27
**Owner:** yash (strategic) + cadence (HR custodian)
**Replaces:** flat 6-department structure (executive / engineering / creative / growth / research / hr)
**Scope target:** scale 42 agents → 100+ without losing clarity
**Source of truth fields:** `~/.claude/org/registry.json` per-agent `department` + `subDepartment` + `pod` (optional)

---

## Why this exists

At 42 agents the flat 6-department view already mixes incompatible functions: "creative" bundles design + copy + SEO, "engineering" mixes 3 stack pods + platform + architecture + quality. As Boldteq scales toward 100+ agents the flat view becomes unreadable. This document defines the canonical hierarchy: **Department → Sub-Department → Pod (optional) → Specialist**.

---

## The 7 Departments

| # | Department | Lead | Sub-departments | Current size | Target @ 100 |
|---|-----------|------|-----------------|--------------|--------------|
| 1 | `executive` | yash | — | 1 | 1-2 |
| 2 | `engineering` | arya | web-platform-team, shopify-app-team, shopify-storefront-team, platform, architecture, quality | 13 | 30+ |
| 3 | `design` | vega | public-pages, ecom, dashboard, design-system, deliverables | 5 | 12+ |
| 4 | `content-seo` | quill | marketing-copy, cro-copy, lifecycle-email, app-store, developer-docs, seo | 5 | 12+ |
| 5 | `growth` | echo | cro, distribution, market-intel, email-infra | 7 | 12+ |
| 6 | `research` | nova | validation, market-research, measurement, portfolio | 7 | 10+ |
| 7 | `hr` | cadence | people-ops, hiring, training, accountability | 6 | 10+ |

**Note:** old `creative` department split into `design` + `content-seo` to remove function-mixing. Existing agents migrate per the table below.

---

## Full Hierarchy (current 42 + planned cohorts)

### 1. EXECUTIVE
- `yash` — Chief Executive Officer (top, no reports)

### 2. ENGINEERING (Lead: arya — Chief Technology Officer)

#### sub-dept: `architecture`
Cross-cutting design + bug fixing
- `arya` — Chief Technology Officer (sub-lead)
- `vex` — Senior Software Engineer — Reliability

#### sub-dept: `web-platform-team` (Stack A — Next.js + Supabase + Railway SaaS)
Lead: `saas-lead` — Engineering Manager — Web Platform | Reports up: arya
- `koda` — Senior Backend Engineer — Web Platform (Next.js API routes, Server Components, integrations)
- `web-platform-frontend` — Senior Frontend Engineer — Web Platform (PLANNED Cohort 3 — React/Next.js components)
- `dato` — Principal Database Architect (also cross-team DB mentor)
- `luna` — Lead QA Engineer (also cross-team test mentor)
- `sage` — Principal Engineer — Code Quality (also cross-team review escalation)
- `riko` — Build & Scaffolding Engineer

#### sub-dept: `embedded-apps-team` (Stack B — Shopify Native, React Router 7 + Polaris)
Lead: `shopify-app-lead` — Engineering Manager — Embedded Apps
- `shopify-app-frontend` — Frontend Engineer — Embedded Apps
- `shopify-app-backend` — Backend Engineer — Embedded Apps (Shopify Admin API + webhooks + Billing)
- `shopify-app-db` — Database Engineer — Embedded Apps (Prisma + multi-shop tenant isolation)
- `shopify-app-tester` — QA Engineer — Embedded Apps
- `shopify-app-reviewer` — Code Reviewer (PLANNED — currently sage covers)

#### sub-dept: `storefront-apps-team` (Stack C — Shopify External standalone, Hydrogen RR7)
Lead: `shopify-web-lead` — Engineering Manager — Storefront Apps. PLANNED Cohort 2 — ICs not yet hired.
- `shopify-web-frontend`, `shopify-web-backend`, `shopify-web-db`, `shopify-web-tester`, `shopify-web-reviewer`

#### sub-dept: `shopify-website-team` (Stack D — Liquid Themes + Online Store 2.0 + Shopify CLI, client-owned themes via GitHub workflow) — DEPLOYED 2026-04-30
Lead: `atrium` — Storefront Engineering Director (Shopify Website Team lead, reports to arya).
8-agent specialist roster:
- `atrium` (Pod lead, opus, leadership) — client brief intake, sprint planning, Figma-loop coordination, sign-off gates, UAT loop, cross-pod handoffs
- `stitch` (Design-to-Theme Converter, opus, analyst) — reads approved Figma via MCP → outputs Liquid skeleton + section/block schema + settings_schema.json + handoff notes for loom
- `loom` (Liquid Theme Developer, sonnet, builder) — refines stitch's skeleton; writes production Liquid templates, sections, blocks, theme JS (vanilla + Alpine), CSS/Tailwind
- `conduit` (Storefront Data Integration Engineer, sonnet, builder) — Storefront API + Admin API queries, 3rd-party app integrations (Klaviyo / Judge.me / Loox / Recharge / Yotpo)
- `lattice` (Content Modeling Architect, sonnet, architect) — metafield namespaces + metaobject definitions + validation rules. Mentored by Dato cross-pod.
- `mantle` (Theme Release Engineer, sonnet, builder) — Shopify CLI workflows, GitHub repo per client, theme branch strategy, deploy + rollback. Mentored by Bolt cross-pod.
- `lumen` (Theme Quality Engineer, sonnet, analyst, GATE class) — Lighthouse + theme-check + customizer + cross-browser + a11y. Mentored by Luna cross-pod.
- `onyx` (Theme Code Reviewer, opus, reviewer, GATE class) — final review before mantle pushes. Mentored by Sage cross-pod.

Stack: Liquid + Online Store 2.0 + theme JS (vanilla + Alpine) + Tailwind/CSS + Shopify CLI + GitHub Actions.
Boundary vs Shopify Storefront Team: Hydrogen → Shopify Storefront Team; Liquid themes (especially client-owned via CLI) → Shopify Website Team.
12-step workflow: brief → Figma → conversion → loom refine → QA → review → staging push → UAT → publish → post-mortem.
Inherits HR Constitution v1 Tier 1 from day 1. Forge Q4 similarity gate confirmed zero collisions.

#### sub-dept: `platform`
DevOps + monitoring + reliability
- `bolt` — Director of DevOps
- `hawk` — Site Reliability Engineer

#### sub-dept: `quality`
Cross-team quality leadership
- (sage already in web-platform-team but cross-listed Principal Engineer — Code Quality)
- (luna already in web-platform-team but cross-listed Lead QA Engineer — test mentor)

### 3. DESIGN (Lead: vega — Chief Design Officer)

#### sub-dept: `public-pages`
Marketing + public-facing pages (14 page types)
- `pixel` — Senior Web Designer

#### sub-dept: `ecom`
Storefront design (Stack B/C)
- `elio` — Senior Storefront Designer (UI + motion/interactions)

#### sub-dept: `dashboard`
SaaS admin / multi-widget data viz
- `dash` — Senior Dashboard Designer (PLANNED Cohort 3)

#### sub-dept: `design-system`
Tokens + design system architecture
- `token` — Design Systems Lead

#### sub-dept: `deliverables`
JSX→.fig + Code Connect
- `figma-synth` — Design Tooling Engineer

#### sub-dept: `lead`
- `vega` — Chief Design Officer (cross-dept overseer; reports to yash)

### 4. CONTENT & SEO (Lead: quill — Chief Marketing Officer)

#### sub-dept: `marketing-copy`
- `quill` — Chief Marketing Officer (brand voice + landing/email/social/microcopy)

#### sub-dept: `cro-copy`
Conversion copy under Director of Conversion Optimization arbitration
- `spark` — Senior Conversion Copywriter (hero + CTA)
- `merch` — Senior Product Copywriter (PDP body, microcopy, objection handling)

#### sub-dept: `lifecycle-email`
- `sequence` — Lifecycle Email Strategist

#### sub-dept: `app-store`
- `serif` — App Store / PH / ASO Copywriter (PLANNED Cohort 5)

#### sub-dept: `developer-docs`
- `docsmith` — Developer Docs / API / SDK / Changelog (PLANNED Cohort 5)

#### sub-dept: `seo`
- `zeph` — Head of SEO

### 5. GROWTH (Lead: echo — Chief Growth Officer)

#### sub-dept: `cro`
- `catalyst` — Director of Conversion Optimization (sub-lead)
- `ecom-cro` — Senior Funnel Strategist
- `decoder` — Senior Brand Intelligence Analyst

#### sub-dept: `distribution`
- `echo` — Chief Growth Officer + Distribution Lead

#### sub-dept: `market-intel`
- `harvest` — Market Intelligence Analyst

#### sub-dept: `email-infra`
- `postmark` — Resend Integration / Deliverability (PLANNED Cohort 5)

### 6. RESEARCH (Lead: nova — Chief Research Officer)

#### sub-dept: `validation`
Idea + market + economics validation gates
- `scout` — Senior Product Strategist
- `atlas` — Senior Market Analyst
- `ledger` — Senior Pricing Analyst

#### sub-dept: `market-research`
- `nova` — Chief Research Officer (Competitive Intelligence)

#### sub-dept: `measurement`
- `orbit` — Head of Analytics
- `pulse` — Senior UX Researcher

#### sub-dept: `portfolio`
- `verdict` — Portfolio Strategy Director (30/90-day SCALE/PIVOT/KILL)

### 7. HR (Lead: cadence — Chief People Officer)

#### sub-dept: `people-ops`
- `cadence` — Chief People Officer (sub-lead)

#### sub-dept: `hiring`
- `forge` — Director of Talent Acquisition

#### sub-dept: `training`
- `tutor` — Head of Learning & Development
- `mira` — Knowledge Management Lead

#### sub-dept: `accountability`
- `witness` — People Analytics Lead
- `roster` — HR Operations Manager

---

## Schema additions

### `~/.claude/org/registry.json` per-agent fields

```jsonc
{
  "id": "elio",
  "department": "design",          // top-level (REQUIRED)
  "subDepartment": "ecom",         // sub-level (REQUIRED for new agents 2026-04-27+)
  "pod": null,                     // web-platform-team / shopify-app-team / shopify-storefront-team / null (only for engineering)
  "tier": "creative",
  "title": "Ecom UI Specialist",
  "reportsTo": "vega",
  // ... existing fields
}
```

### Agent .md frontmatter additions (forge template)

```yaml
---
name: ...
department: design
subDepartment: ecom
pod: null
reportsTo: vega
# ...
---
```

### Backwards compatibility

- Existing 42 agents auto-migrate via one-time script (parallel to this doc)
- Old `creative` department → split into `design` + `content-seo` per migration table
- All `subDepartment: null` rows treated as "default" (lead-level or unassigned)

---

## Migration Map (existing agents)

| Agent | OLD department | NEW department | NEW subDepartment | pod |
|-------|---------------|----------------|-------------------|-----|
| yash | executive | executive | (none) | null |
| arya | engineering | engineering | architecture | null |
| vex | engineering | engineering | architecture | null |
| koda | engineering | engineering | web-platform-team | web-platform-team |
| dato | engineering | engineering | web-platform-team | web-platform-team |
| luna | engineering | engineering | quality | null (cross-pod) |
| sage | engineering | engineering | quality | null (cross-pod) |
| riko | engineering | engineering | web-platform-team | web-platform-team |
| shopify-app-frontend | engineering | engineering | shopify-app-team | shopify-app-team |
| shopify-app-backend | engineering | engineering | shopify-app-team | shopify-app-team |
| shopify-app-db | engineering | engineering | shopify-app-team | shopify-app-team |
| shopify-app-tester | engineering | engineering | shopify-app-team | shopify-app-team |
| bolt | engineering | engineering | platform | null |
| hawk | engineering | engineering | platform | null |
| vega | creative | design | lead | null |
| pixel | creative | design | public-pages | null |
| elio | creative | design | ecom | null |
| token | creative | design | design-system | null |
| figma-synth | creative | design | deliverables | null |
| quill | creative | content-seo | marketing-copy | null |
| zeph | creative | content-seo | seo | null |
| spark | growth | content-seo | cro-copy | null |
| merch | growth | content-seo | cro-copy | null |
| sequence | growth | content-seo | lifecycle-email | null |
| catalyst | growth | growth | cro | null |
| ecom-cro | growth | growth | cro | null |
| decoder | growth | growth | cro | null |
| echo | growth | growth | distribution | null |
| harvest | growth | growth | market-intel | null |
| nova | research | research | market-research | null |
| scout | research | research | validation | null |
| atlas | research | research | validation | null |
| ledger | research | research | validation | null |
| orbit | research | research | measurement | null |
| pulse | research | research | measurement | null |
| verdict | research | research | portfolio | null |
| cadence | hr | hr | people-ops | null |
| forge | hr | hr | hiring | null |
| tutor | hr | hr | training | null |
| mira | hr | hr | training | null |
| witness | hr | hr | accountability | null |
| roster | hr | hr | accountability | null |

**Note:** `spark` / `merch` / `sequence` reclassified from `growth` to `content-seo` because their PRIMARY function is copy authoring. They report to `catalyst` (Director of Conversion Optimization in growth) for strategy but their craft + brand voice ratification lives under quill (content-seo). Cross-functional reporting matrix below.

---

## Cross-Functional Reporting (matrix model)

Some agents have dual reporting — primary craft lead + cross-functional tactical lead. This avoids artificial dept assignment for agents who genuinely span two areas.

| Agent | Primary craft (dept) | Tactical lead (cross-fn) |
|-------|---------------------|--------------------------|
| spark | content-seo (quill) | growth-cro (catalyst) |
| merch | content-seo (quill) | growth-cro (catalyst) |
| sequence | content-seo (quill) | growth-cro (catalyst) |
| decoder | growth-cro (catalyst) | research-market (nova) |
| harvest | growth-market-intel (echo) | research-market (nova) |
| dato | engineering-web-platform-team (arya) | engineering-cross-shopify-website-teamb-mentor |
| luna | engineering-quality (sage/arya) | engineering-cross-pod-test-mentor |
| sage | engineering-quality (arya) | engineering-cross-pod-review-escalation |

Schema field: `secondaryReportsTo` (optional in registry.json).

---

## Scaling Rules

### When to add a sub-department
- A sub-department exceeds 8 agents → split or add granularity
- A new niche or capability emerges with no clean home → new sub-dept
- Two agents repeatedly collide on scope → may indicate sub-dept split

### When to add a department
- Top-level dept exceeds 25 agents AND can split cleanly along function lines
- New strategic pillar approved by Yash (e.g., future "Sales", "Customer Success", "Legal")

### When to add a pod
- Pods are reserved for engineering stack-specific clusters (web-platform-team / shopify-app-team / shopify-storefront-team)
- Other departments don't currently use pods
- New stack added → new pod (e.g., shopify-website-team if AI-only stack ever splits from Stack A)

### When to merge sub-departments
- Sub-dept has ≤2 agents for >90 days AND function overlaps with adjacent sub-dept
- Cadence proposes merge in monthly review

---

## Routing simplification (CLAUDE.md update)

Old routing (flat list):
```
- Ecom UI → elio
- Ecom Figma deliverable → figma-synth
- Ecom design tokens → token
- Public pages → pixel
- ...
```

New routing (hierarchical):
```
DESIGN (lead: vega)
  - public-pages → pixel
  - ecom (storefront, motion) → elio
  - dashboard → dash (Cohort 3+)
  - design-system → token
  - deliverables (Figma .fig + Code Connect) → figma-synth
```

Faster scan + clear escalation paths.

---

## Implementation Steps

1. **Org chart doc** (this file) — DONE
2. **registry.json migration** — Python script adds `subDepartment` field to all 42 agents per migration map
3. **CLAUDE.md update** — Replace flat routing with hierarchical dept→sub-dept routing
4. **Agent frontmatter retrofit** — Optional follow-up: add `subDepartment` to existing agent .md frontmatter (not blocking — registry.json is source of truth)
5. **Forge template update** — All future agents must include `subDepartment` field; forge.md amended
6. **MEMORY.md** — Add this file to Critical-Load-First section
7. **Roster sync** — Roster nightly recompute uses subDepartment for capability-gap detection by sub-dept
8. **Witness + Cadence** — Reviews now bucket by sub-dept first, then dept

---

## Cross-references
- `~/.claude/org/registry.json` — source of truth
- `~/.claude/CLAUDE.md` — routing rules (to be updated)
- `~/.claude/agents/forge.md` — agent template (must add subDepartment)
- `~/.claude/agents/cadence.md` — review cycle (use subDepartment buckets)
- `~/.claude/agents/roster.md` — capability gap detection per sub-dept
- `~/.claude/memory/patterns/good/agent-ops-schema.md` — Supabase schema (will need subDepartment column on agents table)
