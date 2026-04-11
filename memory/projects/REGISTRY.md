---
name: Project Registry
description: Single source of truth for all Boldteq project status, setup completeness, and blockers
type: reference
last_updated: 2026-04-10
---

# Project Registry

> Quick-scan status of every Boldteq project. Updated after every session.
> Status: `active` | `scaffolded` | `not-started` | `paused` | `shipped` | `archived`

---

## Active Projects

### Pinzo
| Field | Value |
|-------|-------|
| Type | Shopify App — ZIP code delivery checker |
| Stack | Stack B (React Router 7 + Polaris + Prisma) |
| Path | `~/Desktop/Boldteq App/Pinzo` |
| Status | **active** |
| Git | Yes (last commit: 2026-03-31) |
| CLAUDE.md | Yes (5.4 KB) |
| Agents | Yes (`widget-specialist.md`) |
| Env | Yes (`.env`, 394 bytes) |
| Dependencies | Installed (581 packages) |
| Database | SQLite via Prisma (dev.db + migrations) |
| Blockers | None |
| Last Session | 2026-04-03 — compliance audit, 5 commits |

### ConvertScan (CROBOT)
| Field | Value |
|-------|-------|
| Type | SaaS — AI CRO audit tool |
| Stack | Stack A-Lovable (Vite + React + shadcn/ui + Supabase) |
| Path | `~/Desktop/Boldteq App/CROBOT` |
| Status | **active** — MVP code-complete, blocking on env vars |
| Git | Yes (last commit: 2026-03-31) |
| CLAUDE.md | Exists but empty (2 bytes) — needs content |
| Agents | Partial (`.claude/rules` only, no agents/) |
| Env | Missing — needs `.env` with Supabase + Dodo keys |
| Dependencies | Installed (357 packages) |
| Database | Supabase (project `hyxlmmkrbipufoqkkhba`, migrations applied) |
| Blockers | 3 env vars not set as Supabase secrets: `ANTHROPIC_API_KEY`, `SCREENSHOTONE_ACCESS_KEY`, `PAGESPEED_API_KEY` |
| Last Session | 2026-04-06 — sidebar overhaul (session 7) |
| Cleanup Debt | Dead `stripe.ts`, old Stripe edge functions, CLAUDE.md Stripe refs |

### Clientloop
| Field | Value |
|-------|-------|
| Type | SaaS — ManyRequests-style portal for productized agencies |
| Stack | Stack A-16 (Next.js 16 + shadcn base-nova + Tailwind v4 + pnpm) |
| Path | `~/Clientloop` |
| Status | **active** — Phase 1 UI shell complete, gated on Phase 15 validation, not deployed |
| Git | Yes (local only, no remote) |
| CLAUDE.md | No (shell-only phase) |
| Agents | No (uses global agents) |
| Env | None (mock data only) |
| Dependencies | Installed via pnpm 10.33.0 |
| Database | None (Phase 2+) |
| Blockers | Phase 15 hard gate: 300 waitlist + 10 paid LOIs before backend |
| Deploy | **DEFERRED** by user — no GitHub push, no Vercel |
| Last Session | 2026-04-10 — Phase 1 UI shell, 7 commits, Sage approved, Bolt deferred |
| Memory | [clientloop.md](clientloop.md) · stack: [saas-nextjs-16.md](../stacks/saas-nextjs-16.md) |
| Plan | `/Users/yashbaldha/.claude/plans/zany-mixing-flame.md` |

### Rankora
| Field | Value |
|-------|-------|
| Type | SaaS — AI resume ranker |
| Stack | Stack A-Lovable (Vite + React + shadcn/ui + Supabase + Dodo Payments) |
| Path | `~/Desktop/Boldteq App/Rankora` |
| Status | **active** |
| Git | Yes (last commit: 2026-03-31) |
| CLAUDE.md | Yes (12.8 KB, comprehensive) |
| Agents | Yes (5+ agents + commands) |
| Env | Yes (`.env`, 462 bytes) |
| Dependencies | Installed (364 packages) |
| Database | Supabase |
| Blockers | None known |
| Last Session | ~2026-03-24 |

---

## Not Started

### Size Chart & Recommender
| Field | Value |
|-------|-------|
| Type | Shopify App — size charts |
| Stack | Stack B (planned) |
| Path | `~/Desktop/Boldteq App/Size Chart & Recommender` |
| Status | **not-started** — directory does not exist |

### Store Locator
| Field | Value |
|-------|-------|
| Type | TBD |
| Stack | TBD |
| Path | `~/Desktop/Boldteq App/Store Locator` |
| Status | **not-started** — directory does not exist |

---

## Infrastructure

### claude-hub
| Field | Value |
|-------|-------|
| Type | Agent orchestration hub + SDK |
| Path | `~/Desktop/Boldteq App/claude-hub` |
| Status | **scaffolded** — initial setup, not production |
| Git | No — needs `git init` |
| CLAUDE.md | Exists but empty — needs content |
| SDK | `@boldteq/agents` v1.0.0 (index.js + index.d.ts) |
| Dependencies | Installed (123 packages) |
| Blockers | No git, no docs, no env |

---

## Setup Completeness Checklist

Use this to verify any project is ready for development:

- [ ] Directory exists
- [ ] `git init` + remote configured
- [ ] `package.json` with correct name/version
- [ ] `node_modules/` installed
- [ ] `.env` with all required keys
- [ ] `CLAUDE.md` with project-specific patterns
- [ ] `.claude/agents/` with project-specific agents (if needed)
- [ ] Database configured (Prisma migrations or Supabase tables)
- [ ] Build passes (`npm run build`)
- [ ] Dev server starts (`npm run dev`)

---

*(Updated by Mira after every session. Last update: 2026-04-10)*
