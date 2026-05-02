# Deep Dive: Color System Design for SaaS

**Last updated: 2026-04-04**

A comprehensive guide to designing, implementing, and maintaining color systems in production SaaS applications. This document focuses on color-specific patterns, theme switching, accessibility, and brand integration.

---

## Overview

A mature SaaS color system requires:
1. **Brand color selection** that works in light and dark modes
2. **CSS variable architecture** for switching themes
3. **Semantic color naming** (what colors mean, not what they are)
4. **Accessibility testing** (WCAG AA compliance)
5. **Data visualization palettes** (charts, graphs, analytics)
6. **Dark mode variants** that preserve intent, not just invert colors

---

## 1. Brand Color Selection Guide

### 1.1 Choosing Your Primary Brand Color

The primary color should:
- **Evoke the right emotion** for your market (trust, innovation, growth, etc.)
- **Work in both light and dark modes** without adjustment
- **Pass WCAG AA contrast** with white text (4.5:1 minimum)
- **Differentiate from competitors** in your space
- **Be testable on different screens** and devices

**Emotion-to-Color Mapping (for SaaS):**

| Emotion | Color | Common SaaS Examples |
|---------|-------|----------------------|
| Trust, Security | Blue | Stripe, Slack, GitHub |
| Growth, Energy | Green | Notion, Webflow, Supabase |
| Innovation, Tech | Purple | Twitch, Discord, OpenAI |
| Urgency, Action | Orange | Vercel, Shopify, GitLab |
| Premium, Luxury | Dark Gray/Black | Apple, Figma |
| Community, Fun | Vibrant Rainbow | Zapier, Figma (secondary) |

### 1.2 Testing Your Brand Color

Before finalizing, test your color:

**1. Contrast ratio (text on brand color background):**
```
Primary blue (#0066CC) on white: 5.1:1 ✓ (passes WCAG AA)
Primary blue on light gray: 4.8:1 ✓ (passes WCAG AA)
Primary blue on dark background: may fail—need adjustment for dark mode
```

**2. Light mode appearance:**
```
Primary: #0066CC (bright, vivid)
Text on primary: white (#FFFFFF)
Hover state: #0052A3 (darker shade)
Active state: #003D7A (even darker)
```

**3. Dark mode appearance (important!):**
Your light mode brand color will NOT work in dark mode. Adjust:
- Increase lightness (move toward white)
- Maintain hue (same color family)
- Reduce saturation slightly (less vivid)

```
Light mode primary: #0066CC (HSL: 210, 100%, 40%)
Dark mode primary: #60A5FA (HSL: 210, 96%, 65%)  [Much lighter]
Dark mode hover: #93C5FD (HSL: 210, 97%, 75%)    [Even lighter]
```

### 1.3 Creating a Brand Color Scale

From your primary color, generate 10+ variations for flexibility.

**Using HSL adjustment (recommended):**

```
Primary hue: 210° (blue)
Primary saturation: 100%

Light mode scale (decrease lightness):
50:   HSL(210, 100%, 97%)  #E0F2FE  ← Use for very subtle backgrounds
100:  HSL(210, 100%, 94%)  #BFE3FE
200:  HSL(210, 100%, 88%)  #7DD3FC
300:  HSL(210, 100%, 80%)  #38BDF8
400:  HSL(210, 100%, 70%)  #0EA5E9
500:  HSL(210, 100%, 60%)  #0284C7  ← Secondary action
600:  HSL(210, 100%, 50%)  #0066CC  ← Primary (YOUR BRAND COLOR)
700:  HSL(210, 100%, 40%)  #0052A3  ← Hover/darker
800:  HSL(210, 100%, 30%)  #003D7A
900:  HSL(210, 100%, 15%)  #001F3F  ← Darkest, use for text

Dark mode scale (different approach—adjust for dark BG):
50:   HSL(210, 100%, 25%)  #0C4A6E  ← Dark mode background tint
100:  HSL(210, 100%, 30%)  #082F49
200:  HSL(210, 100%, 40%)  #0C3D66
300:  HSL(210, 100%, 55%)  #0B7FA0  ← Base dark mode primary
400:  HSL(210, 96%, 65%)   #60A5FA
500:  HSL(210, 98%, 75%)   #93C5FD  ← Hover in dark mode
600:  HSL(210, 100%, 85%)  #BFE3FE
```

### 1.4 Testing Multiple Screens

**Create a test UI with your brand color:**
```
✓ White text on brand color (normal text)
✓ Brand colored buttons on white background
✓ Brand colored links in paragraphs
✓ Brand colored borders on cards
✓ Brand colored hover states
✓ All above on dark mode background
```

Test on:
- Desktop monitors (different calibrations)
- Mobile phones (different screen technologies)
- Tablets
- E-ink readers (if applicable)

---

## 2. CSS Variable Architecture for Theming

### 2.1 Three-Layer Token System

**Layer 1: Primitive Tokens (Raw Colors)**
Direct hex/HSL values, rarely referenced in code:
```css
--primitive-blue-50: hsl(210 100% 97%);
--primitive-blue-500: hsl(210 100% 60%);
--primitive-blue-900: hsl(210 100% 15%);
```

**Layer 2: Semantic Tokens (Intent-Based)**
Describe what the color means:
```css
--color-primary: var(--primitive-blue-600);
--color-primary-foreground: white;
--color-success: hsl(120 100% 40%);
--color-error: hsl(0 100% 50%);
--color-warning: hsl(40 100% 50%);
```

**Layer 3: Component Tokens (Usage)**
How components use semantic tokens:
```css
--button-primary-bg: var(--color-primary);
--button-primary-text: var(--color-primary-foreground);
--button-danger-bg: var(--color-error);
--badge-success-bg: var(--color-success);
```

**Benefit:** Change `--color-primary` once, all components update automatically.

### 2.2 Complete CSS Variables for Light Mode

```css
:root {
  /* === PRIMITIVE COLORS === */
  --primitive-white: 0 0% 100%;
  --primitive-black: 0 0% 0%;
  --primitive-brand-50: 210 100% 97%;
  --primitive-brand-100: 210 100% 94%;
  --primitive-brand-200: 210 100% 88%;
  --primitive-brand-300: 210 100% 80%;
  --primitive-brand-400: 210 100% 70%;
  --primitive-brand-500: 210 100% 60%;
  --primitive-brand-600: 210 100% 50%;
  --primitive-brand-700: 210 100% 40%;
  --primitive-brand-800: 210 100% 30%;
  --primitive-brand-900: 210 100% 15%;

  --primitive-gray-50: 0 0% 98%;
  --primitive-gray-100: 0 0% 96%;
  --primitive-gray-200: 0 0% 89%;
  --primitive-gray-300: 0 0% 82%;
  --primitive-gray-400: 0 0% 64%;
  --primitive-gray-500: 0 0% 45%;
  --primitive-gray-600: 0 0% 32%;
  --primitive-gray-700: 0 0% 20%;
  --primitive-gray-800: 0 0% 10%;
  --primitive-gray-900: 0 0% 4%;

  --primitive-red-50: 0 100% 97%;
  --primitive-red-500: 0 100% 60%;
  --primitive-red-600: 0 100% 50%;
  --primitive-red-700: 0 85% 40%;

  --primitive-green-50: 120 100% 97%;
  --primitive-green-500: 120 100% 40%;
  --primitive-green-600: 120 100% 35%;
  --primitive-green-700: 120 85% 30%;

  --primitive-yellow-50: 45 100% 96%;
  --primitive-yellow-500: 45 96% 56%;
  --primitive-yellow-600: 45 93% 47%;

  /* === SEMANTIC COLORS === */
  /* Backgrounds & Surfaces */
  --background: 0 0% 100%;                  /* Page background (white) */
  --foreground: 0 0% 4%;                    /* Text on background (near black) */

  --surface-primary: 0 0% 100%;             /* Cards, containers */
  --surface-secondary: 0 0% 98%;            /* Subtle containers */
  --surface-tertiary: 0 0% 96%;             /* Further recessed */

  --surface-primary-foreground: 0 0% 4%;
  --surface-secondary-foreground: 0 0% 20%;
  --surface-tertiary-foreground: 0 0% 30%;

  /* Interactive Colors */
  --color-primary: 210 100% 50%;            /* Brand color, primary actions */
  --color-primary-foreground: 0 0% 100%;    /* Text/icons on primary (white) */
  --color-primary-hover: 210 100% 40%;      /* Hover state (darker) */
  --color-primary-active: 210 100% 35%;     /* Pressed state */
  --color-primary-disabled: 0 0% 80%;       /* Disabled (light gray) */

  --color-secondary: 210 100% 20%;          /* Secondary actions */
  --color-secondary-foreground: 0 0% 100%;
  --color-secondary-hover: 210 100% 25%;

  /* Status Colors */
  --color-success: 120 100% 35%;            /* Positive outcomes */
  --color-success-foreground: 0 0% 100%;
  --color-success-subtle: 120 100% 92%;     /* Success background */

  --color-warning: 45 96% 47%;              /* Cautions, review needed */
  --color-warning-foreground: 0 0% 100%;
  --color-warning-subtle: 45 100% 92%;

  --color-error: 0 100% 50%;                /* Errors, destructive */
  --color-error-foreground: 0 0% 100%;
  --color-error-subtle: 0 100% 95%;

  --color-info: 210 100% 50%;               /* Informational */
  --color-info-foreground: 0 0% 100%;
  --color-info-subtle: 210 100% 95%;

  /* Semantic Grays */
  --color-text-primary: 0 0% 4%;            /* Main text (high contrast) */
  --color-text-secondary: 0 0% 35%;         /* Secondary text (medium contrast) */
  --color-text-tertiary: 0 0% 55%;          /* Tertiary (lower contrast) */
  --color-text-disabled: 0 0% 75%;          /* Disabled text */

  --color-border: 0 0% 89%;                 /* Borders, dividers */
  --color-border-light: 0 0% 93%;           /* Subtle borders */
  --color-border-heavy: 0 0% 75%;           /* Strong borders */

  --color-input-bg: 0 0% 100%;              /* Input field background */
  --color-input-border: 0 0% 89%;           /* Input border default */
  --color-input-border-focus: 210 100% 50%; /* Input border when focused */

  --color-muted: 0 0% 96%;                  /* Muted backgrounds */
  --color-muted-foreground: 0 0% 45%;       /* Text on muted (readable) */

  --color-accent: 210 100% 50%;             /* Accents, highlights */
  --color-accent-foreground: 0 0% 100%;

  /* Specific Use Cases */
  --color-link: 210 100% 50%;               /* Link color (usually brand color) */
  --color-link-visited: 280 85% 50%;        /* Visited link (purple tint) */
  --color-selection-bg: 210 100% 50%;       /* Text selection background */
  --color-selection-fg: 0 0% 100%;          /* Selected text color */

  /* Overlay & Backdrop */
  --color-overlay: 0 0% 0%;                 /* Modal backdrop color */
  --color-overlay-opacity: 0.5;             /* 50% opacity over background */

  /* Ring/Focus State */
  --color-ring: 210 100% 50%;               /* Focus ring color */
  --color-ring-width: 2px;
}
```

### 2.3 Complete CSS Variables for Dark Mode

```css
.dark {
  /* === SEMANTIC COLORS === */
  /* Backgrounds & Surfaces */
  --background: 0 0% 4%;                    /* Page background (almost black) */
  --foreground: 0 0% 98%;                   /* Text on background (near white) */

  --surface-primary: 0 0% 10%;              /* Cards, containers (dark gray) */
  --surface-secondary: 0 0% 15%;            /* Slightly lighter containers */
  --surface-tertiary: 0 0% 20%;             /* Further raised surfaces */

  --surface-primary-foreground: 0 0% 98%;   /* Text on dark card (white) */
  --surface-secondary-foreground: 0 0% 90%;
  --surface-tertiary-foreground: 0 0% 85%;

  /* Interactive Colors */
  --color-primary: 210 100% 65%;            /* Brand color (LIGHTENED for dark BG) */
  --color-primary-foreground: 0 0% 4%;      /* Text on primary (dark, for contrast) */
  --color-primary-hover: 210 100% 75%;      /* Hover state (even lighter) */
  --color-primary-active: 210 100% 60%;     /* Pressed state */
  --color-primary-disabled: 0 0% 30%;       /* Disabled (dark gray) */

  --color-secondary: 210 100% 75%;          /* Secondary actions (light) */
  --color-secondary-foreground: 0 0% 4%;
  --color-secondary-hover: 210 100% 82%;

  /* Status Colors (maintain recognition) */
  --color-success: 120 100% 55%;            /* Green (slightly brighter in dark) */
  --color-success-foreground: 0 0% 4%;
  --color-success-subtle: 120 100% 25%;     /* Success background (dark) */

  --color-warning: 45 96% 60%;              /* Yellow (brighter for visibility) */
  --color-warning-foreground: 0 0% 4%;
  --color-warning-subtle: 45 100% 20%;

  --color-error: 0 100% 65%;                /* Red (brighter, more visible) */
  --color-error-foreground: 0 0% 4%;
  --color-error-subtle: 0 100% 20%;

  --color-info: 210 100% 65%;               /* Info (same as primary) */
  --color-info-foreground: 0 0% 4%;
  --color-info-subtle: 210 100% 20%;

  /* Semantic Grays */
  --color-text-primary: 0 0% 98%;           /* Main text (white) */
  --color-text-secondary: 0 0% 75%;         /* Secondary text (light gray) */
  --color-text-tertiary: 0 0% 55%;          /* Tertiary (medium gray) */
  --color-text-disabled: 0 0% 35%;          /* Disabled text (dark gray) */

  --color-border: 0 0% 20%;                 /* Borders (dark gray) */
  --color-border-light: 0 0% 15%;           /* Subtle borders */
  --color-border-heavy: 0 0% 30%;           /* Strong borders */

  --color-input-bg: 0 0% 10%;               /* Input background (dark) */
  --color-input-border: 0 0% 20%;           /* Input border default */
  --color-input-border-focus: 210 100% 65%; /* Input border when focused (light blue) */

  --color-muted: 0 0% 15%;                  /* Muted backgrounds */
  --color-muted-foreground: 0 0% 75%;       /* Text on muted (readable) */

  --color-accent: 210 100% 65%;             /* Accents (light, stands out) */
  --color-accent-foreground: 0 0% 4%;

  /* Specific Use Cases */
  --color-link: 210 100% 65%;               /* Link color (lighter for visibility) */
  --color-link-visited: 280 85% 70%;        /* Visited link (lighter purple) */
  --color-selection-bg: 210 100% 65%;
  --color-selection-fg: 0 0% 4%;

  /* Overlay & Backdrop */
  --color-overlay: 0 0% 0%;
  --color-overlay-opacity: 0.7;             /* Darker overlay in dark mode */

  /* Ring/Focus State */
  --color-ring: 210 100% 65%;               /* Focus ring (lighter, visible) */
  --color-ring-width: 2px;
}
```

---

## 3. Accessible Color Combinations

### 3.1 WCAG AA Contrast Requirements

**Normal text (< 18px):** Minimum 4.5:1 ratio
**Large text (≥ 18pt or ≥ 14pt bold):** Minimum 3:1 ratio
**UI components & icons:** Minimum 3:1 ratio

### 3.2 Common Accessible Pairings (Tested)

**Light Mode:**

| Foreground | Background | Ratio | Pass | Use |
|-----------|-----------|-------|------|-----|
| #000000 (black) | #FFFFFF (white) | 21:1 | AA/AAA | Normal text, high contrast |
| #1F2937 (dark gray) | #FFFFFF (white) | 14.3:1 | AA/AAA | Body text, recommended |
| #4B5563 (medium gray) | #FFFFFF (white) | 8.5:1 | AA/AAA | Secondary text |
| #FFFFFF (white) | #0066CC (brand blue) | 5.1:1 | AA | Button text on brand color |
| #0066CC (brand blue) | #FFFFFF (white) | 5.1:1 | AA | Links on white background |
| #DC2626 (red) | #FFFFFF (white) | 5.3:1 | AA | Error text |
| #FFFFFF (white) | #DC2626 (red) | 5.3:1 | AA | White text on error background |

**Dark Mode:**

| Foreground | Background | Ratio | Pass | Use |
|-----------|-----------|-------|------|-----|
| #F9FAFB (near white) | #111827 (near black) | 15.9:1 | AA/AAA | Normal text in dark mode |
| #E5E7EB (light gray) | #1F2937 (dark gray) | 10.9:1 | AA/AAA | Secondary text in dark mode |
| #60A5FA (light blue) | #1F2937 (dark gray) | 7.4:1 | AA/AAA | Links in dark mode |
| #FFFFFF (white) | #0066CC (brand blue) | 5.1:1 | AA | Button text on brand color (dark) |
| #FECACA (light red) | #7F1D1D (dark red) | 7.2:1 | AA | Error text in dark mode |

### 3.3 Testing Your Colors

**Tool:** [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) or browser DevTools

**Step-by-step:**
1. Copy your foreground color (hex or rgb)
2. Copy your background color
3. Paste into contrast checker
4. Check ratio against WCAG AA (4.5:1 for normal text)
5. If failing, adjust foreground lightness or saturation

**Pro tip:** HSL makes this easier:
- Too light: Increase saturation or decrease lightness
- Too dark: Decrease lightness or increase saturation

---

## 4. Data Visualization Color Palettes

### 4.1 Categorical Palette (Qualitative)

Use when displaying distinct, unrelated categories (e.g., multiple metrics, different regions).

**Rule:** Max 7 colors before visual chaos; avoid pure colors (too vivid).

**Recommended palette (7 distinct colors):**

```css
:root {
  --chart-cat-1: 210 100% 50%;   /* Blue */
  --chart-cat-2: 160 100% 40%;   /* Teal */
  --chart-cat-3: 120 70% 50%;    /* Green */
  --chart-cat-4: 45 96% 56%;     /* Yellow */
  --chart-cat-5: 30 97% 54%;     /* Orange */
  --chart-cat-6: 0 100% 50%;     /* Red */
  --chart-cat-7: 280 85% 60%;    /* Purple */
}

.dark {
  /* Brighten all for visibility on dark background */
  --chart-cat-1: 210 100% 65%;
  --chart-cat-2: 160 100% 55%;
  --chart-cat-3: 120 70% 65%;
  --chart-cat-4: 45 96% 70%;
  --chart-cat-5: 30 97% 68%;
  --chart-cat-6: 0 100% 65%;
  --chart-cat-7: 280 85% 75%;
}
```

### 4.2 Sequential Palette (Ordered Data)

Use for data with progression (time, intensity, count).

**Light mode (white to dark):**

```css
:root {
  --chart-seq-1: 210 100% 95%;  /* Lightest (low value) */
  --chart-seq-2: 210 95% 85%;
  --chart-seq-3: 210 90% 70%;
  --chart-seq-4: 210 85% 50%;
  --chart-seq-5: 210 80% 35%;
  --chart-seq-6: 210 75% 20%;   /* Darkest (high value) */
}

.dark {
  /* Adapt for dark background */
  --chart-seq-1: 210 100% 25%;  /* Darkish (low value) */
  --chart-seq-2: 210 100% 35%;
  --chart-seq-3: 210 100% 50%;
  --chart-seq-4: 210 100% 65%;
  --chart-seq-5: 210 100% 75%;
  --chart-seq-6: 210 100% 85%;  /* Lightest (high value) */
}
```

### 4.3 Diverging Palette (Opposing Values)

Use for data with center point (e.g., -50 to +50, under/over target).

**Example: Net Promoter Score (NPS)**

```css
:root {
  --chart-div-neg-3: 10 86% 60%;   /* Red (detractors) */
  --chart-div-neg-2: 10 60% 75%;
  --chart-div-neg-1: 10 30% 90%;
  --chart-div-mid: 0 0% 95%;       /* Neutral (center) */
  --chart-div-pos-1: 200 30% 90%;
  --chart-div-pos-2: 200 60% 75%;
  --chart-div-pos-3: 200 86% 60%;  /* Blue (promoters) */
}

.dark {
  --chart-div-neg-3: 10 86% 65%;
  --chart-div-neg-2: 10 60% 75%;
  --chart-div-neg-1: 10 30% 70%;
  --chart-div-mid: 0 0% 40%;       /* Darker neutral */
  --chart-div-pos-1: 200 30% 70%;
  --chart-div-pos-2: 200 60% 75%;
  --chart-div-pos-3: 200 86% 65%;
}
```

### 4.4 Status/Semantic Colors (Always Recognizable)

These MUST be consistent across all charts, dashboards, and notifications.

```css
:root {
  /* Status indicators */
  --status-success: 120 100% 40%;     /* Green for positive/complete */
  --status-pending: 45 96% 56%;       /* Yellow for in-progress/pending */
  --status-error: 0 100% 50%;         /* Red for error/failed */
  --status-info: 210 100% 50%;        /* Blue for informational */

  /* Usage metrics */
  --metric-up: 120 100% 40%;          /* Green for growth */
  --metric-down: 0 100% 50%;          /* Red for decline */
  --metric-neutral: 0 0% 55%;         /* Gray for stable */
}
```

---

## 5. Dark Mode Implementation Patterns

### 5.1 Strategy: Don't Just Invert

**WRONG:** Light mode blue #0066CC → Dark mode blue #FF9933 (inverted)
**RIGHT:** Light mode blue #0066CC → Dark mode blue #60A5FA (lightened, same hue)

**Why:** Inverse colors lose semantic meaning and look wrong.

### 5.2 Systematic Approach

For each color, apply this formula:

**Light Mode:**
- Hue: Your chosen hue (e.g., 210 for blue)
- Saturation: 100% (vivid)
- Lightness: 40-60% (readable on white)

**Dark Mode:**
- Hue: SAME (preserve color identity)
- Saturation: 90-100% (keep vivid)
- Lightness: 60-75% (light enough on dark background)

**Example: Expanding a single color to light + dark:**

```
Light mode:
  Primary: HSL(210, 100%, 50%)
  Hover: HSL(210, 100%, 40%)
  Active: HSL(210, 100%, 35%)
  Disabled: HSL(0, 0%, 80%)

Dark mode (adjust lightness up):
  Primary: HSL(210, 100%, 65%)    ← +15% lightness
  Hover: HSL(210, 100%, 75%)      ← +35% lightness
  Active: HSL(210, 100%, 60%)     ← +25% lightness
  Disabled: HSL(0, 0%, 35%)       ← Same principle (dark gray for dark BG)
```

### 5.3 Desaturation for Dark Mode (Optional)

Some teams slightly desaturate colors in dark mode to prevent "vibrancy overload":

```
Light mode: HSL(210, 100%, 50%)  (fully saturated blue)
Dark mode: HSL(210, 90%, 65%)    (slightly desaturated, lighter)
```

This is subjective—test with your team and users.

### 5.4 CSS Variable Pattern for Light + Dark

```css
:root {
  --primary-light: 210 100% 50%;      /* Light mode */
  --primary-dark: 210 100% 65%;       /* Dark mode (lighter) */
  --primary: var(--primary-light);    /* Default to light */
}

.dark {
  --primary: var(--primary-dark);
}

/* Usage: Always reference --primary, never the mode-specific one */
.button-primary {
  background-color: hsl(var(--primary));
}
```

---

## 6. Status & Semantic Colors Reference

### 6.1 Complete Semantic Color Set

```css
:root {
  /* Success (positive outcome) */
  --success: 120 100% 40%;
  --success-light: 120 100% 92%;
  --success-foreground: 0 0% 100%;

  /* Warning (caution, review needed) */
  --warning: 45 96% 56%;
  --warning-light: 45 100% 92%;
  --warning-foreground: 0 0% 10%;        /* Dark text on light yellow */

  /* Error (failed, destructive) */
  --error: 0 100% 50%;
  --error-light: 0 100% 95%;
  --error-foreground: 0 0% 100%;

  /* Info (informational only) */
  --info: 210 100% 50%;
  --info-light: 210 100% 92%;
  --info-foreground: 0 0% 100%;

  /* Severity levels for alerts */
  --severity-critical: 0 100% 45%;      /* Darkest red */
  --severity-high: 0 100% 50%;
  --severity-medium: 45 96% 56%;
  --severity-low: 210 100% 50%;
  --severity-info: 210 100% 50%;
}

.dark {
  --success: 120 100% 55%;
  --success-light: 120 100% 20%;        /* Dark background */
  --success-foreground: 0 0% 4%;

  --warning: 45 96% 65%;
  --warning-light: 45 100% 20%;
  --warning-foreground: 0 0% 4%;

  --error: 0 100% 65%;
  --error-light: 0 100% 20%;
  --error-foreground: 0 0% 4%;

  --info: 210 100% 65%;
  --info-light: 210 100% 20%;
  --info-foreground: 0 0% 4%;

  --severity-critical: 0 100% 70%;
  --severity-high: 0 100% 65%;
  --severity-medium: 45 96% 65%;
  --severity-low: 210 100% 65%;
  --severity-info: 210 100% 65%;
}
```

### 6.2 Badge/Badge Styling

Badges are small, need to stand out:

```css
.badge-success {
  background-color: hsl(var(--success-light));
  color: hsl(var(--success));
  border: 1px solid hsl(var(--success));
}

.badge-error {
  background-color: hsl(var(--error-light));
  color: hsl(var(--error));
  border: 1px solid hsl(var(--error));
}

/* Dark mode: adjust contrast */
.dark .badge-success {
  background-color: hsl(var(--success-light));  /* 20% lightness = darker */
  color: hsl(120 100% 75%);                     /* Lighter green for readability */
  border: 1px solid hsl(var(--success));
}
```

---

## 7. Brand Color Customization Guide

### 7.1 For Customers/Resellers

If your SaaS allows customers to customize brand colors:

**1. Accept hex or HSL input:**
```
User inputs: #FF6B35 (their brand color)
```

**2. Parse and generate scale automatically:**
```javascript
function generateColorScale(hex) {
  const hsl = hexToHsl(hex);
  return {
    50: lighten(hsl, 97),
    100: lighten(hsl, 94),
    200: lighten(hsl, 88),
    300: lighten(hsl, 80),
    400: lighten(hsl, 70),
    500: hsl,              // Original
    600: darken(hsl, 8),
    700: darken(hsl, 15),
    800: darken(hsl, 25),
    900: darken(hsl, 40),
  };
}
```

**3. Test contrast automatically:**
```javascript
function testContrast(color, background) {
  const ratio = calculateContrastRatio(color, background);
  return ratio >= 4.5 ? "Pass WCAG AA" : "Fail";
}
```

### 7.2 Dark Mode Variant Generation

```javascript
function generateDarkModeColor(lightModeHsl) {
  // Keep hue, increase lightness for dark mode
  const [h, s, l] = lightModeHsl;
  const darkLightness = Math.min(l + 15, 75);  // Increase, cap at 75%
  return [h, s, darkLightness];
}

// Example:
// Light: HSL(210, 100%, 50%)
// Dark: HSL(210, 100%, 65%)
```

---

## 8. Common Mistakes (Anti-Patterns)

### 8.1 DO NOT

❌ **Use pure black (#000000) on dark backgrounds**
- Creates too much contrast, causes eye strain
- Use off-black (#1a1a1a) instead

❌ **Invert light mode colors for dark mode**
- Blue (#0066CC) inverted = Orange (#FF9933)
- Breaks semantic meaning (users expect blue for primary)

❌ **Use identical colors in light and dark mode**
- Light mode blue on white works (5:1 contrast)
- Same blue on dark background barely visible (1:1 contrast)

❌ **Over-saturate colors in dark mode**
- Bright neon colors on dark backgrounds cause "glowing" effect
- Reduce saturation slightly or add warm tint

❌ **Forget to test status colors**
- Red and green are fine separately
- But red/green colorblind users can't distinguish them
- Add patterns or icons as backup

❌ **Use non-HSL color formats for theming**
- Hex is hard to adjust programmatically
- RGB is verbose
- HSL makes adjustments obvious (just change Lightness)

### 8.2 DO

✓ **Use HSL for all color work**
✓ **Test every color pair for contrast (even on dark mode)**
✓ **Keep semantic meaning across both modes**
✓ **Use design tokens—never hardcode colors**
✓ **Generate color scales systematically**
✓ **Test with colorblind simulations**

---

## 9. Testing Checklist

### 9.1 Light Mode

- [ ] All text passes 4.5:1 contrast on backgrounds
- [ ] Links are underlined or visually distinct
- [ ] Error/success colors are not red/green only (icons/patterns too)
- [ ] Hover states are visibly different
- [ ] Disabled states are grayed out
- [ ] Form validation shows clearly

### 9.2 Dark Mode

- [ ] Background is not pure black (#000000)—use #0a0a0a or #111827
- [ ] All colors adjusted for dark backgrounds (not inverted)
- [ ] Text still passes 4.5:1 contrast
- [ ] Brand color is lighter (60-75% lightness)
- [ ] Shadows work (use darker opacity in dark mode)
- [ ] No "glowing" effect from over-saturated colors

### 9.3 Both Modes

- [ ] Status colors (success, error, warning) work in both modes
- [ ] Focus rings are visible
- [ ] Selection/highlight colors have good contrast
- [ ] Charts/graphs are readable
- [ ] Images/photos don't get weird color casts
- [ ] Animated transitions between modes are smooth

### 9.4 Accessibility

- [ ] WCAG AA contrast compliance tested
- [ ] Colorblind simulation tested (Deuteranopia, Protanopia)
- [ ] Screen reader labels are present
- [ ] Focus order is logical
- [ ] No color-only information (e.g., red = error only)

---

## 10. Tools & Resources

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [ColorBrewer 2.0](https://colorbrewer2.org/) — Pre-tested color palettes
- [UI Colors](https://uicolors.app/) — Tailwind color generator
- [Radix Colors](https://www.radix-ui.com/colors) — Production color scales
- [Coolors.co](https://coolors.co/) — Brand color exploration
- [Accessible Colors](https://accessible-colors.com/) — Interactive WCAG checker
- [Color Oracle](https://colororacle.org/) — Colorblind simulator (desktop app)
- [Polychrom](https://chir.ag/projects/ntamd/) — Color contrast analyzer

---

## 11. Quick Reference: Complete Theme Template

```css
/* variables.css */
:root {
  /* PRIMARY BRAND COLOR */
  --color-primary: 210 100% 50%;
  --color-primary-fg: 0 0% 100%;
  --color-primary-hover: 210 100% 40%;

  /* SEMANTIC COLORS */
  --color-success: 120 100% 40%;
  --color-warning: 45 96% 56%;
  --color-error: 0 100% 50%;
  --color-info: 210 100% 50%;

  /* TEXT */
  --color-text: 0 0% 4%;
  --color-text-secondary: 0 0% 35%;
  --color-text-muted: 0 0% 55%;

  /* BACKGROUNDS */
  --color-bg: 0 0% 100%;
  --color-surface: 0 0% 98%;
  --color-border: 0 0% 89%;

  /* CHARTS (7 categorical) */
  --chart-1: 210 100% 50%;
  --chart-2: 160 100% 40%;
  --chart-3: 120 70% 50%;
  --chart-4: 45 96% 56%;
  --chart-5: 30 97% 54%;
  --chart-6: 0 100% 50%;
  --chart-7: 280 85% 60%;
}

.dark {
  --color-primary: 210 100% 65%;
  --color-primary-fg: 0 0% 4%;
  --color-primary-hover: 210 100% 75%;

  --color-success: 120 100% 55%;
  --color-warning: 45 96% 65%;
  --color-error: 0 100% 65%;
  --color-info: 210 100% 65%;

  --color-text: 0 0% 98%;
  --color-text-secondary: 0 0% 75%;
  --color-text-muted: 0 0% 55%;

  --color-bg: 0 0% 4%;
  --color-surface: 0 0% 10%;
  --color-border: 0 0% 20%;

  --chart-1: 210 100% 65%;
  --chart-2: 160 100% 55%;
  --chart-3: 120 70% 65%;
  --chart-4: 45 96% 70%;
  --chart-5: 30 97% 68%;
  --chart-6: 0 100% 65%;
  --chart-7: 280 85% 75%;
}
```

---

## Summary

A production-grade color system requires:

1. **Semantic naming** — Colors describe purpose, not appearance
2. **Light + dark variants** — Same hue, different lightness
3. **Accessibility** — Test every pair for WCAG AA compliance
4. **Consistency** — Use design tokens, never hardcode colors
5. **Flexibility** — Support dark mode from day one
6. **Testing** — Validate on real screens and with colorblind users

Done right, your color system becomes invisible—users just experience a cohesive, accessible product. Done wrong, it becomes technical debt that compounds across every feature.
