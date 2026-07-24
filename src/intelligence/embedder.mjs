// Boldteq Intelligence — embedder abstraction.
// One interface, four backends, selected by env. Zero npm deps (global fetch + crypto).
//
//   INTEL_EMBED_PROVIDER = ollama (default) | voyage | openai | hash
//   ollama : free, local, REAL semantics — needs `ollama pull nomic-embed-text` (dim 768)
//   voyage : hosted (Anthropic's partner) — VOYAGE_API_KEY, model voyage-3 (dim 1024)
//   openai : hosted — OPENAI_API_KEY, model text-embedding-3-small (dim 1536)
//   hash   : deterministic lexical fallback (NO real semantics) — plumbing tests only
//
// embed(texts: string[]) → { vectors: number[][], provider, model, dim }

import crypto from 'node:crypto'

const PROVIDER = (process.env.INTEL_EMBED_PROVIDER || (process.env.VOYAGE_API_KEY ? 'voyage' : process.env.OPENAI_API_KEY ? 'openai' : 'ollama')).toLowerCase()
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.INTEL_OLLAMA_MODEL || 'nomic-embed-text'
const VOYAGE_MODEL = process.env.INTEL_VOYAGE_MODEL || 'voyage-3'
const OPENAI_MODEL = process.env.INTEL_OPENAI_MODEL || 'text-embedding-3-small'
const HASH_DIM = 512
const BATCH = Number.parseInt(process.env.INTEL_EMBED_BATCH || '64', 10)

function l2normalize(v) {
  let s = 0
  for (const x of v) s += x * x
  const n = Math.sqrt(s) || 1
  return v.map(x => x / n)
}

// deterministic bag-of-tokens hashed into HASH_DIM dims (weak lexical signal; tests only)
function hashEmbed(text) {
  const v = new Array(HASH_DIM).fill(0)
  for (const tok of String(text).toLowerCase().match(/[a-z0-9]{2,}/g) || []) {
    const h = crypto.createHash('md5').update(tok).digest()
    const idx = ((h[0] << 8) | h[1]) % HASH_DIM
    v[idx] += 1
  }
  return l2normalize(v)
}

async function ollamaEmbed(texts) {
  const vectors = []
  // newer ollama: POST /api/embed { model, input: [...] }; fall back to /api/embeddings per-text
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, input: texts }),
    })
    if (res.ok) {
      const j = await res.json()
      if (Array.isArray(j.embeddings)) return j.embeddings.map(l2normalize)
    }
  } catch { /* fall through to per-text */ }
  for (const t of texts) {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: t }),
    })
    if (!res.ok) throw new Error(`ollama embeddings HTTP ${res.status} — is ollama running + '${OLLAMA_MODEL}' pulled? (ollama pull ${OLLAMA_MODEL})`)
    const j = await res.json()
    vectors.push(l2normalize(j.embedding))
  }
  return vectors
}

async function hostedEmbed(texts, { url, key, model, keyName }) {
  if (!key) throw new Error(`${keyName} not set (required for INTEL_EMBED_PROVIDER=${PROVIDER})`)
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: texts }),
  })
  if (!res.ok) throw new Error(`${PROVIDER} embeddings HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const j = await res.json()
  // both voyage + openai return { data: [{ embedding, index }] }
  return j.data.sort((a, b) => a.index - b.index).map(d => l2normalize(d.embedding))
}

async function embedBatch(texts) {
  switch (PROVIDER) {
    case 'ollama': return ollamaEmbed(texts)
    case 'voyage': return hostedEmbed(texts, { url: 'https://api.voyageai.com/v1/embeddings', key: process.env.VOYAGE_API_KEY, model: VOYAGE_MODEL, keyName: 'VOYAGE_API_KEY' })
    case 'openai': return hostedEmbed(texts, { url: 'https://api.openai.com/v1/embeddings', key: process.env.OPENAI_API_KEY, model: OPENAI_MODEL, keyName: 'OPENAI_API_KEY' })
    case 'hash': return texts.map(hashEmbed)
    default: throw new Error(`unknown INTEL_EMBED_PROVIDER: ${PROVIDER}`)
  }
}

export const embedderInfo = () => ({
  provider: PROVIDER,
  model: PROVIDER === 'ollama' ? OLLAMA_MODEL : PROVIDER === 'voyage' ? VOYAGE_MODEL : PROVIDER === 'openai' ? OPENAI_MODEL : 'hash',
})

// embed an array of texts → array of unit vectors (batched)
export async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return { vectors: [], dim: 0, ...embedderInfo() }
  const vectors = []
  for (let i = 0; i < texts.length; i += BATCH) {
    vectors.push(...await embedBatch(texts.slice(i, i + BATCH)))
  }
  return { vectors, dim: vectors[0]?.length || 0, ...embedderInfo() }
}

export async function embedOne(text) {
  const { vectors, dim, provider, model } = await embed([text])
  return { vector: vectors[0], dim, provider, model }
}

// ── NON-THROWING embed for the LIVE paths (retrieve / capture) — the Ollama SPOF fix ──────────────
// When the embedder is down (Ollama not running, key missing, HTTP error) embed() throws, which today
// crashes memory_search and aborts a capture. These return { ok:false, unavailable:true, reason }
// instead, so the caller can DEGRADE HONESTLY:
//   • retrieve → return EMPTY (agents fall back to the static packs) — never a fabricated ranking.
//   • capture  → keep the durable append-only log, defer the vector to the next reindex.
// CRITICAL: a down embedder must NEVER silently fall back to a DIFFERENT provider/dim (hash is 512-d,
// ollama 768-d) — mixing dims in one store makes every cosine meaningless. Degrade, don't substitute.
export async function embedSafe(texts) {
  try { const r = await embed(texts); return { ok: true, ...r } }
  catch (e) { return { ok: false, unavailable: true, reason: e && e.message ? e.message : String(e), ...embedderInfo() } }
}
export async function embedOneSafe(text) {
  const r = await embedSafe([text])
  return r.ok ? { ok: true, vector: r.vectors[0], dim: r.dim, provider: r.provider, model: r.model } : r
}
