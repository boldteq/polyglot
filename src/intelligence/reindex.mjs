// Boldteq Intelligence — reindex the brain into the vector store.
// Incremental: skips files whose content_hash is unchanged. Re-embeds changed files only.
//   node src/intelligence/reindex.mjs            incremental reindex of the whole brain
//   node src/intelligence/reindex.mjs --full     force re-embed everything (provider/dim changed)
//   node src/intelligence/reindex.mjs --stats    print index stats, no work
//
// Also exported as reindex(opts) so the change-queue drainer (Phase D.1) can run a
// SCOPED incremental reindex of just the files that changed — edit → searchable in
// ~60s, not 12.5h. The nightly cron still runs the full incremental as a backstop.

import { enumerateSources } from './sources.mjs'
import { chunkMarkdown } from './chunk.mjs'
import { embed, embedderInfo } from './embedder.mjs'
import { getStore, storeKind, freshnessStats } from './store.mjs'

/**
 * Reindex the brain (or a scoped subset) into the vector store.
 * @param {object} opts
 *   full?      {boolean}  force re-embed everything (ignore content_hash)
 *   statsOnly? {boolean}  return store stats, do no work
 *   only?      {string[]|Set<string>} restrict to these source_refs (queue drain).
 *              When scoped, missing-file pruning is SKIPPED (we didn't enumerate the
 *              whole brain, so absence here ≠ deletion). The nightly full run prunes.
 *   log?       {(msg:string)=>void} progress sink (defaults to no-op; CLI passes console.log)
 * @returns {Promise<object>} { embedded, skipped, chunks, removed, dim, ms, scoped, stats }
 */
export async function reindex(opts = {}) {
  const { full = false, statsOnly = false, only = null, log = () => {} } = opts
  const store = getStore()
  if (statsOnly) return { statsOnly: true, stats: await store.stats() }

  const { provider, model } = embedderInfo()
  const manifest = store.readManifest?.()
  const providerChanged = manifest && (manifest.provider !== provider || manifest.model !== model)
  const force = full || providerChanged
  if (providerChanged) log(`embedder changed (${manifest.provider}/${manifest.model} → ${provider}/${model}) — full reindex`)

  const scoped = only ? new Set(Array.isArray(only) ? only : [...only]) : null
  let sources = enumerateSources()
  if (scoped) sources = sources.filter((s) => scoped.has(s.source_ref))
  log(`reindex: ${sources.length} source file(s)${scoped ? ` (scoped to ${scoped.size})` : ''} · embedder=${provider}/${model} · store=${storeKind()}${force ? ' · FULL' : ' · incremental'}`)

  store.beginBulk?.() // buffer all writes; one persist at flush() (avoids per-file full rewrite)
  let embedded = 0, skipped = 0, chunks = 0, dim = manifest?.dim || 0
  const t0 = Date.now()
  for (const s of sources) {
    if (!force && store.sourceHash(s.source_ref) === s.content_hash) { skipped++; continue }
    const pieces = chunkMarkdown(s.raw, s.title)
    if (pieces.length === 0) { await store.replaceSource(s.source_ref, []); continue }
    const { vectors, dim: d } = await embed(pieces.map((p) => p.text))
    dim = d || dim
    const now = new Date().toISOString()
    const records = pieces.map((p, i) => ({
      id: `${s.source_ref}#${i}`,
      source_type: s.source_type,
      source_ref: s.source_ref,
      chunk_index: i,
      chunk_text: p.text,
      embedding: vectors[i],
      metadata: { title: s.title, heading_path: p.headingPath },
      content_hash: s.content_hash,
      updated_at: now,
    }))
    await store.replaceSource(s.source_ref, records)
    embedded++; chunks += records.length
    if (embedded % 25 === 0) log(`  …${embedded} embedded`)
  }
  // Prune chunks for files that no longer exist — ONLY on a full-brain pass (a scoped
  // drain hasn't seen the whole set, so it must not infer deletions).
  const removed = (!scoped && store.deleteMissing) ? store.deleteMissing(sources.map((s) => s.source_ref)) : 0
  store.flush?.() // single write of the whole index
  const stats = await store.stats()
  // Phase E — stamp freshness into the manifest so a silently-stalled reindex is visible.
  let freshness = null
  try { freshness = store.allRecords ? freshnessStats(await store.allRecords()) : null } catch { /* freshness best-effort */ }
  store.writeManifest?.({ provider, model, dim, count: stats.total, byType: stats.byType, freshness, updated_at: new Date().toISOString() })

  const ms = Date.now() - t0
  log(`reindex done in ${(ms / 1000).toFixed(1)}s — embedded ${embedded} file(s) (${chunks} chunks), skipped ${skipped} unchanged, pruned ${removed}. dim=${dim}`)
  return { embedded, skipped, chunks, removed, dim, ms, scoped: scoped ? scoped.size : null, stats }
}

// ── CLI wrapper (unchanged behavior) ─────────────────────────────────────────
async function main() {
  const res = await reindex({
    full: process.argv.includes('--full'),
    statsOnly: process.argv.includes('--stats'),
    log: console.log,
  })
  console.log(JSON.stringify(res.stats, null, 2))
}

// Run main() only when invoked directly as a CLI, not when imported by the drainer.
import { fileURLToPath } from 'node:url'
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => { console.error(`reindex ERROR: ${err.message}`); process.exit(1) })
}
