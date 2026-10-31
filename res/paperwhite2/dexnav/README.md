# The DexNav's art

The DexNav (`docs/paperwhite2/design/dexnav.md`) draws on Geonet's grid for now. This folder is for its own art, which
the app isn't wired to yet: once a screen's art is here, it becomes an art target and the app's drawing code is pointed
at it.

## The templates

`templates/top.png` and `templates/touch.png` are the two screens at 256 by 192, as the app lays them out today: the
8 by 8 tiles (lighter lines every 16 pixels), the text windows in blue, the Pokémon icons' places in orange, the tabs in
green and the cells' shares in purple. Put one under the art as a reference layer and hide it when you export. The
layout can change: move things where you want them, and the app follows the art. `tools/paperwhite2/dexnav_templates.py`
writes the templates again from the app's layout.

## What the DS allows

- **Tiles.** A screen is 32 by 24 tiles of 8 by 8 pixels. Repeated tiles (also flipped ones) are stored once, so flat
  panels and patterns are cheap, but a screen with every tile different (768 tiles) still fits in this app's memory.
- **Palettes.** Each tile uses one palette of 16 colors, whose color 0 shows the layer below (transparent). A screen
  has 16 palettes; the app keeps 5 for text, the chosen cell and the Pokémon icons, which leaves 11 for art. A screen
  in one palette is simplest; with several, keep each tile within one of them.
- **Layers.** The art is a background layer; the text and icons are drawn on a layer above it, so leave the text areas
  plain (no lettering): the game prints the words, in any language and length. A third layer is free for panels that
  should change without the background, such as a tab's chosen state.
- **Moving parts** (a cursor, a blinking arrow, a chain counter) are sprites, drawn separately in sizes from 8 by 8 to
  64 by 64.

## Drawing in Aseprite

1. New sprite, 256 by 192, **Indexed** color mode. **View ▸ Grid ▸ Grid Settings**: 8 by 8, and turn the grid on.
2. Set the palette to 16 colors, color 0 first (it is the transparent one). With several palettes, lay them out in
   blocks of 16 and keep each 8 by 8 tile within one block.
3. Draw the frames and panels; keep the text and icon places plain.
4. Export as an indexed PNG (**File ▸ Export**), with only the palette's colors (no 256-color padding).
5. Put each screen here as `top.png` and `touch.png`, with any extra states (a chosen tab, a chosen cell) as their own
   small PNGs, named for what they are.

The DexNav isn't one of the editor's art targets yet (`docs/paperwhite2/art.md`); once it is, the editor's
**Graphics & Palettes**, page **Screens**, converts the PNGs and shows what doesn't fit. Its **Palettes** page works on
the `.pal` files: **Download .pal** gives Aseprite a palette from `res/`
(Aseprite loads JASC `.pal` files in its palette menu, **Load Palette**), **Import colors** takes a palette from a .pal
or from your PNG, and **Open a PNG** shows your PNG with a palette while you tweak the colors.
