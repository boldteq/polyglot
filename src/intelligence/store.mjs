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

// ── Salience ranking (Phase D.2) ─────────────────────────────────────────────
// Final rank = cosine × recency × origin × verified × confidence × superseded.
// Salience RE-RANKS within similar-relevance hits — the cosine spread still
// dominates, so an irrelevant chunk never floats up, but a fresh + human-verified
// lesson edges out a stale, unverified one for the same query. All knobs env-tunable.
function numEnv(k, d) { const v = Number(process.env[k]); return Number.isFinite(v) ? v : d }
const SAL = {
  recencyFloor: numEnv('INTEL_RECENCY_FLOOR', 0.7),       // oldest items keep ≥70% of score
  recencyTauDays: numEnv('INTEL_RECENCY_TAU_DAYS', 180),  // ~6-month e-folding decay
  verifiedBoost: numEnv('INTEL_VERIFIED_BOOST', 1.15),
  supersededPenalty: numEnv('INTEL_SUPERSEDED_PENALTY', 0.35), // down-rank hard, never delete
  decayPenalty: numEnv('INTEL_DECAY_PENALTY', 0.5),       // Phase E hygiene flag (reversible; retired-agent/orphan)
  originBoost: { review: 1.15, agent: 1.0, direct: 1.0, 'vscode-digest': 0.95, trainer: 1.0 },
}
function recencyFactor(updatedAt) {
  if (!updatedAt) return 1 // legacy/unknown → neutral (never bury un-stamped wisdom)
  const t = Date.parse(updatedAt); if (!Number.isFinite(t)) return 1
  const ageDays = Math.max(0, (Date.now() - t) / 86400000)
  return SAL.recencyFloor + (1 - SAL.recencyFloor) * Math.exp(-ageDays / SAL.recencyTauDays)
}
// Phase E — decay sidecar: the source_refs the monthly hygiene pass has down-weighted
// (e.g. a retired agent's instructions). Kept OUT of chunk metadata on purpose: reindex
// re-embeds file sources and would wipe per-chunk metadata, but the sidecar survives.
// Reversible (un-flag = drop from the list) and never deletes anything. Captured items
// (never reindexed) can also carry an in-metadata `decayFlagged` flag — both are honored.
let _decaySet = null
const DECAY_FILE = path.join(DATA_DIR, 'decay-list.json')
function loadDecaySet() {
  if (_decaySet) return _decaySet
  try { _decaySet = new Set(JSON.parse(fs.readFileSync(DECAY_FILE, 'utf-8')).sourceRefs || []) }
  catch { _decaySet = new Set() }
  return _decaySet
}
export function setDecayList(sourceRefs, meta = {}) {
  const refs = [...new Set(sourceRefs)]
  _decaySet = new Set(refs)
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DECAY_FILE, JSON.stringify({ sourceRefs: refs, ...meta, updatedAt: new Date().toISOString() }, null, 2)) }
  catch (err) { console.warn('[store] setDecayList persist failed:', err.message) }
  return refs.length
}
export function getDecayList() { try { return JSON.parse(fs.readFileSync(DECAY_FILE, 'utf-8')) } catch { return { sourceRefs: [] } } }

// salience multiplier applied to cosine (≈ 0.18 … 1.6)
function salienceFor(record) {
  const m = record.metadata || {}
  let s = recencyFactor(record.updated_at)
  s *= (SAL.originBoost[m.origin] ?? 1)
  if (m.verified === true) s *= SAL.verifiedBoost
  const conf = Number(m.confidence)
  if (Number.isFinite(conf)) s *= (0.85 + 0.15 * Math.max(0, Math.min(1, conf)))
  if (m.supersededBy) s *= SAL.supersededPenalty
  if (m.decayFlagged || loadDecaySet().has(record.source_ref)) s *= SAL.decayPenalty
  return s
}
// Phase E — index freshness over a light record list (pure). A silently-failing
// reindex shows up as a creeping oldest/avg age; the Brain tab renders this.
export function freshnessStats(records, now = Date.now()) {
  const DAY = 86400000
  const buckets = { '<=7d': 0, '<=30d': 0, '<=90d': 0, '<=180d': 0, '>180d': 0, undated: 0 }
  let oldest = null, newest = null, sum = 0, dated = 0
  for (const r of records) {
    const t = Date.parse(r.updated_at)
    if (!Number.isFinite(t)) { buckets.undated++; continue }
    const age = (now - t) / DAY; dated++; sum += age
    if (oldest === null || t < oldest) oldest = t
    if (newest === null || t > newest) newest = t
    if (age <= 7) buckets['<=7d']++
    else if (age <= 30) buckets['<=30d']++
    else if (age <= 90) buckets['<=90d']++
    else if (age <= 180) buckets['<=180d']++
    else buckets['>180d']++
  }
  return {
    total: records.length, dated,
    oldestAgeDays: oldest ? Math.round((now - oldest) / DAY) : null,
    newestAgeDays: newest ? Math.round((now - newest) / DAY) : null,
    avgAgeDays: dated ? Math.round(sum / dated) : null,
    ageBuckets: buckets,
  }
}
// shared filter predicate (local + supabase client-side) — returns false to drop a record
function passesFilters(r, filter, now) {
  if (filter.source_type && r.source_type !== filter.source_type) return false
  if (filter.niche && r.metadata?.niche !== filter.niche) return false
  if (filter.excludeSuperseded && r.metadata?.supersededBy) return false
  if (filter.quality === 'high' && !(r.metadata?.verified === true || Number(r.metadata?.confidence) >= 0.8)) return false
  if (Number.isFinite(filter.maxAgeDays)) {
    const t = Date.parse(r.updated_at)
    if (Number.isFinite(t) && (now - t) > filter.maxAgeDays * 86400000) return false
  }
  return true
}

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
  // TRIPWIRE: a partial/glitched enumeration would make present files look deleted and mass-prune
  // them (the silent loss that wiped the FAQ brain). Refuse to prune when an implausibly large
  // fraction of indexed file-sources would vanish in one pass — almost always an enumeration glitch,
  // not real deletions. A genuine bulk delete can be reconciled with `reindex --full`.
  deleteMissing(presentSourceRefs) {
    const FILE_TYPES = new Set(['memory', 'agent', 'project'])
    const recs = this._load(); const keep = new Set(presentSourceRefs)
    const haveRefs = new Set(); const doomed = []
    for (const [id, r] of recs) {
      if (!FILE_TYPES.has(r.source_type)) continue
      haveRefs.add(r.source_ref)
      if (!keep.has(r.source_ref)) doomed.push(id)
    }
    const doomedRefs = new Set(doomed.map((id) => recs.get(id).source_ref))
    const refFrac = haveRefs.size ? doomedRefs.size / haveRefs.size : 0
    if (haveRefs.size >= 20 && refFrac > 0.20) {
      console.error(`[store] deleteMissing REFUSED — would prune ${doomedRefs.size}/${haveRefs.size} file-sources (${(refFrac * 100).toFixed(0)}%); present=${keep.size} refs. Looks like an incomplete enumeration, not real deletions. No deletion — run \`reindex --full\` if those files were truly removed.`)
      return 0
    }
    for (const id of doomed) recs.delete(id)
    if (doomed.length) this._persist()
    return doomed.length
  }
  async search(queryVec, { topK = 8, filter = {} } = {}) {
    const recs = this._load(); const q = queryVec instanceof Float32Array ? queryVec : Float32Array.from(queryVec)
    const now = Date.now()
    const scored = []
    for (const r of recs.values()) {
      if (!passesFilters(r, filter, now)) continue
      const cosine = dot(q, r.vec)
      const salience = salienceFor(r)
      scored.push({ score: cosine * salience, cosine, salience, record: r }) // score = salience-adjusted rank
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }
  // merge a metadata patch into one record without re-embedding (belief revision /
  // supersede / verify). Returns true if the record existed.
  patchMetadata(id, patch) {
    const recs = this._load(); const r = recs.get(id)
    if (!r) return false
    r.metadata = { ...(r.metadata || {}), ...patch }
    this._persist()
    return true
  }
  // batch metadata patch — ONE persist for the whole set (hygiene flags many chunks at once)
  patchMetadataMany(updates) {
    const recs = this._load(); let n = 0
    for (const u of updates) { const r = recs.get(u.id); if (!r) continue; r.metadata = { ...(r.metadata || {}), ...u.patch }; n++ }
    if (n) this._persist(); return n
  }
  // light record list (no vec/embedding) for hygiene + freshness — never leaks vectors
  allRecords() {
    const recs = this._load(); const out = []
    for (const r of recs.values()) out.push({ id: r.id, source_type: r.source_type, source_ref: r.source_ref, chunk_index: r.chunk_index, metadata: r.metadata, content_hash: r.content_hash, updated_at: r.updated_at })
    return out
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
    // match_kb_chunks(query_embedding vector, match_count int, filter jsonb) — defined in the migration.
    // Fetch a wider pool (server ranks by cosine) then apply salience + the client-side
    // filters (quality/maxAge/excludeSuperseded) and slice to topK — parity with LocalStore.
    const serverFilter = { source_type: filter.source_type, niche: filter.niche }
    const res = await fetch(`${this.rest}/rpc/match_kb_chunks`, { method: 'POST', headers: this.headers, body: JSON.stringify({ query_embedding: queryVec, match_count: topK * 3, filter: serverFilter }) })
    if (!res.ok) throw new Error(`supabase match_kb_chunks HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const now = Date.now()
    return (await res.json())
      .filter(row => passesFilters(row, filter, now))
      .map(row => { const cosine = row.similarity, salience = salienceFor(row); return { score: cosine * salience, cosine, salience, record: row } })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }
  async patchMetadata(id, patch) {
    const g = await fetch(`${this.rest}/kb_chunks?select=metadata&id=eq.${encodeURIComponent(id)}&limit=1`, { headers: this.headers })
    const cur = (g.ok ? (await g.json())[0]?.metadata : null) || {}
    const res = await fetch(`${this.rest}/kb_chunks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: this.headers, body: JSON.stringify({ metadata: { ...cur, ...patch } }) })
    return res.ok
  }
  async patchMetadataMany(updates) { let n = 0; for (const u of updates) { if (await this.patchMetadata(u.id, u.patch)) n++ } return n }
  async allRecords() {
    const out = []; const page = 1000
    for (let from = 0; ; from += page) {
      const res = await fetch(`${this.rest}/kb_chunks?select=id,source_type,source_ref,chunk_index,metadata,content_hash,updated_at`, { headers: { ...this.headers, range: `${from}-${from + page - 1}`, 'range-unit': 'items' } })
      if (!res.ok) break
      const rows = await res.json(); out.push(...rows)
      if (rows.length < page) break
    }
    return out
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
