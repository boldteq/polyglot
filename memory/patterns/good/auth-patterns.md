---
name: Auth Patterns
description: Production-grade authentication and authorization patterns across all stacks — the standard every Boldteq project must follow
type: reference
---

## Core Principles (Stack-Agnostic)

### 1. Identity Must Be Server-Validated
- Never trust client-side tokens or session data for authorization decisions
- Always revalidate the user's identity on the server for every protected operation
- Token validation happens at the middleware/gateway layer, not inside business logic

### 2. Auth Is Day-One Infrastructure
- Auth is scaffolded before any feature code — never "added later"
- The auth system defines the data model (user → org → permissions → features)
- Every API route is protected by default; public routes are explicitly opted-in

### 3. Session Architecture
- **Short-lived access tokens** (15 min) + **long-lived refresh tokens** (7-30 days)
- Refresh tokens stored HTTP-only, Secure, SameSite=Strict
- Access tokens never stored in localStorage — use memory or HTTP-only cookies
- Token rotation on every refresh — invalidate the old refresh token immediately

---

## Stack-Specific Patterns

### Stack A — Supabase Auth (Next.js SaaS)

**@supabase/ssr (Next.js 16 — REQUIRED)**

Stack A uses `@supabase/ssr` (NOT the deprecated `@supabase/auth-helpers-nextjs`).

**Server client (for Server Components, Route Handlers, Server Actions):**
```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
}
```

**Browser client (for Client Components):**
```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

**Middleware (token refresh on every request — CRITICAL for Next.js 16):**
```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  // IMPORTANT: call getUser() to refresh the session
  const { data: { user } } = await supabase.auth.getUser()
  
  // Redirect unauthenticated users to login
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
}
```

**CRITICAL RULES:**
- NEVER use `getSession()` for auth checks — always use `getUser()` (it validates the JWT against Supabase)
- Middleware MUST call `getUser()` on every request to keep tokens refreshed
- The `@supabase/auth-helpers-nextjs` package is DEPRECATED — never import it

**RLS as Second Layer:**
- Supabase RLS policies enforce data access even if application logic has bugs
- Every table has `ENABLE ROW LEVEL SECURITY` from creation
- Default deny — no policy means no access
- Standard pattern: `USING (auth.uid() = user_id)` for user-scoped data
- Org-scoped: `USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))`

**OAuth Providers:**
- Google, GitHub, Twitter supported out of the box
- Always configure redirect URLs per environment (dev, preview, prod)
- Store provider tokens if API access needed (e.g., GitHub repos)

### Stack B — Shopify App Auth (Remix)

**Session Token Flow:**
```typescript
// Every loader/action starts with this — non-negotiable
const { admin, session } = await authenticate.admin(request)
// session.shop is the trusted identity — never from URL params
```

**Storefront/Public Routes:**
- Validate Shopify origin via HMAC signature
- Use App Proxy for authenticated storefront requests
- Public API endpoints require origin validation or signed requests

**Mandatory Webhooks:**
- `shop/redact` — GDPR shop data deletion
- `customers/redact` — GDPR customer data deletion
- `customers/data_request` — GDPR data export
- Must return 200 immediately, process asynchronously

### Stack C — AI App Auth (Next.js + Supabase)

- Same as Stack A foundation
- Additional: API key management for external AI service access
- Rate limiting per user tier (free: 10 req/min, pro: 100 req/min, enterprise: custom)
- Token usage tracking tied to user/org for billing
- Streaming endpoints still require auth — validate before opening SSE connection

### Custom Stacks

**NextAuth.js:**
- Configure providers in `[...nextauth].ts`
- Use `getServerSession()` for server-side auth checks
- Custom adapter for Prisma/Drizzle/Supabase
- JWT strategy for serverless, database strategy for traditional servers

**Auth0 / Okta / Firebase:**
- Use official SDK middleware
- Validate JWT signature + claims on every API request
- Map external user ID to internal user record on first login
- Handle token refresh transparently in middleware

---

## Authorization Patterns

### Role-Based Access Control (RBAC)
```
Roles: owner > admin > member > viewer
Hierarchy: each role inherits all permissions of roles below it
```

**Implementation:**
- Store role on `org_members` junction table, not on user
- Check permission in middleware or route handler, never in UI only
- UI hides elements, server enforces — both required

### Feature Gating (Subscription-Based)
```
Free tier → basic features
Pro tier → advanced features + higher limits
Enterprise → custom features + unlimited
```

**Implementation:**
- Check `subscription_status` + `plan_tier` server-side before executing feature
- Cache plan info on session/token to reduce DB lookups (invalidate on webhook)
- Feature flags for gradual rollout within tiers

### Multi-Tenant Isolation
- Every query scoped to `org_id` — enforced at ORM/RLS level
- Cross-tenant data access is a P0 security incident
- Audit log every admin-level action with actor, target, timestamp
- Data export scoped to tenant — never leak cross-tenant data

---

## Security Checklist (Every Project)

1. [ ] Passwords hashed with bcrypt (cost 12+) or Argon2
2. [ ] No secrets in client-side code or git history
3. [ ] CSRF protection on all state-changing operations
4. [ ] Rate limiting on auth endpoints (login: 5/min, signup: 3/min, reset: 2/min)
5. [ ] Account lockout after 10 failed attempts (30-min cooldown)
6. [ ] Secure password reset flow (time-limited token, single-use)
7. [ ] Session invalidation on password change
8. [ ] Email verification before granting full access
9. [ ] 2FA support for enterprise tier (TOTP preferred)
10. [ ] Audit log for sensitive operations (role changes, data export, deletion)

---

## Common Antipatterns (Never Do These)

- Storing tokens in localStorage — XSS exposes them instantly
- Using URL query params for auth tokens — leaked in referrer headers and logs
- Trusting client-sent user IDs — always derive from server session
- Skipping rate limiting on auth endpoints — brute force will happen
- Shared service role keys across environments — isolate per env
- Rolling your own JWT library — use battle-tested libraries (jose, jsonwebtoken)
- Checking permissions only in the UI — server must enforce independently

---

*(Updated by trainer agent — add learnings via `/train`)*
