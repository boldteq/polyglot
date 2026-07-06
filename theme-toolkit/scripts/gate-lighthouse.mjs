#!/usr/bin/env node
// Gate 1 — Lighthouse performance budget (lumen). Runs the lighthouse CLI
// (npx --no-install, resolved from the toolkit's node_modules) per budget page
// × form factor (mobile = lighthouse default, desktop = --preset=desktop) and
// compares metrics against lighthouse-budget.json bands:
//   value ≤ good → pass · ≤ fail → warning · > fail → blocker.
// INP is not lab-measurable: recorded { measured: false, value: null }, never
// affects pass.
//
// Usage:
//   node gate-lighthouse.mjs [--pages home,pdp] [--form-factors mobile,desktop]
//
// Env:  THEME_PREVIEW_URL (required) · THEME_STORE_PASSWORD · REPORT_DIR · CHROME_PATH
//       FIRST_PRODUCT_HANDLE / FIRST_COLLECTION_HANDLE (discovery overrides)
// Out:  $REPORT_DIR/lighthouse.json (schema via lib/report.mjs)
// Exit: 0 = pass · 1 = block (budget exceeded) · 2 = env error (missing dep /
//       no URL / password wall / lighthouse run failure)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { writeReport, readJson } from './lib/report.mjs'
import { resolvePages, EnvError } from './lib/pages.mjs'

const started = Date.now()
const reportDir = process.env.REPORT_DIR || 'gate-reports'

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const TOOLKIT_ROOT = path.join(SCRIPTS_DIR, '..')
const BUDGET_PATH = path.join(TOOLKIT_ROOT, 'lighthouse-budget.json')

const FORM_FACTORS = ['mobile', 'desktop']
const REDIRECT_STATUSES = [301, 302, 303, 307, 308]
const DEP_HINT = 'npm ci --prefix toolkit'

// budget metric key → lighthouse audit id
const METRIC_AUDITS = {
  lcp_ms: 'largest-contentful-paint',
  cls: 'cumulative-layout-shift',
  tbt_ms: 'total-blocking-time',
  fcp_ms: 'first-contentful-paint',
  inp_ms: 'interaction-to-next-paint',
}

function finish(code, data) {
  const { file, report } = writeReport('performance', 1, { ...data, duration_ms: Date.now() - started }, reportDir)
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
  console.log(`Gate 1 — Lighthouse performance budget

Usage:
  node gate-lighthouse.mjs [--pages home,pdp] [--form-factors mobile,desktop]

Pages:        budget pages from lighthouse-budget.json (default: all)
Form factors: ${FORM_FACTORS.join(', ')} (default: both)
Env:          THEME_PREVIEW_URL (required), THEME_STORE_PASSWORD, REPORT_DIR, CHROME_PATH
Exit:         0 pass · 1 block · 2 env error
`)
}

function parseArgs(argv) {
  const out = { pages: null, formFactors: null, help: false }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--pages') out.pages = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--form-factors') out.formFactors = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean)
    else {
      console.error(`unknown arg: ${a} (see --help)`)
      process.exit(2)
    }
  }
  return out
}

// ── budget helpers ────────────────────────────────────────────────────────
function thresholdsFor(budget, formFactor, pageId) {
  const base = budget.thresholds?.[formFactor] ?? {}
  const override = budget.overrides?.[pageId]?.[formFactor] ?? {}
  const merged = {}
  for (const key of Object.keys(base)) merged[key] = { ...base[key], ...(override[key] ?? {}) }
  return merged
}

function fmt(metric, value) {
  if (value === null || value === undefined) return 'n/a'
  return metric === 'cls' ? Number(value).toFixed(3) : `${Math.round(value)}ms`
}

function roundValue(metric, value) {
  return metric === 'cls' ? Number(Number(value).toFixed(4)) : Math.round(value)
}

// ── storefront password digest (ported from lib/pages.mjs passwordLogin) ──
// Lighthouse is a separate CLI process, so the wall must be crossed via an
// --extra-headers Cookie — probe for the wall, then fetch a storefront_digest.
async function storefrontDigest(previewUrl, password) {
  let target = previewUrl
  for (let hop = 0; hop < 5; hop += 1) {
    const probe = await fetch(target, { redirect: 'manual' })
    if (!REDIRECT_STATUSES.includes(probe.status)) return null // no wall
    const loc = probe.headers.get('location')
    if (!loc) return null
    const next = new URL(loc, target)
    if (!/\/password\/?$/.test(next.pathname)) {
      target = next.toString()
      continue
    }
    if (!password) {
      throw new EnvError(`${previewUrl} redirects to the storefront password page and no password was provided (set THEME_STORE_PASSWORD)`)
    }
    const origin = next.origin
    const body = new URLSearchParams({ form_type: 'storefront_password', utf8: '✓', password })
    const login = await fetch(`${origin}/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'manual',
    })
    const setCookies = typeof login.headers.getSetCookie === 'function' ? login.headers.getSetCookie() : []
    for (const sc of setCookies) {
      const [pair] = sc.split(';')
      const eq = pair.indexOf('=')
      if (eq > 0 && pair.slice(0, eq).trim() === 'storefront_digest') return pair.slice(eq + 1).trim()
    }
    throw new EnvError(`storefront password rejected at ${origin}/password (no storefront_digest cookie issued)`)
  }
  throw new EnvError(`too many redirects probing ${previewUrl}`)
}

// ── lighthouse runner ─────────────────────────────────────────────────────
function runLighthouse(url, formFactor, digest, env) {
  const args = [
    '--no-install',
    'lighthouse',
    url,
    '--output=json',
    '--output-path=stdout',
    '--only-categories=performance',
    '--chrome-flags=--headless=new',
    '--quiet',
  ]
  if (formFactor === 'desktop') args.push('--preset=desktop')
  if (digest) args.push(`--extra-headers=${JSON.stringify({ Cookie: `storefront_digest=${digest}` })}`)
  const run = spawnSync('npx', args, {
    cwd: TOOLKIT_ROOT, // --no-install resolves from the toolkit's node_modules
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 240_000,
    env,
  })
  if (run.error) throw new Error(`spawn failed: ${run.error.message}`)
  const stdout = run.stdout || ''
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (run.status !== 0 || start === -1 || end <= start) {
    throw new Error(`lighthouse exited ${run.status}: ${((run.stderr || stdout).trim().slice(-400)) || 'no output'}`)
  }
  let lhr
  try {
    lhr = JSON.parse(stdout.slice(start, end + 1))
  } catch (err) {
    throw new Error(`unparseable lighthouse JSON: ${err.message}`)
  }
  if (lhr.runtimeError && lhr.runtimeError.code !== 'NO_ERROR') {
    throw new Error(`lighthouse runtime error ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`)
  }
  return lhr
}

// one retry per run (cold chrome / flaky network), then hard env failure —
// an unmeasurable page must never read as pass.
function runLighthouseWithRetry(url, formFactor, digest, env, label) {
  let lastErr
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return runLighthouse(url, formFactor, digest, env)
    } catch (err) {
      lastErr = err
    }
  }
  throw new EnvError(`lighthouse failed for ${label}: ${lastErr.message}`)
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

  let budget
  try {
    budget = readJson(BUDGET_PATH)
  } catch (err) {
    envFail(`lighthouse-budget.json unreadable at ${BUDGET_PATH}: ${err.message}`)
  }

  // dep guard — lighthouse must already be installed in the toolkit (no network installs mid-gate)
  const probe = spawnSync('npx', ['--no-install', 'lighthouse', '--version'], { cwd: TOOLKIT_ROOT, encoding: 'utf-8', timeout: 60_000 })
  if (probe.error || probe.status !== 0) {
    envFail('lighthouse not installed in the toolkit node_modules', { hint: DEP_HINT })
  }

  const budgetIds = (budget.pages ?? []).map(p => p.id)
  if (budgetIds.length === 0) envFail('lighthouse-budget.json has no pages')
  const wanted = args.pages ?? budgetIds
  const badPages = wanted.filter(id => !budgetIds.includes(id))
  if (badPages.length > 0) envFail(`unknown page id(s): ${badPages.join(', ')} (budget pages: ${budgetIds.join(', ')})`)
  const formFactors = args.formFactors ?? [...FORM_FACTORS]
  const badFF = formFactors.filter(ff => !FORM_FACTORS.includes(ff))
  if (badFF.length > 0) envFail(`unknown form factor(s): ${badFF.join(', ')} (valid: ${FORM_FACTORS.join(', ')})`)

  const password = process.env.THEME_STORE_PASSWORD || process.env.STOREFRONT_PASSWORD || null
  const { pages } = await resolvePages({ previewUrl, password, want: wanted })
  const targets = pages.filter(p => !p.skipped)
  const skippedPages = pages.filter(p => p.skipped).map(p => ({ page: p.id, reason: p.reason }))
  if (targets.length === 0) throw new EnvError('no auditable pages resolved (all requested pages skipped)')

  const digest = await storefrontDigest(previewUrl, password)

  // chrome resolution: honor CHROME_PATH, else fall back to playwright's
  // chromium when present (CI boxes without a system Chrome)
  const env = { ...process.env }
  if (!env.CHROME_PATH) {
    try {
      const { chromium } = await import('playwright')
      const exe = chromium.executablePath()
      if (exe && fs.existsSync(exe)) env.CHROME_PATH = exe
    } catch (err) {
      console.error(`[lighthouse] playwright chromium unavailable (${err.message}) — relying on system Chrome`)
    }
  }

  const blockers = []
  const warnings = []
  const runs = []
  for (const target of targets) {
    for (const ff of formFactors) {
      const label = `${target.id}@${ff}`
      process.stdout.write(`  lighthouse ${label} ... `)
      const lhr = runLighthouseWithRetry(target.url, ff, digest, env, label)
      const perfScore = Math.round((lhr.categories?.performance?.score ?? 0) * 100)
      const thresholds = thresholdsFor(budget, ff, target.id)
      const metrics = {}
      const lineParts = []
      for (const [metric, band] of Object.entries(thresholds)) {
        if (band?.measured === false) {
          metrics[metric] = { measured: false, value: null } // INP — lab-unmeasurable, never affects pass
          continue
        }
        const auditId = METRIC_AUDITS[metric]
        const raw = auditId ? lhr.audits?.[auditId]?.numericValue : undefined
        if (!Number.isFinite(raw)) {
          metrics[metric] = { value: null, good: band.good, fail: band.fail, band: 'missing' }
          warnings.push({
            id: `lighthouse.${metric}`,
            page: label,
            detail: `${metric} not measured (lighthouse audit ${auditId ?? 'unmapped'} returned no numericValue)`,
            evidence: `perfScore ${perfScore}; ${target.url}`,
          })
          continue
        }
        const verdict = raw <= band.good ? 'good' : raw <= band.fail ? 'warn' : 'block'
        metrics[metric] = { value: roundValue(metric, raw), good: band.good, fail: band.fail, band: verdict }
        lineParts.push(`${metric}=${fmt(metric, raw)}`)
        if (verdict === 'block') {
          // A `shopify theme dev` / localhost preview has no CDN/edge + hot-reload overhead, so its
          // perf numbers are NOT representative of the published store (Meridian 2026-06-19: same store
          // sampled 8-12s LCP on theme dev vs ~1.5s warm). Don't BLOCK publish on dev-server perf —
          // demote to a warning + tell the operator to re-run on the published preview URL. (Same class
          // as the functional dev-noise fix; doctrine: run URL gates against the preview-theme URL.)
          let onDev = false
          try { onDev = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$)/i.test(new URL(target.url).host) } catch { /* keep blocking */ }
          if (onDev) {
            warnings.push({
              id: `lighthouse.${metric}.dev`,
              page: label,
              detail: `${metric} ${fmt(metric, raw)} on a DEV/localhost preview — perf is NOT representative (no CDN/edge, hot-reload overhead); demoted to a warning. Re-run against the PUBLISHED preview URL for a real perf verdict.`,
              evidence: `perfScore ${perfScore}; ${target.url}`,
            })
          } else {
            blockers.push({
              id: `lighthouse.${metric}`,
              page: label,
              detail: `${metric} ${fmt(metric, raw)} > fail ${fmt(metric, band.fail)} (good ≤ ${fmt(metric, band.good)})`,
              evidence: `perfScore ${perfScore}; ${target.url}`,
            })
          }
        } else if (verdict === 'warn') {
          warnings.push({
            id: `lighthouse.${metric}`,
            page: label,
            detail: `${metric} ${fmt(metric, raw)} > good ${fmt(metric, band.good)} (fail at > ${fmt(metric, band.fail)})`,
            evidence: `perfScore ${perfScore}; ${target.url}`,
          })
        }
      }
      runs.push({ page: target.id, formFactor: ff, url: target.url, perfScore, metrics })
      console.log(`perf=${perfScore} ${lineParts.join(' ')}`)
    }
  }

  const pass = blockers.length === 0
  console.log(`lighthouse: ${blockers.length} blocker(s), ${warnings.length} warning(s) across ${runs.length} run(s)`)
  finish(pass ? 0 : 1, {
    pass,
    url: previewUrl,
    blockers,
    warnings,
    evidence: { budgetVersion: budget.version ?? null, formFactors, runs, skippedPages },
  })
}

main().catch(err => {
  const reason = err instanceof EnvError ? err.message : `script error: ${err.message}`
  console.error(`ENV-ERROR: ${reason}`)
  if (!(err instanceof EnvError)) console.error(err.stack)
  finish(2, { pass: false, url: process.env.THEME_PREVIEW_URL ?? null, evidence: { skipped: 'env', reason } })
})
