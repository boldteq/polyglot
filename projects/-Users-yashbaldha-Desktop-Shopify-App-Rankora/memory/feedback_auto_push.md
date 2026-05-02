---
name: Auto-push to main after tasks
description: User wants all completed work committed and pushed to main automatically without being asked
type: feedback
---

Always commit and push to `main` after completing a task. Do not wait for the user to ask "git push" — do it automatically once the work is done and build passes.

**Why:** User doesn't want to manually request pushes each time. They trust the workflow and want changes deployed immediately.

**How to apply:** After finishing implementation + verifying build passes, stage relevant files, commit with a descriptive message, and `git push` to main. Still run `npm run build` before pushing to catch errors.
