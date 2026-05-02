# Setup Guide

Everything needed to get Polyglot running permanently on a Mac, from zero to fully operational.

---

## Prerequisites

| Tool | Required version | Check | Install |
|------|-----------------|-------|---------|
| Node.js | 20+ | `node --version` | `nvm install 20 && nvm use 20 && nvm alias default 20` |
| npm | 9+ | `npm --version` | Ships with Node |
| pm2 | Any | `pm2 --version` | `npm install -g pm2` |
| Claude Code CLI | Any | `claude --version` | https://claude.ai/code, then `claude login` |

> **Caution:** Node is installed via nvm. The binary lives at `~/.nvm/versions/node/v20.20.1/bin/node`. This exact path is used in the LaunchAgent plist — if you upgrade Node versions, update the plist path too or the LaunchAgent will fail to start.

---

## First-Time Setup (Full Sequence)

### 1. Install dependencies

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/polyglot"
npm install
```

### 2. Start with pm2

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/polyglot"
pm2 start ecosystem.config.js
pm2 save
```

### 3. Verify it's running

```bash
pm2 status
# polyglot row should show status: online

curl -s http://localhost:3847/api/setup/status
# Returns JSON with system health
```

### 4. Set up LaunchAgent (auto-start on login)

```bash
# Validate the plist exists
ls ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# Load it
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# Verify
launchctl list | grep polyglot
# Expect: a line with a PID number in the first column
```

### 5. Add project directories

- Open http://localhost:3847
- Click Settings
- Add `/Users/yashbaldha/Desktop/Boldteq App`
- Click Save

### 6. Verify full system

```bash
curl -s http://localhost:3847/api/global/agents | python3 -c "import sys,json; a=json.load(sys.stdin); print(len(a), 'agents')"
# Expect: 12 agents
```

---

## ecosystem.config.js

Located at `polyglot/ecosystem.config.js`. Tells pm2 how to run Polyglot.

```javascript
module.exports = {
  apps: [{
    name: 'polyglot',
    script: './src/server.js',
    cwd: '/Users/yashbaldha/Desktop/Boldteq App/polyglot',
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
- `cwd` — must be absolute path to polyglot directory
- `PORT: 3847` — all API calls and browser access use this port
- `autorestart: true` — restarts on crash
- `max_restarts: 5` — stops restarting after 5 consecutive failures

> **Caution:** After editing `ecosystem.config.js`, run `pm2 delete polyglot && pm2 start ecosystem.config.js` — `pm2 restart` does not pick up config file changes.

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
    <string>/Users/yashbaldha/Desktop/Boldteq App/polyglot/src/server.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/yashbaldha/Desktop/Boldteq App/polyglot</string>

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

Located at `polyglot/config.json`. Stores project directories.

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

> **Info:** Projects are discovered dynamically on every request — no restart needed after adding a project directory.

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

# 4. Install Polyglot deps
cd "/Users/yashbaldha/Desktop/Boldteq App/polyglot"
npm install

# 5. Build frontend (if public-dist/ is missing)
npm run build

# 6. Start with pm2
pm2 start ecosystem.config.js
pm2 save

# 7. Load LaunchAgent
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist

# 8. Verify
curl -s http://localhost:3847/api/setup/status
```

---

## Troubleshooting

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
- `Cannot find module` — run `npm install` in the polyglot directory.
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

`public-dist/` is missing or empty. Build it:

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/polyglot"
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
cd "/Users/yashbaldha/Desktop/Boldteq App/polyglot"
npm install
pm2 restart polyglot
```
