# Security Requirements — OWASP & Best Practices

> Source: shopify.dev/docs/apps/build/security | shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
> Last extracted: 2026-04-04

## BLOCKING Security Requirements

### 1. OWASP Top 10 Protection

**BLOCKING:** App must be protected against OWASP Top 10 vulnerabilities

Shopify enforces OWASP Top 10 compliance; vulnerabilities found during review = automatic rejection.

| Vulnerability | Description | Prevention |
|---------------|-------------|-----------|
| **Injection** | SQL, command, OS injection attacks | Use parameterized queries, escape inputs, no eval() |
| **Authentication Flaws** | Broken login, weak password reset | Use Shopify OAuth only, secure password hashing |
| **Sensitive Data Exposure** | Unencrypted PII, hardcoded secrets | HTTPS only, encrypt PII, use env vars for secrets |
| **XML External Entities** | XXE attacks through XML parsing | Disable external entity processing, use safe parsers |
| **Broken Access Control** | Users access data they shouldn't | Verify permissions on every request, use RLS |
| **Security Misconfiguration** | Default credentials, verbose errors | Update dependencies, minimal permissions, generic errors |
| **XSS (Cross-Site Scripting)** | Inject malicious JavaScript | Escape output, use Content Security Policy (CSP) |
| **Insecure Deserialization** | Untrusted object deserialization | Avoid deserializing untrusted data, use safe parsers |
| **Using Old/Vulnerable Components** | Libraries with known vulnerabilities | Run `npm audit`, update dependencies regularly |
| **Insufficient Logging/Monitoring** | Can't detect or investigate breaches | Log security events, monitor for anomalies |

### 2. Access Token Encryption

**BLOCKING:** Encrypt access tokens in database storage

**Why:** If database compromised, encrypted tokens are useless

**Implementation:**
```typescript
// Prisma schema
model Session {
  id          String  @id
  shop        String
  accessToken String  // Encrypted in database
  @@index([shop])
}

// Encryption at rest (database handles automatically)
// Use: encryption-at-rest plugin or database native encryption

// In code:
import crypto from "crypto";

function encryptToken(token: string): string {
  const cipher = crypto.createCipher("aes-256-cbc", process.env.ENCRYPTION_KEY);
  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decryptToken(encrypted: string): string {
  const decipher = crypto.createDecipher("aes-256-cbc", process.env.ENCRYPTION_KEY);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

### 3. Secure Transmission

**BLOCKING:** All data must use TLS/HTTPS

**Requirements:**
- No unencrypted HTTP for any communication
- Enforce HTTPS redirects (301 to https://)
- Use secure headers

**Secure Headers:**
```typescript
// Remix loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Security headers
  const headers = new Headers();
  headers.set("Strict-Transport-Security", "max-age=31536000"); // Force HTTPS
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN"); // Allow Shopify embedding
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return json({ data }, { headers });
};
```

### 4. Authentication & Authorization

**BLOCKING:** Use Shopify OAuth only; no custom authentication

**OAuth Implementation:**
```typescript
// ✅ CORRECT — Shopify OAuth
import { shopifyApp } from "@shopify/shopify-app-remix/server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  // ... rest of config
});

export const { authenticate } = shopify;

// ✅ CORRECT — Validate state parameter (CSRF protection)
const { admin, session } = await authenticate.admin(request);
// Shopify automatically validates state

// ❌ WRONG — Custom authentication
const user = parseCustomJWT(token); // Don't do this
```

### 5. Access Control (Row-Level Security)

**BLOCKING:** Verify user permissions before data access

**Implementation:**
```typescript
// ✅ CORRECT — Verify shop ownership on every request
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop; // Only source of truth for shop identity

  // Query only this shop's data
  const products = await prisma.product.findMany({
    where: { shop }, // ALWAYS filter by shop
  });

  return json({ products });
}

// ❌ WRONG — Trust user input for shop ID
const shopId = new URL(request.url).searchParams.get("shop");
const products = await prisma.product.findMany({
  where: { shopId }, // Security hole!
});
```

### 6. API Rate Limiting

**BLOCKING:** Implement rate limiting; respect Shopify API limits

**Implementation:**
```typescript
// Respect Shopify's rate limits
// Query cost tracking (check response headers)
const apiLimit = response.headers["x-request-id-queue-time"];

// Exponential backoff for retries
async function apiCallWithRetry(query: string, maxRetries: number = 3) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await shopify.api.graphql(query);
    } catch (error) {
      if (error.status === 429) {
        // Too many requests
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s...
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } else {
        throw error;
      }
    }
  }

  throw new Error("Max retries exceeded");
}
```

### 7. Protected Customer Data

**BLOCKING:** Additional protections for PII (names, emails, phone, order history)

See privacy.md for detailed requirements:
- Minimal data collection
- Secure storage (encryption)
- Transparent disclosure
- Proper deletion on request
- Compliance webhooks

### 8. Third-Party Dependencies

**BLOCKING:** No libraries with known security vulnerabilities

**Best Practices:**
```bash
# Audit dependencies before deployment
npm audit

# Update packages regularly
npm update

# Remove unused dependencies
npm prune

# Use npm ci for consistent installs
npm ci
```

### 9. Input Validation

**BLOCKING:** Validate all user input (frontend + backend)

**Implementation:**
```typescript
// ✅ CORRECT — Validate on backend
import { z } from "zod";

const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.number().positive(),
  description: z.string().max(5000).optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const input = Object.fromEntries(formData);

  // Validate input
  const validation = createProductSchema.safeParse(input);
  if (!validation.success) {
    return json({ error: "Invalid input" }, { status: 400 });
  }

  // Process validated data
  const product = await createProduct(validation.data);
  return json({ product });
}

// ❌ WRONG — No validation
const product = await createProduct({
  name: input.name,
  price: input.price, // Could be negative, non-numeric
});
```

### 10. Error Handling

**BLOCKING:** Don't expose sensitive information in error messages

**Implementation:**
```typescript
// ✅ CORRECT — Generic error to user, detailed log for debugging
try {
  await database.query(sql);
} catch (error) {
  // Log detailed error (secure, internal)
  console.error("Database error:", error.message, error.stack);

  // Return generic error to user
  return json(
    { error: "An error occurred. Please try again." },
    { status: 500 }
  );
}

// ❌ WRONG — Expose sensitive details
return json(
  { error: `Database error: ${error.message}` },
  { status: 500 }
);
```

---

## Security Testing Requirements

### Before Submission

**BLOCKING:** Conduct security review before App Store submission

1. **Code Review** — Review for OWASP vulnerabilities
2. **Dependency Audit** — `npm audit`, check for known vulnerabilities
3. **Penetration Testing** — Try to break your app
4. **Security Scan** — Use automated tools (SNYK, npm audit, etc.)

### During Review

- Shopify security team may test app
- Vulnerabilities found = rejection + required fixes
- May request security documentation or audit results

---

## Secure Coding Practices

### Database Security
```typescript
// ✅ CORRECT — Parameterized queries (Prisma handles this)
const product = await prisma.product.findUnique({
  where: { id: productId }, // Parameterized
});

// ❌ WRONG — String concatenation (SQL injection risk)
const product = await db.query(`SELECT * FROM products WHERE id = ${id}`);
```

### CSRF Protection
```typescript
// ✅ CORRECT — Shopify handles CSRF token validation
// @shopify/shopify-app-remix automatically validates state parameter
```

### Content Security Policy
```typescript
// ✅ CORRECT — CSP headers
headers.set(
  "Content-Security-Policy",
  "default-src 'self'; script-src 'self' 'unsafe-inline' shopify.com; frame-ancestors 'self' https://admin.shopify.com"
);
```

### Secrets Management
```typescript
// ✅ CORRECT — Use environment variables
const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;

// ❌ WRONG — Hardcode secrets
const apiKey = "shppa_1234567890abcdef";
const apiSecret = "secret123";
```

---

## Incident Response Plan

1. **Detection** — Monitor for security anomalies
2. **Response** — Isolate affected systems
3. **Communication** — Notify merchants if data exposed
4. **Fixes** — Patch vulnerability
5. **Verification** — Confirm fix works
6. **Documentation** — Document incident and learnings

---

## Security Checklist

- [ ] Use Shopify OAuth only (no custom auth)
- [ ] Validate OAuth state parameter (CSRF protection)
- [ ] Encrypt access tokens in database
- [ ] Use HTTPS only (no unencrypted HTTP)
- [ ] Secure headers configured (HSTS, CSP, etc.)
- [ ] All inputs validated (frontend + backend)
- [ ] No SQL injection vulnerabilities (use parameterized queries)
- [ ] Sensitive data not in error messages
- [ ] Sensitive data not in logs
- [ ] No hardcoded secrets (use env vars)
- [ ] Dependencies audited (`npm audit` clean)
- [ ] All dependencies updated (no outdated packages)
- [ ] Access control verified (RLS, shop filtering)
- [ ] API rate limiting implemented
- [ ] PII encrypted at rest
- [ ] PII transmitted over HTTPS only
- [ ] No unused dependencies
- [ ] X-Frame-Options header allows Shopify embedding
- [ ] Content Security Policy configured
- [ ] Penetration testing completed

---

## References

- **Security Guide:** https://shopify.dev/docs/apps/build/security
- **OWASP Top 10:** https://shopify.dev/docs/apps/build/security/protect-against-common-vulnerabilities
- **Secure Headers:** https://developer.mozilla.org/en-US/docs/Glossary/CSRF
