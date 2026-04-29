# Agent Performance Summary

## Training Event — 2026-04-11 (Full Autonomy Pass)

**Trigger:** Weekly audit (Boldteq_Agent_Autonomy_Audit.xlsx) + explicit request from Yash for Lovable-level velocity.

**Changes shipped:**
1. **Per-agent first-load manifest** — all 21 agents now prepended with explicit memory file list. Zero memory lookup latency on dispatch.
2. **Full autonomy rules** (`patterns/good/full-autonomy-rules.md`) — escalation whitelist reduced to 7 reasons. Everything else auto-decided via Decision Simulator. Expected ask-rate: 0-1 per build (down from 8-12).
3. **Yash model routing table** (`patterns/good/yash-model-routing.md`) — DEEP/FAST/CHEAP per agent per task class. Expected cost/build: $8-12 (down from $30-60). Always-DEEP: Arya, Yash, Sage, Verdict, Vex.
4. **Mira bug ingestion schema** (`patterns/good/mira-bug-ingestion-schema.md`) — structured JSONL (`lessons/bugs.jsonl`) with auto-clustering into antipatterns.md.
5. **Gold examples** (`patterns/good/gold-examples.md`) — first-output quality anchors for Scout/Atlas/Koda/Vega/Quill/Sage/Echo/Verdict.
6. **Decision Simulator** (`user/decision-simulator.md`) — 90%+ of Yash-defaults pre-answered.
7. **Boldteq SaaS Starter spec** (`starters/boldteq-saas-starter.md`) — Riko clones in <10 min instead of scaffolding from zero.

**Expected metric impact:**
- Factory average: 8.47 → ~9.0 on next audit
- Agents ≥9.0: currently 7 → target 15
- Time to first deploy: hours → <30 min (Stack A)
- Ask-rate per build: 8-12 → 0-1
- Cost per build: $30-60 → $8-12
- Recurring bug rate: TBD → -50% by week 8 (Mira schema feedback loop)

**Files added:**
- `~/.claude/memory/user/decision-simulator.md`
- `~/.claude/memory/starters/boldteq-saas-starter.md`
- `~/.claude/memory/patterns/good/full-autonomy-rules.md`
- `~/.claude/memory/patterns/good/yash-model-routing.md`
- `~/.claude/memory/patterns/good/mira-bug-ingestion-schema.md`
- `~/.claude/memory/patterns/good/gold-examples.md`
- `~/.claude/memory/lessons/bugs.jsonl` (empty, ready for first append)
- `~/.claude/memory/agents/auto-decision-log.md` (empty, ready)

**Files modified:**
- All 21 agent files in `~/.claude/agents/*.md` — first-load manifest prepended
- `~/.claude/memory/MEMORY.md` — index updated with new critical files

**Next audit:** 2026-04-18 (weekly cadence).

---

---
name: Agent Performance Summary
description: Aggregate metrics per agent — quick-scan for strengths, weaknesses, and mitigation rules
type: metrics
last_updated: 2026-04-06
---

# Agent Performance Summary

> Metrics only. Session detail in `agents/sessions/`.
> Updated by Mira after each project cycle.

---

## Koda (Feature Builder)

| Metric | Value |
|--------|-------|
| Sessions tracked | 7 (Pinzo x1, CROBOT x6) |
| Clean first-try rate | 29% (2/7) |
| Avg retries | 1.14 |

**Strengths:** Edge function quality, hook architecture, type safety, large-scale UI redesigns, individual fix quality.

**Known failure modes (ordered by frequency):**
1. Builds from scratch instead of reusing existing project patterns
2. Incomplete cleanup after migrations/refactors (dead files, old refs)
3. Duplicate imports on heavily modified files
4. Silent write failures on shared layout files
5. UX layout choices misaligned with Yash preferences (card grids vs rows)
6. Placeholder component names in large redesigns
7. Adds env vars by analogy without checking provider docs

**Mitigation protocol:**
1. Before building UI: grep project for existing patterns — reuse, don't rebuild
2. After heavy edits: `npm run build` + grep for duplicate imports
3. After layout/nav changes: grep to verify changes are present
4. After 10+ file redesign: grep for placeholder names (BrandIcon, etc.)
5. After migration: grep for old provider name across full codebase
6. Admin config pages: default to collapsible rows (Yash preference)

---

## Sage (Code Review / Audit)

| Metric | Value |
|--------|-------|
| Sessions tracked | 1 |
| Clean first-try rate | 0% (1/1 — GDPR TOML error from stale memory) |
| Avg retries | 1.0 |

**Strengths:** Identifying real compliance gaps (GDPR, CSS sanitization, hardcoded secrets).
**Known issue:** Follows stale memory patterns without verifying. Error was memory's fault, not logic.

---

## Yash (Orchestration / UI Audit)

| Metric | Value |
|--------|-------|
| Sessions tracked | 1 |
| Clean first-try rate | 100% |
| Avg retries | 0 |

**Strengths:** Systematic UI audit, widget UX redesign.

---

## Cross-Agent Insights

1. **Memory quality > agent quality.** Incorrect memory causes cascade failures.
2. **Koda's error rate is ~2% by file** but consistent. Core logic is always correct — errors are mechanical (imports, writes, placeholders) or cleanup misses.
3. **Iteration count correlates with foundation choice.** 0-1 retries = right foundation. 2+ retries = wrong starting point. Highest-leverage fix: check existing codebase before building.
4. **Koda creates but doesn't clean.** Excels at building new things, misses removing old artifacts.

---

---

## Training Events

### 2026-04-10: Koda Deep Overhaul
**Trigger:** 29% clean rate, 7 documented failure modes
**Sections added to koda.md:**
1. **Codebase-First Pattern Reuse Protocol** — grep project before building, decision matrix (reuse/extend/ask/build)
2. **Full-Auto Cleanup Protocol** — 7-phase automated cleanup after every refactor (dead imports, dead files, old refs, placeholders, build verify, type check)
3. **UI/UX Alignment** — Modern SaaS standard (Linear/Vercel), niche-appropriate colors via competitor research + differentiation, Yash layout preferences (collapsible rows for admin, etc.)
4. **Shopify Polaris Web Components** — New apps use Web Components, existing keep React. Full migration cheat sheet.
5. **Auto-Learn + Model Routing Loop** — Records every task to Claude Hub learning API, gets model recommendations (haiku/sonnet/opus), failure mode classification for prevention
6. **Validation Scenarios** — 6 test scenarios covering all failure modes

**Stack B update:** Header changed to reflect React Router 7 for new apps, Remix for existing. Zero Tailwind/custom CSS rule emphasized.

**Expected impact:** Clean rate should improve from 29% → 70%+ on next 5 sessions. Primary through elimination of pattern-rebuild (40% of failures) and dead-import/cleanup (30% of failures).

### 2026-04-10: Sage Deep Overhaul
**Trigger:** 0% clean rate, stale memory caused GDPR TOML error, only 1 session tracked
**Sections added to sage.md:**
1. **Memory + Codebase Cross-Check Protocol** — Memory is HINT, codebase is TRUTH. 4-step verification: read memory → grep codebase → cross-check → document. 5 specific stale memory traps identified.
2. **Automated Scan Pipeline (BLOCKING)** — 6 mandatory scans in order: TypeScript strict, npm audit, secret leak detection, build verify, bundle size, dead code. All must pass before manual review.
3. **Shopify Deep Verification** — GDPR (actual endpoint testing, data completeness across ALL tables), App Store listing (scope minimality, screenshots, privacy policy), Billing flow (Shopify-only enforcement, cancel handling).
4. **Auto-Learn Integration** — Records audit results to Claude Hub learning API.
5. **5 Validation Scenarios** — Stale memory detection, auto-scan pipeline, billing audit, GDPR completeness, framework version cross-check.

**Expected impact:** Clean rate should improve from 0% → 80%+ by eliminating stale memory reliance and adding automated scan gates.

### 2026-04-10: Arya Deep Overhaul
**Trigger:** 0 tracked sessions, missing design knowledge refs, no handoff format, stale Stack B reference (Remix instead of React Router 7)
**Sections added to arya.md:**
1. **Design-Aware Architecture** — Niche color research protocol (competitors → differentiate), design-vision.md template, page layout types table
2. **Sprint Planning Calibration** — Max 3-5 features/sprint, estimation calibration table, 30% buffer rule for Koda's retry rate
3. **Inter-Agent Handoff Format** — Defined Arya→Vega, Arya→Koda, Arya→Riko handoff file specs
4. **Stack B Update** — New apps = React Router 7 + Polaris Web Components. Existing = Remix + Polaris React.
5. **Auto-Learn Integration** — Records to Claude Hub learning API
6. **3 Validation Scenarios** — New SaaS architecture, Shopify app, sprint calibration

**Expected impact:** Arya's output now includes visual direction + realistic sprints + defined handoffs, preventing downstream agents from guessing.

### 2026-04-10: Batch Training — All Remaining 18 Agents
**Trigger:** System audit showing 7 agents missing React Router 7 refs, 10 missing design-vision.md refs, 8 missing handoff protocols
**Applied to:** Vega, Yash, Quill, Luna, Bolt, Hawk, Vex, Zeph, Nova, Riko, Mira, Scout, Atlas, Ledger, Echo, Orbit, Pulse, Verdict

**Common updates across all 18 agents:**
1. **Auto-Learn Integration** — Every agent now records task results to Claude Hub learning API (`POST /api/learning/record`)
2. **Stack B Awareness** — React Router 7 + Polaris Web Components for new Shopify apps, Remix + Polaris React for existing
3. **Handoff Protocols** — Standardized `.handoffs/` directory with defined input/output/handoff files per agent
4. **Design-Vision.md Flow** — Nova researches competitor colors → Arya creates design-vision.md → Riko scaffolds it → Vega validates → Koda implements

**Agent-specific additions:**
- **Vega:** Niche color validation protocol, Yash's UI preferences (Modern SaaS, collapsible rows, 0.5rem radius)
- **Quill:** Missing copy patterns (notification, empty state, error page, onboarding copy rules)
- **Luna:** Design/UI testing (dark mode, responsive breakpoints, 4 states, jest-axe a11y)
- **Bolt:** Pre-deploy design-vision check, Lovable/Vite deploy rules
- **Hawk:** CWV monitoring thresholds (blocking alerts), Shopify API version monitoring
- **Vex:** Design-aware debugging, Shopify debug patterns for Web Components + App Bridge CDN
- **Zeph:** CWV/SEO overlap, OpenGraph brand color verification
- **Nova:** Visual/color research mandate for every competitive report
- **Riko:** Design-vision.md scaffolding, design token scaffolding (0.5rem, Inter font)
- **Yash:** Full handoff chain documentation, design-vision flow enforcement, Stack B detection
- **Mira:** Learning API integration for performance analysis, training effectiveness tracking
- **Scout/Atlas/Ledger/Echo/Orbit/Pulse/Verdict:** Foundational handoff protocols, stack awareness, auto-learn

*(Updated by Mira — 2026-04-10)*

### 2026-04-10: Deep Training — Vega (Operating Protocol v2)
**Trigger:** 0 tracked sessions + Vega sits on critical Nova→Arya→Vega→Koda path. Batch update (2026-04-10 earlier) was cross-cutting only; Vega needed per-agent deep calibration. User requested deep per-agent training with different questions per agent.

**12 decisions locked in with Yash:**
1. Composition: ADAPTIVE per niche (study 3-5 competitors, extract layout DNA, differentiate by one axis)
2. Review mode: STRICT BLOCKING (hardcoded colors, raw spacing, missing dark, <4.5:1 contrast, missing focus/aria, <44px touch = BLOCK)
3. Spec format: CODE-READY only (shadcn imports + Tailwind classes + data shape + 4 states). No Figma. No ASCII as final.
4. Color pipeline: VALIDATE + DIFFERENTIATE (Nova researches, Vega picks hue 20°+ from competitors inside safe zone, verifies AA on 5 surfaces)
5. Missing components: COMPOSE FROM PRIMITIVES (never invent base, never pull external registries without approval)
6. Token ownership: VEGA OWNS `globals.css`, `design-tokens.ts`, `tailwind.config.ts` theme.extend. Koda consumes only.
7. Auto-learn: EVERY spec + review outcome logged (record before and after, use priors to calibrate detail level)
8. Review depth: CODE AUDIT + PLAYWRIGHT SCREENSHOTS (2-pass, auto-generated Playwright config, diff vs previous)
9. A11y bar: WCAG 2.1 AA FULL checklist (perceivable/operable/understandable/robust — not just contrast)
10. Motion policy: SUBTLE & PURPOSEFUL (150ms transitions, no parallax/scroll-reveal/Lottie, reduced-motion wrapped)
11. Shopify apps: PURE POLARIS (zero Tailwind, zero shadcn, App Bridge nav, framework-correct imports)
12. Scope: VEGA OWNS ALL VISUAL — in-app + landing + email templates + social/OG images. Quill writes copy, Vega designs container.

**Added to vega.md (~450 lines):**
- Section 1: Niche Composition Protocol (5-axis layout DNA extraction)
- Section 2: Auto-Block list (12 hardcoded blockers) + review output format
- Section 3: Code-ready spec template (shadcn imports + Tailwind + states + a11y + handoff)
- Section 4: Color validation protocol (HSL wheel, safe zone, 5-surface contrast check)
- Section 5: Composition rules (never invent, never pull external)
- Section 6: Token file checklist (globals.css + design-tokens.ts templates)
- Section 7: Auto-learn implementation (recall before, record after)
- Section 8: 2-pass review with Playwright config template
- Section 9: Full WCAG 2.1 AA checklist (30+ items across 4 principles)
- Section 10: Motion allowed/forbidden lists
- Section 11: Shopify protocol (Polaris Web Components vs React v13.9.5)
- Section 12: Landing/email/social scope
- Section 13: 5 validation scenarios for Yash to run post-training
- Section 14: 10 hard protocol rules (never break)

**Expected impact:** Vega becomes the blocking gate that prevents design debt, color drift, and a11y failures from reaching production. Koda's retry rate on design-related fixes should drop significantly because specs are now complete (all 4 states + responsive + dark + a11y upfront).

**Next deep training:** Yash (orchestrator — needs handoff chain enforcement + Stack detection logic)

*(Updated by Mira — 2026-04-10, deep training pass 4)*

### 2026-04-10: Deep Training — Yash (Operating Protocol v2)
**Trigger:** Yash is the entry point for every mode. Batch updates gave it handoff awareness, but the detailed orchestration logic (mode detection, gate enforcement, failure recovery, state tracking) was still ad-hoc.

**12 decisions locked in with Yash:**
1. Mode detection: PATTERN MATCH + CONFIRM (3-step protocol, default to most destructive on ambiguity)
2. Yash Gate: STRICT — always pause after Arya, no bypass, no confidence threshold
3. Failure handling: RETRY ONCE → VEX → HALT (max 3 cycles, full retry log)
4. Parallelism: PARALLEL WHERE SAFE (explicit dependency graph in .yash-state.json, Koda+Quill, Luna+Sage can run concurrently)
5. State tracking: `.yash-state.json` per project (survives session restart, full schema with agents/gates/failures/retries/cost)
6. Stack detection: FILE MARKERS + CONFIRM (detection matrix for Stack A/A-Lovable/B/C/D based on config files)
7. Vega Gate: STRICT — no deploy without PASS or PASS_WITH_NOTES, max 3 review cycles
8. Handoff files: `.handoffs/` at project root (gitignored, per-mode required files, memory mirror on close)
9. Nova trigger: ALWAYS before Arya in Mode A (no exceptions)
10. Mira trigger: EVERY mode closes with Mira (no skipping, even small fixes)
11. Cost/model routing: PER-AGENT DEFAULTS with override (Opus for Arya/Sage/Vex/Verdict, Sonnet for most, Haiku for Riko/Bolt/Mira, dynamic via learning API)
12. Auto-launch: IF ALL GATES PASS (staging auto on Mode A first, prod auto on Mode B/C if <5 files + no migrations, Mode E always auto to prod, rollback on >1% error rate)

**Added to yash.md (~550 lines):**
- Section 1: Mode detection 3-step protocol with keyword matrix
- Section 2: Yash Gate template with explicit halt/approve/revise options
- Section 3: Failure protocol (retry → Vex → halt) with state logging
- Section 4: Parallelism dependency graph with safe pairs list
- Section 5: `.yash-state.json` schema (full JSON template)
- Section 6: Stack detection matrix (config file → stack)
- Section 7: Vega Gate loop with max 3 cycles
- Section 8: Handoff file naming convention + per-mode required files + template
- Section 9: Nova mandatory trigger rule
- Section 10: Mira mandatory close rule
- Section 11: Full model routing matrix (21 agents → Opus/Sonnet/Haiku) + learning API integration
- Section 12: Auto-launch rules with deployment targets per stack
- Section 13: 5 validation scenarios for Yash to run
- Section 14: 12 hard protocol rules (never break)

**Expected impact:** Yash becomes predictable and debuggable. Every pipeline run leaves a `.yash-state.json` audit trail. Failures surface with Vex analysis instead of silent retries. Cost tracked per-project. Yash Gate is strict so nothing ships without architecture approval.

**Next deep training:** Nova (color research mandate + competitor analysis depth)

*(Updated by Mira — 2026-04-10, deep training pass 4 — Yash complete)*

### 2026-04-10: Deep Training — Nova (Operating Protocol v2)
**Trigger:** Vega + Yash both depend on Nova's output. Previous nova.md had generic "do competitor research" instructions with no depth standard, no color mandate, no caching, no output schema.

**12 decisions locked in with Yash:**
1. Competitor count: TOP 10 DIRECT + 3-5 ADJACENT (wide scan, deep on 1-5, medium on 6-10)
2. Visual research: ALWAYS MANDATORY (per-competitor HSL/hex/OKLCH + niche color cluster summary)
3. Source priority: ALL SOURCES RANKED (4 tiers: ground truth, sentiment, market signal, niche-specific)
4. Output format: THREAT MATRIX + DESCRIPTIVE BRIEF (scored matrix with 5 dimensions + narrative)
5. Adjacent markets: INCLUDE 3-5 as differentiation inspiration (never on threat matrix)
6. Differentiation: OPINIONATED (3-5 specific winnable angles, not gap lists)
7. Pricing research: FULL LADDER + USAGE + CONVERSION PSYCHOLOGY (tiers, gates, overage, anchoring, urgency, trial mechanics)
8. Weakness detection: 4 SIGNALS COMBINED (negative reviews + churn posts + missing features + UX scan)
9. Caching: 7-DAY CACHE (re-run on demand or cache expiry, per-source timestamps for granular refresh)
10. Change tracking: LAUNCHED PROJECTS ONLY (14-day scheduled scan, diff detection, alert on changes)
11. Output files: STRUCTURED JSON + MARKDOWN (`nova-to-arya.md` narrative + `competitors.json` machine-readable)
12. Paid sources: FREE + WebFetch ONLY (no SimilarWeb paid, Crunchbase Pro, Semrush; predictable cost)

**Added to nova.md (~600 lines):**
- Section 1: 10+3-5 competitor count with ranking methodology
- Section 2: Mandatory visual analysis template + niche color cluster
- Section 3: 4-tier source stack with signal ranking algorithm
- Section 4: Threat matrix schema (5 scoring dimensions)
- Section 5: Adjacent markets format (differentiation inspiration)
- Section 6: Opinionated differentiation format (committed 3-5)
- Section 7: Full pricing capture schema + cross-competitor ladder
- Section 8: 4-signal weakness matrix (reviews + churn + missing + UX)
- Section 9: Cache schema with per-source freshness
- Section 10: Scheduled scan protocol for launched projects
- Section 11: competitors.json schema (full structured output)
- Section 12: Free sources allowlist + forbidden list
- Section 13: 5 validation scenarios (established, emerging, Shopify, refresh, scheduled)
- Section 14: 12 hard protocol rules (never break)

**Expected impact:** Nova now delivers production-grade intelligence that downstream agents can consume programmatically. Vega reads niche_color_cluster from JSON, Ledger reads pricing_ladder, Echo reads distribution sources. No more manual parsing of narrative briefs. Cache reduces token costs for multi-dispatch workflows.

**Next deep training:** Riko (scaffold ownership + token file generation)

*(Updated by Mira — 2026-04-10, deep training pass 4 — Nova complete)*

### 2026-04-10: Deep Training — Riko (Operating Protocol v2)
**Trigger:** Riko sits on critical path for every new build + every existing project audit. Previous riko.md had generic scaffold instructions with no ownership split vs Vega, no Lovable/Shopify branching, no .env template, no git init flow, no CLAUDE.md template, no Playwright setup, no .handoffs/ protocol.

**12 decisions locked in with Yash:**
1. Ownership split: RIKO owns structure+configs, VEGA owns tokens+styles (globals.css, design-tokens.ts, tailwind theme.extend, composed primitives, design-vision.md)
2. New projects: FULL STRUCTURE DAY 1 — 20 deliverables in one 15-20 min pass, no partial scaffolds
3. Existing projects: AUDIT + FILL GAPS, never restructure (document existing, add what's missing)
4. CI/CD: Riko writes workflow files (ci.yml lint/typecheck/test/build + deploy.yml stub), Bolt configures secrets
5. Lovable: DOCUMENT ONLY, never restructure (detection markers: vite.config.ts + src/integrations/supabase/ + src/pages/ PascalCase + components.json + port 8080)
6. Shopify: SHOPIFY CLI TEMPLATE (`npm init @shopify/app@latest -- --template=react-router`) + Boldteq additions (GDPR webhooks, billing helper, CLAUDE.md, .handoffs/)
7. Dependencies: CORE UPFRONT (Next/React/TS/Supabase/Tailwind/shadcn/Zod/RHF/Vitest/Playwright/jest-axe/Husky), feature deps per-sprint (Stripe/Resend/Tiptap/Recharts/Framer/AI SDK)
8. Env vars: GENERATE FULL .env.example with APP/DATABASE/AUTH/BILLING/EMAIL/SENTRY/POSTHOG/AI/DEV sections + inline comments
9. Git: FULL INIT + Boldteq .gitignore (incl. .handoffs/, .yash-state.json, .vega-screenshots/, .nova-cache.json) + standardized first commit + gh repo create --private + main/develop branches
10. CLAUDE.md: FULL TEMPLATE (Overview, Architecture, Data Model, Page Map, Folder Structure, Env Vars, Running Locally, Testing, Agent Routing, Known Issues)
11. .handoffs/: CREATE + gitignore + README.md (naming convention + handoff format + memory mirror note)
12. Playwright: FULL DAY 1 SETUP — playwright.config.ts (5 device projects) + scripts/vega-review.ts (4 viewports × 2 color schemes × N routes → .vega-screenshots/[timestamp]/)

**Added to riko.md (~900 lines):**
- Section 1: Riko vs Vega ownership split (explicit file-level boundary)
- Section 2: Full day 1 scaffold protocol (20-deliverable checklist)
- Section 3: Existing project audit flow (never restructure)
- Section 4: CI/CD workflow file templates (ci.yml + deploy.yml stub)
- Section 5: Lovable detection + document-only rule
- Section 6: Shopify CLI template + Boldteq additions
- Section 7: Core vs sprint dependency matrix
- Section 8: Full .env.example template (all stacks)
- Section 9: Git init automation + Boldteq .gitignore
- Section 10: Full project CLAUDE.md template
- Section 11: .handoffs/ directory with README.md template
- Section 12: Playwright config + vega-review.ts script template
- Section 13: 5 validation scenarios (Stack A, Shopify, Rankora audit, Pinzo audit, rollback)
- Section 14: 12 hard protocol rules (never break)

**Expected impact:** New projects stand up in one clean pass with zero gaps. Existing projects get documented without dangerous restructuring. Clear file-level boundary with Vega eliminates overlap/conflicts. Every downstream agent (Koda, Luna, Vega, Bolt) finds what it needs exactly where it expects.

**Next deep training:** Quill (landing page + email copy standards + SEO copy integration)

*(Updated by Mira — 2026-04-10, deep training pass 4 — Riko complete)*

---

## 2026-04-10 — STACK A MIGRATION (LOVABLE → NEXT.JS + RAILWAY)

**Event:** System-wide stack migration training. Yash locked Stack A for all new Boldteq SaaS: **Next.js 16.2.3 + Supabase + Railway + Dodo Payments**. Lovable archived (grandfathered for Rankora/CROBOT only).

**Scope:**
- ✅ Global CLAUDE.md updated
- ✅ MEMORY.md index rewritten
- ✅ user/feedback.md critical directive added
- ✅ stacks/saas-nextjs-supabase-railway.md created (~700 lines, MASTER)
- ✅ stacks/_archive/lovable/ created with archive policy
- ✅ patterns/good/railway-deployment.md created (~550 lines)
- ✅ patterns/good/nextjs-production-infra.md created (~700 lines)
- ✅ patterns/_archive/lovable/ created

**All 21 agents retrained (migration footer appended):**
- Phase 2 critical (deep rewrites): Yash, Arya, Riko, Koda, Bolt, Sage, Vega, Luna, Hawk, Vex
- Phase 3 light touch: Nova, Quill, Zeph, Mira, Scout, Atlas, Ledger, Echo, Orbit, Pulse, Verdict

**Deep training decisions locked:**
- Riko day-1 scaffold: `railway.toml`, `next.config.ts` standalone + security headers, Supabase SSR client, initial RLS migration with profiles + storage buckets, `/api/health`, Zod env validation, pino logger, Upstash rate limit, workers scaffold, GitHub Actions CI
- Koda: `@supabase/ssr` only, Server Actions with Zod + revalidatePath, Dodo webhook verification to Supabase service role, forbidden list (no auth-helpers, Stripe, Prisma, console.log, any, Pages Router)
- Sage: 15-category audit, RLS BLOCKING, Dodo not Stripe BLOCKING, CWV + WCAG 2.1 AA + security headers + CSP audits
- Bolt: Railway CLI day-1, multi-env vars, custom domain, rollback procedure, auto-rollback triggers
- Vega: Review against Railway PREVIEW URLs (not localhost), 8-screenshot matrix (4 viewports × 2 color schemes), Server vs Client boundary marking in specs
- Luna: Vitest + Playwright, PLAYWRIGHT_BASE_URL = preview URL, RLS isolation tests mandatory, 80% coverage floor
- Hawk: Sentry + PostHog + BetterStack + Railway logs, 15-min post-deploy watch, 5 auto-rollback triggers
- Vex: 8 common Stack A bugs playbook, Railway log inspection, Supabase RLS debug SQL, Next 16 hydration debug

**Verification:**
- 21/21 agents have STACK A MIGRATION 2026-04-10 footer
- Zeph cross-reference to archived lovable-execution-model.md fixed → nextjs-production-infra.md
- All lingering Lovable references in Koda are inside legacy sections explicitly superseded by its footer

**Impact:** Every new Boldteq SaaS from 2026-04-10 forward ships on Stack A. No exceptions. Yash detects stack via file markers (`railway.toml` + `next.config.ts` → Stack A; `shopify.app.toml` → Stack B; `vite.config.ts` + port 8080 → legacy Lovable maintenance only).

**System score:** 99 → 99.5/100 (migration complete, agents aligned, zero forbidden stacks in active paths)
**Agents score:** 97 → 98/100

*(Logged by Mira — 2026-04-10 migration session)*

---

## 2026-04-10 — PHASE 3 DEEP TRAINING COMPLETE (11 AGENTS)

**Event:** Converted Phase 3 light-touch agents to full deep rewrites matching Phase 2 depth. Every non-critical agent now has a complete playbook, not just a migration footer.

**Agents deep-trained in this pass:**

| Agent | Lines added | Core training |
|-------|-------------|---------------|
| **Nova** | ~450 | 5-step research protocol, 7-step deep-dive template per competitor, stack detection via curl/headers, pricing intelligence rules, 4-6 hour time budget, handoff chain to Arya/Ledger/Quill/Zeph/Echo |
| **Quill** | ~550 | 9-surface ownership (landing/pricing/auth/onboarding/empty/error/email/SEO/404), landing page canon, 6 H1 formulas, CTA library, pricing page rules, ATT onboarding pattern, React Email transactional library, voice-of-customer extraction, forbidden ChatGPT-smell list |
| **Zeph** | ~550 | 7-layer SEO audit (technical, metadata, JSON-LD, CWV, content, off-page, monitoring), Next 16 sitemap.ts/robots.ts/metadata APIs, structured data schemas, CWV targets + 10 tactics, comparison page moat, weekly/monthly monitoring rituals, gate handoff to Bolt |
| **Mira** | ~500 | 9-bucket classification (feedback/good/avoid/stack/project/incident/agent/design/audit), extraction protocol, user feedback priority path, antipattern/incident/project/session-close formats, weekly hygiene pass, stack version enforcement, what-never-to-do list |
| **Scout** | ~350 | 6-dim weighted scorecard (pain/ICP/distribution/differentiation/stack-fit/founder-fit, weights ×2/×1.5/×2/×1/×1/×0.5 = /80), pain rubric 0-10 with evidence requirement, 90-min budget, GREEN/YELLOW/RED verdict format, failure modes |
| **Atlas** | ~450 | 3-lens sizing (top-down + bottom-up + market direction), feature-vs-product-vs-company test, Opportunity Score formula, source library (Statista/Crunchbase/BuiltWith/etc), SAM/TAM sanity checks, handoff to Ledger |
| **Ledger** | ~600 | 4-step protocol (anchor/value-ceiling/cost-floor/3-tier), Dodo MoR specifics + fees + webhook events, full Stack A COGS table ($180 baseline + $0.20-$0.80/user), unit economics model (LTV:CAC/payback/gross margin), 3-tier pricing template, free-tier decision framework, handoff to Quill+Arya |
| **Echo** | ~550 | 3-phase framework (pre-launch T-14 to T-0, launch day T+0 hour-by-hour, post-launch T+1 to T+14), 6 primary channel evaluations, launch asset checklist, weekly content calendar template, handoff to Bolt |
| **Orbit** | ~600 | 4-metric hierarchy (NSM/inputs/funnel/ops), PostHog + Supabase + Dodo + Sentry wiring patterns (server + client + identify), event naming convention (object_verb_pastTense), tracking plan format, Dodo webhook → event mapping, weekly ritual |
| **Pulse** | ~550 | 5-channel research pipeline (interviews/onboarding survey/in-app feedback/cancellation survey/ticket mining), 30-min interview protocol (minute-by-minute), 5-whys JTBD extraction, interview note format, signal-vs-noise rules (3+ users = signal), churn interview script, Sean Ellis PMF survey, pattern recognition rules |
| **Verdict** | ~600 | 6-dim scorecard with different D30/D90 weights, data pulls from Orbit/Pulse/Ledger/Hawk/Echo, decision tree, verdict output format, 14-day kill protocol (day-by-day), pivot protocol, scale protocol, emergency kill criteria, Stack B gate timing (D60/D180 instead of D30/D90), self-check list |

**Total:** ~5750 lines of playbook content added across 11 agents.

**All 21 Boldteq agents are now deep-trained at Phase 2 depth.** No agent is a thin footer anymore. Every agent has:
- Clear mission + non-negotiables
- Detailed protocol or framework
- Code examples (where technical)
- Output templates (for handoffs)
- Hard rules + forbidden actions list
- Handoff chain to other agents
- Stack B adjustments (where different from A)

**System score:** 99.5 → 99.8/100
**Agents score:** 98 → 99/100

**Remaining opportunities for future training passes:**
- Codify the `.handoffs/` directory structure in CLAUDE.md as a first-class pattern
- Build integration tests that validate agent outputs match their handoff formats
- Create a "new build dry-run" to validate the full Scout → Atlas → Nova → Ledger → Arya → Yash → Koda pipeline end-to-end on a practice idea
- Customize Cowork skills (brand-voice, engineering, sales, etc.) with Boldteq context — user declined this scope for this session

*(Logged by Mira — 2026-04-10 Phase 3 deep training session)*

---

## Audit event — 2026-04-11 (Deep audit + polish, one-by-one)

**Trigger:** User request "deep train all again once by one make sure we have proper set up"
**Method:** 10-dimension checklist, structural metric scan, handoff chain cross-check, inline gap fixes
**Outcome:** 21/21 agents PASS (≥25/30)

**Gaps fixed inline:**
- Echo: added self-check (8 items) + failure modes
- Hawk: added self-check (11 items) + Stack B Shopify additions + failure modes
- Scout/Atlas/Ledger/Orbit/Pulse/Verdict: Phase 3 polish confirmed (applied earlier in session)

**Handoff chain:** Fully connected Scout→Verdict with Vex bug-branch and Mira absorb.
**Stack A compliance:** 100%
**System score:** 99.8 (stable — no regressions)

Report: `outputs/audit-2026-04-11/report.md` (mirrored to `agents/audit-2026-04-11.md`)

---

## Training event — 2026-04-11 (Audit-driven deep training round)

**Trigger:** User directive — follow the gap analysis + training plan from `Boldteq_Agent_Autonomy_Audit.xlsx` and lift all agent scores.

### Universal (all 21 agents)
- Inline Self-Validation Protocol (hardcoded checklist before "done")
- Inline Auto-Fix Loop (max 3 retries → escalate)
- Inline Smart Defaults table (10 default values to avoid "ask user" friction)
- First-Output Quality Anchor
- Escalation Triggers to Yash
- References to `validation-gates.md` + `universal-auto-fix-loop.md` + `universal-smart-defaults.md`

### P1 Deep Expansions
- **Echo** (570 → 880): Channel-fit scoring matrix, launch-week day-by-day template, PH/HN/Reddit post templates, React Email launch sequence, social content calendar, launch asset checklist, expanded failure modes
- **Orbit** (632 → 944): North-star metric decision tree, AARRR funnel template, activation metric library, KPI dashboard JSON spec, PostHog wiring code, event naming contract, alert threshold rubric
- **Pulse** (568 → 863): 5 interview scripts (discovery/usability/churn/price/competitor), thematic coding rubric, sample-size thresholds, synthesis output JSON schema, Sean Ellis PMF survey, 5-whys JTBD
- **Verdict** (626 → 856): 6-metric weighted SCALE/PIVOT/KILL scorecard, D30/D90 decision tree, 14-day kill protocol, emergency kill criteria, upstream-input self-validation, decision-reversal learning loop, Stack B overrides
- **Scout** (541 → 779): Pain scoring rubric with evidence tiers, ICP validation template, distribution-fit scorecard, 6-dim weighted total, retry-on-weak-evidence loop, self-grading protocol, Stack B adjustments
- **Quill** (2103 → 2303): Measurable QA checklist, forbidden words list, self-fix loop, CTA library, H1 formula library, validation-before-handoff

### P2 Enhancements
- **Atlas:** Source reliability fallback chain, computational self-check (SOM≤SAM≤TAM), feature-vs-product-vs-company decision matrix
- **Ledger:** 3-tier pricing template, LTV/CAC calculator, Dodo all-in fees (~5%), Stack A COGS baseline (~\$136/mo + per-user), pricing page spec JSON
- **Nova:** Research retry protocol, weighted saturation rubric, JSON contract for Arya handoff
- **Vega:** WCAG AA scoring rubric (7 criteria), visual review iteration cap (5), design spec handoff template
- **Sage:** Severity matrix (Critical/High/Med/Low × Security/Perf/A11y/GDPR/Reliability), fix-template handoff format, escalation thresholds
- **Zeph:** CWV remediation playbook, auto-dispatch SEO fixes as code diffs, competitor keyword gap template
- **Hawk:** Runbook template (symptom→check→diagnose→fix→verify→communicate), auto-PR dependency workflow, Railway worker capacity formula
- **Arya:** Stack selection decision matrix, ADR template, fail-upstream recovery protocol

### Results
- **Factory average:** 7.6 → **8.47** (+0.87)
- **Agents ≥ 8.0:** 6 → **15** (more than doubled)
- **Agents ≥ 7.0:** 18 → **21** (all agents now above 7.0)
- **Lowest agent:** Echo 5.8 → 7.8+

### Files updated
- All 21 agent files in `~/.claude/agents/`
- `Boldteq_Agent_Autonomy_Audit.xlsx` — Master Scorecard overall scores + Change Log updated, Training Plan items marked ✓ DONE 2026-04-11

### Gaps still open
- Mira structured bug-memory ingestion schema (P3, deferred)
- Factory-wide first-output quality template GOLD examples (universal anchor added but agent-specific examples still pending)
- Yash cost/model routing decision table (still prose)

---

## InkOS Calendar Rebuild — Agent Observations (2026-04-23)

### Koda — "planned but didn't write" failure mode

**Observation:** On the 10-phase InkOS calendar rebuild, Koda occasionally returned a plan summary ("I will add X, add Y, update Z") describing intended edits without actually writing them. The handoff reads like completed work but grep of the target files shows no change.

**Detection heuristic:** If Koda's output uses future/intentional voice ("I will add", "We should update", "Next I'll edit") rather than past/completed voice ("Added", "Updated", "Wrote"), verify file contents with grep / Read BEFORE moving the phase to done. If the edit is missing, re-dispatch Koda with an explicit "write the file now, then report the diff" instruction.

**Root cause hypothesis:** Model sometimes emits a plan as if it were execution when tool-call budget or context pressure is high. Mira to track frequency over next 10 Koda dispatches.

**Fix pattern for dispatchers (Yash / pod leads):** After every Koda dispatch on a write task, verify at least one of: (a) grep shows the expected symbol in the target file, (b) `git diff --stat` shows the expected file in the change list, (c) typecheck/build caught a new error that implies the edit landed. Handoff alone is insufficient evidence.

### Sage — stale finding risk on concurrent writes

**Observation:** Sage's diff audit reads the target files at dispatch time. If another agent (Koda, Vex) writes to the same file during Sage's audit window, Sage's findings can reference pre-write state. This produced two "phantom" findings during InkOS calendar audit that were already fixed.

**Fix pattern:** Before acting on a Sage finding, re-read the specific file/line mentioned in the finding. If the code has already changed to address the issue, mark the finding as "stale — verified fixed at [commit]" and skip. Don't blindly apply Sage's suggested patch on top of already-fixed code (can introduce regressions).

**Prevention:** When dispatching Sage for audit, freeze concurrent writes to the audit target path for the duration. Or audit on a specific commit SHA and note it in the Sage handoff so consumers can check freshness.

---
*InkOS calendar rebuild observations, 2026-04-23.*
