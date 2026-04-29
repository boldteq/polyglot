# Stack-Pod Routing Pattern

**Created:** 2026-04-18, v1.0.
**Plan:** `~/.claude/plans/hr-team-agent-can-melodic-dolphin.md`.
**Loaded by:** Yash, Arya, Forge (during cohort design), Roster (when assigning tasks).

---

## Why this exists

Pre-2026-04-18, one Koda owned all 3 stacks. Token cost: ~12-18K per task because Koda loaded ALL stack files. Decomposition split the work into 3 stack pods, each owning ONE stack with deeply specialized memory.

This file is the routing source-of-truth. Read it BEFORE dispatching any engineering task.

---

## The 3 stacks and their pods

### Web Platform Team — Next.js + Supabase + Railway
- **Stack file:** `~/.claude/memory/stacks/saas-nextjs-supabase-railway.md`
- **Used for:** All NEW Boldteq SaaS products (internal + agency)
- **Pod members (5):**
  - `web-platform-frontend` — React 19 + Tailwind 4 + shadcn (Cohort 3)
  - `koda` — Backend: API routes, Server Components, Server Actions, integrations (NARROWED)
  - `dato` — Database: Supabase Postgres, RLS, migrations, types
  - `luna` — Tests: Vitest + Playwright (also cross-pod mentor)
  - `sage` — Code review (also cross-pod mentor)
- **Memory each loads (besides their own .md):**
  - `~/.claude/memory/stacks/saas-nextjs-supabase-railway.md`
  - `~/.claude/memory/patterns/good/auth-patterns.md` (Supabase Auth)
  - `~/.claude/memory/patterns/good/billing-patterns.md` (Dodo Payments)
  - `~/.claude/memory/patterns/good/resend-patterns.md`

### Shopify App Team — Shopify Native (embedded admin app)
- **Stack file:** `~/.claude/memory/stacks/shopify-app.md`
- **Used for:** Shopify apps that embed in the merchant admin (React Router 7 + Polaris Web Components)
- **Pod members (5, all hired Cohort 1 / Week 1):**
  - `shopify-app-frontend` — React Router 7 + Polaris Web Components UI
  - `shopify-app-backend` — Shopify GraphQL Admin API, webhooks, Shopify Billing API
  - `shopify-app-db` — Prisma schema for multi-shop tenancy
  - `shopify-app-tester` — Vitest + Playwright for embedded apps + billing flows
  - `shopify-app-reviewer` — Code review specific to Shopify Native: Polaris compliance, GraphQL N+1, billing edge cases
- **Memory each loads (besides their own .md):**
  - `~/.claude/memory/stacks/shopify-app.md`
  - Polaris Web Components docs (loaded on demand when Polaris-specific question)

### Shopify Storefront Team — Shopify External (standalone Shopify-integrated app)
- **Stack file:** `~/.claude/memory/stacks/shopify-app.md` (core) + external-specific patterns
- **Used for:** Standalone Shopify apps that do NOT embed in merchant admin (customer-facing flows, OAuth, multi-tenant API)
- **Pod members (5, all hired Cohort 2 / Week 2):**
  - `shopify-storefront-frontend` — Standalone React UI (customer-facing flows)
  - `shopify-storefront-backend` — Shopify OAuth, public app webhooks, multi-tenant API design
  - `shopify-storefront-db` — Postgres schema for multi-tenant external apps, shop isolation
  - `shopify-storefront-tester` — E2E tests for OAuth flows, multi-shop scenarios
  - `shopify-storefront-reviewer` — Code review specific to External Shopify: tenant isolation, OAuth security
- **Memory each loads:**
  - `~/.claude/memory/stacks/shopify-app.md`
  - External-specific patterns (TBD — Cohort 2 onboarding will define)

---

## Stack detection (auto-routing)

Yash / Arya / Roster use this matrix to detect which pod owns a task:

| File markers in repo root | Pod | Routing target |
|---|---|---|
| `next.config.ts` + `railway.toml` + `lib/supabase/` | Web Platform Team | koda or web-platform-frontend (depending on task) |
| `shopify.app.toml` + `app/routes/` (React Router 7) + Polaris imports | Shopify App Team | shopify-app-frontend or shopify-app-backend |
| `shopify.app.toml` + standalone (no merchant admin embedding) | Shopify Storefront Team | shopify-storefront-frontend or shopify-storefront-backend |
| `next.config.*` WITHOUT `railway.toml` | Legacy Stack A (Vite-origin Rankora/CROBOT) | Maintenance only — koda |
| Unknown markers | Forge gap detection | Arya investigates → may propose new pod |

If a project mixes stacks (e.g., a Next.js admin + a Shopify Native embed), the orchestrator dispatches to BOTH pods in parallel. Pods do NOT cross-contaminate memory.

---

## Cross-pod isolation rules (HARD)

These are enforced by Forge in `hr-forge-spec-template-enforcement.md` validation:

1. **Web Platform Team agents NEVER load shopify-app.md.** Loading it pollutes their context with irrelevant patterns and re-introduces Koda-style bloat.
2. **Shopify App Team/C agents NEVER load saas-nextjs-supabase-railway.md.** Same reason.
3. **No agent loads multiple stack files.** Single-stack memory loading is the #1 token-efficiency mechanism.
4. **Pod-specific bugs route within the pod first.** Vex triages bugs cross-stack, but Shopify App Team bugs go to shopify-app-reviewer first; Web Platform Team bugs go to Sage first.
5. **Cross-pod knowledge transfer happens through Mira patterns, not direct memory loading.** If Shopify App Team discovers something useful for Web Platform Team, Mira extracts it into a stack-agnostic pattern in `~/.claude/memory/patterns/good/`. Then both pods can load THAT pattern without loading each other's stack files.

---

## Cross-pod mentors (existing seasoned agents support new pods)

To avoid losing institutional knowledge during the cohort hires:

| Cross-pod role | Existing agent | What they teach |
|---|---|---|
| Test mentor | Luna | Testing strategy, E2E patterns, billing flow tests across pods |
| Review mentor | Sage | Security review, GDPR compliance, API design review across pods |
| DB mentor | Dato | Schema patterns, RLS modeling, migration safety across pods |
| Architecture mentor | Arya | System design across pods, when in doubt about cross-pod boundaries |

Mentorship is async: pod-X-tester writes a test, asks Luna for review on a Boldteq-specific gotcha. Luna responds with the gotcha + the pattern that should be added to the test pattern library. Mira captures.

---

## Routing decision tree (for Yash / Arya)

```
Task arrives →
  Stack detection (file markers + project CLAUDE.md):
    → Stack A → Web Platform Team
    → Stack B → Shopify App Team
    → Stack C → Shopify Storefront Team
    → Unknown → Arya investigates
  ↓
  Within pod, dispatch by task type:
    → UI / page / component → pod-X-frontend
    → API / server-side / integration → pod-X-backend
    → Database / schema / RLS / migration → pod-X-db (or Dato for cross-pod patterns)
    → Tests → pod-X-tester
    → Review → pod-X-reviewer
  ↓
  After build:
    → Sage cross-pod review for security/compliance
    → Mira lesson extraction
```

---

## Anti-patterns (NEVER do these)

1. **Never assign a Stack A task to Shopify App Team/C.** Even if Shopify App Team/C are idle. Specialization > utilization.
2. **Never let one agent load 2+ stack files.** That's the Koda problem we just fixed.
3. **Never bypass pod review on the way to deploy.** Pod reviewer signs off first; Sage is the cross-pod gate, not the only gate.
4. **Never split a single feature across pods unless architecturally necessary.** Splitting causes coordination overhead. If a feature truly spans stacks (e.g., a Shopify app that calls a Stack A SaaS API), Arya owns the architecture; pods build their respective parts in parallel.
5. **Never delete a pod agent without Forge's archive protocol.** Even if "underused," pods provide stack-isolation. Removing one re-introduces overload.
