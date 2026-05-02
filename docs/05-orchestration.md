# Orchestration

## What It Is

Orchestration is a visual DAG (Directed Acyclic Graph) builder in Polyglot. You chain multiple agents into a pipeline. Each node runs one agent. The output of each node flows automatically into the next node as context.

You define the pipeline once. Give it a task. Every stage runs in sequence without you manually passing output between agents.

**Simplest example:**

```
[Task Input] → Nova (research) → Quill (draft)
```

You type "Write App Store listing for Pinzo." Nova researches competitors and angles. Quill receives Nova's full output as context and writes the listing. You didn't copy-paste anything.

---

## When to Use Orchestration

| Situation | Use instead |
|-----------|-------------|
| Quick one-off task | Claude Code chat |
| Repeatable single-agent workflow | Slash command |
| Multi-step task requiring distinct specialist phases | **Orchestration** |
| Later stages need earlier stages' output | **Orchestration** |
| Programmatic agent calls from code | SDK (`callAgent`) |

Orchestration shines when you have 2+ stages with different expertise where later stages genuinely benefit from earlier stages' output.

> **Tip:** If the task only needs one agent and you don't need to chain outputs, use a slash command or direct `@agent` mention instead — it's faster.

---

## The Canvas

Open: `http://localhost:3847` → **Orchestration** in the left sidebar.

**Canvas layout:**
- Main canvas area — drag and position nodes
- Right sidebar — configure selected node
- Bottom panel — Run panel (task input, live log, final output)
- Top toolbar — New, Save, template picker, node palette

---

## Node Types

| Type | Claude call? | Description |
|------|-------------|-------------|
| Start / Task Input | No | Entry point. Passes your task text as output. Free — no API cost. |
| Agent Node | Yes | Runs a global agent (`~/.claude/agents/`) with optional instruction override |
| Custom Step | Yes | Runs Claude with instructions you write entirely yourself |

**Node anatomy:**
- **Label** — display name on canvas ("Research", "Draft", "Validate")
- **Agent** (Agent nodes) — which agent to use
- **Instructions** — what to tell this agent for this specific step

---

## Edges (Connections)

- Draw arrow from Node A to Node B → Node B receives Node A's output as context
- Multiple arrows into one node → that node receives all upstream outputs, labeled by source
- No cycles allowed — the graph must be a DAG

> **Caution:** Cycles (A → B → A) are rejected at run time. The system highlights the offending edge — delete it before re-running.

**Valid graph shapes:**

```
Linear:   A → B → C
Fan-out:  A → B
          A → C
Fan-in:   B → D
          C → D
Combined: A → B → D → E
          A → C → D
```

---

## Execution: How It Works

When you click **Run**, the server:

1. **Validates the graph** — detects cycles, performs topological sort
2. **Loads agents** — reads all `.md` files from `~/.claude/agents/` and project agents
3. **Executes nodes in topological order:**
   - Start node: stores your task as output, no Claude call
   - Agent/Custom node:
     - Collects outputs from all upstream nodes
     - Builds context string (each upstream output labeled by node name)
     - Runs `claude -p "[system prompt + context]"` as subprocess
     - 120-second timeout per node
     - Stores output, emits SSE event → canvas updates live

**Node status on canvas:**

| Color | Meaning |
|-------|---------|
| Gray | Not yet run |
| Animated purple | Currently executing |
| Green with checkmark | Done |
| Red | Error or timeout |

---

## Context Passing

This is the key mechanism. Each node receives upstream outputs automatically.

**Single upstream (linear chain):**

```
Prompt sent to Node B:
══════════════════════════════
[Node B instructions]

---

## Output from Research:
[Everything Node A returned]

Provide your response:
══════════════════════════════
```

**Multiple upstream (fan-in):**

```
Prompt sent to Node D:
══════════════════════════════
[Node D instructions]

---

## Output from Planner:
[Planner's full output]

## Output from Researcher:
[Researcher's full output]

Provide your response:
══════════════════════════════
```

Node D's Claude call sees both outputs, clearly labeled. It can synthesize, compare, or use them independently.

---

## Building a Pipeline: Step by Step

**Goal: Research → Draft → Polish**

1. Open `/orchestration` → click **New**

2. **Add Start node**
   - Type: Start / Task Input
   - Label: "Task Input"

3. **Add Research node**
   - Type: Agent Node
   - Agent: Nova
   - Label: "Research"
   - Instructions: "Research the given topic. Find competitors, key angles, user pain points. Return structured findings with bullet points. No commentary."
   - Connect: Task Input → Research

4. **Add Draft node**
   - Type: Agent Node
   - Agent: Quill
   - Label: "Draft"
   - Instructions: "Using the research provided, write a complete first draft. Be specific and benefit-focused. Return the draft only — no meta-commentary."
   - Connect: Research → Draft

5. **Add Polish node**
   - Type: Agent Node
   - Agent: Quill
   - Label: "Polish"
   - Instructions: "Polish this draft. Tighten every sentence. Cut filler. Ensure the opening hooks immediately. Return the final polished version only — no commentary."
   - Connect: Draft → Polish

6. **Save:** Click **Save** → name it "Research → Draft → Polish"

7. **Run:** Type task in Run panel → click **Run** → watch live execution

---

## The Run Panel

**Before run:**
- Task input field — type your top-level task
- Run button — starts execution

**During run:**
- Live log — each node completion with first 100 chars of output
- Click "View full output" next to any log entry

**After run:**
- Final Output section — last node's complete response
- Click any green node on canvas to see its full output in the sidebar

**Post-run actions:**
- **Re-run** — same pipeline, same task, fresh execution (useful for getting a variation)
- **Reset** — clears all statuses and outputs, returns to pre-run state

---

## Node Instructions: Bad vs Good

Node instructions are the most important thing to get right.

**Bad:**
```
Analyze the research and think about what content would work best.
```
Claude returns commentary about what good content looks like, not the content itself.

**Good:**
```
You are a Shopify app copywriter. Using the research provided:
1. Identify the top 3 user pain points mentioned
2. Write a 5-bullet feature list that directly addresses those pain points
3. Write a 150-word app description

Return only the bullets and description. No commentary, no preamble.
```

> **Tip:** Every node instruction must specify: (1) what format to return, (2) what NOT to include (no commentary, no preamble), and (3) length or scope. Without these, nodes return meta-commentary instead of the deliverable.

**More examples:**

| Bad | Good |
|-----|------|
| "Think about the task and break it down" | "Break the task into 5 numbered implementation steps. Include file names and method names. Return the numbered list only." |
| "Review the code" | "Check for: missing type annotations, `any` usage, unhandled promises. Output: ## Issues Found — [severity] file:line: problem → fix. ## Verdict: PASS / NEEDS FIXES" |
| "Write about the topic" | "Write a 400-word blog intro for: [topic]. Hook in first sentence. Return only the intro text." |

---

## Saving and Loading Pipelines

- **Save:** Click **Save** → enter a name → saved to `orchestrations.json`
- **Load:** Pipelines appear in the left sidebar list — click to load
- **Templates:** Pre-built pipelines at the top of the list — click to load, confirm before replacing canvas
- Saving stores the structure (nodes, edges, instructions) — not previous run outputs

> **Info:** Templates are pre-built pipelines included with Polyglot. Loading a template replaces the current canvas — save your work first.

---

## Advanced Patterns

### Fan-Out: Multi-Perspective Analysis

```
Task Input
  → Researcher A: "Find TypeScript/Node solutions"
  → Researcher B: "Find Python solutions"
  → Synthesizer: "Compare both approaches. Recommend best for our stack. Output recommendation only."
  → Developer: "Implement the recommended approach."
```

Both researchers receive only the task. Synthesizer receives both. Developer receives the recommendation.

**Use for:** Architecture decisions, technical comparisons, multi-angle analysis.

### Plan → Implement → Validate

```
Task → Arya (Planner) → Koda (Developer) → Sage (Reviewer)
```

Arya breaks the task into a build plan. Koda implements from the plan. Sage reviews.

**Use for:** Complex feature builds where architecture needs thought before coding.

### Summarizer Node (Controlling Context Size)

> **Caution:** Each downstream node receives all upstream outputs in full. If Node 1 returns 8KB and Node 2 returns 12KB, Node 3 receives 20KB of context — slow and expensive. Insert a Summarizer node between heavy-output steps.

```
Research → Summarizer → Developer
```

Summarizer instruction:
```
Condense the above research into 5 key bullet points. Maximum 100 words total.
Preserve the most actionable insights. Return the bullets only.
```

Developer works with 100 words of targeted context instead of 8KB of raw research.

### Validation Gate

```
Task → Developer → Validator
```

Validator instruction:
```
Review the implementation above. Check:
1. Does it follow the project patterns in CLAUDE.md?
2. Are error handling and loading states present?
3. Is input validated with Zod?

Output:
## PASS / FAIL
If FAIL: [issue] → [required fix]
```

If Validator outputs FAIL, re-run with Developer instructions that address the feedback.

### Cascading Specialization

```
Task → Planner → Specialist A (sub-task 1) → Integrator
              → Specialist B (sub-task 2) ↗
```

Planner splits the task. Specialists handle independent parts. Integrator synthesizes.

---

## Performance

| Operation | Typical time |
|-----------|-------------|
| Start/Task node | < 1ms (no Claude call) |
| Simple agent step | 5–20 seconds |
| Complex agent step (full implementation) | 20–60 seconds |
| Full 3-node pipeline | 30–90 seconds |
| Full 5-node pipeline | 75–180 seconds |

> **Info:** Nodes execute sequentially, not in parallel. Each node makes exactly one `claude -p` subprocess call.

> **Tip:** 3–5 nodes is the sweet spot. 7+ nodes is usually overkill — break into two pipelines and chain them manually. Add summarizer nodes after heavy-output steps to keep context lean.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orchestrations` | List all saved pipelines |
| `POST` | `/api/orchestrations` | Save a pipeline — body: `{ id?, name, nodes, edges }` |
| `GET` | `/api/orchestrations/:id` | Get one saved pipeline |
| `DELETE` | `/api/orchestrations/:id` | Delete a saved pipeline |
| `POST` | `/api/orchestrations/run` | Execute a pipeline with SSE streaming — body: `{ nodes, edges, task }` |

`POST /api/orchestrations/run` returns a Server-Sent Events stream. Each event is a JSON object:

```json
{ "type": "start", "nodeId": "node-1", "label": "Research" }
{ "type": "done", "nodeId": "node-1", "label": "Research", "output": "..." }
{ "type": "complete", "finalOutput": "..." }
{ "type": "error", "nodeId": "node-1", "error": "Timed out after 120s" }
```

---

## Troubleshooting

**Node produces commentary instead of content**
- Cause: Instructions don't specify that Claude should produce the deliverable directly.
- Fix: Add "Return only the [deliverable]. No preamble, no commentary, no explanation."

**Node timeout (120s)**
- Cause: Task scope is too large for one node.
- Fix: Split into two nodes (Plan → Execute). Or narrow the instructions.

**SSE stream drops mid-run / run panel shows nothing**
- Cause: SSE connection broken, often a browser extension or proxy.
- Fix: `pm2 logs polyglot --lines 30` → check for errors. Then: `pm2 restart polyglot` and hard-reload the page (Cmd+Shift+R).

**Disconnected node stays gray after run**
- Cause: Node has no incoming edges and is not the Start node.
- Fix: Connect it to an upstream node, or delete it.

**"Circular dependency detected" on run**
- Cause: Nodes form a cycle (A → B → C → A).
- Fix: Find and delete the edge that closes the loop. The system highlights it.

**Pipeline saves but disappears after restart**
- Cause: Write permission issue on `orchestrations.json`.
- Fix:

> **Caution:** If `orchestrations.json` is not writable, saves succeed in the UI but the file is not updated on disk. Run `chmod 644` to fix.

  ```bash
  chmod 644 "/Users/yashbaldha/Desktop/Boldteq App/polyglot/orchestrations.json"
  ```

**Pipeline runs but final output is empty**
- Cause: Last node's instructions produce no concrete output, or the node errored silently.
- Fix: Click the last node to inspect its output. Check `pm2 logs polyglot --lines 50 --err` for subprocess errors.
