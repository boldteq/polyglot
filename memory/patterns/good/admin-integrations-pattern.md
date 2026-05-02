---
name: Admin Integrations Hub — Production-Grade UI Patterns
description: Reusable patterns for building admin integration/service management pages. Tabbed detail panels, brand SVG icons, copy-to-clipboard, accent borders, status badges.
type: pattern
priority: high
scope: Stack A-Lovable, Stack A (any SaaS admin panel with third-party integrations)
source: ConvertScan (CROBOT), 2026-04-06
last_updated: 2026-04-06
---

## Overview

These patterns were extracted from the ConvertScan Admin Integrations page, which manages 6 third-party services (Dodo Payments, Anthropic, Google PageSpeed, Screenshot Service, Resend, Supabase). They apply to any admin page that displays a list of external services with their connection status, configuration, and setup instructions.

---

### Tabs-Based Detail Panel in Collapsible Integration Cards
**Context:** Admin page displaying a list of third-party service integrations, where each integration has multiple types of information (description, configuration, setup steps).
**Pattern:** Replace a single vertical info dump with `Tabs` (3 tabs) inside each collapsible card:
- **Overview** tab: service description, "Used By" function badges (which edge functions / APIs consume it), external dashboard link
- **Configuration** tab: environment variable table with Set/Missing/Secret status badges + copy buttons
- **Setup Guide** tab: numbered steps in a bordered card with step numbers in `rounded-full bg-primary/10` circles

**Why:** A vertical dump of all information makes the expanded card too tall and hard to scan. Tabs let the admin jump directly to what they need (usually Configuration or Setup Guide). The Overview tab serves as default context for admins who are not familiar with a service.

**Implementation:**
```tsx
<Tabs defaultValue="overview">
  <TabsList className="h-9 bg-muted/50 border border-border/40 mb-5 w-auto">
    <TabsTrigger value="overview" className="text-xs px-3 h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm">
      Overview
    </TabsTrigger>
    <TabsTrigger value="configuration" className="text-xs px-3 h-7 ...">
      Configuration
    </TabsTrigger>
    <TabsTrigger value="setup" className="text-xs px-3 h-7 ...">
      Setup Guide
    </TabsTrigger>
  </TabsList>
  <TabsContent value="overview" className="mt-0 space-y-5">...</TabsContent>
  <TabsContent value="configuration" className="mt-0 space-y-4">...</TabsContent>
  <TabsContent value="setup" className="mt-0">...</TabsContent>
</Tabs>
```

**Key design decisions:**
- `defaultValue="overview"` -- admin sees context first, not config
- `TabsList` with compact sizing (`h-9`, triggers at `h-7 text-xs`) to not overwhelm the card interior
- `w-auto` on TabsList so it does not stretch full width
- `mt-0` on every TabsContent because the TabsList already has `mb-5`

**Relationships:**
- Builds on: "Row-by-Row Collapsible for Integration Lists" (project_admin.md)
- Builds on: "shadcn/ui Tabs component" (design/references/shadcn-patterns.md)
- Prevents: "Vertical info dump in collapsible" antipattern (too-tall expanded cards that push other cards offscreen)
- Primary stacks: Stack A-Lovable
- Used in projects: ConvertScan (CROBOT)

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Inline SVG Brand Icons as React.FC (Not Lucide Generics)
**Context:** Admin page displaying third-party services where brand recognition matters (Supabase, Google, Anthropic, Resend, Dodo Payments, etc.).
**Pattern:** Create inline SVG components for each brand icon instead of using generic Lucide icons (CreditCard, Zap, Gauge, etc.). Each component is typed as `React.FC<{ className?: string }>` -- NOT as `React.ElementType` (which is Lucide's type).

```tsx
// Correct: specific React.FC type with className prop
function SupabaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 109 113" fill="none" xmlns="http://www.w3.org/2000/svg"
         className={className} aria-label="Supabase">
      {/* Official SVG paths with correct gradients/colors */}
    </svg>
  );
}

// Usage in integration definition
interface IntegrationDef {
  iconComponent: React.FC<{ className?: string }>;  // NOT React.ElementType
  // ...
}

// Rendering
const IconComp = integration.iconComponent;
<IconComp className={cn("h-5 w-5", categoryStyle.iconColor)} />
```

**Why:** Generic icons (CreditCard for billing, Zap for Supabase, Gauge for PageSpeed) are visually indistinguishable at small sizes and give the admin panel a toy-like feel. Actual brand SVGs provide instant visual recognition. The `React.FC<{ className? }>` type is important because Lucide icons use `React.ElementType` which includes intrinsic elements -- they are not interchangeable.

**Brand icon sources:**
- Supabase: official green bolt SVG with linearGradient (viewBox="0 0 109 113")
- Google: 4-color G mark (viewBox="0 0 24 24", 4 path elements with #4285F4/#34A853/#FBBC05/#EA4335)
- Anthropic: orange "A" lettermark (fill="#D97757")
- Resend: envelope icon using `currentColor` (works on dark backgrounds)
- Dodo Payments: stylized payment card SVG
- Screenshot Service: camera SVG

**CATEGORY_STYLE lookup for icon backgrounds:**
```tsx
const CATEGORY_STYLE: Record<string, { iconBg: string; iconColor: string }> = {
  Performance: { iconBg: "bg-white", iconColor: "" },   // Google logo is already colorful
  Infrastructure: { iconBg: "bg-white", iconColor: "" }, // Supabase logo is already colorful
  Email: { iconBg: "bg-gray-900", iconColor: "text-white" }, // Resend brand is dark
  // Other categories use their accent color bg
};
```

**Relationships:**
- Contradicts: "Never mix icon libraries -- Lucide only" (ui-ux-production-standards.md). Resolution: Brand SVGs are an exception for admin integration pages where brand recognition is essential. Generic Lucide icons remain the standard for all other UI.
- Primary stacks: Stack A-Lovable, Stack A
- Used in projects: ConvertScan (CROBOT)

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Copy-to-Clipboard on Env Var Names with Group-Hover Reveal
**Context:** Admin page showing environment variable names that need to be copied to Supabase secrets, .env files, or deployment configs.
**Pattern:** `CopyButton` component that is invisible by default and reveals on parent row hover. Uses `navigator.clipboard.writeText` + sonner toast confirmation. Shows `Check` icon for 2 seconds after copy, then reverts to `Copy`.

```tsx
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevents Collapsible toggle
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      toast.success(`Copied ${value}`);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 inline-flex items-center justify-center h-5 w-5 rounded
                 hover:bg-muted transition-colors shrink-0
                 opacity-0 group-hover/envrow:opacity-100
                 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1"
      title={`Copy ${value}`}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

// Parent row must have: className="group/envrow"
```

**Key design decisions:**
- `e.stopPropagation()` prevents the click from toggling the parent Collapsible
- `group-hover/envrow` uses Tailwind's named group feature -- scoped to the specific row, not the entire card
- `focus-visible:opacity-100` ensures keyboard-accessible (not hidden when focused via Tab)
- 2-second check icon timeout gives visual feedback without requiring the user to re-focus

**Relationships:**
- Builds on: Sonner toast patterns (ui-ux-production-standards.md)
- Primary stacks: Stack A-Lovable
- Used in projects: ConvertScan (CROBOT)

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Left-Border Accent Color Per Category When Card Is Open
**Context:** Collapsible card list where multiple cards can be open and the admin needs visual context about which card they are looking at.
**Pattern:** Each integration definition has an `accentColor: string` (a Tailwind border-left class like `"border-l-emerald-500"`). When the card is open, apply `border-l-4` + the accent class. When closed, use standard `border-border/60`.

```tsx
interface IntegrationDef {
  accentColor: string; // e.g., "border-l-emerald-500", "border-l-indigo-500"
}

<Collapsible
  className={cn(
    "rounded-xl border bg-card overflow-hidden transition-all duration-200",
    open
      ? cn("border-border shadow-md border-l-4", integration.accentColor)
      : "border-border/60 shadow-sm hover:border-border hover:shadow-md"
  )}
>
```

**Why:** When multiple cards are expanded, the left accent border provides instant color-coded context (green = Supabase, orange = Anthropic, indigo = Dodo Payments). Without it, expanded cards look identical and the admin loses track of which service they are configuring.

**Accent color assignments:**
- Billing (Dodo): `border-l-indigo-500`
- AI Engine (Anthropic): `border-l-orange-400`
- Performance (Google): `border-l-blue-500`
- Visual Analysis (Screenshot): `border-l-sky-500`
- Email (Resend): `border-l-pink-500`
- Infrastructure (Supabase): `border-l-emerald-500`

**Relationships:**
- Builds on: "Row-by-Row Collapsible for Integration Lists" (project_admin.md)
- Inspired by: Linear's sidebar section indicators, Vercel's project status colors
- Primary stacks: Stack A-Lovable
- Used in projects: ConvertScan (CROBOT)

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Status Badges with Colored Dot Indicator (Vercel/Linear Style)
**Context:** Displaying connection status for services (connected, server-side, missing/not configured).
**Pattern:** Badge with a colored dot (1.5x1.5 rounded-full) + text label. The dot provides color-at-a-glance; the text provides specificity.

```tsx
const STATUS_CONFIG: Record<IntegrationStatus, {
  label: string;
  className: string;
  dotColor: string;
}> = {
  connected: {
    label: "Connected",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
    dotColor: "bg-emerald-500",
  },
  "server-side": {
    label: "Server-side",
    className: "bg-amber-50 text-amber-700 border border-amber-200/60",
    dotColor: "bg-amber-400",
  },
  missing: {
    label: "Not configured",
    className: "bg-red-50 text-red-700 border border-red-200/60",
    dotColor: "bg-red-500",
  },
};

// Rendering
<Badge className={cn("text-xs px-2.5 py-1 flex items-center gap-1.5 font-medium", statusConfig.className)}>
  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusConfig.dotColor)} />
  {statusConfig.label}
</Badge>
```

**Why:** Icon-based status badges (CheckCircle2, XCircle) are hard to distinguish at 12px sizes in dense admin tables. The colored dot + text pattern (used by Vercel, Linear, GitHub) is more readable at small sizes and works better alongside other badges (category badges, test status badges).

**Relationships:**
- Builds on: "Badge component patterns" (design/references/shadcn-patterns.md)
- Primary stacks: Stack A-Lovable, Stack A
- Used in projects: ConvertScan (CROBOT)

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### StatChip with Conditional Danger Variant
**Context:** Summary stats row at the top of an admin page showing counts (total, connected, server-side, not configured).
**Pattern:** `StatChip` component with 4 variants (neutral, success, warning, danger). The "danger" variant conditionally renders red only when `count > 0`; otherwise neutral styling.

```tsx
function StatChip({ label, count, variant = "neutral" }: {
  label: string;
  count: number;
  variant?: "neutral" | "success" | "warning" | "danger";
}) {
  const variants = {
    neutral: "border-border/50 bg-muted/20 text-foreground",
    success: "border-emerald-200/60 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200/60 bg-amber-50 text-amber-800",
    danger: count > 0
      ? "border-red-200/60 bg-red-50 text-red-800"
      : "border-border/50 bg-muted/20 text-muted-foreground",
  };
  // ...
}
```

**Why:** "0 not configured" should look clean and neutral, not alarming. Only highlight danger when there is actually something to fix. This avoids "alarm fatigue" where permanent red badges train the admin to ignore them.

**Relationships:**
- Builds on: "Stats Cards (Dashboard)" pattern (ui-ux-production-standards.md)
- Primary stacks: Stack A-Lovable
- Used in projects: ConvertScan (CROBOT)

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

### Red Alert Banner for Missing Configuration
**Context:** Integration card has env vars where some are `resolved === false` (client-side check confirms they are not set).
**Pattern:** When any env var has `resolved === false`, show a red alert banner at the top of the expanded panel with `AlertTriangle` icon.

```tsx
{hasMissingEnvVars && (
  <div className="flex items-start gap-3 rounded-lg border border-red-200/60 bg-red-50 px-4 py-3 mb-5">
    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
    <p className="text-sm text-red-700 leading-relaxed">
      <span className="font-semibold">Action required</span> -- configure the missing
      environment variables to activate this integration.
    </p>
  </div>
)}
```

**Why:** Env var status is shown in the Configuration tab, but the alert banner appears above the tabs -- the admin sees the problem immediately without needing to navigate to Configuration. Reduces time-to-action for misconfigured services.

**Relationships:**
- Primary stacks: Stack A-Lovable
- Used in projects: ConvertScan (CROBOT)

**Source:** ConvertScan (CROBOT), 2026-04-06
**Usage Metric:** 1
**Knowledge Version:** v1

---

*(Created by Mira -- 2026-04-06, session 5: Admin Integrations redesign patterns extracted)*
