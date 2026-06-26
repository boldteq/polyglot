#!/usr/bin/env node
// app-audit — daily runtime audit of the Polyglot app itself. Loads the key
// routes headless and collects, per page: console errors, critical/serious axe
// a11y violations (color-contrast tracked separately — it's a known systemic
// design-token backlog, not a daily regression), and a blank-render check.
//
// The automated version of a manual UX/a11y sweep. REPORT-ONLY — emits one JSON
// object to stdout and ALWAYS exits 0. Consumed by the sys-app-audit schedule.
//
// Usage: node scripts/app-audit.mjs [baseUrl]   (default http://localhost:3847)
//   env AUDIT_ROUTES="/,/schedules,..."  override the route list

const BASE = process.argv[2] || process.env.AUDIT_BASE || 'http://localhost:3847'
const ROUTES = (process.env.AUDIT_ROUTES ||
  '/,/schedules,/agents,/hr,/orchestration,/learning,/settings,/webhooks')
  .split(',').map((r) => r.trim()).filter(Boolean)

async function main() {
  const { chromium } = await import('playwright')
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const browser = await chromium.launch({ headless: true })
  const routes = []

  for (const route of ROUTES) {
    const context = await browser.newContext() // axe-core/playwright requires a real context
    const page = await context.newPage()
    const consoleErrors = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
    page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message.slice(0, 300)))
    let blank = false, axeCritical = 0, axeSerious = 0, colorContrast = 0, violations = [], err = null
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      await page.waitForTimeout(800) // let the SPA paint
      const text = await page.locator('body').innerText().catch(() => '')
      blank = (text || '').trim().length < 20
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      colorContrast = axe.violations.filter((v) => v.id === 'color-contrast').reduce((s, v) => s + v.nodes.length, 0)
      const actionable = axe.violations.filter((v) => v.id !== 'color-contrast' && (v.impact === 'critical' || v.impact === 'serious'))
      axeCritical = actionable.filter((v) => v.impact === 'critical').length
      axeSerious = actionable.filter((v) => v.impact === 'serious').length
      violations = actionable.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))
    } catch (e) {
      err = e.message.slice(0, 200)
    }
    await page.close()
    await context.close()
    routes.push({ route, consoleErrors, axeCritical, axeSerious, colorContrast, blank, err, violations })
  }
  await browser.close()

  const sum = (f) => routes.reduce((s, r) => s + f(r), 0)
  const totals = {
    pages: routes.length,
    consoleErrors: sum((r) => r.consoleErrors.length),
    axeCritical: sum((r) => r.axeCritical),
    axeSerious: sum((r) => r.axeSerious),
    colorContrast: sum((r) => r.colorContrast),
    blankPages: routes.filter((r) => r.blank).length,
    errored: routes.filter((r) => r.err).length,
  }
  console.log(JSON.stringify({ base: BASE, totals, routes }))
}

main().then(() => process.exit(0)).catch((e) => {
  console.log(JSON.stringify({ error: e.message }))
  process.exit(0)
})
