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
2. ToggleableSeasons.
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
