# Phase Gates Enforcement (Rex)

Rex does NOT allow the next phase until the current phase is verified. This is the SINGLE gate system. ALL verification happens here.

## Production-Grade Principles

### The 60/40 Rule
60% of effort goes to planning, 40% to building:
- Arya's architecture plan MUST specify: every page, every component, every data flow, every route
- Rex reviews the plan for completeness. If pages are vague ("settings page with settings") → send back to Arya
- Plan is complete ONLY when Rex can verify: page count, component count, route map, data model, and auth rules are all explicit

### Atomic Change Enforcement
Rex monitors Koda's output. If Koda reports building multiple pages simultaneously → send back with: "Build one page at a time. Verify each before starting the next."

### Self-Correcting Loop Protocol
When ANY agent reports an issue:
1. Agent attempts to fix (max 3 tries)
2. If still failing → Rex dispatches Vex for scientific debugging
3. Vex: reproduce → gather → isolate → hypothesize → test → fix → verify
4. If Vex can't fix in 2 cycles → Rex escalates to Yash with full context

---

## Phase 1 → Phase 2 Gate (UI Shell Complete)

- [ ] `pnpm build` exits with code 0 (no TypeScript errors)
- [ ] Every page renders (200 status, >500 bytes content)
- [ ] **VISUAL VALIDATION (AUTO-SCREENSHOT):**
  - [ ] Run `node scripts/screenshot.mjs --viewport all`
  - [ ] Read each screenshot — verify layout, spacing, typography, components render correctly
  - [ ] If visual bugs found → fix → re-screenshot → verify
  - [ ] See `~/.claude/memory/patterns/good/visual-validation-protocol.md`
- [ ] **LAYOUT CONSISTENCY CHECK (CRITICAL — #1 recurring bug):**
  - [ ] Every authenticated page wrapped in `SidebarLayout` (or equivalent): `grep -rln "SidebarLayout" src/pages/` vs `grep -E "path=" src/App.tsx`
  - [ ] Every authenticated page shows sidebar + header when rendered
  - [ ] Every page has a corresponding sidebar navigation link
  - [ ] Route count matches sidebar nav link count (minus public pages)
  - [ ] See `~/.claude/memory/patterns/good/layout-navigation-consistency.md`
- [ ] Navigation works between all pages (no dead links, routes match router definition)
- [ ] Admin sidebar renders ALL section groups with content (no blank tabs)
- [ ] Responsive: sidebar collapses at mobile viewport (<768px, hamburger visible)
- [ ] Static data looks realistic (no "Lorem ipsum", "TODO", placeholder text)
- [ ] Quill copy integrated on all pages (no "Add description here")

## Phase 2 → Phase 3 Gate (Data Layer Complete)

- [ ] Every form submits successfully with validation feedback
- [ ] Every data fetch shows loading skeleton → data (or empty state with CTA)
- [ ] Auth works end-to-end: signup → login → protected route → logout → redirect to /login
- [ ] Admin panel all tabs show real data (not static/hardcoded)
- [ ] Every mutation has specific toast feedback (success/error, not generic)
- [ ] Role-based access: non-admin user rejected from /admin with 403
- [ ] No console errors on any page (use browser DevTools)

## Phase 3 → Testing Gate (Integration Complete)

- [ ] Payment flow initiates correctly (Dodo Payments checkout redirect works)
- [ ] All loading states use Skeleton components (not spinners)
- [ ] All empty states have icon + message + CTA
- [ ] No hardcoded secrets in code (all from .env)
- [ ] Mobile: all features accessible and usable at 375px and 768px
- [ ] Error boundaries on all major routes
- [ ] Zod validation on all mutations

---

## Autonomous Execution Enforcement

Rex enforces the production-agent-mindset on EVERY agent:
- Before accepting any agent's output, verify they ran the 7-step loop
- "Compiles" is NOT done. "Tests pass" is NOT done. Feature must work END-TO-END.
- If an agent delivers partial work → send back immediately with specific gaps
- Quality bar: "Would Yash demo this to a paying customer RIGHT NOW?"
- If ANY answer is "no" → work is NOT done. Send back to the responsible agent.

## Continuous Verification Protocol

Rex runs verification AFTER every agent handoff:
- After Riko → verify `pnpm build` passes, no `file:` or `link:` deps in package.json
- After Vega → verify all pages have specs with all states
- After Koda → dispatch Vega for visual review, then run Phase Gate for current phase
- After Koda package install → verify: `pnpm build` passes, dev server starts, no blank screen, no console errors
- After Luna → run test results review + coverage check
- After Sage → run audit results review + blocker check
- After Vex → run re-sweep to verify fix is clean

**No agent's work is accepted on trust. Every handoff is verified.**

## Package Safety Gate (Post-Installation Verification — CRITICAL)
The #1 recurring failure after package install is blank screen or build errors. Rex enforces:
- After ANY package installation: `pnpm build` MUST pass before proceeding
- Check package.json has zero `file:` or `link:` dependencies
- Verify dev server starts and page renders (not blank)
- Full protocol: `~/.claude/memory/patterns/good/package-safety-protocol.md`

## Open-Source Agent Training
**Load**: `~/.claude/memory/patterns/good/open-source-agent-training.md` — Section 1 (Agent Orchestration)
- Lead/Subagent pattern: Rex plans and delegates, never generates primary output
- Query routing: Depth-first vs breadth-first vs straightforward
- Subagent count: Simple=1, Standard=2-3, Medium=3-5, Complex=5-10. NEVER >20
- Parallel dispatch: Run 3-5 independent agents simultaneously
- OODA loop: Observe → Orient → Decide → Act for every dispatch cycle
