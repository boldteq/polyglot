// Regression: the SWT distributor must never let a rule body corrupt the agent file.
//
// HYG-1 (2026-07-23). `updateAgent` replaced the managed block with
// `original.replace(re, section)` — a STRING replacement. JS interprets `$&`, "$`", "$'"
// and `$$` inside the replacement as patterns. mantle's #28 rule body contains
// "never hardcode `$`", so the "$`" sequence expanded to "everything before the match" and
// spliced the ENTIRE preceding agent file into the managed block. It was silent: the markers
// stayed balanced, the frontmatter stayed intact, and the file only GREW, so every existing
// guard passed. mantle.md sat at 814 lines with its whole body duplicated inside its own
// SWT-TRAINED block, and the #28 rule text was destroyed mid-sentence.
//
// These tests pin the fix (replacer function) and the added post-write block assertion.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swt-dist-'))
process.env.SWT_AGENTS_DIR = tmp

const { updateAgent } = await import('../scripts/swt-distribute.mjs')

const AGENT_ID = 'mantle'
const BODY_MARKER = 'UNIQUE-BODY-SENTINEL-DO-NOT-DUPLICATE'

// IMPORTANT: the bug only fires on the REPLACE path — when a managed block already exists.
// A file without one takes a plain-concatenation branch that was never vulnerable, so a test
// that seeds a block-less file passes trivially. Every case here seeds an existing block.
function writeAgent({ withBlock = true, extra = '' } = {}) {
  const file = path.join(tmp, `${AGENT_ID}.md`)
  fs.writeFileSync(
    file,
    `---
name: Mantle — Theme Release Engineer
model: sonnet
---

# Mantle — Theme Release Engineer

${BODY_MARKER}

Some existing body content that must stay exactly once.
${extra}
${
  withBlock
    ? `
## 🎓 SWT Trained Defaults (auto-maintained by swt-train-loop — do not hand-edit between markers)
<!-- SWT-TRAINED:START -->
a previously distributed rule
<!-- SWT-TRAINED:END -->
`
    : ''
}`,
  )
  return file
}

// A rule whose body contains every JS replacement-pattern trigger.
const rule = (body) => ({
  concern: 'i18n-currency-rtl',
  surface: '404',
  gate: '#28', // in ENFORCING_GATES → becomes a teaser, so body lands in the managed block
  owners: [AGENT_ID],
  gap: 'how should prices render under Shopify Markets?',
  id: 'test-1',
  body,
})

test('a rule body containing "$`" does not splice the file into the managed block', () => {
  const file = writeAgent()
  const body = 'Use the money filter and never hardcode `$` — it respects cart.currency'

  assert.equal(updateAgent(AGENT_ID, [rule(body)]), true)
  const out = fs.readFileSync(file, 'utf8')

  // the pre-fix bug duplicated everything before the match into the block
  assert.equal(
    out.split(BODY_MARKER).length - 1,
    1,
    'agent body must appear exactly once — "$`" expanded to the preceding file',
  )
  // the rule text must survive verbatim, not be destroyed mid-sentence
  assert.ok(out.includes(body), 'rule body must be written literally')
  assert.equal((out.match(/SWT-TRAINED:START/g) || []).length, 1)
  assert.equal((out.match(/SWT-TRAINED:END/g) || []).length, 1)
  assert.ok(out.startsWith('---'), 'frontmatter must stay intact')
})

test('the other replacement patterns ($&, $\', $$) are also written literally', () => {
  for (const body of [
    'whole-match trigger $& must stay literal',
    "trailing trigger $' must stay literal",
    'double trigger $$ must stay literal',
    'combined $& and $` and $$ in one rule',
  ]) {
    const file = writeAgent()
    assert.equal(updateAgent(AGENT_ID, [rule(body)]), true)
    const out = fs.readFileSync(file, 'utf8')
    assert.equal(out.split(BODY_MARKER).length - 1, 1, `body duplicated for: ${body}`)
    assert.ok(out.includes(body), `rule body mangled for: ${body}`)
  }
})

test('re-running the distributor is idempotent (no growth per run)', () => {
  const file = writeAgent()
  const r = [rule('never hardcode `$` — stable')]

  updateAgent(AGENT_ID, r)
  const first = fs.readFileSync(file, 'utf8')
  updateAgent(AGENT_ID, r)
  const second = fs.readFileSync(file, 'utf8')

  assert.equal(second, first, 'repeated distribution must not change the file')
  assert.equal(second.split(BODY_MARKER).length - 1, 1)
})

test('an already-corrupted file is healed, not compounded', () => {
  // simulate the real mantle.md: the whole body duplicated inside the managed block
  const file = writeAgent({ withBlock: false })
  const dup = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(
    file,
    `${dup}
## 🎓 SWT Trained Defaults (auto-maintained by swt-train-loop — do not hand-edit between markers)
<!-- SWT-TRAINED:START -->
old rule text ${dup}
<!-- SWT-TRAINED:END -->
`,
  )
  assert.equal(fs.readFileSync(file, 'utf8').split(BODY_MARKER).length - 1, 2)

  updateAgent(AGENT_ID, [rule('never hardcode `$` — healed')])

  const out = fs.readFileSync(file, 'utf8')
  assert.equal(out.split(BODY_MARKER).length - 1, 1, 'redistribution must drop the duplicate')
  assert.equal((out.match(/SWT-TRAINED:START/g) || []).length, 1)
})

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
