// Boldteq Intelligence — semantic retrieval over the brain.
//   import { retrieve } from './retrieve.mjs'
//   retrieve("shopify PDP metafield binding", { topK, filter:{source_type, niche, quality, maxAgeDays, excludeSuperseded} })
// CLI: node src/intelligence/retrieve.mjs "query" [--k 8] [--type memory|agent|...] [--fresh DAYS] [--quality high] [--no-superseded]
//
// Ranking is salience-weighted in the store (Phase D.2): final = cosine × recency ×
// origin × verified × confidence × superseded. retrieve() surfaces both the raw
// `cosine` and the blended `score`, plus provenance, so callers (and the Brain UI)
// can see WHY something ranked — and detectConflicts() flags ⚠ contradictory hits.

import os from 'node:os'
import { pathToFileURL } from 'node:url'
import { embedOne, embedderInfo } from './embedder.mjs'
import { getStore } from './store.mjs'

const HOME = os.homedir()
const short = (ref) => (typeof ref === 'string' ? ref.replace(HOME, '~') : ref)
const round = (n, d = 4) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n)

// BRAIN-2 (2026-07-23) — the query side had no guard at all.
// reindex.mjs detects a changed embedder and forces a full re-embed, but only when it RUNS. Between a
// provider change (or an Ollama outage that pushes someone to INTEL_EMBED_PROVIDER=hash to unblock)
// and the next reindex, every query is embedded with one model and compared against an index built by
// another — so `memory_search` returns confidently-ranked nonsense and nothing says a word. Recall
// degrading silently is the exact failure this backlog keeps finding; make it announce itself.
//
// PURE so it can be tested without an index or a running Ollama.
export function embedderMismatch(manifest, current, queryDim) {
  if (!manifest) return null // no manifest (e.g. the supabase store) — nothing to compare against
  const deltas = []
  if (manifest.provider && current.provider && manifest.provider !== current.provider) {
    deltas.push(`provider ${manifest.provider} → ${current.provider}`)
  }
  if (manifest.model && current.model && manifest.model !== current.model) {
    deltas.push(`model ${manifest.model} → ${current.model}`)
  }
  // A dim mismatch is not a degradation, it is a category error: cosine across different-length
  // vectors is meaningless, so returning ANY ranking would be fabricating a result.
  const dimMismatch = Number.isFinite(manifest.dim) && Number.isFinite(queryDim)
    && manifest.dim > 0 && queryDim > 0 && manifest.dim !== queryDim
  if (dimMismatch) deltas.push(`dim ${manifest.dim} → ${queryDim}`)
  if (!deltas.length) return null
  return { fatal: dimMismatch, detail: deltas.join(', ') }
}

// What the index was built with vs what queries use now — for the Brain UI / a health check.
// Provider+model only: the query dim is not knowable without actually embedding something, so passing
// the manifest's own dim here would compare it to itself and report `fatal:false` every time — a
// reassuring-looking field that can never fire. retrieve() does the real dim check per query.
export function indexHealth() {
  const manifest = getStore().readManifest?.() || null
  const current = embedderInfo()
  const mismatch = embedderMismatch(manifest, current, null)
  return {
    ok: !mismatch,
    current,
    manifest: manifest && { provider: manifest.provider, model: manifest.model, dim: manifest.dim, count: manifest.count, updated_at: manifest.updated_at },
    mismatch: mismatch && { detail: mismatch.detail, dimCheckedAtQueryTime: true },
  }
}

let warned = ''
export async function retrieve(query, { topK = 8, filter = {} } = {}) {
  if (!query || !query.trim()) return []
  const { vector, dim } = await embedOne(query)

  const mismatch = embedderMismatch(getStore().readManifest?.(), embedderInfo(), dim)
  if (mismatch) {
    const msg = `[intel] index/embedder MISMATCH (${mismatch.detail}) — this index was built with a `
      + 'different embedder, so similarity scores are not meaningful. Run: node src/intelligence/reindex.mjs --full'
    if (mismatch.fatal) throw new Error(msg) // refuse rather than return a confident-looking ranking
    if (warned !== mismatch.detail) { warned = mismatch.detail; console.warn(msg) }
  }

  const hits = await getStore().search(vector, { topK, filter })
  return hits.map(h => {
    const m = h.record.metadata || {}
    return {
      id: h.record.id,
      score: round(h.score),          // blended cosine × salience (rank order)
      cosine: round(h.cosine ?? h.score), // raw semantic similarity
      salience: round(h.salience ?? 1, 3),
      source_type: h.record.source_type,
      source_ref: short(h.record.source_ref),
      title: m.title || h.record.title,
      heading_path: m.heading_path || h.record.heading_path,
      text: h.record.chunk_text,
      origin: m.origin || null,
      confidence: Number.isFinite(Number(m.confidence)) ? Number(m.confidence) : null,
      verified: m.verified === true,
      superseded: Boolean(m.supersededBy),
      supersededBy: m.supersededBy || null,
      conflictsWith: Array.isArray(m.conflictsWith) ? m.conflictsWith : [],
      updated_at: h.record.updated_at || null,
    }
  })
}

// Surface ⚠ conflicting memory: among the returned hits, find pairs where one
// explicitly conflictsWith/supersedes the other, or a stale (superseded) chunk is
// co-retrieved with the fresher belief that replaced it. Pure over the result list.
export function detectConflicts(results) {
  const byId = new Map(results.map(r => [r.id, r]))
  const seen = new Set(); const conflicts = []
  const add = (a, b, reason) => {
    const key = [a.id, b.id].sort().join('|')
    if (seen.has(key)) return
    seen.add(key); conflicts.push({ a: a.id, b: b.id, reason, kept: a, dropped: b })
  }
  for (const r of results) {
    if (r.supersededBy && byId.has(r.supersededBy)) add(byId.get(r.supersededBy), r, 'superseded') // fresher kept
    for (const cid of r.conflictsWith) if (byId.has(cid)) add(r, byId.get(cid), 'conflict')
  }
  return conflicts
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
    else if (args[i] === '--fresh') filter.maxAgeDays = Number.parseInt(args[++i], 10)
    else if (args[i] === '--quality') filter.quality = args[++i]
    else if (args[i] === '--no-superseded') filter.excludeSuperseded = true
    else q.push(args[i])
  }
  const query = q.join(' ')
  if (!query) { console.error('usage: node retrieve.mjs "your query" [--k 8] [--type memory] [--fresh DAYS] [--quality high] [--no-superseded]'); process.exit(2) }
  retrieve(query, { topK, filter })
    .then(results => {
      if (results.length === 0) { console.log('(no results — run reindex.mjs first)'); return }
      console.log(`\nTop ${results.length} for: "${query}"\n${'─'.repeat(60)}`)
      for (const r of results) {
        const tags = [r.verified ? '✓verified' : null, r.superseded ? '⚠superseded' : null, r.origin].filter(Boolean).join(' ')
        console.log(`${String(r.score).padEnd(7)} cos=${String(r.cosine).padEnd(7)} ${r.source_type.padEnd(8)} ${r.heading_path || r.title}${tags ? `  [${tags}]` : ''}\n        ${r.source_ref}`)
      }
      const conflicts = detectConflicts(results)
      if (conflicts.length) {
        console.log(`\n⚠ ${conflicts.length} conflicting memor${conflicts.length === 1 ? 'y' : 'ies'}:`)
        for (const c of conflicts) console.log(`   ${c.reason}: ${c.kept.id} (kept) vs ${c.dropped.id}`)
      }
    })
    .catch(err => { console.error(`retrieve ERROR: ${err.message}`); process.exit(1) })
}
