#!/usr/bin/env node
// suite-health — daily regression sweep against the COMMITTED HEAD (a throwaway
// git worktree), NOT the working tree. Running against HEAD means Yash's
// in-progress WIP edits and the env-coupled tests (gateFindings / workspace
// auto-adopt only fail in a dirty tree) never produce false regressions — the
// signal is "did committed code regress". Runs client tsc -b + the backend test
// suite (under Node 20 for better-sqlite3). REPORT-ONLY: JSON to stdout, exit 0.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const git = (args, cwd = ROOT) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 60_000 })

// better-sqlite3 breaks under Node 22 — resolve a Node-20 binary for the tests.
function resolveNode20() {
  const base = path.join(os.homedir(), '.nvm', 'versions', 'node')
  try {
    const v20 = fs.readdirSync(base).filter((d) => d.startsWith('v20.')).sort().pop()
    if (v20) { const bin = path.join(base, v20, 'bin', 'node'); if (fs.existsSync(bin)) return bin }
  } catch { /* nvm absent */ }
  return null
}

function run() {
  git(['worktree', 'prune'])
  const wt = path.join(os.tmpdir(), `pg-suite-health-${Date.now()}`)
  const add = git(['worktree', 'add', '--detach', wt, 'HEAD'])
  if (add.status !== 0) return { error: 'worktree add failed: ' + (add.stderr || '').slice(0, 200) }
  try {
    // node_modules is gitignored — symlink the real ones into the worktree.
    try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(wt, 'node_modules'), 'dir') } catch { /* exists */ }
    try { fs.symlinkSync(path.join(ROOT, 'client', 'node_modules'), path.join(wt, 'client', 'node_modules'), 'dir') } catch { /* exists */ }

    let tsc = { ran: false, errors: 0 }
    const tscBin = path.join(wt, 'client', 'node_modules', '.bin', 'tsc')
    if (fs.existsSync(tscBin)) {
      const r = spawnSync(tscBin, ['-b'], { cwd: path.join(wt, 'client'), encoding: 'utf8', timeout: 5 * 60 * 1000 })
      const out = (r.stdout || '') + (r.stderr || '')
      tsc = { ran: true, errors: (out.match(/error TS\d+/g) || []).length, exitCode: r.status }
    } else { tsc.note = 'tsc binary not found' }

    let tests = { ran: false, pass: 0, fail: 0, total: 0 }
    const node20 = resolveNode20()
    if (node20) {
      const r = spawnSync(node20, ['--test', '--test-force-exit', 'src/'], { cwd: wt, encoding: 'utf8', timeout: 10 * 60 * 1000 })
      const out = (r.stdout || '') + (r.stderr || '')
      const num = (re) => { const m = out.match(re); return m ? Number(m[1]) : 0 }
      tests = { ran: true, pass: num(/^# pass (\d+)/m), fail: num(/^# fail (\d+)/m), total: num(/^# tests (\d+)/m), exitCode: r.status }
    } else { tests.note = 'Node 20 not found — tests skipped' }

    return { head: (git(['rev-parse', '--short', 'HEAD']).stdout || '').trim(), tsc, tests }
  } finally {
    git(['worktree', 'remove', '--force', wt])
  }
}

let result
try { result = run() } catch (e) { result = { error: e.message } }
console.log(JSON.stringify(result))
process.exit(0)
