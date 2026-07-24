# Golden build corpus — schema

The held-out benchmark for the build fleet (roadmap Phase 2, audit gap 2). Each `brief-*.json` / `regression-*.json`
pairs a brief with a **mechanical** `must_pass` checklist scored against a real build's `gate-reports/summary.json`.
Scored by `scripts/eval-golden-builds.mjs` (pure core tested in `src/evalGoldenBuilds.test.mjs`). The regression gate
(`pnpm golden:check` → `--regression`) fails if the corpus aggregate drops below `baseline.json`.

The corpus is **read-only** over the client repos it references (never writes them) and **grows via the ratchet**:
every fixed bug should be added as a `regression-<id>.json` so the same defect can never silently return.

## When to run it (this is a LOCAL brain-regression gate, not a client-theme publish gate)

`golden:check` guards **changes to the brain** — an agent `.md`, a gate script, a rule-pack, or the judge. Run it
**before shipping such a change**: if the change regresses a known-good build (a gate that used to pass now fails),
the aggregate drops below the baseline and it BLOCKS. It is **not** wired into `shopify-theme-push` (that runs inside a
*client* theme repo, which has neither this corpus nor the reference builds) and **not** into GitHub CI (the reference
builds are local, read-only client repos that don't exist on a runner).

- **Portable:** case `repo` paths use `~`; set `GOLDEN_REPO_ROOT=/path/to/repos` to relocate the whole corpus to
  another machine (resolves by repo basename).
- **Honest boundary:** on a machine where **no** reference repo is present, `--regression` **SKIPS** (exit 0, "not a
  pass, not a block") rather than blocking on a null score. So it bites only where a real reference build exists.
- **Bars must BITE:** set `min_pass_rate` a few points **below the build's actual** rate (e.g. cafe = 0.85 vs its 0.88)
  so a real regression trips it without false-failing on one flaky gate — not so far below that a regression slips through.

```jsonc
{
  "id": "brief-001-<niche>",                  // stable, unique
  "brief": "one-line description of what was asked",
  "niche": "cafe | supplements | …",
  "repo": "~/Desktop/Shopify Task/<build>",   // reference build (portable ~; or set GOLDEN_REPO_ROOT)
  "known_good_sha": "…",                       // the SHA the criteria were captured at
  "provenance": "why this is a valid anchor + who verified it",
  "must_pass": {
    "gates_green":     ["secret-scan", "orchestration", "…"], // each must pass:true AND not skipped
    "sections_present":["about-cafe"],                        // sections/<name>.liquid must exist
    "min_pass_rate":   0.80,                                   // fraction of ALL gates that must pass
    "max_blockers":    null                                    // ceiling on total blockers (null = unbounded)
  }
}
```

Every criterion is mechanical and reproducible without a model — a golden score is evidence, not opinion.
`must_pass` should encode an **achievable quality bar** grounded in a real build, not an aspiration the fleet
can't yet hit (that would block every build). Raise the bar as builds improve.
