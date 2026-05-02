# @boldteq/agents SDK

The SDK is a small npm package that lets any Boldteq project call any Claude agent programmatically — from a loader, action, API route, or script. One function. No subprocess management. No SSE parsing.

---

## Architecture

```
Your app code
  → callAgent('quill', 'Write listing for Pinzo')
    → POST http://localhost:3847/api/playground/run
      → Polyglot reads ~/.claude/agents/quill.md
        → Spawns: claude -p "[system prompt]\n\n[user prompt]"
          → Streams SSE output back
            → SDK parses SSE, returns structured result
```

- **Zero extra cost** — uses your existing Claude subscription.
- **Never throws** — all errors are returned in `result.error`, never thrown.
- **Requires Polyglot running** — if `localhost:3847` is unreachable, the call fails immediately with a clear error message.
- **Server-side only** — use in loaders, actions, API routes, and scripts only.

> **Caution:** Never import `@boldteq/agents` in browser code. It calls `localhost:3847` which is a server-only endpoint and will fail in the browser.

---

## SDK Files

Located at `polyglot/sdk/`:

| File | What it contains |
|------|-----------------|
| `sdk/package.json` | Package name `@boldteq/agents`, entry point, TypeScript types reference |
| `sdk/index.js` | Runtime — `callAgent`, `listAgents`, `isOnline` |
| `sdk/index.d.ts` | TypeScript declarations — `AgentResult`, `Agent` interfaces |

---

## Installation

### Option A — Via Polyglot UI (recommended)

1. Open http://localhost:3847/setup
2. Find your project in the table
3. Click "Install SDK"
4. Polyglot adds the dependency to `package.json` and runs `npm install`

### Option B — Manual

**Step 1.** Add to `package.json` dependencies:

```json
{
  "dependencies": {
    "@boldteq/agents": "file:../polyglot/sdk"
  }
}
```

The `file:` path is relative to the project root. All active projects are siblings of `polyglot/`, so the path is always `file:../polyglot/sdk`.

> **Caution:** The `file:` path resolves at install time. If the project moves to a different folder depth relative to `polyglot/`, update the path and re-run `npm install`.

If your project is nested deeper:
```
~/Desktop/Boldteq App/MyProject/        → file:../polyglot/sdk
~/Desktop/Boldteq App/apps/MyProject/   → file:../../polyglot/sdk
```

**Step 2.** Install:

```bash
cd "/Users/yashbaldha/Desktop/Boldteq App/MyProject"
npm install
```

**Step 3.** Verify:

```bash
node -e "
const { isOnline, listAgents } = require('@boldteq/agents');
Promise.all([isOnline(), listAgents()]).then(([online, agents]) => {
  console.log('Online:', online);
  console.log('Agents:', agents.length);
});
"
```

Expected:
```
Online: true
Agents: 12
```

---

## Full API Reference

### `callAgent(agentName, prompt, timeoutMs?)`

Calls a global agent with a task and waits for the response.

**TypeScript signature:**
```typescript
function callAgent(
  agentName: string,
  prompt: string,
  timeoutMs?: number  // default: 120000 (2 minutes)
): Promise<AgentResult>

interface AgentResult {
  success: boolean   // true if agent ran and returned output
  output: string     // agent's full response (empty string if failed)
  agent: string      // agentName echoed back
  error?: string     // only set if success is false
}
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `agentName` | string | Yes | — | Agent filename without `.md`, e.g. `'koda'`, `'quill'`, `'nova'` |
| `prompt` | string | Yes | — | The task to send. Write it as you would in a Claude Code chat. |
| `timeoutMs` | number | No | `120000` | Max wait time in milliseconds. Increase for complex tasks. |

**Examples:**

```javascript
// Basic call
const result = await callAgent('quill', 'Write a tagline for Pinzo')
if (result.success) {
  console.log(result.output)
} else {
  console.error(result.error)
}

// Custom timeout for long task
const result = await callAgent(
  'koda',
  'Build the subscription billing page with plan comparison table',
  300000  // 5 minutes
)

// Fire and forget
callAgent('mira', "Extract lessons from today's Pinzo session")
```

**When `success` is `false`:**

| Error message | Cause | Fix |
|---------------|-------|-----|
| `"Polyglot not reachable at http://localhost:3847 — is it running?"` | Server is down | `pm2 restart polyglot` |
| `"Timed out after Xs"` | Task too slow for timeout | Increase `timeoutMs` or break task into smaller prompts |
| `"Polyglot returned 4xx"` | Bad request or agent not found | Check `agentName` matches a file in `~/.claude/agents/` |

---

### `listAgents()`

Fetches all available global agents.

**TypeScript signature:**
```typescript
function listAgents(): Promise<Agent[]>

interface Agent {
  filename: string     // e.g. 'koda' (no .md)
  name: string         // e.g. 'Koda — Feature Builder'
  description: string  // from frontmatter
  model: string        // 'sonnet', 'opus', or 'haiku'
  body: string         // full system prompt body
}
```

Returns `[]` if Polyglot is not reachable (does not throw).

**Example:**

```javascript
const agents = await listAgents()
agents.forEach(a => console.log(`${a.filename} (${a.model})`))

// Output:
// arya (opus)
// bolt (sonnet)
// koda (sonnet)
// nova (sonnet)
// ...
```

---

### `isOnline()`

Checks if Polyglot is reachable. Uses a 3-second timeout.

**TypeScript signature:**
```typescript
function isOnline(): Promise<boolean>
```

Returns `true` if `GET /api/global/agents` responds with 200. Returns `false` otherwise (never throws).

**Example:**

```typescript
import { isOnline, callAgent } from '@boldteq/agents'

async function generateCopy(product: string) {
  if (!await isOnline()) {
    throw new Error('Polyglot offline. Run: pm2 restart polyglot')
  }
  return await callAgent('quill', `Write a tagline for ${product}`)
}
```

> **Tip:** Use `isOnline()` when Polyglot being down would block the user (e.g., a required generation step). For background or fire-and-forget tasks, skip the check — just call the agent and check `result.error`.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `POLYGLOT_URL` | `http://localhost:3847` | Override the Polyglot endpoint |

```bash
# In .env — only needed if Polyglot runs on a different machine
POLYGLOT_URL=http://192.168.1.10:3847
```

> **Info:** The SDK reads `POLYGLOT_URL` at import time. For the standard single-Mac setup, never set this — the default `http://localhost:3847` is always correct.

---

## Usage Examples by Agent

### Quill — Copy generation

```javascript
// App Store listing
const listing = await callAgent(
  'quill',
  'Write a Shopify App Store listing for Pinzo. Include: subtitle, 150-word description, 5 key feature bullets. Tone: clear, direct, conversion-focused.',
  180000
)

// Email sequence
const emails = await callAgent(
  'quill',
  'Write a 3-email onboarding sequence for Rankora (AI resume ranker). Day 1: activate. Day 3: engage. Day 7: retain.',
  180000
)
```

### Nova — Research

```javascript
const research = await callAgent(
  'nova',
  'Research the top 5 Shopify ZIP code / delivery area restriction apps. For each: name, pricing, top features, weak points. Then identify USP gaps.',
  180000
)
```

### Vex — Bug diagnosis

```javascript
const diagnosis = await callAgent(
  'vex',
  `Diagnose this error in our Pinzo Shopify app (React Router 7):
  TypeError: Cannot read properties of undefined (reading 'shop')
  at authenticate.admin (app/routes/app.zip-codes.tsx:15:25)`
)
```

### Koda — Code generation

```javascript
const endpoint = await callAgent(
  'koda',
  `Write a Next.js API route POST /api/rank-resumes:
  - Accepts { jobDescription: string, resumes: string[] }
  - Validates with Zod
  - Returns { rankings: { index: number, score: number, reason: string }[] }
  - Handles errors with proper status codes`,
  240000
)
```

---

## Error Handling Patterns

### Pattern 1 — Simple check

```javascript
const result = await callAgent('quill', 'Write tagline')
if (!result.success) {
  console.error('Agent failed:', result.error)
  return null
}
return result.output
```

### Pattern 2 — Distinguish error types

```javascript
const result = await callAgent('koda', 'Build feature', 300000)
if (!result.success) {
  if (result.error?.includes('not reachable')) {
    throw new Error('Polyglot is offline. Run: pm2 restart polyglot')
  }
  if (result.error?.includes('Timed out')) {
    // Retry with longer timeout or smaller task
    return await callAgent('koda', 'Build simplified feature', 600000)
  }
  console.error('Agent error:', result.error)
  return null
}
return result.output
```

### Pattern 3 — TypeScript with full typing

```typescript
import { callAgent } from '@boldteq/agents'
import type { AgentResult } from '@boldteq/agents'

async function generateDescription(productName: string): Promise<string> {
  const result: AgentResult = await callAgent(
    'quill',
    `Write a 2-sentence product description for ${productName}. Benefit-focused.`
  )
  if (!result.success) throw new Error(`Quill failed: ${result.error}`)
  return result.output
}
```

---

## Recreating the SDK from Scratch

If `polyglot/sdk/` is missing, recreate it:

```bash
mkdir -p "/Users/yashbaldha/Desktop/Boldteq App/polyglot/sdk"
```

**`sdk/package.json`:**
```json
{
  "name": "@boldteq/agents",
  "version": "1.0.0",
  "description": "Call any Boldteq Claude agent from any app",
  "main": "index.js",
  "types": "index.d.ts",
  "license": "UNLICENSED",
  "private": true
}
```

**`sdk/index.js`:**
```javascript
const POLYGLOT_URL = process.env.POLYGLOT_URL || 'http://localhost:3847'

async function callAgent(agentName, prompt, timeoutMs = 120000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${POLYGLOT_URL}/api/playground/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentName, prompt }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`Polyglot returned ${response.status}`)
    const text = await response.text()
    const events = text
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => { try { return JSON.parse(line.slice(6)) } catch { return null } })
      .filter(Boolean)
    const errorEvent = events.find(e => e.type === 'error')
    if (errorEvent) return { success: false, output: '', agent: agentName, error: errorEvent.error }
    const doneEvent = events.find(e => e.type === 'done' || e.type === 'complete')
    return { success: true, output: doneEvent?.output || '', agent: agentName }
  } catch (err) {
    clearTimeout(timeout)
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false, output: '', agent: agentName,
      error: msg.includes('abort')
        ? `Timed out after ${timeoutMs / 1000}s`
        : `Polyglot not reachable at ${POLYGLOT_URL} — is it running?`,
    }
  }
}

async function listAgents() {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/global/agents`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch { return [] }
}

async function isOnline() {
  try {
    const res = await fetch(`${POLYGLOT_URL}/api/global/agents`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch { return false }
}

module.exports = { callAgent, listAgents, isOnline }
```

**`sdk/index.d.ts`:**
```typescript
export interface AgentResult {
  success: boolean
  output: string
  agent: string
  error?: string
}
export interface Agent {
  filename: string
  name: string
  description: string
  model: string
  body: string
}
export function callAgent(agentName: string, prompt: string, timeoutMs?: number): Promise<AgentResult>
export function listAgents(): Promise<Agent[]>
export function isOnline(): Promise<boolean>
```

After creating the files, run `npm install` in each project that uses `file:../polyglot/sdk`.

---

## Troubleshooting

### "Polyglot not reachable"

```bash
pm2 status
# polyglot must show: online

pm2 restart polyglot
curl -s http://localhost:3847/api/global/agents | head -c 50
```

### SDK not found after npm install

```bash
# Verify the path in package.json is correct
cat package.json | grep boldteq
# Should show: "file:../polyglot/sdk"

# Verify the SDK source exists
ls "/Users/yashbaldha/Desktop/Boldteq App/polyglot/sdk/"
# Should show: index.js, index.d.ts, package.json

# Reinstall
npm install
ls node_modules/@boldteq/agents/
```

### Timeout issues

> **Tip:** Default timeout is 120 seconds. Complex tasks (Koda building a full feature, Arya planning an architecture) need 300–600 seconds. Always pass `timeoutMs` explicitly for any task that touches multiple files or requires planning: `callAgent('koda', prompt, 300000)`.

### New machine — SDK symlink broken

> **Info:** The `file:` path resolves at install time. On a new machine, run `npm install` in each project — it re-resolves the symlink to the new absolute path automatically.

```bash
cd "/Users/NEWUSER/Desktop/Boldteq App/Pinzo"
npm install
node -e "const { isOnline } = require('@boldteq/agents'); isOnline().then(r => console.log('online:', r))"
```
