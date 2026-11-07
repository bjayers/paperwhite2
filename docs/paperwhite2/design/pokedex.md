# Pokédex pages (ideas, 2026-11-06)

The user's ideas, on the books, not started. Roadmap phase 3 ("the Pokédex's new pages"). The user draws the UI art;
the ROM session writes the specs and templates and wires the screens. The list of Pokémon may be redesigned later,
after these pages.

## Goal

An encyclopedia of each Pokémon that documents itself, read from the ROM's own data (`res/pokemon/<species>/data.json`
and the move, ability, item and type tables), so the user's changes show up and the player needn't look anything up
online. Not just flavour.

## The pages

- **Info, moved to the top screen**, with the sprite animated. The bottom screen shows:
  - the base stats and their total;
  - the gender ratio, catch rate, growth rate and **favourite flavour** (new, below);
  - buttons: play the cry, front or back view of the animated sprite, and the forms.
- **The Cry and Forms pages go**, their functions folded into Info. In their place:
  - **Moves and abilities:** the complete learnset (level, TM, tutor, egg) and the abilities, the hidden one included.
    Tapping a move shows its data (type, category, power, accuracy, PP, description).
  - **Evolution:** what it evolves from and into, by what method (the level, item, friendship, time, place, move...).
    Tapping a Pokémon opens its page if it's been discovered. An evolution not yet seen isn't shown, but its method is.
    Forms may go here instead of on Info.
- The habitat page stays (with the DexNav beside it).

## Favourite flavour (new data)

Each species gets a favourite flavour, in place of the nature's liked flavour, so that feeding berries to wild Pokémon
and followers is more interesting. It needs a table of its own (likely `res/paperwhite2/`, one value per species and
form) and an editor column. To decide: whether the original's nature-based flavours (the confusion berries, Figy and
the rest) follow it too, and what a liked or disliked flavour does when fed.

## Notes from the ROM session (2026-11-06)

- **The data is all there:** `data.json` has the base stats, types, catch rate, EV yields, gender ratio, hatch cycles,
  base friendship, growth rate, egg groups, abilities and hidden ability, wild held items, base Exp., height and
  weight, the learnsets (`by_level`, `by_tm`, `by_tutor`, `egg_moves`), the evolutions and the forms.
- **More that may help:** the EV yield (for training); the egg groups and hatch steps; the wild held items; the type
  matchups (weak, resists, immune), from the type chart; the base friendship.
- **What is shown when:** perhaps the basics once seen (types, habitat, evolution methods) and the rest once caught,
  which keeps a reason to catch. The user's call.
- **The code:** decompiled, in `src/ov298/` (the detail pages: `pokedex_detail_info.c`, `_voice.c`, `_form.c`,
  `_map.c`, ...), `src/ov299/` (the list), `src/ov300/` (search). New pages go in `src/paperwhite2/ov298/` per
  plugins.md. Overlay sizes matter: a bigger ov298 must still fit DS mode's memory (verify_dsi_rom.py, plugins.md
  Memory).
- **The specs the user will need:** each screen's background layers and what's on them, the palettes free for new art
  (16 colours each), the tile budget, the sprites' sizes (8 to 64 pixels), and a template PNG per screen at 256 by 192
  with the regions and buttons marked, plus an export and import tool for the art, like `cgear_sprites.py`. Research of
  the current screens' resources comes first.

## Everything we could add (the ROM session's list, 2026-11-06)

For planning: what the data supports, page by page. Each is read from `res/` at build time or from the ROM's archives
at run time, so the user's changes show. **Seen** and **caught** suggest what to show at each stage; the user decides.

### Info (top screen)

- The animated sprite (the battle's animation), front or back; the **shiny** colours once a shiny has been seen (the
  Pokédex already keeps the forms and shinies seen, for its Forms page).
- Name, national and regional numbers, category, types, height and weight, the entry text (as now).

### Data (bottom screen, beside Info)

- **Base stats** as bars, and their total. Caught.
- **Type matchups:** weak to (×4, ×2), resists (×½, ×¼), immune, from the type chart. Seen, since types are.
- **Gender ratio** (a bar, or genderless), **catch rate**, **growth rate**, **egg groups**, **hatch steps**, **base
  friendship**, **base Exp.**, **EV yield**, **wild held items** with their odds (50%, 5%, 1%). Caught.
- **Favourite flavour** (new table, below).
- Buttons: the cry, front or back, the form, shiny (when one has been seen).

### Moves and abilities (in place of the Cry page)

- The learnset in tabs: **by level** (with the levels), **TM and HM** (with their numbers), **tutor**, **egg moves**.
  Each with its type and category icons.
- Tapping a move: type, category, power, accuracy, PP, priority and its description (`res/moves/<move>/data.json`).
- **Abilities:** the two and the hidden one, each with its description (`res/abilities/`). Perhaps the hidden one
  only once caught.

### Evolution and forms (in place of the Forms page)

- The whole family: from what, into what, each with its method in words. The methods used by the data: level, stone
  or item, held item by day or night, friendship (by day, by night), knowing a move, levelling at a place (the
  magnetic field, the moss rock, the ice rock), gender, the Attack and Defense comparison, the personality value
  (Wurmple), beauty (Feebas), a species in the party (Mantyke), Shedinja's, and the trades (which need a local way
  first: `design/pokemon-center.md`). Up to 7 branches (Eevee) must fit.
- Tapping one opens its page once discovered; one not yet seen shows as unknown but with its method.
- **Forms:** each form's sprite, and its own types, stats and abilities where they differ (Rotom, Deoxys, the
  Therians, Kyurem, Darmanitan, Meloetta, Wormadam...).

### Kept

- **Habitat** (the area map, with the DexNav beside it).

### New data

- **Favourite flavour**, one per species and form, in a table of ours with an editor column. To decide: what feeding a
  liked or disliked berry does (to followers, to wild Pokémon), and whether the confusion berries follow it.

### Later

- The list of Pokémon redesigned (the user's idea), and its search and sorting.
- Where to learn a TM or a tutor move (needs a table of ours).

## A plan

1. **Research** the current pages: their background layers, palettes, tiles and sprites, the touch bar's tabs, how
   much room the overlays have, and how the battle's animated sprite can be drawn on the top screen.
2. **Specs and templates** for the user's art: a marked-up 256 by 192 template per screen and the limits, with an
   export and import tool.
3. **The data side** while the user draws: reading the learnsets, evolutions, moves and type chart, and the new
   flavour table.
4. **The pages**, one at a time: Info and Data first, then Moves, then Evolution, each tested before the next.

## The user's first mockup (2026-11-06)

- **Top:** today's Info page (sprite, number, name, category, type, height and weight, entry), the sprite animated.
- **Bottom:** sub-pages switched with L/R (shown as button sprites, not the letters):
  - **Stats:** the six base stats as bars with numbers, and the total. Buttons in the game's style: Cry, Sprite
    (front or back) and Form; perhaps Shiny and Language too.
  - **Data:** the gender ratio, catch rate, growth, favourite flavour, EV yield, base Exp., base friendship, egg
    group and egg cycles, with one free row.
  - **Matchups:** the vanilla type icons, with abilities such as Thick Fat taken into account.
- **Shown once seen:** the gender split, catch rate, EV yield, base Exp. and matchups. **Once caught:** everything else.
- **Next pages:** MOVE (moves and abilities) and EVO, in place of CRY and FORMS.

## What the screens allow (research of 2026-11-06, read from the source)

- **The engines are swapped:** `PokedexDetailGraphic_Create` calls `GX_SetDispSelect(0)`, so the main engine (with 3D)
  drives the bottom screen and the sub engine the top (`pokedex_detail.c:53-55`, `pokedex_detail_graphic.c`).
- **The animated sprite** is MCSS, the battle's system, drawn with 3D on main BG0: the Forms page already shows it,
  front and back, shiny (`pokedex_detail_form.c:756-758, 1491-1606`; `SetupPokemonLoaderFSTool(..., rare, ..., back)`).
  3D reaches only the main engine, so **today it can only be on the bottom screen**. The top can show the static
  sprite (a 2D OBJ, as the Info page does). Putting it on top needs either the engines swapped for the page (the
  bottom then has the sub engine's 16 KB of OBJ VRAM, and every VRAM bank reassigned) or display capture with a bank
  freed: both possible, both heavy.
- **VRAM:** main BG A, sub BG C, main OBJ B, sub OBJ I (16 KB), textures D, texture palettes E. Every BG is 16-colour,
  text mode. About 11 palette rows are free on the bottom and 9 on the top on the Info page; the fades cover rows 0-12.
- **Fonts** (`a/0/2/3`): 0 is the standard (12 by 15 cells); **1 is a small font with every character, 10 pixels
  high**, so "GROUP" and "CYCLES" can be text; 3 (8 pixels) has only 32 glyphs.
- **Buttons in the game's style** without new art: `AppTaskMenuWin` (the save's YES and NO), 3 tiles high, any width
  (`a/0/8/2` 0x20 and 0x1f, `src/system/app_taskmenu.c`). The type icons are loaded already (`a/0/8/2` 0x21-0x3e).
- **Keys:** L and R cycle the entry's languages on the Info page, the seasons on Area, the forms' arrows on Forms; the
  D-pad's Left and Right change tabs, Up and Down change Pokémon.
- **The cry:** `PokeVoice_Play(species, form, 64, ...)` (`pokedex_detail_voice.c:950`).
- **Seen and caught:** caught is per species only; seen is per form, sex and shiny (`PokeDex_HasSeenVariant`). The
  entries' languages are kept for species 1-493 only (`POKEDEX_LANGUAGE_SPECIES_MAX`), and Gen 5 species have only the
  English and Japanese entries in the ROM.
- **Memory:** ov296, ov298 and ov302 all chain up to the highest overlay, so every byte of code added costs the DS
  budget, 90 KB left now. MCSS and the loaders are in ARM9 main already.
- **Numbers:** the catch chance with a Poké Ball at full HP is `CheckBallCapture`'s (`btl_server_flow_sub.c:926`):
  a = rate / 3, three shake checks of (a/255)^¼ each (Tepig, 45: about 11.9%; critical captures only add). An egg
  cycle is 256 steps, halved by Flame Body or Magma Armor (`fieldmap_event.c`). Of 3,912 base stats only 8 pass 180.

## The user's decisions (2026-11-06, after the research)

- **The animated sprite goes on top**, as the Season app runs its 3D on top (`GX_DISP_SELECT_MAIN_SUB`). Only the
  Info page swaps the engines; Area, Cry and Forms keep the original layout, so the shared bars move between engines
  at a page change. Step 1 is that swap alone, with no visible change; if it causes much trouble, the fallback is the
  still sprite on top.
- **The 10 px font** (font 1) for the small headers ("GROUP", "CYCLES") and for the sub-page bar's L and R.
- **"Turn"** for the front and back button; **Shiny** a button of its own, shown once a shiny has been seen; a
  **Language** button cycling the entry's unlocked languages, as L and R do today.
- **Stat bars** full at 180, drawn as the summary screen's EV and IV bars are, coloured by the stat: red under 50,
  orange 50-79, yellow 80-99, green 100-129, blue from 130 (the ROM session's breakpoints, easy to change).
- **Catch rate** as the number and the chance with a Poké Ball at full HP, e.g. "45 (11.9%)".
- **Hidden until caught:** shown as "?", as the original does. Shown once seen: the gender split, catch rate, EV
  yield, base Exp. and matchups; the rest once caught.
- **Matchups** blank for now; its data may be worked out first.
- **The art:** the ROM session builds the layout as close to the mockup as it can, then gives pixel-exact templates
  from the result. The user draws each screen as one picture (16 colours in all, to be safe), and a tool cuts it into
  tiles, palettes and the screen. The animated grid background stays.

## Steps

1. The Info page with the engines swapped, nothing else changed (the user tests it).
2. The new Info page: top (animated sprite, number, name, category, type, height and weight, entry) and bottom
   (sub-page bar, Stats with bars and buttons, Data, Matchups blank).
3. Pixel-exact templates from the result, and the tool for the user's art.
4. MOVE and EVO in place of CRY and FORMS.

## Step 3: the art (2026-11-06)

`tools/paperwhite2/pokedex_templates.py` writes the bottom screen's templates for the user, drawn as the game lays the
page out: places from the page's `#define`s, text from `pokedex_data.txt` in the game's fonts (read from the extract),
so exact to the pixel. They hold the ROM's fonts, so they go to `build/pokedex_templates/` (ignored) and the user's
Windows folder (`Pokedex templates`), never to `res/`. Stats first: `stats_canvas.png` (to draw over),
`stats_reference.png` and `_tiles.png`, `README.txt` (the limits).

The art's plan: one 256 by 192 picture per sub-page, at most 16 colours with the transparent one, on sub BG6 with a
palette of its own (6), under the text and bars of BG7 and over the grid of BG4. BG6 also holds the buttons, which
cover the art where they are shown. A tool cuts it into tiles, a palette and a screen (as `cgear_pictures.py` does);
the page loads it in place of the placeholder panel and strip. Up to 672 tiles, all different, fit.
