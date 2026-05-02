# Memory Brain — Boldteq Software Factory

Index loaded every session. Check before starting any task.
`user/feedback.md` always takes priority over everything else.

---

## Critical — Load First

- [User Profile](user/profile.md) — Yash's role, goals, working style
- [User Feedback](user/feedback.md) — Direct corrections from Yash (HIGHEST PRIORITY)
- ★ **[Decision Simulator](user/decision-simulator.md)** — Pre-resolved Yash defaults (stack/pricing/design/copy/launch/budget). Consult BEFORE escalating to Yash.
- ★ **[Full Autonomy Rules](patterns/good/full-autonomy-rules.md)** — When agents ask Yash vs. when they decide (whitelist of 7 escalation reasons, everything else is auto-decided)
- ★ **[Boldteq SaaS Starter](starters/boldteq-saas-starter.md)** — Master spec for <10-min Stack A scaffold (GitHub template repo)
- ★ **[Yash Model Routing](patterns/good/yash-model-routing.md)** — DEEP/FAST/CHEAP model tier table per agent + budget guardrails (Haiku Phase 1 shipped 2026-04-22: Witness + Roster)
- ★ **[Local Autocomplete Setup](patterns/good/local-autocomplete-setup.md)** — Continue.dev + Ollama + Qwen (VS Code tab-complete only, NEVER Polyglot dispatch)
- ★ **[Mira Bug Ingestion Schema](patterns/good/mira-bug-ingestion-schema.md)** — JSONL schema for structured bug capture + auto-clustering
- ★ **[Gold Examples](patterns/good/gold-examples.md)** — First-output quality anchors per agent (Scout/Atlas/Koda/Vega/Quill/Sage/Echo/Verdict)
- ★ **[HR Constitution v1](patterns/good/hr-constitution-v1.md)** — **BINDING for all 6 HR agents** (Cadence, Witness, Tutor, Forge, Roster, Mira). 50 ratified Q-decisions across 10 themes: arbitration, RACI, freshness SLAs, wrongful-action guards, real-time vs batch, probation, patch attribution, memory hygiene, cost safety, org health metrics. Custodian: Cadence. Drafter: Mira. Amendment: §Q50. Schema additions: `agent-ops-schema.md` §"HR Constitution v1 — Schema Additions".
- ★ **Shopify Website Department (8 agents, 2026-04-30)** — `atrium` (lead), `stitch` (Figma→Liquid), `loom` (Liquid dev), `conduit` (data integration), `lattice` (metafields/metaobjects), `mantle` (CLI/GitHub deploy), `lumen` (QA), `onyx` (code review). Client-owned Liquid themes via Shopify CLI workflow. 12-step workflow: brief → Figma loop → conversion → loom refine → QA → review → staging → UAT → publish. New foundational patterns: `figma-to-liquid-conversion-protocol.md`, `shopify-cli-theme-workflow.md`, `shopify-metafield-metaobject-modeling.md`, `storefront-theme-qa-protocol.md`, `liquid-code-review-checklist.md`. Inherits HR Constitution v1.
- ★ **[Org Structure v2](patterns/good/org-structure-v2.md)** — **CANONICAL org chart** (2026-04-27). 7 departments × sub-departments × pods. Replaces flat 6-dept structure. Source-of-truth fields: registry.json `department` + `subDepartment` + `pod` + `secondaryReportsTo`. Scales to 100+ agents. Migration map for all 42 current agents included. Cross-functional matrix for ecom team (catalyst/spark/merch/sequence dual reporting).
- ★ **[Executable Auto-Fix Loop](patterns/good/executable-auto-fix-loop.md)** — Class-based retry caps (Builder 5 / Gate 3), cost breakers, escalation JSON, git autonomy rules
- ★ **[Executable Validation Gates](patterns/good/executable-validation-gates.md)** — 7 runnable scripts: Koda done-gate, Sage audit, Luna check, Vega diff, Bolt preflight, Hawk postdeploy
- ★ **[Stack A Scaffold Dry Run](patterns/good/stack-a-scaffold-dryrun.md)** — 7-phase Rankora rebuild rehearsal: Next 16 proxy cookies async, RLS SQL, Dodo HMAC, BullMQ, Yash dispatch JSON
- ★ **[Shopify App Store Submission Runbook](patterns/good/shopify-app-store-submission-runbook.md)** — 18-item checklist with runnable verify bash + `submit-gate.sh`
- ★ **[Legal Baseline Templates](patterns/good/legal-baseline-templates.md)** — Stack A ToS/Privacy/DPA, Stack B Shopify deltas, Rankora EU AI Act rider, Sage `legal-check.sh`
- ★ **[Next.js Debugging & Fix Protocol](patterns/good/nextjs-debugging-and-fix-protocol.md)** — **THE master protocol**: fix-verify loop (pnpm tsc→lint→build→test), Next.js 16 gotchas (async cookies/headers/params, Server Components, metadata API), Supabase gotchas (RLS debugging, server vs client), Shopify gotchas, common fix patterns, escalation rules. ALL code agents load this.
- ★ **[Code Change Discipline](patterns/good/code-change-discipline.md)** — Anti-cascade protocol: pre-change impact analysis, 1-3-Verify rule, blast radius categories (A/B/C), regression prevention checklist, Koda/Vex-specific sequences. ALL code agents load this.
- ★ **[Supabase Database Mastery](patterns/good/supabase-database-mastery.md)** — Production DB patterns: migration safety (zero-downtime, rollback), RLS (4 patterns + performance), triggers (updated_at, handle_new_user, audit trail, soft delete), index strategy (B-tree, GIN, trigram, EXPLAIN ANALYZE), Realtime subscriptions, Edge Functions, schema design (standard table template, JSONB, enums), backup/restore, type generation workflow, connection pooling, DB debugging (empty results, slow queries, locks)
- [Rankora Next.js Rebuild](projects/rankora-nextjs-rebuild.md) — Training ground: full Stack A rebuild from legacy Vite SPA
- [Project Registry](projects/REGISTRY.md) — All project status, setup, blockers (single source of truth)
- [Supplement Landing Prototype — Vela](projects/supplement-landing-prototype.md) — 5-variant CRO landing page; brand/pricing/architecture decisions
- ★ [shadcn v4 Base UI Compat](patterns/good/shadcn-v4-base-ui-compat.md) — **CRITICAL**: Base UI API diffs vs Radix (no type/collapsible/asChild, data-active, keep @theme inline bridge)
- [5-Variant CRO Landing Structure](patterns/good/5-variant-cro-landing-structure.md) — Portable 5-archetype CRO scaffold for any DTC brand
- [System Health](HEALTH.md) — Memory staleness, file counts, quick diagnostics

## Projects

- [ConvertScan (CROBOT)](projects/crobot.md) — AI CRO audit SaaS: architecture, bugs, current state
- [Pinzo](projects/pinzo.md) — Shopify ZIP delivery checker: compliance audit, session history
- [Clientloop](projects/clientloop.md) — ManyRequests-style SaaS: Phase 1 UI shell, mock-data-only, deploy deferred
- [Rankora](projects/rankora.md) — AI resume ranker (legacy Vite origin); Next.js 16 migration planned (70-95h, not started)
- ★ [InkOS Lessons](projects/inkos-lessons.md) — 13-sprint tattoo studio SaaS build lessons: RPC contract drift, hand-typed types antipattern, Dodo webhook spec, Sage-per-sprint rule, velocity patterns (2026-04-16); Calendar rebuild appendix (2026-04-23); Calendar PDF-closeout appendix (2026-04-23); **Messages v1 appendix: triple-layer feature gate, service-role justification, orphan-comm antipattern, webhook 503-not-200, BullMQ throw-vs-return, Realtime presence pattern, 3-pane CSS Grid, brand color remapping** (2026-04-23)
- [InkOS Clients v2 Deep Fix](projects/inkos-clients-v2-deep-fix.md) — 11-issue QA deep pass: contact tooltips, HTML stripping, allergy alerts, tag creation, archive filter, CSS tokens, health summaries batch-fetch (2026-04-22)

### Sync Pass 3 product-readiness files (2026-04-11)

- ★ [Pinzo Brand Kit](projects/pinzo-brand-kit.md) — positioning, voice DNA, palette, pillars, Sage brand gate
- ★ [Rankora Brand Kit](projects/rankora-brand-kit.md) — evidence-first voice, EU AI Act hard rules, #FACC15 reserved for resume quotes
- ★ [Pinzo Pricing + LTV](projects/pinzo-pricing-ltv.md) — 4 tiers, $238 net LTV, $79 max CAC, D30/D90 kill criteria
- ★ [Rankora Pricing + LTV](projects/rankora-pricing-ltv.md) — 3 tiers, 88% margin, $796 net LTV, 5-risk register
- ★ [Pinzo Metrics](projects/pinzo-metrics.md) — NSM "Weekly Covered Checks" + activation SQL + 8-panel dashboard
- ★ [Rankora Metrics](projects/rankora-metrics.md) — NSM "Weekly Evidence-Backed Ranks" + AI quality metric + 10-panel dashboard
- ★ [Pinzo Competitive Teardown](projects/pinzo-competitive-teardown.md) — 8 competitors, Zapiet battlecard, confidence 8/10
- ★ [Rankora Competitive Teardown](projects/rankora-competitive-teardown.md) — Eightfold battlecard, EU AI Act as moat, confidence 7/10

## Stack Knowledge

- ★ **[Stack Registry](stacks/STACK-REGISTRY.md)** — **LOAD FIRST**: Detection markers → stack file → properties. Add new stacks here (zero agent edits). All agents reference this for stack routing.
- ★ **[Stack A: Next.js + Supabase + Railway](stacks/saas-nextjs-supabase-railway.md)** — **MASTER** (Next 16.2.3 + React 19 + Tailwind 4 + Supabase + Railway + Dodo Payments + pnpm + Node 20). The ONLY stack for Boldteq internal SaaS products as of 2026-04-10.
- [Stack B: Shopify KB](stacks/shopify/INDEX.md) — 42 files across core/build/design/launch (start here)
- [Stack B: Core Rules](stacks/shopify/core/shopify-app.md) — Polaris-only, session auth, billing, GDPR
- ★ **[Stack B/C: Shopify Storefront](stacks/shopify/storefront/INDEX.md)** — Storefront-side stack KB (Hydrogen RR7, standalone Stack C, Polaris↔storefront token bridge). Distinct from admin-side Shopify KB.
- [Stack C: AI](stacks/ai-patterns.md) — Vercel AI SDK, streaming, token management (runs ON TOP of Stack A)
- [_archive/](stacks/_archive/ARCHIVED.md) — Legacy stacks. DO NOT auto-load. Only for explicit client requests or grandfathered project maintenance.

## Patterns — Good

- [Production Agent Mindset](patterns/good/production-agent-mindset.md) — 7-step execution loop, mandatory for all agents
- ★ **[Railway Deployment](patterns/good/railway-deployment.md)** — Auto-deploy, preview envs per PR, private networking, custom domains, rollback (Stack A master)
- ★ **[Next.js Production Infra](patterns/good/nextjs-production-infra.md)** — Env vars, pino logging, rate limiting, caching, health checks, BullMQ job queues, security headers (Stack A master)
- ★ **[Calendar Drag-Drop + Realtime](patterns/good/calendar-drag-drop-and-realtime.md)** — Custom CSS Grid + dnd-kit (skip paid FullCalendar), React Query scoped mutations, Supabase Realtime 3-prereq checklist, non-blocking SMS dispatch, WCAG KeyboardSensor (Stack A, from InkOS calendar rebuild 2026-04-23)
- [Service Category Color Coding](patterns/good/inkos-calendar-service-category-colors.md) — Data-layer accent colors with customHex→categoryColor→stoneTint fallback (InkOS Sprint 1-6, 2026-04-23)
- [Detail Drawer Action Pattern](patterns/good/inkos-detail-drawer-action-pattern.md) — 4 primary + 2 secondary actions, delegation via caller props, inline AlertDialog (InkOS Sprint 1-6, 2026-04-23)
- [Progressive Disclosure Form](patterns/good/progressive-disclosure-form.md) — "+ Add more" toggle, client-side blob preview, staged upload (InkOS Sprint 1-6, 2026-04-23)
- [Smart Linking Suggestion](patterns/good/smart-linking-suggestion.md) — link_booking_id pointer, server-side project_id + session_number inheritance with studio/client verification (InkOS Sprint 1-6, 2026-04-23)
- [QR from Installed Package](patterns/good/qr-from-installed-package.md) — Grep package.json before adding deps; qrcode.toDataURL with brand colors at 2x retina (InkOS Sprint 1-6, 2026-04-23)
- [NOW Line + Label Pattern](patterns/good/now-line-label-pattern.md) — Rust 2px line + anchored pill with "NOW · H:MM AM/PM", pill offset = topPx - 9, minute-tick interval (InkOS Sprint 1-6, 2026-04-23)
- [Visual Validation Protocol](patterns/good/visual-validation-protocol.md) — Auto-screenshot with Playwright
- [Handoff Protocol](patterns/good/handoff-protocol.md) — Inter-agent handoff format + quality gates
- [Validation Gates](patterns/good/validation-gates.md) — 10 pre-deployment gates for Sage + Bolt
- [Auth Patterns](patterns/good/auth-patterns.md) — RBAC, sessions, multi-tenant across all stacks
- [Billing Patterns](patterns/good/billing-patterns.md) — Dodo Payments, Shopify Billing, pricing strategy
- [Admin Panel Standards](patterns/good/admin-panel-standards.md) — 15 tabs, security, GDPR, SOC 2, UX
- [Admin Integrations](patterns/good/admin-integrations-pattern.md) — Tabbed detail panel, brand icons, status badges
- [UI/UX Standards](patterns/good/ui-ux-production-standards.md) — Build order, layout, components, typography
- [shadcn Redesign Playbook](patterns/good/ui-redesign-shadcn.md) — 16 patterns for modernizing shadcn apps
- [Sidebar Patterns](patterns/good/sidebar-patterns.md) — 10 production sidebar rules (shadcn Sidebar)
- [shadcn base-nova Patterns](patterns/good/shadcn-base-nova-patterns.md) — render prop, Tailwind v4 tokens, settings tabs, dark-mode brand
- [Layout Consistency](patterns/good/layout-navigation-consistency.md) — Prevents pages without sidebar bug
- [SaaS Winning Patterns](patterns/good/saas-winning-patterns.md) — 10 principles from Stripe/Linear/Notion
- [SaaS Brand Patterns](patterns/good/saas-brand-patterns.md) — Linear, Notion, Vercel, Dodo brand analysis
- [SaaS Growth & Onboarding](patterns/good/saas-growth-onboarding.md) — TTV, activation, retention, viral loops
- [Shopify App Patterns](patterns/good/shopify-app-patterns.md) — Rate limiting, widget sync, GDPR, Prisma
- ~~Legacy Package Safety~~ — **ARCHIVED** to `patterns/_archive/lovable/`
- ~~Legacy Execution Model~~ — **ARCHIVED** to `patterns/_archive/lovable/`
- [Claude Hub Integration](patterns/good/claude-hub-integration.md) — 3 patterns for calling agents from apps
- [SEO Patterns](patterns/good/seo-patterns.md) — Technical SEO, structured data, ranking strategy
- [Agile Methodology](patterns/good/agile-methodology.md) — Sprints, kanban, velocity for multi-project factory
- [Quality Framework](patterns/good/quality-framework.md) — Definition of Done, release management, hotfix
- [Autonomous Agent Protocol](patterns/good/autonomous-agent-protocol.md) — Self-research, self-validate, self-fix, zero-prompt ideal, ALL agents mandatory
- [Competitive Dominance Engine](patterns/good/competitive-dominance-engine.md) — 8 moats (speed, keyboard-first, complete states, design, onboarding, viral, AI, infrastructure)
- [Open-Source SaaS Patterns](patterns/good/open-source-saas-patterns.md) — 12 universal patterns from 12 production codebases (Cal.com, Dub.sh, Twenty, Novu, etc.)
- [Production-Validated Patterns](patterns/good/production-validated-patterns.md) — 1900+ lines of REAL code from Cal.com, Supabase, Vercel, Sentry, OWASP, Playwright, Infisical, Unkey (rollback, smoke tests, RLS, security headers, quality gates, E2E testing, SEO, monitoring, CI/CD, copy, ADR, scaffolding)
- [Open-Source Agent Training](patterns/good/open-source-agent-training.md) — Validated patterns from 600+ community skills + 2026-04-10 update. **30 sections**: orchestration, API design, DB, testing, CI/CD, observability, security (OWASP Top 10), SEO (AI citability), LLM cost optimization, RAG pipeline, debugging protocol, product discovery, UI tokens, payments, scaffolding phases + NEW: edge computing, realtime/CRDT, AI agent frameworks, feature flags, background jobs, email/notifications, file upload, search infrastructure, billing innovations, monorepo, agent prompt engineering, agent testing, auth patterns, ORM selection, rate limiting, observability stack
- ★ **[Agent-Ops Schema](patterns/good/agent-ops-schema.md)** — **THE database reference** for all HR agents. 15-table Supabase schema: agents, agent_runs, agent_events, training_signals, agent_reviews, composite_scores, capability_gaps, patterns_proposed, escalations, cost_tracking, performance_history, promotion_candidates, pip_tracking, deprecation_schedule, audit_trail. RLS, triggers, views, composite scoring (40% gate_pass_rate + 30% first_try_success + 20% rework_cycles + 10% yash_override_rate), adaptive promotions (Probation→Active→Expert→Architect).
- ★ **[Polyglot SDK Spec](patterns/good/polyglot-sdk-spec.md)** — **THE integration reference** for all agents. Agent dispatch, event system (16 types), run tracking, cost logging, dashboard pages (10-page Next.js spec: leaderboard, events, training, costs, patterns, reviews, escalations, promotions, training-signals, audit-trail). Replaces registry.json, witness-log.jsonl, agent-runs.json with Supabase-native events + dashboard.

- ★ **v3 Production Design System (2026-04-30)** — 9 canonical specs adopted by 16 agents (10 primary + 6 cross-trained). **Sources:** `patterns/good/v3-component-system-spec.md`, `patterns/good/v3-token-export-spec.md`, `patterns/good/v3-business-context-resolver.md`, `patterns/good/v3-memory-architecture.md`, `patterns/good/v3-ab-variant-engine.md`, `patterns/good/v3-performance-pass-rules.md`, `patterns/good/v3-data-adapter-pattern.md`, `patterns/good/v3-control-panel-spec.md`, `patterns/good/v3-engine-contract-spec.md`. **Decisions:** strict semver + 80% dedup, 4-format token export (W3C/Tailwind/CSS/TS), hard-enforce goal→CRO mapping + dictionary objection placement + auto diff-callout, Supabase-backed 4-tier memory (user_prefs/project_state/pattern_library/outcomes), single-axis A/B variants + Bayesian P>0.95 + MDE≥0.10 + vega-ratified promotion, hard-block perf budget (LCP≤2.5s/INP≤200ms/CLS≤0.1/JS≤170KB), mandatory data_contract per data-driven component + mock→real CLI migration, control panel spec-only this cycle (Polyglot UI extension). Changelog: `training/cycle-v3-design-system-changelog.md`.

## Patterns — Avoid

- [Antipatterns](patterns/avoid/antipatterns.md) — Security, DB, performance, sidebar, billing antipatterns

## Design Knowledge Base

- [Pixel Skills](../skills/pixel/) — Public-facing page designer: Flowbase DNA, niche blueprints, font pairings, CRO psychology, 14 page types
- [Design KB Index](design/INDEX.md) — 35 files, 43K lines. Tokens, patterns, standards (start here) — **SaaS-only, do NOT import for ecom**
- ★ **[Ecom Design KB](design/ecom/INDEX.md)** — Ecom storefront design (PDP, cart, checkout, listing, hero, trust, post-purchase, subscription, motion, mobile). Owner: elio + vega. Stack B/C only.
- Quick links: [tokens](design/core/design-tokens.md) | [colors](design/core/color-system.md) | [motion](design/core/motion.md) | [a11y](design/standards/accessibility.md) | [state](design/standards/state-management.md) | [errors](design/standards/error-handling.md) | [shadcn](design/references/shadcn-patterns.md) | [SaaS examples](design/references/best-saas-examples.md)
- Patterns: [dashboards](design/patterns/dashboards.md) | [forms](design/patterns/forms.md) | [tables](design/patterns/data-tables.md) | [auth](design/patterns/auth-pages.md) | [billing](design/patterns/billing-ui.md) | [settings](design/patterns/settings.md) | [nav](design/patterns/navigation.md) | [landing](design/patterns/landing-page.md) | [onboarding](design/patterns/onboarding.md) | [notifications](design/patterns/notifications.md) | [errors](design/patterns/error-pages.md) | [empty](design/patterns/empty-states.md) | [loading](design/patterns/loading-states.md) | [upload](design/patterns/file-upload.md) | [email](design/patterns/email-templates.md) | [search](design/patterns/search.md) | [chat](design/patterns/chat.md) | [realtime](design/patterns/real-time.md) | [changelog](design/patterns/changelog.md) | [help](design/patterns/help-center.md)

## Content

- [Copy Patterns](content/copy-patterns.md) | [App Store Listings](content/app-store-listings.md) | [Brand Voices](content/brand-voices.md)
- ★ **[Ecom Copy KB](content/ecom/INDEX.md)** — Ecom on-page + lifecycle copy (PDP body, cart microcopy, checkout reassurance, post-purchase, subscription, hero/CTA, lifecycle email, objection handling). Owners: merch (on-page) + spark (above-fold) + sequence (lifecycle).

## Agents

- [Performance Summary](agents/performance-summary.md) — Aggregate metrics per agent
- [Session Archive](agents/sessions/) — Detailed per-session performance logs

## Decisions

- [GDPR: Dashboard not TOML](decisions/2026-04-03-gdpr-webhooks-not-toml.md) — GDPR webhooks via Partner Dashboard
- [Dodo replaces Stripe](decisions/2026-04-06-stripe-to-dodo-migration.md) — Dodo default for all Boldteq SaaS

## Intake (Recent Sessions)

- [CROBOT session 7](intake/2026-04-06-crobot-sidebar-navigation-overhaul.md) — Sidebar overhaul
- [CROBOT session 6](intake/2026-04-06-crobot-ui-modernization.md) — 42-file UI modernization
- [CROBOT session 5](intake/2026-04-06-crobot-admin-integrations-redesign.md) — Admin integrations redesign
- Older sessions archived in `intake/archive/`
