# Pinzo — Project Memory

## Project Identity
- **Name:** Pinzo (formerly Zip Code Checker) Shopify App
- **Path:** `/Users/yashbaldha/Desktop/Shopify App/Zip-Code`
- **Framework:** React Router 7 (NOT Remix) via `@shopify/shopify-app-react-router` v1
- **UI:** Shopify Polaris v13.9.5 ONLY
- **DB:** Prisma v6 + SQLite (dev) / PostgreSQL (prod)
- **Node:** ≥20.19

## Key Files
- `CLAUDE.md` — project brain (created, fully detailed)
- `.claude/settings.json` — shared permissions config
- `.claude/settings.local.json` — user-local permission overrides
- `app/shopify.server.ts` — auth setup (`authenticate.admin`)
- `app/db.server.ts` — Prisma singleton (`import db from "~/db.server"`)
- `app/billing.server.ts` — subscription logic
- `app/plans.ts` — plan IDs (Free/Pro/Ultimate)

## Claude Code Setup (Completed 2026-03-12)
All files created dynamically based on actual project structure:
- `CLAUDE.md` — accurate stack info, all models, route patterns
- `.claude/settings.json` — shared permissions
- `.claude/commands/feature.md` — `/feature` command
- `.claude/commands/fix.md` — `/fix` command
- `.claude/commands/review.md` — `/review` command
- `.claude/commands/db.md` — `/db` command
- `.claude/agents/builder.md` — for new feature building
- `.claude/agents/bug-fixer.md` — for debugging
- `.claude/agents/widget-specialist.md` — for storefront widget work

## Prisma Models
ZipCode (shop+zipCode unique), DeliveryRule, WaitlistEntry (shop+email+zipCode unique), WidgetConfig (shop unique), Subscription (shop unique), Session (do not modify)

## Commands
`npm run dev` | `npm run build` | `npm run typecheck` | `npm run lint` | `npx prisma studio` | `npx prisma migrate dev` | `npx shopify app deploy`

## Route Patterns
- `app.*.tsx` → admin pages (require authenticate.admin)
- `api.*.tsx` → public JSON APIs (no auth, served to storefront widget)
- `webhooks.*.tsx` → Shopify webhooks (return 200 always)

## User Preferences
- [Auto push after commits](feedback_auto_push.md) — always push to origin/main after committing
