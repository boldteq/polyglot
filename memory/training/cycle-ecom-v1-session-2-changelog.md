# Ecom Training Cycle v1 — Session 2 Changelog

**Date:** 2026-04-27
**Session:** 2 of 8 (focus: Catalyst CRO strategy)
**Format:** AskUserQuestion popup, all 12 selected "Recommended"
**Patches composed:** 16 (12 catalyst-scoped + 4 cross-cutting)

## Per-Q lessons + patch targets

### ECOM-CAT-001 — ICE weighting
**Decision:** Impact ×2 weighted: `(I×2) × C × E`, max 2000. Threshold scales: skip <400, queue 400-1000, run 1000+.
**Patches:** `skills/catalyst/ab-test-prioritization.md` (update_existing: ICE formula + threshold table)

### ECOM-CAT-002 — Sparse niche relax
**Decision:** Sparse decoder data (<5 brands) → relax mandate to 25% lift + escalate to Yash. Decoder runs 5 backfill brands in parallel; restore 40% at 5+ brands.
**Patches:** `skills/catalyst/ab-test-prioritization.md` (pattern_addition: sparse-niche flex rule), `agents/catalyst.md` (Process A: sparse-niche escalation)

### ECOM-CAT-003 — PR split (spark + ecom-cro bundle)
**Decision:** Always split into 2 PRs (spark CTA + ecom-cro mechanic). Catalyst is integration owner, reviews both, merges mechanic-first then CTA, tests integration. Preserves scope-split + audit trail.
**Patches:** `skills/catalyst/scope-split-enforcement.md` (pattern_addition: bundle-split protocol), `agents/catalyst.md`, `agents/spark.md`, `agents/ecom-cro.md` (cross-ref to bundle-split rule)

### ECOM-CAT-004 — 7-day client deadline vs 14-day stat gate
**Decision:** Refuse to call winner. Ship best-guess variant flagged 'experimental · awaiting 14-day call'. At day 14, formal call. Swap if differs. Preserves rigor + meets deadline.
**Patches:** `skills/catalyst/ab-test-prioritization.md` (pattern_addition: client-deadline protocol with experimental flag)

### ECOM-CAT-005 — Low-traffic holdout
**Decision:** No holdout under 10K visitors/month. Cumulative composite-lift only. 10K-50K → 80/20. 50K+ → 90/10.
**Patches:** `skills/catalyst/ab-test-prioritization.md` (update_existing: holdout sizing by traffic tier)

### ECOM-CAT-006 — Subscription-business surface priority
**Decision:** When LTV-from-subscription > 3x LTV-from-one-time, override default priority: (1) subscription toggle, (2) PDP hero, (3) cancel-flow save (Athletic Greens pause-vs-cancel pattern, 35% retention lift).
**Patches:** `skills/catalyst/cro-strategy-playbook.md` (pattern_addition: subscription-business priority override), `memory/patterns/good/ecom-funnel-cro-playbook.md` (per-niche adjustments)

### ECOM-CAT-007 — Scope-split appeal window
**Decision:** Strict 2-strike rule, but agent has 48h appeal window with evidence (decoder citation, prior precedent). Reviewed by catalyst + cadence. Failed appeals stand; successful appeals strike violation.
**Patches:** `skills/catalyst/scope-split-enforcement.md` (pattern_addition: appeal protocol), `agents/cadence.md` (cross-ref appeal review)

### ECOM-CAT-008 — Parallel finish soft-freeze
**Decision:** Elio spec marked 'frozen-pending-copy' when complete first. Editable only for slot-sizing fit issues (24h window). Bigger changes → catalyst arbitrates.
**Patches:** `skills/catalyst/cro-strategy-playbook.md` (pattern_addition: parallel-completion soft-freeze), `agents/elio.md` (Process A: soft-freeze marker)

### ECOM-CAT-009 — Weekly CRO report priority
**Decision:** Order: (1) absolute $ revenue lift, (2) cumulative funnel lift %, (3) tests shipped, (4) winners + lift %, (5) losers + lessons. Format: table top + 3-paragraph narrative below.
**Patches:** `skills/catalyst/cro-strategy-playbook.md` (pattern_addition: weekly report format), `agents/catalyst.md` (Process D: report format)

### ECOM-CAT-010 — Kill threshold
**Decision:** <10% cumulative @ 60d → 30-day strategy revisit. <5% after revisit → kill CRO program, pivot to UX rebuild (vega-led) or brand repositioning. Yash decides kill vs pivot.
**Patches:** `skills/catalyst/cro-strategy-playbook.md` (pattern_addition: kill threshold), `agents/catalyst.md` (Process E: 30/60/90 strategy gates)

### ECOM-CAT-011 — Discount policy
**Decision:** Last-resort. Allow discount ONLY: cart-abandon email 2-3 (10-15% cap), win-back (20-25% cap at day 90), promotional moments (Black Friday). NEVER PDP, NEVER first-touch hero.
**Patches:** `skills/catalyst/cro-strategy-playbook.md` (pattern_addition: discount policy), `agents/catalyst.md` (Anti-Patterns: discount on PDP/hero)

### ECOM-CAT-012 — Ecom vs SaaS sharp difference
**Decision:** Mobile-first dominates. 60-70% ecom traffic on mobile. Catalyst MUST verify mobile spec exists before approving design. Desktop is secondary, not primary.
**Patches:** `agents/catalyst.md` (Self-Validation: mobile-spec verification gate), `skills/catalyst/cro-strategy-playbook.md` (pattern_addition: ecom-vs-SaaS principle)

---

## Patch summary

| # | Target | Type | Source Q |
|---|--------|------|----------|
| 1 | `skills/catalyst/ab-test-prioritization.md` | update_existing | CAT-001 |
| 2 | `skills/catalyst/ab-test-prioritization.md` | pattern_addition | CAT-002 |
| 3 | `agents/catalyst.md` Process A | pattern_addition | CAT-002 |
| 4 | `skills/catalyst/scope-split-enforcement.md` | pattern_addition | CAT-003 |
| 5 | `agents/catalyst.md` Anti-Patterns | pattern_addition | CAT-003 |
| 6 | `agents/spark.md` cross-ref | pattern_addition | CAT-003 |
| 7 | `agents/ecom-cro.md` cross-ref | pattern_addition | CAT-003 |
| 8 | `skills/catalyst/ab-test-prioritization.md` | pattern_addition | CAT-004 |
| 9 | `skills/catalyst/ab-test-prioritization.md` | update_existing | CAT-005 |
| 10 | `skills/catalyst/cro-strategy-playbook.md` | pattern_addition | CAT-006 |
| 11 | `memory/patterns/good/ecom-funnel-cro-playbook.md` | update_existing | CAT-006 |
| 12 | `skills/catalyst/scope-split-enforcement.md` | pattern_addition | CAT-007 |
| 13 | `skills/catalyst/cro-strategy-playbook.md` | pattern_addition | CAT-008 + CAT-009 + CAT-010 + CAT-011 + CAT-012 (consolidated) |
| 14 | `agents/elio.md` Process A | pattern_addition | CAT-008 |
| 15 | `agents/catalyst.md` consolidated | pattern_addition | CAT-009..012 |
| 16 | `agents/cadence.md` cross-ref | pattern_addition | CAT-007 (appeal review) |

## Stats
- Q answered: 12/12
- Skipped: 0
- Patches composed: 16
- Patches applied: 16 (next bash run)
- Drift incidents: 0

## Cross-references
- Curriculum: `~/.claude/memory/curriculum/ecom-team-training-v1.md` Session 2
- Plan: `~/.claude/plans/so-we-have-to-dynamic-shell.md` Phase 2
- Session 1 changelog: `~/.claude/memory/training/cycle-ecom-v1-session-1-changelog.md`
