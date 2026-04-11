---
name: Clientloop
description: ManyRequests-style SaaS for productized agencies. Phase 1 UI shell complete, deploy deferred, gated on Phase 15 validation.
type: project
status: active
stack: Stack A-16 (Next.js 16 + shadcn base-nova + Tailwind v4)
path: ~/Clientloop
last_updated: 2026-04-10
---

# Clientloop

## Summary

ManyRequests-style SaaS for productized agencies — client portal, request inbox, services catalog, billing, team. Validated across **22 phases** in the Boldteq dossier (`ManyRequestsDossier.jsx`, referenced inline in the plan). Dossier returned a **conditional GO** with a **HARD GATE at Phase 15**: 300 waitlist signups + 10 paid LOIs before writing backend code.

**Yash intentionally overrode the gate to build a UI shell as the validation asset itself** — a clickable prototype for LOI sales calls. That is Phase 1.

## Current phase

**Phase 1 UI shell complete, not deployed (deferred by user).** Sage approved. Code sealed at `~/Clientloop`.

## Stack

See `~/.claude/memory/stacks/saas-nextjs-16.md` for the full stack reference. Summary:

- Next.js 16.2.3 (App Router) + React 19.2.4
- TypeScript strict + `noUncheckedIndexedAccess` + `noImplicitReturns`
- Tailwind v4 CSS-first (tokens in `app/globals.css`)
- shadcn/ui **base-nova** style (`render` prop, not `asChild`)
- pnpm 10.33.0
- Mock data only — no backend, no auth, no payments, no AI

## Routes built (10)

1. `/` → redirects to `/dashboard`
2. `/dashboard` — KPIs, quick actions, SLA warnings, activity feed
3. `/inbox` — request table + Kanban toggle + filter bar
4. `/clients` — clients table + new client dialog
5. `/services` — services table + new service dialog
6. `/settings/general`
7. `/settings/billing`
8. `/settings/team`
9. `/settings/notifications`
10. `/not-found` — branded 404

## File structure

```
~/Clientloop/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                        // redirect → /dashboard
│   ├── not-found.tsx
│   ├── globals.css                     // Tailwind v4 @theme inline
│   └── (dashboard)/
│       ├── layout.tsx                  // SidebarProvider + AppSidebar + AppHeader
│       ├── dashboard/page.tsx
│       ├── inbox/page.tsx
│       ├── clients/page.tsx
│       ├── services/page.tsx
│       └── settings/
│           ├── layout.tsx              // Link-based underline tabs
│           ├── general/page.tsx
│           ├── billing/page.tsx
│           ├── team/page.tsx
│           └── notifications/page.tsx
├── components/
│   ├── ui/                             // shadcn base-nova primitives
│   ├── shell/                          // AppSidebar, AppHeader
│   ├── dashboard/                      // KPI cards, SLA warnings, activity
│   ├── inbox/                          // table, Kanban, filter bar
│   ├── clients/, services/, settings/
│   └── shared/                         // SlaChip, etc.
├── lib/
│   ├── types.ts
│   ├── mock-data.ts
│   └── utils.ts
├── next.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

## Important commits

1. Riko scaffold + init
2. `322e142` — Koda: mock data & strict types
3. `724138f` — Koda: app shell (sidebar + header + route group)
4. `ca1d8ed` — Koda: dashboard home (KPIs, quick actions, SLA warnings, activity feed)
5. `2b94e89` — Koda: inbox (table + Kanban + filter bar)
6. `b8f7224` — Koda: clients + services tables + dialogs
7. `0c69290` — Koda: settings with Link-based underline tabs
8. `361a3a8` — Koda: Vega polish pass (14 findings applied)

## Deferred features (Phase 2+ parking lot)

From the plan's parking lot — do NOT build until Phase 15 gate clears:

- Supabase auth (email + Google) + multi-tenant RLS
- Real DB schema (clients, services, requests, messages, team_members, invoices)
- Dodo Payments for SaaS subscription (agency billing)
- Stripe Connect for client invoicing (blocked on approval)
- Razorpay recurring mandates (India)
- Claude API integration for AI request triage + drafting
- File uploads (R2 or Supabase Storage)
- Email notifications (Resend)
- Kanban drag-and-drop wiring (currently a static toggle — `// TODO: dnd` marker in code)
- Client-facing portal (Phase 1 is agency-side only)
- Team invites + RBAC
- Webhooks + public API
- Audit log
- Analytics/metrics dashboard (real data)
- Onboarding flow
- Landing page + marketing site

## Next gate — Phase 15 validation (HARD GATE)

**Do not write backend code until both are met:**

1. **300 waitlist signups** via a landing page
2. **10 paid LOIs** (Letters of Intent with deposit — real money from real agencies)

The Phase 1 UI shell is the sales asset for the 10-paid-LOI step. Use it in discovery calls.

## Open risks (from dossier)

- **Trademark** — "Clientloop" has NOT been cleared. Do a USPTO + WIPO search before any public launch or domain purchase beyond a waitlist.
- **Stripe Connect approval** — not guaranteed for a first-time platform. Need backup plan (direct Stripe, manual invoicing) for MVP.
- **Razorpay recurring mandates** — Indian market need, mandates are restrictive (e₹₹ flow), adds complexity.
- **Claude API cost metering** — AI triage is a margin risk. Need per-request token budgets and a hard ceiling per plan tier before launch.

## How to run

```bash
cd ~/Clientloop
pnpm install   # if fresh clone
pnpm dev       # http://localhost:3000
pnpm build     # production build (will warn about rogue root lockfile — non-blocking)
```

## Bolt deploy status

**DEFERRED by user decision.** No GitHub push, no Vercel deploy. Code lives only at `~/Clientloop`. When ready to deploy:

- `gh repo create boldteq/clientloop --private --source . --push`
- `vercel --prod`
- Fix the rogue root lockfile warning first (set `turbopack.root` in `next.config.ts`)

## References

- Full build plan: `/Users/yashbaldha/.claude/plans/zany-mixing-flame.md`
- Stack memory: `~/.claude/memory/stacks/saas-nextjs-16.md`
- Base-nova patterns: `~/.claude/memory/patterns/good/shadcn-base-nova-patterns.md`
- Dossier: `ManyRequestsDossier.jsx` (inline JSX referenced in plan context)
