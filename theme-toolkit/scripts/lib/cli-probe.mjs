// Pure classification of a `shopify version` probe — kept in lib/ so tests can import it WITHOUT
// executing the gate (gate-theme-check.mjs runs on import).
//
// The distinction that matters: MISSING (installing really is the fix) vs installed-but-unlaunchable.
// Collapsing them left gate #2 permanently inert while printing a remedy that could never work — the
// CLI was on PATH but crashed under Node 20.20.1, which does not export `enableCompileCache` from
// `node:module` (Node 22 runs it fine). Reinstalling the CLI changes nothing about that.
export function classifyProbe({ error, status, stderr }) {
  if (error && (error.code === 'ENOENT' || /ENOENT/.test(error.message || ''))) return { kind: 'missing' }
  if (error) return { kind: 'broken', detail: error.message }
  if (status !== 0) {
    const s = String(stderr || '').trim()
    // the launcher blew up before the CLI ran (a Node/ESM incompatibility, not a CLI usage error)
    if (/SyntaxError|ERR_MODULE_NOT_FOUND|does not provide an export|Unexpected token/i.test(s)) {
      return { kind: 'incompatible-runtime', detail: s.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 200) || s.slice(0, 200) }
    }
    return { kind: 'broken', detail: s.slice(0, 200) }
  }
  return { kind: 'ok' }
}
