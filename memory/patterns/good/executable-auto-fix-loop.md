# Executable Auto-Fix Loop — Factory Protocol

**Locked:** 2026-04-11
**Runtime:** Claude Code in VS Code (per Yash confirmation)
**Supersedes:** the prose version in `universal-auto-fix-loop.md` where they conflict.

This file is the single source of truth for C1/C2/C3 (self-research, auto-fix, retry policy) across all 21 agents. Every agent's done-gate calls this protocol.

---

## Agent classes

| Class | Agents | Max retries | Wall-clock cap | Cost cap |
|---|---|---|---|---|
| **BUILDER** | Koda, Riko, Vega, Quill, Vex | 5 | 25 min | $5 |
| **GATE** | Sage, Luna, Bolt, Hawk | 3 | 15 min | $3 |
| **PLANNER** | Arya, Yash, Nova, Scout, Atlas, Ledger, Verdict | 3 | 15 min | $3-4 |
| **INSIGHT** | Pulse, Orbit, Echo, Mira, Zeph | 3 | 10 min | $3 |

(Exception: Arya's cap is $4, 90 min — architecture is high-leverage. Locked in arya.md.)

---

## The loop (pseudocode every agent implements)

```python
def agent_execute(task):
    # Phase 0: load context
    load_first_load_manifest()
    apply_decision_simulator_defaults(task)

    # Phase 1: produce first output
    output = produce(task)

    # Phase 2: self-validate + auto-fix
    attempt = 0
    max_retries = MAX_RETRIES[agent_class]
    wall_clock_start = now()
    cost_start = current_cost()

    while attempt < max_retries:
        result = run_self_validation(output)

        if result.all_pass:
            break

        # Cost circuit breaker
        if current_cost() - cost_start > COST_CAP[agent_class]:
            halt_with_checkpoint(output, reason="cost_cap_exceeded")
            escalate_to_rex(task, output, result)
            return

        # Wall-clock circuit breaker
        if now() - wall_clock_start > WALL_CLOCK_CAP[agent_class]:
            halt_with_checkpoint(output, reason="time_cap_exceeded")
            escalate_to_rex(task, output, result)
            return

        # Fix the first failing check
        first_failure = result.failures[0]
        fix_strategy = FIX_TABLE[first_failure.code]
        output = fix_strategy(output, first_failure)

        attempt += 1

    if attempt >= max_retries and not result.all_pass:
        escalate_to_rex(
            task=task,
            output=output,
            failures=result.failures,
            attempts=attempt
        )
        return

    # Phase 3: ship
    commit_artifacts(output)
    log_decision(task, output)
    handoff_to_next_agent(output)
```

---

## Self-validation contract

Every agent's self-validation MUST return this shape:

```json
{
  "all_pass": false,
  "checks": [
    { "name": "tsc_strict", "status": "pass" },
    { "name": "eslint", "status": "pass" },
    { "name": "vitest", "status": "fail", "error": "5 tests failed", "detail": "..." },
    { "name": "playwright", "status": "skip", "reason": "no e2e paths touched" }
  ],
  "failures": [ { "code": "vitest", "error": "...", "fix_hint": "..." } ]
}
```

No check may be "partial" — only `pass | fail | skip`. Skip requires a reason.

---

## Standard fix table (shared across agents)

| Failure code | Fix strategy |
|---|---|
| `tsc_strict` | Run `pnpm tsc --noEmit`, parse errors, fix types file-by-file |
| `eslint` | Run `pnpm eslint --fix`, handle remaining manually |
| `vitest_fail` | Re-read failing test, identify assertion, fix source (not test) unless test is wrong |
| `vitest_coverage` | Identify uncovered lines, add tests for them (Luna) |
| `playwright_fail` | Screenshot + trace → identify selector/timing → fix component or update test |
| `lighthouse_lcp` | Inspect slowest resource → add priority hint / preload / lazy strategy |
| `lighthouse_cls` | Find layout shift → set explicit width/height / reserve space |
| `lighthouse_a11y` | Run axe-core → fix contrast, labels, focus |
| `rls_missing` | Add default workspace_id policy |
| `zod_missing` | Wrap route handler input with inferred zod schema |
| `rate_limit_missing` | Apply default `rateLimit.check(req, '<route>', 10)` |
| `secret_hardcoded` | Extract to env var, add to `.env.example` |
| `accessibility_contrast` | Raise text-neutral-X to next step up, rerun axe |
| `readability_too_complex` | Split sentences, remove subordinate clauses, retry until grade ≤8 |
| `forbidden_word` | Replace with approved alternative from copy library |
| `missing_test` | Generate test from contract, run, commit |
| `stale_snapshot` | Update snapshot only if diff is intentional (human approve) or regenerate baseline |
| `bundle_too_large` | Identify top 3 imports → dynamic import or replace |
| `n_plus_one` | Convert to `.select('*, relation(*)')` join |
| `missing_error_boundary` | Wrap route with `error.tsx` |
| `missing_loading_state` | Add `loading.tsx` or `<Suspense>` |

Agents extend this table with agent-specific fixes. Extensions live in each agent file.

---

## Cost circuit breaker — details

Per-dispatch cost is tracked by the runtime. When a dispatch exceeds its cap:

1. **Halt immediately** — don't finish the current step.
2. **Checkpoint** — write current output to `<project>/.arya-checkpoint.json` (or agent-specific file).
3. **Summarize** — agent writes 1-paragraph "what's done vs pending" to stdout.
4. **Escalate** — Yash receives the checkpoint and decides: retry with higher cap, split into smaller tasks, or escalate to Yash.

The per-BUILD cap is $15 total across all agents. Yash tracks running total and prioritizes gates (Sage, Luna) over polish (Vega iteration) if budget is thin.

---

## Wall-clock circuit breaker — details

Identical to cost breaker but trips on elapsed time. Builder agents get 25 min because complex refactors genuinely take that long. Gates get 15 min because if a gate can't tell you in 15 min whether something passes, the gate is broken.

Timers persist across retries in the same dispatch — 5 retries inside 25 min is the rule, not 5 × 25 min.

---

## Escalation payload (what Yash receives when a loop gives up)

```json
{
  "agent": "koda",
  "task_id": "abc123",
  "attempts": 5,
  "last_output_checkpoint": "path/to/checkpoint.json",
  "failing_checks": [
    { "code": "playwright_fail", "error": "...", "fix_attempts_tried": ["selector_update", "timing_wait", "component_refactor"] }
  ],
  "cost_used_usd": 5.12,
  "time_used_min": 24.3,
  "recommendation": "escalate_to_human | retry_with_higher_cap | split_task | kill"
}
```

Yash reads this and decides next move per `patterns/good/yash-model-routing.md`.

---

## Git autonomy during auto-fix

Per Yash (2026-04-11), agents have **full git autonomy on feature branches**:

- Create branch: `agent/<agent-name>/<task-slug>-<timestamp>`
- Commit after each passing retry: `fix(<scope>): <1-line>` (conventional commits)
- Push to origin after loop exits successfully
- Open draft PR via `gh pr create --draft --title "..." --body "..."` on success
- **NEVER** touch `main` directly
- **NEVER** force-push
- **NEVER** rewrite shared history

Mira sweeps all `agent/*` branches weekly; merged ones are deleted automatically.

---

## Parallel execution (Koda specifically)

Koda may run up to **3 concurrent features** per sprint (per Yash 2026-04-11). Each feature:

1. Gets its own branch
2. Gets its own auto-fix loop with independent retry counters
3. Uses file-level locks in `.koda/locks/<path>` to prevent two features editing the same file
4. Reports back to Yash independently; Yash serializes merges

If two Koda threads need the same file → the later thread waits, Yash serializes.

---

## Delta vs previous prose version

- **Was:** 5-paragraph description of "try, check, fix, retry" with no concrete checks, no fix table, no caps
- **Now:** executable protocol with class-based caps, standard fix table, escalation JSON, git rules, parallel rules
- **Expected C2 lift:** every agent should move from 5-6 → 8-9 on the C2 dimension because the loop is now testable
