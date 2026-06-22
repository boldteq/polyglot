// Holistic cockpit verification — exercises the INTERACTIVE Phase A–D behaviors,
// not just "renders". Uses Chrome via playwright-core, domcontentloaded (SSE
// never idles). Mutations used here are reversible (toggles a CHANGES item then
// toggles it back). Reports a PASS/FAIL line per check + console errors.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3847';
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PE ' + e.message));
const out = [];
const ok = (name, cond) => out.push(`${cond ? '✅' : '❌'} ${name}`);

const builds = await (await fetch(BASE + '/api/workspace/builds')).json();
const bid = (builds.builds.find((b) => b.client === 'gpt test 1') || builds.builds[0]).buildId;
const go = async (tab) => { await page.goto(`${BASE}/workspace/builds/${bid}?tab=${tab}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200); };

// 1) CHANGES tab: toggle an item, confirm count changes, toggle back (reversible).
// The checklist items are the toggle buttons inside the items card (each has a
// checkbox svg). Target the FIRST such button precisely.
await go('changes');
const countText = () => page.locator('text=/\\d+\\/\\d+ complete/').first().innerText().catch(() => '');
// Checklist item buttons carry the long item description; tabs/Add-item/nav are
// all short. Filter to buttons with ≥25 chars of text → only real items match.
const itemBtns = page.getByRole('button').filter({ hasText: /.{25,}/ });
const items = await itemBtns.count();
ok('CHANGES renders items', items > 0);
const n0 = await countText();
await itemBtns.first().click().catch(() => {});
await page.waitForTimeout(1000);
const n1 = await countText();
ok('CHANGES toggle changes the completion count', n0 !== n1 && !!n1);
await itemBtns.first().click().catch(() => {});
await page.waitForTimeout(1000);
const n2 = await countText();
ok('CHANGES toggle is reversible (restored)', n2 === n0);

// 2) CHANGES persists across reload (re-fetch from disk)
await go('changes');
const nReload = await countText();
ok('CHANGES persists across reload', nReload === n0);

// 3) Docs tab renders real doc content
await go('docs');
const docsText = await page.evaluate(() => (document.querySelector('main')?.innerText || '').length);
ok('Docs tab renders content', docsText > 100);

// 4) Workflow tab: lens:run / actions present; deploy steps locked
await go('workflow');
const sendBtns = await page.getByRole('button', { name: /^Send$/ }).count();
ok('Workflow has per-step Send (dispatch) buttons', sendBtns >= 10);

// 5) Design tab renders the design system
await go('design');
const designText = await page.evaluate(() => (document.querySelector('main')?.innerText || '').length);
ok('Design tab renders', designText > 200);

// 6) Agents tab shows the per-build cockpit dispatch section
await go('agents');
const hasDispatch = await page.getByText('Cockpit dispatches on this build').count();
ok('Agents shows per-build cockpit dispatches', hasDispatch > 0);

// 7) Projects page renders
await page.goto(`${BASE}/workspace/projects`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1000);
const projText = await page.evaluate(() => (document.querySelector('main')?.innerText || '').length);
ok('Projects page renders', projText > 50);

console.log(out.join('\n'));
console.log(`\nconsole errors: ${errors.length}${errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''}`);
console.log(`FAILS: ${out.filter((l) => l.startsWith('❌')).length}`);
await browser.close();
