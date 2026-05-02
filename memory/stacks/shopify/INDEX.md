# Shopify App Knowledge Base — Boldteq Software Factory

> **Stack B:** Remix + Polaris + Prisma + Shopify Billing
> **Maintained by:** Mira (knowledge agent) | **Used by:** All 14 agents
> **Last updated:** 2026-04-04
> **Total:** 53 component files | 16,775 lines | 5 sections

---

## Quick Start

1. **Always load `core/shopify-app.md` first** — foundational rules for every Shopify app
2. **Then load by task:**
   - Building features → `build/` + `api/`
   - Designing UI → `design/`
   - Launching to App Store → `launch/`
   - Looking up API specifics → `api/`

---

## How to Add Knowledge

1. New URL/doc → Extract content → Save raw to `training/raw/YYYY-MM-DD-topic.md`
2. Synthesize into the right component file (e.g., `build/webhooks.md`)
3. Update `training/INDEX.md` with what was processed
4. Update `training/changelog.md` with version bump
5. Sync: `cp -r memory/stacks/shopify/ .claude/memory/stacks/shopify/`

---

## Core (4 files, 996 lines) — Load for EVERY app

| File | Lines | What it covers |
|------|-------|----------------|
| `core/shopify-app.md` | 173 | Foundational rules: Polaris-only, billing, GDPR, folder structure |
| `core/auth.md` | 282 | Token types (offline/online/session), OAuth, token exchange, scopes |
| `core/graphql.md` | 280 | Cost-based rate limits, bulk operations, pagination, REST deprecation |
| `core/config-files.md` | 261 | shopify.app.toml, shopify.web.toml, shopify.extension.toml reference |

---

## Build Phase (16 files, 2,776 lines) — Implementation patterns

| File | Lines | What it covers |
|------|-------|----------------|
| `build/INDEX.md` | 175 | Build phase page map with shopify.dev URLs |
| `build/extensions.md` | 207 | All extension types, targets, extension-only apps |
| `build/admin.md` | 243 | Admin actions (modals), blocks (inline cards), print actions, shouldRender |
| `build/checkout.md` | 259 | Checkout UI extensions, validation, Plus gating, post-purchase |
| `build/online-store.md` | 117 | Theme app extensions, app blocks vs embed blocks, Liquid schema |
| `build/functions.md` | 269 | Shopify Functions (Wasm), <10ms timeout, Rust vs JS, all function APIs |
| `build/data-models.md` | 341 | Product hierarchy, metafields vs metaobjects, bundles, catalogs |
| `build/webhooks.md` | 327 | TOML config, GDPR mandatory, delivery guarantees, async patterns |
| `build/orders.md` | 105 | FulfillmentOrder lifecycle, returns, inventory management |
| `build/subscriptions.md` | 195 | Selling plans, contracts, pay-per-delivery vs prepaid |
| `build/pos.md` | 95 | POS tiles, actions, blocks, cross-platform native |
| `build/b2b.md` | 112 | Companies, catalogs, price lists, quantity rules (Plus only) |
| `build/marketing.md` | 95 | Web pixels, customer segments, marketing activities |
| `build/customer-accounts.md` | 69 | Full-page, order action, inline extensions, sandbox |
| `build/markets.md` | 62 | Multi-market, translations, currencies |
| `build/flow.md` | 105 | Flow triggers and actions (no custom conditions) |

---

## Design Phase (12 files, ~4,500 lines) — UX rules & patterns

| File | Lines | What it covers |
|------|-------|----------------|
| `design/INDEX.md` | 117 | Design phase page map with shopify.dev URLs |
| `design/polaris.md` | 222 | Polaris mandatory rules, component categories, design tokens |
| `design/navigation.md` | 151 | NavMenu, sidebar/header, 1-2 word noun labels, max 7 items |
| `design/layouts.md` | 278 | 5 layout types: single-column, full-width, two-column, settings, immersive |
| `design/states.md` | 266 | Loading (Skeleton), empty (EmptyState+CTA), error (Banner/Toast) |
| `design/accessibility.md` | 260 | WCAG AA, 4.5:1 contrast, keyboard nav, focus management |
| `design/responsive.md` | 278 | Mobile-first, 44×44px touch targets, vertical scroll, breakpoints |
| `design/performance.md` | 227 | Lighthouse ≤10pt impact, JS <10KB, CSS <50KB, 64KB checkout limit |
| `design/content.md` | 319 | Button copy (action verbs), error messages, toast ≤3 words, global language |
| `design/app-patterns.md` | ~550 | **Deep training:** 5 official Polaris layout patterns (Resource Index, Resource Detail, App Settings, Dashboard, Visual Editor), merchant onboarding, billing UI, navigation, feedback/toast, contextual save bar, error handling, 10 anti-patterns |
| `design/storefront-widgets.md` | ~650 | **Deep training:** Theme app extensions (app blocks, app embeds), checkout UI extensions (35+ components), customer account extensions, CSS inheritance from merchant themes, container queries, 6 product page widget patterns (delivery checker, reviews, size guide, trust badges, sticky ATC, recommendations), performance budgets, JS initialization, testing checklist |
| `design/brand-examples.md` | ~600 | **Deep training:** Real UI/UX analysis from 7 top-rated apps (Klaviyo, Judge.me, PageFly, Recharge, Gorgias, Shopify Flow, dropshipping apps), Built for Shopify badge traits, 6 reusable admin layout patterns with Polaris code, component usage frequency, design questions checklist, 11 anti-patterns from merchant reviews |

---

## Launch Phase (9 files, 2,702 lines) — App Store & compliance

| File | Lines | What it covers |
|------|-------|----------------|
| `launch/INDEX.md` | 238 | Launch phase page map with pre-launch checklist |
| `launch/requirements.md` | 307 | 11 BLOCKING App Store requirements |
| `launch/listing.md` | 229 | App Store listing: icon, title, description, screenshots, SEO |
| `launch/billing.md` | 332 | 5 pricing models, Shopify Billing API only, 20% commission |
| `launch/privacy.md` | 323 | GDPR, 3 mandatory webhooks, data minimization, encryption |
| `launch/security.md` | 369 | OWASP Top 10, token encryption, HTTPS, CSP, no hardcoded secrets |
| `launch/review.md` | 312 | Review process, 10 common rejections, resubmission protocol |
| `launch/distribution.md` | 287 | Public vs Custom vs Private, revenue share |
| `launch/built-for-shopify.md` | 305 | Badge requirements, eligibility, benefits |

---

## API Reference (10 files, 6,837 lines) — SDK & API details

| File | Lines | What it covers |
|------|-------|----------------|
| `api/INDEX.md` | 458 | Master API hub: all 15+ Shopify APIs mapped with decision tree |
| `api/polaris.md` | 496 | Complete component list, props, design tokens, web components |
| `api/shopify-cli.md` | 809 | All CLI commands: app init/dev/deploy, generate extension, theme |
| `api/functions.md` | 505 | All 7 function APIs, input/output schemas, Wasm, testing |
| `api/liquid.md` | 800 | Objects, filters, tags, theme extension Liquid, dynamic sources |
| `api/react-router-sdk.md` | 580 | authenticate.admin(), billing helpers, session storage, webhooks |
| `api/admin-graphql.md` | 1221 | Key queries/mutations, billing, bulk operations, rate limits |
| `api/webhooks.md` | 497 | 50+ topics by category, TOML config, HMAC verification, GDPR |
| `api/storefront.md` | 840 | Product/cart queries, customer auth, localization, metafields |
| `api/app-bridge.md` | 631 | React v4.x, NavMenu, modals, toasts, useAppBridge hook |

---

## Training & Raw Data (2 files + 6 raw extracts)

| File | Lines | What it covers |
|------|-------|----------------|
| `training/INDEX.md` | 235 | Processing log: what URLs were extracted and when |
| `training/changelog.md` | 287 | Version history of this knowledge base |
| `training/raw/` | 6 files | Raw extracts from shopify.dev (7,598 lines total) |

---

## Agent Loading Guide

| Agent | What to load | Why |
|-------|-------------|-----|
| **Yash** | `core/shopify-app.md` | Stack B detection, pipeline routing, phase gates |
| **Nova** | `launch/listing.md`, `launch/built-for-shopify.md` | Market research, competitive listing analysis |
| **Arya** | `core/`, `build/data-models.md`, `api/admin-graphql.md` | Architecture, data models, API design |
| **Riko** | `core/config-files.md`, `api/shopify-cli.md` | Scaffold, TOML configs, CLI commands |
| **Vega** | `design/polaris.md`, `design/app-patterns.md`, `design/storefront-widgets.md`, `design/brand-examples.md`, `design/layouts.md`, `design/states.md`, `design/accessibility.md`, `design/responsive.md`, `design/navigation.md`, `design/content.md` | Design specs, visual review, Polaris layout patterns, storefront widget design, brand UI analysis |
| **Koda** | `core/`, `build/`, `api/`, `design/polaris.md` | Implementation — all patterns and APIs |
| **Quill** | `design/content.md`, `launch/listing.md` | UX copy, App Store listing copy |
| **Luna** | `core/shopify-app.md`, `api/functions.md` | Test strategy, function testing |
| **Sage** | `launch/requirements.md`, `launch/security.md`, `launch/privacy.md`, `design/accessibility.md` | Pre-launch audit, compliance |
| **Zeph** | `launch/listing.md`, `design/performance.md` | App Store SEO, performance |
| **Bolt** | `api/shopify-cli.md`, `launch/distribution.md` | Deploy, version management |
| **Hawk** | `core/shopify-app.md`, `api/webhooks.md` | Monitoring, webhook health |
| **Vex** | `core/`, `api/react-router-sdk.md` | Debug auth, API, extension issues |
| **Mira** | All files | Knowledge extraction, memory updates |
