# Polyglot

Central management dashboard for all your Claude Code agents across every project.

## What it does

- **See all agents in one place** — global agents + every project's sub-agents
- **Create/edit/delete agents** — both global and per-project, from one UI
- **Edit CLAUDE.md files** — global and per-project, with save
- **Copy agents between projects** — or promote a project agent to global
- **View slash commands** — see and edit all /commands per project
- **Auto-discover projects** — scans your project folders automatically

## Install

```bash
# Clone or copy the polyglot folder to anywhere on your Mac
cd polyglot
npm install
npm start
```

Open http://localhost:3847 in your browser.

## First run

1. Polyglot asks you to add project directories (e.g. `~/projects`)
2. It scans those folders for any project with `.claude/` or `CLAUDE.md`
3. You see everything — all agents, all rules, all projects in one dashboard

## How it works

Polyglot reads and writes the same files that Claude Code uses:

```
~/.claude/CLAUDE.md          ← global rules (edit in Polyglot)
~/.claude/agents/*.md        ← global agents (edit in Polyglot)
~/projects/app1/CLAUDE.md    ← app rules (edit in Polyglot)
~/projects/app1/.claude/agents/*.md  ← app sub-agents (edit in Polyglot)
```

When you edit in Polyglot → the file changes on disk → Claude Code picks it up next session. Real-time sync.

## Requirements

- Node.js 18+
- macOS (or Linux/Windows)
