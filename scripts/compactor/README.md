# Agent Compactor — Production Lifecycle

> **Safety contract (hard):** No agent write is allowed if content-loss exceeds tolerance (default 1%, enforced as `ABORT` status). Every Markdown line from the original body must exist in either the compacted core or a skill file. Enforced by `verify.mjs` both at pre-write time and as a standalone audit.



Deterministic Node script that splits bloated agent `.md` files into a small **core** (loaded by the SDK on every dispatch) and a set of **on-demand skill files** (loaded by the LLM via `Read` when task keywords match).

## Why

Agent bodies grew to 3k–5k lines. The Claude Agent SDK loads the entire body into the system prompt at dispatch, so every run paid for all of it. A typical run was ~40k tokens of preamble before any work started. Compacting a 5,206-line Koda to a ~400-line core cuts that cost by 70–85% per run. Skills are loaded only when the task actually needs them.

## Quick start

```bash
# Dry-run (prints plan, no writes)
node scripts/compactor/compact.mjs koda

# Write to ./.compactor-staging/ for review
node scripts/compactor/compact.mjs koda --staging

# Apply to real paths (atomic)
node scripts/compactor/compact.mjs koda --write

# Every agent at once
node scripts/compactor/compact.mjs --all              # dry-run
node scripts/compactor/compact.mjs --all --write      # apply
```

## How it decides what to split

Six heuristics, applied in order, stopping when the body is under budget:

1. **H1 — topic sections** (`## Billing`, `## Auth`, etc.) → `skills/<agent>/<slug>.md`
2. **H2 — protocol bloat** (long `## Protocol`, `## Checklist`) → `skills/<agent>/…-protocol.md`
3. **H3 — large example blocks** (code fences > 40 lines) → `skills/<agent>/examples/<hash>.md`
4. **H4 — tool-specific H3 blocks** (`### Shopify`, `### Supabase`) → `skills/<agent>/tools/<tool>.md`
5. **H5 — pattern catalogs** (sections with 10+ numbered bullets) → `skills/<agent>/…-patterns.md`
6. **H6 — appendix / FAQ / antipatterns** → `skills/<agent>/reference.md`

Each extracted skill gets auto-indexed **triggers** (heading words + first-paragraph nouns + back-ticked identifiers) that are embedded in the compacted core as a "Skill Library" section. The LLM reads the core, sees the trigger list, and calls `Read` on the matching skill file when the user's prompt matches.

## Budgets

| Agent | Lines | Chars |
|---|---|---|
| Default | 400 | 16,000 |
| Rex, Arya (orchestrators) | 700 | 28,000 |
| Vex, Zeph (lightweight) | 300 | 12,000 |

Override per-run with `--budget-lines N` / `--budget-chars N`.

Rex is special-cased: only H1 + H5 are applied, to avoid splitting the dispatch logic that makes Rex an orchestrator.

## Safety

- **Idempotent.** Re-running on an already-compacted agent is a no-op unless `--force`.
- **Atomic writes.** Core and skills use `.tmp` + `renameSync`.
- **Staging.** `--staging` writes under `./.compactor-staging/` for diff review before touching real paths.
- **No destructive fallback.** If no heuristic matches, the script reports `SKIP` and writes nothing in `--write` mode.
- **Git recovery.** `~/.claude` is typically backed up to GitHub; `git restore` is the rollback.

## Output shape

After compaction, frontmatter gains:

```yaml
skills:
  - id: billing
    path: skills/koda/billing.md
    triggers: [billing, subscription, stripe, checkout, pricing]
    lines: 412
compactor:
  version: 1
  budget_lines: 400
  budget_chars: 16000
  last_compacted: 2026-04-15T00:00:00Z
  original_sha: 9f3a…
  original_lines: 5206
  original_chars: 191872
```

The body gains a `## Skill Library (load on demand)` section at the bottom telling the LLM when to read each skill.

## Verification

```bash
# Line count drops
wc -l ~/.claude/agents/koda.md

# Skill files land under ~/.claude/skills/koda/
find ~/.claude/skills/koda -type f

# Frontmatter manifest is valid YAML
head -50 ~/.claude/agents/koda.md
```

## Continuous operation

### One-time full rebuild
```bash
# From a clean slate (rare — only when heuristics change materially)
cp ~/.claude/agents/.pre-compact-2026-04-15/*.md ~/.claude/agents/
rm -rf ~/.claude/skills/*/
node scripts/compactor/compact.mjs --all --write
```

### Daily / on-demand
```bash
# Auto-compact in the background as you edit agents
node scripts/compactor/watch.mjs
```

### Verify at any time
```bash
node scripts/compactor/verify.mjs                 # default 1% tolerance
node scripts/compactor/verify.mjs --tolerance=0   # zero-loss audit
```

Exit code 0 = clean. Exit code 1 = at least one agent over tolerance (prints offenders + sample missing lines).

## Lifecycle contract

For every agent edit — human or agent-driven:

1. **Edit** the `.md` body as if it were a normal markdown file.
2. **Save** — either:
   - `watch.mjs` is running → compactor runs automatically, aborts on loss.
   - or manually → run `compact.mjs <agent> --write`.
3. **Fail-safe** — if content-loss exceeds tolerance, the write is aborted and the agent file is left untouched. Fix the input (or tune heuristics), re-run.

### When adding a new agent
1. Write the full-size `.md` under `~/.claude/agents/<id>.md`.
2. Run `node scripts/compactor/compact.mjs <id> --staging` — inspect planned skill files.
3. Run `node scripts/compactor/compact.mjs <id> --write` — real apply.
4. `verify.mjs` confirms zero loss.

### When editing an existing agent
- **Small edits** (< 5% of body): watch-mode or `--write` handles the rest; if body shrinks under budget, no re-extraction is needed.
- **Major rewrites** (>20% changes): consider `--reconcile --write` to rebuild the Skill Library block and trigger set from current skill files on disk.
- **Adding a section** that should become its own skill: give it a distinct H2 heading matching one of the H1 keywords (`billing`, `auth`, `migration`, etc.) OR make it >150 lines so H2b catches it.

### When removing a skill file manually
- Delete `~/.claude/skills/<agent>/<file>.md`.
- Re-run `compact.mjs <agent> --reconcile --write` to sync the frontmatter manifest and Skill Library block.

### When renaming/moving a skill
- Don't. The compactor regenerates filenames deterministically from headings. Rename the source H2 heading in the agent's `.md`; on next compaction the skill file is recreated under the new name and the old one is orphaned (safe to delete).

## Heuristics (in order)

1. **H1 — topic sections** (`## Billing`, `## Auth`, …) → dedicated skill file.
2. **H2 — protocol/rules/patterns bloat** (`## DEEP X PATTERNS`, `## Premium UI/UX Standards`) → dedicated skill.
3. **H4 — tool-specific H3 blocks** (`### Shopify`, `### Supabase`) → `skills/<agent>/tools/<tool>.md`.
4. **H5 — pattern catalogs** (sections with 10+ numbered bullets) → dedicated skill.
5. **H6 — appendix / FAQ / antipatterns** → `skills/<agent>/reference.md`.
6. **H3 — large balanced code fences** (>40 lines, ≤500 lines, no embedded headings) → `skills/<agent>/examples/<hash>.md`.
7. **H2b — any remaining H2 >150 lines** → dedicated skill (last-resort bulk extractor).

**Safety rails built into heuristics:**
- H2/H2b stubs are **fence-free** — never excerpt content that might open a code fence the rest of the pipeline can't close.
- H3 refuses to extract unclosed or heading-spanning fences — leaves them in the core verbatim.
- Dedupe is by skill `id` (content-hash for examples, slug for sections), not by heading — multiple example blocks don't collapse.

## Review workflow (v1 golden harness)

Stage a compaction, then review the diff before applying:

```bash
# 1. Stage
node scripts/compactor/compact.mjs koda --staging

# 2. Review (colored diff, skill list, interactive prompt)
node scripts/compactor/review.mjs koda

# Non-interactive variants:
node scripts/compactor/review.mjs koda --print      # diff only
node scripts/compactor/review.mjs koda --apply      # apply without prompt (CI)
```

The review script writes skills first, then the core — same atomic pattern as the server.

## Server integration

- `GET /api/global/agents` returns **metadata only** (no body). Pass `?full=1` for the old shape.
- `GET /api/global/agents/:name` is now mtime-cached in-process. Re-reads are sub-ms.
- `PUT /api/global/agents/:name` enforces the same budget as the compactor. Over-budget → `409 {error:"over_budget", runCompactor:"..."}`. Bypass with `?force=1` or the env var `POLYGLOT_BUDGET_ENFORCE=0`.

## Rollback

```bash
cd ~/.claude
git diff agents/koda.md
git restore agents/koda.md
rm -rf ~/.claude/skills/koda
```

## Limits

- Heuristics are regex-based. They may mis-extract sections with ambiguous headings. Always `--staging` first on sensitive agents.
- H3 moves large code blocks. If a block's context was critical, its 2-line stub may be too sparse. Review staged output.
- The LLM must actually follow the skill-library instructions. Early runs should spot-check that the model calls `Read` on the right skill for a matching prompt.
