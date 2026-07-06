#!/usr/bin/env node
// Pre-`dev` guard: kill any STALE Vite dev server still bound to port 5173 before
// starting a fresh one.
//
// Why: the Playground run streams SSE through the Vite dev proxy. The proxy config
// (client/vite.config.ts) disables buffering for /api/playground/run — but a Vite
// process started BEFORE a pull that changed that config keeps the OLD buffering
// behavior, so the live stream arrives in one end-blob and the client aborts with
// "No bytes received for 180s". Multiple stale Vite servers have bitten us before.
// Killing the stale 5173 listener guarantees `npm run dev` serves the current proxy.
//
// Scope is deliberately narrow: ONLY port 5173 (the Vite dev proxy). We never touch
// 3847 — the backend may be managed by launchd and would just respawn, causing a
// fight. Best-effort: any failure here is swallowed so `dev` always proceeds.

import { execSync } from 'node:child_process'

const VITE_PORT = 5173

function killListenersOn(port) {
  if (process.platform === 'win32') return // lsof-based; dev is darwin/linux here
  let pids = ''
  try {
    // -ti = terse pid list; -sTCP:LISTEN = only the server socket, not clients.
    pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return // lsof exits non-zero when nothing is listening — nothing to kill.
  }
  const list = pids.split('\n').map((p) => p.trim()).filter(Boolean)
  for (const pid of list) {
    try {
      process.kill(Number(pid), 'SIGTERM')
      console.log(`[kill-stale-dev] terminated stale Vite server on :${port} (pid ${pid})`)
    } catch {
      /* already gone */
    }
  }
}

killListenersOn(VITE_PORT)
