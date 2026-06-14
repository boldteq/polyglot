'use strict';

// System schedules — built-in HR / automation cycles that run on cron or
// event triggers. Single source of truth for:
//   - Roster nightly recompute (02:00 UTC)
//   - Witness daily sweep (03:00 UTC)
//   - Cadence weekly review (Mon 09:00 UTC)
//   - Tutor weekly training (Sun 02:00 UTC)
//   - Forge monthly capability-gap scan (1st of month 04:00 UTC)
//   - Mira post-build lesson extraction (event-driven, debounced 60s)
//
// All system handlers persist their runs via the stub-then-complete pattern:
//   1. db.insertAgentRunStub(...) creates a 'running' row visible immediately
//      in the drawer + crash-safe (orphan rows reconciled on next boot)
//   2. handler executes
//   3. db.completeAgentRun(runId, {...}) updates the same row to terminal
//      status (success / error / cancelled)
// SSE events fire via agentSync.emitScheduleEvent at start + terminal state.

const { randomUUID } = require('crypto');
const cron = require('node-cron');
const { CronExpressionParser } = require('cron-parser');

const db = require('../db');
const agentSync = require('./agentSync');
const configService = require('./configService');
const { runClaudeSync, buildAgentPrompt, validateAgentExists } = require('./runClaude');

// ── Definitions ────────────────────────────────────────────────────────────

const DEFINITIONS = [
  {
    id: 'sys-roster',
    name: 'Roster nightly recompute',
    description: 'Refresh per-agent experience profiles + skill vectors.',
    cron: '0 2 * * *',
    agentName: 'roster',
    handler: 'rosterRecompute',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-witness',
    name: 'Witness daily sweep',
    description: 'Classify last 24h agent runs, flag PIP/promotion candidates.',
    cron: '0 3 * * *',
    agentName: 'witness',
    handler: 'witnessSweep',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-cadence',
    name: 'Cadence weekly review',
    description: 'Apply promotions, open PIPs, run weekly org health review.',
    cron: '0 9 * * 1',
    agentName: 'cadence',
    handler: 'cadenceReview',
    needsLlm: false,
    cancellable: false,
  },
  {
    id: 'sys-tutor',
    name: 'Tutor weekly training',
    description: 'Read last 7d training signals, apply training patches.',
    cron: '0 2 * * 0',
    agentName: 'tutor',
    handler: 'tutorTraining',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.30 },
  },
  {
    id: 'sys-forge',
    name: 'Forge monthly gap scan',
    description: 'Detect capability gaps, draft new agent templates.',
    cron: '0 4 1 * *',
    agentName: 'forge',
    handler: 'forgeGapScan',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.50 },
  },
  {
    id: 'sys-mira',
    name: 'Mira lesson extraction',
    description: 'Extract lessons after successful build runs (event-driven, 60s debounce).',
    cron: null,
    trigger: 'event:agent_run.build.success',
    agentName: 'mira',
    handler: 'miraExtract',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.02, highUsd: 0.20 },
  },
  {
    id: 'sys-intel-reindex',
    name: 'Intelligence reindex (nightly)',
    description: 'Incrementally re-embed the memory brain into the vector store (Pillar 2 — keeps RAG fresh). Local Ollama, no token cost.',
    cron: '30 2 * * *',
    agentName: 'mira',
    handler: 'intelReindex',
    needsLlm: false,
    cancellable: true,
  },
  {
    id: 'sys-intel-eval',
    name: 'Intelligence eval self-test (weekly)',
    description: 'Run the LLM-as-judge golden self-test (Pillar 3), catch judge drift, ingest scores into eval_scores for Witness.',
    cron: '0 5 * * 0',
    agentName: 'luna',
    handler: 'intelEval',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.05, highUsd: 0.40 },
  },
  {
    id: 'sys-learning-digest',
    name: 'Learning digest (daily)',
    description: "Extract candidate lessons/bugs/decisions/feedback from the day's VS Code sessions; auto-capture high-confidence ones, stage the rest for review.",
    cron: '0 4 * * *',
    agentName: 'mira',
    handler: 'learningDigest',
    needsLlm: true,
    cancellable: true,
    costEstimate: { lowUsd: 0.02, highUsd: 0.25 },
  },
];

const DEFAULT_ENABLED = true;
const HANDLER_TIMEOUT_MS = 5 * 60 * 1000;
const MIRA_DEBOUNCE_MS = 60 * 1000;

// In-memory state
const activeJobs = new Map();      // id → cron job
// inflight: Map<scheduleId, { runId, startedAt, child? }>
const inflight = new Map();
let injectedDeps = null;            // { org, experience, hr, loadRecentAgentRuns }
let miraDebounceTimer = null;
let miraQueuedBuildIds = [];

// ── Public lookup ──────────────────────────────────────────────────────────

function getDefinitions() {
  return DEFINITIONS.slice();
}

function findDefinition(id) {
  return DEFINITIONS.find(d => d.id === id) || null;
}

function isEnabled(id) {
  const override = db.getSystemOverride(id);
  if (override) return !!override.enabled;
  return DEFAULT_ENABLED;
}

// Same shape as user `Schedule` rows so the frontend can render them in the
// same list. `kind:'system'`, plus `nextRunAt` computed via cron-parser, plus
// `builtin:true` flag so UI hides edit/delete affordances.
function getAllForApi() {
  return DEFINITIONS.map(def => {
    const override = db.getSystemOverride(def.id);
    const enabled = override ? !!override.enabled : DEFAULT_ENABLED;
    // Last run is the most recent agent_runs row with this systemId.
    const recent = db.getScheduleRunsFor(def.id, { limit: 1 });
    const last = recent[0] || null;
    return {
      id: def.id,
      kind: 'system',
      builtin: true,
      name: def.name,
      description: def.description,
      agentName: def.agentName,
      prompt: def.description,
      cron: def.cron,
      trigger: def.trigger || null,
      enabled,
      lastRunAt: last?.timestamp || null,
      lastRunStatus: last?.status || null,
      nextRunAt: enabled ? computeNextRunAt(def.cron) : null,
      createdAt: null,
      updatedAt: override?.updatedAt || null,
      needsLlm: !!def.needsLlm,
      cancellable: !!def.cancellable,
      costEstimate: def.costEstimate || null,
    };
  });
}

function setEnabled(id, enabled) {
  const def = findDefinition(id);
  if (!def) throw new Error(`Unknown system schedule: ${id}`);
  const result = db.upsertSystemOverride(id, !!enabled);
  // Restart job in place — start or stop based on new state.
  startJob(def);
  agentSync.emitScheduleEvent('upsert', { id, kind: 'system' });
  return result;
}

// ── Cron next-run helper ───────────────────────────────────────────────────

function computeNextRunAt(cronExpr) {
  if (!cronExpr) return null;
  try {
    const it = CronExpressionParser.parse(cronExpr, { tz: 'Etc/UTC' });
    return it.next().toDate().toISOString();
  } catch {
    return null;
  }
}

// ── Inflight introspection ─────────────────────────────────────────────────

function getInflight() {
  const out = [];
  for (const [id, state] of inflight.entries()) {
    const def = findDefinition(id);
    out.push({
      id,
      kind: 'system',
      runId: state.runId,
      startedAt: state.startedAt,
      agentName: def?.agentName || null,
    });
  }
  return out;
}

function cancelInflight(id) {
  const state = inflight.get(id);
  if (!state) return { ok: false, reason: 'not_running' };
  const def = findDefinition(id);
  if (def && !def.cancellable) return { ok: false, reason: 'not_cancellable' };
  if (state.child && typeof state.child._polyglotCancel === 'function') {
    state.child._polyglotCancel();
    return { ok: true, runId: state.runId };
  }
  return { ok: false, reason: 'no_subprocess' };
}

// ── Handlers ───────────────────────────────────────────────────────────────

const HANDLERS = {
  async rosterRecompute() {
    const { org, experience } = requireDeps();
    const summary = experience.recomputeAllExperience(org);
    return {
      output: `Roster recompute: ${summary.updated}/${summary.total} agents refreshed`,
      metadata: { summary },
    };
  },

  async witnessSweep() {
    const { org, experience, hr, loadRecentAgentRuns } = requireDeps();
    const recent = loadRecentAgentRuns(24);
    const result = hr.runWitnessSweep(org, experience, recent);

    let escalationsAdvanced = 0;
    try {
      const escalation = require('./escalation');
      const advanced = escalation.autoAdvanceExpired();
      escalationsAdvanced = advanced.length;
    } catch (err) {
      console.warn(`[systemSchedules] escalation sweep failed: ${err.message}`);
    }

    try {
      const tasks = require('./tasks');
      tasks.reconcileLoad();
    } catch (err) {
      console.warn(`[systemSchedules] task reconcile failed: ${err.message}`);
    }

    // Pillar 3 → Witness: pull any new LLM-judge scores from eval-runs.jsonl into
    // eval_scores so Witness reasons on the independent judge, not self-report.
    let evalIngested = 0;
    try { evalIngested = (db.ingestEvalRuns() || {}).ingested || 0; } catch (err) {
      console.warn(`[systemSchedules] eval ingest failed: ${err.message}`);
    }

    return {
      output: `Witness sweep: ${result.runsClassified} runs, ${result.pipCandidates.length} PIP, ${result.promotionCandidates.length} promo, ${escalationsAdvanced} escalations advanced, ${evalIngested} eval scores ingested`,
      metadata: { sweep: result, escalationsAdvanced, evalIngested },
    };
  },

  async cadenceReview() {
    const { org, experience, hr, loadRecentAgentRuns } = requireDeps();
    const recent = loadRecentAgentRuns(24 * 7);
    const review = hr.runCadenceReview(org, experience, recent);
    return {
      output: `Cadence weekly review ${review.week}: ${review.promotions.length} promotions, ${review.pipsOpened.length} PIPs`,
      metadata: { review },
    };
  },

  async tutorTraining(def, ctx) {
    if (!validateAgentExists('tutor')) {
      throw new Error('tutor agent .md not found in ~/.claude/agents/');
    }
    const task = [
      'Run the weekly training batch.',
      '1. Read training_signals + training_queue from the last 7 days via the SQLite db (data/polyglot.db).',
      '2. For each signal/queue item, draft a training patch (no edits yet — produce the patch text).',
      '3. Output: a numbered list of (agent, weakness, patch summary, priority).',
      'Keep output ≤ 80 lines. Skip empty queues with a single line.',
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const { output, usage } = await runLLMWithUsage(prompt, ctx);
    return { output, usage, metadata: { llm: true } };
  },

  async forgeGapScan(def, ctx) {
    let gapsCount = 0;
    try {
      const recent = db.getRecentGaps?.(30) || [];
      gapsCount = Array.isArray(recent) ? recent.length : 0;
    } catch {}

    if (!validateAgentExists('forge')) {
      throw new Error('forge agent .md not found in ~/.claude/agents/');
    }

    const task = [
      'Run the monthly capability-gap scan.',
      '1. Survey the last 30 days of dispatch failures + escalations from agent_runs.',
      '2. Identify any role / skill cluster with no qualified agent.',
      '3. For each gap: name the role, skills required, and propose a new agent template (1-paragraph spec).',
      'If no gaps detected, output exactly: "NO_GAPS_DETECTED"',
      `Recent gap-log size: ${gapsCount} entries.`,
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const { output, usage } = await runLLMWithUsage(prompt, ctx);
    return { output, usage, metadata: { llm: true, gapsCount } };
  },

  async miraExtract(def, ctx) {
    const buildIds = ctx?.buildIds || [];
    if (!validateAgentExists('mira')) {
      throw new Error('mira agent .md not found in ~/.claude/agents/');
    }
    const task = [
      'Extract lessons from the recent successful builds.',
      `Build run IDs (last 60s window): ${buildIds.slice(0, 25).join(', ') || '(none — full sweep)'}`,
      '1. For each build, identify reusable patterns + antipatterns + project decisions.',
      '2. Append concise entries (≤6 lines each) to ~/.claude/memory/patterns/good/ and ~/.claude/memory/patterns/avoid/ as appropriate.',
      '3. Update MEMORY.md index entries if new files were added.',
      'Output: short summary of what was extracted (≤30 lines).',
    ].join('\n');
    const prompt = buildAgentPrompt(def.agentName, task);
    const { output, usage } = await runLLMWithUsage(prompt, ctx);
    return { output, usage, metadata: { llm: true, buildIds } };
  },

  // Learning loop: once a day, read the day's VS Code sessions, extract candidate
  // lessons/bugs/decisions/feedback, auto-capture the high-confidence ones and
  // stage the rest in the Learning Inbox for one-click review. Cheap by design:
  // zero sessions → no LLM run; bounded transcript summaries; cheap model tier.
  async learningDigest(def, ctx) {
    const cfg = (k, d) => { const v = configService.getConfig(k); return v === undefined || v === null ? d : v; };
    const mode = cfg('learning.vscode.mode', 'auto'); // auto | review | off
    if (mode === 'off') return { output: 'learning digest: mode=off — skipped', metadata: { skipped: true } };

    const maxSessions = cfg('learning.vscode.maxSessions', 20);
    const maxItems = cfg('learning.vscode.maxItems', 12);
    const maxTranscriptChars = cfg('learning.vscode.maxTranscriptChars', 8000);
    const autoConfidence = cfg('learning.vscode.autoConfidence', 0.8);
    const dedupThreshold = cfg('learning.vscode.dedupThreshold', 0.85);
    const model = cfg('learning.vscode.model', 'claude-haiku-4-5-20251001');

    const sessions = db.getPendingVscodeSessions(24, maxSessions);
    if (!sessions.length) return { output: 'learning digest: no pending sessions', metadata: { sessions: 0 } };

    const blocks = sessions.map((s, i) => buildSessionBlock(s, maxTranscriptChars, i));
    const prompt = buildDigestPrompt(blocks, maxItems);

    const res = await runClaudeSync(prompt, HANDLER_TIMEOUT_MS, {
      onProc: (child) => ctx?.registerProc?.(child),
      captureUsage: true,
      model,
    });
    const { text, usage } = typeof res === 'string' ? { text: res, usage: null } : { text: res.text, usage: res.usage };

    const candidates = parseCandidates(text).slice(0, maxItems);
    const ids = sessions.map((s) => s.sessionId);

    let captured = 0, staged = 0, deduped = 0;
    const { captureItem } = await import('../intelligence/capture.mjs');
    const { retrieve } = await import('../intelligence/retrieve.mjs');

    for (const c of candidates) {
      if (!c || !c.type || !c.title || !VALID_CANDIDATE_TYPES.has(c.type)) continue;
      // Dedup against the brain (local Ollama embeddings → no token cost).
      try {
        const hits = await retrieve(candidateQuery(c), { topK: 3 });
        if (hits[0] && hits[0].score >= dedupThreshold) { deduped++; continue; }
      } catch { /* dedup best-effort — fall through to stage */ }

      const isCaptureType = c.type === 'lesson' || c.type === 'bug' || c.type === 'decision';
      if (mode === 'auto' && isCaptureType && (c.confidence ?? 0) >= autoConfidence) {
        try {
          const r = await captureItem(c.type, c.fields || {});
          db.insertLearningCandidate({ ...toCandidateRow(c), status: 'auto', capturedRef: r.id, reviewedAt: new Date().toISOString() });
          captured++;
          continue;
        } catch { /* capture failed (e.g. Ollama down) → stage for manual approve */ }
      }
      const ins = db.insertLearningCandidate(toCandidateRow(c));
      if (ins.inserted) staged++;
    }

    db.markVscodeSessionsDigested(ids);
    if (staged > 0) { try { agentSync.events.emit('learning.candidate', { staged }); } catch { /* SSE best-effort */ } }

    return {
      output: `learning digest: ${sessions.length} session(s) → ${captured} auto-captured, ${staged} staged, ${deduped} deduped`,
      usage,
      metadata: { llm: true, mode, sessions: sessions.length, captured, staged, deduped },
    };
  },

  // Pillar 2: incrementally re-embed the brain. Spawns the ESM reindex CLI in its
  // own process (isolation) — local Ollama, no token cost. Self-bounded timeout.
  async intelReindex(def, ctx) {
    return runIntelScript('reindex.mjs', [], { ctx, timeoutMs: 10 * 60 * 1000, label: 'reindex' });
  },

  // Pillar 3: weekly judge self-test (catches judge drift) then push scores into
  // eval_scores for the Witness loop.
  async intelEval(def, ctx) {
    const res = await runIntelScript('eval/run-eval.mjs', ['--selftest'], { ctx, timeoutMs: 12 * 60 * 1000, label: 'eval' });
    let ingested = 0;
    try { ingested = (db.ingestEvalRuns() || {}).ingested || 0; } catch (err) { console.warn('[systemSchedules] ingestEvalRuns failed:', err.message); }
    return { output: `${res.output}; ingested ${ingested} eval score(s) into Witness`, metadata: { ...res.metadata, ingested } };
  },
};

// Spawn an ESM intelligence script as a child process, capture a short output
// tail, kill on timeout. Returns { output, metadata } like any handler.
function runIntelScript(relPath, args, { ctx, timeoutMs = 10 * 60 * 1000, label = 'intel' } = {}) {
  const { spawn } = require('child_process');
  const path = require('path');
  const script = path.join(__dirname, '..', 'intelligence', relPath);
  return new Promise((resolve) => {
    let out = '', err = '', done = false;
    const proc = spawn(process.execPath, [script, ...args], { env: { ...process.env } });
    try { ctx?.registerProc?.(proc); } catch { /* best-effort */ }
    const timer = setTimeout(() => { try { proc.kill('SIGTERM'); } catch {} setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 3000); }, timeoutMs);
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', (d) => { err += d.toString(); });
    const finish = (code) => {
      if (done) return; done = true; clearTimeout(timer);
      const tail = (out.trim().split('\n').slice(-3).join(' | ')) || err.trim().slice(0, 200) || `(no output)`;
      resolve({ output: `${label}: exit ${code} — ${tail}`, metadata: { code, label } });
    };
    proc.on('close', finish);
    proc.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); resolve({ output: `${label}: spawn failed — ${e.message}`, metadata: { error: e.message } }); });
  });
}

function requireDeps() {
  if (!injectedDeps) {
    throw new Error('systemSchedules.bootAll(deps) must run before handler dispatch');
  }
  return injectedDeps;
}

// ── Learning digest helpers ──────────────────────────────────────────────────

const VALID_CANDIDATE_TYPES = new Set(['lesson', 'bug', 'decision', 'feedback']);
const CORRECTION_RE = /\b(no,|nope|actually|don'?t|stop|that'?s wrong|not what|incorrect|i told you|use .* instead|never|always)\b/i;

// Build a compact, bounded summary of one VS Code session for the extractor.
// No LLM here — reads the transcript JSONL defensively + this session's agent_runs.
// Falls back to bare facts if the transcript is gone/unreadable.
function buildSessionBlock(s, maxChars, idx) {
  const parts = [];
  parts.push(`### Session ${idx + 1} — project: ${s.project || '(unknown)'} [id: ${s.sessionId}]`);
  parts.push(`facts: ${s.turnCount || 0} turns, ${s.editCount || 0} edits, ${s.bashCount || 0} shell cmds`);

  // Agent sub-runs that belonged to this session (best-effort join).
  try {
    const runs = db.getAgentRunsBySession(s.sessionId).slice(0, 12);
    if (runs.length) {
      parts.push('agent runs: ' + runs.map((r) => `${r.agentName}:${r.status}`).join(', '));
    }
  } catch { /* ignore */ }

  // Transcript: pull user-correction lines + touched files + last assistant note.
  try {
    const fs = require('fs');
    if (s.transcriptPath && fs.existsSync(s.transcriptPath)) {
      const lines = fs.readFileSync(s.transcriptPath, 'utf-8').split('\n').filter(Boolean);
      const corrections = [];
      const files = new Set();
      let lastAssistant = '';
      for (const line of lines) {
        let obj; try { obj = JSON.parse(line); } catch { continue; }
        const msg = obj.message || obj;
        const role = msg.role || obj.type;
        const content = msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && typeof block.text === 'string') {
              if (role === 'user' && CORRECTION_RE.test(block.text)) corrections.push(block.text.trim().slice(0, 240));
              if (role === 'assistant') lastAssistant = block.text.trim().slice(0, 400);
            } else if (block.type === 'tool_use' && (block.name === 'Edit' || block.name === 'Write')) {
              const fp = block.input && (block.input.file_path || block.input.path);
              if (fp) files.add(String(fp));
            }
          }
        } else if (typeof content === 'string' && role === 'user' && CORRECTION_RE.test(content)) {
          corrections.push(content.trim().slice(0, 240));
        }
      }
      if (files.size) parts.push('files touched: ' + [...files].slice(0, 15).join(', '));
      if (corrections.length) parts.push('user corrections:\n- ' + corrections.slice(0, 6).join('\n- '));
      if (lastAssistant) parts.push('last assistant summary: ' + lastAssistant);
    }
  } catch { /* transcript unreadable — facts above are enough */ }

  return parts.join('\n').slice(0, maxChars);
}

// The strict-JSON extraction prompt. We do NOT load Mira's file-writing system
// prompt here — the digest must return data, not write files (we capture).
function buildDigestPrompt(blocks, maxItems) {
  return [
    'You are a senior knowledge analyst reviewing a developer\'s VS Code coding sessions from today.',
    'Extract ONLY genuinely reusable knowledge that would help future work — not routine activity.',
    '',
    'Return STRICT JSON: an array (≤ ' + maxItems + ' items) of candidates. Write NO files. Use NO tools. Output ONLY the JSON array, nothing else.',
    'If nothing is worth saving, return exactly: []',
    '',
    'Each candidate object:',
    '{',
    '  "type": "lesson" | "bug" | "decision" | "feedback",',
    '  "title": "short title (≤100 chars)",',
    '  "confidence": 0.0-1.0,   // how clearly reusable + correct this is',
    '  "sourceSessionId": "the session id it came from",',
    '  "project": "the project name",',
    '  "fields": { ... }        // see per-type fields below',
    '}',
    'Fields by type:',
    '  lesson   → { "domain", "problem", "root_cause", "solution", "prevention" }',
    '  bug      → { "severity" (S1-S4), "symptom", "root_cause", "fix", "prevention" }',
    '  decision → { "scope", "situation", "decision", "thinking", "alternatives", "outcome" }',
    '  feedback → { "directive" (the rule/correction to always follow), "context" }  // use for moments where the user CORRECTED the agent',
    '',
    'Guidance: a "feedback" candidate is for a durable preference/correction the user gave (a rule for next time). A "lesson"/"bug"/"decision" is reusable technical knowledge. Prefer fewer, higher-quality items. Be honest with confidence.',
    '',
    'The sessions:',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

// Tolerant JSON parse: strip code fences, slice to the outermost array.
function parseCandidates(text) {
  if (!text || typeof text !== 'string') return [];
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function candidateQuery(c) {
  const f = c.fields || {};
  if (c.type === 'lesson') return `${f.problem || c.title} ${f.solution || ''}`.trim();
  if (c.type === 'bug') return `${f.symptom || c.title} ${f.fix || ''}`.trim();
  if (c.type === 'decision') return `${f.decision || c.title} ${f.situation || ''}`.trim();
  if (c.type === 'feedback') return `${f.directive || c.title}`.trim();
  return c.title;
}

function toCandidateRow(c) {
  return {
    type: c.type,
    title: c.title,
    payload: c.fields || {},
    source: 'vscode-session',
    sessionId: c.sourceSessionId || null,
    project: c.project || null,
    confidence: Number.isFinite(c.confidence) ? c.confidence : 0,
  };
}

// Pillar 1: run the LLM capturing REAL token usage; tolerate a string fallback
// if the CLI's JSON envelope ever fails to parse (caller then uses the estimate).
async function runLLMWithUsage(prompt, ctx) {
  const res = await runClaudeSync(prompt, HANDLER_TIMEOUT_MS, {
    onProc: (child) => ctx?.registerProc?.(child),
    captureUsage: true,
  });
  return typeof res === 'string' ? { output: res, usage: null } : { output: res.text, usage: res.usage };
}

// ── Dispatch ───────────────────────────────────────────────────────────────

// Run a system handler. Inserts stub row → emits start → invokes handler →
// completes row → emits terminal SSE. Returns the inflight descriptor
// immediately if caller passes `{ async: true }` — promise resolves to the
// final run record otherwise.
async function runHandler(id, opts = {}) {
  const def = findDefinition(id);
  if (!def) throw new Error(`Unknown system schedule: ${id}`);

  if (inflight.has(id)) {
    return { skipped: true, reason: 'inflight', runId: inflight.get(id).runId };
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Stub row visible immediately — crash-safe.
  try {
    db.insertAgentRunStub({
      id: runId,
      agentName: def.agentName || 'system',
      prompt: def.description || '',
      source: 'system-schedule',
      metadata: { systemId: def.id, handler: def.handler },
    });
  } catch (err) {
    console.error('[systemSchedules] stub insert failed:', err.message);
    throw err;
  }

  const ctx = {
    runId,
    buildIds: opts.buildIds,
    registerProc: (child) => {
      const state = inflight.get(id);
      if (state) state.child = child;
    },
  };

  inflight.set(id, { runId, startedAt, child: null });
  agentSync.emitScheduleEvent('start', {
    id, kind: 'system', name: def.name, agentName: def.agentName,
    startedAt, runId,
  });

  const finish = (status, result = {}) => {
    const duration = Date.now() - startTime;
    try {
      db.completeAgentRun(runId, {
        status,
        duration,
        output: result.output || '',
        error: result.error || null,
        metadataPatch: result.metadata || {},
        usage: result.usage || null, // Pillar 1: REAL token cost when present
      });
    } catch (err) {
      console.error('[systemSchedules] completeAgentRun failed:', err.message);
    }
    const evt = status === 'success' ? 'complete' : status === 'cancelled' ? 'cancelled' : 'error';
    agentSync.emitScheduleEvent(evt, {
      id, kind: 'system', status, runId,
      lastRunAt: startedAt, duration, error: result.error,
    });
    inflight.delete(id);
    return { ok: status === 'success', runId, status, duration, output: result.output, error: result.error };
  };

  // Fire-and-forget wrapper used when caller wants async (the run-now route
  // returns 202 immediately while this resolves in background).
  const exec = async () => {
    try {
      const handler = HANDLERS[def.handler];
      if (!handler) throw new Error(`Handler not implemented: ${def.handler}`);
      const result = await handler(def, ctx);
      console.log(`[systemSchedule] ${def.id} ✓ — ${result?.output?.split('\n')[0] || ''}`);
      return finish('success', { output: result?.output, metadata: result?.metadata });
    } catch (err) {
      const status = err.cancelled ? 'cancelled' : 'error';
      console.warn(`[systemSchedule] ${def.id} ${status === 'cancelled' ? '⊘' : '✗'} — ${err.message}`);
      return finish(status, { error: err.message, metadata: { trace: (err.stack || '').slice(0, 500) } });
    }
  };

  if (opts.async) {
    setImmediate(() => { exec().catch(e => console.warn(`[systemSchedule] ${id} unhandled: ${e.message}`)); });
    return { ok: true, runId, status: 'started', kind: 'system' };
  }

  return exec();
}

function startJob(def) {
  if (activeJobs.has(def.id)) {
    try { activeJobs.get(def.id).stop(); } catch {}
    activeJobs.delete(def.id);
  }
  if (!isEnabled(def.id)) return;
  if (!def.cron) return;
  if (!cron.validate(def.cron)) {
    console.warn(`[systemSchedule] invalid cron — skipping: ${def.id} "${def.cron}"`);
    return;
  }
  const job = cron.schedule(def.cron, () => {
    runHandler(def.id, { async: false }).catch(err =>
      console.warn(`[systemSchedule] ${def.id} unhandled: ${err.message}`)
    );
  }, { timezone: 'Etc/UTC' });
  activeJobs.set(def.id, job);
}

// ── Event-driven Mira trigger ──────────────────────────────────────────────

function onBuildSuccessEvent(payload) {
  if (!payload) return;
  if (payload.source !== 'build') return;
  if (payload.status !== 'success') return;
  if (!isEnabled('sys-mira')) return;

  if (payload.runId) miraQueuedBuildIds.push(payload.runId);
  if (miraDebounceTimer) clearTimeout(miraDebounceTimer);
  miraDebounceTimer = setTimeout(() => {
    const ids = miraQueuedBuildIds.slice();
    miraQueuedBuildIds = [];
    miraDebounceTimer = null;
    runHandler('sys-mira', { buildIds: ids, async: true }).catch(err =>
      console.warn(`[systemSchedule] sys-mira unhandled: ${err.message}`)
    );
  }, MIRA_DEBOUNCE_MS);
}

// ── Boot / shutdown ────────────────────────────────────────────────────────

function bootAll(deps = {}) {
  injectedDeps = deps;
  let active = 0;
  let disabled = 0;
  for (const def of DEFINITIONS) {
    if (def.cron) {
      if (isEnabled(def.id) && cron.validate(def.cron)) {
        startJob(def);
        active += 1;
      } else if (!isEnabled(def.id)) {
        disabled += 1;
      }
    }
  }
  agentSync.events.on('agent_run.recorded', onBuildSuccessEvent);

  // Log retention — 03:15 UTC nightly. Plain DB op, no LLM, no agent_runs stub.
  startLogRetentionJob();

  console.log(`  System schedules: ${active} cron-driven active, ${disabled} disabled, sys-mira event-listener wired, log-retention nightly`);
}

let _logRetentionJob = null;
function startLogRetentionJob() {
  if (_logRetentionJob) { try { _logRetentionJob.stop(); } catch {} }
  _logRetentionJob = cron.schedule('15 3 * * *', () => {
    try {
      const r = db.pruneErrorLog({ resolvedDays: 7, allDays: 30 });
      const log = require('./logger');
      log.info('log retention pruned', { category: 'schedule', meta: r });
    } catch (err) {
      const log = require('./logger');
      log.error(err, { category: 'schedule', meta: { handler: 'logRetention' } });
    }
  }, { timezone: 'Etc/UTC' });
}

function stopAll() {
  for (const [id, job] of activeJobs.entries()) {
    try { job.stop(); } catch {}
    activeJobs.delete(id);
  }
  if (miraDebounceTimer) {
    clearTimeout(miraDebounceTimer);
    miraDebounceTimer = null;
  }
  if (_logRetentionJob) { try { _logRetentionJob.stop(); } catch {} _logRetentionJob = null; }
  try { agentSync.events.off('agent_run.recorded', onBuildSuccessEvent); } catch {}
}

module.exports = {
  bootAll,
  stopAll,
  runHandler,
  setEnabled,
  isEnabled,
  getAllForApi,
  getDefinitions,
  findDefinition,
  computeNextRunAt,
  getInflight,
  cancelInflight,
  _activeJobs: activeJobs,
  _inflight: inflight,
};
