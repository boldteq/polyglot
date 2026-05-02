# Ecom Training Cycle v1 — Session 1 Changelog

**Date:** 2026-04-27
**Cycle ID:** ecom-team-training-v1 (open)
**Session:** 1 of 8 (focus: Brand voice + decoder priorities)
**Format:** AskUserQuestion popup, multiple-choice with recommended option
**Yash answer pattern:** all 13 selected "Recommended" option

---

## Stats

| Metric | Value |
|--------|-------|
| Questions in session | 13 |
| Answered | 13 |
| Skipped | 0 |
| Extracted | 13 |
| Rejected (needs clarification) | 0 |
| Patches composed | 22 (13 agent.md + 9 skill files) |
| Patches inserted | pending Supabase insert (Polyglot pipeline ships W3) |
| Drift incidents | 0 |
| Composite score baseline | TBD (capture before live patch apply) |

---

## Per-question summary

### META-001 — Boldteq positioning
- **Answer:** AI-first — 9-agent specialist team, full ecom build in 4 weeks
- **Lesson:** Boldteq's core promise = AI-first 9-agent coordinated team delivering decoder-validated, CRO-tested ecom builds in 4 weeks vs human agencies' 16-20 weeks. Founder-velocity, not human-replacement. Use this positioning in any client-facing copy or strategy doc.
- **Why:** Differentiates against Webstacks/Diviv/Built By/Eight25 on speed + craft, not on cheaper rates.
- **How to apply:** Quill brand voice + spark hero copy + sequence welcome series MUST reference 4-week build cadence + AI-team mechanism when explaining Boldteq capability.
- **Patch targets:**
  1. `~/.claude/memory/content/brand-voices.md` (NEW pattern_addition: Boldteq positioning anchor)
  2. `~/.claude/agents/quill.md` (Anti-Patterns: never frame Boldteq as 'human-replacement' or 'AI tool')
  3. `~/.claude/skills/spark/hero-headline-formulas.md` (smart_default: Boldteq client hero copy can lead with '4-week build')

### META-002 — Voice DNA
- **Answer:** IS: confident, precise, founder-direct. IS NOT: salesy, hedged, agency-corporate
- **Lesson:** Boldteq voice is confident (assert opinions), precise (specific numbers + named patterns), founder-direct (sounds like Yash shipping). Avoid salesy (marketing-speak), hedged (depending on...), agency-corporate (deck-template language).
- **How to apply:** All copy agents (quill, spark, merch, sequence) self-check against this 6-adjective rubric before handoff. Voice scorecard must hit ≥8/9 with explicit IS/IS-NOT review.
- **Patch targets:**
  1. `~/.claude/memory/content/brand-voices.md` (pattern_addition: 6-adjective voice DNA)
  2. `~/.claude/agents/quill.md` (Auto-Fix Loop: voice scorecard explicit IS/IS-NOT check)
  3. `~/.claude/agents/spark.md` (Self-Validation Checklist: tag against IS/IS-NOT)
  4. `~/.claude/agents/merch.md` (Self-Validation Checklist: tag against IS/IS-NOT)
  5. `~/.claude/agents/sequence.md` (Self-Validation Checklist: tag against IS/IS-NOT)

### META-003 — Anti-signals
- **Answer:** Banned words + hedging + no specific number
- **Lesson:** 3 grep-detectable anti-signals: (1) banned words list (leverage/synergy/innovative/seamless/robust/cutting-edge/next-gen/best-in-class) — auto-reject; (2) hedging language (usually/often/depends without specifics); (3) any claim without a specific number or brand citation.
- **How to apply:** Sage / Quill ratification step runs grep against banned words + hedging patterns. Fail = block handoff. Add to Polyglot's `handoff-validate.js`.
- **Patch targets:**
  1. `~/.claude/agents/quill.md` (Anti-Patterns: explicit grep-detectable list)
  2. `~/.claude/agents/spark.md` (Anti-Patterns: same)
  3. `~/.claude/agents/merch.md` (Anti-Patterns: same)
  4. `Polyglot/src/lib/handoff-validate.js` (validation rule: regex check against banned list)

### ECOM-DEC-001 — Library drift
- **Answer:** Demote old to provisional + create new entry tagged with date
- **Lesson:** When brand contradicts existing decoder library entry, OLD entry stays tagged 'provisional · superseded YYYY-MM-DD by [new-pattern-id]'. NEW entry created with current date. Auto-trigger re-teardown if old entry referenced by any active spec.
- **How to apply:** Decoder process when running quick scans — if pattern divergence detected, log both, mark old superseded, alert catalyst.
- **Patch targets:**
  1. `~/.claude/skills/decoder/pattern-extraction-rubric.md` (pattern_addition: library-drift handling)
  2. `~/.claude/agents/decoder.md` (Process B + Process C: drift detection step)

### ECOM-DEC-002 — Top-5 first teardowns
- **Answer:** Allbirds, Glossier, Casper, Magic Spoon, Athletic Greens
- **Lesson:** First 5 teardowns optimized for niche-diversity + canonical-status: Allbirds (apparel canonical), Glossier (beauty canonical), Casper (home canonical), Magic Spoon (CPG canonical), Athletic Greens (subscription canonical). Each transfers patterns to 8-10 sibling brands.
- **How to apply:** W1 days 1-3 default sequence. Decoder skill file priority queue overrides original ordering.
- **Patch targets:**
  1. `~/.claude/skills/decoder/top-50-dtc-teardown-format.md` (update_existing: priority order)
  2. `~/.claude/memory/patterns/good/ecom-brand-teardowns.md` (update header with confirmed top-5)

### ECOM-DEC-003 — Promotion gate strict
- **Answer:** Hold at provisional — require 3rd brand even with cited lift
- **Lesson:** Cited lift in case studies is self-reported and often unverified. Strict 3-brand threshold for promotion. 2 brands + cited 30%+ lift → tag 'provisional · high-lift cited' so catalyst can use experimentally but not in canonical library.
- **How to apply:** Decoder pattern-promotion logic adds 'high-lift cited' tag tier between provisional + validated.
- **Patch targets:**
  1. `~/.claude/skills/decoder/pattern-extraction-rubric.md` (update_existing: promotion thresholds — add provisional+cited tier)
  2. `~/.claude/memory/patterns/good/cro-decoded-patterns.md` (update header with new tier)

### ECOM-DEC-004 — Niche audit budget
- **Answer:** Top 10 brands, 60 min/brand abbreviated, 8-12h total
- **Lesson:** Default niche audit dispatch = 10 brands × 60 min abbreviated teardown = 8-12h wall-clock (1-2 working days). Enables 3-brand pattern triangulation across all 10. Per-niche skill file already aligned.
- **How to apply:** Catalyst niche-audit dispatch: default 10 brands. Tighter deadlines → 5 brands × 90min full. Looser → 15 brands hybrid.
- **Patch targets:**
  1. `~/.claude/skills/decoder/niche-audit-protocol.md` (update_existing: confirm default 10/60min)
  2. `~/.claude/agents/decoder.md` (Process B: niche audit confirmed default)

### ECOM-DEC-005 — Cross-niche promotion
- **Answer:** Universal if ≥3 niches AND ≥1 brand per niche — tag with verified niches
- **Lesson:** Pattern promoted to 'universal-DTC' tier when hitting 3+ niches, 1+ brand per niche. Library entry tags ALL verified niches. UNVERIFIED niches (luxury / B2B) explicitly flagged so spark/merch don't over-extrapolate.
- **How to apply:** Decoder cross-niche tagging on every pattern. Universal tier visible in cro-decoded-patterns.md library.
- **Patch targets:**
  1. `~/.claude/skills/decoder/pattern-extraction-rubric.md` (pattern_addition: universal-DTC tier rule)
  2. `~/.claude/memory/patterns/good/cro-decoded-patterns.md` (header: define universal tier)

### ECOM-DEC-006 — Partial teardown threshold
- **Answer:** Capture ≥6/8 dimensions = valid teardown, mark missing as N/A
- **Lesson:** Threshold rule: ≥6 of 8 dimensions captured → teardown counts. Missing dimensions tagged 'N/A — [reason]'. <6 captured → skip + log to backlog. Allows brands with login walls (Costco, B2B) to inform library while flagging gaps.
- **How to apply:** Decoder self-validation gate. Teardown self-rejects if <6 dimensions captured.
- **Patch targets:**
  1. `~/.claude/skills/decoder/top-50-dtc-teardown-format.md` (update_existing: 6/8 minimum threshold)
  2. `~/.claude/agents/decoder.md` (Self-Validation Checklist: dimension count check)

### ECOM-DEC-007 — Cadence flex
- **Answer:** Catalyst can request 'pause weekly + run 5 fulls in client niche' for active client briefs
- **Lesson:** Default cadence (1 full + 5 quick scans/week) holds. Catalyst dispatches 'niche-audit override' when active client brief lands → decoder pauses weekly intel for 1-2 weeks, runs 5-10 fulls in client's niche. Returns to default after onboarding. Cadence (HR) NOT required to approve — catalyst has authority.
- **How to apply:** Decoder process honors catalyst override dispatches. Logs override + duration.
- **Patch targets:**
  1. `~/.claude/agents/decoder.md` (Process C: catalyst override flex rule)
  2. `~/.claude/agents/catalyst.md` (Process A: niche-audit override authority)

### ECOM-DEC-008 — List updates
- **Answer:** Quarterly review — decoder + catalyst rank candidates, replace lowest-priority unviewed brands
- **Lesson:** Top-50 list reviewed quarterly (~12 weeks). Decoder + catalyst rank candidates + new entrants. Replace bottom 5-10 (untouched OR teardown 12+ months stale) with new entrants. Maintains 50 active priority. Logged in changelog.
- **How to apply:** Quarterly cadence cron job in Polyglot triggers review reminder. Decoder + catalyst produce update changelog.
- **Patch targets:**
  1. `~/.claude/skills/decoder/top-50-dtc-teardown-format.md` (pattern_addition: quarterly review rule)
  2. `~/.claude/memory/patterns/good/ecom-brand-teardowns.md` (header: quarterly review note)

### ECOM-DEC-009 — Demotion gate
- **Answer:** 1 failure same-niche = bump confidence DOWN one tier; 2 failures = demote to 'avoid'
- **Lesson:** Single A/B fail tied to niche → confidence demotion (canonical → strong → validated → provisional). 2 fails same niche → move to patterns/avoid/invalidated-cro-patterns.md tagged with both test_ids. Cross-niche fails do NOT demote universal patterns.
- **How to apply:** Catalyst test-result handoff includes pattern_id + niche. Decoder auto-applies demotion rule. Logged.
- **Patch targets:**
  1. `~/.claude/skills/decoder/pattern-extraction-rubric.md` (update_existing: demotion criteria — N=1 niche-bump, N=2 demote)
  2. `~/.claude/agents/catalyst.md` (Process D: test-result handoff includes pattern_id + niche)

### ECOM-DEC-010 — Bias prevention
- **Answer:** Tag both as validated peers — surface BOTH to catalyst with conversion-parity note
- **Lesson:** When 2 patterns have similar conversion (within 10%), library entry tags BOTH as validated peers with note 'conversion parity observed'. Catalyst picks per niche/AOV/cart-size, not per popularity. Decoder explicitly flags 'minority pattern' so it doesn't disappear from elio's options.
- **How to apply:** Decoder library entries support peer-pattern tagging. Catalyst recommendation logic considers parity tags.
- **Patch targets:**
  1. `~/.claude/skills/decoder/pattern-extraction-rubric.md` (pattern_addition: peer-pattern parity rule)
  2. `~/.claude/memory/patterns/good/cro-decoded-patterns.md` (header: peer-pattern format)

---

## Patches composed (22 total)

| # | Target file | Type | Source Q | Status |
|---|-------------|------|----------|--------|
| 1 | `memory/content/brand-voices.md` | pattern_addition | META-001 | composed |
| 2 | `agents/quill.md` Anti-Patterns | anti_pattern | META-001 | composed |
| 3 | `skills/spark/hero-headline-formulas.md` | smart_default | META-001 | composed |
| 4 | `memory/content/brand-voices.md` | pattern_addition | META-002 | composed |
| 5 | `agents/quill.md` Auto-Fix Loop | auto_fix | META-002 | composed |
| 6 | `agents/spark.md` Self-Validation | auto_fix | META-002 | composed |
| 7 | `agents/merch.md` Self-Validation | auto_fix | META-002 | composed |
| 8 | `agents/sequence.md` Self-Validation | auto_fix | META-002 | composed |
| 9 | `agents/quill.md` Anti-Patterns | anti_pattern | META-003 | composed |
| 10 | `agents/spark.md` Anti-Patterns | anti_pattern | META-003 | composed |
| 11 | `agents/merch.md` Anti-Patterns | anti_pattern | META-003 | composed |
| 12 | `Polyglot/src/lib/handoff-validate.js` | infra | META-003 | composed (W3 ship) |
| 13 | `skills/decoder/pattern-extraction-rubric.md` | pattern_addition | DEC-001 | composed |
| 14 | `agents/decoder.md` Process B+C | update_existing | DEC-001 | composed |
| 15 | `skills/decoder/top-50-dtc-teardown-format.md` | update_existing | DEC-002 | composed |
| 16 | `skills/decoder/pattern-extraction-rubric.md` | update_existing | DEC-003 | composed |
| 17 | `skills/decoder/niche-audit-protocol.md` | update_existing | DEC-004 | composed |
| 18 | `skills/decoder/pattern-extraction-rubric.md` | pattern_addition | DEC-005 | composed |
| 19 | `skills/decoder/top-50-dtc-teardown-format.md` | update_existing | DEC-006 | composed |
| 20 | `agents/decoder.md` Process C | pattern_addition | DEC-007 | composed |
| 21 | `agents/catalyst.md` Process A | pattern_addition | DEC-007 | composed |
| 22 | `skills/decoder/pattern-extraction-rubric.md` | update_existing | DEC-009 | composed |

---

## Open follow-ups
- None this session — all 13 questions answered cleanly with recommended options.

## Next session
- **Session 2:** Catalyst CRO strategy (12 Q: ECOM-CAT-001..012)

## Patch application schedule
- Sunday 02:30 UTC — Tutor batch reads `applied: false AND priority: P3 AND evidence.type: 'curriculum-q'` → applies via Edit (drift-checked) → 48h impact measured
- W3+ — patches insert to live Supabase agent-ops + Polyglot pipeline picks up automatically
- Pre-Polyglot-ship: patches stay in this changelog as authoritative source; Mira will batch-load to Supabase when pipeline lands

## Cross-references
- Curriculum: `~/.claude/memory/curriculum/ecom-team-training-v1.md`
- Mira protocol: `~/.claude/skills/mira/curriculum-extraction-protocol.md`
- Plan: `~/.claude/plans/so-we-have-to-dynamic-shell.md` Phase 2
