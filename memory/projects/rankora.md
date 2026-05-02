---
name: Rankora — AI Resume Ranker
description: Stack A SaaS for AI-powered resume screening. Migrated from Vite/Lovable to Next.js 16 App Router on 2026-04-10. Deploys to Railway.
type: project
status: active
last_updated: 2026-04-10
---

# Rankora

AI-powered resume screening SaaS. Users paste a JD, upload resumes, GPT-4o scores and ranks candidates.

## Current Stack (as of 2026-04-10, post-migration)

- **Framework:** **Next.js 16.2.3 App Router** + React 19 + strict TypeScript
- **Auth:** `@supabase/ssr` with cookie sessions, `proxy.ts` middleware gates routes
- **UI:** Tailwind 3.4 + shadcn/ui + Lucide + Sonner + Recharts 3 (lazy-loaded)
- **Backend:** Supabase (Postgres + Auth + Edge Functions + Storage + pgvector HNSW)
- **AI:** OpenAI GPT-4o for scoring, JD parsing, skill matching
- **Payments:** Dodo Payments (hosted checkout for both credit packs and subscriptions)
- **Email:** Resend (outbound) + inbound webhook (email-ingest edge fn)
- **Error tracking:** `@sentry/nextjs@10` (instrumentation.ts + instrumentation-client.ts)
- **Deployment:** **Railway** via multi-stage Dockerfile with Next.js standalone output (~150MB image). NOT Vercel. Health check at `/api/health`. See `Dockerfile` + `railway.json` in repo root.

## Codebase Shape

- 25 pages, 163 components, 29 hooks, 54 shadcn/ui primitives
- 5 `VITE_*` env vars
- `react-router-dom` usage spread across ~20 files
- `SeoHead.tsx` = **185 lines** of direct `document.head` manipulation — this is the biggest migration blocker
- Single Supabase client at `src/integrations/supabase/client.ts` using localStorage session persistence
- Full project CLAUDE.md in repo with folder structure, data flows, safety rules

## Planned: Migration to Next.js 16 App Router

**Status as of 2026-04-10:** Plan approved, **execution NOT started**.

**Plan file:** `~/.claude/plans/abstract-brewing-toast.md`

**Target stack:** Next.js **16.2.3** (confirmed via `npm view next version` 2026-04-10), React 19, `@supabase/ssr`, Tailwind (keeping v3 initially, v4 in a later phase).

### Locked decisions
1. **In-place rewrite** preserving git history — scaffold Next alongside Vite, keep both booting through every phase, delete Vite last. Enables route-by-route rollback.
2. **`@supabase/ssr` with middleware** for auth — split into `browser.ts` / `server.ts` / `middleware.ts`. Keep thin shim at old path to avoid touching 100+ import sites.
3. **Full `SeoHead.tsx` → `generateMetadata()` refactor** — `unstable_cache` with `['seo']` tag + `revalidateTag('seo')` in admin save handlers to keep dynamic admin-editable SEO working server-side.

### 10-phase plan summary
Scaffold → Supabase SSR → auth middleware → route migration → nav codemod → SEO refactor → client boundary hardening → cleanup → deploy.

### Estimated effort
**70–95 hours total.** Biggest chunks:
- SeoHead refactor alone: ~1 full week
- Route migration (25 pages): ~2 weeks
- Client boundary hardening (recharts etc. need `dynamic({ ssr: false })`): ~1 week

### Peer dep verification (run 2026-04-10, all clear for Next 16 + React 19)
- `@supabase/ssr` 0.10.2 — no Next peer, works on any
- `@sentry/nextjs` 10.48 — peer `^13 || ^14 || ^15 || ^16` ✅
- `recharts` 3.8.1 — React 16–19 ✅
- `framer-motion` 12 — React 18/19 ✅
- `next-themes` 0.4.6 — React 16–19 ✅

### Known migration risks
1. **`SeoHead.tsx`** — fundamentally incompatible with Next Metadata API, needs full rewrite. Largest single task.
2. **`useSearchParams()`** — Next 14+ requires Suspense boundary wrapping or build fails.
3. **Dynamic route `params`** — Next 15+ made these async Promises; every dynamic page/layout/generateMetadata needs `await params`.
4. **`next/link` has no `state` prop** — react-router-dom state passing must move to query params or context.
5. **Recharts** — throws `ResizeObserver is not defined` under SSR, needs `dynamic({ ssr: false })`.
6. **Middleware cookie handling** — must call `getUser()` not `getSession()` (latter doesn't refresh tokens).

## Critical TODO Before Execution

⚠️ **Plan file `~/.claude/plans/abstract-brewing-toast.md` currently says "Next.js 14" throughout.** This was the version I defaulted to before Yash caught it. **Update the plan to Next.js 16.2.3 before starting execution.** See `user/feedback.md` → "Version Verification Corrections" for the rule I broke.

## References
- Project CLAUDE.md: `/Users/yashbaldha/Desktop/Boldteq App/Rankora/CLAUDE.md`
- Stack memory: `stacks/saas-nextjs-16.md` (migration patterns section)
- Lovable origin patterns: `stacks/lovable-project.md`
- Plan file: `~/.claude/plans/abstract-brewing-toast.md`
