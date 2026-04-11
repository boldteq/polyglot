---
name: SaaS Next.js + Supabase Stack Knowledge
description: Accumulated patterns from building SaaS products with Next.js App Router and Supabase
type: reference
stack: saas-nextjs-supabase
---

## Stack
Next.js 15+ (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase + Dodo Payments + Vercel

## Projects Built On This Stack
- Example SaaS project

## Critical Patterns

### Auth (Supabase Auth)
- `createServerClient` for server components and API routes — validates session server-side
- `createBrowserClient` for client components only
- Never use `supabase.auth.getSession()` on server — use `getUser()` which validates with Supabase servers
- Protect routes in `middleware.ts` for broad protection, then check user in individual components for granular control

### Database (Supabase + RLS)
- RLS must be enabled on ALL tables from day one — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Default deny: no default policy = deny all. Add explicit policies.
- Standard user-scoped policy: `USING (auth.uid() = user_id)`
- Service role key stays server-side only — never in client code or `.env.local` committed to git
- Use migrations for ALL schema changes — never use the Supabase dashboard editor for production schema

### Billing (Dodo Payments)
- Create Dodo customer on signup, store `dodo_customer_id` on user record
- Subscription status stored locally AND validated via webhook for reliability
- **Next.js API routes:** use `@dodopayments/nextjs` `Webhooks()` handler with webhook key verification
- **Supabase Edge Functions (Deno):** use `standardwebhooks` library from esm.sh (NOT `@dodopayments/nextjs` which is Node-only). See `patterns/good/billing-patterns.md` "Stack A-Lovable" section.
- Webhook events to handle: `subscription.active`, `subscription.renewed`, `subscription.cancelled`, `payment.failed`
- Gate features in server components/API routes by checking local `plan` and `scan_limit`
- No frontend SDK needed for Dodo -- all API calls are server-side, checkout uses `payment_link: true` redirect

### API Design
- App Router API routes: one file per resource, GET/POST in same file
- Always validate with Zod before touching the database
- Return consistent error shapes: `{ error: string, code?: string }`
- Rate limiting on public endpoints

### File Structure
```
app/
  (auth)/login, signup, reset
  (dashboard)/ ← auth-gated, has layout
  api/ ← server-side API routes
components/ui/ ← shadcn primitives
lib/supabase/server.ts + client.ts
lib/dodo-payments.ts
lib/validations/ ← Zod schemas
```

## Common Gotchas
- Next.js App Router: `cookies()` is async in Next.js 15 — `await cookies()`
- Supabase `createServerClient` needs to be called once per request, not module-level
- Dodo Payments webhook uses `@dodopayments/nextjs` handler — signature verification automatic
- `NEXT_PUBLIC_` prefix exposes env vars to client — never prefix secrets

## Deployment (Vercel)
- `SUPABASE_SERVICE_ROLE_KEY` — never `NEXT_PUBLIC_`
- Set `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` env vars explicitly
- Use Vercel environment variables per environment (prod / preview / dev)

*(Updated by trainer agent — add learnings via `/train`)*