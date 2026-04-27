
---

## Curriculum v1 — Session 3 Patches (2026-04-27)

**Source:** ELI-008, ELI-009 · changelog: `~/.claude/memory/training/cycle-ecom-v1-session-3-changelog.md`

### Default Hero Type (ELI-008)
**Single static lifestyle photography hero.** NO carousel. Decoder-canonical (Allbirds, Vuori, Outdoor Voices, Cuyana).

**Anti-patterns:**
- Carousel hero (slides 2+ near-zero engagement)
- Auto-play video with sound (instant bounce)
- Auto-advance carousel (UX hostility)

**Override conditions:**
| Condition | Hero type |
|-----------|-----------|
| Premium / luxury / sleep / beauty editorial brand | Video background hero (muted, looping) |
| Explicit dual-product launch | Split-hero (2 products side-by-side) |
| Spec-driven brand (tech, supplements) | Static product hero (white BG, product center) |
| Default (apparel / beauty / CPG / home) | Lifestyle photography static |

### Hero Text Position (ELI-009)
**Default:** Overlay on image, top-left aligned (F-pattern reading anchor).

**Contrast:** 40% black gradient scrim under text for WCAG AA on any image.

**Anti-patterns:**
- Center-aligned overlay (worse F-pattern reading)
- Banner above image (ignores hero-image power)
- Text below image (mobile scroll required)
- Beside-image without negative-space design (mobile parity loss)

**Override:** Beside-image on desktop ONLY when hero image has natural negative-space zone explicitly designed for text. Document override.
