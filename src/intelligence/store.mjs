// Boldteq Intelligence — vector store abstraction.
//   INTEL_STORE = local (default) | supabase
//   local    : data/intel/kb_chunks.jsonl + manifest.json — zero deps, brute-force cosine in JS.
//              Fine to ~50k chunks on a dev PC; the whole 149k-line brain is ~5k chunks.
//   supabase : Supabase pgvector (production/scale) — needs SUPABASE_URL + SUPABASE_SERVICE_KEY
//              and the migration in db/migrations (kb_chunks table + match_kb_chunks RPC).
//
// Record: { id, source_type, source_ref, chunk_index, chunk_text, embedding, metadata, content_hash, updated_at }
// Embeddings are L2-normalized → cosine similarity == dot product.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STORE = (process.env.INTEL_STORE || 'local').toLowerCase()
const DATA_DIR = process.env.INTEL_DATA_DIR || path.resolve(HERE, '..', '..', 'data', 'intel')

function dot(a, b) { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s }
// embeddings on disk = base64(Float32 buffer) — 4× smaller than JSON floats, fast to decode.
const encVec = (arr) => Buffer.from(Float32Array.from(arr).buffer).toString('base64')
const decVec = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) }

// ── local JSONL store ───────────────────────────────────────────────────────
// In memory: id → { ...meta, vec: Float32Array }. On disk: JSONL with emb: base64.
// Bulk mode (reindex) buffers all upserts and writes ONCE via flush() — avoids the
// O(n²) full-file rewrite per source file that the naive per-write persist caused.
class LocalStore {
  constructor() {
    this.file = path.join(DATA_DIR, 'kb_chunks.jsonl')
    this.manifestFile = path.join(DATA_DIR, 'manifest.json')
    this.records = null // lazy
    this.bulk = false
    this.dirty = false
  }
  _load() {
    if (this.records) return this.records
    this.records = new Map()
    try {
      for (const line of fs.readFileSync(this.file, 'utf-8').split('\n')) {
        if (!line.trim()) continue
        const r = JSON.parse(line)
        r.vec = decVec(r.emb); delete r.emb
        this.records.set(r.id, r)
      }
    } catch { /* no index yet */ }
    return this.records
  }
  _persist() {
    if (this.bulk) { this.dirty = true; return } // defer during bulk reindex
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const tmp = `${this.file}.tmp`
    const fd = fs.openSync(tmp, 'w') // synchronous + streaming: memory-light, no exit race, atomic via rename
    try {
      for (const r of this.records.values()) {
        const { vec, ...rest } = r
        fs.writeSync(fd, JSON.stringify({ ...rest, emb: encVec(vec) }) + '\n')
      }
    } finally { fs.closeSync(fd) }
    fs.renameSync(tmp, this.file)
    this.dirty = false
  }
  beginBulk() { this._load(); this.bulk = true }
  flush() { this.bulk = false; if (this.dirty) this._persist() }
  _toRec(r) { return { ...r, vec: r.embedding instanceof Float32Array ? r.embedding : Float32Array.from(r.embedding), embedding: undefined } }
  sourceHash(sourceRef) { const recs = this._load(); for (const r of recs.values()) if (r.source_ref === sourceRef) return r.content_hash; return null }
  replaceSource(sourceRef, newRecords) {
    const recs = this._load()
    for (const [id, r] of recs) if (r.source_ref === sourceRef) recs.delete(id)
    for (const r of newRecords) { const rec = this._toRec(r); delete rec.embedding; recs.set(rec.id, rec) }
    this._persist()
  }
  upsert(records) { const recs = this._load(); for (const r of records) { const rec = this._toRec(r); delete rec.embedding; recs.set(rec.id, rec) } this._persist() }
  // prune ONLY file-sourced chunks whose file is gone. NEVER touch captured knowledge
  // (lesson/bug/decision/golden) — those have non-file source_refs and must survive reindex.
  deleteMissing(presentSourceRefs) {
    const FILE_TYPES = new Set(['memory', 'agent', 'project'])
    const recs = this._load(); const keep = new Set(presentSourceRefs); let removed = 0
    for (const [id, r] of recs) if (FILE_TYPES.has(r.source_type) && !keep.has(r.source_ref)) { recs.delete(id); removed++ }
    if (removed) this._persist(); return removed
  }
  async search(queryVec, { topK = 8, filter = {} } = {}) {
    const recs = this._load(); const q = queryVec instanceof Float32Array ? queryVec : Float32Array.from(queryVec)
    const scored = []
    for (const r of recs.values()) {
      if (filter.source_type && r.source_type !== filter.source_type) continue
      if (filter.niche && r.metadata?.niche !== filter.niche) continue
      scored.push({ score: dot(q, r.vec), record: r })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }
  stats() { const recs = this._load(); const byType = {}; for (const r of recs.values()) byType[r.source_type] = (byType[r.source_type] || 0) + 1; return { total: recs.size, byType, file: this.file } }
  writeManifest(m) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(this.manifestFile, JSON.stringify(m, null, 2)) }
  readManifest() { try { return JSON.parse(fs.readFileSync(this.manifestFile, 'utf-8')) } catch { return null } }
}

// ── Supabase pgvector store (production) ─────────────────────────────────────
class SupabaseStore {
  constructor() {
    this.url = process.env.SUPABASE_URL
    this.key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!this.url || !this.key) throw new Error('INTEL_STORE=supabase needs SUPABASE_URL + SUPABASE_SERVICE_KEY (provision the agent-ops project + run db/migrations/00X_intelligence.sql first)')
    this.rest = `${this.url.replace(/\/$/, '')}/rest/v1`
    this.headers = { apikey: this.key, authorization: `Bearer ${this.key}`, 'content-type': 'application/json' }
  }
  async sourceHash(sourceRef) {
    const res = await fetch(`${this.rest}/kb_chunks?select=content_hash&source_ref=eq.${encodeURIComponent(sourceRef)}&limit=1`, { headers: this.headers })
    if (!res.ok) return null
    const rows = await res.json(); return rows[0]?.content_hash ?? null
  }
  async replaceSource(sourceRef, newRecords) {
    await fetch(`${this.rest}/kb_chunks?source_ref=eq.${encodeURIComponent(sourceRef)}`, { method: 'DELETE', headers: this.headers })
    if (newRecords.length) await this.upsert(newRecords)
  }
  async upsert(records) {
    const res = await fetch(`${this.rest}/kb_chunks`, { method: 'POST', headers: { ...this.headers, prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(records) })
    if (!res.ok) throw new Error(`supabase upsert HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  async search(queryVec, { topK = 8, filter = {} } = {}) {
    // match_kb_chunks(query_embedding vector, match_count int, filter jsonb) — defined in the migration
    const res = await fetch(`${this.rest}/rpc/match_kb_chunks`, { method: 'POST', headers: this.headers, body: JSON.stringify({ query_embedding: queryVec, match_count: topK, filter }) })
    if (!res.ok) throw new Error(`supabase match_kb_chunks HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()).map(row => ({ score: row.similarity, record: row }))
  }
  async stats() { const res = await fetch(`${this.rest}/kb_chunks?select=count`, { headers: { ...this.headers, prefer: 'count=exact' } }); return { total: res.headers.get('content-range')?.split('/')?.[1] ?? '?', store: 'supabase' } }
  writeManifest() { /* manifest lives in the table for supabase */ }
  readManifest() { return null }
}

let _store
export function getStore() {
  if (_store) return _store
  _store = STORE === 'supabase' ? new SupabaseStore() : new LocalStore()
  return _store
}
export const storeKind = () => STORE
