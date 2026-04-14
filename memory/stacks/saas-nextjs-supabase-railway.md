# Stack A — Next.js + Supabase + Railway (MASTER)

> **Active 2026-04-10 onwards. This is the ONLY stack for Boldteq internal SaaS products.**
> All 21 agents load this file for any non-Shopify task.
> Replaces: `saas-nextjs-supabase.md` (Vercel-era) and `lovable-project.md` (both archived).

---

## THE STACK — CANONICAL

| Layer | Technology | Version | Locked |
|-------|-----------|---------|--------|
| **Framework** | Next.js | **16.2.3** | Yes — App Router only, no Pages Router |
| **Language** | TypeScript | 5.6+ | `strict: true`, zero `any` |
| **React** | React | 19 | Server Components default, `use client` only when needed |
| **Styling** | Tailwind CSS | 4.x | Vega owns tokens (globals.css + design-tokens.ts) |
| **Components** | shadcn/ui | latest | Via CLI only (`npx shadcn@latest add`) |
| **Database** | Supabase Postgres | managed | Supabase hosting, NEVER self-host DB |
| **Auth** | Supabase Auth | managed | `@supabase/ssr` for Next.js integration |
| **Storage** | Supabase Storage | managed | Buckets with RLS, signed URLs for private |
| **Hosting (Frontend)** | Railway | managed | Next.js app deployed to Railway |
| **Hosting (Backend/API)** | Railway | managed | Next.js API routes run on same Railway service |
| **Hosting (Workers)** | Railway | managed | Separate Railway service per worker |
| **Billing** | Dodo Payments | managed | Never Stripe for Boldteq products — Dodo only |
| **Email** | Resend | managed | Transactional + marketing |
| **Error tracking** | Sentry | managed | Full stack — frontend + API + workers |
| **Analytics** | PostHog | managed | Product analytics + session replay |
| **Uptime** | Railway healthchecks + BetterStack | managed | `/api/health` endpoint required |
| **CI/CD** | GitHub Actions → Railway auto-deploy | — | `main` → prod, `develop` → staging |
| **Package manager** | pnpm | 9.x | Never npm, never yarn |
| **Node** | Node.js | 20 LTS | Pinned in `package.json` + `.nvmrc` |

**Everything else is forbidden by default.** Any deviation requires explicit Yash approval.

---

## ARCHITECTURE TOPOLOGY

```
┌─────────────────────────────────────────────────────────────┐
│                         RAILWAY                              │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Next.js App   │  │ Worker: Jobs │  │ Worker: Cron    │ │
│  │  (frontend +   │──│  BullMQ      │──│ Scheduled tasks │ │
│  │   API routes)  │  │  + Redis     │  │                 │ │
│  └───────┬────────┘  └──────┬───────┘  └────────┬────────┘ │
│          │  Private networking (Railway internal DNS)       │
│          │                                                   │
│  ┌───────▼────────┐                                         │
│  │     Redis       │ ← Railway-managed                      │
│  └─────────────────┘                                         │
└────────┬───────────────────────────────────────────────────┘
         │ HTTPS (public) / Supabase client
         ▼
┌─────────────────────────────────────────────────────────────┐
│                       SUPABASE                                │
│  Postgres • Auth • Storage • Realtime • Edge Functions       │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (webhooks)
┌─────────────────┐  ┌──────────┐  ┌─────────┐  ┌──────────┐
│  Dodo Payments  │  │  Resend  │  │  Sentry │  │ PostHog  │
└─────────────────┘  └──────────┘  └─────────┘  └──────────┘
```

**Service separation rule:** Every long-running or async job runs in a separate Railway service. The Next.js app NEVER blocks on background work.

---

## FOLDER STRUCTURE (Riko scaffolds this day 1)

```
project-root/
├── .github/
│   └── workflows/
│       ├── ci.yml                # lint + typecheck + test + build
│       └── preview.yml            # PR preview deployment trigger
├── .handoffs/                     # Agent-to-agent communication (gitignored)
│   └── README.md
├── .vega-screenshots/             # Playwright visual review output (gitignored)
├── app/
│   ├── (auth)/                    # Auth route group
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── layout.tsx
│   ├── (marketing)/               # Public marketing pages
│   │   ├── page.tsx               # Landing page
│   │   ├── pricing/page.tsx
│   │   └── layout.tsx
│   ├── (app)/                     # Authenticated app
│   │   ├── dashboard/page.tsx
│   │   ├── settings/page.tsx
│   │   └── layout.tsx             # Auth check, sidebar
│   ├── api/
│   │   ├── health/route.ts        # Railway healthcheck — REQUIRED
│   │   ├── webhooks/
│   │   │   ├── dodo/route.ts      # Billing webhooks
│   │   │   └── supabase/route.ts
│   │   └── [...]/route.ts
│   ├── layout.tsx                 # Root layout, theme provider, toaster
│   ├── globals.css                # VEGA OWNS — design tokens
│   ├── not-found.tsx
│   └── error.tsx                  # Global error boundary
├── components/
│   ├── ui/                        # shadcn primitives (Riko installs via CLI)
│   ├── marketing/                 # Landing page components
│   ├── auth/                      # Auth forms
│   └── app/                       # App-specific components
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Browser client
│   │   ├── server.ts              # Server component client
│   │   ├── middleware.ts          # Middleware client (session refresh)
│   │   └── types.ts               # Generated via `supabase gen types`
│   ├── dodo/
│   │   └── client.ts              # Dodo Payments SDK
│   ├── resend/
│   │   ├── client.ts
│   │   └── templates/             # React Email templates
│   ├── sentry/
│   │   ├── client.config.ts
│   │   ├── server.config.ts
│   │   └── edge.config.ts
│   ├── posthog/
│   │   └── client.ts
│   ├── design-tokens.ts           # VEGA OWNS
│   ├── rate-limit.ts              # Upstash Redis or in-memory fallback
│   ├── logger.ts                  # Structured logging (pino)
│   └── utils.ts
├── workers/                       # Separate Railway services
│   ├── jobs/
│   │   ├── index.ts               # BullMQ worker entry point
│   │   ├── Dockerfile
│   │   └── railway.toml
│   └── cron/
│       ├── index.ts               # node-cron scheduled tasks
│       ├── Dockerfile
│       └── railway.toml
├── supabase/
│   ├── config.toml                # Supabase CLI config
│   ├── migrations/                # SQL migrations (timestamp prefix)
│   ├── seed.sql                   # Dev seed data
│   └── functions/                 # Edge functions (if needed)
├── scripts/
│   ├── vega-review.ts             # Playwright visual review
│   ├── seed-dev.ts
│   └── generate-types.ts          # Supabase type generation
├── tests/
│   ├── unit/                      # Vitest
│   ├── integration/               # Vitest + MSW
│   └── e2e/                       # Playwright
├── public/
├── .env.example                   # Every var documented (Riko writes)
├── .env.local                     # Gitignored
├── .gitignore                     # Includes .handoffs/, .vega-screenshots/
├── .nvmrc                         # node 20
├── .npmrc                         # pnpm config
├── CLAUDE.md                      # Project-specific agent instructions
├── README.md
├── next.config.ts                 # Strict mode, standalone output for Railway
├── package.json                   # pnpm, Node 20 engine
├── playwright.config.ts           # 5 device projects, preview URL aware
├── postcss.config.mjs
├── railway.toml                   # Railway service config
├── tailwind.config.ts             # VEGA OWNS theme.extend
├── tsconfig.json                  # strict: true
└── vitest.config.ts
```

---

## CRITICAL PATTERNS

### 1. Supabase SSR Setup (Next.js 16)

**Use `@supabase/ssr`, NEVER `@supabase/auth-helpers-nextjs` (deprecated).**

**`lib/supabase/server.ts`:**
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch { /* Server Component */ }
        },
      },
    }
  )
}
```

**`lib/supabase/middleware.ts`:** Refreshes session on every request. Required in `middleware.ts`.

**`lib/supabase/client.ts`:** For Client Components only.

### 2. Row Level Security — MANDATORY

**Every table has RLS enabled. Every policy explicit. No exceptions.**

```sql
-- Example: multi-tenant table
alter table projects enable row level security;

create policy "users see own projects"
  on projects for select
  using (auth.uid() = user_id);

create policy "users insert own projects"
  on projects for insert
  with check (auth.uid() = user_id);

create policy "users update own projects"
  on projects for update
  using (auth.uid() = user_id);

create policy "users delete own projects"
  on projects for delete
  using (auth.uid() = user_id);
```

**Sage blocks deployment if any table is missing RLS.**

### 3. Railway Configuration — `railway.toml`

```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install --frozen-lockfile && pnpm build"

[deploy]
startCommand = "pnpm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

[[services]]
name = "web"
```

**`next.config.ts` — standalone output for Railway:**
```ts
export default {
  output: 'standalone',
  experimental: { reactCompiler: true },
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
} satisfies NextConfig
```

### 4. Environment Variables — Multi-Env

**Railway project has 3 environments:** `production`, `staging`, `preview`.

**Variable scoping:**
- `NEXT_PUBLIC_*` → exposed to browser, set in Railway per env
- Server-only → set in Railway per env, never prefixed
- Secrets → Railway secret variables, never in code, never in `.env.example` (placeholder only)

**Env var naming convention:**
```
# Supabase (per-env project)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only — signs admin requests
SUPABASE_JWT_SECRET=              # for verifying tokens server-side

# Dodo Payments (server-side only)
DODO_API_KEY=                          # Server only, never expose
DODO_PAYMENTS_WEBHOOK_KEY=             # For verifying webhook signatures

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=                # CI only, source map upload

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# Redis (Railway-provided)
REDIS_URL=                        # Railway injects from Redis service (${{redis.REDIS_PRIVATE_URL}})

# App config
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_APP_ENV=              # production | staging | preview | development
NODE_ENV=
```

### 5. Rate Limiting — Non-Negotiable

Every public API route uses rate limiting:

```ts
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
})

// app/api/[...]/route.ts
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'anonymous'
  const { success } = await ratelimit.limit(ip)
  if (!success) return new Response('Too many requests', { status: 429 })
  // ...
}
```

### 6. Structured Logging — Pino

**Never use `console.log` in production code.**

```ts
// lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    env: process.env.NEXT_PUBLIC_APP_ENV,
    service: 'web',
  },
})
```

Railway aggregates structured logs automatically when JSON-formatted.

### 7. Health Checks — Required

**`app/api/health/route.ts`:**
```ts
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const checks = { web: 'ok', db: 'unknown', redis: 'unknown' }
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('_health').select('id').limit(1).maybeSingle()
    checks.db = error ? 'fail' : 'ok'
  } catch { checks.db = 'fail' }
  const allOk = Object.values(checks).every(v => v === 'ok')
  return Response.json(checks, { status: allOk ? 200 : 503 })
}
```

Railway calls this path on every deploy before marking healthy.

### 8. Background Jobs — BullMQ + Redis

**Job queue architecture:**
- Railway service 1: `web` (Next.js)
- Railway service 2: `worker-jobs` (BullMQ worker, separate `workers/jobs/`)
- Railway service 3: `worker-cron` (scheduled tasks)
- Railway service 4: `redis` (managed Redis)

**Private networking:** workers connect via `REDIS_PRIVATE_URL`, never public internet.

**Job structure:**
```ts
// workers/jobs/index.ts
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { logger } from './logger'

const connection = new IORedis(process.env.REDIS_PRIVATE_URL!, {
  maxRetriesPerRequest: null,
})

const worker = new Worker('jobs', async (job) => {
  logger.info({ jobId: job.id, name: job.name }, 'processing')
  switch (job.name) {
    case 'send-email': return sendEmail(job.data)
    case 'process-upload': return processUpload(job.data)
    default: throw new Error(`Unknown job: ${job.name}`)
  }
}, { connection, concurrency: 5 })

worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'job failed'))
```

**Retry policy:** 3 attempts with exponential backoff, dead letter queue after.

### 9. Caching Strategy

**3-layer cache:**
1. **Next.js `unstable_cache`** — database queries (tagged, revalidate on mutation)
2. **Upstash Redis** — cross-request shared cache (session-scoped data)
3. **Client-side (SWR/TanStack Query)** — UI-level cache with optimistic updates

```ts
import { unstable_cache } from 'next/cache'
import { revalidateTag } from 'next/cache'

export const getProjects = unstable_cache(
  async (userId: string) => {
    const supabase = await createClient()
    return supabase.from('projects').select('*').eq('user_id', userId)
  },
  ['projects'],
  { tags: ['projects'], revalidate: 60 }
)

// After mutation:
revalidateTag('projects')
```

### 10. Preview Environments — Per PR

**Railway auto-creates preview env for every PR.** Each preview gets:
- Isolated Railway deploy (unique URL)
- Supabase branch (isolated database via Supabase branching)
- Same env vars as staging, overridden `NEXT_PUBLIC_APP_URL`

**Vega reviews against the preview URL before merge.**

GitHub Actions passes the preview URL to Playwright:
```yaml
- run: pnpm vega:review --url ${{ steps.railway.outputs.preview_url }}
```

---

## DEPENDENCY MATRIX

### Core — installed day 1 by Riko
```
next@16.2.3
react@19
react-dom@19
typescript@5.6
@supabase/ssr
@supabase/supabase-js
tailwindcss@4
@tailwindcss/postcss
class-variance-authority
clsx
tailwind-merge
lucide-react
zod
react-hook-form
@hookform/resolvers
pino
pino-pretty (dev)
@upstash/ratelimit
@upstash/redis
```

### Testing — day 1
```
vitest
@vitest/ui
@testing-library/react
@testing-library/jest-dom
@playwright/test
jest-axe
msw
```

### Dev tooling — day 1
```
eslint
eslint-config-next
@typescript-eslint/parser
@typescript-eslint/eslint-plugin
prettier
prettier-plugin-tailwindcss
husky
lint-staged
```

### Feature deps — per sprint (never upfront)
```
# Billing sprint
@dodopayments/node
@dodopayments/web

# Email sprint
resend
react-email
@react-email/components

# Analytics sprint
posthog-js
posthog-node

# Error tracking sprint
@sentry/nextjs

# Jobs sprint
bullmq
ioredis

# Rich text sprint
@tiptap/react
@tiptap/starter-kit

# Charts sprint
recharts

# Animation sprint
framer-motion

# AI sprint
ai
@ai-sdk/anthropic
@ai-sdk/openai
```

---

## DEPLOYMENT FLOW

**Branches:**
- `main` → production Railway environment
- `develop` → staging Railway environment
- `feature/*` → preview Railway environment (per PR)

**Flow:**
1. Developer pushes to feature branch
2. GitHub Actions runs `ci.yml` (lint, typecheck, test, build)
3. On PR open: Railway creates preview deployment + Supabase branch
4. Vega reviews preview URL (screenshots at 4 breakpoints × 2 themes)
5. Luna runs E2E against preview URL
6. Sage audits: RLS, env vars, bundle size, CWV, a11y
7. PR merged to `develop` → Railway auto-deploys staging
8. QA on staging
9. PR from `develop` → `main` → Railway auto-deploys production
10. Hawk monitors for 15 min post-deploy (Sentry, Railway logs, PostHog)
11. Auto-rollback if error rate >1% or healthcheck fails

**Rollback:** `railway rollback` on previous deployment. Bolt handles this — never Koda.

---

## WHAT BOLDTEQ NEVER USES (for this stack)

- ❌ Vercel (replaced by Railway)
- ❌ Stripe (replaced by Dodo Payments)
- ❌ NextAuth.js (use Supabase Auth)
- ❌ Prisma (use Supabase client + generated types)
- ❌ Drizzle ORM (same reason)
- ❌ MongoDB / DynamoDB / any non-Postgres DB
- ❌ Pages Router (`pages/` directory)
- ❌ `@supabase/auth-helpers-nextjs` (deprecated, use `@supabase/ssr`)
- ❌ CSS modules / styled-components / Emotion
- ❌ npm / yarn (pnpm only)
- ❌ Custom Express servers (Next.js handles API routes)
- ❌ AWS Lambda / Cloudflare Workers for app logic (Railway only)
- ❌ Self-hosted Postgres (Supabase only)
- ❌ `any` types
- ❌ `console.log` in production code (use pino)

---

## AGENT HOOKS INTO THIS STACK

| Agent | Reads this file for |
|-------|---------------------|
| **Rex** | Stack detection (next.config.ts + railway.toml → Stack A), deploy orchestration |
| **Arya** | Service topology, data model conventions, RLS patterns, service separation |
| **Riko** | Day 1 scaffold structure, dependency lists, config files, env.example |
| **Koda** | Supabase SSR patterns, Dodo integration, Railway worker code, caching, rate limiting |
| **Vega** | Token file locations (globals.css, design-tokens.ts), preview URL review |
| **Luna** | Test structure (vitest + Playwright), preview URL E2E |
| **Sage** | RLS audit, env var audit, CWV gates, bundle size, security checklist |
| **Bolt** | Railway auto-deploy config, rollback procedure, healthcheck, preview env setup |
| **Hawk** | Railway logs ingestion, Sentry + PostHog monitoring, uptime checks |
| **Vex** | Debug patterns for Next 16 RSC, Supabase RLS issues, Railway log inspection |
| **Zeph** | SEO with App Router metadata API, CWV via Railway-hosted Next |
| **Quill** | Email via Resend + React Email, landing pages in `app/(marketing)/` |

---

## HARD RULES (never break)

1. **Next.js App Router only** — no `pages/` directory, ever.
2. **Supabase for all data** — no Prisma, no Drizzle, no alternate ORMs.
3. **RLS on every table** — Sage blocks deploy if missing.
4. **Railway for all hosting** — no Vercel, no AWS, no self-hosted.
5. **Dodo Payments for all billing** — no Stripe for Boldteq products.
6. **pnpm only** — `packageManager` field locks this.
7. **Node 20 LTS** — `.nvmrc` + engines field.
8. **TypeScript strict** — `strict: true`, no `any`, no `@ts-ignore`.
9. **Healthcheck route required** — `/api/health` or deploy fails.
10. **Pino for logs** — no `console.log` in production code paths.
11. **Rate limit every public API** — no exceptions.
12. **Feature deps deferred** — Stripe-alternatives, AI SDKs, rich text, etc. added per-sprint.
13. **Workers as separate Railway services** — web never blocks on background work.
14. **Private networking for internal services** — never go over public internet between Railway services.
15. **Standalone Next output** — `output: 'standalone'` in `next.config.ts` for Railway.

---

*(Written by Mira — 2026-04-10 Next.js + Railway migration. This file is the source of truth for Stack A. All agents load it.)*
