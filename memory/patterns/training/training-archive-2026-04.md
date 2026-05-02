# Rex Training Archive — April 2026

Historical training changelogs. Live rules live in `rex.md` + the extracted patterns files. This file is reference material for understanding why rules exist.

---

## 2026-04-10 — Handoff Protocol Update + Stack B + Design-Vision Flow

### Standardized Handoff Files
All agents now use `.handoffs/` directory:

```
Rex → Nova:     .handoffs/rex-to-nova.md
Nova → Arya:    .handoffs/nova-to-arya.md
Arya → Vega:    .handoffs/arya-to-vega.md (+ design-vision.md)
Arya → Riko:    .handoffs/arya-to-riko.md
Arya → Koda:    .handoffs/arya-to-koda.md
Koda → Luna:    .handoffs/koda-to-luna.md
Luna → Rex:     .handoffs/luna-to-rex.md
Koda → Sage:    .handoffs/koda-to-sage.md
Sage → Vex:     .handoffs/sage-to-vex.md
Vex → Sage:     .handoffs/vex-to-sage.md
Bolt → Hawk:    .handoffs/bolt-to-hawk.md
Any → Mira:     .handoffs/*-to-mira-feedback.md
```

Rex reads handoff file before dispatching next agent.

### Design-Vision Flow (Mandatory for Mode A)
1. Nova researches competitors INCLUDING visual analysis (colors, style, patterns)
2. Arya creates design-vision.md using Nova's color research
3. Riko scaffolds project WITH design-vision.md in root
4. Vega reviews/refines design-vision.md before Koda starts
5. Koda reads design-vision.md before building ANY UI
6. Sage audits: UI matches design-vision? Colors correct? Dark mode works?

If any step skipped → Rex flags + sends back.

### Stack B Update
- NEW Shopify apps: React Router 7 template + Polaris Web Components
- Existing apps (Pinzo): Remix + Polaris React v13.9.5
- Detect with: `grep -q "react-router" package.json && echo "React Router 7" || echo "Remix"`

### Auto-Learn Integration
```js
// After every mode completion
await fetch('http://localhost:3847/api/learning/record', {
  method: 'POST',
  body: JSON.stringify({
    agentName: 'rex',
    taskType: mode,
    outcome: { success, duration, tokens, cost, agentsUsed, sprintsCompleted }
  })
});

// Check learning API for routing recs
const routing = await fetch('http://localhost:3847/api/routing/recommend', {
  method: 'POST',
  body: JSON.stringify({ agentName: agentToDispatch, taskDescription: taskDesc })
}).then(r => r.json());
```

Rex records:
- `stack_detected` event with file markers matched
- `migration_refused` event if user asks for legacy on new build
- `deploy_target` event (always `railway` for Stack A)

---

## 2026-04-11 — Universal Protocol Enforcement

Before Rex runs, MUST load:

1. `~/.claude/memory/patterns/good/autonomous-agent-protocol.md` — execution loop, retry, escalation
2. `~/.claude/memory/patterns/good/production-agent-mindset.md` — quality bar, autonomy rules
3. `~/.claude/memory/patterns/good/universal-auto-fix-loop.md` — 3-retry escalation
4. `~/.claude/memory/patterns/good/universal-smart-defaults.md` — no "ask user" friction
5. `~/.claude/memory/patterns/good/validation-gates.md` — hard gates

### Inline Self-Validation
Before declaring work complete:
- [ ] Output format valid — matches artifact template
- [ ] Inputs loaded — all upstream handoffs read (or smart-default applied with log)
- [ ] Memory citations present — every non-trivial claim references `memory/` file
- [ ] Stack A compliance — no forbidden refs (Vercel, Stripe, Prisma, Pages Router)
- [ ] Handoff file written — `.handoffs/rex-to-[next].md` exists
- [ ] Max-word / max-line budget respected
- [ ] Self-check section reviewed

### Auto-Fix Loop (max 3 retries)
```
loop:
  result = execute_task()
  checks = run_self_validation(result)
  if all(checks.passed): return result
  failed = [c for c in checks if not c.passed]
  log("Auto-fix attempt {n}: failed={failed}")
  result = remediate(result, failed)
  n += 1
  if n >= 3: escalate_to_rex(result, failed, full_context); break
```

### Smart Defaults (no "ask user" needed)

| Missing input | Default assumption |
|---------------|-------------------|
| Target market | SMB SaaS (10–500 employees) |
| Pricing model | Usage-based with 3 tiers (Free / Pro $29 / Team $99) |
| Stack | Stack A (Next 16 + Supabase + Railway + Dodo) |
| Auth provider | Supabase Auth (email + magic link + Google OAuth) |
| Billing provider | Dodo Payments (MoR) |
| Hosting | Railway (web + worker + redis) |
| Monitoring | Sentry + PostHog + BetterStack |
| Design system | shadcn/ui + Tailwind 4 + Geist font |
| Timezone | UTC in storage, America/Los_Angeles in UI |
| Brand voice | Confident / concise / zero-jargon |

### Escalation Triggers
- Auto-fix loop hit 3 retries without passing gates
- Smart default would introduce a forbidden pattern
- Required upstream handoff missing AND smart default unsafe
- Confidence score on output < 0.6

### First-Output Quality Anchor
First response to any new task MUST match gold-standard artifact template. No exploratory "rough draft" — the first output IS the deliverable. If Rex can't hit template on first try, route to auto-fix loop before emitting.

---

## 2026-04-11 (b) — Class Caps + Executable Loop

### Mandatory loads before routing
1. `~/.claude/memory/patterns/good/executable-auto-fix-loop.md` — class caps, cost breakers, escalation JSON, git autonomy
2. `~/.claude/memory/patterns/good/executable-validation-gates.md` — runnable bash gates
3. `~/.claude/memory/user/feedback.md` — corrections

### Never-main rule
Rex never commits to `main` of any product repo. Rex dispatches Koda/Riko to feature branches only. Only memory repo allows direct main commits (via Mira's weekly sweep).

### Stack A / B Routing
- New Boldteq internal SaaS → always Stack A. Never Vercel, never Stripe, never legacy.
- New Shopify app → always Stack B. Never Dodo, never Stripe.
- Ambiguous → one clarifying question to Yash before dispatching.
