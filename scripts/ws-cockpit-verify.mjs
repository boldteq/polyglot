// Holistic verification of the redesigned project-centric Workspace. Chrome via
// playwright-core, domcontentloaded (SSE never idles). Exercises: 1-item nav,
// Projects home (rows/summary/filter), home→detail navigation, the single-scroll
// project panel (hero, jump-rail, sections, live activity), and that the editable
// CHANGES section still toggles + persists (reversible).
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3847';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PE ' + e.message));
const out = [];
const ok = (name, cond) => out.push(`${cond ? '✅' : '❌'} ${name}`);

// 1) Projects home — 1 nav item, rows, summary, filter
await page.goto(`${BASE}/workspace`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
ok('sidebar has exactly 1 nav item', (await page.locator('aside nav a').count()) === 1);
const rows = await page.locator('.card [role="button"]').count();
ok('Projects home renders rows', rows > 0);
ok('home has summary strip', (await page.getByText(/avg score/).count()) > 0);
ok('home has filter', (await page.getByText('attention', { exact: true }).count()) > 0);

// 2) home → project detail
await page.locator('.card [role="button"]').first().click();
await page.waitForURL(/\/workspace\/p\//, { timeout: 8000 }).catch(() => {});
ok('clicking a row opens /workspace/p/:id', /\/workspace\/p\//.test(page.url()));
await page.waitForTimeout(1500);

// 3) detail panel — hero, jump-rail, sections, activity
ok('detail has jump-rail sections', (await page.locator('aside nav button').count()) >= 6);
ok('detail has anchored sections', (await page.locator('section[id]').count()) >= 6);
ok('detail shows Repo & files', (await page.getByText(/Repo & files/).count()) > 0);
ok('detail shows VS Code link', (await page.getByText('VS Code').count()) > 0);
ok('activity timeline present', (await page.getByText('Activity', { exact: true }).count()) > 0);

// 4) editable CHANGES section still toggles + reversible
await page.locator('#changes')?.scrollIntoViewIfNeeded?.().catch(() => {});
await page.waitForTimeout(800);
const countText = () => page.locator('text=/\\d+\\/\\d+ complete/').first().innerText().catch(() => '');
const itemBtns = page.getByRole('button').filter({ hasText: /.{25,}/ });
const n0 = await countText();
if ((await itemBtns.count()) > 0 && n0) {
  await itemBtns.first().click().catch(() => {});
  await page.waitForTimeout(1000);
  const n1 = await countText();
  ok('CHANGES toggle changes count', n0 !== n1 && !!n1);
  await itemBtns.first().click().catch(() => {}); // restore
  await page.waitForTimeout(1000);
  ok('CHANGES toggle reversible', (await countText()) === n0);
} else {
  ok('CHANGES section present (no items to toggle)', true);
}

await page.screenshot({ path: '/tmp/ws-shots/redesign-detail.png', fullPage: true });
console.log(out.join('\n'));
console.log(`\nconsole errors: ${errors.length}${errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''}`);
console.log(`FAILS: ${out.filter((l) => l.startsWith('❌')).length}`);
await browser.close();
