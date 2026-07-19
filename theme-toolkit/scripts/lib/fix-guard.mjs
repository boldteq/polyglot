// Destructive-fix guard (2026-07-19 audit H2 — the single most dangerous gap). A `claude -p` self-heal
// can make a gate pass the CHEAP way: DELETE the offending section/content. Nothing else catches it —
// deletion can raise the reuse ratio, render-check has nothing to fail, CHANGES only checks boxes. This
// guard snapshots the theme before a fix and REVERTS (restores) any fix that removed required content,
// so a gate can never be "passed" by gutting the store. PURE detection + a tiny git revert. Node 20 ESM.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const THEME_DIRS = ['sections', 'snippets', 'templates', 'blocks']
const NET_DELETE_LINES = 120 // a fix that nets >120 removed lines (with few adds) across the theme = suspicious

function git(args, cwd) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null }
}
function isGitRepo(cwd) { return git(['rev-parse', '--is-inside-work-tree'], cwd)?.trim() === 'true' }

// List every theme content file that currently exists (recursively), + whether each .liquid has a {% schema %}.
export function snapshotTheme(cwd) {
  const files = new Set()
  const schemas = new Set()
  for (const d of THEME_DIRS) {
    const abs = path.join(cwd, d)
    let entries = []
    try { entries = fs.readdirSync(abs, { recursive: true }) } catch { continue }
    for (const e of entries) {
      const rel = path.join(d, String(e))
      const full = path.join(cwd, rel)
      let stat; try { stat = fs.statSync(full) } catch { continue }
      if (!stat.isFile() || !rel.endsWith('.liquid')) continue
      files.add(rel)
      try { if (/\{%-?\s*schema\s*-?%\}/.test(fs.readFileSync(full, 'utf-8'))) schemas.add(rel) } catch { /* */ }
    }
  }
  return { files, schemas, git: isGitRepo(cwd) }
}

// Compare after a fix. Returns { destructive, reasons[], culprits[] } — culprits are the paths to revert.
export function detectDestructive(cwd, before) {
  const after = snapshotTheme(cwd)
  const reasons = []
  const culprits = new Set()

  // 1) a section/snippet/template file was DELETED
  for (const f of before.files) if (!after.files.has(f)) { reasons.push(`deleted ${f}`); culprits.add(f) }
  // 2) a file lost its {% schema %} (a section stripped of its schema = no longer editable/renderable)
  for (const f of before.schemas) if (after.files.has(f) && !after.schemas.has(f)) { reasons.push(`removed {% schema %} from ${f}`); culprits.add(f) }
  // 3) net large deletion across the theme (gutting content to pass a gate)
  if (before.git) {
    const numstat = git(['diff', '--numstat', '--', ...THEME_DIRS], cwd)
    if (numstat) {
      let added = 0, removed = 0
      for (const line of numstat.trim().split('\n').filter(Boolean)) {
        const [a, r, file] = line.split('\t')
        added += Number(a) || 0; removed += Number(r) || 0
        if ((Number(r) || 0) - (Number(a) || 0) > NET_DELETE_LINES) culprits.add(file)
      }
      if (removed - added > NET_DELETE_LINES) reasons.push(`net −${removed - added} lines across the theme (added ${added}, removed ${removed})`)
    }
  }
  return { destructive: reasons.length > 0, reasons, culprits: [...culprits] }
}

// Revert the destructive edit so the blocker re-appears on re-grade (→ the loop escalates instead of
// accepting a gutted store). git repo → restore the culprit paths from HEAD; non-git → best-effort no-op
// (the guard still REPORTS, and the caller escalates without marking the finding fixed).
export function revertDestructive(cwd, culprits, before) {
  if (!before.git) return { reverted: false, reason: 'not a git repo — cannot auto-revert; escalating instead' }
  const restored = []
  // restore deleted files + gutted files from HEAD
  for (const f of culprits) { if (git(['checkout', 'HEAD', '--', f], cwd) !== null) restored.push(f) }
  // also restore any deletion the numstat missed but the snapshot caught
  for (const f of before.files) { if (!fs.existsSync(path.join(cwd, f))) { git(['checkout', 'HEAD', '--', f], cwd); restored.push(f) } }
  return { reverted: restored.length > 0, restored }
}
