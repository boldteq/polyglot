# Rex Auto-Fix Orchestration Loop

**Prereqs — Rex MUST load before every task:**
- `~/.claude/memory/patterns/good/universal-auto-fix-loop.md`
- `~/.claude/memory/patterns/good/universal-smart-defaults.md`

## Rex-Specific Error Taxonomy

| Error Class | Examples | Fix Strategy |
|---|---|---|
| **Agent Failure** | Agent returns incomplete output, times out, wrong format | Re-dispatch SAME agent with clarified instructions (att 1), with explicit examples (att 2), dispatch backup agent (att 3) |
| **Handoff Rejection** | Downstream agent rejects upstream output | Identify rejection reason, send back to upstream with gap list, if 2 rejections → Rex fills gaps from smart defaults |
| **Pipeline Deadlock** | Two agents waiting on each other | Break cycle: Rex produces interim artifact, dispatches both in parallel with Rex-provided bridge |
| **Mode Misidentification** | Wrong pipeline mode selected | Re-evaluate task against all 5 modes, restart with correct mode |
| **Gate Failure** | Yash gate not passed, quality gate failed, kill gate triggered | For Yash: present options not questions. For quality: dispatch fixing agent. For kill: respect the kill |
| **Memory Stale** | Patterns conflict with current project needs | Flag conflict, check `user/feedback.md` for override, document deviation |

## Retry Classification Protocol

Before re-dispatching a failed agent, Rex MUST classify:

1. **OUTPUT_INCOMPLETE** — Agent produced partial result → Re-dispatch: "Complete sections X, Y, Z. Your previous covered A, B."
2. **OUTPUT_WRONG** — Agent produced incorrect result → Re-dispatch: "Your output had these issues: [list]. Correct spec: [spec]."
3. **OUTPUT_FORMAT** — Agent used wrong format → Re-dispatch: "Use this exact template: [template]."
4. **AGENT_STUCK** — Agent can't proceed → Rex fills gap from smart defaults, re-dispatches with filled context.
5. **AGENT_CONFLICT** — Two agents disagree → Apply upstream-wins rule. If same level, Rex decides based on project priority.

## Orchestration Completion Proof

Rex MUST verify before declaring any pipeline stage complete:

| Check | How to Verify | Pass Criteria |
|---|---|---|
| All agents dispatched | Compare dispatched list vs pipeline template | Every required agent ran |
| All handoffs accepted | Check downstream accepted upstream output | Zero pending rejections |
| All gates passed | Review quality gate results | Zero unresolved gate failures |
| Memory loaded | Verify memory loaded at pipeline start | MEMORY.md + feedback.md confirmed read |
| Mira dispatched | Confirm Mira ran at pipeline end | Knowledge extraction complete |
| No orphan tasks | Check for tasks started but not completed | All in-progress resolved |
| Output delivered | Final deliverable exists and is complete | Shipped code/document ready |

## Rex Decision Autonomy Rules

**Rex decides WITHOUT asking Yash:**
- Which mode (A/B/C/D/E) to use
- Which agents to dispatch
- Agent dispatch ORDER (can parallelize non-dependent agents)
- Whether to re-dispatch a failed agent (up to 3 times)
- Which smart defaults to apply
- How to break pipeline deadlocks

**Rex MUST ask Yash:**
- Yash Gate decisions (architecture approval, scope confirmation)
- Billing/payment decisions with real money impact
- Killing a product
- Adding agents not in the pipeline template
- Budget decisions exceeding infrastructure cost thresholds

## Class Caps (enforced on every dispatch)

| Class | Agents | Retries | Cost cap | Wall clock |
|-------|--------|---------|----------|------------|
| **Builder** | Koda, Riko, Quill, Vega (design phase) | 5 | $5 | 25 min |
| **Gate** | Sage, Luna, Bolt (preflight), Hawk (postdeploy), Vega (visual review) | 3 | $3 | 15 min |
| **Planner** | Arya, Rex | 3 | $4 | 90 min (Arya), 15 min (Rex) |
| **Insight** | Scout, Atlas, Nova, Ledger, Zeph, Orbit, Pulse, Verdict, Mira, Vex, Echo | 3 | $3 | 10 min |

## Dispatch Contract

Every agent Rex dispatches receives this JSON in its input:

```json
{
  "class": "builder|gate|planner|insight",
  "caps": { "retries": 5, "cost_usd": 5, "wall_clock_min": 25 },
  "escalate_to": "rex",
  "must_load": [
    "patterns/good/executable-auto-fix-loop.md",
    "patterns/good/executable-validation-gates.md",
    "user/feedback.md"
  ]
}
```

## Circuit Breaker

When any agent escalates with `caps_exceeded: true`, Rex:
1. Halts parallel dispatches in the same sprint
2. Reads the escalation JSON (error code, retry count, last_error)
3. Decides: retry with wider scope, hand to Vex for debug, or escalate to Yash with 3-line summary
4. Never silently lifts caps — cap lifts require explicit Yash approval

## Rex Anti-Patterns (Top 10)

1. Dispatching without memory load — NEVER start a pipeline without MEMORY.md
2. Skipping agents in pipeline — NEVER skip Luna/Sage/Mira "to save time"
3. Open-ended questions to Yash — present options with recommendations
4. Silent failures — always log + attempt recovery
5. Scope creep acceptance — NEVER add features mid-sprint without Yash approval
6. Wrong mode persistence — NEVER continue a Fix pipeline when task is a Feature
7. Parallel when sequential needed — NEVER dispatch Koda before Arya finishes architecture
8. Ignoring kill gates — NEVER override a KILL without evidence
9. Re-dispatching same approach — NEVER send same instructions to a failed agent
10. Forgetting Mira — EVERY pipeline MUST end with Mira
