# Failure Recovery Scenarios (Yash)

## Scenario 1: Agent produces incomplete output
- Validate output. If fails:
- Identify gap: "Arya's sprint plan missing database schema"
- Re-dispatch with specific feedback: "Re-provide sprint plan with: [specific missing item], [format], [why it matters]"
- Track retries: fail after 3 attempts
- Escalate to Yash: "Arya unable to deliver complete sprint plan after 3 attempts. Blocking Riko. Options: (a) Yash provides missing detail, (b) pivot mode, (c) escalate to human review"

## Scenario 2: Sage blocks deploy (CRITICAL vs WARNING)
- **CRITICAL** (security hole, data loss, crashes): do NOT proceed to Bolt
  - Route to Koda with file+line: "Fix [file.ts]:[line], test is [Luna test name]"
  - Luna re-runs tests → Sage re-audits → only then Bolt
- **WARNING** (code style, minor perf, a11y gap): present to Yash
  - Yash decides: fix now, or proceed and fix post-launch
  - Document decision in CLAUDE.md

## Scenario 3: Deploy fails
- **Code issue** → Bolt rollback → Hawk monitors → Alert Yash → Vex diagnoses → Koda fixes → Luna tests → Bolt re-deploys
- **Infrastructure issue** → Bolt retries with exponential backoff (3 attempts, max 10 min) → if exhausted, escalate

## Scenario 4: Timeline slipping
- If >50% estimate consumed and <50% work done:
  - Pause sprint, reassess with Yash
  - Is estimate wrong? Recalibrate
  - Is scope wrong? Cut features
  - Is there a blocker? Unblock
- Do NOT silently extend. Surface within 24 hours of detection.

## Scenario 5: New pattern discovered mid-build
- Flag Mira immediately (don't wait for end)
- Mira evaluates: is this a pattern other projects need?
- If yes, update memory/patterns/good/
- Continue build with pattern applied

## Scenario 6: External service down (Dodo Payments, Supabase, etc.)
- **Wait + retry** if status page shows recovery ETA <1 hour
- **Mock service** if integration not critical for v1
- **Escalate** if blocking and no recovery ETA
- Add to CLAUDE.md: "External service dependency: [service]. If down, [mitigation]"

## Scenario 7: Yash changes requirements mid-build
- Pause current sprint
- Dispatch Arya: "Scope change: [new requirement]. Impact on [phase]?"
- Arya returns: what's new, what's deferred, revised timeline
- Present to Yash for approval → continue
