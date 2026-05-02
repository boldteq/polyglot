# Open-Source SaaS Production Patterns

**Purpose:** Validated patterns from 12 production open-source SaaS codebases (Cal.com, Dub.sh, Documenso, Plane, Twenty, Novu, Trigger.dev, Hoppscotch, Infisical, Formbricks, Unkey, Eraser).

**Rule:** These are not theoretical — every pattern comes from a real codebase shipping to real users.

---

## 12 Universal Patterns (Every Production SaaS Uses These)

### 1. Type-Safe Database Layer (Auto-Generated Types)
**Used by:** All 12 projects

```
Database schema → Auto-generated types → Frontend never out of sync

Prisma: `npx prisma generate` → types from schema.prisma
Supabase: `supabase gen types typescript` → types from PostgreSQL schema
GraphQL: `codegen` → types from .graphql files

RULE: Never hand-write database types. Generate from schema.
If types are manual, they WILL drift from reality.
```

### 2. API-First Architecture
**Used by:** All 12 projects

```
All data access goes through API layer:
  Frontend → API route → Database
  Background job → API route → Database
  Webhook → API route → Database

NEVER: Frontend → direct database query
WHY: API layer enforces auth, validation, rate limiting, logging uniformly.

For Supabase: supabase client IS the API (with RLS). But edge functions for business logic.
For Next.js: /api routes or server actions with auth middleware.
```

### 3. Multi-Tenancy (Workspace Scoping)
**Used by:** Cal.com, Dub.sh, Plane, Twenty, Novu, Formbricks, Infisical, Unkey

```sql
-- EVERY table has workspace_id or user_id
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  -- ... other columns
  created_at timestamptz DEFAULT now()
);

-- RLS enforces isolation
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON items
  USING (workspace_id = (SELECT current_workspace_id()));

-- RULE: No table without tenant scoping. Period.
```

### 4. Audit Logging (Immutable)
**Used by:** Cal.com, Infisical, Plane, Twenty, Novu

```sql
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,              -- who did it
  action text NOT NULL,                 -- 'create', 'update', 'delete'
  entity_type text NOT NULL,            -- 'user', 'item', 'settings'
  entity_id uuid NOT NULL,             -- which record
  changes jsonb,                       -- diff: {before: {...}, after: {...}}
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- NO FK constraints on actor_id (audit survives user deletion)
-- Table is INSERT-only (no updates, no deletes)
-- Index: (entity_type, entity_id, created_at)
```

### 5. Feature Flags (Server-Side)
**Used by:** Cal.com, Dub.sh, Plane, Novu, Twenty

```typescript
// Server evaluates flag based on user context
const flag = await getFeatureFlag('new_dashboard', {
  userId: user.id,
  plan: user.plan,
  percentRollout: 25, // 25% of users see it
})

// Frontend receives resolved value
{flag.enabled ? <NewDashboard /> : <LegacyDashboard />}

// Benefits:
// - Instant rollback (flip flag, no deploy)
// - Gradual rollout (start at 5%, increase to 100%)
// - Plan-gated features (Pro users see it first)
// - A/B testing (measure conversion per variant)
```

### 6. Background Jobs
**Used by:** Twenty, Trigger.dev, Novu, Cal.com, Documenso

```
Anything that takes > 500ms → background job:
  - Email sending
  - AI processing
  - File processing (PDF, CSV)
  - Webhook delivery
  - Data sync (calendar, CRM)
  - Report generation
  - Image/video processing

Pattern:
  API receives request → creates job in queue → returns immediately (202 Accepted)
  Worker picks up job → processes → updates status → sends webhook/notification

Queue options:
  - Supabase Edge Functions (for simple tasks)
  - BullMQ + Redis (for complex workflows)
  - Trigger.dev (for durable execution)
  - Inngest (for event-driven workflows)
```

### 7. Real-Time Updates
**Used by:** Plane, Twenty, Hoppscotch, Cal.com

```typescript
// Supabase Realtime
const channel = supabase.channel('room')
channel.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'items',
  filter: `workspace_id=eq.${workspaceId}`,
}, (payload) => {
  queryClient.invalidateQueries(['items'])
})
channel.subscribe()

// Use for: Live dashboards, collaborative editing, notifications
// DON'T use for: Static pages, settings, profiles (polling is fine)
```

### 8. Email Infrastructure
**Used by:** All 12 projects

```
Pattern:
  Event occurs → email queued → worker processes → sent via provider → delivery tracked

Template structure:
  - Welcome email (immediate on signup)
  - Action confirmation (you created X, you deleted Y)
  - Notification digest (daily/weekly summary)
  - Password reset (immediate, time-limited token)
  - Invite (teammate invited you)

Provider: Resend, Sendgrid, or AWS SES
Template engine: React Email (JSX → HTML email)

RULE: Every email has unsubscribe link. Every email logged for audit.
```

### 9. Webhook System
**Used by:** Novu, Trigger.dev, Cal.com, Dub.sh, Documenso, Formbricks

```typescript
// Outbound webhooks (notify external systems)
async function sendWebhook(event: string, data: any, endpoint: string) {
  const payload = { event, data, timestamp: new Date().toISOString() }
  const signature = hmacSign(payload, webhookSecret)

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10s timeout
      })
      if (res.ok) return { success: true }
    } catch (e) {
      await sleep(Math.pow(2, attempt) * 1000) // exponential backoff
    }
  }
  // Log failure after 3 attempts
  await logWebhookFailure(event, endpoint)
}
```

### 10. Onboarding (< 2 Minutes to Value)
**Used by:** All 12 projects (the successful ones)

```
PATTERN: Reduce friction, show value immediately

Cal.com: Signup → calendar link live in 30 seconds
Documenso: Signup → sign a demo document in 60 seconds
Plane: Signup → sample project pre-loaded, create first issue
Hoppscotch: No signup needed → start making API requests immediately
Formbricks: Install SDK → see live survey in 60 seconds

UNIVERSAL FORMULA:
  1. Signup: email + password (2 fields max)
  2. First screen: product working with demo/sample data
  3. First action: complete within 60 seconds
  4. Checklist: 3-5 items, first one auto-completed
  5. Progressive: reveal advanced features as user explores
```

### 11. Storage Separation Strategy
**Used by:** Dub.sh, Twenty, Hoppscotch, Cal.com

```
Operational DB (PostgreSQL/Supabase):
  - User data, settings, configurations
  - Fast reads/writes, RLS, ACID transactions
  - Keep tables lean (no large blobs)

Cache (Redis/Upstash):
  - Session data, rate limit counters
  - Hot data that's read 100x per write
  - TTL-based invalidation

Analytics DB (Clickhouse/Tinybird):
  - Event streams (clicks, views, actions)
  - Pre-aggregated metrics for dashboards
  - Columnar storage for fast aggregations

Object Storage (S3/Supabase Storage):
  - Files, PDFs, images, large payloads
  - Separate from operational DB
  - CDN for delivery
```

### 12. CI/CD Pipeline
**Used by:** All 12 projects

```yaml
# Standard pipeline (GitHub Actions)
on: [push, pull_request]

jobs:
  quality:
    steps:
      - npm ci
      - npm run lint          # ESLint
      - npm run type-check    # TypeScript strict
      - npm run test          # Vitest/Jest
      - npm run build         # Production build

  deploy:
    needs: quality
    if: github.ref == 'refs/heads/main'
    steps:
      - Run database migrations
      - Deploy to staging
      - Run smoke tests on staging
      - Deploy to production
      - Run smoke tests on production
      - Notify team (Slack/email)

# RULES:
# - Never skip type-check or lint
# - Run migrations BEFORE deploy (not during)
# - Smoke test AFTER deploy (verify it works)
# - Auto-rollback if smoke tests fail
```

---

## Architecture Decision Records (From Real Projects)

### When to Use Monorepo vs Polyrepo
```
MONOREPO (Cal.com, Twenty, Hoppscotch pattern):
  Use when: Multiple apps share types, components, utilities
  Tool: Turborepo or NX
  Structure: apps/ + packages/

SINGLE REPO (Most Supabase projects):
  Use when: Single app, small team, rapid iteration
  Tool: Just npm/pnpm
  Structure: src/ with flat organization

RULE: Start with single repo. Switch to monorepo when you have 2+ deployable apps.
```

### When to Use GraphQL vs REST
```
GraphQL (Twenty, Hoppscotch):
  Use when: Complex data relationships, multiple client types, real-time subscriptions
  Cost: Schema maintenance, resolver complexity

REST/Supabase (Cal.com, Dub.sh, Documenso):
  Use when: CRUD operations, simple data model, fast development
  Cost: Over/under-fetching, no built-in subscriptions

RULE: Default to REST/Supabase. Use GraphQL only when data relationships are complex (CRM, project management, social).
```

### When to Use Server Components vs Client Components
```
SERVER (data fetching, SEO, static content):
  - Page shells, layouts, navigation
  - Data fetching + initial render
  - SEO-critical content (landing pages, blog)

CLIENT (interactivity, real-time, forms):
  - Forms with validation
  - Real-time updates
  - Command palette, search
  - Drag and drop
  - Anything with useState/useEffect

RULE: Start server, add "use client" only when you need interactivity.
For Supabase/Vite projects: everything is client (no server components).
```
