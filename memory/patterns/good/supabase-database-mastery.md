# Supabase Database Mastery — Production Patterns

> **Loaded by:** Dato (primary), Koda (when building data features), Arya (schema design), Sage (DB audit), Vex (DB debugging)
> **Stack:** Supabase Postgres (managed), `@supabase/ssr` for Next.js, `@supabase/supabase-js` for client
> **Last updated:** 2026-04-13

---

## 1. MIGRATION SAFETY

### Naming Convention
```
supabase/migrations/YYYYMMDDHHMMSS_description.sql
```
Example: `20260413120000_add_projects_table.sql`

### Zero-Downtime Migration Rules

**SAFE (no lock, no downtime):**
```sql
-- Add nullable column
ALTER TABLE projects ADD COLUMN description text;

-- Add column with default (Postgres 11+ is instant)
ALTER TABLE projects ADD COLUMN status text NOT NULL DEFAULT 'active';

-- Create index concurrently (doesn't lock table)
CREATE INDEX CONCURRENTLY idx_projects_user_id ON projects(user_id);

-- Create new table
CREATE TABLE project_tags (...);

-- Add foreign key (NOT VALID skips validation of existing rows)
ALTER TABLE projects ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES auth.users(id) NOT VALID;
-- Then validate separately (lighter lock):
ALTER TABLE projects VALIDATE CONSTRAINT fk_user;
```

**DANGEROUS (locks table, causes downtime):**
```sql
-- ❌ Adding NOT NULL to existing column without default
ALTER TABLE projects ALTER COLUMN description SET NOT NULL;
-- ✅ SAFE alternative: Add check constraint
ALTER TABLE projects ADD CONSTRAINT projects_description_not_null
  CHECK (description IS NOT NULL) NOT VALID;
ALTER TABLE projects VALIDATE CONSTRAINT projects_description_not_null;

-- ❌ Renaming a column (breaks all queries referencing old name)
ALTER TABLE projects RENAME COLUMN name TO title;
-- ✅ SAFE alternative: Expand-migrate-contract pattern
-- 1. Add new column: ALTER TABLE projects ADD COLUMN title text;
-- 2. Backfill: UPDATE projects SET title = name WHERE title IS NULL;
-- 3. Switch app code to read/write title
-- 4. Drop old: ALTER TABLE projects DROP COLUMN name;

-- ❌ Changing column type
ALTER TABLE projects ALTER COLUMN price TYPE numeric;
-- ✅ SAFE alternative: New column + backfill + swap

-- ❌ CREATE INDEX without CONCURRENTLY
CREATE INDEX idx_projects_user ON projects(user_id);
-- ✅ Always: CREATE INDEX CONCURRENTLY
```

### Migration Rollback Strategy

Every migration file should have a corresponding rollback comment:
```sql
-- Migration: 20260413120000_add_projects_table.sql
-- Rollback: DROP TABLE IF EXISTS projects CASCADE;

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

If a migration fails mid-flight:
1. Check what was applied: `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;`
2. Manually fix the state or apply the rollback SQL
3. Never delete a migration file that's been applied — create a new migration to undo it

---

## 2. RLS (Row Level Security) — COMPLETE PATTERNS

### Pattern A: User-owned data
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Users see only their own projects
CREATE POLICY "users_select_own" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own" ON projects
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own" ON projects
  FOR DELETE USING (auth.uid() = user_id);
```

### Pattern B: Team/org-scoped data
```sql
-- Members of an org can see org data
CREATE POLICY "org_members_select" ON projects
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid()
    )
  );

-- Only admins can delete
CREATE POLICY "org_admins_delete" ON projects
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### Pattern C: Public read, authenticated write
```sql
CREATE POLICY "anyone_select" ON blog_posts
  FOR SELECT USING (published = true);

CREATE POLICY "authors_insert" ON blog_posts
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "authors_update" ON blog_posts
  FOR UPDATE USING (auth.uid() = author_id);
```

### Pattern D: Service role bypass (for webhooks, background jobs)
```sql
-- Service role bypasses RLS by default in Supabase
-- But if you WANT policies for service role:
CREATE POLICY "service_role_all" ON projects
  FOR ALL USING (auth.role() = 'service_role');
```
**In code:** Use `createClient(url, SERVICE_ROLE_KEY)` for webhook handlers and background jobs. NEVER expose service role key to the browser.

### RLS Performance Rules
```sql
-- ❌ SLOW: Subquery in every row check
CREATE POLICY "slow_policy" ON data
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM permissions WHERE ...)
  );

-- ✅ FAST: Use a security definer function + cache
CREATE OR REPLACE FUNCTION auth.user_org_ids()
RETURNS uuid[] AS $$
  SELECT COALESCE(
    array_agg(org_id),
    '{}'::uuid[]
  )
  FROM org_members
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "fast_org_policy" ON data
  FOR SELECT USING (org_id = ANY(auth.user_org_ids()));

-- Index to support the function
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
```

### RLS Testing
```sql
-- Test as a specific user
SET request.jwt.claims = '{"sub": "user-uuid-here", "role": "authenticated"}';
SET role = 'authenticated';

-- Should return only user's rows
SELECT * FROM projects;

-- Reset
RESET role;
RESET request.jwt.claims;
```

### RLS Audit Query (Sage runs this)
```sql
-- Find tables WITHOUT RLS
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename NOT IN (
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND rowsecurity = true
);
-- Result must be EMPTY or deployment is blocked
```

---

## 3. DATABASE TRIGGERS & FUNCTIONS

### Pattern: Auto-update `updated_at`
```sql
-- Reusable trigger function (create ONCE)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to any table
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```

### Pattern: Auto-create profile on signup
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at)
  VALUES (NEW.id, NEW.email, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Pattern: Audit trail trigger
```sql
-- Audit log table
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (only service role reads audit logs)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON audit_log
  FOR ALL USING (auth.role() = 'service_role');

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to any table that needs audit logging
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
```

### Pattern: Soft delete
```sql
-- Add soft delete columns
ALTER TABLE projects ADD COLUMN deleted_at timestamptz;
ALTER TABLE projects ADD COLUMN deleted_by uuid REFERENCES auth.users(id);

-- RLS policy excludes soft-deleted rows
CREATE POLICY "users_select_active" ON projects
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Soft delete function
CREATE OR REPLACE FUNCTION public.soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  NEW.deleted_at = now();
  NEW.deleted_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Instead of DELETE, UPDATE with trigger
-- App code: supabase.from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
```

---

## 4. INDEX STRATEGY

### When to Create Indexes
```sql
-- Rule: Index every column used in WHERE, JOIN, ORDER BY, or RLS policy

-- Foreign keys (ALWAYS index these — Postgres doesn't auto-index FKs)
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_org_id ON projects(org_id);

-- Commonly filtered columns
CREATE INDEX idx_projects_status ON projects(status);

-- Composite index for multi-column filters
CREATE INDEX idx_projects_user_status ON projects(user_id, status);

-- Partial index (only index rows that matter)
CREATE INDEX idx_projects_active ON projects(user_id)
  WHERE deleted_at IS NULL AND status = 'active';

-- GIN index for JSONB
CREATE INDEX idx_projects_metadata ON projects USING GIN (metadata);

-- GIN index for full-text search
ALTER TABLE projects ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))) STORED;
CREATE INDEX idx_projects_fts ON projects USING GIN (fts);

-- Trigram index for LIKE/ILIKE searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_projects_name_trgm ON projects USING GIN (name gin_trgm_ops);
```

### EXPLAIN ANALYZE — How to Read Query Plans
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM projects WHERE user_id = 'xxx' AND status = 'active';

-- GOOD: "Index Scan using idx_projects_user_status"
-- BAD: "Seq Scan on projects" → Missing index
-- BAD: "Bitmap Heap Scan" on large table → Index exists but too many rows match
-- BAD: "Sort" with high cost → Add index for ORDER BY column
```

### Index Maintenance
```sql
-- Check index usage (unused indexes waste write performance)
SELECT
  schemaname, tablename, indexname,
  idx_scan, idx_tup_read, idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0  -- Unused indexes
ORDER BY pg_relation_size(indexrelid) DESC;

-- Check table bloat
SELECT
  schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  n_dead_tup, n_live_tup,
  ROUND(n_dead_tup::numeric / GREATEST(n_live_tup, 1) * 100, 1) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

---

## 5. SUPABASE REALTIME SUBSCRIPTIONS

### Pattern: Subscribe to table changes (React)
```tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']

export function useRealtimeProjects(userId: string) {
  const [projects, setProjects] = useState<Project[]>([])
  const supabase = createClient()

  useEffect(() => {
    // Initial fetch
    supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (data) setProjects(data)
      })

    // Subscribe to changes
    const channel = supabase
      .channel('projects-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setProjects(prev => [...prev, payload.new as Project])
          } else if (payload.eventType === 'UPDATE') {
            setProjects(prev =>
              prev.map(p => p.id === (payload.new as Project).id ? payload.new as Project : p)
            )
          } else if (payload.eventType === 'DELETE') {
            setProjects(prev =>
              prev.filter(p => p.id !== (payload.old as Project).id)
            )
          }
        }
      )
      .subscribe()

    // CRITICAL: Cleanup on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return projects
}
```

### Realtime Rules
1. **Always clean up subscriptions** on component unmount (`removeChannel`)
2. **Use filters** (`filter: 'user_id=eq.xxx'`) to reduce payload — never subscribe to entire table
3. **RLS applies to Realtime** — users only receive changes they're authorized to see
4. **Enable Realtime per table** in Supabase Dashboard → Database → Replication
5. **Max channels:** ~100 per client connection. Pool carefully.
6. **Don't use Realtime for large datasets** — it sends full row payloads. For high-volume, use polling + React Query.

### Enable Realtime on a table
```sql
-- In migration file
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
```

---

## 6. SUPABASE EDGE FUNCTIONS

### When to Use Edge Functions vs API Routes
- **Edge Functions:** Low-latency global execution, Deno runtime, ~50ms cold start. Use for: lightweight webhooks, image transforms, geolocation-based logic.
- **Next.js API Routes (on Railway):** Full Node.js, access to BullMQ/Redis, no cold start. Use for: complex business logic, background jobs, AI inference, heavy computation.

**Default to API Routes.** Edge Functions only when latency from a specific region matters.

### Edge Function Structure
```
supabase/functions/
  my-function/
    index.ts        # Entry point
    _shared/        # Shared code between functions
      cors.ts
      supabase.ts
```

### Edge Function Template
```ts
// supabase/functions/my-function/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .limit(10)

    if (error) throw error

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

### Deploy Edge Functions
```bash
supabase functions deploy my-function --project-ref $PROJECT_REF
```

---

## 7. SCHEMA DESIGN PATTERNS

### Standard Table Template
```sql
CREATE TABLE public.{table_name} (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ownership
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- OR for org-scoped:
  -- org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- data columns here

  -- timestamps (EVERY table gets these)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS (EVERY table)
ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY;

-- Policies (minimum: SELECT + INSERT for owner)
CREATE POLICY "{table}_select" ON public.{table_name}
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "{table}_insert" ON public.{table_name}
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "{table}_update" ON public.{table_name}
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "{table}_delete" ON public.{table_name}
  FOR DELETE USING (auth.uid() = user_id);

-- Index foreign keys
CREATE INDEX idx_{table}_user_id ON public.{table_name}(user_id);

-- Auto-update timestamp trigger
CREATE TRIGGER set_{table}_updated_at
  BEFORE UPDATE ON public.{table_name}
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```

### Enum Pattern (use CHECK constraint, not Postgres ENUM)
```sql
-- ❌ AVOID: Postgres ENUM (can't remove values, migration nightmare)
CREATE TYPE project_status AS ENUM ('active', 'archived');

-- ✅ USE: CHECK constraint (easy to modify)
CREATE TABLE projects (
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted'))
);
```

### JSONB for Flexible Data
```sql
-- Use JSONB for user preferences, metadata, settings
ALTER TABLE profiles ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Query JSONB
SELECT * FROM profiles WHERE preferences->>'theme' = 'dark';
SELECT * FROM profiles WHERE preferences @> '{"notifications": true}';

-- Index JSONB (GIN for containment queries)
CREATE INDEX idx_profiles_preferences ON profiles USING GIN (preferences);
```

### Subscription/Billing Tables
```sql
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('free', 'pro', 'team')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
  external_id text, -- Dodo payment ID or Shopify subscription ID
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own_sub" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- Only service role can INSERT/UPDATE (from webhook handler)
CREATE POLICY "service_manage_subs" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');
```

---

## 8. BACKUP & DISASTER RECOVERY

### Supabase Managed Backups
- **Pro plan:** Daily backups, 7-day retention
- **Team plan:** Daily backups, 14-day retention
- **Enterprise:** Point-in-time recovery (PITR), 30-day retention

### Manual Backup (before risky migrations)
```bash
# Dump full database
pg_dump $DATABASE_URL --format=custom --no-owner > backup_$(date +%Y%m%d_%H%M%S).dump

# Dump specific table
pg_dump $DATABASE_URL --format=custom --table=public.projects > projects_backup.dump

# Restore from backup
pg_restore --dbname=$DATABASE_URL --no-owner --clean backup.dump
```

### Pre-Migration Safety Script
```bash
#!/usr/bin/env bash
set -euo pipefail
# Run BEFORE any risky migration

echo "Creating pre-migration backup..."
pg_dump "$DATABASE_URL" --format=custom --no-owner > "backup_pre_migration_$(date +%Y%m%d_%H%M%S).dump"
echo "Backup complete: $(ls -lh backup_pre_migration_*.dump | tail -1)"

echo "Checking current migration state..."
psql "$DATABASE_URL" -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;"

echo "Ready to apply migration. Backup is saved."
```

---

## 9. TYPE GENERATION WORKFLOW

```bash
# From local Supabase (development)
pnpm supabase gen types typescript --local > lib/supabase/types.ts

# From remote Supabase (staging/production)
pnpm supabase gen types typescript --project-ref $SUPABASE_PROJECT_REF > lib/supabase/types.ts

# Verify types compile
pnpm tsc --noEmit
```

### Using Generated Types
```ts
import type { Database } from '@/lib/supabase/types'

// Table row type
type Project = Database['public']['Tables']['projects']['Row']

// Insert type (omits auto-generated fields)
type ProjectInsert = Database['public']['Tables']['projects']['Insert']

// Update type (all fields optional)
type ProjectUpdate = Database['public']['Tables']['projects']['Update']

// Use in Supabase queries for type safety
const { data } = await supabase
  .from('projects')
  .select('id, name, status')
  .returns<Pick<Project, 'id' | 'name' | 'status'>[]>()
```

**Rule: Regenerate types after EVERY schema change. If TypeScript complains about a column that exists in the database, the types file is stale.**

---

## 10. CONNECTION MANAGEMENT

### Supabase Connection Pooling
Supabase uses PgBouncer (Supavisor) for connection pooling:
- **Port 5432:** Direct connection (limited connections, use for migrations only)
- **Port 6543:** Pooled connection (use for application queries)

```
# .env
# For application (pooled)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# For migrations (direct)
DIRECT_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

### Connection Limits
- **Free:** 60 direct + unlimited pooled
- **Pro:** 100 direct + unlimited pooled
- **Team:** 200 direct + unlimited pooled

If hitting limits: reduce connection pool in application code, use pooled connection URL, close connections after use.

---

## 11. DEBUGGING DATABASE ISSUES

### Empty Query Results (90% of the time: RLS)
```sql
-- Check if RLS is blocking
SET request.jwt.claims = '{"sub": "user-uuid"}';
SET role = 'authenticated';
SELECT * FROM projects; -- Does this return rows?
RESET role;
RESET request.jwt.claims;
```

### Slow Queries
```sql
-- Find slow queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check missing indexes
SELECT
  relname AS table,
  seq_scan, seq_tup_read,
  idx_scan, idx_tup_fetch,
  CASE WHEN seq_scan > 0
    THEN ROUND(seq_tup_read::numeric / seq_scan, 0)
    ELSE 0
  END AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_tup_read DESC;
-- High seq_tup_read + low idx_scan = missing index
```

### Lock Contention
```sql
-- Check active locks
SELECT pid, mode, relation::regclass, granted
FROM pg_locks
WHERE NOT granted;

-- Kill a blocking query (use with caution)
SELECT pg_cancel_backend(pid);
-- Or force: SELECT pg_terminate_backend(pid);
```

### Database Size Monitoring
```sql
-- Total database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Size per table
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS total,
  pg_size_pretty(pg_relation_size('public.' || tablename)) AS data,
  pg_size_pretty(pg_indexes_size('public.' || tablename)) AS indexes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;
```

---

*(Supabase Database Mastery — production patterns for Boldteq. Updated 2026-04-13.)*
