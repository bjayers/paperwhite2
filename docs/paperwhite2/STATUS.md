# Paper White 2 status

Kept by both Claude sessions (see CLAUDE.md). Newest first.

## 2026-10-28: the battle plugins ported (Remote Control session)

Type Icons (the angular-wedge "Solid" style the hack's ROM has) and Move Effectiveness Preview are C in overlay 168,
`src/paperwhite2/ov168/paperwhite2_{type_icons,move_preview}.c`, hooked from `btlv_effect.c`, `btlv_gauge.c` and
`btlv_input.c` under `PAPERWHITE2`. `docs/paperwhite2/plugins.md` has the files, the hook table and the data.

- The installer's panel expansion is in `res/graphics/btlv/438.png` (8 more blank tiles) and `439.ncer` (a third OAM
  piece); packed, `a/0/1/1` members 438 and 439 equal the hack ROM's.
- The move colors are the hack's (its installer edited the DLL's six color bytes at `0xba4`): super effective light
  blue `0x7ecc`, resisted yellow `0x2f7e`, immune gray `0x4210`.
- `BtlvGauge`, `BtlvInput` and `PaletteFade` moved from their `.c` files into their headers, unchanged; a plain
  `configure.py w2_us` build still passes `ninja build/w2_us/stamps/modules.ok`.
- The hack builds and `verify_dsi_rom.py` says intact. Memory: 210 KB left in the main arena after the heaps (was
  220 KB); overlay 168 is now the highest overlay.
- Not yet play-tested: wedges on the name boxes in single, double and triple battles (player and enemy), hidden under
  a status and back after a cure, following type changes (Roost, Soak, Reflect Type, Illusion); move names colored on
  the move screen in single and rotation battles, and the selected move's name above the target cards in double and
  triple battles.

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
- (Done, see the battle plugins above: the type icons' `a/0/1/1` members 438–439.)
- (Done: the banner, see below.)
- Code: arm9 and overlays (PMC hooks, seasons, following) — the plugin port. (MoveEffectiveness and TypeIcons are
  done, see above.)

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
- Grottoes: 18 of 20 changed, Pokémon only. Three slots had kept the gender thresholds of the species they replaced
  (Nidoran♂/♀ 0/0/100/100, Ditto 0, Kingler/Corsola 30/30/60/60); at the user's request Route 2's Tepig and Giant
  Chasm's Umbreon are now 12 and Route 18's Chatot 50, their species' ratios (31 and 127 of 256), and so are all
  15 starters in grottoes (12, in both versions' sets where the hack placed them). The original game
  sets most slots to 30 by hand, whatever the species.
- Build bug, fixed: `tools/build/files_tree.py` left the symlink to the extracted file at a path that had just started
  being built, so the first pack of a new `DATA_PACKS` archive wrote through it into `extract/<version>/files/` (it
  overwrote the base's `a/2/7/3` and `a/2/9/6`, restored from a fresh extract). It now removes that link.
- Habitats, as Frost regenerated them: every form icon is 0 (the base had 205 seasonal and regional forms), every area
  shows by season, and 18 areas are cut at the game's limit of 30 species (their encounters have 31–77). A habitat
  generator from `res/field/encounters/` that keeps forms belongs in the editor.
- `trade_data.py`'s dump names `held_item` with `name("ITEM_")`, which can give `ITEM_ICON_*` names (as trainer_data
  did); the current trade sources are right.

### Banner

`res/paperwhite2/banner/` (banner.yaml, bitmap.png, palette.png, animation.bin) is the hack's banner; `--hack` builds
point the ROM config at it (`banner_edit` in configure.py), matching builds keep the original. The title is the
hack's (English and Japanese "Paper White 2", the other languages "White Version 2" as in the hack); Frost had filled
the Chinese and Korean titles with 0xFFFF, and they are the original's again (empty, and the Korean "White Version
2"). The icon is the original's, as in the hack.

### DSi header check

`tools/build/verify_dsi_rom.py build/paperwhite2.nds`: every DS and DSi sector digest, block digest and the six
HMACs (ARM7, digest, banner, ARM9i, ARM7i, ARM9) are valid. The DSi settings (dsi.yaml: unit code, flags, access
control, SCFG, title ID) equal the original's; the header bytes that differ are the sizes, offsets, digests and HMACs
that dsd recomputes, and the header and logo CRCs are valid. The RSA signature is the original's, as in the hack,
which runs in DSi mode through TWiLight Menu++ (it doesn't verify it). Run the verifier after every change to the
ROM's layout or code. It can't read Frost's ROM, whose ARM9 isn't BLZ-compressed as it expects.

### First code build (2026-10-28)

With the user's DS ARM7 BIOS at `orig/bios7.bin` (16 KB, ignored by git), `--hack` builds with the example hook
(`PaperWhite2_NextFieldFrame` in ov036, called every field frame) and `--hack --shift 0x100` both build and pass
`verify_dsi_rom.py` (the secure area's own sector digests can't be checked from a decrypted ROM, so it skips them).
The user play-tests both: `build/paperwhite2.nds` and `build/paperwhite2_shifted.nds` (a copy; a shifted build
writes `build/paperwhite2.nds`).

### Next

1. The user tests `build/paperwhite2.nds` (`\\wsl$\Ubuntu\home\riku\paperwhite2\build\paperwhite2.nds`) in melonDS
   (DSi mode) and on 3DS TWiLight Menu++. It is the hack's data on clean code: no followers, seasons or plugins.
3. Port the PMC plugins.
