# Status Update Template (Rex → Yash)

**When to use:** Every 2 days during Mode A (Koda sprint), or when blocked.

## Format

```
STATUS UPDATE — [Project Name] — Day [X] of [Est. Y]

COMPLETED:
  - Sprint 1: types, database schema, auth flow tests passing

IN PROGRESS:
  - Sprint 2: API routes for [core feature], Luna setting up test suite

NEXT UP:
  - Sprint 2 finish: PUT/DELETE routes, error handling
  - Luna: integration tests for auth + [feature]
  - Sage: pre-audit starting

BLOCKERS:
  - [If any: external service down, unclear requirement, etc.]

TIMELINE:
  - Original estimate: X days
  - Days elapsed: Y
  - Percentage complete: Z%
  - Status: ON TRACK / +1 DAY / +2 DAYS / REASSESS

RISKS:
  - [If pattern matches memory/patterns/avoid/]
  - [If build is >50% over estimate]

CONFIDENCE: [HIGH / MEDIUM / LOW] — [one-line reason]
```

## Escalation Triggers

- Timeline slipping >50%: pause + reassess with Yash immediately
- Blocker unresolved >2 hours: escalate, don't silently retry
- Sage finding P1 issues: alert Yash, don't wait for end of day
