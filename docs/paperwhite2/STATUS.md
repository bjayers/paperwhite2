# Paper White 2 status

Kept by both Claude sessions (see CLAUDE.md). Newest first.

## 2026-10-28: the trial and the first import (Remote Control session)

### Build

- `orig/baserom_w2_us.nds` matches `w2_us.sha1`. The hack ROM is `orig/paperwhite2_v0.21.nds` (SHA1 `71669351...`,
  trimmed to 297 MB).
- A matching White 2 builds in WSL (Ubuntu 26.04, Python 3.14): `python3 configure.py w2_us && ninja`.
- New `configure.py --hack`: builds `build/paperwhite2.nds` without the SHA1, module and archive checks (no padding,
  no BUGFIX). `python3 configure.py w2_us --hack && ninja`. A plain `configure.py w2_us` goes back to matching.
- The clean data is kept as the git tag `w2-original` (the fork point, 9a2dd68a0e) and, locally, as a copy in
  `extract/res_original/` (ignored). `git diff w2-original -- res/` shows every hack change.

### Imported into res/ (from the hack ROM, verified by rebuilding)

Each archive below, packed from `res/`, equals the hack ROM's member for member, except where noted.

| What | Archive | Files | Note |
| --- | --- | --- | --- |
| Script text | `a/0/0/3` | 17 in `res/text/script/` | Same text; 3 files encode smaller than Frost's (Frost writes uncompressed) |
| Berry descriptions | `a/0/0/2` | 10 `res/items/*_berry/data.json` | Cheri–Aspear gain a flavor line, Figy–Iapapa reworded |
| Zone header | `a/0/1/2` | `res/field/zones/black_city.json` | `enc_slot` 0 → 7 |
| Zone events | `a/1/2/6` | 17 in `res/field/events/` | 4 files (Castelia City 7, Aspertia City, Aspertia and Virbank gates) are 2 bytes shorter in the hack: Frost under-pads the init scripts. Harmless |
| Field scripts | `a/0/5/6` | 24 in `res/field/scripts/` | Byte for byte. No commands from code injection are used. Disassemble *after* importing the script text: the disassembler names messages from `res/text/script/` |
| Wild encounters | `a/1/2/7` | all 135 in `res/field/encounters/` | Byte for byte. Dumped as White 2 for both versions: the hack has seasonal tables where Black 2 has one, which the shared format can't hold, so Black 2's own encounters are gone |
| Trainers | `a/0/9/1`, `a/0/9/2` | Cheren ×2, Roxie ×2, Lass Isabel | Only the real changes; Frost's uncompressed names, reordered message table and a stray `\x{ffff}` on Colress's name were left out. Colress 2's type-20 message also differs in the hack, but the user didn't change it (Frost's table rebuild), so it stays original |
| Map terrain | `a/0/0/8` | 23 CSVs in 20 `res/field/maps/models/*/` | Collision/attributes only, no geometry. 23 tiles use shape 1, which the original never does; `map_terrain_data.py` now packs it unchanged |

Tool fixes: `trainer_data.py dump` named held items with `ITEM_ICON_*` constants (the `ITEM_` prefix lookup), now it
uses `items.txt`; `map_terrain_data.py` accepts tile shape 1.

The trial's comparison scripts are in `tools/paperwhite2/` (start of the editor's Import from ROM).

### Not imported yet

- **Following Pokémon** (port with its code): Options text `title_2` (`a/0/0/2` member 32); 2,574 new field actors
  in `a/0/4/7`/`a/0/4/8` (1,008 → 3,582 entries) which need new `OBJ_CODE_` constants; files in `following/`,
  `patches/`, `codeinjection/`, `overlay/overlay_0344.bin`, and the root `rail_data_index.tbl` and
  `field_camera_data_index.tbl`.
- (Done, see below: Unown sprites.)
- (Done, see below: Hidden Grottoes and Pokédex habitats.)
- **Type icons** `a/0/1/1` members 438–439 (TypeIconsW2 plugin graphics).
- **Banner** title "Paper White 2": the ROM build takes the banner from `extract/w2_us/banner/`, not from source.
- Code: arm9 and overlays (PMC hooks, seasons, MoveEffectiveness, TypeIcons, following) — the plugin port.

### Left alone on purpose

- (Corrected below: the rails are real edits.)
- Repacked with no member changes: `a/0/0/4`, `a/0/0/7`, `a/0/1/6`, `a/0/1/9`, `a/1/2/0`, `a/1/2/4`, `a/2/8/2`.

### Rails (found after the first test)

The user edited Castelia City's rails (zone 28 → `a/1/1/0` entry 1 → rail file 11, tile attributes file 36): copies
of the original rails at several heights, with new NPCs on them. Without them the NPCs are missing and leaving the
Castelia Pokémon Center freezes the game (the imported events use rail lines that the original file lacks).

Frost writes rail files with a 6-word header (no end offset, so the game takes the tile width, 0x1000, as the end of
the curves; it works because curves are only looked up by index). Every file it saved has that layout, which is all
26 changed files. The import must keep every point, line, camera and curve index, and write the game's 7-word header.

The root `rail_data_index.tbl` is Frost's zone → `a/1/1/0` index table (zone 28 → 1), and
`field_camera_data_index.tbl` the same for cameras; neither is read by the game.

### Field actor sprites

`tools/paperwhite2/import_field_actors.py BASE_FILES HACK_FILES [ROOT]` writes the sprites of the hack's changed
existing actors into `res/field/actors/`, reading only the base's 1,008 table entries and 975 graphics members (the
rest is the follower plugin's). It imported 23: `OBJ_CODE_POKEMON_UNOWN` and its forms 1–21 (Unown A–V, now other
species' 8-frame walking sprites, 256×32, which the follower plugin's entries also point at) and `OBJ_CODE_253`
(a Castelia NPC given back and walking frames). The table is unchanged, so the entries keep their 6-frame
`sprite_atlas_size` as in the hack. Packed, the graphics equal the hack's first 975 members.

### Rails, grottoes and habitats imported

- `tools/data/rail_data.py` (`res/field/rails/`), `grotto_data.py` (`res/field/grottoes/`) and `habitat_data.py`
  (`res/pokedex/habitats/`) are in `DATA_PACKS`; each packs the base ROM back byte for byte. Built, the rails equal the
  hack's with the header fixed (Castelia's rail file 11: 8 → 36 points, 6 → 30 lines, the originals an unchanged
  prefix), and the grottoes and habitats equal the hack's members.
- Grottoes: 18 of 20 changed, Pokémon only. Gender thresholds kept from the replaced species: Route 2's Tepig is
  always male in groups 0–1 and female in 2–3, Giant Chasm's Umbreon always male, Route 18's Chatot 30/30/60/60.
- Habitats, as Frost regenerated them: every form icon is 0 (the base had 205 seasonal and regional forms), every area
  shows by season, and 18 areas are cut at the game's limit of 30 species (their encounters have 31–77). A habitat
  generator from `res/field/encounters/` that keeps forms belongs in the editor.
- `trade_data.py`'s dump names `held_item` with `name("ITEM_")`, which can give `ITEM_ICON_*` names (as trainer_data
  did); the current trade sources are right.

### Next

1. The user tests `build/paperwhite2.nds` (`\\wsl$\Ubuntu\home\riku\paperwhite2\build\paperwhite2.nds`) in melonDS
   (DSi mode) and on 3DS TWiLight Menu++. It is the hack's data on clean code: no followers, seasons or plugins.
2. Banner from source.
3. Port the PMC plugins.
