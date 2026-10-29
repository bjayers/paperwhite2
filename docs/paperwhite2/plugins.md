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
- `src/paperwhite2/ov012/paperwhite2_weather.c`, `include/paperwhite2/weather.h`: the weather of the calendar's
  zones, in overlay 12 beside `calender.c`.
- `res/paperwhite2/seasonal_weather.json`: the weather rates, the source to edit. `tools/paperwhite2/seasonal_weather.py
  dump extract/w2_us/files/a/0/9/6 res/paperwhite2/seasonal_weather.json` wrote it from the original; the hack's
  build turns it into `build/include/generated/paperwhite2/seasonal_weather.inc` (`seasonal_weather.py header`),
  the rows of the C file's table. The original's `a/0/9/6` stays as it is.

**The setting** is `EVENT_WORK_SEASON_SETTING`, which the original game doesn't use: bits 0-3 the mode, bit 4 the hemisphere
(0 northern, 1 southern, read by the real-time mode only). A mode past 8 is taken as monthly.

| Mode | Season | Banner when it changes |
| --- | --- | --- |
| 0 monthly | The original's: `(month - 1) % 4`, spring in January, May and September | One, of the new season |
| 1-4 | Spring, summer, autumn or winter, always | One |
| 5 weekly | The weeks from Monday, counted from the one 2000-01-01 is in, `% 4`: it changes each Monday | One |
| 6 daily | The days since 2000-01-01 (`RTC_ConvertDateToDay`) `% 4`: it changes each midnight | One |
| 7 real time | Spring from March 21st, summer from June 21st, autumn from September 21st, winter from December 21st; in the southern hemisphere spring and autumn change places, and summer and winter | The original's walk, from the season after the saved one to the new one |
| 8 chaos | A random season (`GFL_RandomLC`, repeats allowed), drawn at each map change with a loading screen | None, also on loading a save, on a new game and from the script command |

**When the season changes.** As in the original, only on a map change that closes the field (a warp, Fly, an Escape
Rope, Dig, a fake warp) into an exterior: `EventMapChange_LoadSeasons` asks `GameData_GetSeasons` for the new season
and `EventMapChangeCore_Callback` sets it, before the new zone is loaded, so its seasonal graphics come with it. A
seamless walk from one zone into the next never changes it: `Field_SwapZoneByMatrix` (`src/ov036/fieldmap.c`) only
reads the season, and `Season_Set` (`GameData_SetSeason`) is called from `EventGameOpening_Callback` and the map
change's core only. A new setting therefore shows at the next such map change.

**Chaos draws once.** Only `GameData_GetSeasons`, which only the map change calls, draws a season
(`PaperWhite2_GetSeasonForMapChange`). Every other place that asks for the season of the date asks
`PaperWhite2_GetCurrentSeason`, which for chaos is the season the game has (`GameData_GetSeason`, saved with the
game): the Pokédex's habitats, the 3D demos, the weather's check that the season is current, and the new game's
season. The draw happens on every map change with a loading screen, also into an interior, where it is thrown away,
as the original's season of the date is there. `GameData_Create` keeps the original's monthly season: it is the
season only until the save's is loaded, and a new game's setting is 0, monthly.

**The banner** is decided by `PaperWhite2_GetSeasonBanner` alone (none, one, or the walk). For none, the map change's
`seasonChanged`, which picks the season's fade and banner on every path (the warp sequences, the fake warp, Escape
Rope, Dig and their spin), stays `FALSE`, and the core compares the two seasons instead, so the season changes with
the ordinary fades. For one, `EventSeasonBanner_CreateFieldTransition` and `...Ex` start at the last season, so each
caller's walk becomes its last banner.

**The weather.** The 24 zones of the original's calendar had a weather byte for each day of the year. Each now draws
its weather once a day: a hash of the date's day number (the save's clock, `getAddressAdventureTimeBlk`, as the
original read) and the zone picks from the zone's rates for the season the game has, so it stays all day and after a
reload, and changes with the season. The dump counted the original's days of each season's months (90 in summer,
with February the 29th, 92 in the others); a day without weather is `WEATHER_SUNNY` (0) there, so it counts as that. A zone
missing from the file, or without rates for the season, has its zone header's weather, as a zone without weather by
date has in the original; a zone can be added to the file. The original's rules before the calendar stay
(`GetWeatherAll`: forced weather, the Entralink, Route 7's event, the birthday on Routes 14 and 15), and the calendar
applies only while the game's season is the current one. In the dump: snow (`FLAKE`, with `FLUTTER` in Driftveil,
Route 6, Chargestone Cave, Mistralton, Route 7 and Twist Mountain) in winter in the north and in Floccesy, Pledge
Grove, Route 20 and Virbank; blizzards in winter in Icirrus, Dragonspiral Tower and Route 8 (with one day of diamond
dust in Icirrus); rain in the other seasons in most zones (Route 12 also in winter); sandstorms in Lentimas and
Reversal Mountain all year but autumn; `TINT_9` most days on Routes 14 and 15.

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
| `Calendar_GetWeatherCore` (`src/ov012/calender.c`) | the archive's weather of the day of the year | `PaperWhite2_GetCalendarWeather` |

Together they cost about 2.3 KB: 460 bytes in main and 1.4 KB in overlay 12 (the table is 1.2 KB). The date math
has a host test (every day of 2000-2099: weekly changes exactly on Mondays, daily every day across months, years and
February 29th, real time on the 21sts in both hemispheres), not committed. The Season app (below) sets the mode and
the hemisphere.

### Season app

The Pokémon Centers' globe opens a touch-screen app that sets the season setting, in Geonet's place: hack builds have
no Geonet. It is Geonet's process slot and overlay with Geonet's parts, without the globe.

- `src/paperwhite2/ov312/paperwhite2_season_app.c`, `include/paperwhite2/season_app.h` (`SEASON_APP_PROC_FUNCTIONS`).
  It is linked into overlay 312, Geonet's, which `CallGeonet` loads, so it is in memory only while the app runs.
- `src/system/app_taskmenu.c` gains `AppTaskMenuRes_CreateFromArchive` under `PAPERWHITE2` (96 bytes in main): the
  task menus' button resources with the frame and palettes from another archive, so the app's buttons have art of
  their own.
- Text: `res/text/system/season_app.txt`, bank `TEXT_BANK_SEASON_APP`, a new last file of `a/0/0/2`
  (`generated/text_banks.txt`). Every label, status line and confirmation is there.
- Graphics: Geonet's archive (`ARCID_GEONET`, `res/graphics/geonet/`) gains three members, see below. The banners
  are the game's own (`ARCID_SEASON_BANNER`, `res/graphics/season_banner/`), unchanged.

| Hook | Where | What |
| --- | --- | --- |
| `Script_9` of `res/field/scripts/global_2100.s` | the globe of every Center: `EVENT_FLAG_0x006a` set gave "It seems you can't use it yet." | always `CallGeonet`; the flag and the Castelia Geonet girl's event stay as they were |
| `Scrcmd_ProcFld_CallGeonet` (`src/ov036/scrcmd_proc_fld.c`) | `GEONET_PROC_FUNCTIONS` in `OVERLAY_GEONET` | `SEASON_APP_PROC_FUNCTIONS` in the same overlay |

**Screens.** As Geonet's, the top screen is the sub engine and the touch screen the main engine
(`GX_DISP_SELECT_SUB_MAIN`), BG mode 0 on both, no 3D and no OBJs; VRAM A is the touch screen's BGs and VRAM C the top
screen's (each: screens at 0x0000-0x17ff, text characters at 0x4000, the banner's at 0x8000, the grid's at 0x10000).

| Screen | BG (priority) | What |
| --- | --- | --- |
| Top | 6 (0) | Geonet's message window (2,19, 28 by 4 tiles, message frame): the setting ("Seasons: Weekly", "Seasons: Locked to Winter", "Seasons: Real time (Northern)") and "Current season: X" (the season the game has now), or the hemisphere on its page, or a confirmation after a change |
| Top | 5 (2) | the season's banner, the game's art, in palette 8 with its black background (color 1) made transparent, so that the grid shows around the season's name |
| Top | 7 (3) | Geonet's grid |
| Touch | 2 (0) | the list (9,8, 14 by 8 tiles, Geonet's menu frame: Set Season, Dynamic Options, Set Hemisphere, Cancel), or a page's buttons |
| Touch | 3 (3) | Geonet's grid |

The banner shows the season the message window talks about: the current one with the status, the one the next map
change into an exterior brings after a change (`PaperWhite2_GetCurrentSeason`; for chaos the game's own), and on the
Set Season page the season under the key cursor.

**Pages.** Set Season: Spring, Summer, Autumn, Winter (a 2 by 2 grid), locking that season. Dynamic Options: Monthly,
Weekly, Daily, Real-time (two rows of two) and Chaos (centered below). Set Hemisphere: Northern, Southern (stored
apart from the mode; only real time reads it). Each has Geonet's Quit button, labeled BACK, at its place (23,21, 9
tiles wide, with the return arrow). The current mode's or hemisphere's button is drawn in the current palette pair.
The buttons are 13 by 3 tiles, with their labels centered; their places are the tables `sSeasonApp*Buttons`.

**Input.** The list: the D-pad and A, B for Cancel, or a touch on a row, which picks it at once. A page: a touch picks
a button; the D-pad moves the cursor (up and down to the nearest row, left and right within the row) and A picks; B
picks BACK; after a touch the first key only brings the cursor back, as the game's task menus do. A picked button
flashes, then its setting is set, the current button is drawn again and the message window confirms ("The season will
change to Winter when you go outside.", "The seasons will now change each week, on Mondays."); the page stays open.
BACK returns to the list, and Cancel fades out to the field. The setting shows at the next map change into an
exterior, as the Seasons section says.

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

**Memory.** The app adds 0x1000 bytes to overlay 312 (0x2440 to 0x3440). Overlay 312 shares its address with
overlays 35, 69, 253, 338 and others, which are never loaded with it, and overlays 36, 170 and 337 are placed after
the largest of them; overlay 312 is now that largest (overlay 35 is 0x2d20), so those three moved up 0x720 bytes, which
the field's overlay 36 had room for (`memory.txt`: overlay 312 and 36 grow 0x6860 more before the arena moves). The
DS arena moved only by main's 0x60.

**Heap and exit.** The app takes Geonet's heap ID (0x7c, 256 KB from `HEAPID_USER`), and frees on Cancel, in order,
the list or buttons (after their text is printed), the button resources, the windows, the BGs, the font and the
message bank, then the BG system and the heap, and puts the display layout back.
