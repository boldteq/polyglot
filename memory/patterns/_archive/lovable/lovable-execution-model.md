---
name: Lovable-Grade Execution Model
description: Production-grade execution patterns learned from Lovable.dev — the gold standard for AI-built apps. Every agent follows these patterns.
type: standard
priority: highest
---

## Why This File Exists

Lovable.dev builds production-quality apps with zero bugs through a disciplined execution model. We reverse-engineered their patterns and applied them to our 14-agent factory. Every agent MUST read this file and follow these patterns.

## The 10 Lovable Execution Principles

### 1. Plan Before You Build (60/40 Rule)
Spend 60% of time planning, 40% building. Never start coding without a clear plan.

**What Lovable does:** Plan Mode is used for 60-70% of development time. Code is only written when the plan is fully validated.

**What our agents must do:**
- Arya creates detailed plan with page-by-page specs BEFORE Koda writes a line
- Koda reads the full plan and identifies ambiguities BEFORE starting
- Rex validates the plan is complete BEFORE dispatching to Koda
- If plan is vague → stop and clarify, don't guess

**Anti-pattern:** Starting to code with a one-line task description. If the task isn't specific enough to verify, it's not ready to build.

### 2. One Change at a Time (Atomic Changes)
Never implement multiple features simultaneously. Build one thing, verify it works, then build the next.

**What Lovable does:** "Make one meaningful change at a time" — their core principle. Each prompt does one thing.

**What our agents must do:**
- Koda builds ONE component/page at a time, verifies it renders, then moves to the next
- Never build 3 pages in parallel hoping they all work
- After each component: save → build → verify renders → then next component
- After each page: save → build → verify route works → verify layout → then next page

**Atomic Change Protocol:**
```
1. Build component/feature
2. Save files
3. Run: npm run build (must pass)
4. Run: dev server + curl route (must return 200 with content)
5. Verify: component renders correctly
6. IF pass → move to next
7. IF fail → fix immediately before moving on
```

**Anti-pattern:** Building all 10 pages, running build once at the end, and finding 15 errors to debug simultaneously.

### 3. Layout First → Functionality → Polish (Phased Build)
Build in strict phases. Never mix phases.

**What Lovable does:** "Add features in phases—layout first, then functionality, then polish."

**What our agents must do:**
- **Phase 1: Layout & Structure** — HTML structure, component hierarchy, responsive grid, navigation. All static data. Every page renders.
- **Phase 2: Data & Logic** — Replace static data with real queries, add auth, forms submit, mutations work. Every feature functions.
- **Phase 3: Polish & UX** — Animations, transitions, loading states perfect, empty states designed, dark mode, accessibility. Every interaction feels right.

**Phase Gate Rules:**
- Phase 1 is COMPLETE only when every page renders with layout, navigation, and realistic static data
- Phase 2 is COMPLETE only when every feature works end-to-end (data flows from input → DB → display)
- Phase 3 is COMPLETE only when zero UI/UX bugs exist (full sweep clean)
- NEVER skip to Phase 2 while Phase 1 pages don't render
- NEVER skip to Phase 3 while Phase 2 features don't function

### 4. Self-Correcting Loops (Detect → Fix → Verify → Repeat)
Every action has a verification step. If verification fails, fix immediately.

**What Lovable does:** Automated error detection → "Try to Fix" → re-verify. Continuous self-correction cycle.

**What our agents must do:**
```
WHILE (building) {
  make_change()
  result = verify_change()

  IF (result.has_errors) {
    fix_errors()
    result = verify_change()  // verify the fix too

    IF (result.still_has_errors) {
      // Don't keep trying the same approach
      step_back_and_rethink()
      try_different_approach()
    }
  }

  move_to_next_change()
}
```

**Verification after EVERY change:**
- After writing a component → does it compile? (`npm run build`)
- After adding a route → does the page load? (`curl http://localhost:PORT/route`)
- After adding data fetching → does data display? (check page content)
- After adding a form → does submit work? (check mutation + toast)
- After adding auth → does protected route redirect? (check without auth)

**Anti-pattern:** Making 20 changes, then running build, finding errors, and not knowing which change caused them.

### 5. Knowledge File as Persistent Context
Project rules, decisions, and patterns are documented and loaded before every action.

**What Lovable does:** Knowledge File is sent with every prompt. Workspace + Project knowledge layers.

**What our agents must do:**
- CLAUDE.md = our Knowledge File (project-level)
- Memory system = our Workspace knowledge (cross-project patterns)
- Every agent reads CLAUDE.md + relevant memory files BEFORE any work
- New architectural decisions are documented in CLAUDE.md immediately
- Lessons learned go to memory via Mira after every build cycle

**Knowledge Loading Order (Every Agent, Every Task):**
1. CLAUDE.md (project rules — highest priority)
2. ~/.claude/memory/user/feedback.md (Yash's corrections — overrides everything)
3. ~/.claude/memory/patterns/good/lovable-execution-model.md (THIS FILE)
4. ~/.claude/memory/patterns/good/ui-ux-production-standards.md
5. ~/.claude/memory/patterns/avoid/antipatterns.md
6. Stack-specific memory file
7. Feature-specific memory (admin, billing, etc.)

### 6. Validate Between Each Block (Continuous Verification)
Test after each small change, not at the end.

**What Lovable does:** Users validate in Plan mode between each implementation block. Changes are verified before moving on.

**What our agents must do:**
- Koda: build → verify → build → verify (never build-build-build-verify)
- Luna: test each feature immediately after Koda builds it (not all at once)
- Sage: audit incrementally as features are added (not one massive audit at the end)
- Rex: check progress after each agent handoff (not wait until the final report)

**Continuous Verification Schedule:**
| After This | Run This Verification |
|------------|----------------------|
| Every file save | `npm run build` (must compile) |
| Every new component | Does it render without errors? |
| Every new page | Does the route return 200? Is layout consistent? |
| Every form | Does submit work? Does validation show errors? |
| Every data fetch | Does loading state show? Does data display? Does empty state work? |
| Every mutation | Does toast appear? Does data refresh? |
| Every auth change | Does protected route redirect? Does login work? |

### 7. Trace Data Flow End-to-End
Follow data from user input through the app to the database and back. Verify each step.

**What Lovable does:** "Trace data from user input through the app to the database and back, ensuring each step validates and transforms data correctly."

**What our agents must do:**
For every feature, explicitly map the data flow:
```
User Action → UI Component → Form Validation (Zod) → API/Edge Function → Auth Check → DB Query → Response → React Query Cache → UI Update → Toast Feedback
```

**Verify each step:**
1. User can trigger the action (button exists, is clickable)
2. Input is validated (Zod schema catches bad data)
3. API receives the request (edge function invoked)
4. Auth is checked (unauthorized returns 401)
5. Database operation succeeds (data saved/updated/deleted)
6. Response returns correct data
7. UI updates to reflect the change (cache invalidated)
8. User sees feedback (toast notification)

**Anti-pattern:** Building a form that renders but doesn't submit, or submits but doesn't show feedback, or shows feedback but didn't actually save.

### 8. Scientific Debugging (Not Random Changes)
When something breaks, follow a systematic process.

**What Lovable does:** "Adopt a scientific debugging methodology rather than making random changes."

**What our agents must do:**
```
1. REPRODUCE: What exactly is broken? Can I trigger it consistently?
2. GATHER: Console errors, network responses, component state, DB state
3. ISOLATE: Is it frontend? Backend? Database? Auth? Which component?
4. HYPOTHESIZE: List 2-3 possible causes
5. TEST: Test each hypothesis systematically
6. FIX: Apply the minimal fix for the confirmed root cause
7. VERIFY: Does the fix work? Did it break anything else?
8. DOCUMENT: What was the bug? What caused it? How was it fixed?
```

**Anti-pattern:** Changing 5 things at once hoping one of them fixes the bug. Or adding try-catch to suppress the error instead of fixing the root cause.

### 9. Component Reuse (Don't Duplicate)
Build reusable components once, use them everywhere. Never duplicate logic.

**What Lovable does:** "Reuse existing components instead of duplicating logic."

**What our agents must do:**
- Before building any component, check if a similar one already exists
- Create shared components for repeated patterns:
  - `PageHeader` — used on every page (title + description + actions)
  - `DataTable` — used everywhere lists/tables appear
  - `EmptyState` — used on every data view when empty
  - `MetricCard` — used on every dashboard
  - `ConfirmDialog` — used for every destructive action
  - `LoadingSkeleton` — page-specific skeletons matching layout
- If a component is used in 2+ places, extract it to `src/components/shared/`

**Anti-pattern:** Building a slightly different table component for every page, or copy-pasting a card layout with minor changes.

### 10. Mobile-First, Responsive-Always
Start with the smallest screen, scale up. Never add responsive as an afterthought.

**What Lovable does:** "All designs should be completely responsive at every breakpoint, adopting a mobile-first strategy."

**What our agents must do:**
- Write mobile styles first (default Tailwind classes)
- Add tablet breakpoints (md:)
- Add desktop breakpoints (lg:)
- Test at 4 viewports: 375px, 768px, 1024px, 1440px
- Sidebar: hidden on mobile → collapsible on tablet → visible on desktop
- Grids: 1 col mobile → 2 col tablet → 3-4 col desktop
- Tables: card layout mobile → horizontal scroll tablet → full table desktop

**Anti-pattern:** Building desktop-first and then trying to "make it responsive" at the end — leads to cramped mobile layouts and broken overflow.

---

## The Lovable Build Cycle (How Every Feature Gets Built)

```
┌─────────────────────────────────────────────┐
│  1. PLAN (Arya)                             │
│     - Define exactly what to build          │
│     - Specify components, data flow, routes │
│     - Identify reusable components          │
│     - Map responsive breakpoints            │
│     - Rex validates plan completeness       │
├─────────────────────────────────────────────┤
│  2. BUILD LAYOUT (Koda Phase 1)             │
│     - One page at a time                    │
│     - Static data, full visual design       │
│     - Verify each page renders              │
│     - Verify navigation works               │
│     - Verify responsive at all breakpoints  │
│     - Rex validates: all pages render       │
├─────────────────────────────────────────────┤
│  3. BUILD LOGIC (Koda Phase 2)              │
│     - One feature at a time                 │
│     - Wire data, auth, forms                │
│     - Verify each feature end-to-end        │
│     - Trace data flow for each feature      │
│     - Rex validates: all features work      │
├─────────────────────────────────────────────┤
│  4. BUG SWEEP (Rex → Vex/Koda)             │
│     - Automated code-level sweep            │
│     - Fix all issues found                  │
│     - Re-sweep until clean                  │
│     - Rex validates: zero bugs              │
├─────────────────────────────────────────────┤
│  5. POLISH (Koda Phase 3)                   │
│     - Animations, transitions               │
│     - Loading states perfect                │
│     - Empty states designed                 │
│     - Toast messages specific               │
│     - Dark mode (if applicable)             │
│     - Rex validates: premium feel           │
├─────────────────────────────────────────────┤
│  6. TEST (Luna)                             │
│     - Navigation tests first                │
│     - UI/UX micro-bug tests                 │
│     - Feature-specific tests                │
│     - Responsive tests                      │
│     - Any failure → back to Koda            │
├─────────────────────────────────────────────┤
│  7. AUDIT (Sage)                            │
│     - Security, performance, a11y           │
│     - Layout consistency                    │
│     - Code quality                          │
│     - Any blocker → back to Koda            │
├─────────────────────────────────────────────┤
│  8. SHIP (Bolt)                             │
│     - Only after Luna + Sage pass           │
│     - Smoke test in production              │
│     - Monitor for 24h (Hawk)                │
├─────────────────────────────────────────────┤
│  9. LEARN (Mira)                            │
│     - Extract patterns                      │
│     - Update memory                         │
│     - Log agent performance                 │
└─────────────────────────────────────────────┘
```

---

## Quality Comparison: Lovable vs Our Factory

| Quality Dimension | Lovable | Our Factory (Target) |
|-------------------|---------|---------------------|
| Build approach | One change at a time, verified | Atomic changes + self-correcting loops |
| Planning | 60-70% in Plan mode | Arya full spec + Rex validation |
| Bug prevention | Auto-detect + "Try to Fix" | 3-layer sweep (Koda + Rex gate + Luna/Vex) |
| Code quality | Clean TypeScript, no any | TypeScript strict, zero any |
| UI consistency | shadcn/ui + Tailwind + theme | shadcn/ui + theme tokens + reference library |
| Responsive | Mobile-first always | Mobile-first + 4 viewport testing |
| Data validation | Traced end-to-end | Zod schemas + data flow mapping |
| Error handling | User-friendly messages | Specific toasts + inline errors + retry |
| Knowledge persistence | Knowledge File per project | CLAUDE.md + memory system |
| Debugging | Scientific methodology | Reproduce → isolate → hypothesize → test |

---

## Agent-Specific Lovable Rules

### Koda (Builder)
- Build ONE component at a time, verify after each
- Never make more than 3 file changes without running `npm run build`
- After every page: verify layout, navigation, responsive
- After every feature: trace data flow end-to-end
- Reuse components — check if similar exists before building new

### Luna (Tester)
- Test each feature as it's built, not all at end
- Run navigation tests FIRST (if nav is broken, nothing else matters)
- Zero tolerance: any missing loading/empty/error state = FAIL
- Test at 4 viewports for every page

### Vex (Bug Fixer)
- Scientific debugging: reproduce → gather → isolate → hypothesize → test → fix → verify
- Never make random changes hoping they fix the bug
- Self-healing loop: sweep → fix → re-sweep until zero bugs
- Fix root cause, not symptoms

### Sage (Auditor)
- Validate layout consistency across ALL pages before anything else
- Block deploy if any authenticated page missing navigation
- Verify data flows end-to-end for every critical path
- Check responsive at all 4 breakpoints

### Rex (Orchestrator)
- Validate plan is complete before dispatching to Koda (60/40 rule)
- Run bug-sweep gate between every agent handoff
- Enforce atomic changes — send back if too many changes at once
- Verify phase completion before allowing next phase

---

*(This is the Boldteq Software Factory execution standard. Every agent loads this file. Updated by Mira after each build cycle.)*
