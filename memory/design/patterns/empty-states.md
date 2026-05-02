# Empty States Patterns — SaaS UX Design

**Last updated:** 2026-04-04

Empty states are not failures. They're opportunities to guide, educate, and delight users when content isn't available. Production apps treat empty states as part of the core UX, not afterthoughts.

---

## 1. Anatomy of an Empty State

Every empty state should follow this hierarchy:

```
┌─────────────────────────────────────┐
│     Icon or Illustration (48-64px)  │
├─────────────────────────────────────┤
│  Headline (action-oriented)         │
│  "Create your first job"            │
├─────────────────────────────────────┤
│  Description (1-2 sentences)        │
│  "Start by uploading resumes..."    │
├─────────────────────────────────────┤
│  [Primary CTA Button]               │
│  "Upload resumes"                   │
├─────────────────────────────────────┤
│  Optional Secondary CTA             │
│  "Learn how" link                   │
└─────────────────────────────────────┘
```

### Component Wrapper
```tsx
interface EmptyStateProps {
  icon: React.ReactNode;
  headline: string;
  description: string;
  primaryAction: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
  className?: string;
}

export function EmptyState({
  icon,
  headline,
  description,
  primaryAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center min-h-80 px-4 py-8",
      className
    )}>
      <div className="max-w-sm text-center space-y-6">
        {/* Icon Container */}
        <div className="w-16 h-16 mx-auto bg-slate-100 rounded-lg flex items-center justify-center">
          {icon}
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">
            {headline}
          </h2>
          <p className="text-sm text-slate-600">
            {description}
          </p>
        </div>

        {/* Primary Action */}
        <Button
          onClick={primaryAction.onClick}
          size="lg"
          className="w-full"
        >
          {primaryAction.label}
        </Button>

        {/* Secondary Action */}
        {secondaryAction && (
          <a
            href={secondaryAction.href}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            {secondaryAction.label}
          </a>
        )}
      </div>
    </div>
  );
}
```

---

## 2. First-Time Empty State (Zero State)

User has never created anything. This is an onboarding moment—educate and motivate.

### Characteristics
- **Tone**: Welcoming, encouraging ("Get started!")
- **Call to action**: Specific action verb ("Create your first job")
- **Visual**: Brand-consistent illustration or icon
- **Secondary link**: "Learn more", "Watch a demo"
- **Goal**: Drive first action (activation metric)

### Examples

**First-Time Job Creation**
```tsx
export function FirstJobEmptyState({ onCreateJob }) {
  return (
    <EmptyState
      icon={
        <div className="bg-blue-100 p-3 rounded-lg">
          <Briefcase className="w-8 h-8 text-blue-600" />
        </div>
      }
      headline="Create your first job posting"
      description="Post a job and upload resumes. We'll automatically rank candidates for you."
      primaryAction={{
        label: 'Create a job',
        onClick: onCreateJob,
      }}
      secondaryAction={{
        label: 'Watch a quick demo',
        href: '/demo',
      }}
    />
  );
}
```

**First-Time Resume Upload**
```tsx
export function FirstResumeEmptyState({ onUpload }) {
  return (
    <EmptyState
      icon={
        <div className="bg-green-100 p-3 rounded-lg">
          <Upload className="w-8 h-8 text-green-600" />
        </div>
      }
      headline="Upload your first resumes"
      description="Drag and drop PDFs, Word docs, or plain text. We support all formats."
      primaryAction={{
        label: 'Choose files',
        onClick: onUpload,
      }}
      secondaryAction={{
        label: 'Supported formats',
        href: '/help/file-formats',
      }}
    />
  );
}
```

### Best Practices
- ✓ Mention exactly what they can do (not generic "no data")
- ✓ Icon color matches brand (blue, green, purple)
- ✓ Secondary link goes to relevant help (not homepage)
- ✓ CTA button is prominent and action-oriented
- ✓ Keep copy concise (2 lines max)

---

## 3. No Results Empty State

User has data but filter/search returned nothing. Help them adjust and try again.

### Characteristics
- **Tone**: Helpful, not blaming ("Try different keywords")
- **Call to action**: "Clear filters", "Try new search", "Browse all"
- **Visual**: Search or filter icon
- **Goal**: Help user succeed, not give up

### Pattern
```tsx
export function NoResultsEmptyState({
  searchTerm,
  appliedFilters,
  onClearSearch,
  onClearFilters,
  onBrowseAll,
}) {
  return (
    <EmptyState
      icon={
        <div className="bg-amber-100 p-3 rounded-lg">
          <Search className="w-8 h-8 text-amber-600" />
        </div>
      }
      headline={`No results for "${searchTerm}"`}
      description={
        appliedFilters.length > 0
          ? `Tried ${appliedFilters.map(f => f.label).join(', ')}? Try adjusting your filters.`
          : 'Try different keywords or check your spelling.'
      }
      primaryAction={{
        label: 'Clear filters',
        onClick: onClearFilters,
      }}
      secondaryAction={{
        label: 'Browse all candidates',
        href: '#',
      }}
    />
  );
}
```

### Best Practices
- ✓ Show what search/filters were applied
- ✓ Offer "Clear filters" as primary action (most users want this)
- ✓ Suggest alternatives ("Try these keywords")
- ✓ Icon is magnifying glass or filter symbol (visual hint)
- ✓ Don't apologize—be solution-focused

---

## 4. Error Empty State

Something went wrong loading data. Provide recovery path, not just "Error occurred."

### Characteristics
- **Tone**: Empathetic, solution-oriented
- **Call to action**: "Try again", "Contact support"
- **Visual**: Warning or error icon (red)
- **Details**: Optional error message (for transparency)
- **Goal**: Let user retry or escalate to support

### Pattern
```tsx
export function ErrorEmptyState({
  message = 'Failed to load candidates',
  onRetry,
  supportUrl,
}) {
  return (
    <EmptyState
      icon={
        <div className="bg-red-100 p-3 rounded-lg">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
      }
      headline="Something went wrong"
      description={message}
      primaryAction={{
        label: 'Try again',
        onClick: onRetry,
      }}
      secondaryAction={{
        label: 'Contact support',
        href: supportUrl || '/support',
      }}
    />
  );
}
```

### With Error Details (Advanced)
```tsx
export function ErrorEmptyStateWithDetails({
  error,
  onRetry,
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-80 px-4">
      <div className="max-w-md text-center space-y-6">
        <div className="w-16 h-16 mx-auto bg-red-100 rounded-lg flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-red-900">Error loading data</h2>
          <p className="text-sm text-red-700">{error?.message}</p>

          {/* Optional: Dev error details */}
          {process.env.NODE_ENV === 'development' && error?.details && (
            <details className="mt-4 text-left bg-red-50 border border-red-200 rounded p-3">
              <summary className="cursor-pointer text-xs font-mono text-red-600">
                Error details
              </summary>
              <pre className="text-xs text-red-700 mt-2 overflow-auto">
                {error.details}
              </pre>
            </details>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={onRetry} variant="default">
            Try again
          </Button>
          <Button variant="outline" asChild>
            <a href="/support">Get help</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### Best Practices
- ✓ Show error details only in development
- ✓ Provide immediate retry (80% of users will try again)
- ✓ Offer support link (for persistent errors)
- ✓ Use red/warning color to indicate severity
- ✓ Don't blame the user ("You did something wrong")

---

## 5. Permission Empty State

User doesn't have access to view data. Explain why and offer access request.

### Pattern
```tsx
export function PermissionEmptyState({
  resourceType = 'resumes',
  requiredRole = 'Admin',
  onRequestAccess,
}) {
  return (
    <EmptyState
      icon={
        <div className="bg-slate-100 p-3 rounded-lg">
          <Lock className="w-8 h-8 text-slate-600" />
        </div>
      }
      headline={`Access restricted`}
      description={`You need ${requiredRole} permission to view ${resourceType}. Request access from your workspace admin.`}
      primaryAction={{
        label: 'Request access',
        onClick: onRequestAccess,
      }}
      secondaryAction={{
        label: 'Contact admin',
        href: 'mailto:admin@example.com',
      }}
    />
  );
}
```

### Best Practices
- ✓ Explain why access is restricted
- ✓ Show required role/permission
- ✓ Offer "Request access" button (creates notification for admin)
- ✓ Provide direct contact for admin

---

## 6. Deleted/Archived Empty State

User deleted or archived items. Offer recovery or empty prompt.

### Pattern
```tsx
export function DeletedEmptyState({
  itemType = 'candidates',
  onUnarchive,
  onCreateNew,
}) {
  return (
    <EmptyState
      icon={
        <div className="bg-slate-100 p-3 rounded-lg">
          <Trash2 className="w-8 h-8 text-slate-500" />
        </div>
      }
      headline={`All ${itemType} archived`}
      description={`You've archived all ${itemType}. Unarchive them to see them again.`}
      primaryAction={{
        label: 'Unarchive',
        onClick: onUnarchive,
      }}
      secondaryAction={{
        label: `Create new ${itemType}`,
        href: '#',
      }}
    />
  );
}
```

---

## 7. Illustration vs Icon Strategy

### Use Icon (Lucide) When:
- Simple, recognizable concept (search, upload, filter)
- Icon fits brand aesthetic (minimal, monochrome)
- Space is limited (mobile, sidebar)
- Loading time matters (SVG icon is fast)

**Icon-Only Example:**
```tsx
export function SimpleEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-48 gap-3">
      <Search className="w-12 h-12 text-slate-400" />
      <p className="text-slate-600">No results found</p>
    </div>
  );
}
```

### Use Illustration When:
- Complex concept (hard to convey with icon alone)
- Brand identity includes custom art
- First-time states (onboarding, welcome)
- Significant visual real estate available

**Illustration Example:**
```tsx
// Use a consistent illustration library (e.g., Blush, Drawkit, Undraw)
// Prefer SVG for flexibility and performance
export function IllustratedEmptyState() {
  return (
    <EmptyState
      icon={
        <svg viewBox="0 0 200 200" className="w-20 h-20">
          {/* Custom SVG illustration */}
        </svg>
      }
      headline="No jobs posted yet"
      description="Create your first job posting to get started ranking resumes."
      primaryAction={{
        label: 'Post a job',
        onClick: () => {},
      }}
    />
  );
}
```

### Best Practices
- ✓ Icons: Lucide (free, 1000+ icons, consistent)
- ✓ Illustrations: Undraw, Blush, Drawkit (consistent style, free SVGs)
- ✓ Icon size: 48px, 64px, or 80px (never smaller)
- ✓ Color: Match brand primary color or use muted slate/gray
- ✓ Consistency: All empty states use same illustration style

---

## 8. Responsive Empty States

Empty states must work on all screen sizes.

### Mobile Pattern
```tsx
export function ResponsiveEmptyState({
  icon,
  headline,
  description,
  primaryAction,
  secondaryAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-8">
      {/* Mobile: smaller icon */}
      <div className="w-14 h-14 mx-auto bg-slate-100 rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>

      {/* Mobile: smaller text */}
      <div className="max-w-sm text-center space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
          {headline}
        </h2>
        <p className="text-sm text-slate-600 sm:text-base">
          {description}
        </p>

        {/* Mobile: full-width buttons */}
        <div className="space-y-2">
          <Button onClick={primaryAction.onClick} className="w-full">
            {primaryAction.label}
          </Button>
          {secondaryAction && (
            <Button
              variant="outline"
              className="w-full text-xs sm:text-sm"
              asChild
            >
              <a href={secondaryAction.href}>
                {secondaryAction.label}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Best Practices
- ✓ Icon: 48px on mobile, 64px on desktop
- ✓ Text: Single-line headlines on mobile
- ✓ Buttons: Full-width on mobile, inline on desktop
- ✓ Spacing: More generous padding on mobile
- ✓ Test on actual mobile (not just DevTools)

---

## 9. Skeleton / Loading Empty State

While data is loading, show placeholder content (not blank page).

### Pattern
```tsx
export function LoadingEmptyState() {
  return (
    <div className="space-y-4 p-6">
      {/* Skeleton for list items */}
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-4">
          <Skeleton className="w-12 h-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 10. Empty State Typography

Copywriting matters. Use active, actionable language.

### Headline Guidelines
- ✗ "No data available" (passive, unhelpful)
- ✓ "Create your first resume ranking" (specific, action-oriented)

- ✗ "Nothing to display" (generic)
- ✓ "Your ranking is ready!" (positive, clear)

- ✗ "Zero results" (technical jargon)
- ✓ "No matches for 'DevOps Engineer'" (specific, helpful)

### Description Guidelines
- ✗ "Please try again later" (vague, unhelpful)
- ✓ "You can upload PDFs, Word docs, or plain text files" (actionable)

- ✗ "An error occurred during processing" (scary, unclear)
- ✓ "Failed to process resumes. Check file size (max 10MB) and try again" (diagnostic, helpful)

---

## 11. Empty State Testing Checklist

Before shipping, test empty states:

- [ ] Icon is visible and properly colored
- [ ] Text is readable on all screen sizes
- [ ] CTA button is clickable and leads somewhere
- [ ] Secondary links work (don't 404)
- [ ] Copy is clear and actionable (not error/passive language)
- [ ] Spacing is balanced (doesn't feel cramped on mobile)
- [ ] Dark mode works (if app supports dark mode)
- [ ] Accessibility: headings use semantic tags (h1, h2), alt text for icons
- [ ] No loading spinners indefinitely (set timeout + error state)
- [ ] Empty state appears after real content loads (not on initial render)

---

---

## Dark Mode Implementation

### Color Mapping
- Light: `bg-slate-100` → Dark: `dark:bg-slate-800`
- Light: `text-slate-900` → Dark: `dark:text-slate-50`
- Light: `text-slate-600` → Dark: `dark:text-slate-400`
- Light: `bg-blue-100` → Dark: `dark:bg-blue-900`
- Light: `text-blue-600` → Dark: `dark:text-blue-400`

### Key Dark Mode Rules for Empty States
1. **Icon container**: Adjust tint for dark backgrounds — use darker backgrounds with lighter icon colors
2. **Text visibility**: Secondary text (`text-slate-600`) becomes `dark:text-slate-400` for legibility
3. **Button contrast**: Primary buttons maintain same style but secondary buttons need darker borders in dark mode

### Dark Mode Example
```tsx
export function DarkModeEmptyState({
  icon,
  headline,
  description,
  primaryAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-80 px-4 py-8">
      <div className="max-w-sm text-center space-y-6">
        {/* Dark mode: adjust icon container */}
        <div className="w-16 h-16 mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
          {icon}
        </div>

        {/* Dark mode: text colors */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
            {headline}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {description}
          </p>
        </div>

        {/* Button inherits dark mode styling from Button component */}
        <Button
          onClick={primaryAction.onClick}
          size="lg"
          className="w-full"
        >
          {primaryAction.label}
        </Button>
      </div>
    </div>
  );
}
```

---

## Responsive Behavior

### Breakpoint Strategy
- **Mobile (< 640px)**: Centered, smaller icon (56px), single-column buttons, smaller text
- **Tablet (640px - 1024px)**: Same as mobile, slightly larger icon (64px)
- **Desktop (> 1024px)**: Centered with max-width (448px), larger icon (64px), side-by-side buttons

### Key Responsive Rules for Empty States
1. **Icon sizing**: `w-14 h-14` on mobile (56px), `w-16 h-16` on desktop (64px) using `sm:w-16 sm:h-16`
2. **Typography**: Headlines `text-lg` on mobile, `text-xl` on desktop with `sm:text-xl`
3. **Button layout**: Always full-width on mobile, inline on desktop using `flex-col sm:flex-row gap-2`
4. **Padding**: Generous padding on mobile (`px-4 py-8`) reduces on tablet/desktop (`px-6 py-12`)

### Responsive Example
```tsx
export function ResponsiveEmptyState({
  icon,
  headline,
  description,
  primaryAction,
  secondaryAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-8 sm:px-6 sm:py-12">
      <div className="max-w-sm text-center space-y-6">
        {/* Icon: smaller on mobile, larger on desktop */}
        <div className="w-14 h-14 mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center sm:w-16 sm:h-16">
          {icon}
        </div>

        {/* Text: scales with breakpoint */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 sm:text-xl">
            {headline}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {description}
          </p>
        </div>

        {/* Buttons: stacked on mobile, side-by-side on desktop */}
        <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-3">
          <Button
            onClick={primaryAction.onClick}
            size="lg"
            className="w-full sm:flex-1"
          >
            {primaryAction.label}
          </Button>
          {secondaryAction && (
            <Button
              variant="outline"
              className="w-full sm:flex-1"
              asChild
            >
              <a href={secondaryAction.href}>
                {secondaryAction.label}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## References & Further Reading

- [Empty State UX Examples & Best Practices](https://www.pencilandpaper.io/articles/empty-states)
- [Empty State UI Design Patterns](https://www.eleken.co/blog-posts/empty-state-ux)
- [SaaS Empty State Examples](https://www.saasframe.io/patterns/empty-state)
- [Empty State UI Pattern Best Practices](https://mobbin.com/glossary/empty-state)
- [SaaS UI Design Patterns](https://www.saasui.design/)
- [Empty State Design Examples](https://nicelydone.club/pages/empty-state)
