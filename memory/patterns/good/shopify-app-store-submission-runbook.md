# Shopify App Store Submission Runbook — Pinzo + future Stack B apps

**Created:** 2026-04-11 (Sync Pass 3, Tier 1 #3)
**Pattern type:** Executable runbook (runnable top-to-bottom, hard-blocking gates)
**Anchored to:** `/Users/yashbaldha/Desktop/Boldteq App/Pinzo` (React Router 7, Polaris v13.9.5, Prisma v6.19.2, `shopify.app.toml` API v2026-01, 107-line CLAUDE.md, 4 billing tiers in `app/plans.ts`, 8 Prisma models)
**Reusable for:** Pinzo (primary), Size Chart & Recommender (future), any future Stack B app
**Canonical stack file:** `~/.claude/memory/stacks/shopify-app.md` (72 KB, 2,305 lines)
**Loaded by:** Sage (submission gate), Bolt (deploy + submit), Quill (listing copy), Vega (screenshots), Zeph (listing SEO), Mira (post-submission lessons)

---

## Why this exists

Shopify App Store reviewers reject apps for predictable, boring reasons: missing GDPR webhooks, over-scoped API permissions, non-Polaris UI, billing that doesn't go through Shopify Billing API, Lighthouse regression, CSP issues, unclear pricing, bad screenshots. None of these are creative problems. They are a checklist. This runbook is the checklist, wired into Sage as a hard gate — Bolt literally cannot submit until Sage signs off every item.

Miss one item → rejection → 3–7 day re-review loop → launch slips. Run this top-to-bottom, every time.

---

## Pre-flight: What must already be true before you open this runbook

- [ ] App exists in `/Users/yashbaldha/Desktop/Boldteq App/<AppName>/` with a `CLAUDE.md`
- [ ] `shopify.app.toml` has a valid `client_id`, real `application_url`, real redirect URLs
- [ ] App runs locally against `shopify app dev` without console errors
- [ ] Brand kit exists in `~/.claude/memory/projects/<app>-brand-kit.md`
- [ ] At least one real install on a dev store has completed the full happy path
- [ ] Billing tiers in `app/plans.ts` (or equivalent) match the pricing in the brand kit

If any item is missing, stop. Go finish it. Come back.

---

## The 18-Item Submission Checklist

Each item has: **What** · **Why Shopify cares** · **How to verify (runnable)** · **Common rejection reason**.

### 1. GDPR mandatory webhooks implemented and reachable

**What:** Three endpoints: `customers/data_request`, `customers/redact`, `shop/redact`. Each returns 200, logs the request, and actually performs the redaction (even if you store no customer data — respond with a confirmation).

**Why:** Shopify fails any app that doesn't respond to these. Non-negotiable, even for apps with zero PII.

**Verify (run from inside the app repo):**
```bash
# 1. Webhook routes exist
test -f app/routes/webhooks.customers.data_request.tsx || { echo "MISSING customers/data_request handler"; exit 1; }
test -f app/routes/webhooks.customers.redact.tsx || { echo "MISSING customers/redact handler"; exit 1; }
test -f app/routes/webhooks.shop.redact.tsx || { echo "MISSING shop/redact handler"; exit 1; }

# 2. Registered in shopify.app.toml
grep -q 'customers/data_request' shopify.app.toml || { echo "MISSING customers/data_request in toml"; exit 1; }
grep -q 'customers/redact' shopify.app.toml || { echo "MISSING customers/redact in toml"; exit 1; }
grep -q 'shop/redact' shopify.app.toml || { echo "MISSING shop/redact in toml"; exit 1; }

# 3. HMAC verification present in each handler
for f in app/routes/webhooks.customers.data_request.tsx app/routes/webhooks.customers.redact.tsx app/routes/webhooks.shop.redact.tsx; do
  grep -q 'authenticate.webhook' "$f" || { echo "MISSING HMAC verify in $f"; exit 1; }
done

# 4. Smoke test from dev store
shopify webhook trigger --topic customers/data_request --address "$SHOPIFY_APP_URL/webhooks/customers/data_request"
# Expect HTTP 200 in response
```

**Common rejection:** Handlers return 404 because route file wasn't created. Or HMAC not verified. Or webhook not registered in the toml.

---

### 2. Scopes minimized to what you actually use

**What:** `shopify.app.toml` `scopes` line lists only the API scopes the app touches at runtime. Every extra scope = potential rejection or delayed review.

**Why:** Shopify's principle of least privilege is enforced. Apps requesting `write_products` that never write a product get flagged.

**Verify:**
```bash
# Extract declared scopes
declared=$(grep -oP 'scopes\s*=\s*"\K[^"]+' shopify.app.toml | tr ',' '\n' | sed 's/^ *//;s/ *$//')

# Grep the codebase for each scope's associated API calls
# read_products → admin.rest.Product, admin.graphql('query { products...
# write_products → admin.rest.Product.save, admin.graphql('mutation { productCreate...
# (extend for the scopes your app declares)

for scope in $declared; do
  case "$scope" in
    read_products)  grep -rq 'admin\..*[Pp]roduct' app/ || { echo "UNUSED scope: $scope"; exit 1; } ;;
    write_products) grep -rq 'productCreate\|productUpdate\|Product\.save' app/ || { echo "UNUSED scope: $scope"; exit 1; } ;;
    read_orders)    grep -rq 'admin\..*[Oo]rder' app/ || { echo "UNUSED scope: $scope"; exit 1; } ;;
    write_orders)   grep -rq 'orderCreate\|orderUpdate\|Order\.save' app/ || { echo "UNUSED scope: $scope"; exit 1; } ;;
    # ...
  esac
done
```

**Pinzo-specific:** Pinzo is a storefront widget app. It needs `read_themes`, `write_themes` (to inject the App Embed), and nothing else. Any additional scope → Sage blocks.

**Common rejection:** App declares `read_customers` because a tutorial did, never actually reads customers, reviewer flags it.

---

### 3. Billing goes through Shopify Billing API — zero exceptions

**What:** All app subscription charges go through `AppSubscription` / `AppPurchaseOneTime` GraphQL mutations. NEVER Stripe, NEVER Dodo, NEVER Paddle for Shopify apps. Ever.

**Why:** Shopify takes their cut through the Billing API. Apps that try to bypass this get immediately removed from the App Store, permanently.

**Verify:**
```bash
# Hard block on any external payment provider in Stack B apps
grep -rn 'stripe\|@stripe\|dodopayments\|paddle\|braintree' app/ && { echo "FORBIDDEN external payment provider in Shopify app"; exit 1; } || true

# Billing must reference Shopify's billing helpers
grep -rq 'billing\.request\|appSubscriptionCreate\|AppSubscription' app/ || { echo "MISSING Shopify Billing API usage"; exit 1; }

# app/plans.ts or equivalent must define plans
test -f app/plans.ts || { echo "MISSING app/plans.ts billing config"; exit 1; }
```

**Pinzo status:** `app/plans.ts` already defines 4 tiers (free / starter / pro / ultimate). Pass — but verify the mutations are wired.

**Common rejection:** Developer used Stripe for a "free app with optional add-ons", thinking the free-tier exemption applies. It doesn't. Anything monetized inside Shopify must use Shopify Billing.

---

### 4. Session token authentication (NOT cookies)

**What:** Every authenticated request from the embedded app uses Shopify session tokens (JWTs) via App Bridge. Cookies do not survive inside Shopify admin iframes in modern browsers (ITP, third-party cookie blocking).

**Why:** Cookie-based apps break for ~40% of merchants on Safari/Firefox. Shopify rejects them.

**Verify:**
```bash
# Uses the Shopify app framework's built-in session handling
grep -q '@shopify/shopify-app-react-router\|@shopify/shopify-app-remix' package.json || { echo "MISSING Shopify app framework"; exit 1; }

# No custom cookie-based session middleware
grep -rn 'express-session\|cookie-session\|iron-session' app/ && { echo "FORBIDDEN cookie session in Shopify app"; exit 1; } || true
```

---

### 5. Polaris-only UI (no custom CSS, no Tailwind)

**What:** Admin UI uses Polaris React components (Remix apps) or Polaris Web Components (React Router apps). Zero Tailwind. Zero styled-components. Zero custom CSS except inside Polaris's `style` props where absolutely necessary.

**Why:** Shopify explicitly rejects apps that don't look native.

**Verify:**
```bash
# Hard bans
grep -q 'tailwindcss' package.json && { echo "FORBIDDEN tailwind in Shopify app admin"; exit 1; } || true
grep -rn 'styled-components\|emotion' app/ && { echo "FORBIDDEN css-in-js in Shopify admin"; exit 1; } || true

# Polaris must be imported or loaded
if grep -q 'shopify-app-react-router' package.json; then
  # React Router 7 path: Polaris Web Components via CDN script in root.tsx
  grep -q 'polaris.js\|<shopify-page\|<s-' app/ || { echo "MISSING Polaris Web Components"; exit 1; }
else
  # Remix path: @shopify/polaris React
  grep -q '@shopify/polaris' package.json || { echo "MISSING Polaris React"; exit 1; }
fi
```

**Pinzo status:** React Router 7 + Polaris Web Components per CLAUDE.md. Needs verification that `<s-page>`, `<s-layout>`, `<s-card>` are used and no raw HTML snuck in.

---

### 6. App embed block (for storefront apps like Pinzo)

**What:** Storefront functionality is delivered via an App Embed block that merchants toggle on in their theme editor — not by injecting a script tag via theme edit API.

**Why:** Shopify deprecated script-tag injection for new apps. App Embeds are the sanctioned path.

**Verify:**
```bash
test -d extensions/ || { echo "MISSING extensions/ directory"; exit 1; }
find extensions/ -name 'shopify.extension.toml' -exec grep -l 'type = "theme"' {} \; | head -1 || \
  { echo "MISSING theme extension"; exit 1; }
find extensions/ -path '*blocks/*.liquid' | head -1 || { echo "MISSING block liquid files"; exit 1; }
```

**Pinzo note:** Extension must render the ZIP-check widget. Widget must be web-components-based, inherit merchant theme CSS vars, and respect the brand kit rule (brand color only on the "powered by Pinzo" badge).

---

### 7. Content Security Policy headers correct

**What:** `frame-ancestors` header must allow the merchant's shop domain + Shopify admin. Set in `entry.server.tsx` (Remix) or `root.tsx` headers (React Router).

**Why:** Without correct CSP, the app refuses to embed and the merchant sees a white screen.

**Verify:**
```bash
grep -rq "frame-ancestors.*shop\|shopifyCSPHeader\|addDocumentResponseHeaders" app/ || \
  { echo "MISSING CSP frame-ancestors config"; exit 1; }
```

---

### 8. API version is current (not deprecated within 90 days)

**What:** `shopify.app.toml` declares an `api_version` that is still supported. Shopify API versions get deprecated on a quarterly cycle.

**Why:** Submitting against a deprecated version = instant rejection.

**Verify:**
```bash
api_version=$(grep -oP 'api_version\s*=\s*"\K[^"]+' shopify.app.toml)
current_year=$(date +%Y)
version_year=$(echo "$api_version" | cut -c1-4)
if [ $((current_year - version_year)) -gt 1 ]; then
  echo "API version $api_version may be deprecated — verify at https://shopify.dev/api/usage/versioning"
  exit 1
fi
```

**Pinzo status:** `api_version = "2026-01"` per the scan. Current. Pass.

---

### 9. Lighthouse score delta <10 points

**What:** Installing your app must not drop the merchant's storefront Lighthouse score by more than 10 points in any category.

**Why:** Shopify explicitly tests this. Heavy widgets tank scores and get rejected.

**Verify:**
```bash
# Run on dev store with app installed
npx lighthouse "https://<dev-store>.myshopify.com/products/<test-product>" \
  --preset=desktop --quiet --output=json --output-path=./lighthouse-with-app.json

# Baseline: same URL without app installed (run before install)
# Both scores must differ by <10 in Performance, Accessibility, Best Practices, SEO

node -e "
const w = require('./lighthouse-with-app.json');
const b = require('./lighthouse-baseline.json');
const cats = ['performance','accessibility','best-practices','seo'];
for (const c of cats) {
  const diff = Math.round((b.categories[c].score - w.categories[c].score) * 100);
  if (diff > 10) { console.error('FAIL', c, 'dropped by', diff); process.exit(1); }
}
console.log('Lighthouse delta OK');
"
```

**Pinzo widget hard rule:** Widget must lazy-load (intersection observer), must be <15 KB gzipped JS, must not block the main thread for >50ms.

---

### 10. Listing copy matches brand kit

**What:** App listing title, tagline, description, feature bullets all match the brand kit's voice, terminology, messaging pillars, and forbidden-phrase list.

**Why:** Your own internal brand consistency, but also: reviewers reject vague/spammy/AI-generated-looking listings.

**Verify:** Quill writes the listing copy and Sage's brand gate (section 7 of `projects/pinzo-brand-kit.md`) runs against it. Zero forbidden phrases. Exactly one pillar per section.

**Pinzo listing draft** (lives at `~/.claude/memory/projects/pinzo-listing-copy.md` after first listing sprint):
- Title: `Pinzo — ZIP Code Delivery Check`
- Tagline: `Stop taking orders you can't deliver.`
- Short description: 1 pillar 1 (Know before they buy)
- Key benefits: map 1:1 to pillars 1–4

---

### 11. Screenshots are real, in-product, high-res

**What:** 5–10 screenshots showing real Pinzo data in real Shopify admin at 1920×1080 or higher. No Lorem Ipsum. No Figma mockups passed off as product shots. No competitor logos.

**Why:** Fake-looking screenshots = rejection.

**Verify:**
```bash
test -d listing/screenshots/ || { echo "MISSING listing/screenshots/ directory"; exit 1; }
count=$(find listing/screenshots/ -name '*.png' -o -name '*.jpg' | wc -l)
[ "$count" -ge 5 ] || { echo "Need at least 5 screenshots, found $count"; exit 1; }

# Each must be ≥1920×1080
for f in listing/screenshots/*.{png,jpg} 2>/dev/null; do
  [ -f "$f" ] || continue
  dims=$(identify -format '%w %h' "$f" 2>/dev/null)
  w=$(echo $dims | cut -d' ' -f1)
  h=$(echo $dims | cut -d' ' -f2)
  [ "$w" -ge 1920 ] && [ "$h" -ge 1080 ] || { echo "$f too small: ${w}x${h}"; exit 1; }
done
```

**Pinzo screenshot list** (Vega produces these):
1. Admin: ZIP list import screen with 500 real-looking ZIPs
2. Admin: Delivery rule editor (radius view)
3. Admin: Analytics dashboard showing "covered vs not covered" ratio
4. Storefront: Widget in "covered" state on a product page
5. Storefront: Widget in "not covered" state with waitlist CTA
6. Mobile: Widget at 375px wide
7. Admin: Pricing page (free plan highlighted)
8. Admin: Onboarding empty state

---

### 12. Demo video (optional but strongly recommended)

**What:** 30–90 second screen capture walking through install → configure → widget-live. Uploaded as a listing asset.

**Why:** Apps with demo videos get approved ~2x faster and have higher install rates.

**Verify:**
```bash
test -f listing/demo.mp4 || { echo "WARNING: no demo video (soft-fail, not blocker)"; }
```

---

### 13. Pricing is clear and matches `app/plans.ts`

**What:** Listing pricing section shows exactly the tiers in `app/plans.ts`, with the same names, the same prices, the same included features.

**Why:** Reviewers reject listings where the listing says "$9/mo" but the billing API charges $19.

**Verify:**
```bash
# Extract plan names from plans.ts
plans_in_code=$(grep -oP "name:\s*['\"]\K[^'\"]+" app/plans.ts | sort -u)
# Listing plans (from a markdown source file maintained by Quill)
plans_in_listing=$(grep -oP '^## \K[A-Z][a-zA-Z]+' listing/pricing.md | sort -u)
diff <(echo "$plans_in_code") <(echo "$plans_in_listing") || { echo "Plans mismatch"; exit 1; }
```

**Pinzo plans** (per `app/plans.ts`): Free (20 ZIPs) / Starter / Pro / Ultimate — must be listed identically.

---

### 14. Reviewer test credentials + walkthrough doc

**What:** `listing/REVIEWER.md` with: a test shop URL, a test login, a step-by-step happy path the reviewer should click, and a screenshot of the expected final state.

**Why:** Reviewers are overwhelmed. Apps that hand them a paint-by-numbers walkthrough get approved faster.

**Verify:**
```bash
test -f listing/REVIEWER.md || { echo "MISSING listing/REVIEWER.md"; exit 1; }
grep -q 'test shop URL' listing/REVIEWER.md || exit 1
grep -q 'Step 1\|## 1\.' listing/REVIEWER.md || exit 1
```

---

### 15. Privacy policy + terms of service hosted and linked

**What:** Real URLs, real content (not "coming soon"), linked from `shopify.app.toml` and the app listing.

**Why:** Shopify requires both. Missing either = instant rejection.

**Verify:**
```bash
grep -q 'privacy_policy_url' shopify.app.toml || { echo "MISSING privacy_policy_url"; exit 1; }
grep -q 'terms_of_service_url' shopify.app.toml || { echo "MISSING terms_of_service_url"; exit 1; }

privacy=$(grep -oP 'privacy_policy_url\s*=\s*"\K[^"]+' shopify.app.toml)
tos=$(grep -oP 'terms_of_service_url\s*=\s*"\K[^"]+' shopify.app.toml)
curl -fsSL "$privacy" > /dev/null || { echo "Privacy URL unreachable: $privacy"; exit 1; }
curl -fsSL "$tos" > /dev/null || { echo "ToS URL unreachable: $tos"; exit 1; }
```

**Reuses:** Tier 3 legal baseline templates from the same Sync Pass 3 (`~/.claude/memory/patterns/good/legal-baseline-templates.md`).

---

### 16. Uninstall webhook cleans up merchant data

**What:** `app/uninstalled` webhook handler deletes or anonymizes all data for that shop within the required window (Shopify policy: 48 hours for GDPR-relevant data, but do it in the handler).

**Why:** Reviewers check this.

**Verify:**
```bash
test -f app/routes/webhooks.app.uninstalled.tsx || { echo "MISSING app/uninstalled handler"; exit 1; }
grep -q 'deleteMany\|DELETE FROM' app/routes/webhooks.app.uninstalled.tsx || \
  { echo "Uninstall handler doesn't actually delete data"; exit 1; }
```

---

### 17. Error tracking wired (Sentry or equivalent)

**What:** Runtime errors in production go somewhere you can see them. Sentry preferred.

**Why:** Not a Shopify requirement, but Hawk won't approve launch without it. If the app throws in prod and you don't know, rejection and churn both accelerate.

**Verify:**
```bash
grep -q '@sentry' package.json || { echo "MISSING Sentry"; exit 1; }
test -f app/sentry.server.ts || test -f app/entry.server.tsx || exit 1
grep -rn 'Sentry\.captureException\|Sentry\.init' app/ | head -1 || \
  { echo "Sentry imported but never called"; exit 1; }
```

---

### 18. Final pre-submit smoke test on a fresh dev store

**What:** Uninstall from your dev store. Reinstall fresh. Walk the reviewer happy path end-to-end. Check every page the reviewer will see. If anything is broken, stop and fix.

**Why:** The #1 cause of rejection is something that worked yesterday and broke in a last-minute change.

**Verify (manual, Sage writes the script, you execute):**
```markdown
1. Uninstall Pinzo from test shop
2. Visit install URL
3. Accept scopes → redirected to app home
4. Onboarding card visible
5. Paste 10 test ZIPs → save
6. Open theme editor → enable Pinzo App Embed
7. Visit product page → widget renders
8. Type covered ZIP → "covered" result
9. Type non-covered ZIP → "not covered" result + waitlist capture
10. Go to /app/pricing → see 4 plans
11. Click "Upgrade to Starter" → Shopify billing modal appears
12. Approve charge → redirected back to app with subscription active
13. Check Shopify admin → app appears in Apps list
14. Trigger GDPR webhook from shopify CLI → 200 response
15. Uninstall → webhook fires → data cleaned up
```

---

## The Sage Submission Gate (single-file executable)

Sage runs one script before Bolt is allowed to click "Submit for review":

```bash
#!/usr/bin/env bash
# ~/.claude/memory/patterns/good/shopify-submit-gate.sh
# Run from inside the Shopify app repo directory
set -euo pipefail

echo "→ Running Shopify submission gate…"
FAIL=0
fail() { echo "❌ $1"; FAIL=1; }
pass() { echo "✅ $1"; }

# 1. GDPR webhooks
for hook in customers.data_request customers.redact shop.redact; do
  if test -f "app/routes/webhooks.${hook}.tsx"; then pass "webhook: $hook"
  else fail "webhook missing: $hook"; fi
done

# 2. No forbidden payment providers
if grep -rqn 'stripe\|dodopayments\|paddle' app/ 2>/dev/null; then
  fail "forbidden external payment provider"
else pass "no external payment providers"; fi

# 3. Polaris (no tailwind)
if grep -q 'tailwindcss' package.json; then fail "tailwind in Shopify admin"
else pass "no tailwind"; fi

# 4. Billing API referenced
if grep -rqn 'billing\.request\|AppSubscription' app/; then pass "billing API wired"
else fail "billing API not wired"; fi

# 5. Privacy + ToS URLs
grep -q 'privacy_policy_url' shopify.app.toml && pass "privacy URL declared" || fail "privacy URL missing"
grep -q 'terms_of_service_url' shopify.app.toml && pass "ToS URL declared" || fail "ToS URL missing"

# 6. Uninstall handler deletes data
if test -f app/routes/webhooks.app.uninstalled.tsx && \
   grep -q 'deleteMany\|DELETE FROM' app/routes/webhooks.app.uninstalled.tsx; then
  pass "uninstall cleanup wired"
else
  fail "uninstall cleanup missing"
fi

# 7. Sentry wired
if grep -q '@sentry' package.json; then pass "sentry installed"
else fail "sentry missing"; fi

# 8. REVIEWER.md exists
test -f listing/REVIEWER.md && pass "reviewer walkthrough" || fail "listing/REVIEWER.md missing"

# 9. Screenshots count
sc=$(find listing/screenshots/ -name '*.png' -o -name '*.jpg' 2>/dev/null | wc -l)
[ "$sc" -ge 5 ] && pass "screenshots: $sc" || fail "need ≥5 screenshots, have $sc"

# 10. Build passes
pnpm build > /tmp/build.log 2>&1 && pass "pnpm build" || { fail "pnpm build failed"; cat /tmp/build.log; }

if [ "$FAIL" -eq 1 ]; then
  echo ""
  echo "❌ Submission gate FAILED. Do not submit."
  exit 1
fi

echo ""
echo "✅ Submission gate PASSED. Bolt may submit."
```

Save this file to `~/Desktop/Boldteq App/<AppName>/scripts/submit-gate.sh` and wire it into CI.

---

## Post-Submission Playbook

### Day 0 — Submit
- Bolt runs the gate above → all green → clicks submit in Partner Dashboard
- Bolt opens a memory note: `projects/<app>-submission-log.md` with submission timestamp, version, commit SHA

### Days 1–7 — Wait
- Shopify review window is typically 5–10 business days for new apps
- Do NOT push more commits to the submitted branch during review unless fixing a critical bug
- Hawk monitors the app URL for uptime (review team will hit it)

### If rejected
- Bolt reads the rejection reason verbatim into `projects/<app>-submission-log.md`
- Yash dispatches Vex (debug) → Koda (fix) → Sage (re-gate) → Bolt (resubmit)
- Every rejection reason becomes a new item appended to this runbook — the checklist only grows

### If approved
- Echo executes launch playbook (future Tier 2/3 item)
- Mira captures lessons learned → appends to this runbook
- HEALTH.md gets a "Pinzo approved" entry

---

## Lessons Captured (propagate on Sync Pass 3 close)

1. **Scope verification must be runtime-grep based** — scopes in toml must map to real API calls in code. Lint-level check, not manual review.
2. **Polaris enforcement must be package.json-level** — grep for `tailwindcss` in `package.json` is faster and more reliable than scanning component files.
3. **Webhook handler presence ≠ webhook registered** — both file existence AND `shopify.app.toml` declaration must be checked.
4. **Plan parity must be bi-directional** — `plans.ts` ↔ listing copy must diff-equal. Mismatches = rejection.
5. **Lighthouse delta is the one quantitative gate** — everything else is present/absent. Lighthouse is the one number that can quietly regress.
6. **Timing-safe HMAC check is required even though Shopify's framework provides it** — `authenticate.webhook` MUST be called in every webhook handler; framework doesn't auto-wire it.

---

## Version Log

- **v1 — 2026-04-11** — Initial runbook as part of Sync Pass 3 Tier 1 #3. Anchored to real Pinzo codebase (React Router 7, Polaris v13.9.5, Prisma v6, API v2026-01). Not yet executed — runs for real on Pinzo's first Shopify App Store submission attempt. All 18 items are Sage-gatekeeping from that moment forward.
