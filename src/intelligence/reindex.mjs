// Boldteq Intelligence — reindex the brain into the vector store.
// Incremental: skips files whose content_hash is unchanged. Re-embeds changed files only.
//   node src/intelligence/reindex.mjs            incremental reindex of the whole brain
//   node src/intelligence/reindex.mjs --full     force re-embed everything (provider/dim changed)
//   node src/intelligence/reindex.mjs --stats    print index stats, no work

import { enumerateSources } from './sources.mjs'
import { chunkMarkdown } from './chunk.mjs'
import { embed, embedderInfo } from './embedder.mjs'
import { getStore, storeKind } from './store.mjs'

const FULL = process.argv.includes('--full')
const STATS_ONLY = process.argv.includes('--stats')

async function main() {
  const store = getStore()
  if (STATS_ONLY) { console.log(JSON.stringify(await store.stats(), null, 2)); return }

  const { provider, model } = embedderInfo()
  const manifest = store.readManifest?.()
  const providerChanged = manifest && (manifest.provider !== provider || manifest.model !== model)
  const force = FULL || providerChanged
  if (providerChanged) console.log(`embedder changed (${manifest.provider}/${manifest.model} → ${provider}/${model}) — full reindex`)

  const sources = enumerateSources()
  console.log(`reindex: ${sources.length} source files · embedder=${provider}/${model} · store=${storeKind()}${force ? ' · FULL' : ' · incremental'}`)

  store.beginBulk?.() // buffer all writes; one persist at flush() (avoids per-file full rewrite)
  let embedded = 0, skipped = 0, chunks = 0, dim = manifest?.dim || 0
  const t0 = Date.now()
  for (const s of sources) {
    if (!force && store.sourceHash(s.source_ref) === s.content_hash) { skipped++; continue }
    const pieces = chunkMarkdown(s.raw, s.title)
    if (pieces.length === 0) { await store.replaceSource(s.source_ref, []); continue }
    const { vectors, dim: d } = await embed(pieces.map(p => p.text))
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
    if (embedded % 25 === 0) process.stdout.write(`  …${embedded} embedded\r`)
  }
  // prune chunks for files that no longer exist, then persist ONCE
  const removed = store.deleteMissing ? store.deleteMissing(sources.map(s => s.source_ref)) : 0
  store.flush?.() // single write of the whole index
  store.writeManifest?.({ provider, model, dim, count: (await store.stats()).total, updated_at: new Date().toISOString() })

  console.log(`reindex done in ${((Date.now() - t0) / 1000).toFixed(1)}s — embedded ${embedded} file(s) (${chunks} chunks), skipped ${skipped} unchanged, pruned ${removed}. dim=${dim}`)
  console.log(JSON.stringify(await store.stats(), null, 2))
}

main().catch(err => { console.error(`reindex ERROR: ${err.message}`); process.exit(1) })
