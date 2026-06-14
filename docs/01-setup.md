# Setup Guide

Everything needed to get Polyglot running permanently on a Mac, from zero to fully operational.

> **Note:** On your machine, **almost all of this is already set up and running.** This guide exists so you know what *must* exist and be running, how to check it in one minute, and how to rebuild it on a fresh Mac. Day to day, you don't run any of this — the server starts itself at login and stays up.

---

## The one-minute health check

If you only do one thing, do this. It tells you the whole system is alive.

1. Open **http://localhost:3847** → click **System** in the sidebar. Every card should be green.
2. Confirm the memory engine is on (the only piece you personally keep running):

```bash
ollama list        # should list a model named: nomic-embed-text
```

> **Tip:** Think of the System page as the dashboard of a car — green lights mean drive, no need to look under the hood. The `ollama` check is the one spark plug you own.

---

## What must exist and be running

Polyglot is six moving parts. Five of them are already installed and self-maintaining. **You only ever start one yourself: Ollama.**

| Part | Plain-English job | Who keeps it running | You touch it? |
|------|------------------|----------------------|---------------|
| **The server** | The cockpit at localhost:3847 — manage agents, memory, schedules, cost, health | LaunchAgent (auto-start at login + auto-restart) | No |
| **Ollama** | The **memory engine** — turns text into numbers so the brain is searchable by meaning | **You** (`ollama serve` / the Ollama app) | **Yes** |
| **boldteq-memory MCP** | Lets agents in *every* project search + write to the shared memory brain | Configured once in `~/.claude.json` | No |
| **SubagentStop hook** | Records every agent run you do in VS Code so the learning crons see real work | Configured once in `~/.claude/settings.json` | No |
| **LaunchAgent** | The always-on switch — starts the server at login, restarts it if it crashes | macOS `launchd` | No |
| **8 background crons** | Nightly/weekly jobs that grade work, recompute skills, re-index memory | The server, while it's up | No |

> **Note:** "MCP" = a standard way to give an AI tool extra abilities. Here it gives every agent five memory tools (search the brain, and save a lesson / bug / decision / golden example). "Hook" = a tripwire — when an agent finishes, it automatically logs the run. "LaunchAgent" = macOS's built-in "start this at login and keep it alive" feature.

---

## Prerequisites

| Tool | Required version | Check | Install |
|------|-----------------|-------|---------|
| Node.js | 20+ | `node --version` | `nvm install 20 && nvm use 20 && nvm alias default 20` |
| npm | 9+ | `npm --version` | Ships with Node |
| pm2 | Any | `pm2 --version` | `npm install -g pm2` |
| Claude Code CLI | Any | `claude --version` | https://claude.ai/code, then `claude login` |
| **Ollama** | Any | `ollama --version` | https://ollama.com/download, then `ollama pull nomic-embed-text` |

> **Caution:** Node is installed via nvm. The binary lives at `~/.nvm/versions/node/v20.20.1/bin/node`. This exact path is used in the LaunchAgent plist *and* the SubagentStop hook — if you upgrade Node versions, update both or they'll fail to start.

> **Note:** The project directory is `/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot`. (Older notes may say `.../Boldteq App/polyglot` — that path no longer exists.)

---

## Ollama — the memory engine (the one thing you must run)

**Why it matters:** Polyglot's memory is a shared notebook the whole agent team writes in, searchable by *meaning* instead of exact words. Ollama is the small local AI that makes that search possible. If Ollama is off, memory search and capture stop working — everything else still runs, but the agents go "blind" to past lessons.

It runs a model called **`nomic-embed-text`**, which makes **embeddings** (a way to turn text into numbers so the computer can find similar ideas). Search then works by **cosine similarity** (measuring how close two pieces of text are in meaning).

### Step 1: Install + pull the model

```bash
# Install Ollama from https://ollama.com/download (or: brew install ollama)
ollama pull nomic-embed-text     # downloads the ~274 MB memory model, one time
```

### Step 2: Keep it running

```bash
ollama serve     # starts the engine (or just open the Ollama app — it auto-starts)
```

### Step 3: Verify

```bash
ollama list      # expect a row named: nomic-embed-text
```

> **Tip:** The Ollama desktop app launches at login and stays in your menu bar — install it once and you'll rarely think about this again. `ollama serve` is only needed if you skip the app.

> **Caution:** This is the **only** thing you must install and keep running. The server, MCP, hook, crons, and search/capture are all automatic.

---

## boldteq-memory MCP — memory in every project

**Why it matters:** This is what lets *any* agent, in *any* project, read and write the shared brain. It's registered user-scoped (in `~/.claude.json`), so it works everywhere — not just inside Polyglot.

It exposes five tools: `memory_search` (find past knowledge by meaning) plus `capture_lesson`, `capture_bug`, `capture_decision`, and `capture_golden` (save new knowledge).

It's already configured. To confirm:

```bash
claude mcp list                  # expect a line: boldteq-memory
```

The config lives in `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "boldteq-memory": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/src/intelligence/mcp-server.mjs"
      ],
      "env": {
        "INTEL_STORE": "local",
        "INTEL_EMBED_PROVIDER": "ollama"
      }
    }
  }
}
```

> **Note:** `INTEL_EMBED_PROVIDER: "ollama"` is why Ollama must be running — the MCP asks Ollama to turn text into searchable numbers. The searchable brain itself lives at `data/intel/kb_chunks.jsonl` (~85 MB, ~16,700 chunks of knowledge).

---

## SubagentStop hook — the VS Code learning loop

**Why it matters:** When you work in VS Code with Claude Code and an agent finishes a task, this tripwire quietly records that run into Polyglot. That's how the learning crons (Roster, Witness, Cadence) see your *real* work and improve the team over time. Without it, the system can't learn from what you actually do.

It's already configured in `~/.claude/settings.json` under `hooks.SubagentStop`:

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/node /Users/yashbaldha/.claude/hooks/record-agent-run.mjs"
          }
        ]
      }
    ]
  }
}
```

The hook script lives at `~/.claude/hooks/record-agent-run.mjs`. It POSTs each run to `http://localhost:3847/api/ingest/agent-run` (tagged `source="vscode"`).

To confirm both pieces exist:

```bash
ls ~/.claude/hooks/record-agent-run.mjs                   # the script
grep -q SubagentStop ~/.claude/settings.json && echo OK   # the wiring
```

> **Tip:** On the System page, the **"VS Code loop"** card turns green once runs are flowing in — that's your proof the hook works.

> **Caution:** The hook calls the same Node path as the LaunchAgent. If you change Node versions, update the path inside `~/.claude/settings.json` too.

---

## LaunchAgent — the always-on switch

**Why it matters:** This is what makes Polyglot *permanent*. macOS starts the server the moment you log in and restarts it automatically if it ever crashes — so the cockpit and the background crons are always there without you lifting a finger.

It's the file `~/Library/LaunchAgents/io.boldteq.polyglot.plist`, with `RunAtLoad` (start at login) and `KeepAlive` (restart on crash) both on. Full plist and reload steps are in the [LaunchAgent Plist](#launchagent-plist) section below.

To confirm it's loaded and running:

```bash
launchctl list | grep polyglot     # expect a line with a PID number in the first column
```

---

## First-Time Setup (Full Sequence)

> **Note:** On your current Mac this is already done. Use it only on a fresh machine or to rebuild a broken install.

### 1. Install dependencies

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
npm install
```

### 2. Install + start the memory engine

```bash
ollama pull nomic-embed-text     # one-time model download
ollama serve                     # or open the Ollama app
```

### 3. Start with pm2

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
pm2 start ecosystem.config.js
pm2 save
```

### 4. Verify it's running

```bash
pm2 status
# polyglot row should show status: online

curl -s http://localhost:3847/api/setup/status
# Returns JSON with system health
```

### 5. Set up LaunchAgent (auto-start on login)

```bash
# Validate the plist exists
ls ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# Load it
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# Verify
launchctl list | grep polyglot
# Expect: a line with a PID number in the first column
```

### 6. Confirm the memory MCP + VS Code hook

```bash
claude mcp list                                           # expect: boldteq-memory
ls ~/.claude/hooks/record-agent-run.mjs                   # hook script present
grep -q SubagentStop ~/.claude/settings.json && echo OK   # hook wired
```

### 7. Add project directories

- Open http://localhost:3847
- Click Settings
- Add `/Users/yashbaldha/Desktop/Boldteq App`
- Click Save

### 8. Verify full system

- Open http://localhost:3847 → **System** → all cards green.

---

## ecosystem.config.js

Located at `Polyglot/ecosystem.config.js`. Tells pm2 how to run Polyglot.

```javascript
module.exports = {
  apps: [{
    name: 'polyglot',
    script: './src/server.js',
    cwd: '/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot',
    interpreter: 'node',
    watch: false,
    autorestart: true,
    max_restarts: 5,
    env: {
      NODE_ENV: 'production',
      PORT: 3847,
    },
    error_file: '/Users/yashbaldha/.pm2/logs/polyglot-error.log',
    out_file: '/Users/yashbaldha/.pm2/logs/polyglot-out.log',
  }]
}
```

Key fields:
- `name: 'polyglot'` — used in all `pm2` commands
- `cwd` — must be absolute path to the Polyglot directory
- `PORT: 3847` — all API calls and browser access use this port
- `autorestart: true` — restarts on crash
- `max_restarts: 5` — stops restarting after 5 consecutive failures

> **Caution:** After editing `ecosystem.config.js`, run `pm2 delete polyglot && pm2 start ecosystem.config.js` — `pm2 restart` does not pick up config file changes.

> **Note:** pm2 and the LaunchAgent are two different ways to run the *same* server. The LaunchAgent is the recommended primary runner; pm2 is the manual/dev alternative. Don't run both at once (see Troubleshooting).

---

## LaunchAgent Plist

Located at `~/Library/LaunchAgents/io.boldteq.polyglot.plist`. Starts Polyglot at macOS login, independent of pm2.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.boldteq.polyglot</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/node</string>
    <string>/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/src/server.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/yashbaldha/.pm2/logs/polyglot-launchd.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/yashbaldha/.pm2/logs/polyglot-launchd-error.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>3847</string>
    <key>PATH</key>
    <string>/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

To reload after editing:
```bash
launchctl unload ~/Library/LaunchAgents/io.boldteq.polyglot.plist
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist
```

> **Tip:** After any plist edit, always unload then load — `launchctl load` alone on an already-loaded plist has no effect.

To create from scratch if missing:
```bash
which node   # get your exact node binary path
mkdir -p ~/Library/LaunchAgents
# Then write the plist above, replacing paths with your username
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist
```

---

## config.json

Located at `Polyglot/config.json`. Stores project directories.

```json
{
  "projectDirs": [
    "/Users/yashbaldha/Desktop/Boldteq App"
  ]
}
```

- Tilde `~` in paths is expanded by the server automatically.
- Edit via Settings page or directly — server reads it on each request.
- Polyglot scans each dir for subdirectories with `CLAUDE.md`, `.claude/`, `package.json`, or `pubspec.yaml`.

> **Note:** Projects are discovered dynamically on every request — no restart needed after adding a project directory.

---

## Settings Page

Access at http://localhost:3847/settings or `/api/global/settings`.

| Setting | What it controls |
|---------|-----------------|
| Project directories | Which folders Polyglot scans for projects |
| Claude model | Model used by the AI Assistant chat |
| Effort level | Token budget hint for AI responses |
| Permissions JSON | Tool permissions passed to claude CLI |

---

## pm2 Command Reference

| Command | What it does |
|---------|--------------|
| `pm2 status` | Show all processes and their status |
| `pm2 restart polyglot` | Restart after editing `src/server.js` |
| `pm2 stop polyglot` | Stop the process (stays in list) |
| `pm2 start polyglot` | Start a stopped process |
| `pm2 delete polyglot` | Remove from pm2 entirely |
| `pm2 logs polyglot` | Stream live logs |
| `pm2 logs polyglot --lines 50` | Show last 50 log lines |
| `pm2 logs polyglot --err` | Show error log only |
| `pm2 flush polyglot` | Clear log files |
| `pm2 save` | Persist process list across reboots |
| `pm2 resurrect` | Restore saved process list after reboot |
| `pm2 monit` | Interactive CPU/memory/log monitor |

---

## Fresh Machine Full Sequence

```bash
# 1. Install Node via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc
nvm install 20 && nvm use 20 && nvm alias default 20

# 2. Install pm2
npm install -g pm2

# 3. Install Claude CLI and authenticate
# Download from https://claude.ai/code
claude login

# 4. Install Ollama + the memory model
# Download from https://ollama.com/download
ollama pull nomic-embed-text
ollama serve            # or open the Ollama app

# 5. Install Polyglot deps
cd "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
npm install

# 6. Build frontend (if the built UI is missing)
npm run build

# 7. Start with pm2
pm2 start ecosystem.config.js
pm2 save

# 8. Load LaunchAgent
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# 9. Confirm memory MCP + VS Code hook
claude mcp list                                   # expect: boldteq-memory
grep -q SubagentStop ~/.claude/settings.json && echo "hook OK"

# 10. Verify
curl -s http://localhost:3847/api/setup/status
```

---

## Troubleshooting

### Memory search returns nothing / capture fails

The memory engine (Ollama) is off or the model is missing.

```bash
ollama list                      # is nomic-embed-text listed?
ollama pull nomic-embed-text     # re-pull if missing
ollama serve                     # start it (or open the Ollama app)
```

> **Note:** Polyglot keeps running without Ollama — only memory *search and capture* break. Restart Ollama and they recover immediately, no server restart needed.

### "boldteq-memory" MCP not showing in a project

```bash
claude mcp list                  # is boldteq-memory listed?
# If missing, confirm the block exists in ~/.claude.json under "mcpServers"
# and that the path to src/intelligence/mcp-server.mjs is correct.
```

### VS Code runs not appearing in Polyglot

The SubagentStop hook isn't firing.

```bash
ls ~/.claude/hooks/record-agent-run.mjs                   # script present?
grep -q SubagentStop ~/.claude/settings.json && echo OK   # wired?
# Confirm the server is up (the hook POSTs to localhost:3847):
curl -s http://localhost:3847/api/setup/status >/dev/null && echo "server OK"
# Confirm the Node path inside settings.json still exists:
ls /Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/node
```

### EADDRINUSE — port 3847 already in use

```bash
lsof -ti:3847              # find the PID
kill -9 $(lsof -ti:3847)   # kill it
pm2 restart polyglot
```

> **Caution:** If pm2 is already running Polyglot, don't start another instance — just `pm2 restart polyglot`. Two instances on the same port will both crash.

### pm2 status shows "errored"

```bash
pm2 logs polyglot --lines 30 --err
```

- `EADDRINUSE` — port conflict, see above.
- `Cannot find module` — run `npm install` in the Polyglot directory.
- `SyntaxError` at a line number — a recent edit broke `server.js`. Test it directly: `node src/server.js`.
- `node: command not found` — pm2 can't find Node. Use the full path in ecosystem.config.js or set `interpreter` to the output of `which node`.

### LaunchAgent not starting (PID shows as `-`)

```bash
# Validate plist syntax
plutil ~/Library/LaunchAgents/io.boldteq.polyglot.plist
# expect: OK

# Check the error log
cat ~/.pm2/logs/polyglot-launchd-error.log

# Verify the node binary path in the plist exists
ls /Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/node

# Fix ownership if wrong
ls -l ~/Library/LaunchAgents/io.boldteq.polyglot.plist
chown $(whoami):staff ~/Library/LaunchAgents/io.boldteq.polyglot.plist
```

Reload after fixing:
```bash
launchctl unload ~/Library/LaunchAgents/io.boldteq.polyglot.plist
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist
launchctl list | grep polyglot
```

### Port conflict between pm2 and LaunchAgent

> **Caution:** Running both pm2 and LaunchAgent simultaneously causes a port conflict — one will fail silently. Pick one runner and disable the other.

```bash
# Option A: LaunchAgent as primary (recommended)
pm2 stop polyglot && pm2 delete polyglot

# Option B: pm2 as primary
launchctl unload ~/Library/LaunchAgents/io.boldteq.polyglot.plist
```

> **Tip:** LaunchAgent is the recommended primary runner — it starts before your shell profile loads, so nvm path issues don't apply.

### Frontend blank page or "Cannot GET /"

The built UI is missing or empty. Build it:

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
npm run build
pm2 restart polyglot
```

### After Mac restart, Polyglot not running

```bash
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist
launchctl list | grep polyglot
```

If the LaunchAgent keeps failing on restart, fall back to pm2:
```bash
pm2 resurrect
pm2 status
```

Then debug the LaunchAgent separately using the steps above.

### MODULE_NOT_FOUND on startup

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
npm install
pm2 restart polyglot
```
