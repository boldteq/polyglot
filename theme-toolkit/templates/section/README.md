# `templates/section/` — the blank page that already knows the conventions

Rendered by `scripts/new-section.mjs`. Measured root cause RC3: agents write correct Shopify code
when EDITING a Dawn file (41–68 `t:` keys per file) and wrong code when AUTHORING a new section
(16 new sections → 0 `t:` keys, ~221 raw `label` strings), because the convention lives in the file
being edited and nowhere else. These templates put it in the blank page instead.

## Placeholder syntax

Deliberately NOT `{{ }}` / `{% %}` — those belong to Liquid and the `.liquid.tpl` file is full of them.

| Form | Meaning |
|---|---|
| `@@NAME@@` | kebab-case section name (`story-panel`) |
| `@@ROLE@@` | human role name shown in the Add-section picker (`Story panel`) |
| `@@BLOCK@@` | repeatable block type (`item`) — only inside an `IMAGE`/`BLOCKS` region |
| `@@BLOCK_LABEL@@` | Title-cased block type (`Item`) |
| a line that is exactly `@@IF:FLAG@@` … `@@ENDIF@@` | drop the enclosed LINES when `FLAG` is off |
| `@@IF:FLAG@@…@@ENDIF@@` mid-line | drop the enclosed TEXT when `FLAG` is off (used for the trailing comma before an optional JSON member) |

Flags: `IMAGE` (`--image`), `BLOCKS` (`--blocks <type>`).

## Files

| File | Rendered to |
|---|---|
| `section.liquid.tpl` | `sections/<name>.liquid` — `@@SCHEMA@@` is replaced with the validated, re-serialized schema |
| `schema.json.tpl` | the `{% schema %}` body — parsed + validated before embedding, so a broken template fails loudly instead of shipping |
| `section.css.tpl` | `assets/section-<name>.css` |
| `locale.schema.json.tpl` | the `sections.<name>` subtree spliced into every `locales/*.schema.json` |

Editing rules: every `label` / `info` / `content` / `name` in `schema.json.tpl` must be a `t:` key that
exists in `locale.schema.json.tpl`, and every `range` default must sit on the `min + N*step` grid —
`new-section.mjs` asserts both at render time and the fixture suite asserts them again.

## `section.css.tpl` — the rem-root dependency

Spacing is authored in `rem` against **Dawn's 62.5% root** (`html { font-size: 62.5%; }` in
`assets/base.css`), so `0.8rem` = 8px and `2.4rem` = 24px — values on the 4px design-system scale.
Gate #8 `design-tokens` auto-detects that reset; on a base theme WITHOUT it the gate resolves 1rem as
16px, reads these as 12.8/38.4/51.2px, and BLOCKS with `ds.spacing`. Verified 2026-07-23 by scaffolding
into a skeleton theme with and without the reset.

If a base lacks the reset, set `typography.rem_root_px` in `docs/design/design-system.json` rather than
rewriting the template. Fixture case (h) pins every emitted spacing length to the scale at 1rem = 10px,
so a new length that only "looks right" will fail the suite.
