# Cycle v3 Design System — Changelog

**Date:** 2026-04-30
**Cycle:** v3-design-system-deep-train
**Source spec:** `ai-design-agent-v3-production-system.md` (user-provided)
**Format:** 7 rounds × 4 Q popup = 28 questions, all answered with recommended option

## Summary

Lifted Boldteq's design agent stack from "patterns" level to v3 "production system" contract. Adoption is additive — extends existing v2 patches rather than replacing.

## Rounds captured (28 Q)

### Round 1 — Foundation (4 Q)
- Component versioning: strict semver (major=breaking, minor=add prop, patch=token swap)
- Dedup: 80% prop overlap → variant merge
- Token export: all 4 (W3C JSON + Tailwind + CSS vars + TS types)
- Perf budget: hard-block on violation

### Round 2 — Business Context Resolver (4 Q)
- Goal→CRO: hard-enforce per goal table
- Audience→tone: 3-tier (novice=reassuring / intermediate=confident / expert=precise)
- Objection→placement: dictionary auto-map
- Diff callout: auto-include when direct competitors named

### Round 3 — 4-Tier Memory (4 Q)
- user_prefs lock: 80%+ across last 10 projects
- Pattern graduation: win_rate ≥0.6 + sample_size ≥30
- Variant winner: Bayesian P>0.95 + MDE ≥0.10
- Storage: Supabase only

### Round 4 — A/B Variant Engine (4 Q)
- Single-axis: hard reject multi-axis
- Hypothesis: all 6 fields required
- Winner promotion: auto when treatment + lift ≥10% + vega ratifies
- Default axes: per-surface table

### Round 5 — Performance Pass (4 Q)
- Image: AVIF + WebP fallback + dims reserved
- Code split: below-fold + >30KB → dynamic
- 3rd-party: analytics=defer / tag-mgr=async / chat=lazy_after_idle
- Critical CSS: extract for hero+topbar+page_header

### Round 6 — Data Adapter Pattern (4 Q)
- Default adapters: Mock + Supabase + Shopify Storefront + REST/GraphQL
- Component data_contract: mandatory
- Migration CLI: scaffold mapping.json + 1-adapter-at-a-time
- Schema→component suggest: yes with confidence score

### Round 7 — Control Panel (4 Q)
- Build scope: spec-only this cycle
- Override emit: allow + audit log + manifest flag
- Variant board: 3-column (Drafts/Running/Concluded)
- Memory tabs: all 4 (prefs + project state + patterns + outcomes)

## Files created (8 canonical specs + this changelog)

| File | Lines | Owner |
|------|-------|-------|
| `~/.claude/memory/patterns/good/v3-component-system-spec.md` | ~150 | figma-synth |
| `~/.claude/memory/patterns/good/v3-token-export-spec.md` | ~140 | token |
| `~/.claude/memory/patterns/good/v3-business-context-resolver.md` | ~165 | catalyst |
| `~/.claude/memory/patterns/good/v3-memory-architecture.md` | ~180 | mira |
| `~/.claude/memory/patterns/good/v3-ab-variant-engine.md` | ~155 | catalyst + ecom-cro |
| `~/.claude/memory/patterns/good/v3-performance-pass-rules.md` | ~190 | sage + bolt + elio |
| `~/.claude/memory/patterns/good/v3-data-adapter-pattern.md` | ~165 | dato + arya |
| `~/.claude/memory/patterns/good/v3-control-panel-spec.md` | ~165 | vega + rex |

## Agents patched (10)

| Agent | v3 layer applied | Key adoption |
|-------|------------------|--------------|
| figma-synth | §1 component system | Strict semver + 80% dedup + manifest |
| token | §2 token export | 4-format pipeline + diff impact |
| catalyst | §3 + §5 | Hard-enforce goal→CRO + single-axis variants + hypothesis schema |
| mira | §4 memory | 4-tier Supabase backend + pattern graduation rules |
| elio | §3 + §6 (consume) | Reads catalyst's enrichment + perf budget design-stage gate |
| sage | §6 perf | Auto-optimization rules + hard-block PR on violation |
| bolt | §6 deploy | Deploy-stage perf budget enforcement |
| dato | §7 data adapter | 4-adapter registry + mandatory data_contract + migration CLI |
| arya | §7 + §8 | Adapter architecture + control panel system design |
| vega | §1 + §8 | Manifest review gate + control panel design ratification |

## Cross-impact (parallel agents)

- **spark + merch** consume catalyst's business context enrichment for tone/density/jargon rules
- **ecom-cro** consumes catalyst's variant axis defaults + sample plan
- **cadence + witness** read mira's 4-tier memory for HR observability
- **rex** uses control panel spec for portfolio-level oversight

## NOT in this cycle

- Operator UI build (control panel) — spec only, deferred
- pgvector setup for similar-project search — adopted as future infra
- Outcome telemetry pipeline — schema captured, instrumentation deferred
- Bayesian early-stopping calculator — formula captured, library pick deferred

## Verification protocol (post-deployment)

1. figma-synth runs against test project — emits duplicate KPICard variants → must auto-merge per 80% rule
2. token runs `exportTokens()` on sample — produces all 4 formats matching schemas
3. catalyst takes sample brief → outputs ContextEnrichment matching v3 §3.2 contract
4. mira queries 4 tiers in test project → validates pattern_library updates from outcome feedback
5. catalyst rejects mock variant request that mutates 2+ axes simultaneously
6. sage halts emit on simulated LCP > 2.5s violation
7. dato scaffolds mock-backed project, then migration CLI swaps to supabase adapter without component changes
8. End-to-end: dispatch single brief through stack → output matches v3 EngineOutputV3 contract (§9)

## Critical references

- v3 source spec — in-context document
- Existing Elio v2 training — `cycle-ecom-v2-elio-deep-train-changelog.md`
- HR Tutor curriculum design — `~/.claude/memory/patterns/good/hr-tutor-curriculum-design.md`
- Boldteq routing — `~/.claude/CLAUDE.md`
