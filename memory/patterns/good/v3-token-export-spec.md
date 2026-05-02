# v3 Token Export Spec

**Owner:** token
**Source:** v3 Production Design System §2
**Adopted:** 2026-04-30 — All 4 export formats default

---

## 4 export targets (single source of truth)

```ts
interface TokenExport {
  json_w3c:     string;      // W3C Design Tokens spec — Figma/Style Dictionary compatible
  tailwind_js:  string;      // tailwind.config.js theme.extend
  css_vars:     string;      // :root { --color-brand-600: #7c3aed; }
  ts_types:     string;      // generated TypeScript types for IDE autocomplete
}
```

Boldteq decision: ship all 4 formats per project. Token agent emits all on every publish.

---

## W3C Design Tokens (JSON)

```json
{
  "color": {
    "brand": {
      "50":  { "$value": "#f5f3ff", "$type": "color" },
      "600": { "$value": "#7c3aed", "$type": "color" },
      "900": { "$value": "#4c1d95", "$type": "color" }
    },
    "semantic": {
      "primary":         { "$value": "{color.brand.600}", "$type": "color" },
      "primary-hover":   { "$value": "{color.brand.700}", "$type": "color" },
      "text-on-primary": { "$value": "{color.white}",     "$type": "color" }
    }
  },
  "spacing": {
    "section":   { "$value": "64px", "$type": "dimension" },
    "component": { "$value": "24px", "$type": "dimension" },
    "element":   { "$value": "8px",  "$type": "dimension" }
  },
  "$metadata": {
    "version": "0.4.0",
    "generated_at": "2026-04-28T10:00:00Z",
    "generator": "design-agent-v3"
  }
}
```

Compatible with Figma Tokens plugin + Style Dictionary.

---

## Tailwind config

```js
// Generated: tailwind.config.js
module.exports = {
  content: ['./src/**/*.{tsx,ts,jsx,js}'],
  theme: {
    extend: {
      colors:       require('./src/tokens/colors.json'),
      spacing:      require('./src/tokens/spacing.json'),
      borderRadius: require('./src/tokens/radii.json'),
      boxShadow:    require('./src/tokens/shadows.json'),
      fontFamily:   require('./src/tokens/fonts.json'),
      fontSize:     require('./src/tokens/typography.json'),
    },
  },
};
```

---

## CSS custom properties (runtime theming)

```css
/* src/tokens/tokens.css */
:root {
  --color-brand-50:  #f5f3ff;
  --color-brand-600: #7c3aed;
  --color-text-primary:        var(--color-slate-900);
  --color-text-on-primary:     #ffffff;
  --spacing-section:    64px;
  --radius-card:        12px;
  --shadow-card:        0 1px 2px rgba(0,0,0,0.04);
}

[data-theme="dark"] {
  --color-text-primary: var(--color-slate-100);
}
```

---

## Generated TypeScript types

```ts
// src/tokens/types.d.ts (generated)
export type ColorToken =
  | 'brand.50' | 'brand.600' | 'brand.900'
  | 'semantic.primary' | 'semantic.primary-hover' | 'semantic.text-on-primary';

export type SpacingToken = 'section' | 'component' | 'element';
export type RadiusToken = 'sm' | 'md' | 'lg' | 'xl' | 'full';
```

IDE autocomplete + compile-time safety for token names.

---

## Token diffing — impact reporting

```ts
interface TokenDiff {
  added:    string[];
  removed:  string[];
  changed:  TokenChange[];
  affected_components: string[];
  breaking: boolean;
}

function diffTokens(prev: TokenSet, next: TokenSet): TokenDiff {
  // Walk both trees; collect deltas
  // Cross-reference manifest to find dependent components
  // Mark breaking if a stable-component-used token is removed
}
```

Token agent computes diff on every publish. Surfaces in control panel `ImpactReport` ("12 components affected").

---

## Storefront token bridge (Stack B/C)

For Shopify ecom builds, token agent exports tokens.css to `assets/` for Liquid themes OR to `app/styles/tokens.css` for Hydrogen storefronts. Polaris admin embed uses `<AppProvider customProperties>` per `polaris-storefront-bridge.md`.

---

## Enforcement

1. Every project ships all 4 formats
2. Diff report mandatory on token publish
3. Breaking token changes block publish without migration plan
4. Contrast validation (WCAG AA) runs on every color token change
5. Unused token sweep (>30 days) flagged for removal

---

## Cross-references

- Component dependencies: `v3-component-system-spec.md` (`tokens_used` field)
- Polaris bridge: `~/.claude/memory/stacks/shopify/storefront/polaris-vs-storefront-tokens.md`
- Existing token skill: `~/.claude/skills/token/design-tokens-architecture.md`
