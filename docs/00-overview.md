# Polyglot — Complete Reference

Polyglot is a local web application that manages the Boldteq Software Factory: agents, CLAUDE.md files, slash commands, rules, memory, orchestration, and AI tooling — all through a browser dashboard and REST API.

**Architecture:** Express server on `http://localhost:3847`. Serves a React SPA (`public-dist/`) and a REST API. Agent calls stream via SSE. Kept alive by pm2 + macOS LaunchAgent.

> **Info:** Polyglot runs entirely on your Mac — no cloud dependency. All agent calls use your existing Claude subscription.

---

## The Five Systems

| System | What it is | Global location | Project location |
|--------|-----------|-----------------|------------------|
| CLAUDE.md | Global briefing — read by Claude Code on every session start | `~/.claude/CLAUDE.md` | `[project]/CLAUDE.md` |
| Agents | Specialist `.md` files — define AI personas with system prompts | `~/.claude/agents/` | `[project]/.claude/agents/` |
| Commands | Slash command `.md` files — become `/commandname` shortcuts | N/A | `[project]/.claude/commands/` |
| Rules | Rule `.md` files — project-specific behavioral constraints | N/A | `[project]/.claude/rules/` |
| Memory | Accumulated lessons from all builds | `~/.claude/memory/` | N/A |

---

## Dashboard Pages

| Page | Route | What it does |
|------|-------|--------------|
| Dashboard | `/` | Overview of all projects, agents, and system status |
| All Agents | `/agents` | Browse and edit all global agents |
| All Commands | `/commands` | Browse slash commands across all projects |
| All Rules | `/rules` | Browse rules across all projects |
| Orchestration | `/orchestration` | Visual DAG workflow builder for chaining agents |
| Playground | `/playground` | Test any agent interactively with live SSE output |
| Memory Brain | `/memory` | Browse and edit `~/.claude/memory/` files |
| Documentation | `/docs` | These docs, rendered in the browser |
| How It Works | `/how-it-works` | Architecture diagram and system explanation |
| Setup & Status | `/setup` | System health checks, SDK installer, project list |
| Settings | `/settings` | Configure project directories and Claude model |
| Global CLAUDE.md | `/global/claude-md` | View and edit `~/.claude/CLAUDE.md` |

---

## Complete API Endpoint Reference

### Config

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/config` | Get current config (projectDirs) |
| `POST` | `/api/config/project-dirs` | Update project directory list |

### Global CLAUDE.md

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/global/claude-md` | Read `~/.claude/CLAUDE.md` |
| `PUT` | `/api/global/claude-md` | Write `~/.claude/CLAUDE.md` |

### Global Agents

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/global/agents` | List all agents in `~/.claude/agents/` |
| `GET` | `/api/global/agents/:name` | Get one agent by filename |
| `PUT` | `/api/global/agents/:name` | Create or update an agent file |
| `DELETE` | `/api/global/agents/:name` | Delete an agent file |

### Global Settings

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/global/settings` | Read global settings (model, effort, permissions) |
| `PUT` | `/api/global/settings` | Write global settings |

### Projects

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/projects` | Discover all projects from configured dirs |
| `GET` | `/api/projects/:id/claude-md` | Read project CLAUDE.md |
| `PUT` | `/api/projects/:id/claude-md` | Write project CLAUDE.md |
| `GET` | `/api/projects/:id/agents` | List project-level agents |
| `GET` | `/api/projects/:id/agents/:name` | Get one project agent |
| `PUT` | `/api/projects/:id/agents/:name` | Create or update a project agent |
| `DELETE` | `/api/projects/:id/agents/:name` | Delete a project agent |
| `GET` | `/api/projects/:id/commands` | List project slash commands |
| `GET` | `/api/projects/:id/commands/:name` | Get one command |
| `PUT` | `/api/projects/:id/commands/:name` | Create or update a command |
| `DELETE` | `/api/projects/:id/commands/:name` | Delete a command |
| `GET` | `/api/projects/:id/rules` | List project rules |
| `GET` | `/api/projects/:id/rules/:name` | Get one rule |
| `PUT` | `/api/projects/:id/rules/:name` | Create or update a rule |
| `DELETE` | `/api/projects/:id/rules/:name` | Delete a rule |

### Unified (merged global + all projects)

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/unified/agents` | All agents, global + all projects, merged |
| `GET` | `/api/unified/commands` | All commands across all projects |
| `GET` | `/api/unified/rules` | All rules across all projects |

### Agent Operations

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/api/copy-agent` | Copy an agent between global and a project |
| `POST` | `/api/move-agent` | Move an agent between global and a project |

### AI Chat

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/api/ai/chat` | Non-streaming chat with the AI assistant |
| `POST` | `/api/ai/stream` | Streaming chat via SSE |
| `GET` | `/api/ai/context` | Get all system context injected into the chat |
| `POST` | `/api/ai/apply` | Apply an AI-suggested file change to disk |
| `GET` | `/api/ai/history` | List all chat history sessions |
| `GET` | `/api/ai/history/:id` | Get one history session |
| `POST` | `/api/ai/history` | Save a chat session to history |
| `DELETE` | `/api/ai/history/:id` | Delete a history session |

### Memory

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/memory` | List all files in `~/.claude/memory/` |
| `GET` | `/api/memory/file` | Read a memory file (pass `?path=` query) |
| `PUT` | `/api/memory/file` | Update an existing memory file |
| `POST` | `/api/memory/file` | Create a new memory file |
| `DELETE` | `/api/memory/file` | Delete a memory file |

### Orchestration

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/orchestrations` | List all saved orchestration pipelines |
| `POST` | `/api/orchestrations` | Create a new orchestration |
| `GET` | `/api/orchestrations/:id` | Get one orchestration by ID |
| `DELETE` | `/api/orchestrations/:id` | Delete an orchestration |
| `POST` | `/api/orchestrations/run` | Run an orchestration pipeline |

### Playground

| Method | Path | What it does |
|--------|------|--------------|
| `POST` | `/api/playground/run` | Run any agent with a prompt, streams SSE |

### Setup

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/setup/status` | Health check — Claude CLI, agents, CLAUDE.md, pm2 |
| `GET` | `/api/setup/projects` | List projects with SDK install status |
| `POST` | `/api/setup/install-sdk` | Install `@boldteq/agents` SDK into a project |

### Docs

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/docs` | List all docs files |
| `GET` | `/api/docs/:slug` | Get one doc by slug (e.g., `00-overview`) |

### Browse

| Method | Path | What it does |
|--------|------|--------------|
| `GET` | `/api/browse` | Browse filesystem (used by file picker in UI) |

---

## The 12 Agents

| Name | File | Model | Role |
|------|------|-------|------|
| Rex | `rex.md` | opus | Commander — orchestrates the full build lifecycle |
| Nova | `nova.md` | sonnet | Market Research — competitive intelligence before any build |
| Arya | `arya.md` | opus | Architecture — stack, data model, sprint planning |
| Riko | `riko.md` | sonnet | Project Setup — scaffolds new projects from Arya's plan |
| Koda | `koda.md` | sonnet | Feature Builder — all production code, any stack |
| Vex | `vex.md` | sonnet | Bug Fixer — root cause diagnosis and targeted fixes |
| Luna | `luna.md` | sonnet | Testing — unit, integration, and E2E tests |
| Sage | `sage.md` | opus | Code Review — security, quality, and pre-deploy gate |
| Bolt | `bolt.md` | sonnet | Deployment — Vercel, Railway, Shopify submission |
| Quill | `quill.md` | sonnet | Content & Copy — listings, landing pages, emails |
| Hawk | `hawk.md` | sonnet | Monitoring & Ops — uptime, errors, cost, incidents |
| Mira | `mira.md` | sonnet | Memory & Training — extracts lessons after every build |

All 12 live at `~/.claude/agents/`.

> **Tip:** Use opus for orchestration and deep review (Rex, Arya, Sage). Use sonnet for everything else — it's faster and cheaper.

---

## Build Lifecycle

```
Brief (Yash)
  → Rex coordinates
    → Nova: competitive research
    → Arya: architecture + sprint plan
    → Riko: scaffold project
    → Koda: build features (loop)
      → Luna: write tests per feature
    → Quill: write copy (runs parallel)
    → Sage: pre-deploy audit (blocks on critical issues)
    → Bolt: deploy to production
    → Hawk: set up monitoring
    → Mira: extract lessons, update memory
```

---

## Key File Paths

```
~/.claude/
  CLAUDE.md                   # Global briefing — every Claude session reads this
  agents/                     # 12 global agent files
  memory/                     # Accumulated knowledge
    MEMORY.md                 # Index
    stacks/                   # Stack-specific patterns
    patterns/                 # Good patterns and antipatterns
    projects/                 # Per-project lessons

~/Desktop/Boldteq App/
  polyglot/
    src/server.js             # Express backend
    client/                   # React frontend source
    public-dist/              # Built frontend (served by Express)
    sdk/                      # @boldteq/agents package
    ecosystem.config.js       # pm2 config
    config.json               # Project directories
    orchestrations.json       # Saved pipelines

~/Library/LaunchAgents/
  io.boldteq.polyglot.plist # Auto-start on macOS login
```

---

## Quick Health Check

```bash
curl -s http://localhost:3847/api/setup/status
pm2 status
launchctl list | grep polyglot
ls ~/.claude/agents/ | wc -l   # expect 12
claude --version
```

> **Caution:** If `ls ~/.claude/agents/ | wc -l` returns fewer than 12, some agents are missing. Claude Code will fail to route tasks to those agents.
