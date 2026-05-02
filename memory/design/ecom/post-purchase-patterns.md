
---

## Curriculum v1 — Session 3 Patches (2026-04-27)

**Source:** ELI-011 · changelog: `~/.claude/memory/training/cycle-ecom-v1-session-3-changelog.md`

### Confirmation Page Zone Order (ELI-011)
**Mandatory zone hierarchy:**
1. **Order details** (FIRST) — order number, ETA, items list. Reduces 'did it work?' anxiety.
2. **Upsell module** (SECOND) — uses 30-min one-click eligibility window (CAT-006 + ecom-cro mechanics).
3. **Account creation prompt + referral CTA** (THIRD) — lower-priority retention asks.

**Anti-patterns:**
- Upsell first (feels pushy + hides order info, increases support tickets)
- Account creation first (high-friction first ask, increases bounce)
- Brand celebration first (feels self-indulgent before info delivered)

**Tone:** confirmation header confident-warm ("Order confirmed!" / "You're all set, {{firstName}}.") not generic ("Thank you for your order.")
