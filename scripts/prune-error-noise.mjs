#!/usr/bin/env node
// One-time prune of accumulated noise/stale rows from error_log (audit deep-fix).
// Safe to run while the server is up (WAL allows concurrent writers). Targeted —
// only deletes known operational-noise / resolved-stale classes; genuine errors stay.
//   Usage: node scripts/prune-error-noise.mjs
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'polyglot.db');
const db = new Database(dbPath);

const classes = [
  ['selftest synthetic',     "message LIKE 'selftest%'"],
  ['node-cron missed exec',  "message LIKE '%missed execution%'"],
  ['slow query',             "message LIKE 'slow query%'"],
  ['stale ReferenceError',   "message LIKE '%is not defined%'"],
  ['EADDRINUSE (operational)', "message LIKE '%already in use%'"],
  ['vigil seed (stale)',     "message LIKE '%seeded with defaults%'"],
];

const before = db.prepare('SELECT COUNT(*) AS n FROM error_log').get().n;
let total = 0;
console.log(`error_log rows before: ${before}`);
for (const [label, where] of classes) {
  const n = db.prepare(`DELETE FROM error_log WHERE ${where}`).run().changes;
  total += n;
  console.log(`  ${label.padEnd(26)} deleted ${n}`);
}
const after = db.prepare('SELECT COUNT(*) AS n FROM error_log').get().n;
console.log(`Pruned ${total} noise/stale rows. error_log rows now: ${after}`);
db.close();
