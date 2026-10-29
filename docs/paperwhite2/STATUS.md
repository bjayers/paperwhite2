# Paper White 2 status

Kept by both Claude sessions (see CLAUDE.md). Newest first.

## 2026-10-28: one weather date a day, from an editable calendar; chaos never repeats (Remote Control session, not committed)

The calendar zones' weather is the original's again, read for one date a day (docs/paperwhite2/plugins.md, Seasons):
each real day picks one date of the current season's months (a hash of the save clock's day number and GameData's
season, uniform over the season's 92 or 90 days), and every calendar zone reads its original weather of that date
through `Calendar_ReadWeatherValue`, so neighbors agree (Virbank City and both Virbank Complex zones snow on the same
winter days). The per-season rates are gone (`res/paperwhite2/seasonal_weather.json`,
`tools/paperwhite2/seasonal_weather.py`, the hack-only `.inc` rule, the rates table). The calendar `a/0/9/6` is now
built from `res/field/weather_calendar/`, a JSON file per zone (each month's days with weather, by "day" or
"first-last", the rest sunny) plus `order.json`, by `tools/data/weather_calendar_data.py` in `DATA_PACKS`; dump and pack
of the base ROM round-trip byte for byte, and the matching build's archive check passes. More than 24 zones would need
`CALENDAR_ZONE_MAX` and `Calendar.zones[24]` raised. Chaos now draws among the three seasons other than GameData's, so
no two exteriors in a row share a season (a discarded interior draw doesn't change the saved season). `--hack` builds
with no warnings, `verify_dsi_rom.py` says intact, the memory check passes (`0x34880`, 210 KB left), `ninja
build/w2_us/stamps/modules.ok` and the `a/0/9/6` check pass on a plain configure, and a host test of the date pick
(every day of 2000-2099 in every season) passes. Not yet tested in game: on a winter day Virbank City and both Complex
zones should snow or not together; spring should bring rain on some days in most zones; in chaos every warp or Fly into
an exterior should change the season.

## 2026-10-28: DS Protect disarmed in hack builds (Remote Control session, not committed)

Hack builds never run DS Protect (docs/paperwhite2/plugins.md, DS Protect), the suspected cause of the shifted
build's black screen on the 3DS (Hardware tests below). Its four sites, in `game_system.c`, `event_battle.c`,
`event_mapchange.c` and `pokelist.c`, call under `PAPERWHITE2` the callbacks that its checks call when they pass, and
overlay 337 is never loaded. No object outside `lib/dsprot` references `DSProt_Init` or `DSProt_CallRunChecks*` in a
hack build. `--hack` and `--hack --shift 0x100` build with no warnings and `verify_dsi_rom.py` says intact for both,
and a plain configure passes `ninja build/w2_us/stamps/modules.ok`. To test on the 3DS through TWiLight Menu++, in DS
and DSi mode: `paperwhite2.nds` and `paperwhite2_shifted.nds` in the Windows folder (the shifted one is also
`build/paperwhite2_shifted.nds`). Load the save, change maps, battle, open the party list. If the shifted build still
goes black, DS Protect wasn't the cause (or not the only one).

## 2026-10-28: the Season app at the Centers' globe (Remote Control session, not committed)

The Pokémon Centers' globe opens a touch-screen Season app instead of Geonet, which hack builds no longer have
(docs/paperwhite2/plugins.md, Season app): `src/paperwhite2/ov312/paperwhite2_season_app.c`, linked into Geonet's
overlay 312 and started by `Scrcmd_ProcFld_CallGeonet` under `PAPERWHITE2`; `global_2100.s`'s `Script_9` no longer
checks `EVENT_FLAG_0x006a` in hack builds (the flag and the Castelia Geonet girl are untouched). It is Geonet's parts
without the globe: the grid on both screens, the message window on the top screen with the setting, the current
season and the game's season banner (its black made transparent over the grid), and on the touch screen Geonet's list
(Set Season, Dynamic Options, Set Hemisphere, Cancel) leading to pages of task-menu buttons with Geonet's Quit button
as BACK. Touch and D-pad + A/B both work; the current mode's or hemisphere's button is amber. Text is a new bank,
`res/text/system/season_app.txt` (`TEXT_BANK_SEASON_APP`); the buttons' art is three new members of Geonet's archive,
`res/graphics/geonet/08.png` (a copy of the task menus' frame), `09.pal` and `10.pal`, loaded through a new
`AppTaskMenuRes_CreateFromArchive` in `app_taskmenu.c`. `--hack` builds with no warnings, `verify_dsi_rom.py` says
intact, the memory check passes (209 KB left; overlay 312 0x3440 bytes, now the largest of its group, so overlays 36,
170 and 337 moved up 0x720, within overlay 36's room), and a plain configure passes `ninja
build/w2_us/stamps/modules.ok`. Not yet tested in an emulator or on hardware: plugins.md has the layout; the test is
to open the globe, try every page by touch and by keys, and leave the Center after each change to see its banner.

## 2026-10-28: the seasons ported, revised (Remote Control session, not committed)

The PMC season plugin is C again, revised rather than copied (docs/paperwhite2/plugins.md, Seasons): the setting is
still `EVENT_WORK_SEASON_SETTING` (bits 0-3 the mode, bit 4 the hemisphere; old saves' 0-7 mean what they meant), with a
southern hemisphere and a chaos mode (8) added, the daily mode counting real days (the plugin's `month * 31 + day`
skipped days at month ends) and the banner shown once for every mode but real time, which keeps the original's walk,
and chaos, which shows none. `Season_GetNext`/`GetPrevious` are the original's again. The 24 calendar zones' weather
is drawn once a day from per-season rates (`res/paperwhite2/seasonal_weather.json`, dumped from `a/0/9/6` by
`tools/paperwhite2/seasonal_weather.py`). `--hack` builds, `verify_dsi_rom.py` says intact, 210 KB (`0x34800`) left
in the main arena, `ninja build/w2_us/stamps/modules.ok` passes on a plain configure, and a host test of the date
math (every day of 2000-2099) passes. No in-game test yet; with the season NPC gone the mode can only be set by a
debug edit of the save's work value until the Season app exists.

## 2026-10-28: the season NPC removed (Remote Control session, not built yet)

The hack's season-change NPC (sets `EVENT_WORK_SEASON_SETTING`, the PMC season code's setting) is gone from the Pokémon
Centers of Aspertia, Floccesy and Virbank: its NPC (at 10,11, shown by `EVENT_FLAG_TRAINER_TEAM_PLASMA_GRUNT_3`), its
script and its messages. Floccesy's and Virbank's scripts and text are the original's again; Aspertia's keep the
hack's other changes, and the daily-gift NPC (global 10851) keeps its messages in Aspertia's bank. Castelia's Center
had only an unreachable copy of the script (no NPC, numeric message IDs past its text), now removed. Bianca's
post-gym scene in `aspertia_city.s` no longer resets that flag (nor Hugh's opening scene sets it), and her C-Gear
lines are the original's again (the hack had appended the "new service in the Pokémon Center" speech).

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

### Hardware tests (2026-10-28)

On the user's 3DS through TWiLight Menu++ (nds-bootstrap; DSi mode at 133 MHz, and DS mode): the normal hack build
with the battle plugins boots, loads the save and battles. The `--shift 0x100` build reaches the title screen and
the save menu, then goes black on loading the save, in both modes; melonDS runs it. nds-bootstrap wrote no log
(`NDSBTSRP.LOG`). The suspected cause is DS Protect (overlay 337): nds-bootstrap disarms it with patches at the
original's addresses, which miss once code moves, and the first check after the save loads is the map change's. The
hack's builds no longer run DS Protect (2026-10-28 entry above); that fix is pending a 3DS test. It matters for normal
hack builds too: ARM9 main has grown since, so every overlay has moved.

### Upstream sync

Remote `upstream` is fuddlesworth/pokebw2; merge (never rebase) `upstream/main` between milestones. First sync
2026-10-28, 102 commits (8f5bf2788c): only data conflicts, in files the hack changed, because upstream renamed script
commands and changed `event_data.py`. Resolve such conflicts by taking upstream's file and dumping the hack's data
again with the new tools (`tools/paperwhite2/events_lenient.py`, `tools/script/field_script.py disasm` after the
hack's text is in `res/text/script/`), never by hand. Then check `ninja build/w2_us/stamps/modules.ok` (code still
matches), build `--hack`, run `verify_dsi_rom.py`, and compare the archives with `tools/paperwhite2/narc_diff.py`.

### NPCs moved back (2026-10-28)

The Aspertia science guy's line is the original again. Back to their original places: Aspertia's advice NPC
(script 5), Floccesy's school kid (script 4, with her original facing and movement), Castelia's Geonet girl
(script 4, 9,12 facing up; the user remembers her on the season NPCs' tile 10,11 facing down after her event,
which the data doesn't show: ask before moving her). Kept as the user placed them: Mr. Medal (global 10638) in the
top-left corner of every Center up to Castelia, moved there so his medals aren't triggered by accident, and
Castelia's upstairs clerk (script 6) moved to make room for him.

### Next

1. The user tests `build/paperwhite2.nds` (`\\wsl$\Ubuntu\home\riku\paperwhite2\build\paperwhite2.nds`) in melonDS
   (DSi mode) and on 3DS TWiLight Menu++. It is the hack's data on clean code: no followers, seasons or plugins.
3. Port the PMC plugins.
