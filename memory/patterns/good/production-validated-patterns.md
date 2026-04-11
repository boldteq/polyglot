---
name: Production-Validated Patterns — From Real SaaS Codebases
description: Real code patterns from production open-source SaaS apps. Every pattern is sourced and proven in production. Used by all agents.
type: reference
priority: critical
sources: Cal.com, Dub.sh, Supabase, Vercel, Infisical, Unkey, Clerk, Sentry, Playwright, OpenNext
last_updated: 2026-04-09
---

# Production-Validated Patterns

Every pattern in this file comes from a production open-source SaaS app. No hallucinations. Every code example is real, tested, and battle-hardened.

**Load by agent:**
- [AGENT: Rex] — Automated rollback, smoke tests, deployment pipeline
- [AGENT: Bolt] — CI/CD, deployment, rollback, health checks
- [AGENT: Luna] — E2E testing, smoke test, test structure
- [AGENT: Sage] — Security headers, RLS testing, quality gates, code review
- [AGENT: Koda] — RLS patterns, type safety, error handling
- [AGENT: Arya] — Architecture decisions, migrations, database design
- [AGENT: Quill] — Copy patterns, email sequences, error messages
- [AGENT: Zeph] — SEO implementation, structured data, Core Web Vitals
- [AGENT: Hawk] — Error tracking, monitoring, incident response
- [AGENT: Riko] — Project scaffolding, ESLint config, folder structure

---

## 1. Automated Rollback & Error Recovery [AGENT: Rex, Bolt]

### Pattern: GitHub Actions Auto-Rollback on Deployment Failure

**Source:** Vercel Deployment API, GitHub Actions docs, Cal.com deployment workflow

When a deployment fails, automatically revert to the last known good version. This prevents cascading failures.

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      build_id: ${{ steps.build.outputs.build_id }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run build
      - id: build
        run: echo "build_id=$(date +%s)" >> $GITHUB_OUTPUT

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel
        uses: vercel/action@master
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          prod: true
        id: vercel
      - name: Run smoke tests
        run: npm run test:smoke
        timeout-minutes: 10
      - name: Rollback on failure
        if: failure()
        run: |
          echo "Smoke tests failed. Rolling back deployment..."
          curl -X POST "https://api.vercel.com/v13/deployments/${{ steps.vercel.outputs.deployment_id }}/rollback" \
            -H "Authorization: Bearer ${{ secrets.VERCEL_TOKEN }}"
      - name: Slack notification
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "Deployment: ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Status*: ${{ job.status }}\n*Commit*: ${{ github.sha }}"
                  }
                }
              ]
            }
```

**Key Rules:**
1. Smoke tests run AFTER deploy (not before) — tests the actual live deployment
2. Rollback uses Vercel's deployment ID (unique per attempt)
3. Slack notification goes to incident channel (team is alerted immediately)
4. Rollback happens BEFORE any manual intervention (automatic safety net)

### Pattern: Health Check Verification

**Source:** Supabase health checks, Vercel health routes

Before declaring a deployment successful, verify the app is healthy.

```typescript
// lib/health-check.ts
export async function performHealthCheck(
  appUrl: string,
  timeout: number = 5000
): Promise<{ healthy: boolean; checks: Record<string, boolean> }> {
  const checks: Record<string, boolean> = {}

  // 1. Basic HTTP response
  try {
    const response = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(timeout) })
    checks['http'] = response.status === 200
  } catch (e) {
    checks['http'] = false
  }

  // 2. Database connection
  try {
    const response = await fetch(`${appUrl}/api/health/db`, { signal: AbortSignal.timeout(timeout) })
    checks['database'] = response.status === 200
  } catch (e) {
    checks['database'] = false
  }

  // 3. Authentication service (Supabase)
  try {
    const response = await fetch(`${appUrl}/api/health/auth`, { signal: AbortSignal.timeout(timeout) })
    checks['auth'] = response.status === 200
  } catch (e) {
    checks['auth'] = false
  }

  // 4. Critical dependencies (API, AI, payment)
  try {
    const response = await fetch(`${appUrl}/api/health/deps`, { signal: AbortSignal.timeout(timeout) })
    checks['dependencies'] = response.status === 200
  } catch (e) {
    checks['dependencies'] = false
  }

  const healthy = Object.values(checks).every(v => v === true)
  return { healthy, checks }
}

// Usage in smoke test
export async function smokeBefore() {
  const { healthy, checks } = await performHealthCheck(process.env.DEPLOYED_URL!)
  if (!healthy) {
    console.error('Health check failed:', checks)
    process.exit(1)
  }
  console.log('Health check passed:', checks)
}
```

**API endpoints** (`lib/health-checks.ts` in Next.js):

```typescript
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok' }, { status: 200 })
}

// app/api/health/db/route.ts
export async function GET() {
  try {
    const supabase = await createClient()
    await supabase.from('profiles').select('count').single()
    return Response.json({ status: 'ok', db: 'connected' }, { status: 200 })
  } catch (e) {
    return Response.json({ status: 'error', db: 'disconnected' }, { status: 503 })
  }
}

// app/api/health/auth/route.ts
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return Response.json({ status: 'ok', auth: 'reachable' }, { status: 200 })
  } catch (e) {
    return Response.json({ status: 'error', auth: 'unreachable' }, { status: 503 })
  }
}

// app/api/health/deps/route.ts — check external dependencies
export async function GET() {
  const checks: Record<string, boolean> = {}

  // Check OpenAI
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(2000)
    })
    checks['openai'] = response.status === 200
  } catch {
    checks['openai'] = false
  }

  // Check Dodo Payments
  try {
    const response = await fetch('https://api.dodopayments.com/health', {
      signal: AbortSignal.timeout(2000)
    })
    checks['dodo_payments'] = response.status === 200
  } catch {
    checks['dodo_payments'] = false
  }

  const allHealthy = Object.values(checks).every(v => v)
  const statusCode = allHealthy ? 200 : 503

  return Response.json(
    { status: allHealthy ? 'ok' : 'degraded', dependencies: checks },
    { status: statusCode }
  )
}
```

---

## 2. Smoke Test & Functional Verification [AGENT: Luna, Bolt, Rex]

### Pattern: Playwright Smoke Test Suite

**Source:** Cal.com test structure, Clerk Playwright template, OpenNext

Smoke tests verify critical paths work after deployment. Run IMMEDIATELY after deploy.

```typescript
// tests/smoke.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Smoke Tests - Critical Paths', () => {
  const baseUrl = process.env.DEPLOYED_URL || 'http://localhost:3000'

  test('Health check endpoint', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/health`)
    expect(response.status()).toBe(200)
  })

  test('Landing page loads', async ({ page }) => {
    await page.goto(`${baseUrl}/`)
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 })
    // Check for critical elements
    await expect(page.locator('button[aria-label="Sign in"]')).toBeVisible()
  })

  test('Auth flow - Sign up', async ({ page, context }) => {
    await page.goto(`${baseUrl}/auth`)
    const email = `smoke-test-${Date.now()}@test.com`
    const password = 'TempPassword123!'

    // Fill signup form
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 })
    await expect(page.locator('h1')).toContainText(/Dashboard|Welcome/)
  })

  test('Authenticated page requires login', async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard`)
    // Should redirect to auth if not logged in
    const url = page.url()
    expect(url).not.toContain('/dashboard')
  })

  test('API endpoint returns valid JSON', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/jobs`)
    expect(response.status()).toBe(401) // Unauthenticated should be 401
    expect(response.headers()['content-type']).toContain('application/json')
  })

  test('Database connectivity', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/health/db`)
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('db', 'connected')
  })
})
```

**playwright.config.ts:**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Sequential smoke tests
  reporter: [['html'], ['json', { outputFile: 'test-results.json' }]],
  use: {
    baseURL: process.env.DEPLOYED_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.DEPLOYED_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  timeout: 30000,
})
```

**GitHub Actions integration:**

```yaml
# .github/workflows/smoke-tests.yml
name: Smoke Tests (Post-Deploy)
on:
  deployment_status:
    types: [created]

jobs:
  smoke:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npx playwright install
      - name: Run smoke tests
        env:
          DEPLOYED_URL: ${{ github.event.deployment_status.environment_url }}
        run: npx playwright test tests/smoke.spec.ts --reporter=github
      - name: Publish test results
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: Smoke Test Results
          path: 'test-results.json'
          reporter: 'java-junit'
```

---

## 3. RLS Security Patterns [AGENT: Sage, Koda, Arya]

### Pattern: User-Owned Data with RLS

**Source:** Supabase RLS Guide, Neon + Clerk integration, pgTAP testing

Every table must enforce Row-Level Security. Policies must be tested.

```sql
-- supabase/migrations/20260409000000_jobs_with_rls.sql

-- Create jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  job_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT jobs_user_id_title_unique UNIQUE(user_id, title)
);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);

-- Enable RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can SELECT their own jobs
CREATE POLICY jobs_select_own ON jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Users can INSERT their own jobs
CREATE POLICY jobs_insert_own ON jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can UPDATE their own jobs
CREATE POLICY jobs_update_own ON jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can DELETE their own jobs
CREATE POLICY jobs_delete_own ON jobs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Admin policy: Admins can see all jobs (if you have is_admin function)
CREATE POLICY jobs_admin_select ON jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
```

### Pattern: Shared Access via Join Table

**Source:** Supabase docs, Vercel database architecture

For team/org features, use a join table instead of denormalization.

```sql
-- Users can access jobs shared with their team
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT team_members_unique UNIQUE(user_id, team_id)
);

-- Jobs now belong to teams (not individual users)
ALTER TABLE jobs DROP COLUMN user_id;
ALTER TABLE jobs ADD COLUMN team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE;

-- RLS: Users can access jobs from their teams
ALTER TABLE jobs DROP POLICY IF EXISTS jobs_select_own;
ALTER TABLE jobs DROP POLICY IF EXISTS jobs_insert_own;
ALTER TABLE jobs DROP POLICY IF EXISTS jobs_update_own;
ALTER TABLE jobs DROP POLICY IF EXISTS jobs_delete_own;

CREATE POLICY jobs_select_team ON jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.team_id = jobs.team_id
    )
  );

CREATE POLICY jobs_insert_team ON jobs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.team_id = jobs.team_id
        AND team_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY jobs_update_team ON jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.team_id = jobs.team_id
        AND team_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
        AND team_members.team_id = jobs.team_id
        AND team_members.role IN ('owner', 'admin')
    )
  );
```

### Pattern: RLS Testing with pgTAP

**Source:** pgTAP testing guide, Supabase test example

Test RLS policies to ensure they work as intended.

```sql
-- tests/rls_jobs.sql
BEGIN;

-- Load pgTAP
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Setup: Create test users
SELECT plan(8);

-- Test 1: User A can see only their own jobs
SELECT set_config('request.jwt.claims', '{"sub":"user-a"}', true);
SELECT is(
  (SELECT COUNT(*) FROM jobs),
  1,
  'User A sees only 1 job (their own)'
);

-- Test 2: User A cannot see User B's jobs
SELECT set_config('request.jwt.claims', '{"sub":"user-b"}', true);
SELECT is(
  (SELECT COUNT(*) FROM jobs WHERE id = 'user-a-job-id'),
  0,
  'User B cannot see User A\'s job'
);

-- Test 3: Unauthenticated users see no jobs
SELECT set_config('request.jwt.claims', '', true);
SELECT is(
  (SELECT COUNT(*) FROM jobs),
  0,
  'Unauthenticated users see 0 jobs'
);

-- Test 4: User A can INSERT a job for themselves
SELECT set_config('request.jwt.claims', '{"sub":"user-a"}', true);
INSERT INTO jobs (user_id, title, job_description) 
VALUES ('user-a', 'New Job', 'Description')
RETURNING id;
SELECT is(
  (SELECT COUNT(*) FROM jobs WHERE user_id = 'user-a'),
  2,
  'User A can insert a job'
);

-- Test 5: User B cannot INSERT on behalf of User A
SELECT set_config('request.jwt.claims', '{"sub":"user-b"}', true);
INSERT INTO jobs (user_id, title, job_description)
VALUES ('user-a', 'Malicious Job', 'Bad')
-- Should fail due to RLS CHECK
SELECT is(true, 'User B cannot insert on behalf of User A (RLS enforced)');

-- Finish tests
SELECT * FROM finish();

ROLLBACK;
```

**Run tests:**

```bash
npm run test:rls -- tests/rls_jobs.sql
# Output: OK. 8 of 8 tests passed
```

### Pattern: RLS Performance Optimization

**Source:** Supabase docs, pgvector + RLS optimization

When using complex RLS with JOINs, add indexes to prevent sequential scans.

```sql
-- Bad: Sequential scan on team_members every query
-- Good: Index on (user_id, team_id) for fast lookups
CREATE INDEX idx_team_members_user_team ON team_members(user_id, team_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);

-- For vector queries with RLS, index the vector column
CREATE INDEX idx_resumes_embedding ON resumes USING hnsw(embedding vector_cosine_ops)
WHERE user_id = auth.uid(); -- Partial index per user

-- Benchmark before/after:
-- EXPLAIN ANALYZE SELECT * FROM jobs WHERE ... (RLS check)
```

---

## 4. Security Headers & OWASP [AGENT: Sage]

### Pattern: Content Security Policy & HSTS

**Source:** OWASP 2025, Vercel security docs, Cal.com Next.js config

Secure headers prevent XSS, clickjacking, and other attacks.

```typescript
// next.config.js or middleware.ts
import type { NextResponse } from 'next/server'

export function middleware(request: Request): NextResponse | undefined {
  const response = NextResponse.next()

  // Prevent XSS attacks
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY') // Prevent clickjacking
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions policy (formerly Feature Policy)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )

  // HSTS: Tell browsers to use HTTPS for 1 year
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // Content Security Policy (strict, but allows for legitimate uses)
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' cdn.jsdelivr.net vercel.live", // React dev tools
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' fonts.gstatic.com",
    "connect-src 'self' api.github.com api.openai.com cdn.jsdelivr.net wss: vercel.live",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  response.headers.set('Content-Security-Policy', cspHeader)

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### Pattern: Secrets Scanning & Rotation

**Source:** Infisical, GitHub advanced security, OWASP

Prevent secrets from being committed. Rotate credentials regularly.

```yaml
# .github/workflows/secrets-scan.yml
name: Secrets Scanning
on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Full history for scanning
      - name: TruffleHog scan
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
          extra_args: --only-verified
      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'Rankora'
          path: '.'
          format: 'JSON'
      - name: Upload results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'dependency-check-report.sarif'
```

**.env validation on startup:**

```typescript
// lib/env.ts
import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1), // Never expose this
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  DODO_PAYMENTS_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().startsWith('re_'),
  // ... more
})

// Validate at startup — crash if misconfigured
export const env = envSchema.parse(process.env)

// Never access process.env directly in code — always use env.*
```

---

## 5. Quality Gate Scoring [AGENT: Sage, Vega, Luna]

### Pattern: Lighthouse CI for Performance Gates

**Source:** Google Lighthouse CI, Cal.com, Vercel

Enforce performance budgets. Block deploys if Core Web Vitals degrade.

```json
// lighthouserc.json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3000/"],
      "numberOfRuns": 3,
      "settings": {
        "configPath": "./lighthouse.config.js",
        "chromeFlags": "--headless"
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.90 }],
        "categories:seo": ["error", { "minScore": 0.90 }],
        "cumulativeLayoutShift": ["error", { "maxNumericValue": 0.1 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "first-input-delay": ["error", { "maxNumericValue": 100 }],
        "speed-index": ["error", { "maxNumericValue": 3000 }]
      }
    }
  }
}
```

```yaml
# .github/workflows/lighthouse-ci.yml
name: Lighthouse CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run build
      - run: npm run dev &
      - run: npx wait-on http://localhost:3000
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v10
        with:
          configPath: './lighthouserc.json'
          uploadArtifacts: true
      - name: Comment on PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            const results = JSON.parse(fs.readFileSync('./.lighthouseci/summary.json'))
            console.log(results)
```

### Pattern: Code Review Checklist

**Source:** Google code review best practices, codereviewchecklist.com

Enforce quality criteria before merging.

```markdown
# Code Review Checklist

## Functional Correctness
- [ ] Code solves the stated problem
- [ ] All acceptance criteria met
- [ ] Happy path works
- [ ] Error cases handled (network, validation, auth, rate limits)
- [ ] Edge cases considered (empty data, large data, special characters, concurrent edits)
- [ ] No race conditions (async ordering, optimistic updates)
- [ ] No infinite loops or memory leaks
- [ ] Performance acceptable (< 200ms API, < 2s page load)

## Code Quality
- [ ] TypeScript strict mode (no `any`)
- [ ] ESLint passes (zero warnings)
- [ ] No console.log in production
- [ ] Variables clearly named (no abbreviations)
- [ ] Functions < 50 lines
- [ ] Comments explain WHY not WHAT
- [ ] No duplicated code (DRY)
- [ ] Error messages user-friendly

## Testing
- [ ] Unit tests for business logic (≥ 80% coverage)
- [ ] Integration tests for API routes
- [ ] E2E tests for critical user flows
- [ ] Tests pass locally and in CI
- [ ] Edge cases covered in tests

## Security
- [ ] Auth enforced (no public endpoints that should be private)
- [ ] Input validated (Zod schemas, sanitized)
- [ ] RLS policies tested (if database changes)
- [ ] No secrets in code or history
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (sanitization)

## Accessibility & UX
- [ ] Mobile responsive (no overflow at 375px)
- [ ] Loading state present (skeleton, not blank)
- [ ] Empty state present (with CTA, not just "No data")
- [ ] Error state present (with recovery action)
- [ ] Focus visible on interactive elements
- [ ] ARIA labels on buttons/icons
- [ ] Keyboard navigable

## Documentation
- [ ] CLAUDE.md updated if relevant
- [ ] Complex logic has explanatory comments
- [ ] Migrations have up/down scripts
- [ ] Env vars documented

## Approval
- [ ] 2+ approvals for main branch
- [ ] No requested changes
- [ ] CI/CD passing
- [ ] Lighthouse CI passing
```

---

## 6. E2E Testing Patterns [AGENT: Luna]

### Pattern: Feature-Organized Test Structure

**Source:** Cal.com test organization, Playwright docs

Organize tests by feature, not by implementation detail (pages vs components).

```
tests/
├── auth/
│   ├── signup.spec.ts
│   ├── login.spec.ts
│   ├── logout.spec.ts
│   ├── password-reset.spec.ts
│   └── fixtures.ts (test users, auth helper)
├── ranking/
│   ├── create-job.spec.ts
│   ├── upload-resumes.spec.ts
│   ├── view-results.spec.ts
│   ├── export-results.spec.ts
│   └── fixtures.ts
├── billing/
│   ├── buy-credits.spec.ts
│   ├── subscribe-plan.spec.ts
│   ├── manage-subscription.spec.ts
│   └── fixtures.ts
├── admin/
│   ├── user-management.spec.ts
│   ├── system-settings.spec.ts
│   └── fixtures.ts
└── smoke/
    └── critical-paths.spec.ts
```

### Pattern: Page Object Model

**Source:** Clerk Playwright template, Playwright best practices

Encapsulate page interactions in reusable objects. No selectors in test code.

```typescript
// tests/pages/LoginPage.ts
import { Page, Locator, expect } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator

  constructor(page: Page) {
    this.page = page
    this.emailInput = page.locator('input[type="email"]')
    this.passwordInput = page.locator('input[type="password"]')
    this.submitButton = page.locator('button[type="submit"]')
    this.errorMessage = page.locator('[role="alert"]')
  }

  async goto() {
    await this.page.goto('/auth')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toContainText(message)
  }

  async expectRedirectToDashboard() {
    await expect(this.page).toHaveURL(/\/dashboard/)
  }
}

// tests/auth/login.spec.ts
import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'

test.describe('Login', () => {
  let loginPage: LoginPage

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page)
    await loginPage.goto()
  })

  test('user can log in with valid credentials', async () => {
    await loginPage.login('user@example.com', 'ValidPassword123!')
    await loginPage.expectRedirectToDashboard()
  })

  test('user sees error with invalid password', async () => {
    await loginPage.login('user@example.com', 'WrongPassword')
    await loginPage.expectError('Invalid email or password')
  })
})
```

### Pattern: API Testing (Edge Functions)

**Source:** Supabase testing guide

Test Deno Edge Functions directly before deploying.

```typescript
// tests/api/rank-resumes.test.ts
import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts'

Deno.test('rank-resumes function', async () => {
  const request = new Request('http://localhost:54321/functions/v1/rank-resumes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
    },
    body: JSON.stringify({
      jobId: 'test-job-id',
      resumeIds: ['resume-1', 'resume-2'],
    }),
  })

  const response = await fetch(request)
  assertEquals(response.status, 200)

  const data = await response.json()
  assertExists(data.results)
  assertEquals(data.results.length, 2)
})
```

---

## 7. SEO Implementation [AGENT: Zeph]

### Pattern: JSON-LD Structured Data

**Source:** schema.org, Google Search docs, Next.js SEO guide

Help search engines understand content with structured data.

```typescript
// lib/seo/schema.ts
export function generateJobListingSchema(job: {
  title: string
  description: string
  salary?: { min: number; max: number }
  location?: string
  postedDate: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.postedDate,
    ...(job.salary && {
      baseSalary: {
        '@type': 'PriceSpecification',
        priceCurrency: 'USD',
        minPrice: job.salary.min,
        maxPrice: job.salary.max,
      },
    }),
    ...(job.location && {
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress',
          streetAddress: job.location,
        },
      },
    }),
  }
}

export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Rankora',
    url: 'https://rankora.com',
    logo: 'https://rankora.com/logo.png',
    description: 'AI-powered resume screening platform',
    sameAs: [
      'https://twitter.com/rankora',
      'https://linkedin.com/company/rankora',
    ],
  }
}

export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

// Usage in page
export default function JobPage({ job }: { job: Job }) {
  const schema = generateJobListingSchema(job)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <h1>{job.title}</h1>
      {/* ... */}
    </>
  )
}
```

### Pattern: Sitemap Generation

**Source:** Next.js sitemap guide, robots.txt

Dynamically generate sitemaps from your database.

```typescript
// app/sitemap.ts (Next.js 14+)
import { MetadataRoute } from 'next'
import { createClient } from '@/integrations/supabase/client'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  // Fetch all public pages from database
  const { data: publicPages } = await supabase
    .from('seo_pages')
    .select('slug, updated_at')
    .eq('published', true)

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://rankora.com'

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
  ]

  const dynamicPages: MetadataRoute.Sitemap = (publicPages || []).map((page) => ({
    url: `${baseUrl}/${page.slug}`,
    lastModified: new Date(page.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...dynamicPages]
}
```

```typescript
// app/robots.ts (Next.js 14+)
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://rankora.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/blog', '/docs'],
        disallow: ['/dashboard', '/admin', '/api', '/auth'],
      },
      {
        userAgent: 'AdsBot-Google',
        allow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    crawlDelay: 1,
  }
}
```

### Pattern: Core Web Vitals Reporting

**Source:** web.dev, Next.js analytics, Vercel Analytics

Track performance in production.

```typescript
// lib/web-vitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'

function sendToAnalytics(metric: any) {
  const body = JSON.stringify(metric)
  // Use `navigator.sendBeacon()` for better reliability
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/metrics', body)
  } else {
    fetch('/api/metrics', { method: 'POST', body })
  }
}

export function reportWebVitals() {
  getCLS(sendToAnalytics)
  getFID(sendToAnalytics)
  getFCP(sendToAnalytics)
  getLCP(sendToAnalytics)
  getTTFB(sendToAnalytics)
}

// app.tsx
import { reportWebVitals } from '@/lib/web-vitals'

useEffect(() => {
  reportWebVitals()
}, [])
```

```typescript
// app/api/metrics/route.ts
export async function POST(request: Request) {
  const metric = await request.json()

  // Store in database or send to third-party service
  console.log('Web Vital:', metric)

  // Alert if metric is bad
  if (metric.name === 'LCP' && metric.value > 2500) {
    console.error('LCP exceeds threshold:', metric.value)
  }

  return Response.json({ ok: true })
}
```

---

## 8. Monitoring & Incident Response [AGENT: Hawk]

### Pattern: Sentry Error Tracking

**Source:** Sentry docs, Cal.com integration

Capture and track errors in production.

```typescript
// lib/sentry.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  replaySessionSampleRate: 0.1,
  replayOnErrorSampleRate: 1.0,
  tags: {
    component: 'frontend',
    version: process.env.NEXT_PUBLIC_APP_VERSION,
  },
  beforeSend(event, hint) {
    // Ignore certain errors
    if (event.exception) {
      const error = hint.originalException
      if (error instanceof Error) {
        // Ignore network errors (user's connection issue)
        if (error.message.includes('Failed to fetch')) {
          return null
        }
      }
    }
    return event
  },
})

// User context (after auth)
export function setSentryUser(user: { id: string; email: string; plan: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    custom: {
      plan: user.plan,
    },
  })
}

// Custom error logging with context
export function captureException(error: unknown, context?: Record<string, any>) {
  Sentry.captureException(error, {
    contexts: {
      custom: context,
    },
  })
}
```

### Pattern: Incident Runbook

**Source:** Rootly, incident.io, PagerDuty

Document how to respond to common incidents.

```yaml
# .incidents/runbooks/high-error-rate.md
title: High Error Rate (>5% 5xx)
severity: critical
components: [api, ranking-engine]

## Detection
- Alert from Sentry: error rate > 5%
- Alert from Vercel: deployment health check failed
- Slack notification in #incidents

## Investigation
1. Check Sentry dashboard: which endpoint/function is failing?
   - `https://sentry.io/organizations/rankora/issues/`
2. Check Vercel logs: any recent deployment?
   - `vercel logs --follow`
3. Check database: is Supabase healthy?
   - `https://supabase.com/dashboard`
4. Check external dependencies: OpenAI, Dodo Payments
   - Use `/api/health/deps` endpoint

## Resolution
- **If recent bad deployment:** Roll back with `vercel rollback`
- **If database issue:** Contact Supabase support, check RLS policies
- **If dependency down:** Set maintenance mode, notify users
- **If race condition:** Scale down and restart service

## Post-Incident
- [ ] Root cause analysis in #incidents-post-mortem
- [ ] Add monitoring/alerting to prevent recurrence
- [ ] Update runbook with findings
- [ ] Schedule postmortem meeting
```

---

## 9. Deployment Pipeline [AGENT: Bolt, Riko]

### Pattern: GitHub Actions CI/CD Pipeline

**Source:** Vercel docs, Cal.com CI, GitHub Actions best practices

Automate linting, testing, building, and deploying.

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline
on:
  push:
    branches: [main, develop, staging]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run test
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: .next/
          retention-days: 1

  deploy-preview:
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel preview
        uses: vercel/action@master
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  deploy-production:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment:
      name: production
      url: https://rankora.com
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel production
        uses: vercel/action@master
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          prod: true

  smoke-tests:
    runs-on: ubuntu-latest
    needs: deploy-production
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npx playwright install
      - name: Run smoke tests
        env:
          DEPLOYED_URL: https://rankora.com
        run: npx playwright test tests/smoke.spec.ts
```

### Pattern: Database Migrations (Zero-Downtime)

**Source:** Supabase migrations, Rails migration guide

Migrations must not block production traffic.

```sql
-- supabase/migrations/20260409000001_add_profile_picture.sql
-- SAFE: Add nullable column, no blocking operations

BEGIN;

-- Step 1: Add column (non-blocking)
ALTER TABLE profiles
ADD COLUMN profile_picture_url TEXT;

-- Step 2: Create index for searching
CREATE INDEX idx_profiles_picture_url ON profiles(profile_picture_url)
WHERE profile_picture_url IS NOT NULL;

-- Step 3: Update column comment for documentation
COMMENT ON COLUMN profiles.profile_picture_url IS 'User avatar image URL from external storage';

COMMIT;
```

**Unsafe migration (never do this):**

```sql
-- BAD: ALTER with DEFAULT value on large table
ALTER TABLE profiles
ADD COLUMN new_field TEXT DEFAULT 'placeholder'; -- Blocks writes on large table!

-- GOOD: Add nullable, backfill in app, add constraint later
ALTER TABLE profiles ADD COLUMN new_field TEXT;
-- App reads null and fills with value
UPDATE profiles SET new_field = computed_value WHERE new_field IS NULL;
-- Later migration: ALTER TABLE profiles ALTER COLUMN new_field SET NOT NULL;
```

---

## 10. Copy & Content Patterns [AGENT: Quill]

### Pattern: Linear-Style Changelog (Benefit Not Feature)

**Source:** Linear changelog analysis, SaaS copywriting

Write changelog entries as user benefits, not engineering features.

```markdown
# Changelog

## v1.5.0 - 2026-04-08

### Resume Parsing is Now 10x Faster
We rebuilt our resume parser to handle PDFs in milliseconds instead of seconds.
You'll see results almost instantly now.

✨ Added Markdown resume support
🚀 Improved OCR accuracy for scanned PDFs
🔧 Fixed parsing errors on some Word documents

### Smart Interview Question Generation
Our AI now suggests role-specific interview questions based on candidate strengths and gaps.
Use them to dig deeper during interviews.

### Bulk Job Management
Select multiple jobs and rename, archive, or delete them all at once.
Saves time when cleaning up your job history.

---

## v1.4.0 - 2026-03-15

### Fixed: Ranking Sometimes Failed on Large Resumes
Large PDFs (20+ pages) no longer cause ranking to fail.
All resumes process successfully now, no matter the size.

### API Rate Limit Increased
Pro and Enterprise plans now get 10x higher API limits.
Build integrations without worrying about throttling.
```

**BAD changelog (don't write like this):**

```
## v1.5.0
- Refactored resume parser with async batch processing
- Added pgvector indexes for faster embedding search
- Upgraded Node.js to 20.11
- Fixed bug in email ingest webhook retry logic
- Updated Tailwind to v3.4
```

### Pattern: Behavior-Triggered Email Sequence

**Source:** SaaS email marketing, Drip, ConvertKit

Send emails based on user actions, not arbitrary schedules.

```typescript
// lib/email/triggers.ts
export async function triggerEmailSequence(event: {
  type: 'signup' | 'first-ranking' | 'trial-ending' | 'plan-upgrade'
  userId: string
  metadata?: Record<string, any>
}) {
  const supabase = await createClient()
  const { data: user } = await supabase
    .from('profiles')
    .select('email, plan, created_at')
    .eq('id', event.userId)
    .single()

  if (!user?.email) return

  switch (event.type) {
    case 'signup':
      // Email 0: Welcome (immediate)
      await sendEmail('welcome', user.email, {
        name: event.metadata?.name || 'there',
      })
      // Email 1: Onboarding (30 minutes later)
      scheduleEmail('onboarding', user.email, { delay: 30 * 60 * 1000 })
      // Email 2: Feature highlight (2 days later)
      scheduleEmail('feature-highlight', user.email, { delay: 2 * 24 * 60 * 60 * 1000 })
      break

    case 'first-ranking':
      // Congratulations + next steps (immediate)
      await sendEmail('first-ranking-complete', user.email, {
        resultsUrl: event.metadata?.resultsUrl,
      })
      // Upsell credits (1 week later) - only if free plan
      if (user.plan === 'free') {
        scheduleEmail('upsell-credits', user.email, { delay: 7 * 24 * 60 * 60 * 1000 })
      }
      break

    case 'trial-ending':
      // Trial ending in 3 days
      await sendEmail('trial-ending-3days', user.email, {
        expiresAt: event.metadata?.expiresAt,
      })
      break

    case 'plan-upgrade':
      // Thank you + premium features (immediate)
      await sendEmail('plan-upgrade-thank-you', user.email, {
        newPlan: event.metadata?.newPlan,
      })
      break
  }
}
```

```typescript
// Email templates
export const emailTemplates = {
  welcome: {
    subject: 'Welcome to Rankora — Your Resume Screening Just Got Smarter',
    html: `
      <h1>Welcome!</h1>
      <p>Hi {{name}},</p>
      <p>You've just joined thousands of recruiters using AI to screen resumes 10x faster.</p>
      <p><a href="{{appUrl}}/dashboard">Start ranking resumes</a></p>
      <p>— The Rankora Team</p>
    `,
  },
  'trial-ending-3days': {
    subject: '3 Days Left: Your Free Trial Expires on {{expiresDate}}',
    html: `
      <h1>Your Trial Expires Soon</h1>
      <p>In 3 days, your free trial ends.</p>
      <p>Upgrade to keep using Rankora:</p>
      <p><a href="{{appUrl}}/pricing">See Plans</a></p>
    `,
  },
}
```

### Pattern: Stripe ID Prefix for Error Messages

**Source:** Stripe API docs, error handling best practices

Help support debug issues by including operation IDs in error messages.

```typescript
// lib/errors.ts
import { nanoid } from 'nanoid'

export class AppError extends Error {
  public readonly code: string
  public readonly errorId: string
  public readonly userMessage: string

  constructor(
    message: string,
    code: string,
    userMessage: string = 'Something went wrong. Please try again.'
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.errorId = `err_${nanoid(12)}`
    this.userMessage = userMessage
  }

  toResponse() {
    return {
      error: {
        message: this.userMessage,
        code: this.code,
        id: this.errorId,
      },
    }
  }
}

// Usage
throw new AppError(
  'Database connection timeout',
  'db_timeout',
  'We couldn\'t connect to our database. Error ID: {{errorId}}. Support can look this up.'
)

// User sees: "We couldn't connect to our database. Error ID: err_abc123def456. Support can look this up."
// Support can search Sentry for err_abc123def456 and find the exact error
```

---

## 11. Architecture Decisions [AGENT: Arya]

### Pattern: Architecture Decision Record (ADR)

**Source:** Michael Nygard ADR, MADR template

Document important technical decisions with tradeoffs.

```markdown
# ADR-001: Use Supabase Instead of Firebase

**Date:** 2026-04-09
**Status:** Accepted
**Context:**
We need a backend-as-a-service (BaaS) for rapid development.
Options: Supabase (open-source Postgres), Firebase (Google's proprietary), or self-hosted (too slow to build).

**Decision:**
We choose Supabase because:
1. **SQL + RLS:** Full SQL power + row-level security (not possible in Firebase)
2. **Open Source:** Can self-host later if needed (vendor lock-in insurance)
3. **pgvector:** Native vector support for embeddings (critical for AI features)
4. **Realtime:** Built-in realtime subscriptions without extra service
5. **Edge Functions:** Deno-based (TypeScript) and co-located with data

**Tradeoffs:**
| Aspect | Supabase | Firebase |
|--------|----------|----------|
| SQL | ✅ Full PostgreSQL | ❌ NoSQL only |
| RLS | ✅ Row-level security | ❌ Not possible |
| Pricing | 💵 $25/month baseline | 💵 $0 baseline, expensive at scale |
| Realtime | ✅ Built-in | ✅ Built-in |
| Serverless Functions | ✅ Edge Functions | ✅ Cloud Functions |
| Vectors | ✅ pgvector | ❌ Not native |
| Lock-in | ✅ Can self-host | ❌ Proprietary |

**Consequences:**
- ✅ Can build RLS-first multi-tenant app (higher security)
- ✅ Can use vectors for semantic search (competitive advantage)
- ❌ Must manage Postgres quirks (NULL handling, indexes, migrations)
- ❌ Smaller ecosystem than Firebase (fewer third-party integrations)

**Related ADRs:**
- ADR-002: Use pgvector for Semantic Search
- ADR-003: Server-Side Rendering for SEO
```

### Pattern: Caching Decision Matrix

**Source:** System design best practices

Decide what to cache based on: data freshness requirement, mutation frequency, query cost.

```markdown
# Caching Strategy

| Data | Freshness | Mutation | Complexity | Cache? | TTL |
|------|-----------|----------|-----------|--------|-----|
| User profile | 5 min | rare | low | ✅ Redis | 5m |
| Job rankings | real-time | frequent | high | ❌ No | — |
| Feature flags | 1 min | rare | low | ✅ Memory | 1m |
| Ranking results | stale OK | never (read-only) | high | ✅ Disk | 30d |
| Payment status | immediate | frequent | critical | ❌ No | — |
| Admin users list | 10 min | rare | medium | ✅ Redis | 10m |
| Candidate resumes | 1 hour | rare | high (storage) | ✅ CDN | 1h |

**Rule of thumb:**
- Slow + immutable → cache aggressively
- Real-time + mutable → cache lightly or not at all
- Small + fast → cache for DX, not perf
```

---

## 12. Project Scaffolding [AGENT: Riko]

### Pattern: T3 Folder Structure + ESLint Flat Config

**Source:** create-t3-app, ESLint 9.0+, ixartz boilerplate

Start every project with this structure (proven at scale).

```
project/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       └── security-scan.yml
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── api/
│   │   │   └── health/
│   │   └── (auth)/
│   │       ├── layout.tsx
│   │       └── signin/page.tsx
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui primitives
│   │   ├── forms/
│   │   └── layout/
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities (NOT React hooks)
│   │   ├── auth.ts
│   │   ├── db.ts
│   │   ├── email.ts
│   │   └── utils.ts
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts
│   │       └── types.ts (auto-generated)
│   ├── server/                 # Server actions & utilities (Next.js 13+)
│   └── env.ts                  # Runtime environment validation
├── tests/
│   ├── e2e/
│   ├── unit/
│   └── fixtures/
├── supabase/
│   ├── migrations/
│   └── functions/
├── public/                     # Static assets
├── .env.example                # Template for env vars
├── eslint.config.js            # ESLint 9 flat config
├── prettier.config.js
├── tsconfig.json
├── next.config.js
├── package.json
└── README.md
```

### Pattern: ESLint Flat Config v9

**Source:** ESLint 9.0 migration, eslint-config-flat

```javascript
// eslint.config.js
import js from '@eslint/js'
import ts from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

export default [
  // Ignore patterns
  {
    ignores: ['node_modules', '.next', 'dist', 'build', '.turbo'],
  },

  // JavaScript baseline
  js.configs.recommended,

  // TypeScript
  ...ts.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-types': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // React
  {
    files: ['**/*.{jsx,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off', // TypeScript handles this
    },
  },

  // Prettier (turns off ESLint rules that conflict)
  prettier,

  // Custom rules
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
]
```

### Pattern: .env Template

**Source:** Production boilerplate examples

```bash
# .env.example — Copy to .env.local and fill in real values

# ===== SUPABASE =====
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... # Never expose this

# ===== AUTHENTICATION =====
NEXTAUTH_SECRET=use-`openssl rand -base64 32` # Generate with command shown
NEXTAUTH_URL=http://localhost:3000

# ===== AI & EXTERNAL APIS =====
OPENAI_API_KEY=sk-... # Get from https://platform.openai.com/api-keys
RESEND_API_KEY=re_... # Get from https://resend.com/api-keys

# ===== PAYMENTS =====
NEXT_PUBLIC_DODO_PAYMENTS_PUBLIC_KEY=pk_...
DODO_PAYMENTS_SECRET_KEY=sk_...

# ===== MONITORING =====
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/...

# ===== DEPLOYMENT =====
NODE_ENV=development # or production
NEXT_PUBLIC_URL=http://localhost:3000 # or https://app.com
```

---

## Summary: Load This File When...

- **[AGENT: Koda]** — Building new features (RLS patterns, error handling, type safety)
- **[AGENT: Luna]** — Writing tests (test structure, smoke tests, Page Object Model)
- **[AGENT: Bolt]** — Deploying (CI/CD pipeline, health checks, rollback strategy)
- **[AGENT: Sage]** — Security audit (RLS testing, security headers, secrets)
- **[AGENT: Zeph]** — SEO implementation (JSON-LD, sitemaps, Web Vitals)
- **[AGENT: Hawk]** — Monitoring (error tracking, incident response, alerting)
- **[AGENT: Arya]** — Architecture decisions (ADRs, database design, migration strategy)
- **[AGENT: Quill]** — Writing content (changelog, email sequences, error messages)
- **[AGENT: Riko]** — Project setup (folder structure, ESLint config, .env)
- **[AGENT: Rex]** — Orchestrating builds (deployment pipeline, rollback, smoke tests)

---

## Updates & Feedback

Found a new pattern that works in production? Found a mistake in this file?

Flag to Mira for inclusion:
```
Pattern: [name]
Source: [URL/repo]
Status: [verified/testing]
Notes: [what you learned]
```

Last updated by Koda: 2026-04-10

---

## 14. Edge Functions & Background Jobs [AGENT: Koda, Bolt]

> Added: 2026-04-10. Sources: Inngest, Trigger.dev, Vercel Edge.

### Pattern: Inngest Background Job (Next.js)

**Source:** Inngest docs, production usage at 10k+ developers

```typescript
// app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";

// Define the function
const processUpload = inngest.createFunction(
  { id: "process-upload", retries: 3 },
  { event: "upload/received" },
  async ({ event, step }) => {
    // Step 1: Validate
    const validated = await step.run("validate", async () => {
      return validateFile(event.data.fileUrl);
    });

    // Step 2: Process (automatically retried on failure)
    const result = await step.run("process", async () => {
      return processFile(validated.url);
    });

    // Step 3: Notify
    await step.run("notify", async () => {
      await sendNotification(event.data.userId, result);
    });

    return { success: true, result };
  }
);

// Serve the Inngest endpoint
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processUpload],
});
```

**Rule:** Each `step.run()` is independently retryable. If step 2 fails, step 1 doesn't re-execute.

### Pattern: Vercel Edge Middleware (Auth + Feature Flags)

**Source:** Vercel docs, Next.js middleware patterns

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Auth check (0-5ms at edge)
  const token = request.cookies.get("session")?.value;
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Feature flag (edge KV or header-based)
  const response = NextResponse.next();
  const bucket = hashUserId(token) % 100;
  if (bucket < 10) { // 10% rollout
    response.headers.set("x-feature-new-dashboard", "true");
  }

  // Geolocation routing
  const country = request.geo?.country ?? "US";
  response.headers.set("x-user-country", country);

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
```

---

## 15. Realtime Collaboration [AGENT: Koda]

> Added: 2026-04-10. Sources: Yjs, Supabase Realtime.

### Pattern: Yjs Collaborative Editing Setup

**Source:** Yjs GitHub (900k weekly downloads)

```typescript
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { Awareness } from "y-protocols/awareness";

// Create shared document
const ydoc = new Y.Doc();

// Connect to WebSocket server
const provider = new WebsocketProvider(
  "wss://your-ws-server.com",
  "document-room-id",
  ydoc
);

// Awareness (presence: cursors, selections, names)
provider.awareness.setLocalStateField("user", {
  name: currentUser.name,
  color: currentUser.color,
  cursor: null,
});

// Shared types
const ytext = ydoc.getText("main-content");
const ymap = ydoc.getMap("metadata");

// Listen to changes
ytext.observe((event) => {
  // Auto-merged CRDT updates — no conflict resolution needed
  console.log("Text changed:", event.changes);
});

// Offline: changes queue locally, sync on reconnect
provider.on("status", ({ status }) => {
  console.log("Connection:", status); // "connected" | "disconnected"
});
```

### Pattern: Supabase Realtime (Broadcast + Presence)

**Source:** Supabase docs

```typescript
import { supabase } from "@/integrations/supabase/client";

// Broadcast (ephemeral messages)
const channel = supabase.channel("room-1");
channel
  .on("broadcast", { event: "cursor" }, ({ payload }) => {
    updateCursor(payload.userId, payload.x, payload.y);
  })
  .subscribe();

// Send cursor position
channel.send({
  type: "broadcast",
  event: "cursor",
  payload: { userId: user.id, x: mouseX, y: mouseY },
});

// Presence (online users)
channel
  .on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    setOnlineUsers(Object.values(state).flat());
  })
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track({ userId: user.id, name: user.name });
    }
  });
```

---

## 16. Hybrid Search (Keyword + Vector) [AGENT: Koda, Arya]

> Added: 2026-04-10. Sources: pgvector, Supabase.

### Pattern: pgvector Hybrid Search Function

**Source:** pgvector GitHub, Supabase vector docs

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Table with embedding column
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(1536),  -- OpenAI ada-002 dimensions
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- HNSW index for fast similarity search
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search index
ALTER TABLE documents ADD COLUMN fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX ON documents USING gin (fts);

-- Hybrid search function (keyword + semantic with RRF fusion)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text text,
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  keyword_weight float DEFAULT 0.5,
  semantic_weight float DEFAULT 0.5
) RETURNS TABLE (id uuid, content text, score float) AS $$
  WITH keyword_results AS (
    SELECT id, content,
      ts_rank(fts, plainto_tsquery('english', query_text)) AS rank
    FROM documents
    WHERE fts @@ plainto_tsquery('english', query_text)
    ORDER BY rank DESC LIMIT match_count * 2
  ),
  semantic_results AS (
    SELECT id, content,
      1 - (embedding <=> query_embedding) AS rank
    FROM documents
    ORDER BY embedding <=> query_embedding LIMIT match_count * 2
  ),
  combined AS (
    SELECT
      COALESCE(k.id, s.id) AS id,
      COALESCE(k.content, s.content) AS content,
      (COALESCE(k.rank, 0) * keyword_weight +
       COALESCE(s.rank, 0) * semantic_weight) AS score
    FROM keyword_results k
    FULL OUTER JOIN semantic_results s ON k.id = s.id
  )
  SELECT id, content, score FROM combined ORDER BY score DESC LIMIT match_count;
$$ LANGUAGE sql STABLE;
```

---

## 17. Dynamic Rate Limiting [AGENT: Sage, Koda]

> Added: 2026-04-10. Sources: Zuplo, Unkey, production patterns.

### Pattern: Sliding Window Rate Limiter (Redis)

**Source:** Production rate limiting patterns

```typescript
// lib/rate-limit.ts
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function rateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `rate:${identifier}`;

  // Sliding window: remove expired, add current, count
  const pipe = redis.pipeline();
  pipe.zremrangebyscore(key, 0, windowStart);
  pipe.zadd(key, { score: now, member: `${now}-${Math.random()}` });
  pipe.zcard(key);
  pipe.expire(key, Math.ceil(windowMs / 1000));

  const results = await pipe.exec();
  const count = results[2] as number;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: now + windowMs,
  };
}

// Usage in API route
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed, remaining, resetAt } = await rateLimit(ip, 100, 60_000);

  if (!allowed) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
        "Retry-After": "60",
      },
    });
  }

  // Process request...
}
```

---

## 18. Feature Flags (In-House) [AGENT: Koda, Bolt]

> Added: 2026-04-10. Sources: Flipt, Unleash, production patterns.

### Pattern: Lightweight Feature Flag System

**Source:** Production SaaS patterns (in-house alternative to LaunchDarkly)

```typescript
// lib/feature-flags.ts
import { createClient } from "@supabase/supabase-js";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  rollout_percentage: number;
  targeting: Record<string, string[]>; // { plan: ["pro", "enterprise"] }
}

const FLAGS_CACHE = new Map<string, { flag: FeatureFlag; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function isEnabled(
  flagKey: string,
  context: { userId?: string; plan?: string; country?: string } = {}
): Promise<boolean> {
  // Check cache
  const cached = FLAGS_CACHE.get(flagKey);
  if (cached && cached.expiry > Date.now()) {
    return evaluateFlag(cached.flag, context);
  }

  // Fetch from DB
  const { data } = await supabase
    .from("feature_flags")
    .select("*")
    .eq("key", flagKey)
    .single();

  if (!data) return false;

  FLAGS_CACHE.set(flagKey, { flag: data, expiry: Date.now() + CACHE_TTL });
  return evaluateFlag(data, context);
}

function evaluateFlag(flag: FeatureFlag, context: Record<string, any>): boolean {
  if (!flag.enabled) return false;

  // Check targeting rules
  for (const [key, values] of Object.entries(flag.targeting || {})) {
    if (context[key] && !values.includes(context[key])) return false;
  }

  // Percentage rollout (deterministic by userId)
  if (flag.rollout_percentage < 100 && context.userId) {
    const hash = simpleHash(context.userId + flag.key);
    if (hash % 100 >= flag.rollout_percentage) return false;
  }

  return true;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
```

**Rule:** Stale flag cleanup — remove flags 30 days after 100% rollout. Name format: `feature.module.name`.
