// The test suite must run EVERY test file, every time — and must exit on its own (TEST-3 / TEST-4).
//
// The failure chain, in order of discovery:
//   1. Two modules leaked a handle, so `node --test src/` never exited.
//        · src/routes/learning.js had a module-level setInterval with no .unref() — merely REQUIRING
//          the route file pinned the event loop forever (its siblings rateLimit.js and playground.js
//          already unref'd theirs; this one was the outlier).
//        · src/routes/schedules.test.js created real node-cron jobs through the API and never stopped
//          them; stopAllSchedules() was already exported, it simply was not called in `after()`.
//   2. `--test-force-exit` was added to work around the hang.
//   3. That flag then TRUNCATED files still queued under concurrency — so whole test files never ran
//      while the suite still reported all-green. Measured on an unchanged tree: 213 / 215 / 222 tests,
//      every run "0 failures, cancelled 0". Run 1 silently omitted 8 tests from two files.
//
// A green suite that quietly skipped two files is the same failure this backlog keeps finding —
// a skipped check is not a passed check — one level up, in the harness itself.
//
// With both leaks fixed, neither flag is needed: plain `node --test src/` gives 224/224 with a
// byte-identical test set across 3/3 runs, in ~3s. Re-adding --test-force-exit would restore the
// silent truncation AND re-hide the next handle leak, so this pins its absence.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf-8'))

test('npm test does not use --test-force-exit (it truncates files AND hides handle leaks)', () => {
  assert.doesNotMatch(
    pkg.scripts?.test || '',
    /--test-force-exit\b/,
    'Do not re-add --test-force-exit. It forcibly exits while files are still queued, so they never\n'
    + 'run and the suite still reports all-green (observed: 213 / 215 / 222 tests on an unchanged tree,\n'
    + 'each "0 failures"). It also masks the handle leak that made it seem necessary. If the suite\n'
    + 'starts hanging again, find the leaked handle — do not silence it.',
  )
})

test('the suite still runs the whole src/ tree', () => {
  const script = pkg.scripts?.test || ''
  assert.match(script, /\bnode --test\b/, 'the suite must run via node --test')
  assert.match(script, /\bsrc\/?\b/, 'the suite must cover the whole src/ tree, not a subset')
})

test('module-level timers in route files are unref\'d so requiring them cannot pin the loop', () => {
  // learning.js was the outlier that started this whole chain.
  const offenders = []
  const routesDir = path.join(REPO, 'src', 'routes')
  for (const f of fs.readdirSync(routesDir)) {
    if (!/\.(js|mjs)$/.test(f) || /\.test\./.test(f)) continue
    const lines = fs.readFileSync(path.join(routesDir, f), 'utf-8').split('\n')
    lines.forEach((line, i) => {
      // a setInterval at column 0 is module-level (handler-scoped ones are indented)
      if (!/^setInterval\(/.test(line)) return
      // find the matching close of THIS call and check for .unref() on it
      const tail = lines.slice(i, i + 60).join('\n')
      // non-greedy + end-anchored: a greedy [^\n]* swallows `.unref()` and flags fixed code too
      const close = tail.match(/^\}, .*?\)(\.unref\(\))?;\s*$/m)
      if (!close || !close[1]) offenders.push(`${f}:${i + 1}`)
    })
  }
  assert.deepEqual(
    offenders, [],
    'module-level setInterval without .unref() — requiring this file pins the event loop forever,\n'
    + `which is what forced --test-force-exit and the silent truncation behind it:\n  ${offenders.join(', ')}`,
  )
})
