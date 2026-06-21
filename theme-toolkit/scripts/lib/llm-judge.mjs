// Headless single-shot LLM verdict via the Claude CLI (subscription, no API key — same mechanism Lens
// judge uses). For gates that need a QUALITY judgment static rules can't make: discovery positioning
// (#13), brand-direction ratification (#16), reuse-ladder blueprint match (#22). PURE-ish: the only
// side effect is the subprocess. Node 20 ESM.
//
// CONTRACT for every caller:
//   1. Gate the call behind an explicit env flag (DISCOVERY_JUDGE=1 etc.) so `pnpm test` is
//      deterministic and the judge never runs unless asked.
//   2. FAIL-OPEN: any spawn error / non-zero exit / unparseable output → returns null. A judge-infra
//      problem must NEVER block a build — the deterministic static gates still run. Callers treat a
//      null verdict as "no opinion", never as a pass or a fail.
//   3. In tests, set CLAUDE_BIN to a stub that prints a fixed JSON verdict.

import { spawnSync } from 'node:child_process'

// Extract the first JSON object from the model's stdout (it may wrap prose around it). null if none.
export function parseVerdict(stdout) {
  const m = String(stdout ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

export function llmJudge({ prompt, bin = process.env.CLAUDE_BIN || 'claude', timeoutMs = 60_000 } = {}) {
  if (!prompt) return null
  try {
    const r = spawnSync(bin, ['-p', prompt], { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 })
    if (r.error || r.status !== 0 || !r.stdout) return null
    return parseVerdict(r.stdout)
  } catch {
    return null
  }
}
