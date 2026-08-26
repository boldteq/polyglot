#!/usr/bin/env node
// run-all-tests.mjs — Discover and run every *.test.mjs in this directory.
//
// Design:
//   - Scans its own directory (__fixtures__) for files matching /\.test\.mjs$/.
//   - Excludes this runner itself (matches by resolved absolute path, so a
//     rename of this file still can't accidentally self-invoke).
//   - Spawns each fixture as its own child (`node <file>`) via spawnSync,
//     inheriting stdio so failure output streams live to the terminal.
//   - Records exit code + wall-time per fixture.
//   - Prints a per-file PASS/FAIL line, then a summary (total / passed /
//     failed / duration).
//   - Exits 0 iff every fixture exited 0; otherwise exits 1.
//
// No dependencies. Node >= 20.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SELF = resolve(__filename);

const TEST_RE = /\.test\.mjs$/;

function discover(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const name of entries) {
    if (!TEST_RE.test(name)) continue;
    const full = resolve(join(dir, name));
    if (full === SELF) continue;
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    files.push(full);
  }
  files.sort();
  return files;
}

function runOne(file) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [file], {
    stdio: 'inherit',
    env: process.env,
  });
  const durationMs = Date.now() - started;
  const code = typeof result.status === 'number' ? result.status : 1;
  const signal = result.signal || null;
  const error = result.error || null;
  return { file, code, signal, error, durationMs };
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function relFromDir(file) {
  const d = __dirname.endsWith('/') ? __dirname : __dirname + '/';
  return file.startsWith(d) ? file.slice(d.length) : file;
}

function main() {
  const files = discover(__dirname);

  console.log(`\nrun-all-tests: discovered ${files.length} fixture(s) in ${__dirname}`);
  if (files.length === 0) {
    console.log('run-all-tests: nothing to run.');
    process.exit(0);
  }
  console.log('');

  const results = [];
  const startedAll = Date.now();

  for (const file of files) {
    const rel = relFromDir(file);
    console.log(`----- ${rel} -----`);
    const r = runOne(file);
    results.push(r);
    const label = r.code === 0 ? 'PASS' : 'FAIL';
    const extra = r.signal
      ? ` (signal ${r.signal})`
      : r.error
        ? ` (spawn error: ${r.error.message})`
        : '';
    console.log(`----- ${label}: ${rel}  [${fmtMs(r.durationMs)}]${extra}\n`);
  }

  const totalMs = Date.now() - startedAll;
  const passed = results.filter((r) => r.code === 0).length;
  const failed = results.length - passed;

  console.log('==================== SUMMARY ====================');
  console.log(`fixtures : ${results.length}`);
  console.log(`passed   : ${passed}`);
  console.log(`failed   : ${failed}`);
  console.log(`duration : ${fmtMs(totalMs)}`);
  if (failed > 0) {
    console.log('\nFailing fixtures:');
    for (const r of results) {
      if (r.code === 0) continue;
      const why = r.signal
        ? `signal ${r.signal}`
        : r.error
          ? `spawn error: ${r.error.message}`
          : `exit ${r.code}`;
      console.log(`  - ${relFromDir(r.file)}  (${why})`);
    }
  }
  console.log('=================================================');

  process.exit(failed === 0 ? 0 : 1);
}

main();
