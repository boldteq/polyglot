---
name: Auto push after commits
description: User wants git push to happen automatically after every commit without asking
type: feedback
---

Always run `git push origin main` immediately after every `git commit`. Do not ask for confirmation — the user wants commits pushed automatically every time.

**Why:** User prefers a streamlined workflow where changes are always pushed as soon as they're committed.
**How to apply:** After any `git commit`, chain `git push origin main` in the same command or immediately after.
