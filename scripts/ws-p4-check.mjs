// Focused P4 verification: load a build detail, confirm the ActionsBar renders
// ("Re-run gates" + "Playground"), click it, and capture the confirm dialog.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3847';
const OUT = '/tmp/ws-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message));

const builds = await (await fetch(BASE + '/api/workspace/builds')).json();
const bid = (builds.builds.find((b) => b.client === 'gpt test 1') || builds.builds[0]).buildId;

// NOTE: don't wait for networkidle — the build detail keeps an SSE stream open,
// so the network never idles. Wait for the actual button instead.
await page.goto(`${BASE}/workspace/builds/${bid}?tab=overview`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /Re-run gates/i }).first().waitFor({ timeout: 15000 }).catch(() => {});

const hasRerun = await page.getByRole('button', { name: /Re-run gates/i }).count();
const hasPlayground = await page.getByRole('button', { name: /Playground/i }).count();
await page.screenshot({ path: `${OUT}/p4-01-actionsbar.png` });
console.log(`ActionsBar: Re-run gates button=${hasRerun} · Playground button=${hasPlayground}`);

// click Re-run gates → confirm dialog should appear
if (hasRerun) {
  await page.getByRole('button', { name: /Re-run gates/i }).first().click();
  await page.waitForTimeout(600);
  const dialogText = await page.evaluate(() => document.body.innerText.includes('Re-run static gates') ? 'CONFIRM DIALOG SHOWN' : 'no dialog');
  await page.screenshot({ path: `${OUT}/p4-02-confirm.png` });
  console.log(`Confirm dialog: ${dialogText}`);
  // cancel — do NOT actually trigger the mutation in the verify
  const cancel = await page.getByRole('button', { name: /cancel/i }).count();
  if (cancel) { await page.getByRole('button', { name: /cancel/i }).first().click(); console.log('Cancelled (no mutation triggered)'); }
}

console.log(`console errors: ${errors.length}${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
