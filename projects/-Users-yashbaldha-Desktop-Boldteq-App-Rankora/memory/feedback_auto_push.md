---
name: Auto push after changes
description: Always commit and push to origin/main automatically after completing any code change — don't wait for user to say "git push"
type: feedback
---

Always auto-commit and push after completing code changes. Don't wait for the user to ask "git push".

**Why:** User explicitly asked for automatic pushes every time. They don't want to manually trigger git push after each task.

**How to apply:** After every completed change (build passes, tests pass), immediately commit with a clear message and `git push origin main`. No confirmation needed.
