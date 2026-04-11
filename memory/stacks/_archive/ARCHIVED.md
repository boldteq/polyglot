# ARCHIVED STACKS

**Archived:** 2026-04-10
**Reason:** Boldteq standardized on Next.js 16 + Supabase + Railway for ALL internal SaaS products. Lovable and legacy Next.js + Vercel stacks moved here.

## What's here

### `lovable/lovable-project.md`
Lovable (Vite + React Router + Supabase, port 8080). **DO NOT load for Boldteq internal products.**

Only reference this file if:
1. A **client explicitly requests** a Lovable project
2. We are **maintaining** existing Lovable projects (Rankora, Crobot) during transition period
3. User explicitly mentions "Lovable" in the request

### `saas-nextjs-supabase.md`
Legacy Next.js + Supabase + Vercel + Stripe stack. Superseded by `stacks/saas-nextjs-supabase-railway.md`.

## Active stack for all new work
**→ `~/.claude/memory/stacks/saas-nextjs-supabase-railway.md`**

## Active patterns archived from here
- `patterns/_archive/lovable/lovable-execution-model.md`
- `patterns/_archive/lovable/lovable-package-management.md`

## Migration policy
- **No agent should auto-load** files from this archive
- Rex will **never** route to archived stack files
- Only explicit user mention of "Lovable" or "client project" triggers a read
- Existing Lovable projects (Rankora, Crobot) are grandfathered — maintained as-is, not rebuilt

*(Archived by Mira — 2026-04-10 Next.js + Railway migration)*
