# System Guide — how it all works

> Your whole AI-agent system, end to end: where things live, how memory works, what's automatic, and where to manage it. Read this in the app under **Documentation**, or as `Polyglot/docs/08-system-guide.md`.

---

## TL;DR (read this first)

- **Polyglot** = the cockpit (a local web app at `http://localhost:3847`) that *manages* your agents, memory, schedules, and health. It is not where agents run your code.
- **Agents** are just markdown files in `~/.claude/agents/*.md` (66 of them). They run **in VS Code** (Claude Code) and inside Polyglot's scheduled jobs.
- **Memory** is a **local vector database** (RAG) built from your `~/.claude/memory/` brain. Agents search it before acting and capture lessons after.
- **It runs itself.** The server auto-starts and auto-restarts. The only thing you must keep running is **Ollama** (the local embedding engine).

---

## 1. Big picture

```
        YOU, CODING IN VS CODE (any project)                 POLYGLOT (the cockpit)
   ┌───────────────────────────────────────┐         ┌──────────────────────────────────┐
   │  Claude Code runs an agent (Task)      │         │  http://localhost:3847            │
   │  = reads ~/.claude/agents/<name>.md    │         │  • System  • Schedules • Memory   │
   │                                        │         │  • Analytics/Observability • HR   │
   │   ① search ──►┐        ┌──► ④ capture  │         │                                  │
   └───────────────┼────────┼───────────────┘         │  Crons (auto): Witness, Cadence, │
                   ▼        │                          │  Tutor, Mira, Roster, reindex,   │
        ┌───────────────────┴───────────┐             │  eval — keep agents learning     │
        │   MEMORY BRAIN (vector RAG)    │◄────────────┤  reads SQLite (data/polyglot.db) │
        │   data/intel/kb_chunks.jsonl   │             └──────────────────────────────────┘
        │   16,736 chunks · Ollama embed │                         ▲
        └───────────────────────────────┘                         │
                   ▲ every VS Code agent run is recorded ──────────┘
                     (SubagentStop hook → /api/ingest/agent-run)
```

Three planes: **VS Code** (where agents run your work) · **Memory** (shared brain) · **Polyglot** (manage + the learning crons).

---

## 2. Where everything lives

**Global config + brain — `~/.claude/`** (shared by every project):

| Path | What it is |
|---|---|
| `~/.claude/agents/*.md` | your 66 agents (name, model, instructions) |
| `~/.claude/CLAUDE.md` | global rules every agent loads + the **memory mandate** (search-first, capture-after) |
| `~/.claude/memory/` | the **human-readable brain**: `MEMORY.md` (index), `patterns/good`+`avoid`, `stacks/`, `user/`, `lessons/`, `decisions/`, `projects/`, `gold-examples/` |
| `~/.claude.json` | registers the **`boldteq-memory` MCP** *user-scoped* → memory works in **every** project |
| `~/.claude/settings.json` | the **`SubagentStop` hook** (records VS Code runs) |
| `~/.claude/hooks/record-agent-run.mjs` | the hook script that POSTs runs to Polyglot |
| `~/Library/LaunchAgents/io.boldteq.polyglot.plist` | keeps the server **always-on** (auto-start + auto-restart) |

**The app — `Polyglot/`** (this repo):

| Path | What it is |
|---|---|
| `src/` | Express API (Node) — routes, db, schedules |
| `src/intelligence/` | the **RAG engine** (embedder · chunk · store · reindex · retrieve · capture · mcp-server) |
| `client/` | the React UI you see in the browser |
| `data/polyglot.db` | **SQLite** — agents, runs, real cost, eval scores, policy audit, delegations |
| `data/intel/` | the **vector index** (the embedded brain) |

---

## 3. Memory & RAG — the important part

**Where it's stored:** `Polyglot/data/intel/`
- `kb_chunks.jsonl` — **~85 MB, ~16,736 chunks** = your entire `~/.claude/memory/` brain + agent specs, embedded.
- `lessons.jsonl` · `decisions.jsonl` · `eval-runs.jsonl` — captured knowledge + judge scores.
- `manifest.json` — index metadata (embedder + dim).

**The tech (RAG):**
- **Embeddings:** local **Ollama** model **`nomic-embed-text` (768 dimensions)** — free, private, runs on your Mac. (Swappable to Voyage/OpenAI via `INTEL_EMBED_PROVIDER`.)
- **Search:** text → embedding → **cosine similarity** over L2-normalized vectors → top matches by *meaning* (not keywords).
- **Chunking:** markdown-aware (keeps heading context).
- **Interface:** the **`boldteq-memory` MCP server** exposes 5 tools to every agent: `memory_search`, `capture_lesson`, `capture_bug`, `capture_decision`, `capture_golden`.

**Example — search the brain (from any agent or terminal):**
```
memory_search("shopify PDP metafield binding")
→ ranked chunks: 0.75  shopify.app.toml › Metafield Support …
                 0.74  Admin GraphQL › metafieldsSet …
```
```bash
# same thing from the terminal:
node src/intelligence/retrieve.mjs "shopify metafield binding" --k 5
```

**Example — capture a lesson (compounds instantly):**
```
capture_lesson({
  domain: "next.js",
  problem: "useState in a Server Component throws",
  root_cause: "Server Components can't use hooks",
  solution: "move state to a Client Component, pass as prop"
})
→ embedded + indexed; retrievable within the minute
```

**The compounding loop (4 steps):** ① agent searches the brain → ② uses what it finds → ③ captures the new lesson → ④ next agent's search finds it. Every build makes the next one smarter.

---

## 4. How it all connects (one flow)

```
dispatch ─► POLICY GATE ─► RETRIEVE memory ─► RUN agent ─► RECORD (real cost) ─► JUDGE (0-1) ─► CAPTURE lesson
   (block bad/over-budget)   (search-first)   (Claude)    (cost_logs)        (LLM-judge)     (back to brain)
```
Every run is recorded; quality is judged independently (not self-reported); lessons flow back into memory.

---

## 5. Working in VS Code — what's automatic vs manual

**You just code normally.** Here's what runs by itself:

| Piece | Auto? | You do… |
|---|---|---|
| **Ollama** (embeddings) | must be **running** | start it once: `ollama serve` (or the Ollama app) — the model is already pulled |
| Polyglot server | **auto** | nothing — the LaunchAgent starts + restarts it |
| Memory MCP (search/capture) | **auto** | nothing — user-scoped, loads in every project |
| SubagentStop hook (records runs) | **auto** | nothing — fires when an agent/Task finishes |
| Search-before / capture-after | **auto** | nothing — mandated in `CLAUDE.md` |

> **The only thing you install/run is Ollama + its model** (`ollama pull nomic-embed-text`, already done). Everything else is automatic.

**What happens when you run an agent in VS Code:**
1. Claude Code loads `~/.claude/agents/<name>.md` + `CLAUDE.md`.
2. The agent calls `memory_search(...)` first (per the mandate), reads top hits.
3. It does the work; captures any lesson via `capture_*`.
4. When it finishes, the **SubagentStop hook** POSTs the run to `http://localhost:3847/api/ingest/agent-run` → it lands in `agent_runs` (`source: vscode`).
5. Polyglot's crons (Witness/Cadence/Tutor/Roster) later learn from it.

---

## 6. Where to see & manage it (in Polyglot)

Open **`http://localhost:3847`**:

| Screen | What you do there |
|---|---|
| **System** ⭐ | the cockpit — green/amber/red status of *everything* (server, memory, eval, observability, VS Code loop, crons) + **Run-now** buttons. Start here. |
| **Schedules** | the 8 auto-train crons — enable/disable, run-now, history |
| **Memory** | browse the brain + **✨ semantic search** + **Reindex** |
| **Analytics → Observability** | real token cost, judge scores, policy blocks, delegations |
| **HR → Consolidation** | roster overlap + retirement recommendations |
| **Documentation** | this guide + the other docs |

---

## 7. Commands cheat-sheet (the few manual ones)

> Run from `Polyglot/`. Use **Node 20** for anything touching the DB: `~/.nvm/versions/node/v20.20.1/bin/node`.

```bash
# Is the whole pipeline healthy? (or just open the System page)
curl -s http://localhost:3847/api/system/status | python3 -m json.tool

# Restart the server (LaunchAgent-managed)
launchctl kickstart -k gui/$(id -u)/io.boldteq.polyglot

# Re-embed the brain (or click "Reindex now" on the System/Memory page)
node src/intelligence/reindex.mjs

# Search memory from the terminal
node src/intelligence/retrieve.mjs "your question" --k 8

# Is Ollama up?
curl -s http://localhost:11434/api/tags | python3 -m json.tool
```

---

## 8. How future work gets smarter

You don't manage the learning — it's built in. Every agent run searches the brain and captures what it learns; the nightly **reindex** keeps it fresh; the **Witness → Cadence → Tutor** crons turn run history into promotions, PIPs, and (you-approved) prompt patches. So the system gets better as you use it — in VS Code *and* in Polyglot.

---

## 9. Troubleshooting (read the System page first)

| System page shows… | Fix |
|---|---|
| **Memory** red — "Ollama unreachable" | start Ollama: `ollama serve` (or the app) |
| **Memory** — "index empty" | run reindex (button) or `node src/intelligence/reindex.mjs` |
| **Server** amber — "not LaunchAgent-managed" | `launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist` |
| **Evaluation** grey — "no judge scores" | click **Run eval** on the System page |
| **VS Code → loop** — "no runs ingested" | the hook loads on your **next** Claude Code session; run a Task there |
| Server not responding at all | `launchctl kickstart -k gui/$(id -u)/io.boldteq.polyglot`, then re-check `/api/health` |

---

*Everything here is real and live as of this guide. The System page is the source of truth — when in doubt, open it.*
