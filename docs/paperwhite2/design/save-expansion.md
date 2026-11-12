# Save expansion: a Pokédex for 1500 species

Research and design for a hack-owned Pokédex save area with room for **1500 species** and generous room for forms,
replacing the lists of the original `PokeDexSave` (`include/save/pokedex_savedata.h`, `src/system/pokedex_savedata.c`),
with the form-bit list generated from `res/pokemon` so that the editor's "Add form" needs no C edit. Everything here
was read from the source or measured on a copy of the user's save (`paperwhite2.sav`, melonDS, 524,288 bytes);
what is inferred and not traced is marked so. **Built on 2026-11-12, with the user's decisions: section 11.**

## 1. Summary

- **Where:** the main save's **Pal Pad block** (`SAVE_BLOCK_PAL_PAD`, 0x1f, 0xd54 bytes at 0x1b200 and its backup
  at 0x41200). It belongs to wireless trades only, it is all zeros in the user's save, and every caller is a wireless
  feature. Its size stays 0xd54, so **the save's layout, footer and every other block stay byte for byte as they
  are**, and old saves keep loading. The two copies, the CRCs and the repair on load come with it.
- **Size:** 0xd54 bytes (3412). Lists for species 1-1504 (0xbc bytes each), 1024 form bits for each of the four form
  lists, a self-describing form directory of 128 species, languages for species 1-649, and 352 bytes kept free.
- **The game upgrades the save itself, on load** (`SaveControl_Create` and `SaveControl_Reload`): no magic in the
  area means an old save, so it builds the area from the original Pokédex block; a form directory that differs from
  the ROM's means forms were added or moved, so it remaps the bits. Both happen in RAM and reach the card with the
  next save. **No converter is needed**; a Python tool reads, checks and upgrades saves offline for tests.
- **The original Pokédex block (0x36) stays**, checksummed, written by new games' init and otherwise left as it was
  at the upgrade, as the upgrade's source.
- **No blocker.** No space is free anywhere else without moving blocks: the main save has 0x5c bytes left
  (section 2.3), and growing any block breaks every old save (section 2.4).
- **The main decision for the user** is languages: kept for 1-649 (the recommended layout), or for all 1500 (one
  layout that packs the shown lists tighter, or a second block). Section 10.

## 2. The save layout

### 2.1 The flash

The card is a 4 Mbit flash, 512 KB (`identifyGameCardBackup`, `src/gfl/backup_card.c`:
`CARD_BACKUP_TYPE_FLASH_4MBITS_EX`). What the game keeps there (`src/system/save_table.c`, `src/system/save_control.c`,
`src/ov331/save_outside.c`, `src/system/cygnus_save_control.c`):

| Range | What | Copies | Wireless only? |
| --- | --- | --- | --- |
| 0x00000-0x26000 | The main save | main | |
| 0x26000-0x4c000 | The main save's backup (`SAVE_BACKUP_ADDR`) | backup | |
| 0x4c000-0x4da00 | Extra 0: the player's own battle video (`sExtraBattleRec0`, 0x1a00) | 1 | no: recorded locally |
| 0x4da00-0x52800 | Extras 1-3: downloaded battle videos (0x1a00 each, `BattleRec_GetExtraBlock`) | 1 | yes |
| 0x52800-0x55000 | Extra 4: the downloaded C-Gear skin (`CGearPictureSave`, 0x2800) | 1 | yes; the hack's C-Gear still loads it (`c_gear_sw.c:2477`) and doesn't show it |
| 0x55000-0x55800 | Extra 5: the Battle Test, shared with the Battle Institute (`trial_house.c:47`) | 1 | no |
| 0x55800-0x6d800 | Extra 6: the downloaded musical (`MusicalDist`, 0x18000) | 1 | yes |
| 0x6d800-0x74000 | Extra 7: the downloaded Pokédex skin (0x6800) | 1 | yes (Game Sync, `gsync_state.c:700`) |
| 0x74000, 0x75800 | Extra 8: the Hall of Fame (0x1800), the only extra with a backup | 2 | no |
| 0x77000-0x7a000 | Extras 9-16: Pokéstar Studios' films (0x600 each) | 1 | no |
| 0x7a000-0x7dc00 | Extras 17-19: downloaded PWT tournaments (0x1400 each, `t_download_save.c:32`) | 1 | yes |
| 0x7dc00-0x7e000 | Extra 20 (0x400, a 0xc8-byte block nothing opens: `extra_block_savedata.c`) | 1 | unused |
| 0x7e000, 0x7e400 | Gifts outside the save and their backup (`SAVE_OUTSIDE_GIFTS_ADDR`) | 2 | yes |
| 0x7e800-0x7eb00 | Keys outside the save (`SAVE_OUTSIDE_KEYS_ADDR`, `KEYS_SIZE` 0x300) | 1 | yes |
| 0x7f000-0x7f094 | Dream Radar's data (`CYGNUS_DATA_CARD_OFFSET`, `CygnusSaveData`) | 1 | yes (3DS) |
| 0x7eb00-0x7f000, 0x7f094-0x80000 | Nothing references them (no address in `src/`, `include/` or `lib/`) | | |

In the user's save, 0x4c000-0x77000 is all zeros (no video, skin, musical or Hall of Fame yet), film 0 is at 0x77000,
and Dream Radar's header at 0x7f000. **Unwritten flash reads 0x00 in this melonDS file, not 0xff**, so no tool may
take 0xff as "erased".

### 2.2 How the main save is laid out

`SaveData_BuildTable` (`src/gfl/savedata.c`) places the blocks of `SAVEDATA_INIT` in table order from offset 0. Each
block's size is its `getSize()` rounded up to 4 (`getSizeSaveTblBlk`), followed by a 4-byte `BlockFooter` (`u16 count`,
`u16 crc`, `src/gfl/backup_system.c`), and the next block starts at the next multiple of 0x100. The 0x100 steps are
the flash's 256-byte pages: writing one block never rewrites another's page. After the last block come the blocks'
CRCs (`u16` each, padded to an even count: 73 blocks, 148 bytes) and the 0x10-byte `SaveFooter` (`u32 count`,
`u32 size`, `u32 magic` 0x31053527, `u16 unkC`, `u16 crc` of the CRC table). The CRC is CRC-16-CCITT (polynomial
0x1021, initial value 0xffff, `MATHi_CRC16InitTable(…, 0x1021)`) over the block's rounded size.

Measured on the save copy (`decode.py`, which finds each block by its CRC; both copies agree, footer count 154):

| ID | Block | Offset | Size | | ID | Block | Offset | Size |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Box main | 0x00000 | 0x3e0 | | 47 | Tournament | 0x20500 | 0x2fc |
| 1-24 | Box trays | 0x00400 + 0x1000 n | 0xff0 | | 48 | Gimmick | 0x20800 | 0x94 |
| 25 | Bag | 0x18400 | 0x9ec | | 49 | Battle Box | 0x20900 | 0x35c |
| 26 | Party | 0x18e00 | 0x534 | | 50 | Day Care | 0x20d00 | 0x1d4 |
| 27 | Trainer data | 0x19400 | 0xb0 | | 51 | Strength rocks | 0x20f00 | 0x1e0 |
| 28 | Player | 0x19500 | 0xa8 | | 52 | Trainer game info | 0x21100 | 0xf0 |
| 29 | Unity Tower survey | 0x19600 | 0x1338 | | 53 | High Link | 0x21200 | 0x1b4 |
| 30 | Wi-Fi list | 0x1aa00 | 0x7c4 | | **54** | **Pokédex** | **0x21400** | **0x4dc** |
| **31** | **Pal Pad** | **0x1b200** | **0xd54** | | 55 | Encount | 0x21900 | 0x34 |
| 32 | C-Gear | 0x1c000 | 0x94 | | 56 | Subway play | 0x21a00 | 0x3c |
| 33 | Time signature | 0x1c100 | 0x658 | | 57 | Subway score | 0x21b00 | 0x1ac |
| 34 | Mystery Gift | 0x1c800 | 0xa94 | | 58 | Subway Wi-Fi | 0x21d00 | 0xb90 |
| 35 | Dream World | 0x1d300 | 0x1ac | | 59 | Record | 0x22900 | 0xac |
| 36 | Chatter | 0x1d500 | 0x3ec | | 60 | Symbol (Entree Forest) | 0x22a00 | 0x850 |
| 37 | Adventure | 0x1d900 | 0x5c | | 61 | Survey | 0x23300 | 0x284 |
| 38 | Records | 0x1da00 | 0x1e0 | | 62 | Unity Tower floor | 0x23600 | 0x10 |
| 39 | PMS | 0x1dc00 | 0xa8 | | 63 | Trial House | 0x23700 | 0xa8 |
| 40 | Mail | 0x1dd00 | 0x460 | | 64 | Block 0x40 (Hall of Fame team) | 0x23800 | 0x16c |
| 41 | Field actors | 0x1e200 | 0x1400 | | 65 | Traded Pokémon | 0x23a00 | 0x80 |
| 42 | Musical | 0x1f700 | 0x2a4 | | 66 | Misc | 0x23b00 | 0xfc |
| 43 | Reshiram/Zekrom | 0x1fa00 | 0xe0 | | 67 | Join Avenue | 0x23c00 | 0x16a8 |
| 44 | Trainer log | 0x1fb00 | 0x34c | | 68 | Medal Box | 0x25300 | 0x498 |
| 45 | Event work | 0x1ff00 | 0x4e0 | | 69 | Key data | 0x25800 | 0x60 |
| 46 | World Trade | 0x20400 | 0xf8 | | 70-72 | Funfest, Pokéwood, Dream Radar | 0x25900, 0x25a00, 0x25e00 | 0xfc, 0x3e4, 0xf0 |

The blocks end at 0x25f00, the CRC table is at 0x25f00-0x25f94 and the footer at 0x25f94-0x25fa4; the footer's
`size` field is 0x25fa4. The backup copy is the same at +0x26000.

### 2.3 Slack

- **After the footer:** 0x26000 - 0x25fa4 = **0x5c bytes** (92). A new block needs at least 0x100 plus its CRC, so
  none fits.
- **Inside blocks:** the pages' padding totals 4,948 bytes, but it is spread over 73 blocks and belongs to them: the
  bytes after a block's footer are never written (`SaveData_WriteBlock` writes `size + sizeof(BlockFooter)`) nor read.
  The Pokédex block itself has 0x20 (0x4e0 to 0x500).
- **Growing the main save** isn't possible in place: the backup starts at 0x26000 and the extras at 0x4c000.

### 2.4 Loading, and what a failed CRC does

`SaveData_LoadWithBackup` (`src/gfl/backup_system.c`) reads both copies whole, then:

- **The footer:** a copy whose `size` isn't the save's computed size or whose `magic` differs is "none" (2); one
  whose CRC table's CRC is wrong is "broken" (1). If neither copy's footer is right, the load returns
  `SAVE_LOAD_RESULT_NONE` (both 2) or `SAVE_LOAD_RESULT_BROKEN`.
- **The blocks:** with the newer copy's CRC table first (the higher footer count), each block is taken from whichever
  copy holds it with a footer CRC equal to the table's and data that hash to it; the copy that is wrong is marked to
  be rewritten. A block that neither copy has right ends that table's pass; then the other copy's table is tried.
  If both passes fail, the whole save is `SAVE_LOAD_RESULT_BROKEN`.
- **What a result means** (`SaveControl_Create`, `src/system/save_control.c`): `BROKEN` sets
  `SAVE_CONTROL_ERROR_BROKEN` and reinitializes every block, as `NONE` does. There is no per-block failure: **one
  block bad in both copies loses the whole save**. `SaveData_LoadWithBackup` never returns
  `SAVE_LOAD_RESULT_OK_PARTIAL`; a block bad in one copy is silently repaired by the next save.

So:
- **A block's size must never change for an existing save.** Its CRC is over the new size and its footer is read at
  the new end, so the block fails in both copies and the save is lost; a change of the total size makes the footer's
  `size` differ, so the save reads as "none" and the title screen offers only a new game.
- **What a block holds can change freely**, as long as the game writes it through the normal save: its CRC follows.

### 2.5 Saving

`SaveData_SaveStepSingle` compares each block with the main copy on the card (`SaveData_CompareBlock`, 0x800 bytes a
frame) and writes only those that differ, then the CRC table, then the footer, its last byte last
(`SaveData_WriteFooterLastByte`, which makes the copy valid); then it swaps the statuses and does the same pass for
the other copy. The load leaves the CRC table and footer to be written first to the copy it didn't take them from
(`copies[copyIndex ^ 1]`), so a power cut between the passes leaves one copy with a valid footer whose table matches
the blocks the load can find across both copies. Each write is `CARD_WriteAndVerifyBackupAsync` (`startWriteFlash`),
read back and compared by the SDK.

A change made in RAM to any block's data is therefore written by the next save, to both copies, with its CRC, with
no new code.

## 3. Space after the wireless removal

The hack removes wireless feature by feature (`docs/paperwhite2/plugins.md`, C-Gear: `GSYS_CanBootGameComm` is always
FALSE; the name filter and Join Avenue are local). The blocks that only wireless features use:

| Block | Size | Used by (every `SaveControl_GetBlockPtr`/getter caller) | In the user's save | Fit |
| --- | --- | --- | --- | --- |
| **Pal Pad** (0x1f) | **0xd54** (3412) | `getPalPadFriendListAddress` (`wifilist.c:391`), called by link trades (`pokemontrade_save.c:293, 455, 515`), the GTS (`worldtrade_upload.c:1092`), GTS negotiation (`gtsnego_proc.c`) and Wi-Fi battles (`wifibattlematch_link_*.c`); nothing local | all zeros (written once at init, footer count 1) | **the recommended home** |
| Wi-Fi list (0x1e) | 0x7c4 (1988) | about 30 files through `GameData_GetWifiList`, including the hack's C-Gear (`c_gear_sw.c`), `infowin.c` and the Centers' scripts (`scrcmd_pokemon_center.c`) | 19 non-zero bytes (the DWC profile) | second block, if one is needed (section 10) |
| Mystery Gift (0x22) | 0xa94 (2708) | `mystery_data.c:302` and the gifts outside the save (`save_outside.c:234`, which merges into it on load) | encrypted, 2692 non-zero bytes | no: still merged on load, and a local gift system may want it |
| Unity Tower survey (0x1d) | 0x1338 (4920) | 12 files, local ones among them (`townmap_util.c`, `ev_time.c`, `scrcmd_unity_tower.c`, `unity_visitor.c`, `scrcmd_leaves.c`) | 1 non-zero byte | no: local readers |
| Subway Wi-Fi (0x3a) | 0xb90 (2960) | the Battle Subway's scripts (`scrcmd_bsubway.c`, `bsubway_scr.c`, `event_bsubway.c`) | zeros | no: the local Subway touches it |
| Dream World (0x23) | 0x1ac | Game Sync, `startmenu.c`, `scrcmd_musical.c`, `event_phrase_input.c` | 13 non-zero bytes | too small, local readers |
| World Trade (0x2e) | 0xf8 | `worldtrade_data.c` | zeros | too small |
| Survey (0x3d) | 0x284 | the survey radar, `ev_time.c`, `game_beacon.c`, `resonance_resort_data.c` | 4 non-zero bytes | too small |

The extras that only wireless features write (downloaded videos, skins, musical, tournaments: about 190 KB together)
and the two unreferenced gaps at the flash's end (about 5 KB) have room, but an extra save is saved only by
`SaveControl_StartExtraSave` and `SaveData_DualSaveStep`, with the main save's count linking them
(`TrainerDataSave_GetExtraSaveCount`), and all but the Hall of Fame have one copy. Using one would mean hooking every
save of the main save into a dual save, keeping the extra loaded all game, and a power cut during its single copy
would lose the Pokédex (the count no longer matches). A main block gets all of that for nothing.

**Would the save code clobber the Pal Pad block?**
- **New game:** `initSaveBlkCallbacks` calls the block's init, `PalPadFriendList_Init`; under `PAPERWHITE2` the
  table entry's init becomes the Pokédex's (section 7).
- **Erasing:** `SaveControl_Erase` and `delete_save.c` erase whole saves only.
- **Trades:** `pokemontrade_save.c` copies the block before a trade and copies it back if it fails
  (`func_ov194_021befdc` and `:300`), which would restore the Pokédex from before the trade; harmless, and it goes once
  the Pal Pad is redirected.
- **The remaining wireless callers** would write friend records over the Pokédex. Under `PAPERWHITE2`,
  `getPalPadFriendListAddress` returns a RAM-only `PalPadFriendList` (0xd54 bytes, zeroed and initialized when the
  save control is made), so whatever wireless code is left works on scratch memory until the final wireless pass
  removes it.

## 4. Sizes for 1500 species

With the current list structure and the species' bit at `species - 1`:

| Part | Original | 1500 species (capacity 1504) |
| --- | --- | --- |
| One species list | 0x54 (672 bits) | 0xbc (188 bytes, 1504 bits) |
| `caught`, `seen` ×4, `shown` ×4 (9 lists) | 756 | 1692 |
| Form lists: `seenForms` ×2, `shownForms` ×2 | 4 × 0xb (88 bits) | 4 × 0x80 (1024 bits): 512 |
| Form directory (new, section 5) | none | 128 × `u16`: 256 |
| Languages, 7 bits a species | 0x1b0, species 1-493 | 1-649: 0x238 (568); 1-1500: 1313, 1316 rounded to 4 |
| Header (magic, flags, last species, Spinda) | 12 | 32 (room for a version and the directory's count) |

- **Everything for 1500, original structure:** 32 + 1692 + 512 + 256 + 1316 = **3808 bytes**: more than the Pal Pad
  block's 3412.
- **Recommended, languages for 1-649:** 32 + 1692 + 512 + 256 + 568 = **3060 bytes**, 352 bytes free in the block.

**Languages.** A species' languages say which languages' Pokédex entries the Info page offers (`PokeDex_HasLanguage`,
`PokedexInfoPage_HasLanguage` in `paperwhite2_pokedex_info.c:1536`). The US ROM has foreign entries up to Arceus, and
for Black and White's species only Japanese ones (`res/pokemon/*/data.json`'s `pokedex.languages`: Genesect's is
`["ja"]`), which the hack now names to Genesect. The Wonder Trade's foreign Pokémon set the bit for any species they
are. A new species past 649 has no foreign entry unless the user writes one, so a bit for it would only record a fact
the Pokédex can't show. 649 is the natural cap; all 1500 are possible at a cost (section 10).

**Spinda** keeps one `u32` (the first Spinda seen); nothing else is per-species and per-Pokémon.

**Alignment.** The block's size must be exactly 0xd54 (`getSize` rounded to 4), so the struct ends with a reserve
that fills it, and a `STATIC_ASSERT(sizeof(PokeDexSave) == 0xd54)`. All lists are 4-byte multiples, so every field
stays 4-aligned (the block starts 0x100-aligned in the heap's save buffer).

## 5. Forms: a generated list and a directory in the save

**Today** the form bits are at cumulative offsets of `pokemonFormList` (`pokedex_savedata.c:71`): 21 species, then
the hack's `{ SPECIES_PICHU, 2 }`, 85 bits of 88. An entry inserted anywhere but the end moves every later species'
bits, so the list can only grow at its end and only by hand.

**The generated list.** `tools/paperwhite2/pokemon_forms.py`, which already writes `paperwhite2/pokemon_forms_config.h`
for the hack build, also writes `POKEDEX_FORM_LIST` (`{ SPECIES_X, count },` for every species whose `forms.count` is
more than 1, in species order) and `POKEDEX_SPECIES_MAX` (the last Pokédex species, `national_species()`, 649 today).
`res/pokemon` lists 24 species with forms, 107 forms; the original list leaves out **Arceus (17) and Genesect (5)**, so
the Pokédex never lists their forms. A new `forms.pokedex: false` in `species.schema.json`, set on those two, keeps
that (or the user lists them, section 10). Without them: 22 species, 85 bits, as now. The generator stops if the
total passes 1024 bits or 128 species, or a species' count passes 32 (the box data's form field is 5 bits).

**The directory in the save** records the layout the save's bits were written in: `u16` entries, the species in bits
0-10 and the count minus 1 in bits 11-15, in bit order, with their number in the header. When the ROM's
`POKEDEX_FORM_LIST` differs, the game remaps on load (section 6), so a form may be added to any species, in any
order, and only the ROM's list changes. Once synced the save's directory equals the ROM's, so the Pokédex's functions
read only the ROM's constant list, as they read `pokemonFormList` today.

**The remap**, for each of the four form lists (normal and shiny seen, normal and shiny shown):

1. Every species in both lists: its bits for forms below both counts move from the old base to the new.
2. A species new to the list: the Pokédex only knew its form 0, so form 0 is marked seen in the normal list if
   `seen` has it in a normal kind, in the shiny list if in a shiny kind, and shown in the list of its shown kind.
   (Arceus and Genesect, if listed, start with form 0 only, whatever form was seen.)
3. A species whose count shrank drops its bits past the new count, and a species gone from the list drops all.
4. A seen species with forms that ends up with no shown form bit gets form 0, in its shown kind's list, so that
   `PokeDex_GetShownSexRareForm` always finds one.

## 6. The game upgrades the save itself

`PaperWhite2_PokedexSave_Sync(SaveControl *)` (a new `src/paperwhite2/main/paperwhite2_pokedex_save.c`):

1. The area's magic isn't `POKEDEX_SAVE_MAGIC` ("PW2D", 0x44325750): an old save. If the original block's magic is
   `POKEDEX_MAGIC` (0xbeefcafe), the area is built from it:
   - the header's `nationalObtained`, `habitatListEnabled`, `given`, `mode`, `lastSpecies` and `spindaPersonality`;
   - each of the nine species lists: the original's 0x54 bytes to the start of the new 0xbc (same bit for the same
     species);
   - the languages' 0x1b0 bytes to the start of the new 0x238 (same index, `(species - 1) * 7 + language`);
   - the form bits, remapped (section 5) from the build's old list, kept as a constant (`sPokedexVanillaFormList`:
     the original 21 and the Pichu).
   Otherwise (no Pokédex magic either) it initializes the area as a new game does.
2. The magic is right: the directory is compared with `POKEDEX_FORM_LIST` and remapped when it differs.

It runs in `SaveControl_Create` after a load returns `SAVE_LOAD_RESULT_OK` or `OK_PARTIAL`, and in
`SaveControl_Reload` after the same, which Continue calls before the field starts (`Continue_Exit`,
`src/ov162/game_start.c:430`). The title screen's counts (`countSeenDexPokes` in `startmenu.c`) are read after
`SaveControl_Create`, so they see the upgraded area. A new game's `initSaveBlkCallbacks` runs the area's own init:
magic, version, the ROM's directory, `given`.

**Why the game, and not a converter:**
- **Nothing reaches the card until the player saves.** The sync changes only the save in RAM; quitting without
  saving leaves the card as it was, and the next boot does the same again. The normal save then writes the block with
  its CRC to both copies.
- **It can't be forgotten** and needs no PC: a save on a flashcart, TWiLight Menu++ or a DSi upgrades on its first
  boot. A converter alone would still need the game to tell an upgraded save from an old one (the Pal Pad's zeros
  aren't a Pokédex), so the game needs the check anyway.
- **One code path for every later change of forms.** Without the directory every "Add form" would need the
  converter run on every save.
- **The cost:** about 1 KB of code and 88 bytes of table in ARM9 main, against the 220 KB budget
  (`plugins.md`, Memory); and the upgrade must be right before any player's save meets it (section 9).
- **What it gives up:** the original block is no longer updated, so a build from before the change (or PKHeX) shows
  the Pokédex as it was at the upgrade. A save made with such a build and loaded again by a new one keeps the new
  area, and loses what was registered in between. Mirroring the area into the original block at each save would keep
  both right for species 1-649 (section 10).

**The offline tool** (`tools/paperwhite2/pokedex_save.py`, stdlib only, with the generator's list): `inspect SAV`
prints both copies' footers, the block table, and the Pokédex's counts from whichever layout is there; `upgrade SAV
OUT` does the game's upgrade and remap to a new file, rewriting the block's CRC in its footer, the CRC table and the
footer's CRC in both copies, block counts unchanged; `verify SAV` checks every CRC. It never writes the file it reads.
It is for the test plan and for the user's own checks. The editor's server can run it as it runs `new_map.py`
(`runTool`, `editor/server/main.ts:602`) if a Saves page is wanted later.

## 7. Every reader and writer of the Pokédex save

Every access but one goes through `pokedex_savedata.c`'s functions, so the change is contained in it:

- **The functions** (`src/system/pokedex_savedata.c`): `PokeDex_IsCaught`, `PokeDex_IsSeen`, `PokeDex_RegistPkm`,
  `addPkmToDex`, `addToDex`, `getNumberOfForms`, `PokeDex_GetShownSexRareForm`, `PokeDex_HasSeenVariant`,
  `PokeDex_HasLanguage`, `PokeDex_GetSpindaPersonality`, the counts (`PokeDex_GetSeenNo*`, `PokeDex_GetCaughtNo*`,
  `countSeenDexPokes`), completion (`PokeDex_IsCompleteNational`, `_IsCompleteUnova`, `_IsSeenAllUnova`), the
  professor's `PokeDex_GetEvaluationParams`, the flags (`PokeDex_*NationalObtained`, `_HabitatList*`, `_IsGiven`,
  `givePlayerPokedex`, `PokeDex_GetMode`/`SetMode`, `PokeDex_GetLastSpecies`/`SetLastSpecies`), and
  `PokeDex_PaperWhite2_FillAll` (the debug menu).
- **Their callers** (by grep of each name in `src/`):
  - Registering: battles (`btl_main.c`, `event_battle_return.c`), evolution (`evolution_demo.c`), eggs
    (`egg_demo.c`, `day_care.c`), trades (`fld_trade.c`, `pokemontrade_save.c`, `worldtrade_upload.c`,
    `cygnus_flow.c`, `mb_parent_sys.c`, `pdw_postman.c`), gifts and scripts (`scrcmd_pokemon.c`,
    `scrcmd_game_state.c`), form changes (`season_form.c`, `shaymin_form.c`, `burmy_form.c`), the box
    (`box2_main.c`), the PC's return (`event_pdc_return.c`), `plist_demo.c`, the Wonder Trade
    (`paperwhite2_wonder_trade.c`).
  - Reading: the Pokédex apps (ov298 `pokedex_detail_*.c`, ov299 `pokedex_list_*.c`, ov302 `pokedex.c`,
    `pokedex_common.c`, `pokedex_search_engine.c`, ov303 `pokedex_habitat.c`, ov304 `pokedex_area_list.c`), the
    hack's Info pages (`paperwhite2_pokedex_info*.c`), Habitat Dex and DexNav (`paperwhite2_habitat_dex.c`,
    `paperwhite2_dexnav_data.c`), the battle's gauge and type icons (`btlv_gauge.c`, `paperwhite2_type_icons.c`),
    the trainer card (`trcard_sys.c`), the report and start menu (`report.c`, `startmenu.c`), scripts
    (`scrcmd_leaves.c`, `scrcmd_fld_battle.c`, `scrcmd_pokemon_center.c`, `scrcmd_pokemon_misc.c`), the
    professor's call (`local_tvt_person_doctor.c`), Easy Chat (`pms_input_data.c`), the box search
    (`box_search.c`), Resonance Resort (`resonance_resort_data.c`), the manual (`manual_data.c`), and wireless ones
    (GTS, Union Room, battle recorder search, PWT downloads, Wi-Fi battles).
  - The battle keeps a pointer only (`BattleSetup.pokedex`, `btl_setup.c:243, 446`).
- **The one raw copy:** link trades copy the whole block before a trade and back after a failure
  (`func_ov194_021bef7c`, `PoketradeSave_RestorePokedex`, `pokemontrade_save.c:280-290`), by
  `getSizeofPokedexData()` from `GameData_GetPokedex`. With both pointing at the hack's area and its size, it still
  works.
- **No other code** reads a `PokeDexSave` field, `POKEDEX_SPECIES_BYTES` or the block by offset (grep of the fields
  and constants outside the file), and every one of the 1,792 source files is marked complete in
  `config/w2_us/**/delinks.txt`, so no assembly does either.

**The redirect** (all `#ifdef PAPERWHITE2`):
- `include/save/pokedex_savedata.h`: the new `struct PokeDexSave` (section 8) and the original's layout as
  `PokeDexVanillaSave`, for the upgrade.
- `getPokedexSaveAddress` returns `SAVE_BLOCK_PAL_PAD`'s pointer (as `SAVE_BLOCK_PAPERWHITE2_POKEDEX`), so
  `GameData_GetPokedex` and every caller get the area.
- `src/system/save_table.c`: the `SAVE_BLOCK_POKEDEX` entry takes `PokeDexVanillaSave_GetSize` (0x4dc) and
  `PokeDexVanillaSave_Init` (the original `initPokedex`); the `SAVE_BLOCK_PAL_PAD` entry takes `getSizeofPokedexData`
  (0xd54) and `initPokedex`. No block's size changes.
- `pokedex_savedata.c`: the constants grow (`POKEDEX_SPECIES_BYTES` 0xbc, `POKEDEX_FORM_BYTES` 0x80, the languages'
  `POKEDEX_LANGUAGE_SPECIES_MAX` 649); `pokemonFormList` is `POKEDEX_FORM_LIST`; `lastSpecies` is a `u16`
  (`PokeDex_SetLastSpecies` stored 10 bits, at most 1023); `PML_PkmIsBadMonsNo` and every `i <= SPECIES_GENESECT`
  loop use `POKEDEX_SPECIES_MAX`.
- `getPalPadFriendListAddress` returns the RAM-only list (section 3).
- `src/system/save_control.c`: the sync after both loads.

The hard-coded completion numbers stay until new species exist: `NATIONAL_DEX_COMPLETE` 636 (649 less the 13
mythicals), `NATIONAL_DEX_COMPLETION_EXCLUSIONS`, the evaluation tables. Those, and the bounds outside the save
(`POKEDEX_LIST_SPECIES_COUNT`, `NATIONAL_COUNT`, the scripts' `SPECIES_EGG - 1`), belong to the new-species project
(`forms-and-species.md` §6.1).

**For the later species renumbering**, the save side needs only this: the Pokédex's bit is `species - 1` up to 1504,
so species 650-684 are ordinary bits once they are real species, and the egg and Pokéstar IDs should move to 1505 or
above, outside the Pokédex, or `POKEDEX_SPECIES_MAX`'s check must keep excluding them. Elsewhere in the save:
- **Eggs store their real species** (`PKM_PARAM_SPECIES` returns `blockA->species`; `SPECIES_EGG` only for a bad egg,
  and `PKM_PARAM_LEGAL_SPECIES` derives it, `poke_tool.c:1528-1545`), so moving `SPECIES_EGG` changes no box data.
  (`forms-and-species.md` §6.2 says eggs store 650; they don't.)
- **Bit widths in the save:** Join Avenue keeps species in **10 bits** (`include/save/join_avenue.h:154`, at most
  1023), Entree Forest in 11 (`entree_forest.h:19`); the Pokéwood films, battle videos and Hall of Fame keep species
  too and need checking then.

## 8. The layout

`struct PokeDexSave` under `PAPERWHITE2`, the whole Pal Pad block (0xd54 bytes, at 0x1b200 and 0x41200 on the card):

| Offset | Size | Field |
| --- | --- | --- |
| 0x000 | 4 | `magic`: `POKEDEX_SAVE_MAGIC` 0x44325750 ("PW2D") |
| 0x004 | 2 | `version`: 1 |
| 0x006 | 2 | `formEntryCount`: the directory's entries in use |
| 0x008 | 4 | `nationalObtained : 1`, `habitatListEnabled : 1`, `given : 8`, `mode : 2`, 20 bits free |
| 0x00c | 2 | `lastSpecies` |
| 0x00e | 2 | free |
| 0x010 | 4 | `spindaPersonality` |
| 0x014 | 12 | free |
| 0x020 | 0xbc | `caught` (species 1-1504) |
| 0x0dc | 4 × 0xbc | `seen`: male, female, shiny male, shiny female (`POKEDEX_KIND_*`) |
| 0x3cc | 4 × 0xbc | `shown`, the same four |
| 0x6bc | 2 × 0x80 | `seenForms`: normal, then shiny (1024 bits each) |
| 0x7bc | 2 × 0x80 | `shownForms`: normal, then shiny |
| 0x8bc | 128 × 2 | `formEntries`: species (bits 0-10), count - 1 (bits 11-15) |
| 0x9bc | 0x238 | `languages`: 7 bits a species, species 1-649 |
| 0xbf4 | 0x160 | free (352 bytes), zero |
| 0xd54 | | end; the block's footer follows (the save's own) |

## 9. Risks and the test plan

**Risks:**
- **A wrong size loses the save** (section 2.4): the static assert, and the tool's `verify` on a save written by the
  new build.
- **An upgrade bug** shows a wrong Pokédex; it reaches the card only when the player saves. Test before the user's
  real save meets it, and keep the user's backup of the `.sav`.
- **A false magic:** an old Pal Pad block that begins with "PW2D" by chance. The user's is zeros; a save that ever
  had a Pal Pad friend holds a `PlayerInfo` there, whose first bytes are a UTF-16 name (`player_info.h:13`): the
  magic would need the characters U+5750 and U+4432 in a row, so a second check (the version and a directory count
  of at most 128) makes a false match practically impossible.
- **Wireless code writing the Pal Pad:** gone with the RAM-only list.
- **Tools that read the original block** (PKHeX) see the Pokédex as at the upgrade; see the mirror option.
- **The remap** must keep exactly one shown form for each seen species with forms (section 5, step 4).

**Headless, py-desmume** (the `forms/` harness in the scratchpad: a worktree build, `E.backup.import_file` of a copy
of the save, symbols from `build/w2_us/arm9.o.xMAP`). The area in RAM is `SaveControlWork->sv->data + 0x1b200`
(`SaveControl.sv` at +0x10, `SaveData.data` at +0x34, from the structs in `save_control.h` and `backup_system.c`,
computed, to be checked once):

1. **Before:** `pokedex_save.py inspect` of the copy: 61 seen, 14 caught (the highest 647), seen forms bits 75 and
   76 and shown 75 (Keldeo's), 9 language bits (all English), mode 2, last species 498, Pal Pad all zeros.
2. **Boot and Continue:** read the area: magic, the same counts, Keldeo's bits at their new base, the directory equal
   to the ROM's; the title screen's and the Pokédex's counts as before; the Info page's languages and forms for a few
   species.
3. **Without saving**, export the backup: byte for byte the imported file.
4. **Save** from the field menu, export, `verify`: every CRC right in both copies, only the Pal Pad block (and the
   blocks the session changed anyway) different, the original block unchanged; `inspect` reads the same counts from
   the area.
5. **Reload** that save: no upgrade (magic present, directory equal), same counts.
6. **Remap:** a test build with a form added to a species before Keldeo (Bulbasaur, say) and one removed: Keldeo's bits
   move, Bulbasaur's form 0 is seeded if seen, the removed one's go.
7. **One copy damaged:** flip a byte of the main copy's Pal Pad block; it loads from the backup and the next save
   repairs it. Both copies damaged: the save is lost, as for any block (the vanilla behaviour, for the record).
8. **New game:** the area initialized, `given` set, the original block initialized as before.
9. **Offline parity:** `pokedex_save.py upgrade` of the copy, compared with the game's saved area byte for byte.
10. **Trade restore:** if a link trade can still be reached, its failure path restores the area (or record that it
    can't be reached).

**Hardware:** the build's ROM through `tools/build/verify_dsi_rom.py`, then on a flashcart in DS mode and on
TWiLight Menu++ in DSi mode: Continue the user's (copied) save, compare the Pokédex, save, power off, Continue again.
The area is in the main save's own blocks, so nothing is written where the original game doesn't write: nds-bootstrap's
and flashcarts' 512 KB `.sav` and melonDS's raw `.sav` need nothing new.

## 10. Recommended design and open decisions

**Recommended:** section 8's layout in the Pal Pad block, the game syncing it on load, the generated form list with
`forms.pokedex: false` on Arceus and Genesect, the original block left as the upgrade's source, the offline tool for
the tests.

**Build steps:**
1. `res/pokemon/species.schema.json`: `forms.pokedex` (default true); false on `arceus` and `genesect`.
2. `tools/paperwhite2/pokemon_forms.py`: `POKEDEX_FORM_LIST` and `POKEDEX_SPECIES_MAX` in
   `paperwhite2/pokemon_forms_config.h`, with the capacity checks.
3. `include/save/pokedex_savedata.h`: the new struct, `PokeDexVanillaSave`, the constants, the static assert.
4. `src/system/pokedex_savedata.c`: the constants, the generated list, `u16 lastSpecies`, `POKEDEX_SPECIES_MAX` in the
   bounds and loops, `getPokedexSaveAddress` on the Pal Pad block, `PokeDexVanillaSave_GetSize`/`_Init`; the debug
   menu's fill over the new bounds.
5. `src/paperwhite2/main/paperwhite2_pokedex_save.c`: the sync (upgrade and remap) and `sPokedexVanillaFormList`.
6. `src/system/save_table.c`, `src/system/save_control.c` (both loads), `src/system/wifilist.c` (the RAM-only Pal Pad).
7. `tools/paperwhite2/pokedex_save.py`: `inspect`, `upgrade`, `verify`, with fixtures.
8. `python3 configure.py w2_us --hack && ninja`, `verify_dsi_rom.py`, the test plan; a plain `configure.py w2_us`
   build still matches (everything is under `PAPERWHITE2`).
9. `plugins.md`'s section, and `forms-and-species.md` §4 and §11.5 step 5 (the editor's Add form then needs no C).

**Open decisions for the user:**
1. **Languages for species 1-649 or 1-1500.** For all 1500 either:
   - **B, one block, tighter shown lists:** the four `shown` lists become a 2-bit kind per species (376 bytes), and
     the shown form a byte per directory entry (128): 32 + 188 + 752 + 376 + 256 + 128 + 256 + 1316 = 3304 bytes,
     108 free. Shown is set exactly when seen (`addToDex` runs before the first sighting's bits), so nothing is lost,
     but `addToDex` and `PokeDex_GetShownSexRareForm` are rewritten rather than resized.
   - **C, a second block:** languages for 1-1500 (1316 bytes) in the Wi-Fi list block (1988), which then needs a
     RAM-only copy for its 30-odd callers, the hack's C-Gear among them.
2. **Arceus's and Genesect's forms in the Pokédex** (`forms.pokedex`): the original leaves them out.
3. **Mirror the area into the original block at each save** (species 1-649), so PKHeX and older builds read a right
   Pokédex: a small function before each save (inferred: a few hundred bytes), at the cost of a second copy to keep right.
4. **Form capacity:** 1024 bits per list and 128 species, against 85 bits and 22 species today; less frees room for
   languages (each 64 bits per list and 32 species is 96 bytes).
5. **The Pal Pad block** rather than another (section 3).

## 11. Built (2026-11-12)

**The user's decisions** on section 10: languages for species 1-649 only; Arceus's and Genesect's forms stay out of
the Pokédex (`forms.pokedex: false`); **mirror the area into the original block at each save**; 1024 form bits a list
and 128 directory entries; the game upgrades the save itself, in the Pal Pad block, with a Pal Pad in memory for the
remaining wireless callers.

### 11.1 What was built

| Part | Where |
| --- | --- |
| The layout of section 8, `PokeDexVanillaSave` (the original block's), the constants and the directory's entry macros (`POKEDEX_FORM_ENTRY`) | `include/save/pokedex_savedata.h`, `#ifdef PAPERWHITE2` |
| The upgrade, the remap, the mirror, the original block's own init and size, the RAM-only Pal Pad, the size checks | `src/paperwhite2/main/paperwhite2_pokedex_save.c`, `include/paperwhite2/pokedex_save.h` |
| `getPokedexSaveAddress` on the Pal Pad block (`SAVE_BLOCK_PAPERWHITE2_POKEDEX`); `initPokedex` writes the magic, version 1, the ROM's directory and `given`; `pokemonFormList` is `POKEDEX_FORM_LIST`; `PML_PkmIsBadMonsNo` and the national loops (the counts, the fill) use `POKEDEX_LAST_SPECIES` (the generated `POKEDEX_SPECIES_MAX`); `PokeDex_PaperWhite2_GetFormList` | `src/system/pokedex_savedata.c` |
| The Pal Pad entry takes `getSizeofPokedexData`/`initPokedex` (0xd54, the size it had); the Pokédex entry `PaperWhite2_PokedexVanillaSave_GetSize`/`_Init` (0x4dc) | `src/system/save_table.c` |
| The sync after a load in `SaveControl_Create` and `SaveControl_Reload`; the mirror in `SaveControl_StartSave` and `SaveControl_StartExtraSave` (the only two starts of a main save) | `src/system/save_control.c` |
| `getPalPadFriendListAddress` returns the RAM-only list | `src/system/wifilist.c` |
| Easy Chat's Pokédex took the original block by ID (missed in section 7); it takes `getPokedexSaveAddress` | `src/system/pmsi_param.c` |
| `POKEDEX_FORM_LIST`, `POKEDEX_FORM_ENTRY_COUNT`, `POKEDEX_SPECIES_MAX`, with the capacity checks (128 species, 1024 forms, 32 a species, 1504 species) | `tools/paperwhite2/pokemon_forms.py` (`pokedex_form_list`) |
| `forms.pokedex` (boolean, absent is true); false on `arceus` and `genesect` | `res/pokemon/species.schema.json` and the two `data.json` |
| `inspect`, `verify`, `upgrade`, standard library only, the same algorithm as the C | `tools/paperwhite2/pokedex_save.py` |

The trade's copy of the Pokédex (`pokemontrade_save.c`) needed no change: it copies `getSizeofPokedexData()` bytes
from `GameData_GetPokedex`, both the area's now, and the Pal Pad copy beside it copies the RAM-only list.

**The generated directory** is in species order: Pichu (2), Unown (28), Castform, Deoxys, Burmy, Wormadam, Cherrim,
Shellos, Gastrodon, Rotom, Giratina, Shaymin, Basculin, Darmanitan, Deerling, Sawsbuck, Tornadus, Thundurus, Landorus,
Kyurem, Keldeo, Meloetta: 22 species, 85 forms. The original block keeps the old order (the original 21, then the
Pichu), `sPokedexVanillaFormList`, and every save's upgrade and mirror go through the remap between the two.

**The remap** (`PokedexSave_RemapForms`, one function for the upgrade, a directory change and the mirror) is section
5's four steps, with step 2's shown form folded into step 4: a species new to the directory gets form 0 seen in the
normal and/or shiny list by its seen kinds, and any seen species without a shown form bit gets form 0 in the list of
its shown kind. **The mirror** writes the header (`lastSpecies` only up to 649, else 0), the first 0x54 bytes of each
species list with the bits past Genesect cleared, the first 0x1b0 bytes of the languages with the bits past species
493 cleared, and the form bits remapped to the old list; `unused4_22` is left as it was. A species in the old list but
gone from the ROM's (none today) would be seeded as form 0.

**Cost:** ARM9 main grows about 2.2 KB of code and data and 3.4 KB of `.bss` (the RAM-only Pal Pad): the DS arena's
headroom went from 76 KB to 70 KB. Heap 7, which holds the save control, has no room for the Pal Pad (0x27000 for the
0x26000 save buffer), hence the `.bss`.

**Not changed** (as section 7 says, for the new-species project): `NATIONAL_DEX_COMPLETE` 636, the completion
exclusions, the evaluation tables, the Unova-native loops (`SPECIES_VICTINI` to `SPECIES_GENESECT`), and the bounds
outside the save (`POKEDEX_LIST_SPECIES_COUNT`, `NATIONAL_COUNT`, the scripts' `SPECIES_EGG - 1`, and every
`i <= SPECIES_GENESECT` loop outside `pokedex_savedata.c`).

### 11.2 Tested (py-desmume, copies of the user's save)

| Test | Result |
| --- | --- |
| `pokedex_save.py inspect` of the user's copy | original block: seen 61, caught 14 (highest 647), seen by kind 47/34/1/0, shown 36/25/0/0, Keldeo's forms at bits 75 (seen, shown) and 76 (seen), 9 language bits, mode 2, last species 498; Pal Pad all zeros |
| Boot, title, Continue | the sync ran twice, each with the area's magic 0 at entry (once after `SaveControl_Create`, once after `SaveControl_Reload`, which read the card again); the Continue screen says Pokédex 61; the area in memory is **byte for byte** `pokedex_save.py upgrade`'s; Keldeo's bits at 81 and 82 (the new directory's) |
| Pokédex screens against the build before the change (same save) | the national list (SEEN 61, OBTAINED 14, on Tepig) and Keldeo's Info page with its Resolute Form pixel-identical |
| Quit without saving | the card byte for byte the imported file |
| Save from the field menu | `verify`: every CRC right in both copies, footer count 154 to 155; the area on the card equals the tool's upgrade; **the original block unchanged** (the mirror of a fresh upgrade is the original); other blocks changed as any save changes them |
| Reload that save | magic at entry, no remap; the area in memory equals the card's; quitting leaves the card as it was |
| A save with the Spiky-eared Pichu (Pichu seen, form 1 seen and shown at old bit 84, form 0 seen shiny at old bit 83), Unown D and ? and a French Pichu entry, made with the tool | game and tool agree byte for byte: the Pichu's bits at 0 and 1, Unown's at 5 and 29; the Info page has Form and Shiny |
| Fill Pokédex (debug menu), then save | 649 seen and caught, 85 form bits each way, 4543 language bits (all 649) in the area; the original block 3451 (to 493), and `inspect` finds it exactly the area's mirror in both copies |
| Remap: a test build with a 2-form Bulbasaur first, a 4th Burmy form and no Shaymin, on the filled save | game and tool byte for byte: Bulbasaur's form 0 seeded seen, seen shiny and shown, Burmy's 4th form empty, Shaymin's two bits gone, the other 83 forms moved with their bits unchanged, species lists and languages untouched; on the user's save Keldeo moved from 81/82 to 82/83 and its Info page and Resolute Form stayed pixel-identical. Reverted |
| New game on an empty card | the intro's first save (no sync: nothing to load) mirrored; `inspect`: the area with its magic, version 1, the ROM's directory and `given` 1, the original block initialized as before, both copies valid |

Not tested live: a wild battle or a catch on the new build (the Fill Pokédex writes the area through the same
functions, `addToDex`, `PokeDex_SetSeenSex`, `getForm`, the language and caught bits); a link trade (the wireless
features are off); one copy damaged (the original save code, unchanged). The screenshots are in the session's
scratchpad (`savex/shots/`).

### 11.3 Open

- **A build before this one** reading a mirrored save shows the right Pokédex; if it then saves, the new build keeps
  its area and loses what was registered in between, as section 6 says. If an old build's link trade wrote a friend
  over the block, the area's magic is gone and the new build upgrades again from the original block, which the old
  build kept current.
- **A form removed and added back** loses the bits past form 0 (the remap drops a species gone from the directory),
  and a species that leaves the directory and comes back starts from form 0.
- **Ninja and generated headers (found here, not fixed):** the compilers' depfiles name a generated header by its
  absolute path (`ninja -t deps build/w2_us/src/system/pokedex_savedata.o`) and its rule by a relative one, so ninja
  sees two files. Reproduced: after a change to `pokemon_forms_config.h`'s text, the first `ninja` regenerated it and
  compiled nothing, the second compiled `pokedex_savedata.c` and `paperwhite2_pokemon_forms.c`. Inferred, not
  checked: the other generated headers behave the same. The save stays consistent (it records whatever directory the ROM was built with), but a first
  build after "Add form" can have the old `POKEDEX_FORM_LIST`: run `ninja` again until the build is fixed.
- The trade's backup copy of the Pokédex grew from 0x4dc to 0xd54 bytes of its heap.
