// Shared content-hash for the design-system cascade (#2 automated-cascade-on-brand-change). The CSS
// generator STAMPS dsHash(design-system.json) into assets/design-system.css; the cascade gate COMPARES
// it. Both use THIS one function so the stamp + the check can never drift. PURE. Node 20 ESM.
import crypto from 'node:crypto'

// stable 12-hex hash of the parsed design-system object (both sides parse the same file → same order).
export function dsHash(dsJson) {
  return crypto.createHash('sha256').update(JSON.stringify(dsJson ?? {})).digest('hex').slice(0, 12)
}

export const DS_HASH_RE = /ds-hash:([0-9a-f]{12})/

// pull the stamped hash out of the generated CSS header. null if unstamped (an old/hand-rolled CSS).
export function extractStampedHash(cssText) {
  const m = DS_HASH_RE.exec(String(cssText || ''))
  return m ? m[1] : null
}

// PURE: is the generated CSS stale vs the current design-system? ok=false → a brand-change wasn't
// cascaded (regenerate via `pnpm ds:css`). Returns the expected/found hashes for the message.
export function cascadeStale(dsJson, cssText) {
  const expected = dsHash(dsJson)
  const found = extractStampedHash(cssText)
  if (!found) return { ok: false, reason: 'design-system.css has no ds-hash stamp (regenerate with `pnpm ds:css` so the cascade is verifiable)', expected, found: null }
  if (found !== expected) return { ok: false, reason: 'design-system.json changed but design-system.css was NOT regenerated — the brand-change did not cascade', expected, found }
  return { ok: true, expected, found }
}
