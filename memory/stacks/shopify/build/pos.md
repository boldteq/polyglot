# Build: POS (Point of Sale) Extensions

> Source: shopify.dev/docs/apps/build/pos
> Last extracted: 2026-04-04

## Overview

- **Cross-platform native** — iOS and Android with identical experience
- **Remote-dom based** — Shopify's cross-platform UI library
- **Design system alignment** — Native components auto-match merchant brand
- **Performance** — Faster than web-based alternatives

## Extension Targets & Components

### Tiles (Home Screen)

- Display tiles on smart grid (POS home screen)
- First screen merchants see
- Essential functions entry point
- Use case: Quick-access tools (inventory, discounts, reports)

### Actions (Modals/Full-Screen)

- Launch modals or full-screen views from menu buttons
- Menu-based triggers
- Complex workflows
- Use case: Return processing, custom order creation

### Blocks (Inline Sections)

- Custom sections within existing screens
- Product Details screen (inventory, pricing, specs)
- Post-Purchase screen (transaction summary, follow-ups)
- Use case: Contextual tools and information

## Web Components & APIs

**Component categories:**
- Actions (touch-based interactions)
- Forms (data capture with validation)
- Input fields (date, email, numeric, text)

**API access:** Target APIs provide data based on chosen target. APIs vary per target.

## Configuration Pattern

```toml
# shopify.extension.toml
type = "pos_ui"
targets = ["pos.home.tile.render"]

[settings]
title = "My App"
description = "Quick access tool"
```

## Code Pattern: Basic Tile

```typescript
import {
  BlockStack,
  Text,
  Button,
  Section,
} from '@shopify/pos-ui-extensions';

export default function MyTile({ api }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Section title="My Tool">
      {!isOpen && (
        <Button onPress={() => setIsOpen(true)}>
          Open My Tool
        </Button>
      )}

      {isOpen && (
        <BlockStack>
          <Text>My Tool Content</Text>
          <Button onPress={() => setIsOpen(false)}>Close</Button>
        </BlockStack>
      )}
    </Section>
  );
}
```

## Pitfalls

- **Target-specific capabilities vary** — Each target has different API availability
- **Mobile-first design required** — Layouts must work on touch interfaces
- **No web component libraries** — Shopify POS components only
- **Cross-platform testing mandatory** — iOS and Android behavior must be verified separately
- **Performance critical** — Avoid heavy computations or large data fetches
