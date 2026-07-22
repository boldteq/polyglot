# Shopify hardening backlog — the overnight queue

**Purpose.** A durable, ordered queue so an autonomous loop does NEW work each run instead of
re-analysing the same ground. Every item is a real, verified gap from the 2026-07-19→22 audits
(VS-Code loop audit, cravinbyandy forensics, reference-conformance design).

**Loop contract (every run):**
1. Read this file. Pick the **top item with `status: open` whose blockers are clear**.
2. Mark it `in-progress`, implement it, **test it**, keep the toolkit suite green.
3. Commit (scoped, on the current branch). Mark `done` with the commit sha + one-line result.
4. If you discover a new gap, append it here rather than doing it now.
5. **Never** `theme push`/publish to a live store. **Never** `git add -A` on an intertwined tree.
   Never mark an item done without a test/proof line.

**Hard rules:** Node 20 · toolkit suite must stay green (80/80) · `node toolkit/scripts/X.mjs` from a
client repo root, never `pnpm <alias>` · a skipped gate is not a passed gate · no live pushes.

---

## P0 — mechanize (highest leverage, no human needed)

- [x] **RM-1 · Prove L2 reference-match on a real store.** `status: done` (store 1 of 2)
  Ran both controls against **real captured frames from the live cravinbyandy store** (no preview URL
  needed — reused `gate-reports/lens/home/*.png`).
  **Positive control** (reference == render): 0 blockers — no false divergences between identical images.
  **Negative control** (reference = the page's scroll-end frame): 4 would-block findings with precise
  evidence — *"Reference hero is a multi-card location carousel showing at least two full cards ('The
  Cravin Pantry', 'Cravin To-Go') plus a third partially visible, with left/right arrows"* vs the
  rendered two-column split; plus content-parity, layout and colour deltas. Verdicts landed in
  `lens/reference-judge/` (⇒ #18's `judge/` dir untouched) and warn-only correctly labelled what would
  block. **False-positive found + fixed:** the judge flagged behavioural `must_have` signals
  (auto-rotate / dots-after-JS-init) that are unknowable from a static rest frame — the prompt now
  forbids reporting anything not visible in BOTH stills (those are L1's job). Judge calls take >2 min:
  run them backgrounded.
- [ ] **RM-2 · Flip L2 to enforcing** once RM-1 is clean on a **2nd** store. `status: open`
  Store 1 (cravinbyandy) is clean post-fix. Needs one more real store's frames with zero false
  positives, then set `REFERENCE_MATCH_ENFORCE=1` by default.
- [ ] **GI-1 · `section-reuse-map.md` is required by 2 gates but missing in cravinbyandy.** `status: open`
  Either generate it from the current theme or make the requirement honest. *Done when:* gate #23 is
  no longer N/A-by-absence on that repo, or the requirement is explicitly scoped.
- [ ] **DOC-1 · Seed the missing build artifacts in cravinbyandy** (`docs/discovery/goals.json`,
  `docs/design/brand-direction.md`) so gates #0.4/#0.5 stop failing on absence. `status: open`
  Derive ONLY from what already exists in the repo; never invent client goals — flag what needs Yash.
- [ ] **HYG-1 · mantle.md has DUPLICATE `## Anti-Patterns` sections** (same content twice). `status: open`
  De-duplicate carefully (both copies currently carry rule 22). *Done when:* one section, suite green.
- [ ] **BRAIN-1 · Verify the learning digest actually runs.** `status: open`
  It was re-enabled 2026-07-22 after being off since 06-30 with 84 sessions stuck at `pending_digest`.
  Confirm the 04:00 cron fired, sessions moved off `pending_digest`, and `learning_inbox` grew.
  *Done when:* row counts before/after are recorded here.
- [ ] **BRAIN-2 · Ollama is down → semantic reindex failing** (`embedder=ollama/nomic-embed-text`).
  `status: open` — detect + report clearly; `memory_search` recall is degraded until it runs.

## P1 — the 478 findings cravinbyandy surfaced once its gates started working

- [ ] **CB-1 · design-tokens: 205 blockers** (169 `ds.color-hex` + 36 `ds.color-literal`). `status: open`
  Snap hardcoded colours to the brand tokens/schemes. Work in small committed batches per stylesheet;
  never change a rendered colour value while doing it (token swap must be visually identity).
- [ ] **CB-2 · editability: 269 blockers.** `status: open` Triage first — how many are real merchant-
  editability gaps vs base-Dawn noise? Record the split here before fixing.
- [ ] **CB-3 · consistency: 21 font-sizes / 4 weights / 8 radii vs the caps.** `status: blocked-by human`
  Needs the provisional type/spacing ladder ratified (drape + Yash) before the sweep.
- [ ] **CB-4 · z-index war** — 4 stylesheets at `9999` (now a blocker via rule-pack). `status: open`
  Introduce a layer scale and migrate the 4 call sites.
- [ ] **CB-5 · Dead references to the deleted `hero-seasonal`** in `assets/reveal.css:58` and
  `assets/section-image-banner.css:57`, plus the abandoned `image-banner` customisation. `status: open`
- [ ] **CB-6 · 38 locale `body_font_weight` translation errors** — acknowledged, blamed on "an external
  change", never fixed. `status: open`
- [ ] **CB-7 · 22 uncommitted regenerated gate-reports** in cravinbyandy. `status: open` Decide the
  convention (commit as evidence vs ignore) and apply it once.

## P2 — deferred by judgement (documented, not forgotten)

- [ ] **DEF-1 · Unsigned gate-report JSONs** — evidence is forgeable by any Write-capable agent.
  Real fix = signing/attestation. Local single-user threat model ⇒ P3. `status: deferred`
- [ ] **DEF-2 · `measureAndRollback` is dead for zero-run agents** (needs ≥5 terminal `agent_runs`), i.e.
  exactly the Shopify agents the gate-harvester patches. Needs a gate-defect-recurrence signal instead
  of run-success-rate — a design task. `status: deferred`
- [ ] **DEF-3 · Full `maestro:build` live run on a real client store end-to-end** (loop:e8d5178c).
  Needs a preview URL + a store we may safely build against. `status: blocked-by human`
- [ ] **DEF-4 · Sales.tsx top-20 bugs + DesignLibrary.tsx gap analysis** (Polyglot app, not Shopify).
  Separate workstream. `status: open`

## Needs Yash (do not guess — guessing is what caused the re-asks)

- **Marquee 20px vs 28px** — CSS documents Figma=28; home ships 20 after "now font size too big".
- **Ratify the PROVISIONAL type/spacing ladder** in cravinbyandy's `design-system.json`.
- **Swiggy/Zomato URLs**, Gill Sans `.woff2` licence, real photography, `matcha.jpg` ≥1400px.
- **Which Figma file is authoritative** — four different keys are in play.

---

## Log (append one line per completed item)
- 2026-07-22 · seeded from the VS-Code loop audit + cravinbyandy forensics + reference-conformance work.
