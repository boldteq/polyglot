#!/usr/bin/env node
// Lens — Visual Truth Layer · LAYER 4 DRIVER (the self-healing loop). The piece that ends the
// 6-iteration spiral: Lens names the exact defect with a screenshot, routes it to the right owner,
// the owner fixes it INSIDE the locked design system, and the loop RE-RENDERS + RE-JUDGES until the
// rendered page agrees — ≤3 rounds, else escalate. "Done" = the page looked right, not "code shipped".
//
// One self-contained pass:  pnpm lens:autofix   (runs capture → judge → enforce → fix, looping)
//
// MECHANISM: headless `claude -p` per owner-batch (subscription, no API key), editing the theme repo
// (cwd). Capture/judge/enforce are the sibling node scripts. Hot-reload (`shopify theme dev`) or a
// re-served preview makes the re-capture see the fix.
//
// DEEP-FIX RULES:
//  • Owner routing: loom/drape/ink/conduit fix THEME CODE (file edits). porter findings are STORE
//    DATA (a test store name, an empty collection, unconfigured payment icons) — NOT fixable by
//    editing theme files → they ESCALATE (Admin API / human), never a blind file edit.
//  • Fixes stay inside the design system — no off-scale tokens / hardcoded hex (gate #8 still blocks).
//  • Re-capture only the AFFECTED surfaces each round; converge or escalate with screenshot+attempts.
//
// Env: THEME_PREVIEW_URL (req) · THEME_STORE_PASSWORD · REPORT_DIR · FIRST_PRODUCT_HANDLE ·
//      LENS_NICHE · LENS_BRAND · LENS_MAX_ROUNDS (3) · LENS_JUDGE_MODEL · LENS_FIX_MODEL (sonnet) ·
//      CLAUDE_BIN (claude) · LENS_VIEWPORTS (mobile,desktop)
// Exit: 0 = converged (Lens PASS) · 1 = unresolved after max rounds / escalations · 2 = env error

import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isMain } from './lib/is-main.mjs'
import { persistedKeys, readOutcomes, appendOutcomes } from './lib/lens-fix-outcomes.mjs'
import { runAutofixLoop } from './lib/lens-autofix-loop.mjs'
import { snapshotTheme, detectDestructive, revertDestructive } from './lib/fix-guard.mjs'

// Scoped write tools (the -p fixer must be able to Edit/Write, but not blanket skip-permissions) +
// a per-child wall-clock kill so a hung `claude -p` can't stall the loop (2026-07-19 audit).
const ALLOWED_TOOLS = process.env.FIX_ALLOWED_TOOLS || 'Edit,Write,Read,Bash,Glob,Grep'
const FIX_TIMEOUT_MS = Number(process.env.LENS_FIX_TIMEOUT_MS || 8 * 60 * 1000)

const cwd = process.cwd()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPORT_DIR = process.env.REPORT_DIR || 'gate-reports'
const LENS_DIR = path.resolve(cwd, REPORT_DIR, 'lens')
const JUDGE_DIR = path.join(LENS_DIR, 'judge')
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const FIX_MODEL = process.env.LENS_FIX_MODEL || 'sonnet'
// Round cap by theme base (WS-E2): Dawn is custom-heavy → needs more rounds; Minimog is config-rich → fewer.
function detectThemeBase() { try { const m = fs.readFileSync(path.join(cwd, 'CHANGES.md'), 'utf-8').match(/theme[_-]?base\s*[:=]\s*["']?([a-z]+)/i); if (m) return m[1].toLowerCase() } catch { /* default below */ } return 'minimog' }
const THEME_BASE = detectThemeBase()
const MAX_ROUNDS = Number(process.env.LENS_MAX_ROUNDS || (THEME_BASE === 'dawn' ? 5 : 3))
const VIEWPORTS = process.env.LENS_VIEWPORTS || 'mobile,desktop'
const CODE_OWNERS = new Set(['loom', 'drape', 'ink', 'conduit'])  // fix theme files
const DATA_OWNERS = new Set(['porter'])                            // store data → escalate

// #10 — PURE: split findings into theme-CODE (file edits) vs store-DATA (porter). Exported so the
// routing is hermetically testable; the LLM dispatch (dispatchFix / dispatchPorter) acts on each bucket.
export function routeFindings(findings, codeOwners = CODE_OWNERS) {
  const code = []
  const data = []
  for (const f of findings || []) (codeOwners.has(f.fix_owner) ? code : data).push(f)
  return { code, data }
}

const die = (code, msg) => { console.error(`lens-autofix: ${code === 2 ? 'ENV-ERROR' : 'ERROR'} — ${msg}`); process.exit(code) }
const script = (n) => path.join(HERE, n)

function runNode(file, extraArgs = [], env = {}) {
  const r = spawnSync(process.execPath, [script(file), ...extraArgs], { cwd, encoding: 'utf-8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') }
}

function blockerFindings() {
  const out = []
  if (!fs.existsSync(JUDGE_DIR)) return out
  for (const fn of fs.readdirSync(JUDGE_DIR)) {
    if (!fn.endsWith('.json')) continue
    let v; try { v = JSON.parse(fs.readFileSync(path.join(JUDGE_DIR, fn), 'utf-8')) } catch { continue }
    for (const f of (v.findings || [])) {
      if (f.severity !== 'blocker') continue
      const restPng = path.join(LENS_DIR, v.surface, `${(String(v.viewport).includes('375') ? 'mobile' : String(v.viewport).includes('768') ? 'tablet' : 'desktop')}-light-rest.png`)
      out.push({ surface: v.surface, viewport: v.viewport, check: f.check, evidence: f.evidence, fix_owner: f.fix_owner || 'loom', screenshot: restPng })
    }
  }
  return out
}

function dispatchFix(owner, findings) {
  const list = findings.map(f => `- [${f.surface}/${f.viewport}] ${f.check}: ${f.evidence} (screenshot: ${f.screenshot})`).join('\n')
  const prompt = [
    `You are ${owner}, fixing visual defects Lens (the visual-truth layer) found on the RENDERED Shopify store. The theme repo is your working directory: ${cwd}.`,
    `Look at each screenshot to SEE the defect, then EDIT the theme files to fix it.`,
    `Defects:\n${list}`,
    `RULES: stay strictly inside the locked design system — use the theme's CSS variables / design-system tokens, NEVER a hardcoded hex/rgb or an off-scale px (gate #8 will block them). Fix ONLY these defects; change nothing unrelated. **NEVER delete a section/snippet/template or strip its {% schema %} to make the defect go away — fix it IN PLACE.** If a defect is store DATA (a product/collection/store-setting/image upload) and not theme code, say so and do NOT edit theme files for it.`,
    `When done, print one line: FIXED: <comma-separated checks you actually fixed in code>.`,
  ].join('\n\n')
  const before = snapshotTheme(cwd) // destructive-fix guard baseline
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(CLAUDE_BIN, ['-p', prompt, '--model', FIX_MODEL, '--no-session-persistence', '--allowedTools', ALLOWED_TOOLS], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* */ } }, FIX_TIMEOUT_MS)
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { out += d.toString() })
    child.on('error', e => { clearTimeout(timer); resolve({ owner, ok: false, note: `spawn failed: ${e.message}` }) })
    child.on('close', () => {
      clearTimeout(timer)
      const g = detectDestructive(cwd, before)
      if (g.destructive) {
        const rev = revertDestructive(cwd, g.culprits, before)
        resolve({ owner, ok: false, destructive: true, note: `⚠ DESTRUCTIVE fix rejected (${g.reasons.join('; ').slice(0, 120)})${rev.reverted ? ' — reverted' : ''}; escalating` })
        return
      }
      resolve({ owner, ok: true, note: (out.match(/FIXED:[^\n]*/) || ['(no FIXED line)'])[0].slice(0, 200) })
    })
  })
}

// porter store-data triage (opt-in). porter mutates the LIVE store, so this is gated: apply ONLY
// safe/idempotent/unambiguous settings via porter's tooling; NEVER invent a brand name or products.
function dispatchPorter(findings) {
  const list = findings.map(f => `- [${f.surface}/${f.viewport}] ${f.check}: ${f.evidence} (screenshot: ${f.screenshot})`).join('\n')
  const workorder = path.join(LENS_DIR, 'porter-workorder.md')
  const prompt = [
    `You are porter, the Shopify Admin store operator. Lens found STORE-DATA defects on the rendered store (NOT theme code). Working dir: ${cwd}.`,
    `Defects:\n${list}`,
    `CLASSIFY each defect, then act:`,
    `  AUTO = a safe, idempotent, UNAMBIGUOUS store/theme setting you can apply via your gated tooling (e.g. a payment-icons display toggle, a known redirect) WITHOUT inventing content. Apply ONLY these — idempotently, never touching orders/customers/payments — and log them in CHANGES.md.`,
    `  HUMAN = needs a real decision or real content you MUST NOT invent: a brand/store NAME (you don't know the confirmed brand), an EMPTY collection (needs real products merchandised), missing real photography. NEVER guess these — escalate them.`,
    `Write a work-order to ${workorder}: a markdown checklist of the HUMAN items (what's wrong + exactly what porter/Yash must provide) and a list of any AUTO items you applied.`,
    `Print one line: PORTER: applied=<n> escalated=<n>.`,
  ].join('\n\n')
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(CLAUDE_BIN, ['-p', prompt, '--model', FIX_MODEL, '--no-session-persistence', '--allowedTools', ALLOWED_TOOLS], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* */ } }, FIX_TIMEOUT_MS)
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { out += d.toString() })
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, note: `spawn failed: ${e.message}` }) })
    child.on('close', () => { clearTimeout(timer); resolve({ ok: true, note: (out.match(/PORTER:[^\n]*/) || ['(triaged → porter-workorder.md)'])[0].slice(0, 160) }) })
  })
}

function escalate(findings, rounds) {
  const p = path.join(LENS_DIR, 'autofix-escalation.json')
  fs.writeFileSync(p, `${JSON.stringify({ rounds, unresolved: findings, ts_note: 'stamp at read time' }, null, 2)}\n`)
  console.log(`lens-autofix: ESCALATION → ${path.relative(cwd, p)} (${findings.length} unresolved)`)
  for (const f of findings) console.log(`  ⤴ [${f.fix_owner}] ${f.surface}/${f.viewport} ${f.check}: ${f.evidence.slice(0, 90)}`)
}

async function main() {
  if (!process.env.THEME_PREVIEW_URL) die(2, 'THEME_PREVIEW_URL not set — the self-healing loop re-renders the preview after each fix')
  if (spawnSync(CLAUDE_BIN, ['--version'], { encoding: 'utf-8' }).error) die(2, `claude CLI not found (${CLAUDE_BIN})`)

  // null = all surfaces; LENS_SURFACES constrains the set (also limits re-captures to the affected subset)
  let affected = process.env.LENS_SURFACES ? process.env.LENS_SURFACES.split(',').map(s => s.trim()).filter(Boolean) : null
  const outDir = process.env.LENS_OUTCOMES_DIR || cwd
  const persisted = persistedKeys(readOutcomes(outDir)) // check::surface::vp already tried + failed → don't repeat
  const porterOptIn = process.env.LENS_AUTOFIX_PORTER === '1'
  console.log(`lens-autofix: theme base = ${THEME_BASE}, max ${MAX_ROUNDS} round(s)${persisted.size ? `, ${persisted.size} prior persisted finding(s) loaded` : ''}`)

  // The LOOP CONTROL (find→fix→verify, ≤max rounds, no-retry-of-persisted, escalate) lives in
  // lib/lens-autofix-loop.mjs — pure + proven by __fixtures__/autofix-loop. Here we inject the REAL
  // effects: one round = capture → judge → enforce (+collect blockers); fix = dispatch the owner.
  const runRound = (aff) => {
    console.log('\n──')
    const capArgs = ['--viewports', VIEWPORTS, ...(aff ? ['--surfaces', aff.join(',')] : [])]
    const cap = runNode('lens-capture.mjs', capArgs)
    if (cap.code === 2) throw new Error(`capture failed: ${cap.out.trim().split('\n').pop()}`)
    const judge = runNode('lens-judge.mjs', aff ? ['--surfaces', aff.join(',')] : [])
    console.log(judge.out.trim().split('\n').filter(l => /judging|✓|✗|PASS|FAIL/.test(l)).join('\n'))
    const enforce = runNode('check-visual-truth.mjs', [])
    console.log(enforce.out.trim().split('\n')[0])
    return { enforcePass: enforce.code === 0, findings: enforce.code === 0 ? [] : blockerFindings() }
  }
  const fix = async (owner, list) => { console.log(`  → ${owner}: fixing ${list.length} finding(s)…`); const r = await dispatchFix(owner, list); console.log(`    ${owner}: ${r.note}`) }
  const fixPorter = async (data) => { console.log(`  → porter: triaging ${data.length} store-data finding(s) (LENS_AUTOFIX_PORTER=1)…`); const r = await dispatchPorter(data); console.log(`    porter: ${r.note}`) }
  const recordOutcomes = (round, diff) => appendOutcomes(outDir, round, diff, new Date().toISOString())

  let result
  try {
    result = await runAutofixLoop({ runRound, fix, fixPorter, recordOutcomes, log: (m) => console.log(`lens-autofix: ${m}`) },
      { maxRounds: MAX_ROUNDS, codeOwners: CODE_OWNERS, porterOptIn, persisted, affected })
  } catch (e) { die(2, e.message) }

  if (result.converged) { console.log(`\nlens-autofix: ✅ CONVERGED in ${result.rounds} round(s) — Lens PASS.`); process.exit(0) }
  const esc = result.escalation || {}
  if (esc.data && esc.data.length && !porterOptIn) console.log(`  → porter: ${esc.data.length} store-data finding(s) deferred (set LENS_AUTOFIX_PORTER=1 to auto-triage)`)
  escalate(esc.findings || [], result.rounds)
  console.log(`lens-autofix: ❌ not converged after ${result.rounds} round(s).`)
  process.exit(1)
}

if (isMain(import.meta.url)) {
  main().catch(e => die(2, `unexpected failure: ${e.message}`))
}
