// The test suite must run EVERY test file, every time (TEST-3, 2026-07-23).
//
// `node --test --test-force-exit src/` ran files concurrently, and the forced exit truncated files
// still queued — so whole files were dropped while the run still reported all-green. Measured on an
// unchanged tree across consecutive runs: 213, 215, 222 tests, every one of them "0 failures".
// Run 1 was silently missing 8 tests from two files (governor.test.mjs, buildSchedules.test.js) and
// said `cancelled 0`. A green suite that quietly skipped two files is the same failure this backlog
// keeps finding — a skipped check is not a passed check — one level up, at the harness itself.
//
// `--test-concurrency=1` makes it deterministic (222/222, identical test set, 3/3 runs) and also
// removed the /ai/* reattach flakes, which were cross-test interference from parallel execution.
// Dropping the flag silently restores the truncation, so pin it here.
//
// NB removing --test-force-exit is NOT the alternative: without it the runner hangs indefinitely on
// leaked handles (reproduced: 3/3 runs killed at 90s). That leak is tracked separately as TEST-4.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8'))

test('npm test runs serially, so no test file can be silently dropped', () => {
  const script = pkg.scripts?.test || ''
  assert.match(
    script,
    /--test-concurrency=1\b/,
    'package.json "test" must keep --test-concurrency=1. Without it, --test-force-exit truncates files\n'
    + 'that are still queued and the run reports all-green having never executed them (observed: 213 /\n'
    + '215 / 222 tests on an unchanged tree, all "0 failures").',
  )
})

test('the forced exit is still present (without it the runner hangs on leaked handles)', () => {
  assert.match(pkg.scripts?.test || '', /--test-force-exit\b/, 'removing this hangs the suite — see TEST-4')
})
