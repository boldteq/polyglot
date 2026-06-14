'use strict';

// Durable auto-retry policy (Pillar 4). Classify transient vs permanent failures,
// retry transient ones with exponential backoff + full jitter, bounded by a
// per-run budget (the cost circuit-breaker from executable-auto-fix-loop.md).
//
// Pure + injectable (sleep, rng, classify) so it unit-tests with no timers/LLM.

const DEFAULTS = { maxAttempts: 3, baseMs: 1000, capMs: 30000 };

// Permanent failures must NOT be retried — they waste wall-clock + token cost and
// will fail identically. Everything else is treated as transient (retryable).
function isPermanentError(err) {
  if (!err) return false;
  if (err.cancelled || err.permanent === true) return true;       // operator cancel / explicit
  if (err.code === 'MODEL_ROUTING_BLOCKED') return true;          // policy veto (db.enforceModelPolicy)
  const m = String(err.message || err).toLowerCase();
  // Require CONTEXT, not bare keywords — "invalid"/"not found" alone can be
  // transient (e.g. "invalid chunk encoding", DNS "host not found"). Only the
  // resolution/auth/config classes are genuinely permanent + worth not retrying.
  return (
    /agent .*not found|not found in|missing agentname|no agentname|has no agentname/.test(m) ||
    /\bvalidation\b|unauthorized|forbidden|permission denied|invalid (agent|model|api|request|argument|parameter|schema|json|config|token)/.test(m) ||
    /enoent|command not found|cannot find module/.test(m)
  );
}

// Full-jitter exponential backoff, capped. `attempt` is 1-based — this is the
// delay BEFORE attempt+1. Jitter avoids thundering-herd on shared rate limits.
function backoffMs(attempt, { baseMs = DEFAULTS.baseMs, capMs = DEFAULTS.capMs } = {}, rng = Math.random) {
  const exp = Math.min(capMs, baseMs * Math.pow(2, attempt - 1));
  return Math.round(exp / 2 + rng() * (exp / 2));
}

// Shared retry budget across a whole run = cost circuit-breaker. Once exhausted,
// further failures are not retried (they escalate to 'failed').
function createBudget(max = 6) {
  let used = 0;
  return {
    remaining: () => Math.max(0, max - used),
    spend: () => { used += 1; },
    used: () => used,
    max,
  };
}

// Run fn(attempt) with auto-retry. Retries transient failures up to maxAttempts,
// honoring an optional shared budget. onRetry({attempt,nextAttempt,delayMs,error,permanent})
// fires before each backoff sleep (observability hook). Throws the LAST error when
// it gives up. `sleep` + `rng` + `classify` are injectable for deterministic tests.
async function withRetry(fn, opts = {}) {
  const {
    maxAttempts = DEFAULTS.maxAttempts,
    baseMs = DEFAULTS.baseMs,
    capMs = DEFAULTS.capMs,
    budget = null,
    onRetry = null,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    rng = Math.random,
    classify = isPermanentError,
  } = opts;

  let lastErr = new Error('withRetry: no attempts run (maxAttempts < 1)');
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const permanent = classify(err);
      const budgetOk = !budget || budget.remaining() > 0;
      const willRetry = attempt < maxAttempts && !permanent && budgetOk;
      if (!willRetry) break;
      if (budget) budget.spend();
      const delayMs = backoffMs(attempt, { baseMs, capMs }, rng);
      if (onRetry) { try { onRetry({ attempt, nextAttempt: attempt + 1, delayMs, error: err, permanent }); } catch { /* never let a hook break retry */ } }
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

module.exports = { withRetry, isPermanentError, backoffMs, createBudget, DEFAULTS };
