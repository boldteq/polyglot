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
// opts.captureUsage — when true, runs the CLI in JSON mode (`--output-format json`)
// and resolves `{ text, usage:{inputTokens,outputTokens,costUsd,model} }` instead of
// a plain string, so callers can record REAL token cost (Pillar 1). Non-breaking:
// default (no flag) still resolves the trimmed text string.
function runClaudeSync(prompt, timeoutMs = 120000, opts = {}) {
  return new Promise((resolve, reject) => {
    const claudePath = process.env.CLAUDE_PATH || 'claude';
    const childEnv = { ...process.env, HOME: os.homedir() };
    delete childEnv.CLAUDECODE;
    delete childEnv.CLAUDE_CODE_ENTRYPOINT;
    delete childEnv.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING;
    delete childEnv.CLAUDE_AGENT_SDK_VERSION;

    const cliArgs = opts.captureUsage ? ['-p', '--output-format', 'json'] : ['-p'];
    const proc = spawn(claudePath, cliArgs, { env: childEnv });
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
      else if (opts.captureUsage) {
        // JSON envelope: { result, usage:{input_tokens,output_tokens}, total_cost_usd, modelUsage }
        try {
          const j = JSON.parse(out);
          const model = j.model || (j.modelUsage && Object.keys(j.modelUsage)[0]) || null;
          resolve({
            text: (j.result ?? '').toString().trim(),
            usage: {
              inputTokens: j.usage?.input_tokens ?? 0,
              outputTokens: j.usage?.output_tokens ?? 0,
              costUsd: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : undefined,
              model,
            },
          });
        } catch {
          resolve({ text: out.trim(), usage: null }); // tolerate non-JSON; caller falls back to estimate
        }
      } else resolve(out.trim());
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
