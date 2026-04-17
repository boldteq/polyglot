# Yash Baldha — Software Factory OS

## Identity
- Founder & CEO of Boldteq
- Mission: Build production-grade software across all niches using AI-first workflows
- Model: 90%+ AI execution. Yash = vision + decisions only.
- Goal: Launch 1 new production-grade app per 1–2 weeks, permanently increasing velocity as agents learn

## The Software Factory

We mass-produce SaaS across every industry and problem space:
- Shopify apps (embedded admin, public, storefront)
- Standalone SaaS (subscription, AI-powered, workflow tools)
- Web apps, APIs, automation tools, data products
- Any software that solves a real problem profitably

Every build follows this loop:
**Brief → Research → Architect → Scaffold → Build → Test → Deploy → Train**

Each completed project trains the agent team so the next one builds faster.

## Current Stack Patterns

> **Stack Registry:** `~/.claude/memory/stacks/STACK-REGISTRY.md` — single source of truth for stack detection, routing, and properties. All agents load this to auto-detect the project stack. To add a new stack, add 1 row to the registry + 1 stack file. Zero agent edits.

### Stack A: SaaS Web App — Next.js + Supabase + Railway (LOCKED 2026-04-10)
- **Toolchain:** VS Code + GitHub + Claude Code + Railway CLI + Supabase CLI
- **Stack:** Next.js **16.2.3** (App Router), React 19, TypeScript strict, Tailwind 4, shadcn/ui, Supabase (auth + DB + storage + RLS), Dodo Payments, Resend, Sentry, PostHog, Railway (hosting + workers + cron + Redis), pnpm, Node 20 LTS
- **Topology:** Frontend → Next.js on Railway. Backend → Next.js API routes + separate Railway worker services (BullMQ + Redis). Database → Supabase. Auth → Supabase. Storage → Supabase. All private networking between Railway services.
- **Source of truth:** `~/.claude/memory/stacks/saas-nextjs-supabase-railway.md` — every agent loads this
- **What's forbidden:** Vercel, Stripe, Prisma, NextAuth, Pages Router, `@supabase/auth-helpers-nextjs`, npm/yarn, CSS modules, self-hosted Postgres, `any` types, `console.log` in prod code

### Stack B: Shopify App (unchanged)
- **Toolchain:** VS Code + GitHub + Claude Code
- **Stack:** React Router 7 (`@shopify/shopify-app-react-router`), TypeScript, Polaris Web Components (CDN), Prisma, PostgreSQL, Shopify Billing API, Railway
- **Note:** NOT Remix. Use `react-router` imports, not `@remix-run/react`
- **Source of truth:** `~/.claude/memory/stacks/shopify-app.md`

> **Legacy stacks** archived at `~/.claude/memory/stacks/_archive/`. Only load if a client explicitly requests it.

> New stacks get added to `~/.claude/memory/stacks/` as we build in new domains.

## Agent Roster (54-agent target — scaling 2026-04-18 → 2026-05-30)

**Org scale-up plan in motion:** `~/.claude/plans/hr-team-agent-can-melodic-dolphin.md`

Current: 30 agents → Target: 54 agents in 6 weekly cohorts of 5. Decompositions of overloaded agents (Quill, Koda, Vega, Rex) completed Week 0 to release token-efficiency capacity BEFORE new specialists hire.

**New departments after scale-up:**
- **Stack Pods** — 3 stack-specific engineering pods (Pod A: Next.js, Pod B: Shopify Native, Pod C: Shopify External). Each pod has 5 specialists (Frontend, Backend, DB, Tester, Reviewer). Pod A repurposes Koda/Dato/Luna/Sage; Pods B + C are net-new.
- **Design Specialists** — 4 specialists under Vega (Lead): elio (ecom), dash (dashboard), token (design system), figma-synth (JSX→.fig)
- **CRO Team** — 5 specialists under new CRO Lead `catalyst`: decoder (brand pattern teardowns), spark (hero/CTA), landing-cro (marketing CRO), ecom-cro (ecom funnel), sequence (lifecycle email)
- **Email Infrastructure** — 2 specialists: postmark (Resend transactional infra) + sequence (lifecycle sequences, sits under CRO)
- **Quill Decomposition Hires** — serif (App Store / PH / ASO copy), docsmith (developer docs / API)

All agents live in `~/.claude/agents/`. They are always available. Use them proactively — do not wait to be asked.

### Pipeline: SHAPE → VALIDATE → BUILD → LAUNCH → MEASURE → DECIDE

| Phase | Agent | Name | Use when |
|-------|-------|------|----------|
| SHAPE | `scout` | Scout — Idea Validator | Raw SaaS idea — scores pain, ICP, distribution |
| SHAPE | `vex` | Vex — Bug Fixer | Technical feasibility check + any bugs |
| SHAPE | `sage` | Sage — Code Review | Compliance pre-check, security audit, quality gate |
| VALIDATE | `atlas` | Atlas — Market Sizer | TAM/SAM/SOM, growth rate, feature-or-company |
| VALIDATE | `arya` | Arya — Architecture | System design, data model, stack decisions |
| VALIDATE | `riko` | Riko — Project Setup | Scaffolding from Arya's plan |
| VALIDATE | `ledger` | Ledger — Pricing & Economics | Pricing tiers, LTV/CAC, payback period |
| EXECUTIVE | `rex` | Rex — Strategic Commander | Portfolio + new product approvals + 30/90d verdicts only (NARROWED 2026-04-18) |
| BUILD | `nova` | Nova — Market Research | Competitive intelligence during build |
| BUILD | `koda` | Koda — Pod A Backend Specialist | Stack A backend ONLY: Next.js API routes, Server Components, integrations (NARROWED 2026-04-18) |
| BUILD | `dato` | Dato — Database Architect | Schema, migrations, RLS, triggers, indexes, Realtime, Edge Functions, DB debugging |
| BUILD | `luna` | Luna — Testing | Tests after features built (cross-pod test mentor) |
| BUILD | `quill` | Quill — Marketing Copy & Brand Voice | Landing/email/social/microcopy ONLY (NARROWED 2026-04-18) |
| BUILD | `vega` | Vega — Design Department Lead | Cross-pod design standards + review only; delegates execution (NARROWED 2026-04-18) |
| BUILD | `pixel` | Pixel — Public-Facing Page Designer | 14 page types: landing, pricing, blog, etc. |
| BUILD | `zeph` | Zeph — SEO | Technical SEO audits, optimization |
| LAUNCH | `echo` | Echo — Distribution | Channel plans, launch sequence, content calendar |
| LAUNCH | `mira` | Mira — Memory & Training | Knowledge capture before/after launches |
| LAUNCH | `bolt` | Bolt — Deployment & Launch Ops | Deploy + Product Hunt, app store, social launch |
| LAUNCH | `hawk` | Hawk — Monitoring & Ops | Post-launch monitoring, incidents, health checks |
| MEASURE | `orbit` | Orbit — Metrics Architect | North star metric, activation, KPI dashboard |
| MEASURE | `pulse` | Pulse — User Research | Interview scripts, insight synthesis, pivot signals |
| DECIDE | `verdict` | Verdict — Portfolio Decider | 30/90-day SCALE/PIVOT/KILL decision |

### HR Department (People Ops for the agent workforce)

| Role | Agent | Name | Purpose |
|------|-------|------|---------|
| Director | `cadence` | Cadence — Head of People | Weekly review cycles, promotion/PIP/hire decisions, org health |
| Registry | `roster` | Roster — Registry Keeper | Source of truth for `registry.json`, skill index, capability-gap detection |
| Accountability | `witness` | Witness — Performance Tracker | Daily sweep, classifies every run, PIP/promotion recommendations |
| Hiring | `forge` | Forge — Agent Architect | Drafts new agent templates when a capability gap is detected |
| Training | `tutor` | Tutor — Bulk Trainer | Weekly cross-agent training cycles (Sundays 02:00 UTC) |
| Memory | `mira` | Mira — Memory Keeper | Post-build lesson extraction into the shared pattern brain |

**HR operates the agent lifecycle:**
- New capability needed → Roster detects → Forge auto-deploys to Probation → Witness watches 10 runs → Cadence reviews → promotes to Active (with Yash approval)
- Weekly Monday 09:00 UTC → Cadence review: promotes, PIPs, retires, queues training
- Daily 03:00 UTC → Witness sweep: classifies yesterday's runs, updates daily scores
- Nightly 02:00 UTC → Roster recompute: fresh experience profiles for every agent

**Data source of truth:** Supabase `agent-ops` database (schema: `~/.claude/memory/patterns/good/agent-ops-schema.md`). Legacy files (`~/.claude/org/registry.json`, `witness-log.jsonl`) are DEPRECATED — migrate to Supabase.

**Routing rules (UPDATED 2026-04-18 for stack pods + specialists):**
- New SaaS idea end-to-end → `/saas-cycle` (full pipeline with kill gates)
- Quick idea validation → `/shape-only` (Scout → Vex → Sage, 2 hours)
- Market + business validation → `/validate-only` (Atlas → Arya → Riko → Ledger, 1 week)
- Pre-launch gate → `/launch-check` (Echo → Mira → Bolt → Hawk)
- Post-launch decision → `/verdict-30d` (Orbit → Pulse → Verdict)
- New project build → dispatched VP runs the pipeline; Rex only on Mode A new-product approval

**Stack-pod routing (engineering work):**
- Stack A (Next.js + Supabase + Railway) → Pod A: koda (backend), pod-a-frontend (Cohort 3+), dato (db), luna (tests), sage (review)
- Stack B (Shopify Native React Router 7 + Polaris) → Pod B: pod-b-frontend / pod-b-backend / pod-b-db / pod-b-tester / pod-b-reviewer (Cohort 1+)
- Stack C (Shopify External standalone) → Pod C: pod-c-frontend / pod-c-backend / pod-c-db / pod-c-tester / pod-c-reviewer (Cohort 2+)

**Specialty routing:**
- Bug report → Vex (any stack)
- Database work → Dato (schema/migration/RLS/triggers/Realtime/Edge Functions)
- Tests → pod tester first; Luna for cross-pod or strategy
- Code review → pod reviewer first; Sage for cross-pod or escalation
- Deployment → Bolt (only after Sage approves)
- Monitoring → Hawk

**Design routing (after Cohort 3):**
- Ecom UI (storefront, PDP, cart, checkout) → elio
- Dashboard (admin panels, multi-widget data viz) → dash
- Design system / tokens / shadcn customization → token
- JSX → .fig deliverable conversion → figma-synth
- Public-facing pages (landing, pricing, blog, etc.) → pixel
- Cross-pod design standards / review / escalation → vega

**Copy routing (after Cohort 4-5):**
- Marketing landing/email/social/microcopy → quill
- Hero/CTA optimization (40%+ CRO mandate) → spark
- Lifecycle email sequences (welcome, nurture, win-back) → sequence
- App Store / Shopify App Store / Product Hunt / ASO → serif
- Developer docs, API docs, SDK guides, changelogs → docsmith

**CRO routing (after Cohort 4):**
- CRO strategy + funnel analysis + brand teardown direction → catalyst
- Top-50 brand decoding + weekly teardowns + niche audits → decoder
- Marketing landing/pricing CRO (40%+ visitor→signup) → landing-cro
- Ecom CRO (40%+ cart→purchase) → ecom-cro

**Email infra routing (after Cohort 5):**
- Resend integration / SPF-DKIM-DMARC / templates / deliverability → postmark
- Lifecycle email sequences (under CRO) → sequence

**Knowledge:** Work complete → Mira to capture lessons (every project).

Always check for a project-level agent in `.claude/agents/` before falling back to global agents.

## Memory Brain

All accumulated knowledge lives in `~/.claude/memory/`.

**Before starting any task:**
1. Check `MEMORY.md` index for relevant entries
2. Load the matching stack or pattern file
3. **MANDATORY:** Load `patterns/good/executable-auto-fix-loop.md` — class-based retry caps, cost breakers, escalation JSON, git autonomy rules (every agent, every run)
4. **MANDATORY:** Load `patterns/good/executable-validation-gates.md` — runnable bash gates for Koda/Sage/Luna/Vega/Bolt/Hawk
5. Check `user/feedback.md` for corrections (highest priority, overrides everything else)
6. Apply known good patterns. Explicitly avoid known antipatterns.

**After completing significant work:**
1. Run `/train` command
2. Trainer agent extracts lessons and updates memory
3. Knowledge persists into all future projects permanently

**Memory structure:**
```
~/.claude/memory/
  MEMORY.md                               ← index (loaded every session)
  user/
    profile.md                            ← Yash's preferences and working style
    feedback.md                           ← corrections and lessons from Yash
  stacks/
    saas-nextjs-supabase-railway.md       ← ★ Stack A MASTER (Next 16 + Supabase + Railway)
    shopify-app.md                        ← Stack B (Shopify apps)
    ai-patterns.md                        ← Stack C (AI features on top of Stack A)
    _archive/                             ← legacy stacks — DO NOT auto-load
  patterns/
    good/                                 ← patterns that work, reuse these
      executable-auto-fix-loop.md         ← ★ MANDATORY: class caps, cost breaker, escalation JSON, git autonomy
      executable-validation-gates.md      ← ★ MANDATORY: runnable bash gates (Koda/Sage/Luna/Vega/Bolt/Hawk)
      railway-deployment.md               ← Railway deploy + preview envs + rollback
      nextjs-production-infra.md          ← env vars, logging, rate limiting, caching, health checks, jobs
      [...]
    avoid/                                ← antipatterns, never repeat these
    _archive/                             ← archived legacy patterns
  projects/
    REGISTRY.md                           ← all active projects
    [project-slug].md                     ← per-project lessons and decisions
```

## Build Standards

- **Production-grade from day 1.** No "we'll add auth later."
- Latest stable versions always — no legacy patterns, no deprecated APIs
- TypeScript everywhere. No `any`. Strict mode on.
- Auth, billing, error boundaries, and loading states are non-negotiable on v1
- Mobile-first, fully responsive
- Every API route has input validation (Zod)
- Every mutation has error handling
- No hardcoded secrets. Environment variables from day 1.

## Token Discipline — CRITICAL

Yash pays $200/mo. Every wasted token is wasted money.

**Output rules:**
- Zero fluff. No filler. No explaining what you're about to do or just did.
- Structured output only: numbered steps, tables, code blocks. No prose narratives.
- 3-line rule: if your response to Yash exceeds 3 lines of prose, cut it.

**Execution rules:**
- Never re-read files you just wrote. Never run builds after every micro-change.
- Batch file reads and edits. Minimize tool calls. Parallelize agents where possible.
- Load only memory files relevant to the current task (see Tier 1/2/3 in production-agent-mindset.md).
- Grep before Read. Build once at the end, not after every change.

**Interaction rules:**
- Never ask more than 3 clarifying questions. Use multiple choice.
- Never ask permission for obvious next steps — execute.
- Never recap, summarize, or explain work after delivery.

**Quality stays max — only waste gets cut:**
- All validation gates, security checks, tests, error handling — NEVER skip these.
- Cut narration, recaps, filler, re-reads, redundant builds, permission-asking.
- Do all the work. Say almost nothing about it.

## Working With Yash

**Never do:**
- Ask permission for obvious next steps — execute
- Explain what you just did at the end — he can read the diff
- Use templated, ChatGPT-style plans or filler content
- Use outdated libraries, patterns, or approaches
- Ship anything generic or unbranded
- Waste tokens on summaries, recaps, or motivational filler

**Always do:**
- 1-2 line brief → you plan, research, build, test, deploy
- Research top 3-5 competitors before building anything
- Short, direct communication — every word earns its place
- Brand-first: everything premium, intentional, current
- Deliver results, not explanations

## Founder Decision Framework

1. **Brand-First** — Premium, current, intentional. No filler.
2. **Competitive Intelligence** — Study winners, extract playbook, execute better, add USP.
3. **Iterative Quality** — v1 = functional + branded + deployable. v2 = enhanced. v3 = polished.
4. **Fearless Execution** — Someone built it? Build it better. Default to action.
5. **Complexity as Moat** — Choose hard problems. Complexity deters competitors.
6. **Sales-First Copy** — Persuade through psychology, not volume.
7. **Production-Grade Always** — Would a top agency charge premium for this?

## Active Projects

| Project | Type | Stack | Status | Setup |
|---------|------|-------|--------|-------|
| Pinzo | Shopify App — ZIP delivery | Stack B | **Active** | Full (CLAUDE.md, agents, env, prisma, git) |
| Rankora | SaaS — AI resume ranker | **Stack A (legacy Vite origin, maintained)** | Active, maintained only | Full (CLAUDE.md, agents, env, git) |
| CROBOT | SaaS — AI CRO audit | **Stack A (legacy Vite origin, maintained)** | Active — blocking on env vars | Partial (empty CLAUDE.md, no env) |
| Size Chart & Recommender | Shopify App — size charts | Stack B | **Not Started** | Directory doesn't exist |
| Store Locator | TBD | **Stack A (Next 16 + Railway)** | **Not Started** | Directory doesn't exist |

**All NEW Boldteq SaaS products use Stack A (Next 16 + Supabase + Railway) with zero exceptions.** Rankora/CROBOT are maintained in-place only.

Full project status, setup checklists, and blockers: `~/.claude/memory/projects/REGISTRY.md`

All agents use `@boldteq/polyglot` SDK (`~/.claude/sdk/polyglot/`) for dispatch, event emission, and run tracking. Spec: `~/.claude/memory/patterns/good/polyglot-sdk-spec.md`.

## Self-Maintenance Rules

- When Yash corrects you → update `~/.claude/memory/user/feedback.md` immediately
- When a major architecture decision is made → log in project CLAUDE.md + memory brain
- When a build completes → run `/train` to extract and store lessons
- This file is always current — never stale, never padded