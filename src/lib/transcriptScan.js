'use strict';

// Hook-independent discovery for the learning digest.
//
// The SessionEnd hook only fires when VS Code closes — but the user never quits
// VS Code, so it rarely fires. Claude Code instead writes every session to a
// durable transcript at ~/.claude/projects/<encoded-cwd>/<sessionUUID>.jsonl,
// appended continuously. This scanner finds transcripts changed recently, reads
// ONLY the new bytes past a per-session byte watermark, and upserts a
// vscode_session row the digest then processes — exactly as if the hook fired.
//
// Cost-bounded: mtime filter (only touched files), byte-delta reads (never the
// whole history), file/byte caps. Pure fs + db, no embeddings, no spawn.

const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../db');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
// Reused from systemSchedules' correction detection intent — kept local so the
// scanner has no cross-module coupling.
const CORRECTION_RE = /\b(no,|nope|actually|don'?t|stop|that'?s wrong|not what|incorrect|i told you|use .* instead|never|always|still (broken|failing|wrong)|not done|doesn'?t work)\b/i;

// List *.jsonl transcripts with mtime >= sinceMs, newest-first, capped.
function listRecentTranscripts(projectsDir, sinceMs, maxFiles) {
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { return out; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const sub = path.join(projectsDir, d.name);
    let files = [];
    try { files = fs.readdirSync(sub); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const file = path.join(sub, f);
      try {
        const st = fs.statSync(file);
        if (st.mtimeMs >= sinceMs) out.push({ file, mtimeMs: st.mtimeMs, size: st.size, sessionId: f.replace(/\.jsonl$/, '') });
      } catch { /* unreadable — skip */ }
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out.slice(0, maxFiles);
}

// Find the project cwd from a transcript (folder name loses spaces, so we must
// read it from a line). Checks the delta first, then the file head as fallback.
function findCwd(deltaLines, file) {
  for (const obj of deltaLines) { if (obj && typeof obj.cwd === 'string' && obj.cwd) return obj.cwd; }
  try {
    const head = fs.readFileSync(file, 'utf-8').slice(0, 4000).split('\n');
    for (const line of head) {
      if (!line) continue;
      try { const o = JSON.parse(line); if (o && typeof o.cwd === 'string' && o.cwd) return o.cwd; } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return null;
}

// Read the byte range [fromByte, EOF) (capped at maxBytes), parse complete JSONL
// lines, and tally new activity. Returns the new watermark (toByte = end of the
// last complete line consumed) so the next scan resumes exactly there.
function readSessionDelta(file, fromByte, maxBytes) {
  const size = (() => { try { return fs.statSync(file).size; } catch { return 0; } })();
  const rotated = size < fromByte; // file shrank/replaced → re-read from start
  const start = rotated ? 0 : fromByte;
  if (size <= start) return { newBytes: 0, toByte: start, currentSize: size, rotated, lines: [], counts: zero() };

  const want = Math.min(size - start, maxBytes);
  const truncated = (size - start) > maxBytes;
  const buf = Buffer.alloc(want);
  let read = 0;
  try {
    const fd = fs.openSync(file, 'r');
    try { read = fs.readSync(fd, buf, 0, want, start); } finally { fs.closeSync(fd); }
  } catch { return { newBytes: 0, toByte: start, currentSize: size, rotated, lines: [], counts: zero() }; }

  const text = buf.toString('utf-8', 0, read);
  const lastNl = text.lastIndexOf('\n');
  // Only consume complete lines. If the delta has no newline (rare giant line)
  // but we're truncating, advance by `read` anyway so we never wedge.
  const completeEnd = lastNl >= 0 ? lastNl + 1 : (truncated ? read : 0);
  const completeText = text.slice(0, completeEnd);
  const toByte = start + Buffer.byteLength(completeText, 'utf-8');

  const lines = [];
  for (const ln of completeText.split('\n')) { if (!ln) continue; try { lines.push(JSON.parse(ln)); } catch { /* skip */ } }
  return { newBytes: completeEnd, toByte, currentSize: size, rotated, truncated, lines, counts: tally(lines) };
}

function zero() { return { newTurns: 0, newEdits: 0, newBash: 0, newCorrections: 0, newToolUse: 0 }; }

function tally(lines) {
  const c = zero();
  for (const ev of lines) {
    const msg = (ev && ev.message) || ev;
    const role = msg && (msg.role || ev.type);
    if (role === 'user') c.newTurns += 1;
    const content = msg && msg.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b) continue;
        if (b.type === 'tool_use') {
          c.newToolUse += 1;
          if (b.name === 'Edit' || b.name === 'Write' || b.name === 'MultiEdit') c.newEdits += 1;
          if (b.name === 'Bash') c.newBash += 1;
        } else if (b.type === 'text' && role === 'user' && typeof b.text === 'string' && CORRECTION_RE.test(b.text)) {
          c.newCorrections += 1;
        }
      }
    } else if (typeof content === 'string' && role === 'user' && CORRECTION_RE.test(content)) {
      c.newCorrections += 1;
    }
  }
  return c;
}

// Main entry — called by learningDigest BEFORE it reads pending sessions.
function scanTranscripts(opts = {}) {
  const lookbackHours = opts.lookbackHours ?? 26;
  const maxFiles = opts.maxFiles ?? 200;
  const maxBytesPerFile = opts.maxBytesPerFile ?? 3_000_000;
  const minNewTurns = opts.minNewTurns ?? 2;
  const excludeProjects = Array.isArray(opts.excludeProjects) ? opts.excludeProjects : [];
  const projectsDir = opts.projectsDir || PROJECTS_DIR;

  const res = { scanned: 0, upserted: 0, repended: 0, skippedNoNew: 0, skippedNoCwd: 0, skippedTrivial: 0, rotated: 0, errors: [] };
  if (!fs.existsSync(projectsDir)) return res;

  const sinceMs = Date.now() - lookbackHours * 3600_000;
  const recent = listRecentTranscripts(projectsDir, sinceMs, maxFiles);

  for (const { file, size, sessionId } of recent) {
    res.scanned += 1;
    try {
      const wm = db.getSessionWatermark(sessionId); // { lastLineCount, transcriptBytes, status } | null
      const fromByte = wm ? wm.transcriptBytes : 0;
      // Skip-fast: file size unchanged since last scan → no new bytes.
      if (wm && size === fromByte) { res.skippedNoNew += 1; continue; }

      const delta = readSessionDelta(file, fromByte, maxBytesPerFile);
      if (delta.rotated) res.rotated += 1;
      if (delta.newBytes === 0) { res.skippedNoNew += 1; continue; }

      const cwd = findCwd(delta.lines, file);
      if (!cwd) { res.skippedNoCwd += 1; continue; }
      const project = path.basename(cwd);
      if (excludeProjects.includes(project)) { res.skippedTrivial += 1; continue; }

      const c = delta.counts;
      const meaningful = c.newTurns >= minNewTurns || c.newEdits > 0;
      if (!meaningful) { res.skippedTrivial += 1; continue; }

      const wasDigested = wm && wm.status === 'digested';
      db.insertVscodeSession({
        sessionId,
        project,
        projectPath: cwd,
        transcriptPath: file,
        turnCount: c.newTurns,
        toolUseCount: c.newToolUse,
        editCount: c.newEdits,
        bashCount: c.newBash,
        transcriptBytes: delta.toByte, // advance the byte watermark to end-of-complete-lines
        status: 'pending_digest',
        createdAt: new Date().toISOString(),
        lastScanAt: new Date().toISOString(),
        // digestFromByte tells buildSessionBlock which byte range is NEW, so the
        // LLM only ever summarizes new turns (token-flat across re-scans).
        metadata: { scannedBy: 'transcript-scan', digestFromByte: delta.rotated ? 0 : fromByte, corrections: c.newCorrections },
      });
      if (wasDigested) res.repended += 1; else res.upserted += 1;
    } catch (err) {
      res.errors.push({ file: path.basename(file), message: err.message });
    }
  }
  return res;
}

module.exports = { scanTranscripts, listRecentTranscripts, readSessionDelta };
