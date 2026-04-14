---
name: Boldteq SaaS Starter Template
description: Master spec for boldteq-saas-starter GitHub template repo. Riko clones this for every new Stack A build. Target clone-to-dev-server time < 10 minutes.
type: starter-spec
stack: A
status: SPEC (build next session)
created: 2026-04-11
---

# Boldteq SaaS Starter — Master Spec

**Location:** `github.com/yashbaldha/boldteq-saas-starter` (GitHub Template repo)
**Goal:** Riko clicks "Use this template" → fills 4 env vars → runs `pnpm dev` → working SaaS with auth + billing + landing + dashboard in under 10 minutes.

**Why this exists:** Audit found scaffold time is Boldteq's #1 velocity bottleneck. Every new project was repeating the same 2-hour boilerplate (Supabase project, Railway services, auth wiring, Dodo webhooks, env vars, shadcn init, folder structure, landing page, dashboard shell). This starter eliminates that work.

---

## 1. Stack (locked to Stack A)

| Layer | Tech | Version |
|-------|------|---------|
| Framework | Next.js | 16.2.3 (App Router) |
| Runtime | React | 19 |
| Language | TypeScript | strict mode |
| Package manager | pnpm | 9 |
| Node | 20 LTS | |
| Styling | Tailwind | 4 |
| Components | shadcn/ui | latest |
| Database | Supabase (Postgres + Auth + Storage) | |
| SSR auth | @supabase/ssr | latest |
| Hosting | Railway | |
| Billing | Dodo Payments | |
| Email | Resend + React Email | |
| Errors | Sentry | |
| Analytics | PostHog | |
| Logs | pino | |
| Forms | react-hook-form + zod | |
| State | zustand (client) + Supabase RLS (server) | |
| Icons | lucide-react | |
| Fonts | Geist (via next/font) | |

**Forbidden:** Vercel, Stripe, Prisma, NextAuth, Pages Router, `@supabase/auth-helpers-nextjs`, npm/yarn, CSS modules, styled-components, `any` types.

---

## 2. Folder Structure

```
boldteq-saas-starter/
├── .env.example                     # All required env vars documented
├── .env.local                       # gitignored
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml                   # lint + typecheck + test + build on PR
│       └── deps.yml                 # weekly dep update PR
├── .vscode/
│   └── settings.json                # format-on-save + eslint
├── README.md                        # How to spin up in <10 min
├── next.config.ts
├── tsconfig.json                    # strict: true, paths: @/*
├── tailwind.config.ts               # design tokens
├── postcss.config.mjs
├── components.json                  # shadcn
├── package.json
├── pnpm-lock.yaml
├── railway.json                     # Railway service config (web + worker + redis)
├── middleware.ts                    # Supabase session refresh + protected routes
├── app/
│   ├── layout.tsx                   # Root layout with providers
│   ├── globals.css                  # Tailwind + CSS vars for design tokens
│   ├── not-found.tsx
│   ├── error.tsx
│   ├── loading.tsx
│   ├── page.tsx                     # Landing page (hero + features + pricing + footer)
│   ├── (marketing)/
│   │   ├── pricing/page.tsx
│   │   ├── about/page.tsx
│   │   ├── privacy/page.tsx
│   │   └── terms/page.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx           # email + magic link + Google
│   │   ├── signup/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── verify-email/page.tsx
│   │   └── callback/route.ts        # OAuth + magic link callback
│   ├── (app)/
│   │   ├── layout.tsx               # Protected shell (sidebar + topbar)
│   │   ├── dashboard/page.tsx       # Post-auth home with empty state
│   │   ├── settings/
│   │   │   ├── page.tsx             # Profile
│   │   │   ├── billing/page.tsx     # Subscription + invoices
│   │   │   ├── security/page.tsx    # Password + 2FA + sessions
│   │   │   └── notifications/page.tsx
│   │   └── onboarding/page.tsx      # First-run flow
│   ├── api/
│   │   ├── health/route.ts          # Railway healthcheck
│   │   ├── webhooks/
│   │   │   └── dodo/route.ts        # Signed webhook handler
│   │   └── billing/
│   │       ├── checkout/route.ts    # Create Dodo checkout session
│   │       └── portal/route.ts      # Customer portal redirect
│   └── sitemap.ts                   # Dynamic sitemap with Supabase
├── components/
│   ├── ui/                          # shadcn primitives
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── topbar.tsx
│   │   ├── user-menu.tsx
│   │   └── breadcrumbs.tsx
│   ├── auth/
│   │   ├── login-form.tsx
│   │   ├── signup-form.tsx
│   │   └── oauth-buttons.tsx
│   ├── billing/
│   │   ├── pricing-table.tsx
│   │   ├── subscription-card.tsx
│   │   └── upgrade-dialog.tsx
│   ├── marketing/
│   │   ├── hero.tsx
│   │   ├── features.tsx
│   │   ├── pricing.tsx
│   │   ├── testimonials.tsx
│   │   ├── cta.tsx
│   │   └── footer.tsx
│   └── common/
│       ├── empty-state.tsx
│       ├── error-boundary.tsx
│       ├── loading-skeleton.tsx
│       └── confirm-dialog.tsx
├── lib/
│   ├── supabase/
│   │   ├── server.ts                # createServerClient from @supabase/ssr
│   │   ├── client.ts                # browser client
│   │   ├── middleware.ts            # session refresh helper
│   │   └── types.ts                 # generated from supabase gen types
│   ├── dodo/
│   │   ├── client.ts                # Dodo SDK wrapper
│   │   ├── webhooks.ts              # Signature verification
│   │   └── plans.ts                 # Plan config (Free/Pro/Team)
│   ├── analytics/
│   │   ├── server.ts                # posthog-node
│   │   ├── client.ts                # posthog-js
│   │   └── events.ts                # Event naming contract
│   ├── email/
│   │   ├── client.ts                # Resend
│   │   └── templates/               # React Email components
│   │       ├── welcome.tsx
│   │       ├── magic-link.tsx
│   │       ├── payment-failed.tsx
│   │       └── subscription-confirmed.tsx
│   ├── logger.ts                    # pino with Railway-friendly format
│   ├── rate-limit.ts                # Upstash Redis + sliding window
│   ├── utils.ts                     # cn() etc
│   └── validations/
│       ├── auth.ts                  # zod schemas
│       └── billing.ts
├── hooks/
│   ├── use-user.ts                  # Current user + workspace
│   ├── use-subscription.ts          # Current plan + usage
│   └── use-toast.ts
├── workers/                          # Railway worker service (BullMQ optional)
│   └── README.md                    # Opt-in via pnpm add @boldteq/workers
├── supabase/
│   ├── migrations/
│   │   ├── 20260411000000_initial_schema.sql
│   │   ├── 20260411000001_rls_policies.sql
│   │   ├── 20260411000002_billing_tables.sql
│   │   └── 20260411000003_audit_log.sql
│   ├── seed.sql                     # Dev fixtures
│   └── config.toml
├── scripts/
│   ├── init.sh                      # One-shot setup: creates Supabase + Railway + env
│   ├── generate-types.sh            # supabase gen types typescript
│   └── smoke-test.sh                # curl health + test auth + test checkout
├── tests/
│   ├── e2e/
│   │   ├── auth.spec.ts             # Playwright: signup → verify → login
│   │   └── billing.spec.ts          # Playwright: checkout → webhook → dashboard
│   ├── unit/
│   │   └── lib/                     # Vitest for lib/ files
│   └── setup.ts                     # MSW + Supabase test client
├── playwright.config.ts
├── vitest.config.ts
└── eslint.config.mjs
```

---

## 3. Env Vars (.env.example)

```bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Required for every environment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="My SaaS"

# Supabase (from https://supabase.com/dashboard/project/_/settings/api)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=             # Server only, never expose

# Dodo Payments (from https://app.dodopayments.com/developer/api-keys)
DODO_API_KEY=                          # Server only, never expose
DODO_PAYMENTS_WEBHOOK_KEY=             # For verifying webhook signatures
DODO_PRO_PRODUCT_ID=                   # Dodo product ID for Pro tier
DODO_TEAM_PRODUCT_ID=                  # Dodo product ID for Team tier

# Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@example.com

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=                     # For source map upload
SENTRY_ORG=
SENTRY_PROJECT=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=                       # Server-side tracking

# Redis (Upstash or Railway Redis)
REDIS_URL=                             # Railway: ${{redis.REDIS_PRIVATE_URL}}

# Optional
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

---

## 4. Initial Database Schema (supabase/migrations/20260411000000_initial_schema.sql)

```sql
-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Users table (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Subscriptions (Dodo-synced)
create type plan_tier as enum ('free', 'pro', 'team');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'unpaid');

create table public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dodo_subscription_id text unique,
  dodo_customer_id text,
  plan plan_tier not null default 'free',
  status subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);
create index subscriptions_dodo_id_idx on public.subscriptions(dodo_subscription_id);

-- Audit log (GDPR + security)
create table public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now() not null
);

create index audit_log_user_id_idx on public.audit_log(user_id);
create index audit_log_created_at_idx on public.audit_log(created_at desc);

-- Auto-create profile on signup
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  insert into public.subscriptions (user_id, plan, status, trial_ends_at)
  values (new.id, 'free', 'trialing', now() + interval '14 days');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger
create function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.update_updated_at();
```

## 5. RLS Policies (supabase/migrations/20260411000001_rls_policies.sql)

```sql
-- Enable RLS
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: users see/edit only own
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Subscriptions: users see only own, never edit (webhooks handle writes)
create policy "Users can view own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);
-- No insert/update/delete policies — service role only

-- Audit log: users see only own
create policy "Users can view own audit log"
  on public.audit_log for select using (auth.uid() = user_id);
-- No user writes — server role only
```

---

## 6. The 4 env vars to set to get dev running

Even though .env.example has many, only 4 are required for first local run:

1. `NEXT_PUBLIC_SUPABASE_URL`
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `SUPABASE_SERVICE_ROLE_KEY`
4. `RESEND_API_KEY` (optional if you disable email verification locally)

Dodo, Sentry, PostHog can be stubbed for first run. The `scripts/init.sh` prompts only for these 4.

---

## 7. scripts/init.sh (one-shot setup)

```bash
#!/bin/bash
set -e
echo "Boldteq SaaS Starter — init"

# 1. Prompt for project name
read -p "Project name (kebab-case): " PROJECT
sed -i '' "s/my-saas/$PROJECT/g" package.json README.md

# 2. Prompt for Supabase
read -p "Supabase URL: " SB_URL
read -p "Supabase Anon Key: " SB_ANON
read -p "Supabase Service Role Key: " SB_SR
cat > .env.local <<ENVEOF
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="$PROJECT"
NEXT_PUBLIC_SUPABASE_URL=$SB_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SB_ANON
SUPABASE_SERVICE_ROLE_KEY=$SB_SR
ENVEOF

# 3. Install deps
pnpm install

# 4. Push migrations
supabase link --project-ref $(echo $SB_URL | sed 's|.*://||;s|\..*||')
supabase db push

# 5. Generate types
supabase gen types typescript --local > lib/supabase/types.ts

# 6. Start dev
echo "Setup complete. Run: pnpm dev"
```

---

## 8. Riko's clone workflow (<10 min target)

1. Click "Use this template" on GitHub → `my-saas`
2. `git clone git@github.com:yashbaldha/my-saas.git`
3. `cd my-saas && ./scripts/init.sh` (prompts for 3 Supabase keys)
4. `pnpm dev` → localhost:3000 works with auth + landing + dashboard
5. Create Railway project → link to GitHub repo → auto-deploy
6. Add Dodo keys when ready to test billing

**Time budget:**
- Use template: 20s
- Clone: 30s
- Init script: 4 min (Supabase project creation is the slowest step)
- Dev server: 2 min (`pnpm install` + `next dev`)
- **Total: ~7 min to working app**

---

## 9. Landing page default (Quill already drafted)

Hero, Features (3-col), Pricing (3-tier cards with Dodo checkout CTA), Testimonials (placeholder), CTA, Footer. All using shadcn base components + Tailwind 4 tokens. Copy placeholders use "{{PROJECT_NAME}}" that init.sh replaces.

---

## 10. Handoff chain for using the starter

```
Scout → validates idea
Atlas → sizes market
Ledger → picks Pro $29 / Team $99 default (starter already has these wired)
Arya → writes scope doc + data model DIFF from starter base schema
Riko → clones starter, runs init.sh, applies Arya's schema diff, commits
Vega → customizes landing hero/colors/tokens per brand
Quill → rewrites landing copy per brand voice
Koda → builds product-specific features ON TOP of starter
Luna → tests run against starter's baseline + new features
Sage → reviews new code (starter is pre-vetted)
Bolt → pushes to Railway (starter includes railway.json)
Hawk → watches deploy
Echo → launches
```

---

## 11. Versioning + updates

- Starter repo follows semver: 1.0.0, 1.1.0, etc.
- When Stack A updates (Next 17, Tailwind 5), bump major version
- Projects built on starter track their `starter-version` in `package.json`
- Mira maintains a migration guide per major version bump

---

## 12. Build checklist (next session's work)

- [ ] Create github.com/yashbaldha/boldteq-saas-starter as empty template repo
- [ ] Scaffold folder structure (Riko)
- [ ] Write all route files (Koda: ~30 routes)
- [ ] Build shadcn components (Vega: ~20 components)
- [ ] Write initial schema + RLS (Arya)
- [ ] Wire Dodo checkout + webhooks (Koda)
- [ ] Write landing page with placeholder copy (Quill)
- [ ] Add Playwright + Vitest configs (Luna)
- [ ] Write init.sh script (Riko)
- [ ] Add railway.json + github workflows (Bolt)
- [ ] Test end-to-end clone → dev → deploy (Luna + Bolt)
- [ ] Document in README with 10-min walkthrough (Quill)
- [ ] Log v1.0.0 release (Mira)
