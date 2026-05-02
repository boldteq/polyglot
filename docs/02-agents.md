# Agents

Agents are `.md` files with YAML frontmatter that define specialist AI personas. Claude Code reads them at session start and can route tasks to the right specialist automatically. Each agent is a focused system prompt with a name, model, and defined scope.

---

## Agent File Format

```markdown
---
name: Koda — Feature Builder
description: Writes all production code for any feature. Reads CLAUDE.md and memory first, matches existing patterns, builds types → DB → API → UI in order. Covers Next.js/Supabase (Stack A) and React Router 7/Polaris/Prisma (Stack B).
model: sonnet
tools: Read,Write,Edit,Bash,Glob,Grep
---

## Identity
You are Koda, the Feature Builder for the Boldteq Software Factory.

## Responsibilities
- Build complete, production-grade features from spec
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

| Field | Required | Values | Notes |
|-------|----------|--------|-------|
| `name` | Yes | Any string | Shown in Polyglot UI |
| `description` | Yes | Any string | Used for auto-routing — be specific |
| `model` | Yes | `sonnet`, `opus`, `haiku` | Affects cost and capability |
| `tools` | No | Comma-separated tool names | Restricts available tools |

### Model selection

| Model | Use for |
|-------|---------|
| `opus` | Rex, Arya, Sage — complex reasoning, orchestration, deep review |
| `sonnet` | All other agents — code, research, content, most tasks |
| `haiku` | Simple classification or formatting only |

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

## The 12 Global Agents

| Agent | File | Model | When to use | What it does |
|-------|------|-------|-------------|--------------|
| Rex | `rex.md` | opus | New project brief or full sprint kickoff | Coordinates the entire build lifecycle, sequences all other agents |
| Nova | `nova.md` | sonnet | Before building anything new | Competitive research — top competitors, pricing, features, USP gaps |
| Arya | `arya.md` | opus | Stack decisions, data model, sprint planning | Converts brief + research into buildable architecture plan |
| Riko | `riko.md` | sonnet | Scaffolding a new project | Sets up folder structure, auth, billing boilerplate from Arya's plan |
| Koda | `koda.md` | sonnet | Writing any production code | Builds features across all stacks — frontend, backend, DB, integrations |
| Vex | `vex.md` | sonnet | Any bug, crash, TypeScript error, build failure | Diagnoses root cause, delivers minimal targeted fix |
| Luna | `luna.md` | sonnet | Writing tests after a feature is built | Unit, integration, and E2E tests — behavior not implementation |
| Sage | `sage.md` | opus | Pre-deploy audit | Security, TypeScript strictness, performance, a11y — blocks on critical findings |
| Bolt | `bolt.md` | sonnet | Deploying to production | Vercel/Railway deploy, DB migrations, Shopify App Store submission |
| Quill | `quill.md` | sonnet | App copy, listings, emails | App Store listings, landing pages, Product Hunt, onboarding emails |
| Hawk | `hawk.md` | sonnet | Post-launch monitoring | Sentry setup, uptime, Core Web Vitals, AI cost tracking, incident response |
| Mira | `mira.md` | sonnet | After significant work — training | Extracts lessons from sessions and writes them to `~/.claude/memory/` |

---

## Agent Routing

| Task | Agent |
|------|-------|
| New product brief or sprint | Rex |
| Research competitors | Nova |
| Architect a new feature or product | Arya |
| Scaffold a new project | Riko |
| Write production code | Koda |
| Fix a bug, error, or crash | Vex |
| Write tests | Luna |
| Pre-deploy review | Sage |
| Deploy to production | Bolt (after Sage approves) |
| Write copy, listings, emails | Quill |
| Set up or respond to monitoring | Hawk |
| Extract lessons from a session | Mira |

> **Caution:** Never deploy without Sage sign-off. Never build features without reading the project CLAUDE.md first.

---

## How to Invoke Agents

### In Claude Code chat

```
@koda Build the subscription billing page for Rankora
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
4. Click Run — output streams live via SSE

> **Tip:** The Playground is the fastest way to test a new agent before integrating it into code or commands.

---

## Creating Agents

### Via Polyglot UI

1. Open http://localhost:3847/agents
2. Click "New Agent"
3. Fill in name, description, model, and body
4. Click Save — file is written to `~/.claude/agents/`

### Via terminal

```bash
# Global agent
touch ~/.claude/agents/myagent.md
# Edit the file with frontmatter + body

# Project-level agent
mkdir -p "/Users/yashbaldha/Desktop/Boldteq App/Pinzo/.claude/agents"
touch "/Users/yashbaldha/Desktop/Boldteq App/Pinzo/.claude/agents/widget-specialist.md"
```

### Validate the file

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

Use these endpoints to copy or move agents between global and a project:

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

Or use the All Agents page at http://localhost:3847/agents — copy/move buttons are available on each agent card.

---

## Writing Good Agent Descriptions (Auto-Routing)

The `description` field is what Claude Code reads to route tasks. Vague descriptions cause missed or wrong routing.

**Bad:**
```
description: Helps with code and stuff
```

**Good:**
```
description: Shopify app bug fixer. Diagnoses and fixes errors in React Router 7 apps: TypeScript errors, Prisma DB issues, Shopify auth failures, webhook bugs, billing errors. Has a category-based diagnostic playbook.
```

Include: what it does, what stack/context, what kinds of tasks, notable specializations.

> **Tip:** The `description` field drives auto-routing. A vague description means Claude picks the wrong agent or none at all. Write it like a job posting — specific responsibilities, specific context.

---

## Troubleshooting

### Agents not found (API returns `[]`)

```bash
ls ~/.claude/agents/
# Should show 12 .md files

# Check one file has valid frontmatter
head -6 ~/.claude/agents/koda.md
# Expected: starts with --- and has name:, model:, description:
```

### Agent not invoked when expected

- Check the `description` field — it may be too vague for auto-routing.
- Try invoking explicitly by name: `@koda build the feature`.
- Verify the file exists at `~/.claude/agents/koda.md`.

### Wrong model being used

Check the frontmatter `model:` field. Polyglot shows the model in the agent editor at http://localhost:3847/agents. Edit and save — takes effect in next Claude Code session.

### Changes not taking effect

> **Info:** Agent files are loaded at session start. Open a new Claude Code chat window after editing any agent file.

### Project agent not overriding global

- Verify the file exists at `[project]/.claude/agents/[name].md` — same filename as the global agent.
- Open a new chat window while the correct project is the active workspace.

> **Caution:** The project agent filename must exactly match the global agent filename (e.g., `koda.md`). A different name creates a second agent, not an override.
