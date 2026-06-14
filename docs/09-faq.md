# FAQ — quick answers about how everything works

> Search this page (top-left box) or scan the questions. Short answers + copy-paste examples. For the full picture see the **System Guide**.

---

## Basics

### Q: What is Polyglot?
A local web app (`http://localhost:3847`) that **manages** your AI agents, memory, schedules, cost, and health. It's the cockpit — not where agents run your code. It runs itself (auto-start + auto-restart).

### Q: What is an "agent"?
Just a markdown file in `~/.claude/agents/<name>.md` (you have 66) — a name, a model, and instructions. Examples: `koda` (backend), `arya` (architecture), `vex` (bug fixer).

### Q: Where do agents actually run?
Two places: **(1) in VS Code** when you call them via Claude Code (Task), and **(2) inside Polyglot** for scheduled/automated jobs. Both read the same `~/.claude/agents/*.md`.

### Q: VS Code vs Polyglot — what's the difference?
> **Tip:** VS Code = where work happens. Polyglot = where you watch + manage it. They share the same agents and the same memory brain.

---

## How Memory Works

> **In plain English:** Memory is a **shared notebook** your agents search by **meaning, not keywords**, and write new lessons into after each job. **Ollama** is the small free app that powers the by-meaning search. The technical terms below (vector, embedding, chunk, cosine, RAG) are just engineering names for pieces of that one idea — see the gloss in the **System Guide → §3** for each.

### Q: Where is the memory stored?
The readable brain is `~/.claude/memory/` (plain markdown notes). The **searchable copy** is `Polyglot/data/intel/kb_chunks.jsonl` — about **85 MB, ~16,736 slices** of those notes.

### Q: What technology is the memory (RAG)?
A local **Ollama** model (**`nomic-embed-text`**) turns each note into **searchable numbers** that capture its meaning; a search then finds the **closest in meaning** notes (not just exact-word matches). Agents reach all of this through one tool called **`boldteq-memory`** (5 actions: 1 search + 4 capture). *RAG* just means "search the notebook first, then answer."

### Q: How does a memory search work?
```
memory_search("shopify metafield binding")
→ 0.75  shopify.app.toml › Metafield Support …
  0.74  Admin GraphQL › metafieldsSet …
```
From the terminal: `node src/intelligence/retrieve.mjs "your question" --k 8`

### Q: How do I add knowledge to memory?
Agents call a capture tool; it's embedded + searchable within the minute:
```
capture_lesson({ domain:"next.js", problem:"useState in Server Component throws",
  root_cause:"Server Components can't use hooks", solution:"move to a Client Component" })
```

### Q: What is a "chunk" / "embedding"?
A **chunk** = a small slice of a doc (kept with its heading). An **embedding** = that chunk turned into 768 numbers capturing its meaning, so similar ideas sit near each other and search can find them.

### Q: Does memory work in every project or just Polyglot?
Every project — the MCP is registered **user-scoped** in `~/.claude.json`, so `memory_search` + capture work in any VS Code folder.

---

## Working in VS Code

### Q: Do I have to install or run anything?
> **Tip:** The only thing you must keep running is **Ollama**. Everything else is automatic.
```bash
ollama serve            # (or open the Ollama app)
ollama pull nomic-embed-text   # already done — the embedding model
```

### Q: Is it automatic, or do I run commands?
Automatic. The server auto-starts (LaunchAgent), the memory MCP auto-loads, the run-recording hook auto-fires, and search/capture happen by the rules in `~/.claude/CLAUDE.md`. You just code.

### Q: How do I use an agent in VS Code?
Invoke it via Claude Code (Task / @agent). It loads `agents/<name>.md` + `CLAUDE.md`, searches memory first, does the work, captures lessons.

### Q: Does my VS Code work get remembered / learned from?
Yes. When an agent/Task finishes, a **SubagentStop hook** records the run into Polyglot (`source: vscode`), and the learning crons (Witness/Cadence/Tutor) factor it in. (The hook activates on your **next** Claude Code session after setup.)

---

## Managing it (in Polyglot)

### Q: Where do I see if everything is working?
Open **System** (`localhost:3847` → System) — green/amber/red cards for server, memory, eval, observability, the VS Code loop, and the crons. Start there.

### Q: How do I run a cron / reindex / eval manually?
On the **System** or **Schedules** page click **Run now** / **Reindex** / **Run eval**. Or from the terminal:
```bash
node src/intelligence/reindex.mjs           # re-embed the brain
curl -s http://localhost:3847/api/system/status | python3 -m json.tool   # full status
```

### Q: How do I check token cost?
**Analytics → Observability** — real token cost (not estimates), policy blocks, judge scores, delegations.

### Q: How do I restart the server?
```bash
launchctl kickstart -k gui/$(id -u)/io.boldteq.polyglot
```

---

## Folder structure (where is X?)

| You want… | It's at… |
|---|---|
| The agents | `~/.claude/agents/*.md` |
| Global rules + memory mandate | `~/.claude/CLAUDE.md` |
| The readable brain | `~/.claude/memory/` |
| The vector index | `Polyglot/data/intel/kb_chunks.jsonl` |
| The database (runs, cost, eval) | `Polyglot/data/polyglot.db` |
| The RAG engine code | `Polyglot/src/intelligence/` |
| The web UI | `Polyglot/client/` |
| The MCP registration | `~/.claude.json` |
| The VS Code hook | `~/.claude/settings.json` + `~/.claude/hooks/` |
| The always-on config | `~/Library/LaunchAgents/io.boldteq.polyglot.plist` |

---

## Troubleshooting

### Q: A card on the System page is red — what do I do?
| Shows… | Fix |
|---|---|
| Memory red — "Ollama unreachable" | `ollama serve` (or the app) |
| Memory — "index empty" | run **Reindex** (button) or `node src/intelligence/reindex.mjs` |
| Server amber — "not LaunchAgent-managed" | `launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist` |
| Evaluation grey — "no judge scores" | click **Run eval** |
| VS Code loop — "no runs ingested" | the hook loads on your next Claude Code session — run a Task there |

### Q: The whole app won't load.
```bash
launchctl kickstart -k gui/$(id -u)/io.boldteq.polyglot
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3847/api/health   # expect 200
```

---

## Ops

### Q: Is the server always on?
Yes — a macOS **LaunchAgent** (`io.boldteq.polyglot`) starts it at login and restarts it if it crashes.

### Q: Anything special when running DB scripts?
> **Caution:** Use **Node 20** for anything touching the database (better-sqlite3): `~/.nvm/versions/node/v20.20.1/bin/node`.

### Q: How do I push my commits to the remote?
Everything is committed to `main` locally. To publish: `git push origin main` (ask first if the connection is flaky — large build artifacts can need a retry).

---

*When in doubt, open the **System** page — it's the live source of truth.*
