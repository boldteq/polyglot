# Slash Commands

## What They Are

Slash commands are `.md` files stored in `.claude/commands/`. When you type `/commandname` in Claude Code chat, it reads that file and runs its content as a prompt — with `$ARGUMENTS` replaced by whatever text follows the command name.

**You invoke commands. Claude invokes agents.**

- You type `/feature Add dark mode` → Claude Code reads `feature.md`, runs it
- Claude decides to use `@koda` → Claude invokes the agent automatically
- Commands are manual, typed shortcuts. Agents are automatic, routed specialists.

> **Info:** Commands are just markdown files with instructions. Claude Code reads the file content as a prompt, replacing `$ARGUMENTS` with what you typed after the command name.

---

## Command Scopes

| Scope | Location | Available when |
|-------|----------|---------------|
| Global | `~/.claude/commands/*.md` | Any project is open |
| Project | `YourProject/.claude/commands/*.md` | That specific project is open |

No registration needed. Create the file — the command exists.

> **Info:** Commands load at session start. After creating or editing a command file, open a new Claude Code chat window.

```
Pinzo/.claude/commands/
  feature.md    →  /feature
  fix.md        →  /fix
  review.md     →  /review
  db.md         →  /db
```

---

## The `$ARGUMENTS` Placeholder

`$ARGUMENTS` is replaced by everything you type after the command name.

```
You type:    /feature Add ZIP code import from CSV
$ARGUMENTS = "Add ZIP code import from CSV"
```

- Replacement is literal — the entire string, exactly as typed
- Use `$ARGUMENTS` multiple times in one file — each instance gets the same value
- Commands without `$ARGUMENTS` are always invoked as `/commandname` with no args

> **Caution:** `$ARGUMENTS` is case-sensitive — must be all caps. `$arguments` or `$Arguments` will not be replaced.

---

## File Format

Plain markdown. No frontmatter. No special syntax beyond `$ARGUMENTS`.

```markdown
Build a complete feature for this project: $ARGUMENTS

## Before starting
Read CLAUDE.md at the project root. Understand the stack and conventions.

## Process
1. Read 2+ existing files that are similar to match code patterns
2. Plan: what files, what DB changes, what APIs, what UI
3. Make schema changes first if needed, run migrations
4. Build the implementation following all CLAUDE.md patterns
5. Run npm run typecheck — zero tolerance for errors

## Report when done
- Files created/modified (with paths)
- DB changes (migration name or "none")
- How to test (step by step)
```

---

## Standard Commands — Full Content

### `/commit` — Stage, write commit message, commit

```markdown
Stage all modified files and create a git commit for this project.

## Process
1. Run: git status — review what changed
2. Run: git diff --staged — understand the actual changes
3. Stage all relevant files: git add [files] (never git add . blindly)
4. Write a commit message that:
   - First line: imperative, under 72 chars ("Add ZIP code CSV import")
   - Body (if needed): what changed and why, not how
5. Commit: git commit -m "[message]"
6. Report: commit hash, message, files included

## Rules
- Never commit .env files or secrets
- Never commit node_modules
- Never use --no-verify
- If typecheck fails, fix it first — don't commit broken code
```

### `/review` — Quality gate before shipping

```markdown
Review the most recent changes in this project: $ARGUMENTS

## Phase 1 — Automated checks
Run:
1. npm run typecheck — report PASS or FAIL with error count
2. npm run lint — report PASS or FAIL

If typecheck FAILS: stop here. Do not proceed until errors are fixed.

## Phase 2 — Security audit
Check for:
- Missing authentication on protected routes
- User data accessible without authorization check
- Input validation missing on API endpoints
- Hardcoded secrets or API keys in source
- Sensitive data exposed in API responses

## Phase 3 — Code quality
Check for:
- TypeScript `any` or unsafe type assertions
- Missing error handling on async operations
- console.log left in production code
- Missing loading/empty/error states in UI
- TODO/FIXME comments left in shipped code

## Output format
### Automated Checks
- TypeCheck: PASS/FAIL
- Lint: PASS/FAIL

### Critical Issues (Must Fix Before Shipping)
[numbered list — file:line, problem, fix]

### Quality Issues (Should Fix)
[numbered list]

### Recommendation: SHIP IT / FIX CRITICAL FIRST / NEEDS REWORK
```

### `/train` — Extract lessons to memory brain

```markdown
Extract lessons from this session and update the memory brain.

Route this to @mira.

## What to extract
1. Patterns that worked well — save to ~/.claude/memory/patterns/good/
2. Antipatterns discovered — save to ~/.claude/memory/patterns/avoid/antipatterns.md
3. Project-specific lessons — save to ~/.claude/memory/projects/[project-slug].md
4. Stack-specific insights — save to ~/.claude/memory/stacks/[stack].md
5. Update ~/.claude/memory/MEMORY.md index if new files were created

## Format for each lesson
- What happened
- Why it matters
- The rule going forward (one sentence, actionable)

## Report
- Files updated (with paths)
- Number of lessons captured
- Any lessons that couldn't be categorized
```

### `/deploy` — Pre-deploy checklist and deployment

```markdown
Run pre-deploy checks and deploy this project: $ARGUMENTS

Route this to @bolt.

## Pre-deploy checklist (ALL must pass)
1. npm run typecheck — zero errors
2. npm run lint — zero errors
3. npm run build — must succeed with no warnings
4. Check .env.example matches actual .env keys (no missing vars)
5. Check no console.logs in production paths
6. Check no TODO/FIXME in recently changed files
7. Review git log — confirm only intended commits are included

## Deploy
Target environment: $ARGUMENTS (default: production)

Follow the project's deploy instructions in CLAUDE.md.
For Vercel: vercel --prod
For Railway: railway up

## Post-deploy
- Verify the deploy URL responds (HTTP 200)
- Test one critical user flow end-to-end
- Report: deploy URL, deploy time, any warnings
```

### `/fix` — Debug and fix any issue

```markdown
Fix this issue: $ARGUMENTS

## Debugging process
1. Read the FULL file where the error originates — understand context before touching anything
2. Run npm run typecheck to see all TypeScript errors at once
3. Identify the root cause — not the symptom
4. Make the minimal, targeted fix — never refactor working code while fixing a bug
5. Run npm run typecheck again — confirm zero errors

## Rules
- Fix ONLY what is broken
- Never use // @ts-ignore or `as any` — fix the root cause
- Make the smallest change that resolves the issue
- If the fix requires a DB migration, run it

## Report
- Root cause (1 sentence)
- Files changed (file:line_range for each change)
- Fix applied (what changed and why)
- Verification: npm run typecheck — 0 errors
```

### `/feature` — Plan and build a complete feature

```markdown
Build a complete feature for this project: $ARGUMENTS

## Before starting
1. Read CLAUDE.md at the project root — understand the exact stack and rules
2. Read 2+ existing files similar to what you're building — match code patterns exactly

## Build order
1. Types — TypeScript interfaces/types for this feature
2. Database — schema changes + migration (if needed)
3. API — routes/actions with Zod validation + auth check
4. UI — components, pages, forms with loading/empty/error states
5. Integration — wire everything together

## Quality gates (ALL must pass before reporting done)
- npm run typecheck — zero errors
- Every API route validates input with Zod
- Every async operation has error handling
- Every list view has an empty state
- Every form mutation has user feedback (Toast or equivalent)
- Every async UI has a loading state

## Report
- Files created/modified (with absolute paths)
- DB changes (migration name or "none")
- API endpoints (method + path + params)
- How to test (step by step)
```

---

## Creating Commands

### Via Polyglot UI

1. Open `http://localhost:3847`
2. Navigate to a project → **Commands** tab
3. Click **New Command**
4. Enter the command name (becomes the filename, no `.md`)
5. Write the content
6. Save

### Manually

```bash
touch "/Users/yashbaldha/Desktop/Boldteq App/YourProject/.claude/commands/feature.md"
```

The filename (without `.md`) is the command name. The file content is the prompt.

### Global commands

```bash
touch ~/.claude/commands/commit.md
```

> **Tip:** Use global commands for workflows that apply across all projects (e.g., `/commit`, `/train`). Use project commands for project-specific workflows (e.g., `/deploy`, `/feature`).

---

## Commands vs Agents vs Rules

| | Commands | Agents | Rules |
|--|----------|--------|-------|
| **Invoked by** | You (`/name`) | Claude (auto-routing) | Always active — Claude reads automatically |
| **Location** | `.claude/commands/` | `.claude/agents/` or `~/.claude/agents/` | `.claude/rules/` |
| **Has identity?** | No | Yes (name, model, persona) | No |
| **Accepts args?** | Yes (`$ARGUMENTS`) | No | No |
| **Purpose** | Repeatable workflow shortcut | Specialist persona | Hard constraint/guardrail |
| **When to use** | Same workflow run manually 2+ times a week | Need auto-routing to a specialist | Non-negotiable standard Claude must never break |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects/:id/commands` | List all commands for a project |
| `GET` | `/api/projects/:id/commands/:name` | Get one command's content |
| `PUT` | `/api/projects/:id/commands/:name` | Create or update a command |
| `DELETE` | `/api/projects/:id/commands/:name` | Delete a command |
| `GET` | `/api/unified/commands` | All commands across all projects |

> **Info:** `:id` is the base64-encoded project path. `:name` is the command filename without `.md`.

---

## Troubleshooting

**Command not appearing in Claude Code**
- Check the file is in `[project]/.claude/commands/` (not `.claude/` root)
- Check it has a `.md` extension
- Open a new Claude Code chat window — commands load at session start

**`$ARGUMENTS` appears literally in the prompt**
- Verify the file uses `$ARGUMENTS` exactly — case-sensitive, all caps
- Check there are no smart quotes or special characters around it

> **Caution:** Copy-pasting command files from docs or other sources can silently introduce curly/smart quotes around `$ARGUMENTS`. If substitution isn't working, retype `$ARGUMENTS` manually.

**Command runs but does the wrong thing**
- Instructions are too vague. Add: what to build, what format to return, what quality gates to run.
- Add explicit "done" criteria — without them, Claude may stop early.

**Global command not available in a project**
- Global commands are in `~/.claude/commands/`. Project commands are in `[project]/.claude/commands/`.
- Both are available simultaneously when a project is open.
