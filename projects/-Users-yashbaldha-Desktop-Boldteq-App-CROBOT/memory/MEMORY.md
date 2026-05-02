# ConvertScan (CROBOT) -- Project Memory Index

All project-specific knowledge for ConvertScan lives here. Loaded at session start for any CROBOT task.

---

## Project Files

| File | Description | Last Updated |
|------|-------------|--------------|
| [project_convertscan.md](project_convertscan.md) | Full project state, architecture decisions, key patterns, current status | 2026-04-06 |
| [project_admin.md](project_admin.md) | Admin panel architecture, features built, admin-specific patterns | 2026-04-06 |
| [project_billing.md](project_billing.md) | Billing uses Dodo Payments (NOT Stripe) -- migration from Stripe completed 2026-04-06 | 2026-04-06 |
| [project_bugs.md](project_bugs.md) | All bugs encountered, root causes, fixes, prevention rules | 2026-04-06 |
| [project_patterns.md](project_patterns.md) | Reusable patterns discovered in this project (system_config, feature flags, scan gate, etc.) | 2026-04-06 |

---

## Intake Logs (Session Records)

| File | Description |
|------|-------------|
| [intake/2026-04-05-mvp-features-admin-deep.md](intake/2026-04-05-mvp-features-admin-deep.md) | Round 1: 8 MVP features + Round 2: 7 admin deep features. 3 bugs fixed. |
| [intake/2026-04-06-topbar-integrations-dodo.md](intake/2026-04-06-topbar-integrations-dodo.md) | TopBar rewrite, Admin Integrations page, Stripe-to-Dodo migration. |
| [intake/2026-04-06-redesign-migrations-mvp-gap.md](intake/2026-04-06-redesign-migrations-mvp-gap.md) | Session 4: 48-file production-grade UI redesign, BrandIcon bug fix, Supabase migrations applied manually, MVP gap analysis with blocking env vars identified. |
| [intake/2026-04-06-admin-integrations-redesign.md](intake/2026-04-06-admin-integrations-redesign.md) | Session 5: Admin Integrations redesign -- tabbed detail panel, 6 brand SVG icons, copy-to-clipboard, accent borders, dot-style status badges. |
| [intake/2026-04-06-ui-modernization.md](intake/2026-04-06-ui-modernization.md) | Session 6: Full UI modernization -- 5-phase visual refresh (tokens->components->pages->secondary->nav). 28 files, zero deps, zero functionality changes. 16 patterns extracted to global memory. |
| [intake/2026-04-06-sidebar-navigation-overhaul.md](intake/2026-04-06-sidebar-navigation-overhaul.md) | Session 7: Admin sidebar refactored from custom aside to shadcn Sidebar. User sidebar icon/nav fixes. TopBar cleanup. 10 patterns extracted. |

---

## Cross-References to Global Memory

These project patterns are also documented in global memory:
- Radix empty SelectItem crash: `~/.claude/memory/patterns/avoid/antipatterns.md` (Radix UI section)
- Koda duplicate import bug: `~/.claude/memory/patterns/avoid/antipatterns.md` (Agent Output section)
- Feature flags in localStorage antipattern: `~/.claude/memory/patterns/avoid/antipatterns.md`
- Redesign placeholder components: `~/.claude/memory/patterns/avoid/antipatterns.md` (Redesign Agent Placeholder Components section)
- Supabase migrations not auto-applied: `~/.claude/memory/patterns/avoid/antipatterns.md` (Supabase Migrations Not Applied section)
- Admin Integrations patterns: `~/.claude/memory/patterns/good/admin-integrations-pattern.md`
- shadcn/ui redesign playbook (16 patterns): `~/.claude/memory/patterns/good/ui-redesign-shadcn.md`
- shadcn Sidebar patterns (10 patterns): `~/.claude/memory/patterns/good/sidebar-patterns.md`
- Sidebar antipatterns: `~/.claude/memory/patterns/avoid/antipatterns.md` (Sidebar Anti-Patterns section)
- Full project entry: `~/.claude/memory/projects/crobot.md`
- Agent performance logs: `~/.claude/memory/agents/performance.md`
- Lovable/Vite stack patterns: `~/.claude/memory/stacks/lovable-project.md`

---

## Quick Reference

**Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Supabase + React Query + React Router
**Billing:** Dodo Payments (NOT Stripe)
**Admin:** `/admin/*` routes, same codebase, RBAC via `profiles.role`
**Config:** `system_config` table (key TEXT PK, value JSONB) for feature flags, plan limits, pillar weights
**CRO Pillars:** 7 pillars with weighted scoring (Value Prop 18%, CTA 20%, Trust 17%, Visual 12%, Mobile 13%, Content 11%, Performance 9%)
