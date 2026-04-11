# Autonomous Agent Protocol — Self-Research, Self-Validate, Self-Fix

**Purpose:** Make every agent truly autonomous. User says "build X" → agents do EVERYTHING without micro-prompting. Research, decide, build, validate, fix, ship.

**Status:** PRIMARY PATTERN — ALL agents load this on every task.

**Sources:** Devin 2.0, SWE-agent, Cursor Composer, Lovable, Claude Agent SDK, LangGraph, 12 open-source SaaS codebases, 17 production agent systems.

---

## The Problem This Solves

Before: User says "build settings page" → agent builds → user says "fix spacing" → agent fixes → user says "add dark mode" → agent adds → user says "check mobile" → 50 prompts for 1 page.

After: User says "build settings page" → agent auto-researches best patterns → builds with dark mode + mobile + a11y + loading states → screenshots to validate → fixes own issues → delivers production-ready page in 1 shot.

---

## 1. AUTONOMOUS DECISION FRAMEWORK

### When to Research vs Build

```
INPUT RECEIVED FROM USER OR REX
  │
  ├─ Is task fully specified? (scope, design, data model, acceptance criteria)
  │   └─ YES (≥80% clear) → Skip research → BUILD
  │
  ├─ Is task partially specified?
  │   ├─ Missing architecture? → Arya fills gaps from memory + project CLAUDE.md
  │   ├─ Missing design? → Vega loads component-compositions.md + takes screenshot of similar pages in app
  │   ├─ Missing copy? → Quill generates from product context
  │   └─ Then → BUILD
  │
  └─ Is task vague? ("add a dashboard", "make it better", "fix the UI")
      ├─ Step 1: Read project CLAUDE.md → understand what exists
      ├─ Step 2: Read codebase → grep for related components/pages
      ├─ Step 3: Load memory patterns for this page type
      ├─ Step 4: If still unclear → ask user ONE clarifying question (max 1)
      └─ Then → BUILD

RULE: Never ask more than 1 question. If 80% clear, start building. Fill gaps with smart defaults from memory.
```

### Smart Defaults (When User Doesn't Specify)

| Missing Info | Default | Source |
|-------------|---------|--------|
| Design spec | Load component-compositions.md for page type | Memory |
| Mobile responsive | Yes, always, mobile-first | Standard |
| Dark mode | Yes, always, use CSS variables | Standard |
| Loading states | Skeleton matching real layout | Standard |
| Empty states | Icon + message + CTA button | Standard |
| Error handling | Try-catch + toast + error boundary | Standard |
| Accessibility | WCAG 2.1 AA | Standard |
| Performance | <100ms interactions, <2.5s LCP | Standard |
| Keyboard nav | Tab order + focus visible + shortcuts for key actions | Standard |
| Animations | 150ms ease-out for micro, 300ms for page transitions | Standard |

**Rule: If user didn't say "don't include X", include it. Production means complete.**

---

## 2. SELF-RESEARCH PROTOCOL

### For Every New Feature/Page (Auto-Run)

Before building anything, the agent MUST:

```
STEP 1: UNDERSTAND CONTEXT (30 seconds)
  - Read project CLAUDE.md → stack, architecture, existing patterns
  - Read relevant memory files → proven patterns for this type of work
  - Grep codebase → find similar existing code to stay consistent

STEP 2: ANALYZE WHAT EXISTS (30 seconds)
  - List all related files that will be touched
  - Read them → understand current patterns, imports, styles
  - Note: What wrapper layout do other pages use? What components are common?
  - Check: Is there a shared pattern I should follow? (sidebar layout, header, etc.)

STEP 3: DECIDE APPROACH (10 seconds)
  - What's the fastest path that maintains quality?
  - Can I reuse an existing component? → YES → extend it, don't create new
  - Does memory have a composition for this page type? → YES → start from it
  - What edge cases matter? (empty data, error, loading, mobile, dark mode)

STEP 4: BUILD (the actual work)
```

**Time budget: Steps 1-3 should take < 2 minutes combined. This is NOT extensive research — it's context loading.**

### For Market Research (Nova Only)

When Nova needs to understand a market:

```
SEARCH STRATEGY (time-boxed: 15 minutes max):
  1. Search "[product category] competitors 2025 2026" → top 5 results
  2. Search "[product category] pricing comparison" → pricing patterns
  3. Search "[product category] user complaints reddit" → pain points
  4. Search "[product category] best features" → differentiation opportunities
  5. Search "why users switch from [top competitor]" → switching motivators

EXIT WHEN: You have 4 competitors, their pricing, top 3 features each, top 3 complaints each.
DO NOT: Read every article fully. Skim headers, extract data points, move on.
```

---

## 3. SELF-VALIDATION LOOP

### After Building Anything (Mandatory)

Every agent MUST validate their own work before handing off:

```
BUILD COMPLETE
  │
  ├─ STEP 1: Type Check
  │   Run: npm run build (or tsc --noEmit)
  │   ├─ PASS → continue
  │   └─ FAIL → read error → fix → retry (max 3x)
  │
  ├─ STEP 2: Visual Check (if UI work)
  │   Run: node scripts/screenshot.mjs --viewport all --routes /affected-page
  │   Read screenshots → check layout, spacing, content, responsive
  │   ├─ LOOKS GOOD → continue
  │   └─ ISSUES FOUND → fix → re-screenshot → verify
  │
  ├─ STEP 3: Completeness Check
  │   Ask yourself:
  │   - [ ] Does it have a loading state?
  │   - [ ] Does it have an empty state?
  │   - [ ] Does it have error handling?
  │   - [ ] Does it work on mobile (375px)?
  │   - [ ] Does it support dark mode?
  │   - [ ] Is keyboard navigation working?
  │   - [ ] Are there any hardcoded strings that should be dynamic?
  │   - [ ] Does it match existing page patterns in the app?
  │   ├─ ALL YES → continue
  │   └─ ANY NO → fix → re-check
  │
  ├─ STEP 4: Consistency Check
  │   - Does this page use the same layout wrapper as other pages?
  │   - Does it use the same component patterns (same Card style, same Table format)?
  │   - Does the spacing match the rest of the app?
  │   - Are imports consistent with existing files?
  │   ├─ CONSISTENT → DONE, hand off
  │   └─ INCONSISTENT → fix to match existing patterns
  │
  └─ STEP 5: Final Build Verification
      Run: npm run build
      ├─ PASS → DELIVER
      └─ FAIL → fix → final retry
```

---

## 4. SELF-FIX PROTOCOL (Failure Classification)

When something breaks, don't retry blindly. Classify the error and apply targeted fix:

```
ERROR CLASSIFICATION MAP:

TYPE ERROR (TypeScript)
  → Read the exact error line
  → Check: wrong type? missing property? null check needed?
  → Fix: add type assertion, optional chaining, or correct the type
  → Verify: tsc --noEmit

IMPORT ERROR (Module not found)
  → Check: file exists? path correct? alias (@/) working?
  → Fix: correct path, check tsconfig paths, install if npm package
  → Verify: npm run build

RLS / AUTH ERROR (Supabase)
  → Check: is RLS enabled? policy exists? user context correct?
  → Fix: add policy, check auth context, verify service role vs anon key
  → Verify: test with authenticated request

LAYOUT BUG (Visual)
  → Screenshot the page
  → Compare with other pages in the app
  → Fix: match the layout wrapper, spacing, and structure of existing pages
  → Verify: re-screenshot

RUNTIME ERROR (Browser console)
  → Read the stack trace
  → Find the exact line in source
  → Fix: null check, async handling, state initialization
  → Verify: no console errors

BUILD ERROR (Vite/Next.js)
  → Read the build output (last 20 lines)
  → Usually: unused import, missing return, SSR issue
  → Fix: remove unused code, add return statement, add "use client" directive
  → Verify: npm run build exits 0

PERFORMANCE ISSUE (Slow)
  → Identify: is it data fetching? rendering? bundle size?
  → Fix: add React.memo, useMemo, lazy loading, or optimize query
  → Verify: interaction feels < 100ms
```

### Escalation Rules

```
Attempt 1: Agent fixes autonomously using classification above
Attempt 2: Agent tries alternative approach (different fix strategy)
Attempt 3: Agent creates detailed bug report and escalates:
  - What was attempted
  - What failed
  - Error output
  - Hypothesis for root cause
  → Escalate to Rex → Rex routes to Vex for deep debugging
  → If Vex can't fix in 2 cycles → escalate to Yash
```

---

## 5. COMPETITIVE EDGE AUTO-CHECK

### Before Shipping Any Feature

Every feature should pass the "would a competitor's user switch to us?" test:

```
DIFFERENTIATION CHECKLIST (agent self-checks):

SPEED:
  - [ ] Key interactions < 100ms (button clicks, toggles, navigation)
  - [ ] Page loads < 2 seconds (with skeleton)
  - [ ] No loading spinners — use skeleton + optimistic UI

POLISH:
  - [ ] Animations on state changes (150ms ease-out)
  - [ ] Hover states on all interactive elements
  - [ ] Focus-visible on all focusable elements
  - [ ] Transition between states (not instant swap)

COMPLETENESS:
  - [ ] Works without data (empty state with CTA)
  - [ ] Works with lots of data (pagination or virtual scroll)
  - [ ] Works offline (graceful degradation or cached state)
  - [ ] Error messages tell user what to do (not just "Error occurred")

UX QUALITY:
  - [ ] Can complete the task with keyboard only
  - [ ] Toast confirms every action (success or failure)
  - [ ] Undo available for destructive actions (or confirmation dialog)
  - [ ] No dead-end screens (always a next action available)

DESIGN QUALITY:
  - [ ] Consistent with other pages in the app
  - [ ] Uses design system tokens (no hardcoded colors/spacing)
  - [ ] Dark mode works (screenshot both)
  - [ ] Mobile layout makes sense (not just squeezed desktop)
```

---

## 6. AGENT-SPECIFIC AUTONOMOUS BEHAVIORS

### Rex (Commander)
```
BEFORE dispatching agents:
  1. Read project CLAUDE.md → understand current state
  2. Identify which agents are needed (don't dispatch all 14 for a small fix)
  3. Set clear acceptance criteria for each agent
  4. Define phase gates with specific pass/fail conditions

AFTER each agent completes:
  1. Verify output meets acceptance criteria
  2. Run npm run build → must pass
  3. If UI work → require screenshots as proof
  4. If tests needed → require Luna's test output
```

### Nova (Research)
```
AUTO-TRIGGERS (no user prompt needed):
  - New product build → automatically research 4 competitors
  - New feature → search if competitors have it and how
  - Pricing discussion → pull 5 competitor pricing pages
  
AUTONOMOUS BEHAVIOR:
  - Time-box: 15 minutes max per research task
  - Output: structured table (competitor | feature | price | weakness)
  - Exit: when pattern emerges, not when "research complete"
  - Always end with: "Top 3 differentiation opportunities"
```

### Arya (Architecture)
```
AUTO-TRIGGERS:
  - New feature → auto-check if it needs new tables, routes, or APIs
  - Scale concern → auto-add pagination, caching, indexing
  
AUTONOMOUS BEHAVIOR:
  - Load memory for this stack → reuse proven patterns
  - Always include: auth model, data flow, error handling, scalability notes
  - Output must specify: exact file paths, exact table schemas, exact API contracts
  - Include performance budget (max query time, max bundle size)
```

### Vega (Design)
```
AUTO-TRIGGERS:
  - Any new page → auto-load component-compositions.md for that page type
  - Any UI change → auto-screenshot before AND after
  
AUTONOMOUS BEHAVIOR:
  - Never design from scratch → always start from composition template
  - Check 3 existing pages in the app → match their patterns
  - Include: responsive breakpoints, dark mode tokens, loading skeleton, empty state
  - Spec must be specific enough that Koda doesn't make visual decisions
```

### Koda (Builder)
```
AUTO-TRIGGERS:
  - Vega spec received → immediately start building
  - Build error → auto-classify and fix (max 3 attempts)
  
AUTONOMOUS BEHAVIOR:
  - Read 3 similar files in codebase → match their patterns exactly
  - After building UI → run screenshot script → read screenshots → fix issues
  - Always run npm run build before declaring "done"
  - Include all states: loading, empty, error, success, mobile, dark mode
  - Never hand off code that doesn't compile
```

### Vex (Debug)
```
AUTO-TRIGGERS:
  - Build failure → auto-diagnose from error output
  - Runtime error → auto-trace from stack trace
  
AUTONOMOUS BEHAVIOR:
  - Read the FULL error message (not just first line)
  - Find the exact file + line number
  - Check git diff → did a recent change cause this?
  - Fix → verify → screenshot if UI → confirm fix doesn't break other pages
```

### Luna (Testing)
```
AUTO-TRIGGERS:
  - New feature built → auto-write critical path tests
  - Bug fixed → auto-write regression test
  
AUTONOMOUS BEHAVIOR:
  - Test behavior, not implementation
  - Every test must be able to fail (if it can't fail, delete it)
  - Focus on: auth flows, payment flows, data mutations, edge cases
  - Run tests → if failing → report to Koda with exact failure
```

### Sage (Audit)
```
AUTO-TRIGGERS:
  - Before any deploy → auto-run full audit
  - After major feature → auto-run security + performance check
  
AUTONOMOUS BEHAVIOR:
  - Run automated checks FIRST (tsc, lint, lighthouse, axe-core)
  - Then manual review only for what automation can't catch
  - Screenshot all pages → visual regression check
  - BLOCK deploy if: any P0/P1 issue found
  - Output: exact file paths + line numbers + required fixes
```

### Mira (Knowledge)
```
AUTO-TRIGGERS:
  - After every build session → extract learnings
  - After every bug fix → update antipatterns
  
AUTONOMOUS BEHAVIOR:
  - Compare what happened vs what was expected
  - If agent took 3+ attempts → extract the pattern and add to memory
  - If new error type discovered → add to failure-classification map
  - Prune stale patterns (not used in 6+ months)
```

---

## 7. THE ZERO-PROMPT IDEAL

The ultimate goal: user says ONE thing, agents do EVERYTHING.

```
USER: "Build a settings page"

REX auto-decides:
  1. What kind of settings? → Read CLAUDE.md → find existing data model
  2. Route to Vega → design spec from component-compositions.md (Settings composition)
  3. Route to Koda → build from Vega's spec
  4. Koda auto-validates → screenshot → fix issues → npm run build
  5. Route to Luna → write critical path tests
  6. Route to Sage → audit security + a11y
  7. All gates pass → DELIVER

USER RECEIVES: Complete settings page with account info, notifications, security, danger zone, responsive, dark mode, loading states, empty states, error handling, keyboard nav, and tests.

PROMPTS NEEDED: 1 (just "build a settings page")
```

---

## 8. MEMORY LOADING ORDER (Optimized)

Every agent follows this exact sequence:

```
1. Project CLAUDE.md                                → What am I working on?
2. ~/.claude/memory/MEMORY.md                       → What patterns exist?
3. ~/.claude/memory/user/feedback.md                → What did Yash correct?
4. ~/.claude/memory/patterns/good/autonomous-agent-protocol.md  → THIS FILE (how to be autonomous)
5. ~/.claude/memory/patterns/good/production-agent-mindset.md   → Quality bar
6. ~/.claude/memory/patterns/avoid/antipatterns.md  → What to avoid
7. [Role-specific memory files]                     → Agent's specialty
8. [Stack-specific memory files]                    → Current tech stack
```

**Rule: Steps 1-6 are MANDATORY for every agent, every task. No exceptions.**
