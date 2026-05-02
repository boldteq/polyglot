# Universal Auto-Fix Loop Protocol

**Loaded by:** ALL 21 agents
**Purpose:** When something fails, agents diagnose and fix autonomously instead of stopping or escalating immediately.

---

## Core Rule

**5 retries before escalating to Yash. Each retry must be a DIFFERENT approach, not the same thing again.**

---

## The Loop

```
ATTEMPT = 0
MAX_ATTEMPTS = 5

while ATTEMPT < MAX_ATTEMPTS:
  1. EXECUTE the task
  2. VALIDATE the output (run checks, build, test, visual review)
  3. If PASS → done, hand off
  4. If FAIL:
     a. CLASSIFY the error (see Error Taxonomy below)
     b. SELECT fix strategy for that error class
     c. APPLY fix
     d. ATTEMPT += 1
     e. LOG: "Attempt {ATTEMPT}: Error was [X], tried [Y], result [Z]"
     f. Loop back to step 1

If ATTEMPT == MAX_ATTEMPTS:
  ESCALATE to Yash with:
  - What was attempted (all 5 approaches)
  - What each attempt produced
  - Root cause hypothesis
  - Recommended next step
```

---

## Error Taxonomy (Universal)

Every agent classifies errors into these categories before attempting a fix:

| Error Class | Examples | Fix Strategy |
|---|---|---|
| **Syntax/Type** | TypeScript errors, missing imports, wrong types | Auto-fix: read error message, fix the exact line, re-run |
| **Logic** | Wrong output, missing edge case, broken flow | Re-read requirements, trace the logic, fix the specific condition |
| **Configuration** | Missing env var, wrong port, bad config value | Check .env.example, compare local vs production, add missing config |
| **Dependency** | Package conflict, peer dep mismatch, version issue | Check package.json, resolve conflict, install one-at-a-time |
| **Integration** | API returns unexpected data, CORS, auth failure | Check API docs, verify request format, test with curl/manual call |
| **Performance** | Slow query, memory leak, excessive re-renders | Profile first (don't guess), fix the measured bottleneck |
| **Data** | Empty state, null reference, stale cache | Add null checks, handle empty arrays, clear cache and retry |
| **Infrastructure** | Build fails in CI, deploy timeout, cold start | Check CI logs, compare local vs CI environment, increase timeout |

---

## Fix Strategy Rules

1. **Never retry the exact same approach** — if it failed once, it will fail again
2. **Read the error message fully** — 80% of fixes are in the error output
3. **Fix one thing at a time** — don't change 5 things hoping one works
4. **Verify after each fix** — run build/test/check before declaring fixed
5. **Log every attempt** — future agents (and Mira) learn from your fix history

---

## Escalation Format (after 5 attempts)

```markdown
## Escalation: [Task Name]

**Status:** Failed after 5 autonomous fix attempts
**Error Class:** [from taxonomy]
**Root Cause Hypothesis:** [your best guess]

### Attempt Log
1. **Attempt 1:** Tried [X] → Result: [Y]
2. **Attempt 2:** Tried [X] → Result: [Y]
3. **Attempt 3:** Tried [X] → Result: [Y]
4. **Attempt 4:** Tried [X] → Result: [Y]
5. **Attempt 5:** Tried [X] → Result: [Y]

### Recommendation
[What you think should happen next]

### Files Affected
[List of files touched during fix attempts]
```

---

## Agent-Specific Extensions

Each agent adds domain-specific error classes ON TOP of the universal taxonomy:
- **Koda:** Adds React-specific errors (hook rules, render cycle, key props)
- **Bolt:** Adds deploy-specific errors (DNS, SSL, CDN, rollback triggers)
- **Luna:** Adds test-specific errors (flaky tests, mock failures, timeout)
- **Sage:** Adds audit-specific errors (false positives, severity miscalculation)
- **Vega:** Adds design-specific errors (contrast fail, breakpoint mismatch, token conflict)
- **Quill:** Adds copy-specific errors (voice mismatch, readability fail, banned words)
- **Zeph:** Adds SEO-specific errors (schema validation, CWV regression, crawl errors)
