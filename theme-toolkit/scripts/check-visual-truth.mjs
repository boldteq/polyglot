#!/usr/bin/env node
// Lens — Visual Truth Layer · LAYER 3: ENFORCE (gate #18). The deterministic enforcer that turns
// the captured frames (Layer 1: lens-capture.mjs) + the vision verdicts (Layer 2: vision subagents
// judging each frame against a per-surface rubric) into a hard PASS/BLOCK. This is the gate that
// makes "done" mean the RENDERED PAGE agreed, not just that source-level gates are green and #17
// (self-attestation) said approved. mantle refuses publish on a failing/missing visual-truth.json,
// identical pattern to #17. (Plan: "The Visual Truth Layer", 2026-06-19.)
//
// Inputs (under <REPORT_DIR>/lens/):
//   lens-manifest.json     — Layer 1 capture facts (overflow / broken img / render-error / CLS / …)
//   judge/<frameId>.json   — Layer 2 vision verdict per frame: { surface, viewport, verdict:
//                            "PASS"|"FAIL", confidence:0-100, findings:[{check, severity, evidence,
//                            fix_owner}], passed_checks:[] }
//
// BLOCKS on (any): a manifest render-error / nav-fail / Liquid-error / horizontal overflow / broken
//   image; a judge frame verdict FAIL; a judge blocker finding; a judge frame below min-confidence;
//   a broken-state finding. WARNS on: warning-level findings, empty shells, high CLS, console errors.
//   Cross-frame: a check failing on ≥2 frames is flagged as a SYSTEMIC defect (a warning escalates).
//
// Usage: node check-visual-truth.mjs
// Env: REPORT_DIR · VISUAL_TRUTH_MIN_CONFIDENCE (80) · LENS_OVERFLOW_TOLERANCE (2 px)
//      · DS_REQUIRE_SCOPE=1 / LENS_REQUIRE=1  (a MISSING capture/judge BLOCKS — publish-grade; else WARNs)
// Exit: 0 = pass · 1 = block · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { writeReport } from './lib/report.mjs'
import { applyRegressionRegistry, readRegistry, writeRegistry } from './lib/lens-regressions.mjs'

const t0 = Date.now()
const cwd = process.cwd()
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const MIN_CONF_ENV = process.env.VISUAL_TRUTH_MIN_CONFIDENCE ? Number(process.env.VISUAL_TRUTH_MIN_CONFIDENCE) : null
const MIN_CONF = MIN_CONF_ENV ?? 80 // representative value for the report; per-surface threshold via minConfFor (WS-B3)
// Adaptive: high-stakes surfaces (hero/PDP/cart/collection) demand more judge certainty than secondary
// ones — uncertainty on a money surface is a block; on /search or /account it warns. Explicit env overrides.
const CRITICAL_SURFACES = new Set(['home', 'pdp', 'cart', 'collection', 'checkout', 'order-confirmation', 'gift-card'])
const minConfFor = (surface) => MIN_CONF_ENV != null ? MIN_CONF_ENV : (CRITICAL_SURFACES.has(String(surface)) ? 90 : 75)
const OVERFLOW_TOL = Number(process.env.LENS_OVERFLOW_TOLERANCE || 2)
const REQUIRE = process.env.DS_REQUIRE_SCOPE === '1' || process.env.LENS_REQUIRE === '1'

const blockers = []
const warnings = []
const add = (list, id, page, detail, evidence = '') => list.push({ id, page, detail, evidence })

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function finish(envError, evidence = {}) {
  const pass = !envError && blockers.length === 0
  writeReport('visual-truth', 18, { cwd, pass, blockers, warnings, evidence: { lensDir: path.relative(cwd, LENS_DIR), minConfidence: MIN_CONF, reason: envError || undefined, ...evidence }, duration_ms: Date.now() - t0 }, REPORT_DIR)
  const code = envError ? 2 : pass ? 0 : 1
  const label = code === 2 ? 'ENV-ERROR' : code === 0 ? 'PASS' : 'BLOCK'
  console.log(`visual-truth: ${label} — ${blockers.length} blocker(s), ${warnings.length} warning(s)`)
  for (const b of blockers) console.log(`  BLOCK ${b.id} ${b.page}: ${b.detail}`)
  for (const w of warnings) console.log(`  warn  ${w.id} ${w.page}: ${w.detail}`)
  if (envError) console.error(`  env: ${envError}`)
  process.exit(code)
}

// Layer-1 facts + Layer-2 verdicts → a single eyeball page. Humans read this in 60s.
function writeHtml(manifest, verdictsByFrame) {
  const rows = (manifest.frames || []).map(f => {
    const id = `${f.surface}-${f.viewport}-${f.theme || 'light'}`
    const v = verdictsByFrame.get(f.key) || verdictsByFrame.get(id) || verdictsByFrame.get(`${f.surface}-${f.viewport}`)
    const facts = [f.nav !== 'ok' && `nav:${f.nav}`, f.renderError && `render-error:${f.renderError}`, f.liquidError && `liquid:${f.liquidError}`, f.overflowPx > OVERFLOW_TOL && `overflow:${f.overflowPx}px`, f.brokenImages?.length && `${f.brokenImages.length} broken-img`, f.emptyShells?.length && `${f.emptyShells.length} empty-shell`, (f.cls ?? 0) > 0.1 && `CLS:${f.cls}`].filter(Boolean)
    const findings = (v?.findings || []).map(fd => `<li class="${fd.severity}"><b>${esc(fd.check)}</b> [${esc(fd.severity)}${fd.fix_owner ? ` → ${esc(fd.fix_owner)}` : ''}]: ${esc(fd.evidence)}</li>`).join('')
    const verdict = v ? `<span class="v ${v.verdict === 'PASS' ? 'pass' : 'fail'}">${esc(v.verdict)} ${esc(v.confidence)}%</span>` : '<span class="v none">no judge verdict</span>'
    return `<section><h2>${esc(f.surface)} · ${esc(f.viewport)}/${esc(f.theme || 'light')} ${verdict}</h2>
      <div class="facts">${facts.length ? facts.map(x => `<code>${esc(x)}</code>`).join(' ') : '<em>manifest clean</em>'}</div>
      <div class="imgs"><img src="${esc(f.frames?.rest || '')}" loading="lazy"><img src="${esc(f.frames?.scrollEnd || '')}" loading="lazy"></div>
      ${findings ? `<ul>${findings}</ul>` : ''}</section>`
  }).join('\n')
  const html = `<!doctype html><meta charset="utf-8"><title>Lens — Visual Truth</title>
<style>body{font:14px/1.5 system-ui;margin:0;background:#0f1115;color:#e6e8ee}h1{padding:16px 20px;margin:0;background:#171a21}
section{padding:16px 20px;border-bottom:1px solid #222}h2{font-size:15px;margin:0 0 8px}.facts{margin:4px 0;color:#9aa}
.facts code{background:#2a1414;color:#f88;padding:1px 6px;border-radius:4px;margin-right:4px}.imgs{display:flex;gap:10px;flex-wrap:wrap}
.imgs img{max-width:380px;border:1px solid #333;border-radius:6px}ul{margin:8px 0 0;padding-left:18px}li.blocker{color:#ff6b6b}li.warning{color:#ffc46b}
.v{font-weight:700;padding:2px 8px;border-radius:10px;font-size:12px}.v.pass{background:#10331c;color:#7fe0a0}.v.fail{background:#3a1515;color:#ff8080}.v.none{background:#333;color:#aaa}</style>
<h1>Lens — Visual Truth · ${esc(manifest.previewUrl || '')} · ${(manifest.frames || []).length} frames</h1>
${rows}`
  try { fs.writeFileSync(path.join(LENS_DIR, 'index.html'), html) } catch { /* best-effort */ }
}

function main() {
  const manifestPath = path.join(LENS_DIR, 'lens-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    if (REQUIRE) { add(blockers, 'vt.capture-missing', path.relative(cwd, LENS_DIR), `no lens-manifest.json — Lens CAPTURE (lens-capture.mjs on the staging URL) is MANDATORY before publish. Run it.`); return finish(null, { present: false }) }
    warnings.push({ id: 'vt.capture-not-done', page: path.relative(cwd, LENS_DIR), detail: 'no Lens capture yet — visual-truth pending (warns in dev; BLOCKS at publish-grade via DS_REQUIRE_SCOPE/LENS_REQUIRE)', evidence: '' })
    return finish(null, { present: false })
  }
  let manifest
  try { manifest = readJson(manifestPath) } catch (e) { return finish(`lens-manifest.json invalid: ${e.message}`) }
  const frames = Array.isArray(manifest.frames) ? manifest.frames : []
  if (!frames.length) return finish('lens-manifest.json has no frames')

  // ── Layer 1: deterministic facts the screenshot can't lie about ──
  for (const f of frames) {
    const at = `${f.surface} ${f.viewport}/${f.theme || 'light'}`
    if (f.nav && f.nav !== 'ok') add(blockers, 'vt.nav-failed', f.surface, `${at}: navigation failed (${f.nav}) — the surface did not load`, f.url)
    if (f.renderError) add(blockers, 'vt.render-error', f.surface, `${at}: storefront render error — ${f.renderError} (a shopper would see this error page, not the store)`, f.url)
    if (f.liquidError) add(blockers, 'vt.liquid-error', f.surface, `${at}: Liquid error rendered to the page — "${f.liquidError}"`, f.url)
    if (Number(f.overflowPx) > OVERFLOW_TOL) add(blockers, 'vt.overflow', f.surface, `${at}: horizontal overflow ${f.overflowPx}px — an element bleeds past the viewport (sideways scroll)`, f.url)
    if (Array.isArray(f.brokenImages) && f.brokenImages.length) add(blockers, 'vt.broken-image', f.surface, `${at}: ${f.brokenImages.length} broken image(s) (naturalWidth=0): ${f.brokenImages.slice(0, 3).join(', ')}`, f.url)
    if (Array.isArray(f.emptyShells) && f.emptyShells.length) warnings.push({ id: 'vt.empty-shell', page: f.surface, detail: `${at}: ${f.emptyShells.length} empty section shell(s) (heading over a void): ${f.emptyShells.slice(0, 3).join(', ')}`, evidence: f.url })
    if (Number(f.cls) > 0.1) warnings.push({ id: 'vt.layout-shift', page: f.surface, detail: `${at}: CLS ${f.cls} (>0.1) — visible layout shift on load`, evidence: f.url })
    if (Array.isArray(f.consoleErrors) && f.consoleErrors.length) warnings.push({ id: 'vt.console-error', page: f.surface, detail: `${at}: ${f.consoleErrors.length} console error(s): ${f.consoleErrors[0]?.slice(0, 100)}`, evidence: '' })
  }

  // ── Layer 2: vision verdicts ──
  const judgeDir = path.join(LENS_DIR, 'judge')
  const verdicts = []
  if (fs.existsSync(judgeDir)) {
    for (const fn of fs.readdirSync(judgeDir)) { if (!fn.endsWith('.json')) continue; try { verdicts.push(readJson(path.join(judgeDir, fn))) } catch { /* skip bad file */ } }
  }
  const verdictsByFrame = new Map()
  for (const v of verdicts) {
    if (v.key) verdictsByFrame.set(v.key, v) // primary: the frame key (surface-viewport[-state][-locale])
    const vpKey = String(v.viewport || '').includes('375') ? 'mobile' : String(v.viewport || '').includes('768') ? 'tablet' : String(v.viewport || '').includes('1440') ? 'desktop' : v.viewport
    verdictsByFrame.set(`${v.surface}-${vpKey}`, v) // legacy fallback (dims-normalized)
    verdictsByFrame.set(`${v.surface}-${v.viewport}`, v)
  }
  const verdictFor = (f) => verdictsByFrame.get(f.key) || verdictsByFrame.get(`${f.surface}-${f.viewport}`)

  // ── Capture coverage: defends the silent-skip hole (a build that captured desktop but quietly
  //    dropped mobile must not read as PASS — mobile is where hero/headline/art-direction defects hide).
  //    (1) HARD, zero-false-positive: a captured frame with no vision verdict can't be proof.
  //    (2) WARN-FIRST (doctrine: prove on ≥2 stores before BLOCK): a surface captured at desktop but
  //        NOT at mobile is a likely silent skip — surfaced as a warning until proven, then flip to block. ──
  if (verdicts.length) {
    for (const f of frames) {
      if (!verdictFor(f)) {
        const msg = `${f.key || `${f.surface} ${f.viewport}`}: frame captured but NOT vision-judged — a frame with no eyes on it isn't proof`
        if (REQUIRE) add(blockers, 'vt.coverage-unjudged', f.surface, msg, f.url || '')
        else warnings.push({ id: 'vt.coverage-unjudged', page: f.surface, detail: msg, evidence: '' })
      }
    }
  }
  const hasVp = (s, re) => frames.some(f => f.surface === s && re.test(String(f.viewport)))
  for (const s of [...new Set(frames.map(f => f.surface).filter(Boolean))]) {
    if (hasVp(s, /desktop|1440/i) && !hasVp(s, /mobile|375/i)) {
      warnings.push({ id: 'vt.coverage-no-mobile', page: s, detail: `${s}: captured at desktop but NOT mobile — mobile is where hero/headline/art-direction defects hide; capture 375 too (warn-only; flips to BLOCK once proven on ≥2 stores)`, evidence: '' })
    }
  }

  if (!verdicts.length) {
    if (REQUIRE) add(blockers, 'vt.judge-missing', 'judge', `no judge verdicts in ${path.relative(cwd, judgeDir)} — the vision judge (a vision subagent scoring each frame against its rubric) is MANDATORY before publish. Run Layer 2.`)
    else warnings.push({ id: 'vt.judge-not-done', page: 'judge', detail: 'no vision-judge verdicts yet — frames captured but unjudged (warns in dev; BLOCKS at publish-grade)', evidence: '' })
  }

  const allFindings = []
  for (const v of verdicts) {
    const at = `${v.surface} ${v.viewport}`
    if (v.verdict === 'FAIL') add(blockers, 'vt.frame-fail', v.surface, `${at}: vision judge verdict FAIL (confidence ${v.confidence}%)`, '')
    const mc = minConfFor(v.surface)
    if (Number(v.confidence) < mc) add(blockers, 'vt.low-confidence', v.surface, `${at}: judge confidence ${v.confidence}% < ${mc}% (${CRITICAL_SURFACES.has(String(v.surface)) ? 'critical' : 'secondary'} surface) — uncertainty is a block; the page must be unambiguously right`, '')
    for (const fd of (v.findings || [])) {
      allFindings.push({ ...fd, surface: v.surface, viewport: v.viewport, key: v.key })
      const detail = `${at}: ${fd.check} — ${fd.evidence}${fd.fix_owner ? ` (→ ${fd.fix_owner})` : ''}`
      if (fd.severity === 'blocker' || /broken|overflow|placeholder|missing|error|illegible|cut off|cut-off/i.test(`${fd.check} ${fd.evidence}`) && fd.severity === 'blocker') add(blockers, 'vt.blocker-finding', v.surface, detail, fd.check)
      else warnings.push({ id: 'vt.finding', page: v.surface, detail, evidence: fd.check })
    }
  }

  // ── Cross-frame consistency: the same check failing on ≥2 frames is a SYSTEMIC defect ──
  const byCheck = new Map()
  for (const fd of allFindings) { const k = fd.check; if (!byCheck.has(k)) byCheck.set(k, new Set()); byCheck.get(k).add(`${fd.surface}/${fd.viewport}`) }
  for (const [check, where] of byCheck) {
    if (where.size >= 2) {
      const detail = `"${check}" fails on ${where.size} frames (${[...where].slice(0, 4).join(', ')}) — a SYSTEMIC defect (a component/pattern wrong store-wide, not a one-off). Fix at the source, not per-page.`
      // a systemic warning-level finding escalates to a blocker (it's not a one-off polish nit)
      if (!blockers.some(b => b.id === 'vt.blocker-finding' && b.evidence === check)) add(blockers, 'vt.inconsistent', 'store-wide', detail, check)
    }
  }

  // ── Regression registry (WS-D): a finding that was CLEARED then returns escalates one tier ("the same
  //    bug shipped twice"). Active at publish-grade (or LENS_REGRESSIONS=1); per-store state file. ──
  if (REQUIRE || process.env.LENS_REGRESSIONS === '1') {
    const regDir = process.env.LENS_REGISTRY_DIR || cwd
    const now = new Date().toISOString()
    const cur = allFindings.map(f => ({ check: f.check, surface: f.surface, key: f.key }))
    const { escalations, registry } = applyRegressionRegistry(cur, readRegistry(regDir), now)
    for (const esc of escalations) {
      const detail = `${esc.surface}: "${esc.check}" REGRESSED — cleared before, back again (×${esc.recurrences}). A fixed defect shipped twice; fix at the source + add a guard.`
      if (REQUIRE) add(blockers, 'vt.regression', esc.surface, detail, esc.check)
      else warnings.push({ id: 'vt.regression', page: esc.surface, detail, evidence: esc.check })
    }
    writeRegistry(regDir, registry)
  }

  writeHtml(manifest, verdictsByFrame)
  const judged = verdicts.length
  finish(null, {
    present: true, frames: frames.length, judged,
    verdicts: verdicts.map(v => ({ surface: v.surface, viewport: v.viewport, verdict: v.verdict, confidence: v.confidence })),
    findingCount: allFindings.length, htmlReport: path.relative(cwd, path.join(LENS_DIR, 'index.html')),
  })
}

try { main() } catch (err) { finish(`unexpected failure: ${err.message}`) }
