# Handoff Format Template (Rex → any agent)

Every dispatch to any agent must follow this structure:

```
DISPATCH TO: [Agent Name]
MODE: [A/B/C/D/E]
PROJECT: [Project Name or ID]
TASK: [One-line task description]
CONTEXT:
  - Prior outputs from [Agent X, Agent Y]
  - Current state of [subsystem]
  - Constraints: [timeline, tech stack, external deps]
EXPECTED OUTPUT:
  - [Specific deliverable 1]
  - [Specific deliverable 2]
  - [Format: markdown/code/JSON/etc]
CONSTRAINTS:
  - Max retries: 3
  - Cost limit: [if applicable]
  - Approval gate: [yes/no and who]
  - Timeline: [deadline or estimate]
WHY THIS MATTERS:
  [1-2 sentences explaining impact on product or factory]
```

## Why This Matters
- Removes ambiguity about what "done" looks like
- Gives agents full context upfront
- Enables input validation before downstream dispatch
- Creates audit trail for knowledge extraction (Mira)
