// isMain — "was this module run directly, or imported?"
//
// Every toolkit script guards its CLI entry so fixtures can import its pure functions without the
// script executing. The obvious spelling is wrong:
//
//   path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)     // ← silently fragile
//
// `path.resolve` does not resolve SYMLINKS. On macOS a temp dir is `/var/folders/…` in argv but
// `/private/var/folders/…` once resolved, and the same applies to a symlinked checkout or some CI
// layouts. When the comparison fails, `main()` never runs and the script EXITS 0 HAVING DONE NOTHING —
// the worst failure mode available, because every caller reads exit 0 as success. A vendor tool hit
// exactly this on 2026-07-23 (CB-15): it reported success while copying nothing.
//
// lib/jsonify-hits.mjs already had the correct realpath comparison, with this reasoning in a comment.
// It was never shared, so 38 other scripts kept the fragile spelling. This is that helper, extracted.
//
//   import { isMain } from './lib/is-main.mjs'
//   if (isMain(import.meta.url)) main()

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function isMain(importMetaUrl) {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(importMetaUrl))
  } catch {
    return false // an unresolvable path is not this module
  }
}
