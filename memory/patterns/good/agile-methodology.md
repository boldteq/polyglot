---
name: Agile Methodology for Multi-Project Software Factory
description: Sprint management, multi-project orchestration, and delivery cadence patterns — how Boldteq runs parallel product development at speed
type: reference
priority: high
---

## Why This Exists
Boldteq runs multiple SaaS products simultaneously. This isn't a single-team Scrum guide — it's the operating system for a software factory that ships products in 1-2 weeks using an AI agent team. Every pattern here is derived from how top agencies (Thoughtbot, Pivotal Labs, IDEO) and SaaS companies (Linear, Vercel, Notion) manage high-velocity multi-project delivery.

---

## 1. Project Lifecycle (Factory Model)

### Phases
```
INTAKE → RESEARCH → ARCHITECTURE → BUILD → QA/SEO → SHIP → MONITOR → ITERATE
 (Yash)    (Nova)      (Arya)       (Koda)  (Luna/   (Bolt)  (Hawk)    (All)
                                            Sage/
                                            Zeph)
```

### Phase Durations (Target)
| Phase | Duration | Gate |
|-------|----------|------|
| Intake | 1 hour | Yash validates brief, assigns project slug |
| Research | 2-4 hours | Nova delivers go/no-go with TAM, competitors, positioning |
| Architecture | 2-4 hours | Arya delivers data model, API spec, stack decision |
| Build Sprint 1 | 2-3 days | Core features: auth, billing, main value prop |
| Build Sprint 2 | 2-3 days | Secondary features, polish, edge cases |
| QA + Review | 1 day | Luna tests, Sage reviews, fixes applied |
| Ship | 2-4 hours | Bolt deploys, Hawk configures monitoring |
| Post-Launch | Ongoing | Hawk monitors, Mira logs patterns |

**Total v1: 7-10 business days** (improving with accumulated memory)

---

## 2. Sprint Structure

### Sprint = 3 Days (Factory Speed)
Traditional 2-week sprints are too slow for a factory. Boldteq uses 3-day micro-sprints:

**Day 1: Build Core**
- Morning: Riko scaffolds or Koda starts features
- Afternoon: Primary feature implementation
- End of day: Working feature (ugly is fine, functional is required)

**Day 2: Build + Integrate**
- Morning: Secondary features, integrations
- Afternoon: Polish, error handling, edge cases
- End of day: Feature-complete (not pixel-perfect yet)

**Day 3: Quality + Ship**
- Morning: Luna tests, Sage reviews
- Afternoon: Fix issues from review, final polish
- End of day: Deploy-ready (Bolt proceeds if Sage approves)

### Sprint Planning (Yash Orchestrates)
1. Yash breaks the project into sprint-sized chunks
2. Each sprint has a clear deliverable ("auth + billing working" not "work on auth")
3. Dependencies mapped: what blocks what
4. Risk items identified: what might take longer than expected
5. Parallel tracks assigned: Quill writes copy while Koda builds

### Daily Checkpoint (Automated)
- What shipped since last checkpoint
- What's blocked
- Quality metrics (test coverage, build status, Sage score)
- Yash adjusts plan if behind schedule

---

## 3. Multi-Project Management

### Project States
```
QUEUED → ACTIVE → PAUSED → SHIPPED → MAINTAINING
```

**Rules:**
- Max 2 ACTIVE projects simultaneously (focus beats parallelism)
- PAUSED projects have their state frozen in memory — resume without context loss
- QUEUED projects get research (Nova) done ahead of time
- SHIPPED projects move to low-touch maintenance mode

### Project Priority Matrix
| Factor | Weight | Example |
|--------|--------|---------|
| Revenue potential | 30% | High TAM = higher priority |
| Time sensitivity | 25% | Market window closing = urgent |
| Complexity | 20% | Simple = ship fast, build momentum |
| Strategic value | 15% | Platform play = long-term value |
| Dependencies | 10% | Blocked by external = deprioritize |

### Context Switching Protocol
When switching between active projects:
1. Mira saves current project state to `memory/projects/[slug].md`
2. All in-progress work committed with descriptive message
3. Yash loads new project context from memory
4. Agents read project-specific CLAUDE.md + relevant memory files
5. No assumptions carried over — fresh context from memory only

### Resource Allocation
```
Project A (primary):   70% of sprint capacity
Project B (secondary): 30% of sprint capacity
```
- Never split 50/50 — one project always leads
- Background tasks (monitoring, copy writing) don't count toward allocation
- If Project A is blocked, Project B gets 100% temporarily

---

## 4. Kanban Board (Per Project)

### Columns
```
BACKLOG → READY → IN PROGRESS → IN REVIEW → DONE → SHIPPED
```

### Work Item Types
| Type | Description | Size |
|------|-------------|------|
| Epic | Major feature area (auth, billing, dashboard) | 1-3 sprints |
| Story | User-facing feature ("user can filter by date") | 0.5-1 day |
| Task | Technical work ("set up RLS policies") | 2-4 hours |
| Bug | Defect (P0-P3 severity) | Variable |
| Spike | Research/exploration ("evaluate AI model options") | Timeboxed 4h max |

### Definition of Ready (DoR)
A work item is READY when:
1. Clear acceptance criteria defined
2. Dependencies identified and unblocked
3. Design/architecture decisions made
4. Data model changes specified
5. No open questions that block starting

### WIP Limits
- IN PROGRESS: max 2 items per agent (Koda can build 2 features simultaneously)
- IN REVIEW: max 3 items (Sage/Luna throughput)
- If WIP limit hit → finish existing work before starting new

---

## 5. Estimation & Velocity

### T-Shirt Sizing (Not Story Points)
| Size | Duration | Example |
|------|----------|---------|
| XS | < 2 hours | Fix typo, update copy, add env var |
| S | 2-4 hours | Add a simple CRUD endpoint, new component |
| M | 4-8 hours | Feature with auth + UI + API + tests |
| L | 1-2 days | Complex feature with integrations |
| XL | 2-3 days | Major feature (billing system, real-time sync) |

### Velocity Tracking
- Track completed items per sprint (count, not points)
- Track by size category: "Sprint 1: 2L, 4M, 6S = 12 items"
- Mira logs velocity per project in `memory/projects/[slug].md`
- Velocity improves as memory accumulates (pattern reuse)

### Estimation Heuristic
```
If the team has built something similar before → check memory, use prior duration
If novel → add 50% buffer to initial estimate
If involves third-party integration → add 100% buffer (APIs break)
If Yash says "simple" → still estimate properly, ship fast
```

---

## 6. Ceremonies (Lightweight)

### Sprint Kickoff (5 min)
- Yash presents sprint goal and assigned work items
- Agents confirm they have what they need
- Blockers surfaced immediately

### Sprint Retro (Automated by Mira)
After every sprint:
1. What worked well → add to `patterns/good/`
2. What went wrong → add to `patterns/avoid/`
3. What took longer than expected → update estimates
4. What was reused from memory → validate it's still correct

### Project Postmortem (After Ship)
- Total time: planned vs actual
- Quality metrics: test coverage, bugs found post-launch, Sage score
- Memory contributions: what new patterns were captured
- Velocity delta: did we get faster vs. previous project?
- Process improvements for next project

---

## 7. Quality Gates (Non-Negotiable)

### Gate 1: Architecture Review (After Arya)
- [ ] Data model reviewed for scaling
- [ ] Auth + billing wired from day one
- [ ] Stack decision documented with rationale
- [ ] No over-engineering — v1 scope only

### Gate 2: Feature Complete (After Koda Sprint)
- [ ] All acceptance criteria met
- [ ] Error handling for all user flows
- [ ] Loading/empty/error states for all screens
- [ ] Mobile responsive (if applicable)
- [ ] No TypeScript `any` types

### Gate 3: Quality Audit (After Luna + Sage)
- [ ] Test coverage ≥ 80%
- [ ] Sage approval: PASS or PASS WITH WARNINGS
- [ ] No P0/P1 bugs open
- [ ] Performance: LCP < 2.5s, FID < 100ms, CLS < 0.1
- [ ] Accessibility: no critical axe violations

### Gate 3.5: SEO Audit (After Zeph)
- [ ] No P0/P1 SEO bugs on public pages
- [ ] Sitemap valid and includes all public routes
- [ ] Structured data validates at schema.org
- [ ] Open Graph + Twitter meta on all public pages
- [ ] Core Web Vitals pass Google's thresholds
- [ ] Keyword targets mapped and handed to Quill

### Gate 4: Deploy Ready (Before Bolt)
- [ ] All env vars configured for production
- [ ] DNS/domain configured
- [ ] Monitoring + alerting active
- [ ] Rollback plan documented
- [ ] Billing verified in test mode

---

## 8. Communication Protocol

### Yash ↔ Agent Team
- Yash gives brief → Yash interprets and orchestrates
- Status updates: only when blocked or at major milestones
- No status meetings — progress visible through shipped work
- Corrections logged immediately to `user/feedback.md`

### Agent ↔ Agent
- Structured handoff format (defined in Yash)
- No free-form messages — always structured data
- Blockers escalated to Yash within 1 retry
- Memory updates routed through Mira

---

## 9. Continuous Improvement

### Metrics That Matter
| Metric | Target | Tracked By |
|--------|--------|------------|
| Time to v1 ship | < 10 business days | Yash |
| Bugs post-launch (P0/P1) | 0 in first week | Hawk |
| Test coverage | ≥ 80% | Luna |
| Sage approval rate | ≥ 90% first pass | Sage |
| Memory reuse rate | Increasing per project | Mira |
| Build cost (compute) | Decreasing per project | Yash |

### Improvement Flywheel
```
Ship Project → Capture Patterns → Reuse in Next Project → Ship Faster → Capture More Patterns
```
This is the core competitive advantage of the factory model. Every project makes the next one faster.

---

*(Updated by Mira — methodology evolves with each shipped project)*
