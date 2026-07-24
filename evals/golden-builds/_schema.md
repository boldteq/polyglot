# Golden build corpus — schema

The held-out benchmark for the build fleet (roadmap Phase 2, audit gap 2). Each `brief-*.json` / `regression-*.json`
pairs a brief with a **mechanical** `must_pass` checklist scored against a real build's `gate-reports/summary.json`.
Scored by `scripts/eval-golden-builds.mjs` (pure core tested in `src/evalGoldenBuilds.test.mjs`). The regression gate
(`--regression`) fails CI if the corpus aggregate drops below `baseline.json`.

The corpus is **read-only** over the client repos it references (never writes them) and **grows via the ratchet**:
every fixed bug should be added as a `regression-<id>.json` so the same defect can never silently return.

```jsonc
{
  "id": "brief-001-<niche>",                  // stable, unique
  "brief": "one-line description of what was asked",
  "niche": "cafe | supplements | …",
  "repo": "/abs/path/to/the/reference/build", // the known-good-ish build this case anchors to (provenance)
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
