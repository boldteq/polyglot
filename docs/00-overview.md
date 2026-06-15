# Polyglot — The Big Picture

Polyglot is your **cockpit for the Boldteq agent team**. It's a private web app that runs only on your Mac at `http://localhost:3847`. Think of it as the control room: you don't fly the plane from here, but you see every dial, manage the crew, and read the flight history.

> **Note:** Polyglot is where you **manage** the agents — their files, their memory, their schedules, their cost, their health. It is **not** where they write code. The agents do their actual work inside VS Code (via Claude Code) and inside Polyglot's own scheduled jobs.

---

## The one-paragraph version

You have **66 AI specialists** (one markdown file each — koda builds backends, arya designs architecture, vex fixes bugs, and so on). They share **one searchable memory brain**, so a lesson learned on one project helps every future project. A handful of **background helpers run automatically** to grade the team's work, promote the good performers, and keep the memory fresh. A **System Health page** tells you at a glance whether everything is green. And the whole thing **stays on by itself** — it restarts after a crash or a reboot without you lifting a finger.

---

## The core parts (the originals)

These are the building blocks the whole factory is made of.

| Part | Plain English | Where it lives |
|------|---------------|----------------|
| **CLAUDE.md** | The standing brief every agent reads first — your rules, stack choices, and standards. | `~/.claude/CLAUDE.md` (global) + one per project |
| **Agents** | 66 specialist personas, one `.md` file each. Each is a job description + instructions for a single expert. | `~/.claude/agents/*.md` |
| **Commands** | Slash-command shortcuts like `/saas-cycle` or `/shopify-store` that kick off a whole pipeline. | `~/.claude/commands/` + per project |
| **Rules** | Hard guardrails ("never use `any`", "no hardcoded org data") that agents must obey. | `~/.claude/rules/` + per project |
| **Memory** | The shared notebook of everything the team has learned. | `~/.claude/memory/` |

> **Tip:** CLAUDE.md is the "company handbook," agents are the "staff," commands are "one-click workflows," rules are "non-negotiables," and memory is the "team wiki." Polyglot lets you read and edit all five from your browser.

---

## The new systems (what makes it smart)

Beyond managing files, Polyglot now **learns and runs on its own**. Here are the five upgrades.

### 1. The Memory Brain (searchable by meaning)

The memory is a shared notebook the whole team writes in — but now it's **searchable by meaning, not just keywords**. Ask "how do we handle Shopify billing?" and it finds the right notes even if they never used those exact words.

- **How:** every note is turned into **searchable numbers** that capture its meaning, then matched by closeness in meaning. About 16,700 notes' worth of knowledge is indexed.
- **It runs in every project:** the brain is exposed as a tool called **"boldteq-memory"** with 5 actions — one to **search**, and four to **capture** a new lesson, bug, decision, or winning pattern. So any agent, in any project, can look things up and file new lessons.

> **Note:** The one tool that powers this is **Ollama** — a small free program on your Mac that does the "turn text into numbers" step. It's the only thing you ever have to keep running yourself (see below).

### 2. The System Health page

Open the **System** page in Polyglot for an at-a-glance dashboard: green / amber / red cards for the **Server**, **Memory brain**, **Evaluation** (the quality self-test), **Observability** (cost tracking), the **VS Code learning loop**, and the **background helpers** — each with a **Run-now** button. This is the place to answer "is everything working?" in one glance.

### 3. Observability — real cost and quality

Found under **Analytics → Observability**. This shows the **real token cost per agent** (so you know who's expensive), an **independent quality score** from an automated judge (an LLM grading the work, not the agent grading itself), plus any **blocked actions** and **hand-offs** between agents. In short: where the money goes, and whether the work is actually good.

### 4. The 8 background helpers ("crons")

These run automatically while the server is up — like a back-office team that works overnight so the agents keep improving on their own.

| Helper | When | What it does (plain English) |
|--------|------|------------------------------|
| **sys-roster** | Nightly 2:00 | Recomputes each agent's experience and skills |
| **sys-witness** | Nightly 3:00 | Grades yesterday's work; flags who did well or badly |
| **sys-cadence** | Mon 9:00 | Applies promotions and improvement plans from Witness |
| **sys-tutor** | Sun 2:00 | Drafts coaching notes to make the agents better |
| **sys-forge** | Monthly | Spots missing skills and drafts brand-new agents |
| **sys-mira** | After each build | Files the lessons learned from a successful build |
| **sys-intel-reindex** | Nightly 2:30 | Refreshes the memory brain so search stays current |
| **sys-intel-eval** | Sun 5:00 | Runs the quality self-test (the LLM judge) |

### 5. Always-on + the VS Code learning loop

- **Always-on:** a small macOS service (`io.boldteq.polyglot`) starts the server when you log in and **restarts it if it ever crashes**. You don't babysit it.
- **VS Code learning loop:** every time an agent runs for you inside VS Code, a quiet hook **records that run back into Polyglot**. So the overnight helpers grade your *real* work, not just lab tests — the team learns from what you actually do.

---

## The dashboard pages

| Page | What it's for |
|------|---------------|
| **Dashboard** | Home overview — projects, agents, status |
| **All Agents** | Browse and edit every agent |
| **Org Chart** | The team org chart, by squad |
| **HR** | Promotions, performance, training, drift fixes |
| **All Commands / All Rules** | Browse shortcuts and guardrails |
| **Memory Brain** | Read and edit the shared notebook |
| **Orchestration** | Chain agents into a visual pipeline |
| **Playground** | Test any single agent live |
| **Analytics → Observability** | Real cost + quality scores |
| **Learning** | Watch the learning loop + review auto-captured lessons from your VS Code work |
| **System** | The green/amber/red health dashboard |
| **Settings** | Project folders and model choice |
| **Documentation** | These docs, in the browser |

---

## The only thing you must keep running

Everything — the server, the memory tool, the background helpers, the recording hook — starts and stays up automatically. **The single exception is Ollama**, the little program that powers memory search.

```bash
ollama serve                     # start Ollama (or just open the Ollama app)
ollama pull nomic-embed-text     # one-time: download the model memory search uses
```
> **Caution:** If Ollama isn't running, memory **search** and the nightly **re-index** stop working. Everything else keeps going, but the brain goes quiet. Keeping the Ollama app open is enough.

---

## Key file paths

```
~/.claude/
  CLAUDE.md          # The standing brief, read first by every agent
  agents/            # 66 specialist agent files
  rules/             # Hard guardrails
  commands/          # Slash-command pipelines
  memory/            # The shared notebook (human-readable)
  hooks/
    record-agent-run.mjs   # Records VS Code runs back into Polyglot

Polyglot/
  src/server.js              # The Express server (the app itself)
  src/intelligence/          # The memory brain + quality eval
  data/polyglot.db           # SQLite — agents, cost, runs, scores
  data/intel/kb_chunks.jsonl # The searchable memory index (~85 MB)
  client/                    # The React dashboard you see in the browser

~/Library/LaunchAgents/
  io.boldteq.polyglot.plist  # Auto-start + auto-restart on macOS
```

---

## Quick health check

```bash
ls ~/.claude/agents/ | wc -l          # how many agent files exist (expect ~66)
launchctl list | grep polyglot        # confirm the always-on service is loaded
curl -s http://localhost:3847/api/setup/status   # is the server answering?
ollama list                            # confirm nomic-embed-text is installed
```
> **Tip:** The easiest check of all is to open the **System** page — if every card is green, you're good.
