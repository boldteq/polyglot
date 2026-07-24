#!/usr/bin/env node
// pack-brain — package the Boldteq agent brain as a VERSIONED, PINNABLE, VERIFIABLE artifact
// (roadmap Phase 4.1 / audit gap 5). Today agent files, rule-packs and the 35k-chunk vector store live
// only in ~/.claude + one repo on one Mac — the hard ceiling on "train the whole fleet at scale". This
// makes the brain a thing any machine/CI pulls to a pinned version, with a checksum manifest so a
// partial/corrupt pull FAILS LOUDLY (the delivery health-check the audit asked for) instead of silently
// stranding a stale brain.
//
// The artifact carries the audit's three legs together, so they can never drift apart on a pull:
//   agents/            the roster (.md with AUTOLEARN blocks)      ← ~/.claude/agents
//   rule-packs/        SWT distilled rules                          ← ~/.claude/memory/patterns/good/swt-rules
//   evals/golden-builds/ the benchmark travels WITH the brain       ← evals/golden-builds
//   embeddings/        the vector snapshot (no 35k re-embed on a new box, --with-embeddings)
//   MANIFEST.json      sha256 + counts of every file (the pin + integrity record)
//   .claude-plugin/plugin.json  the Claude-Code-plugin descriptor a marketplace pins
//
// Usage:
//   node scripts/pack-brain.mjs pack --out dist/boldteq-brain [--version <v>] [--with-embeddings]
//   node scripts/pack-brain.mjs verify <dir>        # recompute checksums + counts → delivery health-check
// Env (component sources — overridable for tests): BRAIN_AGENTS_DIR, BRAIN_PACKS_DIR, BRAIN_EVALS_DIR,
//   BRAIN_EMBEDDINGS, BRAIN_EMBEDDINGS_MANIFEST
// Exit: 0 ok · 1 verify failure (integrity/count mismatch) · 2 usage/env error
//
// Pure core (sha256, buildManifest, diffManifest) is hermetically tested in src/packBrain.test.mjs.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(HERE, '..')
const HOME = os.homedir()
const SRC = {
  agents: process.env.BRAIN_AGENTS_DIR || path.join(HOME, '.claude', 'agents'),
  packs: process.env.BRAIN_PACKS_DIR || path.join(HOME, '.claude', 'memory', 'patterns', 'good', 'swt-rules'),
  evals: process.env.BRAIN_EVALS_DIR || path.join(REPO, 'evals', 'golden-builds'),
  embeddings: process.env.BRAIN_EMBEDDINGS || path.join(REPO, 'data', 'intel', 'kb_chunks.jsonl'),
  embManifest: process.env.BRAIN_EMBEDDINGS_MANIFEST || path.join(REPO, 'data', 'intel', 'manifest.json'),
}

// ── PURE ────────────────────────────────────────────────────────────────────
export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }

// Build a manifest entry list for every file under `dir` matching `filter(name)`. Deterministic:
// sorted by relative path so the same tree always yields the same manifest (stable checksums).
export function buildManifest(dir, filter = () => true) {
  const out = []
  const walk = (d, rel) => {
    let names = []
    try { names = fs.readdirSync(d).sort() } catch { return }
    for (const n of names) {
      const abs = path.join(d, n)
      const r = rel ? `${rel}/${n}` : n
      const st = fs.statSync(abs)
      if (st.isDirectory()) walk(abs, r)
      else if (filter(n)) { const b = fs.readFileSync(abs); out.push({ path: r, sha256: sha256(b), bytes: b.length }) }
    }
  }
  walk(dir, '')
  return out
}

// Compare an expected manifest against what's actually on disk now (the delivery health-check core).
export function diffManifest(expected, actualByPath) {
  const missing = [], changed = []
  for (const e of expected) {
    const a = actualByPath[e.path]
    if (!a) missing.push(e.path)
    else if (a.sha256 !== e.sha256) changed.push(e.path)
  }
  return { ok: missing.length === 0 && changed.length === 0, missing, changed }
}

// ── IO ────────────────────────────────────────────────────────────────────────
function copyFiltered(srcDir, destDir, filter) {
  const entries = buildManifest(srcDir, filter)
  for (const e of entries) {
    const from = path.join(srcDir, e.path), to = path.join(destDir, e.path)
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  return entries
}
function resolveVersion(explicit) {
  if (explicit) return explicit
  try { return 'mem-' + execFileSync('git', ['-C', path.join(HOME, '.claude', 'memory'), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() } catch { /* */ }
  return 'v0-unversioned'
}

function pack(argv) {
  const out = (() => { const i = argv.indexOf('--out'); return i !== -1 ? argv[i + 1] : path.join(REPO, 'dist', 'boldteq-brain') })()
  const version = resolveVersion((() => { const i = argv.indexOf('--version'); return i !== -1 ? argv[i + 1] : null })())
  const withEmb = argv.includes('--with-embeddings')

  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })

  const manifest = { agents: [], rulePacks: [], evals: [], embeddings: null }
  manifest.agents = copyFiltered(SRC.agents, path.join(out, 'agents'), (n) => n.endsWith('.md'))
  manifest.rulePacks = copyFiltered(SRC.packs, path.join(out, 'rule-packs'), (n) => n.endsWith('.md'))
  if (fs.existsSync(SRC.evals)) manifest.evals = copyFiltered(SRC.evals, path.join(out, 'evals', 'golden-builds'), (n) => n.endsWith('.json') || n.endsWith('.md'))

  // embeddings: always pin the checksum + chunk count (so integrity is verifiable); copy the 190MB
  // payload only when asked (a lightweight pack ships the pin, a full pack ships the vectors).
  let embMeta = null
  if (fs.existsSync(SRC.embeddings)) {
    const buf = fs.readFileSync(SRC.embeddings)
    let chunks = null; try { chunks = JSON.parse(fs.readFileSync(SRC.embManifest, 'utf8')).count } catch { /* */ }
    embMeta = { file: 'embeddings/kb_chunks.jsonl', sha256: sha256(buf), bytes: buf.length, chunks, included: withEmb }
    if (withEmb) {
      fs.mkdirSync(path.join(out, 'embeddings'), { recursive: true })
      fs.copyFileSync(SRC.embeddings, path.join(out, 'embeddings', 'kb_chunks.jsonl'))
      if (fs.existsSync(SRC.embManifest)) fs.copyFileSync(SRC.embManifest, path.join(out, 'embeddings', 'manifest.json'))
    }
  }
  manifest.embeddings = embMeta

  const counts = { agents: manifest.agents.length, rulePacks: manifest.rulePacks.length, evals: manifest.evals.length, embeddingChunks: embMeta?.chunks ?? null }
  const plugin = {
    name: 'boldteq-brain', version,
    description: 'The Boldteq agent brain — roster, SWT rule-packs, golden benchmark, and vector snapshot — pinned as one versioned artifact.',
    components: counts,
    embeddingsIncluded: withEmb,
  }
  fs.mkdirSync(path.join(out, '.claude-plugin'), { recursive: true })
  fs.writeFileSync(path.join(out, '.claude-plugin', 'plugin.json'), JSON.stringify(plugin, null, 2) + '\n')
  fs.writeFileSync(path.join(out, 'MANIFEST.json'), JSON.stringify({ version, counts, files: manifest }, null, 2) + '\n')

  console.log(`packed boldteq-brain@${version} → ${path.relative(REPO, out)}`)
  console.log(`  agents ${counts.agents} · rule-packs ${counts.rulePacks} · evals ${counts.evals} · embeddings ${counts.embeddingChunks ?? 'n/a'} chunks${withEmb ? ' (payload included)' : ' (pinned by checksum, payload omitted — use --with-embeddings)'}`)
  return 0
}

function verify(argv) {
  const dir = argv.find((a) => !a.startsWith('--')) // first non-flag = the artifact dir
  if (!dir || !fs.existsSync(path.join(dir, 'MANIFEST.json'))) { console.error(`verify: no MANIFEST.json in ${dir || '(missing dir)'}`); return 2 }
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8'))
  const expected = [
    ...m.files.agents.map((e) => ({ ...e, path: `agents/${e.path}` })),
    ...m.files.rulePacks.map((e) => ({ ...e, path: `rule-packs/${e.path}` })),
    ...m.files.evals.map((e) => ({ ...e, path: `evals/golden-builds/${e.path}` })),
  ]
  const actual = {}
  for (const group of ['agents', 'rule-packs', 'evals/golden-builds']) {
    for (const e of buildManifest(path.join(dir, group), () => true)) actual[`${group}/${e.path}`] = e
  }
  const d = diffManifest(expected, actual)
  // embeddings: if the payload was included, verify its checksum too (delivery health-check for the big file)
  let embOk = true
  if (m.files.embeddings && m.files.embeddings.included) {
    const p = path.join(dir, 'embeddings', 'kb_chunks.jsonl')
    embOk = fs.existsSync(p) && sha256(fs.readFileSync(p)) === m.files.embeddings.sha256
  }
  const ok = d.ok && embOk
  console.log(`verify boldteq-brain@${m.version}: ${ok ? 'OK (integrity + counts match)' : 'FAILED'}`)
  console.log(`  expected ${expected.length} files · missing ${d.missing.length} · changed ${d.changed.length}${m.files.embeddings?.included ? ` · embeddings ${embOk ? 'ok' : 'CORRUPT'}` : ''}`)
  for (const p of [...d.missing.map((x) => `missing ${x}`), ...d.changed.map((x) => `changed ${x}`)].slice(0, 10)) console.log(`   ✗ ${p}`)
  return ok ? 0 : 1
}

function main() {
  const [cmd, ...argv] = process.argv.slice(2)
  if (cmd === 'pack') process.exit(pack(argv))
  else if (cmd === 'verify') process.exit(verify(argv))
  else { console.error('usage: pack-brain.mjs pack --out <dir> [--version v] [--with-embeddings] | verify <dir>'); process.exit(2) }
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) main()
