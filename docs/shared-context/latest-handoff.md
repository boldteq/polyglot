# Latest Handoff

- Task: Build shared Claude Codex handoff workflow
- Status: completed
- Started: 2026-07-19T08:03:11.668Z
- Updated: 2026-07-19T08:04:15.261Z
- Branch: train/swt-evidence-bar
- Tools involved: codex, claude
- Full handoff: docs/shared-context/handoffs/2026-07-19T08-03-11Z-build-shared-claude-codex-handoff-workflow.md

## Summary

Completed the local auto-sync workflow for Claude and Codex, including shared session files, docs, and CLI helpers.

## Next Step

Start the next shared task with npm run context:start and have the next tool read TEAM_CONTEXT.md first.

## Files In Play

- TEAM_CONTEXT.md
- docs/13-cross-tool-context.md
- scripts/context-sync.mjs
- docs/shared-context/active-session.md
- docs/shared-context/latest-handoff.md
- docs/shared-context/index.json

## Decisions Snapshot

- Use active-session.md as the first cross-tool snapshot after TEAM_CONTEXT.md.
- Use the context:* scripts as the supported write path for shared handoffs.
