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
