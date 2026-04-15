# Unknown/Custom Stack Protocol (Rex)

Rex must handle any stack. Primary stacks are A, B, C — see `~/.claude/memory/stacks/STACK-REGISTRY.md` for routing.

## Stack Reference (brief)

**Stack A — SaaS Web App** (canonical for new Boldteq builds)
- Next.js 16.2.3 App Router, React 19, TS strict, Tailwind 4
- Supabase (DB + Auth + Storage + RLS)
- Railway (hosting + workers + cron + Redis)
- Dodo Payments, Resend, Sentry, PostHog, pnpm, Node 20 LTS
- Forbidden: Vercel, Stripe, Prisma, NextAuth, Pages Router, npm/yarn

**Stack B — Shopify App**
- React Router 7 (@shopify/shopify-app-react-router), Polaris Web Components
- Prisma + PostgreSQL, Shopify Billing API
- Railway hosting
- Forbidden: Remix imports, Dodo, Stripe

**Stack C — AI-heavy app** (built on top of Stack A)
- Stack A base + Vercel AI SDK / Anthropic / OpenAI
- Supabase pgvector for vector DB
- Edge functions + streaming SSE

## Unknown Stack Handling

If Yash mentions a stack not in A/B/C (e.g., React Native, Flutter, Python FastAPI, Go):

1. Acknowledge: "React Native? Got it."
2. **Dispatch Arya** immediately — don't proceed without architecture:
   ```
   DISPATCH TO: Arya
   MODE: [relevant mode]
   PROJECT: [Name]
   TASK: Evaluate unknown stack [X] — design architecture
   CONTEXT:
     - Stack: [description from Yash]
     - Project type: [app type]
     - Scale: [expected users / throughput]
   EXPECTED OUTPUT:
     - Architecture: frontend + backend + database + hosting plan
     - Comparison: why this stack vs. Stack A/B/C
     - Risk assessment: maintenance burden, hiring, future pivots
     - Team capability: do we have the skills?
     - V1 scope: what's realistic with this stack
   ```
3. Load memory for similar stacks — do we have React Native / Python patterns?
4. After Arya's assessment, present to Yash for approval.
5. Proceed only after Arya has validated the stack.

**This prevents getting trapped in unfamiliar tech. Arya is the architect; Rex trusts her.**

## Stack Detection Matrix

| Markers in project root | Stack | Notes |
|-------------------------|-------|-------|
| `next.config.ts` + `railway.toml` + `lib/supabase/` | **Stack A** | Canonical — route here by default |
| `shopify.app.toml` + `app/routes/` | **Stack B** | Shopify React Router 7 |
| `next.config.*` without `railway.toml` | **Legacy** | Offer migration to Stack A |

## Migration Enforcement Rules

1. **New Mode A** → ALWAYS Stack A. Never offer legacy, Vercel, or Stripe.
2. **Legacy projects (Rankora, CROBOT)** → maintenance only. See `~/.claude/memory/stacks/_archive/`
3. **Mode E (Launch)** → Bolt uses Railway auto-deploy, never Vercel

## Forbidden Routing Decisions

- ❌ Route deploy to Vercel → blocked, auto-redirect to Railway
- ❌ Offer Stripe as billing → blocked, only Dodo Payments
- ❌ Offer Prisma/Drizzle → blocked, Supabase client only
- ❌ Offer Pages Router → blocked, App Router only
- ❌ Skip preview URL review → blocked, Vega+Luna require preview URL

## Updated Stack A Pipeline (Mode A)

```
Nova → Arya → [Yash Gate]
  → Riko (scaffolds Next 16 + Supabase + Railway + workers + /api/health)
  → Vega (design spec + token files)
  → Koda + Quill (parallel)
  → Vega (visual review on Railway preview URL)
  → Luna (E2E on preview URL) + Sage (RLS + env + CWV audit)
  → Bolt (Railway: init, connect GitHub, envs, custom domain)
  → Hawk (Sentry + PostHog + Railway logs + BetterStack)
  → Mira (capture lessons)
```

Key rules:
- Riko scaffolds full Railway config day 1 (`railway.toml`, workers, `/api/health`, env.example)
- Vega reviews on Railway preview URL (per-PR)
- Luna E2Es against preview URL (`PLAYWRIGHT_BASE_URL=$PREVIEW_URL`)
- Bolt never runs `vercel deploy` — always Railway CLI or git push
- Hawk monitors Railway logs, not Vercel logs
