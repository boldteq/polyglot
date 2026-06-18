// Capture desktop + mobile screenshots of every PagePilot share page for visual grounding.
//
//   node scripts/pagepilot/screenshot.mjs           # skips pages already shot
//   node scripts/pagepilot/screenshot.mjs --force    # re-shoot all
//
// Output: Polyglot/.research/pagepilot/shots/<slug>-{desktop,mobile}.png
// Uses Playwright (already installed at repo root). Full-page renders so analyze agents
// can cross-check the decoded section order against what actually renders.

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { PAGES, shareUrl } from './pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SHOTS = resolve(REPO, '.research', 'pagepilot', 'shots');
const FORCE = process.argv.includes('--force');

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 1000 },
  { tag: 'mobile', width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
];

async function run() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const p of PAGES) {
      for (const vp of VIEWPORTS) {
        const out = resolve(SHOTS, `${p.slug}-${vp.tag}.png`);
        if (!FORCE && existsSync(out)) { console.log(`· ${p.slug}-${vp.tag} (cached)`); continue; }
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: !!vp.isMobile,
          deviceScaleFactor: vp.deviceScaleFactor || 1,
          userAgent: vp.isMobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' : undefined,
        });
        const page = await ctx.newPage();
        try {
          // PagePilot keeps connections open (analytics/long-poll) so 'networkidle' never fires.
          await page.goto(shareUrl(p.id), { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(4500); // let RR7 hydrate + lazy images settle
          await page.evaluate(async () => { // trigger lazy-load by scrolling through
            await new Promise((r) => { let y = 0; const t = setInterval(() => { window.scrollBy(0, 900); y += 900; if (y > document.body.scrollHeight) { clearInterval(t); window.scrollTo(0, 0); r(); } }, 120); });
          }).catch(() => {});
          await page.waitForTimeout(1200);
          await page.screenshot({ path: out, fullPage: true });
          console.log(`✓ ${p.slug}-${vp.tag}`);
        } catch (err) {
          console.log(`✗ ${p.slug}-${vp.tag}: ${err.message}`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`\nshots → ${SHOTS}`);
}

run();
