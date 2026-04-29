# Stack Registry — Boldteq Software Factory

> **Purpose:** Single source of truth for stack detection and routing. All agents load this file to determine which stack a project uses, then load the corresponding stack file for detailed patterns.
>
> **To add a new stack:** Add one row to the detection table below + create the stack file. Zero agent edits needed.

---

## Stack Detection Protocol

When starting ANY task, agents determine the active stack by checking the project's file markers in this order:

### 1. Check project CLAUDE.md first
If the project has a `CLAUDE.md` (or `.claude/CLAUDE.md`), look for a `stack:` field. This is the authoritative source.

### 2. Auto-detect from file markers
If no explicit stack field, detect from files present in the project root:

| Detection Markers | Stack | Stack File | Status |
|---|---|---|---|
| `next.config.ts` + `railway.toml` + `supabase/` | **Stack A** — Next.js SaaS | `stacks/saas-nextjs-supabase-railway.md` | ✅ Active (default for new Boldteq SaaS) |
| `shopify.app.toml` + `app/routes/` + `prisma/` | **Stack B** — Shopify App | `stacks/shopify-app.md` | ✅ Active |
| Stack A markers + `lib/ai/` or `ai/` directory | **Stack C** — AI Features | `stacks/ai-patterns.md` (loads ON TOP of Stack A) | ✅ Active |
| Stack A markers + `agents/` + `tools/` | **Stack D** — AI Agents | `stacks/ai-patterns.md` (agent-specific section) | ✅ Active |
| `vite.config.ts` + `src/integrations/supabase/` + `src/pages/` (PascalCase) | **Legacy** — Archived Vite SPA | `stacks/_archive/lovable/lovable-project.md` | 🔒 Maintenance only |
| `next.config.ts` + `vercel.json` | **Legacy** — Pre-Railway Next.js | `stacks/_archive/saas-nextjs-supabase.md` | 🔒 Archived |

### 3. Ambiguous? Ask.
If markers match multiple stacks or no stack, escalate to Yash: "I can't determine the stack for this project. Markers found: [list]. Which stack should I use?"

---

## Stack Properties (Quick Reference)

Each stack defines these properties. Agents use them for build commands, verification, forbidden patterns, etc.

| Property | Stack A | Stack B | Stack C | Stack D |
|---|---|---|---|---|
| **Package manager** | pnpm | pnpm | pnpm | pnpm |
| **Build command** | `pnpm build` | `pnpm build` | `pnpm build` | `pnpm build` |
| **Dev command** | `pnpm dev` | `pnpm dev` | `pnpm dev` | `pnpm dev` |
| **Dev port** | 3000 | 3000 | 3000 | 3000 |
| **Type check** | `pnpm tsc --noEmit` | `pnpm tsc --noEmit` | `pnpm tsc --noEmit` | `pnpm tsc --noEmit` |
| **Lint** | `pnpm lint` | `pnpm lint` | `pnpm lint` | `pnpm lint` |
| **Test** | `pnpm test --run` | `pnpm test --run` | `pnpm test --run` | `pnpm test --run` |
| **Deploy** | Railway (`railway up`) | Railway | Railway | Railway |
| **Database** | Supabase (Postgres + RLS) | Prisma + PostgreSQL | Supabase | Supabase / Vector DB |
| **Auth** | Supabase Auth (`@supabase/ssr`) | Shopify Session Tokens | Supabase Auth | API keys / Supabase |
| **Billing** | Dodo Payments | Shopify Billing API | Dodo Payments | Dodo Payments |
| **UI framework** | Tailwind 4 + shadcn/ui | Polaris Web Components | Tailwind 4 + shadcn/ui | Tailwind 4 + shadcn/ui |
| **Hosting** | Railway | Railway | Railway | Railway |
| **Error tracking** | Sentry | Sentry | Sentry | Sentry |
| **Analytics** | PostHog | PostHog | PostHog | PostHog |

---

## Verification Command (Universal — ALL stacks)

Every code agent runs this after changes. The commands come from the stack properties above:

```bash
# Universal verification loop — works for any stack
pnpm tsc --noEmit && pnpm lint && pnpm build && pnpm test --run
```

If a stack has custom verification steps (e.g., Shopify's `shopify app dev` check), they're defined in the stack file and run AFTER the universal loop.

---

## How Agents Use This Registry

### For code agents (Koda, Vex, Dato, Luna, Sage):
1. Detect stack using the table above
2. Load the corresponding stack file for detailed patterns
3. Use stack properties for build/test/deploy commands
4. Stack-specific forbidden patterns are in the stack file

### For design agents (Vega, Quill):
1. Detect stack → determines UI framework (shadcn vs Polaris vs custom)
2. Load design tokens from stack file
3. Stack B (Shopify) = Polaris only, no Tailwind

### For orchestration agents (Yash, Arya, Riko):
1. Detect stack at project start
2. Route to correct scaffold, architecture, and deployment patterns
3. Never mix stack patterns (e.g., no Polaris in Stack A, no shadcn in Stack B)

### For launch agents (Bolt, Hawk, Echo, Zeph):
1. Detect stack → determines deploy target, monitoring setup, SEO patterns
2. All stacks deploy to Railway (current default)
3. Stack-specific launch requirements in stack file

---

## Adding a New Stack

To add Stack E (example: React Native mobile app):

1. **Create stack file:** `~/.claude/memory/stacks/mobile-react-native.md`
   - Define: folder structure, build commands, dependencies, forbidden patterns, deployment, testing
2. **Add detection row** to the table above:
   ```
   | `app.json` + `metro.config.js` + `ios/` + `android/` | **Stack E** — Mobile App | `stacks/mobile-react-native.md` | ✅ Active |
   ```
3. **Add stack properties** row to the properties table
4. **Done.** All 22 agents will auto-detect and use the new stack via this registry.

No agent files need to be edited. The registry is the single point of change.

---

## Rules

1. **Stack A is the default** for all new Boldteq internal SaaS products
2. **Stack B** is for Shopify apps only
3. **Stack C/D** layer on top of Stack A (not standalone)
4. **Legacy stacks** are maintenance-only — never start new projects on them
5. **New stacks** added via this registry — never hardcode stack logic into agent files
6. **Project CLAUDE.md overrides** auto-detection (explicit > implicit)

---

*(Created 2026-04-14 — Stack Registry for dynamic multi-stack support)*
