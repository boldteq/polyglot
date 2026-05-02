# Local Autocomplete — Continue.dev + Ollama (VS Code only)

**Locked:** 2026-04-22
**Scope:** VS Code tab-complete + inline single-file edits only. NEVER dispatches as a Polyglot agent.
**Goal:** Cut the autocomplete/inline-edit slice of Anthropic billing + eliminate network latency on tab-complete.

---

## Hard Scope Boundary

| Allowed | Forbidden |
|---------|-----------|
| Tab-complete inside a `.ts` / `.tsx` / `.js` / `.py` file | Generating RLS policies |
| Inline edit for function body in one file | Generating auth flows |
| Boilerplate snippets (imports, types, test skeletons) | Generating payment/billing code |
| Renaming local variables in visible scope | Generating API design |
| Autocomplete inside function / small block | Generating DB schema |
| Tailwind class tab-complete | Running as a Polyglot agent |
| Commit message drafts from diff | Touching any file under `supabase/migrations/` |

**If it's production code with security, tenancy, billing, or AI-security implications → use Claude Code, not Continue.** Human must review every Continue suggestion before accepting.

---

## Install

```bash
# 1. Ollama
brew install ollama
ollama serve &   # or enable as launchd service

# 2. Models (M1-friendly 7B)
ollama pull qwen2.5-coder:7b              # primary autocomplete
ollama pull qwen2.5-coder:1.5b            # sub-second latency fallback
ollama pull deepseek-coder-v2:lite        # chat/quick-edit backup

# 3. VS Code extension
# Install "Continue" from the marketplace (publisher: Continue)
```

---

## Config — `~/.continue/config.yaml`

Continue moved from JSON to YAML schema (v1). Reference config lives at `~/.continue/config.yaml` and mirrors this template:

```yaml
name: Boldteq Local Autocomplete
version: 1.0.0
schema: v1

models:
  - name: Qwen 7B (local chat/edit)
    provider: ollama
    model: qwen2.5-coder:7b
    apiBase: http://localhost:11434
    roles: [chat, edit]

  - name: Qwen 1.5B (local autocomplete)
    provider: ollama
    model: qwen2.5-coder:1.5b
    apiBase: http://localhost:11434
    roles: [autocomplete]

  - name: DeepSeek Coder Lite (local backup)
    provider: ollama
    model: deepseek-coder-v2:lite
    apiBase: http://localhost:11434
    roles: [chat, edit]
```

**Critical: no `anthropic` provider entry.** Continue must never call Claude — that path is served by Claude Code. Double-calling = double billing.

---

## VS Code Settings Guardrails

Add to `.vscode/settings.json` at the workspace or user level:

```json
{
  "continue.telemetryEnabled": false,
  "continue.showInlineTip": false,
  "editor.inlineSuggest.enabled": true,
  "github.copilot.enable": { "*": false }
}
```

**Disable Copilot entirely.** Running Copilot alongside Continue causes suggestion collisions and wastes both providers' quotas. Codeium is also redundant — pick one autocomplete source.

---

## Ollama Service Management (macOS)

Run Ollama as a background service so autocomplete is always ready:

```bash
# launchd plist — save to ~/Library/LaunchAgents/com.ollama.server.plist
# Then: launchctl load ~/Library/LaunchAgents/com.ollama.server.plist
```

Health check one-liner:
```bash
curl -s http://localhost:11434/api/tags | jq '.models[].name'
```

If Ollama isn't responding, VS Code autocomplete silently falls back to Claude Code's inline — no error state visible to user. Worth adding a menubar watcher.

---

## What Each Local Model is For

| Model | Size | Role | Latency target |
|-------|------|------|----------------|
| `qwen2.5-coder:1.5b` | ~1 GB | tab-complete (typing) | <200ms |
| `qwen2.5-coder:7b` | ~4.7 GB | Continue chat + inline edit | <1.5s |
| `deepseek-coder-v2:lite` | ~8.9 GB | backup for Qwen misses on JS/TS | <2s |

M1 8GB RAM: stick to 1.5B + 7B only. M1 16GB+: all three load fine.

---

## What NEVER Goes Through Continue

1. Any code that gets committed without Sage review — Continue output is draft grade, not production.
2. Any prompt that references `CLAUDE.md`, `memory/`, `agents/`, or Polyglot dispatch. Those live in Claude Code.
3. Any PR-open, deploy, or schema-migration workflow. Those stay in the agent pipeline.

---

## Integration with Polyglot (Zero)

Continue and Polyglot are **parallel universes by design**:

- Continue writes/suggests → human accepts → human runs Claude Code for anything non-trivial → agent pipeline kicks in → gates enforce quality.
- `cost_logs` table does NOT record Continue usage (it's local, free, and not part of agent_runs).
- Mira does NOT log Continue suggestions as agent decisions. Training data stays clean.
- `/train` ignores Continue entirely.

**The only cross-reference** is this doc. No SDK changes, no schema changes, no agent rewrites.

---

## When to Abandon Continue

Kill the setup if any of these are true after 14 days:

1. Ollama crashes >1×/day → too unstable for daily work, revert to Claude Code inline.
2. Continue suggestions get accepted and later bug-fixed >20% of the time → quality floor too low, scope back to Copilot-style stricter autocomplete only.
3. M1 fan/thermal issues during normal work → models too large; drop to 1.5B only.
4. You find yourself pasting Continue output into Claude Code for "fix this" — round trip defeats the purpose.

---

## Cost Expectation

- Claude Code inline completions billed to Anthropic → ~5–10% of monthly spend in Yash's usage pattern (estimated, not measured).
- Ollama local → $0 variable cost, electricity only.
- **Expected savings:** 5–10% of current $200/mo = $10–20/mo. Small but free.
- **Expected speed gain:** tab-complete feels instant (local) vs. 200–500ms network round-trip.

If the measured savings after 30 days are <$5, the setup's not worth the complexity — kill it and stay on Claude Code inline.
