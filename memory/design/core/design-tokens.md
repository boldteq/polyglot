# Design Tokens System for SaaS Applications

**Last updated: 2026-04-04**

A comprehensive guide to modern design tokens used across production SaaS applications. This document covers the complete token system powering Tailwind CSS, shadcn/ui, Radix UI, and Geist design systems.

---

## Overview

Design tokens are named entities that store visual design attributes—colors, spacing, typography, shadows, and more—defined once and reused everywhere. They enable:
- Consistent, scalable design systems
- Rapid theme switching (light/dark mode)
- Accessibility compliance (WCAG AA)
- Maintainability across large teams

The modern approach uses CSS variables as the foundation, with Tailwind CSS providing utilities on top.

---

## 1. Color System

### 1.1 Semantic Color Naming

Modern SaaS design systems organize colors by **function** rather than appearance. This prevents mistakes (e.g., accidentally using green for a delete button) and enables global updates.

**Core semantic color roles:**

| Role | Purpose | Examples |
|------|---------|----------|
| `primary` | Main brand color, key actions | CTA buttons, links, primary navigation |
| `secondary` | Supporting brand color | Secondary buttons, accents |
| `accent` | Brand moments | Highlights, badges, onboarding |
| `success` | Positive outcomes | Success messages, growth indicators |
| `warning` | Caution states | Warnings, review-required states |
| `destructive` | Dangerous/irreversible actions | Delete buttons, error states |
| `info` | Informational content | Info badges, help text |
| `muted` | Secondary content | Disabled states, placeholders |
| `background` | Page/surface backgrounds | Body background, container fills |
| `foreground` | Text and primary content | Body text, icons on backgrounds |

**Foreground pairs:**

Every background token has a corresponding foreground token:
- `--background` + `--foreground` (page background)
- `--card` + `--card-foreground` (card surfaces)
- `--primary` + `--primary-foreground` (primary buttons)
- `--muted` + `--muted-foreground` (disabled/secondary)

### 1.2 shadcn/ui CSS Variables (Light + Dark)

shadcn/ui provides a complete CSS variable system that works with CSS custom properties and Tailwind CSS.

**Light theme (`:root`):**

```css
:root {
  /* Backgrounds & Surfaces */
  --background: 0 0% 100%;           /* White */
  --foreground: 0 0% 3.6%;           /* Almost black */

  --card: 0 0% 100%;
  --card-foreground: 0 0% 3.6%;

  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 3.6%;

  --muted: 0 0% 96.1%;               /* Light gray */
  --muted-foreground: 0 0% 45.1%;    /* Medium gray */

  /* Primary Color (Brand) */
  --primary: 0 0% 9%;                /* Dark color by default */
  --primary-foreground: 0 0% 98%;    /* White on primary */

  /* Secondary Color */
  --secondary: 0 0% 96.1%;
  --secondary-foreground: 0 0% 9%;

  /* Accent (Highlights) */
  --accent: 0 0% 9%;
  --accent-foreground: 0 0% 98%;

  /* Destructive (Delete, Error) */
  --destructive: 0 84.2% 60.2%;      /* Red */
  --destructive-foreground: 0 0% 98%;

  /* UI Elements */
  --border: 0 0% 89.8%;              /* Light border */
  --input: 0 0% 89.8%;               /* Input field background */
  --ring: 0 0% 3.6%;                 /* Focus ring color */

  /* Border Radius */
  --radius: 0.5rem;                  /* Default 8px */
}
```

**Dark theme (`.dark`):**

```css
.dark {
  --background: 0 0% 3.6%;           /* Almost black */
  --foreground: 0 0% 98%;            /* Near white */

  --card: 0 0% 10%;                  /* Slightly lighter black */
  --card-foreground: 0 0% 98%;

  --popover: 0 0% 3.6%;
  --popover-foreground: 0 0% 98%;

  --muted: 0 0% 14.9%;               /* Dark gray */
  --muted-foreground: 0 0% 63.9%;    /* Light gray */

  --primary: 0 0% 98%;               /* Near white */
  --primary-foreground: 0 0% 9%;     /* Dark on light primary */

  --secondary: 0 0% 14.9%;
  --secondary-foreground: 0 0% 98%;

  --accent: 0 0% 98%;
  --accent-foreground: 0 0% 9%;

  --destructive: 0 84.2% 60.2%;      /* Red stays consistent */
  --destructive-foreground: 0 0% 10%;

  --border: 0 0% 14.9%;              /* Dark border */
  --input: 0 0% 14.9%;               /* Dark input */
  --ring: 0 0% 83.3%;                /* Light ring in dark mode */
}
```

**Chart colors (for data visualization):**

```css
:root {
  --chart-1: 12 76% 61%;   /* Blue */
  --chart-2: 173 58% 39%;  /* Teal */
  --chart-3: 197 37% 24%;  /* Navy */
  --chart-4: 43 74% 66%;   /* Yellow */
  --chart-5: 27 87% 67%;   /* Orange */
}

.dark {
  --chart-1: 210 70% 56%;  /* Lighter blue for dark */
  --chart-2: 175 58% 54%;
  --chart-3: 200 37% 54%;
  --chart-4: 45 74% 75%;
  --chart-5: 30 87% 75%;
}
```

### 1.3 HSL-Based Color System

Modern design systems use HSL (Hue, Saturation, Lightness) instead of hex because it's easier to reason about colors programmatically.

**HSL Structure:**
- **Hue** (0-360°): The color itself (red=0, yellow=60, green=120, cyan=180, blue=240, magenta=300)
- **Saturation** (0-100%): Intensity of color (0%=gray, 100%=vivid)
- **Lightness** (0-100%): Brightness (0%=black, 50%=normal, 100%=white)

**Example: Creating a brand color scale from primary blue (210°):**

```css
/* Light mode */
--blue-50: 210 100% 97%;    /* Nearly white with hint of blue */
--blue-100: 210 100% 94%;
--blue-200: 210 98% 88%;
--blue-300: 210 96% 80%;
--blue-400: 210 94% 70%;
--blue-500: 210 91% 60%;    /* Primary blue */
--blue-600: 210 85% 50%;
--blue-700: 210 80% 40%;    /* Darker for text on light BG */
--blue-800: 210 75% 30%;
--blue-900: 210 70% 15%;    /* Very dark */

/* Dark mode: shift lightness up, keep hue/saturation similar */
--blue-50: 210 100% 20%;    /* Darkish, subtle */
--blue-500: 210 91% 65%;    /* Brighter in dark mode */
--blue-700: 210 80% 55%;    /* Adjusted for dark mode readability */
```

### 1.4 Radix Colors System

Radix Themes provides ~30 pre-tuned color scales, each with light, dark, and alpha variants. Each scale has 12 steps designed for specific uses:

**Steps 1-3:** Backgrounds (subtle containers)
**Steps 4-6:** Interactive/hover states
**Steps 7-8:** Borders
**Steps 9-10:** Solid interactive elements
**Steps 11-12:** High-contrast text

Available colors: Gray, Gold, Bronze, Brown, Yellow, Amber, Orange, Tomato, Red, Ruby, Crimson, Pink, Plum, Purple, Violet, Iris, Indigo, Blue, Cyan, Teal, Jade, Green, Grass, Lime, Mint, Sky.

### 1.5 Color Contrast & Accessibility

**WCAG AA Standards (minimum):**

| Content Type | Ratio | Example |
|--------------|-------|---------|
| Normal text (< 18px) | 4.5:1 | Black text on white background |
| Large text (≥ 18pt or ≥ 14pt bold) | 3:1 | Larger heading with slightly lower contrast |
| UI components & icons | 3:1 | Button borders, icon against background |

**Practical approach:**

1. Use a contrast checker tool (e.g., [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/))
2. Test both light and dark modes
3. Test with real text/icons, not just color blocks
4. Avoid pure black (#000000) on pure white (#FFFFFF) in dark mode—use off-black/off-white instead

**Common accessible pairings:**
- Dark gray (#424242) text on white background: 9.3:1
- White text on dark blue (#003366): 5.5:1
- Dark gray text on light gray (#f5f5f5): 7.6:1

### 1.6 Neutral Gray Scales

Most SaaS apps need multiple neutral scales for flexibility:

| Scale | Use Case | Saturation |
|-------|----------|-----------|
| **Zinc** | Default, most common | 0% (pure gray) |
| **Slate** | Softer, slightly blue-shifted | 2-3% blue |
| **Gray** | Generic fallback | Minimal saturation |
| **Stone** | Warm, slightly brown-shifted | 1-2% warm |

**Zinc scale (most common):**
```
zinc-50: #fafafa     (almost white)
zinc-100: #f4f4f5
zinc-200: #e4e4e7
zinc-300: #d4d4d8
zinc-400: #a1a1aa    (medium gray, good for placeholders)
zinc-500: #71717a
zinc-600: #52525b
zinc-700: #3f3f46    (good for body text)
zinc-800: #27272a
zinc-900: #18181b    (almost black)
```

### 1.7 Data Visualization Colors

**Categorical palette (≤ 7 colors for distinct categories):**
```css
--vis-cat-1: 12 76% 61%;   /* Blue */
--vis-cat-2: 173 58% 39%;  /* Teal */
--vis-cat-3: 197 37% 24%;  /* Navy */
--vis-cat-4: 43 74% 66%;   /* Yellow */
--vis-cat-5: 27 87% 67%;   /* Orange */
--vis-cat-6: 0 84% 60%;    /* Red */
--vis-cat-7: 280 85% 60%;  /* Purple */
```

**Sequential palette (for ordered data like time/intensity):**
```css
--vis-seq-1: 210 100% 95%; /* Light (low value) */
--vis-seq-2: 210 95% 85%;
--vis-seq-3: 210 90% 70%;
--vis-seq-4: 210 85% 50%;
--vis-seq-5: 210 80% 35%;
--vis-seq-6: 210 75% 20%;  /* Dark (high value) */
```

**Diverging palette (for opposing values, e.g., -50 to +50):**
```css
--vis-div-neg-3: 10 86% 60%;  /* Red (negative) */
--vis-div-neg-2: 10 60% 75%;
--vis-div-neg-1: 10 30% 90%;
--vis-div-mid: 0 0% 95%;      /* Neutral */
--vis-div-pos-1: 200 30% 90%;
--vis-div-pos-2: 200 60% 75%;
--vis-div-pos-3: 200 86% 60%; /* Blue (positive) */
```

**Note:** Use [ColorBrewer](https://colorbrewer2.org/) for pre-tested, colorblind-safe palettes.

---

## 2. Spacing System

### 2.1 4px Grid Foundation

One unit in Tailwind = 0.25rem = 4px (assuming 16px browser default).

**Benefits:**
- Provides granularity (4px steps vs. 8px steps)
- Aligns with modern UI expectations
- Works well on mobile (even spacing feels natural)

### 2.2 Default Spacing Scale

```
0      = 0px
px     = 1px        (for borders)
0.5    = 2px
1      = 4px        [1 unit]
1.5    = 6px
2      = 8px        [2 units, minimum spacing]
2.5    = 10px
3      = 12px       [3 units, common gap]
3.5    = 14px
4      = 16px       [4 units, common padding]
5      = 20px
6      = 24px       [6 units, card padding]
7      = 28px
8      = 32px       [8 units, large spacing]
9      = 36px
10     = 40px
12     = 48px       [12 units, section spacing]
14     = 56px
16     = 64px       [16 units, hero spacing]
20     = 80px
24     = 96px
28     = 112px
32     = 128px
36     = 144px
40     = 160px
44     = 176px
48     = 192px
52     = 208px
56     = 224px
60     = 240px
64     = 256px
72     = 288px
80     = 320px
96     = 384px
```

### 2.3 Component Spacing Rules

**Padding (internal spacing inside components):**
- Buttons: `p-2` (8px) or `p-2.5` (10px)
- Input fields: `p-2` to `p-3` (8-12px)
- Card content: `p-6` (24px)
- Large sections: `p-8` to `p-12` (32-48px)

**Margin/Gap (external spacing):**
- Form field vertical gap: `gap-4` (16px)
- Card list gap: `gap-6` (24px)
- Section margin: `my-8` to `my-12` (32-48px)
- Between major sections: `my-16` (64px)

**Container max-widths (Tailwind defaults):**
```
sm:  640px   (mobile optimization)
md:  768px   (tablet)
lg:  1024px  (desktop)
xl:  1280px  (wide desktop)
2xl: 1536px  (ultra-wide)
```

---

## 3. Typography

### 3.1 Font Stack

**Recommended primary font: Inter**
- Purpose: Body text and UI
- Reason: Specifically designed for screens, high legibility, variable font support
- Fallback chain: `Inter, system-ui, -apple-system, sans-serif`

**Secondary font: Geist Mono (code)**
- Purpose: Code blocks, monospace content
- Fallback: `ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace`

### 3.2 Type Scale

Using a 1.25x modular scale (16px base):

```css
/* Light theme */
:root {
  --text-xs:  0.75rem / 1rem;      /* 12px / 16px line-height */
  --text-sm:  0.875rem / 1.25rem;  /* 14px / 20px */
  --text-base: 1rem / 1.5rem;      /* 16px / 24px */
  --text-lg:  1.125rem / 1.75rem;  /* 18px / 28px */
  --text-xl:  1.25rem / 1.75rem;   /* 20px / 28px */
  --text-2xl: 1.5rem / 2rem;       /* 24px / 32px */
  --text-3xl: 1.875rem / 2.25rem;  /* 30px / 36px */
  --text-4xl: 2.25rem / 2.5rem;    /* 36px / 40px */
  --text-5xl: 3rem / 1.2;          /* 48px / responsive */
  --text-6xl: 3.75rem / 1;         /* 60px / no line-height */
  --text-7xl: 4.5rem / 1;          /* 72px */
  --text-8xl: 6rem / 1;            /* 96px */
  --text-9xl: 8rem / 1;            /* 128px */
}
```

**Tailwind classes:**
```html
<!-- Headings -->
<h1 class="text-4xl font-bold">Page Title</h1>      <!-- 36px, weight 700 -->
<h2 class="text-3xl font-bold">Section Title</h2>   <!-- 30px, weight 700 -->
<h3 class="text-2xl font-semibold">Subsection</h3>  <!-- 24px, weight 600 -->

<!-- Body text -->
<p class="text-base font-normal">Body text</p>      <!-- 16px, weight 400 -->
<p class="text-sm text-muted-foreground">Caption</p><!-- 14px, muted color -->

<!-- Code -->
<code class="font-mono text-sm">function()</code>   <!-- monospace, 14px -->
```

### 3.3 Font Weight Usage

```css
--font-light:   300;  /* Rarely used, avoid for accessibility */
--font-normal:  400;  /* Body text, paragraphs */
--font-medium:  500;  /* Labels, secondary headings */
--font-semibold: 600; /* Emphasis, card titles */
--font-bold:    700;  /* Primary headings, important text */
--font-extrabold: 800; /* Hero sections, emphasis */
```

### 3.4 Letter Spacing

```css
--tracking-tighter: -0.05em;  /* Headings only */
--tracking-tight:   -0.025em;
--tracking-normal:   0em;     /* Default */
--tracking-wide:     0.025em;
--tracking-wider:    0.05em;  /* All-caps labels */
--tracking-widest:   0.1em;   /* Logo, decorative */
```

### 3.5 Line Height

```css
--leading-3:    0.75rem;   /* Dense (math, code) */
--leading-4:    1rem;
--leading-5:    1.25rem;
--leading-6:    1.5rem;    /* Default body text */
--leading-7:    1.75rem;   /* Paragraph, generous */
--leading-8:    2rem;
--leading-9:    2.25rem;   /* Extra loose, form labels */
--leading-10:   2.5rem;
```

---

## 4. Shadows & Elevation

### 4.1 Shadow Scale

Shadows create depth and indicate layering. Use them sparingly—most modern flat designs use minimal shadows.

```css
/* Light mode */
:root {
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow:     0 1px 3px 0 rgba(0, 0, 0, 0.1),
                0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-md:  0 4px 6px -1px rgba(0, 0, 0, 0.1),
                0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.1),
                0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-xl:  0 20px 25px -5px rgba(0, 0, 0, 0.1),
                0 8px 10px -6px rgba(0, 0, 0, 0.1);
  --shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Dark mode: deeper shadows for contrast */
.dark {
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.3);
  --shadow:     0 1px 3px 0 rgba(0, 0, 0, 0.4),
                0 1px 2px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg:  0 10px 15px -3px rgba(0, 0, 0, 0.5);
}
```

### 4.2 When to Use Each Shadow

| Shadow | Use Case |
|--------|----------|
| `shadow-sm` | Subtle hover states, raised inputs |
| `shadow` | Default for cards, buttons |
| `shadow-md` | Floating elements, tooltips |
| `shadow-lg` | Dropdowns, floating menus |
| `shadow-xl` | Modals, popovers |
| `shadow-2xl` | Full-page overlays, high z-index elements |

### 4.3 Focus Ring (Accessible Focus State)

```css
:root {
  --ring-width: 2px;
  --ring-offset: 2px;
  --ring: hsl(var(--primary));
}

/* Tailwind classes */
.focus:outline-none .focus:ring-2 .focus:ring-offset-2
```

---

## 5. Border Radius

### 5.1 Radius Scale

```css
:root {
  --radius-sm:     0.125rem;  /* 2px, very subtle */
  --radius-base:   0.25rem;   /* 4px, minimal rounding */
  --radius-md:     0.375rem;  /* 6px, buttons & inputs */
  --radius-lg:     0.5rem;    /* 8px, cards */
  --radius-xl:     0.75rem;   /* 12px, large cards */
  --radius-2xl:    1rem;      /* 16px, modals */
  --radius-3xl:    1.5rem;    /* 24px, hero sections */
  --radius-full:   9999px;    /* Fully rounded (pills, avatars) */
}
```

### 5.2 Component Conventions

| Component | Radius | Rationale |
|-----------|--------|-----------|
| Button (default) | `rounded-md` (6-8px) | Modern, slightly rounded |
| Input field | `rounded-md` (6-8px) | Match button style |
| Card | `rounded-lg` (8px) | Standard surface |
| Large card/modal | `rounded-xl` (12px) | Clear separation |
| Avatar | `rounded-full` (50%) | Always circular |
| Chip/Badge | `rounded-full` | Pill-shaped |
| Image in card | Match card radius | Consistency |

**Tailwind classes:**
```html
<button class="rounded-md">Standard Button</button>
<div class="rounded-lg">Card</div>
<img class="rounded-full" />      <!-- Avatar -->
<div class="rounded-full">Pill</div>
```

---

## 6. Z-Index Scale

Z-index manages layering. Use a consistent scale to avoid conflicts.

```css
:root {
  --z-base:          0;     /* Default layer */
  --z-dropdown:      50;    /* Dropdown menus */
  --z-sticky:        40;    /* Sticky headers, fixed sidebars */
  --z-floating:      50;    /* Floating action buttons */
  --z-popover:       50;    /* Tooltips, popovers */
  --z-modal-overlay: 40;    /* Modal background overlay */
  --z-modal:         50;    /* Modal itself */
  --z-dialog:        50;    /* Dialogs (same as modal) */
  --z-toast:         100;   /* Toast notifications (always on top) */
  --z-loading:       101;   /* Loading spinners (above toasts) */
  --z-offscreen:     -1;    /* Hidden off-screen elements */
}
```

**Guidelines:**
- Keep gaps between levels (10-50 points) for future expansion
- Never use `z-index: 9999` (limits future layers)
- Toast notifications should be highest (users need to dismiss them)
- Modals one level below toasts

**Tailwind classes:**
```html
<div class="z-50">Modal</div>
<div class="z-40">Sticky Header</div>
<div class="z-0">Default Content</div>
```

---

## 7. Tailwind Configuration Pattern

Production `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss"
import defaultTheme from "tailwindcss/defaultTheme"

const config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
        mono: ["Geist Mono", ...defaultTheme.fontFamily.mono],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "1.2" }],
      },
      spacing: {
        0: "0px",
        px: "1px",
        0.5: "0.125rem",
        1: "0.25rem",
        // ... continue through 96
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
```

---

## 8. Global CSS File Pattern

`src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Colors - Light mode */
    --background: 0 0% 100%;
    --foreground: 0 0% 3.6%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.6%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.6%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --ring: 0 0% 3.6%;
    --radius: 0.5rem;

    /* Fonts */
    --font-sans: Inter, system-ui, -apple-system, sans-serif;
    --font-mono: Geist Mono, ui-monospace, SFMono-Regular, monospace;
  }

  .dark {
    /* Colors - Dark mode */
    --background: 0 0% 3.6%;
    --foreground: 0 0% 98%;
    --card: 0 0% 10%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.6%;
    --popover-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 98%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 10%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --ring: 0 0% 83.3%;
  }

  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
  }

  code {
    font-family: var(--font-mono);
  }
}

@layer components {
  .text-balance {
    text-wrap: balance;
  }

  .prose {
    @apply text-base leading-7 text-foreground;
  }

  .prose h1 {
    @apply text-4xl font-bold tracking-tight;
  }

  .prose h2 {
    @apply text-3xl font-semibold tracking-tight;
  }

  .prose p {
    @apply my-4;
  }

  .prose code {
    @apply rounded bg-muted px-1.5 py-0.5 font-mono text-sm;
  }
}
```

---

## 9. Usage Examples

### Button Variants (Semantic Colors)

```tsx
/* Primary action */
<button className="bg-primary text-primary-foreground hover:opacity-90">
  Save Changes
</button>

/* Secondary action */
<button className="border border-input bg-background hover:bg-muted">
  Cancel
</button>

/* Destructive action */
<button className="bg-destructive text-destructive-foreground hover:opacity-90">
  Delete
</button>

/* Disabled state */
<button className="bg-muted text-muted-foreground cursor-not-allowed" disabled>
  Unavailable
</button>
```

### Card Layout

```tsx
<div className="rounded-lg border border-border bg-card p-6 shadow">
  <h2 className="text-2xl font-semibold text-foreground">Card Title</h2>
  <p className="mt-2 text-sm text-muted-foreground">Card description</p>
</div>
```

### Form Input

```tsx
<input
  type="text"
  className="w-full rounded-md border border-input bg-input px-3 py-2 text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
  placeholder="Enter text..."
/>
```

---

## 10. Resources & References

- [Tailwind CSS Documentation](https://tailwindcss.com/docs/theme)
- [shadcn/ui Theming](https://ui.shadcn.com/docs/theming)
- [Radix Colors](https://www.radix-ui.com/colors)
- [Radix UI Themes](https://www.radix-ui.com/themes/docs/theme/color)
- [Geist Design System](https://vercel.com/geist/introduction)
- [ColorBrewer](https://colorbrewer2.org/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

## Quick Checklist for New SaaS Projects

- [ ] Define primary brand color (HSL format)
- [ ] Generate color scale (light mode) using Radix Colors or UI Colors
- [ ] Create dark mode variants (adjust lightness, keep hue consistent)
- [ ] Test all color pairs for WCAG AA contrast (4.5:1 minimum)
- [ ] Set up CSS variables in `:root` and `.dark`
- [ ] Configure Tailwind to use CSS variables
- [ ] Add Inter font (primary) and Geist Mono (code)
- [ ] Define semantic color tokens (primary, secondary, destructive, etc.)
- [ ] Create chart color palette (5-7 categorical colors)
- [ ] Test in both light and dark modes
- [ ] Document all custom tokens in team wiki
