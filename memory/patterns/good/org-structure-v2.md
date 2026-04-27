# Boldteq Org Structure v2 — Department + Sub-Department Hierarchy

**Date:** 2026-04-27
**Owner:** rex (strategic) + cadence (HR custodian)
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
| 1 | `executive` | rex | — | 1 | 1-2 |
| 2 | `engineering` | arya | pod-a, pod-b, pod-c, platform, architecture, quality | 13 | 30+ |
| 3 | `design` | vega | public-pages, ecom, dashboard, design-system, deliverables | 5 | 12+ |
| 4 | `content-seo` | quill | marketing-copy, cro-copy, lifecycle-email, app-store, developer-docs, seo | 5 | 12+ |
| 5 | `growth` | echo | cro, distribution, market-intel, email-infra | 7 | 12+ |
| 6 | `research` | nova | validation, market-research, measurement, portfolio | 7 | 10+ |
| 7 | `hr` | cadence | people-ops, hiring, training, accountability | 6 | 10+ |

**Note:** old `creative` department split into `design` + `content-seo` to remove function-mixing. Existing agents migrate per the table below.

---

## Full Hierarchy (current 42 + planned cohorts)

### 1. EXECUTIVE
- `rex` — Commander (top, no reports)

### 2. ENGINEERING (Lead: arya)

#### sub-dept: `architecture`
Cross-cutting design + bug fixing
- `arya` — VP Engineering (sub-lead)
- `vex` — Bug Fixer

#### sub-dept: `pod-a` (Stack A — Next.js + Supabase + Railway SaaS)
Lead: arya (interim) | Reports up: arya
- `koda` — Backend (Next.js API routes, Server Components, integrations)
- `pod-a-frontend` — Frontend (PLANNED Cohort 3 — React/Next.js components)
- `dato` — Database (also cross-pod DB mentor)
- `luna` — Test Engineer (also cross-pod test mentor)
- `sage` — Code Reviewer (also cross-pod review escalation)
- `riko` — Project Setup Specialist

#### sub-dept: `pod-b` (Stack B — Shopify Native, React Router 7 + Polaris)
- `pod-b-frontend` — Frontend
- `pod-b-backend` — Backend (Shopify Admin API + webhooks + Billing)
- `pod-b-db` — Database (Prisma + multi-shop tenant isolation)
- `pod-b-tester` — Test Engineer
- `pod-b-reviewer` — Code Reviewer (PLANNED — currently sage covers)

#### sub-dept: `pod-c` (Stack C — Shopify External standalone)
PLANNED Cohort 2 — entire pod not yet hired
- `pod-c-frontend`, `pod-c-backend`, `pod-c-db`, `pod-c-tester`, `pod-c-reviewer`

#### sub-dept: `platform`
DevOps + monitoring + reliability
- `bolt` — DevOps / Deployment Lead
- `hawk` — Ops / Monitoring

#### sub-dept: `quality`
Cross-pod quality leadership
- (sage already in pod-a but cross-listed quality lead)
- (luna already in pod-a but cross-listed test mentor)

### 3. DESIGN (Lead: vega)

#### sub-dept: `public-pages`
Marketing + public-facing pages (14 page types)
- `pixel` — Public-Facing Page Designer

#### sub-dept: `ecom`
Storefront design (Stack B/C)
- `elio` — Ecom UI Specialist + motion/interactions

#### sub-dept: `dashboard`
SaaS admin / multi-widget data viz
- `dash` — Dashboard Designer (PLANNED Cohort 3)

#### sub-dept: `design-system`
Tokens + design system architecture
- `token` — Design System Architect

#### sub-dept: `deliverables`
JSX→.fig + Code Connect
- `figma-synth` — JSX-to-Figma Specialist

#### sub-dept: `lead`
- `vega` — UI/UX Lead (sub-dept overseer; reports to quill currently — to migrate to standalone Design VP role)

### 4. CONTENT & SEO (Lead: quill)

#### sub-dept: `marketing-copy`
- `quill` — Lead + brand voice + landing/email/social/microcopy

#### sub-dept: `cro-copy`
Conversion copy under CRO Lead arbitration
- `spark` — Above-Fold Copywriter (hero + CTA)
- `merch` — Ecom On-Page Copywriter (PDP body, microcopy, objection handling)

#### sub-dept: `lifecycle-email`
- `sequence` — Lifecycle Email Specialist

#### sub-dept: `app-store`
- `serif` — App Store / PH / ASO Copywriter (PLANNED Cohort 5)

#### sub-dept: `developer-docs`
- `docsmith` — Developer Docs / API / SDK / Changelog (PLANNED Cohort 5)

#### sub-dept: `seo`
- `zeph` — SEO Specialist

### 5. GROWTH (Lead: echo)

#### sub-dept: `cro`
- `catalyst` — CRO Lead (sub-lead)
- `ecom-cro` — Below-Fold Mechanic Specialist
- `decoder` — Brand Pattern Extractor

#### sub-dept: `distribution`
- `echo` — VP Growth + Distribution Lead

#### sub-dept: `market-intel`
- `harvest` — Multi-Platform Market Intelligence Scraper

#### sub-dept: `email-infra`
- `postmark` — Resend Integration / Deliverability (PLANNED Cohort 5)

### 6. RESEARCH (Lead: nova)

#### sub-dept: `validation`
Idea + market + economics validation gates
- `scout` — Idea Validator
- `atlas` — Market Sizer
- `ledger` — Pricing & Unit Economics

#### sub-dept: `market-research`
- `nova` — VP Research + Competitive Intelligence

#### sub-dept: `measurement`
- `orbit` — Metrics Architect
- `pulse` — User Researcher

#### sub-dept: `portfolio`
- `verdict` — Portfolio Decider (30/90-day SCALE/PIVOT/KILL)

### 7. HR (Lead: cadence)

#### sub-dept: `people-ops`
- `cadence` — Head of People (sub-lead)

#### sub-dept: `hiring`
- `forge` — Agent Architect / Hiring Specialist

#### sub-dept: `training`
- `tutor` — Bulk Training Lead
- `mira` — Memory Keeper / Lesson Extraction

#### sub-dept: `accountability`
- `witness` — Performance Tracker
- `roster` — Registry & Records Keeper

---

## Schema additions

### `~/.claude/org/registry.json` per-agent fields

```jsonc
{
  "id": "elio",
  "department": "design",          // top-level (REQUIRED)
  "subDepartment": "ecom",         // sub-level (REQUIRED for new agents 2026-04-27+)
  "pod": null,                     // pod-a / pod-b / pod-c / null (only for engineering)
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
| rex | executive | executive | (none) | null |
| arya | engineering | engineering | architecture | null |
| vex | engineering | engineering | architecture | null |
| koda | engineering | engineering | pod-a | pod-a |
| dato | engineering | engineering | pod-a | pod-a |
| luna | engineering | engineering | quality | null (cross-pod) |
| sage | engineering | engineering | quality | null (cross-pod) |
| riko | engineering | engineering | pod-a | pod-a |
| pod-b-frontend | engineering | engineering | pod-b | pod-b |
| pod-b-backend | engineering | engineering | pod-b | pod-b |
| pod-b-db | engineering | engineering | pod-b | pod-b |
| pod-b-tester | engineering | engineering | pod-b | pod-b |
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

**Note:** `spark` / `merch` / `sequence` reclassified from `growth` to `content-seo` because their PRIMARY function is copy authoring. They report to `catalyst` (CRO Lead in growth) for strategy but their craft + brand voice ratification lives under quill (content-seo). Cross-functional reporting matrix below.

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
| dato | engineering-pod-a (arya) | engineering-cross-pod-db-mentor |
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
- Pods are reserved for engineering stack-specific clusters (pod-a / pod-b / pod-c)
- Other departments don't currently use pods
- New stack added → new pod (e.g., pod-d if AI-only stack ever splits from Stack A)

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
