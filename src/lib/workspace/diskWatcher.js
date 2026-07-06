'use strict';

// Workspace disk watcher — the PRIMARY live-update signal (plan §C2/§8). There
// is no generic db event emitter to lean on, so we watch the artifacts the
// dashboard reads and emit narrow events on a local EventEmitter that the SSE
// route subscribes to. chokidar is already a dependency.
//
// Watches, across the same build roots Lens discovers:
//   • **/gate-reports/**/*.json   → 'gate:update'
//   • **/CHANGES.md               → 'changes:update'
//   • **/visual-truth.json        → 'lens:update'
// Every change also fires 'score:update' (the build's score may have moved) and
// calls the injected bust() so the next request recomputes.

const { EventEmitter } = require('events');
const path = require('path');

const bus = new EventEmitter();
bus.setMaxListeners(50);

let watcher = null;

// roots: string[] (build roots from lens.buildsRoots()); bust: () => void
function startDiskWatcher({ roots = [], bust = () => {} } = {}) {
  if (watcher) return bus; // idempotent
  let chokidar;
  try { chokidar = require('chokidar'); }
  catch (err) { console.warn('[workspace] chokidar unavailable, live updates disabled:', err.message); return bus; }

  const globs = [];
  for (const r of roots) {
    globs.push(path.join(r, '**', 'gate-reports', '**', '*.json'));
    globs.push(path.join(r, '**', 'CHANGES.md'));
  }
  if (!globs.length) return bus;

  watcher = chokidar.watch(globs, {
    ignoreInitial: true,
    depth: 6,
    ignored: ['**/node_modules/**', '**/.git/**'],
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  const onChange = (file) => {
    try {
      bust(); // recompute on next request
      const base = path.basename(file);
      if (base === 'CHANGES.md') bus.emit('event', { type: 'changes:update', file });
      else if (base === 'lens.json') bus.emit('event', { type: 'lens:update', file });
      else bus.emit('event', { type: 'gate:update', file });
      bus.emit('event', { type: 'score:update', file });
    } catch (err) { console.error('[workspace] watcher onChange failed:', err.message); }
  };

  watcher.on('add', onChange).on('change', onChange).on('unlink', onChange);
  watcher.on('error', (err) => console.error('[workspace] watcher error:', err.message));
  console.log(`[workspace] disk watcher started on ${globs.length} glob(s)`);
  return bus;
}

function stopDiskWatcher() {
  if (watcher) { watcher.close(); watcher = null; }
}

module.exports = { bus, startDiskWatcher, stopDiskWatcher };
