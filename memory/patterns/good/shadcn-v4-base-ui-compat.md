---
name: shadcn v4 Base UI Compatibility
description: Critical API differences between shadcn v4 (Base UI) and shadcn v3 (Radix). Verified 2026-04-27 on Vite + React 19 + Tailwind 4.
type: feedback
---

# shadcn v4 — Base UI API Differences

shadcn v4 (canary/latest as of 2026-04-27) ships primitives from `@base-ui/react`, NOT `@radix-ui`. API differs significantly.

## Accordion (`@base-ui/react/accordion`)
- **NO `type` prop.** Drop `type="single"` — single-open is default.
- **NO `collapsible` prop.** Items are collapsible by default.
- **Multi-open:** use `openMultiple` boolean (default `false`).
- **State attribute:** `data-open` / `data-closed` (not `data-state=open`).
- `onValueChange` still works, fires `AccordionValue<T>` not `string | undefined`.

## Button (`@base-ui/react/button`)
- **NO `asChild` prop.** Use `buttonVariants()` className on a native `<Link>` or `<a>`.
  ```tsx
  import { buttonVariants } from "@/components/ui/button";
  <Link to="/foo" className={cn(buttonVariants({ size: "lg" }), "custom-class")}>...</Link>
  ```

## TabsTrigger (`@base-ui/react/tabs`)
- **Active state:** use `data-active:` selector, NOT `data-[state=active]:`.
  ```tsx
  className="data-active:bg-forest-800 data-active:text-cream-50"
  ```
  Note: may need `!` override if shadcn default active styles conflict.

## Dialog / Sheet
- Both built on `@base-ui/react/dialog`. API similar to Radix (open, onOpenChange).
- Close button uses `render` prop: `<DialogPrimitive.Close render={<Button ... />}>`.
- Backdrop is `DialogPrimitive.Backdrop` (not `DialogOverlay`/`SheetOverlay` from Radix).

## Tailwind 4 `@theme inline {}` bridge block
- **NEVER remove.** shadcn components reference variables like `--ring`, `--border`, `--primary` etc.
  via this bridge block which maps `var(--color-*)` utility classes to CSS custom properties.
- Remove it → all shadcn button/input/card variants break silently.
- Keep structure: `@theme {}` (Vela tokens) → `@theme inline {}` (bridge, untouched) → `:root {}` → `.dark {}`.

## tsconfig requirements
- `"noUncheckedIndexedAccess": true` — requires `?? fallback` on any `array[i]` or `Record[key]` access.
- `"strict": true` — covers no-implicit-any, strict-null-checks etc.
- Alias: `"paths": { "@/*": ["./src/*"] }` needed for shadcn CLI detection.
- May need `"ignoreDeprecations": "6.0"` in `tsconfig.app.json` for TypeScript 6 `baseUrl` warning.
