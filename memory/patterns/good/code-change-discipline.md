# Code Change Discipline — Anti-Cascade Protocol

> **Every agent that edits code files MUST follow this protocol.**
> This prevents the #1 problem: fixing one thing and breaking three others.
> Loaded by: Koda, Vex, Sage (enforcement), Luna (regression detection), Riko.

---

## THE PROBLEM THIS SOLVES

When an agent edits a file without checking what depends on it, the fix cascades:
1. Agent changes function signature in `lib/auth.ts`
2. 12 files import from `lib/auth.ts` — all now have type errors
3. Agent "fixes" 3 of them, introduces a logic bug in the 4th
4. User has to re-prompt 3 more times to clean up the mess

**This protocol ensures agents understand the blast radius BEFORE editing.**

---

## PRE-CHANGE: Impact Analysis (30 seconds, saves 30 minutes)

Before editing ANY file, run this mental checklist:

### 1. Who imports this file?
```bash
# Find all consumers of the file you're about to edit
grep -rn "from.*$(basename FILE .tsx)" --include="*.ts" --include="*.tsx" app/ lib/ components/ workers/
```
Write down the count. If >5 files import it, this is a high-blast-radius change.

### 2. What does this file export?
```bash
grep -n "export" path/to/file.ts
```
If you're changing an export signature (rename, add param, change return type), every consumer breaks.

### 3. Is this a layout or provider?
Layouts cascade to ALL child routes. Providers cascade to ALL children.
```bash
# Check if this file is used as a layout
grep -rn "layout" app/ --include="layout.tsx" -l
```
**Layout changes = P0 blast radius. Test every child route after changing a layout.**

### 4. Is this a shared component?
```bash
# How many files use this component?
grep -rn "ComponentName" --include="*.tsx" app/ components/ | wc -l
```
If used in >3 places → make your change, then verify ALL usage sites.

---

## DURING CHANGE: The 1-3-Verify Rule

**Never edit more than 3 files before running verification.**

```
CYCLE:
  Edit file 1 (maybe 2-3 if tightly coupled)
  → pnpm tsc --noEmit
  → pnpm build (if structural change)
  IF PASS → next cycle
  IF FAIL → fix THIS before touching anything else
```

### Why 3 files max?

- 1-3 files: Easy to understand what changed. Easy to revert.
- 4-7 files: Hard to track. Some changes mask others.
- 8+ files: You're doing a refactor, not a fix. Stop and plan.

---

## CHANGE CATEGORIES & RULES

### Category A: Safe changes (low blast radius)
- Adding a new file that nothing imports yet
- Adding a new export to a file (existing exports unchanged)
- Editing JSX content (text, styling) without changing props
- Adding a new API route

**Rule:** Normal 1-3-Verify cycle.

### Category B: Risky changes (medium blast radius)
- Changing a function signature (params, return type)
- Renaming an export
- Moving a file to a different path
- Changing a shared component's props

**Rule:** List ALL consumers first. Update every consumer in the same cycle. Verify.

### Category C: Dangerous changes (high blast radius)
- Editing a layout file
- Editing a provider/context
- Changing the Supabase client setup
- Changing auth flow
- Editing middleware
- Changing `next.config.ts`
- Changing `package.json` dependencies

**Rule:** Full test suite after change. Check every route that could be affected. If >10 routes affected, test at least 3 representative ones.

---

## POST-CHANGE: Regression Check

After completing a fix, before reporting success:

```bash
# 1. TypeScript (catches broken imports, wrong types)
pnpm tsc --noEmit

# 2. Lint (catches formatting, unused imports)
pnpm lint

# 3. Build (catches SSR issues, dynamic imports, missing env)
pnpm build

# 4. Tests
pnpm test --run

# 5. Quick smoke test (Stack A)
# Start dev server if needed, then:
curl -s http://localhost:3000/api/health | head -1
# Should return {"status":"ok"...}
```

**ALL FIVE must pass. If any fail, you're not done.**

---

## COMMON CASCADES AND HOW TO PREVENT THEM

### Cascade: Changing types.ts (Supabase generated types)
**Problem:** Regenerating types changes every table type. Components expecting old shape break.
**Prevention:** After `supabase gen types`, run `pnpm tsc --noEmit` immediately. Fix all errors in one batch.

### Cascade: Changing a shared hook
**Problem:** `useAuth()` or `useUser()` used in 20+ components. Changing return shape breaks all.
**Prevention:** Don't change the return shape. Add new fields instead. Deprecate old ones gradually.

### Cascade: Adding 'use client' to a file that was a Server Component
**Problem:** All child components now lose access to server-side data fetching.
**Prevention:** Extract the client-only part into a separate `ClientComponent.tsx`. Keep the parent as Server Component.

### Cascade: Changing environment variable names
**Problem:** `.env.local`, `.env.example`, `railway.toml`, CI/CD, Supabase Edge Functions — all need updating.
**Prevention:** grep for the old var name everywhere:
```bash
grep -rn "OLD_VAR_NAME" . --include="*.ts" --include="*.tsx" --include="*.toml" --include="*.yml" --include="*.env*"
```

### Cascade: Updating a dependency version
**Problem:** Breaking changes in the dependency cascade through the codebase.
**Prevention:** Read the changelog/migration guide BEFORE updating. Update one dep at a time. Build after each.

---

## THE "I FIXED IT" CHECKLIST

Before telling the user a fix is complete:

- [ ] `pnpm tsc --noEmit` passes (zero errors)
- [ ] `pnpm lint` passes (zero errors, zero warnings on changed files)
- [ ] `pnpm build` succeeds
- [ ] `pnpm test --run` passes (if tests exist)
- [ ] I checked that files importing my changed file still work
- [ ] I did NOT add `any`, `@ts-ignore`, or `@ts-expect-error`
- [ ] I did NOT add `console.log` (use logger instead)
- [ ] I did NOT change more than what was needed for this fix
- [ ] The original problem is actually solved (I verified behavior, not just "no errors")

**If you can't check ALL boxes, you're not done.**

---

## FOR VEX SPECIFICALLY: The Bug Fix Sequence

```
1. REPRODUCE: Can I see the bug? (error message, screenshot, behavior)
2. LOCATE: Which file is the root cause? (not the symptom file)
3. ANALYZE: What imports this file? What will break if I change it?
4. FIX: Minimal change to root cause file (1-3 files max)
5. VERIFY: Does the bug go away? (check the actual behavior)
6. REGRESSION: Did I break anything else? (pnpm tsc + pnpm build + pnpm test)
7. DONE: All checks pass + bug is gone + nothing new is broken
```

**Vex's biggest failure mode: fixing the symptom instead of the cause, then chasing cascading breakage. Step 2 (LOCATE root cause) is where Vex must spend the most time.**

---

## FOR KODA SPECIFICALLY: The Feature Build Sequence

```
1. PLAN: What files am I creating/editing? What exists already?
2. TYPES: Define TypeScript types/interfaces first
3. DATA: Database migration + RLS + type generation
4. API: Server Actions or API routes (with Zod validation)
5. UI: Components (Server Components first, Client only when needed)
6. WIRE: Connect UI to data (React Query or direct fetch)
7. STATES: Loading, empty, error states for every data-dependent component
8. VERIFY: Full fix-verify loop (tsc, lint, build, test)
```

**Koda's biggest failure mode: building UI before data layer is solid, then fighting type errors when wiring things up. Steps 2-4 MUST be verified before starting step 5.**

---

*(Anti-cascade protocol. Updated 2026-04-13. Loaded by all code-touching agents.)*
