# Boldteq Software Factory — Inter-Agent Handoff Protocol

This document defines how the 14-agent system passes work between agents. Every handoff follows a standard format and includes quality gates to prevent rework.

---

## Standard Handoff Format

Every agent passes work to the next agent using this template:

```markdown
# Handoff: [FROM] → [TO]

**Date:** YYYY-MM-DD | **Project:** [project-name] | **Mode:** [A/B/C/D/E]

## Summary
[1-2 paragraph overview of what was completed and why it matters to the next agent]

## What Was Done
- [ ] [Deliverable 1]
- [ ] [Deliverable 2]
- [ ] [Deliverable 3]

## Files Created / Modified
- **New:** `path/to/file` (lines: X)
- **Modified:** `path/to/file` (diff: link or brief description)
- **Deleted:** `path/to/file` (reason)

## Key Context for Next Agent
[Technical details, decisions made, constraints, dependencies the next agent MUST know]

## Blockers / Open Questions
- [ ] **Blocker 1:** [description] → [Owner / Next step]
- [ ] **Question 1:** [description] → [Owner / Next step]

## Quality Notes
- Type safety: ✅ | Test coverage: ✅ | Performance: ✅ | Accessibility: ✅
- Breaking changes: None | Backward compatible: Yes | Config needed: No

## Acceptance Criteria for Next Agent
- [ ] All deliverables in "What Was Done" are complete
- [ ] No type errors (`npm run build` passes)
- [ ] Critical paths tested or flagged
- [ ] No hardcoded secrets or TODOs left in code
- [ ] All blockers have clear owners / resolution plan

## Next Steps (For Next Agent)
1. [First action]
2. [Second action]
3. [Third action]

---

**Handoff location:** `.handoffs/[from]-to-[to]-[timestamp].md`
**Status:** Ready / Blocked
**Signed off by:** [Agent name]
```

---

## Agent-to-Agent Handoff Details

### 1. Nova → Arya (Mode A: New Build)

**Trigger:** User requests a new product/feature from scratch

**Deliverable Format:**

```markdown
# Handoff: Nova → Arya

## Summary
Market research completed for [product name]. Identified target users, competitor landscape, and positioning. Ready for architecture planning.

## What Was Done
- [ ] Market opportunity sizing (TAM/SAM/SOM)
- [ ] Competitor analysis (3-5 key players, feature matrix)
- [ ] User persona development (2-3 detailed personas)
- [ ] Positioning statement + value proposition
- [ ] Go-to-market strategy outline
- [ ] Risk assessment (market, technical, execution)

## Research Outputs
- `research/market-analysis.md` — market size, growth rate, trends
- `research/competitors.md` — feature comparison matrix, pricing
- `research/personas.md` — 3 detailed user personas with goals/pain points
- `research/positioning.md` — positioning, messaging, pricing model

## Key Context for Arya
- **Primary user segment:** [persona]
- **Core value prop:** [statement]
- **Differentiation:** [vs competitors]
- **Pricing sensitivity:** [high/medium/low]
- **Regulatory constraints:** [if any]
- **Market timeline:** [urgency]

## Blockers
- [ ] Regulatory clarification needed → [Owner]
- [ ] Pricing validation → [Owner]

## Quality Notes
- Persona depth: ✅ | Competitor coverage: ✅ | TAM accuracy: Medium | Risk assessment: ✅

## Acceptance Criteria for Arya
- [ ] Personas include user journey maps
- [ ] Competitor matrix is 5+ players
- [ ] Pricing model is market-validated
- [ ] Risk register has mitigation plans
- [ ] Go-to-market timeline aligns with build schedule

## Next Steps (For Arya)
1. Design data model based on user workflows
2. Define API contracts and architecture
3. Create sprint plan aligned with market timeline
```

**Quality Gate:**
- Research is primary-source validated (not AI-generated assumptions)
- Competitor analysis includes 5+ direct competitors
- Personas have supporting evidence from user interviews or existing data
- Market size estimates have confidence levels noted
- Go-to-market strategy is realistic given build timeline

---

### 2. Arya → Riko (Scaffold Handoff)

**Trigger:** Architecture approved by Yash, ready for project setup

**Deliverable Format:**

```markdown
# Handoff: Arya → Riko

## Summary
Architecture designed for [project]. Data model, API schema, folder structure, and tech stack decisions documented. Ready for scaffold.

## What Was Done
- [ ] Data model designed (ERD, schema, RLS policies)
- [ ] API endpoints defined (OpenAPI spec or table)
- [ ] Folder structure designed (with file count estimates)
- [ ] Tech stack locked (dependencies, versions)
- [ ] Deployment architecture mapped (regions, CDN, etc.)
- [ ] Sprint plan created (features -> sprints)

## Architecture Outputs
- `architecture/data-model.md` — ERD, schema definitions, RLS rules
- `architecture/api-spec.md` — endpoints, payloads, status codes
- `architecture/folder-structure.md` — exact folder layout
- `architecture/tech-stack.md` — locked versions, why each choice
- `architecture/deployment.md` — hosting, CDN, monitoring setup
- `architecture/sprint-plan.md` — features grouped into sprints

## Key Context for Riko
- **Tech stack:** [Stack A/B/C/D] + [customizations]
- **Database:** [Supabase / Prisma / Custom]
- **Deployment target:** [Vercel / Custom / AWS]
- **CI/CD requirements:** [GitHub Actions / Other]
- **Secrets management:** [Env vars, vaults]
- **Infrastructure as Code:** [Terraform / Pulumi / Manual]
- **Initial data seeds:** [Yes / No] → `seed.sql`

## Blockers
- [ ] Yash approval on data model → [Status: Done / Pending]
- [ ] Third-party API agreements → [Owner]

## Quality Notes
- Data model normalization: ✅ | RLS completeness: ✅ | API consistency: ✅ | Folder structure: ✅

## Acceptance Criteria for Riko
- [ ] Data model supports all user workflows
- [ ] API endpoints cover feature scope
- [ ] Folder structure matches chosen stack (Next.js / Vite / Remix)
- [ ] RLS policies are documented for every table
- [ ] Dependencies are pinned to exact versions
- [ ] Deployment architecture is cloud-agnostic (or justified)
- [ ] Sprint 1 scope is clear and achievable in 1 week

## Next Steps (For Riko)
1. Initialize Git repo with chosen stack template
2. Install dependencies
3. Create folder structure per architecture spec
4. Set up ESLint, TypeScript, Tailwind configs
5. Create `.env.example` from secrets list in architecture docs
6. Deploy baseline to staging
```

**Quality Gate:**
- ERD includes all entities from feature list with proper cardinality
- RLS policies define row-level access for multi-tenant scenarios
- API spec includes error responses and edge cases
- Tech stack has justified tradeoffs (not "because it's trendy")
- Sprint plan has story point estimates or T-shirt sizes

---

### 3. Arya → Koda (Sprint Task Handoff)

**Trigger:** Architecture approved, Riko has completed scaffold, Koda ready to build

**Deliverable Format:**

```markdown
# Handoff: Arya → Koda (Sprint X)

## Summary
Sprint [X] scope defined for [project]. Tasks cover [% of feature list]. Koda to implement [feature group] over [X days].

## What Was Done
- [ ] Story breakdown (user stories -> tasks)
- [ ] Acceptance criteria written
- [ ] Design references provided
- [ ] Dependencies mapped (task order)
- [ ] Time estimates assigned (T-shirt / SP)

## Sprint Scope
- **Feature group:** [Feature name]
- **User stories:** [Count]
- **Tasks:** [Count]
- **Estimate:** [e.g., 13 story points, ~1 week]
- **Priority:** [Critical / High / Medium]

## Tasks (In Order)
1. **[Task name]**
   - Acceptance criteria: [List]
   - Design reference: [Link / File]
   - Estimate: [XS / S / M / L]
   - Dependencies: [Task IDs]

2. **[Task name]**
   - Acceptance criteria: [List]
   - Design reference: [Link / File]
   - Estimate: [XS / S / M / L]
   - Dependencies: [Task IDs]

## Design References
- Figma board: [Link]
- Component specs: [File path]
- Data flow diagrams: [File path]

## Key Context for Koda
- **Stack:** [Stack A/B/C/D]
- **Data model context:** [Which tables are involved]
- **API endpoints to consume:** [List from architecture]
- **Component library:** [shadcn-ui / Polaris / custom]
- **Real-time requirements:** [Yes / No]
- **Performance targets:** [LCP, FID, CLS benchmarks]
- **Accessibility requirements:** [WCAG 2.1 AA / Custom]

## Blockers
- [ ] Design not finalized → [Owner, ETA]
- [ ] API endpoint signatures unclear → [Owner, ETA]

## Quality Notes
- Scope clarity: ✅ | Design completeness: ✅ | Estimate confidence: Medium | Dependencies: Clear

## Acceptance Criteria for Koda
- [ ] All acceptance criteria met for each task
- [ ] No TypeScript `any` types
- [ ] Component tree matches design
- [ ] Data flows from API correctly
- [ ] Loading and error states implemented
- [ ] Mobile responsive (if applicable)
- [ ] Accessibility audit passes for new components

## Next Steps (For Koda)
1. Start with [Task 1] (no dependencies)
2. Build [Component name] per design spec
3. Wire to [API endpoint]
4. Implement loading/error states
5. Commit with message: `feat: [Task name] (#XX)`
```

**Quality Gate:**
- Each task has 2-5 acceptance criteria (not vague)
- Design references are up-to-date (not outdated Figma)
- Time estimates have rationale (not pulled from air)
- Task order respects dependencies (can parallelize if stated)
- "Definition of Done" is clear (tests? accessibility? performance?)

---

### 4. Riko → Koda (Bootstrap Handoff)

**Trigger:** Scaffold complete, project ready for implementation

**Deliverable Format:**

```markdown
# Handoff: Riko → Koda

## Summary
Project scaffold complete. Folder structure initialized, dependencies installed, CI/CD configured. Ready for feature implementation.

## What Was Done
- [ ] Git repo initialized with chosen stack
- [ ] Dependencies installed (`npm install` / `yarn install`)
- [ ] Folder structure created per architecture
- [ ] Environment variables documented (`.env.example`)
- [ ] TypeScript, ESLint, Prettier configured
- [ ] Tailwind CSS + component library set up
- [ ] Database migrations baseline created
- [ ] CI/CD pipeline configured
- [ ] Staging environment deployed
- [ ] README updated with setup instructions

## Project Structure Ready
```
project/
├── src/
│   ├── pages/           [PascalCase route files]
│   ├── components/      [PascalCase component files]
│   ├── hooks/           [useHook naming]
│   ├── lib/             [camelCase utilities]
│   └── integrations/    [External service clients]
├── supabase/            [DB, functions, migrations]
├── tests/               [Test files]
├── .env.example         [Template for secrets]
├── tsconfig.json        [TypeScript strict mode: on]
├── eslint.config.js     [Linting rules]
└── vite.config.ts       [Dev server config]
```

## Environment Setup
- **Dev server:** Running on `localhost:8080` (or configured port)
- **Build:** `npm run build` produces zero type errors
- **Tests:** `npm run test` baseline passes (if any seed tests exist)
- **Database:** Connected to Supabase staging
- **Secrets:** All keys in `.env.local` (not in Git)

## Key Context for Koda
- **Stack:** [Next.js 15 / Vite+React / Remix] with [versions]
- **Package manager:** [npm / yarn / pnpm]
- **Database:** Supabase (PostgreSQL) at [staging URL]
- **Auth:** [Supabase Auth / Custom]
- **Deployment:** [Vercel / Custom host]
- **CI/CD:** GitHub Actions → [Staging / Production]
- **Monitoring:** [Sentry / custom] configured
- **Type generation:** Run `npm run db:types` to regenerate auto-types after migrations

## Installed Dependencies
- React 18.3, TypeScript 5.x, Vite 5.x
- Tailwind CSS 3.4, shadcn-ui components
- React Query 5 (server state), React Hook Form (forms)
- Supabase client, Zod (validation)
- [Other stack-specific packages with versions]

## First Build Checklist
- [ ] Clone repo
- [ ] Copy `.env.example` → `.env.local`
- [ ] Fill in Supabase keys, API keys
- [ ] `npm install`
- [ ] `npm run dev` → server starts on port 8080
- [ ] `npm run build` → zero type errors
- [ ] `npm run test` → all tests pass
- [ ] Visit `http://localhost:8080` → landing page loads

## Blockers
- [ ] Database connection unstable → [Owner, ETA]
- [ ] CI/CD pipeline needs adjustments → [Owner, ETA]

## Quality Notes
- Code quality: ✅ | Type safety: ✅ | Dev UX: ✅ | Deployment readiness: ✅

## Acceptance Criteria for Koda
- [ ] Dev server starts without errors
- [ ] Build completes with zero type errors
- [ ] Database connection verified
- [ ] All environment variables documented
- [ ] README includes setup, build, and test commands
- [ ] First feature task is unblocked
- [ ] Staging deployment is accessible

## Next Steps (For Koda)
1. Review `architecture/sprint-plan.md` for Sprint 1 scope
2. Check task dependencies in Arya's handoff
3. Start with first unblocked task
4. Commit frequently: `feat: [task] | fix: [bug] | refactor: [code]`
5. Open PR when task is complete
```

**Quality Gate:**
- Project initializes without errors (`npm install && npm run dev`)
- TypeScript strict mode is enabled
- Folder structure matches architecture spec exactly
- `.env.example` lists every required secret
- README includes setup, build, test, and deploy instructions
- Staging deployment is accessible and functional
- Git history is clean (no merge commits, rebased)

---

### 5. Koda → Quill (Content Handoff)

**Trigger:** Feature components built, structure ready for copy/content

**Deliverable Format:**

```markdown
# Handoff: Koda → Quill

## Summary
[Feature name] components built. Component tree, placeholder text locations, and content requirements documented. Ready for copy.

## What Was Done
- [ ] All components built per design spec
- [ ] Data flows connected (API → UI)
- [ ] Loading and error states implemented
- [ ] Placeholder text in place (marked for replacement)
- [ ] CTA buttons have labels (e.g., "TODO: CTA label")
- [ ] Empty states have placeholder text
- [ ] Forms have placeholder fields
- [ ] Error messages are generic (ready for i18n)

## Component Tree & Content Locations
```
Dashboard (src/pages/Dashboard.tsx)
├── AppHeader
│   ├── Logo text: "TODO: Brand name"
│   ├── CTA button: "TODO: Primary action label"
│   └── User menu: "TODO: Account menu items"
├── JobSidebar
│   ├── Search placeholder: "TODO: Search prompt"
│   ├── Empty state: "TODO: Empty state message"
│   └── Item card title: [Editable via data, text provided]
├── JobDetailView
│   ├── Section header: "TODO: Section title"
│   ├── Input label: "TODO: Input label"
│   ├── Help text: "TODO: Contextual help"
│   ├── Button label: "TODO: Button text"
│   ├── Success message: "TODO: Success toast"
│   └── Error message: "TODO: Error fallback text"
└── Footer
    ├── Links: "TODO: Footer link labels"
    └── Copyright: "TODO: Copyright text"
```

## Content Requirements
- **Tone:** [Friendly / Professional / Energetic / etc.]
- **Voice:** [Brand personality]
- **Audience:** [Primary user segment from personas]
- **Context:** [What are users trying to accomplish?]
- **Length:** [Micro-copy / Medium / Long-form]

## Placeholder Locations (Searchable)
- Search code for `"TODO:"` to find all placeholders
- Count: [X] placeholders total
- Categories:
  - Headings: [Count]
  - Button labels: [Count]
  - Help text: [Count]
  - Error messages: [Count]
  - Empty states: [Count]
  - Onboarding: [Count]

## Design / Layout Context
- **Component visual:** [Link to Figma / Screenshot]
- **User flow:** [Link to flow diagram]
- **Related content:** [Links to brand guide, other pages]
- **Constraints:** [Character limits, mobile truncation, etc.]

## Key Context for Quill
- **Brand:** [Brand name, style guide link]
- **Target users:** [From Nova's personas]
- **Core value prop:** [From Arya's positioning]
- **Go-to-market positioning:** [How are we positioned vs competitors?]
- **Calls-to-action:** [Primary / Secondary / Tertiary conversion points]

## Blockers
- [ ] Brand voice guide incomplete → [Owner, ETA]
- [ ] Design finalization pending → [Owner, ETA]

## Quality Notes
- Component completeness: ✅ | Placeholder clarity: ✅ | Layout stability: ✅ | Accessibility markup: ✅

## Acceptance Criteria for Quill
- [ ] All TODOs have clear context (button vs heading vs help text)
- [ ] Placeholder count matches component map
- [ ] Tone/voice guidelines provided
- [ ] Character limits noted for constrained fields
- [ ] Microcopy examples provided for patterns (errors, success, empty states)
- [ ] Links and CTAs are mapped to user goals
- [ ] Content respects Yash's brand guidelines (if provided)

## Next Steps (For Quill)
1. Review component tree and locate all "TODO:" markers
2. Draft copy per tone/voice guidelines
3. Test copy in context (screenshot components with text)
4. Optimize for mobile (truncation, readability)
5. Ensure CTAs are compelling (conversion-focused)
6. Create PR with copy changes (comment on specific lines)
```

**Quality Gate:**
- All placeholders are marked with "TODO:" and searchable
- Component tree maps to actual React component file paths
- Design references are current (not outdated mockups)
- Content requirements specify tone, audience, and length
- Character limits are noted for constrained UI areas
- Microcopy patterns (buttons, errors, success) are consistent

---

### 6. Koda → Luna (Testing Handoff)

**Trigger:** Feature implementation complete, ready for test coverage

**Deliverable Format:**

```markdown
# Handoff: Koda → Luna

## Summary
[Feature name] implementation complete. Critical paths identified and ready for testing. API contracts locked, component behavior stable.

## What Was Done
- [ ] Feature implementation complete
- [ ] All acceptance criteria met
- [ ] API endpoints responding correctly
- [ ] Edge cases handled (empty states, errors, loading)
- [ ] Component props stabilized (no breaking changes expected)
- [ ] Manual testing completed (no known bugs)

## Components / Modules to Test
- `src/components/JobDetailView.tsx` — ~760 lines, core feature
- `src/components/CandidateRow.tsx` — expandable result row, search
- `src/pages/Admin.tsx` — admin dashboard, tab navigation
- `src/hooks/useAuth.tsx` — auth context, role-based access
- `src/integrations/supabase/client.ts` — Supabase client operations

## Critical Paths (Must Test)
1. **Resume ranking flow:**
   - User enters job description
   - User uploads resume file
   - API call to rank-resumes edge function
   - Results display in sorted order
   - User can expand candidate details
   - ✅ Happy path: All scores display, sorting works
   - ⚠️ Edge case: Large file (10MB+), slow API response (>30s)
   - ❌ Error case: Invalid file format, API timeout

2. **Authentication flow:**
   - User signs up with email/password
   - User logs in
   - Auth token stored in localStorage
   - Protected routes require auth
   - User can sign out
   - ✅ Happy path: Auth persists across page refresh
   - ⚠️ Edge case: Token expires during session
   - ❌ Error case: Invalid credentials, network error

3. **Credit system:**
   - User has credits in account
   - Ranking operation deducts credits
   - Insufficient credits shows error
   - Credits refresh after payment
   - ✅ Happy path: Credits deducted, operation succeeds
   - ⚠️ Edge case: Exactly X credits (boundary)
   - ❌ Error case: Network error during deduction (no refund)

## Component Dependencies
- `JobDetailView` depends on: `ScoreSummaryCards`, `CandidateRow`, `AuthDialog`, `BuyCreditsDialog`
- `CandidateRow` depends on: [None — self-contained]
- `Admin.tsx` depends on: `AdminSidebar`, `DashboardTab`, `UsersTab`, etc.
- `useAuth` provides: `user`, `session`, `isAdmin`, `signOut()`

## API Contracts Locked
- `POST /rank-resumes` → accepts job_id, resume_id → returns results array
- `POST /analyze-jd` → accepts job_description → returns jd_analysis_json
- `GET /profiles` → returns user profile with credits, plan
- [Other endpoints with request/response shapes]

## Environment for Testing
- **Dev:** `http://localhost:8080`
- **Staging:** [Staging URL]
- **Test data:** [Seed data available? SQL migration, JSON fixtures?]
- **Database:** Supabase staging (real data, can reset if needed)
- **Test credentials:** [Username/password for test account]

## Key Context for Luna
- **Critical paths:** [List above] — must have 90%+ coverage
- **Edge cases:** [Boundary conditions, slow network, large files]
- **Error cases:** [API errors, auth failures, validation errors]
- **Performance expectations:** [LCP < 2.5s, FID < 100ms]
- **Browser support:** [Chrome 90+, Safari 14+, Edge 90+]
- **Accessibility minimum:** [WCAG 2.1 AA]

## Blockers
- [ ] Test credentials not yet created → [Owner, ETA]
- [ ] Test data seeding incomplete → [Owner, ETA]
- [ ] API endpoint behavior not yet documented → [Owner, ETA]

## Quality Notes
- Feature completeness: ✅ | Edge case handling: ✅ | Error resilience: ⚠️ (timeout handling could be improved)
- Performance measured: [Yes / No] | A11y audit: [Yes / No]

## Acceptance Criteria for Luna
- [ ] Unit tests cover critical paths (>90% coverage)
- [ ] Integration tests cover feature workflows
- [ ] Edge cases have test cases (file size, slow network, boundary values)
- [ ] Error states are tested (API failure, auth failure, validation)
- [ ] Accessibility passes WCAG 2.1 AA
- [ ] Performance meets benchmarks (LCP, FID, CLS)
- [ ] No test flakiness (tests pass consistently)
- [ ] Test report includes coverage summary and risk areas

## Next Steps (For Luna)
1. Review critical paths (user flows outlined above)
2. Set up test environment and load test data
3. Write unit tests for components (`*.test.ts`)
4. Write integration tests for feature workflows
5. Test error scenarios and edge cases
6. Run `npm run test` and `npm run test:watch`
7. Measure performance with `npm run build` and Lighthouse
8. Document test results and any failures
```

**Quality Gate:**
- Critical paths are clearly defined (happy path, edge cases, error cases)
- Test data and environment are fully accessible
- API contracts are locked (no breaking changes expected)
- Component dependencies are mapped
- Performance expectations are stated with specific metrics
- Accessibility requirements are explicit (WCAG version, AA/AAA)
- Test blockers are listed with clear owners and ETAs

---

### 7. Luna → Sage (QA Report Handoff)

**Trigger:** Testing complete, all tests pass or failures documented

**Deliverable Format:**

```markdown
# Handoff: Luna → Sage

## Summary
Testing completed for [Feature name]. [X]% critical path coverage. [Count] failures, [Count] edge cases. Ready for code review and audit.

## Test Results Summary
- **Total test suites:** [Count]
- **Total tests:** [Count]
- **Passed:** [Count] (✅)
- **Failed:** [Count] (❌)
- **Skipped:** [Count] (⏭️)
- **Coverage:** [X]% critical paths, [X]% overall

## Test Categories
- Unit tests: [Count] (component logic, utilities)
- Integration tests: [Count] (feature workflows)
- E2E tests: [Count] (user journeys)
- Performance tests: [Count] (LCP, FID, CLS)
- Accessibility tests: [Count] (WCAG 2.1 AA)

## Critical Path Coverage
| Path | Status | Notes |
|------|--------|-------|
| Resume ranking flow | ✅ Passed | 15 tests, edge cases covered |
| Authentication | ✅ Passed | 12 tests, token refresh tested |
| Credit deduction | ⚠️ Partial | 8 tests, timeout case not covered |
| Admin access control | ✅ Passed | 10 tests, role-based access verified |

## Test Failures & Investigations
1. **Test:** `CandidateRow.test.ts — expandable row truncates long names`
   - **Status:** ❌ Failed
   - **Root cause:** Text overflow not set in component
   - **Severity:** Medium (UX issue, not data loss)
   - **Resolution:** Koda to fix with `text-truncate` class (assign back to Koda)
   - **Lines:** `src/components/CandidateRow.tsx` line 42-48

2. **Test:** `Admin.test.ts — UsersTab search filters by email`
   - **Status:** ❌ Failed
   - **Root cause:** API returns full results, frontend doesn't filter
   - **Severity:** High (feature doesn't work as designed)
   - **Resolution:** Koda to implement client-side filter or update API (assign back to Koda)
   - **Lines:** `src/components/admin/UsersTab.tsx` line 78-95

## Edge Cases Found
- ✅ Large file upload (10MB) — handled gracefully with progress bar
- ✅ Slow network (3G) — timeout after 60s, retry logic works
- ✅ Concurrent ranking requests — dequeue logic prevents race conditions
- ⚠️ Exactly N credits remaining — edge case passes, but no warning shown to user (UX improvement)
- ❌ Network failure during credit deduction — credits deducted but operation fails; no refund offered (potential issue)

## Performance Results
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| LCP | < 2.5s | 1.8s | ✅ |
| FID | < 100ms | 45ms | ✅ |
| CLS | < 0.1 | 0.06 | ✅ |
| Bundle size | < 200KB | 185KB | ✅ |

## Accessibility Audit (WCAG 2.1 AA)
- ✅ Color contrast: All text meets 4.5:1 ratio
- ✅ Keyboard navigation: Tab order correct, no traps
- ✅ Screen reader: All interactive elements labeled
- ⚠️ Form validation: Error messages not linked to inputs (ARIA attributes missing)
- ❌ Focus visible: Focus ring missing on some button states

## Blockers for Code Review
- [ ] **Blocker 1:** 2 tests failing (listed above) → Assign back to Koda for fixes
- [ ] **Blocker 2:** Accessibility issues need fixes → Assign back to Koda
- [ ] **Blocker 3:** [Description] → [Owner]

## Rework Required
- **Assign back to Koda:**
  - Fix text truncation in CandidateRow (1 hour)
  - Implement client-side search filter in UsersTab (2 hours)
  - Add ARIA labels to form inputs (1 hour)
  - Restore focus ring on button states (30 min)
  - _Estimated rework time: 4.5 hours_

## Quality Notes
- Test rigor: ✅ | Coverage completeness: ✅ | Performance validation: ✅ | A11y rigor: ⚠️

## Acceptance Criteria for Sage (Before Code Review)
- [ ] All critical path tests pass
- [ ] No high-severity failures
- [ ] Edge cases documented (some may not have fixes)
- [ ] Performance metrics meet targets
- [ ] Accessibility blockers have clear fixes
- [ ] Test report includes coverage percentages
- [ ] Risk areas are flagged

## Files to Review
- `src/components/CandidateRow.tsx` — text truncation issue
- `src/components/admin/UsersTab.tsx` — search filter issue
- `src/hooks/useAuth.tsx` — auth context (generally clean)
- `src/integrations/supabase/client.ts` — client operations (generally clean)

## Next Steps (For Sage)
1. Review code for architecture adherence, security, performance
2. Check for hardcoded secrets, missing error handling
3. Verify RLS policies are correct for data access
4. Flag any type safety issues or missing error boundaries
5. Check TypeScript strict mode compliance
6. Once Koda fixes rework items, perform final audit
```

**Quality Gate:**
- All critical path tests are documented with pass/fail status
- Failures include root cause analysis and severity level
- Edge cases are listed (even if not all are fixed)
- Performance metrics are measured against targets
- Accessibility audit is performed (WCAG 2.1 AA minimum)
- Blockers for code review are explicitly listed
- Rework is assigned back with time estimates

---

### 8. Sage → Koda (Rework Handoff)

**Trigger:** Code review finds issues that need fixes

**Deliverable Format:**

```markdown
# Handoff: Sage → Koda (Rework)

## Summary
Code review completed. [Count] high-priority issues found. Rework required before deployment. Estimated [X] hours to resolve.

## Issues Found (By Severity)

### 🔴 High Priority (Must Fix)
1. **Missing error boundary in Dashboard route**
   - File: `src/pages/Index.tsx`
   - Lines: [40-60]
   - Issue: If JobDetailView crashes, entire page fails. No error boundary.
   - Fix: Wrap JobDetailView in `<ErrorBoundary>` component
   - Time estimate: 30 min
   - Risk: Frontend crash, poor UX

2. **RLS policy incomplete on results table**
   - File: `supabase/migrations/20240404_create_results.sql`
   - Lines: [45-60]
   - Issue: Users can access other users' results (data leak)
   - Fix: Add `WHERE user_id = auth.uid()` to SELECT policy
   - Time estimate: 15 min
   - Risk: Security vulnerability, data leak

3. **Hardcoded API URL in component**
   - File: `src/components/JobDetailView.tsx`
   - Lines: [120-125]
   - Issue: `const API_URL = "https://api.example.com"` — should be env var
   - Fix: Use `import.meta.env.VITE_API_URL`
   - Time estimate: 10 min
   - Risk: Environment configuration broken

### 🟡 Medium Priority (Should Fix)
1. **Missing loading state in AdminTab**
   - File: `src/components/admin/DashboardTab.tsx`
   - Lines: [50-100]
   - Issue: Data fetches without loading skeleton; UI feels slow
   - Fix: Add `<SkeletonPage>` while data loads
   - Time estimate: 1 hour
   - Impact: UX degradation

2. **TypeScript `any` type in API response handler**
   - File: `src/hooks/useAuth.tsx`
   - Lines: [35]
   - Issue: `const profile: any = response.data` bypasses type safety
   - Fix: Use `const profile: Profile = response.data as Profile`
   - Time estimate: 15 min
   - Impact: Type safety regression

### 🟢 Low Priority (Nice to Have)
1. **Comment out unused import**
   - File: `src/lib/utils.ts`
   - Lines: [2]
   - Issue: `import { deprecated } from 'old-lib'` is unused
   - Fix: Remove import
   - Time estimate: 5 min

## Rework Checklist
- [ ] Fix missing error boundary (30 min)
- [ ] Fix RLS policy (15 min)
- [ ] Fix hardcoded API URL (10 min)
- [ ] Add loading skeleton to AdminTab (1 hour)
- [ ] Remove `any` types (15 min)
- [ ] Remove unused imports (5 min)
- [ ] Run `npm run build` → zero type errors
- [ ] Run `npm run test` → all tests pass
- [ ] Commit with message: `fix: address code review feedback`
- [ ] Create PR for Sage to review again

## Quality Gates for Rework
- [ ] No `any` types in TypeScript
- [ ] All error boundaries in place
- [ ] RLS policies updated and tested
- [ ] No hardcoded secrets or URLs
- [ ] Loading states for all async operations
- [ ] Build passes with zero type errors
- [ ] Tests pass without flakiness

## Acceptance Criteria for Koda
- [ ] All high-priority issues are fixed
- [ ] Medium-priority issues are fixed or documented (if deferred)
- [ ] No new issues introduced during rework
- [ ] PR includes clear commit message
- [ ] Tests still pass
- [ ] Build succeeds with zero errors

## Next Steps (For Koda)
1. Check out fixes from Sage's issue list
2. Implement fixes in priority order (high → medium → low)
3. Test each fix: `npm run test`, `npm run build`
4. Commit with descriptive message
5. Create PR for Sage to verify fixes
6. Once approved, rework is complete

## Estimated Total Time
- High priority: 55 minutes
- Medium priority: 1.5 hours
- Low priority: 5 minutes
- **Total: ~2.5 hours**
```

**Quality Gate:**
- Issues are categorized by severity (high/medium/low)
- Each issue includes file, line numbers, and root cause
- Fixes are specific and actionable (not vague)
- Time estimates are realistic
- Acceptance criteria are clear before moving to next stage

---

### 9. Sage → Bolt (Deployment Readiness Handoff)

**Trigger:** Code review passed, ready for deployment

**Deliverable Format:**

```markdown
# Handoff: Sage → Bolt

## Summary
Code audit completed. [Feature name] ready for deployment. All security, performance, and compliance checks passed. No blockers.

## Pre-Deployment Checklist (Sage Verified)
- [ ] TypeScript strict mode: ✅ Zero type errors
- [ ] No hardcoded secrets: ✅ All env vars used
- [ ] Error boundaries: ✅ All routes protected
- [ ] RLS policies: ✅ Row-level access verified
- [ ] Loading states: ✅ All async operations handled
- [ ] A11y: ✅ WCAG 2.1 AA compliant
- [ ] Performance: ✅ LCP < 2.5s, FID < 100ms, CLS < 0.1
- [ ] Tests: ✅ All critical paths covered
- [ ] Build: ✅ `npm run build` succeeds
- [ ] Lint: ✅ `npm run lint` clean

## Deployment Manifest
- **Feature:** [Feature name]
- **Scope:** [New tables / Modified tables / New endpoints / etc.]
- **Changes:**
  - Database migrations: `YYYYMMDDHHMMSS_description.sql`
  - New environment variables: `VITE_NEW_KEY` (value provided to Bolt)
  - New API endpoints: [List with method + path]
  - Breaking changes: [None / List if any]

## Database Changes
- **Migration file:** `supabase/migrations/20240404_create_results.sql`
- **Tables created:** `results`, `ranking_logs`
- **Tables modified:** `jobs` (added `dynamic_weights_json` column)
- **Indexes added:** `results.resume_id`, `results.job_id` (for query performance)
- **RLS policies:** [Verified] — users can only access their own data
- **Reversibility:** ✅ Can rollback if needed

## Environment Variables Required
```
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[key]
VITE_API_URL=https://api.example.com
VITE_OPENAI_API_KEY=[key]
VITE_DODO_PAYMENTS_KEY=[key]
```

## API Endpoints (New / Modified)
- `POST /analyze-jd` — New (JD parsing)
- `POST /rank-resumes` — New (resume scoring)
- `GET /jobs/:id/results` — New (fetch rankings)
- `POST /credits/deduct` — Modified (now checks balance before deducting)

## Performance Impact
- **Bundle size increase:** +15KB (gzip)
- **API latency:** No change (new endpoints same performance as existing)
- **Database:** New indexes improve query speed by 50%
- **Lighthouse impact:** No regression (still >90 all categories)

## Rollback Plan
- If deployment fails: Rollback database migrations + redeploy previous build
- Rollback time: ~5 minutes
- Data preservation: All user data preserved in all rollback scenarios
- Breaking changes: None (backward compatible)

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Database migration fails | Low | High | Tested on staging, backup taken |
| API rate limits exceeded | Medium | Medium | Implement request queuing + backoff |
| RLS policy denies valid access | Low | High | Tested on staging, rollback available |
| Performance degradation | Low | Medium | Profiled on staging, indexes added |

## Deployment Instructions for Bolt
1. **Pre-deployment:**
   - Announce to team (if applicable)
   - Take database backup
   - Verify staging deployment is stable

2. **Deployment steps:**
   - Deploy code to production (`npm run build && vercel deploy --prod`)
   - Run database migrations (`supabase db push --prod`)
   - Verify health check endpoint
   - Smoke test critical paths (login, ranking, etc.)

3. **Post-deployment:**
   - Monitor error logs (Sentry)
   - Monitor performance (Lighthouse CI)
   - Monitor database queries (Supabase console)
   - Confirm users can perform critical actions

4. **Rollback (if needed):**
   - Revert code to previous commit
   - Rollback database migrations
   - Verify functionality restored

## Monitoring Dashboards
- **Sentry:** [Link to errors dashboard]
- **Supabase:** [Link to database metrics]
- **Vercel:** [Link to build/deployment logs]
- **Lighthouse:** [Link to performance tracking]

## Acceptance Criteria for Bolt
- [ ] All pre-deployment checks passed
- [ ] Environment variables documented
- [ ] Rollback plan is clear and tested
- [ ] Risk assessment completed
- [ ] Monitoring dashboards accessible
- [ ] Deployment instructions are step-by-step
- [ ] No manual approvals needed (unless Yash's policy requires)

## Next Steps (For Bolt)
1. Review deployment manifest
2. Verify environment variables are available
3. Run final staging deployment verification
4. Deploy to production per instructions
5. Monitor post-deployment (first 30 min critical)
6. Once stable, mark as complete and notify Hawk

## Sign-Off
- **Code review:** ✅ Passed
- **Type safety:** ✅ Strict mode, zero errors
- **Security:** ✅ No hardcoded secrets, RLS verified
- **Performance:** ✅ Benchmarks met
- **Ready to deploy:** ✅ Yes

**Signed by:** Sage (Code Auditor)
**Date:** YYYY-MM-DD
**Next handoff:** Bolt → Hawk (Monitoring setup)
```

**Quality Gate:**
- All pre-deployment checks are verified (not assumed)
- Database migrations are tested on staging
- Rollback plan is documented and feasible
- Risk assessment is realistic (not optimistic)
- Environment variables are listed with placeholders (no secrets exposed)
- Deployment instructions are step-by-step (not vague)
- Monitoring dashboards are accessible

---

### 10. Bolt → Hawk (Deployment Manifest Handoff)

**Trigger:** Deployment to production complete

**Deliverable Format:**

```markdown
# Handoff: Bolt → Hawk

## Summary
[Feature name] deployed to production. [Timestamp]. No issues during deployment. Monitoring dashboards ready.

## Deployment Details
- **Date/Time:** 2024-04-04 14:30 UTC
- **Deployed version:** `v1.2.0`
- **Environment:** Production
- **Duration:** 5 minutes (database migrations 2 min, code deploy 3 min)
- **Status:** ✅ Success, no rollback needed

## What Was Deployed
- **Code:** Commit `abc1234def` (rank-resumes feature)
- **Database:** 2 migrations (`20240404_create_results.sql`, `20240404_add_indexes.sql`)
- **API endpoints:** 3 new, 1 modified (see Sage's manifest)
- **Environment variables:** 5 new keys configured

## Health Checks (Post-Deployment)
- [ ] ✅ API health endpoint responds (200 OK)
- [ ] ✅ Database connections stable
- [ ] ✅ Supabase Auth working
- [ ] ✅ File uploads to Storage working
- [ ] ✅ OpenAI API calls working
- [ ] ✅ Dodo Payments integration working
- [ ] ✅ Resend email working
- [ ] ✅ Critical user flows tested

## Smoke Tests Performed
1. ✅ User login → token issued, persisted in localStorage
2. ✅ Resume upload → file stored in Storage, record created
3. ✅ Ranking request → API call succeeds, results stored
4. ✅ Credit deduction → credits decremented, logged
5. ✅ Admin access → role-based access control working
6. ✅ Error handling → API errors return correct status codes

## Performance Baseline (Post-Deployment)
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| API response time (p50) | < 200ms | 150ms | ✅ |
| API response time (p95) | < 1s | 850ms | ✅ |
| Database query time (p50) | < 50ms | 35ms | ✅ |
| Error rate | < 0.1% | 0.02% | ✅ |
| Uptime | > 99.9% | 100% | ✅ |

## Error Rate Baseline
- 200 requests processed, 0 errors
- 0 RLS permission denials
- 0 API timeouts
- Baseline established for alerting

## Monitoring Setup (For Hawk)
- **Errors:** Sentry dashboard [Link]
  - Alert threshold: >5 errors/min
  - Alert channels: Slack #errors
  - Dashboards: Error trends, top errors, affected users

- **Performance:** Lighthouse CI [Link]
  - Alert threshold: Lighthouse score drops >10 points
  - Alert channels: Slack #perf
  - Dashboards: Core Web Vitals, bundle size, performance budget

- **Database:** Supabase console [Link]
  - Monitor: Query performance, slow queries, storage usage
  - Alert threshold: Slow query (>1s) on critical tables
  - Dashboards: Query latency, connection count, replication status

- **Uptime:** Healthcheck URL [Link]
  - Endpoint: `https://example.com/api/health`
  - Interval: 1 min
  - Alert threshold: 5 consecutive failures (5 min downtime)
  - Alert channels: Slack #uptime, PagerDuty

## Known Issues (Watch For)
- [ ] None identified

## Data Migration Status
- ✅ No data migration needed (new feature, no existing data)

## Rollback Status
- ✅ Rollback verified and ready (tested on staging)
- **Rollback command:** `vercel rollback --prod` (instant)
- **Time to rollback:** <1 minute
- **Data preservation:** All user data preserved in rollback scenario

## Communication to Users
- [ ] Announcement email sent (if applicable) — Topic: [Feature name is live]
- [ ] Changelog updated: [Link]
- [ ] Help docs updated: [Link]
- [ ] Support team notified of changes: [Link]

## Sign-Off
- **Deployment:** ✅ Successful
- **Health checks:** ✅ All passed
- **Smoke tests:** ✅ All passed
- **Ready for monitoring:** ✅ Yes
- **Rollback available:** ✅ Yes

**Signed by:** Bolt (Deployment Engineer)
**Date:** 2024-04-04
**Next handoff:** Hawk (Monitoring)

## Next Steps (For Hawk)
1. Set up alerts in Sentry, Lighthouse CI, Supabase, Healthcheck
2. Monitor error rates for first 30 minutes (critical period)
3. Track performance metrics to establish baseline
4. Watch for user-reported issues (Slack, email)
5. If issues found, escalate to Vex (debugging)
6. After 24-hour stable period, mark as "fully deployed"
```

**Quality Gate:**
- All health checks are performed and documented
- Smoke tests cover critical user flows
- Performance baseline is established
- Error rate baseline is established
- Rollback plan is verified
- Monitoring dashboards are configured and linked
- No known issues remain

---

### 11. Hawk → Vex (Issue Escalation Handoff)

**Trigger:** Monitoring detects issue post-deployment

**Deliverable Format:**

```markdown
# Handoff: Hawk → Vex (Issue Escalation)

## Summary
Monitoring detected issue post-deployment. [Description]. Requires debugging. Immediate escalation to Vex.

## Issue Detected
- **Timestamp:** 2024-04-04 15:00 UTC
- **Source:** Sentry error tracking
- **Severity:** 🔴 High (5+ users affected)
- **Error rate:** 2.5% (5 errors in last 100 requests)
- **Status:** Ongoing

## Error Details
- **Error type:** `TypeError: Cannot read property 'resume_id' of undefined`
- **File:** `src/components/CandidateRow.tsx`
- **Line:** 42
- **Stack trace:**
  ```
  CandidateRow.tsx:42:18
    at renderResult (JobDetailView.tsx:120)
    at JobDetailView.tsx:115
  ```
- **Affected users:** ~12 users
- **User impact:** Rankings display partially, some candidate details crash

## Reproduction Steps
1. User logs in
2. Uploads 10+ resumes
3. Waits for ranking to complete
4. Clicks "Expand" on certain candidate rows
5. Component crashes with TypeError

## Context for Debugging
- **Commit deployed:** `abc1234def` (rank-resumes feature)
- **Migration deployed:** `20240404_create_results.sql`
- **API endpoint:** `POST /rank-resumes` (new endpoint)
- **Database change:** Added `results` table

## Monitoring Data
- **Error rate timeline:**
  - 14:30 UTC: 0% (immediately after deploy, good sign)
  - 14:45 UTC: 0.5% (few errors)
  - 15:00 UTC: 2.5% (error rate increasing)
- **Affected component:** `CandidateRow` (100% of crashes)
- **Pattern:** Crash occurs when `result.resume_id` is undefined

## Recent Changes (Potential Causes)
1. New `results` table structure — `resume_id` might be nullable or missing
2. New API response format — field names might have changed
3. Migration issue — data not being populated correctly
4. Race condition — results table being queried before data is inserted

## Temporary Mitigation
- ✅ Sentry error tracking active
- ⚠️ No user-facing mitigation (feature partially broken)
- **If escalates:** Consider feature flag to disable ranking until fixed

## Acceptance Criteria for Vex
- [ ] Root cause identified (data issue / API issue / component issue)
- [ ] Reproduction steps followed and confirmed
- [ ] Fix implemented and tested locally
- [ ] Fix deployed to production
- [ ] Error rate drops back to <0.1%
- [ ] No regression (other features unaffected)

## Next Steps (For Vex)
1. Reproduce error locally using provided steps
2. Check database records — is `resume_id` populated?
3. Check API response format — compare to expected schema
4. Check component logic — is null-check missing?
5. Implement fix with defensive programming (null checks)
6. Test fix locally before deploying
7. Verify error rate drops in Sentry

## Sign-Off
- **Issue detected:** ✅ Yes, actively occurring
- **Severity:** High (user-facing)
- **Urgency:** Immediate (revenue impact if users can't rank)
- **Next handler:** Vex (Debugging)

**Reported by:** Hawk (Monitoring)
**Date:** 2024-04-04 15:00 UTC
```

**Quality Gate:**
- Issue is quantified (error rate, affected users)
- Reproduction steps are clear and actionable
- Stack trace is provided
- Potential causes are listed
- No speculation (facts only)
- Monitoring data supports the issue
- Next handler knows exactly what to do

---

### 12. Any Agent → Mira (Lesson Learned Handoff)

**Trigger:** Any mode completes (after successful deployment or at end of sprint)

**Deliverable Format:**

```markdown
# Handoff: [Agent] → Mira

## Summary
[Mode] completed for [project]. [Key lesson or pattern identified]. Should [remember for future / avoid in future / optimize next time].

## Context
- **Project:** [Project name]
- **Mode:** [A/B/C/D/E]
- **Date:** YYYY-MM-DD
- **Agent:** [Agent name that's sharing the learning]
- **Result:** ✅ Success / ⚠️ Partial / ❌ Blocker

## What Happened
[2-3 sentences describing the situation]

## Pattern Identified
**Pattern name:** [Good pattern / Antipattern]
**Category:** [Architecture / Performance / Testing / Security / Process / etc.]
**Applicability:** [When this pattern applies]

### Good Pattern Example
If this is something we should repeat:
```
Pattern: [Name]
When to use: [Conditions]
How: [Steps or code example]
Benefits: [Outcomes]
Caveats: [Edge cases]
```

### Antipattern Example
If this is something we should avoid:
```
Antipattern: [Name]
When it breaks: [Conditions]
Why it fails: [Root cause]
Better approach: [Alternative]
Cost of fixing: [Time / complexity]
```

## Quantified Impact (If Applicable)
- **Time saved:** [X hours] (by using pattern)
- **Quality improvement:** [Metric] (before: X, after: Y)
- **Cost reduction:** [X$] (if applicable)
- **Risk reduced:** [Specific risk mitigated]

## Where to Store This Learning
- **File location:** `~/.claude/memory/[stack|patterns/good|patterns/avoid]/[topic].md`
- **Update existing:** [Yes / No — if yes, which file]
- **Create new file:** [Yes / No — if yes, suggested filename]

## Tags / Keywords
- #[tag1] #[tag2] #[tag3]
- Example: #testing #performance #react #supabase

## Related Learnings
- [Link to related memory file]
- [Link to related memory file]

## Code Example (If Applicable)
```typescript
// Bad pattern (avoid):
const data: any = response.data;

// Good pattern (repeat):
const data: UserProfile = response.data as UserProfile;
```

## Next Time
**For similar future projects:**
1. [Action based on this learning]
2. [Action based on this learning]
3. [Action based on this learning]

## Confidence Level
- 🟢 High confidence (proven, repeatable, well-tested)
- 🟡 Medium confidence (worked once, should verify on next project)
- 🔴 Low confidence (theory only, needs more validation)

**Confidence:** [Green / Yellow / Red]
**Rationale:** [Why this confidence level]

## Sign-Off
- **Lesson documented:** ✅ Yes
- **Ready for team reuse:** ✅ Yes
- **Suggested for memory:** ✅ Yes

**Extracted by:** Mira (Knowledge Engineer)
**Date:** YYYY-MM-DD
```

**Quality Gate:**
- Learning is general enough to apply to future projects (not project-specific)
- Impact is quantified if applicable (time, quality, cost)
- Storage location is clear (where in memory system)
- Code examples are provided if applicable
- Related learnings are linked
- Confidence level is honest (not overstated)

---

### 13. Arya → Vega (Design Requirements Handoff)

**Trigger:** Architecture approved, Vega needs to produce design specs before Koda builds

**Deliverable Format:**

```markdown
# Handoff: Arya → Vega

## Summary
Architecture designed for [project]. Page list, user flows, and data model ready for design specification.

## What Was Done
- [ ] Page list with purpose descriptions
- [ ] User flow diagrams (page → page navigation)
- [ ] Data model summary (what data appears on each page)
- [ ] Feature priority (MVP-critical vs nice-to-have)
- [ ] Any Yash-specified design preferences

## Architecture Outputs
- `architecture/pages.md` — complete page list with descriptions
- `architecture/flows.md` — user journey maps
- `architecture/data-model.md` — entities, fields per page

## Key Context for Vega
- **Stack:** [A/B/C — determines component library]
- **Target users:** [from Nova research — influences design tone]
- **Pages to design:** [complete list with priority]
- **Admin panel tabs:** [list of all admin sections]
- **Responsive priority:** [mobile-first / desktop-first]
- **Brand/design constraints:** [from Yash brief, if any]
- **Existing design language:** [if adding to existing project]

## Acceptance Criteria for Vega
- [ ] Every page in the list gets a design spec
- [ ] Each spec includes: layout, components, visual hierarchy, states, responsive, dark mode, a11y
- [ ] Component selection matches stack (shadcn for A, Polaris for B)
- [ ] No custom components where library components exist
- [ ] Spacing uses design tokens only
```

**Quality Gate:**
- Page list is complete (no "and other pages" vagueness)
- Data model shows what fields display on which pages
- User flows show primary and secondary navigation paths
- Feature priority is explicit (Vega specs MVP pages first)

---

### 14. Vega → Koda (Design Spec Handoff)

**Trigger:** Design specs completed, Koda ready to implement UI

**Deliverable Format:**

```markdown
# Handoff: Vega → Koda

## Summary
Design specs completed for [N] pages. Every page has complete visual specification including layout, components, states, responsive behavior, dark mode, animation, and accessibility requirements.

## What Was Done
- [ ] Design spec for each page (using Vega's Design Spec Format)
- [ ] Component selection with exact props/variants
- [ ] All states defined (loading, empty, error, default)
- [ ] Responsive behavior at 4 breakpoints
- [ ] Dark mode token coverage
- [ ] Animation presets assigned
- [ ] Accessibility requirements per page

## Design Spec Files
- `design-specs/landing-page.md`
- `design-specs/auth-login.md`
- `design-specs/auth-signup.md`
- `design-specs/dashboard.md`
- `design-specs/settings.md`
- `design-specs/billing.md`
- `design-specs/admin-[tab].md`
- `design-specs/error-pages.md`
- [additional feature pages]

## Key Context for Koda
- **Component library:** [shadcn/Polaris — DO NOT use any other]
- **Design tokens used:** [list of CSS variables and Tailwind classes]
- **Animation library:** [motion/react for Stack A, none for Stack B]
- **State management for UI:** [which states need loading/empty/error]
- **Implementation order:** [which page to build first — matches Page Build Sequence]
- **Copy placeholders:** [spaces reserved for Quill — implement with placeholder text, Quill replaces]

## Acceptance Criteria for Koda
- [ ] Every page matches Vega's spec (component selection, layout, spacing)
- [ ] All colors use CSS variables / semantic tokens
- [ ] All states implemented (loading skeleton, empty state with CTA, error state)
- [ ] Responsive behavior works at all 4 breakpoints
- [ ] No raw HTML where a Polaris/shadcn component exists
- [ ] Animation presets applied per spec
- [ ] Accessibility requirements met per spec
```

**Quality Gate:**
- Every design spec is complete (no "TBD" sections)
- Component selections are specific (not "some kind of card")
- States include exact skeleton layout, not just "add loading state"
- Responsive specs include specific layout changes per breakpoint
- All tokens come from the design system (no invented values)

---

### 15. Koda → Vega (Visual Review Request)

**Trigger:** Koda has implemented UI shell, ready for visual review

**Deliverable Format:**

```markdown
# Handoff: Koda → Vega (Visual Review)

## Summary
UI shell implemented for [N] pages per Vega's design specs. Build passes. Ready for visual review.

## What Was Done
- [ ] All pages implemented per design specs
- [ ] Components match spec selections
- [ ] States implemented (loading, empty, error)
- [ ] Responsive behavior at all breakpoints
- [ ] Dark mode tested
- [ ] Build passes (`npm run build` exits 0)

## Implementation Notes
- **Branch:** [branch name or commit hash]
- **Pages implemented:** [list]
- **Deviations from spec:** [list any — with justification]
  - Example: "Used Dialog instead of Sheet for settings because mobile viewport too narrow for Sheet"
- **Known limitations:** [any issues Koda is aware of]

## Key Context for Vega
- **How to view:** [dev server URL, build command, or screenshots]
- **Pages to review:** [ordered list matching design specs]
- **Copy status:** [placeholder / Quill copy integrated]
- **Data status:** [static / real data connected]

## Acceptance Criteria for Vega
- [ ] Visual hierarchy matches spec
- [ ] Component fidelity matches spec
- [ ] Typography correct
- [ ] States implemented correctly
- [ ] Responsive behavior correct
- [ ] Dark mode complete
- [ ] Animation presets applied
- [ ] Accessibility requirements met
```

**Quality Gate:**
- Build passes (Koda must verify before requesting review)
- All pages in the design spec list are implemented
- Deviations are documented with justification (not silent changes)

---

### 16. Vega → Koda (Visual Review Result)

**Trigger:** Vega has reviewed Koda's implementation, returning verdict

**Deliverable Format:**

```markdown
# Handoff: Vega → Koda (Visual Review Result)

## Summary
Visual review completed for [N] pages. Verdict: [PASS / PASS WITH NOTES / FAIL].

## Verdict: [PASS / PASS WITH NOTES / FAIL]

## Pages Reviewed
| Page | Status | Issues |
|------|--------|--------|
| Landing | ✅ PASS | 0 |
| Dashboard | ⚠️ PASS WITH NOTES | 2 low |
| Settings | ❌ FAIL | 1 critical |

## Issues Found (If Any)

| # | Severity | Page | Element | Issue | Fix Required |
|---|----------|------|---------|-------|--------------|
| 1 | CRITICAL | Settings | Card layout | Cards stacked without proper gap | Add `gap-6` between Card components |
| 2 | LOW | Dashboard | Metric cards | Hover animation missing | Add `hover:shadow-md transition-shadow` |

## What Passed
- [List of elements/pages that are correct]

## Next Steps for Koda
1. Fix all CRITICAL and HIGH issues (required before proceeding)
2. Fix MEDIUM issues (recommended before proceeding)
3. LOW issues can be deferred to next sprint
4. After fixes: request re-review (Vega will only check changed elements)
```

**Quality Gate:**
- Every page has a verdict
- Issues have specific fix instructions (not "looks wrong, fix it")
- Severity is honest (CRITICAL = blocks user flow, HIGH = visible defect, MEDIUM = polish, LOW = nice-to-have)

---

## File Storage & Naming Convention

All handoffs are stored in a `.handoffs/` directory at the project root:

```
project-root/
└── .handoffs/
    ├── nova-to-arya-20240404-143000.md
    ├── arya-to-riko-20240404-150000.md
    ├── arya-to-vega-20240404-151000.md
    ├── vega-to-koda-20240404-152000.md
    ├── arya-to-koda-sprint1-20240404-151500.md
    ├── riko-to-koda-20240404-152000.md
    ├── koda-to-vega-review-20240404-155000.md
    ├── vega-to-koda-review-20240404-160000.md
    ├── koda-to-quill-feature1-20240404-160000.md
    ├── koda-to-luna-sprint1-20240404-165000.md
    ├── luna-to-sage-20240404-180000.md
    ├── sage-to-koda-rework-20240404-185000.md
    ├── sage-to-bolt-20240404-190000.md
    ├── bolt-to-hawk-20240404-195000.md
    ├── hawk-to-vex-issue1-20240404-200000.md
    ├── vega-to-mira-feedback-20240404-205000.md
    └── [agent]-to-mira-20240404-205000.md
```

**Naming pattern:** `[from]-to-[to]-[topic]-[YYYYMMDD-HHMMSS].md`

---

## Quality Gates (Universal)

Before every handoff is accepted, these criteria must be met:

| Gate | Requirement | Verification |
|------|-------------|--------------|
| **Completeness** | All items in "What Was Done" are finished | Reviewer checks box or item is ✅ |
| **Clarity** | Next agent understands exactly what to do | Next agent reads "Next Steps" without questions |
| **Context** | All relevant context provided (no surprises) | Next agent has URLs, credentials (env vars, not secrets), code references |
| **No blockers** | Blockers are listed and have owners | All blockers have clear owners and ETAs |
| **Quality verified** | Quality notes are honest (not optimistic) | Peer review or tool verification (linter, test, type check) |
| **Files documented** | All created/modified files are listed | File list is searchable and includes line numbers |
| **Acceptance criteria** | Clear, testable acceptance criteria | Next agent can verify completion without guessing |

---

## Communication Protocol

When a handoff is ready:

1. **Create the handoff file** in `.handoffs/` directory
2. **Notify next agent** (via tool call, message, or queue)
3. **Next agent confirms receipt** (acknowledges file read)
4. **Current agent stands by** for 5 minutes in case clarification needed
5. **Move forward** once next agent starts work (status change in tracker)

If next agent has questions:
- **Blocker found:** Document in "Blockers" section of the handoff
- **Unclear context:** Request clarification before accepting
- **Missing artifact:** Block handoff until artifact provided

---

## Success Metrics

A handoff is successful if:
- ✅ Next agent completes their work without rework from current agent
- ✅ No context-switching or clarification needed mid-work
- ✅ Quality gates prevent downstream issues
- ✅ Learning extracted and stored for future reference

A handoff has failed if:
- ❌ Next agent can't start work (missing context or blockers)
- ❌ Current agent needs to jump back in to clarify
- ❌ Quality gate is missed and issues surface in next stage
- ❌ Same mistake repeats in future projects

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-04-04 | Initial protocol released |
| 1.1 | 2026-04-04 | Added Vega (Design Agent #14): 4 new handoff templates (Arya→Vega, Vega→Koda, Koda→Vega, Vega→Koda review result) |

This document is version-controlled in memory system. Updates require Mira approval.
