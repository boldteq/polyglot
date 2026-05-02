# Build: Markets & Internationalization

> Source: shopify.dev/docs/apps/build/markets
> Last extracted: 2026-04-04

## Multi-Market Support Overview

**Purpose:**
- Enable merchants to sell in multiple countries and languages
- Support multiple currencies and localized experiences
- Expand to global audience

### Market Structure

- **Locales:** Language/region combinations (en-US, fr-CA, de-DE)
- **Domains:** Top-level domains or subdomains per market
- **URL paths:** Auto URL paths for locales (shop.com/fr, shop.com/de)
- **Currencies:** Present prices in local currencies when gateway supports

## App Localization Benefits

- **Lower churn:** 5-7% lower user churn in non-English markets
- **Store visibility:** Localized apps featured prominently in App Store and admin
- **Market opportunity:** Only 5-7% of public apps in priority European markets (significant gap)
- **Priority regions:** Europe, Asia-Pacific, Latin America for highest ROI

## Multi-Language & Multi-Currency Implementation

### Language Support

- **Dynamic URLs:** Shopify auto-creates URL paths for published locales
- **Storefront API:** GraphQL Storefront API supports localized experience config
- **Content localization:** Query product data, metadata in customer's language
- **Translation management:** Externalize strings, format, and translate per locale

### Currency Handling

- **Presentment currencies:** Deal with money values in various currencies
- **Local payment:** When gateway supports, present prices in customer's currency
- **GraphQL queries:** Storefront API returns prices in selected market's currency

### Product Localization

- **Market restrictions:** Exclude specific products from specific markets
- **Search & cart:** Hidden from storefront, omitted from search, blocked from cart
- **Catalog management:** Use catalogs to manage market-specific product selections

## App Internationalization Pattern

```
1. Externalize strings (separate from code)
2. Format values (dates, numbers, currency per locale)
3. Translate strings per locale
4. Load translations at runtime based on market context
```

## Pitfalls

- **Currency conversion** — Do not assume single base currency; handle presentment currencies
- **URL structure** — Auto-handled by Shopify but affects app navigation
- **Catalog complexity** — Market-specific product exclusions create maintenance burden
- **Translation maintenance** — Localized apps require ongoing translation management
