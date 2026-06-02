#!/usr/bin/env node
// Vigil runtime — Playwright + axe + Lighthouse audit of a deployed web page.
// Implements the 9-check audit from
// ~/.claude/skills/vigil/pre-deploy-audit-checklist.md
//
// Usage:
//   node scripts/vigil-audit.mjs <url> <projectSlug>
//     [--pages /,/dashboard,/agents]   default: '/'
//     [--commit <sha>]                  default: 'live-sweep-YYYY-MM-DD'
//     [--dry-run]                       findings logged only, never block
//     [--no-baseline]                   skip baseline diff (still write screenshots)
//     [--skip-lighthouse]               skip perf audit (faster)
//     [--viewports mobile,desktop]      subset of viewports
//     [--themes light]                  subset of themes
//
// Exit codes:
//   0 → PASS or PASS_WITH_WARNINGS
//   1 → BLOCK (Bolt halts deploy on this code)
//   2 → script error (missing dep, network unreachable). NOT a deploy block.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

const BASELINE_ROOT = path.join(os.homedir(), '.claude', 'memory', 'vigil-baselines')

const ALL_VIEWPORTS = [
  { name: 'mobile', w: 375, h: 812 },
  { name: 'tablet', w: 768, h: 1024 },
  { name: 'desktop', w: 1280, h: 800 },
  { name: 'wide', w: 1920, h: 1080 },
]
const ALL_THEMES = ['light', 'dark']
// Tailwind grid steps: 0.5 (2px), 1 (4px), 1.5 (6px), 2 (8px), 2.5 (10px), 3 (12px), 3.5 (14px),
// 4 (16px), 5 (20px), 6 (24px), 7 (28px), 8 (32px), 9 (36px), 10 (40px), 11 (44px), 12 (48px),
// 14 (56px), 16 (64px), 18 (72px), 20 (80px), 24 (96px), 28 (112px), 32 (128px). All considered
// on-grid. Off-grid is values like 13px, 17px, 23px — non-Tailwind drift.
const ALLOWED_SPACING = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128])

// ── arg parsing ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { url: null, project: null, pages: ['/'], commit: null, dryRun: false, noBaseline: false, skipLighthouse: false, viewports: ALL_VIEWPORTS.map(v => v.name), themes: ALL_THEMES }
  const positional = []
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { out.help = true; continue }
    if (a === '--dry-run') { out.dryRun = true; continue }
    if (a === '--no-baseline') { out.noBaseline = true; continue }
    if (a === '--skip-lighthouse') { out.skipLighthouse = true; continue }
    if (a === '--pages') { out.pages = (argv[++i] || '').split(',').filter(Boolean); continue }
    if (a === '--commit') { out.commit = argv[++i]; continue }
    if (a === '--viewports') { out.viewports = (argv[++i] || '').split(',').filter(Boolean); continue }
    if (a === '--themes') { out.themes = (argv[++i] || '').split(',').filter(Boolean); continue }
    positional.push(a)
  }
  out.url = positional[0] || null
  out.project = positional[1] || 'unknown'
  return out
}

function printHelp() {
  console.log(`Vigil audit runtime

Usage:
  node scripts/vigil-audit.mjs <url> <projectSlug> [options]

Options:
  --pages /,/dashboard,/agents   Pages to audit (default: '/')
  --commit <sha>                 Commit SHA for baseline dir (default: live-sweep-YYYY-MM-DD)
  --dry-run                      Findings logged only, exit code always 0
  --no-baseline                  Skip baseline diff
  --skip-lighthouse              Skip perf audit (faster)
  --viewports mobile,desktop     Subset (default: all 4)
  --themes light                 Subset (default: light,dark)

Examples:
  node scripts/vigil-audit.mjs http://localhost:5173 polyglot --pages "/,/agents" --dry-run
  node scripts/vigil-audit.mjs https://staging.example.com polyglot --commit abc123
`)
}

// ── dep guard ─────────────────────────────────────────────────────────────
async function loadDeps() {
  const missing = []
  let chromium, AxeBuilder, pixelmatch, PNG
  try { ({ chromium } = await import('playwright')) } catch { missing.push('playwright') }
  try { ({ default: AxeBuilder } = await import('@axe-core/playwright')) } catch { missing.push('@axe-core/playwright') }
  try { ({ default: pixelmatch } = await import('pixelmatch')) } catch { missing.push('pixelmatch') }
  try { ({ PNG } = await import('pngjs')) } catch { missing.push('pngjs') }
  if (missing.length > 0) {
    console.error(`\n❌ Missing deps: ${missing.join(', ')}\n   Install: pnpm add -D ${missing.join(' ')}\n   Then: npx playwright install chromium\n`)
    process.exit(2)
  }
  return { chromium, AxeBuilder, pixelmatch, PNG }
}

// ── per-page audit ────────────────────────────────────────────────────────
function ownerForUrl(url) {
  const p = new URL(url).pathname
  if (/^\/(dashboard|agents|org-chart|hr|settings|analytics|logs|playground|schedules|projects)/i.test(p)) return 'dash'
  if (/^\/(cart|products|collections|checkout|account)/i.test(p)) return 'elio'
  return 'pixel'
}

async function auditPage({ chromium, AxeBuilder, pixelmatch, PNG }, { url, theme, viewport, project, baselineDir, noBaseline }) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    colorScheme: theme,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  const findings = []
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []
  const badResponses = []

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), location: msg.location() })
  })
  page.on('pageerror', err => pageErrors.push({ message: err.message, stack: (err.stack || '').slice(0, 800) }))
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), failure: req.failure()?.errorText }))
  page.on('response', res => { if (res.status() >= 500) badResponses.push({ url: res.url(), status: res.status() }) })

  // `networkidle` is unreliable for SaaS apps that hold long-lived SSE/websocket
  // connections (Polyglot, Inkos, etc.). Use `load` + a small settle wait
  // instead — covers static + most dynamic apps without false-positive crashes.
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
  } catch (e) {
    findings.push({ type: 'crash', severity: 'CRITICAL', evidence: { gotoError: e.message }, owner: 'bolt' })
    await context.close()
    await browser.close()
    return findings
  }
  await page.waitForTimeout(1500) // settle hydration / lazy chunks

  const stagingOrigin = new URL(url).origin

  // 1. Console errors
  if (consoleErrors.length > 0) {
    findings.push({ type: 'console', severity: 'CRITICAL', evidence: consoleErrors.slice(0, 10), owner: 'vex' })
  }
  // 2. Runtime + network
  if (pageErrors.length > 0) {
    findings.push({ type: 'crash', severity: 'CRITICAL', evidence: pageErrors.slice(0, 5), owner: 'vex' })
  }
  // Ignore SSE/EventSource aborts — they're inherent to tab-close / nav-away
  // and not real bugs. Match `net::ERR_ABORTED` on streaming endpoints.
  const firstPartyFailed = failedRequests.filter(r => {
    if (!r.url.startsWith(stagingOrigin)) return false
    if (r.failure === 'net::ERR_ABORTED' && /\/stream\b|\/sse\b|\/events\b/.test(r.url)) return false
    return true
  })
  if (firstPartyFailed.length > 0) {
    findings.push({ type: 'network', severity: 'CRITICAL', evidence: firstPartyFailed.slice(0, 10), owner: 'vex' })
  }
  if (badResponses.length > 0) {
    findings.push({ type: 'network', severity: 'CRITICAL', evidence: badResponses.slice(0, 10), owner: 'bolt' })
  }

  // 3. Screenshot + visual regression
  const pageSlug = new URL(url).pathname.replace(/\//g, '_') || '_root'
  const shotName = `${pageSlug}-${theme}-${viewport.w}.png`
  const shotPath = path.join(baselineDir, shotName)
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' })
  fs.mkdirSync(baselineDir, { recursive: true })
  fs.writeFileSync(shotPath, png)

  if (!noBaseline) {
    const baselinePath = path.join(BASELINE_ROOT, project, 'latest', shotName)
    if (fs.existsSync(baselinePath)) {
      try {
        const prevPng = PNG.sync.read(fs.readFileSync(baselinePath))
        const curPng = PNG.sync.read(png)
        if (prevPng.width === curPng.width && prevPng.height === curPng.height) {
          const diff = new PNG({ width: curPng.width, height: curPng.height })
          const diffPixels = pixelmatch(prevPng.data, curPng.data, diff.data, curPng.width, curPng.height, { threshold: 0.1 })
          const diffPercent = diffPixels / (curPng.width * curPng.height)
          if (diffPercent > 0.005) {
            const sev = diffPercent > 0.05 ? 'HIGH' : 'MEDIUM'
            findings.push({ type: 'visual-regression', severity: sev, evidence: { diffPercent: Number(diffPercent.toFixed(4)), baselinePath, shotPath }, owner: ownerForUrl(url) })
          }
        }
      } catch { /* baseline corrupt — ignore */ }
    }
  }

  // 4. Spacing-grid violations
  const offGrid = await page.evaluate((allowedArr) => {
    const allowed = new Set(allowedArr)
    const props = ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','rowGap','columnGap']
    const violations = []
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el)
      props.forEach(p => {
        const v = parseFloat(cs[p])
        if (v > 0 && !allowed.has(v)) {
          const className = typeof el.className === 'string' ? el.className : ''
          violations.push({ selector: el.tagName.toLowerCase() + (className ? '.' + className.split(' ').slice(0, 2).join('.') : ''), prop: p, value: v })
        }
      })
    })
    return violations.slice(0, 50)
  }, [...ALLOWED_SPACING])
  if (offGrid.length > 0) {
    const sev = offGrid.length > 20 ? 'HIGH' : offGrid.length > 10 ? 'MEDIUM' : 'LOW'
    findings.push({ type: 'spacing', severity: sev, evidence: { count: offGrid.length, sample: offGrid.slice(0, 10) }, owner: 'sage' })
  }

  // 5 + 9. axe (contrast + a11y basics)
  try {
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const contrast = axe.violations.filter(v => v.id === 'color-contrast')
    if (contrast.length > 0) {
      findings.push({ type: 'contrast', severity: 'HIGH', evidence: contrast.flatMap(v => v.nodes.slice(0, 3).map(n => ({ target: n.target, html: (n.html || '').slice(0, 200) }))), owner: 'sage' })
    }
    const otherA11y = axe.violations.filter(v => v.id !== 'color-contrast')
    if (otherA11y.length > 0) {
      findings.push({ type: 'a11y', severity: 'HIGH', evidence: otherA11y.map(v => ({ rule: v.id, impact: v.impact, nodeCount: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => ({ target: n.target, html: (n.html || '').slice(0, 200) })) })), owner: 'sage' })
    }
  } catch (e) {
    findings.push({ type: 'a11y', severity: 'LOW', evidence: { axeError: e.message }, owner: 'sage' })
  }

  // 6. Mobile overflow (only when viewport is mobile)
  if (viewport.name === 'mobile') {
    const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth)
    if (overflow) {
      findings.push({ type: 'mobile', severity: 'HIGH', evidence: { scrollWidth: 'gt innerWidth' }, owner: 'sage' })
    }
  }

  // 7. Dark mode parity — flag inline hardcoded colors
  if (theme === 'dark') {
    const hardcoded = await page.evaluate(() => {
      const offenders = []
      document.querySelectorAll('*').forEach(el => {
        const inline = el.getAttribute('style') || ''
        if (/#[0-9a-fA-F]{3,8}\b/.test(inline) || /rgb\(/.test(inline)) {
          offenders.push({ tag: el.tagName.toLowerCase(), style: inline.slice(0, 80) })
        }
      })
      return offenders.slice(0, 10)
    })
    if (hardcoded.length > 0) {
      findings.push({ type: 'dark', severity: 'MEDIUM', evidence: hardcoded, owner: 'token' })
    }
  }

  await context.close()
  await browser.close()
  return findings
}

// ── lighthouse (CLI) ──────────────────────────────────────────────────────
function runLighthouse(url, outputPath) {
  try {
    execSync(`npx --yes lighthouse "${url}" --output=json --output-path="${outputPath}" --chrome-flags="--headless" --quiet --only-categories=performance`, { timeout: 90_000, stdio: 'pipe' })
    const lh = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
    const perfScore = (lh.categories?.performance?.score ?? 0) * 100
    const lcp = lh.audits?.['largest-contentful-paint']?.numericValue
    const cls = lh.audits?.['cumulative-layout-shift']?.numericValue
    const inp = lh.audits?.['interaction-to-next-paint']?.numericValue
    const findings = []
    if (perfScore < 90) {
      findings.push({ type: 'perf', severity: perfScore < 80 ? 'HIGH' : 'MEDIUM', evidence: { perfScore: Math.round(perfScore), lcp, cls, inp }, owner: 'sage' })
    }
    return findings
  } catch (e) {
    return [{ type: 'perf', severity: 'LOW', evidence: { lighthouseError: String(e.message).slice(0, 200) }, owner: 'hawk' }]
  }
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv)
  if (args.help) { printHelp(); process.exit(0) }
  if (!args.url) { console.error('❌ Missing <url>. See --help.'); process.exit(2) }

  const deps = await loadDeps()
  const startTime = Date.now()

  const commitTag = args.commit || `live-sweep-${new Date().toISOString().slice(0, 10)}`
  const baselineDir = path.join(BASELINE_ROOT, args.project, commitTag)
  fs.mkdirSync(baselineDir, { recursive: true })

  const viewports = ALL_VIEWPORTS.filter(v => args.viewports.includes(v.name))
  const themes = ALL_THEMES.filter(t => args.themes.includes(t))

  console.log(`\n=== Vigil Audit: ${args.url} (${args.project}) ===`)
  console.log(`mode: ${args.dryRun ? 'dry-run' : 'enforce'}`)
  console.log(`pages: ${args.pages.join(', ')}`)
  console.log(`viewports: ${viewports.map(v => v.name).join(', ')}`)
  console.log(`themes: ${themes.join(', ')}`)
  console.log(`baseline: ${baselineDir}\n`)

  const allFindings = []
  for (const pagePath of args.pages) {
    const fullUrl = new URL(pagePath, args.url).toString()
    for (const viewport of viewports) {
      for (const theme of themes) {
        process.stdout.write(`  audit ${pagePath} @ ${viewport.name}/${theme} ... `)
        const findings = await auditPage(deps, { url: fullUrl, theme, viewport, project: args.project, baselineDir, noBaseline: args.noBaseline })
        for (const f of findings) {
          f.url = fullUrl
          f.viewport = `${viewport.w}x${viewport.h}`
          f.theme = theme
          allFindings.push(f)
        }
        console.log(`${findings.length} finding${findings.length === 1 ? '' : 's'}`)
      }
    }
    if (!args.skipLighthouse) {
      process.stdout.write(`  lighthouse ${pagePath} ... `)
      const lhPath = path.join(baselineDir, `lighthouse-${pagePath.replace(/\//g, '_') || '_root'}.json`)
      const lhFindings = runLighthouse(fullUrl, lhPath)
      lhFindings.forEach(f => { f.url = fullUrl; allFindings.push(f) })
      console.log(`${lhFindings.length} finding${lhFindings.length === 1 ? '' : 's'}`)
    }
  }

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const f of allFindings) counts[f.severity] = (counts[f.severity] || 0) + 1

  const verdict = counts.CRITICAL > 0 ? 'BLOCK' : counts.HIGH > 0 ? 'BLOCK' : allFindings.length > 0 ? 'PASS_WITH_WARNINGS' : 'PASS'
  const duration_ms = Date.now() - startTime

  const result = {
    verdict,
    project: args.project,
    url: args.url,
    pages: args.pages,
    counts,
    findings: allFindings,
    baselineDir,
    duration_ms,
    summary: `${allFindings.length} findings (${counts.CRITICAL} CRIT / ${counts.HIGH} HIGH / ${counts.MEDIUM} MED / ${counts.LOW} LOW)`,
  }

  fs.writeFileSync(path.join(baselineDir, 'verdict.json'), JSON.stringify(result, null, 2))

  console.log(`\n=== Verdict: ${verdict} ===`)
  console.log(result.summary)
  console.log(`duration: ${(duration_ms / 1000).toFixed(1)}s`)
  console.log(`baseline: ${baselineDir}\n`)

  if (args.dryRun) process.exit(0)
  if (verdict === 'BLOCK') process.exit(1)
  process.exit(0)
}

main().catch(err => {
  console.error('\n❌ Vigil script error:', err.message)
  console.error(err.stack)
  process.exit(2)
})
