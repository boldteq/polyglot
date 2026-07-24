// Boldteq Intelligence — capture institutional knowledge (lessons/bugs/decisions/golden).
// Writes a durable JSONL record AND embeds it into the vector store immediately, so a
// captured lesson is retrievable within the same minute (the compounding loop).
//   captureItem('lesson', { domain, problem, root_cause, solution, prevention })

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { embedOneSafe } from './embedder.mjs'
import { getStore } from './store.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.INTEL_DATA_DIR || path.resolve(HERE, '..', '..', 'data', 'intel')

// the human-readable text we embed + show — one block per item type
function render(type, f) {
  if (type === 'lesson') return `LESSON (${f.domain || 'general'}): ${f.problem}\nRoot cause: ${f.root_cause}\nSolution: ${f.solution}\nPrevention: ${f.prevention || '—'}`
  if (type === 'bug') return `BUG [${f.severity || 'S3'}]: ${f.symptom}\nRoot cause: ${f.root_cause}\nFix: ${f.fix}\nPrevention: ${f.prevention || '—'}`
  if (type === 'decision') return `DECISION (${f.scope || 'project'}): ${f.decision}\nSituation: ${f.situation}\nThinking: ${f.thinking || '—'}\nAlternatives: ${f.alternatives || '—'}\nOutcome: ${f.outcome || 'pending'}`
  if (type === 'golden') return `GOLDEN ${f.kind || 'work'} (${f.niche || 'any'}): ${f.title}\nWhy excellent: ${f.why_excellent}\nRef: ${f.ref || '—'}`
  return JSON.stringify(f)
}

const titleOf = (type, f) => ({
  lesson: `Lesson: ${f.problem}`, bug: `Bug: ${f.symptom}`,
  decision: `Decision: ${f.decision}`, golden: `Golden: ${f.title}`,
}[type] || type).slice(0, 100)

// ── Belief revision (Phase D.3) ──────────────────────────────────────────────
// A new lesson/bug/decision can REVISE an older one. We never delete: we mark the
// OLD record supersededBy=<newId> (heavily down-ranked at search) when the new item
// reads like a correction of a near-identical belief; softer overlaps are flagged
// conflictsWith (for the retrieve-time ⚠) or nearDuplicateOf (reinforcement).
function numEnv(k, d) { const v = Number(process.env[k]); return Number.isFinite(v) ? v : d }
const BELIEF_TYPES = new Set(['lesson', 'bug', 'decision']) // golden = exemplar, not a belief
const SIM = {
  conflict: numEnv('INTEL_CONFLICT_SIM', 0.82), // ≥ this + correction language → supersede; else flag
  dup: numEnv('INTEL_DUP_SIM', 0.93),           // ≥ this + no correction → reinforcement (near-dup)
}
// provenance defaults → drive salience (confidence/verified). opts can override.
const ORIGIN_DEFAULTS = {
  review: { confidence: 0.95, verified: true },          // human-approved in the Learning Inbox
  agent: { confidence: 0.85, verified: false },          // an agent captured it mid-build (MCP)
  direct: { confidence: 0.85, verified: false },         // programmatic / default
  'vscode-digest': { confidence: 0.70, verified: false },// auto-extracted from a session, unreviewed
}

export function looksLikeCorrection(text) {
  return /\b(never|don'?t|do not|instead|actually|was wrong|incorrect|correction|supersed|no longer|avoid|stop using|deprecat)\b/i.test(text || '')
}
function normalizeIds(x) {
  if (!x) return []
  return (Array.isArray(x) ? x : [x]).filter(v => typeof v === 'string' && v.trim())
}

// Returns { supersedes, conflictsWith, nearDuplicateOf } and side-effects the OTHER
// records' metadata: superseded olds get supersededBy=id; conflicting olds get THIS
// id added to their conflictsWith (BIDIRECTIONAL — a later read of either record must
// surface the ⚠, not just the newer one). Must run AFTER the new item is upserted so
// the neighbour search can see concurrent siblings (closes the asymmetric-relation race).
async function reviseBeliefs({ id, type, text, vector, explicitSupersedes }) {
  const supersedes = new Set(normalizeIds(explicitSupersedes))
  const conflicts = new Map() // otherId → its EXISTING conflictsWith[] (so the back-patch merges, never clobbers)
  const nearDuplicateOf = new Set()
  if (BELIEF_TYPES.has(type)) {
    let neighbors = []
    // topK 5: the new item is now in the store and self-skipped, so ask for one extra.
    try { neighbors = await getStore().search(vector, { topK: 5 }) } catch { neighbors = [] }
    const corr = looksLikeCorrection(text)
    for (const n of neighbors) {
      const rec = n.record; if (!rec || rec.id === id || !BELIEF_TYPES.has(rec.source_type)) continue
      const cos = Number.isFinite(n.cosine) ? n.cosine : n.score
      if (cos < SIM.conflict) continue
      if (corr) supersedes.add(rec.id)                    // high-sim + correction → revise it
      else if (cos >= SIM.dup) nearDuplicateOf.add(rec.id)// same belief again → reinforcement
      else conflicts.set(rec.id, Array.isArray(rec.metadata?.conflictsWith) ? rec.metadata.conflictsWith : []) // divergent → flag both ways
    }
  }
  const store = getStore(); const now = new Date().toISOString()
  for (const oldId of supersedes) {
    if (conflicts.has(oldId)) conflicts.delete(oldId) // supersede dominates a soft conflict for the same pair
    try { await store.patchMetadata(oldId, { supersededBy: id, supersededAt: now }) } catch { /* best-effort */ }
  }
  for (const [otherId, existing] of conflicts) {
    try { await store.patchMetadata(otherId, { conflictsWith: [...new Set([...existing, id])] }) } catch { /* best-effort */ }
  }
  return { supersedes: [...supersedes], conflictsWith: [...conflicts.keys()], nearDuplicateOf: [...nearDuplicateOf] }
}

// `origin` records WHERE the capture came from (agent direct, vscode-digest,
// review approve, …) so the Learning Overview can show an accurate by-source
// breakdown. Legacy records without it are treated as 'direct'. `opts` may carry
// { supersedes, confidence, verified } to override provenance/belief defaults.
export async function captureItem(type, fields, origin = 'direct', opts = {}) {
  const id = `${type}:${crypto.randomUUID().slice(0, 8)}`
  const created_at = new Date().toISOString()
  const text = render(type, fields)
  const od = ORIGIN_DEFAULTS[origin] || ORIGIN_DEFAULTS.direct
  const confidence = Number.isFinite(opts.confidence) ? opts.confidence : od.confidence
  const verified = typeof opts.verified === 'boolean' ? opts.verified : od.verified

  // 1) durable append-only log (now carries provenance)
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.appendFileSync(path.join(DATA_DIR, `${type}s.jsonl`), JSON.stringify({ id, type, created_at, origin, confidence, verified, ...fields }) + '\n')

  // 2) embed the new item — Ollama-SPOF degradation: if the embedder is down the DURABLE log above
  //    already holds the item, so we do NOT crash the capture. We skip the vector upsert (never write a
  //    null/mismatched-dim vector — that would corrupt the store) and defer: the next reindex re-embeds
  //    it from the now-changed source .jsonl. Nothing is lost; the vector just catches up.
  const emb = await embedOneSafe(text)
  if (!emb.ok) {
    console.warn(`[intel] capture ${id}: embedder UNAVAILABLE (${emb.reason}) — saved to ${type}s.jsonl; vector deferred to the next reindex (run: node src/intelligence/reindex.mjs). Store not corrupted.`)
    return { id, type, created_at, deferred: true, reason: emb.reason, supersedes: [], conflictsWith: [], nearDuplicateOf: [] }
  }
  const { vector } = emb

  // 3) index the new item FIRST — so a concurrent capture of near-identical text can
  //    SEE this one in its own neighbour search. With the old order (revise→upsert) two
  //    simultaneous captures each searched a store missing the other → asymmetric /
  //    lost supersede+conflict edges. LocalStore writes are synchronous (atomic between
  //    awaits), so upsert-first + the bidirectional back-patch below converge cleanly.
  await getStore().upsert([{
    id, source_type: type, source_ref: id, chunk_index: 0,
    chunk_text: text, embedding: vector,
    metadata: { ...fields, title: titleOf(type, fields), captured: true, origin, confidence, verified },
    content_hash: id, updated_at: created_at,
  }])

  // 4) belief revision — now the neighbour search includes any concurrent sibling +
  //    back-patches the OTHER records (supersededBy / bidirectional conflictsWith).
  const revision = await reviseBeliefs({ id, type, text, vector, explicitSupersedes: opts.supersedes })

  // 5) stamp the relations onto THIS record too (merge, no re-embed). Skipped when empty.
  if (revision.supersedes.length || revision.conflictsWith.length || revision.nearDuplicateOf.length) {
    try {
      await getStore().patchMetadata(id, {
        ...(revision.supersedes.length ? { supersedes: revision.supersedes } : {}),
        ...(revision.conflictsWith.length ? { conflictsWith: revision.conflictsWith } : {}),
        ...(revision.nearDuplicateOf.length ? { nearDuplicateOf: revision.nearDuplicateOf } : {}),
      })
    } catch { /* best-effort — relation is also recoverable from the returned value */ }
  }
  return { id, type, created_at, ...revision }
}

// D2 (2026-07-24): DRAIN deferred captures into the vector store. A capture made while the embedder was
// down is saved to <type>s.jsonl but NOT embedded (line ~113) — and reindex.mjs only re-embeds
// memory/agent/project sources, so its "deferred to the next reindex" promise was NEVER kept for
// lesson/bug/decision/golden. That silent gap is the measured lesson lag (85 of 138 indexed). This drains
// it: every ledger item whose id is not already in the store gets embedded + upserted now. Idempotent
// (skips indexed ids) and Ollama-SPOF-safe (a still-down embedder just leaves the item deferred again).
export async function reembedCaptures({ log = () => {} } = {}) {
  const TYPES = ['lesson', 'bug', 'decision', 'golden']
  const store = getStore()
  const have = typeof store.ids === 'function' ? store.ids() : new Set()
  let embedded = 0, deferred = 0, already = 0
  for (const type of TYPES) {
    let lines = []
    try { lines = fs.readFileSync(path.join(DATA_DIR, `${type}s.jsonl`), 'utf-8').trim().split('\n').filter(Boolean) } catch { continue }
    for (const ln of lines) {
      let it; try { it = JSON.parse(ln) } catch { continue }
      if (!it.id) continue
      if (have.has(it.id)) { already += 1; continue } // already indexed — skip (idempotent)
      const text = render(type, it)
      const emb = await embedOneSafe(text)
      if (!emb.ok) { deferred += 1; continue } // embedder still down → stays deferred, never a bad vector
      await store.upsert([{
        id: it.id, source_type: type, source_ref: it.id, chunk_index: 0,
        chunk_text: text, embedding: emb.vector,
        metadata: { ...it, title: titleOf(type, it), captured: true, origin: it.origin || 'direct', confidence: it.confidence, verified: it.verified },
        content_hash: it.id, updated_at: it.created_at || new Date().toISOString(),
      }])
      have.add(it.id); embedded += 1
    }
  }
  log(`reembed-captures: +${embedded} embedded · ${already} already indexed · ${deferred} still deferred (embedder down)`)
  return { embedded, already, deferred }
}

// read recent captured items of a type (for lookups that aren't semantic)
export function recentItems(type, limit = 20) {
  try {
    const lines = fs.readFileSync(path.join(DATA_DIR, `${type}s.jsonl`), 'utf-8').trim().split('\n').filter(Boolean)
    return lines.slice(-limit).map(l => JSON.parse(l)).reverse()
  } catch { return [] }
}

// Aggregate stats over the WHOLE capture ledger (all 4 jsonl files) — the single
// source of truth for "how much we've learned". One pass, file-only, no embeddings.
export function captureStats() {
  const TYPES = ['lesson', 'bug', 'decision', 'golden']
  const now = Date.now()
  const DAY = 86400000
  const byType = { lesson: 0, bug: 0, decision: 0, golden: 0 }
  const byOrigin = {}
  let total = 0, last7d = 0, prev7d = 0
  // 8 weekly buckets, oldest → newest (index 7 = current week)
  const weekly = Array.from({ length: 8 }, (_, i) => ({
    weekStart: new Date(now - (7 - i) * 7 * DAY).toISOString().slice(0, 10), count: 0,
  }))
  for (const type of TYPES) {
    let lines = []
    try { lines = fs.readFileSync(path.join(DATA_DIR, `${type}s.jsonl`), 'utf-8').trim().split('\n').filter(Boolean) }
    catch { continue }
    for (const ln of lines) {
      let it
      try { it = JSON.parse(ln) } catch { continue }
      total += 1
      byType[type] += 1
      const origin = it.origin || 'direct'
      byOrigin[origin] = (byOrigin[origin] || 0) + 1
      const t = it.created_at ? new Date(it.created_at).getTime() : NaN
      if (Number.isFinite(t)) {
        const age = now - t
        if (age < 7 * DAY) last7d += 1
        else if (age < 14 * DAY) prev7d += 1
        const wk = Math.floor((now - t) / (7 * DAY))
        if (wk >= 0 && wk < 8) weekly[7 - wk].count += 1
      }
    }
  }
  return { total, byType, byOrigin, last7d, prev7d, weekly }
}
