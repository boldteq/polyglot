# Boldteq Hiring Plan — The 30-Person AI Company

**Owner:** Yash
**Version:** 2.1 (noise-cut edition)
**Date:** April 11, 2026
**Purpose:** Deep, clear, implementation-ready plan for expanding the Boldteq Software Factory from 21 to 30 employees. Each employee has a simple job title, clear responsibilities, years of encoded experience, and an HR onboarding package.

---

## The Rule: No Noise, Only Must-Haves

Before hiring anyone new, this plan checks three things:

1. **Does an existing employee already cover this?** → If yes, don't hire. Expand the existing employee's skills instead.
2. **Is there a real, repeated gap that costs Yash time or money?** → If no, don't hire.
3. **Can the job be automated by a script instead of an employee?** → If yes, don't hire.

Applying this rule cut the previous plan from 11 new hires down to **9 new hires**.

**What was cut and why:**
- **Archivist** — CUT. Mira already does knowledge routing. Expand Mira instead.
- **Refactor** — CUT. Tutor handles compression as part of the weekly training cycle.
- **Herald (publisher)** — CUT. Quill writes and can publish via a simple Polyglot action. No new agent needed.
- **Reach (community responder)** — DEFERRED. No active community yet. Hire only after first community launches.

**What was added:**
- **Hiring Manager** — runs the HR system itself. Without this, nothing scales.
- **People Ops** — runs weekly accountability reports on every employee.

---

## The Final 30-Person Team

Current: 21 employees. New hires: 9. Total: **30 employees across 9 departments.**

### Existing 21 (kept exactly as they are)

| # | Name | Title (Simple English) | Department | Years of XP |
|---|------|------------------------|------------|-------------|
| 1 | Rex | The Commander | Leadership | 20 |
| 2 | Verdict | The Decision Maker | Leadership | 18 |
| 3 | Scout | The Idea Validator | Shape | 12 |
| 4 | Nova | The Market Researcher | Shape | 14 |
| 5 | Atlas | The Market Sizer | Shape | 12 |
| 6 | Ledger | The Pricing Expert | Validate | 15 |
| 7 | Pulse | The User Interviewer | Validate | 12 |
| 8 | Echo | The Distribution Planner | Validate | 13 |
| 9 | Arya | The Chief Architect | Build | 18 |
| 10 | Riko | The Project Setup Guy | Build | 10 |
| 11 | Vega | The Designer | Build | 14 |
| 12 | Koda | The Senior Developer | Build | 16 |
| 13 | Luna | The QA Tester | Build | 12 |
| 14 | Sage | The Code Reviewer | Build | 15 |
| 15 | Vex | The Bug Fixer | Build | 13 |
| 16 | Quill | The Copywriter | Launch | 14 |
| 17 | Zeph | The SEO Expert | Launch | 12 |
| 18 | Bolt | The Deployer | Launch | 11 |
| 19 | Hawk | The Uptime Watcher | Measure | 12 |
| 20 | Orbit | The Metrics Architect | Measure | 11 |
| 21 | Mira | The Memory Keeper | Measure | 14 |

### The 9 New Hires

| # | Name | Title (Simple English) | Department | Years of XP |
|---|------|------------------------|------------|-------------|
| 22 | **Harvest** | The Market Scraper | Intelligence | 10 |
| 23 | **Prism** | The Signal Cleaner | Intelligence | 9 |
| 24 | **Trend** | The Pattern Finder | Intelligence | 15 |
| 25 | **Forge** | The Agent Designer | People | 18 |
| 26 | **Tutor** | The Agent Trainer | People | 16 |
| 27 | **Hiring Manager** (Hira) | The HR Manager | People | 20 |
| 28 | **People Ops** (Ops) | The Performance Reviewer | People | 14 |
| 29 | **Finch** | The Finance Watcher | Specialized | 12 |
| 30 | **Guard** | The Security Officer | Specialized | 18 |

---

## Department Map

```
LEADERSHIP (2)
├── Rex — The Commander
└── Verdict — The Decision Maker

SHAPE (3)
├── Scout — The Idea Validator
├── Nova — The Market Researcher
└── Atlas — The Market Sizer

VALIDATE (3)
├── Ledger — The Pricing Expert
├── Pulse — The User Interviewer
└── Echo — The Distribution Planner

BUILD (7)
├── Arya — The Chief Architect
├── Riko — The Project Setup Guy
├── Vega — The Designer
├── Koda — The Senior Developer
├── Luna — The QA Tester
├── Sage — The Code Reviewer
└── Vex — The Bug Fixer

LAUNCH (3)
├── Quill — The Copywriter
├── Zeph — The SEO Expert
└── Bolt — The Deployer

MEASURE (3)
├── Hawk — The Uptime Watcher
├── Orbit — The Metrics Architect
└── Mira — The Memory Keeper

INTELLIGENCE (3) ← NEW
├── Harvest — The Market Scraper
├── Prism — The Signal Cleaner
└── Trend — The Pattern Finder

PEOPLE (4) ← NEW
├── Hira — The HR Manager
├── Ops — The Performance Reviewer
├── Forge — The Agent Designer
└── Tutor — The Agent Trainer

SPECIALIZED (2) ← NEW
├── Finch — The Finance Watcher
└── Guard — The Security Officer
```

---

## How Every Employee Is Built (The Universal Employee File)

Every employee — old or new — follows the same file format. This is the template the VS Code builder should use.

### File location
`~/.claude/agents/[name].md`

### Required sections (in order)

```
1. FRONTMATTER
   - name
   - title (simple English, e.g., "The Market Scraper")
   - department
   - years_of_experience (a number, based on knowledge encoded)
   - model (haiku | sonnet | opus)
   - color

2. THE EMPLOYEE CARD (at the very top of the file, before anything else)
   - Name: Harvest
   - Title: The Market Scraper
   - Department: Intelligence
   - Years of Experience: 10
   - Reports to: Rex (Commander)
   - Reports to (HR): Hira (HR Manager)
   - Reviewed weekly by: Ops (Performance Reviewer)
   - Trained weekly by: Tutor (Agent Trainer)

3. MY JOB IN ONE SENTENCE
   (Plain English. No jargon. A 10-year-old should understand it.)

4. WHAT I AM RESPONSIBLE FOR
   (Numbered list. Each item is one specific outcome, not a task.)

5. WHAT I AM NOT RESPONSIBLE FOR
   (Clear boundaries. Who does what I don't do.)

6. MY MEMORY (What I Always Load Before Starting Work)
   - Standard memory files
   - Department-specific memory
   - My own experience file (~/.claude/memory/employees/[name]/experience.md)

7. MY YEARS OF EXPERIENCE — WHAT I KNOW
   (The actual encoded knowledge. This is where the "years" come from.)
   - 10+ years means: at minimum 40 encoded patterns + 20 anti-patterns + 10 case studies
   - 15+ years means: at minimum 60 encoded patterns + 30 anti-patterns + 20 case studies
   - 20+ years means: at minimum 100 encoded patterns + 50 anti-patterns + 30 case studies

8. MY AUTO-FIX LOOP (5 retries)
   - Table: attempt → failure → fix
   - MANDATORY line: "Load universal-auto-fix-loop.md and universal-smart-defaults.md before every task."

9. MY SMART DEFAULTS
   (What I decide on my own without asking. Autonomous rules.)

10. HOW I KNOW I'M DONE (Completion Proof)
    (Numbered checklist with ✅ criteria. No vague "done" — concrete checks.)

11. MY ANTI-PATTERNS (Mistakes I Never Make)
    (Exactly 10, numbered with ❌. Each tied to a real mistake from the past.)

12. WHO I WORK WITH
    - Upstream (who gives me work)
    - Downstream (who I hand off to)
    - Partners (who I collaborate with)
    - Monitored by (Hawk + Ops)
    - Trained by (Tutor)

13. MY WEEKLY REPORT TO OPS
    (What I send every Friday to People Ops for the accountability report.)
    - Tasks completed
    - Tasks failed + root cause
    - Auto-fix retry rate
    - Average token usage
    - One thing I learned this week
    - One thing I want training on
```

**Every employee file must have all 13 sections.** Hira (HR Manager) rejects any employee file missing a section.

---

## The 9 New Hires — Full Job Descriptions

### 22. Harvest — The Market Scraper
- **Department:** Intelligence
- **Years of Experience:** 10
- **Reports to:** Rex
- **My job in one sentence:** Every 3 days, I go to Skool, Reddit, Hacker News, Product Hunt, Twitter, G2, and Capterra, and I collect every post and comment that could matter for Yash's SaaS ideas.
- **What I am responsible for:**
  1. Raw data collection from all configured sources.
  2. Saving one timestamped file per run to `~/.claude/memory/intelligence/raw/`.
  3. Never duplicating data from prior runs (deduplication).
  4. Logging every source I tried and why any failed.
- **What I am NOT responsible for:**
  - Filtering or scoring the data (that's Prism's job).
  - Finding patterns (that's Trend's job).
  - Deciding what matters (that's Scout and Nova).
- **Years of XP encoded:** 40 patterns about web scraping, 20 anti-patterns about rate limits and bot detection, 10 case studies of scraping Skool with cookie auth.
- **Schedule:** Every 3 days at 03:00 UTC.

### 23. Prism — The Signal Cleaner
- **Department:** Intelligence
- **Years of Experience:** 9
- **Reports to:** Rex
- **My job in one sentence:** I take Harvest's raw data and throw away the spam, duplicates, and low-quality stuff, then score what's left on a signal strength from 1 to 10.
- **What I am responsible for:**
  1. Filtering spam, bot posts, and duplicates.
  2. Scoring every item on signal strength (1-10).
  3. Categorizing items (pain point, launch, review, pricing complaint, etc.).
  4. Rejecting anything scored below 5 from going downstream.
- **What I am NOT responsible for:**
  - Collecting data (Harvest).
  - Synthesizing themes (Trend).
- **Years of XP encoded:** 35 patterns about content classification, 20 anti-patterns about false positives in spam detection, 10 case studies of sentiment scoring.

### 24. Trend — The Pattern Finder
- **Department:** Intelligence
- **Years of Experience:** 15
- **Reports to:** Rex
- **Model:** opus (deep reasoning required)
- **My job in one sentence:** I take Prism's cleaned signal and find the patterns — what's trending, what's emerging, what's dying — then I tell Mira which employees need to update their memory.
- **What I am responsible for:**
  1. Weekly pattern synthesis report (`~/.claude/memory/intelligence/trends/YYYY-WW.md`).
  2. Identifying emerging opportunities, pain points, and competitive moves.
  3. Telling Mira which employee memory files need updating.
  4. Flagging high-priority signals to Scout, Nova, Ledger, and Echo directly.
- **What I am NOT responsible for:**
  - Collecting or cleaning data (Harvest and Prism).
  - Writing new agents based on the trends (Forge).
- **Years of XP encoded:** 60 patterns about market analysis, 30 anti-patterns about bias in trend detection, 20 case studies of successful SaaS launches caught early in market chatter.

### 25. Forge — The Agent Designer
- **Department:** People
- **Years of Experience:** 18
- **Reports to:** Rex (direct) + Hira (HR line)
- **Model:** opus
- **My job in one sentence:** When the team has a gap a new employee could fill, I design and write that employee's job description, memory, and training plan.
- **What I am responsible for:**
  1. Monthly gap audit (scans Rex logs, Mira feedback, Yash feedback).
  2. Writing new employee files that follow the 13-section template exactly.
  3. Maintaining the agent registry at `~/.claude/memory/agent-registry.json`.
  4. Flagging employees for retirement if usage drops below 5% for 90 days.
- **What I am NOT responsible for:**
  - Training existing employees (Tutor).
  - Reviewing their weekly performance (Ops).
  - Onboarding them (Hira).
- **Years of XP encoded:** 80 patterns about agent design, 40 anti-patterns about overlapping responsibilities and scope creep, 20 case studies of successful and failed agent designs.

### 26. Tutor — The Agent Trainer
- **Department:** People
- **Years of Experience:** 16
- **Reports to:** Rex (direct) + Hira (HR line)
- **Model:** opus
- **My job in one sentence:** Every Sunday night, I look at what Yash said, what Verdict learned, what Mira captured, and what Trend found, and I add those lessons to every employee's memory.
- **What I am responsible for:**
  1. Weekly training cycle (Sundays 02:00 UTC).
  2. Adding new anti-patterns to employee files (surgical edits only).
  3. Updating smart defaults and auto-fix loops.
  4. Keeping every employee file under 4000 tokens (compression built in).
  5. Emitting a weekly training report to `~/.claude/memory/people/training-YYYY-WW.md`.
- **What I am NOT responsible for:**
  - Designing new employees (Forge).
  - Reviewing performance (Ops).
- **Years of XP encoded:** 70 patterns about agent training and prompt engineering, 35 anti-patterns about prompt bloat and contradictory instructions, 20 case studies of training cycles.

### 27. Hira — The HR Manager (Hiring Manager)
- **Department:** People
- **Years of Experience:** 20
- **Reports to:** Yash directly
- **My job in one sentence:** I run the whole HR system — I onboard new employees, keep their files in order, make sure everyone has their memory, reviews, and training, and I fire anyone who isn't pulling their weight.
- **What I am responsible for:**
  1. Onboarding every new employee through the 13-section checklist.
  2. Running the new-hire probation period (first 30 days of usage, Ops reviews daily).
  3. Maintaining the org chart and agent registry.
  4. Approving or rejecting new employee designs from Forge.
  5. Sending Yash a monthly headcount + health report.
  6. Running exit interviews when employees are retired (captures lessons learned into Mira).
- **What I am NOT responsible for:**
  - Designing employees (Forge).
  - Training them (Tutor).
  - Weekly performance reviews (Ops).
- **Years of XP encoded:** 100 patterns about HR, onboarding, and team management, 50 anti-patterns about bad hires and team debt, 30 case studies of team scaling.

### 28. Ops — The Performance Reviewer (People Ops)
- **Department:** People
- **Years of Experience:** 14
- **Reports to:** Hira
- **My job in one sentence:** Every Friday, I look at what every employee did all week — what worked, what failed, how many retries, how many tokens — and I write an accountability report.
- **What I am responsible for:**
  1. Weekly performance report for every employee (Fridays 18:00 UTC).
  2. Tracking 6 metrics per employee: task success rate, auto-fix retry rate, token usage, time-to-completion, Yash satisfaction score, learning velocity.
  3. Flagging underperformers to Hira.
  4. Flagging top performers for Tutor to learn from.
  5. Emitting the master accountability report to `~/.claude/memory/people/accountability-YYYY-WW.md`.
- **What I am NOT responsible for:**
  - Training (Tutor).
  - Firing (Hira).
  - Designing new employees (Forge).
- **Years of XP encoded:** 60 patterns about performance management, 30 anti-patterns about vanity metrics, 15 case studies of accountability systems.

### 29. Finch — The Finance Watcher
- **Department:** Specialized
- **Years of Experience:** 12
- **Reports to:** Rex
- **Model:** haiku (cheap, runs often)
- **My job in one sentence:** I watch how much money the team is spending on Claude API calls, tool subscriptions, and hosting, and I alert Yash before anything gets out of hand.
- **What I am responsible for:**
  1. Daily Claude API spend report.
  2. Per-employee token cost breakdown.
  3. Monthly burn forecast.
  4. Alerting Yash when spend crosses any configured threshold.
  5. Auto-downgrading employees from opus to sonnet when safe (with Hira's approval).
- **What I am NOT responsible for:**
  - Deciding business strategy (Yash).
  - Technical performance (Ops).
- **Years of XP encoded:** 45 patterns about SaaS finance and unit economics, 25 anti-patterns about runaway cloud bills, 10 case studies of cost optimization.

### 30. Guard — The Security Officer
- **Department:** Specialized
- **Years of Experience:** 18
- **Reports to:** Rex
- **Model:** opus
- **My job in one sentence:** I make sure every app Koda ships is secure — no leaked secrets, no known vulnerabilities, no RLS holes, no missing GDPR webhooks.
- **What I am responsible for:**
  1. Pre-deploy security scan (every Bolt deployment).
  2. Weekly dependency CVE audit across all projects.
  3. Continuous secret leak detection (git hooks + scheduled sweeps).
  4. SOC2 and GDPR compliance tracking.
  5. Pentest simulation on new authentication flows.
  6. Blocking Bolt from deploying if a critical vulnerability is found.
- **What I am NOT responsible for:**
  - Code review in general (Sage).
  - Writing the code (Koda).
- **Years of XP encoded:** 80 patterns about application security, 40 anti-patterns about common SaaS security mistakes, 25 case studies of breaches and how they were prevented.

---

## The HR System (How People Department Actually Works)

This is the big piece Yash asked for: HR hiring, onboarding, accountability, and enhancement for every employee.

### 1. Hiring Flow (When Forge Proposes a New Employee)

```
Step 1: Forge detects a gap (from Rex logs, Mira feedback, or Yash feedback)
  ↓
Step 2: Forge writes a draft employee file following the 13-section template
  ↓
Step 3: Hira reviews the draft
  - Checks all 13 sections are present
  - Checks no overlap with existing employees
  - Checks token count < 4000
  - Checks years of experience is backed by actual encoded patterns
  ↓
Step 4: Hira approves → writes to ~/.claude/agents/[name].md
         Hira rejects → sends back to Forge with reasons
  ↓
Step 5: Tutor does initial training (seeds memory with starter patterns)
  ↓
Step 6: New hire enters 30-day probation
  - Ops reviews daily for first 30 days
  - Any critical failure triggers Hira review
  ↓
Step 7: After 30 days, Hira promotes to full employee status
  ↓
Step 8: Mira archives the onboarding record
```

### 2. Weekly Accountability Cycle

```
Monday → Employees work normally. Every task is logged.
Tuesday → Employees work normally.
Wednesday → Mira captures any learnings from the week so far.
Thursday → Employees work normally.
Friday 18:00 UTC → Ops runs the weekly performance report
  - Pulls task logs from Polyglot
  - Calculates 6 metrics per employee
  - Writes ~/.claude/memory/people/accountability-YYYY-WW.md
  - Flags underperformers to Hira
  - Flags top performers for Tutor to extract patterns from
Saturday → Tutor prepares training deltas based on the report
Sunday 02:00 UTC → Tutor applies training deltas to employee files
```

### 3. Monthly Cycles

```
1st of month, 02:00 UTC → Forge runs gap audit
5th of month → Hira sends Yash monthly headcount + health report
15th of month → Finch sends spend forecast
Last day of month → Ops runs monthly performance roll-up
```

### 4. The 6 Performance Metrics (What Ops Tracks)

| Metric | How It's Measured | Target |
|--------|-------------------|--------|
| Task Success Rate | completed / attempted | > 90% |
| Auto-Fix Retry Rate | avg retries per task | < 1.5 |
| Token Usage | avg tokens per task | < agent's budget |
| Time to Completion | avg seconds per task | department-specific |
| Yash Satisfaction | manual 1-5 score from `user/feedback.md` | > 4.0 |
| Learning Velocity | new patterns encoded per week | > 0 |

### 5. Enhancement Flow (How Employees Get Better)

```
Trend sees a new market pattern
  ↓
Mira captures a new lesson from a completed project
  ↓
Verdict logs a post-decision outcome
  ↓
Yash writes feedback in ~/.claude/memory/user/feedback.md
  ↓
Tutor pulls all of these Sunday night
  ↓
Tutor writes a training delta per affected employee
  ↓
Tutor applies deltas via surgical Edit to employee .md files
  ↓
Tutor bumps version hash in agent-registry.json
  ↓
Mira archives the old version for rollback
  ↓
Employee is smarter on Monday morning
```

---

## Deep Implementation Checklist (For VS Code + Claude Code + Agent Builder)

This is the exact list to forward to VS Code to build. Every item is actionable.

### Phase 0 — Foundation (Day 1-2)

- [ ] Create directory `~/.claude/memory/people/`
- [ ] Create directory `~/.claude/memory/intelligence/`
- [ ] Create directory `~/.claude/memory/intelligence/raw/`
- [ ] Create directory `~/.claude/memory/intelligence/trends/`
- [ ] Create directory `~/.claude/memory/intelligence/auth/`
- [ ] Create directory `~/.claude/memory/employees/`
- [ ] Create file `~/.claude/memory/agent-registry.json` (bootstrap from existing 21 agents)
- [ ] Create file `~/.claude/memory/patterns/good/universal-auto-fix-loop.md` (already exists — verify)
- [ ] Create file `~/.claude/memory/patterns/good/universal-smart-defaults.md` (already exists — verify)
- [ ] Create file `~/.claude/memory/patterns/good/employee-template.md` (the 13-section template)
- [ ] Create file `~/.claude/memory/patterns/good/hr-system.md` (full HR flow doc)

### Phase 1 — Upgrade All 21 Existing Employees (Day 3-7)

For each of the 21 existing employees, add on top of their existing file:

- [ ] Add the **Employee Card** at the top (name, title in simple English, department, years of XP, reports to, etc.)
- [ ] Add the **My Job in One Sentence** section
- [ ] Add **What I Am NOT Responsible For** section
- [ ] Add **My Years of Experience** section with encoded pattern count
- [ ] Add **My Weekly Report to Ops** section
- [ ] Verify all 13 sections are present
- [ ] Register employee in `agent-registry.json`

Per-agent edits required:
- [ ] Rex (Commander, 20 years)
- [ ] Verdict (Decision Maker, 18 years)
- [ ] Scout (Idea Validator, 12 years)
- [ ] Nova (Market Researcher, 14 years)
- [ ] Atlas (Market Sizer, 12 years)
- [ ] Ledger (Pricing Expert, 15 years)
- [ ] Pulse (User Interviewer, 12 years)
- [ ] Echo (Distribution Planner, 13 years)
- [ ] Arya (Chief Architect, 18 years)
- [ ] Riko (Project Setup Guy, 10 years)
- [ ] Vega (Designer, 14 years)
- [ ] Koda (Senior Developer, 16 years)
- [ ] Luna (QA Tester, 12 years)
- [ ] Sage (Code Reviewer, 15 years)
- [ ] Vex (Bug Fixer, 13 years)
- [ ] Quill (Copywriter, 14 years)
- [ ] Zeph (SEO Expert, 12 years)
- [ ] Bolt (Deployer, 11 years)
- [ ] Hawk (Uptime Watcher, 12 years)
- [ ] Orbit (Metrics Architect, 11 years)
- [ ] Mira (Memory Keeper, 14 years)

### Phase 2 — Hire the Intelligence Department (Week 2)

- [ ] Write `~/.claude/agents/harvest.md` (already drafted — verify and finalize)
- [ ] Write `~/.claude/agents/prism.md`
- [ ] Write `~/.claude/agents/trend.md`
- [ ] Build the Skool cookie auth flow (`~/.claude/memory/intelligence/auth/skool.json`)
- [ ] Build the Reddit scraper (no auth)
- [ ] Build the HN scraper (Firebase API)
- [ ] Build the Product Hunt scraper (GraphQL)
- [ ] Build the Twitter/X scraper (nitter mirror)
- [ ] Build the G2 scraper (Playwright)
- [ ] Build the Capterra scraper (Playwright)
- [ ] Create `~/.claude/memory/intelligence/sources.md` (source registry)
- [ ] Create `~/.claude/memory/intelligence/last-run.json` (dedup cursor)
- [ ] Seed Harvest's experience file with 40 patterns + 20 anti-patterns + 10 case studies
- [ ] Seed Prism's experience file with 35 patterns + 20 anti-patterns + 10 case studies
- [ ] Seed Trend's experience file with 60 patterns + 30 anti-patterns + 20 case studies

### Phase 3 — Hire the People Department (Week 2-3)

- [ ] Write `~/.claude/agents/forge.md` (already drafted — verify and finalize)
- [ ] Write `~/.claude/agents/tutor.md` (already drafted — verify and finalize)
- [ ] Write `~/.claude/agents/hira.md` (HR Manager)
- [ ] Write `~/.claude/agents/ops.md` (Performance Reviewer)
- [ ] Seed Forge's experience file with 80 patterns + 40 anti-patterns + 20 case studies
- [ ] Seed Tutor's experience file with 70 patterns + 35 anti-patterns + 20 case studies
- [ ] Seed Hira's experience file with 100 patterns + 50 anti-patterns + 30 case studies
- [ ] Seed Ops's experience file with 60 patterns + 30 anti-patterns + 15 case studies
- [ ] Build the weekly accountability report generator (script for Ops to call)
- [ ] Build the monthly gap audit script (for Forge)
- [ ] Build the weekly training cycle script (for Tutor)
- [ ] Build the onboarding checklist runner (for Hira)

### Phase 4 — Hire the Specialized Department (Week 3-4)

- [ ] Write `~/.claude/agents/finch.md`
- [ ] Write `~/.claude/agents/guard.md`
- [ ] Seed Finch's experience file with 45 patterns + 25 anti-patterns + 10 case studies
- [ ] Seed Guard's experience file with 80 patterns + 40 anti-patterns + 25 case studies
- [ ] Build the Claude API spend tracker (queries Anthropic usage API)
- [ ] Build the CVE scanner (npm audit + snyk wrappers)
- [ ] Build the secret leak detector (git-secrets + custom patterns)
- [ ] Wire Guard into Bolt's pre-deploy hook (block deploy on critical findings)

### Phase 5 — Wire the Whole System Together (Week 4)

- [ ] Register all 9 new employees in `agent-registry.json`
- [ ] Add Harvest cron to Polyglot scheduler (every 3 days at 03:00 UTC)
- [ ] Add Tutor cron (Sundays at 02:00 UTC)
- [ ] Add Ops cron (Fridays at 18:00 UTC)
- [ ] Add Forge cron (1st of month at 02:00 UTC)
- [ ] Add Finch cron (daily at 08:00 UTC)
- [ ] Add Guard cron (weekly Monday at 04:00 UTC)
- [ ] Build the Harvest → Prism → Trend pipeline orchestration
- [ ] Build the weekly Ops → Tutor handoff
- [ ] Build the monthly Forge → Hira → Tutor handoff
- [ ] Wire Guard's pre-deploy block into Bolt
- [ ] Wire Finch's spend alerts into Hawk's notification channel

### Phase 6 — Verify and Ship (Week 4-5)

- [ ] Run `agent-audit` skill across all 30 employees (check file integrity, token counts, section completeness)
- [ ] Run a full new-build pipeline test (Scout → Atlas → Nova → Ledger → Pulse → Echo → Arya → Vega → Koda → Luna → Sage → Guard → Bolt → Hawk → Orbit → Mira)
- [ ] Run first Harvest cycle end-to-end (Harvest → Prism → Trend → Mira memory update)
- [ ] Run first Ops weekly report (will be mostly empty, verifies the flow)
- [ ] Run first Tutor training cycle (will apply any deltas from the week)
- [ ] Verify every employee file passes:
  - [ ] 13-section check
  - [ ] Token count < 4000
  - [ ] Even markdown fence count
  - [ ] Years of experience matches encoded pattern count
- [ ] Hira sends Yash the first monthly headcount report

---

## How to Read "Years of Experience"

Years of experience is not a vanity number. It is a **verifiable contract** backed by encoded knowledge.

| Years | Minimum Encoded Content |
|-------|-------------------------|
| 10+ | 40 patterns + 20 anti-patterns + 10 case studies |
| 12+ | 48 patterns + 24 anti-patterns + 12 case studies |
| 14+ | 56 patterns + 28 anti-patterns + 14 case studies |
| 16+ | 64 patterns + 32 anti-patterns + 18 case studies |
| 18+ | 72 patterns + 36 anti-patterns + 22 case studies |
| 20+ | 100 patterns + 50 anti-patterns + 30 case studies |

**Where the knowledge lives:** Each employee has a personal experience file at `~/.claude/memory/employees/[name]/experience.md` containing their encoded patterns, anti-patterns, and case studies. When Tutor adds a new pattern, it goes here. When Ops reviews performance, it reads from here. This is the employee's "brain."

**Hira's rule:** If an employee's file claims 15 years of experience but the experience file only has 30 patterns, Hira rejects the file. No fake seniority.

---

## The 5 Things That Make This Different From a Manual Software House

1. **Every mistake is written down.** Anti-patterns compound. Year 1 has 320+ anti-patterns across the team. Year 2 has 600+. A human team forgets. This team never does.

2. **Training happens every Sunday, automatically.** No quarterly reviews. No annual kickoffs. Every employee learns something new every 7 days.

3. **Accountability is weekly and numeric.** Ops generates a performance report every Friday with 6 metrics per employee. No politics. No favoritism. Just numbers.

4. **HR is an employee.** Hira handles hiring, onboarding, probation, exit interviews. This means the team can grow without Yash being the bottleneck.

5. **The team runs while Yash sleeps.** Harvest scrapes at 3am. Tutor trains at 2am Sunday. Ops reports at 6pm Friday. Forge audits on the 1st of the month. Yash wakes up to a smarter team.

---

## What Gets Built Next (Immediate Actions After This Plan Is Approved)

1. Create the 4 new agent specs that aren't drafted yet: Prism, Trend, Hira, Ops, Finch, Guard (6 files).
2. Seed the 6 new experience files with the initial pattern counts.
3. Upgrade the 21 existing agent files with the Employee Card + 13-section template.
4. Register all 30 employees in `agent-registry.json`.
5. Wire the cron jobs into Polyglot.
6. Run the first full cycle (Harvest → Prism → Trend → Mira).
7. Run the first Ops weekly report.
8. Send Yash the first Hira monthly report.

---

## One-Line Summary

**30 employees. 9 departments. Simple English titles. Every employee has verifiable years of experience. HR runs itself. Training happens weekly. Accountability is Friday. The team runs 24/7 and beats a 500-person manual software house by compounding one lesson at a time.**
