# Next.js 16 Debugging & Fix Protocol (Stack A Master)

> **Every code-touching agent (Koda, Vex, Sage, Luna, Riko) MUST load this file.**
> This replaces loading 15+ pattern files. All critical knowledge is embedded here.
> Last updated: 2026-04-13. Stack A locked: Next.js 16.2.3, Supabase, Railway, Dodo.

---

## THE FIX-VERIFY LOOP (Non-Negotiable)

Every code change follows this exact loop. No exceptions. No skipping steps.

```
FOR EVERY CHANGE:
  1. SNAPSHOT: Note which files you're about to touch + what imports them
  2. CHANGE: Make the minimal edit (1-3 files max per cycle)
  3. TYPECHECK: pnpm tsc --noEmit
  4. LINT: pnpm lint
  5. BUILD: pnpm build
  6. TEST: pnpm test --run (if tests exist)
  7. VERIFY: Check the actual behavior (curl the route, check the page, read the output)

  IF ANY STEP FAILS:
    → Fix THAT failure before touching anything else
    → Re-run from step 3
    → Max 3 attempts per failure
    → After 3 failures: STOP. Do not keep trying. Report the exact error.

  IF ALL PASS:
    → Proceed to next change
```

**The #1 reason fixes fail is skipping the verify step.** Agents "fix" a file, then move on without checking if the fix actually works. This loop prevents that.

---

## BEFORE YOU TOUCH ANY FILE

### Step 0: Understand What You're Changing

```bash
# 1. What imports this file? (WILL THESE BREAK?)
grep -r "from.*filename" --include="*.ts" --include="*.tsx" src/ app/

# 2. What does this file export? (ARE CONSUMERS USING ALL EXPORTS?)
grep "export" path/to/file.ts

# 3. Is this a Server Component or Client Component?
head -5 path/to/file.tsx  # Look for 'use client' at top

# 4. Is this used in a layout? (LAYOUT CHANGES CASCADE TO ALL CHILD ROUTES)
grep -r "filename" app/**/layout.tsx
```

**Rule: If you're editing a layout file, you're editing EVERY page under it. Treat layout changes as P0 risk.**

---

## NEXT.JS 16 GOTCHAS (Agents Keep Getting These Wrong)

### 1. cookies() is ASYNC — must await it

```ts
// ❌ WRONG — This will crash at runtime
import { cookies } from 'next/headers'
const cookieStore = cookies()

// ✅ RIGHT — cookies() returns a Promise in Next 16
import { cookies } from 'next/headers'
const cookieStore = await cookies()
```

**Every file that uses `cookies()` must be in an async function. This includes Supabase server client creation.**

### 2. headers() is ASYNC — must await it

```ts
// ❌ WRONG
const headersList = headers()

// ✅ RIGHT
const headersList = await headers()
```

### 3. params and searchParams are ASYNC in page/layout components

```ts
// ❌ WRONG — params is a Promise now
export default function Page({ params }: { params: { id: string } }) {
  return <div>{params.id}</div>
}

// ✅ RIGHT — await params
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <div>{id}</div>
}

// ✅ RIGHT — searchParams too
export default async function Page({ 
  searchParams 
}: { 
  searchParams: Promise<{ q?: string }> 
}) {
  const { q } = await searchParams
  return <div>Search: {q}</div>
}
```

### 4. middleware.ts → still middleware.ts (NOT proxy.ts for most projects)

The proxy.ts rename was a Next 16 RFC proposal but `middleware.ts` at project root still works. Check the project's actual file:
```bash
ls -la middleware.ts proxy.ts 2>/dev/null
```
Use whichever exists. Don't rename unless the project CLAUDE.md says to.

### 5. Server Components are default — don't add 'use client' unless needed

A component needs `'use client'` ONLY if it uses:
- `useState`, `useEffect`, `useContext`, `useReducer`, or any React hook
- Event handlers (`onClick`, `onChange`, `onSubmit`, etc.)
- Browser APIs (`window`, `document`, `localStorage`)
- Third-party client-only libraries

**If you're adding 'use client' to more than 30% of files, something is architecturally wrong.**

### 6. Server Actions vs API Routes

```ts
// Use Server Actions for form mutations (simpler, type-safe)
'use server'
export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  // ... update ...
  revalidatePath('/settings')
}

// Use API routes ONLY for:
// - Webhooks (Dodo, Supabase, external services)
// - Third-party integrations that need a stable URL
// - Non-Next.js clients (mobile apps, CLI tools)
```

### 7. Metadata API (not <Head>)

```ts
// ❌ WRONG — no <Head> in App Router
import Head from 'next/head'

// ✅ RIGHT — export metadata or generateMetadata
export const metadata = { title: 'Page Title' }

// ✅ RIGHT — dynamic metadata
export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return { title: `Item ${id}` }
}
```

### 8. Image component

```ts
// ❌ WRONG — old import
import Image from 'next/legacy/image'

// ✅ RIGHT
import Image from 'next/image'
// Always provide width + height OR use fill
```

### 9. Route handlers return Response, not NextResponse for simple cases

```ts
// app/api/health/route.ts
export function GET() {
  return Response.json({ status: 'ok', timestamp: Date.now() })
}
```

### 10. Revalidation

```ts
import { revalidatePath } from 'next/cache'
import { revalidateTag } from 'next/cache'

// After a mutation:
revalidatePath('/dashboard')  // Revalidate a specific path
revalidateTag('projects')     // Revalidate all fetches tagged 'projects'
```

---

## SUPABASE GOTCHAS

### 1. Server vs Client — Use the Right One

```
Server Components, Server Actions, API routes → lib/supabase/server.ts (createClient with cookies)
Client Components (hooks, event handlers)     → lib/supabase/client.ts (createBrowserClient)
Middleware                                     → lib/supabase/middleware.ts (createServerClient with request/response)
```

**Never import the server client in a 'use client' file. Never import the browser client in a server file.**

### 2. RLS is Active — Queries Return Empty, Not Errors

If a Supabase query returns empty results when you expect data, 90% of the time:
- RLS is enabled but the policy doesn't match the authenticated user
- The user isn't authenticated (anonymous = no rows)
- The policy uses `auth.uid()` but the table column is named something other than `user_id`

Debug with:
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Test as the actual user (in Supabase SQL editor)
SET request.jwt.claims = '{"sub": "user-uuid-here"}';
SELECT * FROM your_table;
```

### 3. Generated Types — Regenerate After Schema Changes

```bash
pnpm supabase gen types typescript --local > lib/supabase/types.ts
# OR from remote
pnpm supabase gen types typescript --project-ref $PROJECT_REF > lib/supabase/types.ts
```

**If TypeScript complains about a column that exists in the database, the types file is stale.**

### 4. Supabase Errors Are Objects, Not Strings

```ts
const { data, error } = await supabase.from('table').select()
if (error) {
  // error is { message: string, code: string, details: string, hint: string }
  console.error(error.message, error.code)  // NOT console.error(error)
  throw new Error(error.message)
}
```

---

## SHOPIFY / STACK B GOTCHAS

### 1. React Router 7, NOT Remix

```ts
// ❌ WRONG
import { useLoaderData } from '@remix-run/react'

// ✅ RIGHT
import { useLoaderData } from 'react-router'
```

### 2. Polaris Components Only — No Tailwind, No shadcn

```tsx
// ❌ WRONG — Shopify rejects custom styling
<div className="bg-blue-500 p-4 rounded">

// ✅ RIGHT — Polaris only
import { Page, Card, Layout, Text } from '@shopify/polaris'
<Page title="Settings">
  <Layout>
    <Layout.Section>
      <Card>
        <Text variant="bodyMd">Content</Text>
      </Card>
    </Layout.Section>
  </Layout>
</Page>
```

### 3. Prisma — Not Supabase

Stack B uses Prisma + PostgreSQL (not Supabase). Schema in `prisma/schema.prisma`.
```bash
pnpm prisma migrate dev    # Development
pnpm prisma migrate deploy # Production
pnpm prisma generate       # Regenerate client after schema change
```

### 4. Shopify Billing — Not Dodo

Stack B charges through Shopify Billing API. Never add Dodo or Stripe to a Shopify app.

---

## REGRESSION PREVENTION CHECKLIST

Before committing ANY fix, run this exact sequence:

```bash
# 1. Type safety
pnpm tsc --noEmit
echo "TypeCheck: $?"

# 2. Lint
pnpm lint
echo "Lint: $?"

# 3. Build (catches SSR issues, import errors, missing env vars)
pnpm build
echo "Build: $?"

# 4. Tests (if they exist)
pnpm test --run 2>/dev/null
echo "Tests: $?"

# 5. Check for console.log in production code (Stack A rule)
grep -rn "console\.\(log\|debug\|info\)" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v "// dev" | grep -v test
```

**If ANY step fails, you are not done. Fix it before reporting success.**

---

## COMMON FIX PATTERNS (Copy-Paste Solutions)

### Fix: "Module not found" after moving/renaming a file

```bash
# Find every file that imported the old path
grep -rn "from.*old-filename" --include="*.ts" --include="*.tsx" app/ lib/ components/
# Update each one
```

### Fix: Hydration mismatch

```
Error: Text content does not match. Server: "X" Client: "Y"
```
Cause: Component renders differently on server vs client.
Fix: Wrap the dynamic part in `'use client'` component, or use `useEffect` for client-only values.

### Fix: "Dynamic server usage" error

```
Error: Dynamic server usage: cookies
```
Cause: Using `cookies()` or `headers()` in a statically rendered route.
Fix: Add `export const dynamic = 'force-dynamic'` to the page, or move the dynamic call to a Server Action.

### Fix: Supabase "AuthSessionMissingError"

Cause: Trying to get session in a context where cookies aren't available.
Fix: Ensure middleware.ts refreshes the session, and the Supabase client is created with proper cookie handling.

### Fix: Railway build fails with "standalone output"

```ts
// next.config.ts — REQUIRED for Railway
const config: NextConfig = {
  output: 'standalone',
  // ...
}
```

### Fix: BullMQ connection fails

```ts
// ioredis MUST have maxRetriesPerRequest: null for BullMQ
import IORedis from 'ioredis'
const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null  // ← REQUIRED. Without this, BullMQ hangs.
})
```

### Fix: Dodo webhook signature verification

```ts
import { timingSafeEqual } from 'crypto'
// Use timingSafeEqual, NEVER === for HMAC comparison
const isValid = timingSafeEqual(
  Buffer.from(computedSignature),
  Buffer.from(receivedSignature)
)
```

---

## THE "DON'T DO THIS" LIST

1. **Don't edit 10 files then run build.** Edit 1-3, verify, repeat.
2. **Don't add 'use client' to fix a server-side error.** Understand WHY it's erroring first.
3. **Don't ignore TypeScript errors with @ts-ignore.** Fix the type.
4. **Don't use `any` type.** Use `unknown` + type narrowing.
5. **Don't use `console.log`.** Use the pino logger: `import { logger } from '@/lib/logger'`.
6. **Don't create a new Supabase client.** Import from `@/lib/supabase/server` or `@/lib/supabase/client`.
7. **Don't use npm or yarn.** `pnpm` only.
8. **Don't put business logic in components.** Extract to `lib/` or Server Actions.
9. **Don't fetch data in Client Components with useEffect.** Use Server Components + Suspense, or React Query for client-side needs.
10. **Don't skip the build step.** `pnpm build` catches things that `tsc` doesn't (dynamic imports, env vars, SSR issues).

---

## WHEN TO STOP AND ESCALATE

Stop trying to fix and report to Yash when:
1. **3 fix attempts failed** on the same error — you're in a loop
2. **The fix requires changing >10 files** — this is a refactor, not a fix
3. **The error is in node_modules** — dependency issue, needs version change or workaround
4. **The error is in Supabase/Railway/Dodo infrastructure** — not a code bug
5. **You're about to add a workaround** — ask if the workaround is acceptable first
6. **Tests pass but behavior is wrong** — the tests might be testing the wrong thing

**Escalation format:**
```
BLOCKED: [one-line description]
Error: [exact error message]
Tried: [what you attempted, numbered list]
Root cause: [your best diagnosis]
Recommendation: [what you think should be done]
Files involved: [list]
```

---

## VERIFICATION COMMANDS QUICK REFERENCE

| Check | Command | When |
|-------|---------|------|
| TypeScript | `pnpm tsc --noEmit` | After every code change |
| Lint | `pnpm lint` | After every code change |
| Build | `pnpm build` | After every feature/fix |
| Unit tests | `pnpm test --run` | After logic changes |
| E2E tests | `pnpm test:e2e` | After UI/flow changes |
| Supabase types | `pnpm supabase gen types typescript --local > lib/supabase/types.ts` | After schema changes |
| Prisma types | `pnpm prisma generate` | After schema changes (Stack B) |
| Dev server | `pnpm dev` | To test locally |
| Health check | `curl http://localhost:3000/api/health` | After API changes |

---

*(This file is the single source of truth for how Boldteq agents write and fix code. Updated 2026-04-13.)*
