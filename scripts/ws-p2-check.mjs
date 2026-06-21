// P2 verification: open the Workflow tab, click a "Send" button, confirm the
// dispatch drawer opens in compose phase (editable task + Dispatch button).
// Does NOT actually dispatch (would spawn a real agent + cost tokens).
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3847';

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERR ' + e.message));

const builds = await (await fetch(BASE + '/api/workspace/builds')).json();
const bid = (builds.builds.find((b) => b.client === 'gpt test 1') || builds.builds[0]).buildId;

await page.goto(`${BASE}/workspace/builds/${bid}?tab=workflow`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /^Send$/ }).first().waitFor({ timeout: 15000 }).catch(() => {});

const sendBtns = await page.getByRole('button', { name: /^Send$/ }).count();
console.log(`Workflow "Send" buttons: ${sendBtns}`);

if (sendBtns) {
  await page.getByRole('button', { name: /^Send$/ }).first().click();
  await page.waitForTimeout(500);
  const drawerOpen = await page.evaluate(() => document.body.innerText.includes('Dispatch ·'));
  const hasTextarea = await page.locator('textarea').count();
  const hasDispatchBtn = await page.getByRole('button', { name: /^Dispatch /i }).count();
  await page.screenshot({ path: '/tmp/ws-shots/p2-dispatch-drawer.png' });
  console.log(`Drawer open: ${drawerOpen} · textarea: ${hasTextarea} · Dispatch button: ${hasDispatchBtn}`);
}

console.log(`console errors: ${errors.length}${errors.length ? ' → ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
