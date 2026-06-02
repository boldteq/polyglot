'use strict';

// Shared Claude CLI runner — used by both `routes/schedules.js` (user-created
// schedules) and `lib/systemSchedules.js` (built-in HR/automation cycles).
// Extracted so both code paths invoke agents identically: same env scrubbing,
// same timeout shape, same prompt assembly.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const HOME = os.homedir();
const AGENTS_DIR = path.join(HOME, '.claude', 'agents');

function findAgentFile(agentName) {
  if (!agentName || typeof agentName !== 'string') return null;
  try {
    if (!fs.existsSync(AGENTS_DIR)) return null;
    const target = agentName.toLowerCase();
    for (const file of fs.readdirSync(AGENTS_DIR)) {
      if (!file.endsWith('.md')) continue;
      const fname = file.replace(/\.md$/, '');
      if (fname === agentName || fname.toLowerCase() === target) {
        return path.join(AGENTS_DIR, file);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function validateAgentExists(agentName) {
  return findAgentFile(agentName) !== null;
}

// Strip CLAUDECODE / SDK env vars before spawning so the child does NOT
// inherit the parent's session and re-enter agent context. Otherwise nested
// invocations confuse Claude's own routing.
//
// `opts.onProc(child)` — invoked synchronously after spawn so caller can
// register the ChildProcess for cancellation (e.g. activeChildProcs Map).
// Caller is responsible for unregistering on resolve/reject.
//
// `opts.onCancel` is set when cancellation is the cause of process exit —
// promise rejects with a 'cancelled' error so the wrapper marks the run row
// as 'cancelled' instead of 'error'.
function runClaudeSync(prompt, timeoutMs = 120000, opts = {}) {
  return new Promise((resolve, reject) => {
    const claudePath = process.env.CLAUDE_PATH || 'claude';
    const childEnv = { ...process.env, HOME: os.homedir() };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;
    delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
    delete childEnv.CLAUDE_AGENT_SDK_VERSION;

    const proc = spawn(claudePath, ['-p'], { env: childEnv });
    let out = '';
    let err = '';
    let killed = false;
    let cancelled = false;

    // Expose a cancel function on the child so the caller can call
    // `child._polyglotCancel()` to terminate WITHOUT triggering the timeout
    // error path.
    proc._polyglotCancel = () => {
      cancelled = true;
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3000);
    };

    if (typeof opts.onProc === 'function') {
      try { opts.onProc(proc); } catch (e) {
        console.warn('[runClaude] onProc callback threw:', e.message);
      }
    }

    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
    }, timeoutMs);

    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (cancelled) {
        const e = new Error('Cancelled by operator');
        e.cancelled = true;
        return reject(e);
      }
      if (killed) reject(new Error(`Claude execution timed out after ${Math.round(timeoutMs / 1000)}s`));
      else if (code !== 0) reject(new Error(err.trim() || `claude exited ${code}`));
      else resolve(out.trim());
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();
  });
}

// Standard prompt envelope: full agent instructions + the task block + the
// deliverable directive. Mirrors what schedules.js was doing inline.
function buildAgentPrompt(agentName, task) {
  const file = findAgentFile(agentName);
  if (!file) throw new Error(`Agent '${agentName}' not found`);
  const instructions = fs.readFileSync(file, 'utf-8');
  return `${instructions}\n\n---\n\n## Task:\n${task}\n\n---\n\nIMPORTANT: Produce the actual deliverable directly. Do NOT write meta-commentary. Output only the finished work product.`;
}

module.exports = {
  AGENTS_DIR,
  findAgentFile,
  validateAgentExists,
  runClaudeSync,
  buildAgentPrompt,
};
