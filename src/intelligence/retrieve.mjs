// Boldteq Intelligence — semantic retrieval over the brain.
//   import { retrieve } from './retrieve.mjs'
//   retrieve("shopify PDP metafield binding", { topK, filter:{source_type, niche} })
// CLI: node src/intelligence/retrieve.mjs "query" [--k 8] [--type memory|agent|project|lesson|...]

import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { embedOne } from './embedder.mjs'
import { getStore } from './store.mjs'

const HOME = os.homedir()
const short = (ref) => (typeof ref === 'string' ? ref.replace(HOME, '~') : ref)

export async function retrieve(query, { topK = 8, filter = {} } = {}) {
  if (!query || !query.trim()) return []
  const { vector } = await embedOne(query)
  const hits = await getStore().search(vector, { topK, filter })
  return hits.map(h => ({
    score: Number(h.score?.toFixed?.(4) ?? h.score),
    source_type: h.record.source_type,
    source_ref: short(h.record.source_ref),
    title: h.record.metadata?.title || h.record.title,
    heading_path: h.record.metadata?.heading_path || h.record.heading_path,
    text: h.record.chunk_text,
  }))
}

// compact context block agents can drop straight into a prompt
export function formatContext(results) {
  return results.map((r, i) =>
    `[${i + 1}] (${r.source_type} · score ${r.score}) ${r.heading_path || r.title}\n    ${short(r.source_ref)}\n${r.text.split('\n').map(l => '    ' + l).join('\n')}`
  ).join('\n\n')
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  let topK = 8, filter = {}
  const q = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--k') topK = Number.parseInt(args[++i], 10)
    else if (args[i] === '--type') filter.source_type = args[++i]
    else q.push(args[i])
  }
  const query = q.join(' ')
  if (!query) { console.error('usage: node retrieve.mjs "your query" [--k 8] [--type memory]'); process.exit(2) }
  retrieve(query, { topK, filter })
    .then(results => {
      if (results.length === 0) { console.log('(no results — run reindex.mjs first)'); return }
      console.log(`\nTop ${results.length} for: "${query}"\n${'─'.repeat(60)}`)
      for (const r of results) console.log(`${String(r.score).padEnd(7)} ${r.source_type.padEnd(8)} ${r.heading_path || r.title}\n        ${r.source_ref}`)
    })
    .catch(err => { console.error(`retrieve ERROR: ${err.message}`); process.exit(1) })
}
