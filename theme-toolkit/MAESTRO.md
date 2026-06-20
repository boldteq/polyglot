# Maestro — the hands-off Shopify theme build engine

The toolkit-native driver for the Maestro Loop (doctrine: `~/.claude/memory/patterns/good/maestro-build-protocol.md`).
One command builds a theme surface-by-surface to publish-ready, unattended, with the eyes (Lens) in the
loop — no second terminal, no human mid-run. It shells `claude -p` for the consultant drafts (subscription,
no API key) and the toolkit scripts for render/judge/record, so it runs headless.

> Two drivers exist for the same loop. Pick one:
> - **CLI driver (this doc)** — `pnpm maestro:build`. A node process drives the loop; drafts are `claude -p`.
>   Best for a single hands-off run from a terminal / cron.
> - **Workflow driver** — `Workflow({ scriptPath: '.claude/wf-maestro-loop.mjs', args })`. The orchestrating
>   session drives the loop; drafts are `agent(loom)`. Best when already inside a Claude session.
> The loop ALGORITHM is identical (`scripts/lib/maestro-loop.mjs`) and proven hermetically by both
> `pnpm maestro:dryrun` (algorithm) and the `__fixtures__/maestro*` suites (CLI wiring).

## One command

```bash
THEME_PREVIEW_URL=http://127.0.0.1:9292 pnpm maestro:build          # theme:dev already running
pnpm maestro:build --auto-preview                                  # starts + tears down theme:dev itself
pnpm maestro:build --auto-preview --budget 90 --timeout 12         # unattended caps (minutes)
```

`maestro:build` runs four stages and **short-circuits at the first failure** — you never get a half-built
store that reads as done:

```
1 build-state      seed docs/build-state.json if absent (the carried mind) — before preflight, which requires it
2 preflight        every precondition met? (else stop + print the exact fix per missing item)
3 surface loop     per surface: draft (claude) → render → Lens judge → record; ≤3 rounds then escalate
4 gate stack       the full publish stack (#0.4→#19 + Lens #18) — pnpm gates
→ docs/publish-readiness.json   PUBLISH-READY only if the loop converged AND the gate stack passed
```

The per-surface Lens inside the loop is **not** the publish gate — a store can converge surface-by-surface
and still fail the whole-store stack. `maestro:build` declares PUBLISH-READY only when **both** are true,
in one machine-readable artifact `mantle`'s publish precondition can read.

## Preconditions (what `maestro:preflight` checks)

Run `pnpm maestro:preflight` any time for a READY / NOT-READY verdict with the fix command per gap:

| check | gate | fix |
|---|---|---|
| discovery | #0.4 | discovery → `docs/discovery/goals.json` |
| bootstrap | #0.5 | drape authors `docs/design/design-system.json` |
| theme-lock | — | `pnpm theme:link --store <h> --theme <id> --single` |
| build-state | — | `pnpm build-state init` |
| shopify-cli | — | `npm install -g @shopify/cli@3` |
| preview | — | `pnpm theme:dev` (skipped with `--render push`) |
| consultant | — | the `claude` CLI on PATH (skipped with `--driver workflow`) |

`maestro:build` runs preflight itself and refuses to start when NOT-READY (override: `--skip-preflight`).

## Flags

| flag | effect |
|---|---|
| `--auto-preview` | start `theme:dev` for the run + tear it down after (render=dev only) |
| `--render dev\|push` | `dev` = rely on the live preview · `push` = `theme:push` each draft (no live preview needed) |
| `--surfaces a,b,c` | override the surface list (default: from `build-state.json`, skipping `done`) |
| `--max-rounds N` | Lens rounds per surface before escalating (default 3) |
| `--budget <min>` | wall-clock cap — once elapsed, remaining surfaces escalate cleanly (unattended) |
| `--timeout <min>` | per-subprocess timeout (draft/render/judge/record) — a hung child is killed → that surface escalates |

## Unattended safety

- **Per-subprocess timeouts** (defaults: draft 10m, render/judge 5m, record 1m; override via `--timeout`
  or `MAESTRO_*_TIMEOUT_MS`). A hung `claude`/`theme:push`/`lens` is SIGKILLed → the surface escalates,
  the loop continues — it never freezes the night.
- **Budget breaker** (`--budget <min>` / `MAESTRO_BUDGET_MS`). Once the wall-clock budget elapses, every
  further draft short-circuits → remaining surfaces escalate. No runaway overnight token burn. Off by default.
- **Bounded rounds** — ≤`--max-rounds` per surface, then escalate (never loop forever).
- **Surface isolation** — one surface throwing (infra/consultant error) is recorded `error`; the rest still build.

## Artifacts (read these in the morning)

| file | what |
|---|---|
| `docs/build-state.json` / `.md` | the carried mind — per-surface verdict + the cross-surface decision ledger |
| `docs/maestro-report.json` / `.md` | the loop result — converged vs escalated surfaces + rounds |
| `docs/publish-readiness.json` / `.md` | the PUBLISH-READY verdict — stage reached + reason + loop + gate summary |
| `gate-reports/SUMMARY.md` | the full gate stack result (blocked/warned/passed per gate) |
| `gate-reports/lens/` | the eyes — per-frame judge verdicts + `index.html` eyeball page |

## The maestro scripts

| command | role |
|---|---|
| `pnpm maestro:build` | **the one hands-off command** — preflight → build-state → loop → gates → publish-readiness |
| `pnpm maestro:preflight` | readiness gate — READY/NOT-READY + the fix per missing precondition |
| `pnpm maestro:run` | the surface loop alone (draft→render→judge→record), if you want just the build phase |
| `pnpm maestro:dryrun` | hermetic proof of the loop ALGORITHM (no store/claude/preview) |
| `pnpm build-state init\|record\|show` | seed / update / print the carried mind |
| `pnpm lens:surface <surface>` | the iteration unit — capture→judge→enforce scoped to one surface |
| `pnpm theme:dev` / `theme:push` / `theme:link` | the single-theme preview / push / link (lock-pinned) |
| `pnpm gates` / `gates:verify:full` | the full publish gate stack / its freshness check (theme:push precondition) |

## Resuming an interrupted run

`build-state.json` tracks each surface's status; `maestro:build` re-runs only surfaces not yet `done`, so a
re-run after an interruption picks up where it left off. The gate stack always re-runs (it grades the whole store).
