'use strict';

// P3 — keeps the derived workspace_build_index fresh so list endpoints serve
// without rescanning disk. The index is a CACHE, never a source of truth (disk
// stays authoritative); it is rebuilt:
//   • every 60s (timer, unref'd so it never holds process exit)
//   • on demand when the disk watcher fires (debounced) — so it's fresh, not
//     just eventually-consistent
//
// `assembleAll` is injected (not required) to avoid a circular dependency with
// the workspace route module.

const db = require('../../db');

let timer = null;
let debounce = null;
let assembleAll = null;

// Rebuild the whole index + snapshot score trend deltas.
function rebuild() {
  if (!assembleAll) return;
  let builds;
  try { builds = assembleAll(); }
  catch (err) { console.error('[workspace] indexer rebuild failed:', err.message); return; }
  const now = Date.now();
  // capture score trend BEFORE replacing (compare new score vs cached previous)
  try {
    const prev = new Map(db.getWorkspaceIndex().map((b) => [b.buildId, b.score]));
    for (const b of builds) {
      const before = prev.get(b.buildId);
      if (before != null && before !== b.score) {
        db.insertReflection({
          kind: 'workspace.score', project: b.client,
          summary: `${b.client} score ${before}→${b.score}`,
          data: { buildId: b.buildId, before, after: b.score, deltaSign: b.score >= before ? 'up' : 'down' },
        });
      }
    }
  } catch (err) { console.error('[workspace] score-trend snapshot failed:', err.message); }

  try { db.replaceWorkspaceIndex(builds, now); }
  catch (err) { console.error('[workspace] index write failed:', err.message); }
}

// Debounced rebuild for watcher bursts (many gate files written at once).
function rebuildSoon() {
  if (debounce) return;
  debounce = setTimeout(() => { debounce = null; rebuild(); }, 1000);
  if (typeof debounce.unref === 'function') debounce.unref();
}

// Start the 60s rebuilder + an immediate first build. `bus` (optional) is the
// disk-watcher EventEmitter; if given, watcher events trigger a debounced rebuild.
function startIndexer({ assembler, bus } = {}) {
  if (timer) return;            // idempotent
  assembleAll = assembler;
  rebuild();                    // warm immediately on boot
  timer = setInterval(rebuild, 60_000);
  if (typeof timer.unref === 'function') timer.unref();
  if (bus) bus.on('event', (e) => { if (e && /update$/.test(e.type)) rebuildSoon(); });
  console.log('[workspace] index rebuilder started (60s + on-change)');
}

function stopIndexer() {
  if (timer) { clearInterval(timer); timer = null; }
  if (debounce) { clearTimeout(debounce); debounce = null; }
}

module.exports = { startIndexer, stopIndexer, rebuild };
