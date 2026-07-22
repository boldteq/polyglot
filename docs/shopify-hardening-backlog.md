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
- [x] **RM-2 · L2 clean on a 2nd store — but the enforce flip is DECLINED for now.** `status: done`
  Store 2 (`gpt test 1`, different theme): positive control **0 blockers / 0 warnings**; negative
  control produced 2 accurate findings (*"reference places the content block on the RIGHT ~45%; the
  build is flush left"* + content-parity). So the written criterion — 2 stores, zero false positives —
  **is met**. **I am deliberately NOT flipping `REFERENCE_MATCH_ENFORCE=1` by default, because the
  criterion was too weak:** both positive controls compared *byte-identical* images, which is the
  easiest possible case. The false-positive risk that actually matters in production is a **design
  export vs a rendered page** (different rasterisation, scale, real vs placeholder content) — untested.
  Flipping on this evidence would risk a gate that blocks every build. Superseded by RM-3.
- [ ] **RM-3 · Calibrate L2 on a REAL design-export-vs-render pair, then flip.** `status: blocked-by FIG-1`
  Need one genuine design frame (Figma export or a client screenshot of the intended design) paired
  with the rendered build of that same surface. Confirm zero false positives there, then set
  `REFERENCE_MATCH_ENFORCE=1` as the default in `check-reference-match.mjs` + the docs.
- [ ] **FIG-1 · The Figma MCP is rate-limited on the Starter plan — a production constraint, not a fluke.**
  `status: open` Verified live 2026-07-23: `get_screenshot` returned *"You've reached the Figma MCP tool
  call limit on the Starter plan."* `docs/design/catering-popup-spec.md` hit the same cap on 2026-07-15
  ("Figma MCP hard-capped on Starter plan"), which is why that spec's measurements came from screenshots
  that were then lost. **Implication: stitch/drape's "Path B premium" Figma flow will fail mid-build in
  production.** This makes persisting exports non-optional — fetch a node ONCE, save it under
  `docs/design/references/`, and never re-fetch. *Done when:* stitch/drape carry an explicit
  rate-limit-aware rule (fetch-once-persist-always + a graceful degrade to Path A when capped), and the
  fallback is documented where a build will actually hit it.
- [ ] **GI-1 · `section-reuse-map.md` is required by 2 gates but missing in cravinbyandy.** `status: open`
  Either generate it from the current theme or make the requirement honest. *Done when:* gate #23 is
  no longer N/A-by-absence on that repo, or the requirement is explicitly scoped.
- [ ] **DOC-1 · Seed the missing build artifacts in cravinbyandy** (`docs/discovery/goals.json`,
  `docs/design/brand-direction.md`) so gates #0.4/#0.5 stop failing on absence. `status: open`
  Derive ONLY from what already exists in the repo; never invent client goals — flag what needs Yash.
- [x] **HYG-1 · mantle.md corruption — root cause was a silent file-destroying bug in the distributor.**
  `status: done` The duplication was a *symptom*, not a hygiene slip. `swt-distribute.mjs`
  replaced the managed block with `original.replace(re, section)` — a **string** replacement, so JS
  interpreted ``$` ``, `$&`, `$'`, `$$` **inside the rule text** as replacement patterns. mantle's #28
  rule body contains ``never hardcode `$` ``; the ``$` `` sequence means *"insert everything before the
  match"*, so the entire preceding agent file was spliced into mantle's own SWT-TRAINED block, and the
  #28 rule was destroyed mid-sentence (`…never hardcode ` + 400 lines of file + `— the money filter…`).
  **It was silent** — markers stayed balanced (1/1), frontmatter stayed intact, and the file only GREW,
  so every existing guard passed. mantle sat at 814 lines with its whole body duplicated.
  **Fixed:** (a) replacer **function** (`() => section`) so `$` is never interpreted; (b) a post-write
  assertion that the block in the output is byte-identical to the section built — catches the whole
  class, which the length/marker guards structurally cannot; (c) `SWT_AGENTS_DIR` override for testing;
  (d) mantle.md repaired 814→414 lines, with rule #28's lost text recovered verbatim from its source of
  truth (`swt-rules/mantle.md`), not guessed.
  *Proof:* new `src/swtDistribute.replacement.test.mjs` (4 cases) passes on the fix; on a patched copy
  carrying the old code the same input gives `sentinel ×2, ruleLiteral=false` vs `×1, true` fixed.
  Audited all 14 SWT agents — **only mantle** was affected (it is the only agent whose *teaser* rule
  contains a replacement pattern). Toolkit suite 80/80.
  ⚠️ **The bug only fires on the REPLACE path** (a file that already has a managed block); a fresh file
  takes a concatenation branch that was never vulnerable — a test seeding a block-less file passes
  trivially. The regression test seeds an existing block for exactly this reason.
- [ ] **TEST-1 · Two Polyglot tests fail at HEAD** (pre-existing, unrelated to the loop's work).
  `status: open` `npm test` → 203/205. (a) `src/lib/gateFindings.test.js:45` *"harvest groups +
  attributes defects"* — asserts "at least the loom lens defect + loom render-wiring defect" and gets
  none, so the gate→owner defect harvester is dropping findings it should group. (b)
  `src/routes/workspace.test.mjs` *"projects/sync is idempotent + auto-adopts (unlinkedBuilds
  empties)"*. Verified pre-existing: both test files **and** their sources are byte-identical to HEAD
  (`git status --porcelain` clean for all four). (a) matters most — a silently-empty defect harvest is
  the same failure mode as HYG-1: a green-looking pipeline that moved nothing.
- [ ] **HYG-2 · Audit the other machine-managed block writers for the HYG-1 bug class.** `status: open`
  Any `String.replace(re, <content containing user/rule text>)` is vulnerable. Sweep the WordPress
  distributor and any other agent/file templater for string-replacement writes and convert them to
  replacer functions + a written-block assertion. *Done when:* the sweep is recorded here with the
  files checked and any conversions made.
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
