# Brain Baseline & Gap Report

_Decision doc for Yash · 2026-06-17_

## 1. Baseline

**Shipped & closed-loop (do not rebuild):**
- **L3 semantic + L4 procedural are production-grade.** Capture (4 types, JSONL, immediate embed, MCP), retrieve (cosine × 6-factor salience), belief revision (supersede/conflict/dup), governor→trainer surgical `.md` patches with `before_text` rollback + impact + >10% auto-rollback, Phase B cross-project signals, eval calibration gate, monthly hygiene + reversible decay, scoped reindex drain, Brain tab + Learning Inbox + SSE. DB at **v28**.
- SessionEnd hook → `vscode_session` → nightly digest → `learning_inbox`. `feedback.md` is the constitution, human-only via `NEVER_AUTO_FILES`; Yash-wins is structural.

**The actual gap (corrected by verification):**
- **Four mission tables absent:** `identity_facts`, `reflections`, `open_loops`, `feedback_events`. L1/L5/L6/L7 exist only as **prose markdown**, not queryable/decayable/surfaceable state.
- **L2 episodic is ABSENT, not partial** (verdict correction): `vscode_session` stores only metadata/counts; `learning_inbox` has no `kind` column and hard-codes 4 types (`lesson/bug/decision/feedback`); digest prompt never asks for felt/loops.
- **Per-layer retrieval is ABSENT, not partial** (verdict correction): filter infra exists in `retrieve.mjs`/`store.mjs`, but **0 layer tagging** anywhere — nothing to filter on.
- **No SessionStart hook** → Claude begins every session cold; no "since last time", no identity/pref/open-loop preload, no memory_search-on-first-msg.
- **No L7 outcome loop** (decision `outcome='pending'` never resolved/re-scored) and **no behavioral drift detector** (confirmed zero coverage; orgDrift is registry-vs-disk only).
- No `/feedback` command, no identity-lock CHANGELOG+signoff (only generic feedback append), no self-honesty golden cases, no open-loop auto-open/close.

**Risk:** episodic loop is half-built — excellent SessionEnd, no SessionStart. Capture happens; recall never does. Everything else is additive on solid rails. Only structural cautions: keep SessionStart fast (Claude Code defers it), keep identity/preference writes signoff-gated, never silent.

## 2. Already Shipped (don't rebuild)

- **L3 SEMANTIC** — full capture (lesson/bug/decision/golden) + JSONL append-only + immediate embed via MCP, cosine+6-factor salience retrieval, belief revision (supersede/conflict/nearDup) — `src/intelligence/{capture,retrieve,store}.mjs`
- **L4 PROCEDURAL** — `training_signals` → `governor.decide(auto/review/reject)` → trainer surgical `.md` patch in `BOLDTEQ-AUTOLEARN` block w/ `before_text` rollback + impact measure + >10% auto-rollback
- **Phase B** cross-project aggregation (`brainSignals.js`, occ≥3/projects≥2 bar)
- Self-improvement timeline + Brain tab + Training Review inbox (`self_improvement_log`, `routes/brain.js`, `BrainPanel.tsx`)
- Eval calibration gate (`isEvalCalibrated`, `eval_scores`, weekly `sys-intel-eval` golden self-test) blocks self-modify while judge drifts
- Memory hygiene + reversible decay sidecar (`memoryHygiene.js`, monthly `sys-memory-hygiene`, `decay-list.json`)
- Reindex scoped drain (~60s) + nightly full reindex
- SessionEnd hook → `vscode_session` → nightly `sys-learning-digest` → `learning_inbox`
- Learning Inbox UI (pending/auto/overview/brain tabs, j/k/a/r triage, confidence badges, SSE)
- `feedback.md` constitutional guard (governor `NEVER_AUTO_FILES`, human-only, dedup + re-embed)
- `/train` slash command
- DB migration+rollback pattern at v28 (versioned fn array, reversible patches)

## 3. Coverage Matrix

| Requirement | Layer | Status | Where | Recommendation | Verify |
|---|---|---|---|---|---|
| Identity file: values/voice/non-negotiables/opinions | L1 | partial _(was present)_ | `~/.claude/CLAUDE.md`, `profile.md`, `decision-simulator.md` | Distributed artifacts exist + feedback protected, but values/voice/non-negotiables not formally locked; no CHANGELOG/sign-off for identity | ⚠ refuted→corrected |
| Identity-lock + append-only CHANGELOG + sign-off gate | L1 | partial _(was absent)_ | feedback.md guard + training-changelog (patches only) | Protection exists via feedback.md constitution + inbox sign-off; NOT via dedicated `IDENTITY-LOCK.md`. Add identity-specific candidate type | ⚠ refuted→corrected |
| Opinions store (beliefs distinct from corrections) | L1 | partial | `decision-simulator.md` (8 principles, tacit) | Promote to `identity_facts` rows (kind=opinion); capture via inbox path | ✔ verified |
| Episodic per-session store (decisions/felt/loops) | L2 | **absent** _(was partial)_ | — (`vscode_session` = metadata only) | Add `reflections`/episodic store; extend digest prompt + `VALID_CANDIDATE_TYPES`; `learning_inbox` has no `kind` column | ⚠ refuted→corrected |
| Semantic lessons/patterns/antipatterns | L3 | present | `capture/retrieve/store.mjs`, 134 patterns/good + 44 captured items, 21,371 chunks | keep, no action | ✔ verified |
| Procedural how-I-work store | L4 | present _(infra)_ | `governor.mjs`, `trainer.mjs`, AUTOLEARN blocks | Infra ready; **0 AUTOLEARN blocks written yet** (awaiting first signal). Extend, never rebuild | ⚠ refuted→corrected |
| Preference store + corrections | L5 | partial | `feedback.md` (corrections), `profile.md` (static) | Corrections covered; add `identity_facts` (kind=preference) rows via feedback approve path | ✔ verified |
| `open_loops` structured store (owner/due/status) | L6 | absent | goals/tasks tables (no due/owner/promise) | Add `open_loops` table; auto-open from digest, auto-close on `task.completedAt` | ✔ verified |
| Reflections + decision journal + confidence re-score | L7 | partial | decision capture (`outcome='pending'` never updated), `self_improvement_log` | Add `reflections` table + `decisions/:id/resolve` + weekly re-score (reuse `sys-tutor`) | ✔ verified |
| Self-honesty golden evals (over-claiming) | L7 | partial | `eval/golden` (6 cases, safety dim) | **0 dedicated self-honesty cases** today; add 2–3, reuse `judge.mjs` + weekly cron | ✔ verified |
| BEHAVIORAL drift detector | L7 | absent | — (only orgDrift + eval calibration) | Add weekly handler: recent `self_improvement_log`/runs vs feedback.md+prefs; review-only flags first | ✔ verified |
| Per-layer semantic retrieval | cross-cut | **absent** _(was partial)_ | `retrieve.mjs` filter param exists, but **0 layer tagging** | Define layer enum → tag captures → add to `passesFilters()` → pass filter. 0/5 steps done | ⚠ refuted→corrected |
| Explicit + implicit capture | cross-cut | present | `captureItem` (explicit) + `learningDigest` (implicit) | keep, no action | ✔ verified |
| Decay + confirm | cross-cut | present | `store.mjs` salience decay + `memoryHygiene` + decay-list | Working, but stale items surface only in **Brain tab**, not inbox. Add inbox surfacing | ⚠ refuted→corrected |
| Conflict-resolution (Yash wins) | cross-cut | present | governor `NEVER_AUTO_FILES`, `yash_correction` P0 | keep; add contradiction-surfacing inbox row (reuse `detectConflicts`) | ✔ verified |
| Identity-lock (structural) | cross-cut | partial | implicit via `NEVER_AUTO_FILES` | Make structural via `identity_facts` append-only + signoff gate | ✔ verified |
| Phase2.1 — 4 new tables + migration/rollback/version bump | Phase2 | absent | `src/db.js` v28 | Single migration **v29** adds all 4 tables; reuse versioned-fn + `before_text` pattern | — |
| Phase2.2 — SessionEnd upgrade (loops/corrections/uncertainty) | Phase2 | partial | digest extracts lesson/bug/decision/feedback | Extend same digest prompt to emit `open_loops` + uncertainty reflections | — |
| Phase2.3 — SessionStart hook (load L1/L5/L6/L7 + memory_search) | Phase2 | absent | `settings.json` (only SubagentStop + SessionEnd) | Add SessionStart hook → CLI prints "since last time" brief; reuse mcp memory_search | — |
| Phase2.4 — `/feedback` → `feedback_events` + feedback.md + digest | Phase2 | absent | `~/.claude/commands/` (none) | Add `/feedback` → POST writes `feedback_events` + `appendFeedback` + stages inbox row | — |
| Phase2.5 — proactive 1-MC feedback at forks → preference | Phase2 | absent | — | Lower priority; write to `identity_facts(kind=preference)`; cap ≤1 Q/turn | — |
| Phase2.6 — decision journal (re-score, promote/demote) | Phase2 | partial | `decisions.jsonl` (no re-score loop) | Add resolve endpoint + weekly re-score; promote winners as signals, demote as antipattern | — |
| Phase2.7 — self-eval self-honesty golden nightly + page on drop | Phase2 | partial | `sys-intel-eval` weekly + calibration gate | Add self-honesty cases + drop-page; reuse `PushNotification` + eval cron | — |
| Phase2.8 — identity file append-only + CHANGELOG + approval | Phase2 | absent | — | Same as L1 identity-lock row; one build serves both | — |
| Phase2.9 — Learning Inbox upgrade (new candidate types) | Phase2 | partial | `LearningInbox.tsx` (5 types) | Add identity/preference/decay-review/contradiction/open-loop types; edit-trains-extractor is net-new | — |
| Phase2.10 — drift detector behavioral | Phase2 | absent | — | Same as L7 behavioral drift row | — |
| Phase3 — startup-load + cite | Phase3 | absent | — | Delivered by SessionStart hook (2.3) | — |
| Phase3 — memory_search-before-task | Phase3 | partial | `retrieve-first-protocol.md` (documented, not enforced) | Inject memory_search into dispatch preamble / SessionStart brief | — |
| Phase3 — autonomous-when-reversible / ask-on-irreversible | Phase3 | present | `full-autonomy-rules.md`, decision-simulator whitelist | keep, no action | — |
| Phase3 — ≥1 capture/session else flag | Phase3 | partial | digest captures, no zero-capture flag | Add "0 captures" flag → inbox nudge; reuse `vscode_session` status | — |
| Phase3 — auto-`/feedback` on correction | Phase3 | partial | `CORRECTION_RE` in transcriptScan + digest candidates | Wire correction-detect to auto-stage feedback inbox row at digest time | — |
| Phase3 — ≤1 proactive Q/turn | Phase3 | absent | — | Couple with 2.5; low priority | — |
| Phase3 — session-end reflections + loops | Phase3 | partial | digest (no reflections/loops) | Delivered by 2.2 prompt extension + new tables | — |
| Phase3 — weekly re-score + drift + self-eval | Phase3 | partial | weekly eval present; re-score + drift absent | Add both handlers into `sys-tutor`/`sys-intel-eval` slots | — |
| Phase4 — levers (/feedback, inbox, identity edit, /train, auto-trigger) | Phase4 | partial | inbox accept/reject + `/train` present | Missing levers covered by 2.4/2.8/3 above | — |

## 4. Worth Adding (prioritized)

| # | Item | Value | Effort | Risk | Reuses |
|---|---|---|---|---|---|
| 1 | **Migration v29:** `identity_facts` + `reflections` + `open_loops` + `feedback_events` (one migration, `before_text` rollback) | Materializes the 4 mission layers that today live only as prose → queryable/decayable/surfaceable. Unblocks every other item. | S | Low | `db.js runMigrations` array + versioned-fn + `selfImprovingBrainMigration` template |
| 2 | **SessionStart hook + CLI brief** ("since last time": L1 identity, L5 prefs, L6 loops, last 5 L7 reflections, memory_search first msg) | Closes the episodic loop. Today nothing loads context at start — Claude begins cold. Highest-leverage continuity win. | M | Med — keep CLI <300ms, best-effort (Claude Code defers SessionStart) | `settings.json` hooks (mirror SessionEnd); mcp memory_search; new tables |
| 3 | **Extend `learningDigest` prompt** → emit `open_loops` + reflections(uncertainty/felt); auto-open loops; flag zero-capture sessions | Gets L2-felt, L6-loops, Phase3 "≥1 capture/session" for near-zero cost — same nightly cron, richer prompt. | S | Low | `systemSchedules.js learningDigest` + `insertLearningCandidate` + `learning_inbox` |
| 4 | **Learning Inbox candidate types:** identity, preference, decay-review, contradiction, open-loop (+ identity edit → append-only CHANGELOG + signoff) | Surfaces missing epistemic proposals through the mature triage UI; signoff-gated identity edit satisfies L1 identity-lock + Phase2.8 in one stroke. | M | Med — approve-router must route identity/pref to append-only+signoff, never silent | `LearningInbox.tsx` tabs + `approveCandidate` + `feedbackWriter` + `NEVER_AUTO_FILES` |
| 5 | **`/feedback` one-keystroke command** → `feedback_events` row + `appendFeedback` + inbox stage | Removes the only manual friction in the correction loop. Direct training lever. | S | Low | `~/.claude/commands/` + `feedbackWriter.appendFeedback` + new `feedback_events` |
| 6 | **Decision-journal resolve loop:** `decisions/:id/resolve` sets outcome + re-scores confidence; weekly re-score promotes winners→signals, demotes losers→antipattern | Today `outcome='pending'` is never closed — no recalibration. The L7 introspection the brain lacks (logs WHAT, not whether it was right). | M | Med — weekly re-score must be conservative (evidence bar) | `decisions.jsonl` + `reflections` + `sys-tutor` slot + trainer signal path |
| 7 | **Behavioral drift detector (weekly):** recent `self_improvement_log`/runs vs feedback.md+prefs; flag violations to Brain timeline + page on drop | The one L7 capability with zero coverage. Catches silent identity drift before it compounds. | M | Med — false-positive prone; start review-only, not auto-action | `brainSignals` scan + `self_improvement_log` + Brain timeline + `PushNotification` |
| 8 | **Self-honesty golden eval cases (2–3)** targeting over-claiming + page-on-drop | Extends weekly judge self-test to score honesty/over-claim, not just output quality. Serves Phase2.7. | S | Low | `eval/golden` + `judge.mjs` + `sys-intel-eval` cron |

## 5. Skip / Redundant

| Item | Reason |
|---|---|
| Rebuild semantic capture/retrieve/belief-revision (L3) | Fully shipped: 4 capture types + cosine×6-factor salience + supersede/conflict/dup. Mature, MCP-exposed. |
| Rebuild governor/trainer/training tables (L4) | Phases B/C shipped end-to-end: signals→governor→surgical `.md` patch→impact→auto-rollback, 3 tables at v28. Extend, never rebuild. |
| New separate vector index for per-layer retrieval | `retrieve()` already accepts a `filter` over a single store; tag captures with a `layer` field — no second index. |
| New decay/forgetting subsystem | `store.mjs` decay + `memoryHygiene` + reversible decay-list + monthly cron already implement forgetting; only needs inbox surfacing (folded into item #4). |
| New feedback.md guard / constitutional protection | governor `NEVER_AUTO_FILES` already makes it human-only; dedup+reindex shipped. `feedback_events` table is the only structured add. |
| Proactive multi-choice prompts at forks + ≤1 Q/turn (2.5/Phase3) | Low value vs effort given the "execute, don't ask" autonomy doctrine — defer; capture forks via correction-detection. |
| New cron infrastructure for re-score/drift/digest | `systemSchedules.js` already has 10 slots (sys-tutor weekly, sys-intel-eval weekly, sys-learning-digest daily) — new handlers slot in. |

## 6. Top Recommendation

Ship **migration v29** (`identity_facts` + `reflections` + `open_loops` + `feedback_events`) **first**, then the **SessionStart hook** with a "since last time" brief. The brain already learns brilliantly at session END but recalls NOTHING at session START — that asymmetry is the single thing blocking "human mind + memory that self-learns." The four tables are an S-effort additive migration on the exact v28 pattern, and they unblock every other item (inbox types, `/feedback`, open-loop tracking, decision-journal, drift). The SessionStart hook then turns stored memory into lived continuity. Both reuse existing rails (db migration pattern, `settings.json` hooks, mcp memory_search, `learning_inbox`) — zero greenfield, maximum leverage.

## 7. Verification Log

| Claim | Verdict | Evidence / Correction |
|---|---|---|
| L1 identity file: values/voice/non-negotiables/opinions = **present** w/ identity-lock+CHANGELOG+signoff | **partial** | 3 files exist (CLAUDE.md role/mission, profile.md working-style, decision-simulator.md auto-rules) + feedback.md human-only, but core values/voice/non-negotiables not formally locked; no CHANGELOG/sign-off workflow. |
| L1 identity-lock = implemented via dedicated `IDENTITY-LOCK.md` candidate type | **partial** | Protection IS implemented via feedback.md constitution + `NEVER_AUTO` + inbox sign-off (feedbackWriter), but NOT a separate `IDENTITY-LOCK.md`. CHANGELOG exists for training patches, not identity. Sign-off is unified inbox, not identity-specific. |
| L1 opinions store = **partial** (8 tacit principles) | **partial** | 8 principles confirmed in decision-simulator.md, but prose-only — no `identity_facts` table, no `kind=opinion` capture. To complete: add table, capture type, governor load, migrate principles. |
| L2 episodic per-session store = **partial** | **refuted** | ABSENT. `vscode_session` = metadata only; `learning_inbox` has no `kind` column, hard-codes lesson/bug/decision/feedback; digest prompt never requests felt/loops. Needs schema + prompt + `VALID_CANDIDATE_TYPES` extension. |
| L3 semantic = **present**, 134 patterns/good | **partial** (essentially present) | Pipeline FULLY operational. Count nuance: 44 captured items (lessons/bugs/decisions/goldens) ≠ 134 exemplar markdown files; vector store = 21,371 chunks. Capability status = present. |
| L4 procedural = **present** | **partial** | Infra present (governor/trainer/training_patches/changelog ready), but operationalization absent: **0 AUTOLEARN blocks** in agent files, changelog empty — awaiting first training signal. Not a defect; expected new-system state. |
| L5 preference store = **partial** | **partial** | Corrections in feedback.md (markdown, not structured); static prefs in profile.md; approve path writes to feedback.md not a table. `training_signals.kind` lacks `preference`; no `identity_facts` table. |
| L6 open_loops = **absent** | **confirmed** | tasks table (execution lifecycle) and goals (JSON blob) have no due/owner/promised_at/closed_at; no `open_loops` table. Recommendation stands. |
| L7 reflections + decision journal + re-score = **partial** | **partial** | No `reflections` table; `self_improvement_log` lacks `outcome` field; decisions captured `pending` but never resolved; no `/resolve` endpoint; no weekly re-score cron. |
| L7 self-honesty golden evals = **partial** | **partial** | Eval infra + safety dim active across 6 cases, but **0 cases specifically** target self-honesty/over-claiming. Planned, not yet implemented. |
| L7 behavioral drift detector = **absent** | **confirmed** | orgDrift = registry-vs-disk; eval_drop = score floors; calibration = judge drift. No handler comparing `self_improvement_log`/runs vs feedback.md preferences. Recommendation accurate. |
| Per-layer semantic retrieval = **partial** | **refuted** | ABSENT. `retrieve()` filter param + `passesFilters` exist, but **0 layer tagging** in capture/db/retrieve. 0/5 implementation steps done — no per-layer retrieval is actually possible. |
| Explicit + implicit capture = **present** | **confirmed** | Both pathways operational: `captureItem` (explicit, MCP/agents/review) + `learningDigest` (implicit, auto-capture conf≥0.8, stage else). Converge on `captureItem`. |
| Decay + confirm = **present** + inbox surfacing | **partial** | Decay/hygiene/decay-sidecar present and working, but stale items surface only in **Brain tab** report, NOT Learning Inbox. Inbox surfacing claim is absent. |
