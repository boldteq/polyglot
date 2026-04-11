# SaaS Brand Intelligence Bible

## Navigation Patterns

### Sidebar Navigation (Linear Model)
- **Collapsible sidebar**: 240px expanded, collapses to 60px icons only
- **Keyboard shortcuts**: Cmd+B (toggle sidebar), Cmd+J (quick open), Cmd+K (search)
- **Icon + label layout**: Icons always visible, labels hide when collapsed
- **Active state**: Left border accent (3-4px), never just highlight background
- **Secondary nav**: Nested items indented 12px with subtle hierarchy
- **Pinned items**: Let users customize what shows in sidebar (Linear pins projects)
- **Search within nav**: Cmd+Shift+P shows filtered command palette

**Pattern**: Collapsibility = power user feature + mobile solution. Icons must be 100% clear without labels.

### Workspace Switching (Notion Model)
- **Switcher at top**: Shows current workspace + icon, dropdown reveals all workspaces
- **Recent workspaces**: Pin 3-4 favorites, rest accessible via "See all"
- **Quick switch keyboard**: Cmd+Shift+P or similar for workspace switcher
- **Profile menu**: Separate from workspace switcher, always in top-right

**Pattern**: Workspace = different context, not just different team. Switching should feel instant and safe.

### Hierarchical Navigation (Linear Model)
- **Breadcrumb trail**: Home > Category > Subcategory, updates as you navigate
- **Sidebar categories**: Main sections with count badges (e.g., "Events (23)")
- **Sticky subheader**: Category title + filters stay visible as user scrolls
- **Icon + text nav**: Icons left, labels right, both required for comprehension
- **Mobile breadcrumb**: Tap to go back, not hamburger menu

**Pattern**: Breadcrumbs prevent "where am I?" anxiety. Sidebar shows current location emphasis.

---

## Dashboard Patterns

### Project Status Display (Linear Model)
- **Cards, not dashboards**: Each project as horizontal card, status on right
- **No pie charts**: Use progress bars instead (circular charts waste space)
- **Stat hierarchy**: Primary metric (large, bold) + secondary metrics (small, muted)
- **Status color coding**: Green/yellow/red for on-time/at-risk/overdue (semantic colors only)
- **Avoid**: Traffic lights, gauges, needles, 3D effects

**Card layout**:
```
[Project Icon] Project Name
Created • Updated • Members (3)                    On Track  [████████░░]
```

### Deployment Status (Vercel Model)
- **Timeline view**: Most recent at top, chronological, minimal styling
- **Status badge**: Compact color pill (8px border-radius) + status text
- **Metadata in gray**: Time, duration, triggered by, branch
- **Log streaming**: Real-time updates without spinner (skeleton -> live content)
- **No loading spinners**: Skeleton placeholder or progress indicator instead

**Pattern**: Minimal = fast perception. Use color + text, not icons + animation.

### Revenue & Analytics (Linear Model)
- **Clean line chart**: No grid, no axis labels (only hover tooltip)
- **Summary cards above chart**: Current value (largest), previous period, % change (muted)
- **Contextual filter**: Date range selector, always visible
- **Export button**: CSV/JSON accessible but not prominent
- **Data density**: 3-5 metrics max per dashboard view

**Pattern**: One metric = one visualization. Too many charts = information overload.

---

## Onboarding Patterns

### Progressive Disclosure (Notion Model)
- **Step 1 (< 30 seconds)**: Create workspace + one page
- **Step 2 (< 1 minute)**: Add a template or import
- **Step 3 (< 2 minutes)**: Invite someone or share
- **First win must be visual**: User creates something they can see immediately
- **Don't ask for data upfront**: Ask what they need, show examples, let them decide

**Pattern**: First 2 minutes determine retention. Make user feel smart, not lost.

### Workspace Setup (Linear Model - 3-step)
1. **Create workspace**: Name, team size (doesn't matter, just collect)
2. **Choose view preference**: Board, list, or table (default: board for new users)
3. **Create first project**: Use template or blank, can always change

**Don't ask**: Avatar, full profile, integrations, settings. All optional, all can wait.

### Premium Onboarding (Superhuman Model)
- **Personalized video tour**: 2-3 minute intro (video = premium feel)
- **Smart keyboard shortcuts hints**: Show based on user actions
- **Guided first workflow**: "Create your first email" with tooltips
- **Celebrate completion**: Confetti/animation when first item is done
- **Offer one-on-one**: Book a 10-minute walkthrough (premium perception)

**Pattern**: Onboarding = first impression of product philosophy. Premium = personal.

---

## Settings & Configuration

### Hierarchical Organization (Linear Model)
- **Top-level categories**: Workspace, Team, Security, Integrations, Billing
- **Breadcrumb**: Settings > Workspace > Advanced
- **Search settings**: Cmd+K works within settings page
- **Single-page sections**: Each section fits above the fold, no infinite scroll
- **Dangerous actions**: Bottom of relevant section, red button, confirmation modal

**Pattern**: Settings should feel boring and safe, not complicated.

### Developer Settings (Linear Model)
- **API Keys section**: Show live key (not masked), copy button, regenerate
- **Webhooks builder**: Visual event selector, test payload preview, delivery logs
- **Documentation link**: Always link to docs from settings
- **Recent activity**: Show last 10 API calls (timestamp + status)
- **Rate limit info**: Show current usage vs limit

**Pattern**: Developers want data + control. Make both immediate.

### Progressive Complexity
- **Defaults tab**: 5-6 most common settings, always visible
- **Advanced tab**: Everything else, grouped by feature
- **Never default to Advanced**: Easy things first, complexity on demand
- **Tooltips on hover**: ℹ️ icon explains what each setting does

---

## Empty States

### Opportunity-Driven (Linear Model)
```
[Illustration: Empty folder/page]
No projects yet
Create your first project to get started
[+ New Project button]
```

### Elements
- **Custom illustration**: Not generic stock art, 1-color or 2-color brand colors
- **Headline**: Short, friendly, lowercase (linear: "no projects yet")
- **Subtitle**: One sentence explaining why this is a good thing
- **CTA button**: Clear next action, primary color, size 40-48px tall

### Minimal Approach (Notion Model)
- Some empty states have zero UI: just blank canvas
- Rely on "type /" command to show user what's possible
- No guilt, no FOMO, just open space = invitation

**Pattern**: Empty state = first chance to teach. Use wit or warmth, never guilt.

---

## Loading & Transitions

### Skeleton Loading (Best Practice)
- **Shape matches content**: Text skeleton is thin line, image skeleton is box
- **Shimmer animation**:
  ```css
  animation: shimmer 2s infinite;
  background: linear-gradient(90deg, #f0f0f0 0%, #e0e0e0 50%, #f0f0f0 100%);
  ```
- **Duration**: 1.5s with ease-in-out
- **Never spinners**: Spinners say "I have no idea how long this takes"

### Optimistic Updates
- **Update UI immediately**: User deletes item, item disappears from list instantly
- **Rollback on error**: If delete fails, item reappears
- **Toast notification**: "Item deleted" in success toast (can undo if needed)
- **Don't await server**: Assume success, handle exception gracefully

### Page Transitions (Notion/Vercel Model)
- **Fade + Y translate**: Incoming page fades in + slides down 8px
- **Duration**: 200ms with ease-out
- **Prefetch on hover**: Click link, page is already cached/loaded
- **Instant navigation**: No skeleton loading on first navigation (prefetch works)

**Pattern**: Perceived performance > actual performance. Users care about "feels fast" not "is fast".

---

## Pricing Pages

### Structure (Linear Model)
1. **Hero section**: "Simple pricing, no surprises"
2. **Toggle**: Annual vs monthly (show 20% discount for annual)
3. **Three tiers**: Starter, Professional, Enterprise
4. **Comparison table below**: All features across all plans
5. **CTA**: Clear signup button for each tier
6. **FAQ**: Address top 5 pricing questions

### Tier Design
- **Starter**: $29/mo, most popular (no badge), basic features
- **Professional**: $99/mo, highlighted (subtle border/shadow), recommended for SMBs
- **Enterprise**: Custom quote, contact sales

### Pricing Page = Sales Page
- **Social proof**: "Used by 2000+ companies" near CTA
- **Money-back guarantee**: "30-day free trial, no credit card required"
- **Feature highlight**: If moving up tiers, show what's NEW in bold
- **Billing contact**: Live chat accessible from pricing page

**Pattern**: Transparent pricing = trust. Every feature row should explain "who needs this".

---

## Error Handling UX

### Validation Errors (Linear Model)
- **Inline validation**: Show under/near field immediately as user types
- **Specific message**: "Email must include @" not "Invalid email"
- **Color + icon**: Red text with ❌ icon (small, 16px)
- **Don't submit form**: Disable submit button if required fields invalid

**Pattern**: Errors = guidance. Every error should teach user what to do.

### Offline State (Linear Model)
- **Optimistic queue**: User creates issue offline, it queues locally
- **Visual indicator**: "Offline - syncing when connection returns" in header
- **Don't error**: Let user keep working, sync in background
- **Success notification**: "3 items synced" once back online

### API Errors
- **User-friendly message**: Never show technical error codes
- **But**: Include error code in small gray text for support
- **Action**: "Try again" button or "Contact support" link
- **Recovery**: Suggest next step (refresh page, clear cache, try different browser)

---

## Color & Visual Identity

### Primary Palette (Linear Example)
- **Primary (Accent)**: Single bold color for CTAs, links, focus rings
  - Linear uses blue (#0051BA in light, lighter in dark)
- **Neutral palette**: Black, white, 4 shades of gray (#F3F3F3, #E5E5E5, #999999, #666666)
- **Semantic colors**:
  - Success (green): #33A233
  - Destructive (red): #E73F3E
  - Warning (amber): #F0AD4E
  - Info (blue): muted version of primary

### Color System Rules
- **Restraint = premium**: Fewer colors feel more sophisticated
- **Consistent across surfaces**: Primary color used same everywhere (button, link, focus ring)
- **Dark mode**: Not inverted, custom palette for dark backgrounds
- **Hover states**: Don't change color, change opacity or add subtle shadow
- **Gradient**: Only as brand accent (avoid multiple gradients)

**Pattern**: If you need more than 7 colors, your system isn't working.

---

## Typography Patterns

### Font Choice (Inter Default)
- **Primary font**: Inter (default SaaS choice) OR Geist (Vercel) OR custom
- **Monospace**: Inter Mono or Courier New for code/IDs
- **Never system fonts**: -apple-system, BlinkMacSystemFont feel cheap

### Weight Scale (Strict)
- **400 (Regular)**: Body text, copy, description
- **500 (Medium)**: UI labels, table headers, emphasis within body
- **600 (Semi Bold)**: Headings, titles, emphasis

**Never use**: 300, 700, or anything outside 400-600 range for SaaS (feels trendy, breaks quickly)

### Size Scale
```
12px: caption, input helper text
14px: label, secondary text, table content
16px: body text, base size
20px: small heading
24px: section heading
30px: page heading
36px: hero heading
```

### Line Heights
- **Headings**: 1.2 (tight, powerful)
- **Body**: 1.5 (readable, comfortable)
- **Small text** (< 14px): 1.6 (looser, more breathable)

### Letter Spacing
- **Large headings** (> 24px): -0.02em (tighter)
- **Body**: 0 (normal)
- **Labels/caps**: 0.02em (looser, more official)

**Pattern**: Precise type scale = quality perception. Users notice this subconsciously.

---

## Icon Usage

### Lucide React Standards (Industry Default)
- **Size**: 16px (inline text), 20px (buttons), 24px (navigation), 32px (empty states only)
- **Stroke width**: 2px (default Lucide, consistent)
- **Color**: currentColor (inherits text color) or use CSS variable
- **Never**: hardcode color (#999999), use semantic color instead

### Custom Icon Wrapper
```jsx
export function Icon({ name, size = 20, className }) {
  const IconComponent = ICON_MAP[name];
  return (
    <IconComponent
      size={size}
      className={`text-muted-foreground ${className}`}
    />
  );
}
```

### Icon Rules
- **Consistency over variety**: Use same icon library everywhere (no Lucide + Heroicons)
- **Optical sizing**: 16px icons shouldn't look like tiny 24px icons
- **Context helps**: Icon + label = always clear, icon alone = only in familiar context
- **Brand moments**: Custom icons for logo, product features, key actions

### Never Mix Icon Libraries
- Choose one: Lucide React, Heroicons, or custom SVGs
- Mixing looks amateurish and confuses users

**Pattern**: Icons are visual shortcuts. Consistency = faster comprehension.

---

## Micro-Interactions

### Hover States (Physical Feedback)
- **Button hover**: Subtle background color change OR subtle shadow (not both)
  ```css
  transition: all 150ms ease-out;
  &:hover {
    background-color: var(--color-primary-hover);
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  ```
- **Link hover**: Underline appears (not color change)
- **Card hover**: Lift 4px with shadow increase
- **Avoid**: Color inversion, scale animation on hover

### Click/Press States
- **Button press**: Scale 0.98 + shadow decrease (feels clickable)
  ```css
  &:active {
    transform: scale(0.98);
  }
  ```
- **No color change**: Keep visual hierarchy clear
- **Tactile feeling**: Spring physics feels better than ease-out

### Loading States
- **Skeleton > spinner**: Always show skeleton shape first
- **Shimmer duration**: 1.5s, ease-in-out
- **Stagger list items**: 50ms delay between each skeleton

### Transitions (Standard)
- **Hover**: 150ms ease-out
- **Enter**: 200ms ease-out (fade in from slightly above)
- **Exit**: 150ms ease-in (fade out)
- **Page transition**: 200ms ease-out

**Pattern**: Physics-based animation (spring) feels premium. CSS easing feels mechanical.

---

## Keyboard Shortcuts

### Command Palette (Cmd+K Universal)
- **Trigger**: Cmd+K shows searchable command palette
- **Alphabetical list**: Easy to scan and remember
- **Keyboard navigation**: Up/down arrows, Enter to select, Esc to close
- **Fuzzy search**: "cre pro" finds "create project"
- **Actions**: Create, Edit, Delete, Share, Archive (verbs, not nouns)

### Feature-Specific Shortcuts
- **Linear**: Cmd+B (toggle sidebar), Cmd+J (jump to), Cmd+Shift+P (filters)
- **Notion**: Cmd+/ (help), Cmd+Shift+D (dark mode)
- **Raycast**: Cmd+K (search), Cmd+; (snippet), Cmd+' (floating note)

### Display Hints
- **Show shortcut on button hover**: Small gray text "(Cmd+K)" bottom-right of button
- **In menu items**: Keyboard shortcut aligned right: "Search  Cmd+K"
- **On input focus**: Show available commands as hint text

### Rules
- **Global shortcuts**: Max 5 (Cmd+K, Cmd+J, Cmd+B, Cmd+S, Cmd+Shift+P)
- **Page shortcuts**: Max 5 per page context
- **Never conflict**: Check system shortcuts (Cmd+Q quits, Cmd+W closes)

**Pattern**: Power users are evangelists. Keyboard accessibility = quality signal.

---

## Mobile Responsiveness

### Read-First Strategy (Linear Mobile)
- **Remove non-essentials**: Sidebar hidden (tap hamburger to open)
- **Full-width content**: Cards stack vertically, image-first layouts
- **Touch targets**: 44px minimum height for buttons
- **Simplified actions**: Only 3 primary actions visible, more in menu

### Gesture Patterns
- **Swipe left**: Reveal action buttons (delete, share)
- **Swipe right**: Back navigation
- **Long press**: Multi-select mode
- **Pull down**: Refresh

### Information Hierarchy Changes
- **Desktop**: Sidebar + content (30% + 70%)
- **Tablet**: Collapsible sidebar + content
- **Mobile**: Full-width content, sidebar in drawer

### Form Input Mobile
- **Large input fields**: 44px height minimum
- **Keyboard: Specify type**: email, tel, number (brings correct keyboard)
- **No floating labels**: Labels visible above, not inside field
- **Auto-focus first field**: Save user's first tap

**Pattern**: Mobile isn't "responsive CSS" — it's different UX. Information hierarchy must change.

---

## Dark Mode

### NOT Inverted CSS
- **Light mode**: White (#FFFFFF) background, dark (#1A1A1A) text
- **Dark mode**: Dark (#1A1A1A) background, white (#FFFFFF) text
- **But**: Create separate color tokens, don't use CSS filter

### Dark Mode Color Palette
- **Backgrounds**: 3 levels for depth
  - Page bg: #1A1A1A
  - Card bg: #252525
  - Elevated bg: #303030
- **Text colors**:
  - Primary text: #FFFFFF
  - Secondary text: #A0A0A0
  - Muted text: #696969
- **Accent**: Slightly lighter/desaturated vs light mode

### High Contrast in Dark Mode
- **Better contrast**: Dark mode often needs higher contrast than light mode
- **Button text**: Pure white (#FFFFFF), not off-white
- **Links**: Slightly brighter than light mode (easier on eyes)
- **Avoid**: Pure black (#000000), feels too harsh

### CSS Implementation
```css
:root {
  --bg-primary: #FFFFFF;
  --bg-card: #F8F8F8;
  --text-primary: #1A1A1A;
  --accent: #0051BA;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1A1A1A;
    --bg-card: #252525;
    --text-primary: #FFFFFF;
    --accent: #5FA3FF;
  }
}
```

**Pattern**: Dark mode = brand moment. Invest in custom palette, not CSS filter.

---

## Changelog & Updates

### Weekly Changelog (Linear Model)
- **Cadence**: Every Monday email to customers
- **Format**: 3-5 features max, visual screenshot for each
- **Tone**: Friendly, not corporate ("We built X because you asked for it")
- **Each item**: Feature name (bold) + 1-sentence description + small screenshot

### Visual Changelog
- **Screenshot**: Show before/after or highlight the feature
- **Numbered list**: Easy to scan
- **Link to docs**: "Learn more" link for each feature
- **Feedback request**: "Let us know what you think" at bottom

### Blog Post Style (Vercel Model)
- **Longer format**: 300-500 words explaining "why" behind feature
- **Author**: "Posted by [person]" (humanizes company)
- **Code example**: If technical feature, show code snippet
- **Background story**: Why this feature matters to your users

### Distribution
- **Email**: Weekly digest to all users
- **In-app banner**: Link to latest changelog
- **Slack integration**: Send to customer channels
- **Twitter/blog**: Highlight biggest feature

**Pattern**: Changelog = marketing opportunity. Users want to feel the product evolving.

---

## Appendix: Quick Checklist

- [ ] Sidebar is 240px, collapsible to icons
- [ ] Cmd+K for command palette
- [ ] Color palette: 1 primary + semantic colors only
- [ ] Type scale: 12/14/16/20/24/30/36px only
- [ ] Icons from Lucide React, single source
- [ ] Spacing: 4px base unit multiples
- [ ] Loading states: skeleton, not spinner
- [ ] Hover: shadow or opacity, not color
- [ ] Mobile: separate information hierarchy, not responsive CSS
- [ ] Empty states: custom illustration + CTA
- [ ] Settings: progressive complexity (defaults + advanced)
- [ ] Keyboard shortcuts: 5 global max
- [ ] Dark mode: custom palette, not inverted
- [ ] Changelog: weekly, visual, email

---

*Last updated: 2026-04-02*
*Version: 1.0 — Premium SaaS Patterns*
