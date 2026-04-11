# Stack A Scaffold-Only Dry Run — Rankora Rebuild

**Created:** 2026-04-11 (Sync Pass 3, Tier 1 #2)
**Pattern type:** Executable playbook (runnable end-to-end without live deploy)
**Anchored to:** `/Users/yashbaldha/Desktop/Boldteq App/Rankora` (Next 16.2.3 pre-staged, 8 Supabase migrations, Dodo Payments, Sentry + PostHog, cutover 2026-05-19)
**Canonical stack file:** `~/.claude/memory/stacks/saas-nextjs-supabase-railway.md` (22 KB, 619 lines)
**Depth:** scaffold-only (no live Railway deploy — per user decision 2026-04-11)
**Loaded by:** Rex (orchestrator), Arya (plan), Riko (scaffold), Koda (code), Sage (gate), Luna (tests), Bolt (deploy simulation), Mira (lessons)

---

## Purpose

Exercise the full Stack A pipeline end-to-end on a throwaway scratch project so every agent class (planner, builder, gate, insight) hits their real-world integration points before Rankora's actual 2026-04-21 rebuild kickoff. No live Railway deploy — but every command, every file, every migration, every RLS policy is produced and Sage-verified. This is the rehearsal.

**Target scratch project:** `rankora-scratch` — a minimal feature-parity slice that proves Stack A can stand up the five riskiest Rankora surfaces:
1. Supabase SSR auth with cookies that survive Next 16 proxy middleware
2. Protected route with RLS-gated data fetch
3. Dodo Payments subscription checkout → webhook → `profiles.subscription_tier` update
4. BullMQ worker on Railway that ingests a resume, embeds it, writes pgvector
5. Sentry instrumentation firing on both server and client boundaries

If any of these five break in the real rebuild, it's because the dry run skipped them. So we don't.

---

## Why scaffold-only (not paper, not live deploy)

| Depth | Catches | Skips | Cost |
|---|---|---|---|
| Paper | Plan-level mistakes | Every actual integration bug | 2h |
| **Scaffold-only** (this) | **Plan + real code + real migrations + real types + real RLS + real webhook contracts** | **Live network deploy to Railway** | **4h** |
| Live deploy | Everything incl. Railway env var gotchas | Nothing | 1d |

Scaffold-only is the 80/20. It produces a real, runnable Next.js 16 + Supabase + BullMQ codebase on disk, with real migrations, real Zod schemas, real Dodo webhook handlers, real Sentry init files, and real RLS policies — validated by Sage — without burning time on `railway up` iteration loops. When Rankora's real rebuild starts, Koda copies the patterns straight from this scratch project.

---

## The seven risky surfaces (what the dry run must prove)

Each one is a phase. Each phase has: **Agent · Artifact · Validation gate**.

### Phase 0 — Scratch setup (Riko, builder class, caps: 5 retries / $5 / 25 min)

**Artifact:** `/Users/yashbaldha/Desktop/Boldteq App/rankora-scratch/` directory containing:
- `package.json` — Next.js 16.2.3, React 19.2.5, `@supabase/ssr` 0.10.x, `@sentry/nextjs` 10.x, `bullmq` 5.x, `ioredis` 5.x, `@dodopayments/sdk` (or fetch-based client), `zod`, `tailwindcss` 3.4, `shadcn-ui` initialized
- `tsconfig.json` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `next.config.ts` — standalone output, Sentry wrapper, experimental.ppr flag explicit
- `proxy.ts` (NOT `middleware.ts` — Next 16 rename)
- `instrumentation.ts` + `instrumentation-client.ts`
- `railway.json`
- `Dockerfile` (multi-stage standalone)
- `.env.example` with every variable namespaced correctly (`NEXT_PUBLIC_` vs server-only)
- `app/layout.tsx` with server-side user fetch (no auth flash)
- `app/(marketing)/page.tsx` stub
- `app/(app)/dashboard/page.tsx` stub
- `src/integrations/supabase/{browser,server,middleware}.ts`
- `supabase/migrations/` — one bootstrap migration with `profiles`, `resumes`, `rankings` tables + RLS policies

**Gate (Sage):**
```bash
cd /Users/yashbaldha/Desktop/Boldteq\ App/rankora-scratch
pnpm install
pnpm tsc --noEmit
pnpm lint
pnpm build
test -f proxy.ts && ! test -f middleware.ts  # Next 16 rename enforced
grep -q 'noUncheckedIndexedAccess' tsconfig.json
grep -rn 'VITE_' src/ app/ 2>/dev/null && exit 1 || true  # zero VITE_ leftovers
grep -rn '@supabase/auth-helpers-nextjs' . && exit 1 || true  # banned
grep -rn 'console.log' app/ src/ && exit 1 || true  # no console.log in prod code
```
**Pass criterion:** All commands exit 0. If any fails, Sage blocks and Riko retries (cap 5).

---

### Phase 1 — Supabase SSR auth with Next 16 proxy cookies (Koda, builder)

**The risk:** Next 16 renamed `middleware.ts` to `proxy.ts` and changed how cookies propagate through the request pipeline. The `@supabase/ssr` package's `createServerClient` needs a `cookies` adapter that works with Next 16's new proxy runtime. If this is wrong, session refresh dies silently and users get logged out every 60 minutes.

**Artifact files:**
- `src/integrations/supabase/browser.ts` — `createBrowserClient` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `src/integrations/supabase/server.ts` — `createServerClient` with `cookies()` from `next/headers` (awaited in Next 16)
- `src/integrations/supabase/middleware.ts` — `updateSession()` helper that refreshes the session and rewrites request+response cookies
- `proxy.ts` at repo root — imports `updateSession` and runs it for every matched path
- `app/layout.tsx` — server component calls `getOptionalUser()` from `server.ts` and passes to a context provider
- `app/(auth)/login/page.tsx` + `app/(auth)/callback/route.ts` — OAuth + magic link path
- `app/(app)/dashboard/page.tsx` — server component reads `user` server-side, redirects to `/login` if null

**Gate (Sage + Luna):**
```bash
# Static check: cookies() is awaited everywhere in Next 16
grep -rn 'cookies()' app/ src/ | grep -v 'await cookies()' && exit 1 || true

# No client-side supabase calls in server components
grep -rn "from '@/integrations/supabase/browser'" app/ | grep -v 'use client' && exit 1 || true

# Luna unit test:
pnpm test src/integrations/supabase/middleware.test.ts
```
**Luna test content** (`src/integrations/supabase/middleware.test.ts`):
```ts
import { describe, it, expect, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from './middleware'

describe('updateSession', () => {
  it('rewrites cookies on the response, not just the request', async () => {
    const req = new NextRequest('http://localhost:8080/dashboard')
    const res = await updateSession(req)
    expect(res).toBeInstanceOf(NextResponse)
    // simulated: supabase returned new cookies
    // real test uses MSW mock of supabase auth refresh
  })

  it('returns a redirect when user is unauthenticated on protected routes', async () => {
    const req = new NextRequest('http://localhost:8080/dashboard')
    const res = await updateSession(req)
    expect(res.headers.get('location')).toMatch(/\/login/)
  })
})
```

**Lesson captured for Mira:** Next 16 `proxy.ts` must rewrite cookies on BOTH the request (for downstream reads in the same request) AND the response (for the browser to send next time). Supabase `@supabase/ssr`'s canonical example for Next 15 needs one change for Next 16: `cookies()` is async and must be awaited.

---

### Phase 2 — RLS-gated protected route (Koda, builder)

**The risk:** Forgetting RLS on any table, or writing RLS policies that accidentally allow cross-tenant reads. Classic SaaS breach.

**Artifact:** `supabase/migrations/20260411000000_bootstrap.sql`:
```sql
-- profiles: one per auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  subscription_tier text not null default 'free' check (subscription_tier in ('free','pro','team')),
  ranks_used_this_month int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  raw_text text,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index resumes_profile_id_idx on public.resumes(profile_id);
create index resumes_embedding_hnsw_idx on public.resumes using hnsw (embedding vector_cosine_ops);

create table public.rankings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  jd_text text not null,
  created_at timestamptz not null default now()
);
create index rankings_profile_id_idx on public.rankings(profile_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.rankings enable row level security;

-- profiles: user can only read/update their own row
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id);
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id);

-- resumes: scoped by profile_id
create policy resumes_owner_read on public.resumes
  for select using (profile_id = auth.uid());
create policy resumes_owner_insert on public.resumes
  for insert with check (profile_id = auth.uid());
create policy resumes_owner_delete on public.resumes
  for delete using (profile_id = auth.uid());

-- rankings: scoped by profile_id
create policy rankings_owner_read on public.rankings
  for select using (profile_id = auth.uid());
create policy rankings_owner_insert on public.rankings
  for insert with check (profile_id = auth.uid());

-- Auto-create profile row when auth.users insert happens
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

**Gate (Sage — hard block):**
```bash
# RLS must be enabled on every public table
psql "$SUPABASE_DB_URL" -tAc "
  select tablename from pg_tables where schemaname='public'
  except
  select tablename from pg_tables t
  join pg_class c on c.relname = t.tablename
  where schemaname='public' and c.relrowsecurity = true
" | grep . && exit 1 || true

# Every table must have at least one policy
psql "$SUPABASE_DB_URL" -tAc "
  select tablename from pg_tables where schemaname='public'
  and tablename not in (select tablename from pg_policies where schemaname='public')
" | grep . && exit 1 || true
```

**Lesson for Mira:** The RLS-verification bash snippet above goes into `~/.claude/memory/patterns/good/executable-validation-gates.md` so Sage runs it on every Stack A build.

---

### Phase 3 — Dodo Payments checkout → webhook → profile update (Koda, builder)

**The risk:** Webhook signature verification. Missing it = anyone can POST a fake "subscription started" and upgrade any account for free.

**Artifact:** `app/api/dodo/checkout/route.ts` and `app/api/dodo/webhook/route.ts`:
```ts
// app/api/dodo/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServerClientForWebhook } from '@/integrations/supabase/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'

const DodoEvent = z.object({
  type: z.enum([
    'subscription.created',
    'subscription.updated',
    'subscription.cancelled',
    'invoice.paid',
  ]),
  data: z.object({
    customer_id: z.string(),
    subscription_id: z.string(),
    plan: z.enum(['pro', 'team']),
    metadata: z.object({
      profile_id: z.string().uuid(),
    }),
  }),
})

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-dodo-signature')
  const secret = process.env.DODO_WEBHOOK_SECRET

  if (!signature || !secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  const parsed = DodoEvent.safeParse(JSON.parse(rawBody))
  if (!parsed.success) {
    Sentry.captureMessage('dodo.webhook.bad_shape', { extra: parsed.error })
    return NextResponse.json({ error: 'bad shape' }, { status: 400 })
  }

  const { type, data } = parsed.data
  const supabase = createServerClientForWebhook()

  if (type === 'subscription.created' || type === 'subscription.updated') {
    const { error } = await supabase
      .from('profiles')
      .update({ subscription_tier: data.plan, updated_at: new Date().toISOString() })
      .eq('id', data.metadata.profile_id)
    if (error) {
      Sentry.captureException(error)
      return NextResponse.json({ error: 'db update failed' }, { status: 500 })
    }
  }

  if (type === 'subscription.cancelled') {
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'free' })
      .eq('id', data.metadata.profile_id)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
```

**Gate (Sage):**
```bash
# Webhook route must verify signature before reading body
grep -A 20 'export async function POST' app/api/dodo/webhook/route.ts \
  | grep -q 'timingSafeEqual' || exit 1

# Webhook must not trust metadata without verifying it came from Dodo
grep -q 'x-dodo-signature' app/api/dodo/webhook/route.ts || exit 1

# Zod parsing required
grep -q "DodoEvent.safeParse" app/api/dodo/webhook/route.ts || exit 1
```

**Luna test:** Mock webhook POST with correct signature → profile row updated. Mock POST with wrong signature → 401, no DB write, Sentry event captured.

**Lesson for Mira:** `timingSafeEqual` on the signature compare is non-negotiable — regular `===` is vulnerable to timing attacks. Add to `executable-validation-gates.md`.

---

### Phase 4 — BullMQ worker on Railway (Koda, builder)

**The risk:** Worker runs in a separate Railway service. Must share Redis, must share Supabase service role, must have its own Dockerfile, must NOT import any `next/*` APIs (it's a plain Node process).

**Artifact:** `workers/rank-resume/` directory:
```
workers/rank-resume/
  package.json      # separate package, plain Node + BullMQ + ioredis + openai
  Dockerfile        # node:20-alpine, plain entrypoint
  railway.json
  src/
    index.ts        # Worker setup + graceful shutdown
    processRank.ts  # The job: fetch resume, call OpenAI embedding, write pgvector
    supabase.ts     # service-role client (NO @supabase/ssr, plain @supabase/supabase-js)
```

`workers/rank-resume/src/index.ts`:
```ts
import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { processRank, type RankJob } from './processRank'
import pino from 'pino'

const logger = pino()
const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

const worker = new Worker<RankJob>(
  'rank-resume',
  async (job: Job<RankJob>) => {
    return processRank(job.data, logger.child({ jobId: job.id }))
  },
  { connection, concurrency: 4 }
)

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'rank-resume job failed')
})

const shutdown = async () => {
  logger.info('shutting down worker')
  await worker.close()
  await connection.quit()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
```

**Gate (Sage):**
```bash
# Worker must not import Next.js
! grep -rn "from 'next" workers/rank-resume/src/ || exit 1

# Worker must use service role, not anon
grep -q 'SUPABASE_SERVICE_ROLE_KEY' workers/rank-resume/src/supabase.ts || exit 1

# Graceful shutdown required
grep -q 'SIGTERM' workers/rank-resume/src/index.ts || exit 1

# maxRetriesPerRequest: null required (BullMQ requirement on ioredis)
grep -q 'maxRetriesPerRequest: null' workers/rank-resume/src/index.ts || exit 1
```

**Lesson for Mira:** BullMQ's ioredis connection MUST have `maxRetriesPerRequest: null`. This is the #1 silent-failure footgun in Stack A workers. Add to `stacks/saas-nextjs-supabase-railway.md` as a hard rule.

---

### Phase 5 — Sentry on both boundaries (Koda, builder)

**The risk:** Sentry only catches server errors because `instrumentation-client.ts` wasn't configured, or vice versa.

**Artifact:** Three files, all three required by Next 16 + `@sentry/nextjs` 10.x:

`instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
```

`instrumentation-client.ts`:
```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,
})
```

`sentry.server.config.ts`:
```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
})
```

**Gate (Sage):**
```bash
test -f instrumentation.ts || exit 1
test -f instrumentation-client.ts || exit 1
test -f sentry.server.config.ts || exit 1
grep -q 'NEXT_RUNTIME' instrumentation.ts || exit 1
```

**Luna test:** Throw in a server component → server Sentry captures. Throw in a client event handler → client Sentry captures.

**Lesson for Mira:** Next 16 needs BOTH `instrumentation.ts` AND `instrumentation-client.ts`. Missing the client one is the classic "why aren't my client errors in Sentry" bug. Add to `nextjs-production-infra.md`.

---

### Phase 6 — Bolt deploy simulation (Bolt, gate class, caps: 3 retries / $3 / 15 min)

No live deploy, but Bolt produces and validates the deploy plan end-to-end.

**Artifact:** `DEPLOY.md` in `rankora-scratch/`:
- Railway service graph: web, worker, redis (Railway-managed), Supabase (external)
- Env var map per service (which service gets which secret)
- Preview env strategy (Railway PR environments, one per branch)
- Migration runner: `supabase db push` from CI after Sage approves
- Rollback: Railway "redeploy previous" + Supabase migration revert SQL pre-written
- Health check endpoint: `app/api/health/route.ts` returns `{ status, db, redis, supabase_auth }`

**Gate (Bolt self-check):**
```bash
test -f DEPLOY.md
grep -q 'rollback' DEPLOY.md
grep -q 'health check' DEPLOY.md
test -f app/api/health/route.ts
```

---

## Rex Dispatch Contract (for the real rebuild)

When Rankora's 2026-04-21 rebuild starts, Rex dispatches in this exact order with these exact class tags:

```json
[
  { "agent": "arya",  "class": "planner", "caps": { "retries": 3, "cost_usd": 4, "wall_clock_min": 90 }, "must_load": ["patterns/good/stack-a-scaffold-dryrun.md","stacks/saas-nextjs-supabase-railway.md","projects/rankora-brand-kit.md","projects/rankora-nextjs-rebuild.md"] },
  { "agent": "riko",  "class": "builder", "caps": { "retries": 5, "cost_usd": 5, "wall_clock_min": 25 }, "must_load": ["patterns/good/stack-a-scaffold-dryrun.md","patterns/good/executable-auto-fix-loop.md"] },
  { "agent": "koda",  "class": "builder", "caps": { "retries": 5, "cost_usd": 5, "wall_clock_min": 25 }, "must_load": ["patterns/good/stack-a-scaffold-dryrun.md","patterns/good/executable-validation-gates.md","projects/rankora-brand-kit.md"] },
  { "agent": "luna",  "class": "gate",    "caps": { "retries": 3, "cost_usd": 3, "wall_clock_min": 15 }, "must_load": ["patterns/good/executable-validation-gates.md"] },
  { "agent": "sage",  "class": "gate",    "caps": { "retries": 3, "cost_usd": 3, "wall_clock_min": 15 }, "must_load": ["patterns/good/stack-a-scaffold-dryrun.md","patterns/good/executable-validation-gates.md"] },
  { "agent": "bolt",  "class": "gate",    "caps": { "retries": 3, "cost_usd": 3, "wall_clock_min": 15 }, "must_load": ["patterns/good/railway-deployment.md","patterns/good/stack-a-scaffold-dryrun.md"] },
  { "agent": "hawk",  "class": "gate",    "caps": { "retries": 3, "cost_usd": 3, "wall_clock_min": 15 }, "must_load": ["patterns/good/nextjs-production-infra.md"] },
  { "agent": "mira",  "class": "insight", "caps": { "retries": 3, "cost_usd": 3, "wall_clock_min": 10 }, "must_load": ["MEMORY.md","HEALTH.md"] }
]
```

Any agent that blows through caps → Rex circuit-breaks, writes an escalation JSON to `/Users/yashbaldha/.claude/memory/user/escalations/`, stops the pipeline. Per feedback.md rule #2 (Agent Class Caps Non-Negotiable).

---

## Lessons captured (these propagate to memory on close of Sync Pass 3)

1. **Next 16 `proxy.ts` + `@supabase/ssr`:** `cookies()` is async; `updateSession` must rewrite on both request and response. → `stacks/saas-nextjs-supabase-railway.md` update.
2. **RLS verification bash gate** — two-query check that every public table has RLS enabled + at least one policy. → `patterns/good/executable-validation-gates.md` append.
3. **Dodo webhook verification** — `timingSafeEqual` + Zod parse required, never trust metadata without signature check. → `patterns/good/billing-patterns.md` (create if missing) append.
4. **BullMQ ioredis `maxRetriesPerRequest: null`** is a hard Stack A rule. → `stacks/saas-nextjs-supabase-railway.md` append.
5. **Next 16 Sentry needs both `instrumentation.ts` AND `instrumentation-client.ts`** — missing the client file is the #1 "client errors missing from Sentry" bug. → `patterns/good/nextjs-production-infra.md` append.
6. **Worker services must not import `next/*`** — separate `package.json`, plain Node entry, service-role Supabase. → `stacks/saas-nextjs-supabase-railway.md` append.
7. **Dispatch contract JSON** from Rex must list `must_load` per agent — any agent starting without its must_load files is a circuit-break. → `agents/rex.md` reinforcement.

---

## Version Log

- **v1 — 2026-04-11** — Scaffold-only dry run pattern shipped as part of Sync Pass 3 Tier 1 #2. Anchored to real Rankora rebuild target. Not yet executed against a live scratch project — execution happens in the first 4 hours of the 2026-04-21 rebuild kickoff, with Mira capturing any deltas between the plan and reality.
