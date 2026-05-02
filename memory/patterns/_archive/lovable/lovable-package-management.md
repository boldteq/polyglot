# Lovable Package Management — Preventing Post-Install Failures

> Priority: CRITICAL — This pattern prevents the #1 recurring issue in Lovable projects
> Applies to: Stack A-Lovable (Vite + React + TypeScript + Tailwind + shadcn/ui + Supabase)
> Agents: Koda (implementation), Riko (scaffold), Vex (debug), Rex (orchestration)
> Last updated: 2026-04-05

---

## The Problem

When adding npm packages to a Lovable project (via Lovable UI, VS Code, or Claude), the app frequently breaks — blank screen, build failure, or silent runtime crash. This happens because:

1. Lovable uses **bun** as package manager (has known Vite/esbuild compatibility gaps)
2. Lovable's build environment is **ephemeral** — local `file:` dependencies don't exist there
3. React version mismatches cause peer dependency failures
4. Package installs can corrupt `vite.config.ts` if Lovable auto-fixes
5. Lock file drift between bun and npm causes phantom failures

---

## The 9 Failure Patterns (Memorize These)

### 1. Blank Screen After Install
**Cause:** Build fails silently; Vite serves empty HTML shell with no JS
**Symptoms:** White/blank page, no errors visible to user
**Debug:** Open browser console → look for JS errors, failed imports, 404s on assets
**Fix:** Check `vite.config.ts` hasn't been corrupted. Verify `base: './'` and `outDir: 'dist'`

### 2. Peer Dependency Conflict (ERESOLVE)
**Cause:** Package requires React 18 but project uses React 19 (or vice versa)
**Symptoms:** `npm ERR! ERESOLVE unable to resolve dependency tree`
**Common culprits:** `@radix-ui/*`, `react-day-picker`, `@testing-library/react`, `cmdk`
**Fix:** Check React version first (`npm ls react`). Use `overrides` in package.json if needed:
```json
{
  "overrides": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

### 3. Module Not Found / Import Resolution
**Cause:** Case-sensitivity mismatch, corrupted node_modules, or broken `@/` alias
**Symptoms:** `Failed to resolve import "@/"`, `ERR_MODULE_NOT_FOUND`
**Fix:** Verify tsconfig paths. Clean install: `rm -rf node_modules && npm install`

### 4. `file:` or `link:` Local Dependencies
**Cause:** `package.json` has `"some-pkg": "file:../local-path"` — works locally, breaks in Lovable's build
**Symptoms:** `bun install` fails with cryptic errors or treats `.env` as install target
**Fix:** NEVER use `file:` or `link:` protocol in Lovable/Vite/deployed projects. Copy code into project or publish to npm.
**Incident:** `"@boldteq/agents": "file:../claude-hub/sdk"` in the project caused silent `bun install` failure.

**IMPORTANT DISTINCTION:**
- `"pkg": "file:./sdk"` (INSIDE project) — OK for local-only Node.js servers (e.g., Claude Hub). Still breaks if deployed to Vercel/CI.
- `"pkg": "file:../other-project/sdk"` (OUTSIDE project) — ALWAYS broken in remote builds. Lovable, Vercel, CI/CD cannot reach files outside the repo.
- **Rule:** If the project is deployed anywhere (Lovable, Vercel, CI) → NO `file:` deps, period. If it's local-only (like Claude Hub server) → `file:` within the project is acceptable but still not recommended.

### 5. Bun/Vite Version Conflict
**Cause:** Bun resolves esbuild differently than npm, breaking Vite 5.2+
**Symptoms:** `The service was stopped`, build crashes, Vite can't start
**Fix:** Use npm instead of bun, OR pin Vite to 5.1.6. Delete `bun.lockb` and use `package-lock.json`

### 6. shadcn/ui Component Install Failure
**Cause:** Invalid `components.json`, missing `@/` alias, or peer dependency block
**Symptoms:** `Invalid configuration found in components.json`, component not found after install
**Fix:** Verify `components.json` exists and has correct paths. Run `npx shadcn-ui@latest init` if broken

### 7. Vite Config Corruption
**Cause:** Lovable AI or package post-install script modifies `vite.config.ts`
**Symptoms:** Assets don't load, wrong base URL, missing plugins
**Fix:** Review `vite.config.ts` after every package install. Ensure:
```typescript
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  plugins: [react()], // Only plugins that are installed
});
```

### 8. Lock File Corruption / Package Manager Mismatch
**Cause:** Project started with bun, someone used npm, or vice versa
**Symptoms:** Random module not found, version mismatches, partial installs
**Fix:** Pick ONE package manager and stick with it. Clean install:
```bash
rm -rf node_modules package-lock.json bun.lockb
npm install  # OR bun install — pick one, never both
```

### 9. Node.js-Only Package in Browser
**Cause:** Package requires `fs`, `path`, `crypto`, or other Node.js APIs not available in browser
**Symptoms:** `Module "fs" has been externalized`, runtime crash
**Fix:** Check if package is meant for Node.js backend only. Use browser-compatible alternative.

---

## Mandatory Pre-Install Protocol (ALL AGENTS MUST FOLLOW)

Before adding ANY package to a Lovable project:

```
STEP 1: CHECK COMPATIBILITY
  - What React version does this project use? (check package.json)
  - Does the new package support that React version? (check package's npm page)
  - Is it a browser package or Node.js-only? (check package docs)
  - Does it need Vite plugin config? (check package docs for Vite setup)

STEP 2: CHECK FOR CONFLICTS
  - Run: npm ls react (see current React dependency tree)
  - Run: npm info <package> peerDependencies (see what it needs)
  - Any conflicts? → Resolve BEFORE installing

STEP 3: INSTALL SAFELY
  - Use consistent package manager (npm preferred for Lovable)
  - Install: npm install <package>
  - If peer dep error: DO NOT use --force blindly
    → First try: npm install <package> --legacy-peer-deps
    → Then verify build still works

STEP 4: VERIFY IMMEDIATELY
  - Run: npm run build (MUST pass — catches 90% of issues)
  - Run: npm run dev (start dev server)
  - Open browser → check console for errors
  - Navigate to the page using the package → verify it renders

STEP 5: CHECK FOR SIDE EFFECTS
  - Was vite.config.ts modified? → Review changes
  - Was tsconfig.json modified? → Verify @/ alias intact
  - Did lock file change drastically? → Review what changed
```

---

## Mandatory Post-Install Verification

After EVERY package installation, run this sequence:

```bash
# 1. Build check (catches type errors, missing modules, bundler issues)
npm run build

# 2. If build fails, diagnose:
#    - Read the error message carefully
#    - Is it a type error? → Add @types/ package or fix imports
#    - Is it a module not found? → Package may need Vite config
#    - Is it a peer dep? → Check React version compatibility

# 3. Dev server check (catches runtime errors)
npm run dev
# Open http://localhost:8080 in browser
# Check browser console for errors
# Navigate to affected pages
```

---

## Banned Patterns (NEVER DO THESE)

| Pattern | Why It Breaks | Do Instead |
|---------|--------------|------------|
| `"pkg": "file:../path"` | Doesn't exist in Lovable's build env | Copy code into project or publish to npm |
| `"pkg": "link:../path"` | Same as file: — breaks remote builds | Copy code into project |
| `npm install --force` as permanent fix | Masks dependency conflicts, causes runtime crashes | Fix the actual version conflict |
| Mixing npm and bun | Lock file drift, phantom module errors | Pick one, delete the other's lock file |
| Installing Node.js packages for browser use | `fs`, `path`, `crypto` not available in browser | Use browser-compatible alternatives |
| Modifying `node_modules/` directly | Changes lost on next install | Fork the package or use patch-package |
| Ignoring build errors after install | "It works in dev" doesn't mean it works in production | ALWAYS run `npm run build` after installing |
| Installing without checking React version | Peer dep conflicts break everything | Check `npm ls react` first |
| Auto-accepting Lovable's fix suggestions | Often corrupts vite.config.ts | Review every change Lovable suggests |
| Adding 5+ packages at once | Can't isolate which one broke things | Install one at a time, verify after each |

---

## Package Manager Decision Tree

```
Is this a Lovable project (Vite + React)?
├─ YES → Does the project already have bun.lockb?
│   ├─ YES → Continue with bun (bun install, bun add)
│   │         BUT: if bun fails, fall back to npm:
│   │         rm -rf node_modules bun.lockb && npm install
│   └─ NO → Does it have package-lock.json?
│       ├─ YES → Use npm (npm install, npm add)
│       └─ NO → Start with npm (more compatible with Vite ecosystem)
└─ NO → Use whatever the project was set up with
```

---

## Common Safe Packages for Lovable Projects

These packages are known to work without issues:

| Package | Purpose | Notes |
|---------|---------|-------|
| `@tanstack/react-query` | Server state | Works with React 18 & 19 |
| `react-hook-form` | Form management | Works with React 18 & 19 |
| `zod` | Schema validation | Zero dependencies, always safe |
| `date-fns` | Date utilities | Use v3+ for React 19 |
| `lucide-react` | Icons | Works with React 18 & 19 |
| `recharts` | Charts | Works with React 18 & 19 |
| `sonner` | Toast notifications | Works with React 18 & 19 |
| `clsx` / `tailwind-merge` | Class utilities | Zero dependencies |
| `@supabase/supabase-js` | Supabase client | Already in Lovable projects |
| `framer-motion` / `motion` | Animation | Use `motion` for React 19 |

### Packages That Need Caution:

| Package | Issue | Workaround |
|---------|-------|------------|
| `@radix-ui/*` (old versions) | React 19 peer dep | Update to latest or use overrides |
| `react-day-picker` | Strict date-fns peer dep | Install matching date-fns version |
| `@testing-library/react` | React version specific | Match to your React version |
| `cmdk` | Peer dep restrictions | Check compatibility first |
| `storybook` | Vite 5+ issues | Use latest Storybook 8+ |
| Any `@types/react` | Version must match React | Don't install React 18 types with React 19 |

---

## Debug Flowchart: App Won't Load After Package Install

```
App blank/broken after installing a package?
│
├─ Check browser console for errors
│   ├─ "Module not found" → Clean install (rm -rf node_modules && npm install)
│   ├─ "Failed to fetch" → Check vite.config.ts base URL
│   ├─ React error → Check for duplicate React versions (npm ls react)
│   └─ No errors visible → Check Network tab for 404s on JS/CSS files
│
├─ Run npm run build
│   ├─ Type error → Fix types or add @types/ package
│   ├─ Peer dep error → Check React version compatibility
│   ├─ Module not found → Package needs Vite config or isn't browser-compatible
│   └─ Build passes but app still blank → Check vite.config.ts base and outDir
│
├─ Check vite.config.ts
│   ├─ Was it modified? → Revert to known-good version
│   ├─ Missing plugin import? → npm install the plugin
│   └─ Wrong base URL? → Set to './' for Lovable
│
├─ Check package.json
│   ├─ Any file: or link: dependencies? → REMOVE immediately
│   ├─ Duplicate React versions in deps + devDeps? → Remove duplicate
│   └─ Missing required peer deps? → Install them
│
└─ Nuclear option: Revert
    ├─ In Lovable: Use version history to revert
    ├─ In VS Code: git checkout -- package.json && rm -rf node_modules && npm install
    └─ Document what went wrong in memory/user/feedback.md
```

---

*(Lovable package management training for all agents. Prevents the #1 recurring issue in Lovable projects.)*
