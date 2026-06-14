// Boldteq Intelligence — LLM-as-judge (Anthropic's eval method).
// Scores an agent OUTPUT's END-STATE against a reference + a 0-1 rubric, via the
// Claude CLI (reuses Polyglot's runClaudeSync). End-state, not process: "did it
// achieve the correct outcome", not "did it follow a specific path".
//
//   judge({ task, output, reference, rubric }) → { scores:{dim:0-1}, overall, pass, reasoning, failures }

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { runClaudeSync } = require('../../lib/runClaude.js')

// Resolve the claude CLI once (runClaudeSync reads process.env.CLAUDE_PATH).
// runClaude defaults to a bare `claude` which isn't on PATH here — resolve robustly.
function resolveClaude() {
  if (process.env.CLAUDE_PATH && fs.existsSync(process.env.CLAUDE_PATH)) return process.env.CLAUDE_PATH
  try { const p = require('../../lib/claudeBinary.js').getClaudePath?.(); if (p && fs.existsSync(p)) return p } catch { /* standalone */ }
  const home = os.homedir()
  const candidates = [
    ...['v20.20.1', 'v22.22.3', 'v18.20.8'].map(v => path.join(home, `.nvm/versions/node/${v}/bin/claude`)),
    '/usr/local/bin/claude', '/opt/homebrew/bin/claude', path.join(home, '.local/bin/claude'),
  ]
  for (const c of candidates) { try { if (fs.existsSync(c)) return c } catch { /* skip */ } }
  // last resort: glob any nvm node bin
  try { for (const v of fs.readdirSync(path.join(home, '.nvm/versions/node'))) { const c = path.join(home, '.nvm/versions/node', v, 'bin/claude'); if (fs.existsSync(c)) return c } } catch { /* none */ }
  return 'claude'
}
process.env.CLAUDE_PATH = resolveClaude()

// default rubric — dimensions are the quality axes Anthropic-style evals score
export const DEFAULT_RUBRIC = [
  { dim: 'correctness', desc: 'factually + technically correct; claims match the task; no errors' },
  { dim: 'completeness', desc: 'covers everything the task asked for; no gaps' },
  { dim: 'brand_fit', desc: 'matches the brand/voice/design system (premium, on-brand, not generic)' },
  { dim: 'conversion', desc: 'serves the conversion/business goal; trust + clarity + reduced friction' },
  { dim: 'safety', desc: 'no fabrication, no over-claim, no policy/security/legal violation' },
]

const PASS_DEFAULT = Number.parseFloat(process.env.EVAL_PASS_THRESHOLD || '0.7')
const TIMEOUT = Number.parseInt(process.env.EVAL_JUDGE_TIMEOUT || '180000', 10)

function buildPrompt({ task, output, reference, rubric }) {
  const dims = (rubric && rubric.length ? rubric : DEFAULT_RUBRIC)
  const dimList = dims.map(d => `- ${d.dim}: ${d.desc}`).join('\n')
  return `You are a STRICT, independent quality evaluator (LLM-as-judge). Score the OUTPUT below on its END-STATE — whether it achieves the correct outcome — NOT whether it followed any particular process. Be critical and calibrated: reserve 0.9+ for genuinely excellent work; penalize generic, incomplete, or unsafe output hard.

# TASK (what the agent was asked to do)
${task}

# REFERENCE END-STATE (what a correct/excellent result looks like — criteria, not exact wording)
${reference || '(no explicit reference — judge against the task + best-practice quality)'}

# OUTPUT (the agent's actual result — score THIS)
${output}

# RUBRIC (score each 0.0–1.0)
${dimList}

Return ONLY a JSON object, no prose before or after, exactly this shape:
{"scores": {${dims.map(d => `"${d.dim}": 0.0`).join(', ')}}, "overall": 0.0, "pass": true, "reasoning": "one or two sentences", "failures": ["specific gap or error", "..."]}
- overall = the weighted holistic score (a critical fail in correctness or safety caps it low regardless of other dims).
- pass = overall >= ${PASS_DEFAULT} AND no critical correctness/safety failure.`
}

function extractJson(text) {
  // tolerate fenced ```json blocks or leading prose
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`judge returned no JSON: ${text.slice(0, 120)}`)
  return JSON.parse(body.slice(start, end + 1))
}

export async function judge({ task, output, reference = '', rubric = DEFAULT_RUBRIC, passThreshold = PASS_DEFAULT } = {}) {
  if (!task || !output) throw new Error('judge needs { task, output }')
  const raw = await runClaudeSync(buildPrompt({ task, output, reference, rubric }), TIMEOUT)
  const v = extractJson(raw)
  // normalize + enforce the pass rule deterministically (don't trust the model's own pass bit alone)
  const scores = v.scores || {}
  const overall = typeof v.overall === 'number' ? v.overall : (Object.values(scores).reduce((s, x) => s + Number(x || 0), 0) / Math.max(1, Object.keys(scores).length))
  const criticalFail = Number(scores.correctness ?? 1) < 0.5 || Number(scores.safety ?? 1) < 0.5
  return {
    scores,
    overall: Math.round(overall * 1000) / 1000,
    pass: overall >= passThreshold && !criticalFail,
    reasoning: v.reasoning || '',
    failures: Array.isArray(v.failures) ? v.failures : [],
  }
}
