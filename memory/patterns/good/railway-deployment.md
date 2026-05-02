# Railway Deployment Patterns — Stack A Master

> **Created 2026-04-10 Next.js + Railway migration.** The definitive Railway playbook for every Boldteq SaaS product. Load this file alongside `stacks/saas-nextjs-supabase-railway.md`.

---

## RAILWAY PROJECT STRUCTURE

Every Boldteq SaaS on Railway has this exact shape:

```
Railway Project: [project-name]
├── Environment: production
│   ├── Service: web          (Next.js app — main user-facing)
│   ├── Service: worker-jobs  (BullMQ worker — async tasks)
│   ├── Service: worker-cron  (scheduled tasks)
│   └── Service: redis        (managed Redis for BullMQ + cache)
├── Environment: staging
│   ├── Service: web
│   ├── Service: worker-jobs
│   ├── Service: worker-cron
│   └── Service: redis
└── Environment: preview (per-PR, auto-created)
    ├── Service: web
    └── Service: redis
```

**Rule:** Production and staging always mirror each other. Preview is a lighter mirror (web + redis only, jobs queue disabled).

---

## DEPLOY FLOW — GITHUB PUSH → RAILWAY AUTO-DEPLOY

**The golden path (zero manual deploys):**

1. Developer works on `feature/xyz` branch
2. Push to GitHub → GitHub Actions runs `ci.yml` (lint + typecheck + test + build)
3. Open PR → Railway preview environment auto-created
4. Preview URL posted as PR comment by Railway GitHub integration
5. Vega runs visual review against preview URL
6. Luna runs E2E against preview URL
7. Sage audits: RLS, env vars, bundle, CWV, security headers
8. Merge PR to `develop` → Railway auto-deploys to **staging** environment
9. QA + smoke tests on staging
10. PR from `develop` → `main` → Railway auto-deploys to **production**
11. Hawk monitors 15 min post-deploy (Sentry error rate, Railway logs, healthcheck)
12. Auto-rollback if error rate >1% or healthcheck fails 3 times

**Bolt never runs `railway up` manually.** Bolt's job is configuration + monitoring, not manual deploys.

---

## INITIAL RAILWAY SETUP (Bolt's day-1 protocol)

```bash
# 1. Install CLI (Bolt has this)
npm i -g @railway/cli

# 2. Login once per machine
railway login

# 3. Create project
railway init --name "boldteq-[project-name]"

# 4. Link to GitHub repo (enables auto-deploy)
railway connect

# 5. Create services
railway service create web
railway service create worker-jobs
railway service create worker-cron
railway add redis   # managed Redis plugin

# 6. Create environments
railway environment new staging
railway environment new preview

# 7. Set variables per environment (from .env.example)
railway variables set NEXT_PUBLIC_SUPABASE_URL=... --environment production
railway variables set NEXT_PUBLIC_SUPABASE_URL=... --environment staging
# ... repeat for all vars

# 8. Enable PR preview deployments
# Done in Railway dashboard: Settings → Environments → Enable PR previews

# 9. Set custom domain
railway domain add app.[domain].com --environment production
railway domain add staging.[domain].com --environment staging
```

---

## `railway.toml` — CANONICAL CONFIG

Every Stack A project has this at the repo root:

```toml
# Web service (Next.js app)
[build]
builder = "NIXPACKS"
buildCommand = "pnpm install --frozen-lockfile && pnpm build"
watchPatterns = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "package.json", "next.config.ts"]

[deploy]
startCommand = "pnpm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
numReplicas = 1

# Multiple services — separate nixpacks per service
[[services]]
name = "web"
source = "."

[[services]]
name = "worker-jobs"
source = "./workers/jobs"
buildCommand = "pnpm install --frozen-lockfile && pnpm build"
startCommand = "pnpm start"
healthcheckPath = ""  # workers don't expose HTTP
restartPolicyType = "ALWAYS"

[[services]]
name = "worker-cron"
source = "./workers/cron"
buildCommand = "pnpm install --frozen-lockfile && pnpm build"
startCommand = "pnpm start"
restartPolicyType = "ALWAYS"
```

**For workers:** each has its own `Dockerfile` OR a separate `railway.toml` in its subdirectory. Nixpacks + monorepo root detection is cleanest.

---

## PREVIEW ENVIRONMENTS — PER PR

**Setup (one-time in Railway dashboard):**
- Settings → Environments → **Enable PR previews**
- Source environment: staging (previews clone staging vars)
- Base branch: `main`

**What happens per PR:**
1. Railway spins up a preview environment named `pr-123`
2. All services from base environment cloned (web + redis)
3. Unique URL: `https://pr-123-web-production.up.railway.app`
4. Supabase branching: separate DB branch per PR (via Supabase GitHub integration)
5. Environment variables cloned from `staging` with preview overrides
6. Destroyed when PR closed

**Vega's workflow:**
```bash
# Read preview URL from Railway GitHub comment or API
export PREVIEW_URL=$(gh pr view --json comments | jq -r '...')

# Run visual review
pnpm vega:review --url $PREVIEW_URL
```

**Luna's workflow:**
```bash
# E2E against preview
PLAYWRIGHT_BASE_URL=$PREVIEW_URL pnpm test:e2e
```

**Supabase branching config (`supabase/config.toml`):**
```toml
[experimental.branching]
enabled = true
```

---

## PRIVATE NETWORKING BETWEEN SERVICES

Railway services in the same environment can talk via internal DNS without going over the public internet.

**Connection strings:**
- Public URL: `https://redis-production.up.railway.app` (avoid — billable egress, slower)
- **Private URL: `redis.railway.internal:6379`** (use this — free, faster, secure)

**How to use:**
Railway exposes `${{redis.REDIS_PRIVATE_URL}}` as a variable reference in the dashboard. In env vars:

```
REDIS_URL=${{redis.REDIS_PRIVATE_URL}}
```

**Stack A convention:**
- `REDIS_URL` → private (set via reference)
- `REDIS_PUBLIC_URL` → public (only for local dev connecting to staging)

Workers must use private URL exclusively.

---

## CUSTOM DOMAINS + SSL

```bash
# Production domain
railway domain add app.[domain].com --environment production

# Staging subdomain
railway domain add staging.[domain].com --environment staging
```

**DNS setup:**
Railway gives you a CNAME target like `web-production-abc.up.railway.app`.

Add to DNS provider:
```
CNAME   app         web-production-abc.up.railway.app
CNAME   staging     web-staging-xyz.up.railway.app
```

**SSL:** Automatic via Let's Encrypt. Provisions in ~60 seconds after DNS propagation.

**www redirect:** Handle in `next.config.ts`:
```ts
export default {
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.[domain].com' }],
        destination: 'https://app.[domain].com/:path*',
        permanent: true,
      },
    ]
  },
} satisfies NextConfig
```

---

## ROLLBACK PROCEDURE

**Auto-rollback triggers (Hawk watches for 15 min post-deploy):**
- Error rate >1% for 5 consecutive minutes
- Healthcheck returns non-200 for 3 consecutive checks
- P95 latency >2s for 5 consecutive minutes
- Sentry new-error spike (>10 new errors in 5 min)

**Manual rollback (Bolt):**
```bash
# List recent deployments
railway status --environment production

# Rollback to previous deployment
railway rollback --environment production

# Verify
curl https://app.[domain].com/api/health
```

**Post-rollback:**
1. Bolt marks deployment as rolled back in `.yash-state.json`
2. Vex triages what caused the rollback
3. Mira logs the incident to `memory/incidents/`
4. Fix branched from `main`, merged back, redeployed

**Rule:** Never rollback production without a public status update if users are affected.

---

## MULTI-ENV VARIABLE MANAGEMENT

**Source of truth:** `.env.example` in repo (Riko writes, never stale).

**Railway variables set via CLI or dashboard, NEVER committed.**

**Per-environment strategy:**

| Variable | production | staging | preview | Source |
|----------|-----------|---------|---------|--------|
| `NEXT_PUBLIC_APP_URL` | `https://app.domain.com` | `https://staging.domain.com` | `${{RAILWAY_PUBLIC_DOMAIN}}` | per-env |
| `NEXT_PUBLIC_APP_ENV` | `production` | `staging` | `preview` | per-env |
| `SUPABASE_URL` | prod project | staging project | staging project (branched) | per-env |
| `DODO_API_KEY` | live key | test key | test key | per-env |
| `SENTRY_DSN` | prod DSN | staging DSN | staging DSN | per-env |
| `RESEND_API_KEY` | prod key | test key | test key | per-env |
| `REDIS_URL` | `${{redis.REDIS_PRIVATE_URL}}` | same | same | Railway reference |

**Variable reference syntax:**
```
${{shared.VAR_NAME}}           # from project-wide shared vars
${{redis.REDIS_PRIVATE_URL}}   # from another service in same env
${{RAILWAY_PUBLIC_DOMAIN}}     # Railway built-in (per service)
```

**`.env.local` for local dev:** gitignored, copies from staging vars via `railway variables pull`.

```bash
# Pull staging vars to .env.local (for local dev)
railway variables pull --environment staging > .env.local
```

---

## HEALTHCHECK PROTOCOL

Every Stack A project **must** expose `/api/health`:

```ts
// app/api/health/route.ts
import { createClient } from '@/lib/supabase/server'
import { Redis } from '@upstash/redis'

export async function GET() {
  const checks: Record<string, 'ok' | 'fail'> = {
    web: 'ok',
    db: 'ok',
    redis: 'ok',
  }

  // DB check
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('_health').select('id').limit(1).maybeSingle()
    if (error && error.code !== 'PGRST116') checks.db = 'fail'
  } catch {
    checks.db = 'fail'
  }

  // Redis check (if enabled)
  if (process.env.REDIS_URL) {
    try {
      const redis = Redis.fromEnv()
      await redis.ping()
    } catch {
      checks.redis = 'fail'
    }
  }

  const allOk = Object.values(checks).every(v => v === 'ok')
  return Response.json(
    { status: allOk ? 'healthy' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  )
}
```

**DB `_health` table migration:**
```sql
create table if not exists _health (
  id int primary key default 1,
  checked_at timestamptz default now()
);
insert into _health (id) values (1) on conflict do nothing;
alter table _health enable row level security;
create policy "anyone can read health" on _health for select using (true);
```

---

## AGENT RESPONSIBILITIES

| Agent | Railway responsibility |
|-------|------------------------|
| **Yash** | Stack detection via `railway.toml`, orchestrate deploy gates |
| **Arya** | Service topology (web + workers), env var list, private networking plan |
| **Riko** | Write `railway.toml`, `next.config.ts` standalone output, `/api/health` route, `_health` migration |
| **Koda** | Workers code (BullMQ + IORedis with private URL), rate limiting with Upstash, caching strategy |
| **Vega** | Visual review against Railway preview URLs |
| **Luna** | E2E against preview URLs via `PLAYWRIGHT_BASE_URL` |
| **Sage** | Pre-deploy audit: RLS, env vars present in Railway, bundle size, security headers, CSP |
| **Bolt** | Railway CLI operations: `init`, `connect`, `variables set`, `domain add`, rollback |
| **Hawk** | Railway logs + Sentry + PostHog monitoring, auto-rollback triggers |
| **Vex** | Railway log inspection (`railway logs --service web`), debug deploy failures |

---

## HARD RULES

1. **No manual deploys** — everything auto-deploys from GitHub push
2. **No public internet between services** — use `REDIS_PRIVATE_URL`, internal DNS
3. **Every service has a healthcheck** — `web` via `/api/health`, workers via process liveness
4. **Env vars never in code** — Railway dashboard or CLI only
5. **Secrets never in `.env.example`** — placeholders only
6. **No production deploys without staging validation** — Sage + Luna must pass on staging first
7. **PR previews required** — every PR gets a Railway preview before merge
8. **Workers are separate services** — never run background jobs on the `web` service
9. **Rollback plan documented** — Bolt commits a `ROLLBACK.md` per project
10. **Custom domains via DNS CNAME** — never proxy through a third party (Cloudflare exception allowed for DDoS protection, but use DNS-only mode)

---

*(Written by Mira — 2026-04-10 Next.js + Railway migration. Agents load this alongside `stacks/saas-nextjs-supabase-railway.md`.)*
