// Guard against the HYG-1 corruption class, repo-wide.
//
// `String.replace(re, replacement)` treats `$&`, "$`", "$'", `$$` and `$1` inside the REPLACEMENT as
// patterns, not literal text. Hand it generated content and any of those sequences expands. That is how
// mantle.md got its entire body spliced into its own machine-managed block: one trained rule contained
// "never hardcode `$`", and "$`" means "insert everything before the match". It was silent — markers
// stayed balanced, frontmatter stayed intact, and the file only GREW, so every guard passed.
//
// The fix is always the same: pass a replacer FUNCTION. If the pattern needs its capture groups, take
// them from the function's arguments instead of `$1`.
//
// This scans for two unambiguous signatures of "generated content as a string replacement":
//   (a) a template literal containing `${…}` in the replacement position
//   (b) both the needle AND the replacement being bare identifiers  — e.g. body.replace(sec, newSec)
// Escape hatch: put `safe-replace-ok` in a comment on the same or the preceding line, with a reason.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOTS = ['scripts', 'src', 'theme-toolkit/scripts']
const SKIP = /(^|\/)(node_modules|__fixtures__|\.git|dist|build|coverage)(\/|$)/

// NB `\.replaceAll?\(` would be wrong — the `?` binds to the final `l`, requiring "replaceAl" and
// never matching `.replace(`. The scanner silently found nothing until the teeth test below caught it.
const CALL = String.raw`\.replace(?:All)?\(`
// (a) replacement is a template literal that interpolates
const TEMPLATE_REPL = new RegExp(`${CALL}[^;]*?,\\s*\`[^\`]*\\$\\{`)
// (b) replace(identifier, identifier) — a string needle with a generated replacement
const IDENT_REPL = new RegExp(`${CALL}\\s*[A-Za-z_$][\\w.$]*\\s*,\\s*[A-Za-z_$][\\w.$]*\\s*\\)`)

function walk(dir, out = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    if (SKIP.test(abs)) continue
    if (e.isDirectory()) walk(abs, out)
    else if (/\.(mjs|js)$/.test(e.name) && !/\.test\.(mjs|js)$/.test(e.name)) out.push(abs)
  }
  return out
}

export function scanFile(abs, source = null) {
  const text = source ?? fs.readFileSync(abs, 'utf-8')
  const lines = text.split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!TEMPLATE_REPL.test(line) && !IDENT_REPL.test(line)) continue
    const waived = /safe-replace-ok/.test(line) || /safe-replace-ok/.test(lines[i - 1] || '')
    if (waived) continue
    hits.push({ line: i + 1, text: line.trim() })
  }
  return hits
}

test('no generated content is passed to String.replace as a string replacement', () => {
  const offenders = []
  for (const root of ROOTS) {
    for (const abs of walk(path.join(REPO, root))) {
      for (const h of scanFile(abs)) offenders.push(`${path.relative(REPO, abs)}:${h.line}  ${h.text}`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `String.replace() called with generated content as a STRING replacement — "$&", "$\`", "$'" and "$1" in that\n`
    + 'content will EXPAND instead of being written literally (this is how mantle.md corrupted itself).\n'
    + 'Pass a replacer function instead: .replace(re, () => text), or (m, g1) => g1 + text when you need\n'
    + `the capture. If a site is genuinely safe, add a "safe-replace-ok" comment with the reason.\n\n${offenders.join('\n')}`,
  )
})

test('the scanner actually detects both signatures (it has teeth)', () => {
  // (a) template literal with interpolation — the swt-train-loop meter-block shape
  const a = scanFile('x.mjs', 'md = md.replace(/<!-- M:START -->[\\s\\S]*?<!-- M:END -->/, `<!-- M:START -->\\n${line}\\n<!-- M:END -->`)')
  assert.equal(a.length, 1, 'template-literal replacement not detected')

  // (b) identifier needle + identifier replacement — the fix-binding-gaps shape
  const b = scanFile('x.mjs', 'body = body.replace(bindSec, newSec)')
  assert.equal(b.length, 1, 'identifier/identifier replacement not detected')

  // the fixed forms are clean
  assert.equal(scanFile('x.mjs', 'md = md.replace(re, () => meter)').length, 0, 'replacer function flagged')
  assert.equal(scanFile('x.mjs', 'md = md.replace(re, (_m, g1) => g1 + row)').length, 0, 'capture-arg function flagged')

  // a literal replacement with no interpolation is fine
  assert.equal(scanFile('x.mjs', "s = s.replace(/a/g, 'b')").length, 0, 'literal replacement flagged')

  // and the waiver works
  assert.equal(scanFile('x.mjs', 'body = body.replace(a, b) // safe-replace-ok: both are fixed constants').length, 0, 'waiver ignored')
})
