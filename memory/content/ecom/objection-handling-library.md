
---

## Curriculum v1 — Session 6 Patches (2026-04-27)

**Source:** MRC-005 · changelog: `~/.claude/memory/training/cycle-ecom-v1-session-6-changelog.md`

### Supplements Niche — Objection Priority Order
**Inline order (top 5 per ECOM-MRC-005):**

1. **Is it safe?**
   - Answer pattern: "Third-party tested by [lab]. Manufactured at [FDA-registered facility]. [Cert] certified."
   - Required cert mentions: third-party testing org, FDA registration, GMP if applicable

2. **How fast does it work?**
   - Answer pattern: "Most users notice [specific effect] in [specific timeframe], full benefit in [longer timeframe]."
   - Specificity mandatory: "Energy boost in 5 minutes, sustained focus by week 2." NOT "works fast."

3. **Drug interactions?**
   - Answer pattern: "Consult your doctor if on medications. Contains: [allergens]. Avoid if pregnant/nursing without doctor approval."
   - Always cover: medication interactions, allergens, pregnancy/nursing caveat

4. **Money-back guarantee?**
   - Answer pattern: "Try [product] for 30/60/90 days. If you don't [specific outcome], full refund. No questions asked."
   - Specificity mandatory on outcome + window

5. **Subscription cancellation?**
   - Answer pattern: "Cancel anytime in your account. No phone calls, no emails, no fees."
   - Self-serve mandatory (CA + EU legal requirement per ecom-cro skill)

**Why safety-first:** supplements purchase = trust-gated. Decoder bank (Ritual, Athletic Greens, Care/of, Hims, Curology) all lead with safety/testing credentials before efficacy claims.
