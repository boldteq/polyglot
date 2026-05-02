# /test — Intelligent Test Runner

You are running tests intelligently. Follow this exact process:

## Step 1 — Detect the test runner

Check `package.json` scripts for: `vitest`, `jest`, `mocha`, `playwright`, `cypress`. Use whatever is configured. Do not assume.

If no test script exists, check for test files (`*.test.ts`, `*.spec.ts`, `__tests__/`) and infer the runner from imports.

## Step 2 — Scope the test run

**If `$ARGUMENTS` is provided:** Run only tests matching that pattern (file path, component name, or keyword).

**If no arguments:** Check `git status` and `git diff --name-only HEAD` to find changed files. Run only tests related to those files. If nothing changed, run the full suite.

Scope rules:
- Changed file `src/foo/bar.ts` → run `src/foo/bar.test.ts` or `src/foo/__tests__/bar.test.ts`
- Changed file in `app/routes/` → run matching route tests
- Changed schema/migration → run all DB-related tests
- Changed shared utility → run full suite (it's a blast-radius file)

## Step 3 — Run the tests

Execute the scoped test command. Capture output.

## Step 4 — Triage failures

For each failing test:
1. Read the error — understand the root cause, not just the symptom
2. Check if it's a **real bug** (logic error) or a **test artifact** (stale snapshot, wrong mock, changed API shape)
3. If it's a real bug → fix the source code
4. If it's a snapshot/mock mismatch from intentional changes → update the test
5. Never delete a test to make it pass — fix what's actually broken

## Step 5 — Re-run after fixes

After fixing, re-run the same scoped tests. Confirm green. If still failing after one fix attempt, explain what's happening and what needs a decision.

## Output format

Report only:
- How many tests ran / passed / failed
- What failed and why (one line each)
- What you fixed
- Any tests you intentionally skipped and why

No verbose test output dumps. No lists of passing tests. Just signal.