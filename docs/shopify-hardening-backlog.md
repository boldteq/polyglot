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

**Hard rules:** Node 20 · toolkit suite must stay green (**96/96** as of 2026-07-23 — the count grows
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


- [x] **ENV-1 · Gate #2 (theme-check / Liquid lint) had NEVER been able to run — and said so wrongly.**
  `status: done` Found while re-verifying CB-5/CB-6: the gate reported *"shopify CLI not found on PATH —
  install `@shopify/cli@3`"*, but the CLI **is** installed and on PATH. It crashes on launch under the
  Node this toolkit mandates: `@shopify/cli` imports `enableCompileCache` from `node:module`, which
  **Node 20.20.1 does not export** (verified `undefined`; v18 also fails; **Node 22.22.3 runs it fine**,
  CLI v4.1.0). So the printed remedy could never work — reinstalling does not change the launching Node
  — and the Liquid linter silently never ran on any build. It did report `pass:false` (honest, gate #45),
  but it was **unfixable by anyone following its own advice**, which is worse than a plain failure.
  This also made my first CB-5/CB-6 verification vacuous: "0 findings" came from a gate that never ran.
  **Shipped:** the guard now distinguishes MISSING (install it) from installed-but-unlaunchable, and when
  the current runtime cannot load the CLI it **finds one that can** — resolving the CLI entry via the
  PATH symlink and trying each installed Node newest-first (`SHOPIFY_CLI_NODE` overrides). The error, if
  it still fails, carries the real stderr and a remedy that is actually true. `classifyProbe` lives in
  `lib/cli-probe.mjs` so tests can import it **without executing the gate** (importing the gate runs
  theme-check — that trap bit once here).
  *Proof:* on cravinbyandy the gate now RUNS via Node 22 — **0 errors, 8 warnings across 25 files,
  `pass:true`** (was: skipped, never linted). That also gives CB-6 a real proof at last: the 38
  `body_font_weight` errors are gone **per the actual linter**, not just my structural parse. New
  `theme-check-runtime` fixture pins the taxonomy, including that a non-zero exit is *never* reported as
  "missing". One test expectation of mine was wrong and I corrected it rather than the code
  (`Cannot find module` is a broken install → `broken`, not a runtime mismatch). Toolkit **85/85** · `npm test` **225/225**. Commit `2843476d`.
  ⚠️ **Standing constraint worth knowing:** the toolkit needs **Node 20** (better-sqlite3) while the
  Shopify CLI needs **≥22**. They cannot share one runtime; the gate now bridges that automatically.

- [x] **ENV-2 · Gate #45's "skipped ≠ passed" check could never fire — it watched the wrong field.**
  `status: done` Follow-up to ENV-1: since one foundational gate had been inert for months, I audited
  whether others were. Ran the full 33-gate static stack on cravinbyandy — **30 ran, 3 N/A by design, 1
  skipped for a real data reason** (`functionality`: no published products, so the PDP page cannot be
  resolved). The stack is healthy post-ENV-1.
  **But the audit found the guard itself was broken.** Gate #45 — whose entire job is *"a skipped gate
  is not a passed gate"* — tested only a **top-level `json.skipped === true`**, and **no gate has ever
  written that field** (audited: 0 occurrences across every gate script and every report on disk). The
  shape actually used is `evidence.skipped`, emitted by **8** gates (theme-check, lighthouse, axe, seo,
  functional, conversion, theme-link, theme-relink). So the check was present, believed, and inert —
  the same class as ENV-1, the `replaceAll?` regex, the manifest self-comparison, and the rotted
  gate→owner table.
  **No live false-pass exists today** — all 8 correctly set `pass:false` when they skip — so this is
  **preventative**, restoring a guarantee the stack already believes it has.
  **Shipped:** pure `skippedMarker()` reading both shapes, with the false-positive cases that matter:
  `skipped: []` (what `imagery` emits on a clean merge) and an empty reason string are **not** skips,
  and a gate that skipped *and* honestly reported `pass:false` is not flagged.
  *Proof:* 3 new fixture cases (real shape blocked, legacy shape still blocked, no false positives) —
  the first fails against the pre-fix code by construction, since `evidence.skipped` was never read. On
  the real store gate #45 stays **PASS — 34 reports audited, 0 blockers, 5 N/A warnings**, so the two
  genuine skips are not false-flagged. Toolkit **85/85** · `npm test` **225/225**. Commit `c75ca7fa`.

- [x] **QA-1 · 45 BLOCKING checks have never been proven to fire. Now detectable, not accidental.**
  `status: done` — static untested went 49 → **0** (`88b482c3`); the URL half closed under QA-2.
  Five guards were found this week that looked present, were believed, and could never fire: gate #45
  watching a field no gate writes (ENV-2), gate #2 misreporting a broken CLI launch as "not installed"
  (ENV-1), the gate→owner table naming renamed gates (TEST-1a), a `\.replaceAll?\(` regex binding `?`
  to the wrong character so a scanner matched nothing (HYG-2), and an index-health check comparing a
  value to itself (BRAIN-2). **Every one was found by accident.** The shared shape: a check whose
  failure path had never been executed.
  **Shipped:** `audit-unproven-guards.mjs` enumerates every finding id a gate can raise in a BLOCKING
  position and reports those no fixture references. **Result: 127 blocking checks across 58 gate
  scripts — 45 untested in STATIC gates (hermetically testable, no excuse) and 30 in URL gates (need a
  live page).** Reporting-only by design: 79 hard failures on first run would be the alarm avalanche
  this repo treats as equal to a false pass.
  *Proof:* its own fixture (13 assertions) covers all three blocking shapes, rejects warning-ids,
  accepts both fully-qualified and bare-suffix fixture assertions, refuses short-suffix prose matches,
  separates URL from static gates, and finds a planted untested blocker. Two self-corrections while
  building it: requiring the fully-qualified id overstated the gap by 9, and my first pass counted
  warning ids as blockers — both caught before reporting a number.
  **First 3 burned down:** `reuse-map.custom-split-missing` / `custom-split-mismatch` / `bad-rung` now
  have fixture cases — the first is what stops GI-2's generator from letting a half-authored map pass,
  verified by hand then but never pinned. Static untested **49 → 45**, confirmed by re-running the
  auditor. Toolkit **86/86** · `npm test` **225/225**. Commit `e43d9d38`.
  **Burn-down progress: static untested 49 → 45 → 31 → 24** (the two worst offenders are now covered).
  · `check-metafield-schema` **14/15 → 0**: 24 assertions, one planted defect each — forbidden/malformed
    namespaces, bad field defs and types, dangling metaobject refs, the three non-RE2 regex forms
    (lookahead/lookbehind/backreference — all valid JS, all rejected by Shopify), uncompilable regex,
    every metaobject rule, unparseable JSON, plus no-false-block cases for `list.<type>`, an RE2-safe
    regex and a self-referential-but-defined metaobject ref. **All 14 fired correctly** — the gate was
    sound, just unproven. My *baseline* was wrong (namespaces without a dot), which the gate caught.
  · `check-briefs` **7/7 → 0**: 16 assertions including the >20%-missing threshold and its boundary
    (exactly 20% must NOT block), and that STORE_BUILD conversion surfaces are only demanded on store
    builds.
  **A real defect found while doing it:** `PLACEHOLDER_RE` matched only the literal phrase `"tbd copy"`,
  so a brief containing `Headline: TBD` passed Step-4 and **design was dispatched on placeholder copy** —
  exactly what compass AP#2 forbids. (`check-discovery` catches bare `tbd`/`todo` for the same concept;
  the two gates had drifted.) Fixed with a `DRAFT_MARKER_RE` scoped to `status:ready` only — a
  `partial`/`missing` brief legitimately carries TBDs and blocking those would stall normal drafting, so
  they warn instead. Toolkit **88/88** · `npm test` **225/225**. Commit `25b77833`.
  **Round 3 — static untested 24 → 11.** Eight more blockers proven, each with its no-false-block twin:
  · `check-asset-budget` **2/2 → 0**: oversized inline `{% stylesheet %}`/`{% javascript %}`, plus the
    env-tunable budgets in both directions and a 9KB-under-10KB edge case (an off-by-one here would
    fail correct builds).
  · `check-reference-match` **3/3 → 0**: `map-invalid`, `template-missing`, `template-invalid` — the
    file-level failures that mean the reference cannot be checked at all, so a build would sail past
    gate #46 unverified. The existing fixture only covered the pure `resolveEntry()`; these needed real
    subprocess runs.
  · `check-design-system` **3/3 → 0**: off-token `border-radius`, the design-system-first `ds.missing`,
    and `scope-unresolved-strict` — the last paired with a **dev-grade** case proving the same state
    warns rather than blocks, since a false block there would stall every local run. That check is the
    direct descendant of the cravinbyandy failure that started this workstream.
  Toolkit **89/89** · `npm test` **225/225**. Commit `9fbcad2f`.
  **Round 4 — static untested 11 → 0. Every hermetically-testable BLOCKING check in the toolkit is now
  proven to fire.** (127 blocking checks across 58 gate scripts; 49 were unproven when the detector
  landed.)
  · `check-visual-truth` **5 → 0**: the Layer-1 deterministic facts — Liquid error rendered to the page,
    broken images, navigation failure — plus `capture-missing` and `judge-missing` at publish grade,
    each paired with a dev-grade case proving the same state only warns. These are the findings that
    mean *a shopper is looking at a broken page*, so an unproven one is the worst kind: the gate would
    report visual truth while never having checked it.
  · `gate-class-d-visual` **5 → 0**: the same facts on the micro-change path, plus a judge blocker
    finding and a corrupt `lens-manifest.json` (`capture-invalid` — a corrupt manifest must block, not
    be silently ignored).
  · `check-visual-quality` **1 → 0**: `audits-missing`, asserting it names the omitted audit. A review
    that quietly drops `mobile_rendering` would otherwise read as a full sign-off with a whole
    dimension unexamined.
  Toolkit **89/89** · `npm test` **225/225**. Commit `88b482c3`.
  *Remaining: 28 URL-gate blockers* — see QA-2.

- [x] **QA-2 · URL gates ARE fixturable — 28 → 21, and the "needs a live page" excuse is gone.**
  `status: done` (0 untested blockers remain — `01044c79`, `908fe01a`)
  The premise that URL gates need a real storefront is **false**. `gate-seo` talks plain `fetch` (no
  browser) and `resolvePages` discovers handles from `/products.json`, `/collections.json` and
  `sitemap.xml` — so a ~40-line `node:http` server IS a storefront as far as the gate is concerned.
  **`gate-seo` 15/16 → 8/16 unproven**, 15 assertions against a served page: title missing/too long,
  meta-description missing/short, canonical count 0 and 2, `noindex`, social meta, `<h1>` count 0 and 2,
  unparseable JSON-LD, missing `alt` — plus the clean page raising **zero** blockers.
  **Two things worth keeping:** (1) the fixture must use async `spawn`, **not `spawnSync`** — the
  storefront server lives in the same process, and `spawnSync` blocks the event loop, so the server can
  never answer and both sides deadlock until timeout. That cost an hour and the gate was innocent.
  (2) three "failures" were my own test error, not gate bugs: `meta-description` and `img-alt` are
  scoped to pdp/collection/article via `APPLY`, and I had aimed them at `home`. That scoping is now
  pinned by its own assertion, since if it ever silently widened, every store's home page would start
  failing the SEO gate. Commit `ca61683a`.
  **Round 2 — URL untested 21 → 14.**
  · `gate-conversion` **4 → 0** (zero Playwright references — it fetches and reads markup). The four
    guard the buy path itself: no hero CTA, no add-to-cart, no price, and a cart with no conversion
    mechanic at all. If they never fire, a store ships a broken funnel while the gate reports the
    mechanical 60% as passed. `cart-no-mechanic` is paired with its non-STRICT case, since blocking a
    bare cart on every dev run would stall early-stage builds.
  · `gate-seo` **8 → 5**: Product JSON-LD missing and duplicated (a PDP with none loses rich results;
    two makes Google pick one at random — both silent revenue problems), and `img-dimensions`. Plus the
    correct case: exactly one Product block raises neither. Commit `d23b987e`.
  **Round 3 — URL untested 14 → 9, and it caught a real dead guard.**
  · `gate-functional` **5 → 0**, driven by the vendored Lens chromium against a local `node:http`
    storefront — so "needs a browser" turned out not to mean "needs a real store" either.
  · **A blocker that could never fire.** `cartDrawerCheck`'s visibility test ended in
    `el.offsetParent !== null`, and `offsetParent` is null for **every** `position: fixed` element. A
    cart drawer is fixed in essentially every theme, so `found` was permanently false and BOTH
    `fn.cart-drawer-no-checkout` and `fn.cart-drawer-checkout-cutoff` were unreachable: a drawer with
    no Checkout button, or with Checkout pushed below the fold on mobile, passed this gate every time.
    Now a computed-style check (the >40x80 rect test already excludes `display:none`). Proof: same
    page, old code → 0 blockers; fixed → the blocker at all 6 viewports. **This is the third time the
    audit has found a guard that looks present and cannot fire** — the class is worth its own sweep.
  · The fixture only exercises the gate if the storefront behaves like a real AJAX theme: incrementing
    `/cart.js`, `/products/<h>.js` variants, `/cart/add.js`, and a drawer that signals open with an
    `.active` class. A full-page-POST form navigates off the PDP before the drawer runs; a drawer that
    only flips `display` is invisible to gate-axe's `assertOpen`. Both noted inline.
  · A 500-with-a-body is deliberately **not** `fn.load` — it renders, so it lands as a content problem.
    The case uses a connection reset. Commit `0e631277`.
  **Round 4 — DONE. Untested blocking checks: 0 static, 0 URL (from 49 + 28).**
  · `gate-seo` **5 → 0** — the fixture's `serve()` gained a `site` argument (robots 404 / no `Sitemap:`,
    sitemap 404 / not-an-XML-sitemap, per-URL-form canonical hrefs). Shopify serves one product at
    `/products/x`, `/products/x?variant=N` **and** `/collections/y/products/x`; if the canonical does not
    collapse those, the product competes with itself in the index — the classic silent Shopify
    duplicate-content bug. Also fixed a latent fixture defect: `page()` shipped `loading="lazy"` on every
    image, so every pdp case silently carried a `seo.pdp-gallery-lazy` blocker nobody asserted on.
    Commit `01044c79`.
  · `check-redirects` **1 → 0** — `redirect.dead-live` via `REDIRECTS_CRAWL=1` against a real server. A
    legacy URL that 404s live means the redirect was never created on the store, so every inbound link
    and indexed result for it is broken; a map that merely *parses* proves nothing.
  · `check-section-cohesion` **3 → 0** — and it found the fourth dead-evidence bug. The gate wrote its
    **PASS** report as `section-cohesion`, a **retired alias**, while its own `die()` path already used
    the manifest name `section-consistency`. `theme-gates` reads `gate-reports/<manifest-name>.json`, so
    a *passing* gate 19 left no report where anything looks for it — evidence, freshness and gate #45's
    skip-vs-pass check all saw a hole, and only failures were legible. Commit `908fe01a`.
  **Method note, now proven 4 times:** writing the fixture is what finds the defect. Every single
  unreachable guard this quarter was found by trying to make it fire, never by reading the code.

- [x] **QA-2-ORIG · (superseded framing) 28 URL-gate blocking checks unproven.** `status: done` — 0 remain (`01044c79`, `908fe01a`).
  What is left after QA-1 took static coverage to 0. `gate-seo` (15), `gate-functional` (6),
  `gate-conversion` (4) and friends only run against `THEME_PREVIEW_URL`, so they have never been
  exercised in a fixture. They block publishes, so the same argument applies — an unproven blocker is
  indistinguishable from an absent one.
  *Approach:* this does NOT need a real storefront. Serve crafted HTML from a local `node:http` server
  in the fixture and point `THEME_PREVIEW_URL` at it — a page with two `<h1>`s, a missing canonical, a
  broken add-to-cart. Lighthouse and axe additionally need a browser, so split those out; they may only
  be reachable via the Playwright already vendored for Lens.
  *Done when:* the auditor reports 0 untested for `gate-seo`, `gate-functional` and `gate-conversion`,
  each blocking id proven against a served page.

## P1 — the 478 findings cravinbyandy surfaced once its gates started working

- [x] **CB-1 · APPLIED — 146 literals bound to brand tokens.** `status: done` (client `870ffe9`)
  **My "needs a staging URL" caveat was too cautious and is withdrawn.** The swap is **identity-only by
  construction**: a literal is replaced solely when byte-identical to the token's value
  (`#2c3d1e` → `--ds-color-dark-green: #2C3D1E`), so the rendered colour *cannot* change. Verified
  independently: 14 `--ds-*` vars used, 40 defined, **0 undefined** — no declaration can be invalidated.
  The real blocker was never a preview URL; it was the **precondition chain**: `snap-colors-to-tokens`
  refuses to apply until the cascade is generated AND wired into a layout, because swapping to
  `var(--ds-color-*)` in a theme that never loads it **deletes** the colour. Ran the chain: `ds:css` →
  `theme.liquid` loads it before section styles → 146 swaps across 16 stylesheets.
  **52 distinct literals deliberately left alone** (`#405034`, `#ffedf1`, `rgba(255,255,255,0.55)`, …):
  which brand colour was meant is a *design decision*, not a mechanical substitution, and guessing would
  silently change what the client sees.
  *Proof:* static blockers **816 → 669**, matching the swap count. (Superseded framing below.)
- [x] **CB-1-ORIG · (superseded framing) Colour swap MECHANIZED + a gate-stack contradiction fixed.**
  `status: done` — its own "Remaining" step (run the 3-step chain in the client repo and commit) is
  exactly what **CB-1** above did for real: `generate-design-system-css.mjs` → wire `theme.liquid` →
  `snap-colors-to-tokens.mjs --apply`, committed `870ffe9`. Verified 2026-07-24 against live source, not
  assumed stale: `layout/theme.liquid:310` loads `design-system.css`, the asset exists on disk, and
  `870ffe9`'s own diff is exactly the described chain. This item's checkbox was left open after CB-1
  landed — the same "stale status on a completed item" class this backlog keeps finding elsewhere
  (BRAIN-1, ENV-2). No remaining work; kept for history per the doc's own -ORIG convention.
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
  values are skipped. Toolkit **84/84** · `npm test` **225/225**. Commit `7b629a53`.
  **Remaining:** run the three steps in the client repo (`generate-design-system-css.mjs` → add the
  `stylesheet_tag` to `layout/theme.liquid` → `snap-colors-to-tokens.mjs --apply`) and commit there.
  Held back because it edits ~150 sites across a live client theme — worth one visual check on staging
  first, even though the swap is value-identical by construction.
- [~] **CB-2 · TRIAGED (the split this item asked for). It is not 269 problems — it is ~65.**
  `status: open` (triage done; the fix is now mostly CB-1's job)
  **Base-Dawn noise: ZERO.** The gate is diff-scoped — 1.3 greps `git diff base...HEAD` for ADDED lines
  and the file list is "added/modified since base" — so every finding is our own custom work. There is
  no stock-theme noise to subtract.
  **Measured split** (fresh run on a scratch copy; the stale 269 was 264 on re-measure):
  | rule | what it is | count |
  |---|---|---|
  | `1.3` | hex/rgb where a scheme var exists | **199 (75%)** |
  | `1.1` | hardcoded English in render output | 36 |
  | `1.2` | image URLs not from settings | 27 |
  | `1.4` | literal alt text | 2 |
  **Three quarters of CB-2 is the SAME colour-literal class as CB-1**, and 1.3 already excludes
  `var(--`, so CB-1's swap resolves it directly. Proven end-to-end on a scratch copy — generate cascade
  → wire → `snap-colors-to-tokens --apply` → commit → re-run the gate:
  **1.3 199 → 71 · total 264 → 136 (128 resolved, 48%) with no other rule moving.**
  **So the real remaining scope is 136, of which only 65 are non-colour:** 36 hardcoded English,
  27 non-settings image URLs, 2 literal alt texts. The 71 surviving 1.3 findings are literals with no
  exact brand token — the same design decisions CB-1 correctly refuses to guess.
  *Next:* land CB-1 first (it does 128 of these for free), then treat CB-2 as the 65 genuine
  merchant-editability gaps. Those need `{{ ... | t }}` keys, `image_url`/settings-backed media, and
  bound alt text — real per-section work, not a sweep.
  **2026-07-24 re-verified against HEAD (the numbers above had gone stale — same "re-verify before
  acting" lesson as CB-8) — re-ran `gate-editability-greps.sh` fresh: 1.1 (hardcoded English) is now
  **0** (the client's own theme pull since resolved it), 1.2 is **1**, 1.3 is **64**, 1.4 was **2**.
  **Fixed 1.4 (client `f55bd7b`):** both hardcoded `<img alt="...">` fallbacks in
  `sections/delivery-cta.liquid` (the bundled default banner + food image, shown only when no merchant
  image is uploaded) are now bound to new `text` settings (`desktop_banner_alt` / `image_alt`), each
  defaulting to the exact original literal — identity-preserving, same construction as CB-1's colour
  swap. Verified by re-running the gate: 1.4 **2 → 0**.
  **Remaining 65 blockers are already tracked elsewhere, not new scope:** 1.2's one hit
  (`Frame_2147240171.png` hardcoded CDN url in `assets/section-locations-slider.css`) needs a
  `shopify://` file handle or a staging URL — see "Needs Yash". 1.3's 64 hits are colour literals with
  no exact brand-token match — CB-3's territory, design decisions, correctly left alone rather than
  guessed. So CB-2 is now fully triaged: 0 mechanizable-without-human-input findings remain.
- [ ] **CB-3 · THE LADDER — now a ratifiable proposal, not a blank question.** `status: blocked-by human`
  **The data — RECOMPUTED after CB-10/CB-11 (the earlier figures were stock-inflated and are
  superseded).** Scope is now line-granular, so every number below is drift **we** introduced:
  · `ds.font-size` **90**: `12×1  12.5×1  13×7  14×14  15×18  17×6  19×6  21×1  23×1  24×4  26×3
    28×2  30×7  32×10  34×3  42×1  48×4  60×1`
  · `ds.spacing` **167**: `5×3  6×15  10×25  11×7  14×13  18×13  20×40  22×7  26×4  28×6  30×9
    36×7  44×2  56×3  72×2` (+ singles)
  · `consistency` reports **23** distinct font-sizes (was 25 — stock Dawn's 9 and 10 no longer counted
    against us) and 9 radii.
  **The finding that decides it still holds: the theme was built on a 10-based rhythm** (20×40, 10×25,
  30×9) while the contract encodes a 4/8 grid. Two competing rhythms — that is the defect, not 167
  stray numbers. Adding **10, 20, 30** alone clears **74 of 167 (44%)**.
  **ATTEMPTED AND REVERTED 2026-07-23 — Option A as literally specified degenerates into
  rubber-stamping, and this is the honest result of trying it.** Widening the contract to the rhythm the
  theme actually uses means declaring **19 type sizes and 26 spacing values legal**. Measured: that
  drops `design-tokens` 319 → **75**… while `consistency.font-size-variety` still blocks with **23
  distinct sizes**, correctly. So the trade is a *meaningless pass* on the gate that counts values in
  exchange for leaving the gate that measures the actual problem still red. The theme does not have a
  wide ladder — **it has no ladder**, and no contract edit changes that. Reverted; the store is
  untouched.
  **TOOLING NOW EXISTS — the decision is a dry run (`98f7d330`).**
  `snap-scale-to-ladder.mjs` is the CB-3 companion to `snap-colors-to-tokens`, built deliberately
  **asymmetric** to it: colours could be mechanical because the rule was IDENTITY (the render could not
  change); type/spacing cannot, so this is a **reporter first** and `--apply` **refuses** when any move
  exceeds `--max-delta` (default 2px). Refusal is per-RUN, so a blocked batch can never leave the theme
  half-snapped. It carries the lessons already paid for: never a GENERATED file, never positioning or a
  `calc()` constant, never a `var()`-bound value, and in `.liquid` only inside `{% style %}`.
  **Measured against the CURRENT (too-tight) ladder:** ~1000 moves — `178× 10→8`, `150× 15→16`,
  `145× 20→16 (4px)`, `71× 30→32`, `71× 5→4`, `54× 50→48`, `49× 6→4`. That is the honest price of
  forcing the theme's 10-based rhythm onto a 4/8 grid, and the tool declines to do it unattended.
  *A documented trap I walked into and fixed:* the first dry run reported **754** off-ladder values that
  were all `rem × 1.6` — Dawn resets the root to 62.5% (1rem = 10px); assuming 16 manufactures phantom
  drift. Same `detectRemRootPx` as the gates now.
  **To decide it:** give me a ladder (or approve one) and I run `--only <file>` first, then the batch —
  or raise the bar deliberately with `--max-delta`. A `THEME_PREVIEW_URL` still lets me *look* at the
  result, which no amount of tooling replaces.

  **What the fix actually requires (and why it is still yours):** a TIGHT ladder plus **snapping the
  CSS** — e.g. type `12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64` with 15→16 (18 occurrences), 13→14,
  17→18, 19→20, 30→32, 34→32… That is ~55 font-size and ~120 spacing edits which **change what renders**,
  mostly by 1–2px. It is Option B in all but name, and it needs either your sign-off on the ladder or a
  `THEME_PREVIEW_URL` so the result can be looked at. Guessing a type scale for a client's storefront
  and shipping it unseen is the documented anti-pattern this whole workstream exists to stop.

- [x] **CB-12 · Warning triage — every `price.hardcoded` finding was a false positive.** `status: done`
  (`7f7b34c4` · client `e425a75`) Triaged the **440 warnings** nobody had looked at, on the theory that
  real defects hide in noise that large. The most alarming id — *hardcoded price on an ecom store* —
  turned out to be the noise: **15 findings, 0 true positives.**
  · 12 × Dawn's responsive padding `padding-top: {{ … | times: 0.75 | round: 0 }}px`
  · 3 × `{% assign media_width = 0.65 %}` — a layout ratio
  **Cause:** `PRICE_LITERAL`'s bare-decimal branch `\d{1,4}\.\d{2}` matches **any** 2-dp number, with
  no currency symbol and no regard for context. The check is warn-in-dev / **block-at-publish**, so
  promoting it would have blocked **every Dawn-based theme**.
  A hardcoded price is literal money in **rendered output**; Liquid code and CSS are neither.
  `renderedText()` now blanks `{% style %}` blocks, `{% %}` tags and numeric filter arguments before
  scanning, preserving line structure so line numbers stay correct. **Teeth verified:** a real `$39.99`
  in markup still warns, and so does a bare `1299.00` in visible copy. price-binding **15 → 0**, and it
  now reports PASS honestly instead of passing while pointing at padding. Toolkit **100/100**.

- [x] **CB-13 · 14 `ValidSchemaTranslations` errors — scoped off, reason recorded.** `status: done`
  (client `3e800f2`) Chose (b): ~280 English placeholder entries across 20 locale files, for admin
  locales a single-language Mumbai cafe never serves, is the same duplication smell as the storefront
  keys with none of the payoff. Disabled in `.theme-check.yml` **with the rationale in-file**, not
  silently. code-lint **14 → 0**.
  Surfaced by CB-9 part 3, and worth stating precisely: these are **not broken references**. Our custom
  sections write plain English schema labels (`"name": "Header"`, `"label": "Color scheme"`), and
  theme-check is *recommending* they be `t:` keys, naming the key it would expect. They are
  **pre-existing** (from `1fdc5e4`); `gate-theme-check` scopes offenses to CHANGED files, so editing
  those sections for the i18n work brought them into scope. code-lint 0 → 14.
  **The call:** (a) convert ~14 schema labels to `t:` keys + register them across `en.default.schema`
  **and the other 19** `*.schema.json` — which repeats the English-placeholder duplication already
  flagged as a smell, for a single-language cafe; or (b) scope `ValidSchemaTranslations` off in the
  client's `.theme-check.yml`, with the reason recorded — legitimate for a single-locale store.
  I did **not** silence a check unilaterally, and did not spend a 20-locale expansion on a posture
  decision that is yours.

- [ ] **CB-14 · `repo-hygiene` (29 blockers) is not mine.** `status: open` (owner: concurrent workstream)
  A new gate (`check-repo-hygiene.mjs`, plus `check-schema-authoring.mjs`, `new-section.mjs`,
  `templates/section/` and edits to `check-rule-pack.mjs` / `done-check.mjs` / `gate-owner.mjs`)
  appeared in the Polyglot tree mid-run from a **concurrent workstream**. Vendoring the toolkit into
  cravinbyandy therefore activated it, adding 29 blockers to the client's count. Flagged rather than
  touched — staged paths stayed scoped to my own work throughout.

- [x] **CB-15 · `cp -R` was shipping UNCOMMITTED work to a client repo.** `status: done` (`7e78a648`)
  A hazard I created, found by asking where CB-14's 29 blockers actually came from. Client repos
  gitignore `toolkit/`, so the vendored copy is refreshed by hand — and the documented recipe copied the
  **working tree**. Today that put **21 uncommitted paths** from a concurrent workstream into
  cravinbyandy, including a half-finished gate (`check-repo-hygiene`) that immediately added 29 blockers
  to a client's build. **Nobody decided that; a copy command did.**
  `vendor-toolkit.mjs` vendors from `git archive <ref>` (committed state, never the working copy),
  **REFUSES** when anything under `theme-toolkit/` is uncommitted, and writes
  `toolkit/.vendor-provenance.json {sha, ref, version, dirty, files}` — QA-6 already proved
  `TOOLKIT_VERSION` cannot identify a tree (two very different toolkits both said 1.0.0 while 11 gate
  scripts were missing); a **sha** can. `--allow-dirty` exists but records which paths went unreviewed.
  `node_modules/` and `gate-reports/` never travel, and a target with no `sections/`/`layout/` is
  refused. `preflight-repo` now prints the provenance line.
  **A bug the fixture caught, and the worst kind for a vendor tool:** the CLI guard compared
  `path.resolve(argv[1])` to `import.meta.url`; on macOS a temp dir is `/var/folders/…` by symlink and
  `/private/var/folders/…` resolved, so the guard failed, `main()` never ran, and the script **exited 0
  having done nothing**. Now compares realpaths. Toolkit **102/102**.

- [x] **CB-20 · Dogfooded `vendor-toolkit` — it did not survive first contact.** `status: done` (`264ef7bd`)
  I built it last run and never used it. Using it found **three bugs, one of them shipped by me**:
  · **`--ref` was refused on a dirty tree**, making the tool's own advice (*"vendor an explicit --ref"*)
    self-contradictory. `git archive <ref>` reads committed state — the working tree cannot contaminate
    it — so `--ref` is precisely the safe escape hatch. Refusing it left `--allow-dirty`, which **ships
    the WIP**, as the only way through: with ongoing concurrent work (the normal state) vendoring was
    blocked outright. Now only the *implicit* default refuses. **My fixture asserted the wrong behaviour
    and is corrected.**
  · **Vendoring was additive only** — a file vendored by the old `cp -R` and since deleted upstream
    survived forever, so the client kept running a WIP gate while provenance claimed `dirty:false`.
    *A provenance that lies is worse than none.* It now reconciles and records what it pruned.
  · **…and the prune immediately ate `package-lock.json`**, which the source gitignores so `git archive`
    never carries it — breaking the `npm ci --prefix toolkit` the tool itself recommends. `PRESERVE`
    now protects install state.
  **Separately, my own audit was shipping a "secret" to clients:** `secret-scan` reported
  `audit-ownership.mjs` as a leaked private key, because it builds its fixture theme from a literal key
  block and lives in `scripts/` (vendored everywhere), not `__fixtures__`. The marker is assembled at
  runtime now — cravinbyandy **BLOCK → PASS**, 0 secrets across 490 files.
  **Client result (`918c45a`):** toolkit pinned to sha `264ef7b`, `dirty:false`, 16 stale files pruned;
  **repo-hygiene's 29 blockers gone** (never this store's code); 390 blockers remain and they are
  genuinely the theme's — design-tokens 319 + editability 67 + consistency 3, i.e. **CB-3**.
  Toolkit **106/106 in 302s**.

- [~] **CB-21 · A retired gate's report lingers and was audited as current evidence.** `status: open`
  (dangerous half **DONE** — `878a65c3`; the prune half still blocked)
  **Done:** gate **#45** now excludes orphan reports *before* auditing and names them via
  `integrity.orphan-report` (warning — the file is stale, not a build defect). Fixed there rather than in
  `theme-gates` because the dangerous half is the **auditing**, and #45 is the evidence-integrity gate:
  a report whose gate no longer exists is exactly an integrity problem. If the manifest cannot be read,
  orphan detection is **skipped rather than guessed** — inventing *"this gate is retired"* from a failed
  lookup would suppress real evidence.
  *Proven end-to-end:* a fossil claiming pass-while-skipped is excluded (audited 1, not 2), does not
  block, and is named. The fixture pins the baseline that the same report **would** raise
  `integrity.skipped-but-pass` if audited, so the exclusion cannot be mistaken for the check going soft.
  **Correction to CB-20:** cravinbyandy's `repo-hygiene.json` was a genuine fossil **in the client**
  (its toolkit is pinned to `264ef7b`, which has no such gate) — but `repo-hygiene` is **live** in
  Polyglot's working tree, where the concurrent workstream added it. Both true; different manifests.
  **Still open:** `theme-gates` should prune reports matching no manifest gate on a **full** run (never
  on `--static-only`/`--pages`, which legitimately leave other reports untouched). Blocked only by that
  file being modified by the concurrent workstream.

- [x] **CB-22 · All 3 findings were stale-frame/degraded-reference artifacts — DISPROVEN, not fixed, on a
  fresh capture + a fresh live-store screenshot.** `status: done`
  Did exactly what the item itself asked: took a **fresh** Lens capture of the real live store
  (`THEME_PREVIEW_URL=https://cravinbyandy.myshopify.com` — read-only screenshot, no push) and re-ran
  gate #46. Result: **none of the 3 original findings reappeared**, and I did not just trust the silence —
  checked each against independent ground truth:
  1. **CTA colour** — the fresh screenshot shows a pale pink pill (`#FFEDF1` bg, dark-green text/arrow),
     not amber/orange. `git log -p` on `section-cravin-header.css` shows this selector has only ever been
     `#FFEDF1` or `#e1d4d3` (a dusty rose) — **never** orange, at any point in history. The original
     finding was a vision-judge misread against a low-quality day-old frame, not a real defect.
  2. **Subheadline** — *"Stay tuned for our next seasonal special"* is clearly legible in the fresh
     screenshot, confirmed real and intentional.
  3. **Brand-stamp badge** — also clearly visible and legible in the fresh screenshot, confirmed real and
     intentional (a circular "Cravin' The Pantry" seal).
  **The fresh run surfaced 3 different findings, and all 3 also dissolve under verification** (this
  matters more than the first round — it shows the fix wasn't luck, the *pattern* was the bug):
  · *Hero background "lighter sage vs darker olive"* and *"season" set in cursive/italic type* — both
  are pixels **baked into the client's own supplied slide images** (`shopify://shop_images/1_7*.png`).
  Confirmed mechanically: `hero_banner`'s 6 slide blocks all carry `heading: ""`, `subheading: ""`,
  `show_text_box: false` — there is **no live text or color layer** for the judge to be comparing; it
  was diffing JPEG compression/rasterisation of a photo against a degraded video-frame extraction of the
  same photo. Nothing in the codebase can "fix" this — matches `design-spec.md`'s own note that this
  hero was rebuilt to be **fully baked-image**, and separately confirms *"season"* italic is documented
  intentional design (`design-spec.md:20`), not drift.
  · *4-image collage content differs from the reference* (cupcakes/pastries vs. bagel/cake/salad) — this
  is **not new**, it's the same already-tracked "Needs Yash: is the collage still the intended design?"
  question, now independently reconfirmed with more specific detail by a second judge run. Updated that
  entry below rather than duplicating it.
  **Incidental finding, logged not fixed:** `design-system.json`'s `scheme-10` (`#6E7A30`, "HOMEPAGE HERO
  BAND ONLY", a deliberate Yash brand-kit override from 2026-07-15) is referenced **nowhere** in
  `sections/`/`assets/`/`templates/` — grep confirms zero uses. It is now orphaned documentation: the
  hero it was written for was later rebuilt as a fully baked-image slideshow with the colour panel this
  scheme was meant to drive removed entirely. Low-stakes (nothing renders wrong), but worth a human call
  on whether to delete the stale spec entry or keep it as history — not touched here.
  *Proof:* fresh `gate-reports/lens/home/*.png` (6 frames, all viewports) + fresh
  `gate-reports/lens/reference-judge/{home-hero,home-locations}.json` + `reference-match.json` all
  committed as evidence (client `968524b`). Toolkit unaffected (no toolkit code changed) — this
  was a real-store investigation, not a gate-script change.

- [x] **CB-23 · `check-reference-match` now resolves global/section-group surfaces.** `status: done`
  `templateFor()` only resolved `templates/<surface>.json` / `templates/page.<surface>.json`. A header or
  footer living in a section GROUP (`sections/footer-group.json`) has no template file, so registering it
  as a normal surface produced a **permanent** `ref.template-missing` BLOCK — found while trying to
  register cravinbyandy's footer for REF-VID-2.
  **Shipped:** `templateFor` now also checks `sections/<surface>-group.json` for a small fixed allowlist
  (`header`, `footer`) — `sectionsOf()` needed no change, since Shopify shapes a section group identically
  to a template (`{sections, order}`). Scoped deliberately: a non-global surface with a genuinely missing
  template still blocks (fixture case l), so this isn't a blanket "look in sections/ too" widening.
  *Proof:* 3 new fixture cases (k/l/m) — the regression (footer/header group resolves, no permanent
  block), the negative control (a real missing template for a non-global surface still blocks), and the
  header mirror. All 3 confirmed to **fail against the pre-fix code** (`ref.template-missing` both times)
  before passing on the fix. Toolkit **110/110**.
  **Verified on the real client repo** (canonical script run directly, cwd=cravinbyandy — the vendored
  copy is pinned to an older sha and will pick this up on its next legitimate re-vendor, not hand-copied):
  registered cravinbyandy's footer for real (`surface: footer, section: cravin-footer, archetype: custom`
  — no stock archetype fits a Brand+Explore+Contact-columns footer, so `custom` is the honest read, same
  discipline as gifting/occasions in REF-VID-2) and `check-reference-match.mjs` resolved it via
  `sections/footer-group.json` with **no `ref.template-missing`** — the exact regression this item exists
  to prevent, reproduced and fixed on the store that found it.

- [x] **CB-24 · Gate #46 L2 now scrolls to the declared section instead of always using the top-of-page frame.** `status: done`
  `lensFrameFor` picked the per-surface **"rest"** Lens frame (the top-of-page screenshot) for every
  entry. Correct for an above-the-fold section (hero); for `home/locations` (below the fold) the judge
  compared the reference against a screenshot that simply doesn't scroll that far, and reported
  `component-parity: the Locations carousel section... [not visible]` — **not a real divergence**, a
  frame/section mismatch, flagged `[would BLOCK under REFERENCE_MATCH_ENFORCE=1]`.
  **Shipped:** `resolveSectionKey(entry, sections)` — pinned `entry.section` first, then archetype match,
  then (new, and the realistic case on an all-custom-sections store where no `TYPE_ARCHETYPE` entry ever
  fires) exact `name === key` equality, since `reference-ingest --name` is routinely chosen to describe
  the section it documents. `sectionTargetsFor(surface)` in `lens-capture.mjs` reads
  `reference-map.json` (fully additive — absent map/entry → `{}`, zero effect on a repo with no
  reference-conformance work) and resolves each declared entry to a real template section key.
  `captureVisit` then scrolls to it and shoots one **extra** `section:<key>` frame in the **same**
  frame-set as `rest` — no additional judge calls. `lensFrameFor` prefers the section frame when present,
  falling back to `rest` unchanged otherwise.
  **A real DOM gotcha found and fixed while proving this live, not assumed:** Shopify's rendered wrapper
  id is prefixed with the template/group's own numeric id
  (`shopify-section-template--27491524083746__locations`), **never** the bare JSON key — confirmed via
  `curl` against the real live HTML. An exact-id `getElementById` lookup silently matched nothing on
  every section (the scroll simply never happened, no error, no capture) — fixed with a suffix selector
  (`[id$="__<key>"]`).
  *Proof:* 5 new pure fixture cases (n/o/o2/p/q) for `resolveSectionKey`/`sectionTargetsFor`, each
  confirmed to fail against the pre-fix code (import error / wrong resolution) before passing on the
  fix. Toolkit **110/110**. **Live end-to-end on cravinbyandy** (read-only, no push): fresh capture
  produced a real `section:locations` frame showing the actual carousel (2 cards + arrows, matching
  RM-1's own reference description) instead of the hero; re-running gate #46 **dropped the false
  "section absent"/"footer must appear below" BLOCK-under-enforce findings entirely**, replaced by one
  honest, low-severity finding about carousel slide position (reference at slide-2, render at a
  different slide) — a real content comparison survives where a frame-mismatch artifact used to be.
  ⚠️ The DOM-selector fix itself is proven live against the real store, not hermetically fixtured — a
  pure unit test can't exercise a live DOM without a browser. `lens-visibility`'s existing
  Playwright+local-server harness (already covers `dismissOccluders`/`openCartDrawer`) would be the
  natural place to add one if this needs day-2 hardening; not attempted here (time-bounded).

- [x] **CB-21-ORIG · (superseded framing) A retired gate's report lingers and inflates every count.** `status: done`
  `theme-gates` clears `gate-reports/<name>.json` only for gates it is **about to run**, so when a gate
  leaves the manifest its last report stays on disk forever. cravinbyandy carried a `repo-hygiene.json`
  from sha `698704a` reporting 29 blockers for a gate that no longer exists; I removed it by hand.
  Worse, gate **#45 audits every report in the directory**, so a retired gate's stale evidence can be
  audited as if it were current. Fix: on a full run, prune reports matching no gate in the manifest
  (never on a partial `--static-only`/`--pages` run, which legitimately leaves other reports untouched).
  *Not done here because `theme-gates.mjs` is currently modified by the concurrent workstream and I will
  not edit a contested file.*

- [x] **CB-19 · The suite crossed the 10-minute cap — parallelised, 600s+ → 179s.** `status: done` (`1fb29558`)
  **A suite that cannot be run in one command is a suite people stop running** — the same *"nobody runs
  it"* failure the gates themselves keep hitting, and the reason CB-18's note existed. The stack is
  still growing (the concurrent workstream added two gates mid-run), so this was going to get worse.
  The 106 suites are independent processes over their own temp dirs, so they now run through a small
  worker pool. **Bounded, not unbounded:** several fixtures drive a real chromium (`functional-url`,
  `lens-visibility`, `section-cohesion`) and a few spawn the entire static gate stack (`audits-live`,
  `vacuous-pass`), so a full fan-out would thrash. Defaults to `min(4, cpus-1)`; `TEST_CONCURRENCY`
  overrides. Results print in **manifest order** regardless of finish order so the output stays
  diffable, and the summary now carries wall time + slowest suite — the number that says when this
  needs attention again.
  **106/106 in 179s** (slowest `functional-url` 122s under contention; ~59s alone).
  **Teeth verified — and my first attempt was wrong:** appending a failing assertion to a fixture proved
  nothing, because that fixture already calls `process.exit()` before the appended lines run, so exit 0
  was correct for the wrong reason. Replacing the fixture outright gives `exit=1`, `✗ translations`, and
  the FAIL line surfaced.

- [x] **CB-18 · The three audits were unenforced — their own results could rot.** `status: done` (`bfb65b74`)
  A gap in **my own work**, and the exact shape this workstream keeps finding elsewhere. Each audit had
  a fixture, but every one tested the **pure helpers** against synthetic input; none asserted the
  audit's **real answer**. So the results they exist to produce could regress in silence the moment
  anyone added a gate — `0 untested blocking checks` (49 static + 28 URL burned down to reach it),
  `0 vacuous passes` (17 classified or fixed), `0 misattributions` (6 false-BLOCK classes fixed).
  **A number nobody re-checks is "evidence nobody reads."** It applied to mine too.
  Each assertion now carries a **denominator check** so a zero can never be vacuous: >100 blocking
  checks audited, >20 static gates exercised, ≥3 gates flagging our own dirty code as the control. If an
  audit stops measuring the stack, *that* fails first instead of reporting a comfortable zero.
  **Teeth proven against a real regression:** reverting the `shopify://` exclusion makes the fixture
  FAIL with `1 misattribution(s): editability→merchant-data`. Restored after the test.
  Incidentally confirmed the value: the stack grew to **129 blocking checks / 35 static gates** during
  the run (concurrent workstream added two gates) and both are already clean on all three audits.
  Toolkit **106/106**.
  ⚠ *Operational note (RESOLVED by CB-19 — the suite runs in 179s and needs no backgrounding).*

- [x] **CB-17 · The false-attribution class is now audited, not rediscovered.** `status: done` (`044282fa`)
  Six times in one week the same shape was found **by accident**, and every one was a false BLOCK:
  stock Dawn dragged into a drift scan (CB-10); stock Dawn's vocabulary counted as ours (CB-11); the
  generated cascade flagged for holding the literals it exists to hold (CB-9); `shopify://shop_images/…`
  — a merchant's own image pick — read as a hardcoded URL, **44 of 45 findings** (CB-9); our vendored
  fixture's fake private key read as the client's secret (CB-9); `| times: 0.75` read as money (CB-12).
  **A false block is as damaging as a false pass — it teaches the team to wave the gate through, which
  is precisely how this backlog grew.**
  `audit-ownership.mjs` builds a theme where every ownership class (theme-base / generated /
  merchant-data / vendored / **ours**) holds a deliberately dirty file, runs every static gate, and
  reports anything landing outside *ours*. `ALLOWED` records the legitimate cases with reasons; nothing
  may ever be allowlisted against **theme-base** or **ours**, and the fixture fails loudly if a future
  entry tries.
  **Teeth proven against a REAL historical bug:** reverting the `shopify://` exclusion makes the audit
  report `editability → merchant-data editability.1.2` — the 44-false-positive regression, caught
  automatically. *A fixture artefact was caught en route too: the first draft appended a CSS rule to the
  "generated" cascade and invented two misattributions that were artefacts of my fixture, not defects in
  the gates.* Current state: **7 gates flag our code** (the control) · **0 misattributions**.
  Toolkit **105/105**.

- [x] **CB-16 · 40 scripts could silently no-op when run through a symlink.** `status: done` (`92ccc656`)
  `path.resolve` does **not** resolve symlinks: on macOS a temp dir is `/var/folders/…` in argv but
  `/private/var/folders/…` resolved. When the compare fails `main()` never runs and the script **exits 0
  having done nothing** — the worst failure mode available, since every caller reads exit 0 as success.
  `lib/jsonify-hits.mjs` already had the correct realpath comparison **with this reasoning in a
  comment**; it was never shared, so 39 others kept the fragile spelling. Extracted as `lib/is-main.mjs`
  and swept. All three load paths verified on a real script (direct / imported / **symlinked**), and the
  fixture's regression scan **caught my own sweep being incomplete** (I globbed `*.mjs` + `lib/*.mjs`
  and missed `dna/bulk-extract.mjs`). Toolkit **104/104**.
  **Scope note:** 13 further files also carry the swap but their diffs contain the concurrent
  workstream's uncommitted work, so they were deliberately left unstaged; the sweep completes when that
  lands. *A first attempt used a broad `git add $(...)` and swept 53 files including theirs — reset and
  redone file-by-file. The contract's "stage explicit paths only" rule exists for exactly that.*
- [x] **CB-16-ORIG · (superseded) The same CLI-guard pattern is latent across the toolkit.** `status: done`
  `if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()`
  appears in several scripts. It only works because they are run from their real repo path; invoked via
  a symlinked path (a temp dir, a symlinked checkout, some CI layouts) the guard silently fails and the
  script **exits 0 doing nothing**. Sweep them onto the realpath comparison.

- [x] **CB-8 · NO LONGER ORPHANED — the client wired it in. No action, and deleting it would now break a live page.**
  `status: done` (verified 2026-07-23, no code change needed)
  The original analysis was **correct when written**: at the `1fdc5e4` baseline `templates/page.gifting.json`
  rendered `slideshow, feature-story, marquee, about-cafe, feature-story, page-hero` — no
  `gifting-occasions`. It has since been resolved **by the client**, not by us: at `105922a`
  (*"snapshot local theme state before pull"*) the section appears in the render order as id `occasions`,
  and it is still there at HEAD:
  `slideshow, **gifting-occasions**, feature-story, marquee, about-cafe, feature-story, page-hero`.
  Someone added the block in the theme editor and it came down in a theme pull.
  **So the "wire it or delete it" question is closed, and the delete branch is now actively dangerous** —
  removing the file would strip a rendering section from the gifting page. No gate treats it as dead;
  its 24 findings are the ordinary design-token/editability class that applies to any live section.
  *Lesson worth keeping: a client-owned theme changes underneath the backlog. An item that names a
  render decision needs re-verification against HEAD before anyone acts on it, not just re-reading.*
- [x] **CB-8-ORIG · (superseded) `sections/gifting-occasions.liquid` is orphaned.** `status: done`
  Confirmed: `templates/page.gifting.json` renders `slideshow, feature-story, marquee, about-cafe,
  feature-story, page-hero` — **not** `gifting-occasions`. So `sections/gifting-occasions.liquid` (4.0 KB)
  and `assets/section-gifting-occasions.css` (3.3 KB) render nowhere, while `reveal.css` still styles
  `h2.gift-occasions__heading` — i.e. the theme was *built* expecting this block on the gifting page.
  **Wire it in or delete it is a content decision, not a mechanical one** — "should the gifting page have
  an occasions block?" is Yash's/the client's call, and both options are destructive in one direction.
  Committed in `1fdc5e4` (the 9-day baseline), so nothing is lost either way.
- [x] **CB-7 · RESOLVED — and the premise was wrong.** `status: done`
  `gate-reports` is **already in the toolkit's `FRESHNESS_ALLOWLIST`**, and both the summary's own
  `dirty` (theme-gates:520) and `--verify`'s freshness check use it — so uncommitted reports **never**
  made a publish stale. Nothing was blocked. The convention is therefore pure hygiene: **keep them
  tracked, commit them with the work that produced them.**
  **The real defect underneath:** the committed evidence described sha `105922a` and was produced from
  a **dirty** tree while HEAD was `6477150`. Evidence that does not describe the commit it claims to
  gate is not evidence. Regenerated at HEAD, `dirty=false`, client tree now clean. Client commit
  `3a0d717`.
- [x] **CB-7-ORIG · (superseded) 22 uncommitted regenerated gate-reports.** `status: done` Decide the
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

- [x] **REF-VID-2 · Persist the cravinbyandy walkthrough's key frames as real references.**
  `status: done` (client `97cc37d`) Surveyed the 413s walkthrough with a 4-sheet contact-sheet scan,
  then extracted one clean, chrome-free frame per surface. **Every archetype was cross-checked against
  the LIVE section source before registering — never against the video alone**, per the doctrine below.
  - `home/hero` → `slideshow`. `templates/index.json`'s `hero_banner` IS the stock Dawn slideshow with
    3 slide blocks (`1_7.png`/`1_7_1.png`/`1_7_2.png`) — this is the exact archetype the 2026-07-21
    incident was about, here **provably correct, not assumed**. This does **not** resolve the separate
    "is the 4-image collage vs single-photo content still right" question already parked for Yash
    (below) — that's a content question; this reference only asserts the structural archetype.
  - `home/locations` → `carousel`. `locations-slider.liquid`'s own comment: *"peek-slider... Native
    scroll-snap + arrow buttons."* Frame shows prev/next arrows + a third card cut off at the edge (the
    documented carousel disambiguator).
  - `about/meet-andy` → `image-with-text` (closest vocabulary term; the "Andy's Three C's" stat row is
    recorded in `must_have` since the generic label doesn't capture it).
  - `catering/essentials` → `featured-grid`. `catering-services.liquid`'s own comment: *"Grid of image
    cards (pink label bar + arrow)."*
  - `gifting/occasions` → `custom`, deliberately. No entry in the fixed `ARCHETYPES` vocabulary
    describes an occasion-pill cloud; forcing `collection-grid`/`featured-grid` would wrongly imply a
    product/card matrix. Added the **new signal row** to `reference-archetype-signals.md` (the
    compounding loop it exists for). Confirms CB-8: the section renders, is not orphaned.
  - **Footer intentionally NOT registered** in `reference-map.json`: `check-reference-match`'s
    `templateFor()` only resolves `templates/<surface>.json`/`templates/page.<surface>.json`, and footer
    lives in `sections/footer-group.json` (a global section group). Registering it under a fake surface
    would produce a **permanent** `ref.template-missing` BLOCK, not a warn. Archived the frame at
    `docs/design/references/global/footer.png` instead (REF-VID-1's whole point — don't lose the frame)
    without corrupting gate #46. **New tooling gap, logged not fixed:** `check-reference-match` has no
    notion of global/section-group surfaces.
  **Verified end-to-end, not just registered:** `check-reference-match.mjs` → **PASS, 0 blockers, 9
  warnings**. All 4 archetype checks came back `ref.archetype-unverifiable` — honest, since every
  section on this theme is custom by design; not a false pass, not a false block. L2 ran against a
  **stale** 2026-07-22 Lens capture (found, not planned) and surfaced 3 **real** findings on the hero:
  the "Connect on Whatsapp" CTA renders solid amber/orange vs. the reference's outlined teal-green, an
  unconfirmed subheadline, and an unconfirmed brand-stamp badge — genuine drift a design-blind gate
  stack would never have caught. **Second new tooling gap, logged not fixed:** L2 compares against the
  per-surface **"rest" (above-the-fold)** Lens frame only, so a below-the-fold section like `locations`
  can never visually match and produced a `[would BLOCK under ENFORCE=1]` finding that is really *"this
  frame doesn't scroll here"*, not a real divergence — another argument for RM-2's already-ratified
  decision to keep L2 warn-only.
  `reference-ingest --list`: 5/5 surfaces show images present — done per this item's own criteria.

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
  **2026-07-24 — reconfirmed with more specific detail (CB-22):** gate #46's L2 judge, run twice against
  two different fresh frames, independently reports the same class of gap both times — the collage's
  *food subjects* differ from the reference, not just "1 photo vs 4". Reference shows colourful
  cupcakes/pastries and orange-toned dishes; the live slides show a bagel, a mango cake slice, and a
  salad. Six real image assets are live (`1_7.png` … `1_7_5.png`) — worth a quick side-by-side once you
  have a minute, since it may just be "different slide" rather than "wrong photos."
- **`design-system.json`'s `scheme-10` (`#6E7A30`, the 2026-07-15 brand-kit override "to match the Figma
  hero") is unused anywhere in the theme** (CB-22) — the hero it was written for was later rebuilt as a
  fully baked-image slideshow with no live colour panel. Delete the stale spec entry, or keep it as a
  historical record of the decision? Either is fine; not touched without a call.

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
- 2026-07-24 · REF-VID-2 done (client `97cc37d`) — 5 reference frames persisted from the client
  walkthrough, every archetype cross-checked against live section source before registering (not
  guessed from the video). `check-reference-match.mjs` PASS, 0 blockers, 9 warnings; L2 against a stale
  Lens capture found 3 real hero divergences (CTA colour, an unconfirmed subheadline, an unconfirmed
  badge) — logged as CB-22. Two new toolkit gaps found and logged, not fixed: CB-23 (no
  global/section-group surface support — footer would have produced a permanent false BLOCK) and CB-24
  (L2 only compares the above-the-fold frame, so a below-the-fold section like locations can never
  visually match). Added the "pill cloud" archetype signal to reference-archetype-signals.md.
- 2026-07-24 · CB-1-ORIG flipped to `done` (bookkeeping only) — verified its "remaining" application step
  was already shipped for real under CB-1 (client `870ffe9`); stale-status class caught before it misled
  a future run. CB-2 re-verified against HEAD (numbers had gone stale): 1.1 now 0, 1.4 fixed 2→0 (client
  `f55bd7b` — delivery-cta.liquid fallback alt text bound to settings, identity-preserving), leaving only
  1.2 (1 hit, needs a `shopify://` handle — "Needs Yash") and 1.3 (64 hits, CB-3's colour-ladder
  territory). CB-2 is now fully triaged: zero mechanizable-without-human-input findings remain. Toolkit
  **110/110 in 76s**.
- 2026-07-24 · CB-22 closed (client `968524b`) — did exactly what the item asked (re-run against a fresh
  Lens capture before acting) and all 3 original findings failed to reproduce; verified independently
  (git history, a fresh live screenshot) rather than trusting silence. The fresh run's 3 replacement
  findings also dissolved: two were pixels baked into the client's own supplied hero images (no live
  text/colour layer exists there to fix), one is the same already-tracked "Needs Yash" collage-content
  question, now reconfirmed with more specific detail. Incidental finding logged: `design-system.json`'s
  `scheme-10` brand-kit override is unused anywhere in the theme (the hero it was written for was later
  rebuilt as a fully baked-image slideshow) — a human call, not touched.
- 2026-07-24 · CB-23 done (Polyglot `3b9d9147`, client `248ccc0`) — `templateFor()` now resolves
  `sections/<surface>-group.json` for header/footer, closing the permanent false-BLOCK a global surface
  produced. CB-24 done (same commits) — gate #46 now scrolls to the declared section instead of always
  using the top-of-page frame (`resolveSectionKey` + `sectionTargetsFor` + a per-section Lens frame),
  found and fixed a real DOM-id gotcha (Shopify prefixes the wrapper id, never the bare key) while
  proving it live. Both verified end-to-end on cravinbyandy, not just fixtured: footer resolves with no
  `ref.template-missing`, and the previously-false "Locations section absent"/"footer must appear below"
  BLOCK-under-enforce findings are gone, replaced by one honest content finding. 15 new fixture cases
  total, each confirmed to fail against pre-fix code. Toolkit **110/110**. Every item from the previous
  run's close-out (CB-22/23/24) is now resolved — nothing actionable remains except items blocked on
  Yash (CB-3, the `shopify://` handle) and CB-21's remainder (blocked by a contested concurrent-workstream
  file).
