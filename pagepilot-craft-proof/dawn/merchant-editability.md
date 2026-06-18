# Merchant Editability — pp-stat-circles (Dawn BUILD-CUSTOM)

The one custom section in this proof is fully customizer-editable (no hardcoded content):

| Control | Type | Editable in customizer |
|---|---|---|
| Heading | text | ✓ |
| Color scheme | color_scheme | ✓ (drives all color via Dawn scheme — no hex in code) |
| Columns (desktop/mobile) | range | ✓ |
| Disclaimer | textarea | ✓ (bind to real methodology) |
| Padding top/bottom | range 0–100 step 4 | ✓ |
| Per-stat: value / suffix / label | blocks (max 4) | ✓ add/remove/reorder |

All visual styling derives from the active color scheme + Dawn vars (`--color-button`, `--color-button-text`, `--media-radius`, `--page-width`). A merchant changes brand color by switching the scheme — never by editing code. Honesty: stat values are placeholders → bind real self-reported data; the disclaimer stays visible.
