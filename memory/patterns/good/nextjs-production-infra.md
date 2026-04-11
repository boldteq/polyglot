# Next.js Production Infrastructure Patterns — Stack A Master

> **Created 2026-04-10.** Production-grade infrastructure patterns for every Boldteq Next.js 16 + Supabase + Railway project. Covers env vars, logging, rate limiting, caching, health checks, job queues, file storage, DB safety, and security.

---

## 1. ENV VARS MANAGEMENT

### Naming convention
- `NEXT_PUBLIC_*` → exposed to browser (safe to commit placeholder values)
- No prefix → server-only (never logged, never sent to client)
- `_SECRET` suffix → rotate on any employee change, never in code

### `.env.example` template (Riko writes this day 1)

```bash
# ═══════════════════════════════════════════════════════════
# APP CONFIG
# ═══════════════════════════════════════════════════════════
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=development  # production | staging | preview | development
NODE_ENV=development
LOG_LEVEL=info  # trace | debug | info | warn | error | fatal

# ═══════════════════════════════════════════════════════════
# SUPABASE (auth + db + storage)
# ═══════════════════════════════════════════════════════════
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # server only, bypass RLS
SUPABASE_JWT_SECRET=...                    # for verifying tokens server-side
SUPABASE_DB_PASSWORD=...                   # for CLI migrations

# ═══════════════════════════════════════════════════════════
# DODO PAYMENTS
# ═══════════════════════════════════════════════════════════
DODO_API_KEY=...                           # test_... or live_...
DODO_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_DODO_PUBLISHABLE_KEY=pk_...

# ═══════════════════════════════════════════════════════════
# RESEND (email)
# ═══════════════════════════════════════════════════════════
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=hello@[domain].com
RESEND_REPLY_TO=support@[domain].com

# ═══════════════════════════════════════════════════════════
# SENTRY (errors)
# ═══════════════════════════════════════════════════════════
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=sntrys_...              # CI only, for source map upload
SENTRY_ORG=boldteq
SENTRY_PROJECT=[project-name]

# ═══════════════════════════════════════════════════════════
# POSTHOG (analytics)
# ═══════════════════════════════════════════════════════════
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# ═══════════════════════════════════════════════════════════
# REDIS (rate limiting + BullMQ)
# ═══════════════════════════════════════════════════════════
REDIS_URL=${{redis.REDIS_PRIVATE_URL}}    # Railway reference in prod
REDIS_PUBLIC_URL=                          # optional, for local dev

# ═══════════════════════════════════════════════════════════
# FEATURE FLAGS (optional sprint dep)
# ═══════════════════════════════════════════════════════════
# POSTHOG handles feature flags — no separate service needed

# ═══════════════════════════════════════════════════════════
# AI (Stack C sprint)
# ═══════════════════════════════════════════════════════════
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
```

### Env validation on boot (Zod)

```ts
// lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_ENV: z.enum(['production', 'staging', 'preview', 'development']),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DODO_API_KEY: z.string().min(1),
  DODO_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  RESEND_API_KEY: z.string().startsWith('re_'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
})

export const env = envSchema.parse(process.env)
```

**Rule:** app crashes on boot if any required env var is missing. Fails fast, fails loud.

---

## 2. STRUCTURED LOGGING — PINO

**Never `console.log` in production code.** Pino gives Railway structured JSON logs that are searchable and cost-effective.

```ts
// lib/logger.ts
import pino from 'pino'
import { env } from './env'

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    env: env.NEXT_PUBLIC_APP_ENV,
    service: 'web',
    version: process.env.RAILWAY_DEPLOYMENT_ID ?? 'local',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.api_key',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Child loggers for context
export function requestLogger(requestId: string) {
  return logger.child({ requestId })
}
```

**Usage:**
```ts
import { logger } from '@/lib/logger'

logger.info({ userId: user.id, action: 'login' }, 'user logged in')
logger.error({ err, userId }, 'failed to process payment')
```

**Rules:**
- Every log has context object (first arg) + message (second arg)
- Never log passwords, tokens, API keys (Pino redaction handles some, but be explicit)
- User-facing errors = `warn`. Infrastructure errors = `error`. Unrecoverable = `fatal`
- No `console.log` — ESLint rule blocks it

---

## 3. RATE LIMITING — UPSTASH REDIS

Every public API route needs rate limiting. Non-negotiable.

```ts
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

// Per-IP, standard API
export const apiRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
  prefix: 'rl:api',
})

// Per-user, authenticated endpoints
export const authedRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
  prefix: 'rl:auth',
})

// Expensive operations (AI, billing)
export const expensiveRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.tokenBucket(5, '1 m', 5),
  analytics: true,
  prefix: 'rl:exp',
})
```

**Usage:**
```ts
// app/api/signup/route.ts
import { apiRatelimit } from '@/lib/rate-limit'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  const h = await headers()
  const ip = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'anonymous'
  const { success, limit, remaining, reset } = await apiRatelimit.limit(ip)

  if (!success) {
    return new Response('Too many requests', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    })
  }
  // ... actual logic
}
```

**Middleware option (global rate limit):**
```ts
// middleware.ts
import { NextResponse } from 'next/server'
import { apiRatelimit } from '@/lib/rate-limit'

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const ip = req.ip ?? req.headers.get('x-forwarded-for') ?? 'anonymous'
    const { success } = await apiRatelimit.limit(ip)
    if (!success) return new NextResponse('Too many requests', { status: 429 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
```

---

## 4. CACHING STRATEGY — 3 LAYERS

### Layer 1 — Next.js `unstable_cache` (server-side DB query cache)

```ts
import { unstable_cache, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export const getProjects = unstable_cache(
  async (userId: string) => {
    const supabase = await createClient()
    const { data } = await supabase.from('projects').select('*').eq('user_id', userId)
    return data ?? []
  },
  ['projects'],
  { tags: ['projects'], revalidate: 60 }
)

// After mutation:
export async function createProject(data: ProjectInput) {
  // ... insert
  revalidateTag('projects')
}
```

### Layer 2 — Upstash Redis (cross-request shared cache)

```ts
// lib/cache.ts
import { Redis } from '@upstash/redis'
const redis = Redis.fromEnv()

export async function cacheGet<T>(key: string): Promise<T | null> {
  return redis.get<T>(key)
}

export async function cacheSet<T>(key: string, value: T, ttlSec: number) {
  await redis.set(key, value, { ex: ttlSec })
}

export async function cacheBust(pattern: string) {
  const keys = await redis.keys(pattern)
  if (keys.length) await redis.del(...keys)
}
```

### Layer 3 — Client-side (TanStack Query)

```ts
// app/providers.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

**When to use each:**
- Layer 1: Server Components, rarely-changing data (settings, features)
- Layer 2: Session-scoped data, expensive computations, shared across users
- Layer 3: Client Components, optimistic updates, real-time-ish feel

---

## 5. HEALTH CHECKS

See `railway-deployment.md` for the `/api/health` route. Key points:

- Railway calls `/api/health` on every deploy before marking healthy
- Must return 200 for healthy, 503 for degraded
- Check: web (always ok), db (Supabase ping), redis (if configured)
- Response must be fast (<1s) — no expensive checks

**Separate endpoint for deep checks:**
```ts
// app/api/health/deep/route.ts
// Returns detailed status of all integrations (Dodo, Resend, Sentry)
// Called manually or by scheduled task, NOT by Railway healthcheck
```

---

## 6. BACKGROUND JOB QUEUE — BULLMQ

### Architecture
- Queue lives in Redis (Railway-managed)
- Web service enqueues jobs (never processes them)
- `worker-jobs` Railway service processes jobs
- `worker-cron` Railway service runs scheduled enqueues

### Setup

**`workers/jobs/index.ts`:**
```ts
import { Worker, Queue } from 'bullmq'
import IORedis from 'ioredis'
import { logger } from './logger'

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

export const jobsQueue = new Queue('jobs', { connection })

const worker = new Worker(
  'jobs',
  async (job) => {
    const log = logger.child({ jobId: job.id, name: job.name, attempt: job.attemptsMade })
    log.info('processing job')

    switch (job.name) {
      case 'send-email':
        return sendEmail(job.data)
      case 'process-upload':
        return processUpload(job.data)
      case 'generate-report':
        return generateReport(job.data)
      default:
        throw new Error(`Unknown job: ${job.name}`)
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 100, duration: 60_000 }, // 100 jobs/min max
  }
)

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, name: job.name }, 'job completed')
})

worker.on('failed', (job, err) => {
  logger.error({ err, jobId: job?.id, name: job?.name }, 'job failed')
  // Sentry auto-captures via error log
})

logger.info('worker started')
```

**Enqueuing from web service:**
```ts
// lib/queue.ts
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

export const jobsQueue = new Queue('jobs', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000, age: 86400 },
    removeOnFail: { count: 5000 },
  },
})
```

**Usage from API route:**
```ts
import { jobsQueue } from '@/lib/queue'

await jobsQueue.add('send-email', { to: user.email, template: 'welcome' })
```

### Cron jobs

**`workers/cron/index.ts`:**
```ts
import cron from 'node-cron'
import { jobsQueue } from '../jobs/queue'
import { logger } from './logger'

// Daily summary email — 8am UTC
cron.schedule('0 8 * * *', async () => {
  logger.info('enqueueing daily summary')
  await jobsQueue.add('daily-summary', {})
})

// Cleanup expired sessions — hourly
cron.schedule('0 * * * *', async () => {
  await jobsQueue.add('cleanup-sessions', {})
})

logger.info('cron started')
```

### Dead letter queue

Jobs that fail all attempts go to a dead letter queue for manual inspection:

```ts
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    await deadLetterQueue.add(job.name, { data: job.data, error: err.message, stack: err.stack })
    logger.error({ jobId: job.id }, 'job moved to dead letter queue')
  }
})
```

---

## 7. DATABASE SAFETY — SUPABASE + RLS

### RLS is mandatory on every table
See `stacks/saas-nextjs-supabase-railway.md` for the exact RLS policy patterns.

### Indexing rules
- Every foreign key has an index
- Every column used in WHERE has an index (composite if multi-column)
- Use `explain analyze` before shipping slow queries

```sql
-- Always index FKs
create index idx_projects_user_id on projects(user_id);

-- Composite for multi-column filters
create index idx_tasks_project_status on tasks(project_id, status);

-- Partial index for common filter
create index idx_orders_pending on orders(created_at)
  where status = 'pending';
```

### Migration safety
- Never drop columns without a 2-phase migration (add new → dual-write → migrate reads → drop old)
- Never rename columns — add new, migrate, drop old
- Always run migrations in a transaction (Supabase CLI does this)
- Test migrations on staging branch before production

```bash
# Generate migration
supabase migration new add_projects_table

# Apply locally
supabase db push --linked

# On staging (Supabase branch)
supabase db push --linked --branch staging

# Production only after Sage approves
supabase db push --linked --branch main
```

### Types auto-generation
```bash
# After every migration
supabase gen types typescript --linked > lib/supabase/types.ts
```

Committed to git. Riko adds this to pre-commit hook.

---

## 8. FILE STORAGE — SUPABASE STORAGE

### Bucket patterns
- `public-assets` — public URLs, cached at CDN
- `user-uploads` — RLS-protected, signed URLs only
- `temp` — auto-deleted after 24h via scheduled job

### RLS on storage buckets
```sql
-- user-uploads: only user can access their own files
create policy "users access own uploads"
  on storage.objects for all
  using (
    bucket_id = 'user-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

### Upload pattern
```ts
// Server action
'use server'
import { createClient } from '@/lib/supabase/server'

export async function uploadFile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('unauthorized')

  const file = formData.get('file') as File
  const path = `${user.id}/${crypto.randomUUID()}-${file.name}`

  const { error } = await supabase.storage
    .from('user-uploads')
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error) throw error
  return { path }
}
```

### Signed URLs for private files
```ts
const { data } = await supabase.storage
  .from('user-uploads')
  .createSignedUrl(path, 3600) // 1 hour expiry
```

**Rules:**
- Max file size: enforce client-side AND server-side (multer-like check in API route)
- Scan uploaded files for virus/malware (ClamAV via worker service) for user-generated content
- Limit file types by MIME validation (not just extension)

---

## 9. API SECURITY

### Security headers (middleware or `next.config.ts`)

```ts
// next.config.ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://app.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co https://app.posthog.com https://api.dodopayments.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

export default {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
} satisfies NextConfig
```

### CSRF protection
Next.js Server Actions have built-in CSRF. For API routes that accept POST:
- Verify `Origin` header matches `NEXT_PUBLIC_APP_URL`
- Use Supabase session token verification

### Input validation
**Every API route validates input with Zod. No exceptions.**

```ts
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
})

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.format() }, { status: 400 })
  }
  // ... use parsed.data
}
```

---

## 10. MONITORING STACK

### Sentry — full stack error tracking
- Frontend: `@sentry/nextjs` captures React errors + API calls
- Backend: API routes auto-instrumented
- Workers: manual `Sentry.captureException` in error handlers
- Source maps uploaded via CI (`SENTRY_AUTH_TOKEN`)

### PostHog — product analytics
- Autocapture for clicks, pageviews
- Custom events for conversions
- Session replay enabled (with privacy masking for forms)
- Feature flags for progressive rollouts

### Railway logs — infrastructure
- Structured JSON from Pino
- Searchable in Railway dashboard
- Exported to long-term storage (S3 or Axiom) via Railway → destination integration

### BetterStack — uptime
- Monitors `/api/health` every 60s
- Alerts via Slack + email if down 3 checks in a row
- Status page auto-generated at `status.[domain].com`

---

## HARD RULES

1. **Env vars validated on boot** — Zod schema, app crashes if missing
2. **No `console.log`** — Pino only, ESLint enforces
3. **Every public API rate-limited** — Upstash Redis, no exceptions
4. **RLS on every table** — Sage blocks deploy if missing
5. **Every migration tested on staging** — no direct prod migrations
6. **Types regenerated after every migration** — `supabase gen types` in CI
7. **Security headers set globally** — CSP, HSTS, X-Frame-Options non-negotiable
8. **Input validated with Zod** — every API route, every form
9. **Secrets never in `.env.example`** — placeholders only
10. **Dead letter queue for failed jobs** — manual inspection required

---

*(Written by Mira — 2026-04-10 Next.js + Railway migration. Load alongside stacks/saas-nextjs-supabase-railway.md and patterns/good/railway-deployment.md for the full Stack A picture.)*
