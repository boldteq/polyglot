/**
 * Polyglot UI Audit — Playwright screenshot + issue detector
 * Run: node playwright-audit.js
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3847';
const OUT = path.join(__dirname, 'audit-screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { name: '01-dashboard', url: '/' },
  { name: '02-all-agents', url: '/agents' },
  { name: '03-orchestration', url: '/orchestration' },
  { name: '04-playground', url: '/playground' },
  { name: '05-analytics-overview', url: '/analytics?tab=overview' },
  { name: '06-analytics-runs', url: '/analytics?tab=runs' },
  { name: '07-analytics-health', url: '/analytics?tab=health' },
  { name: '08-org-chart', url: '/org-chart' },
  { name: '09-hr', url: '/hr' },
  { name: '10-schedules', url: '/schedules?tab=schedules' },
  { name: '11-webhooks', url: '/schedules?tab=webhooks' },
  { name: '12-settings-general', url: '/settings?tab=general' },
  { name: '13-settings-claude-md', url: '/settings?tab=claude-md' },
  { name: '14-settings-templates', url: '/settings?tab=templates' },
  { name: '15-settings-memory', url: '/settings?tab=memory' },
  { name: '16-settings-backup', url: '/settings?tab=backup' },
  { name: '17-settings-database', url: '/settings?tab=database' },
  { name: '18-goals', url: '/goals' },
  { name: '19-docs', url: '/docs' },
  { name: '20-how-it-works', url: '/how-it-works' },
  // Dark mode versions of key pages
  { name: '21-dark-dashboard', url: '/', dark: true },
  { name: '22-dark-agents', url: '/agents', dark: true },
  { name: '23-dark-playground', url: '/playground', dark: true },
  { name: '24-dark-settings', url: '/settings?tab=general', dark: true },
];

const issues = [];

async function captureRoute(page, route) {
  await page.goto(`${BASE}${route.url}`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(800);

  if (route.dark) {
    // Toggle dark mode via the theme button in sidebar
    const themeBtn = page.locator('[title*="dark"], [title*="light"], [aria-label*="theme"], button:has(svg[data-lucide="sun"]), button:has(svg[data-lucide="moon"])').first();
    if (await themeBtn.count() > 0) {
      // Check current theme
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme'));
      if (theme !== 'dark') await themeBtn.click();
      await page.waitForTimeout(400);
    } else {
      // Force dark mode via localStorage
      await page.evaluate(() => {
        localStorage.setItem('theme', 'dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      });
      await page.waitForTimeout(300);
    }
  }

  const screenshotPath = path.join(OUT, `${route.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Run checks
  await checkPage(page, route, screenshotPath);

  return screenshotPath;
}

async function checkPage(page, route, screenshotPath) {
  const url = route.url;
  const name = route.name;

  // Check for console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Check for visible error states
  const errorElements = await page.locator('.text-red-500, .text-destructive, [class*="error"]:visible').count();
  if (errorElements > 0) {
    const errorTexts = await page.locator('.text-red-500, .text-destructive').allTextContents();
    issues.push({ page: name, type: 'ERROR_VISIBLE', detail: errorTexts.slice(0, 3).join(' | ') });
  }

  // Check for "undefined" text visible on page
  const bodyText = await page.locator('body').textContent();
  if (bodyText && (bodyText.includes('undefined') || bodyText.includes('[object Object]'))) {
    issues.push({ page: name, type: 'BAD_DATA_RENDER', detail: 'Found "undefined" or "[object Object]" in page text' });
  }

  // Check for broken images
  const brokenImages = await page.evaluate(() => {
    return Array.from(document.images)
      .filter(img => !img.complete || img.naturalWidth === 0)
      .map(img => img.src);
  });
  if (brokenImages.length > 0) {
    issues.push({ page: name, type: 'BROKEN_IMAGE', detail: brokenImages.join(', ') });
  }

  // Check for overlapping elements (basic check)
  const zIndexIssues = await page.evaluate(() => {
    const els = document.querySelectorAll('[style*="z-index"]');
    const highZ = Array.from(els).filter(el => {
      const z = parseInt(window.getComputedStyle(el).zIndex);
      return z > 1000 && el.offsetParent !== null;
    });
    return highZ.map(el => el.tagName + '.' + el.className.slice(0, 50));
  });

  // Check loading spinners still showing (indicates hung API calls)
  const loadingSpinners = await page.locator('.animate-spin:visible').count();
  if (loadingSpinners > 0) {
    // Wait a bit more and recheck
    await page.waitForTimeout(2000);
    const stillLoading = await page.locator('.animate-spin:visible').count();
    if (stillLoading > 0) {
      issues.push({ page: name, type: 'STUCK_LOADING', detail: `${stillLoading} spinner(s) still visible after 3s` });
    }
  }

  // Check for empty states that should have data
  const emptyMessages = await page.locator('text=/no agents|no results|nothing here|empty/i').count();
  if (emptyMessages > 0) {
    // Not necessarily an error, just note it
    const texts = await page.locator('text=/no agents|no results|nothing here|empty/i').allTextContents();
    issues.push({ page: name, type: 'EMPTY_STATE', detail: texts.slice(0, 2).join(' | '), severity: 'info' });
  }

  return issues;
}

async function main() {
  console.log('🎭 Starting Polyglot UI Audit...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Capture console errors globally
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ url: page.url(), text: msg.text() });
  });
  page.on('pageerror', err => {
    consoleErrors.push({ url: page.url(), text: err.message });
  });

  const results = [];

  for (const route of ROUTES) {
    process.stdout.write(`  Capturing ${route.name}...`);
    try {
      const screenshotPath = await captureRoute(page, route);
      results.push({ route: route.name, status: 'ok', path: screenshotPath });
      console.log(' ✓');
    } catch (err) {
      results.push({ route: route.name, status: 'error', error: err.message });
      console.log(` ✗ ${err.message}`);
      issues.push({ page: route.name, type: 'PAGE_CRASH', detail: err.message });
    }
  }

  await browser.close();

  // Report
  console.log('\n' + '='.repeat(60));
  console.log('AUDIT RESULTS');
  console.log('='.repeat(60));
  console.log(`Screenshots saved to: ${OUT}`);
  console.log(`Pages captured: ${results.filter(r => r.status === 'ok').length}/${ROUTES.length}`);

  if (consoleErrors.length > 0) {
    console.log(`\n⚠️  Console Errors (${consoleErrors.length}):`);
    const unique = [...new Set(consoleErrors.map(e => e.text))];
    unique.slice(0, 10).forEach(e => console.log(`   - ${e.slice(0, 120)}`));
  }

  const realIssues = issues.filter(i => i.severity !== 'info');
  const infoIssues = issues.filter(i => i.severity === 'info');

  if (realIssues.length > 0) {
    console.log(`\n❌ Issues Found (${realIssues.length}):`);
    realIssues.forEach(i => console.log(`   [${i.page}] ${i.type}: ${i.detail}`));
  }

  if (infoIssues.length > 0) {
    console.log(`\nℹ️  Info (${infoIssues.length}):`);
    infoIssues.forEach(i => console.log(`   [${i.page}] ${i.type}: ${i.detail}`));
  }

  if (realIssues.length === 0 && consoleErrors.length === 0) {
    console.log('\n✅ No critical issues found!');
  }

  // Save JSON report
  const report = { timestamp: new Date().toISOString(), results, issues, consoleErrors };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nFull report: ${path.join(OUT, 'report.json')}`);
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
