# Competitive Dominance Engine — Build Products That Beat Every Competitor

**Purpose:** Every app built by Boldteq agents must dominate its market. Not "compete" — DOMINATE. This file contains the patterns that make products unbeatable.

**Sources:** Linear, Figma, Notion, Stripe, Vercel, Superhuman, Slack, Cal.com, Dub.sh, Supabase + 12 open-source SaaS codebases.

---

## The 8 Moats That Create Category Killers

### Moat 1: Speed (Non-Negotiable)

**Why:** 100ms slower = 7% conversion drop. The fastest app in any category ALWAYS wins long-term.

**Targets:**
| Interaction | Target | Technique |
|------------|--------|-----------|
| Button click | <50ms | Optimistic UI (update before server confirms) |
| Page navigation | <100ms | Prefetch on hover, client-side routing |
| Form submission | <200ms | Optimistic + background sync |
| First page load | <2s | Code splitting + skeleton + edge CDN |
| Search/filter | <100ms | Client-side filter + debounced server search |

**Implementation Patterns:**

```tsx
// OPTIMISTIC UI: Update immediately, sync in background
const likePost = useMutation({
  mutationFn: (postId) => api.likePost(postId),
  onMutate: async (postId) => {
    // Cancel outgoing queries
    await queryClient.cancelQueries(['posts', postId])
    // Snapshot current
    const previous = queryClient.getQueryData(['posts', postId])
    // Optimistically update
    queryClient.setQueryData(['posts', postId], (old) => ({
      ...old, liked: true, likeCount: old.likeCount + 1
    }))
    return { previous }
  },
  onError: (err, postId, context) => {
    // Revert on error
    queryClient.setQueryData(['posts', postId], context.previous)
    toast.error("Failed to save. Please try again.")
  },
})

// PREFETCH ON HOVER: Load before click
<Link
  to="/settings"
  onMouseEnter={() => queryClient.prefetchQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })}
>
  Settings
</Link>

// SKELETON THAT MATCHES LAYOUT (prevents CLS)
function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" /> {/* Title */}
      <div className="grid grid-cols-4 gap-4">
        {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    </div>
  )
}
```

### Moat 2: Keyboard-First UX

**Why:** Power users (the ones who pay, refer, and stay) use keyboard. Keyboard-first = 2-3x daily usage.

**What to build:**
1. **Command palette (Cmd+K)** — search anything, run any action
2. **Page shortcuts** — G+S = go to settings, G+D = go to dashboard
3. **Action shortcuts** — N = new item, E = edit, D = delete, / = search
4. **Navigation** — J/K to move between items, Enter to open

```tsx
// Command palette with cmdk
import { Command } from "cmdk"

function CommandPalette() {
  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="Search or run a command..." />
      <Command.List>
        <Command.Group heading="Navigation">
          <Command.Item onSelect={() => navigate('/dashboard')}>
            Go to Dashboard
          </Command.Item>
          <Command.Item onSelect={() => navigate('/settings')}>
            Go to Settings
          </Command.Item>
        </Command.Group>
        <Command.Group heading="Actions">
          <Command.Item onSelect={() => createNewItem()}>
            Create New Item
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}

// Global keyboard shortcuts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // Cmd+K → command palette
    if (e.metaKey && e.key === 'k') { e.preventDefault(); setOpen(true) }
    // Escape → close anything
    if (e.key === 'Escape') { closeAll() }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

### Moat 3: Complete Feature States

**Why:** Competitors ship features. Category killers ship COMPLETE features with every state handled.

**Every data-dependent component MUST have:**
```
1. LOADING → Skeleton matching real layout (not spinner)
2. EMPTY → Icon + descriptive message + CTA to create first item
3. ERROR → What went wrong + what user can do + retry button
4. SUCCESS → Data rendered + subtle confirmation
5. PARTIAL → Pagination for large sets, "Load more" or virtual scroll
6. OFFLINE → Cached data shown with "offline" indicator
```

### Moat 4: Design Quality (Signals Engineering Quality)

**Why:** Users judge code quality by visual quality. Beautiful UI = trusted product.

**Implementation rules:**
```
SPACING: 4px grid. Everything divisible by 4. No exceptions.
  - gap-1 (4px), gap-2 (8px), gap-3 (12px), gap-4 (16px), gap-6 (24px)

TYPOGRAPHY: Clear hierarchy. Max 3 font sizes per page.
  - Page title: text-2xl font-semibold tracking-tight
  - Section title: text-base font-semibold
  - Body: text-sm
  - Caption: text-xs text-muted-foreground

COLORS: Semantic only. Never hardcoded hex.
  - Primary action: bg-primary text-primary-foreground
  - Secondary: bg-secondary text-secondary-foreground
  - Destructive: bg-destructive text-destructive-foreground
  - Muted text: text-muted-foreground
  - Borders: border (uses CSS variable)

MICRO-INTERACTIONS: Every state change animated.
  - Hover: 150ms ease-out (opacity, scale, color shift)
  - Click: 100ms ease-in (active state)
  - Enter/Exit: 200ms ease-out (fade, slide)
  - Page transition: 150ms (cross-fade)
```

### Moat 5: Onboarding That Converts

**Why:** 40-60% of free trial users never come back after day 1. Onboarding decides everything.

**Pattern: Time-to-Value < 2 Minutes**
```
STEP 1 (0-30s): Sign up (email + password only, NO long forms)
STEP 2 (30-60s): See the product working (demo data pre-loaded)
STEP 3 (60-120s): Complete first real action (create first item, run first analysis)
STEP 4 (120s+): Show progress checklist (3-5 items, first one already complete)

ANTI-PATTERNS:
  ✗ 5-field signup form
  ✗ Empty dashboard after signup
  ✗ "Please verify your email before continuing"
  ✗ Feature tour with 8+ tooltips
  ✗ Setup wizard with 4+ steps before value
```

### Moat 6: Viral Mechanics Built In

**Why:** CAC for PLG products is 50% lower than sales-led. Viral coefficient >1.0 = exponential growth.

**Patterns:**
```
1. SHAREABLE OUTPUT: User creates something → share link generated → recipient sees value → signs up
   Example: Calendly link, Notion page, Figma file, ranking report

2. TEAM INVITE LOOP: App becomes more valuable with teammates → invite flow prominent
   Example: "Invite your team" → team member joins → invites more → network effect

3. POWERED-BY BADGE: Free tier shows "Made with [AppName]" on output
   Example: Typeform, Calendly, Carrd all use this

4. INTEGRATION HOOKS: Connect to tools teams already use → product embeds in workflow
   Example: Slack notifications, GitHub integration, Chrome extension
```

### Moat 7: AI That Provides Real Value (Not ChatGPT Wrapper)

**Why:** By 2026 every SaaS has "AI" — generic AI is table stakes. Differentiating AI = domain-specific, context-aware.

**Patterns for meaningful AI:**
```
1. CONTEXT-AWARE: AI knows user's data, history, preferences
   ✗ Generic: "AI assistant" that answers questions
   ✓ Specific: "Smart suggestions" based on user's past actions

2. SAVES TIME ON REPETITIVE WORK:
   ✗ Chat interface to ask questions
   ✓ Auto-fill forms from past data, auto-categorize, auto-tag

3. PREDICTIVE:
   ✗ "Ask AI anything"
   ✓ "You usually do X on Mondays — want me to set it up?"

4. DOMAIN-SPECIFIC:
   ✗ GPT wrapper with custom system prompt
   ✓ Fine-tuned on product's domain data with specific output format
```

### Moat 8: Production Infrastructure

**Why:** Competitors build features. Dominators build infrastructure that makes features reliable.

**Non-negotiable infrastructure:**
```
- Row Level Security on EVERY table (multi-tenant isolation)
- Audit logging on ALL admin mutations
- Rate limiting on ALL public endpoints
- Feature flags for gradual rollout
- Error boundaries on ALL routes (app never white-screens)
- Structured logging (searchable, not console.log)
- Database indexes on all frequently queried columns
- Background jobs for anything > 500ms (email, AI, file processing)
- Webhook retry with exponential backoff
- Health check endpoint for monitoring
```

---

## Agent Implementation Rules

### For Arya (Architecture):
```
EVERY architecture plan MUST include:
  - Optimistic UI strategy (which mutations are optimistic?)
  - Caching strategy (what data is cached? TTL?)
  - Real-time strategy (which data updates live? WebSocket or polling?)
  - Pagination strategy (offset? cursor? infinite scroll?)
  - Multi-tenant isolation (RLS policies for every table)
  - Background job strategy (what runs async?)
```

### For Koda (Builder):
```
EVERY feature MUST ship with:
  - Optimistic UI on all mutations (update before server responds)
  - Keyboard shortcuts for key actions
  - Loading skeleton (NOT spinner)
  - Empty state with CTA
  - Error handling with user-friendly message + retry
  - Mobile responsive (tested at 375px)
  - Dark mode (CSS variables, no hardcoded colors)
  - Animation on state transitions (150ms ease-out minimum)
```

### For Vega (Design):
```
EVERY design spec MUST include:
  - Exact spacing values (4px grid)
  - Typography hierarchy (max 3 sizes per page)
  - All 6 states (loading, empty, error, success, partial, offline)
  - Mobile layout (not just "it stacks")
  - Dark mode token mapping
  - Animation specs (duration, easing, trigger)
  - Keyboard interaction spec (tab order, shortcuts)
```

### For Nova (Research):
```
EVERY competitive analysis MUST answer:
  - What do competitors do well? (steal their best patterns)
  - What do competitors do poorly? (our differentiation opportunity)
  - What do their users complain about? (our feature priorities)
  - What's their pricing? (our positioning)
  - What's their tech stack? (our technical advantages)
```

### For Sage (Audit):
```
EVERY audit MUST check:
  - Performance: interactions < 100ms? LCP < 2.5s?
  - Security: RLS on all tables? No hardcoded secrets?
  - Accessibility: WCAG AA? Keyboard navigation?
  - Completeness: All 6 states? Mobile? Dark mode?
  - Polish: Animations? Hover states? Focus visible?
```

---

## Metrics: How to Know You're Dominating

| Metric | Competing | Dominating | How to Measure |
|--------|-----------|------------|----------------|
| P95 Interaction | <500ms | <100ms | Performance monitoring |
| Activation (day 1) | 30% | 60%+ | User completes core action |
| DAU/MAU | 20% | 40%+ | Analytics |
| Monthly Churn | 5% | <2% | Billing data |
| NPS | 30 | 60+ | In-app survey |
| Feature Adoption | 2 features | 5+ features | Analytics |
| Referral Rate | 5% | 20%+ | Invite tracking |
| Support Tickets | 10% of users | <2% of users | Help desk |
