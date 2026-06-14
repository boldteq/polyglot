// Boldteq Intelligence — capture institutional knowledge (lessons/bugs/decisions/golden).
// Writes a durable JSONL record AND embeds it into the vector store immediately, so a
// captured lesson is retrievable within the same minute (the compounding loop).
//   captureItem('lesson', { domain, problem, root_cause, solution, prevention })

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { embedOne } from './embedder.mjs'
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

export async function captureItem(type, fields) {
  const id = `${type}:${crypto.randomUUID().slice(0, 8)}`
  const created_at = new Date().toISOString()
  const text = render(type, fields)

  // 1) durable append-only log
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.appendFileSync(path.join(DATA_DIR, `${type}s.jsonl`), JSON.stringify({ id, type, created_at, ...fields }) + '\n')

  // 2) embed + index for immediate retrieval
  const { vector } = await embedOne(text)
  await getStore().upsert([{
    id, source_type: type, source_ref: id, chunk_index: 0,
    chunk_text: text, embedding: vector,
    metadata: { ...fields, title: titleOf(type, fields), captured: true }, content_hash: id, updated_at: created_at,
  }])
  return { id, type, created_at }
}

// read recent captured items of a type (for lookups that aren't semantic)
export function recentItems(type, limit = 20) {
  try {
    const lines = fs.readFileSync(path.join(DATA_DIR, `${type}s.jsonl`), 'utf-8').trim().split('\n').filter(Boolean)
    return lines.slice(-limit).map(l => JSON.parse(l)).reverse()
  } catch { return [] }
}
