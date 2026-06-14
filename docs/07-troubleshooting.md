# Troubleshooting

Format: **Problem → Cause → Fix** (with exact commands).

> **In plain English:** Before anything below, open the **System** page (`http://localhost:3847` → System). It shows green / amber / red cards for every part of the system and tells you the fix in words. **9 times out of 10, a problem is just Ollama not running** — open the Ollama app and you're back. The section right below covers the systems we added most recently; the older sections (pm2, SDK, orchestration) are still here for deeper issues.

---

## Start here — today's systems (memory, health, learning)

These are the quick fixes for the newest pieces. **Plain-English symptom first, command second.**

### The memory search stopped working / "Ollama unreachable"

**Symptom:** The **Memory** card on the System page is red, or agents stop finding past lessons.

**Cause:** Ollama (the small app that powers search-by-meaning) isn't running. It's the *one* thing you keep on.

**Fix:** Open the **Ollama app** (or run `ollama serve`). Then confirm the model is there:
```bash
ollama list                         # should list: nomic-embed-text
ollama pull nomic-embed-text        # only if it's missing
curl -s http://localhost:11434/api/tags   # should respond (Ollama is up)
```

### "Memory index empty" / search returns nothing

**Symptom:** Memory card says the index is empty, or every search comes back blank.

**Cause:** The searchable copy of the brain hasn't been built yet (or was cleared).

**Fix:** Click **Reindex** on the System or Memory page — or from `Polyglot/`:
```bash
~/.nvm/versions/node/v20.20.1/bin/node src/intelligence/reindex.mjs
```

### The whole app won't load

**Symptom:** `http://localhost:3847` doesn't open at all.

**Cause:** The server stopped (rare — it's set to auto-restart).

**Fix:** Kick the always-on service, then confirm it answers:
```bash
launchctl kickstart -k gui/$(id -u)/io.boldteq.polyglot
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3847/api/health   # expect 200
```

### Server card says "not always-on managed"

**Symptom:** System page warns the server isn't managed by the auto-restart service.

**Fix:** Load the LaunchAgent once:
```bash
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist
```

### "No quality scores yet" (Evaluation card grey)

**Symptom:** The Evaluation card has never run.

**Fix:** Click **Run eval** on the System page (it grades a set of sample answers). Nothing is broken — it just hasn't run yet.

### "No VS Code runs recorded" (learning loop card)

**Symptom:** The VS Code learning-loop card shows zero runs.

**Cause:** The recorder hook activates on your **next** Claude Code session after setup.

**Fix:** Just do a normal piece of work in VS Code (run any agent/Task). The next finished run shows up automatically — no command needed.

> **Caution:** Anything that touches the database (reindex, migrations, DB scripts) must run with **Node 20**: `~/.nvm/versions/node/v20.20.1/bin/node`. Newer Node versions break the database library (`better-sqlite3`).

---

## Polyglot Service

### EADDRINUSE port 3847

**Problem:** `Error: listen EADDRINUSE: address already in use :::3847`

**Cause:** Another process holds the port — usually a stale Polyglot instance or pm2 already running it.

**Fix:**
```bash
# Find what's on the port
lsof -ti:3847

# Kill it
kill -9 $(lsof -ti:3847)

# Start Polyglot
pm2 restart polyglot
```

> **Caution:** If pm2 already shows Polyglot as "online", don't start another instance. Just open http://localhost:3847 — two instances on the same port will crash each other.

```bash
pm2 status
```

---

### pm2 errored / crash-looping

**Problem:** `pm2 status` shows `errored` or restart count climbing.

**Cause:** Process crashes on startup. pm2 retries up to `max_restarts` (default: 5) then stops.

> **Tip:** Always read the crash log first — every pm2 error has a distinct cause. `pm2 logs polyglot --lines 50 --err` is the single most useful command when Polyglot stops working.

**Fix:**
```bash
# Read the crash log first
pm2 logs polyglot --lines 50 --err
```

| Error in logs | Fix |
|--------------|-----|
| `EADDRINUSE :::3847` | `kill -9 $(lsof -ti:3847)` then `pm2 restart polyglot` |
| `Cannot find module 'express'` | `cd "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot" && npm install` |
| `spawn node ENOENT` | Add full Node path to `ecosystem.config.js` (see Node not found below) |
| `SyntaxError: Unexpected token` | `node src/server.js` to find the exact line, fix it |
| `ENOENT no such file` | Check `cwd` in `ecosystem.config.js` — path doesn't exist |

After fixing:
```bash
pm2 restart polyglot
pm2 status
# Should show: online
```

If pm2 stopped retrying:
```bash
pm2 start polyglot
# or fully reset:
pm2 delete polyglot
pm2 start "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/ecosystem.config.js"
pm2 save
```

---

### LaunchAgent not starting on login

**Problem:** After reboot, Polyglot is not running. Have to start it manually every time.

**Cause A:** `RunAtLoad` is missing or false in the plist.

**Fix:**
```bash
grep -A2 'RunAtLoad' ~/Library/LaunchAgents/io.boldteq.polyglot.plist
# Should show: <key>RunAtLoad</key> followed by <true/>
# If <false/> or missing, edit the plist and change to <true/>
launchctl unload ~/Library/LaunchAgents/io.boldteq.polyglot.plist
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist
```

**Cause B:** Plist is in the wrong location.

> **Caution:** `~/Library/LaunchAgents/` is the correct location (user-level). `/Library/LaunchAgents/` (system-level) and `~/Library/LaunchDaemons/` are both wrong and will cause the agent to not start.

**Fix:**
```bash
ls ~/Library/LaunchAgents/ | grep claude
# Must show: io.boldteq.polyglot.plist
```

**Cause C:** LaunchAgent and pm2 are fighting for port 3847.

**Fix — pick one runner:**
```bash
# Option A: Use pm2 only, disable LaunchAgent
launchctl unload ~/Library/LaunchAgents/io.boldteq.polyglot.plist
pm2 start "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/ecosystem.config.js"
pm2 save
pm2 startup  # makes pm2 auto-start on login

# Option B: Use LaunchAgent only, stop pm2
pm2 stop polyglot
pm2 delete polyglot
launchctl load ~/Library/LaunchAgents/io.boldteq.polyglot.plist
```

---

### Server crashes on startup (MODULE_NOT_FOUND)

**Problem:** `Error: Cannot find module 'express'` (or any other package).

**Cause:** `node_modules` is missing or corrupted.

**Fix:**
```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot"
rm -rf node_modules
npm install
pm2 restart polyglot
```

---

### Node binary not found (spawn ENOENT)

**Problem:** `spawn node ENOENT` or `/bin/sh: node: command not found`

**Cause:** Node is installed via nvm. At pm2/LaunchAgent startup time, your shell profile hasn't loaded, so `node` isn't on the PATH.

> **Info:** nvm modifies `~/.zshrc` to add Node to your PATH at shell login. pm2 and LaunchAgent start before your shell profile loads, so they cannot find `node` unless given the full absolute path.

**Fix:**
```bash
# Find your actual node path
which node
# e.g. /Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/node

# Test it works
/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/node --version

# Update ecosystem.config.js to use the full path:
# interpreter: '/Users/yashbaldha/.nvm/versions/node/v20.20.1/bin/node'

pm2 delete polyglot
pm2 start "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/ecosystem.config.js"
pm2 save
```

---

### Config file missing or corrupt

**Problem:** Polyglot starts but shows no projects, or Settings page is blank.

**Cause:** `config.json` is missing or contains invalid JSON.

**Fix:**
```bash
cat "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/config.json"
# If missing or invalid JSON:
echo '{"projectDirs":["/Users/yashbaldha/Desktop/Boldteq App"],"port":3847}' \
  > "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/config.json"
pm2 restart polyglot
```

---

## Agents

### Agents not found (count shows 0)

**Problem:** Polyglot shows 0 agents. `curl http://localhost:3847/api/global/agents` returns `[]`.

**Cause:** `~/.claude/agents/` doesn't exist or all files have invalid frontmatter.

**Fix:**
```bash
# Check directory
ls ~/.claude/agents/
# Should show ~66 .md files

# If directory missing:
mkdir -p ~/.claude/agents/
# Then recreate agent files — see docs/02-agents.md for format
```

---

### Agent not invoked by Claude

**Problem:** You type `@nova` or describe a task that should route to an agent, but Claude doesn't use it.

**Cause A:** Agent file doesn't exist or is in the wrong directory.
```bash
ls ~/.claude/agents/ | grep nova
# Should show: nova.md
```

**Cause B:** Agent frontmatter is malformed.
```bash
node -e "
const fs = require('fs');
const matter = require('gray-matter');
const c = fs.readFileSync(process.env.HOME + '/.claude/agents/nova.md', 'utf-8');
const { data } = matter(c);
console.log('name:', data.name);
console.log('model:', data.model);
console.log('description:', data.description?.slice(0, 80));
"
# If this throws, the YAML frontmatter is malformed — fix the --- block at the top of the file
```

**Cause C:** Session not refreshed. Claude Code loads agents at session start.

**Fix:** Open a new Claude Code chat window.

---

### Wrong agent model being used

**Problem:** An agent is using a slow/expensive model when it should use Sonnet.

**Cause:** The `model:` field in the agent's frontmatter is wrong or missing.

**Fix:**
```bash
# Check the agent file
head -10 ~/.claude/agents/koda.md
# Should show: model: sonnet
# If wrong, edit the file and correct the model field
```

Valid values: `sonnet`, `opus`, `haiku` (maps to latest Claude model in each tier).

---

### Project agent not appearing

**Problem:** A project-specific agent exists but Claude Code doesn't use it.

**Cause:** File is not in `[project]/.claude/agents/` or has invalid frontmatter.

**Fix:**
```bash
ls "/Users/yashbaldha/Desktop/Boldteq App/YourProject/.claude/agents/"
# Should show .md files with valid frontmatter
# Open a new Claude Code window to reload
```

---

## AI Assistant

### "Claude process failed" in chat

**Problem:** Sending a message in the AI Assistant returns an error about the Claude process.

**Cause:** The `claude` CLI is not authenticated or not found.

**Fix:**
```bash
# Test the CLI directly
claude -p "Say hello" --print
# If this fails:
claude login
# Follow the authentication flow, then retry
```

---

### AI chat not streaming (loading forever)

**Problem:** Send a message in AI Assistant — spinner appears but nothing streams in.

**Cause:** SSE connection broken between browser and server, or claude subprocess hung.

**Fix:**
```bash
pm2 logs polyglot --lines 30
# Look for errors in the subprocess output

pm2 restart polyglot
```

Then hard-reload the browser: `Cmd+Shift+R`.

If it still hangs, check the browser console (F12 → Console) for network errors on the `/api/ai/stream` request.

---

### AI chat returns empty response

**Problem:** Chat completes (spinner stops) but the response is blank.

**Cause:** Claude returned an empty string, or the response was filtered.

**Fix:**
```bash
pm2 logs polyglot --lines 50 --err
# Check for "empty output" warnings or subprocess errors
```

Try a simpler test prompt: "Say hello." If that works, the original prompt may be hitting a content filter or context limit.

---

### AI context missing projects or agents

**Problem:** AI Assistant doesn't seem to know about your projects or agents.

**Cause:** The context API failed to load, or projects/agents directory is empty.

**Fix:**
```bash
# Check what the context API returns
curl -s http://localhost:3847/api/ai/context | python3 -c "
import sys, json
ctx = json.load(sys.stdin)
print('projects:', len(ctx.get('projects', [])))
print('agents:', len(ctx.get('agents', [])))
"
```

If projects or agents count is 0:
- Projects: check Settings has the correct parent directory
- Agents: check `~/.claude/agents/` has `.md` files with valid frontmatter

---

### File apply fails from AI suggestion

**Problem:** AI Assistant suggests a file change and offers to apply it, but the apply fails.

**Cause:** The file path doesn't exist, or the exact string to replace wasn't found.

**Fix:**
```bash
# Check the apply API
pm2 logs polyglot --lines 20 --err
# Look for "file not found" or "string not found" errors
```

The AI must suggest changes using exact strings from the current file. If the file was modified after the AI read it, the match fails. Re-read the file in the chat and ask the AI to suggest changes again.

---

## Memory Brain

### Memory files not loading

**Problem:** Agents don't seem to have knowledge that was saved to memory files.

**Cause:** Memory files exist but agents aren't reading them automatically.

> **Info:** Memory files are read by Claude Code when agents are explicitly instructed to check them. The global `CLAUDE.md` must instruct agents to load `~/.claude/memory/MEMORY.md` first. If that instruction is missing, agents won't look.

**Fix:** Verify the global CLAUDE.md instructs agents to check memory before starting any task.

```bash
# Check MEMORY.md index exists
ls ~/.claude/memory/MEMORY.md
# Check it lists the right files
cat ~/.claude/memory/MEMORY.md
```

---

### Permission errors writing memory

**Problem:** `/train` or Mira fails with a permission error when writing memory files.

**Fix:**
```bash
# Check permissions on the memory directory
ls -la ~/.claude/memory/
# Fix if needed:
chmod -R 755 ~/.claude/memory/
```

---

### Memory index (MEMORY.md) out of sync

**Problem:** `~/.claude/memory/MEMORY.md` lists files that don't exist, or new files aren't listed.

**Fix:** Run `/train` — Mira audits the memory directory and updates the index. Or update `MEMORY.md` manually to list all files under `~/.claude/memory/`.

> **Tip:** Run `/train` after every significant build session to keep the memory index current. Stale indexes cause agents to miss relevant accumulated knowledge.

---

### /train not updating memory

**Problem:** You run `/train` but memory files don't change.

**Cause A:** Mira agent file is missing or has bad frontmatter.
```bash
ls ~/.claude/agents/mira.md
```

**Cause B:** No significant work happened this session for Mira to extract.

**Cause C:** The claude process ran but produced no output. Check:
```bash
pm2 logs polyglot --lines 30
```

---

## Orchestration

### Node produces commentary instead of content

**Problem:** A node returns "I would write the listing like this: [description]" instead of the actual listing.

**Cause:** Node instructions don't direct Claude to produce the deliverable.

**Fix:** Update the node instructions to include:
```
Write the [deliverable]. Return only the [deliverable]. No preamble, no commentary, no explanation.
```

---

### SSE stream drops mid-run

**Problem:** Orchestration run starts, a few nodes complete, then the run panel freezes with no further updates.

**Cause:** SSE connection dropped — browser extension, proxy, or server crash.

**Fix:**
```bash
pm2 logs polyglot --lines 50 --err
# Look for crash or timeout errors
pm2 restart polyglot
```

Hard-reload: `Cmd+Shift+R`. Then re-run the pipeline.

---

### Disconnected nodes error

**Problem:** After clicking Run, a node never executes — stays gray forever.

**Cause:** Node has no incoming edges and is not the Start node. It's isolated from the graph.

**Fix:** Connect the node to an upstream node. Or delete it if not needed.

---

### Pipeline runs but no output

**Problem:** Run completes (all nodes green) but the final output section is empty.

**Cause:** Last node's instructions produced no concrete output, or the node output was whitespace-only.

**Fix:** Click the last node on canvas to inspect its output. If empty:
- Node instructions are too vague — add explicit "return only the [deliverable]"
- Check `pm2 logs polyglot --lines 50 --err` for subprocess errors

---

### Timeout on long-running nodes

**Problem:** `Node execution timed out after 120s`

**Cause:** The node's task scope is too large for the 120-second limit.

**Fix:**
- Narrow the node's instructions (smaller scope)
- Split into two nodes: Plan node → Execute node
- For code generation: break one "write the whole feature" node into separate Type, API, and UI nodes

---

## SDK

### "Polyglot not reachable"

**Problem:**
```javascript
{ success: false, error: 'Polyglot not reachable at http://localhost:3847 — is it running?' }
```

**Fix:**
```bash
# Step 1: Is Polyglot running?
lsof -ti:3847
# Empty = nothing running

# Step 2: Start it
pm2 start "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/ecosystem.config.js"
pm2 status

# Step 3: Verify it responds
curl -s http://localhost:3847/api/global/agents | head -c 50

# Step 4: Retry
node -e "const { isOnline } = require('@boldteq/agents'); isOnline().then(r => console.log('online:', r))"
```

---

### SDK not found in node_modules

**Problem:** `Error: Cannot find module '@boldteq/agents'`

**Fix:**
```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/YourProject"

# Check package.json has the entry
grep '@boldteq/agents' package.json
# Should show: "@boldteq/agents": "file:../polyglot/sdk"

# If missing, add it manually, then:
npm install

# Verify
ls node_modules/@boldteq/agents/
# Should show: index.js, index.d.ts, package.json
```

---

### callAgent returns empty or error

**Problem:** `callAgent` runs without throwing but returns `success: false` or empty `output`.

**Cause A:** Agent name doesn't exist.
```bash
ls ~/.claude/agents/ | grep koda
curl -s http://localhost:3847/api/global/agents | python3 -c "import sys,json; print([a['filename'] for a in json.load(sys.stdin)])"
```

**Cause B:** Claude CLI returned an error for that prompt.
```bash
pm2 logs polyglot --lines 30 --err
```

---

### Timeout on long agent calls

**Problem:** `{ success: false, error: 'Timed out after 120s' }`

**Fix:** Pass a longer timeout as the third argument:
```typescript
// 5 minutes
const result = await callAgent('koda', 'Build the auth flow', 300000)
```

Or break the task into smaller sequential calls:
```typescript
const plan = await callAgent('arya', 'Plan the auth + billing system')
const auth = await callAgent('koda', `Build auth. Plan: ${plan.output}`)
const billing = await callAgent('koda', `Build billing. Plan: ${plan.output}`)
```

---

## Commands & Rules

### Slash command not appearing in Claude Code

**Problem:** You created a command file but `/commandname` doesn't work.

**Fix:**
- Confirm file is in `[project]/.claude/commands/` (not `.claude/` root, not a subdirectory)
- Confirm file has `.md` extension
- Confirm filename uses only lowercase letters, numbers, hyphens
- Open a **new Claude Code chat window** — commands load at session start

---

### $ARGUMENTS not replaced

**Problem:** The literal text `$ARGUMENTS` appears in the executed prompt.

**Fix:**
- Must be `$ARGUMENTS` — exactly, all caps, no quotes, no braces
- Check there are no smart/curly quotes around it (copy-paste from a doc can introduce these)
- Verify the file encoding is UTF-8

---

### Rule not being enforced

**Problem:** You added a rule to `.claude/rules/` but Claude still does the thing the rule prohibits.

**Fix:**
- Confirm file is in `.claude/rules/` with `.md` extension
- Open a **new Claude Code session** — rules load at session start
- Make the rule language explicit and imperative: "Never do X" not "Prefer not to do X"
- Check Claude Code settings — rules must be in `.claude/rules/`, not elsewhere

---

### Command file syntax issues

**Problem:** Command runs but produces unexpected output.

**Fix:**
- `$ARGUMENTS` must appear in the file where you want the user's input substituted
- Commands with no `$ARGUMENTS` should be invoked as just `/commandname` — anything after is ignored
- Avoid HTML comments in command files — they may confuse the parser
- Keep code blocks fenced with triple backticks — they're preserved in the prompt

---

## Projects

### Project not discovered by Polyglot

**Problem:** Project doesn't appear in the Polyglot sidebar or Dashboard.

**Cause A:** Parent directory not in Settings.
```bash
curl -s http://localhost:3847/api/config | python3 -c "import sys,json; print(json.load(sys.stdin).get('projectDirs', []))"
# Must include the parent folder of your project
```

Fix: Settings → add `/Users/yashbaldha/Desktop/Boldteq App` → Save.

**Cause B:** No discoverable marker in the project directory.
```bash
ls "/Users/yashbaldha/Desktop/Boldteq App/NewProject/package.json" 2>/dev/null
ls "/Users/yashbaldha/Desktop/Boldteq App/NewProject/CLAUDE.md" 2>/dev/null
ls "/Users/yashbaldha/Desktop/Boldteq App/NewProject/.claude/" 2>/dev/null
# At least one must exist
```

**Cause C:** Directory name starts with `.` or is `node_modules`.

Fix: Rename the directory.

---

### Project CLAUDE.md not read by Claude Code

**Problem:** Claude Code doesn't seem to know the project's stack or patterns.

**Fix:**
- File must be named exactly `CLAUDE.md` (all caps) at the **project root** — not inside a subfolder
- Open a **new Claude Code chat window**
- Test: ask "What are my architecture rules?" — Claude should answer from CLAUDE.md

---

### SDK install fails for project

**Problem:** `npm install` fails after adding `@boldteq/agents` to `package.json`.

**Fix:**
```bash
# Verify the SDK path exists
ls "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/sdk/package.json"

# Check the relative path in package.json is correct
# From Pinzo: "file:../polyglot/sdk" (one level up from Pinzo, into polyglot/sdk)
# From a nested project: adjust the path accordingly

# Install with verbose to see the error
npm install --verbose 2>&1 | tail -30
```

---

## Documentation

### Doc page shows blank

**Problem:** Navigate to a docs page in Polyglot — content area is empty.

**Cause:** The `.md` file is missing, empty, or has no content after the filename.

**Fix:**
```bash
ls "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/docs/"
# Confirm the file exists and has content
cat "/Users/yashbaldha/Desktop/Boldteq App/Operation/Polyglot/docs/04-slash-commands.md" | head -5
```

---

### Doc not appearing in list

**Problem:** A docs file exists but doesn't appear in the docs navigation.

**Cause:** File doesn't follow the `NN-name.md` naming pattern.

**Fix:** Name docs files with a two-digit prefix: `04-slash-commands.md`, `08-newdoc.md`.

> **Info:** The server reads docs in alphabetical order by filename. The numeric prefix controls the order in the navigation sidebar.

---

## General

### Claude Code not picking up changes

**Problem:** You edited `CLAUDE.md`, an agent file, or a command file — but Claude Code still uses old behavior.

> **Info:** All configuration files (CLAUDE.md, agents, commands, rules) load at session start. Changes never apply to the current session — always open a new Claude Code chat window after editing any config file.

---

### Full System Health Check

Run this to diagnose all components at once:

```bash
#!/bin/bash
echo "=== Polyglot System Diagnostic ==="
echo ""

echo "1. Polyglot HTTP"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3847/api/global/agents 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  COUNT=$(curl -s http://localhost:3847/api/global/agents | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
  echo "   OK — responding (HTTP 200), $COUNT agents"
else
  echo "   FAIL — not responding (HTTP $STATUS or connection refused)"
fi

echo ""
echo "2. pm2 Status"
pm2 status 2>/dev/null | grep polyglot || echo "   polyglot not in pm2 list"

echo ""
echo "3. LaunchAgent"
LAUNCHD=$(launchctl list 2>/dev/null | grep polyglot)
if [ -n "$LAUNCHD" ]; then
  echo "   Registered: $LAUNCHD"
else
  echo "   Not registered"
fi

echo ""
echo "4. Global agents"
AGENT_COUNT=$(ls ~/.claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$AGENT_COUNT" -ge 50 ]; then
  echo "   OK — $AGENT_COUNT agents found"
else
  echo "   WARN — found $AGENT_COUNT agents (expected ~66)"
  ls ~/.claude/agents/ 2>/dev/null || echo "   Directory missing"
fi

echo ""
echo "5. Global CLAUDE.md"
if [ -f ~/.claude/CLAUDE.md ]; then
  LINES=$(wc -l < ~/.claude/CLAUDE.md)
  echo "   OK — found ($LINES lines)"
else
  echo "   MISSING — ~/.claude/CLAUDE.md not found"
fi

echo ""
echo "6. Memory brain"
if [ -f ~/.claude/memory/MEMORY.md ]; then
  echo "   OK — MEMORY.md exists"
else
  echo "   WARN — ~/.claude/memory/MEMORY.md missing"
fi

echo ""
echo "7. Claude CLI"
CLAUDE_VERSION=$(claude --version 2>/dev/null)
if [ -n "$CLAUDE_VERSION" ]; then
  echo "   OK — $CLAUDE_VERSION"
else
  echo "   FAIL — claude not found or not authenticated"
fi

echo ""
echo "8. Projects"
PROJECT_COUNT=$(curl -s http://localhost:3847/api/projects 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "   $PROJECT_COUNT projects discovered"

echo ""
echo "=== Done ==="
```

Save as `~/diagnostic.sh`, make executable with `chmod +x ~/diagnostic.sh`, run with `~/diagnostic.sh`.

> **Tip:** Run this script any time Polyglot behaves unexpectedly. It checks all 8 subsystems in one pass and surfaces missing components at a glance.
