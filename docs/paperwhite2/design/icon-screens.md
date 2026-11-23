# Icons on their own battle palettes: every screen (2026-11-23)

Every screen that shows party/box icons should draw each icon with its own 16 colours, made from its species' (or
form's) battle palette: `normal.pal`, or `shiny.pal` for a shiny. One icon image per species everywhere:
`res/pokemon/<group>/icon_battle.png` and `icon_battle.json`, which the Sprite Editor edits (shiny-icons.md section 15).
This file is the list of screens and how far each is. The research behind it is shiny-icons.md sections 5 and 6.

## 1. Rules (agreed 2026-11-23)

- **Shiny-aware** where the screen is about a particular Pokémon (party, box, battle party list, trade, the hack's
  screens...). **Species-only** (normal colours) where it shows a species (Pokédex list, Info's Evo tab, habitats).
- **Eggs** keep the egg icon and its bank colours, never shiny.
- **The fallback:** the three shared banks stay until every screen is converted. A screen that isn't converted yet
  loads the icon's own file and the banks as before. That file is now drawn from `icon_battle.png` in the icon's bank
  (section 2), so it shows the user's edits in bank colours, never garbage.
- **Wireless-only screens** (no local use at all, confirmed in the code) aren't converted. They become shells
  (docs/paperwhite2/design/wireless-shells.md, phase 5). A screen with any local use is converted.

## 2. The foundation (phase 1)

**Build** (`tools/paperwhite2/poke_icons.py`, run on `a/0/0/7` by configure.py's `HACK_ARCHIVE_MEMBERS` after
`pokemon_graphics.py` packs it from the vanilla icons). Every build reads `res/`, so the editor's later edits flow in.
- **The icons' own members** (what `PokeParty_GetIconIndex` gives): an icon with an `icon_battle.png` is redrawn from it
  in its shared bank, the fallback. Each slot takes the bank index that the vanilla icon has under that slot's pixels.
  - A pixel keeps its vanilla index if that index covers at least a quarter of its slot's pixels, so an unedited icon
    stays as it was even where the remap merged two shades into one slot.
  - Otherwise a pixel takes its slot's most common vanilla index.
  - A slot with no vanilla pixels under it (a colour drawn where the vanilla icon was clear) takes the bank's nearest
    colour.
  - Of 744 icons, 306 differ from vanilla, by at most 82 pixels. Checked by eye on a sheet of the most-changed ones.
- **`ICON_BATTLE_PALETTES_MEMBER`** (the archive's first after its own, 1526 today): 64 bytes per entry, the 16 normal
  colours, then the 16 shiny ones, as RGB555. The colours, by index:
  - 0: the battle colour 0 (transparent);
  - 1-13: the slots' battle colours, with colour 0 for unused slots;
  - 14-15: the two greys.
- **From `ICON_BATTLE_CHARS_MEMBER`**: per entry, the icon's characters on its slots, in its own file's format (1 KB).
- **Entries:** one per icon file from the 8th (`PokeParty_GetIconIndex`'s file − 8), then one per palette-only form
  (Arceus' 17, by `forms.sprite_offset + form − 1`), since those show the base file but have their own pixels and
  colours.
  - The egg, Manaphy's egg, `SPECIES_EGG`'s placeholder and any icon without `icon_battle.png` (Appletun today) keep
    their vanilla pixels, with their bank's colours for both normal and shiny.
  - An empty file (no female icon) has an empty entry.
  - The tool refuses an archive whose member count isn't `PAPERWHITE2_SPECIES_ICON_FILES` + 2 per added species.
- **Cost:** ROM +0.95 MB (`a/0/0/7` 0.85 MB → 1.82 MB: 98 KB of colours and 1,535 character members; the cartridge
  uses 284 of its 512 MB). No RAM: colours are read 32 bytes at a time.

**Runtime** (`include/paperwhite2/icon_palettes.h`, `src/paperwhite2/main/paperwhite2_icon_palettes.c`, ARM9 main):

| Function | What |
| --- | --- |
| `PaperWhite2_GetIconBattleFile(species, form, sex, egg)`, `…OfPkm(BoxPkm *)` | the member with the icon's pixels on its slots, in place of `PokeParty_GetIconIndex`/`PokeIcon_GetFileOfPkm`'s file |
| `PaperWhite2_LoadIconPalette(species, form, sex, egg, shiny, sub, row)`, `…OfPkm(pkm, sub, row)` | the icon's 16 colours into OBJ palette row 0-15 of the main engine, or the sub engine with `sub` |
| `PaperWhite2_LoadIconExtPalette(species, form, sex, egg, shiny, sub, extPalette, band)`, `…OfPkm(pkm, sub, extPalette, band)` | the same into band 0-15 of OBJ extended palette 0-15, for 8bpp icons (pixel = band × 16 + index); the bank must be mapped as OBJ extended palette. Proven in phase 2 (`02_pc_box_ext_api_proof`: a test build loaded only the box's party icons with it, and they came out right while the rest stayed black). The box itself doesn't call it (section 3) |
| `PaperWhite2_ReadIconColours(colours, …, shiny)`, `…OfPkm(colours, pkm)`, `PaperWhite2_GetIconEntry(…)` | the raw read into a buffer of the caller's (`…OfPkm` added in phase 2, for screens that keep the colours and load them themselves), and the entry |

- `…OfPkm` uses the Pokémon's own shininess (`PML_PkmIsRare`); an egg is never shiny.
- The colours are read with `GFL_ArcSysReadRange` (no heap) into a 32-byte buffer in main RAM. It is not on the stack
  because `GX_LoadOBJPltt` copies by DMA, and DMA can't read the stack in DTCM: the first try loaded black rows.
- A screen converts like this: load the member from `GetIconBattleFile` in place of the icon's file, load its colours
  into a row of its own (or a band), and point the actor's palette at that row. The palette is relative to the
  actor's palette resource, as `ClActor_SetPalette(actor, row - resourceRow, 1)`.
- **Memory:** ARM9 main grows 576 bytes (code, plus the 32-byte buffer), so the DS arena goes from 0x4600 to 0x43c0
  (memory.md). Overlay 165 grows 32 bytes, which doesn't move the arena.

**The party list** (`ov165/plist_plate.c: PokeListPlate_CreateIcon`). Every icon of the list is created there: opening,
Switch, and `PokeListPlate_SetPkm`, which the Shiny Candy also uses. Each plate gets its own row:

| Plate | 0 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| Row | 6 | 7 | 8 | 12 | 13 | 14 |

- Rows 6-8 are the banks' rows, which the list no longer uses. Rows 12-14 were unused.
- Measured in the list: rows 0-2 are the UI, 3 the item icon, 4 the status icon, 5 the HP bar, 9-11 the touch bar. The
  OAM uses only those rows and the six icon rows.

## 3. The PC box (phase 2)

The box shows up to 66 icon actors at once (`BOX2_ACTOR_POKEICON`'s: the tray's 30, the party's 6, and 30 more for a
picked-up range), far more than its free OBJ rows, so its icons became 8bpp OBJs on the main engine's OBJ extended
palettes (shiny-icons.md 5.1). Code: `src/paperwhite2/ov255/paperwhite2_box_icons.c`, `include/paperwhite2/box_icons.h`,
hooks in `ov255/box2_obj.c` and `box2_main.c`, and two fields at the end of `Box2AppWork` (`include/app/box2_main.h`).

- **VRAM bank G** is mapped as main OBJ extended palette in the box's `sVramBanks` (16 KB, of which 8 KB is used;
  G was unmapped there). DISPCNT's OBJ extended palette bit follows from `GX_SetBankForOBJExtPltt`. Every screen sets
  its own banks with `GFL_BGSysSetVRAMBanks`, which resets that one, so nothing stays mapped: measured, VRAMCNT A-I
  and both DISPCNTs after leaving the box are byte for byte what they were before it (`02_pc_box_left_field`). The box
  search, the summary and the other screens the box calls set their own banks, and the box sets G again on return.
- **Bands:** icon actor n (its ID − `BOX2_ACTOR_POKEICON`, 0-65) draws with band n % 16 of extended palette 3 + n / 16
  (3-7). The actor's palette resource is the icon bank file at row 3 (still loaded, now unused for colours), so the
  actor's palette is n / 16 in mode 1. Each pixel is band × 16 + its 4bpp index (0 stays clear). The actor keeps its
  band wherever it goes: picking up, moving a range, putting down and scrolling swap actor IDs, never characters.
- **Extended palette 0** is a copy of the standard OBJ palette: the box list's tray icons (`trayIconChar`) were 8bpp
  already, on palette 0, and now read extended palette 0. **Extended palette 8** holds standard row 8 in every band:
  the outline (the eight copies of an icon that outline the selected one, file 70 at row 7, palette 1) uses the icon
  cells and characters, so it is 8bpp too.
- **Characters:** the 66 icon actors' character resources are 1 KB each, allocated (`ClActSys_AllocChars`) in place of
  file 75's 512-byte placeholders. The 30 more of file 75 that the original loaded (resources 66-95) were never used and
  aren't loaded. Icons are read from `PaperWhite2_GetIconBattleFileOfPkm`'s member and made 8bpp when written
  (`PaperWhite2_BoxIcons_Transfer`). The icon cells (`PokeIcon_GetCellFile_Main`'s, the box's own heap copy) are set to
  8bpp once loaded: each OBJ's colour mode bit, and its character name doubled (the box shows only frame 0).
- **Colours:** `PaperWhite2_ReadIconColoursOfPkm`, normal or shiny; an egg its bank colours. A Pokémon that a box
  search leaves out (the original's grey row) is greyed from its own colours: each colour's brightness mapped into the
  original grey row's range (8-14 of 31). The tray's colours are kept by position (`pokeIconColours`, as
  `pokeIconPal` kept the banks) for the scroll, which rewrites wrapping icons from the cached characters.
- **Uploads in VBlank:** the extended palettes are kept in `Box2AppWork` (4.5 KB) and copied to bank G in the box's
  VBlank when they changed (`PaperWhite2_BoxIcons_VBlank`), with extended palettes 0 and 8 refreshed from the standard
  palette. Writing an extended palette takes its bank away from the 2D engine for the copy, so it is done while the
  screen doesn't draw. The phase-1 `LoadIconExtPalette`, which writes at once, works too (above), but would do that
  mid-frame up to 66 times per box.
- **Cost:** ov255 +0.6 KB of code (no arena cost: the DS arena moved only by ARM9 main's 64 bytes, 0x43c0 → 0x4380,
  for `PaperWhite2_ReadIconColoursOfPkm`); `Box2AppWork` +6.6 KB of the box's own 512 KB heap (the 4.5 KB palettes,
  the 1 KB conversion buffer, 960 bytes of tray colours); main OBJ VRAM +18 KB (66 KB of 1 KB icons in place of 48 KB
  of placeholders): measured, the box's resources end at 0x176c0, 34 KB below the top of bank B; bank G 8 KB.

**Tested** (py-desmume, a copy of the user's save; box 1 filled in RAM with 30 different icons: species, Arceus' and
Deerling's palette and sprite forms, Shellos, Rotom, Giratina, female Frillish, Jellicent and Unfezant, an egg; the
party's 0, 3 and 5 made shiny in RAM; nothing saved):
- every icon of box 1 normal (`02_pc_box_normal`), all shiny (`02_pc_box_shiny`), mixed (`02_pc_box_mixed`): 17 of the
  plain species' icons compared pixel for pixel with `icon_battle.png` on `normal.pal`/`shiny.pal`, all exact (two only
  where a neighbour overlaps them);
- the party side, normal and shiny (`02_pc_box_party_normal`, `_shiny`); grabbing a shiny and dropping it on another
  (`02_pc_box_grab_held`, `_dropped`), with its outline; a picked-up range of 6 moved (`02_pc_box_multiselect_held`);
  scrolling to the next boxes and back (`02_pc_box_scroll_back`, exact again); a gender search greying the rest
  (`02_pc_box_search_grey`); the summary and back (`02_pc_box_after_summary`, exact); leaving to the field and opening
  the box again (exact). The box list's tray icons draw as before, on extended palette 0. The only 8bpp OBJs on screen
  are the icons (extended palettes 3-4 with a full box) and the tray icons (0).
- Not seen: the Battle Box, Deposit/Withdraw and Move items modes, which use the same actors and functions.

## 4. The Pokédex (phase 3)

Species-only screens: each icon on its species' (form's, sex's) **normal** colours, read with
`PaperWhite2_ReadIconColours(..., shiny FALSE)`, pixels from `PaperWhite2_GetIconBattleFile`. The Bad Egg's "?" icon
(Evo's unseen species) keeps its bank colours, as the egg does.

**Shared extended-palette helpers** (`include/paperwhite2/icon_ext.h`, `src/paperwhite2/main/paperwhite2_icon_ext.c`,
ARM9 main +0xe0 bytes with alignment): `PaperWhite2_IconExt_SetCells8bpp` (a screen's own copy of the icon cells to
8bpp), `PaperWhite2_IconExt_Convert` (4bpp characters to 8bpp in a band) and `PaperWhite2_IconExt_Upload` (a VBlank
copy into the OBJ extended palettes). The box's code (section 3) now calls them in place of its own copies, unchanged
in behaviour (retested: a full mixed box, 12 icons exact, `02_pc_box_mixed_after_phase3`). Phase 5's extended-palette screens should use them too.

**Fades with extended palettes.** The list and the Habitat list fade with `PaletteFade`, which only knew their
standard rows. Their icons' colours live in the fade's own buffer of the main OBJ extended palettes
(`PALFADE_BUFFER_MAIN_OBJ_EX`, which `palanm.c` already supports): each icon's colours go in with
`PaletteFade_LoadData`, the screen's `StartFade` fades that buffer with the rest, and the screen's VBlank uploads the
faded copy when an icon changed (`PaletteFade_Transfer` uploads it during fades). Any later screen with a palette
fade and ext-palette icons should do the same.

**Palette proxies.** An icon actor's palette is relative to its palette resource's row. Where the icons' row or
extended palette doesn't match that row, each icon actor's palette proxy is moved to row 0
(`NNS_G2dSetImagePaletteLocation(..., 0)`, as the Habitat Dex's bar already does), so its palette number is the row
or extended palette itself. The bank palette resources stay loaded (the actors need one) but their colours are unused.

### 4.1 The list (ov299)

`src/paperwhite2/ov299/paperwhite2_pokedex_list_icons.c`, `include/paperwhite2/pokedex_list_icons.h`, hooks in
`pokedex_list_obj.c` and `pokedex_list_main.c`, four fields at the end of `PokedexListWork`.
- **Touch screen (main): 8bpp on OBJ extended palette 0 in bank G.** The list's pool of 16 icon actors; actor n draws in
  band n. G is mapped in `sPokedexListVRAMConfig` (it was unused); no other main OBJ of the list is 8bpp (measured), so
  nothing else needed an extended palette. Characters: 16 × 2 KB allocated (`ClActSys_AllocChars`) in place of the
  species-0 icon file (16 × 1 KB): the selected row's icon animates, so both frames are 8bpp.
- **Top screen (sub): standard rows.** Its OBJs used only the three bank rows, and it shows up to 8 icons. Each icon
  takes, as it loads, the first row of 0-15 that no other shown top icon has, skipping 14 (which the list's fades leave
  alone, so an icon there wouldn't fade). The row is written at once (the actor is hidden while it is refilled, and no
  shown icon has that row) and into the fade's buffer. Measured after scrolling: rows 0-8 in use, each the right
  species.
- **Cost:** ov299 +0.6 KB (doesn't move the arena); the list's work +2.1 KB (an 8bpp conversion buffer, colours,
  rows) and the fade's extended buffer 1 KB, both on the list's heap; main OBJ VRAM +16 KB (measured before: 40 KB used
  of 127, so 71 KB stay free); bank G 512 bytes used.

### 4.2 The Info page (ov298)

- **Evo tab** (`paperwhite2_pokedex_info_evo.c`, sub engine): standard rows, route B of shiny-icons.md 6.2. Icon i
  takes row 5, 6, 7, 14, 15, then 0, 1, 2 (`sEvoIconRows`). Only Eevee's family of 8 reaches rows 0-2, the type icons'
  rows (only Matchups shows type icons): their colours are kept as Evo borrows them and put back as Evo hides. The
  colours are written in the panels' VBlank (`PokedexInfoEvo_VBlank`), so the type icons and the icons never show a
  frame in each other's colours. The palette resource is now one bank row (it was three). No VRAM and no ClAct
  resource change: Evo still takes its 3 resources only while it shows (the 32/32 limit isn't touched). Route A
  (bank I extended palette) wasn't needed.
- **Area box** (`paperwhite2_pokedex_info_area.c`, main row 12): the icon's own colours, loaded in Area's VBlank as
  before; the bank palette file Area kept in its heap to pick a row from is gone (−0.1 KB of heap).
- **Flavour tab art:** unchanged. It uses the icon cells and one bank row as a palette resource only, with its own
  colours loaded over it: no Pokémon icon is drawn (checked: `05_pokedex_info_flavour_unchanged`).
- **Forms page and the original habitat map** (`ov298/pokedex_detail_form.c`, `pokedex_detail_map.c`): never started
  in the hack (the Info page replaces them, `pokedex_detail.c`), so not converted; they stay on the fallback.

### 4.3 The Habitat list (ov303)

`src/paperwhite2/ov303/paperwhite2_habitat_icons.c`, `include/paperwhite2/habitat_icons.h`, hooks in
`pokedex_habitat_graphic.c`, two fields at the end of `PokedexHabitatGraphic`. The survey counted 1 icon here, but the
Habitat Dex's grid shows up to **30** (6 × 5) on the main engine, so it takes the extended route:
- bank G (unused) mapped in `sPokedexHabitatVRAMConfig`; cell n's icon draws in band n % 16 of extended palette n / 16
  (0-1); no other main OBJ of the screen is 8bpp (measured);
- each cell's resources are their own `UIObjRes`: the character resource is replaced by a 2 KB one, and each cell's
  own copy of the cells is set to 8bpp once (a copy shared by two cells would be set once);
- icons load in the screen's VBlank as before (now 8bpp, converted in a 2 KB buffer from the heap's tail), their
  colours into the fade's extended buffer, uploaded after the loads; `StartFade` fades extended palettes 0-1 with the
  old icon rows.
- **Cost:** ov303 +0.5 KB (doesn't move the arena); heap +2 KB of fade buffers, plus 2 KB while an icon converts; main
  OBJ VRAM +30 KB (measured before: 62 KB used of 127, so 35 KB stay free).

### 4.4 Tested

py-desmume, a copy of the user's save, the Pokédex filled with the debug menu (RAM only, nothing saved); scripts in
`.../scratchpad/dex3/` (`route.sh` boots, fills the Pokédex and opens the lists; `checks.py` compares drawn icons pixel
for pixel; `rowcheck.py` finds which palette row holds each species' colours; `forms.py` hooks the icon loads to show
chosen forms and sexes):
- **List:** bottom icons pixel-exact (0 differing pixels) on four pages (Tepig-Patrat, Watchog page, Escavalier-Joltik,
  Mr. Mime-Tauros), and forms forced through the load: Giratina Origin, Shaymin Sky, Arceus Fire (a palette-only form),
  exact; top icons by palette rows (Rotom Frost and the rest), each species in its own row; jumping with the scroll bar,
  paging up and down; the fade in. Leaving to the field: VRAMCNT A-I and both DISPCNTs exactly as before.
- **Info:** Evo for Tepig's family (exact) and Eevee's 8 (rows 5-7, 14, 15, 0-2 each the right species), then Matchups:
  the type icons' rows 0-2 byte for byte as before Evo; Evo with an unseen evolution (the user's own Pokédex: "?");
  Area's box icon (row 12, Eevee's colours); Flavour unchanged; back to the list.
- **Habitat list:** a full grid of 30 (both extended palettes), all compared, exact but where the cell frame or the
  caught mark covers an icon; forced Deerling Autumn, Shellos East, female Frillish (exact) and Arceus Fire; page 2 and
  the next area (exact); leaving to the field: registers as before.

## 5. The row screens (phase 4)

Each of these shows few enough icons for standard OBJ rows: the icon's pixels come from
`PaperWhite2_GetIconBattleFile[OfPkm]`, its 16 colours go into a row of its own with `PaperWhite2_LoadIconPalette[OfPkm]`,
and its actor's palette points at that row (counted from the palette resource's row, or, where the row comes before
it, with the actor's palette proxy moved to row 0 as in section 4). Where the screen has a `PaletteFade`, the colours
are written before the fade's buffer is read from VRAM, or into the buffer as well (`PaletteFade_LoadData`). No ARM9
main code is added: every screen uses the phase 1-2 API.

**Shininess.** Shiny-aware where the screen has the Pokémon itself (`…OfPkm`, or its PID); normal colours where the
data it shows keeps only species, form and sex (decided 2026-11-23, the user's defaults: such a screen can't know):

| Screen | Data | Colours |
| --- | --- | --- |
| Save report, battle party list, name input | the party / the Pokémon being named | normal or shiny |
| Battle command screen | the battle Pokémon as shown (an Illusion's disguise included) | normal or shiny |
| Mystery Gift album | the gift's Pokémon | shiny when the gift is always shiny (its `shininess` 1), else normal |
| Battle video select, Battle Recorder profile, Trial House award | a video header's, a GDS profile's, the Trial House record's species | normal |
| Pokéstar Studios book, scenario screen, record monitor | a movie's cast (species) | normal |

### 5.1 The screens

- **Save report** (`ov087/report.c`, sub engine, 6 icons). Rows 0-2 (the banks') and 4-6. The report draws over the
  field menu on the bottom screen; its own OBJs are the icons and the bar (row 3). The field menu reloads its rows 0-12
  when it comes back (measured: rows 0-13 identical before the report and after cancelling it, but for row 10's
  colour 15, which the menu animates), so 4-6 are free while the report shows. No palette fade.
- **Battle party list** (`ov287/b_plist_obj.c`, sub, 6). Rows 0-2 and 10-12. Measured: the list's OBJs use rows 0-9
  (3-9: status, item and type icons, cursor, HP bar), 14 is the wireless icon's, and the battle's palette fade
  (shared with the list) covers rows 0-14. The HP bar's palette file clears the rows after its own as it loads, so the
  colours are written once every resource is loaded, just before the list's fade takes its buffer from VRAM (the
  first try wrote them with the icons' resources and they came out black).
- **Battle command screen** (`ov168/btlv_input.c`, sub, 2-3 in double, triple and rotation battles). The banks' rows
  11-13, slot i in row 11 + i, written before the screen's fade takes those rows. The battle passes each icon's
  shininess in a new `BtlvInputCommandParam.shiny[3]` (`include/battle/btlv_input.h`), set with the species in
  `ov169/btlv_scd.c`.
- **Name input** (`ov280/name_input.c`, main, 1). The banks' first row, 4. The icon's normal colours load with it; when
  the screen names a Pokémon (`NameEntryParam.pkm`, which `setupPokemonNameEntry` sets for every Pokémon naming)
  its own colours follow, shiny if it is.
- **Pokéstar Studios scenario screen** (`ov288/b_scenario_graphic.c`, sub, 1 of 6 at a time: the cast member shown).
  Row 0, written as each cast member shows, into VRAM and the battle fade's copy. The screen's other rows: 4-6 type
  icons, 7 cursor, 8-12 buttons.
- **Pokéstar Studios book** (`ov322/pkwd_book.c`, sub, 6 on the cast page, 1 on a Pokémon's page). Cast slot i in row
  0, 1, 2, 3, 7, 15; the Pokémon page's icon is the current cast member's and takes its row. The others: touch bar
  4-6 (its file's fourth row, 7, isn't used by its cells, as in the Pokédex list), types 8-10, trainer 11, font 12,
  marks 13-14. No palette fade.
- **Pokéstar Studios record monitor** (`ov325/pkwd_record_monitor.c`, main, 6). Cast slot i in main row i (0-5): the
  screen's main OBJs are the icons (banks at 5-7) and the marks (8-13), so 0-4 are free; the actors' palette proxies
  are moved to row 0.
- **Battle video select** (`ov306/btl_rec_sel.c`, main, up to 12: both sides of the saved video; the survey said 2).
  Icon side × 6 + slot in main row 0-11. Each icon loads its own copy of the banks into rows 0-2, so the rows are
  written once all are made, into VRAM and the screen's fade buffer (rows 0-13), which the fade in starts from. Its
  only other OBJ is the wireless icon (row 14, outside the fade).
- **Trial House award** (`ov313/th_award.c`, main, 3 or 4). Rows 1-4 (the banks' and the next): its OBJs are the rank
  (row 0) and the icons.
- **Mystery Gift album** (`ov197/mystery_album.c`, main, up to 8 cards: 4 shown, 4 more while a page slides). A
  Pokémon card's icon takes the row an item card in the same window would (4 + the window), which nothing holds for a
  Pokémon card; the actor's palette proxy is moved to row 0. No palette fade.
- **Battle Recorder profile** (`ov271/br_util.c`, main, 1). The banks' first row, 4.

**Not icon screens after all:** the Mailbox (`ov215/mb_obj.c`) opens the icon archive but loads nothing from it: its
OBJs are item icons, and its palette resource is file `PokeIcon_GetPaletteFile()` of the UI archive, not the icons'.

**Moved to phase 5 (wireless-only):**
- **Party list, battle mode with partners** (`ov165/plist_battle.c`): only `showPartners` lists draw the partners'
  icons, and only the Union Room (`ov034/union_oneself.c`) and the Wi-Fi/live Battle Competition
  (`ov263/wifibattlematch_subproc.c`, the regulation's `showPartners`) set it. With two partners it would be 18 icons.
- **Multi battle list** (`ov171/vs_multi_list.c`): started only by the link battle's event (`ov010/event_make.c`, after
  the network timing sync and the comm battle intro).

### 5.2 Tested

py-desmume, a copy of the user's save (nothing saved); party slots 0, 2 and 4 (Pignite, Keldeo Resolute, Zekrom) made
shiny in RAM; wild battles on Route 6 with encounters forced, triple battles with the debug menu's Triple battles;
catches with debug-given Master Balls, the shiny one with the debug menu's Always shiny. Scripts in
`.../scratchpad/p4/` (`route.sh`, `route2.sh` and `route3.sh` boot and reach every screen; `rowcheck.py`, `checks.py`,
`checks2.py` (either frame) compare; `oamrows.py` lists each screen's OBJs by row):
- **Save report:** all six icons pixel-exact, normal and shiny; cancelling it: the field menu's rows as before.
- **Battle party list:** all six exact, normal and shiny (rows 0-2, 10-12); back to the battle: the command screen's
  rows 0-10 and 14-15 as before, VRAMCNT and DISPCNT identical (rows 11-13, unused in a single battle, go from leftover
  bytes to zero).
- **Battle command screen** in a triple battle: each icon's row holds its own colours, normal and shiny (pixels can't
  be compared: the screen darkens the icons not choosing).
- **Name input** after a catch: a Hoothoot (exact) and a shiny winter Deerling (exact, its form's shiny colours).
- **Not emulator-tested** (converted by reading the code; each row's reasons in the table below): the Pokéstar Studios
  screens, the battle video select and the Battle Recorder profile (need a saved battle video: the Vs. Recorder says
  "There is nothing saved"), the Trial House award (needs a finished challenge) and the Mystery Gift album (needs a
  received card).

## 6. Every screen

Columns: **#** is the screenshot prefix. **Icons** is the most shown at once, m main engine, s sub. **Route**: rows
(standard rows, one per icon), ext (8bpp with an extended palette in the named bank), BG. **Kind**: shiny-aware or
species-only. **Tested**: emulator, with the screenshot in `icon_screens/` (Windows: Pokemon Paper White\icon_screens).
**HW**: for the user's 3DS test.

| # | Screen | How to reach it | Source | Icons | Route | Kind | Status | Tested | HW |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Party list | field menu > Pokémon; also from the bag, items, TMs | `ov165/plist_sys.c`, `plist_plate.c` | 6 m | rows 6-8, 12-14 | shiny | **converted** (phase 1) | yes: `01_party_list_normal`, `01_party_list_shiny`, `01_party_list_shiny_after_switch` | to test |
| 02 | PC box (tray, party side, held icon and range, search, every mode) | a Center's PC > Move Pokémon (also Deposit, Withdraw, Battle Box, Move items) | `ov255/box2_obj.c`, `paperwhite2_box_icons.c` | 66 m (30 tray + 6 party + 30 held) | ext G: palettes 3-7, a band per actor (section 3) | shiny | **converted** (phase 2) | yes: `02_pc_box_normal`, `_shiny`, `_mixed`, `_party_normal`, `_party_shiny`, `_grab_held`, `_grab_dropped`, `_multiselect_held`, `_scroll_back`, `_search_grey`, `_after_summary`, `_left_field` | to test |
| 03 | Pokédex list (bottom) | field menu > Pokédex > National | `ov299/pokedex_list_obj.c`, `paperwhite2_pokedex_list_icons.c` | 9 m (16 actors) | ext G: palette 0, a band per actor (4.1) | species | **converted** (phase 3) | yes: `03_pokedex_list_normal`, `03_pokedex_list_forms_normal`, `03_pokedex_list_scrolled_normal`, `03_pokedex_list_jump_normal`, `03_pokedex_list_left_field` | to test |
| 04 | Pokédex list (top) | the same, top screen | `ov299/pokedex_list_obj.c`, `paperwhite2_pokedex_list_icons.c` | 8 s (16 actors) | rows 0-15 but 14, given as icons load (4.1) | species | **converted** (phase 3) | yes (rows by memory; blended): `03_pokedex_list_normal` | to test |
| 05 | Pokédex Info, Evo tab | Pokédex > a species > Info > Evo | `paperwhite2_pokedex_info_evo.c` | 8 s (Eevee) | rows 5-7, 14, 15, then 0-2 borrowed (4.2) | species | **converted** (phase 3) | yes: `05_pokedex_info_evo_normal`, `05_pokedex_info_evo_eevee_normal`, `05_pokedex_info_matchups_after_eevee`, `05_pokedex_info_evo_unseen_normal` | to test |
| 06 | Pokédex Info, Area box | Info > Area | `paperwhite2_pokedex_info_area.c` | 1 m | row 12 | species | **converted** (phase 3) | yes: `06_pokedex_info_area_normal` | to test |
| 07 | Pokédex Info, Flavour tab art | Info > Flavour | `paperwhite2_pokedex_info_flavour.c` | 0 (icon cells as tab art, one bank row) | its own colours over a bank row | n/a | unchanged: no Pokémon icon | yes: `05_pokedex_info_flavour_unchanged` | |
| 08 | Pokédex Forms | never started in the hack (the Info page replaces it) | `ov298/pokedex_detail_form.c` | 2 s | (rows) | species | not converted: unreachable, fallback | no: unreachable | |
| 09 | Pokédex habitat map (original) | never started in the hack (Info's Area replaces it) | `ov298/pokedex_detail_map.c` | 2 s | (rows) | species | not converted: unreachable, fallback | no: unreachable | |
| 10 | Habitat list (the Habitat Dex's grid) | Pokédex > Habitat > an area | `ov303/pokedex_habitat_graphic.c`, `paperwhite2_habitat_icons.c` | 30 m | ext G: palettes 0-1, a band per cell (4.3) | species | **converted** (phase 3) | yes: `10_habitat_list_normal`, `10_habitat_list_forms_normal`, `10_habitat_list_page2_normal`, `10_habitat_list_next_area_normal`, `10_habitat_list_left_field` | to test |
| 11 | DexNav | C-Gear > DexNav | `paperwhite2_dexnav.c` | 18 grid + 1 big, BG | grid: 8bpp BG on sub BG ext palettes in H; big icon: main BG row 5 (8.1) | species (per area) | **converted** (phase 5) | yes: `11_dexnav_normal`, `_full_grid_normal`, `_scrolled_forms_normal`, `_route7_dark_grass_normal`, `_left_field` | to test |
| 12 | Party list, battle mode (partners' parties) | Union Room multi battle, Battle Competition: the party choice | `ov165/plist_battle.c` | 6 or 18 s | (rows / share) | shiny | pending (phase 5): wireless-only (5.1) | no: wireless | |
| 13 | Battle party list | in battle > Pokémon | `ov287/b_plist_obj.c` | 6 s | rows 0-2, 10-12 (5.1) | shiny | **converted** (phase 4) | yes: `13_battle_party_list_normal`, `_shiny`, `_left_battle` | to test |
| 14 | Battle command screen | in a double, triple or rotation battle, the command screen's icons | `ov168/btlv_input.c` | 3 s | rows 11-13 | shiny | **converted** (phase 4) | yes (rows by memory; the screen darkens icons): `14_battle_command_icons_normal`, `_shiny` | to test |
| 15 | Pokéstar Studios scenario screen | Pokéstar Studios, filming a movie: the lower screen's cast page | `ov288/b_scenario_graphic.c` | 1 s (of 6) | row 0 (5.1) | species | **converted** (phase 4) | no: Pokéstar Studios not reached | to test |
| 16 | Save report | field menu > Save | `ov087/report.c` | 6 s | rows 0-2, 4-6 (5.1) | shiny | **converted** (phase 4) | yes: `16_save_report_normal`, `_shiny`, `_left_menu` | to test |
| 17 | Name input | catching a Pokémon > give a nickname: yes (also the name rater) | `ov280/name_input.c` | 1 m | row 4 | shiny | **converted** (phase 4) | yes: `17_name_input_normal`, `_shiny` | to test |
| 18 | Battle video select | after a recordable battle (Battle Subway, PWT...) with a video saved already: "save over it?" shows both parties | `ov306/btl_rec_sel.c` | 12 m | rows 0-11 (5.1) | species (header) | **converted** (phase 4) | no: needs a saved battle video | to test |
| 19 | Trial House award | Trial House (Striaton City), the rank card after a challenge | `ov313/th_award.c` | 4 m | rows 1-4 | species (record) | **converted** (phase 4) | no: needs a finished challenge | to test |
| 20 | Mystery Gift album | title menu > Mystery Gift > Wonder Cards | `ov197/mystery_album.c` | 4 m (8 while sliding) | row 4 + its window, proxy at 0 | gift's | **converted** (phase 4) | no: no card in the save | to test (with a Pokémon card) |
| 21 | Mailbox | a Center's PC > mail | `ov215/mb_obj.c` | 0 (item icons only) | | n/a | not an icon screen (5.1) | | |
| 22 | Multi battle list | a link multi battle, before it starts | `ov171/vs_multi_list.c` | 6 m | (rows) | shiny | pending (phase 5): wireless-only (5.1) | no: wireless | |
| 23 | Pokéstar Studios book / record monitor | Pokéstar Studios: the script book (choosing a movie) / the records of filmed movies | `ov322/pkwd_book.c`, `ov325/pkwd_record_monitor.c` | 6 s / 6 m | rows 0-3, 7, 15 / rows 0-5, proxy at 0 (5.1) | species | **converted** (phase 4) | no: Pokéstar Studios not reached | to test |
| 24 | Battle Recorder profile | Bag > Key Items > Vs. Recorder > Battle Videos > My Video (with a saved video) | `ov271/br_util.c` | 1 m | row 4 | species (profile) | **converted** (phase 4) | no: needs a saved battle video | to test |
| 25 | Trade box | link trade (local) | `ov194/pokemontrade_2d.c` | about 30 of 60 s | ext I | shiny | pending (phase 5) | needs a link harness | |
| 26 | Trade offer | link trade (local), the offer | `ov194/pokemontrade_nego.c` | 6 + 6 | rows if 9 free, else ext I | shiny | pending (phase 5) | | |
| 27 | Unova Link | title > Unova Link | `ov332/cygnus_flow.c` | 12 m | ext G or a row per visible entry | shiny | pending (phase 5) | | |
| 28 | Battle Recorder video list / video | Battle Recorder | `ov268/br_bvrank_proc.c`, `br_record_proc.c` | 5 rows / 12 m | rows / ext G | shiny | pending (phase 5) | | |
| 29 | Xtransceiver (local) | C-Gear > Xtransceiver | `ov259/local_tvt_util.c` | 6 s | rows (audit) | shiny | pending (phase 5): check wireless-only | | |
| 30 | IR ranking | C-Gear IR > ranking | `ov180/irc_ranking.c` | a few per list, m + s | rows | shiny | pending (phase 5): check wireless-only | | |
| 31 | Wi-Fi/IR battle party select | link battles | `ov036/party_select_list.c` | 6 + 6 m | rows or ext G | shiny | pending (phase 5): check, it may serve local battles | | |
| 32 | GTS box | Wi-Fi > GTS | `ov214/worldtrade_box.c` | 30 m | (ext G) | shiny | pending (phase 5): shell candidate | | |
| 33 | Wi-Fi Club | Wi-Fi > Club | `ov173/wifi_p2pmatch.c` | 12 m | (ext G) | shiny | pending (phase 5): shell candidate | | |
| 34 | Wi-Fi battle match | Battle Competition online | `ov262/wifibattlematch_view.c` | 6 per card + list | (rows / ext) | shiny | pending (phase 5): check, it also serves local Battle Competition | | |
| 35 | Game Sync | title > Game Sync | `ov199/gsync_disp.c` | 1, m + s | (rows) | shiny | pending (phase 5): shell candidate | | |

**Not icon screens** (checked in the survey, shiny-icons.md 6.3): the bag (no party bar), the summary (`ov207`), Day
Care (no screen), the Hall of Fame and the evolution scene (battle sprites), the hack's Entree, Wonder Trade (it picks in
the PC box) and follower menus. Files that only use the pack/unpack helpers: `ov033/event_chatot.c`,
`ov062/pokewood_system.c`, `ov199/gsync_state.c`, `ov255/box2_main.c`, `ov287/b_plist_main.c`.

**Fallback spot-checks (phase 1, py-desmume, a copy of the user's save):** the PC box (Castelia Center, box 1 and the
party side) and the Pokédex's National list show every icon right in bank colours. Its Habitat list's icon and the
party list's normal icons look as before too.

## 7. Phases

1. Foundation and the party list (done, 2026-11-23).
2. The box (ov255): 8bpp icons and extended palette G (done, 2026-11-23).
3. The Pokédex: list (ext G bottom, rows top), Info Evo, Area, the Habitat list (ext G) (done, 2026-11-23).
4. The row screens (section 5): 11 converted, the Mailbox found not to be one, two moved to phase 5 (done,
   2026-11-23).
5. The extended-palette rest and the wireless-only shells (section 8).
6. Sweep: every loader of the icon archive accounted for here, the fallback reached by nothing tested, a last emulator
   pass. Then the banks and the fallback redraw can go (not before every screen is confirmed).

## 8. The extended-palette rest and the wireless shells (phase 5)

Which screens are left, and why, was settled by the callers of each screen in the hack build (the field's wireless
script commands sit in the `#else` branches of the Pokémon Center counters' scripts 2101, 10100 and 10105; the C-Gear's
IR, Xtransceiver and Game Sync markers are gone, `src/ov079/c_gear_sw.c`'s `sMarkerActions`). Screens with a local
path are converted; screens every path of which needs wireless are shells (`wireless-shells.md`).

### 8.1 The DexNav (`src/paperwhite2/ov303/paperwhite2_dexnav.c`)

Species-only, normal colours, forms as listed. The DexNav draws on BGs, not OBJs:
- **The grid** (touch screen, sub engine, 18 cells): the cells' icons moved from the 4bpp text BG to a BG of their own,
  sub BG 0 (`BG_TOUCH_ICONS`), 256 colours, priority 1 (over the grid, under nothing it overlaps), its screen at
  0x2000 and characters at 0x18000 of bank C (18 icons × 1 KB). Bank H is the sub engine's BG extended palette while
  the DexNav is open (`GX_VRAM_SUB_BGEXTPLTT_0123_H` in its VRAM table, which sets DISPCNT's BG extended palette bit;
  the field's banks clear it). The icon BG is the sub engine's only 256-colour BG, so nothing else reads the extended
  palettes. Cell i draws 8bpp in band i % 16 of extended palette i / 16 (slot 0; its window's palette number names the
  extended palette), `PaperWhite2_IconExt_Convert` from the icon's battle file.
- **The big icon** (top screen, main engine, 1): its own colours in row 5 (`PALETTE_ICONS`), 4bpp as before.
- The three banks' rows are no longer loaded. The colours live in the DexNav's work (main RAM) and a VBlank task copies
  what changed: row 5, and the 1 KB of extended palettes 0-1 (`GXS_BeginLoadBGExtPltt` takes bank H from the engine
  while it writes). The screen fades with the master brightness (`GFL_WipeSet`), so no palette fade is involved.
- **Cost:** overlay 303 +320 bytes (no arena cost: it isn't in the arena's chain); the DexNav's work +1.1 KB of its
  own 192 KB heap; sub BG VRAM +18 KB in bank C's unused top; bank H (unused by the DexNav before) as sub BG extended
  palette.
- **Tested** (py-desmume, a copy of the save, the Pokédex filled with the debug menu, RAM only; scripts in
  `.../scratchpad/p5/`: `route.sh` boots, fills, warps to Route 6 and opens the DexNav from the C-Gear;
  `route_r7.sh` Route 7's methods; `dnforce.py` fills the Grass list in RAM with 20 Pokémon, forms included;
  `findicons.py` finds which icon a screenshot shows and how exactly): Route 6's grass (8 icons and the big one,
  exact, winter Deerling included), unseen Pokémon's "?" icons, Route 7's methods with R, a full grid of 18 (all exact,
  cells 16-17 on extended palette 1), scrolled to the forms (Deerling Summer, Shellos East: exact), leaving to the
  field (sub DISPCNT's BG extended palette bit off again; bank F is left in LCDC as before this change, the DexNav's
  texture palette bank, harmless). Screenshots `11_dexnav_*`.
