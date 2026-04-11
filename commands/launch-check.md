Pre-launch readiness gate for a built product. Run before going live.

Usage: /launch-check [project name]

Examples:
- /launch-check rankora
- /launch-check pinzo
- /launch-check convertscan

Prerequisites: Product built and tested (Koda + Luna + Sage complete).

Pipeline (4 agents):
  1. Echo — Distribution plan (channel audit, launch day sequence, content calendar)
     Kill gate: <2 viable organic channels
  2. Mira — Knowledge capture + lessons extraction from build phase
  3. Bolt — Deploy readiness + launch ops preparation
     Gate: Sage approval must already exist (no deploy without code review)
  4. Hawk — Monitoring setup + alerting configuration + post-launch verification

Output: Launch readiness report.
  Green = ship it. All systems go.
  Yellow = minor issues to fix first (list provided).
  Red = blocking issues (must resolve before launch).

$ARGUMENTS
