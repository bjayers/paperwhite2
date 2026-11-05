# Paper White 2's own code

The hack's features that were PMC code-injection DLLs (fixed-address hooks) become ordinary C in this source,
compiled with the game's compiler and flags into the module that uses them. Only the hack's build compiles it:
`python3 configure.py w2_us --hack && ninja`. A plain `configure.py w2_us` writes the same `build.ninja` as before
this existed, and its code still passes `ninja build/w2_us/stamps/modules.ok`.

## Where things go

| What | Where |
| --- | --- |
| Code that one overlay uses | `src/paperwhite2/ovNNN/`, linked into overlay NNN (the field is `ov036`) |
| Code that several modules use | `src/paperwhite2/main/`, linked into ARM9 main, which is always loaded |
| Headers | `include/paperwhite2/`, included as `"paperwhite2/name.h"` |
| Data files that the code loads | `res/paperwhite2/<feature>/` (the banner is `res/paperwhite2/banner/`) |

A C file in another directory under `src/paperwhite2/` stops `configure.py`. ITCM, DTCM and the autoloads take no new
code.

## Adding a file

1. Write `src/paperwhite2/ov036/<name>.c` with its header in `include/paperwhite2/`. The linker script names objects
   by their file name alone, so the name can't be one that the game already uses: start it with `paperwhite2_`, as in
   `paperwhite2_field.c`. Follow `docs/code-standards.md`, and write names in English.
2. Run `python3 configure.py w2_us --hack && ninja`. Nothing else is registered: no `delinks.txt` entry, no
   `add_source_file.py`. The build also reconfigures by itself when a file is added.

`configure.py` compiles every C file under `src/paperwhite2/` with the game's flags and `-d PAPERWHITE2`, and
`tools/build/plugin_lcf.py` adds it to dsd's linker script and object list: its `.text`, `.rodata`, `.data` and
`.bss` after the module's original objects in each section, and the object at the end of the module's objects (in its
`-overlay` group for an overlay). So nothing original moves within its module, and only what is placed after the
module moves, which relocations follow, as with `--shift`. The linker runs with `-nodead`, so nothing is dropped even
if nothing calls it. A file with other sections (C++ constructors, for one) stops the build.

## Hooking an original function

The hack's build defines `PAPERWHITE2` for every file it compiles, the game's, the libraries' and the scripts'. A hook
is an edit at the call site in the original C, under `#ifdef PAPERWHITE2` with the original in `#else`, and a
`// Paper White 2:` comment saying what changed and why. The header goes in the same way, after the file's includes.
The example, in `src/ov036/fieldmap.c`:

```c
#ifdef PAPERWHITE2
    // Paper White 2: the example of a call into the hack's code, which counts the frame as the original does
    field->framesSinceStart = PaperWhite2_NextFieldFrame(field->framesSinceStart);
#else
    field->framesSinceStart++;
#endif
```

`PaperWhite2_NextFieldFrame` (`src/paperwhite2/ov036/paperwhite2_field.c`) returns its argument plus one, so the
field behaves as before. Only a complete file (`complete` in `delinks.txt`) is linked from its C, so a hook goes in a
complete file; an incomplete one would have to be finished first. The original function grows by the hook, so the
code after it in its module moves, which is fine.

## The ARM7 BIOS

Any change to ARM9 main's bytes changes its first 0x4000 bytes, the secure area, since the build info there holds
main's compressed size, and a hook in an overlay usually changes main too, since main calls into the overlays. dsd
then needs the Blowfish key from a DS's ARM7 BIOS to compute the DSi header's values again. Put your own dump, 16 KB,
at `orig/bios7.bin` (ignored, never committed) and run `configure.py` again; the hack's build passes it to
`dsd rom build --arm7-bios`. Without it the build stops at `build/paperwhite2.nds` with dsd's message about the
secure area, after the link and the memory check.

## DS Protect

Hack builds never run DS Protect, the game's anti-piracy library (`lib/dsprot`: overlay 337, and a copy linked into
the party list's overlay 165). Loaders such as nds-bootstrap (TWiLight Menu++ on a 3DS) disarm it with patches at
the original game's addresses. Once the hack's code moves (any growth of ARM9 main moves every overlay, and
`--shift` moves everything), those patches miss, DS Protect sees the loader, and its responses break the game: a
`--shift 0x100` build went black on loading the save, the first map change, which runs it, while melonDS ran it.

Each site does under `PAPERWHITE2` what it does when DS Protect finds nothing: the checks then call the callback the
game put first in the pair (`DSProtCheckArgs.nop`, or overlay 165's `callback`) once, with the same arguments, and
return what it returns. So overlay 337 is never loaded and `DSProt_Init` and the checksum loops are gone, but the
callbacks still run:

| Site | What runs instead |
| --- | --- |
| `GameSystem_Init` (`src/system/game_system.c`), at boot | `GameSystem_DSProtNop1` (creates and deletes the trial house's heap) and `GameSystem_DSProtNop2`; `seed`, `flag` and `size` keep their values, so the badge loop doesn't run |
| `EventBattleCall_Callback` (`src/ov012/event_battle.c`), states 5 to 7 | `EventBattleCall_DSProtNop1` (two `GFL_RandomMT` calls) and `EventBattleCall_DSProtNop3`; `seed` stays a multiple of 0x1933 |
| `EventMapChangeCore_Callback` (`src/ov035/event_mapchange.c`), states 1 and 3 | `EventMapChange_DSProtNop` twice, which does nothing |
| `PokeListProc_Exit` (`src/ov165/pokelist.c`) | `PokeListProc_DeleteHeap`, which deletes the list's heap and returns `&result` (TRUE) |

Nothing outside `lib/dsprot` references `DSProt_Init` or `DSProt_CallRunChecks*` in a hack build. Overlay 337 is
still in the ROM, and overlay 165's copy still decrypts itself when that overlay loads, which checks nothing.

## Memory

`ninja` writes `build/w2_us/memory.txt` and stops if the program doesn't fit (`tools/build/check_memory.py`).

- On a DS the main arena starts at the end of the highest overlay in main memory, and the game takes heaps of a fixed
  size from it at boot (`HEAP_SETUP_NTR` in `src/system/gfl_use.c`, 0x1a9e00 bytes, plus about 8 KB of tables). In
  the original the arena starts at overlay 290's end, `0x021fd0c0`, and runs to `0x023e0000`, so about **220 KB**
  (`0x37140`) after the heaps is unused. That is the budget for all of the hack's code and data together.
- NitroSDK reads the arena's start from `OV290_BSS_END`, a linker symbol of the highest overlay in the original. Once
  another overlay grows past it, it would end inside the heaps, so the hack's build defines the SDK's
  `SDK_MAIN_ARENA_LO` (the end of the highest overlay, whichever it is) and `OS_GetInitArenaLo`
  (`lib/nitro/src/os/os_arena.c`) returns that under `PAPERWHITE2`.
- Every byte added to ARM9 main moves every overlay and the arena, so it costs the budget. An overlay costs it only
  once it, or an overlay placed after it, ends above the highest one: overlay 36 can grow **0x4d40 bytes (19 KB)**
  before that, then takes the budget. Overlays that are never loaded together are placed side by side, so their growth
  doesn't add up, only the highest counts.
- On a DSi the arena starts after the LTD module, at `0x02700000`, so there the overlays have about 5 MB.

So a large plugin goes in the overlay that runs it (the field's in `ov036`, a battle feature in the battle's
overlay), and only what every module needs goes in main. The Following Pokémon runtime fits in the field's overlay
plus the budget.

A new overlay isn't practical yet: dsd builds every module from one in the extracted ROM (its `config.yaml`, delinks
and the extract's `overlays.yaml`), the overlay digests in main's `.data` have room for the 344 original overlays
only, and a new overlay file would take a file ID before the game's files.

## Port order

1. MoveEffectiveness and TypeIcons (battle): done, see below.
2. ToggleableSeasons: done, see below (Seasons), with the Season app at the Centers' globe (Season app).
3. Following Pokémon (`bjayers/pokeweb-serverless`, `runtime/following-pokemon/`), with its data in
   `res/paperwhite2/following/`.

## Ported plugins

Both battle plugins came from `bjayers/pokeweb-serverless`, `runtime/battle-type-hud/` (bundle 0.4.24), White 2 only.
Their code runs in the battle view's overlay 168, so it is in `src/paperwhite2/ov168/`. Each plugin is one file and one
header, and each hook calls it where the plugin's DLL redirected a call (`THUMB_BRANCH_LINK`) or a function pointer in
a literal pool (`OFFSET`). The plugins' checks that they were in the game they were built for are gone: pointers
aren't checked against main RAM's DS and DSi bounds, and the game's functions and structs replace the addresses and
offsets. For that, `BtlvGauge` (with `BtlvGaugeEntry` and `BtlvGaugeMon`), `BtlvInput` and `PaletteFade` (with
`PaletteBuffer` and `FadeControl`) moved from their `.c` files into their headers, unchanged. Together the two cost
about 10 KB of the memory budget (overlay 168 is the highest overlay of the battle).

### Type Icons (angular wedges)

The "Solid" style, TypeIconsSolidW2 0.3.24-solid (`battle_type_hud.cpp` with `ICON_VARIANT_SOLID`, `hud_common.h`,
`assets-solid.h`), the DLL in the hack's ROM. It colors the light face at the left of each battler's name box with its
types, in single, double and triple battles, and shifts the header's text to make room.

- `src/paperwhite2/ov168/paperwhite2_type_icons.c`, `include/paperwhite2/battle_type_icons.h`. The wedges' masks, the
  types' colors and the name boxes' native pixels are tables in the C file, copied from `assets-solid.h`.
- Data: the installer's panel expansion (`panel_expansion.py`, `panel-expansion.json`) is in `res/graphics/btlv/`:
  `438.png` (the player's name box in single and double battles) has 8 more blank tiles (32x144 instead of 32x128),
  and `439.ncer` a third OAM piece (`0x40f4, 0x81bc, 0x20`). Packed, `a/0/1/1` members 438 and 439 equal the hack
  ROM's. The code checks for that piece and draws nothing on a box without it.

| Hook (White 2) | Where | What |
| --- | --- | --- |
| `0x021dfa6a`, `0x021dfa7c`, `0x021dfa8e` | `BtlvEffect_AddGauge` → `BtlvGauge_SetBattleMon` | `PaperWhite2_TypeIconsSetBattleMon`: takes the old wedge off, sets the mon, attaches to it |
| `0x021dfabe`, `0x021dfad0`, `0x021dfae2` | `BtlvEffect_AddGaugeByPkm` → `BtlvGauge_SetPartyPkm` | `PaperWhite2_TypeIconsSetPartyPkm`: takes the wedge off |
| `0x021df2b4` | `BtlvEffect_Main` → `BtlvGauge_Update` | `PaperWhite2_TypeIconsUpdate`: paints again what changed |
| `0x021f0070`, `0x021dfb00` (pointer) | `BtlvGauge_FreeResources`, `BtlvEffect_DelGauge` → `BtlvGauge_Hide` | `PaperWhite2_TypeIconsHide`: takes the wedge off |
| `0x021ef884` | `BtlvGauge_Delete` → `BtlvGauge_FreeResources` | `PaperWhite2_TypeIconsRelease` before it: takes every wedge off |
| `0x021efc78`, `0x021efe2a`, `0x021dfc00` (pointer) | `BtlvGauge_SetBattleMon`, `BtlvGauge_SetPartyPkm`, `BtlvEffect_SetGaugeStatus` → `BtlvGauge_SetStatus` | `PaperWhite2_TypeIconsSetStatus`: hides the wedge under a status, paints it after a cure |
| `0x021f0614`, `0x021f061c`, `0x021f062e`, `0x021f1602` | `BtlvGauge_Show` → `BtlvGauge_DrawName`, `DrawSex`, `DrawLevel`; `BtlvGauge_UpdateLevelUp` → `DrawLevel` | `PaperWhite2_TypeIconsBeforeText` and `AfterText` around each |

### Move Effectiveness Preview

MoveEffectivenessW2 0.4.1 (`move_effectiveness.cpp`, `move_colors.h`, `move_immunity.h`, `move_layout.h`). It colors
damaging moves' names by their matchup against the opponent: on the move screen in single and rotation battles, and in
double and triple battles on the selected move's name, which it carries above the target cards.

- `src/paperwhite2/ov168/paperwhite2_move_preview.c`, `include/paperwhite2/battle_move_preview.h`.
- The colors are the ones the hack's installer wrote into its DLL (its six configurable bytes, at file offset
  `0xba4`): super effective `0x7ecc` (light blue), resisted `0x2f7e` (yellow), immune `0x4210` (gray), in place of the
  plugin's yellow `0x2b5e`, grayish blue `0x62b3` and red `0x211f`. They are `MOVE_PREVIEW_COLORS` in the C file.

| Hook (White 2) | Where | What |
| --- | --- | --- |
| `0x021eadc4`, `0x021ee018` | `BtlvInput_SetScreen` (move screen), `BtlvInput_SetupMoveScreen` → `BtlvInput_DrawMoveTiles` | `PaperWhite2_MovePreviewAfterDrawMoves`: reads the moves' types and colors their names |
| `0x021eaa86` | `BtlvInput_SetScreen` → `BtlvInput_ClearScreen` | `PaperWhite2_MovePreviewBeforeClear` and `AfterClear`: carries the selected move's name to the target screen |
| `0x021eb2a6`, `0x021eb65c` | `BtlvInput_CheckInput`, `BtlvInput_MoveScreenMain` (both calls) → `BtlvInput_KeyInput` | `PaperWhite2_MovePreviewAfterKeyInput`: colors again for the cursor's target |

### Hidden stats on the summary screen

The summary's skill page (`src/ov207/p_sta_skill.c`, overlay 207) shows HP and the five stats on the top screen, with
"« STATS »" in its title bar. L or R switches the six rows to their EVs and IVs: in each row's part of the white panel,
a blue EV bar (0-252), the EV and the IV, and a red IV bar (0-31), the bars rounded, with a dark outline round a white
track, drawn into the rows' windows with fills (`PStaSkill_DrawHiddenBar`). Each EV bar's track is white up to the most
that stat can still reach, min(252, EV + 510 - the six EVs' sum), and grey from there to 252, the part it can no
longer reach: no grey while the sum is low, the right ends grey near 510, and at 510 each bar is grey past its blue. "EV" and "IV" stand over their columns in the title bar, where the empty bar's tiles cover « STATS », and the
sum at its right ("EVs 85/510", `PStaSys_Text_EvTotal`, ending at x 252, which the wireless icon covered until hack builds hid it); the HP bar and its frame are hidden. The rows' windows are 19
tiles wide in hack builds instead of 16 and 14, to the panel's edge on the HP's row (x 216), which BG 4's 768 tiles
allow (754 used). L or R again switches back, and the view stays across Pokémon and pages until the summary closes. A
hint at the left of the HP's row ("L/R: EV/IV", "L/R: Stats") says what L and R do: the game's archives have no L or R
button art that the summary could use, so it is text until there is art. Everything is under `PAPERWHITE2` in that file
(`showHidden`, `PStaSkill_PrintStatRows` and the `HIDDEN_` constants at the top: the columns and bars in screen pixels,
the headers' and hint's places, the colors of the font's palette), and the text is at the end of the summary's bank,
`res/text/system/p_sta_sys.txt`. The rows use `PKM_PARAM_EV_*`/`PKM_PARAM_IV_*` of their own stat, the same parameters
the stat calculation (`PokeParty_RecalcStats`) and Hidden Power read.

### Debug menu

`PAPERWHITE2_DEBUG_MENU`, defined in every hack build for now (`configure.py`, beside `PAPERWHITE2`): START in the
field, on grid maps and rails, starts `Script_2` of `res/field/scripts/global_10200.s` (script 10201,
`SCRID_PAPERWHITE2_DEBUG_MENU` in `src/ov036/fieldmap_event.c`), where the original's field doesn't use START. That
file is the original's `dummy.ev`, whose range 10200-10249 (`GLOBAL_SCRIPT_TABLE`) held only its empty Script_1, which
no script, zone or code starts; the menu moved there from `field_event.ev` (`global_10130.s`), which had 3 IDs left and
is back to the original's. Its text is the end of `global_10200.txt`, the file's own bank: a new bank would be a new
member of the script text archive and a line in `generated/script_text_banks.txt`, which the matching build packs
too. Every menu is a labeled block of the one script, so the submenus take no script IDs:

```
DEBUG                           L_DebugMenu
  Party...                        L_DebugParty: "Target: <species> (slot n)"
    Next target                     the party's next Pokémon, after the last the first
    Set EVs...                      the six stats, then 0 / 128 / 252 (the 510 total isn't enforced)
    Set IVs...                      the six stats and All, then 0 / 15 / 31
    Set level...                    number: the level's first experience, then the stats; the moves stay
    Nature...                       number (0-24), with the nature's name
    Make shiny                      the Shiny Candy's PID (PaperWhite2_MakeShinyPID); not an Egg or a shiny one
    Friendship...                   0 / 70 / 255
    Heal party                      PokeParty_RecoverAll, as a Center
    Give Pokémon...                 number: species, then level; to the party, or the PC when it is full
    Level 100                       the target to level 100's experience and stats; the moves stay
    Party to level 100              the same for every Pokémon of the party but Eggs
    Add prestige                    the target's Prestige level up by one, at level 100 (Prestige levels, below)
  Items...
    Give item...                    number: item (with its name), then how many (1-999)
    Give key items                  the safe ones (below), each the Bag doesn't have
  World...
    Time: <Off|period>              Off / Morning / Day / Evening / Night / Late night
    Season: <Off|mode>              Off / Spring / Summer / Autumn / Winter
    Weather: <Off|weather>          Off / Clear ... Diamond dust (WEATHER_SUNNY to WEATHER_DIAMOND_DUST)
    Flag get/set...                 number (1-0xbf7), then its state with Set / Clear
    Variable get/set...             number (0x4000-0x41ae), then its value with Change value...
  Encounters...
    Always shiny: ON/OFF            EVENT_FLAG_DEBUG_ALWAYS_SHINY
    No wild encounters: ON/OFF      EVENT_FLAG_DEBUG_NO_WILD_ENCOUNTERS
    Fewer step encounters: ON/OFF   EVENT_FLAG_DEBUG_FEWER_WILD_ENCOUNTERS: a quarter of the step rate
    No wanderers: ON/OFF            EVENT_FLAG_DEBUG_NO_WANDERERS (Wanderers, below)
    Wanderers now                   how many are out, and each one's species, level, shininess and state
    Force species: <Off|species>    number, 0 for Off
    Wild level: <Off|level>         number, 0 for Off
  Player...
    Warp to last Pokémon Center     the town of the last Center used, at its fly spot, as Teleport
    Warp to zone...                 number (0-614, with its place name), at the zone's fly spot
    Walk through walls: ON/OFF      EVENT_FLAG_DEBUG_WALK_THROUGH_WALLS
    Money...                        Set money... (number, 0-9999999) / +100000
  Info                            zone and place, x/y/z (or the rail's line, front and side), season and mode,
                                  time of day, weather, follower
  Conditions                      All pages, or one: World and tiles / Party and seeds / Sample rules (each debug
                                  sample's match) / Sample pick (Conditions, below)
  Follower...                     the Following Pokémon's steps and waiting item, Set steps..., Force a pickup,
                                  Clear waiting item, Rules now (following-pokemon.md, Dialogue rules, gifts and steps)
  Memory                          the sprite cache, texture and palette VRAM, billboards and materials, with peaks;
                                  Reset peaks (Memory readout, below)
  Close
```

**Sprite limits** (`include/paperwhite2/sprites.h`, `#ifdef PAPERWHITE2` in `fieldmap.c` and
`field_actor_billboard.c`): the sprite cache holds 48 object codes (the original's 32) and the field billboard system
96 materials (64). A sprite loaded on demand is asked for only where a cache entry is free past the loads on their
way and a 32 KB block of texture VRAM is free (`FldBillboardActor_HasRoom`, which tries one through the linked-list
manager and frees it); otherwise its actor waits, and `FldBillboardActor_UpdateAsyncActorSetup` asks again once there
is room. The original asked anyway, and a sprite that found no entry kept its VRAM and never showed. The Overworld
Editor's sprite bar reads the cache's size from the header.

**Memory readout.** What the field has loaded, to see how near it is to its limits: the sprite cache's entries in use
of 32, those loaded on demand, the most in use at once and the sprites that found no entry (and so never showed); the
field billboard system's billboards (of 128) and materials (of 64); the texture VRAM in use (of 384 KB: 3 slots, as
`FieldRoutine_Open` makes the G3D system), the most in use at once, the largest block that could be allocated now and
the allocations that failed; and the palette VRAM's the same, in bytes (of 16 KB). The peaks count from when the field
was made (a warp, a battle or a menu makes it again) or Reset peaks. The VRAM is counted by wrapping NitroSystem's
default allocation functions after the field's `GFL_G3DSysCreate` (`src/paperwhite2/main/paperwhite2_vram_stats.c`),
which every allocation goes through; the largest free block is found by trying sizes through the managers' own
functions. The sprite counts are `#ifdef PAPERWHITE2_DEBUG_MENU` lines in `field_actor_billboard.c`.

A block shows its list, compares the result in 0x8020 with its entries and jumps to each one's block; B, Back and
anything else go back to the menu above it (B on the top menu closes it). A list entry's label is formatted with the
script's words like a message, so a block runs a `..._WORDS` action before its list to put each entry's state in them
("Always shiny: ON", "Time: Evening"). A toggle flips its flag and shows its list again, with the new state. The
script's work variables are listed at the top of its Script_2.

**One command, many actions.** The menu's work is done by one script command, `Debug action, arg1, arg2, result`
(0x2f6), which runs the action with the two arguments, each a value or a variable, and puts what it returns in the
variable result (the script uses 0x8025). So a new option needs a new action, not a new opcode. The actions are
`#define`s in `include/paperwhite2/debug_actions.h`, not an enum, since the script includes the header too; the handler
is `Scrcmd_PaperWhite2_Debug` (`src/paperwhite2/ov012/paperwhite2_debug_commands.c`), a switch on the action. The
EV command that this replaced, `PokePartySetEV slot, param, value`, is now `DEBUG_ACTION_PARTY_SET_EV`. "The target" is
the party's Pokémon that the Party menu changes, the first until Next target picks another; "the number" is the value
of the last number entry.

| Action | Arguments | What it does, and what it returns |
| --- | --- | --- |
| `FLAG_WORD` (0) | word, flag | ON or OFF in the word; the flag |
| `FLAG_TOGGLE` (1) | flag | flips it; its new state |
| `PARTY_WORDS` (2) | | the target's species in word 0, its slot (from 1) in word 1; FALSE without a target |
| `PARTY_NEXT` (3) | | the next party slot becomes the target |
| `PARTY_SET_EV` (4) | stat (`DEBUG_STAT_*`), value | the EV, then `PokeParty_RecalcStats`; value in word 2, stat's name in word 3 |
| `PARTY_SET_IV` (5) | stat or `DEBUG_STAT_ALL`, value | the same for IVs (0-31) |
| `PARTY_SET_LEVEL` (6) | | the number's level: `setLevel` (the level's first experience, then the stats); moves unchanged |
| `PARTY_SET_NATURE` (7) | | the number's nature (`PokeParty_SetNature`), then the stats; its name in word 3 |
| `PARTY_MAKE_SHINY` (8) | | the Shiny Candy's PID (`PaperWhite2_MakeShinyPID`, now in main); `DEBUG_SHINY_DONE`, `_ALREADY` or `_EGG` |
| `PARTY_SET_FRIENDSHIP` (9) | value | `PKM_PARAM_HAPPINESS`; not on an Egg (whose field is its steps) |
| `PARTY_HEAL` (10) | | `PokeParty_RecoverAll` |
| `PARTY_LEVEL_100` (49) | | the target to level 100 (`setLevel`) |
| `PARTY_ALL_LEVEL_100` (50) | | every Pokémon but Eggs to level 100 |
| `PARTY_ADD_PRESTIGE` (51) | | the target's prestige level + 1, its shown level in word 2; FALSE below level 100 or at the greatest |
| `GIVE_POKEMON` (11) | species | at the number's level, made as `PokePartyAdd` makes one (`addPkmToParty`, else `GameData_AddBoxPkm`); `DEBUG_GIVE_PARTY`, `_BOX` or `_FULL` |
| `GIVE_ITEM` (12) | item | the number of them, `BagSave_AddItem`; name in word 0, count in word 2; whether it fit |
| `GIVE_KEY_ITEMS` (13) | | each of `sDebugKeyItems` the Bag lacks; how many, also in word 0 |
| `WORLD_WORDS` (14) | | the time, season and weather overrides' states in words 0-2 |
| `SET_DAY_PERIOD` (15) | 0 off, or a `DAY_PERIOD_*` + 1 | the time of day override |
| `SET_SEASON` (16) | 0 off, or a season + 1 | locks the season mode (`PaperWhite2_SetSeasonMode`), saving the replaced mode; 0 sets it again |
| `SET_WEATHER` (17) | 0 off, or a `WEATHER_*` + 1 | the weather override, and the field's weather at once (`GetWeatherAll`, `FieldWeather_RequestChange`, `SetNowWeather`) |
| `FLAG_GET` (18) | | the number's flag in words 0 (decimal) and 1 (hex), ON/OFF in word 2; its state |
| `FLAG_SET` (19) | set | sets or clears the number's flag |
| `VAR_GET` (20) | variable | its ID in words 0 and 1, its value in word 2; its value |
| `VAR_SET` (21) | variable | sets it to the number |
| `ENCOUNTER_WORDS` (22) | | the species and level overrides' states in words 2 and 3 |
| `SET_WILD_SPECIES` (23), `SET_WILD_LEVEL` (24) | | the override to the number, 0 for off |
| `WARP_LAST_CENTER` (25) | | `EventMapChangeTeleport_Create`, chained after the script, which waits a frame and ends |
| `WARP_ZONE` (26) | | the number's zone at its fly spot (`LoadZoneSpawnInfoCheckRail`, `EventMapChange_CreateForFly`); FALSE, without a warp, for a zone whose fly spot is 0, 0, 0 |
| `MONEY_SET` (27), `MONEY_ADD_THOUSANDS` (28) | -, thousands | the money to the number, or plus arg1 thousand up to 9,999,999; in word 0 |
| `INFO` (29) | | the Info message's words 0-9; whether the player is on rails |
| `NUMBER_BEGIN` (30) | kind (`DEBUG_NUMBER_*`), start | starts a number entry; its first value (below) |
| `NUMBER_SHOW` (31) | | the number in word 0, its name in word 1, the step in word 2; the kind's message |
| `NUMBER_ADJUST` (32) | change (`DEBUG_NUMBER_STEP_*`) | plus or minus the step, or the step times or over ten |
| `NUMBER_GET` (33) | | the number, kept as the kind's last |
| `CONDITIONS_WORLD` (34) | | the conditions' world in words 0-10 (season, time, weather, zone, parent, exterior, terrain under the player and the follower, the follower) |
| `CONDITIONS_PARTY` (35) | | the lead in words 0-4, the party level, adjusted level and wild range in 5-8, the zone loads and seeds in 9-12; FALSE without a lead |
| `CONDITIONS_RULES` (36) | first | up to three debug samples from first: names in words 0, 2, 4, yes/no in 1, 3, 5; how many |
| `CONDITIONS_PICK` (37) | | the samples' pick with a check seed (0, its seed in 1), with the load seed twice (2, 3), a keyed seed (4) |
| `FOLLOWER_WORDS` (38) | | the follower's species, steps, total steps and waiting item in words 0-3; FALSE without one |
| `FOLLOWER_SET_STEPS` (39) | | its steps since its last gift to the number (kept up to 4095) |
| `FOLLOWER_PICKUP` (40) | | `FollowingDebug_ForcePickup`: the item in word 3; whether one was found |
| `FOLLOWER_CLEAR_ITEM` (41) | | forgets its waiting item |
| `FOLLOWER_RULES` (42) | | the talk rule that would be chosen now (0), its priority (1), the matches (2), the ambient (3) and pickup (4) rules |

**Number entry.** The game has no number input that a script can open: the Bag's and the shops' quantity selectors are
parts of their apps, and no script command asks for a number. So the menu has its own, `L_DebugNumber`, a subroutine
that every number uses: after `Debug DEBUG_ACTION_NUMBER_BEGIN, kind, start, 0x8025` it shows the kind's message
("Species 25: Pikachu", "Zone 427: Aspertia City", "Flag 3033 (0x0bd9): OFF") and a list of +step, -step, Step x10,
Step /10, Done and Cancel, with the cursor kept on the entry last picked, until Done (0x8024 1, the number in 0x8025)
or Cancel or B (0x8024 0). The step starts at 1 and stays within the range's largest power of ten; plus or minus stops
at the range's end, and from the end goes round to the other end. The kinds (`sDebugNumberKinds`) give the range, the
message and the name: level 1-100, nature 0-24 (its name), species 1-649 (its name), item 1-638 (its name), count
1-999, flag 1-0xbf7 (its hex and state), variable 0x4000-0x41ae (its hex), value 0-65535, money 0-9999999, zone 0-614
(its place name), wild species 0-649 and wild level 0-100 (0 shows "(off)"). An entry starts at the target's level or
nature, the money, the current zone, the override, a variable's value, or else the last number entered of the kind.
The state lives in overlay 12 (`sDebugNumber`), which stays loaded while the script runs. A two-number option keeps the
first in 0x8026.

**Overrides and their hooks.** The overrides that hold a value (the time of day, the weather, the wild species and
level, and the season mode a lock replaced) are RAM in main (`src/paperwhite2/main/paperwhite2_debug.c`,
`include/paperwhite2/debug.h`), so a reset turns them off; the on/off toggles are flags (below), which the save keeps.
Each hook is under `PAPERWHITE2_DEBUG_MENU` with the original in `#else`:

| Option | Hook | What changes |
| --- | --- | --- |
| Time | `GetRealTimeDayPeriod` (`src/system/rtc.c`, main) | returns the override's period: every caller of the field's time of day (NPCs, encounters, `IsDayPeriodNight`). The save's adventure time (`GameData_GetDayPeriod`, ov012) isn't changed |
| Time (lights) | the field's two `FieldLight_Update`/`FieldLight_Create` seconds (`src/ov036/fieldmap.c`) | `PaperWhite2_Debug_GetDaySeconds`: half an hour into the period's first hour in the season (`GetLightChangeHoursForSeasons`), so the lights match |
| Season | none: `PaperWhite2_SetSeasonMode` | a locked mode, as the Season app sets it; the season changes at the next map change into an exterior. Off sets the saved mode again; after a reset there is none to restore, and the lock stays as a normal setting |
| Weather | `GetWeatherAll` (`src/system/zone_weather.c`, main) | returns the override before every other source, so every zone, indoors too, has it on entry and on a seamless zone change; set from the menu it also changes the field's weather at once |
| Flag/variable | none | `EventWork_FlagGet/Set/Reset`, `EventWork_GetWkPtr` |
| Always shiny | `FieldEncount_CreateWildPkm` (`src/ov036/enc_pokeset.c`) | rolls the PID up to `ALWAYS_SHINY_ROLLS` (0x4000) times until it is shiny: grass, surfing, fishing and `EventWildBattleCall_CreateStatic`'s scripted encounters. Gifts, eggs and trainers' Pokémon aren't affected |
| No wild encounters | `EventWildBattleCall_CreateRandom` (`src/ov036/field_encount.c`) | returns no battle before the step's roll; Sweet Scent and other forced encounters still happen |
| Force species, wild level | `EventWildBattleCall_CreateRandom`, after `FieldEncount_GenWilds` | `PaperWhite2_Debug_OverrideWilds`: each wild Pokémon's species (with form 0, no item, a random sex and no hidden ability) and level. Roaming Pokémon, N's Pokémon and scripted battles keep theirs |
| Walk through walls | `FieldPlayerGrid_UpdateMovement` (`src/ov036/field_player_grid.c`) and `FieldPlayerRail_GetHitBits` (`src/ov036/field_player_nogrid.c`) | the player's step only. On grids it turns on the grid's forced step (`GridMoveInput.force`, always off in the original), which clears every collision bit but the map's edge (`ACTOR_COLL_OUT_OF_BOUNDS`) and lets the player walk onto water and surf onto land; ledges are walked over, not jumped. On rails every bit but the rail's ends (bit 1). Other actors still collide |
| Warp to last Pokémon Center | none: `EventMapChangeTeleport_Create` (ov035) | the respawn index of the last Center (`GetReturnLocationIdx`), its town's fly spot, as Teleport and a blackout use |
| Warp to zone | none: `EventMapChange_CreateForFly` | the zone's fly spot (`ZoneHeader`'s flyX/Y/Z, the same `LoadZoneSpawnInfoCheckRail` as Teleport): the only entry point a zone's header has without loading its events. 600 of the 616 zones' headers (`fly` in `res/field/zones/*.json`) have one, interiors too; the 16 at 0, 0, 0 (some of Castelia City's buildings among them) are refused with a message |
| Info's follower | `PaperWhite2_FollowingGetSpecies` (`src/paperwhite2/ov036/paperwhite2_following_field.c`) | the follower's species, or none |

**Give key items** adds the Bicycle, Dowsing MCHN, Super Rod, VS Recorder, Gracidea, Reveal Glass, both DNA Splicers,
the Permit, the Oval and Shiny Charms, the Exp. Share, the DexNav and the Version Key (`sDebugKeyItems`; the hack's
items are in [items.md](items.md)). It leaves out, as its message says, the
items that events give, check or take back (the Light and Dark Stones, the Dragon Skull, the Grams, the Plasma Card,
the Colress Machine, the Grubby Hanky, the Dropped Items), those that come with their feature's setup (the Medal Box,
the Prop Case), the Liberty Pass, the Xtransceivers (given at the start, one per sex), and the Key Items pocket's
leftovers from the other games.

**Adding an option.** For a new action: its `DEBUG_ACTION_*` number in `debug_actions.h` (after the last), its `case` in
`DebugCommands_Run`, and its messages at the end of `global_10200.txt`. Then in the script: an entry in its menu's
list (`ListMenuAdd <text>, 65535, <value>`, a value under 0x4000 other than `DEBUG_LIST_BACK`), its `WorkCmpConst` and
`VMJumpIf` after `ListMenuShow`, and its block, which runs `Debug DEBUG_ACTION_<NAME>, arg1, arg2, 0x8025` and jumps
back to the menu. For a number, the block calls `Debug DEBUG_ACTION_NUMBER_BEGIN, DEBUG_NUMBER_<KIND>, 0, 0x8025`,
`VMCall L_DebugNumber`, and checks 0x8024 (a new kind is a `DEBUG_NUMBER_*` and a row of `sDebugNumberKinds`, with its
message). For a toggle: a flag from the debug block (Flags, below) named in `generated/flags.txt`, a
`Debug DEBUG_ACTION_FLAG_WORD, <word>, <flag>, 0x8025` before the list with `{0100:<word>}` in its label, and a block
with `Debug DEBUG_ACTION_FLAG_TOGGLE, <flag>, 0, 0x8025`. For a submenu: an entry in the list above and a block, whose
Back and B jump back up. Removing the define from `configure.py` removes the menu, its command, its code and its
hooks; the text stays.

The hack's script commands follow the original's last, 0x2f2, in `EVCMD_TABLE` (`src/ov012/scrcmd_vm.c`), each with
its row in `EVCMD_PERM_TABLE` (`src/ov012/script_sys.c`): the conditions' two (0x2f3, 0x2f4) and `ReloadMapHere`
(0x2f5, Version places below) under `PAPERWHITE2`, then `Debug` (0x2f6) under `PAPERWHITE2_DEBUG_MENU`, last, so that a
build without the menu keeps the others' IDs. Its entry in
`tools/script/field_commands.json` has a `"hack"` key, which `field_command_table.py` keeps when it writes the table
again from the original ROM and `field_script.py inc` writes above the macro. To add another command (rarely needed
now): its handler under `src/paperwhite2/`, its declaration in `include/paperwhite2/debug_commands.h`, its rows in
both tables, its entry in the JSON, then `python3 tools/script/field_script.py inc include/asm/field_script.inc`.

| Command | ID | Arguments | Handler |
| --- | --- | --- | --- |
| `Debug action, arg1, arg2, result` | 0x2f6 (758) | a `DEBUG_ACTION_*`, two arguments, each a value or a variable, and the variable for the result | `Scrcmd_PaperWhite2_Debug` (`src/paperwhite2/ov012/paperwhite2_debug_commands.c`); the actions above. A warp action waits a frame, as the map change commands do |

**Memory.** The menu costs about 4 KB of the budget (the main arena had 159 KB left before it, 155 KB after): the
command's code and tables in overlay 12, the overrides and the shiny PID in main, the hooks.

### Version places

Each place Unova has as Black 2 or as White 2, and the Underground Ruins' Regi chamber, has a flag or a variable of
its own, which an NPC's script can set (`include/paperwhite2/version_places.h`; design/version-key.md). Set while the
place is as Black 2 has it, clear as White 2 has it:

| Place | Flag or variable | What it switches |
| --- | --- | --- |
| Route 4 | `EVENT_FLAG_BLACK2_ROUTE_4` (0x931, 2353) | the route's zone and map pieces (City Route, Black 2's; Desert Route, White 2's), the warp Castelia Gate and Join Avenue lead to, the Desert Resort's textures, the Dowsing Machine's |
| Reversal Mountain | `EVENT_FLAG_BLACK2_REVERSAL_MOUNTAIN` (0x932, 2354) | the cave its outside and Undella Town lead to (Damp Caves, Black 2's; Fiery Caves, White 2's) |
| Mistralton City | `EVENT_FLAG_BLACK2_MISTRALTON_CITY` (0x933, 2355) | the city's and its gate's map pieces (Greenhouses, Black 2's; Farmland, White 2's) |
| Opelucid City | `EVENT_FLAG_BLACK2_OPELUCID_CITY` (0x934, 2356) | the city's, its gate's and three interiors' map pieces, its textures in the Kyurem freeze, its people's lines (Modern City, Black 2's; Old Town, White 2's) |
| Black City / White Forest | `EVENT_FLAG_BLACK2_BLACK_CITY` (0x935, 2357) | Black City while set, White Forest while clear: the city, its gate and the way back from its Pokémon Center |
| Underground Ruins | `EVENT_WORK_REGI_CHAMBER` (0x4059) | the chamber, in Unova Link's chamber key's place: 0 as White 2 has it, 1 as the Iron Chamber's key has it, 2 as the Iceberg Chamber's (`REGI_CHAMBER_*`; `KeyInfoGetChamberKey` reads it) |

In every place's zones the scripts' version checks (`GameGetVersion`, `ActorMsgVersioned`) see the place's version.
A flag takes effect at the next map change; where the player stands now, the map has to load again:

- **Script 2823** (`global_2800.s`, `SCRID_RELOAD_MAP_HERE`): `RTCallGlobal 2823` after setting the flag or the
  variable loads the map again where the player stands, as the Version Key does, with a fade, so the zone's look and
  its level scripts (the gates' and the Pokémon Centers' exits) follow. 0x8000 is 1 where it did, 0 where it can't (on
  rails, cycling, surfing, the Union Room, the Entralink). It's the script's last thing: the map's actors are new
  after it. In the script language: `set_flag(2353); zone_reload(); end();` (`res/paperwhite2/scripts/globals.json`).
- **The command** `ReloadMapHere result` (0x2f5, 757), which script 2823 runs: `Scrcmd_PaperWhite2_ReloadMapHere`
  (`src/paperwhite2/ov012/paperwhite2_version_key_event.c`).

### What resets flags and variables

Read from the code; the usage tools (`tools/paperwhite2/flag_usage.py`, `var_usage.py`) and the editor's Flag and Var
Reference mark each one's region by it:

| What | When | Where |
| --- | --- | --- |
| Flags 1-0x63 (1-99) | every map change | `FieldScript_ResetMapLocalEvents`, `src/ov012/script_sys.c` (`EventWork_FlagResetRange`, both ends in) |
| Variables 0x4000-0x401e | every map change | the same, `EventWork_WorkResetRange(0x4000, 0x401f)`, whose last isn't cleared: 0x401f is a saved variable |
| Flags 0xaa0-0xb03 (2720-2819), `EVENT_FLAG_DAILY_*` | each day, at midnight | `EventWork_ResetDailyFlags`, `src/system/event_work.c`, from `midnight` (`src/ov012/ev_time.c`); no variable resets daily |
| The defeats of the 12 re-battle trainers (the Pokémon Breeders and four Black Tower bosses) | every map change | `resetRebattleTrainers`, `src/ov012/trainer_script.c` |
| Flags 0x3a1-0x3ac (929-940) | a Funfest mission's start | `ClearFesEventFlags`, `src/ov036/fes_gimmick.c` |
| Flags from 0x4000 (temporary) | never saved | `EventWork_GetFlagBytePtr`, `src/system/event_work.c` |

Not reset, but not free either: variables 0x4031-0x403a are the map replacements' events
(`EVENT_MAP_REPLACE_TABLE`, `src/ov012/map_replace.c`; event 0, 0x4031, is Opelucid City's Kyurem freeze, on while it
holds 0x1220), which `MapReplaceSetEvent` sets by event number, so no script names the variable; and 0x4020-0x402f
are the object codes of the NPCs whose model is `OBJ_CODE_WORK_00` to `_0F` (`src/ov012/field_actor.c`; `_00` to `_0E`
are used, `_0F`, 0x402f's, isn't).

### Flags

The save's event flags that the hack uses, from the blocks the user found unused (`generated/flags.txt`, where each
used one is named with a `# Paper White 2:` comment). New features take theirs from these blocks.

| Block | Purpose | Used |
| --- | --- | --- |
| 0x1f4-0x257 | the hack's seasonal NPC spawns (Frost's editor) | all; don't touch |
| 0x41b | Keldeo | in use |
| 0x41c-0x44b | free | |
| 0x754 | free (was the old season NPC's) | |
| 0x755-0x757 | free | |
| 0x92f-0x95f | the hack's features | 0x92f `EVENT_FLAG_EXP_SHARE_OFF`, 0x930 `EVENT_FLAG_SPAWN_HIDDEN`, 0x931-0x935 `EVENT_FLAG_BLACK2_*` (the places as Black 2's, `paperwhite2/version_places.h`) |
| 0xaef | the user's: the Wurmple daily-feeding mini-event (`route_20.s`), a daily flag | `EVENT_FLAG_DAILY_0x0aef`; don't touch |
| 0xaf0 | the user's: the Pokémon Center lottery girl (`global_10850.s`, set in `aspertia_city.s` too), a daily flag | `EVENT_FLAG_DAILY_0x0af0`; don't touch |
| 0xbd9-0xbf7 | the debug menu's toggles | 0xbd9 `EVENT_FLAG_DEBUG_ALWAYS_SHINY`, 0xbda `EVENT_FLAG_DEBUG_NO_WILD_ENCOUNTERS`, 0xbdb `EVENT_FLAG_DEBUG_WALK_THROUGH_WALLS`, 0xbdc `EVENT_FLAG_DEBUG_FEWER_WILD_ENCOUNTERS`, 0xbdd `EVENT_FLAG_DEBUG_NO_WANDERERS` |

Flags elsewhere, even ones no text search finds, may be reached by a base plus an index (hidden items, trainers), so
don't take them. 0x5d0, which the Exp. Share used first, is back to its original name.

### Seasons

The hack's season setting, revised from the PMC plugin ToggleableSeasons (`gen5-seasons-patch`, `Seasons.cpp`,
northern build), which hooked `Season_GetRealTime`, `Season_GetNext`, `Season_GetPrevious` and
`Calendar_GetDayOfYear`. The revision keeps the plugin's setting and its modes 0-7, so old saves keep their mode, and
drops its workarounds: the banner's walk is decided in one place instead of bending `Season_GetNext` and
`GetPrevious` (the original's again), and the division is the compiler's.

- `src/paperwhite2/main/paperwhite2_season.c`, `include/paperwhite2/season.h`: the setting and the season. In ARM9
  main, since the season is asked for by main (`season.c`, `zone_weather.c`) and by overlays 12, 35, 36 and 302. The
  header is the API that the Season app uses: get and set the mode and the hemisphere, the current season, and the
  `SEASON_MODE_` constants.
- `src/paperwhite2/ov012/paperwhite2_weather.c`, `include/paperwhite2/weather.h`: the weather's date of the day, in
  overlay 12 beside `calender.c`.
- `res/field/weather_calendar/`: the original's weather calendar (`a/0/9/6`), the source to edit, a JSON file per
  zone. `tools/data/weather_calendar_data.py` dumped it and packs it in every build, the matching one too, whose check
  proves it byte for byte (docs/data.md). The hack hasn't changed it yet.

**The setting** is `EVENT_WORK_SEASON_SETTING`, which the original game doesn't use: bits 0-3 the mode, bit 4 the hemisphere
(0 northern, 1 southern, read by the real-time mode only). A mode past 8 is taken as monthly.

| Mode | Season | Banner when it changes |
| --- | --- | --- |
| 0 monthly | The original's: `(month - 1) % 4`, spring in January, May and September | One, of the new season |
| 1-4 | Spring, summer, autumn or winter, always | One |
| 5 weekly | The weeks from Monday, counted from the one 2000-01-01 is in, `% 4`: it changes each Monday | One |
| 6 daily | The days since 2000-01-01 (`RTC_ConvertDateToDay`) `% 4`: it changes each midnight | One |
| 7 real time | Spring from March 21st, summer from June 21st, autumn from September 21st, winter from December 21st; in the southern hemisphere spring and autumn change places, and summer and winter | The original's walk, from the season after the saved one to the new one |
| 8 chaos | A random season other than the game's (`GFL_RandomLC(3)` of the other three), drawn at each map change with a loading screen, so every one into an exterior changes it | None, also on loading a save, on a new game and from the script command |

**When the season changes.** As in the original, only on a map change that closes the field (a warp, Fly, an Escape
Rope, Dig, a fake warp) into an exterior: `EventMapChange_LoadSeasons` asks `GameData_GetSeasons` for the new season
and `EventMapChangeCore_Callback` sets it, before the new zone is loaded, so its seasonal graphics come with it. A
seamless walk from one zone into the next never changes it: `Field_SwapZoneByMatrix` (`src/ov036/fieldmap.c`) only
reads the season, and `Season_Set` (`GameData_SetSeason`) is called from `EventGameOpening_Callback` and the map
change's core only. A new setting therefore shows at the next such map change.

**Chaos draws once.** Only `GameData_GetSeasons`, which only the map change calls, draws a season
(`PaperWhite2_GetSeasonForMapChange`). Every other place that asks for the season of the date asks
`PaperWhite2_GetCurrentSeason`, which for chaos is the season the game has (`GameData_GetSeason`, saved with the game):
the Pokédex's habitats, the 3D demos, the weather's check that the season is current, and the new game's season. The
draw happens on every map change with a loading screen, also into an interior, where it is thrown away, as the
original's season of the date is there. The draw is among the three seasons other than the game's (`(GameData_GetSeason
+ 1 + GFL_RandomLC(3)) % 4`), and the game's is the one the last exterior got, since a draw thrown away doesn't change
it: two exteriors in a row never have the same season. A forced season sync (`GameData_IsForceSeasonSync`) keeps the
season without a draw, as in the original. `GameData_Create` keeps the original's monthly season: it is the season only
until the save's is loaded, and a new game's setting is 0, monthly.

**The banner** is decided by `PaperWhite2_GetSeasonBanner` alone (none, one, or the walk). For none, the map change's
`seasonChanged`, which picks the season's fade and banner on every path (the warp sequences, the fake warp, Escape
Rope, Dig and their spin), stays `FALSE`, and the core compares the two seasons instead, so the season changes with
the ordinary fades. For one, `EventSeasonBanner_CreateFieldTransition` and `...Ex` start at the last season, so each
caller's walk becomes its last banner.

**The weather.** The 24 zones of the original's calendar (`res/field/weather_calendar/`) have a weather for each day
of the year, and neighbors share it on the same dates: Virbank City and both Virbank Complex zones snow on the same
winter days. The original reads today's date, whose month is always the season's there; with the hack's other modes
it isn't, so the hack keeps the calendar and changes the date it reads: each real day picks one date of the original's
year, from the days of the months of the season the game has (by the original's months, `(month - 1) % 4`: spring is
the 92 days of January, May and September, summer the 90 of February with its 29th, June and October, and so on), and
every calendar zone reads its weather of that date through the original's `Calendar_ReadWeatherValue`. The pick is a
hash of the day number of the save's clock (`getAddressAdventureTimeBlk`, as the original read, through
`RTC_ConvertDateToDay`) and the season, uniform over the season's days, so it holds all day and after a reload, the
zones always agree, and it changes with the season. A zone missing from the calendar has its zone header's weather, as
in the original. The original's rules before the calendar stay (`GetWeatherAll`: forced weather, the Entralink, Route
7's event, the birthday on Routes 14 and 15), and the calendar applies only while the game's season is the current one.
In the calendar: snow (`FLAKE`, with `FLUTTER` in Driftveil, Route 6, Chargestone Cave, Mistralton, Route 7 and Twist
Mountain) in winter in the north and in Floccesy, Pledge Grove, Route 20 and Virbank; blizzards in winter in Icirrus,
Dragonspiral Tower and Route 8 (with one day of diamond dust in Icirrus); rain in the other seasons in most zones
(Route 12 also in winter); sandstorms in Lentimas and Reversal Mountain all year but autumn; `TINT_9` most days on
Routes 14 and 15.

To give a zone more rain or snow, add days to its file: each month lists its days with weather, by `"day"` or
`"first-last"`, and every other day is sunny, so `"april": { "1-30": "WEATHER_FLAKE" }` snows on every day of April,
which is one of winter's three months. Since a winter day picks one of winter's 92 dates, a weather on N of them comes
on N / 92 of winter's days. A zone can be taken out of the calendar or swapped for another (its file, and
`order.json`), but not added past 24: `Calendar_Preload` reads `CALENDAR_ZONE_MAX` (24) entries into
`Calendar.zones[24]`, so a 25th zone needs both raised in `calender.c` and `field/calender.h`, and the packer's
`ZONE_MAX` with them (the u16 offsets allow up to 179 zones).

| Hook | Where | What |
| --- | --- | --- |
| `GameData_GetSeasons` (`src/system/season.c`) | `Season_GetRealTime` | `PaperWhite2_GetSeasonForMapChange`: the setting's season, drawn for chaos |
| `IsSeasonCurrent` (`src/system/zone_weather.c`) | `Season_GetRealTime` | `PaperWhite2_GetCurrentSeason` |
| `Pokedex_Init`, `Pokedex_StateAfterAwards` (`src/ov302/pokedex.c`) | `Season_GetRealTime` | `PaperWhite2_GetCurrentSeason` for the habitats |
| `SetupPlaySequenceEventRealTime` (`src/ov012/event_3d_demo.c`) | `Season_GetRealTime` | `PaperWhite2_GetCurrentSeason` |
| `EventGameOpening_Callback` (`src/ov035/event_mapchange.c`) | the new game's season and banner | `PaperWhite2_GetCurrentSeason`; no banner for chaos |
| `EventFieldContinue_Callback` (same) | the banner on loading a save | a fade from black for chaos |
| `EventMapChange_LoadSeasons` (same) | `seasonChanged = TRUE` | `FALSE` for chaos, whose season changes without the banner |
| `EventMapChangeCore_Callback` (same) | `if (unk40 && seasonChanged)` before `Season_Set` | `if (unk40 && season != prevSeason)` |
| `EventSeasonBanner_CreateFieldTransition`, `...Ex` (`src/ov035/event_season_banner.c`) | the walk's first season | `PaperWhite2_GetSeasonBannerStart`: the last one but for real time |
| `Scrcmd_Fade_CallSeasonBanner` (`src/ov036/scrcmd_fade.c`) | the script's banner | a fade from black for chaos |
| `Calendar_GetWeatherCore` (`src/ov012/calender.c`) | today's month and day | `PaperWhite2_GetWeatherDate`'s, for `Calendar_ReadWeatherValue` |

Together they cost about 700 bytes: about 470 in main and 200 in overlay 12. The date math has host tests, not
committed: the seasons (every day of 2000-2099: weekly changes exactly on Mondays, daily every day across months, years
and February 29th, real time on the 21sts in both hemispheres) and the weather's date (every day of 2000-2099 in each
season: the pick is a real date of the season's months, the same on every call, and spread evenly, each of the season's
dates picked 347 to 459 times against a mean of 397 to 406, a chi-squared test passes). The Season app (below) sets the
mode and the hemisphere.

### Season app

The Pokémon Centers' globe opens a touch-screen app that sets the season setting, in Geonet's place: hack builds have
no Geonet. It is Geonet's process slot and overlay with Geonet's parts, without the globe.

- `src/paperwhite2/ov312/paperwhite2_season_app.c`, `include/paperwhite2/season_app.h` (`SEASON_APP_PROC_FUNCTIONS`).
  It is linked into overlay 312, Geonet's, which `CallGeonet` loads, so it is in memory only while the app runs.
- `src/system/app_taskmenu.c` gains `AppTaskMenuRes_CreateFromArchive` under `PAPERWHITE2` (96 bytes in main): the
  task menus' button resources with the frame and palettes from another archive, so the app's buttons have art of
  their own; and `AppTaskMenuWin_SetRes`, which moves one button to another resource's palettes without drawing it
  again.
- Text: `res/text/system/season_app.txt`, bank `TEXT_BANK_SEASON_APP`, a new last file of `a/0/0/2`
  (`generated/text_banks.txt`). Every label, status line and confirmation is there.
- Graphics: Geonet's archive (`ARCID_GEONET`, `res/graphics/geonet/`) gains three members, see below. The banners
  are the game's own (`ARCID_SEASON_BANNER`, `res/graphics/season_banner/`), unchanged.
- **Alter Unova** (the menu's fourth button): a row for each place of `paperwhite2/version_places.h`, White 2's look
  on the left and Black 2's on the right (Desert Route / City Route, Old Town / Modern City, White Forest / Black
  City, Farmland / Greenhouses, Fiery Caves / Damp Caves), each row's current one in the current colors. A pick sets
  the place's flag; the place changes at the next map change there (`FieldMapControl_LoadZone` sets the city and the
  zones from the flags at every map change). The place the player is in changes too: Black City's and White
  Forest's Pokémon Centers each have an exit to both cities, and their level scripts (type 2 and 3, `Script_4`) move
  the one the flag doesn't pick off the doorway; Opelucid City's Center leads to the same zone in both versions. The
  preview shows the place under the cursor as that button has it, in the season the app shows.
- **The preview's spots:** `res/paperwhite2/season_preview.json` (the season pages') and
  `res/paperwhite2/version_preview.json` (each place as White 2 and as Black 2 has it, in `places`), both read by
  `tools/paperwhite2/season_preview.py` into one table of spots; each spot has its area, chunks, props, lights and
  camera, and a place's chunks take its version's map pieces by the game's map replacements. The places' cameras are
  first placements, to be tuned.

| Hook | Where | What |
| --- | --- | --- |
| `Script_9` of `res/field/scripts/global_2100.s` | the globe of every Center: `EVENT_FLAG_0x006a` set gave "It seems you can't use it yet." | always `CallGeonet`; the flag and the Castelia Geonet girl's event stay as they were |
| `Scrcmd_ProcFld_CallGeonet` (`src/ov036/scrcmd_proc_fld.c`) | `GEONET_PROC_FUNCTIONS` in `OVERLAY_GEONET` | `SEASON_APP_PROC_FUNCTIONS` in the same overlay |

**Screens.** Unlike Geonet's, the top screen is the main engine, since only the main engine has the 3D on its BG 0,
and the touch screen the sub engine (`GX_DISP_SELECT_MAIN_SUB`, as the field has them), BG mode 0 on both and no OBJs.
VRAM B is the top screen's BGs and VRAM C the touch screen's (each: screens at 0x0000-0x17ff, text characters at 0x4000,
the banner's at 0x8000, the grid's at 0x10000); VRAM A is the preview's textures (texture slot 0) and VRAM F their
palettes (palette slot 0), which the 3D system manages as linked lists (`GFL_G3DSysCreate(FALSE, 1, FALSE, 1, ...)`);
VRAM E and I stay the engines' OBJ VRAM, unused.

| Screen | BG (priority) | What |
| --- | --- | --- |
| Top | 2 (0) | Geonet's message window (2,19, 28 by 4 tiles, message frame): the setting ("Seasons: Weekly", "Seasons: Locked to Winter", "Seasons: Real time (Northern)") and "Season outside: X" (the season the next map change into an exterior brings by the setting, `PaperWhite2_GetCurrentSeason`: the locked one, the date's in the mode; "Season outside: ???" for chaos, whose season is rolled at the map change), or the hemisphere on its page, or a confirmation after a change |
| Top | 1 (2) | the season's banner, the game's art, in palette 8 with its black background (color 1) made transparent; over the preview it is moved up 22 pixels (`BANNER_PREVIEW_OFFSET_Y`), so that the season's name is centered in the view above the message window (line 72), over the preview's shadow |
| Top | 0 (3) | the 3D preview (below) |
| Top | 3 (3) | Geonet's grid, only if the preview didn't load |
| Touch | 6 (0) | the menu's buttons (Set Season, Dynamic Options, Set Hemisphere, and QUIT), or a page's buttons |
| Touch | 7 (3) | Geonet's grid |

The banner and the preview show the season the message window talks about: with the status and after a change, the
one the next map change into an exterior brings (`PaperWhite2_GetCurrentSeason`; for chaos the game's own). With the
key cursor on a page's button, they show the season that button would give now (`SeasonApp_UpdatePreview`): on Set
Season its season, on Dynamic Options its mode's of today's date (`PaperWhite2_GetSeasonOfDate`; Chaos the game's
own), and on Set Hemisphere, only while the mode is real time, the real-time season of that hemisphere; in other modes
the hemisphere changes nothing outside, so the top screen keeps the season outside. On BACK, or with the touch screen
in use, the message's season again. A hovered season equal to the one shown loads nothing.

**The preview.** `src/paperwhite2/ov312/paperwhite2_season_preview.c`, `include/paperwhite2/season_preview.h`, in
overlay 312 with the app. It draws the southern stretch of Route 1 (the chunk of matrix cell 24,22, whose southern edge
is Nuvema Town's border with Professor Juniper's orange-roofed lab just south of it, and cell 24,21 north of it to fill
the far corner): the sand path north from Nuvema, the tall grass across it, the yellow flower patches, the trees, the
pond, the two signs, and the falling petals or leaves. The field's overlay 36 isn't loaded with the app, so the preview
does again, in a few lines each, what the field does:

- the area's record of the season (`AreaData_Create` with the season as the variant, as `Field_Create` reads it): its
  texture set (ARCID 14, `shared_dansa01a_2` to `_5` for Route 1's spring to winter) uploaded and trimmed as
  `FieldG3DMapper_LoadMapTextures` does, its SRT animation (ARCID 68, file 0: the water's and the grass edges' scroll)
  bound to each chunk's model, its texture pattern animation (ARCID 69, file 0: the yellow flowers' `hana01`, the sea's
  `sea_simi` and others, as `field_ground_anime.c` uploads their frames over the area's textures at VBlank), and its
  lights;
- each chunk's model section and props section of its file (ARCID 8; the terrain isn't read), with the model swapped for
  its season's by the game's map replacements (archive 10, the entries by season only), which for Route 1 changes only
  the petals' prop;
- the chunks' props from the area's prop bundle (ARCID 225 and its textures, ARCID 174): only the props' own entries are
  read from the bundle, and an ambient prop's animations loop (`FieldPropAnmController_Ambient_Init`). Route 1's
  `r01_a_<season>` and `r01_b_<season>` props (resource IDs 295 to 302) are the falling petals in spring and the
  leaves in autumn: planes the size of the chunk with an SRT animation that scrolls their textures. Doors aren't
  placed, and time-of-day props don't animate;
- the lights of the time of day (`RTC_ConvertDaySecondsCached`), the area's light set (ARCID 60, Route 1's 140 to 143)
  picked as `FieldLight_Create` picks it, with its material colors and clear color, without the fog.

For that, three of the field's file layouts moved, unchanged, from their `.c` files into their headers:
`FieldLightEntry` (`field_light.c` to `field/field_environment.h`), and `GFBTPValue`, `GFBTPController` and the
texture pattern animation file's `FieldTerrainTexPatAnimationPack` (`field_ground_anime.c` to
`field/field_terrain_animator.h`).

The 3D setup is the field's (`FieldG3D_InitCallback`, Z buffer as the field camera's setups have it) without fog or edge
marking. When the previewed season changes, everything the preview loaded is freed and the new season loaded again
(about 200 KB from the card), with the 3D layer darkened (`G2x_SetBlendBrightness_` on BG 0) for 2 frames and faded in
over 6, so the frame drawn with the old textures isn't seen. The banner changes after the preview's load: its palette
and characters go to VRAM at once, but its screen and scroll (`GFL_BGSysQueueScrLoad`, `GFL_BGSysMoveBGReq`) only at the
next VBlank, so its BG is off from the load until the frame after that VBlank, and the new name is first seen in its
place (its own `sBannerNameAdjustY` over `BANNER_PREVIEW_OFFSET_Y`) rather than at the last one's scroll. If a file
doesn't fit in the heap (`GFL_HeapGetHighestAllocatableSize` with a 16 KB margin, as the field's effects check) or the
textures don't fit in VRAM, the preview is freed and the top screen is the banner over the grid, as before.

**The spot and the camera** are `res/paperwhite2/season_preview.json`, which `tools/paperwhite2/season_preview.py`
turns into `build/include/generated/paperwhite2/season_preview_config.h` in a `--hack` build (its docstring has every
field): `area` (its textures, animations, lights and props), `chunks` (one to four map models and their matrix cells),
`props`, `camera` and `light_hour` (null for the time of day, or a fixed hour). A header from the JSON at build time,
rather than a file read at run time: a new file in the ROM would take a file ID before the game's or a new archive
member and its loader, while the header costs nothing at run time and is checked when it is built. The camera has the
field camera's parameters (`FieldCameraApply_TransRot`): `target` (world units, 16 a tile; a chunk's center is at
x * 512 + 256 and z * 512 + 256), `distance`, `yaw` (degrees about the target, from the south, positive to the
right), `pitch` (degrees down from the horizontal), `fov` (half the vertical angle) and `near`/`far`. Route 1's own
field camera (camera 0 of ARCID 59) is distance 237, yaw 0, pitch 53.2, fov 20, near 1, far 1024. The preview's is
target (12586, 4, 11448), 42 units east and 72 north of cell 24,22's center, distance 300, yaw 20 (the camera turned
to the right, looking a little to the left, north-west), pitch 40 (lower than the field's 53.2, so it looks a little
further), fov 20. The target is where the ground the earlier camera (yaw 30, pitch 45, target 12592, 11440) showed
stays at about the same places on the screen, so the view keeps the same stretch; the two chunks still cover the frame,
whose far corner on the left is behind the trees at the chunks' west edge.

**The shadow.** Behind the banner, the preview draws a soft shadow over the map, so that the season's name reads on the
bright grass: a dark ellipse, 208 by 80 pixels, at alpha 18 of 31 over the middle of it (within half its radius) and
fading to nothing at its edge (`SeasonPreview_LoadShadow`, the `SHADOW_` constants). It is a quad in the screen's
coordinates, in front of the map with identity matrices, with an A5I3 texture that the code makes when a season loads:
a quarter of the ellipse, 128 by 64 texels of 5-bit alpha over a black palette (8 KB of texture VRAM and 16 bytes of
palette VRAM), repeated flipped to make the whole, a texel a pixel. The app gives the preview the line of its center,
2 pixels below the banner's name's (`BANNER_SHADOW_DROP_Y`, `SeasonPreview_Create`): the lowercase letters carry most
of a name's weight. Without the preview, over the grid, there is no shadow, and without room
for it in the heap or VRAM the preview is drawn without it.

To move the spot, change `target` (x east, z south) and keep `chunks` covering what the camera sees (the zone's
matrix is `res/field/matrices/`, its models' names `generated/map_models.txt`); for a closer view lower `distance`; to
look from more to the side raise `yaw`; to look down more steeply raise `pitch` (the field's is 53.2). Another
area's spot needs that area's `area` too (`res/field/zones/<zone>.json`). Then rebuild with `--hack`.

**The menu** is the first page: Set Season, Dynamic Options and Set Hemisphere, one above the other (8,4, 8,9 and 8,14,
16 by 3 tiles), each opening its page, and Geonet's Quit button, labeled QUIT as Geonet's, at its place (23,21), which
closes the app.

**Pages.** Set Season: Spring, Summer, Autumn, Winter (a 2 by 2 grid), locking that season. Dynamic Options: Monthly,
Weekly, Daily, Real-time (two rows of two) and Chaos (centered below). Set Hemisphere: Northern, Southern (stored apart
from the mode; only real time reads it). Each has Geonet's Quit button, labeled BACK, at its place (23,21, 9 tiles wide,
with the return arrow). The current mode's or hemisphere's button is drawn in the current palette pair. The buttons are
13 by 3 tiles, with their labels centered; their places are the tables `sSeasonApp*Buttons`.

**Input.** The menu and the pages alike: a touch picks a button; the D-pad moves the cursor (up and down to the nearest
row, left and right within the row) and A picks; B picks QUIT or BACK; after a touch the first key only brings the
cursor back, as the game's task menus do. A picked button flashes, then the menu opens its page, or a page's setting is
set, the current setting's colors move to its button and the message window confirms ("The season will change to Winter
when you go outside.", "The seasons will now change each week, on Mondays."); the page stays open. BACK returns to the
menu, with the cursor on the button of the page it came from, and QUIT fades out to the field. The setting shows at the
next map change into an exterior, as the Seasons section says.

The buttons are made again only when the set of buttons changes: the menu opening a page, and Back to the menu. Their
characters go to VRAM at once, over the last buttons' (freed in the same frame), but the touch BG's screen only at the
next VBlank, and a preview's load before that VBlank takes frames: those frames showed the new characters through the
old screen, pieces of both sets. So the buttons are made last, after the message and the preview's load
(`SeasonApp_OpenPage`; until then the old buttons show whole, since the freed ones' screen and characters stay in VRAM),
and `SeasonApp_CreateButtons` turns the buttons' BG off until the frame after that VBlank (`buttonsHidden`, as
`bannerHidden` for the banner): one frame without buttons, then the new ones. A pick that keeps the page (a season, a
mode or a hemisphere) makes nothing again and hides nothing (`SeasonApp_ApplyButton`, `SeasonApp_MoveCurrentButton`):
the picked button's flash ends, and only the old and the new current buttons and the cursor's change palettes.
`AppTaskMenuWin_SetRes`, under `PAPERWHITE2` in `src/system/app_taskmenu.c` (main), moves a button to the other
resource's pair of palettes, as `AppTaskMenuWin_SetActive` shows it, so only its screen's palette numbers change, at the
next VBlank; the two resources share the frame's characters. The cursor shows on the picked button again unless the
touch screen is in use, as when a page opens.

**Replacing the button art.** The buttons are the task menus' (`AppTaskMenuWin`, `app_taskmenu.c`), with their frame
from the app's own files:

- `res/graphics/geonet/08.png`: the frame, a copy of the menus' common archive's (`res/graphics/app_menu_common/032.png`),
  24 by 72 pixels, 4bpp (at most 16 colors in its palette, or the packer makes it 8bpp, which the buttons can't use).
  Its 8 by 8 tiles, row by row: the top left corner, top, top right corner; left, middle, right; bottom left corner,
  bottom, bottom right corner; then three tiles for each icon, of which the first two are drawn at the right end of an
  icon's button (the return arrow, the BACK button's, first). A button of any width and height repeats the edges and
  the middle tile, so the frame tiles must tile. Color 0 is transparent; the label is printed over it in colors 14
  (text), 15 (shadow).
- `res/graphics/geonet/09.pal`: 32 colors, the cursor's palette, then the other buttons'. Color 6 of the cursor's
  palette pulses between two blues while the cursor is on a button (the task menus' code sets it each frame).
- `res/graphics/geonet/10.pal`: the same for the button of the current setting: with the cursor on it, then without.
  The first version's are the common palettes with amber fills and gold bevels for the current button.

Edit the PNG in indexed mode (its pixels are the palettes' indices) and the palettes as JASC files; the build packs
them (`graphics_archive.py`). Icons for the season buttons would need a new item type in the frame sheet and the
app's code to use it. The banners are the game's `res/graphics/season_banner/` (four 256 by 192, 16-color screens,
palette, characters and screen for each season), which the field's season change shows too.

**Memory.** In hack builds overlay 312 is the app and the preview only (Geonet is compiled out): 0x21e0 bytes, of
which the preview is 0x11e0. Overlay 312 shares its address with overlays 35, 69, 253, 338 and others, which are never
loaded with it; overlay 35 (0x2c40) is the largest of them, so overlays 36, 170 and 337, placed after the largest, don't
move, and overlay 312 can grow 0xa60 more before it moves them (`memory.txt` then gives the room left). The DS arena
moved only by main's 0x60 for the task menus' function.

**Heap and exit.** The app takes Geonet's heap ID (0x7c) from `HEAPID_USER`, at 384 KB (it was 256 KB; Geonet's own was
512 KB, in the same place). The preview takes about 90 KB of it for Route 1: the area's textures trimmed to 6 KB after
their upload (53 KB read), the SRT animation 13 KB, the prop bundle's textures trimmed to 4 KB (64 KB read), the two
chunks' models 41 KB, the four props 16 KB (signs, petals), the texture pattern animations 4 KB, and the 3D system's and
models' small allocations; its peak while it loads is the 64 KB of the props' textures over what is already loaded. In
VRAM the textures take 104 KB of VRAM A's 128 KB (45 KB the area's, 59 KB the props') and their palettes 4 KB of VRAM
F's 16 KB. On Quit the app frees, in order, the buttons (after their text is printed), the preview (its props, chunks,
animations, textures and VRAM, the camera and the 3D system), the button resources, the windows, the BGs, the font and
the message bank, then the BG system and the heap, and puts the display layout back (main engine on top, as the field
has it).


### Prestige levels

A trophy past level 100, the user's idea of 2026-11-05. A level 100 Pokémon in the party keeps the Exp. it would have
gained as prestige; its level stays 100 in every calculation, and only the screens show 100 plus its prestige level,
in gold, up to 999. `include/paperwhite2/prestige.h`, `src/paperwhite2/main/paperwhite2_prestige.c`.

- **Stored** in 30 bits the game never writes, `PKM_PARAM_PRESTIGE` (`poke_tool.c`): block B's 14 bits after the
  hidden ability and N's flags (PK5 0x42-0x43) and block D's two bytes before the Pokéstar fame (PK5 0x85-0x86). Bits
  0-9 are the prestige level above 100, bits 10-29 the Prestige Points toward the next: one per 10 Exp. (rounded),
  what the summary and the battle show, so the numbers stay short. The Following Pokémon's
  record uses other bytes (block B's u32 and block C's byte).
- **The curve:** the first prestige level costs the species' level 99 to 100 Exp. in points (2,970 for Medium Fast),
  and each one after costs `level_scaling.json`'s `prestige_growth_percent` (4) more, until a level costs what 20 bits
  hold (about prestige 245); `prestige_max` is 999. Medium Fast at 5,000 Exp. a battle: 101 after about 6 battles, 110
  after 70, 150 after 900, 200 after 7,000.
- **Gained** only in battle, by the party: `ServerControl_GiveExp` (`src/ov167/btl_server_flow.c`), which skips a
  level 100 Pokémon, gives its Exp. (the battlers' and the Exp. Share's, as `AddExpAndEVs` worked it out) to
  `PaperWhite2_AddPrestigeExp`. Not the Day Care. Each gain is said as Exp. is, `Bank0019_Text_GainedPrestigePoints`
  ("X gained N Prestige Points!", N the points), and a new prestige level queues `Bank0019_Text_PrestigeRose` ("X's Prestige rose
  to Lv. N!", `res/text/system/0019.txt`, the battle's standard messages) with the level in gold.
- **Gold:** a message's `{ff00:N}` with N of 256 or more is a color of its own, 256 + letter × 16 + shadow
  (`GFL_TextRndExecColorCmd`, `src/system/printsys.c`); the battle message window's palette is grays only, so
  `btlv_scu.c` puts gold in its color 15, a second black, and the message uses `{ff00:505}` (15 and 9, the text's
  gray shadow); a field system window (palette 7, the debug menu's) takes `{ff00:450}`, a talk window (palette 5)
  `{ff00:433}`. The summary and the PC box print in `PRESTIGE_PRINT_COLOR`: the standard font palette's gold (11)
  with its dark gray (1) as the shadow; the party list's plates have a palette of their own (archive 75's 0, where 11
  is green and 1 white), so `PRESTIGE_PLATE_PRINT_COLOR`, its HP bar's gold (13) and black (7). The HP box draws its
  digits in its palette's gold (9, the HP bar's) with its near-black (4).
- **The progress:** at level 100 the summary's Exp. page shows Prestige Points (all gained as prestige), To Next Lv.
  and the bar in gold (`p_sta_info.c`, `PaperWhite2_GetPrestigeProgress`); the battle's Exp. bar shows the progress
  with its blue drawn as the HP bar's gold (colors 11 and 12 to 9 and 10). A gain fills it as Exp. does: the server,
  after the "gained" message, sends `SC_PRESTIGE_FROM` (the prestige before) and `SC_PRESTIGE_GAIN` (the Exp.), and
  the client (`BattleClient_ScPrestigeGain`, `btl_client.c`) fills the gauge a prestige level at a time; at each it
  shows the new level and an empty bar (`BtlvGauge_SetPrestige`, with Type Icons' wedge off the box while the level is
  drawn, as every level redraw has it) with the level-up's sound and sparkle (effect 0x25d), then
  the "rose" message follows. A Pokémon without a gauge on the field (an Exp. Share one) gains without it.
- **Shown** in the battle HP box (`btlv_gauge.c`, set when the gauge is set, so a prestige level gained mid-battle
  shows from the next), the party list (`plist_plate.c`), the summary (`p_sta_sub.c`) and the PC box's upper screen
  (`box2_bmp.c`, from `Box2PokeInfo`). Other screens (trades, the Day Care, Join Avenue) still show 100.

### Trainer scaling

Trainers' Pokémon scale to the player's party level by their tier (`design/trainer-scaling.md` for the research and
the decisions). `include/paperwhite2/trainer_scaling.h`, `src/paperwhite2/main/paperwhite2_trainer_scaling.c`, called
by `BtlSetup_LoadTrainer` (`src/system/btl_setup.c`) right after `TrainerUtil_LoadParty`, so every battle with a
trainer of `ARCID_TRDATA` takes it, a wild multi battle's partner too.

- **The data:** `res/paperwhite2/trainer_scaling/trainer_scaling.json` (its schema beside it), made into
  `paperwhite2/trainer_scaling_config.h` by `tools/paperwhite2/trainer_scaling.py`, whose `preview TRAINER PARTY_LEVEL
  [BADGES]` prints a trainer's party scaled. Its tiers: `normal` (ace 2 below the party level, none lower than 5
  below), `strong` (0 and 3 below: the Gym Leaders, Hugh, Cheren and Bianca as trainers, N, Colress, Zinzolin, the
  Shadow Triad), `boss` (1 above and 2 below: the Elite Four, the Champion, Ghetsis) and `ally`; every other class is
  `normal`, and the guest and facility classes (Subway Bosses, Boss Trainers, Benga, the other regions' leaders and
  champions, Alder, Cynthia, Lenora) are `fixed`. A trainer can take another tier (`trainers`).
- **The rule:** the basis is the party's level (`Conditions_PartyLevel`), at least `badge_floor` for the badges
  (`setup->unk98`, which `BtlSetup_LoadGameData` sets): 5, 11, 16, 22, 28, 31, 37, 46, 49, the lowest level of the
  last Gym Leader beaten. The team's highest level goes to the basis + `top`; each other Pokémon keeps its original
  gap below it but goes no lower than the basis + `bottom`; with `below_original` false it stays at least at its own
  level (true for every tier now); all from 1 to 100, with the Exp. of the level and the stats
  (`PokeParty_RecalcStats`). Species, moves, items, abilities and the PID stay as loaded. Client 2, a partner on the
  player's side, takes `ally_tier`.
- **Left alone:** trainer ID 0 (facilities, Pokéstar Studios) and Battle Institute IDs (from 0x500), a zone of an area
  that `AreaData_IsInfinityDungeon` (the Black Tower's and White Treehollow's bosses), the PWT (its own loader), link
  battles. Funfest mission battles do scale, then add the mission's levels (the Entralink is to be reworked).
- **Then the difficulty** (below) adds its levels to the opponents, not the partner.
- **The editor:** the Trainer Editor's Level scaling card shows the trainer's tier (set apart from its class's there,
  saved with the trainer) and its party at a party level and badge count on each difficulty
  (`editor/src/modules/trainers/scaling.ts`, with a test).

### Difficulty

Easy, Normal or Challenge, the key system's `GAME_DIFFICULTY_*`, kept where it kept it (`GetGameDifficulty`), so the
original's scripts that give the Gym Leaders, the Elite Four and the Champion their Challenge Mode teams
(`GameGetDifficulty`, 13 scripts) see it. `include/paperwhite2/difficulty.h`,
`src/paperwhite2/main/paperwhite2_difficulty.c`.

- **The new game asks** once the rival's name is right (`src/ov294/intro_script.c`, `sScriptDifficulty`, with the
  command `INTRO_CMD_CHOOSE_DIFFICULTY` in `intro_cmd.c` and a menu window as tall as its items in `intro_msg.c`);
  `game_start.c` puts the choice in the save after the outside data. Its text is
  `res/text/system/game_start.txt`'s `GameStart_Text_Difficulty*` (the question, EASY, NORMAL, HARD, and the line
  after); the menu lists NORMAL first, so pressing A through it keeps the default.
- **The Options screen** (`src/ov140/config_panel.c`) has DIFFICULTY: EASY / NORM / HARD on Save Before IR's row,
  laid out as the text speed's (`config_panel_work.h`: 12 values, `OPTION_DIFFICULTY`). Its text is
  `res/text/system/title_2.txt`'s `Title2_Text_Difficulty`, `_Easy`, `_Norm`, `_Hard` and `_CanChooseDifficulty`.
  Save Before IR is gone with the wireless modes: `Config_GetSaveBeforeIR` is always 0 (no save) and a new config
  starts at 0.
- **Levels:** the original's change of the shown level by the zone's offset (`adjustPkmLvForChallengeKeys`), which
  left the stats as they were, is off. `PaperWhite2_ApplyDifficulty`, after it in `EventTrainerBattleCall_Create`
  (`src/ov012/event_battle.c`), changes the opponents' Pokémon (clients 1 and 3, not a multi battle's ally) by
  `res/paperwhite2/level_scaling.json`'s `difficulty_easy` (−4), `difficulty_normal` (−1) or `difficulty_challenge`
  (+2), from 1 to 100, with the Exp. and stats of the level, after trainer scaling. The Trial House's battles are
  left alone.
- The Continue screen still shows a difficulty other than Normal in its key system box.

### Conditions

The shared conditions engine of `design/conditions.md` (phase 1: the engine, the script commands and the debug
readout; no consumer uses it yet). It answers "does this apply right now?" for the encounters, the NPC spawns, the
follower's rules and the Dexnav to come, with one condition format, one binary encoding and one matcher.

**The format.** `res/paperwhite2/conditions/condition.schema.json` defines `$defs/condition` (every field optional,
all of them must hold, a list is any of its items), `$defs/rule` (`when`, `priority` 0-255, default 0, `weight`
1-65535, default 1), `$defs/rule_set` (a table's `share` and named `rules`), and the files beside it:

| Field | Reads | Example |
| --- | --- | --- |
| `season` | the field's season, `GameData_GetSeason` | `["spring", "summer"]` |
| `time` | `GetRealTimeDayPeriod(season)`: morning, day, evening, night, late_night | `["night", "late_night"]` |
| `weather` | the zone's computed weather, `GetNowWeather` | `["WEATHER_RAIN"]` |
| `flags` | `set` and `unset` lists of event flags | `{"set": ["EVENT_FLAG_DEBUG_ALWAYS_SHINY"]}` |
| `vars` | saved variables against values, `=`, `!=`, `>=`, `<=`, `>`, `<` | `[{"var": "EVENT_WORK_...", "op": ">=", "value": 3}]` |
| `zone`, `zone_group` | the zone; a group of `zone_groups.json` (zones whose header's parent is listed, plus `zones`) | `["castelia"]` |
| `exterior` | `AreaData_IsExterior`, from the field | `true` |
| `terrain` | the groups of `terrain_groups.json` of the subject's tile, from the field | `["grass", "dark_grass"]` |
| `party_level`, `scaled_level` | the party's level, the adjusted party level | `{"min": 20, "max": 40}` |
| `level`, `species` (with an optional `form`), `type`, `nature`, `hp` (percent), `status`, `friendship`, `steps` | the subject: the lead (party slot 0) for encounters and spawns, the follower for its rules | `{"min": 20}` |
| `follower` | `true` (one is out), `false`, or species | `["SPECIES_PIKACHU"]` |
| `total_steps`, `item_waiting` | the subject's total steps and whether it keeps an item, which the consumer gives (the follower's record, following-pokemon.md) | `{"min": 1000}`, `true` |
| `facing`, `tile_x`, `tile_y` | the position the consumer gives: the subject's facing (the follower's, toward the player) and the player's tile; a part of its own (`CONDITION_CONTEXT_POSITION`) | `["left", "right"]`, `{"min": 10, "max": 14}` |
| `chance` | a percent rolled each check | `25` |

`terrain_groups.json` lists the 18 groups in bit order (grass, dark_grass, tall_grass, surf_water, shore,
shallow_water, puddle, swamp, sand, snow, ice, cave, leaves, bridge, ground, indoor, outdoor, encounter), each by tile
classes, tile flags (`TILE_FLAG_WATER`, `TILE_FLAG_ENCOUNT`) or the area's exterior, so a tile can be in several.
`zone_groups.json` has `castelia` (Castelia City's parent group, 37 zones) and `castelia_sewers`; custom groups come
with the editor.

**The compiler,** `tools/paperwhite2/conditions.py`, is a library for the consumers' packers and the build's commands:
`archive` (below), `table` and `dump` for one table, and `terrain-header`, `level-scaling-header` and `script-header`
for the generated headers in `build/include/generated/paperwhite2/`. It resolves names through `generated/` and
`include/constants/` (`tools/data/datajson.py`), the weathers from `include/system/zone_weather.h`, the tile names from
`include/field/field_map.h`, and the kinds' and ops' numbers from `include/paperwhite2/conditions.h`, so the C and the
compiler can't disagree. `configure.py --hack` wires it: `HACK_ARCHIVE_MEMBERS` packs the weather calendar apart and
then runs `archive` on it, and the three headers are `constants_headers`. The matching build runs none of it.

**The binary layout** (little-endian):

| Part | Layout |
| --- | --- |
| Table header, 12 bytes (`ConditionTable`) | u32 magic `PWCT` (0x54435750), u8 version 1, u8 share (percent), u16 rule count, u16 list count, u16 size in bytes |
| Offsets | a u16 per rule then per list, from the table's start, each a multiple of 4; padded to 4 |
| Rule (`ConditionRule`) | u8 clause count, u8 priority, u16 weight; the clauses; the consumer's payload up to the next rule, the first list or the size (a rule set's is the rule's ASCII name and a 0, padded to 4) |
| Clause, 8 bytes (`Condition`) | u8 kind (`CONDITION_KIND_*`), u8 op (`CONDITION_OP_*`), u16 arg, u32 value |
| List | u16 count, that many sorted u16s (zones, or species entries), padded to 4 |

Each field compiles to one clause: the season, time, weather, terrain, type, nature and status to `MASK` (a bit per
value in `value`); a flag to `SET` or `UNSET` with the flag in `arg`; a variable to `EQ`...`LT` with the variable in
`arg` and the value in `value`; one zone, species or follower species to `EQ` with it in `arg`, several to `IN_LIST`
with the list's number in `arg` (identical lists are shared, and a zone group is its zones' list); the exterior to `EQ`
with 1 or 0; `follower: true` and `item_waiting: true` to `ANY`; the facing to `MASK`; a range to `RANGE`, the least in `arg` (0 by default) and the greatest in
`value` (0xffffffff by default); a chance to its percent in `value`, always the last clause. A species entry is the
species, plus (form + 1) << 11 for one form. A table holds 256 rules at most.

**Where the tables are.** New members of the weather calendar's archive, `a/0/9/6` (`ARCID_CALENDAR`,
`CONDITION_TABLE_ARCHIVE`), after its two files, which `Calendar_Preload` reads as before: member 2
(`CONDITION_TABLE_MEMBER_DEBUG_SAMPLES`) is `debug_samples.json`, member 3 (`CONDITION_TABLE_MEMBER_SCRIPT`)
`script_conditions.json`. It is the world-state archive (weather by date), small, and loaded only on demand. The
consumers' own tables will go with their data (the encounters' and spawns' in their archives).

**The C API** (`include/paperwhite2/conditions.h`):

- `src/paperwhite2/main/paperwhite2_conditions.c` (main): `Conditions_Hash` (MurmurHash3's finalizer of
  `a * 0x9e3779b1 + b`, now also the weather date's), `Conditions_Random` (an LCG step whose state is mixed by the hash),
  `Conditions_Seed`, the table's checks and accessors, `Conditions_MatchRule`, `Conditions_Select`,
  `Conditions_PartyLevel`, `Conditions_ScaledLevel` and the wild range. It reads nothing but the context and the table.
- `src/paperwhite2/main/paperwhite2_conditions_context.c` (main): `ConditionContext_Init`, `FillWorld` (season,
  period, weather, zone, parent, the event work, the zone-load counter, the save clock's day number and the seeds),
  `FillSubject`/`FillLead` (species, form, level, types, nature, friendship, HP %, status, steps), `FillParty` (party
  level, adjusted level), `FillGame` (all three), `Conditions_OnZoneInit` and `Conditions_LoadTable`.
- `src/paperwhite2/ov036/paperwhite2_conditions_field.c` (the field): `Conditions_TerrainGroups(tile, exterior)`,
  `ConditionContext_FillField` (the exterior, the terrain under the player, `FieldPlayer_GetTileTypeUnder`, and under
  the follower, `PaperWhite2_FollowingGetTile`, which the follower's terrain update keeps; its species) and
  `ConditionContext_SetTerrain`.

A caller fills the parts it needs; a clause on an unfilled part fails. **Selection:** the matching rules are grouped
by priority, highest first; a group is picked from by weight in `share` percent of the checks (100 always), else the
next lower group is tried, and the lowest group that matches is always picked from. **Seeds:** `CONDITION_SEED_LOAD`
is `Conditions_Hash(loadSeed, key)` with `loadSeed = Conditions_Hash(zoneLoadCounter, zone)`; `CONDITION_SEED_DAY`
the same with `Conditions_Hash(dayNumber, zone)`; `CONDITION_SEED_CHECK` draws `GFL_RandomLC(0)`. A key shared by
groups gives them the same pick (the keyed seed).

**The zone-load counter** is `EVENT_WORK_ZONE_LOAD_COUNTER` (0x4051), which `tools/paperwhite2/var_usage.py` (the
variables' survey, beside `flag_usage.py`) found unused with 0x4052-0x406f. `FieldScript_CallOnZoneInit`
(`src/ov012/script_sys.c`) bumps it under `PAPERWHITE2` before the zone's init scripts: every map change and seamless
zone change, not a battle or a menu, so the load seed holds until the next zone load, and after a save and continue.

**Level scaling.** `res/paperwhite2/level_scaling.json` (`paperwhite2/level_scaling_config.h`).

- **The party's level** (`Conditions_PartyLevel`) is the level of the Pokémon doing the battling, Eggs left out. Of
  the `party_top` (3) highest levels, the highest is the ace. Each of the others pulls it down by its gap from the ace
  while the gap is within `party_band` (20) percent of the ace's level, then less and less, to nothing at twice that;
  the average pull, rounded up, comes off the ace's level. So close battlers lower it for a fair fight, and a Pokémon
  too weak to battle doesn't: 80, 74, 73 gives 75; 80, 64, 64 gives 69, the most it can fall (about 13%); 80, 7, 5
  gives 80; 62 and five Eggs gives 62. A missing member pulls nothing. The user chose it on 2026-11-04 for playtesting
  (`design/trainer-scaling.md`); the Encounter Editor's Settings tunes both numbers and tries a party.
- **The adjusted party level** (`Conditions_ScaledLevel`) is the party's level changed by `percent` of it (rounded
  toward it) but by no more than `cap` levels, plus `offset`, from `min` to `max`: a percent at low levels, a flat
  change at high ones. Wild levels go `spread_percent` of the party's level (rounded, from `spread_min` to
  `spread_max`, `Conditions_WildSpread`) either side of it, within 1 to 100. The file has 60%, a cap of 10, offset 0,
  2-100, and a spread of 15% from 1 to 5, to fit the user's table (2026-11-05): a party level of 5 gives wild levels
  2-4, 10 gives 4-8, 20 9-15, 30 15-25, 50 35-45, 80 65-75, 100 85-95.

**Script commands,** in every hack build, before the debug menu's so its removal leaves their IDs:

| Command | ID | What |
| --- | --- | --- |
| `GetPartyLevel kind, result` | 0x2f3 (755) | `PARTY_LEVEL_BASE` (0, the party's level), `_ADJUSTED` (1), `_WILD_MIN` (2), `_WILD_MAX` (3) (`paperwhite2/condition_script.h`) into the variable |
| `CheckCondition id, result` | 0x2f4 (756) | 1 if the condition holds now, else 0; `id` is a `SCRIPT_CONDITION_*` of `paperwhite2/script_conditions.h` |

`res/paperwhite2/conditions/script_conditions.json` names CheckCondition's conditions: `night`, `daytime`, `raining`,
`snowing`, `outdoors`, `in_grass`, `on_water`, `spring` to `winter` (`SCRIPT_CONDITION_NIGHT` 0 and so on, by place:
add new ones at the end). The context is the world, the lead, the party and the field. A script includes the headers
under `PAPERWHITE2`, since only the hack's build generates the second:

```
#ifdef PAPERWHITE2
#include "paperwhite2/condition_script.h"
#include "paperwhite2/script_conditions.h"
#endif
    GetPartyLevel PARTY_LEVEL_ADJUSTED, 0x8000
    CheckCondition SCRIPT_CONDITION_NIGHT, 0x8001
```

The handlers are `src/paperwhite2/ov012/paperwhite2_condition_commands.c`, declared in
`include/paperwhite2/condition_commands.h`, with rows in `EVCMD_TABLE` and `EVCMD_PERM_TABLE` under `PAPERWHITE2` and
`"hack"` entries in `tools/script/field_commands.json`; the debug menu's `Debug` moved to 0x2f5 (757), then to 0x2f6
(758) for `ReloadMapHere`.

**The debug readout:** Conditions in the START menu (Debug menu, above): the world (season, time, weather, zone and
place, parent zone and place, indoors or outdoors, the terrain groups under the player and under the follower, the
follower), then the lead (species, level, HP %, status, nature), the party level, the adjusted level and the wild
range, the zone loads, the load seed, the day number and the day seed; then each of `debug_samples.json`'s rules (night,
rain, spring or summer, Castelia, lead level 20+, Always shiny on, zone loads 10+, grass outdoors, and a default at
priority 0) with yes or no, three a message; then the pick of `Conditions_Select` with a check seed (and the seed), with
the load seed twice (the same pick) and a keyed seed. Its actions are `DEBUG_ACTION_CONDITIONS_WORLD` to `_PICK`
(34-37). To test: open it outdoors and in a building (Outdoors/Indoors, `outdoor`/`indoor`); in Route 20's grass and
dark grass, on Virbank's puddles, in a cave, on Desert Resort's sand, in Icirrus's snow (the terrain); set the time and
weather overrides in World (Night and Rain become yes); toggle Always shiny (its rule); walk through ten zone changes
(Zone loads 10+; the load seed changes with each, and stays across a battle); in Castelia's buildings (Castelia yes);
reorder the party (the lead and its level); compare the party level and adjusted level with the party's levels.

**Tests.** `python3 -m unittest tools.paperwhite2.test_conditions` compiles `paperwhite2_conditions.c` unchanged with
the host's clang or gcc against stubs of the game's headers (u32 32 bits wide) and drives it through ctypes: every
clause kind at its edges (each season and period, each variable op at the value and either side of it, ranges at their
bounds, species by form, either type, unfilled parts), the samples' tables, the chance's and the weights' distributions
by chi-squared, the share's fraction, priority order, stability under a seed, the party level (the user's examples), the level scaling's defaults,
the hash's identity with the weather date's, and the compiler's round trip, layout and bad names.

**Memory.** About 4.8 KB of the arena's budget (155 KB left before, 150 KB after): main 0x920 bytes (the matcher and
selection 1.6 KB, the fills and loading 0.7 KB), overlay 12 0x720 (the commands 0.25 KB, the spawns' empty stubs, the debug readout about
1.5 KB, which goes with `PAPERWHITE2_DEBUG_MENU`), overlay 36 0x2e0 (the terrain table and the field fill). The tables
are read into the script's heap for each check and freed: 332 and 268 bytes now. `Conditions_Select` keeps 32 bytes
of match bits on the stack.

### NPC spawns

The zones' NPCs' conditions and instances (`docs/paperwhite2/design/overworld-editor.md`, the research's option C),
edited in the Overworld Editor.

- **Data:** `res/paperwhite2/overworld/<zone>.json` (`overworld.schema.json`): for an NPC of the zone's events, by
  its id, a `when` (the conditions' format) under which it appears, and `instances`, the NPCs its record can be, each
  with a `when`, a `weight` and a whole NPC record (`res/field/events/events.schema.json#/$defs/npc`). An NPC with
  instances is their host: its own fields are unused.
- **Packing:** `tools/paperwhite2/overworld.py archive` (`HACK_ARCHIVE_MEMBERS`) adds a member after the events'
  archive's own files (a/1/2/6): a header, a zone's entry each, then a conditions table a zone, whose rules' payloads
  name the NPC (a condition) or the host and carry the instance's 36-byte record. `overworld.py dump MEMBER` lists one.
- **At zone entry,** `Spawns_OnZoneInit` (`src/paperwhite2/ov012/paperwhite2_spawns.c`, from
  `FieldScript_CallOnZoneInit` after the zone-load counter and before the init scripts and `SpawnAllZoneNPCs`) reads
  the zone's table into the game event heap's tail, fills a context (the world, the lead, the party), and gives each
  NPC with rules (its condition, then its instances, one after another) the record it should have now:
  - hidden, with `EVENT_FLAG_SPAWN_HIDDEN` (0x930, set at every zone entry) as its spawn flag, where its condition
    fails, or for a host where no instance holds;
  - for a host, an instance written into its record (its id kept), picked by weight among those whose conditions hold
    and whose own spawn flags aren't set.
  Its rolls (a chance's and the pick) start from the seed its `rolls` names, keyed by its id, a byte of each payload:
  the hour's (`CONDITION_SEED_HOUR`, the default), the day's, the time of day's or each entry's (the load seed). The
  hour's and the time of day's seeds mix in the day. It stores the picks' key, `Spawns_PickKey` (the day, the hour
  and the time of day, hashed), in `EVENT_WORK_SPAWN_PICK` (0x4058). The field then creates, talks to and saves the
  NPCs as its own; a continued game takes them from the save, and a battle or a menu keeps them.
- **In the zone,** `PaperWhite2_SpawnsUpdate` (`src/paperwhite2/ov036/paperwhite2_spawns_field.c`, from the field's
  update after the actors') compares the key for now with the stored one once a second while no event runs (a script,
  a talk, a trainer's sight, a menu). On a change, `Spawns_Repick` reads the table again and works out each NPC's record
  for now. An NPC whose record should change is changed only while it, and where it would appear, are out of the
  camera's view: its box's middle tested against the field camera's perspective, two tiles past its edges, so camera
  areas and the vanilla camera alike; a rail NPC without an actor counts as in view. Its actor is removed
  (`DeleteActor`), its record written, and its actor made again if it shows (`SpawnZoneNPCByUID`). An NPC with only a
  condition has only its spawn flag changed, its original one read back from the zone's entity file, so an init
  script's changes to its record stay. The key is stored once every NPC has its record; until then the rest are tried
  again each second.
- **Groups** (`res/paperwhite2/overworld/groups.json`, `groups.schema.json`; docs/paperwhite2/design/overworld-editor.md,
  Groups): at most one member of a group appears at a time. A member, an NPC's entry (the whole NPC), an instance or
  an ambient, names its group with `"group": {"id", "weight"}`; a group has a name, an optional home zone, `rolls` and
  a `nobody` weight. `overworld.py` adds to each zone's table, after its own rules, each group it has a member of: a
  header rule (payload kind 4: its seed, its index in groups.json, its nobody weight and members' count), then every
  member's parts (kind 5), the rules its own zone works out for it in that zone's order, wherever it is. Before the
  NPCs and ambients are worked out (`Spawns_OnZoneInit`, `Spawns_Repick`, `Spawns_GetAmbients`), `Spawns_GroupDenied`
  works out each member as its own zone would (`ConditionContext_SetSeedZone`: that zone's seeds, the same key and
  order of rolls, so its chance is the same everywhere), picks one by weight or nobody from the group's seed with no
  zone (`SPAWNS_GROUP_SEED_ZONE`, keyed `SPAWNS_GROUP_KEY` plus its index), and denies the zone's members it didn't
  pick: an NPC is hidden, an instance leaves its NPC's pool, an ambient doesn't show and takes none of the 8 places.
  A group with members in several zones can't roll each entry (the packer refuses it); a zone has at most 64 members
  of groups. The debug menu's Conditions, Spawn groups lists the zone's groups: each one's index, how many of its
  members can appear and its pick.
- **Not yet:** a script's `SpawnRefresh`, and NPCs walking off when their time is over.

### Ambients

Sprites drawn without an actor on paths round their places (`docs/paperwhite2/design/overworld-editor.md`, Ambients),
edited in the Overworld Editor's Ambients tab.

- **Data:** `ambients` in `res/paperwhite2/overworld/<zone>.json` (`overworld.schema.json`): each a sprite (an
  `OBJ_CODE_*`) or a set of up to 4, a tile, an offset in it and a height in the world in units, a facing, a path (`perch`, `hover`,
  `ellipse`, `line`, `eight`, with its width, depth, speed and start, or a perch's turns, hops and how often), a shadow
  (none, under its feet, or on the ground below), a `when` and `rolls`. A zone has up to 32 (`SPAWNS_AMBIENT_LIST_MAX`) and
  shows at most 8 at once (`SPAWNS_AMBIENT_MAX`), streamed: those whose conditions hold and whose paths come nearest
  the player, a group's one at most (below); the Overworld Editor warns where more than 8 can hold near one place.
- **Packing:** `overworld.py` adds each as a rule of the zone's table: payload kind 2, its seed, its index, then its
  36-byte record (`SpawnAmbient`, `include/paperwhite2/spawns.h`). `Spawns_GetAmbients` picks a set's sprite with the
  roll its chance was rolled with, so the pick holds as long as the chance does.
- **Streaming** (`Ambients_Stream`, every 8 frames): at the zone's entry, or the field's making again, the ambients
  whose rules hold are its candidates (up to 32), each with its path's area round its place (`Ambients_Area`: an
  ellipse's, an eight's, a wander's and a surface's sizes either way, a line's to its end, a waypoints' points, a
  fly-over's range). A candidate joins, nearest first, while fewer than 8 are made, once its area comes within 14
  tiles east or west and 11 north or south of the player, where its place on its path is out of view (more than 9 and
  7 tiles off; a loop joins where it would be had it run since the zone's entry, `Ambients_JoinPos`; at the entry, in
  view too, behind the fade). One leaves once its area is past 16 and 13 tiles, never while it reacts or a fly-over
  passes: its billboards deleted, its sprites given back (`Ambients_Leave`). One that fled and doesn't return stays
  gone until the zone is entered again; one that returns is back at its place when it joins again.
- **In the field,** `PaperWhite2_AmbientsUpdate` (`src/paperwhite2/ov036/paperwhite2_ambients.c`, from the field's
  update after the actors'): when the zone, or the field's billboard system (made again after a battle or a menu), is
  new, the zone's ambients whose rules hold (`Spawns_GetAmbients`, keyed past every NPC's id) each get a billboard of
  their sprite from the actor system's cache, as reflections are (`FldBillboardActor_AddActorPosOrReserve`, with the
  object code's config from `GetNPCMdlInfoForOBJCODE`). Every frame each is placed on its path, at the field's actor
  height offset, and given its animation (standing or walking, by its facing turned by the camera's angle, set only
  when it changes). A shadow is the actors' oval (`FldeffShadow_GetMaterial`, an `#ifdef PAPERWHITE2` accessor in
  `fldeff_shadow.c`, gives the effects' billboard system and the shadow material), made as `FldeffShadow_Init` makes
  one and placed each frame: at its place's height (under its feet, a hop leaving it), or on the highest collision
  layer at or below it (`FieldG3DMapper_GetTerrainAll`), hidden where there's none. No actor, task, event or save
  entry; nothing collides with them.
- **Sprites not loaded** (`#ifdef PAPERWHITE2` in `field_actor_billboard.c`): reflections always find their actor's
  sprite loaded, so the original `FldBillboardActor_AddActorPosOrReserve` drew a billboard with no material for a code
  that isn't (an empty slot's or another sprite's). It now waits for the sprite, loaded on demand as an NPC's is. An
  ambient is made only where `FldBillboardActor_CanLoadObjCode` finds its sprite loaded, on its way, or a cache entry
  free (counting loads still on their way); where the cache is full it doesn't show. An NPC's going keeps a sprite an
  ambient uses (`PaperWhite2_AmbientsUseObjCode`, checked in `FieldBillboardActor_UnbindActorObjCode`), and a zone
  change cancels an ambient's load still waiting (`FldBillboardActor_CancelPendingPos`) and unloads a sprite loaded on
  demand that no actor, ambient or waiting actor uses (`FldBillboardActor_ReleaseObjCode`).
- **Sprites by condition:** a sprite of its set can have a condition (`{ "sprite", "when" }`), packed as a rule of its
  own straight after the ambient's (`SPAWN_KIND_AMBIENT_SPRITE`, its payload the object code): while any of those
  holds, `Spawns_GetAmbients` picks among them by its roll, otherwise among the plain ones (none: it doesn't show). A
  Taillow in spring and a Pidove otherwise is a Taillow with a spring condition and a plain Pidove.
- **Traveling paths** (`Ambients_Travel`): `wander`, tile to tile on the ground (its height over the ground kept)
  within `width` and `depth` of its place, a pause of about `every` seconds (3); `waypoints`, from its place to each
  of up to 6 `points` (units from it) and round, or `back` the way it came, at its `pace` (tiles a second, 2), waiting
  `wait` seconds at each; `peek`, under the ground for `wait` and up for `up` seconds (4 each), rising and sinking
  over 8 frames, out of sight (no sprite, no shadow, no reaction) while down; `surface`, as a peek, bobbing while up
  and coming up elsewhere in its area; `flyover`, while the player is within `range` tiles (12) of its place, every
  `wait` seconds or so, across the screen from 14 tiles before the player to 14 past, `height` units over it (64), at
  its `pace`, on its `heading` or a new one each pass, its shadow on the ground. The Overworld Editor draws a wander's
  or a surface's area and a waypoints path's stops, and previews them all (a fly-over over its own place).
- **Reactions** (`react`): when the player comes within `near` tiles (3), or `startle` (near + 2) while it runs or
  cycles, and no event runs, it flies away (up at its `climb`, 30 degrees, its shadow on the ground), runs away (along
  the ground) or hides (sinks 20 units over 12 frames): on its heading, away from the player
  (`FX_Atan2Idx` of the way from the player to it) or its `direction` (degrees clockwise from north), varied at random
  by its `spread` either way (20), at its `speed` (6 tiles a second). It may change to another sprite as it reacts
  (`sprite`, loaded with it and hidden until then, so a sitting Pidove becomes the follower's flying one), show a
  bubble (`emote`: the field's four, over it with `FldeffEmotionBubble_SetPos`) and give a cry (`cry`, a species). It's
  gone after 4 seconds or 12 tiles from the player; with `returns`, it comes back after `min` to `max` seconds counted
  while the player is past its startle radius and 2 tiles more from its place, unseen once that's off the screen;
  without, not until the zone is entered again. A line can also climb (`path.height`, units), straight up with no width
  or depth.
- **A perch's turns** go to the directions its `faces` names (all four without it): a bit each in the record's flags
  from `AMBIENT_FLAG_FACES_SHIFT`, which `Ambients_PickFacing` picks among at random.
- **In the editor:** each ambient's path is drawn round its place at its height (brighter when chosen), and the map's
  Movement preview moves them as the game does (`editor/src/modules/overworld/ambientPath.ts`, after `Ambients_Move`:
  the paths, the facing from the way it goes, a perch's turns among its faces and its hops, a walking Pokémon's two
  frames always playing); `tests/ambient-path.test.ts` checks it against the formulas.
- **Not yet:** flying off when the player comes near, picking again in the zone, and sprites from the encounters.

### Wanderers

Wild Pokémon seen in tall and dark grass (`docs/paperwhite2/design/overworld-editor.md`, Overworld encounters), up to
3 at once, drawn as the ambients are, without an actor (`src/paperwhite2/ov036/paperwhite2_wanderers.c`,
`include/paperwhite2/wanderers.h`, from the field's update after the ambients'). Stage 1: spawning, rising and
sinking, random wandering, the touch and the battle.

- **Spawning:** every 2 to 4 seconds while fewer than 3 are out (a second after a try that found no grass), a grass
  tile within the screen's 8 by 6 tiles round the player and at least 3 tiles from it, not beside another wanderer, picked
  among every such tile (those ahead of the player, the way it faces, 3 times as likely; those 3 or 4 tiles from the
  nearest other wanderer twice as likely, 5 or more four times), whose encounter type is `ENCTYPE_GRASS` or `ENCTYPE_GRASS_RARE`
  (`EncSys_GetTileEncType`, the step's `FieldEncount_DecideTypeByTerrain`). Its Pokémon is the one a step there would
  bring (`EventWildBattleCall_PickWanderer` in `field_encount.c`: `FieldEncount_GenWilds` with one Pokémon, no
  partner and through a Repel, the new encounter data's context and the debug overrides). Its shininess is rolled
  as a wild one's (its rolls of a PID, the Shiny Charm and the Pass Power's, the debug Always shiny) and its sex
  from its species' ratio (Cute Charm aside), and both are set in its `WildPkmParam` for the battle
  (`WILD_SHINY_FORCED` or `NEVER`, `WILD_SEX_*`). Its sprite is its follower sprite for its species, form, sex and
  shininess (`PaperWhite2_FollowingCodeFor`, the follower's registry match without its side effects), loaded on
  demand where the sprite cache has room (`FldBillboardActor_CanLoadObjCode`).
- **Rising and sinking:** from 20 units under its tile's ground over 12 frames (the ground hides what's under it),
  and back down at the end of its 20 to 40 seconds, where its tile has grass (`0x20`). Where it has none (a cave's
  floor, sand), it appears in a dust cloud instead, cut off after a second as it shows. It goes from sand or snow
  (tiles that take marks, `0x08`) by sinking in as from grass, in the landing puff (`FldeffDust_StartAt`), and from
  other ground (a cave's floor) in a whole dust cloud, gone a third of the way in: the rustling spots' dust cloud
  played once, with its sound
  (`SEQ_SE_FLD_73`), by `EncountTask_PlayOnceAt`, an `#ifdef PAPERWHITE2` task in `fldeff_encount.c` that draws the
  phenomenon's shared model at its own frames and puts the model's back after, so a real dust cloud nearby plays on
  as it was. Where a field has no dust cloud, the landing actors' puff (`FldeffDust_StartAt` in `fldeff_dust.c`) for 4
  frames. How it goes is by the tile it's on then. Past 11 tiles from the player it goes at once, and after 2
  seconds off the screen (9 by 7 tiles round the player), unseen, so the ones left behind make room.
- **Wandering:** a step every 20 to 80 frames onto a neighbouring tile of the same encounter type, at most 8 units
  higher or lower, that no actor or other wanderer is on or walking to, and not beside the player (where the
  follower walks), over 12 frames, facing its way, its animation always playing.
- **Solid, and the touch:** `CheckActorNewPosOtherActorCollision` (ov012's `field_actor_tool.c`) blocks any actor's
  step onto a wanderer's tile or the one it walks to (`PaperWhite2_WanderersCheckGridCollision`); the player's step
  onto one touches it, as one stepping into the player does. The touch waits for the player to be free (no event, not
  mid-step; given up after 2 seconds), then the grid's event check (`fieldmap_event.c`, after the follower's) starts
  its event: the two face each other, its cry plays with a "!" over the one walked into, the surprised one (over the
  wanderer `FldeffEmotionBubble_SetPos`, an `#ifdef PAPERWHITE2` bubble over a place in `fldeff_emotion_bubble.c` that
  ends itself; over the player the actor's bubble), and as the "!" ends (36 frames) the single
  battle with it. It stays on the field through the battle's transition; the field's closing
  (`PaperWhite2_WanderersReset` before `FieldEffects_Free`) clears them
  (`EventWildBattleCall_CreateWanderer`: `FieldEncount_SetupNormal` with one Pokémon, then
  `EventWildBattleCall_CreateCore`).
- **None** on rails, with a partner, or with the debug menu's No wanderers; all go at a zone change, and the field's
  making (`FieldRoutine_Open`, `PaperWhite2_WanderersReset`) starts from none, as after a battle or a menu.
- **Effects:** it stands in its grass as an actor does: the actors' grass (`FLDEFF_GRASS`) at its tile
  (`GrassTask_StartAt`, an `#ifdef PAPERWHITE2` grass without an actor in `fldeff_grass.c` that stays until its owner
  deletes it), its kind by the tile and the season (`ActorTerrainEffect_GetGrassKind`: dark, the C grasses, snowy).
  It shakes as one rises (with the rustle's sound, `SEQ_SE_FLD_70`), as it sinks (again with the sound) and on each
  tile it steps onto, on one tile only, as an actor's: going down or sideways it moves to the new tile as the step
  starts, going up once it's there. On ground that takes marks (`0x08`) a step leaves one on the tile it starts
  from, as an actor's (`ActorTerrainEffect_Footmark`'s choice, by the ground, the season and the model's footprint
  type; `Footmark_StartAt`, an `#ifdef PAPERWHITE2` mark at a tile in `fldeff_footmark.c`): tracks in deep sand,
  footprints in sand and snow. In deep sand it stands 7 units sunk in, as actors do (`ActorTerrainEffect_DeepSand`),
  from each step's start; like them, it has no shadow there (none of its tiles has the shadow flag, `0x80`), as it has
  none anywhere. One that floats (`grass` false) leaves no marks and doesn't sink. A shiny one sparkles (the Join Avenue's sparkle,
  `FldeffFesSparkle_Start` and `_Show`, which every field loads) for half a second as it rises and every 5 seconds
  while it's out; silent for now.
- **Shiny sprites:** 975 of the followers' shiny rows are placeholders (`"placeholder": true`), the normal sprite in
  the registry, from the imported pack; a shiny wanderer (or follower) of such a species looks normal but sparkles.
- **Per species** (`res/paperwhite2/encounters/species/<species>.json`'s `overworld`, the Encounter Editor's
  Overworld card; packed as a byte a species in the encounter member's species table,
  `PaperWhite2_Encounters_GetSpeciesOverworld`): `appears` both (by default), steps (a wanderer's slots leave it out,
  `PaperWhite2_Encounters_SetForWanderer` around the pick) or overworld (a step's leave it out), the others' weights
  filling its share; `wanders` random (by default), aggressive (within 5 tiles of the player, steps that bring it
  nearer, at 8 frames a tile with pauses of 6 to 20, and may come beside the player to walk into it) or passive
  (within 4 tiles, steps that take it away, never into the player); `grass` false for no grass under it.
- **Repel:** while one is on, a wanderer weaker than the first Pokémon that can battle wanders as a passive one does
  and never walks into the player (who can still walk into it), as a Repel keeps a step's away. None goes onto the
  tile behind the player, where the follower walks.
- **Not yet:** the zone's switch, a "!" for an aggressive one noticing the player, a sparkle sound, the sparkle's
  height by the sprite.

### Wild encounters

The slot tables are replaced by per-species data packed by area: `docs/paperwhite2/encounters.md`.
- **Runtime:** `src/paperwhite2/main/paperwhite2_encounters.c`.
- **Packer:** `tools/paperwhite2/encounters.py`, which adds a member after `a/1/2/7`'s tables.
- **Data:** `res/paperwhite2/encounters/`.
- **Hooks:** `src/ov012/eventdata_system.c`, `src/ov036/enc_pokeset.c` and `src/ov036/effect_encount.c`.

Where no Pokémon can appear there is no encounter, and an original table's empty slot gives none either.

### DexNav

What can appear in the current area now, by method, with the encounter rules' shares and levels:
docs/paperwhite2/design/dexnav.md ("As built").
- **The item:** the Poké Radar, a key item that can be registered to Y.
- **The app:** `FIELD_APP_DEXNAV`, in overlay 303 beside the Habitat List.
- **The code:** `src/paperwhite2/ov303/paperwhite2_dexnav{,_data}.c` and `src/paperwhite2/ov012/paperwhite2_dexnav_event.c`.

## Adding global scripts

A global script file's IDs are limited by its row in `GLOBAL_SCRIPT_TABLE` (`src/ov012/script_sys.c`), e.g.
`{ 2800, 2819, SCRIPTS_GLOBAL_2800, … }`. A script entry past the row's end assembles fine but fails
`FieldScript_ResolveSCRID`'s assert at run time, which shows "An error has occurred. Please turn off the power."
(found 2026-10-29: the Shiny Candy drop's script 2820). Before adding a script past a file's last ID, raise that row's
end under PAPERWHITE2, or put the script in a file with room.

[global-scripts.md](global-scripts.md) lists every row with its file, what it holds, the IDs used, the first free one
and how many are free, and the scripts the hack added, found by comparing each file's entries with the
`w2-original` tag. `python3 tools/paperwhite2/global_scripts.py` writes it again; run it after adding a global script
(and describe the script in its `HACK_SCRIPTS`), and `--check` says whether it is current.
