# Pinzo — Brand Kit v1

**Created:** 2026-04-11 (Sync Pass 3, Tier 1 #1a)
**Product:** Pinzo — Shopify app for ZIP-code-gated delivery checking
**Stack:** React Router 7 + Polaris Web Components + Prisma + Shopify Billing
**Anchored to:** `~/Desktop/Boldteq App/Pinzo` (real, 107-line CLAUDE.md, 8 Prisma models, 4 billing tiers in `app/plans.ts`)
**Loaded by:** Quill (copy), Vega (visual), Zeph (SEO/listing), Echo (launch), Sage (brand gate)

---

## 1. Positioning

**One-liner:** The ZIP-check widget that tells shoppers if you deliver to their door — before they hit the cart.

**Longer positioning (Shopify app listing):** Pinzo adds a pre-cart ZIP-code check to your Shopify storefront so local-delivery merchants stop taking orders they can't fulfil. Upload a ZIP list or paste a radius, drop the widget on the product page, and every shopper sees instant delivery eligibility. Built on Polaris, session-token auth, and Shopify billing — zero config, zero middleman, zero cart abandonment from "sorry, we don't ship there".

**Category:** Storefront tools → Page enhancements → Delivery & shipping
**Primary ICP:** Shopify merchants doing local or regional delivery where postal coverage is not a simple country/region filter. Examples: florists, meal kits, bakeries, furniture, cannabis (compliant states), specialty grocery, large/heavy goods.
**Secondary ICP:** Multi-location merchants who want different coverage per store.
**Job-to-be-done:** "Tell me before I check out whether you'll actually deliver to my address, without making me call or DM."

**What Pinzo is NOT** (protect scope):
- Not a tax/VAT calculator.
- Not a shipping rate calculator.
- Not a route optimizer.
- Not a local pickup app.
- Not a international restrictions app (though that's a future extension).

---

## 2. Voice & Tone

**Voice DNA (three words):** *Direct. Merchant-smart. Unfussy.*

Pinzo talks like a senior Shopify support engineer who's configured a thousand stores and has no patience for fluff. Short sentences. Active verbs. Concrete nouns. No "empower", no "unlock", no "seamless". Merchants are busy running stores — every word earns its place.

**Tone by surface:**

| Surface | Tone | Example |
|---|---|---|
| App listing headline | Confident, concrete | "Stop taking orders you can't deliver." |
| In-app onboarding | Calm, instructive | "Paste your ZIP list below. One per line. We'll validate them." |
| Error states | Honest, helpful | "That ZIP isn't in US format. Expected 5 digits or ZIP+4." |
| Success states | Brief, factual | "12,340 ZIPs saved. Widget is live on your product pages." |
| Upgrade prompts | Fair, non-pushy | "You've hit the 20-ZIP free limit. Upgrade to Starter for 500 ZIPs." |
| Support emails | First-person, human | "Hey — Yash here. Saw your ticket on the radius import. Here's the fix:" |
| Marketing emails | Short, concrete, one CTA | No newsletter filler. Each email = one thing worth knowing. |

**Forbidden phrases** (Quill + Sage brand gate blocks these):
- "Seamless", "unlock", "empower", "leverage", "synergy", "robust", "solution", "revolutionize", "game-changing", "cutting-edge", "AI-powered" (unless literally AI), "next-gen", "world-class", "best-in-class".
- "We're excited to announce" → replace with the announcement.
- "Simply" → almost always condescending, delete.
- Exclamation marks in-app (allowed sparingly in marketing, max 1 per 200 words).

**Preferred constructions:**
- "Do X" > "You can do X"
- "Takes 30 seconds" > "Quick and easy"
- "12,340 ZIPs" > "thousands of ZIPs"
- "Free plan: 20 ZIPs" > "Our generous free tier"

**Reading level target:** Grade 7–8 (Hemingway). Merchant copy should never sound like SaaS copy.

---

## 3. Visual Identity

**Palette (Polaris-compatible, admin-native):**
- **Brand primary:** `#1F3A2B` (deep forest — signals reliability + "shipping-box-tape" green)
- **Accent:** `#E4B343` (aged brass — post-office / stamp feel)
- **Success:** Polaris `--p-color-text-success` (inherit)
- **Warning:** Polaris `--p-color-text-warning` (inherit)
- **Critical:** Polaris `--p-color-text-critical` (inherit)
- **Background:** Polaris default (never override)

**Rule:** In Shopify admin, Polaris tokens always win. Brand colors only appear in:
1. Logo / app icon
2. Marketing site
3. App listing hero
4. Storefront widget header bar (customizable, brand is default)

**Typography:**
- **Admin UI:** Polaris default (Inter) — never override.
- **Marketing / listing / widget:** Inter (Polaris parity) + JetBrains Mono for ZIP code displays.
- **Widget ZIP display:** Mono, because ZIPs are data and should look like data.

**Iconography:**
- Lucide React (Polaris-agnostic, matches our other Stack A products)
- For Shopify admin screens, prefer Polaris icons when equivalent exists
- Never mix icon libraries inside one component

**Logo:**
- Wordmark: "pinzo" all lowercase, Inter Semibold, `#1F3A2B`
- Mark: stylized pin inside a postal-cancellation oval (rendered at 32/64/128/512)
- Minimum clearspace: 1x pin height on all sides
- Never: drop shadows, gradients, rotation, recolored versions outside brass/forest

**Widget visual rules** (storefront, merchant-themed):
- Inherits merchant theme fonts and button styles via CSS vars
- Only the "powered by Pinzo" badge uses brand — never the input or button
- Mobile-first, 44px minimum tap targets (WCAG AA)

---

## 4. Terminology Glossary (use these exact terms, consistently)

| Concept | Term | NOT |
|---|---|---|
| A ZIP code | **ZIP** (US) / **postcode** (UK/AU/NZ) / **postal code** (CA, generic international) | "zipcode", "zip", "ZIP code" mixed |
| Upload a list | **import ZIPs** | "upload zipcodes", "add postal list" |
| Delivery zone | **delivery rule** (matches `DeliveryRule` Prisma model) | "zone", "area", "region" |
| Merchant's allowed list | **coverage** | "whitelist", "allowlist" |
| The free cap | **20-ZIP free plan** | "limited free", "trial" |
| The widget on the product page | **delivery check** | "zip checker", "postcode tool" |
| The customer buying | **shopper** | "user", "customer" (in merchant-facing UI) |
| The store owner | **merchant** | "user", "admin" |
| Plans | **Free / Starter / Pro / Ultimate** (matches `app/plans.ts` exactly) | Any renamed variants |
| Unable-to-deliver result | **not covered** | "rejected", "invalid", "unsupported" |
| Eligible-to-deliver result | **covered** | "approved", "valid" |

**Locale rule:** Always match the merchant's country conventions. A UK merchant sees "postcode" in their admin, not "ZIP". Quill writes en-US by default but every locale-visible string goes through `t()`.

---

## 5. Messaging Pillars

Every piece of Pinzo marketing or copy maps to exactly one of these four pillars. If it doesn't map, it gets cut.

1. **"Know before they buy"** — Pre-cart delivery eligibility is the whole value prop. Every failed cart from a non-deliverable address is a merchant support ticket.
2. **"Native to Shopify"** — Built on Polaris, session tokens, Shopify billing. No accounts, no extra dashboards, no data leaving the store. Passes App Store review on day one.
3. **"Your rules, your coverage"** — ZIP lists, radius from store, polygon (future). The merchant owns their logic, Pinzo just enforces it at the edge.
4. **"Fair pricing"** — Free plan real (20 ZIPs, not a trial). Paid plans are flat and predictable — no per-check fees, no usage gotchas, no "starts at" pricing.

---

## 6. Landing Page / App Listing Copy Seeds

**Hero headline (A/B candidates, Quill picks top 2 to test):**
- A: Stop taking orders you can't deliver.
- B: The pre-cart ZIP check for local delivery Shopify stores.
- C: Your shoppers shouldn't find out at checkout that you don't ship there.

**Subheadline:**
Pinzo adds a native Shopify ZIP-code check to your product page. Import your coverage, drop the widget, and every shopper sees delivery eligibility before they add to cart.

**Three-feature strip (Polaris-native bullets):**
1. **Instant coverage check.** Shoppers see "covered" or "not covered" the moment they type their ZIP.
2. **ZIP, radius, or both.** Paste a list, draw a radius from your store, or combine. One UI.
3. **Real free plan.** 20 ZIPs free forever. Flat paid plans, no per-check fees.

**Primary CTA:** `Install from Shopify App Store`
**Secondary CTA:** `Watch 45-second demo`

---

## 7. Brand Gate Checklist (Sage runs this before Bolt ships)

Before any Pinzo-facing asset ships (app listing, email, landing page, in-app copy, screenshot), Sage runs:

- [ ] Voice passes Hemingway Grade 7–8 check
- [ ] Zero forbidden phrases (section 2)
- [ ] Terminology matches glossary (section 4)
- [ ] Maps to exactly one messaging pillar (section 5)
- [ ] Admin UI uses Polaris tokens only; brand colors confined to logo/marketing/widget header
- [ ] Mono font used for ZIP code displays in widget + admin tables
- [ ] No stock photography of "happy shopkeepers" — product shots only
- [ ] Screenshots show real Pinzo data, not "Lorem ZIP"
- [ ] CTA is one of the two canonical CTAs (or explicitly justified alternative)

---

## 8. What's Still Unknown (fill during first real landing page build)

- Founder story angle (is it "I built this because my local bakery lost orders" or different?)
- Exact ICP split: what % of Pinzo merchants are US-only vs international (decides `en-US` vs `en-GB` default in listing)
- Social handles (none yet — register before Bolt ships v1.0)
- Product Hunt launch copy tone (playful vs serious — tbd at Echo's first draft)

These become issues on the Pinzo CLAUDE.md when the first landing page sprint starts.

---

## 9. Version Log

- **v1 — 2026-04-11** — First brand kit, anchored to real Pinzo codebase (107-line CLAUDE.md, `app/plans.ts`, 8 Prisma models, `shopify.app.toml` API v2026-01). No prior artifact to reconcile.
