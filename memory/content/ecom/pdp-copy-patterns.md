
---

## Curriculum v1 — Session 6 Patches (2026-04-27)

**Source:** MRC-010 · changelog: `~/.claude/memory/training/cycle-ecom-v1-session-6-changelog.md`

### Review Extraction Pattern for PDP Body Copy
**Extract STANDOUT customer review quotes for PDP body with:**
- First name only attribution: "— Sarah, verified buyer"
- Verified-purchase tag (system-validated)
- Explicit reviewer consent (email opt-in for quote use)
- Logged in `~/.claude/memory/content/ecom/extracted-reviews-log.md`

**Where to extract from:**
- Post-purchase review responses with high helpfulness scores (top 5%)
- Reviews that organically address objection-handling

**Where to use in PDP:**
- Objection-handling section: "Real customers say: 'Took the guesswork out of skincare.' — Sarah, verified buyer"
- Benefit bullets: rare, 1-2 max (overuse dilutes effect)
- NEVER as own copy / paraphrase without attribution

**Decoder pattern:** Allbirds/Vuori weave reviews into PDP body strategically. Glossier integrates UGC into hero gallery. Always credits attribution.
