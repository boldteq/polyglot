// memory_search must never rank confidently against an index built by a different embedder (BRAIN-2).
//
// reindex.mjs already forces a full re-embed when the embedder changes — but only when it RUNS.
// Between a provider change (or an Ollama outage that pushes someone to INTEL_EMBED_PROVIDER=hash to
// unblock) and the next reindex, every query is embedded with one model and compared against an index
// built by another. Cosine over those is meaningless, yet the results come back ranked and confident.
// Silent recall degradation is the exact failure this backlog keeps turning up, so it must announce
// itself: a provider/model drift WARNS, and a dim mismatch REFUSES rather than fabricating an order.
//
// Pure — no index, no running Ollama.

import test from 'node:test'
import assert from 'node:assert/strict'
import { embedderMismatch } from './retrieve.mjs'

const OLLAMA = { provider: 'ollama', model: 'nomic-embed-text' }

test('a matching embedder is not flagged', () => {
  const manifest = { provider: 'ollama', model: 'nomic-embed-text', dim: 768 }
  assert.equal(embedderMismatch(manifest, OLLAMA, 768), null)
})

test('the hash fallback against an ollama index is FATAL (dim 512 vs 768)', () => {
  // the realistic outage path: ollama is down, someone sets INTEL_EMBED_PROVIDER=hash to unblock,
  // and every subsequent search silently compares 512-dim vectors to a 768-dim index.
  const manifest = { provider: 'ollama', model: 'nomic-embed-text', dim: 768 }
  const m = embedderMismatch(manifest, { provider: 'hash', model: 'hash' }, 512)
  assert.ok(m, 'must be detected')
  assert.equal(m.fatal, true, 'a dim mismatch cannot be ranked — it must refuse, not warn')
  assert.match(m.detail, /provider ollama → hash/)
  assert.match(m.detail, /dim 768 → 512/)
})

test('a model swap at the SAME dim warns but is not fatal', () => {
  const manifest = { provider: 'ollama', model: 'nomic-embed-text', dim: 768 }
  const m = embedderMismatch(manifest, { provider: 'ollama', model: 'mxbai-embed-large' }, 768)
  assert.ok(m, 'a model change still degrades similarity and must be reported')
  assert.equal(m.fatal, false, 'same dim → results are ordered, just less trustworthy')
  assert.match(m.detail, /model nomic-embed-text → mxbai-embed-large/)
})

test('no manifest → no claim (the supabase store has none)', () => {
  assert.equal(embedderMismatch(null, OLLAMA, 768), null)
})

test('a missing or zero dim on either side is not treated as a mismatch', () => {
  // an older manifest may predate dim tracking; absence must not be read as disagreement
  assert.equal(embedderMismatch({ provider: 'ollama', model: 'nomic-embed-text' }, OLLAMA, 768), null)
  assert.equal(embedderMismatch({ provider: 'ollama', model: 'nomic-embed-text', dim: 0 }, OLLAMA, 768), null)
  assert.equal(embedderMismatch({ provider: 'ollama', model: 'nomic-embed-text', dim: 768 }, OLLAMA, 0), null)
})

test('provider drift alone is reported even when dims happen to agree', () => {
  const manifest = { provider: 'openai', model: 'text-embedding-3-small', dim: 1536 }
  const m = embedderMismatch(manifest, { provider: 'voyage', model: 'voyage-3' }, 1536)
  assert.ok(m)
  assert.equal(m.fatal, false)
  assert.match(m.detail, /provider openai → voyage/)
})
