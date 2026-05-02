# Rule: Agent Name Display

All agent name display MUST go through `formatAgentDisplay()` from `client/src/lib/agentDisplay.ts`.

Never render `agent.name`, `agent.title`, `node.name`, or `member.name` raw in JSX.

## Correct pattern

```tsx
import { formatAgentDisplay } from '../lib/agentDisplay'

const d = formatAgentDisplay({ name: agent.name, title: agent.title, id: agent.id })
// Then render:
<span>{d.emoji}</span>
<span>{d.realName}</span>
<span>{d.role}</span>
<span>{d.tagline}</span>
```

## What formatAgentDisplay returns

- `emoji` — leading emoji stripped from name
- `realName` — name without emoji, without `— role` suffix
- `role` — from `title` field, clamped to ≤6 words
- `tagline` — first sentence of description, ≤60 chars
- `fullName` — `realName — role`
- `fullDisplay` — `emoji realName — role`

## Standard display pattern across pages

| Location | Bold line | Sub-line |
|----------|-----------|----------|
| OrgChart card | `{emoji} {realName}` | `{role}` |
| Agents page row | `{emoji} {realName}` | `{role}` |
| HR registry row | `{emoji} {realName}` | `{role}` |
| HR detail panel | `{emoji} {realName}` | `{role}` |
| Playground dropdown | `{fullDisplay}` | `{tagline}` |
