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

**Hard rules:** Node 20 · toolkit suite must stay green (**84/84** as of 2026-07-23 — the count grows
when a suite is added; what matters is ALL SUITES PASS, never a drop) · `node toolkit/scripts/X.mjs` from a
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
- [ ] **RM-3 · Calibrate L2 on a REAL design-export-vs-render pair, then flip.** `status: blocked-by human`
  Need one genuine design frame (Figma export **or** a client screenshot of the intended design — it
  does not have to come from the MCP) paired with the rendered build of that same surface. Confirm zero
  false positives there, then set `REFERENCE_MATCH_ENFORCE=1` as the default in
  `check-reference-match.mjs` + the docs.
  *Searched 2026-07-23 — no usable pair exists on disk.* cravinbyandy has **no** persisted references
  and no design images under `docs/` (only `Cravin-Brand-Document.pdf` + text specs); `gpt test 1` has
  none either. The 4 loose root PNGs are agent captures (`team-section-*`, gitignored). The one real
  design source found is the client's **Figma walkthrough video** (see REF-VID-1) — but at 832×400, a
  design frame *inside* the Figma canvas is only ~290px wide. That is enough to read STRUCTURE and far
  too degraded to judge type/spacing/colour, so using it as the reference would measure the video's
  blur, not L2's false-positive rate. Pairing it against a Lens frame is also unsound here: the
  recording shows a 4-image collage hero while the current render shows a single-photo hero with 2
  pagination dots, and I cannot tell without guessing whether that is a genuine divergence or simply a
  different slide — and guessing is the documented anti-pattern this whole workstream exists to stop.
  `status: blocked-by human` — **needs one full-resolution design frame** (a Figma PNG export, or a
  crisp screenshot of the intended design) for a surface we can also render. That is the only missing
  input; everything else is built and proven.
- [x] **FIG-1 · The Figma MCP is rate-limited on the Starter plan — now mechanized, not just documented.**
  `status: done` Verified live 2026-07-23: `get_screenshot` returned *"You've reached the Figma MCP tool
  call limit on the Starter plan."* `docs/design/catering-popup-spec.md` hit the same cap on 2026-07-15,
  which is why that spec's measurements came from screenshots that were then lost.
  **A second bug was found while implementing this, and it mattered more than the docs:** re-registering
  a reference to correct its archetype (`--surface home --name hero --archetype carousel`, no `--image`)
  passed `reference: null` into `upsertEntry` and **silently wiped the persisted export** — forcing a
  re-fetch against the very API that is capped. "Persist always" only held for the first command.
  **Shipped:** (a) provenance is now sticky — `reference`/`figma_node`/`figma_file` are overwritten only
  by a new non-empty value, never cleared by an omitted flag; (b) `--figma-file` so the cache key is
  file+node (node ids are unique only *within* a file; cravinbyandy has four keys in play); (c)
  `--check-figma <node> [--figma-file <key>]` — a cache **probe** that spends no Figma call: exit 0
  cached / 1 may-fetch / 2 ambiguous, and ambiguity is *refused* rather than guessed, so a probe can
  never hand back the wrong file's design; (d) explicit rate-limit + degrade-to-Path-A rules in
  `stitch.md` (Path B step 4a) and `drape.md` (anti-pattern 17c), and in `/shopify-build` STEP 1b where
  a build actually hits it.
  *Proof:* new fixture `__fixtures__/reference-ingest/` — 21 assertions, incl. the wipe regression;
  against a copy carrying the old code the same input yields `reference: null` (⇒ case (a) fails), so
  the test has teeth. End-to-end on a temp repo: probe→miss(1) → ingest → probe→CACHED(0) →
  re-register archetype → export still present → probe→CACHED(0). Toolkit suite **81/81**. Commit `2b6f08f9`.
- [x] **REF-VID-1 · A client walkthrough VIDEO is the one reference format guaranteed to be lost.**
  `status: done` Found while searching for an RM-3 pair: cravinbyandy's **7-minute Figma + staging
  walkthrough** (`WhatsApp Video 2026-07-21 at 11.49.37.mp4`, 832×400, 19,215 frames) is still sitting
  in the repo — while the reference-conformance plan recorded its frames as *"discarded with the
  session"* and 4 items were left marked *"resolve by frame-match at build start"*. Verified cause:
  `.gitignore:11 *.mp4` matches it, so the client's authoritative design is **invisible to git, to the
  next session, and to every gate**. With FIG-1's Figma cap, a recording like this is often the only
  *accessible* design source, and nothing could read it.
  **Shipped:** `reference-ingest.mjs --video <file> --at <M:SS|seconds>` extracts one frame with ffmpeg
  and persists it exactly like a still, into `docs/design/references/` (verified **not** gitignored),
  recording `source_video` + `source_at` so the moment is reproducible. `parseTimestamp` accepts
  `90` / `1:30` / `00:01:30` / `1:30.5` and rejects `1:75`; ffmpeg-missing degrades to a clear
  "screenshot it yourself and pass --image". Documented in `/shopify-build` STEP 1b **with the honest
  resolution caveat** — a design frame inside a canvas view can be ~290px wide, fine for structure,
  useless for type/spacing/colour; say which you relied on.
  *Proof:* fixture grew to 40 assertions (cases f–i, incl. the falsy-zero trap where `--at 0` must not
  read as "no timestamp"). End-to-end on the **real client video**: extracted the 0:20 frame →
  `docs/design/references/home/hero-design.png` (832×400) with `source_video`/`source_at: 20`, then
  re-registered the archetype with no `--video` and the frame + provenance survived. Toolkit **81/81**.
- [x] **GI-1 · The reuse requirement is now honestly scoped — the gate contradicted its own doctrine.**
  `status: done` **The premise in this item was wrong and is corrected:** gate #23 is *not*
  "N/A-by-absence" on cravinbyandy. It resolves correctly and reports
  `reuse-map.missing — section-reuse-map.md not found but 16 new section(s) added since base`, which is
  precisely right; it merely exits 0 because the gate is still Phase-A warn-only. Also, the map is a
  *fallback* scope source for the ~8 gates that read it — cravinbyandy's `base` tag resolves, so the
  primary scope path is used and those gates are **not** degraded by its absence.
  **The real defect, found by verifying the gate against its own spec:** `section-reuse-first-protocol.md`
  §Targets states *"Minimog = reuse-first → ≥70% REUSE+CONFIGURE. Dawn = custom-first → 70–80% CUSTOM
  expected (the ≥70%-reuse row is MINIMOG-ONLY; on Dawn it does not apply)"* and its table says the
  enforcement *"gate flips by `theme_base`"*. **The gate never implemented that flip** — it hardcoded a
  universal 70% reuse floor. cravinbyandy is `theme_base: "dawn"`, so a *correct* custom-first Dawn
  build scores ~20–30% reuse and trips `reuse-map.reuse-below-target`. The moment
  `REUSE_MAP_ENFORCE=1` flipped, the gate would have blocked exactly the builds the doctrine asks for —
  and this is also why the artifact is never authored: an honest Dawn map guaranteed a failure needing
  a Yash waiver.
  **Shipped:** the floor is now read from `theme_base` in `docs/design/design-system.json` — Dawn ⇒ no
  reuse quota (the share is still reported as `reuse-map.reuse-share-informational`, so a human can
  still read it), Minimog/unknown ⇒ the 70% floor with the reason named, and an explicit `REUSE_TARGET`
  env override still wins on any base. `themeBase` + `reuseFloorApplies` are recorded in the report.
  *Proof:* fixture grew 10→17 cases (11–15 pin the flip, the Minimog quota staying armed, the
  unknown-base default, the override, and no false flag on a reuse-heavy Dawn build). Against a copy
  carrying the pre-fix code the same correct Dawn input gives
  `BLOCK reuse-map.reuse-below-target — reuse+configure 20% < target 70%`, vs PASS + informational on
  the fix. Toolkit **81/81**. Commit `ef90ddd2`.
- [x] **GI-2 · `generate-reuse-map.mjs` — derives the mechanical half, refuses to invent the rest.**
  `status: done` Nothing in the toolkit could produce a `section-reuse-map.md`, which is why it is
  never written. The generator derives the counts from git + the template JSON, **file-based** because
  that is what gate #23 cross-checks (`custom` must equal the count of `sections/*.liquid` added since
  `base`) — instance-based counting would have produced 28 and tripped `custom-count-mismatch`.
  `main-*` drivers are excluded from the reuse denominator per protocol §Targets.
  **It deliberately does NOT emit `Custom split {library, scratch}` or any `blueprint:` justification** —
  those are authorship history that is not in the repo, and a fabricated value would let a build pass
  onyx Audit 7 on invented numbers, indistinguishable from a real pass. They are emitted as a TODO
  checklist instead, so the map is **incomplete by design** and the gate blocks until a human finishes it.
  Also refuses to overwrite an existing map without `--force`.
  *Proof (real store, round trip):* on cravinbyandy it derived
  `reused 0 · configured 4 · extended 2 · custom 16`; feeding that generated map to gate #23 under
  `REUSE_MAP_ENFORCE=1` gives **BLOCK `reuse-map.custom-split-missing`** and *no*
  `custom-count-mismatch` — proving the derived custom=16 matches the 16 real files. Appending the two
  human fields flips the same map to **PASS**. New fixture `__fixtures__/reuse-map-generate/` = 22
  assertions (commit `ac7c0310`), incl. case (e) which fails if the generator ever emits either judgement field, and case
  (f) which pins the Counts line against gate #23's own regex. Toolkit **82/82**.
  *Found while generating:* `gifting-occasions.liquid` is added since base but referenced by **no**
  template — dead weight no render-time gate can see (logged as CB-8).
- [x] **DOC-1 · Seeded cravinbyandy's discovery artifacts — and fixed a gate that punished the honest brief.**
  `status: done` Both files written **from repo artifacts only**: the client's official brand kit
  (`Cravin-Brand-Document.pdf` — exact palettes for both sub-brands, and the Playfair/Gill Sans/Aerotis
  type intent), `design-system.json`, `design-spec.md`, and decisions recorded in `CHANGES.md`.
  `discovery.goals-missing` + `discovery.brand-missing` are both **gone**.
  Nothing was invented. `brand-direction.md` §5 and `goals.json._needs_yash` list what is genuinely
  unknown; revenue/AOV/CVR are `null`, which the contract explicitly permits (*"null =
  unknown-at-discovery, never an adjective"*). Voice is labelled **observed-from-the-build**, not
  client-ratified. Only two non-null numbers were added and both are published constants, not client
  targets: `lcp_target_s 2.5` (the lumen gate constant) and the Core Web Vitals `inp 200` / `cls 0.1`.
  **Gate bug found and fixed while doing it.** The adjective-as-goal regex was unanchored, so `_s`
  matched any key merely *containing* it — `_source`, `_status` and `priority_surfaces` were all read as
  numeric target fields. A goals.json that documented its own provenance (the `_source` convention
  `design-system.json` already uses) was therefore reported as the *"faster/more sales"* anti-pattern:
  the check punished exactly the honest brief it exists to encourage. Suffixes are now end-anchored and
  prefixes start-anchored.
  *Proof:* discovery fixture 4→7 cases — (e) `_source`/`_status` no longer trip it, (f) a real adjective
  in `cvr_target_pct` still blocks, (g) every canonical field shape (`_monthly$`/`_target$`/`_s$`) still
  matches. On cravinbyandy the false `goal-as-adjective` is gone; dev grade PASSES, and dispatch grade
  leaves exactly 2 honest blockers (`no-cvr-target`, `measurement-incomplete`) that need Yash.
  Toolkit **82/82**. Commit `15592ad1`.
  ⚠️ The two files are written into the **client** repo and left **uncommitted** — committing there is a
  separate call (see CB-7).
- [x] **DOC-2 · Gate #0.4's reference-brand check could false-PASS — now structure-scoped.**
  `status: done` It decided "≥2 reference brands each with a what-to-take" by counting regex hits for
  `[A-Z][\w& .'’]{1,30}\s*[—\-–:(]\s*\w` **anywhere in the file**. The cravinbyandy brief written in
  DOC-1 states explicitly that **no reference brands are recorded**, yet the check did not fire — its
  palette and type tables ("Playfair Display — weight 400 italic emphasis") matched that shape. The
  gate was reporting references the brief does not have.
  **Now:** `referenceBrands()` parses two declared forms and nothing else — (1) a heading mentioning
  "referenc", counting only list items / table rows inside it (header rows skipped, scope ends at the
  next same-or-higher heading, clause must be ≥3 words); (2) the inline `**References:** Brand (what to
  take), …` line, scoped to that one line. Prose elsewhere can no longer satisfy it.
  **A false BLOCK was caught mid-change and fixed:** requiring form (1) rejected the `discovery-schema`
  fixtures, which use the perfectly reasonable inline form (2) — the suite went 1/82 FAILED and told me.
  Both forms are now supported and both are pinned, because a false block is as damaging as the false
  pass this fixes.
  *Proof:* discovery fixture 7→12 cases — (i) is the regression (type/palette tables no longer count),
  (j) an empty References section is caught, (k) table form + header-row skip, (l) bare names and
  one-word clauses miss the floor, (m) the inline form is accepted but a single inline brand still
  blocks. Against a copy carrying the old heuristic the same "we have no references" brief yields
  **0** `brand-references-thin` findings vs **1** on the fix. On cravinbyandy the gate now correctly
  blocks, agreeing with what §5 of the brief itself says. Toolkit **82/82**. Commit `0c5668cd`.
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
  contains a replacement pattern). Toolkit suite 80/80. Commit `6c96b983`.
  Note: `~/.claude` is not a git repo, so the mantle.md repair exists **on disk only** — it is not
  captured by any commit and would be undone by restoring an old copy of that file.
  ⚠️ **The bug only fires on the REPLACE path** (a file that already has a managed block); a fresh file
  takes a concatenation branch that was never vulnerable — a test seeding a block-less file passes
  trivially. The regression test seeds an existing block for exactly this reason.
- [x] **TEST-1 · BOTH `npm test` failures fixed — the suite is fully green (211/211).**
  `status: done` It was 203/205 when logged; it is now **211/211, zero failures**. Neither was flaky —
  each was a real defect the test had been reporting honestly all along.
  **(a) `gateFindings` — a rotted gate→owner table.** Six keys named gates that no longer exist
  (`theme-check`→`code-lint`, `render-wiring`→`render-check`, `a11y-static`→`static-a11y`,
  `design-system`→`design-tokens`, `antipatterns`→`dead-code`, `functional`→`functionality`). Since an
  unmapped gate is **skipped** (`if (!owner) continue`), the harvester dropped most static-gate defects:
  against a real store's 32 reports only **4 of 15** keys matched anything on disk. The gate→training
  signal loop was starved and said nothing. Fixed by mirroring the toolkit's `CODE_GATE_OWNER` under
  canonical names + an `EXTRA` set + documented `LEGACY_GATE_ALIAS`; guarded by
  `src/gateFindingsOwners.test.mjs` (4 cases), which immediately caught 3 of my own carried-over
  entries naming non-existent gates. Commit `6f242feb`.
  **(b) `projects/sync` — a build whose only project is ARCHIVED was reported as unlinked forever.**
  PASS 2 correctly declines to adopt it (`getProjectByBuildDir` sees archived rows), but `linked` was
  built from the **active-only** project list — so the build fell through to `unlinkedBuilds` on every
  sync. The UI kept offering "link this build", adopting did nothing because the idempotency guard
  blocked it, and `adopted` stayed 0: it could never self-heal. Two real builds
  (`production-hunt`, `gpt-test-1-app`) were stuck in exactly that state.
  **Fixed** by reporting them under a new `archivedBuilds` field rather than hiding them — restore is
  the real action there, not adopt. The frontend already lists archived projects separately, so their
  builds appearing under "unlinked" was pure duplication.
  *Proof:* on real state the two builds move `unlinkedBuilds 2 → 0`, `archivedBuilds 2`; the test now
  also asserts no build is counted as both, and that an archived build is never linked to an active
  project. `workspace.test.mjs` 36/36 · **`npm test` 211/211** · toolkit **82/82**. Commit `5b7c6056`.
- [x] **HYG-2 · Swept the repo for the HYG-1 bug class — 11 real sites fixed + a permanent guard.**
  `status: done` Scanned `scripts/`, `src/`, `theme-toolkit/scripts/` (280 files) for generated content
  passed to `String.replace` as a **string** replacement.
  **Fixed (11 sites, 7 files):** `swt-train-loop.mjs` ×4 (the FAQ-meter marker block — the exact HYG-1
  shape — plus the ledger row and two gate-rename rewrites), `fix-binding-gaps.mjs` ×2 (incl.
  `body.replace(bindSec, newSec)`, a string needle with a generated replacement),
  `backfill-recall-enrichment.mjs` ×4, `migrate-gate-refs.mjs` ×3, `reconcile-loved-citations.mjs` ×2,
  `keystone-clone.mjs` ×1, and **`src/routes/sales.js` ×1 — the highest real risk**, because `outcome`
  is free text a user types about a client chat, so a stray `$&` corrupts the record.
  Where `$1` was intentional the capture now comes from the replacer's **arguments** instead, keeping
  group semantics while making the interpolated text inert. **`src/intelligence/trainer.mjs` was checked
  and is safe** — it edits its managed block with `indexOf`/`slice` + concatenation, never `replace()`.
  **Guard:** new `src/replaceSafety.test.mjs` scans the repo for two unambiguous signatures — a
  template literal with `${…}` in the replacement position, and `replace(identifier, identifier)` — with
  a `safe-replace-ok` comment escape hatch (used once, for a genuine scanner artifact in
  `check-design-system.mjs` where the template literal is a message argument, not a replacement).
  *Proof:* the guard's own teeth test **caught a bug in the guard**: `\.replaceAll?\(` binds the `?` to
  the final `l`, so it required "replaceAl" and matched nothing — the repo scan was passing vacuously
  until that test failed. After the fix it found the 12 hits above. Behavioural check on the real call
  sites: a ledger note containing `` $` `` gives *sentinel ×2, written literally: false* pre-fix vs
  *×1, true* on the fix. Toolkit **82/82**; all 8 edited files pass `node --check`. Commit `9e7b9c2c`.
  ⚠️ `node --test src/replaceSafety.test.mjs` **hangs in this repo** (the runner, not the test — a direct
  `import()` of the same file completes in 95 ms and reports both cases). Logged as TEST-2.
- [x] **TEST-2 · CORRECTED — the guards DO run in CI; the hang is narrower than I reported.**
  `status: done` My previous write-up said `node --test` hangs and implied the guard might not run
  under `npm test`. **That conclusion was wrong.** Verified: `npm test` completes in **4s** and its
  output contains all 4 guard assertions, so the guards run exactly as intended.
  What is real: invoking `node --test --test-force-exit <a single .mjs file under src/>` sometimes
  stalls after the first case (reproduced at 90s+, killed) — it is not load-dependent as I first
  guessed, but it does **not** affect `npm test`, which runs the whole directory and exits cleanly.
  Workaround when debugging one file: `node -e 'import("./src/<file>.test.mjs")'`, which completes in
  ~2s and prints the same TAP. Not worth chasing further — no CI impact.
- [x] **BRAIN-1 · The digest DOES run — but 65 sessions could never be digested. Fixed.**
  `status: done` **Row counts, as asked.** `vscode_session`: **123 digested** (last 2026-07-22) vs
  **72 pending_digest** spanning 2026-06-19 → 07-23. `learning_inbox`: **83 rows**, with new entries on
  07-22 (6) and 07-23 (1). So the 04:00 job fired and the loop is alive — that half of the question is
  a clean yes.
  **But the pending count told a second story.** `getPendingVscodeSessions(hours = 24, …)` selects only
  `createdAt >= now - 24h`. A session still pending once it ages past that window can **never** be
  selected again — it is permanently undigestable, and nothing reports the loss. That is precisely what
  the 06-30 → 07-22 outage produced: re-enabling the job recovered only the last 24h and stranded the
  rest. Measured split at the time of the fix: **7 in-window, 65 stranded** (oldest
  `2026-06-19T05:21`). Those 65 sessions' lessons were silently gone. Same silent-loss family as HYG-1,
  the skipped-but-passing gates, and TEST-1a's starved harvester.
  **Shipped:** `getStrandedVscodeSessions()` (oldest-first) + `countPendingVscodeSessions()` (returns
  `{inWindow, stranded, oldest}`), and `learningDigest` now fills whatever slots fresh sessions leave
  spare with the OLDEST stranded ones, so a backlog drains deterministically instead of starving behind
  new work. The window is configurable (`learning.vscode.digestLookbackHours`) but the 24h default is
  unchanged — fresh sessions keep priority. The backlog is now **reported** in both the job's output
  line and its metadata, so it can never rot unseen again.
  *Proof:* replaying the handler's exact selection against the live DB picks 7 fresh + **13 drained**
  (oldest `2026-06-19`) — where previously **0 of the 65** were reachable, so it now clears in ~5 runs.
  New `src/lib/vscodeSessionBacklog.test.js` (3 cases) pins that stranded rows are counted, retrievable
  oldest-first, and that the two queries partition the pending set exactly. `npm test` **212/212** ·
  toolkit **82/82**. Commit `e03bc7b2`.
- [x] **BRAIN-2 · Ollama recovered — but the QUERY side had no guard at all. Fixed.**
  `status: done` **The premise is stale:** Ollama is up, `nomic-embed-text` is pulled, and the index
  was rebuilt today — manifest `ollama/nomic-embed-text dim=768`, **34,017 chunks**, `updated_at
  2026-07-23T02:34`. A live query returns real hits (top cosine **0.777**). So the reindex is not
  failing.
  **What the item actually asked for — "detect + report clearly" — was genuinely missing.**
  `reindex.mjs` detects a changed embedder and forces a full re-embed, but only when it RUNS.
  `retrieve.mjs` never compared anything: between a provider change — or exactly the outage this item
  describes, where someone sets `INTEL_EMBED_PROVIDER=hash` to unblock — and the next reindex, every
  query is embedded with one model and ranked against an index built by another. `memory_search` then
  returns confidently-ranked nonsense and says nothing. (`embed()` itself is sound: it throws rather
  than silently falling back to hash.)
  **Shipped:** pure `embedderMismatch(manifest, current, queryDim)` + `indexHealth()`, wired into
  `retrieve()`. A provider/model drift at the same dim **warns once**; a **dim** mismatch **throws** —
  cosine across different-length vectors is not a degraded ranking, it is a category error, and
  returning an order at all would be fabricating a result.
  *Proof (end-to-end, live index):* normal path → `health.ok true`, 3 hits, top cosine 0.777. Forcing
  `INTEL_EMBED_PROVIDER=hash` → `health.ok false` and the query is **REFUSED** with
  *"MISMATCH (provider ollama → hash, model nomic-embed-text → hash, dim 768 → 512)"* — previously that
  path returned silent nonsense. 6 unit cases cover match / hash-vs-ollama fatal / same-dim model swap /
  no-manifest / missing-dim / provider drift. Fixed one flaw in my own code on the way: `indexHealth()`
  compared the manifest dim to itself, so its `fatal` flag could never fire — it now reports
  provider/model only and defers the dim check to query time rather than showing a reassuring field
  that can never trigger. `npm test` **222/222** · toolkit **82/82**. Commit `84f3d761`.
- [x] **TEST-3 · The suite was silently skipping whole test FILES and still reporting all-green.**
  `status: done` The flakiness was the small half. The real finding: on an unchanged tree, consecutive
  `npm test` runs reported **213 / 215 / 222** tests — every one of them "0 failures, cancelled 0".
  Diffing the runs, run 1 was missing **8 tests from two files** (`governor.test.mjs`,
  `buildSchedules.test.js`) that run 3 executed, with none missing the other way. Those files never ran
  and nothing said so. A green suite that quietly skipped two files is exactly the failure this backlog
  keeps finding — *a skipped check is not a passed check* — except one level up, in the harness itself,
  which means every "npm test green" claim in this file was weaker than it looked.
  **Cause:** `node --test --test-force-exit src/` runs files concurrently and the forced exit truncates
  files still queued. Verified as a genuine trade-off, not a stray flag: **without** `--test-force-exit`
  the runner hangs on leaked handles (3/3 runs killed at 90s), which is why it was added.
  **Fixed** with `--test-concurrency=1`: **222/222, identical test set, 3/3 runs**, ~7s vs ~4s — and it
  also eliminated the `/ai/*` reattach flakes, which were cross-test interference from parallel
  execution, not genuine test bugs.
  *Proof:* three consecutive runs produce byte-identical sorted test-name lists (`diff` clean), and the
  two previously-vanishing files are present in all three. New `src/testRunnerIntegrity.test.mjs` pins
  both flags with the reasoning, and rejects the pre-fix script string. `npm test` **224/224** ·
  toolkit **82/82**. Commit `0edc44b6`.
- [x] **TEST-4 · Both handle leaks found and fixed — the suite now exits on its own, no masking flags.**
  `status: done` Bisected by importing each of the 33 test files in isolation and letting the process
  try to exit naturally. Two leaked, both holding a `Timeout`; a timer spy that records creation stacks
  named each one exactly:
  **(1) `src/routes/learning.js:138`** — a module-level `setInterval` with **no `.unref()`**, so merely
  *requiring* the route file pinned the event loop forever. Its two siblings (`rateLimit.js`,
  `playground.js`) already unref'd theirs — and rateLimit's comment spells out precisely why. This one
  was the outlier.
  **(2) `src/routes/schedules.test.js`** — creating schedules through the API starts **real node-cron
  jobs** whose internal `setTimeout` never stops. `stopAllSchedules()` was already exported; the test's
  `after()` simply never called it.
  **Both masking flags are now gone.** `npm test` is plain `node --test src/`: **225/225 in ~3s**,
  exiting on its own, with byte-identical test sets across runs. That supersedes TEST-3's
  `--test-concurrency=1` workaround — it was only needed because `--test-force-exit` truncated queued
  files, and force-exit was only needed because of these leaks. Removing it also means the **next**
  handle leak will hang loudly instead of silently dropping test files.
  *Proof:* both files exit cleanly under the probe (was: killed at 8s); `node --test src/` completes
  3/3 without force-exit; parallel is deterministic again (3/3 identical sets, 3s vs 7s serial).
  `src/testRunnerIntegrity.test.mjs` now pins the **absence** of `--test-force-exit` and scans every
  route file for a module-level `setInterval` missing `.unref()`. Its teeth-check caught a greedy-regex
  bug in my own scanner that flagged already-fixed code — fixed with a non-greedy, end-anchored match.
  `npm test` **225/225** · toolkit **82/82**. Commit `f3b58d38`.


## P1 — the 478 findings cravinbyandy surfaced once its gates started working

- [~] **CB-1 · Colour swap MECHANIZED + a gate-stack contradiction fixed. 201 → 51 measured.**
  `status: open` (tooling done; application to the client repo is the remaining step)
  Three things had to be true before a single literal could be safely replaced, and none of them were:
  **(1) There was no brand token to bind to.** The cascade generator emitted type/spacing/weight/font
  and skipped `color` entirely, so the PDF-authoritative palette was unreachable from CSS. Now emits
  `--ds-color-*` verbatim. Commit `88a136ed`.
  **(2) Nothing checked the cascade was LOADED.** Gate #30 proved it existed and was fresh, never that
  a layout included it — and swapping to `var(--ds-color-*)` in an unwired theme *deletes* the colour
  (an undefined custom property invalidates the declaration). New `cascade.not-wired`. Commit `f60c287f`.
  **(3) Two gates directly contradicted each other.** Gate #8 flagged `--ds-*` as
  `ds.second-token` ("second token system") while gate #30 emits exactly those vars from the toolkit's
  own generator and *warns* when sections fail to bind to them. Doing what the cascade asked tripped a
  blocker in the design-token gate — measured: wiring the cascade traded 150 colour blockers for **15
  `ds.second-token`** ones. `--ds-*` is not bolted on; it is this toolkit's first-class system (the same
  reasoning the code already applied to `--brand-*`). `--tw-*` still blocks. **This is very likely why
  `design-system.css` was never generated or wired on any store.**
  **Shipped:** `snap-colors-to-tokens.mjs` — replaces a literal only when its **canonical** value is
  byte-identical to a token (`#abc`→`#aabbcc`, case-folded, `rgb()`→hex, opaque `rgba()`→hex), leaves
  every non-match untouched **and reported**, skips shadow/filter (as the gate does), and **refuses
  `--apply`** unless the cascade is generated *and* wired.
  *Proof (real theme, scratch copy — the client repo was NOT modified):* generate → wire → apply gives
  **colour blockers 201 → 51 (150 resolved, 75%)**, total **476 → 326**, **no new blocker ids**, and
  gate #30 goes to 0 blockers. The 51 survivors are literals with no exact token (`#829474`, `#365237`,
  `rgba(44,61,30,0.52)` …) — design decisions, correctly refused. New `snap-colors` fixture (34
  assertions) + `design-tokens` cases (d)/(e). A bug caught on real data: a naive `[^)]*` truncated
  `rgb(var(--color-foreground))` into 194 phantom "literals"; now nested-paren aware and var-bound
  values are skipped. Toolkit **84/84** · `npm test` **225/225**.
  **Remaining:** run the three steps in the client repo (`generate-design-system-css.mjs` → add the
  `stylesheet_tag` to `layout/theme.liquid` → `snap-colors-to-tokens.mjs --apply`) and commit there.
  Held back because it edits ~150 sites across a live client theme — worth one visual check on staging
  first, even though the swap is value-identical by construction.
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
- [ ] **CB-8 · `sections/gifting-occasions.liquid` is orphaned** — added since `base` but referenced by
  no template or section group. `status: open` Dead weight that no render-time gate can see (nothing
  renders it, so #14/#18/#46 never look at it) while it still counts toward the custom total. Either
  wire it into the gifting template or delete it. Surfaced by `generate-reuse-map.mjs`. *Done when:*
  the generator reports 0 orphaned sections on cravinbyandy.
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

- [ ] **REF-VID-2 · Persist the cravinbyandy walkthrough's key frames as real references.**
  `status: open` The mechanism now exists (REF-VID-1) but the client repo still has an **empty**
  reference map. Survey the recording, and for each surface it covers (home hero, about/"Meet Andy",
  locations carousel, catering, gifting, footer) resolve the archetype from the visible structural
  signals and persist the frame. **Do not guess an archetype from a blurry canvas view** — prefer the
  frames where the surface fills the screen, and leave anything ambiguous for Yash rather than
  registering a wrong archetype (a wrong reference is worse than none: gate #46 would then block the
  correct build). *Done when:* `reference-ingest.mjs --list` on cravinbyandy shows the surfaces with
  images present, and `check-reference-match.mjs` runs non-N/A there.

## Needs Yash (do not guess — guessing is what caused the re-asks)

- **Marquee 20px vs 28px** — CSS documents Figma=28; home ships 20 after "now font size too big".
- **Ratify the PROVISIONAL type/spacing ladder** in cravinbyandy's `design-system.json`.
- **Swiggy/Zomato URLs**, Gill Sans `.woff2` licence, real photography, `matcha.jpg` ≥1400px.
- **Which Figma file is authoritative** — four different keys are in play.
- **cravinbyandy `goals.json` — the numbers only you have:** revenue current/target, AOV current/target,
  CVR current/target, and a *ranking* of the priority surfaces (the file lists all five the built site
  has, in build order, explicitly not as a priority claim). Also GA4 + GSC + Shopify-analytics access,
  without which orbit cannot measure lift at 30/90 days. These are the 2 remaining dispatch-grade
  blockers on gate #0.4. NB: `check-discovery` tells the author to "resolve cvr_target to the niche
  default", but no CVR default is published anywhere — the niche table gives surface **lift**, not a
  conversion rate — so it is null rather than invented.
- **Reference brands for cravinbyandy** (≥2, each with a specific "what to take") — none exist in the
  repo; needed for `brand-direction.md` §5.1, or commission a decoder teardown of comparable
  hospitality/cafe brands.
- **One full-resolution design frame** (Figma PNG export or a crisp screenshot of the intended design)
  for any surface we can render — the single missing input for **RM-3**, which then flips L2
  reference-match from warn-only to enforcing. The walkthrough video cannot substitute: its in-canvas
  design frames are ~290px wide.
- **Home hero: is the 4-image collage still the intended design?** The 2026-07-21 walkthrough shows a
  collage hero; the current build renders a single-photo hero with 2 pagination dots. Could be slide 2
  of the same slideshow, could be a drift. Not guessing (see REF-VID-2).

---

## Log (append one line per completed item)
- 2026-07-22 · seeded from the VS-Code loop audit + cravinbyandy forensics + reference-conformance work.
- 2026-07-23 · RM-1 done (`c226990e`) — L2 proven on cravinbyandy; behavioural-signal false positive fixed.
- 2026-07-23 · RM-2 closed, enforce flip **declined** — criterion was too weak (identical-image controls
  only). Replaced by RM-3; blocked by FIG-1 (Figma MCP Starter rate limit, hit live).
- 2026-07-23 · HYG-1 done (`6c96b983`) — root cause was a silent `$`-replacement bug in swt-distribute
  that spliced whole files into agents' managed blocks. Fixed + 4-case regression test + mantle repaired.
- 2026-07-23 · discovered TEST-1 (2 pre-existing `npm test` failures at HEAD) and HYG-2 (sweep other
  managed-block writers for the same bug class).
- 2026-07-23 · FIG-1 done (`2b6f08f9`) — Figma rate cap mechanized: cache probe + sticky provenance +
  degrade-to-Path-A rules. Found and fixed a second bug: re-registering wiped the persisted export.
  RM-3 un-blocked as a side effect (it never actually needed the MCP).
- 2026-07-23 · REF-VID-1 done (`03d20350`) — found the client's Figma walkthrough video alive in the repo
  but hidden by `.gitignore *.mp4`; shipped `--video/--at` frame ingestion. RM-3 re-blocked on a real
  full-res design frame (searched: none on disk); logged REF-VID-2 to persist the walkthrough's frames.
- 2026-07-23 · GI-1 done (`ef90ddd2`) — gate #23 hardcoded a universal 70% reuse floor while its own
  protocol says the floor "flips by theme_base" and does not apply to Dawn; it would have BLOCKED every
  correct custom-first Dawn build on enforce. Floor is now theme-base-conditional. Logged GI-2 (the map
  artifact + a generator that refuses to fabricate the two judgement fields).
