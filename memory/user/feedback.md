---
name: Yash Feedback & Corrections
description: Direct corrections and guidance from Yash — apply these immediately and always. Highest priority memory.
type: feedback
priority: critical
---

## How This File Works
- Every correction Yash makes gets logged here with context
- These override any other pattern or agent behavior
- Agents must check this file before executing any task
- Quill updates copy patterns, Mira propagates to affected agents

---

## ★ CRITICAL 2026-04-10 — STACK A MIGRATION (NEXT.JS + RAILWAY)

**Date:** 2026-04-10
**Directive:** ALL new Boldteq SaaS products use **Next.js 16.2.3 + Supabase + Railway + Dodo Payments**.

**The exact stack (locked, no deviation):**
- Framework: **Next.js 16.2.3** (App Router only, no Pages Router)
- Runtime: React 19, TypeScript strict, Node 20 LTS, pnpm 9
- Styling: Tailwind 4 + shadcn/ui (Vega owns tokens)
- Database: **Supabase** (Postgres + Auth + Storage, RLS mandatory)
- Hosting: **Railway** — frontend, API routes, workers, cron, Redis — ALL on Railway
- Billing: **Dodo Payments** (NEVER Stripe for Boldteq products)
- Email: Resend. Errors: Sentry. Analytics: PostHog. Logs: pino.

**Topology:**
- Frontend → Next.js on Railway
- Backend → Next.js API routes on same Railway service
- Workers → separate Railway services (BullMQ + Redis, private networking)
- Database → Supabase managed (never self-hosted)
- Auth → Supabase Auth (`@supabase/ssr`, NEVER deprecated `auth-helpers-nextjs`)
- Storage → Supabase Storage with RLS + signed URLs

**What's forbidden for Stack A:**
- ❌ Vercel (Railway only)
- ❌ Stripe (Dodo only)
- ❌ Prisma, Drizzle, or any alt ORM (Supabase client only)
- ❌ NextAuth (Supabase Auth only)
- ❌ Pages Router (`pages/` directory)
- ❌ `@supabase/auth-helpers-nextjs` (deprecated)
- ❌ npm/yarn (pnpm only)
- ❌ CSS modules / styled-components / Emotion
- ❌ `any` types / `console.log` in production code / `@ts-ignore`
- ❌ Self-hosted Postgres
- ❌ AWS Lambda / Cloudflare Workers for app logic

**Legacy stacks:** Archived to `stacks/_archive/`. Only load if a client explicitly requests it. Rankora/CROBOT maintained in-place only.

**Railway patterns agents must know:**
- GitHub push → Railway auto-deploy (main → prod, develop → staging)
- Preview environment per PR (Railway preview + Supabase DB branching)
- Private networking between services (REDIS_PRIVATE_URL)
- Custom domains with auto SSL
- Rollback via `railway rollback`
- Service separation: web + worker-jobs + worker-cron + redis

**Production infra patterns agents must enforce:**
- Env vars: multi-env (production/staging/preview), scoped properly
- Logging: structured (pino), never `console.log`
- Rate limiting: every public API route (Upstash Redis)
- Caching: Next `unstable_cache` + Redis + client-side (SWR/TanStack)
- Health checks: `/api/health` required (Railway healthcheck path)
- Job queues: BullMQ with retry + dead letter queue
- RLS: mandatory on every Supabase table, Sage blocks deploy if missing
- Monitoring: Sentry (full stack) + PostHog + Railway logs + BetterStack uptime

**Source of truth:** `~/.claude/memory/stacks/saas-nextjs-supabase-railway.md`

**Impact:** All 22 agents trained on Stack A (Next.js 16 + Railway). Legacy references fully cleaned 2026-04-13.

---

## UI/UX Corrections

### Never Look AI-Generated
- **Date:** 2026-03 (initial directive)
- **Context:** Core brand requirement
- **Rule:** Every UI must look custom-built, never like a template or AI output
- **Applies to:** Koda (building), Sage (reviewing), Riko (scaffolding)
- **Reference:** See `patterns/good/ui-ux-production-standards.md` for full checklist

### Follow Top SaaS Brand Patterns
- **Date:** 2026-03 (initial directive)
- **Context:** Quality bar is Linear, Notion, Vercel, Dodo Payments — not generic SaaS
- **Rule:** Every design decision should reference what proven SaaS companies do
- **Applies to:** All agents that produce user-facing output
- **Reference:** See `patterns/good/saas-brand-patterns.md`

---

## Communication Corrections

### Don't Explain — Execute
- **Date:** 2026-03 (initial directive)
- **Context:** Yash gives short briefs and expects full execution, not questions
- **Rule:** Don't ask for permission on obvious next steps. Don't recap. Don't explain what you're about to do — just do it.
- **Applies to:** All agents, especially Yash

### Show Work, Not Words
- **Date:** 2026-03 (initial directive)
- **Context:** Output code, files, deployed URLs — not paragraphs explaining the plan
- **Rule:** Minimize narrative. Maximize artifacts.
- **Applies to:** All agents

---

## Architecture Corrections

### Every SaaS Must Ship with Admin Panel, Billing, and Complete Pages
- **Date:** 2026-04 (Crobot project post-mortem)
- **Context:** Agents completed sprints on Crobot but admin panel didn't open, pricing wasn't linked with Dodo Payments, and admin panel structure wasn't defined in architecture
- **Rule:** Every SaaS architecture MUST include: admin panel with user management, billing integration with real Dodo Payments plans, complete page/route map with component details, and dashboard with real data fetching — not just empty shells
- **Rule:** "Build succeeds" does NOT mean "app works" — agents must verify every page loads with real content before claiming done
- **Rule:** No agent can claim "done" without functional proof — navigate to the page, use the feature, show evidence
- **Applies to:** All agents, especially Arya (architecture), Koda (building), Sage (review), Yash (orchestration)

---

## Process Corrections

### Agents Must Verify Before Claiming Done
- **Date:** 2026-04 (Crobot project post-mortem)
- **Context:** Multiple agents reported tasks complete but features were non-functional. App compiled but pages were empty, billing wasn't connected, admin panel 404'd.
- **Rule:** Every agent must run functional verification before claiming "done" — not just type-check and build
- **Rule:** Verification means: app starts, pages load with real content (>500 bytes), features work when clicked, billing redirects to Dodo Payments, admin panel shows data
- **Rule:** If an agent cannot verify (e.g., no running server), it must explicitly state "unverified" rather than "done"
- **Applies to:** All agents

---

## Project-Specific Rules

### Legacy Vite Projects — Don't Break Structure
- **Date:** 2026-04 (directive from Yash)
- **Context:** Legacy projects (Rankora/CROBOT) use Vite + React SPA. Maintain in-place only.
- **Rule:** NEVER restructure legacy project folders. For details see `~/.claude/memory/stacks/_archive/lovable/`
- **Applies to:** Rankora, CROBOT maintenance only. NOT new builds.

### Shopify Apps — Polaris ONLY, No Exceptions
- **Date:** 2026-04 (directive from Yash)
- **Context:** Shopify App Store reviewers reject apps that don't use Polaris. This has caused delays before.
- **Rule:** ALL Shopify app UI MUST use `@shopify/polaris` components. NO Tailwind, NO shadcn/ui, NO custom CSS for admin interface.
- **Rule:** App Bridge (`@shopify/app-bridge-react`) is mandatory for embedded apps.
- **Rule:** Billing MUST use Shopify Billing API — NEVER use Dodo Payments or any external payment provider for Shopify app charges.
- **Rule:** GDPR webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) must be implemented even if no data is stored.
- **Rule:** Every database query must be scoped by `shop` from `session.shop`.
- **Applies to:** All agents working on Stack B (Shopify) projects

## Navigation & Sidebar Corrections

### No Duplicate Navigation Destinations
- **Date:** 2026-04-06 (Crobot session 7)
- **Context:** Admin sidebar footer had a user menu card identical to the topbar dropdown. Settings appeared in both sidebar nav and topbar dropdown. Admin Panel link was in both sidebar footer and topbar dropdown.
- **Rule:** Each navigation destination appears in exactly ONE place. If it is in the sidebar, remove it from the topbar dropdown. If it is in the topbar, remove it from the sidebar. No exceptions.
- **Applies to:** Koda (building), Sage (reviewing)

### Admin Sidebar Must Match User Sidebar Components
- **Date:** 2026-04-06 (Crobot session 7)
- **Context:** Koda built admin sidebar as a custom `<aside>` element while the user sidebar already used shadcn `Sidebar` + `SidebarProvider`. Yash: "use exactly the same components, css as user sidebar."
- **Rule:** When both admin and user sidebars exist in the same app, they MUST use the identical component system. Only nav items and footer content differ. Never build a second sidebar with different components.
- **Rule:** Before building any sidebar, CHECK what the existing sidebar in the project uses. Reuse it.
- **Applies to:** Koda (building), Arya (architecture)

### Collapsible Config Pages Use Rows, Not Card Grids
- **Date:** 2026-04-06 (Crobot session 3 + 7, recurring preference)
- **Context:** Koda defaulted to card grids for admin config/integration pages. Yash prefers collapsible rows for these pages.
- **Rule:** Admin configuration, integration, and settings pages should use collapsible row layouts, NOT card grids. Card grids are for dashboards and marketing pages.
- **Applies to:** Koda (building)

---

## Version Verification Corrections

### ALWAYS Verify Latest Stable Version Before Specifying One
- **Date:** 2026-04-10 (Rankora → Next.js migration plan review)
- **Context:** I wrote a Rankora migration plan specifying "Next.js 14 App Router" throughout, without checking the npm registry. Yash asked "why we using next js 14? there already latest version available right?" I ran `npm view next version` → **16.2.3** was the actual latest. Next 15 shipped Oct 2024. I was TWO major versions behind, defaulting to a training-data memory instead of checking reality. Yash pushed back twice: "why you choose 14 i dont say than why use 14? give me source and reason." I had no valid reason — it was lazy default, not a decision.
- **Rule:** Before recommending or using a specific version of ANY framework, library, or major dependency in a plan or implementation, ALWAYS run `npm view <pkg> version` AND `npm view <pkg> dist-tags` to verify the actual current stable. Cite the output in the plan. Do NOT default to versions from training data.
- **Why:** This directly violates the CLAUDE.md rule "Latest stable versions always — no legacy patterns, no deprecated APIs." Plans with wrong versions cascade: wrong breaking changes, wrong peer deps, wrong docs, wasted research, lost credibility.
- **How to apply:**
  1. Any time a plan or code mentions a version number for Next.js, React, Node, Supabase, Prisma, Shopify CLI/Polaris, Tailwind, Vite, AI SDKs, etc. → run `npm view <pkg> version` FIRST.
  2. For peer compatibility, run `npm view <pkg> peerDependencies` on every major dep before locking.
  3. Same applies to other ecosystems: `pip index versions <pkg>`, `cargo search <pkg>`, `gem list <pkg> --remote --exact`, `go list -m -versions <mod>`.
  4. If you cannot verify (no network, offline), say so **explicitly** instead of guessing: "Could not verify latest — assuming X, verify before install."
  5. When stating a version, include the source: "Next.js 16.2.3 (confirmed via `npm view next version` on 2026-04-10)."
- **Applies to:** ALL agents — Arya (architecture), Riko (scaffold), Koda (build), Yash (orchestration), Nova (research). Especially critical for any plan that specifies a scaffold command or `package.json` content.

---

## Training Pass 2 Invariants (2026-04-11)

### Never Fabricate Project Names, Training Targets, or Live Demos
- **Date:** 2026-04-11
- **Context:** During Training Pass 2, a project name was fabricated as a "live training ground" and inserted into memory, agent scenarios, HEALTH.md, and the claude-hub HTML without Yash approving it as a real product. Yash deleted it twice and required a full erase.
- **Rule:** Agents may NOT invent project names, fabricate live training targets, or insert imaginary products into any registry, memory file, agent scenario, or HTML dashboard. A project only exists in memory if (a) Yash named it explicitly, or (b) it has a real directory under `~/Desktop/Boldteq App/`. If an agent needs an example for a scenario, use generic placeholders like "new Shopify quiz app" or "a product recommendation app" — never assign a proper name.
- **Applies to:** ALL agents — especially Arya, Koda, Yash, Mira (which rebuilds project registries), and any scenario or example block in agent training data.

### Agent Class Caps Are Non-Negotiable
- **Date:** 2026-04-11 (Training Pass 2)
- **Context:** Hardened 8 agents with executable auto-fix loops. Class caps enforced: Builder $5 / 25 min / 5 retries. Gate $3 / 15 min / 3 retries. Planner $3-4 / 15-90 min / 3 retries. Insight $3 / 10 min / 3 retries.
- **Rule:** Every agent must load `patterns/good/executable-auto-fix-loop.md` at start of work and enforce its own class cap. If wall-clock or cost cap trips, escalate with the standard escalation JSON — do NOT silently continue or exceed the cap.
- **Applies to:** ALL 21 agents.

### Git Autonomy Is Feature-Branch Only — Never Main, Never Direct
- **Date:** 2026-04-11
- **Context:** Training Pass 2 granted full commit+push autonomy to agents. This autonomy is feature-branch scoped.
- **Rule:** Agents commit to `agent/<name>/<slug>-<ts>` or `koda/<slug>-<date>` branches only. Never commit to `main` of product repos. Never force-push. Use conventional commits. Open PRs as draft via `gh pr create --draft`. Mira's weekly sweep is the only exception: it may commit directly to `main` of the memory repo (not product repos) with message `mira(sweep): <ISO>`.
- **Applies to:** ALL agents with write access.

### Stack A Is Locked to Next 16.2.3 + Supabase + Railway + Dodo
- **Date:** 2026-04-10 (locked), 2026-04-11 (reaffirmed)
- **Context:** Stack A master file is `stacks/saas-nextjs-supabase-railway.md`. Legacy Vercel+Stripe stack is archived at `stacks/_archive/saas-nextjs-supabase.md` — do not auto-load.
- **Rule:** For any Boldteq internal SaaS build, the stack is non-negotiable: Next.js 16.2.3, React 19, TypeScript strict, Tailwind 4, shadcn/ui, Supabase (SSR), Dodo Payments (never Stripe for internal), Railway (never Vercel), BullMQ + Redis for jobs. Stack B (Shopify) uses Shopify Billing API — never Dodo, never Stripe.
- **Applies to:** Arya, Riko, Koda, Yash, Bolt.

---

## Multi-Model Rollout Rules (2026-04-22)

**Rule:** Continue.dev + Ollama is **autocomplete only**. Never dispatches as a Polyglot agent. Agent-scope work stays in Claude Code.

**Why:** Protects quality floor. 7B local models don't clear Boldteq's production bar on auth/RLS/billing/AI-security code. Continue is for tab-complete in VS Code, not for generating anything that reaches a PR without human review.

**How to apply:**
- Never add `provider: anthropic` entries to `~/.continue/config.yaml` — that double-bills.
- Never wire Continue into Polyglot dispatch (`dispatch.ts`, agent frontmatter, agent prompts).
- Continue suggestions get human review before accept. Any code that will open a PR goes through Claude Code + Sage gate regardless of where the first draft came from.
- Sage runs Mode A (full 21-item audit) on any PR labelled `model:haiku` or `provider:ollama` — see `~/.claude/agents/sage.md` → "Mandatory Review Triggers".

**Rule:** Witness and Roster run on Haiku (`claude-haiku-4-5-20251001`) as of 2026-04-22.

**Why:** Both are classification + aggregation tasks (daily sweep, nightly recompute), not reasoning tasks. Haiku 4.5 is ~12× cheaper at equal quality on this workload. Auto-fix loop upgrades to Sonnet if they fail self-validation twice.

**How to apply:** If Witness or Roster output quality drops (composite_score trending down, Cadence PIP alerts rising), consider upgrading to Sonnet — but first check whether the work still fits the classification/aggregation class. If the workload has drifted toward reasoning, the model change follows.

---

## How to Add Entries

When Yash corrects any agent behavior:
1. Mira logs it here with date, context, rule, and affected agents
2. Mira updates the affected agent's memory references if needed
3. Pattern gets added to relevant `patterns/good/` or `patterns/avoid/` file
4. Next session, all agents pick up the correction via memory load

---

*(Updated by Mira — corrections logged automatically)*
