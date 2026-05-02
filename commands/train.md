Extract lessons from the current session and update the memory brain.

Usage: /train

Run this after:
- Completing a significant feature
- Fixing a tricky bug
- Making a major architecture decision
- Finishing a project

The `trainer` agent will:
1. Review what was built or fixed in this session
2. Classify learnings: good patterns, antipatterns, stack knowledge
3. Update the relevant files in `~/.claude/memory/`
4. Update MEMORY.md index if new files were created

This is how the agent team permanently learns and avoids repeating the same mistakes. Run it consistently — every session that produces meaningful work.