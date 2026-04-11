# SaaS Winning Patterns — The 10 Principles That Drive Growth

> **Context:** Cross-product patterns from Stripe, Linear, Notion, Vercel, Figma, Slack, Superhuman, Loom, Calendly, Intercom, Airtable, Retool
> **Purpose:** Distill what separates $100M+ SaaS from the rest. Strategic patterns for Speed, Growth, and PMF.
> **Target Users:** Architects (Arya), Product Builders (Koda), Designers (Vega)
> **Last Updated:** 2026-04-05
> **Usage Metric:** 0 (fresh entry)
> **Knowledge Version:** v1

---

## The 10 Winning Principles

These principles appear across successful SaaS products. They are not optional — they are the foundation of every winning product.

### 1. Speed is the Product (NOT a feature)

**Pattern:** Stripe, Linear, Superhuman, Vercel obsess over <100ms interaction times. Speed is the core brand promise, not an afterthought.

**What to measure:**
- **Page load time (LCP):** < 2.5 seconds
- **Time to Interactive:** < 3.5 seconds
- **Interaction response:** < 100ms (button click → visual feedback)
- **API response:** < 200ms (P95)
- **Perceived performance:** < 500ms (with skeleton screens + optimistic updates)

**How to deliver:**
- Skeleton screens instead of spinners (20% faster perceived load, psychological effect of progress)
- Optimistic UI updates (user action completes locally before server confirms)
- Lazy-load secondary content (charts, tables load after critical path)
- Caching and prefetching (link hover → cache page, preview on demand)

**Why it matters:**
Users form perception in <500ms. Every 100ms delay = 7% drop in conversion. Speed is the cheapest growth lever.

**Example (Linear):** Keyboard shortcut (J/K) completes instantly. Vim users feel at home. Database query happens in background.

**Stack A (Next.js + Supabase):**
```typescript
// Optimistic update pattern
const { mutate } = useMutation(async (data) => {
  // 1. Update local state immediately
  queryClient.setQueryData(['jobs'], (old) => [data, ...old]);

  // 2. Call API in background
  const { error } = await supabase.from('jobs').insert(data);

  // 3. If error, rollback
  if (error) queryClient.invalidateQueries(['jobs']);
}, { throwOnError: false });
```

---

### 2. Defaults > Customization (Ship Opinions, Not Options)

**Pattern:** Notion, Linear, Vercel, Retool all ship strong defaults. They DO NOT give users 100 customization options.

**The trap to avoid:**
Users assume more options = more power. Reality: more options = more complexity = higher churn = more support burden.

**Strategy:**
- **Tier 1:** Default state (80% of users never change this)
- **Tier 2:** Simple overrides for power users (20% drill into "Advanced")
- **Tier 3:** NEVER ship Tier 3 (you don't need it)

**Example (Vercel):**
- Default: Git-based deployment, auto-preview for every PR, production auto-deploy on merge
- Override: Environment variables, custom domains, build settings (in Advanced)
- Skip: Custom build runners, webhook routing, manual deploys (not in product)

**Why it matters:**
Every option = support cost + onboarding friction + cognitive load. Sensible defaults reduce all three.

**Antipattern:** "Let users decide" settings. If you can't pick the right default, your product isn't mature enough.

---

### 3. Virality is Built Into Product, Not Bolted On

**Pattern:** Figma (multiplayer), Loom (reciprocal), Calendly (exposure), Slack (invite team) — the CORE ACTION creates distribution.

**Core question:** What does the user do that naturally creates unpaid acquisition?

**Examples:**
- **Figma:** Multiplayer editing → invite teammate → they see collaboration → sign up
- **Loom:** Record video → share with 5 people → 2 see value → record reply → viral loop
- **Calendly:** Send scheduling link → recipient signs up to use Calendly too → exposure virality
- **Slack:** 3-click onboarding → invite team → team sees value → growth (no separate viral feature)

**Why it matters:**
Bolted-on virality (referral badges, "invite friends" buttons) has <1% adoption. Core-action virality compounds.

**Red flag:** If virality isn't happening, you can't force it with mechanics. Your product isn't solving a shared problem.

**For the project (Resume Ranker):**
- Core action: User ranks resumes for a job
- Potential viral: Share ranking link with hiring team → they see rankings → they use the app too
- Don't bolt on: "Refer a friend, get credits" (low adoption, hurts brand)

---

### 4. Onboarding Happens DURING Product Use, Not Before

**Pattern:** Slack (3 clicks), Notion (templates), Superhuman (30-min 1:1) — users learn by DOING, not watching.

**What fails:**
- 15-step onboarding wizard
- "Learn how to use the app" video tutorial
- Feature explainer tour (users close after slide 2)
- Empty workspace with "Click here to get started"

**What works:**
- Drop users into functional product immediately (not blank canvas)
- First action = something they can see instantly
- Second action = something that compounds (invite team, create second item)
- Teach in context (hover tooltips, inline help, keyboard hints)

**Superhuman's approach (premium model):**
```
1. Sign up (2 minutes)
2. Take typing test → gets onboarded to features you need
3. 30-minute 1:1 with human coach → muscle memory drills
4. Result: User is fast + confident + feels premium
```

**Slack's approach (freemium model):**
```
1. Create workspace (1 click)
2. Invite team (1 click)
3. You're in General channel, fully functional (1 click)
4. Channel itself teaches: "Type @ to mention someone"
5. Result: User experiences value before paying
```

**Time budgets:**
- First 30 seconds: Must feel confident (not lost)
- First 2 minutes: Must hit an "aha moment" (tangible value)
- First 15 minutes: Must create something shareable or repeatable
- First hour: Habit loop established (user knows they'll return)

**Onboarding ≠ Signup.** Users must "activate" (hit aha moment), not just "sign up."

---

### 5. Keyboard-First = Premium Feel

**Pattern:** Linear, Superhuman, Retool all prioritize keyboard speed. Power users expect keyboard acceleration.

**Strategy:**
- Every action has a keyboard shortcut (not optional)
- Shortcuts visible on hover (not memorized)
- Command palette (Cmd+K) is the main hub
- Vim-based navigation (J/K up/down, H/L left/right) for developers

**The Superhuman formula:**
- Every shortcut shown in command palette (Cmd+K)
- Hover over button shows shortcut hint: "(Cmd+S)" bottom-right
- Repeated exposure → muscle memory → power users fly
- Undo is the safety net (actions complete optimistically, undo if wrong)

**Key shortcuts (standard across products):**
```
Cmd+K:      Command palette (search, navigate, discover)
Cmd+J:      Jump to [item]
Cmd+B:      Toggle sidebar
Cmd+Shift+P: Filters / Advanced search
Cmd+/:      Help / keyboard shortcuts cheat sheet
```

**Feature-specific shortcuts (max 5 per context):**
```
Linear: C = create issue, S = set status, P = priority, A = assign, X = open actions
Notion: / = slash commands, Cmd+D = dark mode
the project: R = rank, D = delete job, J = next result, K = prev result, E = export
```

**Passive learning (Linear's innovation):**
- Hover button for 2 seconds → tooltip pops showing shortcut
- Repeated exposure → users naturally adopt without tutorials
- Notification on first keyboard use: "Try Cmd+K to search"

**Why it matters:**
Keyboard mastery = speed = power = retention. Users who learn shortcuts never leave (switching cost too high).

---

### 6. Design Principles > Design Pixels

**Pattern:** Stripe (20-page API doc), Linear (interaction design manifesto), Intercom (4 principles) — philosophy BEFORE CSS.

**What to document:**
1. **Product philosophy** (1-2 pages)
   - What are you optimizing for? (speed, simplicity, power, control?)
   - What are you NOT optimizing for? (customization, features, visual pizzazz?)
   - Example (Linear): "Opinionated, simple, fast. No endless menus. Keyboard-first."

2. **Design principles** (4-6 pages)
   - Reuse before creating (if pattern exists, use it)
   - Simple + opinionated by default (hide complexity until needed)
   - Progressive disclosure (80% of power hidden, revealed on demand)
   - Conversational (product communicates intent clearly)

3. **Interaction fundamentals** (3-5 pages)
   - Hover states (animation duration, color shift, shadow depth)
   - Loading states (skeleton, not spinner, match final layout)
   - Error handling (specific message, recovery action)
   - Focus states (keyboard navigation must feel safe and fast)

4. **Evolution framework** (1-2 pages)
   - When product changes, evaluate across 4 dimensions:
     - Product (what features matter)
     - Market (what competitors do)
     - Customers (what they need)
     - Business (what drives revenue)
   - When all converge, reinvent category

**Why it matters:**
Principles scale. Pixels don't. When new team members join, they read principles, not code, and make better decisions.

**Example (Stripe's API Design Principles):**
```
1. REST foundation with predictability
   - Resource-oriented URLs
   - Standard HTTP verbs
   - Form-encoded requests, JSON responses
   - Cursor-based pagination (not offset)

2. Idempotency by default
   - Every state-changing operation is idempotent
   - Retry requests safely with idempotency key

3. Consistency through universality
   - Every developer knows HTTP
   - This reusability makes every endpoint intuitive
```

---

### 7. Simplicity is a Strategic Choice (Calendly)

**Pattern:** Calendly's entire value prop: schedule meetings without email tennis. That's it. Ship that.

**Calendly's onboarding (<2 minutes):**
```
1. Connect calendar (1 click)
2. Set availability (1 action)
3. Copy link (1 copy)
4. Share link (1 share)
5. Done
```

**Why it works:**
- Brutally simple
- First-time user gets tangible value in <2 minutes
- Sharing link = unpaid acquisition (both parties benefit)
- 10-year consistency (same message for 10 years)
- Capital-efficient (no massive sales/marketing spend)

**The trap to avoid:**
Don't add "nice to have" features. Every feature = complexity = slower onboarding = lower conversion.

**Test for simplicity:**
- Can a new user hit value in <2 minutes?
- Can you explain the product in one sentence?
- Are there settings that 90% of users never touch?
- If YES to above, keep them for v2+

---

### 8. Progressive Disclosure Over Feature Dumping

**Pattern:** Intercom, Airtable, Retool all hide 80% of complexity until needed.

**The three-tier model:**
```
TIER 1: Default (everyone sees this)
├── Core action (what user came to do)
├── One primary CTA
├── Minimal UI

TIER 2: Advanced (power users drill in)
├── Filters
├── Settings
├── Customization options
├── "Advanced" tab in settings

TIER 3: NEVER (don't ship this)
└── Rarely-used niche features
```

**Example (Retool):**
```
Default: Text Input component
  - Single input field
  - Basic validation built-in
  - Copy/paste preset: "Email", "URL", "Currency"

Advanced: Text Input settings
  - Custom regex validation
  - Min/max length
  - Custom error messages
  - Adornments (prefix/suffix icons)

Never: Custom JS regex parser, multi-step parsing logic
```

**Why it matters:**
Cognitive overload kills retention. Users can't learn what they can't see.

---

### 9. Community as Moat (Notion, Figma)

**Pattern:** Instead of fighting distribution, make users into marketers.

**Notion's approach:**
- 280,000+ subreddit members
- User-generated templates on marketplace
- Templates = distribution + adoption acceleration
- Community owns growth (content creators become extension of product)

**Figma's approach:**
- Generous free tier (3 projects, unlimited files)
- Student access (generational lock-in Sketch never achieved)
- Community plugins expand product without engineering
- Open file format lets people build on top

**Why it matters:**
Community compounds. One power user creates 5 templates. Those templates get 1,000 views. 10% adopt. You get 100 free signups from one creator.

**For the project:**
- Marketplace for job description templates
- Marketplace for ranking configurations (by industry)
- Leaderboard of "best rankers" (public profiles, social proof)
- Export/share ranking reports (exposure virality)

---

### 10. Developer Experience as Growth Flywheel (Vercel, Stripe)

**Pattern:** Build both the platform AND the framework. Network effects compound.

**Vercel's flywheel:**
```
Created Next.js
    ↓
Next.js best home is Vercel
    ↓
Revenue funds Next.js development
    ↓
More developers adopt Next.js
    ↓
More need Vercel deployment
    ↓ (repeat)
```

**Stripe's approach:**
- Visual exploration WITHOUT signup (try flows before account)
- Code samples on every docs page
- Sandbox accounts (test before paying)
- In-house AI assistant trained on all docs
- "Feedback about this page?" button everywhere

**Why it matters:**
Developers choose tools. Make choosing your tool obvious. Low friction → high adoption.

**For SaaS with APIs:**
- Public API playground (test calls in browser)
- SDK in 5 languages (JavaScript, Python, Go, Ruby, Java)
- Webhook sandbox (test integrations locally)
- Status page with historical uptime
- Community libraries (GitHub integrations, Zapier actions)

---

## Performance & Speed Patterns

### Perceived Performance Techniques

**Skeleton Screens > Spinners**
- Research: Users rate skeleton screens as **20-30% faster** (identical actual load time)
- Why: Skeleton shows content shape + progress
- Implementation: Match final layout exactly (text skeleton = thin line, image = box)

**Shimmer animation:**
```css
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}

.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 1000px 100%;
  animation: shimmer 2s infinite;
}
```

**Duration:** 1.5-2 seconds, ease-in-out

**Progressive loading strategy:**
```
Critical path (0-100ms):
- Page chrome (header, nav, layout wrapper)
- User context (name, avatar, credits)

Secondary path (100-500ms):
- Main content sections with skeleton
- Dashboard cards with skeleton
- Charts with skeleton

Tertiary path (500ms+):
- Filters, secondary actions
- Advanced options
- Related content
```

**Optimistic updates (the hidden speed multiplier):**
```typescript
// User action completes locally before server confirms
const handleDelete = async (id: string) => {
  // 1. Update UI immediately
  setItems(items.filter(i => i.id !== id));

  // 2. Show success (user sees result NOW)
  toast.success('Deleted');

  // 3. Call API in background
  const { error } = await supabase.from('items').delete().eq('id', id);

  // 4. If error, rollback and show error
  if (error) {
    setItems([...items, deletedItem]);
    toast.error('Failed to delete');
  }
};
```

**Why:** 100ms delay = 7% conversion drop. Perceived performance beats actual performance.

---

## Onboarding Patterns That Work

### Time to First Value (TTFV)

**Target:** < 2 minutes to tangible value

**Pattern breakdown:**

**Step 1: Minimum required data (30 seconds)**
- Avoid: Avatar, full profile, preferences
- Collect: Email (pre-filled), password, use case (optional)
- Result: Account created, user in product

**Step 2: First action (60 seconds)**
- Avoid: Tutorial screens, feature explainers
- Deliver: Functional product with template/example
- Result: User creates first "thing" (item, workspace, project)

**Step 3: Share/invite (30 seconds)**
- Avoid: Separate invite flow, friend matching
- Deliver: Copy link, send to 1 person, see it work
- Result: Second user enters product (now growth compounds)

**Notion's personalization by use case:**
```
Which describes you best?
├── Personal notes
├── Team wiki
├── Project management
├── Sales CRM
└── Content calendar

Result: Template loads with pre-built blocks matching use case
```

**Why it works:** Reduces decision paralysis. User sees path forward.

**Superhuman's premium approach (opposite end of spectrum):**
```
1. Quiz (5 minutes) — what problems matter to you
2. Live 1:1 (30 minutes) — personal coach teaches shortcuts
3. Email exercises — typed practice until speed builds
Result: User is fast, confident, feels premium ($30/mo price justified)
```

### Checklist Pattern (3-5 items, first = quick win)

**Slack's onboarding checklist:**
```
✓ Create workspace
✓ Invite team members
○ Post first message
○ Install integrations
```

**Why this order:**
1. First = already done (psychological win)
2. Second = easy action (invite others)
3. Third = natural (sending message)
4. Fourth = optional (power users do this)

---

## Navigation & Information Architecture

### The Three-Layer Model

**Layer 1: Sidebar (persistent, discoverable)**
- 240px expanded, collapses to icons on mobile
- Keyboard: Cmd+B to toggle
- Visual: Icons + labels, active state = left border accent
- Nested items indented 12px

**Layer 2: Command Palette (speed, discovery)**
- Trigger: Cmd+K everywhere
- Functionality: Search pages, commands, actions
- Learning: Shows shortcut next to each result
- Power: Users learn shortcuts passively

**Layer 3: Keyboard Shortcuts (power users)**
- 1-letter shortcuts: C=create, S=status, P=priority, J/K=navigate
- Display: Hover button 2s → shortcut hint appears
- Safety: Undo catches mistakes, actions complete optimistically

**User journey:**
```
New user:
  Click sidebar → navigates to page

Intermediate:
  Cmd+K → type "create" → finds "Create issue" → learns shortcut

Power user:
  Press C → Creates instantly, knows shortcut from repetition
```

**F-Pattern for dashboards (eye-tracking research):**
```
┌─ Scan top horizontal (main metrics)
├─ Scan mid-horizontal (secondary insights)
└─ Scan left vertical (actions)

Implementation:
Top: 5-7 summary cards (aggregate metrics)
Middle: Main chart/table (where user spends time)
Bottom: Secondary insights, filters, exports
```

---

## Pricing & Monetization Patterns

### The 3-Tier Model (Standard for SaaS)

**Tier structure:**
```
Starter    │ Professional  │ Enterprise
$29/mo     │ $99/mo        │ Custom
────────────────────────────────────────
10 projects │ Unlimited      │ Unlimited
Basic team  │ 5 team members │ Custom
────────────│ Advanced       │ Dedicated
            │ analytics      │ support
```

**Key elements:**
- **Starter:** Most popular initially, remove this label (users assume middle tier is best)
- **Professional:** Highlighted (subtle border/shadow), "recommended for SMBs"
- **Enterprise:** "Contact sales" button, no price (signals custom for big customers)

**Pricing page structure:**
```
Hero: "Simple pricing, no surprises"
    ↓
Toggle: Annual vs Monthly (show 20% annual discount)
    ↓
Three tiers (cards, same height, Professional highlighted)
    ↓
Comparison table (all features across tiers)
    ↓
FAQ (top 5 pricing questions)
    ↓
CTA: Free trial button (no credit card)
```

**Psychology:**
- Annual toggle: Visually highlights savings, increases LTV
- Comparison table: Explains "who needs this" (why upgrade)
- "Most popular" badge: ONLY on middle tier (anchors perception)
- "No credit card" CTA: Reduces conversion friction

**Feature progression (from cheap to expensive):**
```
Starter:
  - Core functionality
  - Basic features users came for

Professional:
  - Everything in Starter
  - + Advanced features (integrations, automation, analytics)
  - + Team collaboration
  - + Priority support

Enterprise:
  - Everything in Professional
  - + Unlimited usage
  - + SLA, custom contracts
  - + Dedicated account manager
```

**Pricing psychology wins:**
- Charm pricing: $99/mo not $100/mo
- Annual discount: 20% off (20% × 12 = saves $240, feels like "investing")
- Feature comparison: Makes upgrade path clear
- Free trial: No credit card = lower barrier
- Transparency: Explain what's included (no surprises = trust)

---

## Component & UI Patterns

### Empty States (Required for Every List)

**Structure:**
```
[Icon or Illustration]
"Clear heading (lowercase, friendly)"
One-sentence description explaining why empty
[Primary CTA button]
```

**Examples:**

**Opportunity-driven (Linear):**
```
[Empty folder illustration]
No projects yet
Create your first project to get started
[+ New Project button]
```

**Minimal approach (Notion):**
```
[Blank canvas]
(no UI, just empty space)
User discovers "/" command to start
```

**Why it matters:**
Empty state = first chance to educate. Users see this and decide: "Is this product for me?"

### Loading States

**Skeleton screens (NEVER spinners):**
- Match final layout exactly
- Shimmer animation 1.5-2s
- Stagger list items: 50ms delay between each
- Height matches expected content

**Example:**
```
Card skeleton:
┌─────────────────┐
│ ░░░░░░░░░░░░░░░ │ (title placeholder)
│ ░░░░░░░░        │ (subtitle placeholder)
│                 │
│ ░░░░░░░░░░░░░░░ │ (content line 1)
│ ░░░░░░░░░░░░    │ (content line 2)
└─────────────────┘
```

**Duration:** 1.5 seconds with ease-in-out

### Error States

**Structure:**
```
[Error icon, red]
Clear error message (not technical)
What user can do (action or help link)
```

**Examples:**

**Good:**
```
[!] Email not found
Sign up for an account or check your email address
[Create account] [Sign in]
```

**Bad:**
```
[!] Error 404: User not found
[Retry]
```

### Button States

**Sequence:**
```
Idle:     "Save" (blue, clickable)
Hover:    Background darker, slight lift
Press:    Scale 0.98, shadow decreased
Loading:  Spinner + "Saving..."
Success:  Checkmark + "Saved" (1 second)
Reset:    Back to "Save"
```

**CSS pattern:**
```css
button {
  transition: all 150ms ease-out;

  &:hover {
    background-color: var(--color-primary-hover);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transform: translateY(-2px);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```

---

## Micro-Interactions (Premium Feel)

### Animation Durations (Industry Standard)

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Button hover | 150ms | ease-out |
| Button press | 100ms | ease-out |
| Page transition | 200ms | ease-out |
| Modal open/close | 200ms | ease-out |
| Accordion expand | 200-300ms | ease-out |
| Loading shimmer | 1.5-2s | ease-in-out |
| Toast entry | 300ms | ease-out |
| Hover tooltip | 150ms delay, 100ms enter | - |

**Why these numbers:**
- <100ms = feels instant
- 150-200ms = feels smooth, not slow
- >300ms = feels sluggy
- Humans notice <50ms differences, don't notice >150ms differences

### Focus States (Accessibility + Premium Feel)

```css
input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

button:focus {
  box-shadow: 0 0 0 3px rgba(var(--color-primary), 0.2);
}
```

**Why it matters:**
- 2px outline = visible for keyboard users
- 2px offset = doesn't overlap with border
- Color = matches brand primary
- Accessibility = is premium feature (shows attention to detail)

---

## Growth & PLG Patterns

### Product-Market Fit (PMF) Tracking

**Superhuman's metric: The 40% Rule**

Survey every week: "How would you feel if you could no longer use the app?"

```
Answers:
├── "Very disappointed" (target: 40%+)
├── "Somewhat disappointed"
└── "Not disappointed"
```

**Benchmark:**
- 40%+ = good PMF, growth is possible
- 30-40% = improving, keep building
- <30% = struggling, wrong problem or solution

**Why it works:**
- Single question (high response rate)
- Quantifiable (% very disappointed)
- Directional (track weekly, see trend)
- Sample size: 40-200 respondents

**Survey frequency:** Weekly (not once and forget)

### Viral Loops

**Reciprocal action (Loom pattern):**
```
User records video
    ↓
Shares with 5 people
    ↓
2 see value
    ↓
Want to reply with video
    ↓
Sign up and record
    ↓ (repeat)
```

**Exposure virality (Calendly pattern):**
```
User A: Creates Calendly link
    ↓
User B: Sees "Scheduled with Calendly"
    ↓
User B: Wants same convenience
    ↓
User B: Signs up
    ↓
Now 2 users, both benefit from using each other's links
```

**Network effects (Figma pattern):**
```
Designer uses Figma solo
    ↓
Brings to work team
    ↓
Team sees collaboration benefits
    ↓
Whole org upgrades to Pro
    ↓
Contract value: 1 person → 50 people
```

**Red flag:** If users aren't naturally inviting others, virality is broken. Don't bolt on "refer a friend" mechanics.

---

## Benchmarks Table

Use these to calibrate your product:

| Metric | Good | Great | World-Class |
|--------|------|-------|-------------|
| **Onboarding TTFV** | <5 min | <2 min | <60 sec |
| **Time to activation** | <24 hours | <2 hours | <30 min |
| **Free-to-paid conversion** | 2-5% | 5-10% | 10%+ |
| **Churn (monthly)** | 5-10% | 2-5% | <2% |
| **NPS (Net Promoter Score)** | 30+ | 50+ | 70+ |
| **Page Load (LCP)** | <4s | <2.5s | <1.5s |
| **Interaction latency** | <300ms | <150ms | <100ms |
| **Core interaction (P95)** | <1s | <500ms | <200ms |
| **Lighthouse score** | 80+ | 90+ | 95+ |
| **Mobile Lighthouse** | 75+ | 85+ | 90+ |
| **"Very disappointed if gone" (PMF)** | 25-30% | 40%+ | 60%+ |
| **Viral coefficient** | <1.0 | 1.5-2.0 | 2.0+ |
| **Activation rate** | 20-30% | 40-50% | 60%+ |

**How to use:**
- If your metric is in "Good" → you're competitive
- If your metric is in "Great" → you're winning
- If your metric is in "World-Class" → you're defensible

---

## Product-Specific Playbooks (What to Copy From Each)

### Stripe → API Design
- Cursor-based pagination (not offset)
- Idempotency by default (safe retries)
- Consistency through universality (REST is universal)
- Documentation as product (20-page API philosophy guide)

**For the project:** Design ranking API with:
- Cursor pagination (scroll through results)
- Idempotent ranking (re-run with same idempotency key = same results)
- RESTful endpoints (GET /jobs/123/results, POST /results/analyze)

### Linear → Keyboard UX
- Global command palette (Cmd+K)
- Single-letter shortcuts (C, S, P, A, X)
- Passive learning via hover hints (2-second delay)
- Keyboard-first, mouse-optional

**For the project:** Add:
- Cmd+K command palette (search jobs, create new, view settings)
- Single-letter shortcuts: R=rank, D=delete, J=next, K=prev, E=export
- 2-second hover hints showing shortcuts

### Notion → PLG & Community
- Freemium tier delivers solo value FIRST
- Template marketplace (user-generated)
- Community subreddit (280k+ members)
- Learn-by-doing onboarding (interactive, not tutorial)

**For the project:** Build:
- Generous free tier (10 rankings/month)
- Marketplace for JD templates by industry
- Community leaderboard (top rankers)
- Interactive onboarding (rank one example, see results)

### Vercel → Developer Experience
- Zero-config defaults (no settings needed)
- Git integration (no separate deploy flow)
- Preview for every PR (feedback loop)
- Pre-built starter templates

**For the project:** Implement:
- Pre-built JD templates (SWE, Product, Design, Sales, etc.)
- One-click Slack integration (share results to team)
- Shareable ranking links (no signup required to view)

### Superhuman → Speed & PMF
- Speed is the core differentiator (not a feature)
- Keyboard mastery = retention
- PMF tracking (40% rule, weekly surveys)
- Premium perception through personal onboarding

**For the project:** Focus on:
- <2 second ranking launch (perceived speed with skeleton screens)
- Keyboard shortcuts built in from day 1
- Weekly PMF survey: "How disappointed if the project shut down?"
- Optional premium 1:1 setup call (premium tier only)

### Figma → Multiplayer & Performance
- Real-time multiplayer is the moat
- Stress-tested with 50+ concurrent users
- Dynamic loading (only load what's needed)
- Generous free tier + student access

**For the project:** Could build:
- Team collaboration (multiple recruiters rank same job simultaneously)
- Real-time results view (recruiters see rankings appear as AI processes)
- Free tier: 3 jobs, shared view with 5 collaborators
- Student version (free for recruiting at universities)

### Loom → Viral Distribution
- Product IS distribution (not bolted on)
- Reciprocal action loops (recipient wants to create own)
- Browser extension (zero friction)
- Instant value (2-minute video beats long email)

**For the project:** Build:
- Shareable ranking reports (viral exposure: hiring managers see "Ranked with [AppName]")
- Browser extension (clip job posting → auto-fill JD form)
- Collaborative ranking (team comments on specific results)

### Calendly → Simplicity & Network Effects
- Brutally simple onboarding (<2 min)
- Core action creates distribution
- No customization needed (sensible defaults)
- Patience over hype (10-year consistency)

**For the project:**
- Copy Calendly: Keep feature set lean, one core job ("rank resumes")
- Core action (share ranking) = distribution
- Same value prop for 10 years (don't chase trends)

---

## Antipatterns to Avoid

### Speed & Performance
❌ Spinners instead of skeleton screens (users think it's broken)
❌ Synchronous operations (user clicks → waits → sees result — too slow)
❌ No perceived performance (actual 2s load = perceived 5s with no feedback)
❌ Heavy images unoptimized (first hire: get a CDN and ImageOptim)
❌ Render-blocking JavaScript (defer non-critical scripts)

### Onboarding
❌ 15-step wizard (users abandon by step 5)
❌ "Learn how" tutorials (users close video at slide 2)
❌ Blank canvas without direction ("You're in the product now, figure it out")
❌ Asking for profile data upfront (avatar, full bio, preferences)
❌ Separate onboarding flow (should happen during first product use)

### Defaults & Options
❌ "Let users decide" (if you can't pick default, product isn't mature)
❌ 30 customization settings (support nightmare, only 5% use any)
❌ Progressive overload (Tier 3 features that nobody needs)
❌ Changing sensible defaults (users rely on them, revert when possible)

### UI & Interactions
❌ Color inversion on hover (looks broken)
❌ 0ms transitions (feels instant but not smooth)
❌ > 300ms transitions (feels sluggy)
❌ No focus states (keyboard users feel lost)
❌ Spinners without timeout (spins forever if API hangs)

### Growth
❌ Bolted-on virality ("Refer 3 friends, get credit")
❌ Referral badges and badges (low adoption, looks cheap)
❌ FOMO dark patterns (pushes users away long-term)
❌ Asking for review too early (user just signed up, don't ask)
❌ Paid trial (converts worse than free trial)

### Pricing
❌ 10 different plan tiers (decision paralysis)
❌ Monthly-only (annual option converts better)
❌ Hidden fees (fine print creates support burden)
❌ "Contact sales" for everything (low conversion, high support cost)
❌ Free tier too weak (users can't hit aha moment)

---

## Implementation Roadmap for New Products

### Phase 1: MVP (Weeks 1-4)
✅ Core feature working end-to-end
✅ Skeleton screens (not spinners)
✅ Optimistic updates
✅ Basic command palette (Cmd+K)
✅ Free tier delivers value
✅ Mobile responsive

**Quality bar:** App feels FAST. <2s page load, <100ms interactions.

### Phase 2: Growth (Weeks 5-8)
✅ Keyboard shortcuts + hover hints
✅ Command palette learns patterns
✅ Shareable results links (exposure virality)
✅ Marketplace or templates
✅ PMF tracking survey (weekly)
✅ 40% NPS target

### Phase 3: Scale (Weeks 9-16)
✅ Team collaboration features
✅ Integrations (Slack, Zapier, etc.)
✅ Advanced analytics
✅ Roadmap/feature requests
✅ Community (Discord, subreddit)
✅ 50%+ NPS target

### Phase 4: Defensibility (Months 6+)
✅ Real-time multiplayer (if applicable)
✅ Network effects unlocked
✅ Ecosystem (plugins, templates, community)
✅ Churn < 2% monthly
✅ Unit economics positive
✅ Viral coefficient > 1.0

---

## Cross-Project Relationships

**Related patterns:**
- Builds on: "Production-Agent Mindset" (autonomous execution, quality bar)
- Builds on: "UI/UX Production Standards" (component patterns, spacing, typography)
- Builds on: "SaaS Brand Patterns" (navigation, color, typography specifics)
- Prevents: Antipatterns in "avoid/antipatterns.md" (slow perceived performance, feature creep)
- Used in projects: example SaaS (resume ranker), Vendory (e-commerce), ProjectX (internal tools)

**Stack applicability:**
- Stack A (Next.js + Supabase): All patterns apply directly
- Stack A-Lovable (Vite + React + Supabase): Adapt keyboard shortcuts, template patterns
- Stack B (Shopify): Subset applies (Polaris has defaults, but keyboard UX differs)
- Stack C (AI agents): Speed patterns critical, command palette for agent actions

**When to reference:**
- Koda building new feature → check "Speed & Performance" section
- Vega designing new page → check "Pricing & Monetization" or "Component & UI Patterns"
- Arya making architecture decision → check "Product-Specific Playbooks" for precedent
- Rex evaluating product readiness → check "Benchmarks Table" to validate metrics

---

## Summary: The Stack-Ranked Order (Do These First)

If you're building a SaaS and have limited time:

1. **Speed** — <2s load, <100ms interactions (non-negotiable)
2. **Defaults** — Ship opinions, not options (reduces complexity)
3. **Simplicity** — One core job, do it really well (focus, not feature creep)
4. **Onboarding** — <2 minutes to value (determines retention)
5. **Keyboard UX** — Cmd+K + shortcuts (power users compound retention)
6. **Viral core action** — Built in, not bolted on (free growth)
7. **Design principles** — Document, then build (scales team consistency)
8. **Community** — Users become marketers (compounding distribution)
9. **Benchmarks** — Measure against standards (know where you stand)
10. **Evolution** — Reinvent when product/market/customer/business converge (staying relevant)

Nail these 10 and the rest follows.

---

**Last Updated:** 2026-04-05
**Version:** v1
**Usage Metric:** 0 (new entry, will increment with each retrieval)
**Maintenance:** Review quarterly, update annually, deprecate if not referenced in 12 months
