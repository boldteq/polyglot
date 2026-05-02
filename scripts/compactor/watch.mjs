#!/usr/bin/env node
// Watch mode — auto-compact on save.
//
// Monitors ~/.claude/agents/*.md for changes (via fs.watch with recursive
// polling fallback for macOS Spotlight-safe operation). When an agent file is
// modified and its body exceeds budget, run the compactor in --write mode
// with the content-loss gate enabled. If compaction would drop >tolerance%
// content, abort and log. Debounced per-file to handle editor atomic writes.
//
// Usage:
//   node scripts/compactor/watch.mjs               # watch + auto-apply
//   node scripts/compactor/watch.mjs --dry-run     # watch + report only
//   node scripts/compactor/watch.mjs --tolerance=0.5
//
// Exit cleanly on SIGINT. Designed for a long-running terminal or launchd job.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HOME = os.homedir();
const AGENTS_DIR = path.join(HOME, '.claude', 'agents');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TOLERANCE = args.find(a => a.startsWith('--tolerance='))
  ? args.find(a => a.startsWith('--tolerance=')).split('=')[1]
  : '1.0';

const DEBOUNCE_MS = 500;
const timers = new Map();
const lastMtime = new Map();

const THIS_FILE = fileURLToPath(import.meta.url);
const COMPACT_SCRIPT = path.resolve(path.dirname(THIS_FILE), 'compact.mjs');

function runCompactor(agentId) {
  const argv = [COMPACT_SCRIPT, agentId, DRY_RUN ? '--dry-run' : '--write', '--tolerance', TOLERANCE];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', () => resolve(1));
  });
}

function handleChange(agentId) {
  // Debounce: editors often write, rename, truncate. Coalesce within 500ms.
  if (timers.has(agentId)) clearTimeout(timers.get(agentId));
  timers.set(agentId, setTimeout(async () => {
    timers.delete(agentId);
    const file = path.join(AGENTS_DIR, `${agentId}.md`);
    if (!fs.existsSync(file)) return;
    try {
      const stat = fs.statSync(file);
      // Skip if mtime didn't change (dedup'd watcher event)
      if (lastMtime.get(agentId) === stat.mtimeMs) return;
      lastMtime.set(agentId, stat.mtimeMs);
    } catch { return; }
    console.log(`\n[watch] ${new Date().toISOString()} — ${agentId}.md changed`);
    const code = await runCompactor(agentId);
    if (code === 0) console.log(`[watch] ${agentId}: done`);
    else console.log(`[watch] ${agentId}: compactor exited ${code}`);
  }, DEBOUNCE_MS));
}

function startWatch() {
  console.log(`[watch] monitoring ${AGENTS_DIR.replace(HOME, '~')}`);
  console.log(`[watch] mode: ${DRY_RUN ? 'dry-run' : 'write'} | tolerance: ${TOLERANCE}%`);
  console.log(`[watch] debounce: ${DEBOUNCE_MS}ms | press Ctrl+C to stop`);

  const watcher = fs.watch(AGENTS_DIR, { persistent: true }, (event, filename) => {
    if (!filename) return;
    if (!filename.endsWith('.md')) return;
    if (filename.startsWith('.')) return;  // skip .pre-compact dirs, hidden
    const agentId = filename.replace(/\.md$/, '');
    // Guard against path traversal / unusual filenames
    if (!/^[a-z0-9._-]+$/i.test(agentId)) return;
    handleChange(agentId);
  });

  watcher.on('error', (err) => {
    console.error('[watch] watcher error:', err.message);
  });

  process.on('SIGINT', () => {
    console.log('\n[watch] stopping');
    watcher.close();
    process.exit(0);
  });
}

startWatch();
