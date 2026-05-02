# Rule: No Hardcoded Org Data

Never hardcode the following in any `.tsx`, `.ts`, or `.js` file:

- **Agent statuses** — import `AGENT_STATUSES` from `client/src/lib/constants.ts`
- **Squad names/colors/emojis** — use `useTaxonomy().squads` from the API
- **Tier names/icons** — use `useTaxonomy().tiers` from the API
- **Tag categories/tags** — use `useTaxonomy().categories` from the API
- **Department names/colors** — use `/api/departments` via `useDepartments()` hook
- **Department order** — derived from API `departments[].order` field

## Allowed exceptions
- `orgConstants.ts` — offline fallback only, never rendered directly in UI
- `useTaxonomy.ts` `FALLBACK_*` constants — only used when API is unreachable

## Examples

Bad:
```tsx
{(['active', 'probation', 'pip', 'retired'] as const).map(s => ...)}
```

Good:
```tsx
import { AGENT_STATUSES } from '../lib/constants'
{AGENT_STATUSES.map(s => ...)}
```

Bad:
```tsx
const TIER_ICONS = { leadership: Shield, engineer: Cpu }
```

Good:
```tsx
const { tierById } = useTaxonomy()
const icon = TIER_ICON_MAP[tierById[tier]?.icon] ?? Cpu
```
