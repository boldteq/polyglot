# Boldteq AIM v1 — Advanced Intelligence Model (Shopify Website Department)

**Scope:** Shopify Website department ONLY — the 14 agents that build client-owned Liquid themes.
**Status:** Specification, wired onto the existing proven engine (Maestro + Lens + the theme-toolkit gate stack).
**Date:** 2026-06-20
**Supersedes:** the generic cross-stack AIM draft (Koda/Vega/Sage/Playwright/TypeScript/VIS-CODE-ACC IDs that do not exist in the toolkit).

---

## I. Executive Summary

AIM is how the Shopify Website department builds like Claude/Lovable: **no agent declares "done" until the work passes at pixels AND in code, it auto-fixes its own defects in a loop, and it only asks Yash when genuinely blocked.**

Crucially, **AIM is not new machinery — it is the operating doctrine over machinery that already exists and is committed:**
- **Maestro** = the autonomous build loop (one orchestrating mind, per-surface, ≤3 rounds). `theme-toolkit/scripts/maestro-build.mjs` + `lib/maestro-loop.mjs`.
- **Lens** = the eyes (capture screenshots → independent vision judge → enforce → autofix). `lens-capture.mjs` → `lens-judge.mjs` → `check-visual-truth.mjs` (gate #18) → `lens-autofix.mjs`.
- **The gate stack** = the executable code/commerce/honesty/design checks (`theme-gates.mjs`, gates #0–#21; ground the live list in `pnpm gates:list`, never a hardcoded count).
- **Doctrine** = `executable-auto-fix-loop.md` (caps + escalation), `maestro-build-protocol.md`, `lens-visual-truth-protocol.md`, `full-autonomy-rules.md`, `aim-handoff-contract-registry.md`.

AIM's job: make that engine the **enforced default**, keep the 3-layer mental model (Visual / Code / Acceptance) as the teaching skin, and close the gaps that let a build *look* done when it wasn't.

**The "never falsely say done" guarantee rests on three forcing-functions, not agent goodwill:**
1. **Dispatch refusal** (#0.4 discovery + #0.5 bootstrap) — you cannot start building without a brief + design system, so a skipped gate can't read as "pass."
2. **Eyes-on** (Lens #18) — a real screenshot judged by a vision model that never saw the build code; catches what source-reading gates miss.
3. **Publish-grade verdict** — Maestro emits PUBLISH-READY only when the loop converged AND the full stack passed AND the evidence is fresh (SHA-bound).

---

## II. Architecture — the mind, the eyes, the gates

```
USER BRIEF
   │
   ▼  THE MAESTRO MIND  ( /shopify-store  — one persistent session )
   │   carries docs/build-state.md : design-system summary + cross-surface decision ledger
   │   calls the 14 agents as CONSULTANTS (each owns its gate; onyx stays independent)
   │
   ├─ per-surface LOOP ────────────────────────────────────────────────┐
   │     draft (loom + consultants) → render (theme:dev) → SEE (lens:surface) │
   │     → critique → fix (route by fix_owner) → converge? ≤3 rounds          │
   └──────────────────────────────────────────────────────────────────┘
   │
   ▼  THE 3-LAYER GATE STACK  (publish grade)  →  docs/publish-readiness.json
```

The orchestrator is the **session**, not an agent (per `maestro-build-protocol.md §0` — you cannot prompt-promote a subagent into a persistent mind). The 14 agents are consultants the mind calls; each owns and runs its gate(s) before returning, so by the time the full stack runs it is a *second opinion*, not the first look.

---

## III. The 3 Validation Layers (mapped to REAL executable gates)

The teaching layers are a mnemonic. Every row cites the real gate number, the real script, and the real owner. (Generic→real owner map: Koda→loom, Vega→drape, Sage→onyx, Luna→lumen, Quill/Decoder→ink+quill, Token→drape.)

### Layer 1 — VISUAL ("does it render right at pixels?")

| Teaching ID | Real gate(s) | Script | Owner / fix_owner |
|---|---|---|---|
| VIS render/overflow/broken-image | **#18 visual-truth (Lens)** | `check-visual-truth.mjs` ← capture+judge | loom (layout) · porter (empty collection/data) · conduit (binding) |
| VIS a11y | **#5 axe** + **#16 a11y-static** | `gate-axe.mjs`, `check-a11y-static.mjs` | loom |
| VIS consistency / no drift | **#9 consistency** + **#19 section-cohesion** | `check-consistency.mjs`, `check-section-cohesion.mjs` | drape (system) · loom (binding) |
| VIS performance paint | **#1 lighthouse** | `gate-lighthouse.mjs` | loom |
| VIS mobile overflow | **#18 Lens (mobile viewport)** | `lens-capture.mjs` | loom |
| VIS brand fidelity / on-scale | **#8 design-system** + **#12 design-quality** + **#14 render-wiring** + **#17 visual-quality** | `check-design-system.mjs`, `check-design-quality.mjs`, `check-render-wiring.mjs`, `check-visual-quality.mjs` | drape (authors) · loom (wires) · onyx (attests #17, independent) |

> Dropped from the generic draft: **dark-mode (VIS-6)** — Shopify themes carry no dark-mode requirement.

### Layer 2 — CODE ("is the Liquid sound, honest, and transacting?")

| Teaching ID | Real gate(s) | Script | Owner |
|---|---|---|---|
| Theme-check clean | **#2 theme-check** | `gate-theme-check.mjs` | loom |
| Honesty (no fakery) | **#13 honesty** | `check-honesty.mjs` | ink (copy) · porter (real review data) |
| Functional smoke | **#10 functional** | `gate-functional.mjs` | loom · conduit |
| Editability | **#3 editability** | `gate-editability-greps.sh` | loom |
| Antipatterns / bloat | **#11 antipatterns** | `check-antipatterns.mjs` | loom |
| Render-wiring | **#14 render-wiring** | `check-render-wiring.mjs` | loom · conduit |
| Commerce-readiness | **#15 commerce-readiness** | `check-commerce-readiness.mjs` | loom · conduit |
| Design-system contract | **#8 design-system** + **#20 card-bindings** | `check-design-system.mjs`, `check-card-bindings.mjs` | drape · loom |

### Layer 3 — ACCEPTANCE ("did we solve exactly the ask, honestly, and will it convert?")

| Teaching ID | Real gate(s) | Script | Owner |
|---|---|---|---|
| Requirement match | **CHANGES.md completeness** | `check-changes-list.mjs` | atrium (intake) · onyx (audit) |
| Functional E2E | **#10 functional** | `gate-functional.mjs` | lumen runs · loom/conduit fix |
| Perf SLA | **#1 lighthouse** | `gate-lighthouse.mjs` | loom |
| Visual fidelity | **#17 visual-quality** + **#18 Lens** | `check-visual-quality.mjs`, `check-visual-truth.mjs` | onyx (independent) · drape |
| Brand / copy honesty + SEO | **#13 honesty** + **#6 seo** | `check-honesty.mjs`, `gate-seo.mjs` | ink · beacon |
| Conversion readiness | **#7 conversion** + **#21 conversion-signoff** | `gate-conversion.mjs`, `check-conversion-signoff.mjs` | catalyst (dotted) · ink · loom |
| Publish verdict | **maestro publish-readiness** + freshness | `maestro-build.mjs`; `theme-gates --verify --require-full` | mantle |

---

## IV. The Auto-Remediation Loop (real caps, real escalation)

```
GATE / LENS FAILS
   → classify (gate id · fix_owner · severity)
   → route by fix_owner:  loom=code · drape=design · ink=copy · conduit=binding · porter=store-data
   → owner fixes autonomously (no human approval)  →  re-verify (same scope)
   → PASS → continue   |   FAIL → next round
   → after the cap → ESCALATE (write the bug list to a file; never silently pass)
```

**The caps are already locked — AIM does not invent new ones:**
- **Lens autofix:** ≤3 rounds/surface, owner-routed (`lens-autofix.mjs`, `lens-visual-truth-protocol.md`). `porter` (store-data) findings ESCALATE — never blind store edits.
- **Maestro loop:** `MAESTRO_MAX_ROUNDS=3` per surface, then escalate that surface cleanly (`lib/maestro-loop.mjs`).
- **Per-agent class caps** (frontmatter `class/maxRetries/wallClockCapMinutes/costCapUsd`): BUILDER = 5 retries / 25 min / $5 (loom, drape, ink, stitch, conduit, lattice, compass, porter); GATE/REVIEWER = 3 / 15 min / $3 (onyx, lumen, beacon) — from `executable-auto-fix-loop.md`.

**Auto-fix vs. ask — the discipline:** a defect that an owner can fix (code/design/copy/binding) is NEVER a question — it loops. A finding only becomes a question when it maps to the `full-autonomy-rules.md` escalation whitelist (brand identity, irreversible money, legal/TOS, data-loss, **real-asset-missing** — a real product photo / a confirmed brand name / a non-empty collection, the porter HUMAN class — or a hard input conflict). Then AIM stops and asks **once, batched, with a recommended default** via `docs/ESCALATION.md` + `docs/questions.json` (consolidated by `maestro-escalate.mjs`).

---

## V. Workflow Orchestration — the 7 phases

```
1 DISCOVERY  compass · nova/scout/atlas · decoder → goals.json + brand-direction.md   [#0.4 REFUSE if missing]
                                                                          ▲ HUMAN #1 roadmap confirm
2 DESIGN     drape → design-spec.md + design-system.json · catalyst lift  [#0.5 bootstrap]
                                                                          ▲ HUMAN #2 design-preview (live link)
3 BUILD      per-surface Maestro loop (draft→render→SEE→fix ≤3) over [home,collection,pdp,cart,search,account]
4 DATA       lattice metafield schema · porter populate store (no orders/customers/payments)
5 VERIFY     the 3-layer gate stack at PUBLISH grade → publish-readiness.json
                ALL PASS → PUBLISH-READY   |   FAIL → autofix ≤3 → converge OR ESCALATE
6 SHIP       (optional HUMAN #3 pre-publish) → theme:push (Lens default-on) → theme:publish FLIP → T+0 smoke
7 WATCH      lumen 48h watch · catalyst 30/90d CRO results loop · mira /train lessons
```

**Two tiers** (not the generic Class A/B/C/D): **lean 8-step** = the autonomous default (`/shopify-store`); **full 18-step** = client engagements with explicit UAT. Same gate stack; the difference is the number of human checkpoints.

**Dispatch refusal (missing contract = no dispatch):** every handoff is a named contract in `aim-handoff-contract-registry.md`. An agent cannot start until its inbound contract's `requires[]` exist (`pnpm check:handoff <event>`); it emits its outbound contract on done. This is a *dispatch* gate, not a publish gate.

**Human touchpoints (in the autonomous tier): 2 required** — (#1) roadmap/brief confirm after discovery, (#2) design-preview confirm on a live staging link after the design system locks — plus (#3) an optional pre-publish confirm. Everything else is autonomous per `full-autonomy-rules.md`.

---

## VI. Integration with the real artifacts (not Supabase)

AIM's run state lives in files, read by `pnpm maestro:status`:

| Artifact | Holds |
|---|---|
| `docs/build-state.json` / `.md` | the carried mind — per-surface status + cross-surface decision ledger + design-system summary |
| `docs/maestro-report.json` / `.md` | loop result — converged vs escalated surfaces, rounds each |
| `docs/publish-readiness.json` / `.md` | the publish verdict — `publishReady` only if loop converged AND gate stack passed; SHA-stamped |
| `gate-reports/SUMMARY.md` + `*.json` | full gate stack result (blockers/warnings/skips per gate) |
| `gate-reports/lens/index.html` | the eyeball page — screenshots + Layer-1 facts + judge findings per frame |
| `docs/ESCALATION.md` + `docs/questions.json` | the batched, whitelist-tagged asks for Yash (only when genuinely blocked) |

---

## VII. Agent mindset shift

**FROM:** "I built it; the user will tell me what's broken."
**TO:** "I ran my gate, I looked at the pixels, I fixed what failed, THEN I emitted my contract."

1. Validate before declaring done — your owned gate must exit 0, and any surface you touched must clear Lens.
2. Auto-fix obvious defects in the loop — do not ask.
3. Escalate on *whitelist* hits, not on defects. "I can't decide this without a real asset / a brand call" is a legit escalation; "it failed and I'll retry" is a cycle.
4. Ask in one batch with a recommended default, never serial clarifications.
5. onyx and lumen never grade the builder's own attestation — onyx is independent.

---

## VIII. The 14 agents (each carries an "AIM Operating Contract" block)

| Agent | Owns gate(s) | Self-verify | Emits |
|---|---|---|---|
| atrium (orchestrator) | CHANGES.md completeness; #0.4/#0.5 dispatch refusal | `changes:check` + `maestro:preflight` | intake_ready |
| compass (discovery) | briefs (#0.4 side) | `check:briefs` | content_briefs_ready, content_inventory_ready |
| drape (designer) | #8 design-system, #12 design-quality | `check:design-system` + `check:bootstrap` | design_system_ready, design_spec_ready |
| ink (copy) | #13 honesty (copy side) | `check-honesty.mjs` | copy_ready |
| beacon (SEO) | #6 seo | `gate-seo.mjs` | seo_signoff_ready |
| stitch (convert) | reuse-map (standalone validator, not a numbered gate) | `check:reuse-map` | skeleton_ready_for_refinement |
| loom (liquid) | #2,#3,#8,#9,#14,#15,#16,#19 + Lens fixes | `ds:css` + named gates + `lens:surface` | theme_ready_for_qa |
| conduit (data) | #14/#15 (binding side) | `check-render-wiring.mjs` | data_contracts_ready |
| lattice (metafields) | metafield schema | `check:schema` | metafield_schema_published |
| keystone (token) | provisioning | `keystone:token` | store_token_ready |
| porter (store data) | porter-verify | `store:verify` | store_data_ready |
| mantle (release) | publish chain | `theme:publish --dry-run` | published |
| lumen (QA + watch) | #1,#5,#10 | `theme:audit:full` | qa_passed_ready, launch_watch_clear |
| onyx (reviewer, **independent**) | #17 visual-quality; verifies #18 ran | `gates:verify:full` + authors visual-quality-review.json | code_review_approved |

Each block (~12–18 lines) follows the same shape: REQUIRE / PRODUCE (registry names) · OWN (gate + script) · SELF-VERIFY (exact command) · AUTO-FIX (≤3 rounds, class cap) · ESCALATE (→ atrium/Yash on a whitelist item).

---

## IX. Implementation status (what's already real vs. what AIM adds)

**Already committed (verified in source):** Maestro loop, Lens 4-layer, the gate stack, dispatch-refusal gates #0.4/#0.5, Lens default-ON in `theme:push` (`LENS_REQUIRE=1`, dies without a preview unless waived), single-theme mode, the auto-fix caps.

**What AIM adds (this rollout):**
1. This doctrine + the ASCII wireframe (Shopify-accurate).
2. The handoff-contract registry (JSON + memory doc) — ends naming drift.
3. The **AIM Operating Contract** block in all 14 agents.
4. **Linchpin fix:** `maestro-build.mjs runGates()` runs the gate stack at publish grade (`DS_REQUIRE_SCOPE=1 LENS_REQUIRE=1`) so #0.4/#0.5/#18 block the whole-store verdict instead of warning — closing "skip reads as pass."
5. **Escalation hatch:** `maestro-escalate.mjs` → `docs/ESCALATION.md` + `docs/questions.json` (whitelist-tagged), wired into the CLI + the Workflow driver.

---

## X. Success criteria (the adversarial bar)

A change is trusted only when it survives an attempt to *refute* it (the dogfood methodology: 3/3 refuted → 1/3 → survived):
- Build with no `goals.json` → must BLOCK at preflight.
- Build with no Lens evidence → #18 must BLOCK in Maestro's verdict (proves the linchpin fix).
- Stale build (HEAD ≠ readiness.sha) → `theme:publish` must BLOCK on SHA-coherence.
- A planted mobile-overflow defect → auto-fix catches it ≤3 rounds, or `ESCALATION.md` is written.

Do not demote any detector to advisory until AIM has survived on **≥2 real stores** (`maestro-build-protocol.md §6.5`).

---

## XI. Glossary

- **Maestro mind** — the orchestrating `/shopify-store` session that holds whole-store state.
- **Consultant** — an agent the mind calls (loom, drape, ink, …); owns and runs its gate.
- **Lens** — the eyes: capture → judge → enforce → autofix.
- **Gate** — an executable check (#0–#21); ground the list in `pnpm gates:list`.
- **Contract** — a named handoff (registry); missing contract = no dispatch.
- **Whitelist hit** — the only reason AIM asks a human (`full-autonomy-rules.md`).
- **Publish-grade** — gates run with `DS_REQUIRE_SCOPE=1 LENS_REQUIRE=1` so dispatch/eyes gates block, not warn.

**END** — the wireframe companion is `AIM-V1-VISUAL-WIREFRAME.md`.
