// preview-server — start the `theme:dev` preview, wait until its URL responds, run a body, and ALWAYS
// tear the server down (even if the body throws). This is what makes `maestro:build --auto-preview`
// truly hands-off: no second terminal running `pnpm theme:dev`, no manual THEME_PREVIEW_URL export.
//
// The lifecycle (spawn → poll-until-ready with a bounded budget → run → teardown-in-finally) is the
// risky part, so spawn/probe/sleep are all injected: __fixtures__/preview-server proves it with a
// fake child + fake probe + instant sleep — no live store, no real `shopify theme dev`, no network,
// no wall-clock. The timeout is a POLL-COUNT budget (not Date.now()) so it's deterministic in tests.
//
// No external deps. Node 20 ESM.

import path from 'node:path'
import { spawn as realSpawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PREVIEW_URL = `http://127.0.0.1:${process.env.THEME_DEV_PORT || '9292'}`

// Default real probe: GET the URL, resolve true on any HTTP response, false on error/timeout.
async function defaultProbe(url, timeoutMs = 2000) {
  const { default: http } = await import('node:http')
  const { default: https } = await import('node:https')
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    let req
    try { req = (url.startsWith('https:') ? https : http).get(url, (res) => { res.resume(); finish(res.statusCode != null) }) }
    catch { return finish(false) }
    req.on('error', () => finish(false))
    req.setTimeout(timeoutMs, () => { req.destroy(); finish(false) })
  })
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

// withPreviewServer(opts, body) — runs body(url) with the preview server live; returns body's result.
// Throws (after teardown) if the server never becomes ready within the poll budget.
export async function withPreviewServer(opts, body) {
  const {
    url = DEFAULT_PREVIEW_URL,
    dir = process.cwd(),
    env = process.env,
    cmd = process.execPath,
    args = [path.resolve(HERE, '..', 'shopify-theme-dev.mjs')], // default: `node shopify-theme-dev.mjs`
    spawn = realSpawn,
    probe = defaultProbe,
    sleep = defaultSleep,
    timeoutMs = 120_000,
    pollMs = 1500,
    log = () => {},
  } = opts || {}
  if (typeof body !== 'function') throw new Error('withPreviewServer: body function required')

  log(`starting preview server → ${url}`)
  const child = spawn(cmd, args, { cwd: dir, env, stdio: 'ignore' })
  let toreDown = false
  const teardown = () => {
    if (toreDown) return
    toreDown = true
    try { child?.kill?.('SIGTERM') } catch { /* already gone */ }
  }
  // a crashed dev server shouldn't hang the poll loop — note it, the readiness poll will time out.
  let exited = false
  try { child?.on?.('exit', () => { exited = true }) } catch { /* fake child without .on */ }

  try {
    const maxPolls = Math.max(1, Math.ceil(timeoutMs / pollMs))
    let ready = false
    for (let i = 0; i < maxPolls; i += 1) {
      if (exited) throw new Error(`preview server exited before becoming ready (${url})`)
      if (await probe(url)) { ready = true; break }
      if (i < maxPolls - 1) await sleep(pollMs)
    }
    if (!ready) throw new Error(`preview server did not become ready at ${url} within ${timeoutMs}ms`)
    log('preview ready')
    return await body(url)
  } finally {
    teardown()
  }
}
