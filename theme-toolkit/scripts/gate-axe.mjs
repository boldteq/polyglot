#!/usr/bin/env node
// Gate 5 — axe-core accessibility audit (lumen). Drives headless Chromium via
// Playwright across the resolved page matrix (core 5 + discovered blog/article)
// at mobile 375x812 + desktop 1280x800, running
// AxeBuilder.withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze().
// Posture: 0 violations = pass; every violation is a blocker.
//
// Usage:
//   node gate-axe.mjs [--pages home,pdp] [--viewports mobile,desktop]
//
// Env:  THEME_PREVIEW_URL (required) · THEME_STORE_PASSWORD · REPORT_DIR
//       FIRST_PRODUCT_HANDLE / FIRST_COLLECTION_HANDLE / BLOG_PATH / ARTICLE_PATH
// Out:  $REPORT_DIR/axe.json (schema via lib/report.mjs)
// Exit: 0 = pass · 1 = block (violations) · 2 = env error (missing dep / no URL /
//       password wall / mandatory page unreachable)

import { writeReport } from './lib/report.mjs'
import { resolvePages, EnvError, MANDATORY_PAGES } from './lib/pages.mjs'

const started = Date.now()
const reportDir = process.env.REPORT_DIR || 'gate-reports'

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
]
const DEFAULT_PAGES = [...MANDATORY_PAGES, 'blog', 'article']
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const DEP_HINT = 'npm ci --prefix toolkit && npx --prefix toolkit playwright install chromium'

function finish(code, data) {
  const { file, report } = writeReport('axe', 5, { ...data, duration_ms: Date.now() - started }, reportDir)
  console.log(`report: ${file} (pass=${report.pass}, blockers=${report.blockers.length}, warnings=${report.warnings.length})`)
  process.exit(code)
}

function envFail(reason, extra = {}) {
  console.error(`ENV-ERROR: ${reason}`)
  finish(2, {
    pass: false,
    url: process.env.THEME_PREVIEW_URL ?? null,
    evidence: { skipped: 'env', reason, ...extra },
  })
}

// ── args ──────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`Gate 5 — axe accessibility audit

Usage:
  node gate-axe.mjs [--pages home,pdp] [--viewports mobile,desktop]

Pages:     ${DEFAULT_PAGES.join(', ')} (default: all; blog/article skip silently when absent)
Viewports: ${VIEWPORTS.map(v => `${v.name} ${v.width}x${v.height}`).join(', ')} (default: both)
Env:       THEME_PREVIEW_URL (required), THEME_STORE_PASSWORD, REPORT_DIR
Exit:      0 pass · 1 block · 2 env error
`)
}

function parseArgs(argv) {
  const out = { pages: [...DEFAULT_PAGES], viewports: VIEWPORTS.map(v => v.name), help: false }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--pages') out.pages = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--viewports') out.viewports = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else {
      console.error(`unknown arg: ${a} (see --help)`)
      process.exit(2)
    }
  }
  return out
}

// ── storefront password wall (ported from lib/pages.mjs into the browser) ──
function onPasswordPage(page) {
  try {
    return /\/password\/?$/.test(new URL(page.url()).pathname)
  } catch {
    return false
  }
}

async function gotoWithAuth(page, url, password) {
  await page.goto(url, { waitUntil: 'load', timeout: 45_000 })
  if (onPasswordPage(page)) {
    if (!password) {
      throw new EnvError(`${url} redirects to the storefront password page and no password was provided (set THEME_STORE_PASSWORD)`)
    }
    const input = page.locator('form[action*="password"] input[name="password"], input[name="password"]').first()
    await input.fill(password)
    await input.press('Enter') // sets the storefront_digest cookie on the browser context
    await page.waitForLoadState('load')
    await page.goto(url, { waitUntil: 'load', timeout: 45_000 })
    if (onPasswordPage(page)) {
      throw new EnvError(`storefront password rejected at ${new URL(url).origin}/password`)
    }
  }
  await page.waitForTimeout(1000) // settle hydration / lazy sections
}

// page load or axe crash can be flaky → one retry, then hard env failure
// (exit 2 — an unauditable page must never read as pass).
async function auditTarget(page, AxeBuilder, target, password) {
  let lastErr
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await gotoWithAuth(page, target.url, password)
      return await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
    } catch (err) {
      if (err instanceof EnvError) throw err
      lastErr = err
    }
  }
  throw new EnvError(`could not audit ${target.id} at ${target.url}: ${lastErr.message}`)
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const previewUrl = process.env.THEME_PREVIEW_URL || null
  if (!previewUrl) envFail('THEME_PREVIEW_URL not set (URL gates need a preview URL)')

  const badPages = args.pages.filter(p => !DEFAULT_PAGES.includes(p))
  if (badPages.length > 0) envFail(`unknown page id(s): ${badPages.join(', ')} (valid: ${DEFAULT_PAGES.join(', ')})`)
  const viewports = args.viewports.map(name => VIEWPORTS.find(v => v.name === name))
  if (viewports.some(v => !v)) {
    envFail(`unknown viewport(s): ${args.viewports.filter(n => !VIEWPORTS.some(v => v.name === n)).join(', ')} (valid: ${VIEWPORTS.map(v => v.name).join(', ')})`)
  }

  // dep guard — playwright + axe live in the toolkit's node_modules (resolved
  // upward from this script's directory, not from the theme repo cwd)
  const missing = []
  let chromium
  let AxeBuilder
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    missing.push('playwright')
  }
  try {
    ;({ default: AxeBuilder } = await import('@axe-core/playwright'))
  } catch {
    missing.push('@axe-core/playwright')
  }
  if (missing.length > 0) {
    envFail(`missing deps: ${missing.join(', ')}`, { hint: DEP_HINT })
  }

  const password = process.env.THEME_STORE_PASSWORD || process.env.STOREFRONT_PASSWORD || null
  const { pages } = await resolvePages({ previewUrl, password, want: args.pages })
  const targets = pages.filter(p => !p.skipped)
  const skippedPages = pages.filter(p => p.skipped).map(p => ({ page: p.id, reason: p.reason }))
  if (targets.length === 0) throw new EnvError('no auditable pages resolved (all requested pages skipped)')

  const blockers = []
  const audited = []
  const ruleTotals = {}

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    throw new EnvError(`could not launch chromium: ${err.message} — run: npx --prefix toolkit playwright install chromium`)
  }
  try {
    for (const vp of viewports) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
      const page = await context.newPage()
      for (const target of targets) {
        process.stdout.write(`  axe ${target.id} @ ${vp.name} (${vp.width}x${vp.height}) ... `)
        const results = await auditTarget(page, AxeBuilder, target, password)
        for (const v of results.violations) {
          ruleTotals[v.id] = (ruleTotals[v.id] || 0) + v.nodes.length
          blockers.push({
            id: `axe.${v.id}`,
            page: `${target.id}@${vp.name}`,
            detail: `${v.impact ?? 'unknown'} — ${v.description}`,
            evidence: `${v.nodes.length} node(s); first: ${v.nodes[0]?.target?.join(' ') ?? '(no selector)'}`,
          })
        }
        audited.push({ page: target.id, viewport: vp.name, url: target.url, violations: results.violations.length, incomplete: results.incomplete.length })
        console.log(`${results.violations.length} violation(s)`)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }

  const pass = blockers.length === 0
  console.log(`axe: ${blockers.length} violation(s) across ${audited.length} page×viewport run(s)`)
  finish(pass ? 0 : 1, {
    pass,
    url: previewUrl,
    blockers,
    evidence: {
      tags: AXE_TAGS,
      viewports: viewports.map(v => `${v.name} ${v.width}x${v.height}`),
      audited,
      skippedPages,
      rules: ruleTotals,
    },
  })
}

main().catch(err => {
  const reason = err instanceof EnvError ? err.message : `script error: ${err.message}`
  console.error(`ENV-ERROR: ${reason}`)
  if (!(err instanceof EnvError)) console.error(err.stack)
  finish(2, { pass: false, url: process.env.THEME_PREVIEW_URL ?? null, evidence: { skipped: 'env', reason } })
})
