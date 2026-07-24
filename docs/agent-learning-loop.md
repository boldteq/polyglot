# The one governed learning loop (agent `.md` writer ownership)

**Why this doc exists.** An external audit (2026-07-24) saw "six subsystems writing the same agent files"
and worried they clobber each other (the HYG-1 file-splice class). They don't. There are exactly **two**
writers of an agent's *body*, each owning **one** marker-delimited block; everything else either funnels
into one of them or writes a **different file**. This is the canonical map, enforced by
`src/lib/agentBlocks.mjs` + `src/agentBlocks.test.mjs`.

## The two body writers (managed blocks in `~/.claude/agents/<name>.md`)

| Channel | Marker | Owner | Fed by |
|---|---|---|---|
| **SWT-TRAINED** | `<!-- SWT-TRAINED:START/END -->` | `scripts/swt-distribute.mjs` | the SWT corpus / gap-fill path (now gap-driven, frozen by default) |
| **BOLDTEQ-AUTOLEARN** | `<!-- BOLDTEQ-AUTOLEARN:START/END -->` | `src/intelligence/trainer.mjs` | the **defect-grounded governed path** — the primary loop |

The AUTOLEARN block is the one governed funnel. Three sources flow *into it*, none writes the `.md` itself:

- `src/lib/gateFindings.js` — turns a build's gate/Lens defects into `training_signal`s (DB). The governor
  auto-promotes a recurring defect (≥3 builds, ≥2 distinct) → the trainer writes the guardrail, rollback-armed.
- the **learning-inbox / digest** (`src/lib/systemSchedules.js` → trainer) — VS Code SessionEnd lessons.
- **Yash corrections** (P0) — applied through the same trainer path.

## Everyone else writes a DIFFERENT file (cannot collide)

- `scripts/quality-loop.mjs` → `theme-toolkit/toolkit-rules/{proposed,team-default}.json` (the rule **pack**,
  hardening the *gates*), never the `.md`. gateFindings trains the agent from the same defects in parallel.
- `src/lib/agentSync.js` → agent **frontmatter** (name/description/model/tools) only, never the body.
- `scripts/pack-brain.mjs` → **reads** agents to package them; no write.

## The invariant (enforced)

`src/lib/agentBlocks.mjs` is the registry. Before writing, **both** body writers call `blocksAreIsolated()`
and roll back on any overlap. `src/agentBlocks.test.mjs` asserts: markers are mutually non-substring, the
live writers still use the registered markers (drift guard), both call the guard, and two present blocks can
never overlap/nest (the splice class). **A third body writer MUST register in `agentBlocks.mjs` and pass the
same checks** — that is what keeps this one auditable funnel instead of an accreting pile of writers.

## Which loop is primary

Defect-grounded (AUTOLEARN) is **primary**: it learns from what actually failed on real builds. SWT-TRAINED
is a **demoted gap-filler** — it no longer marches a synthetic coverage matrix to a target (frozen 2026-07-24);
it generates only for a *named* gap (`--surfaces`) or an explicit `--coverage` corpus run.
