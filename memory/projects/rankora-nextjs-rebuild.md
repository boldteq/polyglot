# Rankora Next.js Rebuild — Training Ground Brief (Stack A)

**Created:** 2026-04-11
**Status:** NOT STARTED — live training target #2
**Stack:** A (Next.js 16.2.3 + React 19 + Tailwind 4 + shadcn/ui + Supabase SSR + Dodo Payments + Railway + Resend + Sentry + PostHog)
**Current state:** Legacy Lovable (Vite + React Router + Supabase) running in production. Grandfathered on old stack, maintained-only.
**Rebuild decision:** Full clean rebuild on Stack A from scratch, reuse existing Supabase schema and brand (per Yash 2026-04-11).

---

## Rebuild rationale

- Legacy Lovable codebase is locked to patterns we no longer use (Vite SPA, client-side Supabase, no RLS audit trail, no background jobs, no pino logging, no Sentry, no proper SSR).
- Boldteq stack lock (2026-04-10) is Next.js 16 + Supabase SSR + Railway. Every new product is on this stack. Rankora is the only grandfathered exception.
- Running two stacks in parallel is tech-debt tax on every memory lookup.
- Rankora is a great training ground because: (a) real existing users → immediate feedback; (b) Supabase schema and brand already proven → reduces unknowns; (c) tests the migration playbook we'll need for Crobot later.

---

## v1 rebuild scope

Rebuild the current product, feature-for-feature, on Stack A. No new features. No redesign. Ship a drop-in replacement, then add enhancements in v2.

### Features to port
- Auth (email + Google OAuth) via `@supabase/ssr`
- Resume upload (PDF/DOCX) with Supabase Storage
- Job description input
- AI-powered ranking engine (the core value prop)
- Ranked candidate list with scores + explanations
- Candidate detail view
- Export to CSV/PDF
- Billing: Free (5 resumes/mo) / Pro $29/mo (100 resumes) / Team $99/mo (unlimited + team seats)
- Workspace + team members (RBAC: owner/admin/member)
- Email notifications (upload complete, ranking ready)

### Infra upgrades (NEW, not in Lovable version)
- RLS on every table (currently loose on Lovable)
- BullMQ + Redis for ranking jobs (currently synchronous, blocks UI)
- Pino structured logging
- Sentry error tracking (currently none)
- PostHog analytics (currently basic)
- Rate limiting on upload + ranking endpoints
- Audit log table for every mutation
- Security headers + CSP
- Pre-deploy Koda done-gate + Sage audit

### Data migration
- Supabase schema stays put (both stacks point at the same DB during migration)
- Add missing RLS policies via new migrations (non-breaking)
- Dual-write during cutover: legacy Lovable app reads/writes as before, new Next.js app reads/writes the same DB
- Cutover: flip DNS from Lovable to Next.js on Railway, decommission Lovable after 14 days

---

## Pipeline run plan

### Phase 0 — Inventory (4 hours)
- **Vex** → audit current Lovable codebase, list all features, endpoints, DB tables, env vars, 3rd-party integrations. Output: rankora-legacy-inventory.md.
- **Sage** → audit current RLS policies, find gaps. Output: rankora-rls-gaps.md.
- **Nova** → quick competitive sweep (Rezi, Jobscan, Resume Worded) — 45 min cap, just to confirm positioning unchanged.

### Phase 1 — Architect (1 day)
- **Arya** → full architecture set for the Next.js rebuild, including dual-write migration plan and cutover ADR. Expects to reuse 90% of the data model with RLS additions.

### Phase 2 — Scaffold (2 hours)
- **Riko** → clone from `boldteq-saas-starter`, wire existing Supabase project, apply new migrations for RLS + audit_log, deploy empty app to Railway staging.

### Phase 3 — Build sprint 1 (1 week, parallel)
- **Thread A:** Auth + workspace model + RBAC
- **Thread B:** Resume upload + Supabase Storage + file parsing
- **Thread C:** Billing (Dodo Payments integration)

### Phase 4 — Build sprint 2 (1 week, parallel)
- **Thread A:** Ranking engine (BullMQ job on Railway worker)
- **Thread B:** Ranked candidate UI + detail view + export
- **Thread C:** Analytics dashboard (PostHog + server-side aggregation)

### Phase 5 — Build sprint 3 (3 days)
- **Quill** → all copy ported + improved where needed
- **Vega** → visual review pass (mobile + desktop), WCAG AA
- **Luna** → E2E test suite covering every user loop
- **Zeph** → SEO ported and improved (marketing pages)

### Phase 6 — Cutover (1 day)
- **Sage** → final audit
- **Bolt** → deploy Next.js to Railway prod
- **Hawk** → dual-monitor both apps for 24 hours
- DNS cutover to Next.js
- **Hawk** → 30-min post-deploy watch + 7-day tail monitoring

### Phase 7 — Decommission (14 days after cutover)
- Shut down Lovable deployment
- Archive Lovable repo
- Remove Rankora from `stacks/_archive/lovable/` references
- **Mira** → update projects/REGISTRY.md, mark Rankora as Stack A
- **Mira** → capture migration playbook as `patterns/good/lovable-to-nextjs-migration.md` for Crobot rebuild later

---

## Target timeline
- **Start:** ~2026-04-21
- **Cutover:** 2026-05-19
- **Decommission:** 2026-06-02

---

## Success criteria
- 100% feature parity with legacy Lovable version on cutover day
- 0 user-facing downtime during cutover
- RLS audit: 100% tables covered (currently ~60%)
- Lighthouse scores improve (Lovable baseline ~85 → target ≥90)
- Ranking job latency (async) + UI responsive during jobs
- Full Sage audit passes on first run
- Total agent cost for rebuild <$30 (two builds running in parallel, budget cap shared)

---

## Crobot (future)

If Rankora rebuild succeeds, apply the same playbook to Crobot immediately after. Mira extracts the migration lessons so the Crobot rebuild runs faster.
