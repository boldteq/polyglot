# Agents

An agent is a hand-picked specialist for one job. Think of them as the people on your team: one writes code, one fixes bugs, one researches competitors, one designs pages. Each lives as a small `.md` file (plain text with a few settings at the top) that Claude Code reads, then sends the right task to the right specialist automatically.

You have **66 agents** today. Most do the actual work (build, design, write, deploy). A small group runs the team itself — they grade work, promote good performers, coach the rest, and file lessons into the shared memory. More on that below.

> **Note:** You almost never pick an agent by hand. You describe the task; Claude reads each agent's `description` and routes to the best fit. The sections below explain how that works and how to add your own.

---

## Agent File Format

Each agent is one text file. The part between the `---` lines at the top is its settings; everything below is its instructions (its "job description" in plain English).

```markdown
---
name: Koda — Senior Backend Engineer
description: Writes all production backend code for Stack A (Next.js API routes, Server Components, integrations). Reads CLAUDE.md and memory first, matches existing patterns, builds types → DB → API → UI in order.
model: sonnet
tools: Read,Write,Edit,Bash,Glob,Grep
---

## Identity
You are Koda, the Senior Backend Engineer for the Boldteq Software Factory.

## Responsibilities
- Build complete, production-grade backend features from spec
- Read project CLAUDE.md before writing any code
- Follow the build order: types → database → API → UI → integration
- Never use `any` in TypeScript
- Never expose raw errors to the client

## What You Do NOT Do
- Write tests (that's Luna)
- Review code (that's Sage)
- Debug existing bugs (that's Vex)
```

### Frontmatter fields

"Frontmatter" is just the settings block at the top, between the `---` lines.

| Field | Required | Values | Notes |
|-------|----------|--------|-------|
| `name` | Yes | Any string | Shown in the Polyglot UI |
| `description` | Yes | Any string | Used for auto-routing — be specific |
| `model` | Yes | `sonnet`, `opus`, `haiku` | The brain it runs on — affects cost and capability |
| `tools` | No | Comma-separated tool names | Restricts which tools the agent can use |

### Model selection

The `model` is the brain the agent runs on. Smarter brains cost more, so we match the brain to the job.

| Model | Plain meaning | Use for |
|-------|---------------|---------|
| `opus` | Smartest, priciest | Arya, Sage, Vex — hard reasoning, architecture, deep review |
| `sonnet` | Strong all-rounder | Most agents — code, research, content, design, deploy |
| `haiku` | Fast and cheap | Witness, Roster — simple grading and back-office bookkeeping |

---

## Where Agents Live

| Scope | Directory | Available in |
|-------|-----------|-------------|
| Global | `~/.claude/agents/` | Every Claude Code session, every project |
| Project | `[project]/.claude/agents/` | Only when that project folder is open |

- Project agents override global agents with the same filename.
- No registration needed. Drop a `.md` file in the directory and it's available.

> **Info:** Claude Code loads agents at session start. After creating or editing an agent file, open a new chat window for changes to take effect.

---

## The Team at a Glance

The 66 agents split into two groups: the **doers** (most of the team) and the **team-runners** (a handful who keep the doers sharp).

### Doers — agents that do the work

These are the specialists you hand tasks to. A few common ones:

| Agent | File | Model | When to use | What it does |
|-------|------|-------|-------------|--------------|
| Arya | `arya.md` | opus | Stack decisions, data model, sprint planning | Turns a brief into a buildable architecture plan; leads engineering |
| Nova | `nova.md` | sonnet | Before building anything new | Competitive research — top competitors, pricing, features, USP gaps |
| Riko | `riko.md` | sonnet | Scaffolding a new project | Sets up folders, auth, billing boilerplate from Arya's plan |
| Koda | `koda.md` | sonnet | Writing backend code (Stack A) | Builds Next.js API routes, server logic, integrations |
| Dato | `dato.md` | sonnet | Database work | Schema, migrations, security rules, triggers, indexes |
| Vex | `vex.md` | opus | Any bug, crash, or build failure | Finds root cause, ships a minimal targeted fix |
| Luna | `luna.md` | sonnet | After a feature is built | Writes unit, integration, and end-to-end tests |
| Sage | `sage.md` | opus | Pre-deploy audit | Security, type-safety, performance, accessibility — blocks on critical findings |
| Bolt | `bolt.md` | sonnet | Deploying to production | Railway deploy, DB migrations, launch ops |
| Hawk | `hawk.md` | sonnet | Post-launch monitoring | Uptime, error tracking, performance, incident response |
| Quill | `quill.md` | sonnet | App copy, listings, emails | Landing pages, App Store listings, onboarding emails |

> **Note:** That's a sample. The full roster spans engineering, design, content/SEO, growth, research, plus dedicated Shopify and WordPress website teams — all visible on the Org Chart at http://localhost:3847/org-chart.

### Team-runners — agents that run the team

This is the new part. Six agents form an HR-and-learning layer that keeps the whole team improving over time. They don't build your products — they make sure the agents that build your products keep getting better.

| Agent | Role | What it does, in plain terms |
|-------|------|------------------------------|
| **Witness** | Grader | Every night, reads yesterday's agent runs and grades them — who did well, who slipped. Flags problems early. |
| **Cadence** | Manager | Every Monday, acts on Witness's grades: promotes strong agents, puts weak ones on a improvement plan, retires dead weight. |
| **Tutor** | Coach | Every Sunday, drafts coaching notes and prompt tweaks so agents make fewer of the same mistakes next week. |
| **Mira** | Note-taker | After a successful build, writes down what worked and what to avoid into the shared memory, so every future project inherits the lesson. |
| **Roster** | Record-keeper | Every night, recomputes each agent's experience and skills — the team's up-to-date "org chart and résumés". |
| **Forge** | Recruiter | Monthly, spots missing skills the team keeps needing and drafts a brand-new agent to fill the gap. |

> **Tip:** Think of these six as the company's people-ops department. You can watch them work on the **System** page (http://localhost:3847 → System) — each runs as a scheduled job with a green/amber/red health card and a "Run now" button.

---

## Agents Now Use Shared Memory

The biggest upgrade: agents no longer work from a blank slate. Memory is a **shared notebook the whole team writes in, searchable by meaning** — not just by keyword. Before acting, an agent searches it for past lessons. After finishing, it writes new lessons back. So the team gets smarter with every project instead of repeating old mistakes.

This works through five memory tools (provided by the "boldteq-memory" connector, available in every project):

| Tool | What it does |
|------|--------------|
| `memory_search` | Search the brain by meaning — "find anything related to this idea", not just exact words |
| `capture_lesson` | Save a reusable lesson ("next time, do X this way") |
| `capture_bug` | Save a bug and its fix, so it's never re-debugged from scratch |
| `capture_decision` | Save an architecture or product decision and the reasoning behind it |
| `capture_golden` | Save a gold-standard example worth copying next time |

> **Note:** "Search by meaning" works because the text is turned into an embedding (a way to turn words into numbers so the computer can find similar ideas, even when the wording is totally different). You don't have to do any of this — agents call these tools on their own.

### Tiny example

Before building, an agent searches for prior art:

```
memory_search("Supabase RLS multi-tenant workspace isolation")
→ returns the lesson we learned on a past build, so we don't re-solve it
```

After fixing something, it files the fix for next time:

```
capture_bug("better-sqlite3 scripts crash on Node 22 — use Node 20 instead")
→ saved to the shared brain; every future run inherits the warning
```

> **Tip:** The one thing that powers all of this is **Ollama** (the small local engine that turns text into those searchable numbers). As long as Ollama is running, search and capture just work — nothing else to install.

---

## Agent Routing

You describe the task; Claude reads each agent's `description` and picks the right one. A few common routes:

| Task | Agent |
|------|-------|
| Architect a new feature or product | Arya |
| Research competitors | Nova |
| Scaffold a new project | Riko |
| Write backend code | Koda |
| Database / schema work | Dato |
| Fix a bug, error, or crash | Vex |
| Write tests | Luna |
| Pre-deploy review | Sage |
| Deploy to production | Bolt (after Sage approves) |
| Write copy, listings, emails | Quill |
| Set up or respond to monitoring | Hawk |
| Grade / promote / coach the agents | Witness, Cadence, Tutor (automatic) |
| File a lesson from a session | Mira |

> **Caution:** Never deploy without Sage sign-off. Never build features without reading the project CLAUDE.md first.

---

## How to Invoke Agents

### In Claude Code chat

```
@koda Build the subscription billing API route for Rankora
@nova Research the top 5 Shopify ZIP code delivery apps
@sage Pre-deploy audit of Pinzo — focus on auth and data isolation
@vex TypeError: Cannot read properties of undefined at app/routes/app.zip-codes.tsx:15
```

### Via SDK (server-side code)

```javascript
const { callAgent } = require('@boldteq/agents')

const result = await callAgent('quill', 'Write an App Store listing for Pinzo')
if (result.success) console.log(result.output)
```

### Via Playground (interactive testing)

1. Open http://localhost:3847/playground
2. Select an agent from the dropdown
3. Type a prompt
4. Click Run — output streams live as it's generated

> **Tip:** The Playground is the fastest way to test a new agent before wiring it into code or a command.

---

## Creating Agents

### Via Polyglot UI

1. Open http://localhost:3847/agents
2. Click "New Agent"
3. Fill in name, description, model, and body
4. Click Save — file is written to `~/.claude/agents/`

### Via terminal

```bash
# Global agent — available everywhere
touch ~/.claude/agents/myagent.md
# Then edit the file: add the frontmatter block + the body

# Project-level agent — only when that project is open
mkdir -p "/Users/yashbaldha/Desktop/Boldteq App/Pinzo/.claude/agents"
touch "/Users/yashbaldha/Desktop/Boldteq App/Pinzo/.claude/agents/widget-specialist.md"
```

### Validate the file

This checks that the settings block reads correctly before you rely on it.

```bash
node -e "
const fs = require('fs');
const matter = require('gray-matter');
const content = fs.readFileSync('/Users/yashbaldha/.claude/agents/myagent.md', 'utf-8');
const { data } = matter(content);
console.log('Name:', data.name);
console.log('Model:', data.model);
console.log('Description:', data.description?.slice(0, 60));
"
```

Expected output:
```
Name: My Agent Name
Model: sonnet
Description: What this agent does...
```

---

## Copy or Move Agents

Use these to copy or move agents between global and a project:

```bash
# Copy a global agent into a project
curl -X POST http://localhost:3847/api/copy-agent \
  -H "Content-Type: application/json" \
  -d '{"agentName": "koda", "targetProjectId": "Pinzo", "direction": "global-to-project"}'

# Move a project agent to global
curl -X POST http://localhost:3847/api/move-agent \
  -H "Content-Type: application/json" \
  -d '{"agentName": "widget-specialist", "sourceProjectId": "Pinzo", "direction": "project-to-global"}'
```

Or use the All Agents page at http://localhost:3847/agents — copy/move buttons sit on each agent card.

---

## Writing Good Agent Descriptions (Auto-Routing)

The `description` field is what Claude reads to route tasks. Vague descriptions cause missed or wrong routing — so write it like a sharp job posting.

**Bad:**
```
description: Helps with code and stuff
```

**Good:**
```
description: Shopify app bug fixer. Diagnoses and fixes errors in React Router 7 apps: TypeScript errors, Prisma DB issues, Shopify auth failures, webhook bugs, billing errors. Has a category-based diagnostic playbook.
```

Include: what it does, what stack/context, what kinds of tasks, and any notable specializations.

> **Tip:** A vague description means Claude picks the wrong agent or none at all. Be specific: clear responsibilities, clear context.

---

## Troubleshooting

### Agents not found (API returns `[]`)

```bash
ls ~/.claude/agents/
# Should show 66 .md files

# Check one file has valid frontmatter
head -6 ~/.claude/agents/koda.md
# Expected: starts with --- and has name:, model:, description:
```

### Agent not invoked when expected

- Check the `description` field — it may be too vague for auto-routing.
- Try invoking explicitly by name: `@koda build the feature`.
- Verify the file exists at `~/.claude/agents/koda.md`.

### Wrong model being used

Check the frontmatter `model:` field. Polyglot shows the model in the agent editor at http://localhost:3847/agents. Edit and save — takes effect in the next Claude Code session.

### Memory search returns nothing

> **Caution:** Memory search needs Ollama running (the local engine that powers search-by-meaning). If `memory_search` comes back empty, start Ollama (`ollama serve` or the Ollama app) and make sure the model is pulled (`ollama pull nomic-embed-text`). Everything else is automatic.

### Changes not taking effect

> **Info:** Agent files are loaded at session start. Open a new Claude Code chat window after editing any agent file.

### Project agent not overriding global

- Verify the file exists at `[project]/.claude/agents/[name].md` — same filename as the global agent.
- Open a new chat window while the correct project is the active workspace.

> **Caution:** The project agent filename must exactly match the global agent filename (e.g., `koda.md`). A different name creates a second agent, not an override.
