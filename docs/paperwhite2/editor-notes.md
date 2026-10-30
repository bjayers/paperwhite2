# Notes for the editor

From the ROM session, for the editor in `editor/`. Which formats are settled, which will change, and the rules the
build relies on.

## Pokémon data and palettes (2026-10-29)

**Settled (safe to build on):**
- `res/pokemon/<species>/data.json` and its schema (`res/pokemon/species.schema.json` or the `$schema` it names).
- `res/pokemon/<species>/normal.pal` and `shiny.pal`: JASC palettes of 16 colours; index 0 is transparent.
- The battle sprites' indexed PNGs beside them. The `.pal` file sets the colours; a PNG's own palette only restores
  indices an image editor reordered on saving (docs/data.md, "Pokémon graphics and cries").
- Follower and overworld sprites: `res/field/actors/<code>/sprite.png` and `sprite.pal` (16 colours, index 0
  transparent), with `data.json` (`field_actor.schema.json`). A `"sprite": "<other code>"` key means the code shows
  another code's sprite and has no PNG of its own.

**Rules the build relies on:**
- Keep each palette at 16 colours, and never reorder a palette without remapping the pixels that use it.
- Edit `res/` in place; the build packs and checks everything from there. Validate edits with the JSON schemas.
- Party and box icons (`res/pokemon/<species>/icon.png`) use three **shared** palettes
  (`res/pokemon/shared/icon_palettes.pal`), chosen per species. Changing an icon's colours changes every species on
  the same bank, so an icon editor should pick colours from its bank, not edit the bank, for now.

**Pending, don't build yet:**
- Shiny variants and the single-palette design (docs/paperwhite2/ROADMAP.md, "Shiny palettes"): a per-species
  `shiny.json` listing variants, generated follower and icon palettes with optional overrides, and possibly
  follower sheets re-indexed to share the battle sprite's palette. The file layout isn't decided; an index editor
  that remaps a sprite's pixels to another palette's indices will be useful for it.
- The 174 shiny follower sheets (`res/field/actors/followers/*_shiny/`) are likely to be removed, and the shiny
  follower palettes are known to be wrong for some species (docs/paperwhite2/research.md). Don't build tooling that
  depends on them.
