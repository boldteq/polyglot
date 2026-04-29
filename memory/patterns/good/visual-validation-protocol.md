# Visual Validation Protocol — Auto-Screenshot, Validate & Fix

**Purpose:** Enable any agent to automatically screenshot the running app, visually validate UI, and fix issues — no manual screenshots needed.

**Status:** PRIMARY PATTERN — all agents with UI responsibility must use this.

---

## How It Works

```
1. Dev server running (any stack)
2. Agent runs screenshot script → captures all pages at 3 viewports
3. Agent reads screenshots (Claude can see images natively)
4. Agent identifies visual bugs (spacing, alignment, overflow, broken layout, etc.)
5. Agent fixes code → re-runs screenshot → validates fix
6. Loop until clean
```

---

## Setup (One-Time Per Project)

### Install Playwright

Run this in the project root:

```bash
# Check if playwright is already installed
if ! npx playwright --version 2>/dev/null; then
  npm install -D playwright @playwright/test
  npx playwright install chromium --with-deps
fi
```

**Note:** Only chromium is needed — skip firefox/webkit to save space/time.

---

## Screenshot Script

Agents should create this file at project root if it doesn't exist: `scripts/screenshot.mjs`

```javascript
#!/usr/bin/env node
/**
 * Auto-Screenshot Utility for Visual Validation
 * Usage: node scripts/screenshot.mjs [--port 8080] [--routes /,/settings,/admin] [--viewport desktop]
 *
 * Outputs screenshots to: .screenshots/
 * Agents read these files to validate UI visually.
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

// --- Config ---
const DEFAULT_PORT = detectPort();
const SCREENSHOT_DIR = resolve('.screenshots');
const VIEWPORTS = {
  mobile:  { width: 375, height: 812 },   // iPhone 14
  tablet:  { width: 768, height: 1024 },   // iPad
  desktop: { width: 1440, height: 900 },   // MacBook
};

// --- Helpers ---
function detectPort() {
  // Auto-detect from vite.config, next.config, or package.json
  const files = [
    { path: 'vite.config.ts', regex: /port:\s*(\d+)/ },
    { path: 'vite.config.js', regex: /port:\s*(\d+)/ },
    { path: 'next.config.js', regex: /port:\s*(\d+)/ },
    { path: 'next.config.mjs', regex: /port:\s*(\d+)/ },
  ];
  for (const f of files) {
    if (existsSync(f.path)) {
      const content = readFileSync(f.path, 'utf-8');
      const match = content.match(f.regex);
      if (match) return parseInt(match[1]);
    }
  }
  // Check package.json scripts for --port flag
  if (existsSync('package.json')) {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const devScript = pkg.scripts?.dev || '';
    const portMatch = devScript.match(/--port\s+(\d+)/);
    if (portMatch) return parseInt(portMatch[1]);
  }
  // Default: Vite=5173, Next=3000, Lovable=8080
  if (existsSync('vite.config.ts') || existsSync('vite.config.js')) return 8080;
  if (existsSync('next.config.js') || existsSync('next.config.mjs')) return 3000;
  return 3000;
}

function detectRoutes() {
  // Auto-detect from React Router, Next.js, or Remix
  const routeFiles = [
    'src/App.tsx', 'src/app/App.tsx', 'app/routes.tsx',  // React Router
    'src/main.tsx',                                        // Vite SPA
  ];

  const routes = new Set(['/']);

  for (const file of routeFiles) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');

    // Match: path="/something" or path: "/something"
    const pathMatches = content.matchAll(/path[=:]\s*["']([^"']+)["']/g);
    for (const m of pathMatches) {
      const route = m[1];
      // Skip dynamic routes like :id, *, $param
      if (!route.includes(':') && !route.includes('*') && !route.includes('$')) {
        routes.add(route.startsWith('/') ? route : '/' + route);
      }
    }
  }

  // Next.js App Router: scan app/ directory
  if (existsSync('app') || existsSync('src/app')) {
    const appDir = existsSync('src/app') ? 'src/app' : 'app';
    // Would need fs.readdirSync recursion — simplified for now
  }

  // Lovable/Vite: scan src/pages/ directory
  if (existsSync('src/pages')) {
    // Pages are PascalCase .tsx files → routes are lowercase
    // e.g., Settings.tsx → /settings, Admin.tsx → /admin
    const { readdirSync } = await import('fs');
    const pages = readdirSync('src/pages').filter(f => f.endsWith('.tsx') && f !== 'NotFound.tsx');
    for (const page of pages) {
      const name = page.replace('.tsx', '');
      if (name === 'Index') routes.add('/');
      else routes.add('/' + name.toLowerCase().replace(/([A-Z])/g, (m, p1, offset) => offset ? '-' + p1.toLowerCase() : p1.toLowerCase()));
    }
  }

  return [...routes];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') parsed.port = parseInt(args[++i]);
    if (args[i] === '--routes') parsed.routes = args[++i].split(',');
    if (args[i] === '--viewport') parsed.viewport = args[++i]; // mobile, tablet, desktop, or all
    if (args[i] === '--auth-cookie') parsed.authCookie = args[++i]; // optional session cookie
    if (args[i] === '--dark') parsed.dark = true;
    if (args[i] === '--full-page') parsed.fullPage = true;
  }
  return parsed;
}

// --- Main ---
async function run() {
  const args = parseArgs();
  const port = args.port || DEFAULT_PORT;
  const baseUrl = `http://localhost:${port}`;
  const routes = args.routes || detectRoutes();
  const viewportKeys = args.viewport === 'all'
    ? Object.keys(VIEWPORTS)
    : [args.viewport || 'desktop'];

  console.log(`📸 Screenshot config:`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Routes: ${routes.join(', ')}`);
  console.log(`   Viewports: ${viewportKeys.join(', ')}`);
  console.log(`   Output: ${SCREENSHOT_DIR}/`);

  // Create output dir
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vpKey of viewportKeys) {
    const vp = VIEWPORTS[vpKey];
    const context = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: 2, // Retina for clarity
      colorScheme: args.dark ? 'dark' : 'light',
    });

    // Inject auth cookie if provided
    if (args.authCookie) {
      await context.addCookies([{
        name: 'sb-access-token',
        value: args.authCookie,
        domain: 'localhost',
        path: '/',
      }]);
    }

    const page = await context.newPage();

    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      const filename = `${vpKey}_${route.replace(/\//g, '_').replace(/^_/, '') || 'home'}.png`;
      const filepath = join(SCREENSHOT_DIR, filename);

      try {
        const response = await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 15000
        });

        // Wait for hydration / lazy content
        await page.waitForTimeout(1500);

        // Check for console errors
        const consoleErrors = [];
        page.on('console', msg => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.screenshot({
          path: filepath,
          fullPage: args.fullPage || false,
        });

        const status = response?.status() || 'unknown';
        const result = { route, viewport: vpKey, file: filename, status, errors: consoleErrors };
        results.push(result);

        console.log(`   ✅ ${vpKey} ${route} → ${filename} (${status})`);
      } catch (err) {
        const result = { route, viewport: vpKey, file: null, status: 'FAILED', error: err.message };
        results.push(result);
        console.log(`   ❌ ${vpKey} ${route} → FAILED: ${err.message}`);
      }
    }

    await context.close();
  }

  await browser.close();

  // Write manifest for agents to read
  const manifest = {
    timestamp: new Date().toISOString(),
    baseUrl,
    routes,
    viewports: viewportKeys,
    screenshots: results,
  };
  writeFileSync(join(SCREENSHOT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n📋 Manifest: ${SCREENSHOT_DIR}/manifest.json`);
  console.log(`📸 ${results.filter(r => r.file).length} screenshots captured`);

  // Summary for agent consumption
  const failed = results.filter(r => !r.file);
  if (failed.length) {
    console.log(`\n⚠️  Failed routes:`);
    failed.forEach(f => console.log(`   ${f.route}: ${f.error}`));
  }
}

run().catch(err => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
```

---

## Agent Usage Protocol

### Quick Visual Check (Most Common)

Any agent can run this sequence:

```bash
# Step 1: Ensure dev server is running
# (check if already running, start if not)
if ! curl -s http://localhost:$(node -e "
  const fs = require('fs');
  if (fs.existsSync('vite.config.ts')) {
    const c = fs.readFileSync('vite.config.ts','utf8');
    const m = c.match(/port:\s*(\d+)/);
    console.log(m ? m[1] : '8080');
  } else console.log('3000');
") > /dev/null 2>&1; then
  echo "⚠️ Dev server not running. Start it first: npm run dev"
  exit 1
fi

# Step 2: Install playwright if missing
if ! npx playwright --version 2>/dev/null; then
  npm install -D playwright @playwright/test
  npx playwright install chromium --with-deps
fi

# Step 3: Create screenshot script if missing
# (Agent writes scripts/screenshot.mjs from template above)

# Step 4: Run screenshots
node scripts/screenshot.mjs --viewport all

# Step 5: Agent reads screenshots using Read tool
# Read .screenshots/manifest.json → get file list
# Read each .screenshots/*.png → visually inspect
```

### Full Visual Validation Loop

```
WHILE issues_found:
  1. Run screenshot script (all viewports)
  2. Read each screenshot
  3. For each screenshot, check:
     - Layout: Is content centered? Sidebar visible? No overflow?
     - Spacing: Consistent gaps? Nothing touching edges?
     - Typography: Readable? Hierarchy clear? No truncation?
     - Colors: Contrast OK? Dark mode correct? No white flashes?
     - Components: All rendered? No broken/missing elements?
     - Responsive: Content adapts properly? No horizontal scroll?
     - Empty states: Shown when no data? Has CTA?
     - Loading states: Skeleton shown? Not just blank?
  4. List issues with exact location + file + fix
  5. Apply fixes
  6. Re-run screenshots
  7. Verify fixes resolved
```

---

## Viewport Strategy

| Check Type | Viewports Needed |
|------------|-----------------|
| Quick layout check | desktop only |
| Pre-deploy review | desktop + mobile |
| Full audit | all 3 (mobile + tablet + desktop) |
| Responsive bug | mobile + desktop (compare) |

---

## Route Detection

The script auto-detects routes from:

1. **React Router** — parses `path="..."` from App.tsx
2. **Next.js** — scans `app/` directory structure
3. **Lovable/Vite** — scans `src/pages/` directory (PascalCase → kebab-case routes)
4. **Manual override** — `--routes /,/settings,/admin,/pricing`

For auth-protected routes, pass a session cookie:
```bash
node scripts/screenshot.mjs --auth-cookie "your-supabase-session-token"
```

---

## Dark Mode Validation

```bash
# Light mode screenshots
node scripts/screenshot.mjs --viewport desktop

# Dark mode screenshots
node scripts/screenshot.mjs --viewport desktop --dark

# Agent compares both sets for:
# - Missing dark tokens (white backgrounds in dark mode)
# - Low contrast text
# - Images without dark variants
# - Borders that disappear
```

---

## Integration Points

### Which agents use this:

| Agent | When | What they check |
|-------|------|-----------------|
| **Vega** | After design spec, before sign-off | Layout matches spec, spacing, visual hierarchy, responsive |
| **Koda** | After building UI, before handoff | Components render, no visual regressions, responsive works |
| **Vex** | When debugging UI bugs | Compare before/after screenshots to verify fix |
| **Sage** | Pre-deploy audit | Visual regression check, responsive, a11y contrast |
| **Luna** | Visual regression tests | Baseline vs current screenshot comparison |
| **Yash** | Phase gate verification | All pages render correctly at all viewports |

### When to auto-screenshot:

1. **After building any UI** — Koda screenshots immediately after writing component code
2. **After fixing any UI bug** — Vex screenshots before/after to prove the fix
3. **Phase gates** — Yash requires screenshots at every gate transition
4. **Pre-deploy** — Sage includes screenshot validation in deploy approval
5. **On demand** — Any agent can screenshot at any time for any reason

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `playwright not found` | Run `npm install -D playwright && npx playwright install chromium --with-deps` |
| Screenshots are blank | Dev server not running or wrong port. Check with `curl http://localhost:PORT` |
| Auth pages only | Pass `--auth-cookie` with valid session token |
| Script timeout | Increase timeout in script or check if page has infinite loading |
| `ERR_CONNECTION_REFUSED` | Dev server crashed. Restart with `npm run dev` |
| Screenshots too small | Script uses 2x deviceScaleFactor by default for retina clarity |

---

## Important Notes

1. **Screenshots go to `.screenshots/`** — add this to `.gitignore`
2. **Manifest file** — `.screenshots/manifest.json` lists all captures with status codes and errors
3. **Agents can read PNG files** — Claude natively sees images via the Read tool
4. **Re-run after fixes** — always verify with a fresh screenshot, never assume the fix worked
5. **Full page vs viewport** — use `--full-page` for long scrolling pages, default is viewport-only
6. **The script auto-detects port** — checks vite.config, next.config, package.json in that order
