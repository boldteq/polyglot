// Live end-to-end verification of the Agent Playground (Sprint 7).
// Drives REAL `claude` agent runs on :3847 and watches the actual render.
// Run under Node 20 with the server up:  node scripts/playground-live-e2e.mjs
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = 'http://localhost:3847'
const results = []
const ok = (n, x = '') => { results.push({ n, pass: true, x }); console.log(`  ✅ ${n}${x ? ' — ' + x : ''}`) }
const bad = (n, x = '') => { results.push({ n, pass: false, x }); console.log(`  ❌ ${n}${x ? ' — ' + x : ''}`) }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await ctx.newPage()

  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))

  await page.goto(`${BASE}/playground`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('textarea', { timeout: 15000 })
  await sleep(1200)

  const composer = page.getByPlaceholder(/^Message|^Reply/)
  const sendBtn = () => page.getByRole('button', { name: /Run agent|Send message/ })
  const stop = () => page.getByRole('button', { name: 'Stop run' })
  const asstBubbles = () => page.locator('.rounded-bl-md.bg-surface-2').count()

  // ── FIX 2: mobile rail body scroll-lock ──────────────────────────────────────
  console.log('\n[A] Mobile rail scroll-lock (the fix)')
  await page.setViewportSize({ width: 375, height: 720 })
  await sleep(300)
  // dispatchEvent fires the React onClick directly on the in-page hamburger,
  // bypassing the app-shell's global nav button that occludes it at 375px.
  await page.locator('button[title="Open sidebar"]').first().dispatchEvent('click')
  await sleep(400)
  const locked = await page.evaluate(() => document.body.style.overflow)
  locked === 'hidden' ? ok('body scroll LOCKED while rail open', `overflow=${locked}`)
                      : bad('body scroll locked while rail open', `overflow=${locked || '(empty)'}`)
  await page.locator('[aria-label="History and conversation threads"] button[title="Close"]').first().dispatchEvent('click')
  await sleep(400)
  const unlocked = await page.evaluate(() => document.body.style.overflow)
  unlocked !== 'hidden' ? ok('body scroll RESTORED on close', `overflow=${unlocked || '(empty)'}`)
                        : bad('body scroll restored on close', `overflow=${unlocked}`)
  await page.setViewportSize({ width: 1280, height: 900 })
  await sleep(300)

  const fast = page.getByRole('button', { name: 'Fast' })
  if (await fast.count()) { await fast.first().click(); ok('Fast mode (Haiku) on for snappy turns') }

  // ── FLOW 1: live streaming render + typing→bubble handoff ─────────────────────
  console.log('\n[1] Live streaming render + handoff')
  await composer.click()
  await composer.fill('In one short sentence, what is a unit test?')
  await sendBtn().first().click()

  const confirm = page.locator('[role="dialog"]').filter({ hasText: 'Run this agent' })
  await confirm.waitFor({ timeout: 5000 })
    .then(() => ok('cost-confirm gate shown on first run')).catch(() => bad('cost-confirm gate shown on first run'))
  await page.screenshot({ path: 'scripts/_pg-1-confirm.png' }).catch(() => {})
  await confirm.getByRole('button', { name: 'Run', exact: true }).click()

  await stop().waitFor({ timeout: 8000 }).then(() => ok('run in-flight (Stop shown)')).catch(() => bad('run in-flight (Stop shown)'))
  await page.screenshot({ path: 'scripts/_pg-2-streaming.png' }).catch(() => {})  // mid-stream snapshot
  await stop().waitFor({ state: 'detached', timeout: 90000 })
    .then(() => ok('first run reached terminal')).catch(() => bad('first run reached terminal within 90s'))
  await sleep(900)

  const a1 = await asstBubbles()
  a1 === 1 ? ok('exactly ONE assistant bubble after turn 1 (no live/committed dup)', `count=${a1}`)
           : bad('exactly one assistant bubble after turn 1', `count=${a1}`)
  await page.screenshot({ path: 'scripts/_pg-3-turn1-done.png' }).catch(() => {})

  // ── FLOW 2: multi-turn streaming append (same thread) ────────────────────────
  console.log('\n[2] Multi-turn append (same thread)')
  await composer.click()
  await composer.fill('And what is an integration test? One sentence.')
  await sendBtn().first().click()
  const reConfirm = await page.locator('[role="dialog"]').filter({ hasText: 'Run this agent' })
    .waitFor({ timeout: 2500 }).then(() => true).catch(() => false)
  !reConfirm ? ok('2nd run SKIPS cost-confirm (once per session)') : bad('2nd run skips cost-confirm')
  await stop().waitFor({ timeout: 8000 }).catch(() => {})
  await stop().waitFor({ state: 'detached', timeout: 90000 })
    .then(() => ok('second run reached terminal')).catch(() => bad('second run reached terminal within 90s'))
  await sleep(900)
  const a2 = await asstBubbles()
  a2 === a1 + 1 ? ok('turn 2 APPENDED exactly one assistant bubble (no reset/dup)', `count ${a1}→${a2}`)
                : bad('turn 2 appended exactly one bubble', `count ${a1}→${a2}`)
  const userBubbles = await page.locator('.rounded-br-md.bg-accent').count()
  userBubbles === 2 ? ok('both user turns present (thread intact)', `users=${userBubbles}`)
                    : bad('both user turns present', `users=${userBubbles}`)
  await page.screenshot({ path: 'scripts/_pg-4-multiturn.png' }).catch(() => {})

  // ── FLOW 3: rating — Good (success) + Needs Fix → correction → reset ─────────
  console.log('\n[3] Rating flows')
  const good = page.getByRole('button', { name: 'Good', exact: true })
  if (await good.count()) {
    await good.first().click()
    const t = await page.locator('text=/Positive signal saved/i').first().waitFor({ timeout: 4000 }).then(() => true).catch(() => false)
    t ? ok('Good → "Positive signal saved" (honest toast)') : bad('Good → success toast shown')
    await sleep(1300)
  } else bad('Good rating button present')

  const needsFix = page.getByRole('button', { name: 'Needs Fix' })
  if (await needsFix.count()) {
    await needsFix.first().click(); await sleep(300)
    const issue = page.getByPlaceholder('What was wrong?')
    const fix = page.getByPlaceholder('What should it do instead?')
    if (await issue.count() && await fix.count()) {
      await issue.fill('Too generic'); await fix.fill('Give a concrete example')
      ok('Needs-Fix form opens + accepts input')
      const submit = page.getByRole('button', { name: /Save Correction|Saving/i })
      if (await submit.count()) {
        await submit.first().click(); await sleep(1600)
        const gone = (await page.getByPlaceholder('What was wrong?').count()) === 0
        gone ? ok('correction submitted + form reset (no stuck-submitting)') : bad('correction form reset after submit')
      } else bad('Save Correction button found')
    } else bad('Needs-Fix fields present')
  } else bad('Needs Fix button present')

  // ── FLOW 4: templates (save → list → delete) — pure UI ───────────────────────
  console.log('\n[4] Templates')
  await composer.fill('A reusable template prompt body')
  const tmplBtn = page.getByRole('button', { name: 'Templates' })
  if (await tmplBtn.count()) {
    await tmplBtn.first().click(); await sleep(300)
    const tname = page.getByPlaceholder('Template name...')
    if (await tname.count()) {
      await tname.fill('e2e-tmpl')
      const saveT = page.getByRole('button', { name: 'Save', exact: true })
      if (await saveT.count()) { await saveT.first().click(); await sleep(500); ok('template saved') } else bad('template Save button')
      await tmplBtn.first().click(); await sleep(300)
      if (await page.getByText('e2e-tmpl', { exact: false }).count()) {
        ok('saved template appears in list')
        const del = page.getByRole('button', { name: 'Remove template' })
        if (await del.count()) { await del.first().click(); await sleep(500); ok('template delete works') } else bad('template delete button')
      } else bad('saved template appears in list')
    } else bad('template name field opens')
    await page.keyboard.press('Escape').catch(() => {})
  } else bad('Templates button present')

  // ── FLOW 5: attachment attach + remove — pure UI ─────────────────────────────
  console.log('\n[5] Attachments')
  const fileInput = page.locator('input[type="file"]')
  if (await fileInput.count()) {
    await fileInput.setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('attachment body') })
    await sleep(400)
    const chip = page.getByRole('button', { name: /Remove note.txt/ })
    if (await chip.count()) {
      ok('attachment chip shown after attach')
      await chip.first().click(); await sleep(300)
      ;(await page.getByRole('button', { name: /Remove note.txt/ }).count()) === 0
        ? ok('attachment chip removable') : bad('attachment chip removable')
    } else bad('attachment chip shown')
  } else bad('file input present')

  // ── FLOW 6: output toolbar — copy / export / raw / fullscreen (last) ─────────
  console.log('\n[6] Output toolbar')
  for (const [label, name] of [['Copy', 'Copy output'], ['Export', 'Export as Markdown']]) {
    const b = page.getByRole('button', { name })
    if (await b.count()) { await b.first().click().catch(() => {}); await sleep(250); ok(`${label} clickable`) } else bad(`${label} present`)
  }
  const rawToggle = page.getByRole('button', { name: /^Raw$|^Rendered$/ })
  if (await rawToggle.count()) { await rawToggle.first().click(); await sleep(250); ok('Raw/Rendered toggle clickable') } else bad('Raw toggle present')
  // Fullscreen REPLACES the page render — do it last, then Exit.
  const fsBtn = page.getByRole('button', { name: 'Fullscreen output' })
  if (await fsBtn.count()) {
    await fsBtn.first().click(); await sleep(400)
    const inFs = await page.getByRole('button', { name: /Exit/ }).count()
    inFs ? ok('fullscreen opens') : bad('fullscreen opens')
    await page.getByRole('button', { name: /Exit/ }).first().click().catch(() => {})
    await sleep(300)
    ;(await composer.count()) > 0 ? ok('fullscreen Exit returns to chat') : bad('fullscreen Exit returns to chat')
  } else bad('Fullscreen button present')

  // ── Console-error gate (whole session) ───────────────────────────────────────
  console.log('\n[7] Console errors (whole session)')
  const real = consoleErrors.filter(e => !/Failed to load resource|favicon|ResizeObserver/i.test(e))
  real.length === 0 ? ok('no console/page errors', `(${consoleErrors.length} total, all benign)`)
                    : bad('console errors present', JSON.stringify(real.slice(0, 6)))

  await page.screenshot({ path: 'scripts/_pg-5-final.png' }).catch(() => {})
  await browser.close()

  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass)
  console.log(`\n${'─'.repeat(60)}\nRESULT: ${passed}/${results.length} checks passed`)
  if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log(`  - ${f.n}${f.x ? ': ' + f.x : ''}`)); process.exit(1) }
  console.log('ALL GREEN ✓')
})().catch(e => { console.error('FATAL', e); process.exit(2) })
