# Boldteq Eval — LLM-as-judge (Pillar 3)

Independent quality evaluation of agent output. Replaces self-report. Anthropic's method:
score the **end-state** (did it achieve the right outcome) on a 0–1 rubric, against a small
golden set — not "did the agent follow a process."

## Pieces
- `judge.mjs` — the judge. `judge({task, output, reference, rubric})` → `{scores, overall, pass, reasoning, failures}`.
  Scores 5 dims (correctness · completeness · brand_fit · conversion · safety). Pass-gate is
  **deterministic**: `overall ≥ 0.7 AND no critical fail` (correctness<0.5 or safety<0.5 caps it).
  Runs via Claude CLI (`runClaudeSync`); resolves the binary robustly (sets `CLAUDE_PATH`).
- `run-eval.mjs` — the harness. Self-test (calibration) + score (production) + durable log.
- `golden/*.json` — golden cases. Each: `{id, task_type, agent, niche, task, reference, fixtures:{good,bad}}`.
  `reference` = the rubric/criteria for an excellent end-state. `fixtures` = a known good + bad output
  used to calibrate the judge.

## Usage
```bash
node src/intelligence/eval/run-eval.mjs --list                      # list cases
node src/intelligence/eval/run-eval.mjs --selftest                  # calibrate judge on all cases
node src/intelligence/eval/run-eval.mjs --selftest --case <id>      # one case
echo "<agent output>" | node src/intelligence/eval/run-eval.mjs --score <id> --output -
```
Use Node 20 (`~/.nvm/versions/node/v20.20.1/bin/node`) — matches the rest of Polyglot.

## What "good" looks like (proven 2026-06-14)
6/6 golden cases calibrated 100%, **mean separation 0.818**. Graded, not binary:
bad 0.18 < mediocre 0.32 < good 0.90; a 0.90→0.32 regression is caught as FAIL.

## The Witness seam (wiring into the loop)
Every run appends one JSON line to `data/intel/eval-runs.jsonl`:
- `{kind:"selftest", accuracy, meanSeparation, results:[…]}`
- `{kind:"score", case, agent, task_type, overall, pass, scores, reasoning, failures}`

The Witness/feedback loop **tails this file** and uses the `score` records (independent judge)
in place of agent self-report. Full Witness wiring + an `eval` cron in `systemSchedules.js`
land with **Pillar 1 (observability)** — they need the SDK's run-recording to attach a judge
score to a specific `agent_run`. Until then the log is the durable interface.

## Growing the set
Start small, grow. Add a `golden/<id>.json` per critical agent/task type (target ~20). Each new
case must pass `--selftest` (good>bad, good passes, bad fails) before it counts — that keeps the
judge honest and the rubric discriminating.
