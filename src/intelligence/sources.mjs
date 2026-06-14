// Boldteq Intelligence — enumerate the knowledge sources to index.
// The "brain" = ~/.claude/memory + ~/.claude/agents + per-project memories.
// Returns [{ source_type, source_ref, title, raw, content_hash }].

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = os.homedir()
const CLAUDE = path.join(HOME, '.claude')

function walk(dir, exts, acc = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (!/node_modules|\.git|_archive|_backups/.test(e.name)) walk(p, exts, acc) }
    else if (exts.some(x => e.name.endsWith(x))) acc.push(p)
  }
  return acc
}

const titleOf = (raw, file) => {
  const h1 = raw.match(/^#\s+(.+)$/m)
  return (h1 ? h1[1] : path.basename(file, path.extname(file))).replace(/[#*`]/g, '').trim()
}
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

function loadFiles(files, source_type) {
  const out = []
  for (const f of files) {
    let raw
    try { raw = fs.readFileSync(f, 'utf-8') } catch { continue }
    if (!raw.trim()) continue
    out.push({ source_type, source_ref: f, title: titleOf(raw, f), raw, content_hash: hash(raw) })
  }
  return out
}

// the full brain (default). Extra dirs (client repos) can be added via INTEL_EXTRA_DIRS (colon-sep).
export function enumerateSources() {
  const sources = []
  sources.push(...loadFiles(walk(path.join(CLAUDE, 'memory'), ['.md']), 'memory'))
  sources.push(...loadFiles(walk(path.join(CLAUDE, 'agents'), ['.md']), 'agent'))
  // per-project memories: ~/.claude/projects/*/memory/*.md
  const projRoot = path.join(CLAUDE, 'projects')
  try {
    for (const proj of fs.readdirSync(projRoot)) {
      const memDir = path.join(projRoot, proj, 'memory')
      if (fs.existsSync(memDir)) sources.push(...loadFiles(walk(memDir, ['.md']), 'project'))
    }
  } catch { /* none */ }
  for (const dir of (process.env.INTEL_EXTRA_DIRS || '').split(':').filter(Boolean)) {
    sources.push(...loadFiles(walk(dir, ['.md']), 'project'))
  }
  return sources
}
