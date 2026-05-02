# Dark Mode Design Standards

**Last updated: 2026-04-04**

## Architecture Overview

Dark mode requires a 3-layer engineering approach:

1. **CSS Variables:** Define tokens (background, foreground, borders)
2. **Class-based theme switching:** Add `.dark` class to document root (user control, not just system preference)
3. **Persistence:** Store user's theme choice in localStorage

**Never use `@media (prefers-color-scheme: dark)` alone**—it locks users into system preference and breaks user agency.

---

## CSS Variables & Design Tokens

Define semantic color tokens, not raw hex values. Every color in dark mode must map to a semantic variable.

### Light Mode Token Definition

```css
/* In your global CSS or Tailwind config */
@layer base {
  :root {
    /* Backgrounds (light theme) */
    --background: 0 0% 100%;        /* #ffffff */
    --foreground: 0 0% 3.6%;        /* #09090b */

    /* Card hierarchy */
    --card: 0 0% 96.3%;              /* #f4f4f5 */
    --card-foreground: 0 0% 3.6%;    /* #09090b */

    --popover: 0 0% 100%;            /* #ffffff */
    --popover-foreground: 0 0% 3.6%; /* #09090b */

    /* UI Accents */
    --primary: 0 0% 9%;              /* #171717 (neutral dark) */
    --primary-foreground: 0 0% 100%; /* #ffffff */

    --secondary: 0 0% 96.3%;         /* #f4f4f5 */
    --secondary-foreground: 0 0% 9%; /* #171717 */

    /* Destructive (error/warning) */
    --destructive: 0 84.2% 60.2%;    /* #ef4444 */
    --destructive-foreground: 0 0% 100%; /* #ffffff */

    /* Muted (secondary text, disabled state) */
    --muted: 0 0% 96.3%;             /* #f4f4f5 */
    --muted-foreground: 0 0% 63.9%;  /* #a1a1a1 */

    /* Borders */
    --border: 0 0% 89.8%;            /* #e5e5e5 */

    /* Input */
    --input: 0 0% 89.8%;             /* #e5e5e5 */

    /* Accent (highlights, selected items) */
    --accent: 0 0% 9%;               /* #171717 */
    --accent-foreground: 0 0% 100%;  /* #ffffff */

    /* Ring (focus outline) */
    --ring: 0 0% 3.6%;               /* #09090b */
  }
}
```

### Dark Mode Token Override

```css
@layer base {
  .dark {
    /* Backgrounds (dark theme) */
    --background: 0 0% 3.6%;        /* #09090b (almost black, not pure black) */
    --foreground: 0 0% 98%;         /* #fafafa (almost white, not pure white) */

    /* Card hierarchy (lighter than background) */
    --card: 0 0% 10.2%;             /* #191919 */
    --card-foreground: 0 0% 98%;    /* #fafafa */

    --popover: 0 0% 10.2%;          /* #191919 */
    --popover-foreground: 0 0% 98%; /* #fafafa */

    /* UI Accents */
    --primary: 0 0% 98%;            /* #fafafa (light for dark bg) */
    --primary-foreground: 0 0% 9%;  /* #171717 */

    --secondary: 0 0% 14.9%;        /* #262626 */
    --secondary-foreground: 0 0% 98%; /* #fafafa */

    /* Destructive */
    --destructive: 0 84.2% 60.2%;   /* #ef4444 (same as light, red is universal) */
    --destructive-foreground: 0 0% 100%; /* #ffffff */

    /* Muted */
    --muted: 0 0% 27.3%;            /* #464646 */
    --muted-foreground: 0 0% 63.9%; /* #a1a1a1 (same as light) */

    /* Borders (softer in dark, not harsh lines) */
    --border: 0 0% 14.9%;           /* #262626 */

    /* Input */
    --input: 0 0% 14.9%;            /* #262626 */

    /* Accent */
    --accent: 0 0% 98%;             /* #fafafa */
    --accent-foreground: 0 0% 9%;   /* #171717 */

    /* Ring */
    --ring: 0 0% 63.9%;             /* #a1a1a1 (lighter ring in dark) */
  }
}
```

**Key Principles:**
- Light mode: dark text on light backgrounds
- Dark mode: light text on dark backgrounds
- Never pure black (#000000) or pure white (#ffffff)—use near-black (#09090b) and near-white (#fafafa)
- Dark mode backgrounds: 3.6% - 10.2% (range from #09090b to #191919)
- Maintains 7:1+ contrast in dark mode for accessibility

---

## Tailwind Configuration

Configure Tailwind to support CSS variable-based theming.

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class', // ← Use class-based dark mode, not media query
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Use CSS variables for all theme colors
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        'card-foreground': 'hsl(var(--card-foreground) / <alpha-value>)',
        popover: 'hsl(var(--popover) / <alpha-value>)',
        'popover-foreground': 'hsl(var(--popover-foreground) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        secondary: 'hsl(var(--secondary) / <alpha-value>)',
        'secondary-foreground': 'hsl(var(--secondary-foreground) / <alpha-value>)',
        destructive: 'hsl(var(--destructive) / <alpha-value>)',
        'destructive-foreground': 'hsl(var(--destructive-foreground) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-foreground': 'hsl(var(--accent-foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
    },
  },
};

export default config;
```

---

## Implementation with next-themes

`next-themes` manages theme state and persistence. Use it in all projects.

### 1. Install next-themes

```bash
npm install next-themes
```

### 2. Create ThemeProvider

```tsx
// src/components/theme-provider.tsx
'use client'; // Only for Next.js App Router

import { ThemeProvider } from 'next-themes';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

### 3. Add to Root Layout

```tsx
// For Next.js App Router
import { Providers } from '@/components/theme-provider';

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

// For Vite + React (Lovable projects)
import { ThemeProvider } from 'next-themes';

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Routes>{/* routes */}</Routes>
    </ThemeProvider>
  );
}
```

**Important:** `suppressHydrationWarning` on `<html>` tag prevents hydration mismatch when theme loads from localStorage.

### 4. Create Theme Toggle

```tsx
// src/components/theme-toggle.tsx
'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="w-10 h-10" />; // Placeholder
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
```

**Key Points:**
- `useTheme()` hook provides theme state and setTheme function
- `mounted` check prevents hydration mismatch
- Toggle between light/dark (not system)

---

## Color Hierarchy in Dark Mode

Establish clear visual hierarchy with background levels:

```tsx
// Background hierarchy: darker to lighter
<div className="bg-background">
  {/* Main background: #09090b */}

  <div className="bg-card">
    {/* Card level: #191919 (slightly lighter) */}

    <div className="bg-popover">
      {/* Popover/dropdown: #262626 (even lighter) */}
    </div>
  </div>
</div>
```

**Visual Depth:**
- **Background:** Darkest, main canvas
- **Card:** Mid tone, sections/containers
- **Popover:** Lighter, floating UI (dropdowns, tooltips)

---

## Common Component Patterns

### Buttons

```tsx
// Primary button (high contrast)
<button className="bg-primary text-primary-foreground hover:bg-primary/90">
  Save
</button>

// Secondary button
<button className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
  Cancel
</button>

// Ghost/outline button
<button className="border border-border hover:bg-accent hover:text-accent-foreground">
  Learn More
</button>
```

### Cards

```tsx
<div className="bg-card text-card-foreground border border-border rounded-lg p-6">
  <h3 className="font-semibold">Card Title</h3>
  <p className="text-muted-foreground text-sm">Card description</p>
</div>
```

### Text Hierarchy

```tsx
// Primary text
<p className="text-foreground">Main content</p>

// Secondary text (labels, help text)
<p className="text-muted-foreground text-sm">Secondary information</p>

// Disabled text
<span className="text-muted-foreground opacity-50">Disabled state</span>
```

### Borders

```tsx
// Subtle border
<div className="border border-border"></div>

// Darker border (stronger emphasis)
<div className="border border-border border-opacity-50"></div>
```

---

## Dark Mode Specific Guidelines

### Shadows

Shadows are less effective in dark mode. Use borders instead of shadows for definition:

```tsx
// ✓ GOOD: Border-based definition in dark mode
<div className="bg-card border border-border rounded-lg">
  Content
</div>

// ✗ AVOID: Relying only on shadows
<div className="shadow-lg bg-card">
  {/* Shadow is barely visible on dark background */}
</div>
```

### Images in Dark Mode

Images may appear too bright in dark mode. Options:

1. **Reduce brightness:**
   ```tsx
   <img src="image.jpg" alt="desc" className="dark:brightness-75" />
   ```

2. **Add overlay:**
   ```tsx
   <div className="relative dark:bg-black/20">
     <img src="image.jpg" alt="desc" />
   </div>
   ```

3. **Provide dark variant:**
   ```tsx
   <picture>
     <source media="(prefers-color-scheme: dark)" srcSet="image-dark.jpg" />
     <img src="image.jpg" alt="desc" />
   </picture>
   ```

### Chart Colors

Ensure chart colors are visible on dark backgrounds:

```tsx
// ✓ GOOD: Bright, saturated colors for dark mode
const darkChartConfig = {
  line: '#60a5fa',    // bright blue
  area: '#ec4899',    // bright pink
  bar: '#10b981',     // bright green
};

// ✗ BAD: Muted colors (hard to see on dark)
const badChartConfig = {
  line: '#4b5563',   // too dark, invisible
  area: '#666666',   // gray, low contrast
};
```

---

## Transition Animation

Smooth theme transitions without flash:

```tsx
// Add transition to all color properties
@layer base {
  * {
    @apply transition-colors duration-200;
  }
}

// Or per-component
<button className="bg-primary transition-colors duration-200 hover:bg-primary/90">
  Smooth theme transition
</button>
```

**Duration:** 200ms (fast, but not jarring)

---

## Common Mistakes

### 1. Pure Black Background

```css
/* ✗ BAD: Pure black is too harsh on OLED displays (causes halation) */
.dark {
  --background: #000000;
}

/* ✓ GOOD: Near-black is softer and more accessible */
.dark {
  --background: #09090b;
}
```

### 2. Pure White Text

```css
/* ✗ BAD: Pure white is too bright against dark backgrounds */
.dark {
  --foreground: #ffffff;
}

/* ✓ GOOD: Near-white is easier on the eyes */
.dark {
  --foreground: #fafafa;
}
```

### 3. Using prefers-color-scheme Alone

```tsx
/* ✗ BAD: Locks user into system preference */
@media (prefers-color-scheme: dark) {
  :root {
    --background: #09090b;
  }
}

/* ✓ GOOD: Use class-based + system preference */
:root {
  /* light mode by default */
}

.dark {
  /* dark mode when .dark class added */
}

/* Optional: honor system preference if user hasn't set explicit preference */
@media (prefers-color-scheme: dark) {
  :root {
    --dark-mode-enabled: true;
  }
}
```

### 4. Inconsistent Contrast in Dark Mode

Test every color combination in dark mode. Dark text on dark background fails:

```tsx
// ✗ BAD: Insufficient contrast in dark mode
<div className="bg-card text-gray-700">
  {/* gray-700 is too dark on card background (#191919) */}
</div>

// ✓ GOOD: Use semantic tokens
<div className="bg-card text-card-foreground">
  {/* Automatically adjusts for light/dark modes */}
</div>
```

---

## Testing Dark Mode

### Manual Testing Checklist

- [ ] Toggle to dark mode, verify all text readable
- [ ] Check color contrast (4.5:1 minimum)
- [ ] Images don't appear washed out
- [ ] Borders visible (not blending into background)
- [ ] Charts/graphs visible and legible
- [ ] Hover states clearly indicated
- [ ] Focus rings visible (ring-ring, typically light color)
- [ ] Popups/modals stand out from background
- [ ] Form inputs have clear borders
- [ ] No hardcoded colors (#fff, #000, etc.)

### Automated Testing

```bash
# Use Lighthouse to check color contrast in dark mode
# Chrome DevTools → Lighthouse → Accessibility

# Or use axe DevTools with dark mode forced
# axe DevTools → Environment → Force dark mode
```

### Browser DevTools

1. Open Chrome DevTools (F12)
2. Open Rendering tab (⋮ → More tools → Rendering)
3. Emulate CSS media feature prefers-color-scheme: forced-colors
4. Change to "dark" and verify all pages

---

## High Contrast Mode (Bonus)

Some users need even higher contrast. Support `prefers-contrast: more`:

```css
@media (prefers-contrast: more) {
  :root.dark {
    --background: #000000;        /* Pure black for maximum contrast */
    --foreground: #ffffff;        /* Pure white */
    --border: #ffffff;            /* White borders for visibility */
  }
}
```

---

## References

- [shadcn/ui Dark Mode Docs](https://ui.shadcn.com/docs/dark-mode)
- [Tailwind CSS Dark Mode](https://tailwindcss.com/docs/dark-mode)
- [next-themes Documentation](https://github.com/pacocur/next-themes)
- [Dark Mode Design Tokens Guide](https://www.designsystemscollective.com/how-to-use-design-tokens-with-style-dictionary-and-dark-mode-fdb53f675977)
- [CSS Variables for Dark Mode](https://www.magicpatterns.com/blog/implementing-dark-mode)
- [Dark Mode Color Optimization](https://www.codesoltech.com/blog/dark-mode-technical-implementation/)
