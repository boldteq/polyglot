// Headless client for Shopify's own dev MCP server (@shopify/dev-mcp) — so a gate can have our Liquid
// judged by SHOPIFY'S rules instead of ours.
//
// WHY THIS EXISTS: the team's 5,253 trained rules carried ZERO shopify.dev citations — every rule was
// model-recall, which is precisely why the output "isn't Shopify quality". This is the source of truth.
//
// PROTOCOL (verified live 2026-07-23 against v1.14.3 — do not guess it, it is not the documented
// `validate_theme_codeblocks` shape you may remember):
//   initialize → notifications/initialized
//   tools/call learn_shopify_api { api: 'liquid' }   → returns a UUID in PROSE, not a JSON field
//   tools/call validate_theme { conversationId, absoluteThemePath, filesCreatedOrUpdated: [{path, artifactId, content}] }
// The result is MARKDOWN, one block per artifact, with `ERROR:` / `WARNING:` lines.
//
// OFFLINE: learn_shopify_api hits shopify.dev. Schemas then cache in
// ~/Library/Caches/theme-liquid-docs-nodejs/. Every failure path returns { unavailable, reason } so the
// caller can WARN — a validator that cannot run must never read as a pass (gate #45 contract).
//
// GOTCHA worth keeping: a corrupt `~/.npm/_npx/<hash>` tree makes the server die on startup with
// "Cannot find module .../line-column/lib/line-column.js". That is also what silently breaks the
// shopify-dev-mcp connection inside Claude Code. Fix: delete that cache dir and let npx refetch.

import { spawn } from 'node:child_process'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const DEFAULT_PKG = process.env.SHOPIFY_MCP_PKG || '@shopify/dev-mcp@latest'

function startServer() {
  return spawn('npx', ['-y', DEFAULT_PKG], {
    env: { ...process.env, POLARIS_UNIFIED: 'true', LIQUID: 'true' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

// Minimal newline-delimited JSON-RPC over the child's stdio.
function makeRpc(proc, timeoutMs) {
  let buf = ''
  const pending = new Map()
  let nextId = 1
  let deadReason = null

  proc.stdout.on('data', (d) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { continue } // the server also logs plain text to stdout
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    }
  })
  // Startup crashes surface on stderr; capture the first real line so the reason is diagnosable.
  proc.stderr.on('data', (d) => {
    const s = String(d)
    if (!deadReason && /Error:|Cannot find module|ENOENT/.test(s)) deadReason = s.split('\n').find(Boolean)
  })
  proc.on('error', (e) => { deadReason = deadReason || e.message })

  const call = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(deadReason || `timed out after ${timeoutMs}ms on ${method}`))
    }, timeoutMs)
    pending.set(id, (m) => { clearTimeout(timer); resolve(m) })
    try { proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`) } catch (e) {
      clearTimeout(timer); pending.delete(id); reject(new Error(deadReason || e.message))
    }
  })
  const notify = (method, params) => { try { proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`) } catch { /* dead */ } }
  return { call, notify }
}

const textOf = (r) => ((r && r.result && r.result.content) || []).map((c) => c.text || '').join('\n')

// Parse the markdown report into structured findings. Shape verified against a live run:
//   ### Them 2
//   **Artifact ID:** broken
//   **Status:** ❌ FAILED
//   **Details:** Theme file sections/broken.liquid failed to validate:
//   ERROR: 'snippets/x.liquid' does not exist
//   WARNING: Deprecated filter 'img_url', ...; SUGGESTED FIXES: ...
export function parseValidationReport(md) {
  const out = []
  if (!md) return out
  const blocks = md.split(/^###\s+/m).slice(1)
  for (const b of blocks) {
    const artifact = (b.match(/\*\*Artifact ID:\*\*\s*(.+)/) || [])[1]?.trim() || null
    const file = (b.match(/Theme file\s+(\S+?)\s+(?:passed|failed)/) || [])[1] || null
    for (const m of b.matchAll(/^\s*(ERROR|WARNING):\s*(.+)$/gm)) {
      const [, sev, rawMsg] = m
      const [message, fixes] = rawMsg.split(/;\s*SUGGESTED FIXES:\s*/)
      out.push({
        severity: sev === 'ERROR' ? 'error' : 'warning',
        file: file || artifact,
        artifact,
        message: message.trim().replace(/\.$/, ''),
        fix: (fixes || '').trim().replace(/\.+$/, '') || null,
      })
    }
  }
  return out
}

// Run Shopify's validator over `files` ([{ path, content }]) resolved against absoluteThemePath.
// → { unavailable:false, findings:[...], scanned:n } | { unavailable:true, reason }
export async function validateTheme(absoluteThemePath, files, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || process.env.SHOPIFY_MCP_TIMEOUT_MS || 180000)
  if (!files.length) return { unavailable: false, findings: [], scanned: 0 }

  let proc
  try { proc = startServer() } catch (e) { return { unavailable: true, reason: `could not start ${DEFAULT_PKG}: ${e.message}` } }
  const { call, notify } = makeRpc(proc, timeoutMs)

  try {
    await call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'boldteq-theme-toolkit', version: '1.0.0' },
    })
    notify('notifications/initialized', {})

    const learn = await call('tools/call', { name: 'learn_shopify_api', arguments: { api: 'liquid' } })
    const conversationId = (textOf(learn).match(UUID_RE) || [])[0]
    if (!conversationId) return { unavailable: true, reason: 'learn_shopify_api returned no conversationId (offline, or shopify.dev unreachable)' }

    const res = await call('tools/call', {
      name: 'validate_theme',
      arguments: {
        conversationId,
        absoluteThemePath,
        filesCreatedOrUpdated: files.map((f) => ({ path: f.path, artifactId: f.path, content: f.content })),
      },
    })
    const md = textOf(res)
    if (res.result?.isError) return { unavailable: true, reason: `validate_theme rejected the request: ${md.slice(0, 200)}` }
    return { unavailable: false, findings: parseValidationReport(md), scanned: files.length, raw: md }
  } catch (e) {
    return { unavailable: true, reason: e.message }
  } finally {
    try { proc.kill() } catch { /* already gone */ }
  }
}
