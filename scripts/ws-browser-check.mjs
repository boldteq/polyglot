// Drives the real app in headless Chrome to verify every Workspace surface
// renders (catches what curl can't: crashes, blank panels, console errors,
// broken layout). Uses the installed Google Chrome binary via playwright-core.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:3847';
const OUT = '/tmp/ws-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${page.url().replace(BASE, '')}] ${m.text()}`); });
page.on('pageerror', (e) => pageErrors.push(`[${page.url().replace(BASE, '')}] ${e.message}`));

async function shot(routePath, name, waitText) {
  consoleErrors.length = 0; // scope errors to this view
  await page.goto(BASE + routePath, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  if (waitText) {
    try { await page.getByText(waitText, { exact: false }).first().waitFor({ timeout: 8000 }); }
    catch { /* note via empty-check below */ }
  } else {
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  // crude blank/empty detection: visible text length in <main>
  const textLen = await page.evaluate(() => (document.querySelector('main')?.innerText || document.body.innerText || '').trim().length);
  const errs = consoleErrors.slice();
  console.log(`${errs.length ? '⚠️' : '✅'} ${name.padEnd(26)} text=${String(textLen).padStart(5)} ${errs.length ? '· errors: ' + errs.length : ''}`);
  if (errs.length) errs.slice(0, 3).forEach((e) => console.log(`     ${e.slice(0, 140)}`));
  return { name, textLen, errors: errs };
}

const results = [];
// Mission Control + list pages
results.push(await shot('/workspace', '01-mission-control', 'Mission Control'));
results.push(await shot('/workspace/builds', '02-builds', 'Builds'));
results.push(await shot('/workspace/clients', '03-clients', 'Clients'));
results.push(await shot('/workspace/escalations', '04-escalations'));
results.push(await shot('/workspace/results', '05-results-page'));

// Resolve a real buildId from the API, then every tab
const builds = await (await fetch(BASE + '/api/workspace/builds')).json();
const bid = (builds.builds.find((b) => b.client === 'gpt test 1') || builds.builds[0])?.buildId;
console.log(`\n--- build detail tabs (buildId=${bid}) ---`);
const TABS = ['overview', 'pipeline', 'gates', 'lens', 'changes', 'agents', 'schedules', 'results', 'files'];
for (const t of TABS) {
  results.push(await shot(`/workspace/builds/${bid}?tab=${t}`, `tab-${t}`));
}

console.log('\n=== SUMMARY ===');
const blanks = results.filter((r) => r.textLen < 50);
const withErrors = results.filter((r) => r.errors.length);
console.log(`screens: ${results.length} · blank(<50 chars): ${blanks.length} · with console errors: ${withErrors.length}`);
if (blanks.length) console.log('BLANK:', blanks.map((b) => b.name).join(', '));
if (pageErrors.length) { console.log('PAGE ERRORS (uncaught):'); pageErrors.slice(0, 8).forEach((e) => console.log('  ' + e.slice(0, 160))); }
console.log(`shots → ${OUT}`);

writeFileSync(`${OUT}/report.json`, JSON.stringify({
  screens: results.length,
  blanks: blanks.map((b) => b.name),
  withErrors: withErrors.map((r) => ({ name: r.name, errors: r.errors })),
  pageErrors,
}, null, 2));

await browser.close();
