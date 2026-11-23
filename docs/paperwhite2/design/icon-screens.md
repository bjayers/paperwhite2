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
| `PaperWhite2_LoadIconExtPalette(species, form, sex, egg, shiny, sub, extPalette, band)`, `…OfPkm(pkm, sub, extPalette, band)` | the same into band 0-15 of OBJ extended palette 0-15, for 8bpp icons (pixel = band × 16 + index); the bank must be mapped as OBJ extended palette. Written, but not yet used or tested: phase 2 (box) is its first user |
| `PaperWhite2_ReadIconColours(colours, …, shiny)`, `PaperWhite2_GetIconEntry(…)` | the raw read, and the entry |

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

## 3. Every screen

Columns: **#** is the screenshot prefix. **Icons** is the most shown at once, m main engine, s sub. **Route**: rows
(standard rows, one per icon), ext (8bpp with an extended palette in the named bank), BG. **Kind**: shiny-aware or
species-only. **Tested**: emulator, with the screenshot in `icon_screens/` (Windows: Pokemon Paper White\icon_screens).
**HW**: for the user's 3DS test.

| # | Screen | How to reach it | Source | Icons | Route | Kind | Status | Tested | HW |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Party list | field menu > Pokémon; also from the bag, items, TMs | `ov165/plist_sys.c`, `plist_plate.c` | 6 m | rows 6-8, 12-14 | shiny | **converted** (phase 1) | yes: `01_party_list_normal`, `01_party_list_shiny`, `01_party_list_shiny_after_switch` | to test |
| 02 | PC box (tray, party side, held icon, search, box list) | a Center's PC > Move Pokémon | `ov255/box2_obj.c`, `box2_seq.c` | 30 tray + 6 + held, m | ext G (shiny-icons.md 5.1) | shiny | pending (phase 2); fallback | fallback: `02_pc_box_fallback`, `02_pc_box_party_fallback` | |
| 03 | Pokédex list (bottom) | field menu > Pokédex > National | `ov299/pokedex_list_obj.c` | 8 m (9 mid-scroll) | ext G | species | pending (phase 3); fallback | fallback: `03_pokedex_list_fallback` | |
| 04 | Pokédex list (top) | the same, top screen | `ov299/pokedex_list_obj.c` | 7 s | rows (13 free) | species | pending (phase 3) | | |
| 05 | Pokédex Info, Evo tab | Pokédex > a species > Info > Evo | `paperwhite2_pokedex_info_evo.c` | 8 s (Eevee) | rows with 0-4 borrowed, or ext I | species | pending (phase 3) | | |
| 06 | Pokédex Info, Area box | Info > Area | `paperwhite2_pokedex_info_area.c` | 1 m | row 12 | species | pending (phase 3) | | |
| 07 | Pokédex Info, Flavour tab art | Info > Flavour | `paperwhite2_pokedex_info_flavour.c` | 0 (icon cells as tab art, one bank row) | keep a bank row | n/a | pending (phase 3): check | | |
| 08 | Pokédex Forms | Info > Forms | `ov298/pokedex_detail_form.c` | 2 s | rows | species | pending (phase 3) | | |
| 09 | Pokédex habitat map (original) | Info > Area (original map) | `ov298/pokedex_detail_map.c` | 2 s | rows | species | pending (phase 3) | | |
| 10 | Habitat list | Pokédex > Habitat | `ov303/pokedex_habitat_graphic.c` | 1 m | rows | species | pending (phase 3) | | |
| 11 | DexNav | C-Gear > DexNav | `paperwhite2_dexnav.c` | 18 grid + 1 big, BG | BG ext palettes, or the grid as OBJs on ext G | species (per area) | pending (phase 5) | | |
| 12 | Party list, battle mode (multi partner) | a multi battle's party choice | `ov165/plist_battle.c` | up to 6 s | rows if 3 more free, else by species | shiny | pending (phase 4) | | |
| 13 | Battle party list | in battle > Pokémon | `ov287/b_plist_obj.c` | 6 s (I 16 KB) | rows 6, 7, 10-15 | shiny | pending (phase 4) | | |
| 14 | Battle lower screen | in battle, the command screen | `ov168/btlv_input.c` | 3 s | rows (≤ 3) | shiny | pending (phase 4) | | |
| 15 | Battle scenario team | battle institutions' team view | `ov288/b_scenario_graphic.c` | 6 s | rows (audit) | shiny | pending (phase 4) | | |
| 16 | Save report | field menu > Save | `ov087/report.c` | 6 s | rows (audit vs C-Gear rows) | shiny | pending (phase 4) | | |
| 17 | Name input | naming a caught Pokémon or nickname | `ov280/name_input.c` | 1 m | rows | shiny | pending (phase 4) | | |
| 18 | Battle video select | Battle Recorder > a local video | `ov306/btl_rec_sel.c` | 2 m | rows | shiny | pending (phase 4) | | |
| 19 | Trial House award | Trial House, the result | `ov313/th_award.c` | 4 m | rows | shiny | pending (phase 4) | | |
| 20 | Mystery Gift album | title > Mystery Gift > cards | `ov197/mystery_album.c` | up to 4 m | rows | shiny | pending (phase 4) | | |
| 21 | Mailbox | a Center's PC > mail | `ov215/mb_obj.c` | 3 s | rows (≤ 3) | shiny | pending (phase 4) | | |
| 22 | Multi battle list | a multi battle's team list | `ov171/vs_multi_list.c` | 6 m | rows (audit) | shiny | pending (phase 4) | | |
| 23 | Pokéstar Studios book / record | Pokéstar Studios | `ov322/pkwd_book.c`, `ov325/pkwd_record_monitor.c` | 7 s / 6 m | rows (audit) | shiny | pending (phase 4) | | |
| 24 | Battle Recorder profile | Battle Recorder > profile | `ov271/br_util.c` | 1 m | rows | shiny | pending (phase 4) | | |
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

## 4. Phases

1. Foundation and the party list (done, 2026-11-23).
2. The box (ov255): 8bpp icons and extended palette G.
3. The Pokédex: list (ext G bottom, rows top), Info Evo, Area, Forms, habitats (species-only).
4. The easy screens and those whose rows need checking (rows 12-24 above).
5. The extended-palette rest (DexNav, trade, Unova Link, Battle Recorder), and the wireless-only shells.
6. Sweep: every loader of the icon archive accounted for here, the fallback reached by nothing tested, a last emulator
   pass. Then the banks and the fallback redraw can go (not before every screen is confirmed).
